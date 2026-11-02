import { useTranslation } from 'react-i18next';
import type { CompatibilityIssue } from '@/lib/compatibility/types';

/**
 * Localise a compatibility message.
 *
 * The engine is pure and language-agnostic: it emits a stable `ruleKey` plus the
 * English `message` the rule was authored with. Rendering `issue.message`
 * directly — which the banner did — left every build warning in English on an
 * Arabic page, the largest untranslated surface left in the app.
 *
 * Lookup order:
 *   1. `builder.compat.<ruleKey>` — the rule's sentence, in the UI language
 *   2. `builder.compat.missing` for `missing_<category>`, with the category name
 *   3. the engine's own English text, as a last resort
 */
export function useCompatibilityMessage(): (issue: CompatibilityIssue) => string {
  const { t } = useTranslation();

  return (issue) => {
    if (issue.ruleKey.startsWith('missing_')) {
      const category = issue.ruleKey.replace('missing_', '');
      return t('builder.compat.missing', { category: t(`builder.categories.${category}`) });
    }

    const base = `builder.compat.${issue.ruleKey}`;
    if (!t(base, { defaultValue: '' })) return issue.message;

    // The engine appends a measured detail, e.g. "120 mm (needs 160 mm)".
    // Translate the sentence, keep the numbers in the engine's own format.
    const detail = /\((.*)\)\s*$/.exec(issue.message)?.[1];
    return detail ? `${t(base)} (${detail})` : t(base);
  };
}
