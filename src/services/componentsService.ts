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
import type { Database } from '@/types/database';
import { supabase } from './supabaseClient';

type RuleRow = Database['public']['Tables']['compatibility_rules']['Row'];

/** The rule set the compatibility engine evaluates. */
export async function getCompatibilityRules(): Promise<RuleRow[]> {
  if (!supabase) return [];

  const { data, error } = await supabase.from('compatibility_rules').select('*').order('rule_key');
  if (error) throw new Error(`Failed to load compatibility rules: ${error.message}`);
  return data ?? [];
}
