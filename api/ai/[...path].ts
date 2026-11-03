/**
 * Vercel Web Standard Function for the Gemini API.
 *
 * Vercel invokes `default.fetch(request)` for this entry point. Keeping the
 * function in the Web Request/Response contract avoids mixing Node's
 * IncomingMessage/ServerResponse with Web handlers (the old default export did
 * exactly that and could throw before reaching Gemini).
 *
 * The middleware rewrites deep `/api/ai/*` requests to `/api/ai?path=...` so
 * every depth is handled by this one function.
 */
import { handleAiRoute, readGeminiConfig, splitRoute } from '../../src/server/geminiProxy.js';

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const AUTH_RATE_LIMIT = 60;
const GUEST_RATE_LIMIT = 30;
const RATE_WINDOW_SECONDS = 60;
const UPSTREAM_TIMEOUT_MS = 55_000;

function json(status: number, payload: unknown): Response {
  return Response.json(payload, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function routeOf(request: Request): string {
  const url = new URL(request.url);
  const routedPath = splitRoute(url.searchParams.get('path') ?? undefined);
  if (routedPath) return routedPath;

  const prefix = '/api/ai';
  if (url.pathname === prefix || url.pathname === `${prefix}/`) return '';
  if (url.pathname.startsWith(`${prefix}/`)) {
    return splitRoute(url.pathname.slice(prefix.length));
  }

  return '';
}

function searchWithoutRoute(search: string): string {
  const params = new URLSearchParams(search);
  params.delete('path');
  return params.toString();
}

function safeError(error: unknown): string {
  if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
    return 'GEMINI_TIMEOUT';
  }
  return 'GEMINI_UPSTREAM_UNAVAILABLE';
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function verifyUserAndConsumeQuota(request: Request): Promise<Response | null> {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return json(503, {
      error: {
        message: 'Server-side Supabase usage protection is not configured.',
        status: 'FAILED_PRECONDITION',
        hint: 'Set SUPABASE_URL and SUPABASE_ANON_KEY in Vercel, apply migrations 013 and 014, then redeploy.',
      },
    });
  }

  const authorization = request.headers.get('authorization') ?? '';
  const tokenMatch = /^Bearer\s+([^\s]+)$/i.exec(authorization);
  const forwarded = (request.headers.get('x-vercel-forwarded-for') ?? request.headers.get('x-forwarded-for'))?.split(',')[0]?.trim();
  const clientIp = forwarded || request.headers.get('x-real-ip') || 'unknown-client';
  const salt = process.env.AI_RATE_LIMIT_SALT || process.env.SUPABASE_URL || 'nexus-ai-guest-rate-limit';
  const fingerprint = await sha256(`${salt}:${clientIp}`);
  const isAuthenticated = Boolean(tokenMatch);
  const rpc = isAuthenticated
    ? 'consume_ai_usage_for_current_user'
    : 'consume_ai_usage_for_guest';

  let quotaResponse: Response;
  try {
    quotaResponse = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/${rpc}`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${tokenMatch?.[1] ?? anonKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(isAuthenticated
        ? { p_limit: AUTH_RATE_LIMIT, p_window_seconds: RATE_WINDOW_SECONDS }
        : { p_fingerprint: fingerprint, p_limit: GUEST_RATE_LIMIT, p_window_seconds: RATE_WINDOW_SECONDS }),
      signal: AbortSignal.timeout(3_500),
    });
  } catch {
    return json(503, { error: { message: 'Could not verify AI usage allowance with Supabase.', status: 'UNAVAILABLE' } });
  }

  const quotaBody = await quotaResponse.json().catch(() => null) as
    | Array<{ allowed?: boolean; remaining?: number }>
    | { code?: string; message?: string; msg?: string }
    | null;

  if (!quotaResponse.ok) {
    const details = quotaBody && !Array.isArray(quotaBody) ? `${quotaBody.code ?? ''} ${quotaBody.message ?? quotaBody.msg ?? ''}` : '';
    if (quotaResponse.status === 401 || /UNAUTHENTICATED|invalid JWT|JWT expired/i.test(details)) {
      return json(401, { error: { message: 'Your session is invalid or expired. Sign in again, or continue as guest.', status: 'UNAUTHENTICATED' } });
    }
    if (/consume_ai_usage_for_guest|schema cache|function .* does not exist/i.test(details)) {
      return json(503, { error: { message: 'AI guest quota migration 014 is missing. Apply the latest Supabase migrations.', status: 'FAILED_PRECONDITION' } });
    }
    console.error('[AI proxy] quota RPC failed:', quotaResponse.status, details.slice(0, 180));
    return json(503, { error: { message: 'AI usage protection is not ready. Check Supabase migrations 013 and 014.', status: 'FAILED_PRECONDITION' } });
  }

  const quotaRows = Array.isArray(quotaBody) ? quotaBody : null;
  if (!quotaRows || typeof quotaRows[0]?.allowed !== 'boolean') {
    return json(503, { error: { message: 'AI usage protection returned an invalid response.', status: 'FAILED_PRECONDITION' } });
  }
  if (!quotaRows[0].allowed) {
    const limit = isAuthenticated ? AUTH_RATE_LIMIT : GUEST_RATE_LIMIT;
    return json(429, {
      error: { message: `AI limit reached (${limit} requests per minute). ${isAuthenticated ? 'Try again shortly.' : 'Create an optional account for a higher personal limit.'}`, status: 'RESOURCE_EXHAUSTED' },
      retryAfterSeconds: RATE_WINDOW_SECONDS,
    });
  }
  return null;
}

async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const route = routeOf(request);
  const key = (process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? '').trim();
  const geminiConfig = readGeminiConfig(process.env as Record<string, string | undefined>);
  const supabaseReady = Boolean((process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY) && (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL));

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { 'Cache-Control': 'no-store', Allow: 'GET, POST, OPTIONS' },
    });
  }

  // The app and API are same-origin. Reject cross-origin callers instead of
  // publishing a wildcard-CORS endpoint backed by a paid/quota-limited API key.
  const origin = request.headers.get('origin');
  if (origin) {
    try {
      if (new URL(origin).origin !== url.origin) {
        return json(403, { error: { message: 'Cross-origin requests are not allowed.', status: 'FORBIDDEN' } });
      }
    } catch {
      return json(403, { error: { message: 'Invalid request origin.', status: 'FORBIDDEN' } });
    }
  }

  if (route === 'config' && request.method === 'GET') {
    const ready = geminiConfig.configured && supabaseReady;
    const reason = !geminiConfig.configured
      ? 'GEMINI_API_KEY is not configured for this deployment.'
      : !supabaseReady
        ? 'Server-side Supabase quota protection is not configured.'
        : null;
    return json(200, {
      ok: ready,
      gemini: ready,
      model: geminiConfig.model,
      ...(reason
        ? {
            reason,
            hint: 'In Vercel → Project → Settings → Environment Variables, set GEMINI_API_KEY, SUPABASE_URL and SUPABASE_ANON_KEY for Production, Preview and Development, apply migrations 013 and 014, then redeploy.',
          }
        : {}),
    });
  }

  if (request.method !== 'POST') {
    return json(405, { error: { message: 'Method not allowed.', status: 'METHOD_NOT_ALLOWED' } });
  }

  if (!geminiConfig.configured || !key) {
    return json(503, {
      error: { message: 'GEMINI_API_KEY is not configured on the server.', status: 'FAILED_PRECONDITION' },
    });
  }

  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return json(413, { error: { message: 'The AI request is too large.', status: 'RESOURCE_EXHAUSTED' } });
  }

  if (!/^v1beta\/models\/(gemini-3\.8-flash|gemini-3\.5-flash-lite|gemini-3\.1-flash-lite|gemini-3\.5-flash|gemini-3\.6-flash):(generateContent|streamGenerateContent|countTokens)$/.test(route)) {
    return json(404, { error: { message: 'Unknown AI route or unsupported model.', status: 'NOT_FOUND' } });
  }

  if (!(request.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) {
    return json(415, { error: { message: 'Content-Type must be application/json.', status: 'UNSUPPORTED_MEDIA_TYPE' } });
  }

  let body: string;
  try {
    body = await request.text();
  } catch {
    return json(400, { error: { message: 'Could not read the request body.', status: 'INVALID_ARGUMENT' } });
  }
  if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
    return json(413, { error: { message: 'The AI request is too large.', status: 'RESOURCE_EXHAUSTED' } });
  }
  try {
    JSON.parse(body);
  } catch {
    return json(400, { error: { message: 'The AI request body must be valid JSON.', status: 'INVALID_ARGUMENT' } });
  }

  const authFailure = await verifyUserAndConsumeQuota(request);
  if (authFailure) return authFailure;

  // Tie the upstream call to both client cancellation and the Vercel time
  // budget. The remaining five seconds let the function flush a clean response.
  const timeoutSignal = AbortSignal.timeout(UPSTREAM_TIMEOUT_MS);
  const signal = AbortSignal.any([request.signal, timeoutSignal]);

  try {
    const result = await handleAiRoute(
      {
        route,
        search: searchWithoutRoute(url.search),
        method: request.method,
        body,
        signal,
      },
      geminiConfig,
      key,
    );

    const headers = new Headers(result.headers);
    headers.set('Cache-Control', result.headers['Cache-Control'] ?? 'no-store');
    headers.set('X-Content-Type-Options', 'nosniff');
    if (result.status === 204) return new Response(null, { status: 204, headers });
    return new Response(result.body ?? result.text ?? null, { status: result.status, headers });
  } catch (error) {
    console.error('[AI proxy] request failed:', error instanceof Error ? error.message : 'unknown error');
    return json(error instanceof Error && error.name === 'TimeoutError' ? 504 : 502, {
      error: { message: safeError(error), status: 'UNAVAILABLE' },
    });
  }
}

/** Vercel's documented Web Standard entry point. */
export default {
  fetch(request: Request): Promise<Response> {
    return handleRequest(request);
  },
};
