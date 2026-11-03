/**
 * Deterministic FPS estimation + CPU bottleneck detection.
 *
 * ── Base numbers ──────────────────────────────────────────────────────────
 * Looked up from `fps_benchmarks` by GPU model, game and resolution. The GPU
 * model match is a prefix match on `component.model` because the catalogue
 * stores vendor variants ("GeForce RTX 4090", "RTX 4090 Founders Edition").
 *
 * ── CPU bottleneck penalty ────────────────────────────────────────────────
 * When the CPU is materially slower than the GPU, low resolutions become
 * CPU-bound while 4K barely notices. The delta drives an attenuation curve:
 *
 *   delta = gpuPerf − cpuPerf
 *   if delta > 15:
 *     1080p × 0.70   (fully CPU-limited)
 *     1440p × 0.88
 *     4k    × 0.96
 *   else: no penalty
 *
 * Lower resolutions are penalised harder because the GPU has more headroom to
 * spill over when the CPU cannot feed it.
 *
 * ── Fallback ──────────────────────────────────────────────────────────────
 * Unknown GPU/game combinations are delegated to the AI (injected as
 * `FpsAiFallback`, cached by the caller). Everything else stays deterministic:
 * the same catalogue + benchmark rows always yield the same numbers.
 */
import type { BuildItems } from '@/lib/compatibility/types';
import type { BenchmarkRow, FpsAiFallback, FpsEstimate, Resolution } from './types';
import { RESOLUTIONS, TRACKED_GAMES } from './types';

/** Resolution-dependent penalty when the CPU is 15+ points behind the GPU. */
const BOTTLENECK_PENALTY: Record<Resolution, number> = {
  '1080p': 0.7,
  '1440p': 0.88,
  '4k': 0.96,
};

/** A CPU must be this far behind the GPU before it counts as a bottleneck. */
const BOTTLENECK_THRESHOLD = 15;

function normaliseModel(model: string): string {
  return model
    .toLowerCase()
    .replace(/geforce|radeon|founders edition|oc|edition/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Prefix/fuzzy match between a catalogue GPU model and a benchmark's
 * `gpu_model`. "RTX 4090" and "GeForce RTX 4090 Founders Edition" resolve to
 * the same benchmark series.
 */
export function matchGpuModel(componentModel: string, benchmarkModels: string[]): string | null {
  const target = normaliseModel(componentModel);
  if (!target) return null;

  let best: { model: string; score: number } | null = null;

  for (const candidate of benchmarkModels) {
    const other = normaliseModel(candidate);
    if (!other) continue;

    let score = 0;
    if (target === other) score = 1000;
    else if (target.startsWith(other) || other.startsWith(target)) score = 800;
    else {
      // Token overlap, e.g. "rtx 4070 ti super" vs "geforce rtx 4070 ti super"
      const targetTokens = new Set(target.split(' '));
      const otherTokens = other.split(' ');
      const shared = otherTokens.filter((t) => targetTokens.has(t)).length;
      if (shared >= 2) score = shared * 100 - Math.abs(targetTokens.size - otherTokens.length);
    }

    if (score > (best?.score ?? 0)) best = { model: candidate, score };
  }

  return best && best.score >= 200 ? best.model : null;
}

export function cpuPenaltyFactor(
  cpuPerf: number | null,
  gpuPerf: number | null,
  resolution: Resolution,
): number {
  if (cpuPerf === null || gpuPerf === null) return 1;
  const delta = gpuPerf - cpuPerf;
  if (delta <= BOTTLENECK_THRESHOLD) return 1;
  return BOTTLENECK_PENALTY[resolution];
}

export interface EstimateOptions {
  items: BuildItems;
  benchmarks: BenchmarkRow[];
  /** Optional AI fallback for combinations missing from the benchmark table. */
  aiFallback?: FpsAiFallback;
  games?: readonly string[];
  preset?: string;
}

/** Synchronous, deterministic portion — used by default and in tests. */
export function estimateFpsSync(options: EstimateOptions): FpsEstimate {
  const { items, benchmarks, games = TRACKED_GAMES, preset = 'high' } = options;
  const gpu = items.gpu;
  const cpu = items.cpu;

  const fps: FpsEstimate['fps'] = {};
  for (const game of games) fps[game] = {};

  if (!gpu) {
    return {
      fps,
      bottleneck: { side: 'balanced', percent: 0 },
      powerDraw: totalDraw(items),
      usedAiFallback: false,
    };
  }

  const benchmarkModels = Array.from(new Set(benchmarks.map((b) => b.gpuModel)));
  const matchedModel = matchGpuModel(gpu.model, benchmarkModels);

  for (const game of games) {
    for (const resolution of RESOLUTIONS) {
      const row = benchmarks.find(
        (b) =>
          b.gpuModel === matchedModel &&
          b.gameTitle === game &&
          b.resolution === resolution &&
          b.qualityPreset === preset,
      );
      if (!row) continue;

      const factor = cpuPenaltyFactor(
        cpu?.performanceScore ?? null,
        gpu.performanceScore ?? null,
        resolution,
      );
      fps[game]![resolution] = Math.round(row.fpsAvg * factor);
    }
  }

  return {
    fps,
    bottleneck: detectBottleneck(cpu?.performanceScore ?? null, gpu.performanceScore ?? null),
    powerDraw: totalDraw(items),
    usedAiFallback: false,
  };
}

/**
 * Full estimate: deterministic first, AI only for combinations the benchmark
 * table does not cover. The AI branch never overrides measured rows.
 */
export async function estimateFps(options: EstimateOptions): Promise<FpsEstimate> {
  const base = estimateFpsSync(options);
  const { aiFallback, items, games = TRACKED_GAMES, preset = 'high' } = options;
  const gpu = items.gpu;

  if (!aiFallback || !gpu) return base;

  // Find combinations still missing after the deterministic pass.
  const missing: Array<{ game: string; resolution: Resolution }> = [];
  for (const game of games) {
    for (const resolution of RESOLUTIONS) {
      if (!base.fps[game]?.[resolution]) missing.push({ game, resolution });
    }
  }
  if (missing.length === 0) return base;

  const resolutions = Array.from(new Set(missing.map((m) => m.resolution)));
  let usedAiFallback = false;

  for (const resolution of resolutions) {
    const requested = missing.filter((m) => m.resolution === resolution).map((m) => m.game);
    try {
      const rows = await aiFallback({
        gpuModel: gpu.model,
        games: requested,
        resolution,
        preset,
      });

      for (const row of rows) {
        if (!base.fps[row.gameTitle]) continue;
        // Never let an estimate overwrite a measured benchmark.
        if (base.fps[row.gameTitle]![row.resolution]) continue;
        base.fps[row.gameTitle]![row.resolution] = Math.round(row.fpsAvg);
        usedAiFallback = true;
      }
    } catch {
      // Fallback is best-effort: keep whatever the deterministic pass produced.
    }
  }

  return { ...base, usedAiFallback };
}

export function detectBottleneck(cpuPerf: number | null, gpuPerf: number | null): FpsEstimate['bottleneck'] {
  if (cpuPerf === null || gpuPerf === null) return { side: 'balanced', percent: 0 };

  const delta = gpuPerf - cpuPerf;
  if (Math.abs(delta) < 8) return { side: 'balanced', percent: Math.round(Math.abs(delta)) };

  // The weaker side is the limiter; the gap is expressed as a share of it.
  const weaker = Math.min(cpuPerf, gpuPerf);
  const percent = weaker > 0 ? Math.round((Math.abs(delta) / weaker) * 100) : 0;
  return { side: delta > 0 ? 'cpu' : 'gpu', percent };
}

function totalDraw(items: BuildItems): number {
  return Object.values(items).reduce<number>((sum, c) => sum + (c?.powerDrawWatts ?? 0), 0);
}

/** Average FPS across every tracked game at one resolution. */
export function averageFpsAt(estimate: FpsEstimate, resolution: Resolution): number | null {
  const values = Object.values(estimate.fps)
    .map((byRes) => byRes[resolution])
    .filter((v): v is number => typeof v === 'number');
  if (values.length === 0) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}
