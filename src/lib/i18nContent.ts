import type { PCComponent } from '@/types/components';

/**
 * Localised catalogue content.
 *
 * `components.name_ar` / `description_ar` (migration 007) are nullable: a row
 * with no Arabic translation must still render, in English. Every read of a
 * localisable field goes through here so the fallback rule lives in one place.
 */

type Localised = Pick<PCComponent, 'name'> &
  Partial<Pick<PCComponent, 'nameAr' | 'description' | 'descriptionAr'>>;

export function localisedName(component: Localised, language: string): string {
  if (language.startsWith('ar')) return component.nameAr?.trim() || component.name;
  return component.name;
}

export function localisedDescription(component: Localised, language: string): string {
  if (language.startsWith('ar'))
    return component.descriptionAr?.trim() || component.description?.trim() || '';
  return component.description?.trim() || '';
}

/** True when the row has an Arabic name (used to grey out "untranslated" notices). */
export function hasArabicName(component: Localised): boolean {
  return Boolean(component.nameAr?.trim());
}
