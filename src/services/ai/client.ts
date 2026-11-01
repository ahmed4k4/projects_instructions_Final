/**
 * AI client — Gemini-only, with grounding awareness.
 *
 * Responsibilities
 *   1. Report whether Gemini is configured (discovered from the dev server,
 *      because the key is server-side and never inlined into the bundle).
 *   2. Expose live status: model, latency, grounding budget.
 *   3. Route a request to grounding only when the question needs live data.
 *
 * There is exactly one provider in Phase 5; the failover scaffolding from
 * Phase 4 was removed rather than left as dead code.
 */
import type {
  GenerateOptions,
  GenerateResult,
  GeminiContent,
  GeminiContentPart,
  StreamEvent,
  ToolCall,
} from '@/types/ai';
import { AIError } from '@/types/ai';
import { geminiProvider, handleModelRetired, setGeminiConfigured } from './providers/geminiProvider';
import type { ChatMessage, ChatRequest, GroundingSource, ProviderId } from './providers/types';
import { ProviderError } from './providers/types';
import { toNeutralMessages, toNeutralRequest } from './translate';
import { probeModels, resolveModelSync } from './models';
import { discoverGeminiConfig } from './config';
import { getGroundingStatus, recordGroundedSearch } from './groundingBudget';
import { shouldGround } from './grounding';

let lastModel: string | null = null;
let lastLatency: number | null = null;
let lastError: string | null = null;

export interface AIStatus {
  provider: ProviderId | null;
  providerName: string | null;
  model: string | null;
  latencyMs: number | null;
  configured: boolean;
  error: string | null;
  grounding: { used: number; remaining: number; limit: number; warn: boolean };
}

/** Discover configuration, then report status. */
export async function getAIStatus(): Promise<AIStatus> {
  const config = await discoverGeminiConfig();
  setGeminiConfigured(config.configured);

  return {
    provider: config.configured ? 'gemini' : null,
    providerName: config.configured ? geminiProvider.name : null,
    model: config.configured ? (lastModel ?? resolveModelSync('chat')) : null,
    latencyMs: lastLatency,
    configured: config.configured,
    error: lastError,
    grounding: getGroundingStatus(),
  };
}

export async function hasUsableProvider(): Promise<boolean> {
  const config = await discoverGeminiConfig();
  setGeminiConfigured(config.configured);
  return config.configured;
}

/* -------------------------------------------------------------------------- */
/*  Request plumbing                                                          */
/* -------------------------------------------------------------------------- */

function toAIError(error: unknown): AIError {
  if (error instanceof AIError) return error;
  if ((error as Error)?.name === 'AbortError') return new AIError('aborted', 'Cancelled.');
  if (error instanceof ProviderError) {
    if (error.kind === 'rate_limit') return new AIError('rate_limited', 'Gemini quota is exhausted.');
    if (error.kind === 'auth') return new AIError('not_configured', 'The Gemini API key is invalid.');
    return new AIError('upstream_error', error.message);
  }
  return new AIError('network', (error as Error)?.message ?? 'The AI request failed.');
}

async function execute<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  try {
    const started = performance.now();
    const result = await operation();
    lastLatency = Math.round(performance.now() - started);
    lastModel = geminiProvider.model();
    lastError = null;
    return result;
  } catch (error) {
    if ((error as Error)?.name === 'AbortError' || signal?.aborted)
      throw new AIError('aborted', 'Cancelled.');

    // A retired model shows up as a 404: drop the cache and retry once.
    const message = (error as Error)?.message ?? '';
    if (/404|not found|no longer/i.test(message)) {
      handleModelRetired();
      try {
        return await operation();
      } catch (retryError) {
        lastError = (retryError as Error).message;
        throw toAIError(retryError);
      }
    }

    lastError = message;
    throw toAIError(error);
  }
}

export interface ChatOutcome {
  text: string;
  toolCalls: ToolCall[];
  /** Raw model turn (signatures included) — replay it on the next round. */
  modelParts: GeminiContentPart[];
  sources: GroundingSource[];
  grounded: boolean;
  provider: ProviderId;
}

/** Streaming chat. `grounded` is decided by the caller (or by `question`). */
export async function streamChat(
  messages: ChatMessage[],
  request: Omit<ChatRequest, 'messages'>,
  onToken: (token: string) => void,
  signal?: AbortSignal,
  onGrounding?: (sources: GroundingSource[]) => void,
): Promise<ChatOutcome> {
  if (!request.grounded) {
    return execute(async () => {
      const result = await geminiProvider.streamChat({ ...request, messages }, onToken, signal, onGrounding);
      return {
        ...result,
        modelParts: result.modelParts ?? [],
        sources: result.sources ?? [],
        grounded: false,
        provider: 'gemini' as const,
      };
    }, signal);
  }

  // Grounding is a scarce quota: refuse rather than burn a request that will 429.
  const budget = getGroundingStatus();
  if (budget.exhausted) {
    throw new AIError(
      'rate_limited',
      'The daily grounded-search budget is used up. Answers will be ungrounded until it resets.',
    );
  }

  return execute(async () => {
    const result = await geminiProvider.streamChat({ ...request, messages }, onToken, signal, onGrounding);
    recordGroundedSearch();
    return {
      ...result,
      modelParts: result.modelParts ?? [],
      sources: result.sources ?? [],
      grounded: true,
      provider: 'gemini' as const,
    };
  }, signal);
}

/** Non-streaming completion. */
export async function generateChat(
  messages: ChatMessage[],
  request: Omit<ChatRequest, 'messages'>,
  signal?: AbortSignal,
): Promise<ChatOutcome> {
  return execute(async () => {
    const result = await geminiProvider.generate({ ...request, messages }, signal);
    return {
      ...result,
      modelParts: result.modelParts ?? [],
      sources: result.sources ?? [],
      grounded: Boolean(request.grounded),
      provider: 'gemini' as const,
    };
  }, signal);
}

/** Structured JSON output, validated by the caller. */
export async function generateStructured<T>(
  contents: GeminiContent[],
  schema: Record<string, unknown>,
  options: GenerateOptions = {},
): Promise<T> {
  const messages = toNeutralMessages(contents, options.systemInstruction);
  if (!messages.length) throw new AIError('invalid_request', 'Empty request.');

  const result = await execute(
    () =>
      geminiProvider.generate(
        {
          messages,
          jsonSchema: schema,
          temperature: options.temperature,
          maxTokens: options.maxOutputTokens ?? 4096,
        },
        options.signal,
      ),
    options.signal,
  );

  try {
    return JSON.parse(stripCodeFence(result.text)) as T;
  } catch {
    throw new AIError('upstream_error', 'The AI returned a response that was not valid JSON.');
  }
}

/** Models sometimes wrap JSON in a ```json fence despite instructions. */
export function stripCodeFence(text: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  return (fenced?.[1] ?? text).trim();
}

/* -------------------------------------------------------------------------- */
/*  Agent-facing adapter (agents still speak GeminiContent)                   */
/* -------------------------------------------------------------------------- */

/**
 * One agentic turn. When `onToken`/`onEvent` is present the response streams;
 * otherwise a single JSON result is returned. Both paths produce the same shape.
 *
 * `grounded` is inferred from the last user turn (see grounding.ts) unless the
 * caller sets it explicitly.
 *
 * `modelParts` in the result is the model's turn exactly as Gemini produced it.
 * Agent loops MUST append it to the conversation as-is: rebuilding a model turn
 * from `toolCalls` drops `thoughtSignature` and the next request fails with
 * `400 Function call is missing a thought_signature in functionCall parts`.
 */
export async function generateFromContents(
  contents: GeminiContent[],
  options: GenerateOptions = {},
): Promise<GenerateResult> {
  const messages = toNeutralMessages(contents, options.systemInstruction);
  const request = toNeutralRequest(options);

  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const decision = options.grounded ?? (lastUser ? shouldGround(lastUser.content).grounded : false);
  const grounded = decision && !request.tools?.length;

  if (options.onToken || options.onEvent) {
    const outcome = await streamChat(
      messages,
      { ...request, grounded },
      (t) => options.onToken?.(t),
      options.signal,
    );
    options.onEvent?.({
      type: 'done',
      text: outcome.text,
      toolCalls: outcome.toolCalls,
    } satisfies StreamEvent);
    return {
      text: outcome.text,
      toolCalls: outcome.toolCalls,
      modelParts: outcome.modelParts,
      remaining: null,
      sources: outcome.sources,
    };
  }

  const outcome = await generateChat(messages, { ...request, grounded }, options.signal);
  return {
    text: outcome.text,
    toolCalls: outcome.toolCalls,
    modelParts: outcome.modelParts,
    remaining: null,
    sources: outcome.sources,
  };
}

/** Probe models and refresh status ("Test connection"). */
export async function testProviders(): Promise<AIStatus> {
  const config = await discoverGeminiConfig(true);
  setGeminiConfigured(config.configured);
  if (!config.configured) return getAIStatus();

  const { modelId, attempts } = await probeModels('chat', async () => {
    // A 1-token request is enough to prove the model answers on this key.
    const res = await geminiProvider.generate({
      messages: [{ role: 'user', content: 'ping' }],
      maxTokens: 32,
    });
    return Boolean(res);
  });

  lastModel = modelId;
  lastError = modelId
    ? null
    : `No model answered. Tried: ${attempts.map((a) => `${a.model} (${a.ok ? 'ok' : 'fail'})`).join(', ')}`;

  return getAIStatus();
}

export { geminiProvider };
export type { ProviderId, GroundingSource };
