import { useTranslation } from 'react-i18next';
import { ArrowUpRight, Check, LineChart, Store, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RetailerLogo } from './RetailerLogo';
import { cn, formatCurrency } from '@/lib/utils';
import { RETAILERS, type RetailerOffer } from '@/services/retailers/types';
import type { ProductGroup } from '@/services/searchService';

/**
 * Side-by-side price table.
 *
 * A real `<table>`: it is the right semantics for tabular data, and it is what
 * screen readers and copy/paste expect. On narrow screens the table scrolls
 * horizontally inside its own container rather than forcing the page wide.
 *
 * Direction: the table flips with the document in RTL (`text-start`, logical
 * borders), and the numeric columns stay LTR-isolated so prices never reorder.
 */
export function CompareTable({ group }: { group: ProductGroup }) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface/60">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] border-collapse text-sm">
          <caption className="sr-only">{t('compare.title')}</caption>
          <thead>
            <tr className="border-b border-border bg-surface-elevated/60 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              <th scope="col" className="px-3 py-2.5 text-start font-medium">
                {t('compare.retailerCol')}
              </th>
              <th scope="col" className="px-3 py-2.5 text-end font-medium">
                {t('compare.priceCol')}
              </th>
              <th scope="col" className="px-3 py-2.5 text-start font-medium">
                {t('compare.stockCol')}
              </th>
              <th scope="col" className="px-3 py-2.5 text-end font-medium">
                {t('compare.actionCol')}
              </th>
            </tr>
          </thead>
          <tbody>
            {group.offers.map((offer, index) => (
              <OfferRow
                key={offer.id}
                offer={offer}
                isCheapest={index === 0 && offer.stockStatus === 'in_stock'}
                language={language}
              />
            ))}
          </tbody>
        </table>
      </div>

      {group.savingsEgp > 0 ? (
        <p className="flex items-center gap-2 border-t border-border bg-success/5 px-3 py-2.5 text-[11.5px] text-success">
          <Check className="size-3.5 shrink-0" />
          {t('compare.savingsNote', { amount: formatCurrency(group.savingsEgp) })}
        </p>
      ) : (
        <p className="flex items-center gap-2 border-t border-border px-3 py-2.5 text-[11.5px] text-muted-foreground">
          <Store className="size-3.5 shrink-0" />
          {t('compare.singleNote')}
        </p>
      )}
    </div>
  );
}

function OfferRow({
  offer,
  isCheapest,
  language,
}: {
  offer: RetailerOffer;
  isCheapest: boolean;
  language: string;
}) {
  const { t } = useTranslation();
  const meta = RETAILERS[offer.retailerId];
  const outOfStock = offer.stockStatus === 'out_of_stock';
  const discounted = offer.originalPriceEgp !== null && offer.originalPriceEgp > offer.priceEgp;

  return (
    <tr
      className={cn(
        'border-b border-border/60 last:border-b-0 transition-colors',
        isCheapest && 'bg-success/[0.06]',
        outOfStock && 'opacity-65',
      )}
    >
      <td className="px-3 py-3">
        <div className="flex items-center gap-2.5">
          <RetailerLogo retailerId={offer.retailerId} size="md" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="truncate text-xs font-medium">
                {language.startsWith('ar') ? meta?.nameAr : meta?.name}
              </span>
              {isCheapest ? (
                <Badge variant="success" className="py-0 text-[10px]">
                  {t('compare.cheapest')}
                </Badge>
              ) : null}
            </div>
            <p className="mt-0.5 line-clamp-1 text-[10.5px] text-muted-foreground" title={offer.name}>
              {offer.name}
            </p>
          </div>
        </div>
      </td>

      <td className="whitespace-nowrap px-3 py-3 text-end">
        <span className="font-mono text-sm font-semibold tabular-nums" dir="auto">
          {formatCurrency(offer.priceEgp)}
        </span>
        {discounted ? (
          <span className="ms-1.5 font-mono text-[10px] text-muted-foreground line-through" dir="auto">
            {formatCurrency(offer.originalPriceEgp as number)}
          </span>
        ) : null}
      </td>

      <td className="whitespace-nowrap px-3 py-3">
        {outOfStock ? (
          <Badge variant="danger" className="py-0 text-[10px]">
            {t('retail.outOfStock')}
          </Badge>
        ) : (
          <Badge variant="success" className="py-0 text-[10px]">
            {t('builder.specs.inStock')}
          </Badge>
        )}
      </td>

      <td className="px-3 py-3 text-end">
        <Button asChild size="sm" variant={isCheapest ? 'primary' : 'outline'}>
          <a href={offer.productUrl} target="_blank" rel="noopener noreferrer nofollow">
            {outOfStock ? t('retail.visit') : t('retail.buy')}
            <ArrowUpRight className="size-3.5 rtl:-scale-x-100" />
          </a>
        </Button>
      </td>
    </tr>
  );
}

/**
 * Price-history placeholder.
 *
 * There is no historical series yet — the snapshot stores only the latest price.
 * Showing an empty chart axis would imply data that does not exist, so this says
 * plainly what is coming and why it is not here.
 */
export function PriceHistoryPlaceholder() {
  const { t } = useTranslation();

  return (
    <div className="rounded-xl border border-dashed border-border-strong bg-surface/40 p-5">
      <div className="flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary-glow">
          <LineChart className="size-4" />
        </span>
        <div>
          <p className="text-xs font-semibold">{t('compare.historyTitle')}</p>
          <p className="text-[10.5px] text-muted-foreground">{t('compare.historyComingSoon')}</p>
        </div>
      </div>
      {/* Decorative flat line: clearly a placeholder, not measured data. */}
      <div className="relative mt-4 h-16 overflow-hidden rounded-md bg-surface-inset/50">
        <svg
          viewBox="0 0 300 60"
          className="absolute inset-0 size-full"
          aria-hidden
          preserveAspectRatio="none"
        >
          <path
            d="M0 42 L50 38 L100 44 L150 30 L200 34 L250 24 L300 28"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="text-border-strong"
            strokeDasharray="4 4"
          />
        </svg>
      </div>
      <p className="mt-2 flex items-start gap-1.5 text-[10.5px] leading-relaxed text-muted-foreground">
        <TriangleAlert className="mt-0.5 size-3 shrink-0" />
        {t('compare.historyBody')}
      </p>
    </div>
  );
}

export default CompareTable;
