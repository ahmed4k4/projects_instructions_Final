/**
 * Gemini configuration discovery.
 *
 * The browser never receives the Gemini API key. It checks the same-origin
 * server endpoint, which validates deployment configuration and returns only
 * readiness metadata. Successful results are cached briefly; failures are
 * retried quickly so a transient Vercel cold start is not remembered for five
 * minutes.
 */
export interface AIProviderConfig {
  configured: boolean;
  model: string | null;
  discovered: boolean;
  checkedAt: number;
  diagnosis: string | null;
}

const CONFIG_TTL_MS = 5 * 60 * 1000;
const FAILURE_TTL_MS = 20 * 1000;
const CACHE_KEY = 'nexus:ai:gemini-config';
const CONFIG_TIMEOUT_MS = 5000;

let inFlight: Promise<AIProviderConfig> | null = null;

const EMPTY: AIProviderConfig = {
  configured: false,
  model: null,
  discovered: false,
  checkedAt: 0,
  diagnosis: null,
};

function readCache(): AIProviderConfig | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AIProviderConfig;
    const ttl = parsed.configured ? CONFIG_TTL_MS : FAILURE_TTL_MS;
    return Number.isFinite(parsed.checkedAt) && Date.now() - parsed.checkedAt < ttl ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(config: AIProviderConfig): void {
  try {
    if (!config.discovered) {
      localStorage.removeItem(CACHE_KEY);
      return;
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(config));
  } catch {
    // Storage disabled — discovery simply repeats next time.
  }
}

/** Discover whether the deployment can safely serve Gemini requests. */
export async function discoverGeminiConfig(force = false): Promise<AIProviderConfig> {
  if (!force) {
    const cached = readCache();
    if (cached) return cached;
    if (inFlight) return inFlight;
  }

  inFlight = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CONFIG_TIMEOUT_MS);
    let config: AIProviderConfig = { ...EMPTY, checkedAt: Date.now() };

    try {
      const res = await fetch('/api/ai/config', {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: controller.signal,
      });
      const payload = (await res.json().catch(() => null)) as
        | { ok?: boolean; gemini?: boolean; model?: string | null; hint?: string; reason?: string; error?: { message?: string } }
        | null;

      if (res.ok && payload && (typeof payload.ok === 'boolean' || typeof payload.gemini === 'boolean')) {
        const configured = Boolean(payload.ok ?? payload.gemini);
        config = {
          configured,
          model: payload.model ?? null,
          discovered: true,
          checkedAt: Date.now(),
          diagnosis: configured
            ? null
            : (payload.hint ?? payload.reason ?? payload.error?.message ?? 'The AI service is not configured on this deployment.'),
        };
      } else {
        config = {
          ...EMPTY,
          discovered: true,
          checkedAt: Date.now(),
          diagnosis:
            payload?.hint ?? payload?.reason ?? payload?.error?.message ??
            (res.status === 404
              ? 'The AI endpoint is missing (404). Check the Vercel API routing and deployment.'
              : `The AI endpoint returned HTTP ${res.status}. Check the Vercel Function logs.`),
        };
      }
    } catch (error) {
      config = {
        ...EMPTY,
        discovered: false,
        checkedAt: Date.now(),
        diagnosis:
          (error as Error)?.name === 'AbortError'
            ? 'The AI configuration check timed out. Retry the connection.'
            : 'The AI endpoint could not be reached. Check the deployment and network connection.',
      };
    } finally {
      clearTimeout(timer);
    }

    writeCache(config);
    return config;
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}
