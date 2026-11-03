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
import { advanceModel, MODEL_CANDIDATES, resolveModelSync } from '../models';
import { supabase } from '@/services/supabaseClient';
import { isModelScopedQuotaFailure, parseGoogleApiError } from './googleError';

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

function buildRequestBody(req: ChatRequest, model: string): Record<string, unknown> {
  const { contents, systemInstruction } = toGeminiContents(req.messages);

  const isFastLite = model.includes('flash-lite');
  const thinkingLevel = req.thinkingLevel ?? (isFastLite ? 'MINIMAL' : 'LOW');
  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: req.maxTokens ?? 2048,
    // Explicitly minimise pre-first-token reasoning for interactive traffic.
    thinkingConfig: { thinkingLevel },
    ...(req.jsonSchema ? { responseMimeType: 'application/json', responseSchema: req.jsonSchema } : {}),
  };
  // Gemini 3 models use thinking levels for reasoning control; avoid legacy
  // sampling controls on this generation line (notably Gemini 3.8).
  if (!model.startsWith('gemini-3.')) generationConfig.temperature = req.temperature ?? 0.6;

  const body: Record<string, unknown> = { contents, generationConfig };

  if (systemInstruction) body.systemInstruction = { parts: [{ text: systemInstruction }] };

  // Grounding and function calling cannot be combined in one request, and
  // grounding is the rarer need — so tools win when both are present.
  if (req.tools?.length) {
    body.tools = toFunctionDeclarations(req.tools);
    if (req.toolConfig) body.toolConfig = req.toolConfig;
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

  /**
   * Model text is coerced at the BOUNDARY, not trusted by its TypeScript type.
   *
   * `p.text ?? ''` looks safe and is not: `??` only falls back on null/undefined,
   * so a part whose `text` is an OBJECT passes through untouched and `.join('')`
   * stringifies it — which is exactly how `[object Object]` reached the chat
   * bubble and the narration panel. Gemini's stream guarantees the shape for
   * these fields only in the happy path; a tool turn or an unexpected schema
   * returns a nested value. Anything that is not a string is dropped here.
   */
  const text = rawParts
    .map((p) => (typeof p.text === 'string' ? p.text : ''))
    .join('')
    .trim();

  const toolCalls: ToolCall[] = rawParts
    .filter((p) => p.functionCall)
    .map((p) => ({
      name: typeof p.functionCall!.name === 'string' ? p.functionCall!.name : String(p.functionCall!.name ?? ''),
      args:
        p.functionCall!.args && typeof p.functionCall!.args === 'object'
          ? p.functionCall!.args
          : { value: p.functionCall!.args },
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

async function getAuthorizationHeaders(forceGuest = false): Promise<Record<string, string>> {
  // Guest sessions are first-class: the server applies a stricter IP-based
  // quota when no Supabase access token is present. A signed-in user receives
  // their higher personal quota, but login never gates AI features.
  if (forceGuest || !supabase) return {};
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token
      ? { Authorization: `Bearer ${data.session.access_token}` }
      : {};
  } catch {
    return {};
  }
}

async function post(
  model: string,
  req: ChatRequest,
  stream: boolean,
  signal?: AbortSignal,
  forceGuest = false,
): Promise<Response> {
  const method = stream ? 'streamGenerateContent?alt=sse' : 'generateContent';
  const authorization = await getAuthorizationHeaders(forceGuest);
  return fetch(`${BASE}/models/${encodeURIComponent(model)}:${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authorization },
    body: JSON.stringify(buildRequestBody(req, model)),
    signal,
  });
}

const FIRST_TOKEN_TIMEOUT_MS = 8_000;
const QUALITY_TURN_TIMEOUT_MS = 52_000;
const QUALITY_ATTEMPT_TIMEOUT_MS = 22_000;

async function postWithFallback(
  tier: 'chat' | 'quality',
  req: ChatRequest,
  stream: boolean,
  signal?: AbortSignal,
): Promise<Response> {
  let model = resolveModelSync(tier);
  const visited = new Set<string>();
  const totalBudgetMs = tier === 'quality' ? QUALITY_TURN_TIMEOUT_MS : 16_000;
  const deadline = Date.now() + totalBudgetMs;
  let response: Response | null = null;
  let lastTimeout: unknown;

  // Try each configured model at most once for retired models or upstream 503s.
  // A 429 is returned immediately because model rotation cannot override a
  // project quota and would create a burst of redundant requests.
  while (visited.size < MODEL_CANDIDATES[tier].length && Date.now() < deadline) {
    if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
    visited.add(model);

    const remainingMs = Math.max(1, deadline - Date.now());
    const attemptTimeoutMs = Math.min(
      tier === 'quality' ? QUALITY_ATTEMPT_TIMEOUT_MS : FIRST_TOKEN_TIMEOUT_MS,
      remainingMs,
    );

    try {
      const attemptDeadline = AbortSignal.timeout(attemptTimeoutMs);
      const requestSignal = signal ? AbortSignal.any([signal, attemptDeadline]) : attemptDeadline;
      response = await post(model, req, stream, requestSignal);
    } catch (error) {
      if (signal?.aborted) throw error;
      const timedOut = (error as Error)?.name === 'TimeoutError' || (error as Error)?.name === 'AbortError';
      if (!timedOut) throw error;
      lastTimeout = error;
      const next = advanceModel(tier, model);
      if (visited.has(next)) break;
      model = next;
      continue;
    }

    // Model-scoped quota windows can differ between Gemini models. Rotate only
    // when Google's QuotaFailure explicitly identifies a per-model dimension;
    // project/day/spend 429s are returned immediately to avoid wasteful retries.
    let modelScoped429 = false;
    if (response.status === 429 && response.headers.get('x-ai-upstream') === 'google') {
      const errorPayload = await response.clone().json().catch(() => null);
      modelScoped429 = isModelScopedQuotaFailure(
        parseGoogleApiError(errorPayload, response.headers.get('retry-after')),
      );
    }
    const isGoogleModelFailure = response.headers.get('x-ai-upstream') === 'google'
      && ([404, 503].includes(response.status) || modelScoped429);
    if (!isGoogleModelFailure || signal?.aborted) break;

    const next = advanceModel(tier, model);
    if (visited.has(next)) break;
    await response.body?.cancel().catch(() => undefined);
    response = null;
    model = next;
  }

  if (!response) {
    throw new ProviderError(
      'gemini',
      'timeout',
      lastTimeout instanceof Error ? lastTimeout.message : 'All configured Gemini models timed out or were unavailable.',
      504,
    );
  }

  // An expired optional account session must not block a public AI feature.
  // Retry once as guest when the 401 was generated by our quota/auth layer,
  // not by Google itself. The guest request is still protected by its IP quota.
  if (response.status === 401 && !response.headers.has('x-ai-upstream') && !signal?.aborted) {
    await response.body?.cancel().catch(() => undefined);
    response = await post(model, req, stream, signal, true);
  }

  return response;
}

async function fail(res: Response): Promise<never> {
  const body = await res.text();
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(body) as unknown;
  } catch {
    /* keep raw response text below */
  }
  const details = parseGoogleApiError(parsed, res.headers.get('retry-after'));
  let message = parsed ? details.message : body.slice(0, 700);
  const parsedError = parsed && typeof parsed === 'object' && 'error' in parsed
    ? (parsed as { error?: { status?: string; message?: string } }).error
    : undefined;
  const serverCode = parsedError?.status ?? details.status ?? '';

  if (res.status === 429) {
    const fromGoogle = res.headers.get('x-ai-upstream') === 'google';
    const retry = details.retryAfterSeconds !== null
      ? ` Retry after approximately ${details.retryAfterSeconds} second(s).`
      : '';
    const quota = details.quotaLabels.length ? ` Quota: ${details.quotaLabels.join(' | ')}.` : '';
    const prefix = fromGoogle ? 'Google Gemini API rate limit/quota reached:' : 'Nexus AI request limit reached:';
    throw new ProviderError('gemini', 'rate_limit', `${prefix} ${message}${retry}${quota}`.slice(0, 1_200), 429);
  }

  if (serverCode === 'UNAUTHENTICATED' || res.status === 401) {
    throw new ProviderError('gemini', 'auth', message || 'Your account session expired. Continue as guest or sign in again.', res.status);
  }
  if (serverCode === 'FORBIDDEN') {
    throw new ProviderError('gemini', 'auth', message || 'Your account cannot use this quota. Continue as guest.', res.status);
  }
  if (serverCode === 'FAILED_PRECONDITION') {
    throw new ProviderError('gemini', 'server', message || 'AI server configuration is incomplete.', res.status);
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
    // Long, structured requests use the quality fallback chain;
    // the fast Flash-Lite remains first in both chains.
    const tier = req.model ?? ((req.maxTokens ?? 0) > 2048 ? 'quality' : 'chat');
    const res = await postWithFallback(tier, req, false, signal);
    if (!res.ok) await fail(res);
    return parseCandidate(await res.json());
  },

  async streamChat(
    req: ChatRequest,
    onToken: (t: string) => void,
    signal?: AbortSignal,
    onGrounding?: (sources: GroundingSource[]) => void,
  ): Promise<StreamResult> {
    const res = await postWithFallback('chat', req, true, signal);
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

    const finalFrame = buffer.trim();
    if (finalFrame.startsWith('data:')) {
      const data = finalFrame.slice(5).trim();
      if (data && data !== '[DONE]') {
        try {
          const parsed = parseCandidate(JSON.parse(data));
          if (parsed.text) { text += parsed.text; onToken(parsed.text); }
          if (parsed.toolCalls.length) toolCalls.push(...parsed.toolCalls);
          if (parsed.modelParts.length) modelParts.splice(0, modelParts.length, ...parsed.modelParts);
          if (parsed.sources.length) { sources = parsed.sources; onGrounding?.(sources); }
        } catch { /* Ignore an incomplete final SSE frame. */ }
      }
    }

    return { text: text.trim(), toolCalls, modelParts, sources };
  },
};

