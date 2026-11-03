/**
 * Gemini configuration discovery.
 *
 * The API key is read only by the server (it has no `VITE_` prefix, so Vite
 * never inlines it). The browser therefore cannot answer "is Gemini
 * configured?" from `import.meta.env` — it asks the server instead:
 *
 *   GET /api/ai/config  →  { gemini: boolean, model?: string }
 *
 * That route is a Vercel Serverless Function in production (`api/ai/[...route].ts`)
 * and a Vite middleware in development — one contract, both environments.
 *
 * Only booleans are returned; no key material ever crosses this boundary. The
 * result is cached for 5 minutes to avoid a request per render.
 */
export interface AIProviderConfig {
  configured: boolean;
  /** Optional server-side default model override (GEMINI_MODEL). */
  model: string | null;
  discovered: boolean;
  checkedAt: number;
}

const CONFIG_TTL_MS = 5 * 60 * 1000;
const CACHE_KEY = 'nexus:ai:gemini-config';

let inFlight: Promise<AIProviderConfig> | null = null;

const EMPTY: AIProviderConfig = { configured: false, model: null, discovered: false, checkedAt: 0 };

function readCache(): AIProviderConfig | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AIProviderConfig;
    return Date.now() - parsed.checkedAt < CONFIG_TTL_MS ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(config: AIProviderConfig): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(config));
  } catch {
    // Storage disabled — discovery simply repeats next time.
  }
}

/** Discover whether the server holds a Gemini key. */
export async function discoverGeminiConfig(force = false): Promise<AIProviderConfig> {
  if (!force) {
    const cached = readCache();
    if (cached) return cached;
    if (inFlight) return inFlight;
  }

  inFlight = (async () => {
    let config: AIProviderConfig = { ...EMPTY, checkedAt: Date.now() };

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const res = await fetch('/api/ai/config', { signal: controller.signal });
      clearTimeout(timer);

      if (res.ok && (res.headers.get('content-type') ?? '').includes('json')) {
        const data = (await res.json()) as { gemini?: boolean; model?: string };
        config = {
          configured: Boolean(data.gemini),
          model: data.model ?? null,
          discovered: true,
          checkedAt: Date.now(),
        };
      }
    } catch {
      // Production build without the dev server: no provider is available, which
      // is correct — the key is never shipped to the browser.
    }

    writeCache(config);
    inFlight = null;
    return config;
  })();

  return inFlight;
}
