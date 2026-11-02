import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, ChevronDown, PackageSearch, SlidersHorizontal } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SearchBar } from '@/components/retail/SearchBar';
import { FilterPanel } from '@/components/retail/FilterPanel';
import { SearchResultCard, SearchResultSkeleton } from '@/components/retail/SearchResultCard';
import { GradientMesh } from '@/components/shared/GradientMesh';
import { useSearch, useSearchCategories } from '@/hooks/useSearch';
import { makeStagger } from '@/lib/motion';
import { formatRelativeShort, cn } from '@/lib/utils';
import { RETAILERS } from '@/services/retailers/types';
import { DEFAULT_PRICE_MAX, DEFAULT_PRICE_MIN } from '@/lib/searchDefaults';
import type { SearchFilters, SortKey } from '@/services/searchService';
import type { ComponentCategory } from '@/types/components';
import type { RetailerId } from '@/services/retailers/types';

/**
 * Unified search across every integrated Egyptian retailer.
 *
 * State lives in the URL (`?q=`, `?cat=`, `?sort=`): a search is something people
 * share and go back to, and a filter set that vanishes on refresh is the fastest
 * way to make a search page feel disposable.
 */

const stagger = makeStagger(0.05, 0.04);

const SORTS: SortKey[] = ['price-asc', 'price-desc', 'retailers', 'newest'];

const SORT_LABEL: Record<SortKey, string> = {
  'price-asc': 'search.sortPriceAsc',
  'price-desc': 'search.sortPriceDesc',
  retailers: 'search.sortRetailers',
  newest: 'search.sortNewest',
};

export default function Search() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);

  /* ── URL-backed state ────────────────────────────────────────────────── */
  const query = params.get('q') ?? '';
  const category = (params.get('cat') as ComponentCategory | null) ?? null;
  const sortParam = (params.get('sort') as SortKey | null) ?? 'price-asc';
  const sort: SortKey = SORTS.includes(sortParam) ? sortParam : 'price-asc';
  const inStockOnly = params.get('stock') === '1';
  const retailerParam = params.get('ret');
  const minParam = params.get('min');
  const maxParam = params.get('max');

  const retailerIds = useMemo<RetailerId[] | undefined>(
    () => (retailerParam ? (retailerParam.split(',').filter(Boolean) as RetailerId[]) : undefined),
    [retailerParam],
  );

  const filters: SearchFilters = useMemo(
    () => ({
      query,
      category,
      retailerIds,
      inStockOnly,
      minPriceEgp: minParam ? Number(minParam) : undefined,
      maxPriceEgp: maxParam ? Number(maxParam) : undefined,
    }),
    [query, category, retailerIds, inStockOnly, minParam, maxParam],
  );

  /** Write one key back to the URL without losing the others. */
  const patch = (next: Record<string, string | null>) => {
    const updated = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === '') updated.delete(key);
      else updated.set(key, value);
    }
    setParams(updated, { replace: true });
  };

  /** Filters arrive as an object; diff them into URL params. */
  const applyFilters = (next: SearchFilters) => {
    patch({
      cat: next.category ?? null,
      stock: next.inStockOnly ? '1' : null,
      ret: next.retailerIds?.length ? next.retailerIds.join(',') : null,
      min:
        next.minPriceEgp !== undefined && next.minPriceEgp > DEFAULT_PRICE_MIN
          ? String(next.minPriceEgp)
          : null,
      max:
        next.maxPriceEgp !== undefined && next.maxPriceEgp < DEFAULT_PRICE_MAX
          ? String(next.maxPriceEgp)
          : null,
    });
  };

  const { data, isLoading, isFetching, isError, refetch } = useSearch(filters, sort);
  const { data: categories = [] } = useSearchCategories();

  // Scroll back to the top of the results when the query changes — otherwise a
  // new search can land the user halfway down a long grid.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [query, category, sort]);

  const activeFilterCount =
    (category ? 1 : 0) +
    (retailerIds?.length ?? 0) +
    (inStockOnly ? 1 : 0) +
    (minParam ? 1 : 0) +
    (maxParam ? 1 : 0);

  const groups = data?.groups ?? [];

  return (
    <div className="relative">
      <GradientMesh intensity="subtle" />

      <div className="container relative py-6 lg:py-10">
        <PageHeader
          eyebrow={t('nav.search')}
          title={t('search.title')}
          description={t('search.subtitle')}
          breadcrumbs={[{ label: t('nav.workspace'), to: '/' }, { label: t('nav.search') }]}
        />

        {/* Search bar ---------------------------------------------------- */}
        <div className="mx-auto mt-6 max-w-2xl">
          <SearchBar
            value={query}
            onChange={(next) => patch({ q: next || null })}
            onSubmit={(next) => patch({ q: next || null })}
            autoFocus={!query}
          />

          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              {data ? (
                <>
                  <span>{t('search.results', { count: data.total })}</span>
                  <span aria-hidden>·</span>
                  <span>{t('search.listingCount', { count: data.listingCount })}</span>
                </>
              ) : (
                t('search.search')
              )}
            </span>

            {data?.lastUpdated ? (
              <span>{t('search.updatedAt', { when: formatRelativeShort(data.lastUpdated, t) })}</span>
            ) : null}
          </div>
        </div>

        {/* Sigma notice -------------------------------------------------- */}
        {!RETAILERS.sigma.live ? (
          <p className="mx-auto mt-3 flex max-w-2xl items-start gap-2 rounded-lg border border-warning/25 bg-warning/5 px-3 py-2 text-[11px] leading-relaxed text-warning">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            <span>
              <span className="font-medium">{t('search.sigmaNote')}</span> — {t('search.sigmaHint')}
            </span>
          </p>
        ) : null}

        {/* Filters (mobile trigger) -------------------------------------- */}
        <div className="mt-6 flex items-center gap-2 md:hidden">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFiltersOpen((open) => !open)}
            aria-expanded={filtersOpen}
            className="flex-1 justify-between"
          >
            <span className="flex items-center gap-2">
              <SlidersHorizontal className="size-3.5" />
              {t('search.filters')}
              {activeFilterCount > 0 ? (
                <Badge variant="primary" className="py-0 text-[10px]">
                  {activeFilterCount}
                </Badge>
              ) : null}
            </span>
            <ChevronDown className={cn('size-3.5 transition-transform', filtersOpen && 'rotate-180')} />
          </Button>
          <SortSelect value={sort} onChange={(next) => patch({ sort: next })} />
        </div>

        <AnimatePresence initial={false}>
          {filtersOpen ? (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden md:hidden"
            >
              <FilterPanel
                filters={filters}
                onChange={applyFilters}
                categories={categories}
                className="mt-3 rounded-xl border border-border bg-surface/70 p-4"
              />
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* Body ---------------------------------------------------------- */}
        <div className="mt-6 grid gap-6 md:grid-cols-[220px_minmax(0,1fr)] lg:grid-cols-[240px_minmax(0,1fr)]">
          {/* Desktop filter rail */}
          <aside className="hidden min-w-0 md:block">
            <div className="sticky top-24 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {t('search.filtersTitle')}
                </h2>
                {activeFilterCount > 0 ? (
                  <Badge variant="primary" className="py-0 text-[10px]">
                    {activeFilterCount}
                  </Badge>
                ) : null}
              </div>
              <FilterPanel filters={filters} onChange={applyFilters} categories={categories} />
            </div>
          </aside>

          {/* Results */}
          <section className="min-w-0" aria-live="polite" aria-busy={isFetching}>
            <div className="mb-3 hidden items-center justify-between md:flex">
              <p className="text-xs text-muted-foreground">
                {t('search.results', { count: data?.total ?? 0 })}
              </p>
              <SortSelect value={sort} onChange={(next) => patch({ sort: next })} />
            </div>

            {isError ? (
              <ErrorState onRetry={() => void refetch()} />
            ) : isLoading ? (
              <Grid>
                {Array.from({ length: 6 }, (_, index) => (
                  <SearchResultSkeleton key={index} />
                ))}
              </Grid>
            ) : groups.length === 0 ? (
              <EmptyState
                onReset={() => setParams(new URLSearchParams(query ? { q: query } : {}), { replace: true })}
              />
            ) : (
              <motion.div
                key={`${query}-${category}-${sort}`}
                variants={stagger}
                initial="hidden"
                animate="visible"
                className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
              >
                {groups.map((group) => (
                  <SearchResultCard key={group.id} group={group} />
                ))}
              </motion.div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{children}</div>;
}

function SortSelect({ value, onChange }: { value: SortKey; onChange: (next: SortKey) => void }) {
  const { t } = useTranslation();
  return (
    <label className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface/60 px-2.5 text-[11px] text-muted-foreground md:min-h-9">
      <span className="hidden sm:inline">{t('search.sort')}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as SortKey)}
        aria-label={t('search.sort')}
        className="min-w-0 flex-1 cursor-pointer bg-transparent text-[11px] text-foreground outline-none"
      >
        {SORTS.map((key) => (
          <option key={key} value={key} className="bg-surface text-foreground">
            {t(SORT_LABEL[key])}
          </option>
        ))}
      </select>
    </label>
  );
}

function EmptyState({ onReset }: { onReset: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="glass-card flex flex-col items-center gap-3 rounded-xl px-6 py-14 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-surface-elevated text-muted-foreground">
        <PackageSearch className="size-6" />
      </span>
      <div>
        <p className="text-sm font-semibold">{t('search.emptyTitle')}</p>
        <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
          {t('search.emptyBody')}
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={onReset}>
        {t('search.emptyAction')}
      </Button>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="glass-card flex flex-col items-center gap-3 rounded-xl px-6 py-12 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-danger/10 text-danger">
        <AlertCircle className="size-5" />
      </span>
      <div>
        <p className="text-sm font-semibold">{t('search.errorTitle')}</p>
        <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">{t('search.errorBody')}</p>
      </div>
      <Button variant="outline" size="sm" onClick={onRetry}>
        {t('search.retry')}
      </Button>
    </div>
  );
}
