import type { ComponentCategory } from './components';
import type { UseCase } from './build';

/* -------------------------------------------------------------------------- */
/*  Intake & results                                                          */
/* -------------------------------------------------------------------------- */

export interface AIBuildRequest {
  budget: number;
  currency: string;
  useCase: UseCase;
  resolution?: string;
  performanceTarget?: string;
  preferences?: string[];
  /** Free-text from the wizard's "anything else?" step. */
  notes?: string;
}

export interface AISuggestedItem {
  category: ComponentCategory;
  componentId: string;
  reason: string;
}

export interface AIBuildResponse {
  buildName: string;
  items: AISuggestedItem[];
  totalPrice: number;
  estimatedFps?: Record<string, number>;
  explanation: string;
  /** `ai` when Gemini produced it, `fallback` when the deterministic generator did. */
  source: 'ai' | 'fallback';
  /** Populated when the AI run was degraded (rate limit, outage, invalid IDs). */
  degradedReason?: string;
}

export interface AIAdviceRequest {
  buildId: string;
  question: string;
}

export interface AIAdviceResponse {
  answer: string;
  suggestions: AISuggestedItem[];
}

export interface AIBuildAnalysis {
  score: number;
  advice: string;
}

/* -------------------------------------------------------------------------- */
/*  Build Doctor                                                              */
/* -------------------------------------------------------------------------- */

export interface DoctorUpgrade {
  category: ComponentCategory;
  fromComponentId: string | null;
  toComponentId: string;
  expectedScoreDelta: number;
  reason: string;
}

export interface BuildDoctorReport {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  verdict: 'excellent' | 'good' | 'needs_work' | 'rebuild';
  upgrades: DoctorUpgrade[];
}

/* -------------------------------------------------------------------------- */
/*  Chat                                                                      */
/* -------------------------------------------------------------------------- */

export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  pending?: boolean;
  /** Component IDs the assistant referenced — rendered as citation chips. */
  citations?: string[];
  toolTrace?: ToolTraceEntry[];
}

/* -------------------------------------------------------------------------- */
/*  Gemini wire format (shared by the browser and the Edge Function)           */
/* -------------------------------------------------------------------------- */

/**
 * Model tier, not a model id — ids live in src/services/ai/models.ts.
 *   chat    → lowest-latency free model (interactive)
 *   quality → strongest free model (analysis; may take longer)
 */
export type GeminiModelKey = 'chat' | 'quality';

export interface ToolDeclaration {
  name: string;
  description: string;
  /** OpenAPI-subset schema understood by Gemini function declarations. */
  parameters: Record<string, unknown>;
}

export interface GeminiContentPart {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown>; id?: string };
  functionResponse?: { name: string; response: Record<string, unknown>; id?: string };
  /**
   * Opaque signature Gemini attaches to reasoning + `functionCall` parts.
   *
   * It MUST be echoed back verbatim on every subsequent turn of a tool loop.
   * Dropping it makes the next request fail with
   *   `400 Function call is missing a thought_signature in functionCall parts.`
   * Treat it as read-only: copy it, never build it.
   */
  thoughtSignature?: string;
}

export interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiContentPart[];
}

export interface GenerateRequestPayload {
  contents: GeminiContent[];
  systemInstruction?: string;
  tools?: ToolDeclaration[];
  temperature?: number;
  maxOutputTokens?: number;
  /** JSON schema → the model must answer with structured JSON. */
  responseSchema?: Record<string, unknown>;
}

export interface GenerateOptions {
  model?: GeminiModelKey;
  systemInstruction?: string;
  tools?: ToolDeclaration[];
  /**
   * Force Google Search grounding. When omitted, the client decides from the
   * question (see services/ai/grounding.ts). Never applies alongside tools.
   */
  grounded?: boolean;
  responseSchema?: Record<string, unknown>;
  temperature?: number;
  maxOutputTokens?: number;
  /** Streaming token callback (chat + build narration). */
  onToken?: (token: string) => void;
  /** Progress callback for non-text events (tool calls, completion). */
  onEvent?: (event: StreamEvent) => void;
  signal?: AbortSignal;
}

/** One agentic turn: what the model said and which tools it wants called. */
export interface GenerateResult {
  text: string;
  toolCalls: ToolCall[];
  /**
   * The model turn exactly as Gemini returned it, `thoughtSignature`s included.
   * Agent loops must append THIS to the conversation instead of rebuilding parts
   * from `toolCalls` — see geminiProvider.ts.
   */
  modelParts?: GeminiContentPart[];
  /** Approximate requests left in the current rate-limit window. */
  remaining: number | null;
  /** Live sources when the answer was grounded in Google Search. */
  sources?: Array<{ title: string; uri: string }>;
}

export interface ToolCall {
  name: string;
  /**
   * Provider-assigned id. OpenAI-compatible APIs require the matching
   * `tool_call_id` when the result is sent back, so it must round-trip.
   */
  id?: string;
  args: Record<string, unknown>;
  /**
   * Gemini's opaque signature for this call. Must be echoed back with the
   * `functionCall` part or the next turn fails with a 400. Copy, never invent.
   */
  thoughtSignature?: string;
}

export interface ToolTraceEntry {
  name: string;
  args: Record<string, unknown>;
  ok: boolean;
  /** Short human summary shown in the thinking panel ("Found 6 GPUs"). */
  summary?: string;
}

/* -------------------------------------------------------------------------- */
/*  Streaming events — mirrors the Edge Function's SSE contract                */
/* -------------------------------------------------------------------------- */

export type StreamEvent =
  | { type: 'start'; model?: string }
  | { type: 'token'; text: string }
  | { type: 'tool_call'; name: string; args: Record<string, unknown> }
  | { type: 'done'; text?: string; toolCalls?: ToolCall[] }
  | { type: 'error'; code: string; message: string };

export type AIErrorCode =
  | 'unauthorized'
  | 'rate_limited'
  | 'invalid_request'
  | 'upstream_error'
  | 'upstream_timeout'
  | 'not_configured'
  | 'internal'
  | 'network'
  | 'aborted';

export class AIError extends Error {
  constructor(
    readonly code: AIErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'AIError';
  }
}

/** Kept for callers written against Phase 1. */
export class AIUnavailableError extends AIError {
  constructor(feature: string) {
    super('not_configured', `${feature} is not available.`);
    this.name = 'AIUnavailableError';
  }
}
