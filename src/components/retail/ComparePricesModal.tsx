import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUpRight, Check, Clock, Loader2, Store, TriangleAlert, X } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn, formatCurrency, formatDateShort } from '@/lib/utils';
import { RETAILERS, type PriceComparison, type RetailerOffer } from '@/services/retailers/types';
import { RetailerLogo } from './RetailerLogo';

/**
 * Price comparison sheet.
 *
 * Renders as a bottom sheet on mobile and a centred dialog on desktop — one
 * component, because duplicating it per breakpoint is how the two drift apart.
 *
 * Accessibility: focus moves into the sheet on open, Escape closes it, and the
 * background is inert via the backdrop. Nothing here is hover-dependent, so it
 * works on touch.
 */
export function ComparePricesModal({
  open,
  onClose,
  comparison,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  comparison: PriceComparison | null;
  loading?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);

    // Lock background scroll while the sheet is open.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  const language = i18n.language;

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} aria-hidden />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={{ y: 40, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 24, opacity: 0, scale: 0.99 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="glass-deep relative flex max-h-[88dvh] w-full flex-col rounded-t-2xl border border-border-strong sm:max-w-lg sm:rounded-2xl"
          >
            {/* Drag handle — visual affordance on mobile only. */}
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-border-strong sm:hidden" />

            <header className="flex items-start justify-between gap-3 px-5 pb-3 pt-4">
              <div className="min-w-0">
                <h2 id={titleId} className="text-sm font-semibold">
                  {t('retail.compareTitle')}
                </h2>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                  {comparison?.componentName ?? t('common.loading')}
                </p>
              </div>
              <Button
                ref={closeRef}
                variant="ghost"
                size="icon-sm"
                onClick={onClose}
                aria-label={t('common.close')}
                className="min-h-11 min-w-11 shrink-0"
              >
                <X />
              </Button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  {t('retail.loading')}
                </div>
              ) : !comparison || comparison.offers.length === 0 ? (
                <EmptyComparison />
              ) : (
                <>
                  {comparison.savingsEgp > 0 ? (
                    <div className="mb-3 flex items-center gap-2 rounded-lg border border-success/25 bg-success/10 px-3 py-2 text-xs text-success">
                      <Check className="size-3.5 shrink-0" />
                      {t('retail.saveAmount', { amount: formatCurrency(comparison.savingsEgp) })}
                    </div>
                  ) : null}

                  <ul className="space-y-2">
                    {comparison.offers.map((offer, index) => (
                      <OfferRow key={offer.id} offer={offer} isBest={index === 0} language={language} />
                    ))}
                  </ul>

                  {comparison.lastScrapedAt ? (
                    <p className="mt-4 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Clock className="size-3" />
                      {t('retail.updatedAt', { date: formatDateShort(comparison.lastScrapedAt, language) })}
                    </p>
                  ) : null}
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function OfferRow({ offer, isBest, language }: { offer: RetailerOffer; isBest: boolean; language: string }) {
  const { t } = useTranslation();
  const meta = RETAILERS[offer.retailerId];
  const outOfStock = offer.stockStatus === 'out_of_stock';
  const discounted = offer.originalPriceEgp !== null && offer.originalPriceEgp > offer.priceEgp;

  return (
    <li
      className={cn(
        'flex items-center gap-3 rounded-xl border p-3 transition-colors',
        isBest ? 'border-success/35 bg-success/5' : 'border-border bg-surface/50',
        outOfStock && 'opacity-70',
      )}
    >
      <RetailerLogo retailerId={offer.retailerId} size="md" />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-xs font-medium">
            {language.startsWith('ar') ? meta.nameAr : meta.name}
          </span>
          {isBest && !outOfStock ? (
            <Badge variant="success" className="py-0 text-[10px]">
              {t('retail.bestPrice')}
            </Badge>
          ) : null}
          {outOfStock ? (
            <Badge variant="danger" className="py-0 text-[10px]">
              {t('retail.outOfStock')}
            </Badge>
          ) : null}
        </div>

        <p className="mt-1 truncate text-[11px] text-muted-foreground" title={offer.name}>
          {offer.name}
        </p>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        {/* `dir=ltr` keeps "EGP 6,799" from reordering inside an RTL row. */}
        <span className="font-mono text-sm font-semibold tabular-nums" dir="auto">
          {formatCurrency(offer.priceEgp)}
        </span>
        {discounted ? (
          <span className="font-mono text-[10px] text-muted-foreground line-through" dir="auto">
            {formatCurrency(offer.originalPriceEgp as number)}
          </span>
        ) : null}
        <Button
          asChild
          size="sm"
          variant={isBest && !outOfStock ? 'primary' : 'outline'}
          className="mt-0.5 min-h-9"
        >
          <a href={offer.productUrl} target="_blank" rel="noopener noreferrer nofollow">
            {outOfStock ? t('retail.visit') : t('retail.buy')}
            <ArrowUpRight className="rtl:-scale-x-100" />
          </a>
        </Button>
      </div>
    </li>
  );
}

function EmptyComparison() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-surface-elevated text-muted-foreground">
        <Store className="size-5" />
      </span>
      <div>
        <p className="text-sm font-medium">{t('retail.noneTitle')}</p>
        <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
          {t('retail.noneBody')}
        </p>
      </div>
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <TriangleAlert className="size-3" />
        {t('retail.noneHint')}
      </p>
    </div>
  );
}

export default ComparePricesModal;
