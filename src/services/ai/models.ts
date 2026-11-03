/**
 * Model selection tuned for low-latency interactive use and resilient fallback.
 * Gemini 3.5 Flash-Lite is the primary low-latency chat model for interactive
 * use and long-context tasks; stronger Flash models are fallback-only.
 * Model availability and quotas remain project/tier dependent, so one fallback
 * is attempted automatically after 404, 429 or 503 responses.
 */
import type { GeminiModelKey } from '@/types/ai';

/**
 * `chat` is used for interactive turns; `quality` for analysis where a few
 * extra seconds are acceptable (Build Doctor).
 */
export const MODEL_CANDIDATES: Record<GeminiModelKey, readonly string[]> = {
  // Google currently identifies 3.5 Flash-Lite as its fastest stable,
  // low-latency high-throughput model. It also supports a 1M input context.
  chat: ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.6-flash'],
  // Keep the same fast model as the first choice for long structured tasks;
  // the provider raises thinking effort to LOW for these tasks.
  quality: ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.5-flash'],
};

/** The model every fresh workspace starts on. */
const DEFAULT_CHAT_MODEL = 'gemini-3.5-flash-lite';

// v2 deliberately invalidates cached 3.8/3.1 selections from older releases.
const CACHE_KEY = 'nexus:ai:model:v3';
const PROBE_TIMEOUT_MS = 8_000;

interface CacheShape {
  chat?: string;
  quality?: string;
}

function readCache(): CacheShape {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') as CacheShape;
    // Never trust a stale model id from an older build or an edited browser cache.
    return {
      chat: cached.chat && MODEL_CANDIDATES.chat.includes(cached.chat) ? cached.chat : undefined,
      quality: cached.quality && MODEL_CANDIDATES.quality.includes(cached.quality) ? cached.quality : undefined,
    };
  } catch {
    return {};
  }
}

function writeCache(next: CacheShape): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(next));
  } catch {
    // Private mode / quota — the cache is an optimisation, never a requirement.
  }
}

export function advanceModel(key: GeminiModelKey, failedModel: string): string {
  const candidates = MODEL_CANDIDATES[key];
  const currentIndex = candidates.indexOf(failedModel);
  const next = candidates[(currentIndex + 1 + candidates.length) % candidates.length] ?? DEFAULT_CHAT_MODEL;
  rememberModel(key, next);
  return next;
}

function invalidateModel(key: GeminiModelKey): void {
  const cache = readCache();
  delete cache[key];
  writeCache(cache);
}

function rememberModel(key: GeminiModelKey, modelId: string): void {
  writeCache({ ...readCache(), [key]: modelId });
}

/**
 * The model to use right now — cached or the fastest known-good.
 * Deliberately synchronous: probing on the hot path burns quota and adds latency.
 */
export function resolveModelSync(key: GeminiModelKey): string {
  return readCache()[key] ?? MODEL_CANDIDATES[key][0] ?? DEFAULT_CHAT_MODEL;
}

export interface ProbeAttempt {
  model: string;
  ok: boolean;
  latencyMs: number;
}

/**
 * Actively probe every candidate in order. Used by "Test connection" and as the
 * recovery path after a 404 (retired model), never during normal chat.
 */
export async function probeModels(
  key: GeminiModelKey,
  check: (model: string) => Promise<boolean>,
): Promise<{ modelId: string | null; attempts: ProbeAttempt[] }> {
  const attempts: ProbeAttempt[] = [];

  for (const model of MODEL_CANDIDATES[key]) {
    const started = performance.now();
    const ok = await withTimeout(check(model), PROBE_TIMEOUT_MS);
    attempts.push({ model, ok, latencyMs: Math.round(performance.now() - started) });
    if (ok) {
      rememberModel(key, model);
      return { modelId: model, attempts };
    }
  }

  invalidateModel(key);
  return { modelId: null, attempts };
}

async function withTimeout(promise: Promise<boolean>, ms: number): Promise<boolean> {
  return Promise.race([
    promise.catch(() => false),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), ms)),
  ]);
}
