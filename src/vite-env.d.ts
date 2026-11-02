/// <reference types="vite/client" />

/**
 * Only VITE_-prefixed variables are visible to the browser.
 *
 * `GEMINI_API_KEY` is deliberately NOT listed here: it has no VITE_ prefix, so
 * Vite never inlines it and the browser cannot read it. The provider layer asks
 * the server instead (`GET /api/ai/config`) — a Vercel Serverless Function in
 * production, the same handler in the Vite dev middleware — which returns a
 * boolean.
 *
 * If you ever add `VITE_GEMINI_API_KEY`, it will be bundled into `dist/` and
 * shipped to every visitor. `pnpm check:secrets` exists to catch exactly that.
 */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /**
   * Public base URL, used for share links and auth redirects.
   * Set it to the deployed origin; leave it unset locally.
   */
  readonly VITE_APP_URL?: string;
  /** Vite-provided: `/` or the sub-path the app is served from. */
  readonly BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
