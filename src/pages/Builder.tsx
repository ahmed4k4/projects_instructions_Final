import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Check, Search, SlidersHorizontal, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/PageHeader';
import { BuildSummaryPanel } from '@/components/domain/BuildSummaryPanel';
import { CompatibilityBanner } from '@/components/domain/CompatibilityBanner';
import { ComponentCard } from '@/components/domain/ComponentCard';
import { CategoryIcon } from '@/components/domain/CategoryIcon';
import { LoadingSkeleton } from '@/components/shared/LoadingSkeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { USE_CASES } from '@/lib/constants';
import { BUILD_ORDER } from '@/lib/navigation';
import type { ComponentCategory } from '@/types/components';
import type { UseCase } from '@/types/build';
import { cn } from '@/lib/utils';
import { spring } from '@/lib/motion';
import { useComponents, useCategoryCounts } from '@/hooks/useComponents';
import { useCompatibilityRules } from '@/hooks/useCatalogue';
import { evaluateCompatibility } from '@/lib/compatibility/engine';
import { passesCompatibilityFilter } from '@/lib/compatibility/filter';
import { useCompatibilityMessage } from '@/lib/i18nCompatibility';
import { useBuildStore } from '@/store/useBuildStore';
import { summariseOffers } from '@/services/retailers/aggregator';
import { offersFor } from '@/lib/retailerCatalogue';
import { RETAILERS, type PriceComparison, type RetailerId } from '@/services/retailers/types';
import { ComparePricesModal } from '@/components/retail/ComparePricesModal';
import { Pagination } from '@/components/retail/Pagination';
import type { PCComponent } from '@/types/components';

const COMPONENTS_PER_PAGE = 12;

export default function Builder() {
  const { t } = useTranslation();
  const localiseCompatibility = useCompatibilityMessage();
  const [category, setCategory] = useState<ComponentCategory>('cpu');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'price-asc' | 'price-desc' | 'score'>('score');
  const [onlyCompatible, setOnlyCompatible] = useState(false);
  const [page, setPage] = useState(1);

  const { data: components, isLoading } = useComponents(category);
  const items = useBuildStore((state) => state.items);
  const addComponent = useBuildStore((state) => state.addComponent);
  const removeComponent = useBuildStore((state) => state.removeComponent);
  const budget = useBuildStore((state) => state.budget);
  const setBudget = useBuildStore((state) => state.setBudget);
  const useCase = useBuildStore((state) => state.useCase);
  const setUseCase = useBuildStore((state) => state.setUseCase);

  const { data: rules = [] } = useCompatibilityRules();
  const categoryCounts = useCategoryCounts();

  // The catalogue is the retailer listings themselves, so `storeLinks` and the
  // per-card price are the same numbers: no second query, no chance of the card
  // and the comparison modal disagreeing.

  /**
   * "Compare (N stores)" for the chosen card.
   *
   * One component is one SKU sold by every shop that lists it, so the offers are
   * already on the component (`storeLinks`); the modal opens instantly instead
   * of waiting for a per-card request.
   */
  const [compareFor, setCompareFor] = useState<PCComponent | null>(null);

  const comparison = useMemo<PriceComparison | null>(() => {
    if (!compareFor) return null;
    return summariseOffers(compareFor.id, compareFor.name, offersFor(compareFor));
  }, [compareFor]);

  // Re-evaluated on every add/remove — pure and cheap, so no debouncing needed.
  const liveReport = useMemo(() => evaluateCompatibility(items, rules), [items, rules]);

  /**
   * Sorted so the default view leads with what is buyable: an out-of-stock part
   * at a great price is not a recommendation.
   */
  const compatibilityById = useMemo(() => {
    const statuses = new Map<string, 'compatible' | 'incompatible' | 'unverified' | 'review'>();
    for (const component of components ?? []) {
      // Assess a candidate as if it replaced the current part in this slot.
      const candidateItems = { ...items, [category]: component };
      // Only evaluate rules that compare this candidate with parts already
      // selected in the build. Rules waiting for a missing counterpart cannot
      // prove compatibility and must not produce a green badge.
      const pairedRules = rules.filter((rule) => {
        if (rule.categoryA === category) return Boolean(candidateItems[rule.categoryB]);
        if (rule.categoryB === category) return Boolean(candidateItems[rule.categoryA]);
        return false;
      });
      const report = evaluateCompatibility(candidateItems, pairedRules);
      const cannotVerify =
        pairedRules.length === 0 ||
        report.checkedRules === 0 ||
        (report.unverified?.length ?? 0) > 0;
      const hasReviewWarning = report.warnings.some((issue) => !issue.ruleKey.startsWith('missing_'));
      statuses.set(
        component.id,
        report.errors.length > 0
          ? 'incompatible'
          : hasReviewWarning
            ? 'review'
            : cannotVerify
              ? 'unverified'
              : 'compatible',
      );
    }
    return statuses;
  }, [components, items, category, rules]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = (components ?? []).filter((component) =>
      `${component.brand} ${component.name}`.toLowerCase().includes(needle),
    ).filter((component) => {
      // Hide only proven hard conflicts. If rules or counterpart parts are not
      // available yet, keep the candidate visible with its neutral
      // `unverified` badge; otherwise GPU/PSU categories with no selected peer
      // disappear from the entire list when the toggle is enabled.
      const status = compatibilityById.get(component.id);
      return passesCompatibilityFilter(status, onlyCompatible);
    });
    return [...filtered].sort((a, b) => {
      const stockRank = { in_stock: 0, limited: 1, unknown: 2, out_of_stock: 3 } as const;
      if (a.stockStatus !== b.stockStatus) return stockRank[a.stockStatus] - stockRank[b.stockStatus];
      if (sort === 'price-asc') return a.price - b.price;
      if (sort === 'price-desc') return b.price - a.price;
      return (b.performanceScore ?? 0) - (a.performanceScore ?? 0);
    });
  }, [components, query, sort, onlyCompatible, compatibilityById]);

  const totalPages = Math.max(1, Math.ceil(visible.length / COMPONENTS_PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = useMemo(
    () => visible.slice((currentPage - 1) * COMPONENTS_PER_PAGE, currentPage * COMPONENTS_PER_PAGE),
    [visible, currentPage],
  );

  useEffect(() => {
    setPage(1);
  }, [category, query, sort, onlyCompatible, items]);

  const handleSelect = (component: Parameters<typeof addComponent>[0]) => {
    const nextItems = { ...items, [component.category]: component };
    const pairedRules = rules.filter((rule) => {
      if (rule.categoryA === component.category) return Boolean(nextItems[rule.categoryB]);
      if (rule.categoryB === component.category) return Boolean(nextItems[rule.categoryA]);
      return false;
    });
    const report = evaluateCompatibility(nextItems, pairedRules);
    const categoryName = t(`builder.categories.${component.category}`);

    if (report.errors.length > 0) {
      toast.error(t('builder.selection.incompatible', { name: component.name }), {
        description: localiseCompatibility(report.errors[0]!),
      });
      return;
    }

    addComponent(component);
    const unverified = report.unverified?.[0];
    const warning = report.warnings.find((issue) => !issue.ruleKey.startsWith('missing_'));
    if (unverified || pairedRules.length === 0 || report.checkedRules === 0) {
      toast.warning(t('builder.selection.unverified', { name: component.name }), {
        description: unverified
          ? localiseCompatibility(unverified)
          : t('builder.selection.waitingForParts'),
      });
    } else if (warning) {
      toast.warning(t('builder.selection.review', { name: component.name }), {
        description: localiseCompatibility(warning),
      });
    } else {
      toast.success(t('builder.selection.compatible', { name: component.name }), {
        description: t('builder.addedHint', { category: categoryName }),
      });
    }
  };

  return (
    <div className="container py-8 lg:py-10">
      <PageHeader
        eyebrow={t('nav.builder')}
        title={t('builder.title')}
        description={t('builder.description')}
        breadcrumbs={[{ label: t('nav.workspace'), to: '/' }, { label: t('nav.builder') }]}
        actions={
          <>
            <div className="flex shrink-0 items-center gap-2 rounded-lg border border-border bg-surface/60 px-3 py-1.5">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {t('builder.budget')}
              </span>
              {/* `dir="ltr"` keeps "EGP 1,800" as one unit; in RTL the code would
                  otherwise detach and render on the far side of the field. */}
              <span className="font-mono text-[11px] text-muted-foreground" dir="ltr">
                EGP
              </span>
              {/*
               * `type="text"` + inputMode="numeric", not `type="number"`.
               * A number input renders its own digits, and the browser picks the
               * numbering system from the page language: an English UI on an
               * Arabic-locale browser showed `١٬٨٠٠`. Formatting it ourselves
               * keeps Western digits consistent with every other price.
               */}
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                size={7}
                value={budget.toLocaleString('en-US')}
                onChange={(event) => {
                  const digits = event.target.value.replace(/[^\d]/g, '');
                  setBudget(digits ? Number(digits) : 0);
                }}
                aria-label={t('builder.budget')}
                /* Wide enough for "12,500" plus the currency code. */
                className="h-11 w-[5.5rem] min-w-0 bg-transparent text-end font-mono text-sm tabular-nums outline-none sm:h-auto sm:w-[6.5rem]"
                dir="ltr"
              />
            </div>
            <Select value={useCase} onValueChange={(value) => setUseCase(value as UseCase)}>
              <SelectTrigger className="w-44 shrink-0" aria-label={t('builder.useCaseLabel')}>
                <SelectValue placeholder={t('builder.useCaseLabel')} />
              </SelectTrigger>
              <SelectContent>
                {USE_CASES.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {t(`builder.useCases.${item.id}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        }
      />

      <CompatibilityBanner report={liveReport} className="mt-6" />

      <div className="mt-8 grid gap-6 lg:grid-cols-[232px_minmax(0,1fr)] xl:grid-cols-[232px_minmax(0,1fr)_340px]">
        {/* -------------------------------------------------------------- */}
        {/* Category rail                                                  */}
        {/* -------------------------------------------------------------- */}
        {/*
         * `min-w-0` is load-bearing. This rail is a horizontal scroller on
         * mobile; as a grid child its default `min-width: auto` let the scroller's
         * full 8-item intrinsic width (≈1386px) push the whole page wider than a
         * 375px viewport. The same applies to the component column below.
         */}
        <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <div className="flex gap-1.5 overflow-x-auto pb-2 no-scrollbar lg:flex-col lg:overflow-visible lg:pb-0">
            {BUILD_ORDER.map((id) => {
              const selected = Boolean(items[id]);
              const active = category === id;
              const available = categoryCounts[id] ?? 0;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setCategory(id)}
                  className={cn(
                    'relative flex min-w-[168px] shrink-0 items-center gap-2.5 rounded-lg border px-2.5 py-2 text-start transition-colors lg:min-w-0',
                    active
                      ? 'border-primary/25 text-foreground'
                      : 'border-transparent text-muted-foreground hover:bg-surface hover:text-foreground',
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="builder-category-indicator"
                      className="absolute inset-0 rounded-lg border border-primary/25 bg-primary/10"
                      transition={spring}
                    />
                  )}
                  <CategoryIcon category={id} size="sm" className="relative" />
                  <span className="relative min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium">
                      {t(`builder.categories.${id}`)}
                    </span>
                    <span className="block truncate text-[10.5px] text-muted-foreground">
                      {items[id] ? items[id]?.brand : t('builder.available', { count: available })}
                    </span>
                  </span>
                  <span className="relative">
                    {selected ? (
                      <Check className="size-3.5 text-success" />
                    ) : (
                      <span className="block size-1.5 rounded-full bg-border-strong" />
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* -------------------------------------------------------------- */}
        {/* Component grid                                                 */}
        {/* -------------------------------------------------------------- */}
        <section aria-live="polite">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            {/*
             * The heading keeps a FLOOR, the controls yield.
             *
             * `min-w-0` alone let the search + sort block claim its full intrinsic
             * width and the heading collapse to "C…" (visible in the phase 16
             * screenshot). `xl:min-w-[12rem]` gives the title enough room to stay
             * readable; `shrink` on the control group lets IT give way instead.
             */}
            <div className="min-w-0 xl:min-w-[12rem]">
              <h2 className="truncate text-lg font-semibold tracking-tight">
                {t(`builder.categories.${category}`)}
              </h2>
              <p className="truncate text-xs text-muted-foreground">
                {t(`builder.categoryDescriptions.${category}`)}
              </p>
            </div>
            <div className="flex w-full min-w-0 shrink items-center gap-2 xl:w-auto">
              <div className="relative min-w-0 flex-1 xl:w-44">
                <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t('builder.filter')}
                  className="h-9 min-h-11 ps-8 text-xs sm:min-h-9"
                  aria-label={t('builder.filter')}
                />
              </div>
              <Select value={sort} onValueChange={(value) => setSort(value as typeof sort)}>
                <SelectTrigger
                  className="h-9 min-h-11 w-[150px] shrink-0 gap-1.5 px-2.5 text-xs sm:min-h-9"
                  aria-label={t('builder.sort.label')}
                >
                  <SlidersHorizontal className="size-3.5 shrink-0" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="score">{t('builder.sort.score')}</SelectItem>
                  <SelectItem value="price-asc">{t('builder.sort.priceAsc')}</SelectItem>
                  <SelectItem value="price-desc">{t('builder.sort.priceDesc')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-surface/50 px-3 py-2.5 text-xs transition-colors hover:border-primary/30">
            <input
              type="checkbox"
              checked={onlyCompatible}
              onChange={(event) => setOnlyCompatible(event.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-primary"
            />
            <span className="min-w-0">
              <span className="block font-medium text-foreground">{t('builder.onlyCompatible')}</span>
              <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
                {t('builder.onlyCompatibleHint')}
              </span>
            </span>
          </label>

          <div className="mt-5">
            {isLoading ? (
              <LoadingSkeleton count={4} className="sm:grid-cols-1 xl:grid-cols-2" />
            ) : visible.length === 0 ? (
              <EmptyState
                icon={Search}
                title={onlyCompatible ? t('builder.noCompatibleMatch') : t('builder.noMatch')}
                description={onlyCompatible
                  ? t('builder.noCompatibleMatchHint')
                  : t('builder.noMatchHint', {
                      category: t(`builder.categories.${category}`),
                      query,
                    })}
                actionLabel={t('builder.resetFilter')}
                onAction={() => {
                  setQuery('');
                  setOnlyCompatible(false);
                }}
              />
            ) : (
              <motion.div
                key={category}
                initial="hidden"
                animate="visible"
                className="grid gap-4 sm:grid-cols-2"
              >
                {pageItems.map((component) => (
                  <ComponentCard
                    key={component.id}
                    component={component}
                    selected={items[category]?.id === component.id}
                    compatibilityStatus={compatibilityById.get(component.id) ?? 'unverified'}
                    onSelect={handleSelect}
                    livePrice={
                      // The card's price and the modal's "best" are the same
                      // offer, so the badge is read from the component itself.
                      component.storeLinks.length
                        ? {
                            bestPriceEgp: component.price,
                            retailerId:
                              (Object.keys(RETAILERS) as RetailerId[]).find(
                                (id) => RETAILERS[id].name === component.storeLinks[0]?.store,
                              ) ?? 'elbadr',
                            url: component.storeLinks[0]?.url ?? '',
                            count: component.storeLinks.length,
                          }
                        : null
                    }
                    onCompare={setCompareFor}
                    onRemove={() => {
                      removeComponent(category);
                      toast(t('builder.removed', { name: component.name }), {
                        description: t('builder.removedHint'),
                      });
                    }}
                  />
                ))}
              </motion.div>
            )}
          </div>

          {!isLoading && visible.length > 0 && (
            <Pagination
              page={currentPage}
              totalPages={totalPages}
              firstShown={(currentPage - 1) * COMPONENTS_PER_PAGE + 1}
              lastShown={Math.min(currentPage * COMPONENTS_PER_PAGE, visible.length)}
              total={visible.length}
              onChange={setPage}
              className="mt-7"
            />
          )}

          {items[category] && (
            <p className="mt-4 flex items-center gap-2 text-[11px] text-muted-foreground">
              <Badge variant="success">{t('builder.selected')}</Badge>
              {items[category]?.name}
            </p>
          )}
        </section>

        {/* -------------------------------------------------------------- */}
        {/* Summary (xl: side rail, smaller: below)                        */}
        {/* -------------------------------------------------------------- */}
        <div className="hidden xl:block">
          <BuildSummaryPanel />
        </div>
      </div>

      {/* Mobile / tablet summary */}
      <div className="mt-8 xl:hidden">
        <BuildSummaryPanel compact />
      </div>

      {/* Price comparison — one instance, driven by whichever card asked for it. */}
      <ComparePricesModal
        open={Boolean(compareFor)}
        onClose={() => setCompareFor(null)}
        comparison={comparison}
        loading={false}
      />

      <div className="mt-10 flex flex-col items-start justify-between gap-3 rounded-xl border border-border bg-surface/50 p-5 sm:flex-row sm:items-center">
        <div className="flex items-start gap-3">
          <span className="grid size-9 place-items-center rounded-lg bg-accent/10 text-accent">
            <Sparkles className="size-4" />
          </span>
          <div>
            <p className="text-sm font-medium">{t('builder.aiCta.title')}</p>
            <p className="text-xs text-muted-foreground">{t('builder.aiCta.body')}</p>
          </div>
        </div>
        <Button asChild variant="glass" size="sm">
          <Link to="/builder/ai">{t('builder.aiCta.action')}</Link>
        </Button>
      </div>
    </div>
  );
}
