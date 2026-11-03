import { describe, expect, it } from 'vitest';
import { passesCompatibilityFilter } from '../filter';
import { DEFAULT_COMPATIBILITY_RULES, mergeCompatibilityRules } from '../defaultRules';

describe('passesCompatibilityFilter', () => {
  it('shows every candidate when the filter is disabled', () => {
    for (const status of ['compatible', 'incompatible', 'unverified', 'review'] as const) {
      expect(passesCompatibilityFilter(status, false)).toBe(true);
    }
  });

  it('hides only candidates with a confirmed hard conflict', () => {
    expect(passesCompatibilityFilter('incompatible', true)).toBe(false);
    expect(passesCompatibilityFilter('compatible', true)).toBe(true);
    expect(passesCompatibilityFilter('unverified', true)).toBe(true);
    expect(passesCompatibilityFilter('review', true)).toBe(true);
    expect(passesCompatibilityFilter(undefined, true)).toBe(true);
  });
});

describe('mergeCompatibilityRules', () => {
  it('keeps built-in GPU and PSU safety rules when the database returns a partial set', () => {
    const merged = mergeCompatibilityRules([DEFAULT_COMPATIBILITY_RULES[0]!]);
    const keys = new Set(merged.map((rule) => rule.ruleKey));
    expect(keys.has('gpu_case_length')).toBe(true);
    expect(keys.has('psu_wattage_min')).toBe(true);
    expect(keys.has('psu_gpu_connectors')).toBe(true);
  });

  it('lets a database rule override the matching bundled rule and retains remote extensions', () => {
    const override = { ...DEFAULT_COMPATIBILITY_RULES[0]!, message: 'Remote override' };
    const extra = { ...DEFAULT_COMPATIBILITY_RULES[0]!, ruleKey: 'remote_custom', message: 'Extra rule' };
    const merged = mergeCompatibilityRules([override, extra]);
    expect(merged.find((rule) => rule.ruleKey === override.ruleKey)?.message).toBe('Remote override');
    expect(merged.find((rule) => rule.ruleKey === 'remote_custom')?.message).toBe('Extra rule');
  });
});
