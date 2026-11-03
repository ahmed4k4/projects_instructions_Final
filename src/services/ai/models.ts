/**
 * Model selection separates low-latency chat from multi-step agent work.
 * Smart Builder uses the quality tier (Gemini 3.8 Flash) because it must plan,
 * call tools, validate a complete build and recover from incomplete turns.
 * Project model access and quotas remain provider-controlled. Alternatives are
 * tried for retired/temporarily unavailable models, but not after HTTP 429 because
 * that usually means a quota window is exhausted rather than a broken model.
 */
import type { GeminiModelKey } from '@/types/ai';

/**
 * `chat` is used for short interactive turns; `quality` for agent workflows
 * and analysis where deliberate reasoning is more important than first-token latency.
 */
export const MODEL_CANDIDATES: Record<GeminiModelKey, readonly string[]> = {
  // Google currently identifies 3.5 Flash-Lite as its fastest stable,
  // low-latency high-throughput model. It also supports a 1M input context.
  chat: ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.6-flash'],
  // Gemini 3.8 Flash is Google's stable Flash model designed for agentic
  // workflows and function calling; 3.6 Flash / 3.5 Flash-Lite are fallbacks.
  quality: ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite'],
};

/** The model every fresh workspace starts on. */
const DEFAULT_CHAT_MODEL = 'gemini-3.5-flash-lite';

// v5 clears stale fallback selections; 429s are no longer treated as model failures.
const CACHE_KEY = 'nexus:ai:model:v5';
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
 * Probe candidates in order for model availability. Stop immediately on 429 so
 * "Test connection" does not spend extra requests after quota exhaustion.
 */
export async function probeModels(
  key: GeminiModelKey,
  check: (model: string) => Promise<boolean | 'rate_limited'>,
): Promise<{ modelId: string | null; attempts: ProbeAttempt[]; rateLimited?: boolean }> {
  const attempts: ProbeAttempt[] = [];

  for (const model of MODEL_CANDIDATES[key]) {
    const started = performance.now();
    const result = await withTimeout(check(model), PROBE_TIMEOUT_MS);
    const ok = result === true;
    attempts.push({ model, ok, latencyMs: Math.round(performance.now() - started) });
    if (ok) {
      rememberModel(key, model);
      return { modelId: model, attempts };
    }
    // A quota response applies to the project/model window; probing every
    // alternative immediately only creates more 429s and burns requests.
    if (result === 'rate_limited') return { modelId: null, attempts, rateLimited: true };
  }

  invalidateModel(key);
  return { modelId: null, attempts, rateLimited: false };
}

async function withTimeout(promise: Promise<boolean | 'rate_limited'>, ms: number): Promise<boolean | 'rate_limited'> {
  return Promise.race([
    promise.catch(() => false),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), ms)),
  ]);
}
