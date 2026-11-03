import { Check, Plus, Zap } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { PCComponent } from '@/types/components';
import { cn, formatCurrency, formatDateShort, formatSpecValue, formatWatts } from '@/lib/utils';
import { staggerItem } from '@/lib/motion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ComponentName } from '@/components/shared/ComponentName';
import { RetailerLogo } from '@/components/retail/RetailerLogo';
import { CompatibilityBadge } from '@/components/domain/CompatibilityBadge';
import type { RetailerId } from '@/services/retailers/types';
import { CategoryIcon } from './CategoryIcon';

/**
 * A specification chip is only shown when it HAS a value.
 *
 * The template used to render every slot regardless ("— C / — T", "— GHz
 * boost") because the catalogue was guaranteed to carry complete spec sheets.
 * Retailer listings do not: a title that omits the core count is not a broken
 * product, so the chip is dropped rather than shown as a dash — the card then
 * shows the specs that are actually known instead of three empty boxes.
 */
function specHighlights(component: PCComponent): string[] {
  const s = component.specs;
  const has = (value: unknown) => value !== undefined && value !== null && value !== '';
  const chips: Array<string | null> = [];

  switch (component.category) {
    case 'cpu':
      chips.push(
        has(s.cores) ? `${formatSpecValue(s.cores)}C / ${formatSpecValue(s.threads)}T` : null,
        has(s.boostClock) ? `${formatSpecValue(s.boostClock)} GHz boost` : null,
        has(s.socket) ? formatSpecValue(s.socket) : null,
      );
      break;
    case 'gpu':
      chips.push(
        has(s.vram) ? `${formatSpecValue(s.vram)} GB` : null,
        has(s.tdp) ? `${formatSpecValue(s.tdp)} W` : null,
        has(s.length) ? `${formatSpecValue(s.length)} mm` : null,
      );
      break;
    case 'motherboard':
      chips.push(
        has(s.chipset) ? formatSpecValue(s.chipset) : null,
        has(s.socket) ? formatSpecValue(s.socket) : null,
        has(s.formFactor) ? formatSpecValue(s.formFactor) : null,
      );
      break;
    case 'ram':
      chips.push(
        has(s.capacity) ? `${formatSpecValue(s.capacity)} GB` : null,
        has(s.speed) ? `${formatSpecValue(s.speed)} MT/s` : null,
        has(s.casLatency) ? `CL${formatSpecValue(s.casLatency)}` : null,
      );
      break;
    case 'storage':
      chips.push(
        has(s.capacity) ? `${formatSpecValue(s.capacity)} GB` : null,
        has(s.interface) ? formatSpecValue(s.interface) : null,
      );
      break;
    case 'psu':
      chips.push(
        has(s.wattage) ? `${formatSpecValue(s.wattage)} W` : null,
        has(s.efficiency) ? formatSpecValue(s.efficiency) : null,
        has(s.modular) ? `${formatSpecValue(s.modular)} modular` : null,
      );
      break;
    case 'case':
      chips.push(
        Array.isArray(s.formFactorSupport) ? (s.formFactorSupport as string[]).join(' · ') : null,
        has(s.maxGpuLength) ? `GPU ≤ ${formatSpecValue(s.maxGpuLength)} mm` : null,
      );
      break;
    case 'cooling':
      chips.push(
        has(s.type) ? formatSpecValue(s.type) : null,
        Array.isArray(s.socketSupport) ? (s.socketSupport as string[]).slice(0, 2).join(' · ') : null,
      );
      break;
    default:
      break;
  }

  return chips.filter((chip): chip is string => Boolean(chip && chip.trim() && chip.trim() !== '—'));
}

interface ComponentCardProps {
  component: PCComponent;
  selected?: boolean;
  onSelect: (component: PCComponent) => void;
  onRemove?: (component: PCComponent) => void;
  /** Cheapest live Egyptian retailer offer for this part, when one exists. */
  livePrice?: { bestPriceEgp: number; retailerId: RetailerId; url: string; count: number } | null;
  onCompare?: (component: PCComponent) => void;
  compatibilityStatus?: 'compatible' | 'incompatible' | 'unverified' | 'review';
}

export function ComponentCard({ component, selected, onSelect, onRemove, livePrice, onCompare, compatibilityStatus }: ComponentCardProps) {
  const { t, i18n } = useTranslation();
  const outOfStock = component.stockStatus === 'out_of_stock';
  const stockSnapshot = component.storeLinks.find((link) => link.stockStatus === component.stockStatus && link.stockUpdatedAt)?.stockUpdatedAt
    ?? component.updatedAt;
  const stockDate = stockSnapshot ? formatDateShort(stockSnapshot, i18n.language) : '';

  return (
    <motion.article
      variants={staggerItem}
      layout
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-xl border bg-surface p-5 shadow-card',
        'transition-[border-color,box-shadow,transform] duration-300 ease-nexus',
        'hover:-translate-y-1 hover:border-primary/30 hover:shadow-glow-sm',
        selected && 'border-primary/50 shadow-glow-sm',
      )}
    >
      {selected && (
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary to-transparent" />
      )}

      <header className="flex items-start justify-between gap-3">
        <CategoryIcon category={component.category} />
        <div className="flex max-w-[72%] flex-wrap items-center justify-end gap-1.5">
          {component.performanceScore !== null && (
            <span
              className="font-mono text-xs text-muted-foreground"
              title={t('builder.specs.estimatedScore')}
            >
              {t('builder.specs.score', { value: component.performanceScore })}
            </span>
          )}
          {component.stockStatus === 'in_stock' ? (
            <Badge variant="success" title={t('builder.specs.stockAsOf', { date: stockDate })}>
              {t('builder.specs.inStock')}
            </Badge>
          ) : component.stockStatus === 'limited' ? (
            <Badge variant="warning" title={t('builder.specs.stockAsOf', { date: stockDate })}>
              {t('builder.specs.limited')}
            </Badge>
          ) : outOfStock ? (
            <Badge variant="danger" title={t('builder.specs.stockAsOf', { date: stockDate })}>
              {t('builder.specs.outOfStock')}
            </Badge>
          ) : (
            <Badge variant="outline" title={t('builder.specs.stockUnknownAsOf', { date: stockDate || '—' })}>
              {t('builder.specs.stockUnknown')}
            </Badge>
          )}
          {compatibilityStatus === 'compatible' ? (
            <CompatibilityBadge status="ok" label={t('builder.specs.compatible')} />
          ) : compatibilityStatus === 'incompatible' ? (
            <CompatibilityBadge status="error" label={t('builder.specs.incompatible')} />
          ) : compatibilityStatus === 'unverified' ? (
            <CompatibilityBadge status="info" label={t('builder.specs.unverified')} />
          ) : compatibilityStatus === 'review' ? (
            <CompatibilityBadge status="warning" label={t('builder.specs.review')} />
          ) : null}
        </div>
      </header>

      <div className="mt-4 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {component.brand}
        </p>
        <h3 className="mt-0.5 line-clamp-2 text-sm font-semibold leading-snug text-foreground">
          <ComponentName component={component} />
        </h3>

        <ul className="mt-3 flex flex-wrap gap-1.5">
          {specHighlights(component).map((spec) => (
            <li
              key={spec}
              className="rounded-md border border-border bg-surface-elevated/60 px-2 py-1 font-mono text-[10.5px] text-muted-foreground"
            >
              {spec}
            </li>
          ))}
        </ul>
      </div>

      {/**
       * Three-line footer, one idea per line.
       *
       * At 1280px a builder card is ~290px wide. Price + store logo + wattage on
       * one row left "EGP 61,500" colliding with the logo and "300 W", and a
       * side-by-side Add/Compare clipped the label to "Compare (2 s…)".
       *
       * So: price alone, then the store and wattage as quiet metadata, then the
       * actions full-width. Nothing shares a baseline that cannot fit.
       */}
      <footer className="mt-5 border-t border-border pt-4">
        {/* `auto`, not `ltr`: Intl wraps Arabic currency in RTL marks and forcing
            LTR renders "ج.م 379" with the currency first. */}
        <span
          className="block whitespace-nowrap pb-0.5 font-mono text-base font-medium tabular-nums text-success"
          dir="auto"
          title={t('retail.bestPrice')}
        >
          {formatCurrency(livePrice?.bestPriceEgp ?? component.price)}
        </span>

        <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
          {livePrice ? <RetailerLogo retailerId={livePrice.retailerId} size="sm" /> : null}
          {component.powerDrawWatts ? (
            <span className="flex items-center gap-1 whitespace-nowrap">
              <Zap className="size-3" /> {formatWatts(component.powerDrawWatts)}
            </span>
          ) : null}
        </div>

        <div className="mt-3 flex flex-col gap-2">
          {selected ? (
            <Button size="sm" variant="secondary" className="w-full" onClick={() => onRemove?.(component)}>
              <Check /> {t('builder.selected')}
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={outOfStock}
                className="w-full"
                onClick={() => onSelect(component)}
              >
                <Plus /> {t('builder.add')}
              </Button>
              {/*
                * Full-width so "Compare (3 stores)" is never truncated to
                * "Compare (3 s…)" in a 290px card.
                */}
              {onCompare && (livePrice || component.storeLinks.length > 0) ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="w-full whitespace-nowrap text-[11px]"
                  onClick={() => onCompare(component)}
                >
                  {component.storeLinks.length > 1
                    ? t('retail.compareStores', { count: component.storeLinks.length })
                    : t('retail.compare')}
                </Button>
              ) : null}
            </>
          )}
        </div>
      </footer>
    </motion.article>
  );
}
