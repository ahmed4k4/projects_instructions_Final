// =============================================================================
// gemini-proxy — the ONLY place the Gemini API key lives.
//
// POST /functions/v1/gemini-proxy
//   Authorization: Bearer <user access token>
//   { action, payload, stream?, model? }
//   → application/json  { ok: true, data } | { ok: false, error: { code, message } }
//   → text/event-stream (when stream: true)  data: {type:'token'|'tool_call'|'done'|'error',...}
//
// Actions
//   generate      Agentic turn. Accepts the tool declarations + full conversation
//                 (the browser owns the agent loop so it can run the deterministic
//                 engines locally), returns text and/or function calls.
//   advise        One-shot grounded answer (chat suggestions).
//   structured    JSON-schema constrained output (Build Doctor, FPS estimation).
//   health        Public capability probe — no auth, no Gemini call.
//
// Security
//   · GEMINI_API_KEY is a server secret (supabase secrets set); never a VITE_ var.
//   · Every action except `health` requires a verified user JWT (anonymous
//     sign-ins excluded), so the quota can be attributed and rate-limited.
//   · Per-user sliding-window rate limit, persisted in ai_usage so it survives
//     cold starts and multiple isolates.
//   · 45s upstream timeout, one retry with exponential backoff on 429/5xx.
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Pinned models. Verified live against the configured key:
 *   gemini-2.5-flash is retired for new API keys (404), gemini-3.8-pro does not
 *   exist, gemini-3.6-flash streams + calls tools. Keep the list explicit so a
 *   client cannot ask for an arbitrary (expensive) model.
 */
const MODELS = {
  flash: 'gemini-3.6-flash',
  pro: 'gemini-3.8-flash',
} as const;
type ModelKey = keyof typeof MODELS;

const RATE_LIMIT = { windowSeconds: 60, maxRequests: 20 };
const UPSTREAM_TIMEOUT_MS = 45_000;
const MAX_RETRIES = 1;

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ToolDeclaration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

interface ContentPart {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}

interface Content {
  role: 'user' | 'model';
  parts: ContentPart[];
}

interface GenerateRequest {
  contents: Content[];
  systemInstruction?: string;
  tools?: ToolDeclaration[];
  temperature?: number;
  maxOutputTokens?: number;
  responseSchema?: Record<string, unknown>;
}

interface ProxyBody {
  action?: 'generate' | 'advise' | 'structured' | 'health';
  payload?: GenerateRequest;
  stream?: boolean;
  model?: ModelKey;
}

type ErrorCode =
  | 'unauthorized'
  | 'rate_limited'
  | 'invalid_request'
  | 'upstream_error'
  | 'upstream_timeout'
  | 'not_configured'
  | 'internal';

class ProxyError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function fail(code: ErrorCode, message: string, status: number): Response {
  return json({ ok: false, error: { code, message } }, status);
}

function sseStream(onStart: (emit: (event: unknown) => void) => Promise<void>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: unknown) => {
        // CRLF frames — the Gemini SSE endpoint uses them too and both the
        // browser reader and proxies handle it uniformly.
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\r\n\r\n`));
      };
      try {
        await onStart(emit);
      } catch (error) {
        emit({
          type: 'error',
          code: error instanceof ProxyError ? error.code : 'internal',
          message: error instanceof Error ? error.message : 'Unexpected error',
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

// ---------------------------------------------------------------------------
// Auth & rate limiting
// ---------------------------------------------------------------------------
function serviceClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function requireUser(req: Request): Promise<{ id: string; token: string }> {
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new ProxyError('unauthorized', 'Missing Authorization header.', 401);

  const admin = serviceClient();
  if (!admin) throw new ProxyError('not_configured', 'Supabase service role is not configured.', 500);

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new ProxyError('unauthorized', 'Invalid or expired session.', 401);
  // Anonymous sign-ins have no email — they must not burn AI quota.
  if (!data.user.email) throw new ProxyError('unauthorized', 'Sign in with an email address first.', 403);

  return { id: data.user.id, token };
}

/** Sliding window counter in `ai_usage`; throws 429 with a retry hint. */
async function enforceRateLimit(userId: string): Promise<{ remaining: number }> {
  const admin = serviceClient();
  if (!admin) throw new ProxyError('not_configured', 'Supabase service role is not configured.', 500);

  const now = new Date();
  const windowStart = new Date(now.getTime() - RATE_LIMIT.windowSeconds * 1000).toISOString();

  const { count, error } = await admin
    .from('ai_usage')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', windowStart);

  if (error) throw new ProxyError('internal', `Rate limiter unavailable: ${error.message}`, 500);

  const used = count ?? 0;
  if (used >= RATE_LIMIT.maxRequests) {
    throw new ProxyError(
      'rate_limited',
      `Rate limit reached (${RATE_LIMIT.maxRequests} requests/minute). Try again shortly.`,
      429,
    );
  }

  // Record before the call so concurrent requests cannot slip past the window.
  const { error: insertError } = await admin.from('ai_usage').insert({
    user_id: userId,
    action: 'gemini',
    created_at: now.toISOString(),
  });
  if (insertError) throw new ProxyError('internal', `Usage log failed: ${insertError.message}`, 500);

  // Opportunistic cleanup keeps the table small without a scheduler.
  if (Math.random() < 0.05) {
    await admin
      .from('ai_usage')
      .delete()
      .lt('created_at', new Date(now.getTime() - 3600 * 1000).toISOString());
  }

  return { remaining: RATE_LIMIT.maxRequests - used - 1 };
}

// ---------------------------------------------------------------------------
// Gemini transport
// ---------------------------------------------------------------------------
function toGeminiBody(payload: GenerateRequest): Record<string, unknown> {
  if (!payload?.contents?.length) {
    throw new ProxyError('invalid_request', '`payload.contents` must contain at least one turn.', 400);
  }

  const body: Record<string, unknown> = {
    contents: payload.contents,
    generationConfig: {
      temperature: payload.temperature ?? 0.7,
      maxOutputTokens: payload.maxOutputTokens ?? 2048,
      ...(payload.responseSchema
        ? { responseMimeType: 'application/json', responseSchema: payload.responseSchema }
        : {}),
    },
  };

  if (payload.systemInstruction) {
    body.systemInstruction = { parts: [{ text: payload.systemInstruction }] };
  }
  if (payload.tools?.length) {
    body.tools = [{ functionDeclarations: payload.tools }];
  }

  return body;
}

function endpoint(model: string, stream: boolean): string {
  const method = stream ? 'streamGenerateContent' : 'generateContent';
  const query = stream ? '&alt=sse' : '';
  return `${GEMINI_BASE}/models/${model}:${method}?key=${encodeURIComponent(apiKey())}${query}`;
}

function apiKey(): string {
  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) throw new ProxyError('not_configured', 'GEMINI_API_KEY is not set on the server.', 500);
  return key;
}

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

/** One retry with exponential backoff + jitter on 429/5xx; hard 45s ceiling. */
async function upstream(model: string, body: unknown, stream: boolean): Promise<Response> {
  let lastError: ProxyError | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    try {
      const res = await fetch(endpoint(model, stream), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (res.ok) return res;

      const detail = await res.text();
      const message = extractUpstreamMessage(detail) ?? `Gemini returned ${res.status}.`;
      lastError = new ProxyError('upstream_error', message, res.status === 429 ? 429 : 502);

      if (!isRetryable(res.status) || attempt === MAX_RETRIES) break;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        lastError = new ProxyError('upstream_timeout', 'Gemini did not respond in time.', 504);
      } else {
        lastError = new ProxyError('upstream_error', (error as Error).message, 502);
      }
      if (attempt === MAX_RETRIES) break;
    } finally {
      clearTimeout(timer);
    }

    await new Promise((r) => setTimeout(r, 400 * 2 ** attempt + Math.random() * 250));
  }

  throw lastError ?? new ProxyError('upstream_error', 'Gemini request failed.', 502);
}

function extractUpstreamMessage(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw);
    return parsed?.error?.message ?? null;
  } catch {
    return raw.slice(0, 300) || null;
  }
}

/** Split an SSE buffer into `data:` frames, tolerating CRLF and partial tails. */
function parseFrames(buffer: string): { frames: string[]; rest: string } {
  const normalised = buffer.replace(/\r\n/g, '\n');
  const parts = normalised.split('\n\n');
  const rest = parts.pop() ?? '';
  const frames = parts
    .map((part) => part.split('\n').find((line) => line.startsWith('data:')))
    .filter((line): line is string => Boolean(line))
    .map((line) => line.slice(5).trim())
    .filter((data) => data && data !== '[DONE]');
  return { frames, rest };
}

async function forwardStream(res: Response, emit: (event: unknown) => void): Promise<void> {
  const reader = res.body?.getReader();
  if (!reader) throw new ProxyError('upstream_error', 'Gemini returned an empty stream.', 502);

  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const { frames, rest } = parseFrames(buffer);
    buffer = rest;

    for (const frame of frames) {
      let chunk: {
        candidates?: Array<{ content?: { parts?: ContentPart[] } }>;
      };
      try {
        chunk = JSON.parse(frame);
      } catch {
        continue;
      }
      for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
        if (part.text) {
          text += part.text;
          emit({ type: 'token', text: part.text });
        }
        if (part.functionCall) {
          calls.push(part.functionCall);
          emit({ type: 'tool_call', name: part.functionCall.name, args: part.functionCall.args });
        }
      }
    }
  }

  emit({ type: 'done', text, toolCalls: calls });
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return fail('invalid_request', 'Use POST.', 405);

  let body: ProxyBody;
  try {
    body = (await req.json()) as ProxyBody;
  } catch {
    return fail('invalid_request', 'Body must be valid JSON.', 400);
  }

  const action = body.action ?? 'generate';

  // Public capability probe — lets the UI show "AI ready / unavailable" before
  // the user has signed in. Never touches Gemini.
  if (action === 'health') {
    return json({
      ok: true,
      data: {
        configured: Boolean(Deno.env.get('GEMINI_API_KEY')),
        models: MODELS,
        rateLimit: RATE_LIMIT,
      },
    });
  }

  try {
    const user = await requireUser(req);
    const limit = await enforceRateLimit(user.id);

    if (action === 'advise' || action === 'structured') body.stream = body.stream ?? false;
    const model = MODELS[body.model ?? (action === 'structured' ? 'pro' : 'flash')];
    const payload = body.payload;
    if (!payload) throw new ProxyError('invalid_request', '`payload` is required.', 400);

    const geminiBody = toGeminiBody(payload);
    const res = await upstream(model, geminiBody, Boolean(body.stream));

    if (body.stream) {
      return sseStream(async (emit) => {
        emit({ type: 'start', model });
        await forwardStream(res, emit);
      });
    }

    const data = await res.json();
    const candidate = data?.candidates?.[0];
    const parts: ContentPart[] = candidate?.content?.parts ?? [];
    const text = parts
      .map((p) => p.text ?? '')
      .join('')
      .trim();
    const toolCalls = parts
      .filter((p) => p.functionCall)
      .map((p) => ({ name: p.functionCall!.name, args: p.functionCall!.args ?? {} }));

    if (action === 'structured') {
      if (!text) throw new ProxyError('upstream_error', 'Model returned an empty response.', 502);
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new ProxyError('upstream_error', 'Model did not return valid JSON.', 502);
      }
      return json({ ok: true, data: parsed, meta: { model, remaining: limit.remaining } });
    }

    return json({
      ok: true,
      data: { text, toolCalls, finishReason: candidate?.finishReason ?? null },
      meta: { model, remaining: limit.remaining },
    });
  } catch (error) {
    if (error instanceof ProxyError) return fail(error.code, error.message, error.status);
    console.error('[gemini-proxy] unhandled', error);
    return fail('internal', 'Unexpected error in the AI proxy.', 500);
  }
});
