/**
 * AI fallback for FPS estimation.
 *
 * Wired into `estimateFps` as its `aiFallback` callback. Results are cached in
 * `ai_fps_estimates` so a (GPU, game, resolution, preset) combination is only
 * ever billed once.
 */
import type { BenchmarkRow, FpsAiFallback, Resolution } from '@/lib/performance/types';
import { geminiClient } from './geminiService';
import { isSupabaseConfigured, supabase } from './supabaseClient';
import { FPS_RESPONSE_SCHEMA, fpsSystemInstruction, fpsUserPrompt } from './prompts/perfEstimator';

interface EstimateResponse {
  estimates: Array<{ gameTitle: string; resolution: string; fpsAvg: number }>;
}

async function readCache(gpuModel: string, resolution: Resolution): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!supabase || !isSupabaseConfigured) return map;

  const { data } = await supabase
    .from('ai_fps_estimates')
    .select('game_title,fps_avg')
    .eq('gpu_model', gpuModel)
    .eq('resolution', resolution);

  for (const row of data ?? []) {
    map.set(row.game_title, row.fps_avg);
  }
  return map;
}

async function writeCache(gpuModel: string, rows: BenchmarkRow[]): Promise<void> {
  if (!supabase || !isSupabaseConfigured || rows.length === 0) return;
  await supabase.from('ai_fps_estimates').upsert(
    rows.map((r) => ({
      gpu_model: gpuModel,
      game_title: r.gameTitle,
      resolution: r.resolution,
      quality_preset: r.qualityPreset,
      fps_avg: r.fpsAvg,
      model: 'gemini',
    })),
    { onConflict: 'gpu_model,game_title,resolution,quality_preset' },
  );
}

/** The callback shape `estimateFps` expects. */
export const estimateFpsWithAi: FpsAiFallback = async (request) => {
  const { gpuModel, resolution, preset } = request;
  const games = request.games;
  const cached = await readCache(gpuModel, resolution);
  const missing = games.filter((g) => !cached.has(g));

  const results: BenchmarkRow[] = games
    .filter((g) => cached.has(g))
    .map((gameTitle) => ({
      gpuModel,
      gameTitle,
      resolution,
      qualityPreset: preset,
      fpsAvg: cached.get(gameTitle)!,
    }));

  if (missing.length === 0) return results;

  const response = await geminiClient.structured<EstimateResponse>(
    [{ role: 'user', parts: [{ text: fpsUserPrompt({ gpuModel, games: missing, resolution, preset }) }] }],
    FPS_RESPONSE_SCHEMA as unknown as Record<string, unknown>,
    { model: 'chat', systemInstruction: fpsSystemInstruction(), temperature: 0.2 },
  );

  for (const estimate of response.estimates ?? []) {
    // Ignore anything the model invented (unknown game, wrong resolution, nonsense).
    if (!missing.includes(estimate.gameTitle)) continue;
    if (estimate.resolution !== resolution) continue;
    if (!Number.isFinite(estimate.fpsAvg) || estimate.fpsAvg <= 0) continue;

    results.push({
      gpuModel,
      gameTitle: estimate.gameTitle,
      resolution,
      qualityPreset: preset,
      fpsAvg: Math.round(estimate.fpsAvg),
    });
  }

  await writeCache(gpuModel, results);
  return results;
};
