import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { nanoid } from 'nanoid';
import { ArrowUp, Bot, Loader2, RotateCcw, Sparkles, Square, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/input';
import { StreamingMessage, TypingDots } from '@/components/shared/StreamingMessage';
import { AIStatusPanel } from '@/components/domain/AIStatusPanel';
import type { ChatMessage } from '@/types/ai';
import { AIError } from '@/types/ai';
import { askAdvisor, type AdvisorContext } from '@/services/advisorAgent';
import { advisorSuggestions } from '@/services/prompts/advisor';
import { useBuildStore } from '@/store/useBuildStore';
import { useUIStore } from '@/store/useUIStore';
import { EASE_OUT, makeStagger, staggerItem } from '@/lib/motion';
import { appendText, toDisplayText } from '@/lib/displayText';
import { cn } from '@/lib/utils';

const stagger = makeStagger(0.05, 0.02);

export default function AIAdvisor() {
  const { t } = useTranslation();
  const language = useUIStore((state) => state.language);

  // Re-localises on language switch: `t` is not referentially stable across
  // `changeLanguage`, so the language is an explicit dependency.
  const welcome = useMemo<ChatMessage>(
    () => ({
      id: 'welcome',
      role: 'assistant',
      createdAt: new Date().toISOString(),
      content: t('advisor.welcome'),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, language],
  );

  const [messages, setMessages] = useState<ChatMessage[]>([welcome]);
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);
  const [toolNote, setToolNote] = useState<string | null>(null);
  const [lastError, setLastError] = useState<AIError | null>(null);
  /** Last question the user asked â€” what "Retry" must resend. */
  const [lastQuestion, setLastQuestion] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pendingTokensRef = useRef('');
  const tokenFrameRef = useRef<number | null>(null);
  const activeAssistantIdRef = useRef<string | null>(null);

  // Batch streamed chunks to one React update per animation frame. The old
  // implementation re-rendered every message and smooth-scrolled for every
  // token, which was especially expensive on mid-range phones.
  const flushTokenBuffer = () => {
    if (tokenFrameRef.current !== null) {
      cancelAnimationFrame(tokenFrameRef.current);
      tokenFrameRef.current = null;
    }
    const chunk = pendingTokensRef.current;
    pendingTokensRef.current = '';
    const targetId = activeAssistantIdRef.current;
    if (!chunk || !targetId) return;
    setMessages((prev) => prev.map((m) =>
      m.id === targetId ? { ...m, content: appendText(m.content, chunk), pending: true } : m,
    ));
  };

  const items = useBuildStore((state) => state.items);
  const budget = useBuildStore((state) => state.budget);

  const buildItems = Object.values(items).filter((c): c is NonNullable<typeof c> => Boolean(c));
  const hasBuild = buildItems.length > 0;

  const context: AdvisorContext = hasBuild
    ? {
        build: {
          name: t('advisor.currentBuild'),
          items: buildItems,
          totalPrice: buildItems.reduce((sum, c) => sum + c.price, 0),
          totalWatts: buildItems.reduce((sum, c) => sum + (c.powerDrawWatts ?? 0), 0),
          buildScore: null,
        },
        budget,
      }
    : { budget };

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    // Keep the view pinned only while the user is already near the latest turn.
    if (distanceFromBottom < 180) node.scrollTop = node.scrollHeight;
  }, [messages, thinking]);

  // Cancel an in-flight request and pending frame when the user leaves.
  useEffect(() => () => {
    abortRef.current?.abort();
    if (tokenFrameRef.current !== null) cancelAnimationFrame(tokenFrameRef.current);
  }, []);

  const send = async (content: string) => {
    const text = content.trim();
    if (!text || thinking) return;

    const userMessage: ChatMessage = {
      id: nanoid(8),
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    };
    const assistantId = nanoid(8);
    activeAssistantIdRef.current = assistantId;
    pendingTokensRef.current = '';

    setMessages((prev) => [
      ...prev,
      userMessage,
      { id: assistantId, role: 'assistant', content: '', createdAt: new Date().toISOString(), pending: true },
    ]);
    setDraft('');
    setThinking(true);
    setToolNote(null);
    setLastError(null);
    setLastQuestion(text);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const answer = await askAdvisor({
        history: messages
          .filter((m) => m.id !== 'welcome')
          .map((m) => ({ role: m.role, content: m.content })),
        question: text,
        context,
        locale: language,
        signal: controller.signal,
        onToken: (token) => {
          pendingTokensRef.current += token;
          if (tokenFrameRef.current === null) {
            tokenFrameRef.current = requestAnimationFrame(() => flushTokenBuffer());
          }
        },
        onTool: (event) => setToolNote(event.summary),
      });

      flushTokenBuffer();
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: toDisplayText(answer.text) || m.content, pending: false, citations: answer.citations }
            : m,
        ),
      );
    } catch (error) {
      flushTokenBuffer();
      if (error instanceof AIError && error.code === 'aborted') {
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, pending: false } : m)));
        toast('Message cancelled');
      } else {
        const aiError =
          error instanceof AIError
            ? error
            : new AIError('network', t('advisor.errors.network'));
        setLastError(aiError);
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));

        if (aiError.code === 'rate_limited') {
          toast.error(t('advisor.errors.rateToast'), { description: aiError.message });
        } else if (aiError.code === 'unauthorized') {
          toast.error(t('advisor.errors.expired'), { description: aiError.message });
        } else {
          toast.error(t('advisor.errors.generic'), { description: aiError.message });
        }
      }
    } finally {
      setThinking(false);
      setToolNote(null);
      abortRef.current = null;
      activeAssistantIdRef.current = null;
      textareaRef.current?.focus();
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
  };

  const reset = () => {
    abortRef.current?.abort();
    pendingTokensRef.current = '';
    activeAssistantIdRef.current = null;
    if (tokenFrameRef.current !== null) { cancelAnimationFrame(tokenFrameRef.current); tokenFrameRef.current = null; }
    setMessages([welcome]);
    setLastError(null);
    setThinking(false);
  };

  const suggestions = advisorSuggestions(hasBuild, budget, language);

  return (
    <div className="container flex max-w-5xl flex-col py-8 lg:py-10">
      <PageHeader
        eyebrow={t('nav.advisor')}
        title={t('advisor.title')}
        description={
          hasBuild
            ? t('advisor.descriptionBuild', { count: buildItems.length })
            : t('advisor.descriptionGeneral')
        }
        breadcrumbs={[{ label: t('nav.workspace'), to: '/' }, { label: t('nav.advisor') }]}
        actions={
          <>
            <Badge variant={hasBuild ? 'success' : 'default'}>
              {hasBuild ? t('advisor.buildContext') : t('advisor.general')}
            </Badge>
            <Button variant="ghost" size="sm" onClick={reset} disabled={messages.length <= 1}>
              <RotateCcw /> {t('common.reset')}
            </Button>
          </>
        }
      />

      <div className="mt-8 flex flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-surface/60 backdrop-blur-xl">
        <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto p-5 sm:p-7">
          {messages.length === 1 && (
            <motion.div
              variants={stagger}
              initial="hidden"
              animate="visible"
              className="mx-auto max-w-xl py-8 text-center"
            >
              <motion.div
                variants={staggerItem}
                className="mx-auto grid size-14 place-items-center rounded-2xl border border-primary/25 bg-primary/10"
              >
                <Bot className="size-6 text-primary-glow" />
              </motion.div>
              <motion.h2 variants={staggerItem} className="mt-5 text-xl font-semibold tracking-tight">
                {t('advisor.welcomeTitle')}
              </motion.h2>
              <motion.p variants={staggerItem} className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {t('advisor.welcomeBody')}
              </motion.p>

            </motion.div>
          )}

          {messages.map((message) => (
            <StreamingMessage
              key={message.id}
              message={message}
              streaming={message.pending}
              onCitation={(id) => {
                const component = buildItems.find((c) => c.id === id);
                toast.info(component?.name ?? t('nav.builder'), {
                  description: t('advisor.sourceBadge'),
                });
              }}
            />
          ))}

          {toolNote && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 ps-11 text-[11px] text-muted-foreground"
            >
              <Loader2 className="size-3 animate-spin" /> {toolNote}
            </motion.div>
          )}

          {thinking && messages[messages.length - 1]?.content === '' && !toolNote && (
            <div className="flex items-center gap-3">
              <span className="grid size-8 place-items-center rounded-lg border border-primary/25 bg-primary/10 text-primary-glow">
                <Sparkles className="size-4" />
              </span>
              <div className="rounded-xl border border-border bg-surface-elevated/60 px-4 py-3">
                <TypingDots />
              </div>
            </div>
          )}

          {lastError && (
            <div className="rounded-xl border border-danger/25 bg-danger/5 p-4 text-xs text-muted-foreground">
              <p className="font-medium text-danger">
                {lastError.code === 'rate_limited'
                  ? t('advisor.errors.quota')
                  : lastError.code === 'unauthorized'
                    ? t('advisor.errors.expired')
                    : lastError.code === 'not_configured'
                      ? t('advisor.errors.notConfigured')
                      : t('advisor.errors.generic')}
              </p>
              <p className="mt-1">{lastError.message}</p>
              <Button
                size="sm"
                variant="outline"
                className="mt-3"
                onClick={() => send(lastQuestion ?? '')}
              >
                <RotateCcw /> {t('common.retry')}
              </Button>
            </div>
          )}
        </div>

        <div className="border-t border-border px-5 py-3 sm:px-7">
          <AIStatusPanel className="mb-3" />
          <div className="flex flex-wrap gap-2">
            {suggestions.map((suggestion, index) => (
              <motion.button
                key={suggestion}
                type="button"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 * index, duration: 0.25, ease: EASE_OUT }}
                onClick={() => void send(suggestion)}
                className="rounded-full border border-border-strong bg-surface px-3 py-1.5 text-[11.5px] text-muted-foreground transition hover:border-primary/30 hover:text-foreground"
              >
                <Wand2 className="me-1.5 inline size-3" />
                {suggestion}
              </motion.button>
            ))}
          </div>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void send(draft);
          }}
          className="border-t border-border p-4 sm:p-5"
        >
          <div
            className={cn(
              'group flex items-end gap-2 rounded-xl border border-border-strong bg-surface-inset/60 p-2',
              'transition-[border-color,box-shadow] duration-200 focus-within:border-primary/50 focus-within:shadow-glow-sm',
            )}
          >
            <Textarea
              ref={textareaRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void send(draft);
                }
              }}
              rows={1}
              placeholder={
                hasBuild ? t('advisor.placeholderBuild') : t('advisor.placeholderGeneral')
              }
              className="max-h-32 flex-1 border-0 bg-transparent px-2 py-2 focus:ring-0"
            />
            {thinking ? (
              <Button
                type="button"
                size="icon"
                variant="secondary"
                onClick={cancel}
                aria-label={t('advisor.stop')}
              >
                <Square className="fill-current" />
              </Button>
            ) : (
              <Button type="submit" size="icon" disabled={!draft.trim()} aria-label={t('advisor.send')}>
                <ArrowUp />
              </Button>
            )}
          </div>
          <p className="mt-2 text-center text-[10.5px] text-muted-foreground/70">
            {t('advisor.composerHint')}
          </p>
        </form>
      </div>
    </div>
  );
}
