import { useTranslation } from 'react-i18next';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RetailerLogo } from './RetailerLogo';
import { RETAILERS, RETAILER_IDS, type RetailerId } from '@/services/retailers/types';
import { useLiveRetailers } from '@/hooks/useRetailers';
import type { ComponentCategory } from '@/types/components';
import type { SearchFilters } from '@/services/searchService';
import { CategoryIcon } from '@/components/domain/CategoryIcon';
import { formatCurrency, cn } from '@/lib/utils';
import { DEFAULT_PRICE_MAX, DEFAULT_PRICE_MIN } from '@/lib/searchDefaults';

/**
 * Filter rail.
 *
 * Rendered as a sidebar on desktop and a collapsible sheet on mobile — one
 * component, because duplicating it per breakpoint is how the two drift apart.
 *
 * Every control is a native input (`checkbox`, `range`): they are keyboard- and
 * screen-reader-friendly for free, and the mobile hit area comes from the
 * wrapping label, not from a custom drawn control.
 */

export function FilterPanel({
  filters,
  onChange,
  categories,
  brands,
  className,
}: {
  filters: SearchFilters;
  onChange: (next: SearchFilters) => void;
  categories: Array<{ category: ComponentCategory; count: number }>;
  brands: Array<{ brand: string; count: number }>;
  className?: string;
}) {
  const { t } = useTranslation();

  const setCategory = (category: ComponentCategory | null) => onChange({ ...filters, category });

  const toggleRetailer = (id: RetailerId) => {
    const current = filters.retailerIds ?? [];
    const next = current.includes(id) ? current.filter((r) => r !== id) : [...current, id];
    onChange({ ...filters, retailerIds: next.length ? next : undefined });
  };

  const toggleBrand = (brand: string) => {
    const current = filters.brands ?? [];
    const next = current.includes(brand) ? current.filter((b) => b !== brand) : [...current, brand];
    onChange({ ...filters, brands: next.length ? next : undefined });
  };

  const reset = () =>
    onChange({
      query: filters.query,
      category: null,
      retailerIds: undefined,
      brands: undefined,
      inStockOnly: false,
      minPriceEgp: undefined,
      maxPriceEgp: undefined,
    });

  const min = filters.minPriceEgp ?? DEFAULT_PRICE_MIN;
  const max = filters.maxPriceEgp ?? DEFAULT_PRICE_MAX;
  const live = useLiveRetailers();

  return (
    <div className={cn('space-y-6', className)}>
      {/* Category ------------------------------------------------------- */}
      <section>
        <h3 className="mb-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          {t('search.category')}
        </h3>
        <div className="space-y-0.5">
          <FilterRow
            active={!filters.category}
            onClick={() => setCategory(null)}
            label={t('search.allCategories')}
          />
          {categories.map(({ category, count }) => (
            <FilterRow
              key={category}
              active={filters.category === category}
              onClick={() => setCategory(filters.category === category ? null : category)}
              icon={<CategoryIcon category={category} size="sm" />}
              label={t(`builder.categories.${category}`)}
              count={count}
            />
          ))}
        </div>
      </section>

      {/* Brand ---------------------------------------------------------- */}
      <section>
        <h3 className="mb-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          {t('search.brand')}
        </h3>

        {brands.length === 0 ? (
          <p className="px-2 text-[11px] text-muted-foreground">{t('common.loading')}</p>
        ) : (
          <div className="max-h-56 space-y-0.5 overflow-y-auto pe-1">
            {brands.map(({ brand, count }) => {
              const checked = filters.brands?.includes(brand) ?? false;
              return (
                <label
                  key={brand}
                  className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-2 text-xs transition-colors hover:bg-surface-elevated"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleBrand(brand)}
                    className="size-4 shrink-0 accent-primary"
                  />
                  <span className="min-w-0 flex-1 truncate">{brand}</span>
                  {/* The count is the number of listings, so a shopper can tell
                      a major brand from one with a single imported card. */}
                  <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground">{count}</span>
                </label>
              );
            })}
          </div>
        )}
      </section>

      {/* Price ---------------------------------------------------------- */}
      <section>
        <h3 className="mb-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          {t('search.priceRange')}
        </h3>
        <div className="flex items-center gap-2">
          <NumberField
            value={min}
            onChange={(value) => onChange({ ...filters, minPriceEgp: value || undefined })}
            label={t('search.priceRange')}
            placeholder="0"
          />
          <span className="text-xs text-muted-foreground">—</span>
          <NumberField
            value={max}
            onChange={(value) => onChange({ ...filters, maxPriceEgp: value || undefined })}
            label={t('search.priceRange')}
            placeholder="∞"
          />
        </div>
        <p className="mt-1.5 font-mono text-[10.5px] text-muted-foreground" dir="auto">
          {formatCurrency(min)} — {max === DEFAULT_PRICE_MAX ? '∞' : formatCurrency(max)}
        </p>
      </section>

      {/* Retailers ------------------------------------------------------ */}
      <section>
        <h3 className="mb-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          {t('search.retailer')}
        </h3>
         <div className="space-y-0.5">
           {RETAILER_IDS.map((id) => {
            // Live availability is data-driven (Sigma arrives through its own
            // worker feed), so the roster below is authoritative.
            const meta = live.find((r) => r.id === id) ?? RETAILERS[id];
            const checked = filters.retailerIds?.includes(id) ?? false;
            return (
              <label
                key={id}
                className={cn(
                  'flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-2 text-xs transition-colors',
                  'hover:bg-surface-elevated',
                  !meta.live && 'opacity-60',
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleRetailer(id)}
                  disabled={!meta.live}
                  className="size-4 shrink-0 accent-primary"
                />
                <RetailerLogo retailerId={id} size="sm" />
                <span className="min-w-0 flex-1 truncate">{meta.name}</span>
                {!meta.live ? (
                  // "Pending", not "out of stock": the retailer has no data yet,
                  // which is a different fact from having no stock. The title
                  // explains why, so the limitation is visible rather than a
                  // silently disabled checkbox.
                  <span
                    className="shrink-0 rounded border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-[9.5px] font-medium text-warning"
                    title={t('search.sigmaHint')}
                  >
                    {t('search.sigmaPending')}
                  </span>
                ) : null}
              </label>
            );
          })}
        </div>
      </section>

      {/* Stock + reset -------------------------------------------------- */}
      <section className="space-y-2">
        <label className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-2 text-xs hover:bg-surface-elevated">
          <input
            type="checkbox"
            checked={filters.inStockOnly ?? false}
            onChange={(event) => onChange({ ...filters, inStockOnly: event.target.checked })}
            className="size-4 shrink-0 accent-primary"
          />
          {t('search.inStockOnly')}
        </label>

        <Button variant="ghost" size="sm" onClick={reset} className="w-full justify-start">
          <RotateCcw className="size-3.5" /> {t('search.reset')}
        </Button>
      </section>
    </div>
  );
}

function FilterRow({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2 text-start text-xs transition-colors',
        active
          ? 'bg-primary/12 text-primary-glow'
          : 'text-muted-foreground hover:bg-surface-elevated hover:text-foreground',
      )}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined ? (
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{count}</span>
      ) : null}
    </button>
  );
}

function NumberField({
  value,
  onChange,
  label,
  placeholder,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
  placeholder: string;
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      value={value ? value.toLocaleString('en-US') : ''}
      onChange={(event) => {
        const digits = event.target.value.replace(/[^\d]/g, '');
        onChange(digits ? Number(digits) : 0);
      }}
      placeholder={placeholder}
      aria-label={label}
      dir="ltr"
      className="h-11 min-w-0 flex-1 rounded-lg border border-border bg-surface-inset/60 px-2 text-end font-mono text-xs tabular-nums outline-none transition-colors focus:border-primary/60 focus:ring-2 focus:ring-primary/25"
    />
  );
}

export default FilterPanel;
