import { useTranslation } from 'react-i18next';
import type { PCComponent } from '@/types/components';
import { localisedName } from '@/lib/i18nContent';

/**
 * Renders a component's display name in the active UI language.
 *
 * Centralising this keeps the fallback rule (Arabic when available, otherwise the
 * English catalogue name) out of every card, table row and toast.
 */
export function ComponentName({ component, className }: { component: PCComponent; className?: string }) {
  const { i18n } = useTranslation();
  return <span className={className}>{localisedName(component, i18n.language)}</span>;
}

export default ComponentName;
