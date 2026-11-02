import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion, useReducedMotion } from 'framer-motion';
import { Bot, User } from 'lucide-react';
import type { ChatMessage } from '@/types/ai';
import { cn } from '@/lib/utils';
import { EASE_OUT } from '@/lib/motion';

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

export function StreamingMessage({ message, streaming = false, onCitation }: StreamingMessageProps) {
  const reduce = useReducedMotion();
  const isUser = message.role === 'user';

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
