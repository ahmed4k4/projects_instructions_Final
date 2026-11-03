/**
 * Smart Builder agent loop.
 *
 * The browser owns the loop (rather than the model) because the tools run
 * deterministic engines that must execute client-side or against Postgres:
 *
 *   user turn ──▶ Gemini ──▶ tool calls ──▶ aiTools executor ──▶ results
 *                    ▲                                            │
 *                    └──────────────── repeat (≤ 8 rounds) ◀───────┘
 *
 * Guard rails
 *   · Every component ID is validated against what the tools actually returned.
 *     An invented ID → one corrective re-prompt → still invalid → fallback.
 *   · Any transport failure (no key configured, rate limit, outage, abort) also
 *     degrades to `fallbackBuild`, so the user always gets a usable build.
 *   · Streaming tokens are forwarded as narration for the thinking panel.
 */
import type { AIBuildRequest, AIBuildResponse, GenerateResult, GeminiContent, ToolCall } from '@/types/ai';
import { AIError } from '@/types/ai';
import type { PCComponent } from '@/types/components';
import type { PCComponent as Component } from '@/types/components';
import { ToolExecutor, validateFinalBuild } from './aiTools';
import { geminiClient } from './geminiService';
import {
  buildCorrectionInstruction,
  buildSystemInstruction,
  buildTools,
  buildUserInstruction,
} from './prompts/buildGenerator';
import { fallbackBuild } from '@/lib/scoring/fallbackBuild';
import { loadCatalogue } from '@/hooks/useComponents';

const MAX_TOOL_ROUNDS = 3;

export interface BuildAgentOptions {
  /** Streamed narration text ("Starting with the GPU — …"). */
  onNarration?: (chunk: string) => void;
  onTool?: (trace: { name: string; summary: string }) => void;
  signal?: AbortSignal;
}

interface FinalizePayload {
  buildName: string;
  items: Array<{ category: string; componentId: string; reason: string }>;
  explanation: string;
}

function extractFinalize(toolCalls: ToolCall[]): FinalizePayload | null {
  const call = toolCalls.find((c) => c.name === 'finalize_build');
  if (!call) return null;
  const args = call.args as Partial<FinalizePayload>;
  if (!Array.isArray(args.items) || args.items.length === 0) return null;
  return {
    buildName:
      typeof args.buildName === 'string' && args.buildName.trim() ? args.buildName.trim() : 'Custom Build',
    items: args.items
      .filter((i) => i && typeof i.componentId === 'string')
      .map((i) => ({
        category: String(i.category ?? ''),
        componentId: i.componentId,
        reason: String(i.reason ?? '').trim() || 'Selected for this budget.',
      })),
    explanation: String(args.explanation ?? '').trim(),
  };
}

async function catalogue(): Promise<PCComponent[]> {
  try {
    return await loadCatalogue();
  } catch {
    return [];
  }
}

function toolResultPart(name: string, response: Record<string, unknown>, id?: string): GeminiContent {
  return {
    role: 'user',
    parts: [{ functionResponse: { name, response, ...(id ? { id } : {}) } }],
  };
}

/**
 * The model's turn to append to the conversation.
 *
 * Prefers the provider's raw parts: they carry the `thoughtSignature` that
 * Gemini requires when a tool loop continues. Rebuilding a model turn from
 * `toolCalls` alone is what produced the Phase 5 `400 … missing a
 * thought_signature` failure, so the hand-built path only remains as a
 * last-resort guard.
 */
function modelTurn(result: GenerateResult): GeminiContent {
  if (result.modelParts?.length) return { role: 'model', parts: result.modelParts };
  return {
    role: 'model',
    parts: result.toolCalls.map((c) => ({
      functionCall: { name: c.name, args: c.args, ...(c.id ? { id: c.id } : {}) },
    })),
  };
}

/**
 * Run the agent and return a validated build. Never throws — every failure
 * path returns a fallback build with a `degradedReason`.
 */
export async function generateBuild(
  req: AIBuildRequest,
  options: BuildAgentOptions = {},
): Promise<AIBuildResponse> {
  const executor = new ToolExecutor();
  const tools = buildTools();

  const contents: GeminiContent[] = [{ role: 'user', parts: [{ text: buildUserInstruction(req) }] }];

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      if (options.signal?.aborted) throw new AIError('aborted', 'Cancelled.');

      const result: GenerateResult = await geminiClient.generate(contents, {
        model: 'chat',
        systemInstruction: buildSystemInstruction(),
        tools,
        temperature: 0.4,
        onToken: options.onNarration,
        maxOutputTokens: 1_536,
        thinkingLevel: 'MINIMAL',
        signal: options.signal,
      });

      // The model is done: either it finalised or it just talked.
      const finalize = extractFinalize(result.toolCalls);
      if (finalize) {
        const unknown = validateFinalBuild(finalize.items, executor);
        if (unknown.length === 0) {
          return await materialise(finalize, executor);
        }

        // One corrective attempt, then deterministic fallback.
        contents.push(modelTurn(result));
        contents.push({ role: 'user', parts: [{ text: buildCorrectionInstruction(unknown) }] });

        if (round + 1 >= MAX_TOOL_ROUNDS) break;
        continue;
      }

      if (result.toolCalls.length === 0) {
        // No tool call and nothing to finalise → ask once for the final answer.
        contents.push({ role: 'model', parts: [{ text: result.text || '…' }] });
        contents.push({
          role: 'user',
          parts: [{ text: 'Call finalize_build now with the components you selected.' }],
        });
        continue;
      }

      // Execute the tool calls and feed the results back.
      contents.push(modelTurn(result));

      const responseParts = await Promise.all(result.toolCalls.map(async (call): Promise<GeminiContent> => {
        try {
          const { result: toolResult, summary } = await executor.run(call);
          options.onTool?.({ name: call.name, summary });
          return toolResultPart(call.name, toolResult, call.id);
        } catch (error) {
          return toolResultPart(
            call.name,
            { error: error instanceof Error ? error.message : 'Tool failed' },
            call.id,
          );
        }
      }));
      contents.push(...responseParts);
    }

    return await degraded(req, 'the assistant did not finalise a valid build', executor);
  } catch (error) {
    if (error instanceof AIError && error.code === 'aborted') throw error;
    const reason =
      error instanceof AIError
        ? error.code === 'rate_limited'
          ? 'rate limit reached'
          : error.code === 'not_configured'
            ? 'AI is not configured on the server'
            : error.message
        : 'unexpected AI error';
    return degraded(req, reason, executor);
  }
}

/** Resolve the model's IDs to real rows and attach prices/totals. */
async function materialise(payload: FinalizePayload, executor: ToolExecutor): Promise<AIBuildResponse> {
  const components = await executor.resolve(payload.items.map((i) => i.componentId));
  const byId = new Map(components.map((c) => [c.id, c]));

  const items = payload.items
    .map((item) => {
      const component = byId.get(item.componentId);
      if (!component) return null;
      return { category: component.category, componentId: component.id, reason: item.reason };
    })
    .filter((i): i is NonNullable<typeof i> => Boolean(i));

  if (items.length === 0) throw new AIError('upstream_error', 'The build contained no resolvable parts.');

  const totalPrice = items.reduce((sum, i) => sum + (byId.get(i.componentId)?.price ?? 0), 0);

  return {
    buildName: payload.buildName,
    items,
    totalPrice: Math.round(totalPrice),
    explanation:
      payload.explanation ||
      'Selected for a balanced mix of performance, compatibility and value at this budget.',
    source: 'ai',
  };
}

async function degraded(
  req: AIBuildRequest,
  reason: string,
  _executor: ToolExecutor,
): Promise<AIBuildResponse> {
  const rows = await catalogue();
  return fallbackBuild(req, rows, reason);
}

/**
 * Refine an existing build with a natural-language instruction.
 *
 * Only the *names* of the current parts are shown to the model — never their
 * IDs — so it still has to fetch replacements through list_components. That
 * keeps the "no invented IDs" invariant true for refinements too.
 */
export async function refineBuild(
  current: Component[],
  instruction: string,
  req: AIBuildRequest,
  options: BuildAgentOptions = {},
): Promise<AIBuildResponse> {
  const inventory = current.map((c) => `- ${c.category}: ${c.name} (EGP ${Math.round(c.price).toLocaleString('en-EG')})`).join('\n');

  const notes = [
    req.notes,
    current.length ? `The user already has this build:\n${inventory}` : '',
    `Requested change: ${instruction}`,
    'Keep the current parts where they still fit; only replace what the change requires.',
  ]
    .filter(Boolean)
    .join('\n');

  return generateBuild({ ...req, notes }, options);
}
