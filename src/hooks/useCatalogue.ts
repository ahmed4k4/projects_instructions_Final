import { useQuery } from '@tanstack/react-query';
import type { CompatibilityRule } from '@/lib/compatibility/types';
import type { BenchmarkRow } from '@/lib/performance/types';
import type { Resolution } from '@/lib/performance/types';
import { DEFAULT_COMPATIBILITY_RULES, mergeCompatibilityRules } from '@/lib/compatibility/defaultRules';
import { isSupabaseConfigured, supabase } from '@/services/supabaseClient';

/**
 * Rules used by the builder's live compatibility panel.
 * Falls back to the bundled defaults when the DB is unreachable so the UI never
 * silently claims "compatible".
 */


export async function loadRules(): Promise<CompatibilityRule[]> {
  if (!isSupabaseConfigured || !supabase) return DEFAULT_COMPATIBILITY_RULES;
  try {
    const { data, error } = await supabase.from('compatibility_rules').select('*');
    if (error || !data?.length) return DEFAULT_COMPATIBILITY_RULES;
    const remoteRules: CompatibilityRule[] = data.map((r) => ({
      ruleKey: r.rule_key,
      categoryA: r.category_a,
      categoryB: r.category_b,
      ruleType: r.rule_type,
      specPathA: r.spec_path_a,
      specPathB: r.spec_path_b,
      config: (r.config ?? {}) as Record<string, unknown>,
      message: r.message,
      severity: r.severity,
    }));
    return mergeCompatibilityRules(remoteRules);
  } catch {
    return DEFAULT_COMPATIBILITY_RULES;
  }
}

/** React-Query hook for the rule set (cached for 30 minutes). */
export function useCompatibilityRules() {
  return useQuery({
    queryKey: ['compatibility-rules'] as const,
    queryFn: loadRules,
    staleTime: 30 * 60 * 1000,
  });
}

/* -------------------------------------------------------------------------- */

async function loadBenchmarks(): Promise<BenchmarkRow[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  try {
    const { data, error } = await supabase.from('fps_benchmarks').select('*');
    if (error || !data) return [];
    return data.map((r) => ({
      gpuModel: r.gpu_model,
      gameTitle: r.game_title,
      resolution: r.resolution as Resolution,
      qualityPreset: r.quality_preset,
      fpsAvg: r.fps_avg,
      cpuTestUsed: r.cpu_test_used,
    }));
  } catch {
    return [];
  }
}

export function useBenchmarks() {
  return useQuery({
    queryKey: ['fps-benchmarks'] as const,
    queryFn: loadBenchmarks,
    staleTime: 60 * 60 * 1000,
  });
}

/* -------------------------------------------------------------------------- */

/**
 * REMOVED in Phase 15: `useCatalogue`.
 *
 * It was a second reader of the same data with its own query key, so a page
 * could hold two different catalogues at once — the Smart Builder resolving IDs
 * against one while the Builder showed the other. `hooks/useComponents` is now
 * the single reader (query key `CATALOGUE_KEY`), and every page uses it.
 */
