import type { ComponentCategory, PCComponent } from '@/types/components';

export type RuleType = 'match' | 'min' | 'max' | 'formfactor' | 'custom';
export type Severity = 'error' | 'warning';

/**
 * A row from `public.compatibility_rules`, normalised to camelCase.
 * `specPathA` belongs to `categoryA`'s component, `specPathB` to `categoryB`'s.
 */
export interface CompatibilityRule {
  ruleKey: string;
  categoryA: ComponentCategory;
  categoryB: ComponentCategory;
  ruleType: RuleType;
  specPathA: string;
  specPathB: string;
  /** Rule-specific parameters, e.g. `{ headroomPercent: 15 }`. */
  config: Record<string, unknown>;
  message: string;
  severity: Severity;
}

export interface CompatibilityIssue {
  severity: Severity;
  ruleKey: string;
  message: string;
  componentAId?: string;
  componentBId?: string;
  categoryA?: ComponentCategory;
  categoryB?: ComponentCategory;
}

export interface CompatibilityReport {
  isCompatible: boolean;
  errors: CompatibilityIssue[];
  warnings: CompatibilityIssue[];
  /** Checks that could not be completed because required specs/rules were absent. */
  unverified?: CompatibilityIssue[];
  checkedRules: number;
  /** Rules skipped because one of the two components was not selected. */
  skippedRules: number;
}

export type BuildItems = Partial<Record<ComponentCategory, PCComponent>>;

/** Categories a bootable build needs. Missing ones are surfaced as warnings. */
export const ESSENTIAL_CATEGORIES: ComponentCategory[] = [
  'cpu',
  'motherboard',
  'ram',
  'storage',
  'psu',
  'case',
];

/** Extra inputs a custom rule handler may need (whole build context). */
export interface RuleContext {
  items: BuildItems;
  /** Sum of `powerDrawWatts` across all selected components. */
  totalWatts: number;
}
