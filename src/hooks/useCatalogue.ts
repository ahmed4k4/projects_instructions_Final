import { useQuery } from '@tanstack/react-query';
import type { ComponentCategory } from '@/types/components';
import type { CompatibilityRule } from '@/lib/compatibility/types';
import type { BenchmarkRow } from '@/lib/performance/types';
import type { Resolution } from '@/lib/performance/types';
import { listComponents } from '@/services/componentsService';
import { isSupabaseConfigured, supabase } from '@/services/supabaseClient';
import { sampleComponents } from '@/lib/sampleData';

/**
 * Rules used by the builder's live compatibility panel.
 * Falls back to the bundled defaults when the DB is unreachable so the UI never
 * silently claims "compatible".
 */
const FALLBACK_RULES: CompatibilityRule[] = [
  {
    ruleKey: 'cpu_motherboard_socket',
    categoryA: 'cpu',
    categoryB: 'motherboard',
    ruleType: 'match',
    specPathA: 'socket',
    specPathB: 'socket',
    config: {},
    message: 'CPU socket must match the motherboard.',
    severity: 'error',
  },
  {
    ruleKey: 'cpu_ram_type',
    categoryA: 'cpu',
    categoryB: 'ram',
    ruleType: 'match',
    specPathA: 'ramType',
    specPathB: 'type',
    config: {},
    message: 'Memory type is not supported by this CPU.',
    severity: 'error',
  },
  {
    ruleKey: 'motherboard_ram_type',
    categoryA: 'motherboard',
    categoryB: 'ram',
    ruleType: 'match',
    specPathA: 'ramType',
    specPathB: 'type',
    config: {},
    message: 'Motherboard does not accept this memory type.',
    severity: 'error',
  },
  {
    ruleKey: 'ram_capacity_max',
    categoryA: 'ram',
    categoryB: 'motherboard',
    ruleType: 'max',
    specPathA: 'capacity',
    specPathB: 'maxRam',
    config: { multiplier: 'sticks' },
    message: 'Total memory exceeds the motherboard limit.',
    severity: 'error',
  },
  {
    ruleKey: 'gpu_case_length',
    categoryA: 'gpu',
    categoryB: 'case',
    ruleType: 'max',
    specPathA: 'length',
    specPathB: 'maxGpuLength',
    config: {},
    message: 'The GPU is longer than the case supports.',
    severity: 'error',
  },
  {
    ruleKey: 'cooling_case_height',
    categoryA: 'cooling',
    categoryB: 'case',
    ruleType: 'max',
    specPathA: 'height',
    specPathB: 'maxCoolerHeight',
    config: { appliesWhen: { type: 'Air' } },
    message: 'The cooler is taller than the case allows.',
    severity: 'error',
  },
  {
    ruleKey: 'cooling_socket_support',
    categoryA: 'cooling',
    categoryB: 'cpu',
    ruleType: 'match',
    specPathA: 'socketSupport',
    specPathB: 'socket',
    config: {},
    message: 'Cooler has no bracket for this socket.',
    severity: 'error',
  },
  {
    ruleKey: 'psu_wattage_min',
    categoryA: 'psu',
    categoryB: 'gpu',
    ruleType: 'min',
    specPathA: 'wattage',
    specPathB: 'recommendedPsu',
    config: { headroomPercent: 15 },
    message: 'The PSU is below the GPU recommendation plus headroom.',
    severity: 'error',
  },
  {
    ruleKey: 'psu_gpu_connectors',
    categoryA: 'psu',
    categoryB: 'gpu',
    ruleType: 'custom',
    specPathA: 'connectors',
    specPathB: 'powerConnectors',
    config: {},
    message: 'The PSU lacks the GPU power connectors.',
    severity: 'warning',
  },
  {
    ruleKey: 'case_motherboard_formfactor',
    categoryA: 'case',
    categoryB: 'motherboard',
    ruleType: 'formfactor',
    specPathA: 'formFactorSupport',
    specPathB: 'formFactor',
    config: {},
    message: 'Case does not support this board size.',
    severity: 'error',
  },
  {
    ruleKey: 'motherboard_case_pcie',
    categoryA: 'motherboard',
    categoryB: 'case',
    ruleType: 'custom',
    specPathA: 'pcie',
    specPathB: 'maxGpuLength',
    config: {},
    message: 'The GPU may block an expansion slot.',
    severity: 'warning',
  },
  {
    ruleKey: 'storage_motherboard_interface',
    categoryA: 'storage',
    categoryB: 'motherboard',
    ruleType: 'custom',
    specPathA: 'interface',
    specPathB: 'm2Slots',
    config: {},
    message: 'All M.2 slots are occupied.',
    severity: 'warning',
  },
];

export async function loadRules(): Promise<CompatibilityRule[]> {
  if (!isSupabaseConfigured || !supabase) return FALLBACK_RULES;
  try {
    const { data, error } = await supabase.from('compatibility_rules').select('*');
    if (error || !data?.length) return FALLBACK_RULES;
    return data.map((r) => ({
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
  } catch {
    return FALLBACK_RULES;
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

/** Full catalogue for client-side scoring/diffing (32 rows — cheap to hold). */
async function loadCatalogue(): Promise<import('@/types/components').PCComponent[]> {
  try {
    const rows = isSupabaseConfigured ? await listComponents() : sampleComponents;
    return rows.length ? rows : sampleComponents;
  } catch {
    return sampleComponents;
  }
}

export function useCatalogue() {
  return useQuery({
    queryKey: ['catalogue'] as const,
    queryFn: loadCatalogue,
    staleTime: 10 * 60 * 1000,
  });
}

/** Count of active components per category, for the builder sidebar badges. */
export function useCategoryCounts(): Partial<Record<ComponentCategory, number>> {
  const { data } = useCatalogue();
  const counts: Partial<Record<ComponentCategory, number>> = {};
  for (const component of data ?? []) {
    counts[component.category] = (counts[component.category] ?? 0) + 1;
  }
  return counts;
}
