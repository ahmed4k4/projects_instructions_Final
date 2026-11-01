import { useMemo, useState } from 'react';
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
import { useComponents } from '@/hooks/useComponents';
import { useCompatibilityRules, useCategoryCounts } from '@/hooks/useCatalogue';
import { evaluateCompatibility } from '@/lib/compatibility/engine';
import { useBuildStore } from '@/store/useBuildStore';

export default function Builder() {
  const { t } = useTranslation();
  const [category, setCategory] = useState<ComponentCategory>('cpu');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'price-asc' | 'price-desc' | 'score'>('score');

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

  // Re-evaluated on every add/remove — pure and cheap, so no debouncing needed.
  const liveReport = useMemo(() => evaluateCompatibility(items, rules), [items, rules]);

  const visible = useMemo(() => {
    const filtered = (components ?? []).filter((component) =>
      `${component.brand} ${component.name}`.toLowerCase().includes(query.trim().toLowerCase()),
    );
    return [...filtered].sort((a, b) => {
      if (sort === 'price-asc') return a.price - b.price;
      if (sort === 'price-desc') return b.price - a.price;
      return (b.performanceScore ?? 0) - (a.performanceScore ?? 0);
    });
  }, [components, query, sort]);

  const handleSelect = (component: Parameters<typeof addComponent>[0]) => {
    addComponent(component);
    toast.success(t('builder.added', { name: component.name }), {
      description: t('builder.addedHint', { category: t(`builder.categories.${component.category}`) }),
    });
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
              {/* `dir="ltr"` keeps "$1,800" as one unit; in RTL the symbol
                  otherwise detaches and renders on the far side of the field. */}
              <span className="font-mono text-sm" dir="ltr">$</span>
              <input
                type="number"
                min={0}
                step={50}
                size={7}
                value={budget}
                onChange={(event) => setBudget(Number(event.target.value))}
                aria-label={t('builder.budget')}
                /* Wide enough for "12,500" plus the $ prefix and the spinner gutter;
                   4.5rem clipped anything above four digits. */
                className="w-[6.5rem] min-w-0 bg-transparent text-end font-mono text-sm tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
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
        <aside className="lg:sticky lg:top-24 lg:self-start">
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
            <div className="min-w-0">
              <h2 className="text-lg font-semibold tracking-tight">
                {t(`builder.categories.${category}`)}
              </h2>
              <p className="truncate text-xs text-muted-foreground">
                {t(`builder.categoryDescriptions.${category}`)}
              </p>
            </div>
            <div className="flex w-full shrink-0 items-center gap-2 xl:w-auto">
              <div className="relative min-w-0 flex-1 xl:w-44">
                <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t('builder.filter')}
                  className="h-9 ps-8 text-xs"
                  aria-label={t('builder.filter')}
                />
              </div>
              <Select value={sort} onValueChange={(value) => setSort(value as typeof sort)}>
                <SelectTrigger
                  className="h-9 w-[150px] shrink-0 gap-1.5 px-2.5 text-xs"
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

          <div className="mt-5">
            {isLoading ? (
              <LoadingSkeleton count={4} className="sm:grid-cols-1 xl:grid-cols-2" />
            ) : visible.length === 0 ? (
              <EmptyState
                icon={Search}
                title={t('builder.noMatch')}
                description={t('builder.noMatchHint', {
                  category: t(`builder.categories.${category}`),
                  query,
                })}
                actionLabel={t('builder.resetFilter')}
                onAction={() => setQuery('')}
              />
            ) : (
              <motion.div
                key={category}
                initial="hidden"
                animate="visible"
                className="grid gap-4 sm:grid-cols-2"
              >
                {visible.map((component) => (
                  <ComponentCard
                    key={component.id}
                    component={component}
                    selected={items[category]?.id === component.id}
                    onSelect={handleSelect}
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
