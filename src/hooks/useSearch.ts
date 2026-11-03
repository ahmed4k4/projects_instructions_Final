import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  searchProductsPage,
  SEARCH_PAGE_SIZE,
  suggestProducts,
  getGroupById,
  getAvailableBrands,
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
 * Numbered-pagination search (Phase 12).
 *
 * Infinite scroll was replaced by pages for two reasons: a shopper comparing
 * prices wants to know how deep the list goes, and `?page=3` is a state they can
 * bookmark or send to someone. The page lives in the URL key, so `keepPreviousData`
 * holds the old grid on screen while the next page loads instead of collapsing
 * to a skeleton.
 */
export function useSearch(filters: SearchFilters, sort: SortKey, page = 1) {
  const offset = Math.max(0, (page - 1) * SEARCH_PAGE_SIZE);

  return useQuery({
    queryKey: ['search', filters, sort, page] as const,
    queryFn: () => searchProductsPage(filters, sort, offset, SEARCH_PAGE_SIZE),
    staleTime: SEARCH_STALE_MS,
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

/** Brands present in the catalogue, for the filter rail. */
export function useSearchBrands() {
  return useQuery({
    queryKey: ['search-brands'] as const,
    queryFn: getAvailableBrands,
    staleTime: SEARCH_STALE_MS,
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
