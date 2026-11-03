/**
 * AI Advisor agent.
 *
 * Same loop shape as the builder, but the output is prose. Tool calls are
 * executed locally, their results are fed back, and the model streams the
 * answer. Citations are extracted from `[[component:<id>|Name]]` markers and
 * validated against IDs the tools actually returned.
 */
import type { ChatMessage, GeminiContent, GeminiContentPart, GenerateResult, ToolCall } from '@/types/ai';
import { AIError } from '@/types/ai';
import type { PCComponent } from '@/types/components';
import { ToolExecutor } from './aiTools';
import { warmCatalogueForAI } from '@/hooks/useComponents';
import { geminiClient } from './geminiService';
import { ADVISOR_TOOLS, advisorSystemInstruction } from './prompts/advisor';
import { detectLocale } from './prompts/buildGenerator';

const MAX_TOOL_ROUNDS = 2;
const MAX_TOOL_CALLS = 4;
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

function modelTurn(result: GenerateResult): GeminiContent {
  if (result.modelParts?.length) return { role: 'model', parts: result.modelParts };
  return {
    role: 'model',
    parts: result.toolCalls.map((c) => ({
      functionCall: { name: c.name, args: c.args, ...(c.id ? { id: c.id } : {}) },
    })),
  };
}

function buildContextInstruction(context?: AdvisorContext): string {
  if (!context?.build) {
    return context?.budget
      ? `\n\nUSER BUDGET (Egyptian pounds): ${Math.round(context.budget).toLocaleString('en-EG')} EGP.`
      : '';
  }

  const snapshot = {
    name: context.build.name,
    totalPriceEgp: Math.round(context.build.totalPrice),
    totalWatts: Math.round(context.build.totalWatts),
    buildScore: context.build.buildScore,
    compatibility: context.build.compatibility ?? { errors: [], warnings: [] },
    items: context.build.items.map((c) => ({
      id: c.id,
      category: c.category,
      name: c.name,
      priceEgp: Math.round(c.price),
      specs: c.specs,
    })),
  };
  return `\n\nCURRENT BUILD SNAPSHOT (authoritative live app state; all prices are EGP):\n${JSON.stringify(snapshot)}\nUse these exact parts and values. Do not call a tool just to read the build.`;
}

/** Keep tools off the hot path for explanatory questions. This prevents a
 * generic question from needlessly entering a multi-request catalogue loop. */
export function selectAdvisorTools(question: string, hasBuild: boolean): typeof ADVISOR_TOOLS {
  const q = question.toLowerCase();
  const catalogIntent = /(رشح|رشحلي|اقترح|اختار|اختيار|اشتري|شراء|سعر|اسعار|الأسعار|ميزانيه|ميزانية|تجميعة|تجميعه|كرت شاشة|كارت شاشة|معالج|بروسيسور|رامات|مزود طاقة|مزود الباور|gpu|cpu|motherboard|graphics card|recommend|suggest|best .*?(gpu|cpu|ram|pc|part)|price|budget|build me|buy|shopping)/i.test(q);
  const compatibilityIntent = /(توافق|متوافق|compatible|compatibility|bottleneck|عنق الزجاجة|عنق زجاجه|ترقية|ترقيه|upgrade|power supply|psu|مزود طاقة)/i.test(q);
  const alternativesIntent = /(بديل|بدائل|أرخص|ارخص|alternative|alternatives|cheaper|replace|استبدل)/i.test(q);
  const detailsIntent = /(مواصفات|تفاصيل|سرعة|استهلاك|حرارة|ضمان|specs|details|warranty|power draw|temperature)/i.test(q);
  const selected = new Set<string>();

  if (catalogIntent) selected.add('list_components');
  if (alternativesIntent) selected.add('suggest_alternatives');
  if (detailsIntent) selected.add('get_component_details');
  if (hasBuild && compatibilityIntent) selected.add('check_compatibility');

  return ADVISOR_TOOLS.filter((tool) => selected.has(tool.name));
}

/**
 * Run the advisor for one user turn. Streams tokens via `onToken`.
 * Throws AIError (rate limit / auth / network) so the page can react precisely.
 */
export async function askAdvisor(options: AdvisorOptions): Promise<AdvisorAnswer> {
  const { history, question, context, onToken, signal } = options;
  const hasBuild = Boolean(context?.build?.items.length);

  const executor = new ToolExecutor();
  if (context?.build) executor.register(context.build.items);

  const recentHistory = history.slice(-6).map((message) => ({
    ...message,
    content: message.content.length > 1_500 ? `${message.content.slice(0, 1_500)}\n[Earlier content trimmed]` : message.content,
  }));
  const contents = toContents(recentHistory, question);
  const typed = detectLocale(question);
  const locale = typed === 'ar' ? 'ar' : (options.locale ?? typed);
  const tools = selectAdvisorTools(question, hasBuild);
  const systemInstruction = `${advisorSystemInstruction(hasBuild, locale)}${buildContextInstruction(context)}`;

  // Warm the data source while Gemini is producing its first streamed turn.
  // The AI-specific catalogue path skips the secondary Sigma feed, and the
  // catalogue module coalesces concurrent loads and caches the result.
  if (tools.some((tool) => tool.name === 'list_components')) warmCatalogueForAI();

  let text = '';
  let toolCallsUsed = 0;

  // Most questions need one generation. Catalogue questions usually need two
  // (tool request + final answer); a third no-tools pass is only used if the
  // model insists on another tool batch.
  for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
    if (signal?.aborted) throw new AIError('aborted', 'Cancelled.');

    const allowTools = round < MAX_TOOL_ROUNDS && tools.length > 0 && toolCallsUsed < MAX_TOOL_CALLS;
    const result = await geminiClient.generate(contents, {
      model: 'chat',
      systemInstruction,
      ...(allowTools ? { tools } : {}),
      temperature: 0.6,
      thinkingLevel: 'MINIMAL',
      maxOutputTokens: 1_200,
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

    contents.push(modelTurn(result));
    const remainingBudget = Math.max(0, MAX_TOOL_CALLS - toolCallsUsed);
    const callsToRun = result.toolCalls.slice(0, remainingBudget);
    toolCallsUsed += callsToRun.length;

    const parts = await Promise.all(result.toolCalls.map(async (call, index): Promise<GeminiContentPart> => {
      if (!allowTools || index >= callsToRun.length || !tools.some((tool) => tool.name === call.name)) {
        return { functionResponse: {
          name: call.name,
          response: { error: 'Tool budget reached or this tool is not enabled for this question. Answer using the available context.' },
          ...(call.id ? { id: call.id } : {}),
        } };
      }
      try {
        const { result: toolResult, summary } = await executor.run(call as ToolCall);
        options.onTool?.({ name: call.name, summary });
        return { functionResponse: { name: call.name, response: toolResult, ...(call.id ? { id: call.id } : {}) } };
      } catch (error) {
        return { functionResponse: {
          name: call.name,
          response: { error: error instanceof Error ? error.message : 'Tool failed' },
          ...(call.id ? { id: call.id } : {}),
        } };
      }
    }));
    contents.push({ role: 'user', parts });
  }

  return { text: text.trim(), citations: extractCitations(text, executor) };
}

/**
 * Pull citation markers out of the answer and keep only IDs the agent could
 * legitimately know about (returned by a tool, or part of the loaded build).
 */
function extractCitations(text: string, executor: ToolExecutor): string[] {
  const ids = new Set<string>();
  for (const match of text.matchAll(CITATION_PATTERN)) {
    const id = match[1];
    if (id && executor.hasSeen(id)) ids.add(id);
  }
  return Array.from(ids);
}
