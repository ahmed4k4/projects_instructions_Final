import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { ArrowUpRight, ShoppingCart, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RetailerLogo } from './RetailerLogo';
import { CategoryPlaceholder } from './CategoryPlaceholder';
import { staggerItem } from '@/lib/motion';
import { retailerImageUrl } from '@/lib/retailerImage';
import { cn, formatCurrency } from '@/lib/utils';
import { RETAILERS } from '@/services/retailers/types';
import { isPlaceholderPrice } from '@/services/retailers/aggregator';
import type { ProductGroup } from '@/services/searchService';

/**
 * One comparison unit: a product with its cheapest offer and every retailer
 * carrying it.
 *
 * "Buy" goes to the cheapest **in-stock** store — `group.best` is ranked that way
 * in `searchService`, so the primary action is always the one that can actually
 * be completed.
 */
export function SearchResultCard({ group }: { group: ProductGroup }) {
  const { t } = useTranslation();
  const [imageFailed, setImageFailed] = useState(false);
  const imageUrl = retailerImageUrl(group.imageUrl);
  const best = group.best;
  // A store-side placeholder price (1 EGP) is not a price.
  const priceIsReal = !isPlaceholderPrice(best);
  const extraRetailers = group.retailerIds.length - 1;

  return (
    <motion.article
      variants={staggerItem}
      className="glass-card group flex flex-col overflow-hidden rounded-xl transition-[border-color,box-shadow] duration-300 hover:border-primary/30 hover:shadow-glow-sm"
    >
      {/* Image ---------------------------------------------------------- */}
      {/* Shorter on phones: at 375px a 128px image pushed the price and the Buy
          button below the fold, so the card read as "a picture of a GPU" rather
          than a comparison result. */}
      {/* `shrink-0` keeps the frame a fixed height so every card in a row has
          its price and buttons on the same baseline — with variable image heights
          the "Best price" rows sat at different y positions across the grid. */}
      <div className="relative flex h-24 shrink-0 items-center justify-center overflow-hidden border-b border-border bg-surface-inset/40 p-3 sm:h-32">
        {/* Retailer images are hotlinked from the store CDN; some are blocked.
            A broken <img> leaves an empty box, so a load failure falls back to
            the same placeholder used when there is no image at all. */}
        {imageUrl && !imageFailed ? (
          <img
            src={imageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setImageFailed(true)}
            className="max-h-full max-w-full object-contain transition-transform duration-300 group-hover:scale-[1.04]"
          />
        ) : (
          // Missing or hotlink-blocked images are a normal state, not an error:
          // a category illustration fills the frame so the grid stays even.
          <div className="flex flex-col items-center gap-1.5 text-muted-foreground/40">
            <CategoryPlaceholder category={group.category} className="size-9" />
            <span className="text-[9px] uppercase tracking-[0.16em]">
              {group.category ? t(`builder.categories.${group.category}`) : t('search.noImage')}
            </span>
          </div>
        )}
      </div>

      {/* Body ----------------------------------------------------------- */}
      <div className="flex flex-1 flex-col p-4">
        <h3 className="line-clamp-2 min-h-10 text-sm font-semibold leading-snug" title={group.name}>
          {group.name}
        </h3>

        {/* Savings sits in the text column, not over the product photo: as an
            absolutely-positioned badge it overlapped the image on cards whose
            picture fills the frame.
            `min-h-5` reserves the row even when there is no saving, so cards in
            the same grid row keep their price and buttons on one baseline. */}
        <div className="mt-2 min-h-5">
          {group.savingsEgp > 0 ? (
            <Badge variant="success" className="w-fit gap-1 py-0.5 text-[10px]">
              <TrendingDown className="size-3" />
              {t('search.save', { amount: formatCurrency(group.savingsEgp) })}
            </Badge>
          ) : null}
        </div>

        <div className="mt-2 flex items-center gap-1.5">
          {group.retailerIds.slice(0, 4).map((id) => (
            <RetailerLogo key={id} retailerId={id} size="sm" />
          ))}
          <span className="truncate text-[11px] text-muted-foreground">
            {extraRetailers > 0
              ? t('search.retailersAvailable', { count: group.retailerIds.length })
              : t('search.oneRetailer')}
          </span>
        </div>

        {/* Price ------------------------------------------------------- */}
        <div className="mt-4 flex items-end justify-between gap-2 border-t border-border pt-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              {t('search.bestPrice')}
            </p>
            {/*
             * The stores print `1 EGP` when a real price is withheld. Quoting it
             * would advertise an RTX 5090 for one pound, so the headline becomes
             * an explicit "price unavailable" and the name is not coloured as a
             * good deal.
             */}
            {priceIsReal ? (
              <p className="font-mono text-lg font-semibold tabular-nums text-success" dir="auto">
                {formatCurrency(best.priceEgp)}
              </p>
            ) : (
              <p className="text-sm font-medium text-muted-foreground">{t('search.priceUnavailable')}</p>
            )}
            <p className="truncate text-[10.5px] text-muted-foreground">
              {RETAILERS[best.retailerId]?.name ?? best.retailerId}
            </p>
          </div>

          <div className="flex shrink-0 flex-col items-stretch gap-1.5">
            <Button asChild size="sm" className="min-w-0">
              <a href={best.productUrl} target="_blank" rel="noopener noreferrer nofollow">
                <ShoppingCart className="size-3.5" />
                {t('search.buyNow')}
                <ArrowUpRight className="size-3 rtl:-scale-x-100" />
              </a>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to={`/compare/${encodeURIComponent(group.id)}`}>{t('search.compare')}</Link>
            </Button>
          </div>
        </div>

        {/* No per-card timestamp: the page header reports the refresh time once,
            and it is identical for every card in a run. */}
      </div>
    </motion.article>
  );
}

/** Skeleton shown while the first page of results loads. */
export function SearchResultSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('glass-card flex flex-col overflow-hidden rounded-xl', className)}>
      <div className="h-32 animate-pulse bg-surface-elevated/60" />
      <div className="space-y-2.5 p-4">
        <div className="h-3.5 w-4/5 animate-pulse rounded bg-surface-elevated/70" />
        <div className="h-3.5 w-2/3 animate-pulse rounded bg-surface-elevated/60" />
        <div className="h-4 w-1/3 animate-pulse rounded bg-surface-elevated/70" />
        <div className="mt-3 flex gap-2">
          <div className="h-8 flex-1 animate-pulse rounded-lg bg-surface-elevated/60" />
          <div className="h-8 flex-1 animate-pulse rounded-lg bg-surface-elevated/50" />
        </div>
      </div>
    </div>
  );
}

export default SearchResultCard;
