/**
 * The one service the catalogue still needs from the old `components` table.
 *
 * Phase 15 moved the Builder, the AI advisor and the Prebuilt page onto real
 * Egyptian retailer listings (`hooks/useComponents` → `lib/retailerCatalogue`).
 * The seeded `public.components` table is no longer what the app builds from, so
 * the two reads that used to live here — `listComponents` and
 * `getComponentById` — were deleted rather than left as dead code: nothing calls
 * them, and an unused export now fails `pnpm audit:all`.
 *
 * `getCompatibilityRules` stays. The rule set is not part of the catalogue: it is
 * data the deterministic engine evaluates, and it lives in the same schema.
 */
import type { CompatibilityRule } from '@/lib/compatibility/types';
import { mergeCompatibilityRules } from '@/lib/compatibility/defaultRules';
import { supabase } from './supabaseClient';

/** The rule set the compatibility engine evaluates. */
export async function getCompatibilityRules(): Promise<CompatibilityRule[]> {
  if (!supabase) return mergeCompatibilityRules([]);

  try {
    const { data, error } = await supabase.from('compatibility_rules').select('*').order('rule_key');
    if (error) {
      console.warn('[Compatibility] Using bundled rules because the database read failed:', error.message);
      return mergeCompatibilityRules([]);
    }
    const remote: CompatibilityRule[] = (data ?? []).map((row) => ({
      ruleKey: row.rule_key,
      categoryA: row.category_a,
      categoryB: row.category_b,
      ruleType: row.rule_type,
      specPathA: row.spec_path_a,
      specPathB: row.spec_path_b,
      config: (row.config ?? {}) as Record<string, unknown>,
      message: row.message,
      severity: row.severity,
    }));
    return mergeCompatibilityRules(remote);
  } catch (error) {
    console.warn('[Compatibility] Using bundled rules after an unexpected database error:', error);
    return mergeCompatibilityRules([]);
  }
}
