/**
 * Client-side grounded-search budget.
 *
 * Google's free tier allows roughly 500 grounded searches per day, and the API
 * does not report the remaining count. This counter tracks usage locally so the
 * UI can warn *before* a request is wasted on an exhausted quota.
 *
 * It is a heuristic, not a source of truth: it counts this browser's calls, and
 * resets at local midnight. That is enough for its purpose — telling the user
 * "you have ~40 grounded lookups left today".
 */
const STORAGE_KEY = 'nexus:ai:grounding';

/** Google's documented free daily ceiling (conservative). */
const GROUNDING_DAILY_LIMIT = 500;

/** Warn once the remaining budget drops below this. */
const GROUNDING_WARN_THRESHOLD = 50;

interface GroundingUsage {
  /** Local date key, e.g. `2026-11-01`. */
  day: string;
  count: number;
}

function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function read(): GroundingUsage {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as GroundingUsage | null;
    if (!parsed || parsed.day !== today()) return { day: today(), count: 0 };
    return parsed;
  } catch {
    return { day: today(), count: 0 };
  }
}

function write(usage: GroundingUsage): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(usage));
  } catch {
    // Storage unavailable — the counter becomes best-effort.
  }
}

export interface GroundingStatus {
  used: number;
  remaining: number;
  limit: number;
  /** True when the budget is low enough that the UI should warn. */
  warn: boolean;
  /** True when no grounded request should be attempted. */
  exhausted: boolean;
}

export function getGroundingStatus(): GroundingStatus {
  const usage = read();
  const remaining = Math.max(0, GROUNDING_DAILY_LIMIT - usage.count);
  return {
    used: usage.count,
    remaining,
    limit: GROUNDING_DAILY_LIMIT,
    warn: remaining <= GROUNDING_WARN_THRESHOLD,
    exhausted: remaining === 0,
  };
}

/** Call immediately before a grounded request. */
export function recordGroundedSearch(): GroundingStatus {
  const usage = read();
  write({ day: today(), count: usage.count + 1 });
  return getGroundingStatus();
}
