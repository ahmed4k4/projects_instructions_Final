import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EASE_OUT } from '@/lib/motion';

export interface ToolStep {
  name: string;
  summary: string;
  done: boolean;
}

interface AIThinkingPanelProps {
  narration: string;
  steps: ToolStep[];
  phase: 'thinking' | 'done' | 'error';
  error?: string;
  className?: string;
}

/**
 * Live view of what the agent is doing: a narration line that grows as tokens
 * stream in, plus a checklist of tool calls. Announcements are polite so the
 * stream is not read out character by character.
 */
export function AIThinkingPanel({ narration, steps, phase, error, className }: AIThinkingPanelProps) {
  const reduce = useReducedMotion();
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [narration]);

  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-primary/20 bg-surface/70 backdrop-blur',
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <span
          className={cn(
            'grid size-6 place-items-center rounded-md',
            phase === 'error' ? 'bg-danger/15 text-danger' : 'bg-primary/15 text-primary-glow',
          )}
        >
          {phase === 'thinking' ? (
            <Loader2 className={cn('size-3.5', !reduce && 'animate-spin')} />
          ) : (
            <Sparkles className="size-3.5" />
          )}
        </span>
        <p className="text-xs font-medium">
          {phase === 'thinking'
            ? t('thinking.building')
            : phase === 'error'
              ? t('thinking.failed')
              : t('thinking.complete')}
        </p>
      </div>

      <div ref={scrollRef} className="max-h-40 overflow-y-auto px-4 py-3" aria-live="polite">
        {narration ? (
          <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
            {narration}
            {phase === 'thinking' && (
              <motion.span
                aria-hidden
                className="ms-0.5 inline-block h-3 w-[2px] translate-y-0.5 bg-primary-glow"
                animate={reduce ? undefined : { opacity: [1, 0.2, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
              />
            )}
          </p>
        ) : phase === 'thinking' ? (
          <ShimmerLines />
        ) : null}

        {error && <p className="mt-2 text-xs text-danger">{error}</p>}

        {steps.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {steps.map((step, index) => (
              <motion.li
                key={`${step.name}-${index}`}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: reduce ? 0 : 0.2, ease: EASE_OUT }}
                className="flex items-center gap-2 text-[11px]"
              >
                {step.done ? (
                  <Check className="size-3 shrink-0 text-success" />
                ) : (
                  <Loader2
                    className={cn('size-3 shrink-0 text-muted-foreground', !reduce && 'animate-spin')}
                  />
                )}
                <span className={step.done ? 'text-muted-foreground' : 'text-foreground'}>
                  {step.summary}
                </span>
              </motion.li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ShimmerLines() {
  return (
    <div className="space-y-2">
      {['w-full', 'w-11/12', 'w-3/4'].map((width, index) => (
        <div key={index} className={cn('shimmer h-2.5 rounded bg-surface-elevated', width)} />
      ))}
    </div>
  );
}
