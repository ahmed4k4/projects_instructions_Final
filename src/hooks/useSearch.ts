import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  searchProductsPage,
  SEARCH_PAGE_SIZE,
  suggestProducts,
  getGroupById,
  getAvailableCategories,
  type SearchFilters,
  type SortKey,
} from '@/services/searchService';

/**
 * Search hooks.
 *
 * Prices change nightly, so results are cached for 5 minutes (the Phase 8
 * requirement) and the previous page is kept while a new query loads — the grid
 * never collapses to a skeleton on every keystroke, which is what makes a search
 * box feel broken.
 *
 * Results come from the retailer snapshot when Supabase is unconfigured or the
 * `retailer_products` table has not been migrated, so the page works on a fresh
 * clone.
 */

const SEARCH_STALE_MS = 5 * 60 * 1000;

/**
 * Paginated search for the results grid.
 *
 * `useInfiniteQuery` rather than a manual page state: it keeps every loaded page
 * cached under the same key, so navigating to /compare and back restores the
 * scroll position instead of refetching from page 1. A filter or sort change
 * produces a new key and therefore a fresh first page — nothing stale survives.
 */
export function useSearch(filters: SearchFilters, sort: SortKey) {
  return useInfiniteQuery({
    queryKey: ['search', filters, sort] as const,
    queryFn: ({ pageParam }) => searchProductsPage(filters, sort, pageParam, SEARCH_PAGE_SIZE),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextOffset,
    staleTime: SEARCH_STALE_MS,
    // Keeps the previous results visible while the next set loads.
    placeholderData: keepPreviousData,
  });
}

/** Autocomplete. The caller debounces; this only caches the result. */
export function useSuggestions(query: string) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: ['search-suggest', trimmed] as const,
    queryFn: () => suggestProducts(trimmed, 6),
    staleTime: SEARCH_STALE_MS,
    enabled: trimmed.length >= 2,
  });
}

/** One group by id, for the /compare deep link. */
export function useProductGroup(groupId: string | null) {
  return useQuery({
    queryKey: ['search-group', groupId] as const,
    queryFn: () => getGroupById(groupId as string),
    staleTime: SEARCH_STALE_MS,
    enabled: Boolean(groupId),
  });
}

/** Categories that actually have listings, for the filter rail. */
export function useSearchCategories() {
  return useQuery({
    queryKey: ['search-categories'] as const,
    queryFn: getAvailableCategories,
    staleTime: SEARCH_STALE_MS,
  });
}
