import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Cpu,
  Film,
  Gamepad2,
  Loader2,
  Server,
  Sparkles,
  Video,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CURRENCY } from '@/lib/constants';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { AIBuildRequest } from '@/types/ai';
import type { UseCase } from '@/types/build';
import { BUDGET_PRESETS, RESOLUTIONS, USE_CASES } from '@/lib/constants';
import { cn, formatCurrency } from '@/lib/utils';
import { EASE_OUT } from '@/lib/motion';

const USE_CASE_ICONS: Record<UseCase, typeof Cpu> = {
  gaming: Gamepad2,
  ai: Cpu,
  editing: Film,
  programming: Server,
  workstation: Cpu,
  streaming: Video,
};

const PREFERENCE_CHIPS = [
  'Quiet',
  'Small form factor',
  'RGB lighting',
  'No RGB',
  'Air cooling',
  'Water cooling',
  'AMD CPU',
  'Intel CPU',
  'NVIDIA GPU',
  'AMD GPU',
  'Room to upgrade',
];

const STEPS = ['Budget & purpose', 'Resolution', 'Preferences', 'Final details'] as const;

interface SmartBuildWizardProps {
  onSubmit: (request: AIBuildRequest) => void;
  busy?: boolean;
  initial?: Partial<AIBuildRequest>;
}

/** Four-step intake. Animated slide between steps, keyboard friendly. */
export function SmartBuildWizard({ onSubmit, busy = false, initial }: SmartBuildWizardProps) {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);

  const [budgetInput, setBudgetInput] = useState(String(initial?.budget ?? 75_000));
  const budget = Number(budgetInput.replace(/[^0-9]/g, ''));
  const [useCase, setUseCase] = useState<UseCase>(initial?.useCase ?? 'gaming');
  const [resolution, setResolution] = useState<string>(initial?.resolution ?? '1440p');
  const [preferences, setPreferences] = useState<string[]>(initial?.preferences ?? []);
  const [notes, setNotes] = useState(initial?.notes ?? '');

  const isGaming = useCase === 'gaming' || useCase === 'streaming';
  const steps = isGaming ? STEPS : (['Budget & purpose', 'Preferences', 'Final details'] as const);
  const visibleStep = Math.min(step, steps.length - 1);
  const isLast = visibleStep === steps.length - 1;

  const go = (next: number) => {
    setDirection(next > step ? 1 : -1);
    setStep(Math.max(0, Math.min(steps.length - 1, next)));
  };

  const togglePreference = (value: string) => {
    setPreferences((prev) => (prev.includes(value) ? prev.filter((p) => p !== value) : [...prev, value]));
  };

  const submit = () => {
    if (!Number.isFinite(budget) || budget <= 0) return;
    onSubmit({
      budget: Number.isFinite(budget) && budget > 0 ? budget : 10_000,
      currency: CURRENCY,
      useCase,
      resolution: isGaming ? resolution : undefined,
      preferences,
      notes: notes.trim() || undefined,
    });
  };

  const slide = {
    enter: (dir: number) => ({ opacity: 0, x: reduce ? 0 : dir * 28 }),
    center: { opacity: 1, x: 0 },
    exit: (dir: number) => ({ opacity: 0, x: reduce ? 0 : dir * -28 }),
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface/70 backdrop-blur-xl">
      {/* Progress — dots only. The active step is named in the caption below,
          so four labels never have to compete for a narrow column's width. */}
      <div className="flex items-center gap-1.5 border-b border-border px-3 py-4 sm:gap-2 sm:px-6">
        {steps.map((label, index) => (
          <div key={label} className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2">
            <span
              className={cn(
                'grid size-6 shrink-0 place-items-center rounded-full border text-[10px] font-medium transition-colors',
                index < visibleStep
                  ? 'border-success/40 bg-success/15 text-success'
                  : index === visibleStep
                    ? 'border-primary/50 bg-primary/15 text-primary-glow'
                    : 'border-border-strong text-muted-foreground',
              )}
              aria-current={index === visibleStep ? 'step' : undefined}
            >
              {index < visibleStep ? <Check className="size-3" /> : index + 1}
            </span>
            {index < steps.length - 1 && (
              <span
                className={cn(
                  'h-px flex-1 transition-colors',
                  index < visibleStep ? 'bg-success/40' : 'bg-border',
                )}
              />
            )}
          </div>
        ))}
      </div>

      <div className="relative min-h-[290px] p-5 sm:p-6">
        <p className="mb-4 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground lg:hidden">
          Step {visibleStep + 1} of {steps.length} · {steps[visibleStep]}
        </p>
        <AnimatePresence mode="wait" custom={direction} initial={false}>
          <motion.div
            key={steps[visibleStep]}
            custom={direction}
            variants={slide}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: reduce ? 0 : 0.28, ease: EASE_OUT }}
          >
            {/* ---------------------------------------------------- step 1 */}
            {steps[visibleStep] === 'Budget & purpose' && (
              <div className="space-y-6">
                <div>
                  <Label htmlFor="budget">{t('smartBuilder.budgetLabel')}</Label>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <div className="relative shrink-0">
                      <span
                        dir="ltr"
                        className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 font-mono text-xs text-muted-foreground"
                      >
                        {CURRENCY}
                      </span>
                      <Input
                        id="budget"
                        type="text"
                        inputMode="numeric"
                        value={budgetInput}
                        onChange={(event) => setBudgetInput(event.target.value.replace(/[^0-9]/g, ''))}
                        className="w-[9.5rem] ps-7 font-mono text-sm tabular-nums"
                      />
                    </div>
                    <input
                      type="range"
                      min={10_000}
                      max={1_000_000}
                      step={5_000}
                      value={Math.min(1_000_000, Math.max(10_000, Number.isFinite(budget) && budget > 0 ? budget : 10_000))}
                      onChange={(event) => setBudgetInput(event.target.value)}
                      aria-label={t('smartBuilder.budgetSlider')}
                      className="h-1.5 flex-1 min-w-[140px] cursor-pointer appearance-none rounded-full bg-surface-elevated accent-primary"
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {BUDGET_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setBudgetInput(String(preset))}
                        className={cn(
                          'rounded-md border px-2 py-1 font-mono text-[11px] transition-colors',
                          budget === preset
                            ? 'border-primary/40 bg-primary/10 text-primary-glow'
                            : 'border-border text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {formatCurrency(preset)}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <Label>{t('smartBuilder.purposeTitle')}</Label>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {USE_CASES.map((item) => {
                      const Icon = USE_CASE_ICONS[item.id];
                      const active = useCase === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setUseCase(item.id)}
                          aria-pressed={active}
                          className={cn(
                            'group flex items-start gap-2.5 rounded-lg border p-3 text-start transition-all duration-200',
                            active
                              ? 'border-primary/45 bg-primary/10 shadow-glow-sm'
                              : 'border-border hover:border-border-strong hover:bg-surface-elevated/60',
                          )}
                        >
                          <Icon
                            className={cn(
                              'mt-0.5 size-4 shrink-0',
                              active ? 'text-primary-glow' : 'text-muted-foreground',
                            )}
                          />
                          <span className="min-w-0">
                            <span className="block text-xs font-medium">
                              {t(`builder.useCases.${item.id}`)}
                            </span>
                            <span className="mt-0.5 block text-[10.5px] leading-snug text-muted-foreground">
                              {t(`builder.useCaseDescriptions.${item.id}`)}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ---------------------------------------------------- step 2 */}
            {steps[visibleStep] === 'Resolution' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold">{t('smartBuilder.resolutionTitle2')}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{t('smartBuilder.resolutionHint')}</p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {RESOLUTIONS.map((item) => {
                    const active = resolution === item;
                    return (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setResolution(item)}
                        aria-pressed={active}
                        className={cn(
                          'rounded-lg border p-4 text-center transition-all duration-200',
                          active
                            ? 'border-primary/45 bg-primary/10 shadow-glow-sm'
                            : 'border-border hover:border-border-strong',
                        )}
                      >
                        <span className="block font-mono text-lg font-medium">{item}</span>
                        <span className="mt-1 block text-[10.5px] text-muted-foreground">
                          {t(`smartBuilder.resolution.${item.toLowerCase()}`)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ---------------------------------------------------- step 3 */}
            {steps[visibleStep] === 'Preferences' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold">{t('smartBuilder.preferencesTitle2')}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{t('smartBuilder.preferencesHint2')}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {PREFERENCE_CHIPS.map((chip) => {
                    const active = preferences.includes(chip);
                    return (
                      <motion.button
                        key={chip}
                        type="button"
                        whileTap={reduce ? undefined : { scale: 0.96 }}
                        onClick={() => togglePreference(chip)}
                        aria-pressed={active}
                        className={cn(
                          'rounded-full border px-3 py-1.5 text-xs transition-colors',
                          active
                            ? 'border-primary/45 bg-primary/10 text-primary-glow'
                            : 'border-border-strong text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {chip}
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ---------------------------------------------------- step 4 */}
            {steps[visibleStep] === 'Final details' && (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="notes">{t('smartBuilder.notesLabel')}</Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Games you play, software you run, parts you already own.
                  </p>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder={t('smartBuilder.notesPlaceholder')}
                    className="mt-2 min-h-28"
                  />
                </div>
                <div className="rounded-lg border border-border bg-surface-inset/50 p-3 text-[11px] text-muted-foreground">
                  <p className="font-medium text-foreground">
                    {formatCurrency(budget)} · {USE_CASES.find((u) => u.id === useCase)?.label}
                    {isGaming ? ` · ${resolution}` : ''}
                  </p>
                  <p className="mt-1">
                    {preferences.length ? preferences.join(' · ') : 'No extra preferences'}
                  </p>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-4 sm:px-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => go(visibleStep - 1)}
          disabled={visibleStep === 0 || busy}
        >
          <ArrowLeft className="rtl:rotate-180" /> {t('common.back')}
        </Button>

        {isLast ? (
          <Button onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {busy ? t('smartBuilder.generating') : t('smartBuilder.generate')}
          </Button>
        ) : (
          <Button onClick={() => go(visibleStep + 1)} disabled={busy}>
            {t('common.continue')} <ArrowRight className="rtl:rotate-180" />
          </Button>
        )}
      </div>
    </div>
  );
}
