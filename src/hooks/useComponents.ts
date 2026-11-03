import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { ComponentCategory, PCComponent } from '@/types/components';
import type { ComponentCategoryDb } from '@/types/database';
import { getCompatibilityRules, listComponents } from '@/services/componentsService';
import { isSupabaseConfigured } from '@/services/supabaseClient';
import { sampleComponents } from '@/lib/sampleData';

const componentKeys = {
  all: ['components'] as const,
  byCategory: (category?: ComponentCategory) => ['components', category ?? 'all'] as const,
  rules: ['compatibility-rules'] as const,
};

/**
 * React Query wrappers. They are already wired to Supabase: as soon as the
 * environment variables are present, live rows replace the sample catalogue.
 */
export function useComponents(category?: ComponentCategory): UseQueryResult<PCComponent[]> {
  return useQuery({
    queryKey: componentKeys.byCategory(category),
    queryFn: async () => {
      if (!isSupabaseConfigured) {
        return category ? sampleComponents.filter((c) => c.category === category) : sampleComponents;
      }
      return listComponents(category as ComponentCategoryDb | undefined);
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useCompatibilityRules() {
  return useQuery({
    queryKey: componentKeys.rules,
    queryFn: () => getCompatibilityRules(),
    staleTime: 30 * 60 * 1000,
    enabled: isSupabaseConfigured,
  });
}
