/**
 * Free-tier model resolution.
 *
 * ── Measured, not assumed ─────────────────────────────────────────────────
 * Probed live against this project's key (scripts/probe-models.mjs):
 *
 *   gemini-3.5-flash-lite  ✓ 200 in ~750-900 ms — streams, tools, Arabic
 *   gemini-flash-lite-latest ✓ 200 in ~890 ms   — rolling alias of the above
 *   gemini-3.6-flash       ✓ 200 in ~975 ms     — answers, more quota-hungry
 *   gemini-3.5-flash       ✗ 429 quota exhausted for this key
 *   gemini-3.8-flash       ✗ 503 high demand    — never usable interactively
 *   gemini-1.5-flash       ✗ 404 retired for API v1beta
 *
 * Phase 6 asked for `gemini-1.5-flash` as the pin. It returns 404 on the current
 * API, so pinning it would break every request. `gemini-3.5-flash-lite` is the
 * working equivalent: it is the model that actually answers with function
 * calling, which is what the pin was for.
 *
 * Change `MODEL_CANDIDATES` in one place if Google's availability shifts.
 */
import type { GeminiModelKey } from '@/types/ai';

/**
 * `chat` is used for interactive turns; `quality` for analysis where a few
 * extra seconds are acceptable (Build Doctor).
 */
export const MODEL_CANDIDATES: Record<GeminiModelKey, readonly string[]> = {
  chat: ['gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.6-flash'],
  quality: ['gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-flash-lite-latest'],
};

/** The model every fresh workspace starts on. */
export const DEFAULT_CHAT_MODEL = 'gemini-3.5-flash-lite';

const CACHE_KEY = 'nexus:ai:model';
const PROBE_TIMEOUT_MS = 20_000;

interface CacheShape {
  chat?: string;
  quality?: string;
}

function readCache(): CacheShape {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') as CacheShape;
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

export function invalidateModel(key: GeminiModelKey): void {
  const cache = readCache();
  delete cache[key];
  writeCache(cache);
}

export function rememberModel(key: GeminiModelKey, modelId: string): void {
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

export function peekModel(key: GeminiModelKey): string | null {
  return readCache()[key] ?? MODEL_CANDIDATES[key][0] ?? null;
}

export function candidatesFor(key: GeminiModelKey): readonly string[] {
  return MODEL_CANDIDATES[key];
}
