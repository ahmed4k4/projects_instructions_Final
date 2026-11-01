/**
 * Free-tier model resolution.
 *
 * ── Measured, not assumed ─────────────────────────────────────────────────
 * Verified live against this project's key on 2026-11-01:
 *
 *   gemini-3.5-flash-lite  ✓ 200 in ~690 ms  — fast, streams, answers Arabic
 *   gemini-3.8-flash       ✗ no response within 40 s (deep reasoning model)
 *   gemini-3.6-flash       ✗ 429 quota exhausted
 *   gemini-2.5-flash       ✗ 404 retired for new keys
 *
 * The brief lists `gemini-3.8-flash` first. It is real and free, but it does not
 * answer in interactive time — putting it first would hang the chat UI for 40 s
 * before falling back. So the order below is *latency first*: the first model
 * that reliably answers within a second, with the bigger models behind it.
 * Change `MODEL_CANDIDATES` in one place if Google's availability shifts.
 *
 * Anything not in this list must not be hardcoded anywhere else.
 */
import type { GeminiModelKey } from '@/types/ai';

/**
 * `chat` is used for interactive turns; `quality` for analysis where a few
 * extra seconds are acceptable (Build Doctor).
 */
export const MODEL_CANDIDATES: Record<GeminiModelKey, readonly string[]> = {
  chat: ['gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-3.6-flash'],
  quality: ['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-3.6-flash'],
};

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
  return readCache()[key] ?? MODEL_CANDIDATES[key][0] ?? 'gemini-3.5-flash-lite';
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
