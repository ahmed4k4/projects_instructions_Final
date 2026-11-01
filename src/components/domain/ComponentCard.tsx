import { Check, Plus, Zap } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { PCComponent } from '@/types/components';
import { cn, formatCurrency, formatSpecValue, formatWatts } from '@/lib/utils';
import { staggerItem } from '@/lib/motion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CategoryIcon } from './CategoryIcon';

/** Short, category-aware spec highlights (3 per card). */
function specHighlights(component: PCComponent): string[] {
  const s = component.specs;
  switch (component.category) {
    case 'cpu':
      return [
        `${formatSpecValue(s.cores)}C / ${formatSpecValue(s.threads)}T`,
        `${formatSpecValue(s.boostClock)} GHz boost`,
        formatSpecValue(s.socket),
      ];
    case 'gpu':
      return [
        `${formatSpecValue(s.vram)} GB GDDR6X`,
        `${formatSpecValue(s.tdp)} W`,
        `${formatSpecValue(s.length)} mm`,
      ];
    case 'motherboard':
      return [formatSpecValue(s.chipset), formatSpecValue(s.socket), formatSpecValue(s.formFactor)];
    case 'ram':
      return [
        `${formatSpecValue(s.capacity)} GB`,
        `${formatSpecValue(s.speed)} MT/s`,
        `CL${formatSpecValue(s.casLatency)}`,
      ];
    case 'storage':
      return [
        `${formatSpecValue(s.capacity)} GB`,
        `${formatSpecValue(s.readSpeed)} MB/s read`,
        formatSpecValue(s.interface),
      ];
    case 'psu':
      return [formatSpecValue(s.wattage) + ' W', formatSpecValue(s.efficiency), formatSpecValue(s.modular)];
    case 'case':
      return [
        Array.isArray(s.formFactorSupport) ? (s.formFactorSupport as string[]).join(' · ') : '—',
        `GPU ≤ ${formatSpecValue(s.maxGpuLength)} mm`,
        `Cooler ≤ ${formatSpecValue(s.maxCoolerHeight)} mm`,
      ];
    case 'cooling':
      return [
        formatSpecValue(s.type),
        `${formatSpecValue(s.tdpRating)} W TDP`,
        Array.isArray(s.socketSupport) ? (s.socketSupport as string[]).slice(0, 2).join(' · ') : '—',
      ];
    default:
      return [];
  }
}

interface ComponentCardProps {
  component: PCComponent;
  selected?: boolean;
  onSelect: (component: PCComponent) => void;
  onRemove?: (component: PCComponent) => void;
}

export function ComponentCard({ component, selected, onSelect, onRemove }: ComponentCardProps) {
  const { t } = useTranslation();
  const outOfStock = component.stockStatus === 'out_of_stock';

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
        <div className="flex flex-col items-end gap-1.5">
          {component.performanceScore !== null && (
            <span className="font-mono text-xs text-muted-foreground">
              {t('builder.specs.score', { value: component.performanceScore })}
            </span>
          )}
          {outOfStock ? (
            <Badge variant="danger">{t('builder.specs.outOfStock')}</Badge>
          ) : component.stockStatus === 'limited' ? (
            <Badge variant="warning">{t('builder.specs.limited')}</Badge>
          ) : (
            <Badge variant="success">{t('builder.specs.inStock')}</Badge>
          )}
        </div>
      </header>

      <div className="mt-4 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {component.brand}
        </p>
        <h3 className="mt-0.5 line-clamp-2 text-sm font-semibold leading-snug text-foreground">
          {component.name}
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

      <footer className="mt-5 flex items-center justify-between gap-3 border-t border-border pt-4">
        <div>
          <div className="font-mono text-lg font-medium tabular-nums">{formatCurrency(component.price)}</div>
          {component.powerDrawWatts ? (
            <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
              <Zap className="size-3" /> {formatWatts(component.powerDrawWatts)}
            </div>
          ) : (
            <div className="mt-0.5 text-[11px] text-muted-foreground">—</div>
          )}
        </div>

        {selected ? (
          <Button size="sm" variant="secondary" onClick={() => onRemove?.(component)}>
            <Check /> {t('builder.selected')}
          </Button>
        ) : (
          <Button size="sm" variant="outline" disabled={outOfStock} onClick={() => onSelect(component)}>
            <Plus /> {t('builder.add')}
          </Button>
        )}
      </footer>
    </motion.article>
  );
}
