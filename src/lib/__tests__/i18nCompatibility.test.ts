import { describe, expect, it } from 'vitest';
import en from '@/i18n/locales/en/builder.json';
import ar from '@/i18n/locales/ar/builder.json';

/**
 * The compatibility engine emits a stable `ruleKey` plus English prose. The UI
 * renders the translated sentence for that key, so every key the engine can
 * produce MUST exist in both locales — otherwise a build warning silently falls
 * back to English on an Arabic page (the bug this table was added to fix).
 *
 * The source of truth for the rule list is `src/hooks/useCatalogue.ts` and the
 * engine's `missing_<category>` warnings.
 */
const ENGINE_RULE_KEYS = [
  'cpu_socket',
  'cpu_ram_type',
  'motherboard_ram_type',
  'ram_capacity_max',
  'gpu_case_length',
  'cooler_case_height',
  'cooler_socket',
  'psu_gpu_power',
  'psu_gpu_connectors',
  'case_motherboard_form',
  'gpu_slot_blocked',
  'm2_slots',
  'missing',
] as const;

describe('compatibility translations', () => {
  const enCompat = (en as { compat: Record<string, string> }).compat;
  const arCompat = (ar as { compat: Record<string, string> }).compat;

  it.each(ENGINE_RULE_KEYS)('has an English and Arabic string for %s', (key) => {
    expect(enCompat[key], `en/builder.json compat.${key}`).toBeTypeOf('string');
    expect(arCompat[key], `ar/builder.json compat.${key}`).toBeTypeOf('string');
    expect(enCompat[key].length).toBeGreaterThan(8);
    // A string with no Arabic letters is an untranslated copy-paste.
    expect(/[\u0600-\u06FF]/.test(arCompat[key])).toBe(true);
  });

  it('keeps the interpolation placeholder in both languages', () => {
    expect(enCompat.missing).toContain('{{category}}');
    expect(arCompat.missing).toContain('{{category}}');
  });
});
