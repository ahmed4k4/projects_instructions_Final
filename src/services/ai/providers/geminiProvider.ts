/**
 * Google Gemini provider (free tier, Google AI Studio).
 *
 * Talks to `/api/ai` — the server-side proxy (Vercel Serverless Function in
 * production, the Vite dev middleware locally; both share
 * `src/server/geminiProxy.ts`) — so `GEMINI_API_KEY` stays on the server and
 * never enters the bundle. Uses the REST API directly rather than
 * `@google/generative-ai`: the SDK pins model names and does not expose
 * `groundingMetadata` cleanly, both of which this app needs.
 *
 * Verified wire format (2026-11-01):
 *   · non-streamed: `POST /v1beta/models/{model}:generateContent`
 *   · streamed:     `POST /v1beta/models/{model}:streamGenerateContent?alt=sse`
 *   · SSE frames use CRLF (`\r\n\r\n`) — the parser normalises them.
 *   · grounding:    `tools: [{ google_search: {} }]` → sources in
 *                   `candidates[0].groundingMetadata.groundingChunks[].web`
 */
import type { GeminiContentPart, ToolCall, ToolDeclaration } from '@/types/ai';
import {
  ProviderError,
  classifyHttpError,
  type AIProvider,
  type ChatMessage,
  type ChatRequest,
  type GroundingSource,
  type ProviderHealth,
  type StreamResult,
} from './types';
import { invalidateModel, resolveModelSync } from '../models';

const BASE = '/api/ai/v1beta';

/* -------------------------------------------------------------------------- */
/*  Wire format                                                               */
/* -------------------------------------------------------------------------- */

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown>; id?: string };
  functionResponse?: { name: string; response: Record<string, unknown>; id?: string };
  /** Required echo of the model's reasoning signature — see types/ai.ts. */
  thoughtSignature?: string;
}

/** Strip undefined keys so we never send `"thoughtSignature": undefined`. */
function compactPart(part: GeminiPart): GeminiContentPart {
  const next: GeminiContentPart = {};
  if (part.text !== undefined) next.text = part.text;
  if (part.functionCall) {
    next.functionCall = {
      name: part.functionCall.name,
      args: part.functionCall.args ?? {},
      ...(part.functionCall.id ? { id: part.functionCall.id } : {}),
    };
  }
  if (part.functionResponse) next.functionResponse = part.functionResponse;
  if (part.thoughtSignature) next.thoughtSignature = part.thoughtSignature;
  return next;
}

/**
 * Convert neutral messages into Gemini `contents` + a system instruction.
 *
 * `thoughtSignature` is carried through untouched: Gemini rejects a resumed
 * tool loop whose `functionCall` parts no longer match the signature it issued
 * (`400 Function call is missing a thought_signature in functionCall parts`).
 */
export function toGeminiContents(messages: ChatMessage[]): {
  contents: Array<{ role: 'user' | 'model'; parts: GeminiPart[] }>;
  systemInstruction?: string;
} {
  const system = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n')
    .trim();

  const contents: Array<{ role: 'user' | 'model'; parts: GeminiPart[] }> = [];

  for (const message of messages) {
    if (message.role === 'system') continue;

    // A turn captured straight from the provider is replayed as-is so the
    // `thoughtSignature`s stay attached to their `functionCall` parts.
    if (message.parts?.length) {
      contents.push({ role: message.role === 'assistant' ? 'model' : 'user', parts: message.parts });
      continue;
    }

    if (message.role === 'assistant' && message.toolCalls?.length) {
      const { toolCalls } = message;
      contents.push({
        role: 'model',
        parts: [
          ...(message.content ? [{ text: message.content }] : []),
          ...toolCalls.map((call): GeminiPart => ({
            functionCall: {
              name: call.name,
              args: call.args,
              ...(call.id ? { id: call.id } : {}),
            },
            ...(call.thoughtSignature ? { thoughtSignature: call.thoughtSignature } : {}),
          })),
        ],
      });
      continue;
    }

    if (message.role === 'tool') {
      contents.push({
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: message.toolName ?? 'tool',
              response: safeJson(message.content),
              ...(message.toolCallId ? { id: message.toolCallId } : {}),
            },
          },
        ],
      });
      continue;
    }

    contents.push({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }],
    });
  }

  return { contents, systemInstruction: system || undefined };
}

function safeJson(text: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : { result: parsed };
  } catch {
    return { result: text };
  }
}

function toFunctionDeclarations(tools?: ToolDeclaration[]) {
  if (!tools?.length) return undefined;
  return [
    {
      functionDeclarations: tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
    },
  ];
}

function buildRequestBody(req: ChatRequest): Record<string, unknown> {
  const { contents, systemInstruction } = toGeminiContents(req.messages);

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: req.temperature ?? 0.6,
      maxOutputTokens: req.maxTokens ?? 2048,
      ...(req.jsonSchema ? { responseMimeType: 'application/json', responseSchema: req.jsonSchema } : {}),
    },
  };

  if (systemInstruction) body.systemInstruction = { parts: [{ text: systemInstruction }] };

  // Grounding and function calling cannot be combined in one request, and
  // grounding is the rarer need — so tools win when both are present.
  if (req.tools?.length) {
    body.tools = toFunctionDeclarations(req.tools);
  } else if (req.grounded) {
    body.tools = [{ google_search: {} }];
  }

  return body;
}

/** Pull `text`, `functionCall`, signatures and grounding sources out of one response. */
function parseCandidate(json: unknown): {
  text: string;
  toolCalls: ToolCall[];
  /** Raw model parts, signatures intact — must be replayed verbatim. */
  modelParts: GeminiContentPart[];
  sources: GroundingSource[];
} {
  const candidate = (
    json as {
      candidates?: Array<{
        content?: { parts?: GeminiPart[] };
        groundingMetadata?: {
          groundingChunks?: Array<{ web?: { title?: string; uri?: string } }>;
          webSearchQueries?: string[];
        };
      }>;
    }
  )?.candidates?.[0];

  const rawParts = candidate?.content?.parts ?? [];
  const text = rawParts
    .map((p) => p.text ?? '')
    .join('')
    .trim();

  const toolCalls: ToolCall[] = rawParts
    .filter((p) => p.functionCall)
    .map((p) => ({
      name: p.functionCall!.name,
      args: p.functionCall!.args ?? {},
      ...(p.functionCall!.id ? { id: p.functionCall!.id } : {}),
      ...(p.thoughtSignature ? { thoughtSignature: p.thoughtSignature } : {}),
    }));

  // Skipping empty parts matters: an empty `{}` part would be rejected on replay.
  const modelParts: GeminiContentPart[] = rawParts.map(compactPart).filter((p) => Object.keys(p).length > 0);

  const sources: GroundingSource[] = (candidate?.groundingMetadata?.groundingChunks ?? [])
    .map((chunk) => ({ title: chunk.web?.title ?? '', uri: chunk.web?.uri ?? '' }))
    .filter((s) => s.uri);

  return { text, toolCalls, modelParts, sources };
}

/* -------------------------------------------------------------------------- */
/*  Transport                                                                 */
/* -------------------------------------------------------------------------- */

async function post(
  model: string,
  req: ChatRequest,
  stream: boolean,
  signal?: AbortSignal,
): Promise<Response> {
  const method = stream ? 'streamGenerateContent?alt=sse' : 'generateContent';
  return fetch(`${BASE}/models/${encodeURIComponent(model)}:${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildRequestBody(req)),
    signal,
  });
}

async function fail(res: Response): Promise<never> {
  const body = await res.text();
  let message = body.slice(0, 300);
  try {
    message = (JSON.parse(body) as { error?: { message?: string } }).error?.message ?? message;
  } catch {
    /* keep raw */
  }
  throw classifyHttpError('gemini', res.status, message);
}

const configState = { hasKey: false };

export function setGeminiConfigured(hasKey: boolean): void {
  configState.hasKey = hasKey;
}

export const geminiProvider: AIProvider = {
  id: 'gemini',
  name: 'Google Gemini',

  model: () => resolveModelSync('chat'),
  isConfigured: () => configState.hasKey,
  availability: async () => configState.hasKey,

  async healthCheck(): Promise<ProviderHealth> {
    if (!configState.hasKey) return { ok: false, reason: 'GEMINI_API_KEY not set' };

    const started = performance.now();
    try {
      const res = await post(
        resolveModelSync('chat'),
        { messages: [{ role: 'user', content: 'ping' }], maxTokens: 64 },
        false,
      );
      if (!res.ok) {
        const err = classifyHttpError('gemini', res.status, await res.text());
        return { ok: false, reason: err.message };
      }
      return { ok: true, latencyMs: Math.round(performance.now() - started) };
    } catch (error) {
      return { ok: false, reason: (error as Error).message };
    }
  },

  async generate(req: ChatRequest, signal?: AbortSignal): Promise<StreamResult> {
    // Long, structured requests (Build Doctor analysis) use the quality tier;
    // short ones stay on the low-latency model.
    const tier = (req.maxTokens ?? 0) > 2048 ? 'quality' : 'chat';
    const res = await post(resolveModelSync(tier), req, false, signal);
    if (!res.ok) await fail(res);
    return parseCandidate(await res.json());
  },

  async streamChat(
    req: ChatRequest,
    onToken: (t: string) => void,
    signal?: AbortSignal,
    onGrounding?: (sources: GroundingSource[]) => void,
  ): Promise<StreamResult> {
    const res = await post(resolveModelSync('chat'), req, true, signal);
    if (!res.ok) await fail(res);

    const reader = res.body?.getReader();
    if (!reader) throw new ProviderError('gemini', 'server', 'Gemini returned an empty stream.');

    const decoder = new TextDecoder();
    let buffer = '';
    let text = '';
    const toolCalls: ToolCall[] = [];
    const modelParts: GeminiContentPart[] = [];
    let sources: GroundingSource[] = [];

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const frames = buffer.replace(/\r\n/g, '\n').split('\n\n');
      buffer = frames.pop() ?? '';

      for (const frame of frames) {
        const line = frame.split('\n').find((l) => l.startsWith('data:'));
        if (!line) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;

        try {
          const parsed = parseCandidate(JSON.parse(data));
          if (parsed.text) {
            text += parsed.text;
            onToken(parsed.text);
          }
          if (parsed.toolCalls.length) toolCalls.push(...parsed.toolCalls);
          // Streamed frames split a single model turn across chunks; the last
          // frame carries the agency signature, so replace rather than append.
          if (parsed.modelParts.length) modelParts.splice(0, modelParts.length, ...parsed.modelParts);
          if (parsed.sources.length) {
            sources = parsed.sources;
            onGrounding?.(sources);
          }
        } catch {
          // Partial frame — the rest arrives with the next chunk.
        }
      }
    }

    return { text: text.trim(), toolCalls, modelParts, sources };
  },
};

/** Forget a cached model after a 404 so the next call re-probes. */
export function handleModelRetired(): void {
  invalidateModel('chat');
  invalidateModel('quality');
}
