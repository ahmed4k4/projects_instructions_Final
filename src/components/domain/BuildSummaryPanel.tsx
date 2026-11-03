import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Save, Share2, Sparkles, Trash2, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { BUILD_ORDER } from '@/lib/navigation';
import type { ComponentCategory } from '@/types/components';
import { cn, formatCurrency, formatWatts } from '@/lib/utils';
import { buildShareUrl } from '@/lib/share';
import { localisedName } from '@/lib/i18nContent';
import { ComponentName } from '@/components/shared/ComponentName';
import { spring } from '@/lib/motion';
import { useBuildStore, useBuildTotals } from '@/store/useBuildStore';
import { useAuth } from '@/hooks/useAuth';
import { useCompatibilityRules } from '@/hooks/useCatalogue';
import { evaluateCompatibility } from '@/lib/compatibility/engine';
import { calculateBuildScore } from '@/lib/scoring/buildScore';
import { Button } from '@/components/ui/button';
import { CategoryIcon } from './CategoryIcon';
import { PriceTag } from '@/components/shared/PriceTag';
import { BuildScoreRing } from './BuildScoreRing';
import { CompatibilityBadge } from './CompatibilityBadge';
import { BudgetMeter } from './BudgetMeter';

/**
 * Sticky build summary.
 *
 * Everything here is derived deterministically on the client from the current
 * selection + the rule set from Postgres — no network round-trip per keystroke,
 * and the same numbers the save path writes to the database.
 */
export function BuildSummaryPanel({ compact = false }: { compact?: boolean }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const totals = useBuildTotals();
  const items = useBuildStore((state) => state.items);
  const removeComponent = useBuildStore((state) => state.removeComponent);
  const clearBuild = useBuildStore((state) => state.clearBuild);
  const useCase = useBuildStore((state) => state.useCase);
  const budget = useBuildStore((state) => state.budget);
  const buildName = useBuildStore((state) => state.buildName);
  // The store keeps an empty name until the user picks one, so the placeholder
  // is translated at render time and follows a language switch.
  const displayName = buildName?.trim() ? buildName : t('builder.untitled');
  const { data: rules = [] } = useCompatibilityRules();
  const { user, available } = useAuth();
  const quantities = useBuildStore((state) => state.quantities);

  const shareBuild = async () => {
    const url = buildShareUrl(items, buildName, quantities);
    if (!url) {
      toast.error(t('builder.share.empty'));
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      toast.success(t('builder.share.copied'), { description: t('builder.share.copiedHint') });
    } catch {
      // Clipboard permission can be denied; the URL still works if shown.
      toast.info(t('builder.share.copyFailed'), { description: url });
    }
  };

  const health = useMemo(() => {
    const compatibility = evaluateCompatibility(items, rules);
    const score = calculateBuildScore({
      items,
      compatibility,
      totalPrice: totals.totalPrice,
      totalWatts: totals.totalWatts,
      useCase,
      budget,
    });
    return { compatibility, score };
  }, [items, rules, totals.totalPrice, totals.totalWatts, useCase, budget]);

  const overBudget = totals.totalPrice > budget;
  const useCaseLabel = t(`builder.useCases.${useCase}`);
  const realWarnings = health.compatibility.warnings.filter((w) => !w.ruleKey.startsWith('missing_'));
  const errorCount = health.compatibility.errors.length;

  return (
    <div
      className={cn(
        'rigpilot-panel flex flex-col gap-4 rounded-2xl p-5 backdrop-blur-xl',
        compact ? '' : 'lg:sticky lg:top-24',
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            {t('builder.summary.title')}
          </p>
          <p className="mt-1 truncate text-sm font-semibold">{displayName}</p>
          <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
            {useCaseLabel} · {t('common.parts', { count: totals.itemCount })}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-center gap-1">
          <span className="technical-kicker text-[9px]">{t('builder.buildScore.label')}</span>
          <BuildScoreRing
            score={totals.itemCount === 0 ? null : health.score.total}
            size={68}
            strokeWidth={5}
            label={t('builder.buildScore.label')}
          />
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <CompatibilityBadge
          status={errorCount > 0 ? 'error' : realWarnings.length > 0 ? 'warning' : 'ok'}
          label={
            errorCount > 0
              ? t('builder.summary.errors', { count: errorCount })
              : realWarnings.length > 0
                ? t('builder.summary.warnings', { count: realWarnings.length })
                : t('builder.summary.compatible')
          }
        />
        {overBudget && (
          <CompatibilityBadge
            status="warning"
            label={t('builder.summary.overBudget', {
              amount: formatCurrency(totals.totalPrice - budget),
            })}
          />
        )}
      </div>

      <BudgetMeter spent={totals.totalPrice} budget={budget} />

      <div className="space-y-1">
        <AnimatePresence initial={false} mode="popLayout">
          {BUILD_ORDER.map((category) => {
            const component = items[category];
            return (
              <motion.div
                key={category}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={spring}
                className={cn(
                  'group flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 transition-colors',
                  component ? 'hover:bg-surface-elevated/70' : 'opacity-55',
                )}
              >
                {component ? (
                  <CategoryIcon category={category as ComponentCategory} size="sm" />
                ) : (
                  <span className="grid size-8 shrink-0 place-items-center rounded-md border border-dashed border-border-strong text-muted-foreground">
                    <span className="size-1 rounded-full bg-current" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    {t(`builder.categories.${category}`)}
                  </p>
                  <p className="truncate text-xs font-medium">
                    {component ? (
                      <ComponentName component={component} />
                    ) : (
                      t('builder.summary.choose', { category: t(`builder.categories.${category}`) })
                    )}
                  </p>
                </div>
                {component && (
                  <div className="flex items-center gap-1">
                    <span className="font-mono text-[11px] tabular-nums">
                      {formatCurrency(component.price)}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeComponent(category as ComponentCategory)}
                      aria-label={t('builder.removed', { name: localisedName(component, i18n.language) })}
                      className="rounded p-1 text-muted-foreground opacity-0 transition hover:bg-danger/10 hover:text-danger group-hover:opacity-100 focus-visible:opacity-100"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      <div className="space-y-2 rounded-xl border border-border bg-background/40 p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{t('builder.summary.total')}</span>
          <PriceTag value={totals.totalPrice} className={cn(overBudget && 'text-warning')} />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{t('builder.summary.draw')}</span>
          <span className="flex items-center gap-1 font-mono text-xs">
            <Zap className="size-3 text-warning" /> {formatWatts(totals.totalWatts)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{t('builder.summary.psuHeadroom')}</span>
          <span className="font-mono text-xs">
            {(() => {
              const psuWatts = Number(items.psu?.specs.wattage ?? 0);
              if (!psuWatts) return '—';
              const free = Math.round(psuWatts - totals.totalWatts);
              return free >= 0
                ? t('builder.summary.psuFree', { watts: free })
                : t('builder.summary.psuShort', { watts: Math.abs(free) });
            })()}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{t('builder.summary.budgetLeft')}</span>
          <span className={cn('font-mono text-xs tabular-nums', overBudget ? 'text-danger' : 'text-success')}>
            {formatCurrency(Math.max(0, budget - totals.totalPrice))}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {/*
         * Sharing is anonymous: the build is encoded into the URL fragment, so
         * this works with no account and no network. Signing in is only needed
         * for cloud sync.
         */}
        <Button disabled={totals.itemCount === 0} className="w-full" onClick={shareBuild}>
          <Share2 /> {t('builder.share.build')}
        </Button>
        <Button
          disabled={totals.itemCount === 0}
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => navigate('/builder/ai')}
        >
          <Sparkles /> {t('builder.summary.saveShare')}
        </Button>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm" className="flex-1">
            <Link to="/ai-advisor">
              {t('builder.summary.askAdvisor')} <ArrowRight className="rtl:rotate-180" />
            </Link>
          </Button>
          <Button variant="ghost" size="sm" onClick={clearBuild} disabled={totals.itemCount === 0}>
            <Trash2 /> {t('common.clear')}
          </Button>
        </div>
        {!user && available ? (
          <Button asChild variant="ghost" size="sm" className="w-full text-muted-foreground">
            <Link to="/auth?returnTo=%2Fbuilder">{t('builder.share.cloudCta')}</Link>
          </Button>
        ) : null}
      </div>

      <p className="text-[10.5px] leading-relaxed text-muted-foreground/80">
        <Save className="me-1 inline size-3" />
        {t('builder.summary.scoreNote')}
      </p>
    </div>
  );
}
