/**
 * Gemini proxy core — shared by the Vercel Serverless Function and the Vite dev
 * server, so there is exactly ONE implementation of the proxy.
 *
 * Why a proxy at all
 *   `GEMINI_API_KEY` has no `VITE_` prefix and therefore never reaches the
 *   browser. The client speaks the Google REST dialect at `/api/ai/v1beta/...`
 *   (see `services/ai/providers/geminiProvider.ts`) and this layer attaches the
 *   key server-side, forwards the body untouched and streams the SSE response
 *   back unbuffered.
 *
 * Route convention
 *   `/api/ai/<everything after>` → `https://generativelanguage.googleapis.com/<everything after>`
 *   e.g. `/api/ai/v1beta/models/x:streamGenerateContent?alt=sse`
 *
 * This file is plain TypeScript with no dependency on `@google/genai`: the app
 * already speaks the REST wire format directly (and needs `thoughtSignature` and
 * `groundingMetadata` preserved verbatim, which the SDK does not surface cleanly).
 * A serverless function only has to add the key and relay bytes, so the SDK would
 * add ~200 kB of cold-start weight for nothing.
 */

/** Where the real API lives. */
const GEMINI_ORIGIN = 'https://generativelanguage.googleapis.com';

/** Only real model routes are proxied — `/api/ai/config` and typos are ours. */
const ALLOWED_PATH =
  /^v1(alpha|beta)\/models\/[A-Za-z0-9._-]+:(generateContent|streamGenerateContent|countTokens)$/;

export interface ProxyConfig {
  /** Boolean only — never the key itself. */
  configured: boolean;
  model: string | null;
}

/** Read the key/model from process.env without ever exposing the key. */
export function readGeminiConfig(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): ProxyConfig {
  const key = (env.GEMINI_API_KEY ?? env.GOOGLE_API_KEY ?? '').trim();
  return { configured: key.length > 0, model: env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash-lite' };
}

export interface ProxyRequest {
  /** Path after `/api/ai`, without a leading slash. */
  route: string;
  /** Raw query string (may be empty). */
  search: string;
  method: string;
  body?: string | null;
  signal?: AbortSignal;
}

export interface ProxyResponse {
  status: number;
  /** Response headers already normalised for the browser. */
  headers: Record<string, string>;
  /** Upstream body, streamed through untouched. */
  body: ReadableStream<Uint8Array> | null;
  /** Plain-text payload for locally generated responses (config, errors). */
  text?: string;
}

const PREFLIGHT_HEADERS = {
  // No wildcard Access-Control-Allow-Origin: the browser app and API are
  // same-origin. A public wildcard would allow unrelated sites to call the
  // proxy backed by the server's Gemini key.
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '86400',
};

const NO_STORE = 'no-store';

function json(status: number, payload: unknown): ProxyResponse {
  return {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': NO_STORE },
    body: null,
    text: JSON.stringify(payload),
  };
}

/**
 * Handle any `/api/ai/*` request: config discovery, CORS preflight, or a proxied
 * Gemini call. Pure I/O — no framework, no globals — so the same code runs on
 * Node, Vercel's edge runtime and the Vite dev middleware.
 */
export async function handleAiRoute(
  req: ProxyRequest,
  config: ProxyConfig,
  apiKey: string | undefined,
): Promise<ProxyResponse> {
  if (req.method === 'OPTIONS') {
    return { status: 204, headers: PREFLIGHT_HEADERS, body: null };
  }

  /**
   * GET /api/ai/config — health check and configuration discovery.
   *
   * Always answers 200: the endpoint itself is working even when no key is set,
   * and a deploy that 404s here is a *routing* failure, not a missing key. The
   * body distinguishes the two:
   *
   *   { ok: true,  gemini: true,  model }   → AI is live
   *   { ok: false, gemini: false, reason }  → deploy is fine, key is missing
   *
   * `reason` is written for the person who has to fix it, and it names the
   * exact dashboard location — the most common cause is setting the variable on
   * a different environment (Preview vs Production) or not redeploying after
   * adding it, both of which leave `process.env` empty at runtime.
   */
  if (req.route === 'config') {
    return json(200, {
      ok: config.configured,
      gemini: config.configured,
      model: config.model,
      ...(config.configured
        ? {}
        : {
            reason: 'GEMINI_API_KEY is not set for this deployment.',
            hint: 'Vercel → Project → Settings → Environment Variables → add GEMINI_API_KEY for Production, Preview AND Development, then Redeploy.',
          }),
    });
  }

  if (!ALLOWED_PATH.test(req.route)) {
    return json(404, { error: { message: 'Unknown AI route', status: 'NOT_FOUND' } });
  }

  if (!config.configured || !apiKey) {
    return json(503, {
      error: {
        message: 'GEMINI_API_KEY is not configured on the server.',
        status: 'FAILED_PRECONDITION',
        hint: 'Set it in Vercel → Settings → Environment Variables (all three environments) and redeploy.',
      },
    });
  }

  const target = `${GEMINI_ORIGIN}/${req.route}${req.search ? `?${req.search}` : ''}`;

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        // Header form (not `?key=`) keeps the secret out of logs and referrers.
        'x-goog-api-key': apiKey,
      },
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : (req.body ?? undefined),
      signal: req.signal,
    });
  } catch (error) {
    const timedOut = (error as Error)?.name === 'TimeoutError' || (error as Error)?.name === 'AbortError';
    return json(timedOut ? 504 : 502, {
      error: {
        message: timedOut ? 'GEMINI_TIMEOUT' : 'GEMINI_UPSTREAM_UNAVAILABLE',
        status: timedOut ? 'DEADLINE_EXCEEDED' : 'UNAVAILABLE',
      },
    });
  }

  const contentType = upstream.headers.get('content-type') ?? 'application/json';
  const isStream = contentType.includes('text/event-stream');

  return {
    status: upstream.status,
    headers: {
      'Content-Type': contentType,
      // SSE must not be buffered or compressed away by a CDN or a proxy.
      'Cache-Control': isStream ? 'no-cache, no-transform' : NO_STORE,
      'X-AI-Upstream': 'google',
      ...(isStream ? { 'X-Accel-Buffering': 'no' } : {}),
    },
    body: upstream.body,
  };
}

/** Split a catch-all path (`['v1beta','models','x:generateContent']`) into parts. */
export function splitRoute(segments: string[] | string | undefined): string {
  const list = Array.isArray(segments) ? segments : (segments ?? '').split('/');
  return list.filter(Boolean).join('/');
}
