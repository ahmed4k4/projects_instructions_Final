/// <reference types="vite/client" />

/**
 * Only VITE_-prefixed variables are visible to the browser.
 *
 * `GEMINI_API_KEY` is deliberately NOT listed here: it has no VITE_ prefix, so
 * Vite never inlines it and the browser cannot read it. The provider layer asks
 * the dev server instead (`GET /api/ai/config`), which returns a boolean.
 *
 * If you ever add `VITE_GEMINI_API_KEY`, it will be bundled into `dist/` and
 * shipped to every visitor. `pnpm check:secrets` exists to catch exactly that.
 */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_USE_SUPABASE_AI?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
