import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { ArrowRight, Layers, Sparkles } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { BuildCard } from '@/components/domain/BuildCard';
import { Button } from '@/components/ui/button';
import { PREBUILT_FILTERS } from '@/lib/navigation';
import { buildPrebuilts } from '@/lib/prebuiltFromCatalogue';
import { useComponents } from '@/hooks/useComponents';
import { useCompatibilityRules } from '@/hooks/useCatalogue';
import { useUIStore } from '@/store/useUIStore';
import { spring, makeStagger } from '@/lib/motion';
import { cn } from '@/lib/utils';
import type { UseCase } from '@/types/build';

const stagger = makeStagger(0.07, 0.05);

export default function PrebuiltConfigs() {
  const { t } = useTranslation();
  const language = useUIStore((state) => state.language);
  const [filter, setFilter] = useState<(typeof PREBUILT_FILTERS)[number]['id']>('all');

  /**
   * Configurations are GENERATED from live stock, not hard-coded.
   *
   * The three builds used to be hand-written against `sampleComponents`, so the
   * parts were not sold anywhere in Egypt and opening one loaded components that
   * did not exist. See `lib/prebuiltFromCatalogue`.
   */
  const { data: catalogue = [], isLoading } = useComponents();
  const { data: rules = [] } = useCompatibilityRules();

  const prebuilts = useMemo(
    () => buildPrebuilts(catalogue, rules, language),
    [catalogue, rules, language],
  );

  const builds = useMemo(
    () =>
      filter === 'all'
        ? prebuilts
        : prebuilts.filter((build) => build.useCase === (filter as UseCase)),
    [filter, prebuilts],
  );

  return (
    <div className="container py-8 lg:py-10">
      <PageHeader
        eyebrow={t('nav.prebuilt')}
        title={t('prebuilt.title')}
        description={t('prebuilt.description')}
        breadcrumbs={[{ label: t('nav.workspace'), to: '/' }, { label: t('nav.prebuilt') }]}
        actions={
          <Button asChild variant="secondary" size="sm">
            <Link to="/builder">
              {t('prebuilt.fromScratch')} <ArrowRight />
            </Link>
          </Button>
        }
      />

      <div className="mt-8 flex items-center justify-between gap-4">
        <p className="text-[11px] text-muted-foreground">{t('prebuilt.liveNote')}</p>
      </div>

      <div className="mt-3 flex items-center gap-1 overflow-x-auto rounded-xl border border-border bg-surface/60 p-1 no-scrollbar">
        {PREBUILT_FILTERS.map((item) => {
          const active = filter === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={cn(
                'relative shrink-0 rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors',
                active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {active && (
                <motion.span
                  layoutId="prebuilt-filter-indicator"
                  className="absolute inset-0 rounded-lg border border-border-strong bg-surface-elevated"
                  transition={spring}
                />
              )}
              <span className="relative">
                {item.id === 'all' ? t('prebuilt.all') : t(`builder.useCases.${item.id}`)}
              </span>
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <p className="mt-10 text-center text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : builds.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-border-strong p-16 text-center">
          <Layers className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-4 text-sm font-medium">{t('prebuilt.emptyCategory')}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('prebuilt.emptyHint')}</p>
        </div>
      ) : (
        <motion.div
          key={filter}
          variants={stagger}
          initial="hidden"
          animate="visible"
          className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3"
        >
          {builds.map((build) => (
            <BuildCard key={build.id} build={build} />
          ))}
        </motion.div>
      )}

      <div className="mt-10 flex flex-col items-start justify-between gap-4 rounded-2xl border border-primary/20 bg-surface/60 p-6 sm:flex-row sm:items-center">
        <div className="flex items-start gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary-glow">
            <Sparkles className="size-5" />
          </span>
          <div>
            <p className="text-sm font-semibold">{t('prebuilt.ctaTitle')}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{t('prebuilt.ctaBody')}</p>
          </div>
        </div>
        <Button asChild size="sm">
          <Link to="/ai-advisor">{t('smartBuilder.generate')}</Link>
        </Button>
      </div>
    </div>
  );
}
