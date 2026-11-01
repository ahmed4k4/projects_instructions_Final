/**
 * AI Advisor agent.
 *
 * Same loop shape as the builder, but the output is prose. Tool calls are
 * executed locally, their results are fed back, and the model streams the
 * answer. Citations are extracted from `[[component:<id>|Name]]` markers and
 * validated against IDs the tools actually returned.
 */
import type { ChatMessage, GeminiContent, GeminiContentPart, ToolCall } from '@/types/ai';
import { AIError } from '@/types/ai';
import type { PCComponent } from '@/types/components';
import { ToolExecutor } from './aiTools';
import { geminiClient } from './geminiService';
import { ADVISOR_TOOLS, advisorSystemInstruction } from './prompts/advisor';
import { detectLocale } from './prompts/buildGenerator';

const MAX_TOOL_ROUNDS = 5;
const CITATION_PATTERN = /\[\[component:([a-zA-Z0-9-]+)\|([^\]]+)\]\]/g;

export interface AdvisorContext {
  /** Components of the build the user is looking at (may be empty). */
  build?: {
    name: string;
    items: PCComponent[];
    totalPrice: number;
    totalWatts: number;
    buildScore: number | null;
    compatibility?: { errors: string[]; warnings: string[] };
  };
  budget?: number;
}

export interface AdvisorOptions {
  history: Array<Pick<ChatMessage, 'role' | 'content'>>;
  question: string;
  context?: AdvisorContext;
  /** UI language; the prompt asks the model to answer in it. */
  locale?: 'en' | 'ar';
  onToken: (token: string) => void;
  onTool?: (t: { name: string; summary: string }) => void;
  signal?: AbortSignal;
}

export interface AdvisorAnswer {
  text: string;
  /** IDs that appeared in a citation marker AND were returned by a tool. */
  citations: string[];
}

/** Convert chat history to Gemini contents. */
function toContents(history: AdvisorOptions['history'], question: string): GeminiContent[] {
  const contents: GeminiContent[] = history
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  contents.push({ role: 'user', parts: [{ text: question }] });
  return contents;
}

function buildSnapshot(context?: AdvisorContext): Record<string, unknown> {
  if (!context?.build) return { build: null };
  return {
    build: {
      name: context.build.name,
      totalPrice: context.build.totalPrice,
      totalWatts: context.build.totalWatts,
      buildScore: context.build.buildScore,
      compatibility: context.build.compatibility ?? { errors: [], warnings: [] },
      items: context.build.items.map((c) => ({
        id: c.id,
        category: c.category,
        name: c.name,
        price: c.price,
        specs: c.specs,
      })),
    },
  };
}

/**
 * Run the advisor for one user turn. Streams tokens via `onToken`.
 * Throws AIError (rate limit / auth / network) so the page can react precisely.
 */
export async function askAdvisor(options: AdvisorOptions): Promise<AdvisorAnswer> {
  const { history, question, context, onToken, signal } = options;
  const hasBuild = Boolean(context?.build?.items.length);

  const executor = new ToolExecutor();
  // Make the build's components "known" so citations to them validate.
  if (context?.build) executor.register(context.build.items);

  const contents = toContents(history, question);
  // The user's own language wins over the UI language: someone typing Arabic in
  // an English UI still expects an Arabic answer. English text falls back to the
  // UI locale, which is what makes "switch mid-conversation" feel natural.
  const typed = detectLocale(question);
  const locale = typed === 'ar' ? 'ar' : (options.locale ?? typed);
  const systemInstruction = advisorSystemInstruction(hasBuild, locale);

  let text = '';

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    if (signal?.aborted) throw new AIError('aborted', 'Cancelled.');

    const result = await geminiClient.generate(contents, {
      model: 'chat',
      systemInstruction,
      tools: ADVISOR_TOOLS,
      temperature: 0.6,
      onToken: (chunk) => {
        text += chunk;
        onToken(chunk);
      },
      signal,
    });

    if (result.toolCalls.length === 0) {
      text = result.text || text;
      break;
    }

    contents.push({
      role: 'model',
      parts: result.toolCalls.map((c) => ({ functionCall: { name: c.name, args: c.args } })),
    });

    const parts: GeminiContentPart[] = [];
    for (const call of result.toolCalls) {
      if (call.name === 'get_build') {
        parts.push({
          functionResponse: { name: 'get_build', response: buildSnapshot(context) },
        });
        continue;
      }

      try {
        const { result: toolResult, summary } = await executor.run(call as ToolCall);
        options.onTool?.({ name: call.name, summary });
        parts.push({ functionResponse: { name: call.name, response: toolResult } });
      } catch (error) {
        parts.push({
          functionResponse: {
            name: call.name,
            response: { error: error instanceof Error ? error.message : 'Tool failed' },
          },
        });
      }
    }
    contents.push({ role: 'user', parts });
  }

  return { text: text.trim(), citations: extractCitations(text, executor) };
}

/**
 * Pull citation markers out of the answer and keep only IDs the agent could
 * legitimately know about (returned by a tool, or part of the loaded build).
 */
export function extractCitations(text: string, executor: ToolExecutor): string[] {
  const ids = new Set<string>();
  for (const match of text.matchAll(CITATION_PATTERN)) {
    const id = match[1];
    if (id && executor.hasSeen(id)) ids.add(id);
  }
  return Array.from(ids);
}

/** Strip markers for plain-text contexts (copy, share, tests). */
export function stripCitationMarkers(text: string): string {
  return text.replace(CITATION_PATTERN, (_m, _id, name: string) => name);
}
