import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, ChevronDown, Globe, Loader2, Plug } from 'lucide-react';
import { getAIStatus, testProviders, type AIStatus } from '@/services/ai/client';
import { cn } from '@/lib/utils';
import { EASE_OUT } from '@/lib/motion';
import { Button } from '@/components/ui/button';

/**
 * Collapsible "AI status" card.
 *
 * Shows the active Gemini model, whether Google Search grounding is available
 * and how much of the daily grounded-search budget is left. That budget is the
 * one number a user can actually exhaust, so it is surfaced rather than hidden.
 */
export function AIStatusPanel({ className }: { className?: string }) {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getAIStatus().then((next) => {
      if (!cancelled) setStatus(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const runTest = async () => {
    setTesting(true);
    setStatus(await testProviders());
    setTesting(false);
  };

  const configured = status?.configured ?? false;
  const diagnosis = status?.diagnosis ?? null;
  const tone = status?.error ? 'warning' : configured ? 'ok' : 'idle';
  const Icon = status?.error ? AlertTriangle : configured ? CheckCircle2 : Plug;

  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border',
        tone === 'ok' && 'border-success/25 bg-success/[0.05]',
        tone === 'warning' && 'border-warning/25 bg-warning/[0.05]',
        tone === 'idle' && 'rigpilot-panel border-border',
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-start"
      >
        <Icon
          className={cn(
            'size-3.5 shrink-0',
            tone === 'ok' && 'text-success',
            tone === 'warning' && 'text-warning',
            tone === 'idle' && 'text-muted-foreground',
          )}
        />
        <span className="text-xs font-medium">{t('aiStatus.title')}</span>
        <span className="flex-1 truncate text-[11px] text-muted-foreground">
          {configured
            ? t('aiStatus.poweredBy', { provider: 'Gemini', model: status?.model ?? '—' })
            : t('aiStatus.notConfigured')}
        </span>
        {status?.grounding.warn && (
          <span className="shrink-0 rounded-full border border-warning/30 bg-warning/10 px-1.5 py-0.5 font-mono text-[9px] text-warning">
            {status.grounding.remaining}
          </span>
        )}
        <ChevronDown
          className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.22, ease: EASE_OUT }}
            className="border-t border-current/10"
          >
            <div className="space-y-3 px-4 py-3">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
                <Row label={t('aiStatus.model')} value={status?.model ?? '—'} mono />
                <Row
                  label={t('aiStatus.latency')}
                  value={status?.latencyMs ? `${status.latencyMs} ms` : '—'}
                  mono
                />
              </dl>

              {/* Grounded-search budget: the only quota a user can exhaust. */}
              <div className="rounded-lg border border-border bg-background/40 p-2.5">
                <p className="flex items-center gap-1.5 text-[10.5px] font-medium">
                  <Globe className="size-3 text-accent" />
                  {t('aiStatus.grounding')}
                </p>
                {status ? (
                  <>
                    <p className="mt-1 text-[10.5px] text-muted-foreground">
                      {t('aiStatus.groundingRemaining', {
                        remaining: status.grounding.remaining,
                        limit: status.grounding.limit,
                      })}
                    </p>
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-elevated">
                      <div
                        className={cn(
                          'h-full rounded-full',
                          status.grounding.warn ? 'bg-warning' : 'bg-accent',
                        )}
                        style={{
                          width: `${Math.round(
                            (status.grounding.remaining / status.grounding.limit) * 100,
                          )}%`,
                        }}
                      />
                    </div>
                  </>
                ) : (
                  <p className="mt-1 text-[10.5px] text-muted-foreground">{t('common.loading')}</p>
                )}
              </div>

              {!configured && (
                <div className="space-y-2 rounded-lg border border-border bg-background/50 p-2.5">
                  {/*
                   * The server already knows WHY it has no key (missing env var
                   * vs. a 404 on the endpoint), so show its diagnosis first — on
                   * a deployment, "run pnpm dev" is useless advice.
                   */}
                  {diagnosis ? (
                    <p className="text-[10.5px] leading-relaxed text-warning">{diagnosis}</p>
                  ) : null}
                  <p className="text-[10.5px] leading-relaxed text-muted-foreground">
                    {t('aiStatus.configureBody')}
                  </p>
                  <code className="block overflow-x-auto rounded bg-surface-inset px-2 py-1 font-mono text-[10.5px]">
                    GEMINI_API_KEY=…
                  </code>
                  <code className="block overflow-x-auto rounded bg-surface-inset px-2 py-1 font-mono text-[10.5px]">
                    pnpm dev
                  </code>
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block text-[10.5px] text-primary-glow underline-offset-2 hover:underline"
                  >
                    {t('aiStatus.getKey')}
                  </a>
                </div>
              )}

              {configured && (
                <p className="rounded-lg border border-border bg-background/40 px-2.5 py-2 text-[10.5px] leading-relaxed text-muted-foreground">
                  {status?.fallbackConfigured
                    ? (t('aiStatus.fallbackReady', { defaultValue: 'A separate Google project key is configured for quota failover.' }))
                    : (t('aiStatus.fallbackMissing', { defaultValue: 'For Google quota failover, add GEMINI_API_KEY_FALLBACK from a different Google AI Studio project.' }))}
                </p>
              )}

              {status?.error && configured && (
                <p className="text-[10.5px] leading-relaxed text-warning">{status.error}</p>
              )}

              <Button size="sm" variant="outline" className="w-full" onClick={runTest} disabled={testing}>
                {testing ? <Loader2 className="animate-spin" /> : <Plug />}
                {testing ? t('aiStatus.testing') : t('aiStatus.test')}
              </Button>

              <p className="text-[10px] leading-relaxed text-muted-foreground/80">
                {t('aiStatus.offlineHint')}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-2">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className={cn('truncate', mono && 'font-mono')}>{value}</dd>
    </div>
  );
}
