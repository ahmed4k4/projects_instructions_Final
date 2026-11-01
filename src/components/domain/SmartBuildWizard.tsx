import { useState } from 'react';
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
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { AIBuildRequest } from '@/types/ai';
import type { UseCase } from '@/types/build';
import { RESOLUTIONS, USE_CASES } from '@/lib/constants';
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

const BUDGET_PRESETS = [900, 1200, 1500, 2000, 3000];

const STEPS = ['Budget & purpose', 'Resolution', 'Preferences', 'Final details'] as const;

interface SmartBuildWizardProps {
  onSubmit: (request: AIBuildRequest) => void;
  busy?: boolean;
  initial?: Partial<AIBuildRequest>;
}

/** Four-step intake. Animated slide between steps, keyboard friendly. */
export function SmartBuildWizard({ onSubmit, busy = false, initial }: SmartBuildWizardProps) {
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);

  const [budget, setBudget] = useState(initial?.budget ?? 1500);
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
    onSubmit({
      budget,
      currency: 'USD',
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
                  <Label htmlFor="budget">Budget</Label>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <div className="relative shrink-0">
                      <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 font-mono text-sm text-muted-foreground">
                        $
                      </span>
                      <Input
                        id="budget"
                        type="text"
                        inputMode="numeric"
                        value={budget}
                        onChange={(event) => {
                          const digits = event.target.value.replace(/[^0-9]/g, '');
                          setBudget(digits ? Math.max(300, Number(digits)) : 300);
                        }}
                        className="w-[9.5rem] ps-7 font-mono text-sm tabular-nums"
                      />
                    </div>
                    <input
                      type="range"
                      min={500}
                      max={5000}
                      step={50}
                      value={Math.min(5000, Math.max(500, budget))}
                      onChange={(event) => setBudget(Number(event.target.value))}
                      aria-label="Budget slider"
                      className="h-1.5 flex-1 min-w-[140px] cursor-pointer appearance-none rounded-full bg-surface-elevated accent-primary"
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {BUDGET_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setBudget(preset)}
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
                  <Label>What will you use it for?</Label>
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
                            <span className="block text-xs font-medium">{item.label}</span>
                            <span className="mt-0.5 block text-[10.5px] leading-snug text-muted-foreground">
                              {item.description}
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
                  <h3 className="text-sm font-semibold">What are you playing at?</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    This changes how much of the budget the GPU deserves.
                  </p>
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
                          {item === '1080p'
                            ? 'High refresh, esports'
                            : item === '1440p'
                              ? 'The sweet spot'
                              : 'Large 4K panels'}
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
                  <h3 className="text-sm font-semibold">Anything you care about?</h3>
                  <p className="mt-1 text-xs text-muted-foreground">Optional — pick as many as you like.</p>
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
                  <Label htmlFor="notes">Anything else?</Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Games you play, software you run, parts you already own.
                  </p>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="e.g. I mostly play Cyberpunk and CS2, I already have a monitor, I want it to be quiet."
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
          <ArrowLeft /> Back
        </Button>

        {isLast ? (
          <Button onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {busy ? 'Designing your build…' : 'Generate build'}
          </Button>
        ) : (
          <Button onClick={() => go(visibleStep + 1)} disabled={busy}>
            Continue <ArrowRight />
          </Button>
        )}
      </div>
    </div>
  );
}
