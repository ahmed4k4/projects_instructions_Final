import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion, useReducedMotion } from 'framer-motion';
import { Bot, Boxes, User } from 'lucide-react';
import type { ChatMessage } from '@/types/ai';
import { cn } from '@/lib/utils';
import { EASE_OUT } from '@/lib/motion';
import { formatStructured, parseStructured, type StructuredPayload } from '@/lib/displayText';

const CITATION = /\[\[component:([a-zA-Z0-9-]+)\|([^\]]+)\]\]/g;

/** Renders `[[component:<id>|Name]]` markers as chips, everything else as markdown. */
function preprocess(text: string, onCite?: (id: string) => void): ReactNode {
  if (!onCite) return text;
  const parts: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  const pattern = new RegExp(CITATION.source, 'g');

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const id = match[1]!;
    parts.push(
      <button
        key={`${id}-${match.index}`}
        type="button"
        onClick={() => onCite(id)}
        className="mx-0.5 inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 align-baseline text-[11px] font-medium text-primary-glow transition hover:bg-primary/20"
      >
        {match[2]}
      </button>,
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

interface StreamingMessageProps {
  message: ChatMessage;
  /** True while tokens are still arriving (draws the cursor). */
  streaming?: boolean;
  onCitation?: (id: string) => void;
}

/**
 * Render a model answer that is entirely JSON as a card instead of prose.
 *
 * A structured recommendation used to reach the DOM through `.join('')` and
 * render as `[object Object]`. When the payload is recognisable the relevant
 * fields get a real card; anything else is shown as formatted JSON inside a
 * `<pre>`, which is at least readable and never lies about its shape.
 */
function StructuredAnswer({ payload }: { payload: StructuredPayload }) {
  const { t } = useTranslation();

  if (payload.kind === 'component' || payload.kind === 'build') {
    const data = payload.data;
    const title = String(data.name ?? data.title ?? data.label ?? '');
    const fields = Object.entries(data).filter(
      ([key, value]) =>
        !['name', 'title', 'label', 'specs', 'items', 'components', 'parts'].includes(key) &&
        (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'),
    );

    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
          <Boxes className="size-3.5" />
          {payload.kind === 'build' ? t('advisor.structured.build') : t('advisor.structured.component')}
        </div>
        {title && <p className="text-sm font-semibold text-foreground">{title}</p>}
        {fields.length > 0 && (
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            {fields.map(([key, value]) => (
              <div key={key} className="min-w-0">
                <dt className="text-[10.5px] uppercase tracking-wide text-muted-foreground">{key}</dt>
                <dd className="truncate font-mono text-xs text-foreground/90" dir="auto">
                  {String(value)}
                </dd>
              </div>
            ))}
          </dl>
        )}
        {payload.kind === 'build' &&
          (() => {
            const raw = data.items ?? data.components ?? data.parts;
            if (!Array.isArray(raw) || raw.length === 0) return null;
            return (
              <ul className="space-y-1">
                {raw.slice(0, 12).map((entry, index) => {
                  const item = (entry ?? {}) as Record<string, unknown>;
                  return (
                    <li
                      key={index}
                      className="flex justify-between gap-3 border-t border-border/60 pt-1 text-xs"
                    >
                      <span className="truncate">{String(item.name ?? '—')}</span>
                      <span className="shrink-0 font-mono text-muted-foreground">{String(item.price ?? '')}</span>
                    </li>
                  );
                })}
              </ul>
            );
          })()}
      </div>
    );
  }

  return (
    <pre
      className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-surface-inset p-3 font-mono text-[11.5px] leading-relaxed text-foreground/90"
      dir="ltr"
    >
      {formatStructured(payload.data)}
    </pre>
  );
}

export function StreamingMessage({ message, streaming = false, onCitation }: StreamingMessageProps) {
  const reduce = useReducedMotion();
  const isUser = message.role === 'user';

  /**
   * A message that is entirely JSON is data, not prose.
   *
   * `parseStructured` returns null while a stream is still arriving (the body
   * does not parse yet), so the streaming path is unaffected — the card appears
   * when the answer is complete.
   */
  const structured = isUser ? null : parseStructured(message.content);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0 : 0.25, ease: EASE_OUT }}
      className={cn('flex gap-3', isUser && 'flex-row-reverse')}
    >
      <span
        className={cn(
          'mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border',
          isUser
            ? 'border-border-strong bg-surface-elevated text-foreground'
            : 'border-primary/25 bg-primary/10 text-primary-glow',
        )}
        aria-hidden
      >
        {isUser ? <User className="size-4" /> : <Bot className="size-4" />}
      </span>

      <div
        className={cn(
          'min-w-0 max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed',
          isUser
            ? 'bg-primary/15 text-foreground'
            : 'border border-border bg-surface-elevated/60 text-foreground/90',
        )}
      >
        {message.content.length === 0 && streaming ? (
          <TypingDots />
        ) : isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : structured ? (
          <StructuredAnswer payload={structured} />
        ) : (
          <div className="prose-nexus space-y-2 [&_code]:rounded [&_code]:bg-surface-inset [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[12px] [&_h3]:mt-3 [&_h3]:text-sm [&_h3]:font-semibold [&_li]:ms-4 [&_li]:list-disc [&_strong]:text-foreground">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {String(preprocess(message.content, onCitation))}
            </ReactMarkdown>
            {streaming && (
              <motion.span
                aria-hidden
                className="ms-0.5 inline-block h-4 w-[2px] translate-y-0.5 bg-primary-glow"
                animate={reduce ? undefined : { opacity: [1, 0.2, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
              />
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

export function TypingDots() {
  const reduce = useReducedMotion();
  const { t } = useTranslation();
  return (
    <span className="flex items-center gap-1" aria-label={t('common.assistantTyping')}>
      {[0, 1, 2].map((index) => (
        <motion.span
          key={index}
          className="size-1.5 rounded-full bg-muted-foreground"
          animate={reduce ? undefined : { opacity: [0.25, 1, 0.25], y: [0, -3, 0] }}
          transition={{ duration: 1.1, repeat: Infinity, delay: index * 0.15, ease: 'easeInOut' }}
        />
      ))}
    </span>
  );
}
