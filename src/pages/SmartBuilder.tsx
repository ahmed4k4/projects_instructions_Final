import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Check, MessageSquareCode, RefreshCw, Save, Sparkles, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/PageHeader';
import { SmartBuildWizard } from '@/components/domain/SmartBuildWizard';
import { AIThinkingPanel, type ToolStep } from '@/components/shared/AIThinkingPanel';
import { ComponentName } from '@/components/shared/ComponentName';
import { BuildScoreRing } from '@/components/domain/BuildScoreRing';
import { CategoryIcon } from '@/components/domain/CategoryIcon';
import { CompatibilityBadge } from '@/components/domain/CompatibilityBadge';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { AIBuildRequest, AIBuildResponse } from '@/types/ai';
import { AIError } from '@/types/ai';
import type { PCComponent } from '@/types/components';
import { generateBuild } from '@/services/buildAgent';
import { saveBuild } from '@/services/buildsService';
import { fallbackNotice } from '@/lib/scoring/fallbackBuild';
import { useCatalogue, useCompatibilityRules } from '@/hooks/useCatalogue';
import { evaluateCompatibility } from '@/lib/compatibility/engine';
import { calculateBuildScore } from '@/lib/scoring/buildScore';
import { estimateFpsSync, averageFpsAt } from '@/lib/performance/estimator';
import { useBenchmarks } from '@/hooks/useCatalogue';
import { useBuildStore } from '@/store/useBuildStore';
import { useAuth } from '@/hooks/useAuth';
import { CATEGORY_MAP } from '@/lib/constants';
import { formatCurrency, formatWatts } from '@/lib/utils';
import { buildShareUrl } from '@/lib/share';
import { EASE_OUT, makeStagger, staggerItem } from '@/lib/motion';
import { useTranslation } from 'react-i18next';

const stagger = makeStagger(0.06, 0.05);

interface GeneratedBuild {
  response: AIBuildResponse;
  components: PCComponent[];
  score: ReturnType<typeof calculateBuildScore>;
  compatibility: ReturnType<typeof evaluateCompatibility>;
}

export default function SmartBuilder() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const { user } = useAuth();

  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'thinking' | 'done' | 'error'>('idle');
  const [narration, setNarration] = useState('');
  const [steps, setSteps] = useState<ToolStep[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GeneratedBuild | null>(null);
  const [request, setRequest] = useState<AIBuildRequest | null>(null);
  const [saving, setSaving] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  const { data: catalogue = [] } = useCatalogue();
  const { data: rules = [] } = useCompatibilityRules();
  const { data: benchmarks = [] } = useBenchmarks();
  const hydrate = useBuildStore((state) => state.hydrateFromSelection);
  const setBudget = useBuildStore((state) => state.setBudget);
  const setUseCase = useBuildStore((state) => state.setUseCase);

  const byId = useMemo(() => new Map(catalogue.map((c) => [c.id, c])), [catalogue]);

  const run = async (req: AIBuildRequest) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setRequest(req);
    setBusy(true);
    setPhase('thinking');
    setNarration('');
    setSteps([]);
    setError(null);
    setResult(null);

    try {
      const response = await generateBuild(req, {
        signal: controller.signal,
        onNarration: (chunk) => setNarration((prev) => prev + chunk),
        onTool: (tool) =>
          setSteps((prev) => [...prev, { name: tool.name, summary: tool.summary, done: true }]),
      });

      // Resolve the model's IDs to full components.
      const components = response.items
        .map((item) => byId.get(item.componentId))
        .filter((c): c is PCComponent => Boolean(c));

      if (components.length === 0) throw new Error('The build came back empty.');

      const items = Object.fromEntries(components.map((c) => [c.category, c]));
      const compatibility = evaluateCompatibility(items, rules);
      const totalPrice = components.reduce((sum, c) => sum + c.price, 0);
      const totalWatts = components.reduce((sum, c) => sum + (c.powerDrawWatts ?? 0), 0);
      const score = calculateBuildScore({
        items,
        compatibility,
        totalPrice,
        totalWatts,
        useCase: req.useCase,
        budget: req.budget,
      });

      setResult({ response, components, score, compatibility });
      setPhase('done');

      if (response.source === 'fallback') {
        toast.warning('AI unavailable — rule-based build shown', {
          description: fallbackNotice(response.degradedReason),
        });
      }
    } catch (err) {
      if (err instanceof AIError && err.code === 'aborted') {
        setPhase('idle');
      } else {
        setPhase('error');
        setError(err instanceof Error ? err.message : 'Build generation failed.');
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  /** Load the generated build into the builder so the user can tweak parts. */
  const openInBuilder = () => {
    if (!result || !request) return;
    const selection = Object.fromEntries(result.components.map((c) => [c.category, c]));
    hydrate(selection as never, result.response.buildName);
    setBudget(request.budget);
    setUseCase(request.useCase);
    toast.success(t('smartBuilder.loaded'), { description: t('smartBuilder.loadedHint') });
    navigate('/builder');
  };

  const save = async () => {
    if (!result || !request) return;

    /**
     * Anonymous path: no account, no server. The build is already in the local
     * store, so we just hand back a self-contained share link instead of
     * bouncing the user to /auth.
     */
    if (!user) {
      const selection = Object.fromEntries(result.components.map((c) => [c.category, c]));
      const url = buildShareUrl(selection as never, result.response.buildName);
      if (!url) {
        toast.error(t('builder.share.empty'));
        return;
      }
      await navigator.clipboard.writeText(url).catch(() => undefined);
      toast.success(t('builder.share.copied'), { description: t('builder.share.copiedHint') });
      return;
    }

    setSaving(true);
    try {
      const saved = await saveBuild({
        name: result.response.buildName,
        description: result.response.explanation.slice(0, 240),
        useCase: request.useCase,
        components: result.components,
        totalPrice: result.components.reduce((sum, c) => sum + c.price, 0),
        totalPowerWatts: result.components.reduce((sum, c) => sum + (c.powerDrawWatts ?? 0), 0),
        buildScore: result.score.total,
        scoreBreakdown: result.score.breakdown,
      });

      await navigator.clipboard.writeText(`${window.location.origin}/b/${saved.slug}`).catch(() => undefined);
      toast.success(t('smartBuilder.saved'), { description: t('builder.share.copiedHint') });
      navigate(`/b/${saved.slug}`);
    } catch (err) {
      toast.error(t('smartBuilder.saveFailed'), {
        description: err instanceof Error ? err.message : t('common.error'),
      });
    } finally {
      setSaving(false);
    }
  };

  const avg1440 = result
    ? averageFpsAt(
        estimateFpsSync({
          items: Object.fromEntries(result.components.map((c) => [c.category, c])),
          benchmarks,
        }),
        '1440p',
      )
    : null;

  return (
    <div className="container py-8 lg:py-10">
      <PageHeader
        eyebrow="Smart Builder"
        title="Describe it. We'll spec it."
        description="Tell us the budget and the workload. The agent searches the live catalogue, checks compatibility and scores every candidate before it answers."
        breadcrumbs={[
          { label: 'Workspace', to: '/' },
          { label: 'Builder', to: '/builder' },
          { label: 'AI Build' },
        ]}
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link to="/builder">
              Manual builder <ArrowRight />
            </Link>
          </Button>
        }
      />

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        {/* ---------------------------------------------------------- form */}
        <div className={result ? 'lg:sticky lg:top-24 lg:self-start' : ''}>
          <SmartBuildWizard onSubmit={run} busy={busy} initial={request ?? undefined} />

          {(phase === 'thinking' || phase === 'done' || phase === 'error') && (
            <AIThinkingPanel
              className="mt-4"
              narration={narration}
              steps={steps}
              phase={phase}
              error={error ?? undefined}
            />
          )}
        </div>

        {/* -------------------------------------------------------- result */}
        <div className="min-w-0">
          {!result && phase !== 'thinking' && (
            <div className="grid h-full min-h-[320px] place-items-center rounded-2xl border border-dashed border-border-strong bg-surface/40 p-8 text-center">
              <div className="max-w-sm">
                <span className="mx-auto grid size-12 place-items-center rounded-xl border border-primary/25 bg-primary/10 text-primary-glow">
                  <Sparkles className="size-5" />
                </span>
                <h2 className="mt-4 text-base font-semibold">Your build will appear here</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  Every part is pulled from the catalogue and verified by the compatibility engine — the
                  advisor cannot invent a component.
                </p>
              </div>
            </div>
          )}

          {result && (
            <motion.div variants={stagger} initial="hidden" animate="visible" className="space-y-4">
              <motion.div
                variants={staggerItem}
                className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-primary/25 bg-surface p-5 shadow-glow-sm"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-lg font-semibold">{result.response.buildName}</h2>
                    <Badge variant={result.response.source === 'ai' ? 'primary' : 'warning'}>
                      {result.response.source === 'ai' ? 'AI generated' : 'Rule-based fallback'}
                    </Badge>
                  </div>
                  <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted-foreground">
                    {result.response.explanation}
                  </p>
                  {result.response.source === 'fallback' && (
                    <p className="mt-2 text-[11px] text-warning">
                      {fallbackNotice(result.response.degradedReason)}
                    </p>
                  )}
                </div>
                <BuildScoreRing score={result.score.total} size={92} strokeWidth={6} />
              </motion.div>

              <motion.div variants={staggerItem} className="grid gap-2 sm:grid-cols-3">
                <Stat
                  label="Total"
                  value={formatCurrency(result.components.reduce((s, c) => s + c.price, 0))}
                />
                <Stat
                  label="Peak draw"
                  value={formatWatts(result.components.reduce((s, c) => s + (c.powerDrawWatts ?? 0), 0))}
                  icon={<Zap className="size-3 text-warning" />}
                />
                <Stat label="Est. 1440p avg" value={avg1440 ? `${avg1440} fps` : '—'} />
              </motion.div>

              <motion.div variants={staggerItem} className="flex flex-wrap items-center gap-2">
                <CompatibilityBadge
                  status={result.compatibility.errors.length ? 'error' : 'ok'}
                  label={
                    result.compatibility.errors.length
                      ? `${result.compatibility.errors.length} error(s)`
                      : 'All compatible'
                  }
                />
                {result.compatibility.warnings
                  .filter((w) => !w.ruleKey.startsWith('missing_'))
                  .map((w) => (
                    <span key={w.ruleKey} className="text-[11px] text-warning">
                      {w.message}
                    </span>
                  ))}
              </motion.div>

              <div className="space-y-2">
                {result.components.map((component, index) => {
                  const reason = result.response.items.find((i) => i.componentId === component.id)?.reason;
                  return (
                    <motion.div
                      key={component.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: reduce ? 0 : index * 0.045, duration: 0.3, ease: EASE_OUT }}
                      className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4"
                    >
                      <CategoryIcon category={component.category} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                          {CATEGORY_MAP[component.category].label}
                        </p>
                        <p className="truncate text-sm font-medium">
                          <ComponentName component={component} />
                        </p>
                        {reason && (
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{reason}</p>
                        )}
                      </div>
                      <span className="shrink-0 font-mono text-sm tabular-nums">
                        {formatCurrency(component.price)}
                      </span>
                    </motion.div>
                  );
                })}
              </div>

              <motion.div variants={staggerItem} className="flex flex-wrap gap-2 pt-1">
                <Button onClick={save} disabled={saving}>
                  <Save /> {saving ? 'Saving…' : 'Save this build'}
                </Button>
                <Button variant="secondary" onClick={openInBuilder}>
                  <Check /> Open in builder
                </Button>
                <Button variant="outline" onClick={() => request && run(request)} disabled={busy}>
                  <RefreshCw /> Regenerate
                </Button>
                <Button asChild variant="ghost">
                  <Link to="/ai-advisor">
                    <MessageSquareCode /> Refine with AI
                  </Link>
                </Button>
              </motion.div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface/70 px-3 py-2.5">
      <p className="flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="mt-1 font-mono text-sm font-medium tabular-nums">{value}</p>
    </div>
  );
}
