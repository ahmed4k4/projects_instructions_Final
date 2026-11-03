import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Eye, Heart, Info, Plus, TrendingUp } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BuildScoreRing } from '@/components/domain/BuildScoreRing';
import { PriceTag } from '@/components/shared/PriceTag';
import { buildPrebuilts, isBuildable } from '@/lib/prebuiltFromCatalogue';
import { useComponents } from '@/hooks/useComponents';
import { useCompatibilityRules } from '@/hooks/useCatalogue';
import { useUIStore } from '@/store/useUIStore';
import { listCommunityBuilds } from '@/services/buildsService';
import { USE_CASE_MAP } from '@/lib/constants';
import type { UseCase } from '@/types/build';
import { formatCurrency, formatWatts } from '@/lib/utils';
import { makeStagger, staggerItem } from '@/lib/motion';

const stagger = makeStagger(0.06, 0.05);

/**
 * Community feed.
 *
 * ── What this page shows now ────────────────────────────────────────────────
 * Real published builds when the database has any. Before Phase 15 it fell back
 * to six invented posts complete with fabricated authors, star ratings, view
 * counts and comment counts — presented under "Real builds with real spec
 * sheets". That is the exact category of dishonesty a marketplace cannot afford,
 * and inventing new numbers in its place would repeat it.
 *
 * The fallback is now the PREBUILT CONFIGURATIONS: real parts, real Egyptian
 * prices, a score computed by the same engine the builder uses, and a clear
 * label saying these are configurations rather than user submissions. Nothing on
 * the page claims a rating, an author or a view count it does not have.
 */
export default function Community() {
  const { t } = useTranslation();
  const language = useUIStore((state) => state.language);

  /**
   * `null`/empty means "no community yet", which is a real state for a new
   * deploy — distinct from "no database configured", which the service reports
   * separately. Either way the page does not invent submissions.
   */
  const { data: published, isLoading } = useQuery({
    queryKey: ['community-builds'] as const,
    queryFn: () => listCommunityBuilds(24),
    staleTime: 5 * 60 * 1000,
  });

  const { data: catalogue = [] } = useComponents();
  const { data: rules = [] } = useCompatibilityRules();

  const shownBuilds = useMemo(() => {
    if (published && published.length > 0) return published;
    return buildPrebuilts(catalogue, rules, language).filter((build) => isBuildable(build, catalogue));
  }, [published, catalogue, rules, language]);

  const usingPrebuilts = !published || published.length === 0;

  return (
    <div className="container py-8 lg:py-10">
      <PageHeader
        eyebrow={t('nav.community')}
        title={t('community.title')}
        description={t('community.description')}
        breadcrumbs={[{ label: t('nav.workspace'), to: '/' }, { label: t('nav.community') }]}
        actions={
          <Button size="sm" asChild>
            <Link to="/dashboard">
              <Plus /> {t('community.publish')}
            </Link>
          </Button>
        }
      />

      {/* A visitor must never mistake a configuration for a user submission. */}
      {usingPrebuilts ? (
        <p className="mt-6 flex items-start gap-2 rounded-lg border border-warning/25 bg-warning/5 px-3 py-2 text-[11px] leading-relaxed text-warning">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          <span>{t('community.prebuiltNote')}</span>
        </p>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <motion.div variants={stagger} initial="hidden" animate="visible" className="space-y-4">
          {isLoading && shownBuilds.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
          ) : (
            shownBuilds.map((build) => {
              const useCase = USE_CASE_MAP[(build.useCase ?? 'gaming') as UseCase];

              return (
                <motion.article
                  key={build.id}
                  variants={staggerItem}
                  className="group rounded-xl border border-border bg-surface p-5 shadow-card transition-[border-color,transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-glow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            to={`/b/${build.slug}`}
                            className="truncate text-sm font-semibold hover:text-primary-glow"
                          >
                            {build.name}
                          </Link>
                          {useCase ? <Badge variant="primary">{useCase.label}</Badge> : null}
                        </div>
                        <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                          {build.description}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-end">
                        <PriceTag value={build.totalPrice} size="sm" animate={false} />
                        <p className="font-mono text-[10px] text-muted-foreground">
                          {formatWatts(build.totalPowerWatts)}
                        </p>
                      </div>
                      <BuildScoreRing score={build.buildScore} size={52} strokeWidth={4} />
                    </div>
                  </div>

                  <footer className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 text-[11.5px] text-muted-foreground">
                    <span className="font-mono text-[11px]">{formatCurrency(build.totalPrice)}</span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toast.success(t('community.save'), { description: build.name })}
                      >
                        <Heart /> {t('community.save')}
                      </Button>
                      <Button asChild variant="ghost" size="sm">
                        <Link to={`/b/${build.slug}`}>{t('community.open')}</Link>
                      </Button>
                    </div>
                  </footer>
                </motion.article>
              );
            })
          )}
        </motion.div>

        {/* Sidebar */}
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-xl border border-border bg-surface p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <TrendingUp className="size-4 text-accent" /> {t('community.trending')}
            </h2>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {['#1440p', '#4k', '#sff', '#quiet', '#av1', '#budget', '#ddr5', '#nvidia'].map(
                (tag, index) => (
                  <span
                    key={tag}
                    className={
                      index < 3
                        ? 'rounded-full border border-accent/25 bg-accent/10 px-2.5 py-1 font-mono text-[10.5px] text-accent'
                        : 'rounded-full border border-border px-2.5 py-1 font-mono text-[10.5px] text-muted-foreground'
                    }
                  >
                    {tag}
                  </span>
                ),
              )}
            </div>
            <p className="mt-3 flex items-start gap-1.5 text-[10.5px] leading-relaxed text-muted-foreground">
              <Eye className="mt-0.5 size-3 shrink-0" />
              {t('community.trendingNote')}
            </p>
          </div>

          <div className="rounded-xl border border-border bg-surface p-5">
            <h2 className="text-sm font-semibold">{t('community.guidelines')}</h2>
            <ul className="mt-3 space-y-2 text-[11.5px] leading-relaxed text-muted-foreground">
              <li>{t('community.guide1')}</li>
              <li>{t('community.guide2')}</li>
              <li>{t('community.guide3')}</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
