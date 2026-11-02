import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Stethoscope,
  TrendingUp,
  Wrench,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/PageHeader';
import { BuildScoreRing } from '@/components/domain/BuildScoreRing';
import { CategoryIcon } from '@/components/domain/CategoryIcon';
import { CompatibilityBadge } from '@/components/domain/CompatibilityBadge';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingSkeleton } from '@/components/shared/LoadingSkeleton';
import { ComponentName } from '@/components/shared/ComponentName';
import type { BuildDoctorReport } from '@/types/ai';
import type { PCComponent } from '@/types/components';
import type { UseCase } from '@/types/build';
import {
  runBuildDoctor,
  findUpgrades,
  analyseBuildHealth,
  type UpgradeCandidate,
} from '@/services/buildDoctor';
import { getBuildBySlug } from '@/services/buildsService';
import { useCatalogue, useCompatibilityRules } from '@/hooks/useCatalogue';
import { CATEGORY_MAP } from '@/lib/constants';
import { formatCurrency } from '@/lib/utils';
import { EASE_OUT, makeStagger, staggerItem } from '@/lib/motion';
import { useBuildStore } from '@/store/useBuildStore';

const stagger = makeStagger(0.06, 0.04);

/** Tone per verdict. The label is an i18n key, resolved at render time. */
const VERDICT_TONE: Record<
  BuildDoctorReport['verdict'],
  { labelKey: string; variant: 'success' | 'primary' | 'warning' | 'danger' }
> = {
  excellent: { labelKey: 'doctor.verdicts.excellent', variant: 'success' },
  good: { labelKey: 'doctor.verdicts.good', variant: 'primary' },
  needs_work: { labelKey: 'doctor.verdicts.needs_work', variant: 'warning' },
  rebuild: { labelKey: 'doctor.verdicts.rebuild', variant: 'danger' },
};

export default function BuildDoctor() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const reduce = useReducedMotion();

  const { data: catalogue = [], isLoading: catalogueLoading } = useCatalogue();
  const { data: rules = [], isLoading: rulesLoading } = useCompatibilityRules();
  const hydrate = useBuildStore((state) => state.hydrateFromSelection);

  const [components, setComponents] = useState<PCComponent[] | null>(null);
  const [buildName, setBuildName] = useState<string | null>(null);
  const [useCase, setUseCase] = useState<UseCase>('gaming');
  const [loadError, setLoadError] = useState<string | null>(null);

  const [report, setReport] = useState<BuildDoctorReport | null>(null);
  const [running, setRunning] = useState(false);

  // Load the build (by slug) and resolve its parts against the catalogue.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setComponents(null);
    setLoadError(null);

    getBuildBySlug(id)
      .then((result) => {
        if (cancelled) return;
        if (!result) {
          setLoadError(t('doctor.notFound'));
          return;
        }
        setBuildName(result.build.name || t('doctor.thisBuild'));
        setUseCase((result.build.useCase as UseCase) ?? 'gaming');
        setComponents(result.items.map((item) => item.component));
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : t('doctor.loadFailed'));
      });

    return () => {
      cancelled = true;
    };
    // `t` is stable for a given language; re-fetching a build on every language
    // switch would be wrong, so only the slug re-runs the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const items = useMemo(
    () => Object.fromEntries((components ?? []).map((c) => [c.category, c])),
    [components],
  );

  // Deterministic upgrade candidates: available before any AI call.
  const upgrades: UpgradeCandidate[] = useMemo(() => {
    if (!components?.length || rules.length === 0) return [];
    return findUpgrades({ items, useCase, rules, catalogue });
  }, [components, catalogue, items, rules, useCase]);

  const health = useMemo(() => {
    if (!components?.length || rules.length === 0) return null;
    return analyseBuildHealth({ items, useCase, rules });
  }, [components, items, rules, useCase]);

  const diagnose = async () => {
    if (!components?.length) return;
    setRunning(true);
    try {
      const result = await runBuildDoctor({ name: buildName ?? t('doctor.thisBuild'), useCase, items, rules }, catalogue);
      setReport(result);
    } catch (error) {
      toast.error(t('doctor.diagnoseFailed'), {
        description: error instanceof Error ? error.message : t('errors.unknown'),
      });
    } finally {
      setRunning(false);
    }
  };

  // Kick off automatically once everything is loaded.
  useEffect(() => {
    if (components?.length && rules.length > 0 && !report && !running) void diagnose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [components, rules.length]);

  const applyUpgrade = (toComponentId: string) => {
    const component = catalogue.find((c) => c.id === toComponentId);
    if (!component || !components) return;
    const next = components.map((c) => (c.category === component.category ? component : c));
    setComponents(next);
    setReport(null);
    toast.success(`Swapped in ${component.name}`, { description: 'Re-running the diagnosisâ€¦' });
  };

  const openInBuilder = () => {
    if (!components) return;
    hydrate(Object.fromEntries(components.map((c) => [c.category, c])) as never, buildName ?? t('doctor.thisBuild'));
    window.location.assign('/builder');
  };

  const loading = catalogueLoading || rulesLoading || components === null;

  return (
    <div className="container py-8 lg:py-10">
      <PageHeader
        eyebrow={t('doctor.eyebrow')}
        title={buildName ?? t('doctor.thisBuild')}
        description={t('doctor.description')}
        breadcrumbs={[
          { label: t('nav.workspace'), to: '/' },
          { label: t('nav.dashboard'), to: '/dashboard' },
          { label: t('doctor.title') },
        ]}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={diagnose} disabled={running || loading}>
              {running ? <Loader2 className="animate-spin" /> : <RefreshCw />} {t('doctor.rediagnose')}
            </Button>
            <Button size="sm" onClick={openInBuilder} disabled={!components?.length}>
              <Wrench /> {t('smartBuilder.openInBuilder')}
            </Button>
          </>
        }
      />

      {loadError ? (
        <div className="mt-10 rounded-2xl border border-danger/25 bg-surface p-8 text-center">
          <AlertTriangle className="mx-auto size-7 text-danger" />
          <p className="mt-3 text-sm font-medium">{loadError}</p>
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link to="/dashboard">
              <ArrowRight /> {t('doctor.backToDashboard')}
            </Link>
          </Button>
        </div>
      ) : loading ? (
        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <LoadingSkeleton count={3} className="sm:grid-cols-1" />
          <SkeletonPanel />
        </div>
      ) : health ? (
        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* ------------------------------------------------------ report */}
          <div className="space-y-4">
            <motion.div
              variants={stagger}
              initial="hidden"
              animate="visible"
              className="rounded-2xl border border-border bg-surface p-5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={VERDICT_TONE[report?.verdict ?? 'good'].variant}>
                  {t(VERDICT_TONE[report?.verdict ?? 'good'].labelKey)}
                </Badge>
                <CompatibilityBadge
                  status={health.compatibility.errors.length ? 'error' : 'ok'}
                  label={`${health.compatibility.errors.length} errors آ· ${health.compatibility.warnings.filter((w) => !w.ruleKey.startsWith('missing_')).length} warnings`}
                />
                {!report && running && (
                  <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" /> {t('doctor.reviewing')}
                  </span>
                )}
              </div>

              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {report?.summary ??
                  'Running the deterministic analyser â€” the AI review follows if it is available.'}
              </p>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-success">
                    <ShieldCheck className="size-3.5" /> Strengths
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {(report?.strengths ?? ['Awaiting review']).map((item) => (
                      <motion.li
                        key={item}
                        variants={staggerItem}
                        className="flex gap-2 text-xs leading-relaxed text-muted-foreground"
                      >
                        <Check className="mt-0.5 size-3 shrink-0 text-success" />
                        {item}
                      </motion.li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-warning">
                    <AlertTriangle className="size-3.5" /> Weaknesses
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {(report?.weaknesses ?? ['Awaiting review']).map((item) => (
                      <motion.li
                        key={item}
                        variants={staggerItem}
                        className="flex gap-2 text-xs leading-relaxed text-muted-foreground"
                      >
                        <AlertTriangle className="mt-0.5 size-3 shrink-0 text-warning" />
                        {item}
                      </motion.li>
                    ))}
                  </ul>
                </div>
              </div>
            </motion.div>

            {/* --------------------------------------------- upgrades */}
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <TrendingUp className="size-4 text-accent" /> Recommended upgrades
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Ranked by score gained per dollar, computed against the live catalogue.
              </p>

              <div className="mt-3 space-y-2">
                {upgrades.length === 0 && (
                  <div className="rounded-xl border border-dashed border-border-strong p-6 text-center text-xs text-muted-foreground">
                    {t('doctor.noUpgrades')}
                  </div>
                )}

                {upgrades.map((upgrade, index) => (
                  <motion.div
                    key={upgrade.toComponentId}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: reduce ? 0 : index * 0.05, duration: 0.3, ease: EASE_OUT }}
                    className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-4"
                  >
                    <CategoryIcon category={upgrade.category} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                        {CATEGORY_MAP[upgrade.category].label}
                      </p>
                      <p className="truncate text-sm font-medium">{upgrade.component.name}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {formatCurrency(upgrade.component.price)}
                        {upgrade.priceDelta !== 0 && (
                          <span className={upgrade.priceDelta > 0 ? 'text-warning' : 'text-success'}>
                            {' '}
                            ({upgrade.priceDelta > 0 ? '+' : 'âˆ’'}
                            {formatCurrency(Math.abs(upgrade.priceDelta))})
                          </span>
                        )}
                      </p>
                    </div>
                    <Badge variant="success" className="shrink-0">
                      +{upgrade.scoreDelta} pts
                    </Badge>
                    <Button size="sm" variant="secondary" onClick={() => applyUpgrade(upgrade.toComponentId)}>
                      Apply
                    </Button>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>

          {/* ----------------------------------------------------- sidebar */}
          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <div className="flex flex-col items-center rounded-2xl border border-border bg-surface p-6">
              <BuildScoreRing score={health.score.total} size={110} strokeWidth={7} />
              <p className="mt-4 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                Build score
              </p>
              <dl className="mt-4 w-full space-y-2">
                {Object.entries(health.score.breakdown).map(([key, value]) => (
                  <div key={key}>
                    <div className="flex items-center justify-between text-[11px]">
                      <dt className="capitalize text-muted-foreground">{key}</dt>
                      <dd className="font-mono">{value}</dd>
                    </div>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-elevated">
                      <motion.div
                        className="h-full rounded-full bg-primary-gradient"
                        initial={{ width: 0 }}
                        animate={{ width: `${value}%` }}
                        transition={{ duration: 0.7, ease: EASE_OUT }}
                      />
                    </div>
                  </div>
                ))}
              </dl>
            </div>

            <div className="rounded-xl border border-border bg-surface p-4">
              <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Parts</p>
              <ul className="mt-2 space-y-1.5">
                {(components ?? []).map((component) => (
                  <li key={component.id} className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="truncate text-muted-foreground">
                      <ComponentName component={component} />
                    </span>
                    <span className="shrink-0 font-mono">{formatCurrency(component.price)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex items-center justify-between border-t border-border pt-2 text-xs">
                <span className="text-muted-foreground">Total</span>
                <span className="font-mono font-medium">{formatCurrency(health.totalPrice)}</span>
              </div>
            </div>

            <p className="flex items-start gap-2 rounded-xl border border-border bg-surface/60 p-3 text-[10.5px] leading-relaxed text-muted-foreground">
              <Stethoscope className="mt-0.5 size-3.5 shrink-0 text-primary-glow" />
              Scores and compatibility are computed deterministically from catalogue data. The narrative
              review is written by Gemini from those numbers.
            </p>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function SkeletonPanel() {
  return (
    <div className="space-y-4">
      <div className="shimmer h-40 rounded-2xl bg-surface" />
      <div className="shimmer h-24 rounded-2xl bg-surface" />
    </div>
  );
}
