/**
 * i18n bootstrap.
 *
 * ── Why a single namespace ────────────────────────────────────────────────
 * Translation files are split on disk (`common` / `builder` / `ai` / `pages`)
 * for reviewability, but they are MERGED into one runtime namespace.
 *
 * Keys are already fully qualified (`builder.title`, `advisor.title`,
 * `landing.heroLine1`), so a real multi-namespace setup collides: `t('builder.title')`
 * would be parsed as namespace `builder` + key `title`, which does not exist,
 * and the raw key leaks into the UI. Merging removes that whole class of bug —
 * the same mistake was caught on /builder and /ai-advisor during the Phase 3
 * audit.
 *
 * Direction is derived from the language and never stored separately, so
 * `<html dir>` and any wrapper can never disagree.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { setFormatLocale } from '@/lib/utils';

import enCommon from './locales/en/common.json';
import enBuilder from './locales/en/builder.json';
import enAi from './locales/en/ai.json';
import enPages from './locales/en/pages.json';

import arCommon from './locales/ar/common.json';
import arBuilder from './locales/ar/builder.json';
import arAi from './locales/ar/ai.json';
import arPages from './locales/ar/pages.json';

export const SUPPORTED_LANGUAGES = ['en', 'ar'] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/** Files on disk — re-exported so scripts can validate them individually. */
export const LOCALE_FILES = ['common', 'builder', 'ai', 'pages'] as const;
export type LocaleFile = (typeof LOCALE_FILES)[number];

export type Direction = 'ltr' | 'rtl';

export function directionOf(language: string): Direction {
  return language.startsWith('ar') ? 'rtl' : 'ltr';
}

export function isLanguage(value: string | undefined | null): value is AppLanguage {
  return value === 'en' || value === 'ar';
}

/**
 * Merge the four files into one namespace.
 *
 * `builder.json` and `ai.json` are flat (`title`, `advisor`, `smartBuilder`),
 * while `common.json` and `pages.json` are already keyed by domain. Each flat
 * file is scoped under its own filename, which makes every key addressable:
 * `builder.title`, `smartBuilder.save`, `advisor.title`, `landing.heroLine1`.
 *
 * (The `ai.json` file holds several top-level sections, so it merges flat rather
 * than under an `ai.` prefix — no caller uses an `ai.` prefix.)
 */
function mergeNamespace(
  files: Array<{ file: LocaleFile; data: Record<string, unknown> }>,
): Record<string, unknown> {
  return files.reduce<Record<string, unknown>>((acc, { file, data }) => {
    const flat = file === 'common' || file === 'pages' || file === 'ai';
    const scoped: Record<string, unknown> = flat ? data : { [file]: data };

    for (const [key, value] of Object.entries(scoped)) {
      const existing = acc[key];
      if (
        existing &&
        typeof existing === 'object' &&
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value)
      ) {
        acc[key] = mergeNamespace([
          { file: 'common', data: existing as Record<string, unknown> },
          { file: 'common', data: value as Record<string, unknown> },
        ]);
      } else {
        acc[key] = value;
      }
    }
    return acc;
  }, {});
}

export const RESOURCES = {
  en: {
    translation: mergeNamespace([
      { file: 'common', data: enCommon },
      { file: 'builder', data: enBuilder },
      { file: 'ai', data: enAi },
      { file: 'pages', data: enPages },
    ]),
  },
  ar: {
    translation: mergeNamespace([
      { file: 'common', data: arCommon },
      { file: 'builder', data: arBuilder },
      { file: 'ai', data: arAi },
      { file: 'pages', data: arPages },
    ]),
  },
};

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: RESOURCES,
    fallbackLng: 'en',
    supportedLngs: [...SUPPORTED_LANGUAGES],
    load: 'languageOnly',
    ns: ['translation'],
    defaultNS: 'translation',
    interpolation: {
      // React already escapes; double-escaping would show &amp; in the UI.
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'nexus:language',
      caches: ['localStorage'],
    },
    returnNull: false,
  });

/** Apply `<html lang dir>` — the single source of truth for layout direction. */
export function applyDocumentLanguage(language: string): void {
  const dir = directionOf(language);
  document.documentElement.lang = language;
  document.documentElement.dir = dir;
  document.documentElement.dataset.dir = dir;
  // Number/currency formatting must follow the UI language, otherwise Arabic
  // pages show prices as "US$1,800".
  setFormatLocale(language);
}

applyDocumentLanguage(i18n.language || 'en');

i18n.on('languageChanged', (language) => {
  applyDocumentLanguage(language);
});

export default i18n;
