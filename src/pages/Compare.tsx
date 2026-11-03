import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { ArrowLeft, PackageSearch, TrendingDown } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GradientMesh } from '@/components/shared/GradientMesh';
import { CompareTable, PriceHistoryPlaceholder } from '@/components/retail/CompareTable';
import { RetailerLogo } from '@/components/retail/RetailerLogo';
import { CategoryIcon } from '@/components/domain/CategoryIcon';
import { useProductGroup } from '@/hooks/useSearch';
import { fadeUp, viewportOnce } from '@/lib/motion';
import { cn, formatCurrency, formatRelativeShort } from '@/lib/utils';
import { RETAILERS } from '@/services/retailers/types';
import { retailerImageUrl } from '@/lib/retailerImage';

/**
 * `/compare/:groupId` — the shareable comparison view.
 *
 * A real route rather than a modal only: people paste these links into chats
 * ("which store has this cheaper?"), and a modal state cannot be linked to.
 * `SearchResultCard` opens this page; the same table is also available inline
 * from `/search` without a navigation.
 */
export default function Compare() {
  const { t } = useTranslation();
  const { groupId } = useParams<{ groupId: string }>();
  const { data: group, isLoading } = useProductGroup(groupId ?? null);
  const [imageFailed, setImageFailed] = useState(false);
  const imageUrl = group ? retailerImageUrl(group.imageUrl) : null;

  // `rankOffers` sorts out-of-stock last, so the first offer is unavailable only
  // when every offer is.
  const bestAvailable = group ? group.best.stockStatus !== 'out_of_stock' : false;

  if (isLoading) {
    return (
      <div className="container py-10">
        <div className="mx-auto max-w-4xl space-y-4">
          <div className="h-8 w-2/3 animate-pulse rounded bg-surface-elevated/60" />
          <div className="h-64 animate-pulse rounded-xl bg-surface-elevated/40" />
        </div>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="relative">
        <GradientMesh intensity="subtle" />
        <div className="container relative py-16">
          <div className="glass-card mx-auto flex max-w-md flex-col items-center gap-3 rounded-xl p-10 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-surface-elevated text-muted-foreground">
              <PackageSearch className="size-5" />
            </span>
            <p className="text-sm font-medium">{t('compare.notFound')}</p>
            <Button asChild variant="outline" size="sm">
              <Link to="/search">
                <ArrowLeft className="rtl:rotate-180" /> {t('compare.backToSearch')}
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <GradientMesh intensity="subtle" />

      <div className="container relative py-6 lg:py-10">
        <PageHeader
          eyebrow={t('compare.title')}
          title={group.name}
          description={t('compare.subtitle', { count: group.offers.length })}
          breadcrumbs={[
            { label: t('nav.workspace'), to: '/' },
            { label: t('nav.search'), to: '/search' },
            { label: t('compare.title') },
          ]}
          actions={
            <Button asChild variant="outline" size="sm">
              <Link to="/search">
                <ArrowLeft className="rtl:rotate-180" /> {t('compare.backToSearch')}
              </Link>
            </Button>
          }
        />

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <motion.div variants={fadeUp} initial="hidden" animate="visible" className="min-w-0 space-y-4">
            {/* Best price banner --------------------------------------- */}
            <div className="glass-card flex flex-wrap items-center justify-between gap-3 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-surface-inset/50 text-muted-foreground">
                  {/* A dead retailer file must degrade to the category icon, not
                      to the browser's broken-image glyph. */}
                  {imageUrl && !imageFailed ? (
                    <img
                      src={imageUrl}
                      alt=""
                      loading="lazy"
                      onError={() => setImageFailed(true)}
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : group.category ? (
                    <CategoryIcon category={group.category} size="md" />
                  ) : (
                    <PackageSearch className="size-5" />
                  )}
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    {bestAvailable ? t('search.bestPrice') : t('search.lowestPrice')}
                  </p>
                  {/* Green only when the price can actually be paid. An
                      unavailable cheapest offer is shown in muted text with an
                      explicit badge, so the headline never promises a price the
                      user cannot buy. */}
                  <p
                    className={cn(
                      'font-mono text-2xl font-semibold tabular-nums',
                      bestAvailable ? 'text-success' : 'text-muted-foreground',
                    )}
                    dir="auto"
                  >
                    {formatCurrency(group.best.priceEgp)}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-muted-foreground">
                      {RETAILERS[group.best.retailerId]?.name ?? group.best.retailerId}
                    </span>
                    {group.best.stockStatus === 'out_of_stock' ? (
                      <Badge variant="danger" className="py-0 text-[10px]">
                        {t('retail.outOfStock')}
                      </Badge>
                    ) : null}
                    <span className="text-[11px] text-muted-foreground">
                      · {t('search.updatedAt', { when: formatRelativeShort(group.newestScrapedAt, t) })}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {group.retailerIds.map((id) => (
                  <RetailerLogo key={id} retailerId={id} size="md" />
                ))}
                {group.savingsEgp > 0 ? (
                  <Badge variant="success" className="gap-1">
                    <TrendingDown className="size-3" />
                    {t('search.save', { amount: formatCurrency(group.savingsEgp) })}
                  </Badge>
                ) : null}
              </div>
            </div>

            <CompareTable group={group} />
          </motion.div>

          <motion.aside
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={viewportOnce}
            className="min-w-0 space-y-4"
          >
            <PriceHistoryPlaceholder />

            <div className="rounded-xl border border-border bg-surface/60 p-4">
              <h2 className="text-xs font-semibold">{t('compare.retailerCol')}</h2>
              <ul className="mt-2 space-y-1.5">
                {group.offers.map((offer) => (
                  <li key={offer.id} className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
                    <RetailerLogo retailerId={offer.retailerId} size="sm" />
                    <span className="min-w-0 flex-1 truncate">
                      {offer.stockStatus === 'out_of_stock'
                        ? t('retail.outOfStock')
                        : t('builder.specs.inStock')}
                    </span>
                    <span className="shrink-0 font-mono tabular-nums" dir="auto">
                      {formatCurrency(offer.priceEgp)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </motion.aside>
        </div>
      </div>
    </div>
  );
}
