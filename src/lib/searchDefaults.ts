import type { ComponentCategory } from '@/types/components';
import type { RetailerId } from '@/services/retailers/types';

/**
 * Price-filter defaults.
 *
 * The seed catalogue and the scraped listings both live in EGP, where a full
 * gaming PC is 40,000–150,000 and a flagship GPU alone can exceed 100,000. The
 * ceiling is deliberately generous: a filter that silently hides the expensive
 * parts is worse than no filter.
 */
export const DEFAULT_PRICE_MIN = 0;
export const DEFAULT_PRICE_MAX = 300_000;

/** Result page size. Cards are expensive (image + 3 offers), so page it. */
export const SEARCH_PAGE_SIZE = 24;

export type { ComponentCategory, RetailerId };
