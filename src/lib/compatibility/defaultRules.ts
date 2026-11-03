import type { CompatibilityRule } from './types';

/**
 * Core safety rules shipped with the application. They remain active when the
 * remote table is empty, incomplete, or temporarily unreachable. Database rows
 * with the same ruleKey can override the message/config without removing the
 * rest of the baseline coverage.
 */
export const DEFAULT_COMPATIBILITY_RULES: CompatibilityRule[] = [
  {
    ruleKey: 'cpu_motherboard_socket', categoryA: 'cpu', categoryB: 'motherboard',
    ruleType: 'match', specPathA: 'socket', specPathB: 'socket', config: {},
    message: 'CPU socket must match the motherboard.', severity: 'error',
  },
  {
    ruleKey: 'cpu_ram_type', categoryA: 'cpu', categoryB: 'ram',
    ruleType: 'match', specPathA: 'ramType', specPathB: 'type', config: {},
    message: 'Memory type is not supported by this CPU.', severity: 'error',
  },
  {
    ruleKey: 'motherboard_ram_type', categoryA: 'motherboard', categoryB: 'ram',
    ruleType: 'match', specPathA: 'ramType', specPathB: 'type', config: {},
    message: 'Motherboard does not accept this memory type.', severity: 'error',
  },
  {
    ruleKey: 'ram_capacity_max', categoryA: 'ram', categoryB: 'motherboard',
    ruleType: 'max', specPathA: 'capacity', specPathB: 'maxRam', config: { multiplier: 'sticks' },
    message: 'Total memory exceeds the motherboard limit.', severity: 'error',
  },
  {
    ruleKey: 'gpu_case_length', categoryA: 'gpu', categoryB: 'case',
    ruleType: 'max', specPathA: 'length', specPathB: 'maxGpuLength', config: {},
    message: 'The GPU is longer than the case supports.', severity: 'error',
  },
  {
    ruleKey: 'cooling_case_height', categoryA: 'cooling', categoryB: 'case',
    ruleType: 'max', specPathA: 'height', specPathB: 'maxCoolerHeight',
    config: { appliesWhen: { type: 'Air' } },
    message: 'The cooler is taller than the case allows.', severity: 'error',
  },
  {
    ruleKey: 'cooling_socket_support', categoryA: 'cooling', categoryB: 'cpu',
    ruleType: 'match', specPathA: 'socketSupport', specPathB: 'socket', config: {},
    message: 'Cooler has no bracket for this socket.', severity: 'error',
  },
  {
    ruleKey: 'psu_wattage_min', categoryA: 'psu', categoryB: 'gpu',
    ruleType: 'min', specPathA: 'wattage', specPathB: 'recommendedPsu',
    config: { headroomPercent: 15 },
    message: 'The PSU is below the GPU recommendation plus headroom.', severity: 'error',
  },
  {
    ruleKey: 'psu_gpu_connectors', categoryA: 'psu', categoryB: 'gpu',
    ruleType: 'custom', specPathA: 'connectors', specPathB: 'powerConnectors', config: {},
    message: 'The PSU lacks the GPU power connectors.', severity: 'warning',
  },
  {
    ruleKey: 'case_motherboard_formfactor', categoryA: 'case', categoryB: 'motherboard',
    ruleType: 'formfactor', specPathA: 'formFactorSupport', specPathB: 'formFactor', config: {},
    message: 'Case does not support this board size.', severity: 'error',
  },
  {
    ruleKey: 'motherboard_case_pcie', categoryA: 'motherboard', categoryB: 'case',
    ruleType: 'custom', specPathA: 'pcie', specPathB: 'maxGpuLength', config: {},
    message: 'The GPU may block an expansion slot.', severity: 'warning',
  },
  {
    ruleKey: 'storage_motherboard_interface', categoryA: 'storage', categoryB: 'motherboard',
    ruleType: 'custom', specPathA: 'interface', specPathB: 'm2Slots', config: {},
    message: 'All M.2 slots are occupied.', severity: 'warning',
  },
];

export function mergeCompatibilityRules(databaseRules: readonly CompatibilityRule[] | null | undefined): CompatibilityRule[] {
  const remote = databaseRules ?? [];
  const remoteByKey = new Map(remote.map((rule) => [rule.ruleKey, rule]));
  const merged = DEFAULT_COMPATIBILITY_RULES.map((rule) => remoteByKey.get(rule.ruleKey) ?? rule);
  const defaultKeys = new Set(DEFAULT_COMPATIBILITY_RULES.map((rule) => rule.ruleKey));
  for (const rule of remote) if (!defaultKeys.has(rule.ruleKey)) merged.push(rule);
  return merged;
}
