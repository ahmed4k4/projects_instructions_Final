/**
 * Vercel Serverless Function — the Gemini proxy in production.
 *
 * The client calls `/api/ai/v1beta/models/<model>:<method>` and
 * `/api/ai/config` (see `src/server/geminiProxy.ts` for the contract).
 * `GEMINI_API_KEY` is a server-only environment variable in the Vercel
 * dashboard; it is never inlined into the bundle.
 *
 * Uses the Web `Request`/`Response` API and `export const runtime`, which the
 * Node.js (18+) function runtime supports natively — no dependency needed.
 *
 * Cold-start note: this module imports one pure file and nothing else, so the
 * first chat turn is not paying for the app's dependency graph.
 */
import { handleAiRoute, readGeminiConfig, splitRoute } from '../../src/server/geminiProxy.ts';

export const runtime = 'nodejs';

export async function GET(request: Request, context: { params: { route?: string[] } }): Promise<Response> {
  return dispatch(request, context);
}

export async function POST(request: Request, context: { params: { route?: string[] } }): Promise<Response> {
  return dispatch(request, context);
}

export async function OPTIONS(
  request: Request,
  context: { params: { route?: string[] } },
): Promise<Response> {
  return dispatch(request, context);
}

async function dispatch(request: Request, context: { params: { route?: string[] } }): Promise<Response> {
  const url = new URL(request.url);
  const config = readGeminiConfig();

  const result = await handleAiRoute(
    {
      route: splitRoute(context?.params?.route),
      search: url.search.replace(/^\?/, ''),
      method: request.method,
      body: request.method === 'GET' || request.method === 'HEAD' ? null : await request.text(),
      signal: request.signal,
    },
    config,
    process.env.GEMINI_API_KEY,
  );

  const headers = new Headers(result.headers);
  const body = result.body ?? result.text ?? null;

  // 204 must not carry a body at all.
  if (result.status === 204) return new Response(null, { status: 204, headers });

  return new Response(body, { status: result.status, headers });
}
