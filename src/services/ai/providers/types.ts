/**
 * Gemini-only provider contract.
 *
 * Phase 5 returns to Google AI Studio because its free tier is generous and it
 * is the only provider that offers **Google Search grounding** — the ability to
 * look up live prices, stock and new releases instead of guessing.
 *
 * Everything above this layer (agents, prompts, UI) speaks `AIProvider` and
 * never sees a Gemini payload.
 */
import type { GeminiContentPart, ToolCall, ToolDeclaration } from '@/types/ai';

export type ProviderId = 'gemini';

/** A message in provider-neutral form. */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  /** Tool calls the assistant wants to make (assistant turns only). */
  toolCalls?: ToolCall[];
  /** Result of a tool call (tool turns only). */
  toolCallId?: string;
  toolName?: string;
  /**
   * Raw provider parts for this turn. When present it wins over
   * `toolCalls`/`content` — this is how `thoughtSignature`s survive a replay.
   */
  parts?: GeminiContentPart[];
}

export interface ChatRequest {
  messages: ChatMessage[];
  tools?: ToolDeclaration[];
  temperature?: number;
  /** Gemini 3.x reasoning effort. MINIMAL is reserved for latency-sensitive chat. */
  thinkingLevel?: 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH';
  maxTokens?: number;
  /** JSON schema for structured (JSON) output. */
  jsonSchema?: Record<string, unknown>;
  /**
   * Enable Google Search grounding.
   *
   * Costs a separate (smaller) daily quota, so it must only be set for prompts
   * that genuinely need live data — never for compatibility or scoring math.
   */
  grounded?: boolean;
}

export interface StreamResult {
  text: string;
  toolCalls: ToolCall[];
  /** Raw model turn exactly as returned — replay verbatim on the next round. */
  modelParts?: GeminiContentPart[];
  /** Sources returned by grounding, when it was used. */
  sources?: GroundingSource[];
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface ProviderHealth {
  ok: boolean;
  latencyMs?: number;
  reason?: string;
}

export interface AIProvider {
  readonly id: ProviderId;
  readonly name: string;
  /** The model that will actually be used, for the status badge. */
  model(): string;
  isConfigured(): boolean;
  availability(): Promise<boolean>;
  healthCheck(): Promise<ProviderHealth>;
  streamChat(
    req: ChatRequest,
    onToken: (t: string) => void,
    signal?: AbortSignal,
    onGrounding?: (sources: GroundingSource[]) => void,
  ): Promise<StreamResult>;
  generate(req: ChatRequest, signal?: AbortSignal): Promise<StreamResult>;
}

export class ProviderError extends Error {
  constructor(
    readonly provider: ProviderId,
    readonly kind: 'auth' | 'rate_limit' | 'timeout' | 'network' | 'server' | 'invalid',
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }

  get retryable(): boolean {
    return this.kind === 'rate_limit' || this.kind === 'server' || this.kind === 'network';
  }
}

export function classifyHttpError(provider: ProviderId, status: number, body: string): ProviderError {
  const detail = body.slice(0, 300);
  if (status === 401 || status === 403)
    return new ProviderError(provider, 'auth', 'Invalid API key.', status);
  if (status === 429) return new ProviderError(provider, 'rate_limit', 'Quota exhausted.', status);
  if (status >= 500) return new ProviderError(provider, 'server', `Gemini error ${status}.`, status);
  return new ProviderError(provider, 'invalid', detail || `Request failed (${status}).`, status);
}
