/**
 * Forward every `/api/ai/*` request to the catch-all function.
 *
 * ── Why a middleware exists at all ─────────────────────────────────────────
 * The proxy function lives at `api/ai/[...path].ts`, which OWNS the whole
 * `/api/ai` prefix: `/api/ai/config` and
 * `/api/ai/v1beta/models/<model>:generateContent` both reach it, at any depth.
 * That is the fix — the platform's own per-segment mapping served ONE segment and
 * 404'd everything deeper (measured against production: `/api/ai/missing` reached
 * the function, `/api/ai/v1beta/...` got an empty-body 404).
 *
 * This middleware is the belt to that braces. If a deployment ships a routing
 * table without the catch-all prefix (an older build, a different adapter), a
 * two-segment path falls into the generic `/api` 404 guard and never reaches a
 * handler. Rewriting here — carrying the original segments in `?path=` — makes
 * the function answer regardless of how the path was decomposed.
 *
 * It touches nothing that is not `/api/ai`, so the SPA and every other route are
 * unaffected. It speaks the standard Web `Request`/`Response` API, which is what
 * Vercel's middleware runtime provides (this is a Vite app, so `next/server` is
 * not available and must not be imported).
 */
export const config = {
  /**
   * Only `/api/ai/*`. A middleware that also matched the SPA would add a rewrite
   * in front of every navigation, which is exactly the class of bug this phase
   * is removing.
   *
   * `runtime: 'nodejs'` — the platform warned that the default (edge) runtime is
   * deprecated for project middleware. Node also matches the function's own
   * runtime, so the two cannot disagree about how a request is decoded.
   */
  runtime: 'nodejs',
  matcher: ['/api/ai/:path*', '/api/ai'],
};

export function middleware(request: Request): Response | undefined {
  const url = new URL(request.url);
  const rest = url.pathname.replace(/^\/api\/ai\/?/, '');

  // `/api/ai` itself has no engine route: let it through untouched so the
  // function answers 404 "Unknown AI route" rather than the middleware guessing.
  if (!rest) return undefined;

  const target = new URL('/api/ai', url.origin);
  target.searchParams.set('path', rest);
  for (const [key, value] of url.searchParams) {
    if (key !== 'path') target.searchParams.set(key, value);
  }

  return new Response(null, {
    status: 200,
    headers: {
      'x-middleware-rewrite': target.toString(),
    },
  });
}

export default middleware;
