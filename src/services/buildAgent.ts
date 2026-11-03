/**
 * Smart Builder agent loop.
 *
 * The browser owns the loop (rather than the model) because the tools run
 * deterministic engines that must execute client-side or against Postgres:
 *
 *   user turn ──▶ Gemini ──▶ tool calls ──▶ aiTools executor ──▶ results
 *                    ▲                                            │
 *                    └──────────────── repeat (≤ 4 rounds) ◀───────┘
 *
 * Guard rails
 *   · Every component ID is validated against what the tools actually returned.
 *     An invented ID → one corrective re-prompt → still invalid → fallback.
 *   · Any transport failure (no key configured, rate limit, outage, abort) also
 *     degrades to `fallbackBuild`, so the user always gets a usable build.
 *   · Function-calling turns use non-streaming generateContent. The provider's
 *     SSE delta parser is intended for chat text, not lossless multi-tool turns.
 */
import type { AIBuildRequest, AIBuildResponse, GenerateResult, GeminiContent, GeminiContentPart, ToolCall } from '@/types/ai';
import { AIError } from '@/types/ai';
import type { PCComponent } from '@/types/components';
import type { PCComponent as Component } from '@/types/components';
import { ToolExecutor, validateFinalBuild } from './aiTools';
import type { CompactComponent } from './aiTools';
import { geminiClient } from './geminiService';
import {
  buildCorrectionInstruction,
  buildSystemInstruction,
  buildTools,
  buildUserInstruction,
} from './prompts/buildGenerator';
import { fallbackBuild } from '@/lib/scoring/fallbackBuild';
import { ESSENTIAL_CATEGORIES } from '@/lib/compatibility/types';
import { loadCatalogue } from '@/hooks/useComponents';

const MAX_TOOL_ROUNDS = 4;
const MAX_OUTPUT_TOKENS = 8_192;

export interface BuildAgentOptions {
  /** Narration text for the thinking panel, appended after each model turn. */
  onNarration?: (chunk: string) => void;
  onTool?: (trace: { name: string; summary: string }) => void;
  signal?: AbortSignal;
}

interface FinalizePayload {
  buildName: string;
  items: Array<{ category: string; componentId: string; reason: string }>;
  explanation: string;
}

const FINALISE_BUILD_SCHEMA: Record<string, unknown> = {
  type: 'OBJECT',
  properties: {
    buildName: { type: 'STRING' },
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          category: {
            type: 'STRING',
            enum: ['cpu', 'gpu', 'motherboard', 'ram', 'storage', 'psu', 'case', 'cooling'],
          },
          componentId: { type: 'STRING' },
          reason: { type: 'STRING' },
        },
        required: ['category', 'componentId', 'reason'],
      },
    },
    explanation: { type: 'STRING' },
  },
  required: ['buildName', 'items', 'explanation'],
};

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

function parseFinalizeJson(text: string): FinalizePayload | null {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first < 0 || last <= first) return null;
  try {
    const value = JSON.parse(cleaned.slice(first, last + 1)) as Partial<FinalizePayload>;
    if (!Array.isArray(value.items)) return null;
    return {
      buildName: typeof value.buildName === 'string' ? value.buildName : 'Nexus AI Build',
      items: value.items
        .filter((item) => item && typeof item.componentId === 'string')
        .map((item) => ({
          category: String(item.category ?? ''),
          componentId: item.componentId,
          reason: String(item.reason ?? '').trim() || 'Selected for the requested workload and budget.',
        })),
      explanation: typeof value.explanation === 'string' ? value.explanation : '',
    };
  } catch {
    return null;
  }
}

async function catalogue(): Promise<PCComponent[]> {
  try {
    return await loadCatalogue();
  } catch {
    return [];
  }
}

function toolResultPart(name: string, response: Record<string, unknown>, id?: string): GeminiContentPart {
  return { functionResponse: { name, response, ...(id ? { id } : {}) } };
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

/** Append a model turn even when the provider returned prose without function calls. */
function appendModelTurn(contents: GeminiContent[], result: GenerateResult): void {
  const parts = result.modelParts?.length
    ? result.modelParts
    : result.toolCalls.length
      ? result.toolCalls.map((call) => ({
          functionCall: { name: call.name, args: call.args, ...(call.id ? { id: call.id } : {}) },
        }))
      : [{ text: result.text || '…' }];
  contents.push({ role: 'model', parts });
}

/** Keep adjacent user-side instructions in one Gemini turn. */
function appendUserText(contents: GeminiContent[], text: string): void {
  const last = contents[contents.length - 1];
  if (last?.role === 'user') {
    last.parts.push({ text });
    return;
  }
  contents.push({ role: 'user', parts: [{ text }] });
}

/**
 * A bounded terminal recovery call. The original loop may spend every round
 * gathering candidates (the observed production symptom was 27 successful
 * tool calls but no checked selection). At this point all tool results are in
 * the conversation, so ask Gemini to choose ONLY from those real IDs and force
 * the single finalisation function. A result is still subjected to exactly the
 * same deterministic compatibility, platform, and budget checks.
 */
function buildRecoveryContext(req: AIBuildRequest): string {
  return [
    `Primary use case: ${req.useCase}`,
    `Hard total budget: EGP ${Math.round(req.budget)}`,
    req.resolution ? `Target resolution: ${req.resolution}` : '',
    req.performanceTarget ? `Performance target: ${req.performanceTarget}` : '',
    req.preferences?.length ? `Mandatory preferences: ${req.preferences.join(', ')}` : '',
    req.notes?.trim() ? `Additional requirements: ${req.notes.trim()}` : '',
  ].filter(Boolean).join('\n');
}

function snapshotHasRequiredCategories(snapshot: Record<string, CompactComponent[]>): boolean {
  return ESSENTIAL_CATEGORIES.every((category) => (snapshot[category]?.length ?? 0) > 0);
}

/**
 * A fresh, single-purpose AI selection path. It starts from a bounded snapshot
 * of real catalogue rows rather than carrying an exhausted 8-round tool history
 * into a terminal response. The model still chooses every part; IDs, budget,
 * CPU preference and compatibility are checked locally before anything is
 * returned to the user.
 */
async function selectBuildFromSnapshot(
  snapshot: Record<string, CompactComponent[]>,
  executor: ToolExecutor,
  req: AIBuildRequest,
  options: BuildAgentOptions,
): Promise<{ build: AIBuildResponse | null; issue: string }> {
  const missing = ESSENTIAL_CATEGORIES.filter((category) => !(snapshot[category]?.length));
  if (missing.length) return { build: null, issue: `The live catalogue has no candidates for: ${missing.join(', ')}.` };

  const snapshotPrompt = `You must select a complete PC build using only exact component IDs in the authoritative catalogue snapshot below.\n\n${buildRecoveryContext(req)}\n\nRules: keep the sum of selected prices at or below EGP ${Math.round(req.budget)}; include CPU, motherboard, RAM, storage, PSU and case; add a GPU when useful and affordable; include cooling if the chosen CPU needs an included cooler; respect every preference; do not select out_of_stock; never invent IDs. Prefer in_stock, then limited, then unknown stock. Balance performance for the stated workload instead of choosing the highest-priced part in every category. The backend rejects incompatible, over-budget, incomplete or non-catalogue selections. Return one build object with buildName, items (category, componentId, reason) and explanation.\n\nAUTHORITATIVE CATALOGUE SNAPSHOT (all prices EGP):\n${JSON.stringify(snapshot)}`;
  const conversation: GeminiContent[] = [{ role: 'user', parts: [{ text: snapshotPrompt }] }];
  let lastIssue = 'The AI did not return a usable component selection.';
  options.onNarration?.('Choosing a balanced build from the live catalogue and validating it…');

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      let cleaned: FinalizePayload | null = null;
      if (attempt === 0) {
        // Prefer Gemini's constrained JSON mode where available.
        cleaned = await geminiClient.structured<FinalizePayload>(
          conversation,
          FINALISE_BUILD_SCHEMA,
          {
            model: 'quality',
            systemInstruction: `You are Nexus, an expert PC builder. Choose a balanced, technically compatible build only from exact IDs in the authoritative catalogue snapshot. Respect the user's workload, preferences and hard EGP budget. Never invent IDs and never select out_of_stock. Return only JSON matching the response schema. Do not provide a list of options: choose one complete build.`,
            maxOutputTokens: 4096,
            thinkingLevel: 'MEDIUM',
            signal: options.signal,
          },
        );
      } else {
        // Plain JSON generation is an independent fallback if this model/API
        // rejects constrained responseSchema or returns an unparsable schema result.
        const result = await geminiClient.generate(conversation, {
          model: 'quality',
          systemInstruction: `Return exactly one JSON object with buildName, items and explanation. Each item must include category, componentId and reason. Use only IDs from the authoritative catalogue snapshot. No markdown, no prose and no tool calls. Respect the exact validation feedback in the latest user message.`,
          maxOutputTokens: 4096,
          thinkingLevel: 'MEDIUM',
          signal: options.signal,
        });
        cleaned = parseFinalizeJson(result.text);
      }

      if (!cleaned || cleaned.items.length === 0) {
        throw new Error('The AI response did not contain a parseable component selection.');
      }
      cleaned = {
        ...cleaned,
        items: cleaned.items.map((item) => ({
          ...item,
          componentId: item.componentId.trim(),
          reason: item.reason.trim() || 'Selected for the requested workload and budget.',
        })),
      };

      const unknown = validateFinalBuild(cleaned.items, executor);
      if (unknown.length) throw new Error(`The AI returned IDs outside the live catalogue: ${unknown.join(', ')}.`);
      const outOfStock = cleaned.items
        .map((item) => executor.getComponent(item.componentId))
        .filter((component) => component?.stockStatus === 'out_of_stock');
      if (outOfStock.length) throw new Error(`The AI selected confirmed out-of-stock parts: ${outOfStock.map((component) => component?.name).join(', ')}.`);

      const build = await materialise(cleaned, executor, req);
      options.onTool?.({ name: 'finalize_build', summary: `AI selected and verified ${build.items.length} real catalogue parts` });
      return { build, issue: '' };
    } catch (error) {
      if (error instanceof AIError && error.code === 'aborted') throw error;
      lastIssue = error instanceof Error ? error.message : 'Structured AI selection failed.';
      if (error instanceof AIError && ['rate_limited', 'unauthorized', 'not_configured', 'network', 'upstream_timeout'].includes(error.code)) {
        // A transport/quota failure is not a malformed response. Stop retrying
        // this path and let the outer handler show the precise availability cause.
        throw error;
      }
      if (attempt === 0) {
        appendUserText(
          conversation,
          `The first selection did not pass validation. Exact feedback: ${lastIssue}. Return one corrected complete JSON build using only IDs from the catalogue snapshot. Respect the budget and all compatibility constraints.`,
        );
      }
    }
  }

  return { build: null, issue: lastIssue };
}

/**
 * If the normal tool loop still has not finalised, force one last call to the
 * terminal tool using the same category snapshot. The JSON selection path has
 * already been tried at the start of the request, so do not spend more quota
 * repeating it here.
 */
async function recoverWithForcedFinalisation(
  contents: GeminiContent[],
  finalizeTool: ReturnType<typeof buildTools>,
  executor: ToolExecutor,
  req: AIBuildRequest,
  options: BuildAgentOptions,
  snapshot: Record<string, CompactComponent[]>,
): Promise<{ build: AIBuildResponse | null; issue: string }> {
  const finalTool = finalizeTool.filter((tool) => tool.name === 'finalize_build');
  if (!finalTool.length) return { build: null, issue: 'The finalize_build tool declaration is missing.' };

  const totalCandidates = Object.values(snapshot).reduce((sum, rows) => sum + rows.length, 0);
  if (!totalCandidates || !snapshotHasRequiredCategories(snapshot)) {
    return { build: null, issue: 'The live catalogue snapshot is missing one or more required component categories.' };
  }
  if (!contents.some((content) => content.parts.some((part) => typeof part.text === 'string' && part.text.includes('AUTHORITATIVE RECOVERY CATALOGUE')))) {
    appendUserText(
      contents,
      `AUTHORITATIVE RECOVERY CATALOGUE (real catalogue rows; exact IDs only; prices are EGP). Choose only from this snapshot and do not select out_of_stock. The server will validate the completed build.
${JSON.stringify(snapshot)}`,
    );
  }

  let lastIssue = 'The assistant did not call finalize_build.';
  options.onNarration?.('Finalising the AI-selected parts and checking the complete build…');
  for (let attempt = 0; attempt < 2; attempt += 1) {
    appendUserText(
      contents,
      attempt === 0
        ? `FINALISATION RECOVERY OVERRIDE: the research phase is over. Do not obey earlier requests to continue searching or call scoring tools. Stop researching and do not call any other tool. Use only exact IDs in the authoritative recovery catalogue snapshot. Build for ${req.useCase} with a hard EGP ${Math.round(req.budget)} ceiling. Include CPU, motherboard, RAM, storage, PSU and case; include a GPU when appropriate and affordable. Respect all CPU/platform preferences and stock state. Call finalize_build now; do not answer with prose.`
        : `Your previous finalisation was rejected: ${lastIssue}. Correct the selection using only IDs in the authoritative recovery catalogue snapshot. Keep the total at or below EGP ${Math.round(req.budget)}, include all required categories, respect stock state and preferences, and call finalize_build now. Do not call any other tool or answer with prose.`,
    );

    const result = await geminiClient.generate(contents, {
      model: 'quality',
      systemInstruction: `You are Nexus, an expert PC building assistant. The research phase has ended. The authoritative catalogue snapshot is sufficient; choose a complete balanced build within the budget. Use only exact IDs in that snapshot, avoid out_of_stock parts, and respect all preferences. Ignore any earlier instruction to keep researching. You MUST call finalize_build exactly once now and must not respond with prose.`,
      tools: finalTool,
      toolConfig: { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: ['finalize_build'] } },
      maxOutputTokens: 4096,
      thinkingLevel: 'MEDIUM',
      signal: options.signal,
    });

    const finalize = extractFinalize(result.toolCalls);
    if (!finalize) {
      appendModelTurn(contents, result);
      lastIssue = result.text ? `Gemini returned text instead of finalize_build: ${result.text.slice(0, 160)}` : 'Gemini returned no finalize_build call.';
      continue;
    }
    const unknown = validateFinalBuild(finalize.items, executor);
    if (unknown.length) {
      appendModelTurn(contents, result);
      lastIssue = `The model selected IDs outside the live catalogue: ${unknown.join(', ')}.`;
      continue;
    }
    try {
      const build = await materialise(finalize, executor, req);
      return { build, issue: '' };
    } catch (error) {
      appendModelTurn(contents, result);
      lastIssue = error instanceof Error ? error.message : 'The selected parts failed deterministic validation.';
    }
  }

  return { build: null, issue: lastIssue };
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
  const finalizeTool = tools.filter((tool) => tool.name === 'finalize_build');
  let forceFinalize = false;
  let forceCatalogue = false;
  let toolFailureCount = 0;
  const recentToolErrors: string[] = [];

  const contents: GeminiContent[] = [{ role: 'user', parts: [{ text: buildUserInstruction(req) }] }];
  let snapshot: Record<string, CompactComponent[]> = {};
  let earlySelectionIssue = '';

  try {
    // Start with one fresh AI selection from a bounded real catalogue snapshot.
    // This avoids spending the whole tool budget on repeated searches without
    // ever committing to a complete build.
    snapshot = await executor.getFinalisationSnapshot(req.budget, 10);
    if (Object.values(snapshot).some((rows) => rows.length > 0)) {
      const initialSelection = await selectBuildFromSnapshot(snapshot, executor, req, options);
      if (initialSelection.build) return initialSelection.build;
      earlySelectionIssue = initialSelection.issue;
      if (earlySelectionIssue) console.warn('[Smart Builder] Initial AI selection did not pass validation; continuing with agent tools.', earlySelectionIssue);
      appendUserText(
        contents,
        `AUTHORITATIVE RECOVERY CATALOGUE (all IDs below are real catalogue rows; prices are EGP). Use these candidates rather than repeatedly searching every category. You may call get_component_details, check_compatibility and get_build_score, then finalize_build.
${JSON.stringify(snapshot)}`,
      );
    }

    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      if (options.signal?.aborted) throw new AIError('aborted', 'Cancelled.');

      const result: GenerateResult = await geminiClient.generate(contents, {
        model: 'quality',
        systemInstruction: buildSystemInstruction(),
        tools: forceFinalize ? finalizeTool : tools,
        ...((forceFinalize || forceCatalogue)
          ? {
              toolConfig: {
                functionCallingConfig: {
                  mode: 'ANY' as const,
                  allowedFunctionNames: [forceFinalize ? 'finalize_build' : 'list_components'],
                },
              },
            }
          : {}),
        temperature: 0.4,
        // Do not stream tool turns: preserve the complete functionCall parts,
        // IDs and thought signatures from one generateContent response.
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        // Smart Builder is a multi-step agent, not a latency-sensitive chat turn.
        // Gemini 3.8 does not support MINIMAL; MEDIUM is the documented agentic level.
        thinkingLevel: 'MEDIUM',
        signal: options.signal,
      });

      if (result.text) options.onNarration?.(result.text);

      // The model is done: either it finalised or it just talked.
      const finalizeCall = result.toolCalls.find((call) => call.name === 'finalize_build');
      const finalize = extractFinalize(result.toolCalls);
      if (finalize) {
        const unknown = validateFinalBuild(finalize.items, executor);
        if (unknown.length === 0) {
          try {
            return await materialise(finalize, executor, req);
          } catch (error) {
            // A final payload can contain real IDs yet still violate a hard rule
            // (budget, socket, required parts, or CPU preference). Give Gemini
            // the exact validation error and a chance to repair it instead of
            // immediately degrading to the rule-based generator.
            const detail = error instanceof Error ? error.message : 'The proposed build failed validation.';
            contents.push(modelTurn(result));
            contents.push({
              role: 'user',
              parts: [{
                text: `The proposed build was rejected by deterministic validation: ${detail}. Re-check the affected parts using the tools, then call finalize_build again with a corrected complete build.`,
              }],
            });
            forceFinalize = false;
            if (round + 1 >= MAX_TOOL_ROUNDS) break;
            continue;
          }
        }

        // Ask for correction when the model invented or reused an unseen ID.
        contents.push(modelTurn(result));
        contents.push({ role: 'user', parts: [{ text: buildCorrectionInstruction(unknown) }] });
        if (round + 1 >= MAX_TOOL_ROUNDS) break;
        continue;
      }

      if (finalizeCall && !finalize) {
        // An empty or malformed terminal payload is not a successful finalisation.
        contents.push(modelTurn(result));
        contents.push({
          role: 'user',
          parts: [{ text: 'Your finalize_build payload was empty or malformed. Call finalize_build again with a non-empty items array containing only IDs returned by list_components.' }],
        });
        forceFinalize = true;
        continue;
      }

      if (result.toolCalls.length === 0) {
        // AUTO mode can return prose instead of the required terminal tool call.
        // After at least one real catalogue result, force the one terminal tool
        // on the next request instead of repeatedly asking in AUTO mode.
        contents.push({
          role: 'model',
          parts: result.modelParts?.length ? result.modelParts : [{ text: result.text || '…' }],
        });
        if (forceFinalize) break;
        if (executor.hasSeenAnyComponents()) {
          contents.push({
            role: 'user',
            parts: [{ text: 'The component research is complete. Submit the selected valid component IDs now using finalize_build. Do not answer with prose.' }],
          });
          forceFinalize = true;
          continue;
        }
        if (!forceCatalogue) {
          contents.push({
            role: 'user',
            parts: [{ text: 'Use list_components to retrieve real catalogue components before choosing. Do not answer with prose.' }],
          });
          forceCatalogue = true;
          continue;
        }
        break;
      }

      // A forced catalogue recovery has succeeded once at least one candidate
      // is exposed to the model. Return to AUTO so it can check, score and choose.
      if (result.toolCalls.some((call) => call.name === 'list_components')) forceCatalogue = false;

      // Execute the tool calls and feed the results back.
      contents.push(modelTurn(result));

      const responseParts = await Promise.all(result.toolCalls.map(async (call): Promise<GeminiContentPart> => {
        try {
          const { result: toolResult, summary } = await executor.run(call);
          options.onTool?.({ name: call.name, summary });
          return toolResultPart(call.name, toolResult, call.id);
        } catch (error) {
          toolFailureCount += 1;
          const detail = error instanceof Error ? error.message : 'Tool failed';
          if (recentToolErrors.length < 5) recentToolErrors.push(`${call.name}: ${detail.slice(0, 140)}`);
          return toolResultPart(
            call.name,
            { error: detail },
            call.id,
          );
        }
      }));
      // Gemini expects all responses to parallel function calls in ONE user
      // turn. Splitting them into consecutive user turns breaks the call/result
      // pairing and can prevent the model from continuing to finalization.
      contents.push({ role: 'user', parts: responseParts });

      // Reserve the final in-loop turn for a terminal tool call. The model must
      // not consume all four rounds with repeated catalogue searches.
      if (round >= MAX_TOOL_ROUNDS - 2 && !forceFinalize && executor.hasSeenAnyComponents()) {
        contents.push({
          role: 'user',
          parts: [{ text: 'The research phase is over. In the next turn call finalize_build with your best complete, budget-compliant selection. Do not search for more components.' }],
        });
        forceFinalize = true;
      }
    }

    // The production failure previously reported 27 successful tool calls but
    // zero validated selections: the model was still researching when the
    // round budget expired. Recover through a final AI-only function call before
    // falling back to a rule-based build.
    const forcedAIResult = await recoverWithForcedFinalisation(
      contents,
      tools,
      executor,
      req,
      options,
      snapshot,
    );
    if (forcedAIResult.build) return forcedAIResult.build;
    const recoveryIssue = [earlySelectionIssue, forcedAIResult.issue].filter(Boolean).join(' | ') || 'No AI selection was produced.';

    // Last-resort AI recovery: if the assistant already assembled a complete
    // selection and the deterministic compatibility tool accepted it, use that
    // exact catalogue selection even if the model forgot its final tool call.
    // This is still an AI-selected build, not a rule-based substitute.
    for (const ids of executor.getValidatedSelections()) {
      const components = await executor.resolve(ids);
      const payload: FinalizePayload = {
        buildName: 'Nexus AI Build',
        items: components.map((component) => ({
          category: component.category,
          componentId: component.id,
          reason: 'Selected by Gemini and verified by the compatibility engine.',
        })),
        explanation: 'Gemini selected these real catalogue components and the compatibility engine verified the selection. The final build was recovered automatically after the assistant omitted its final confirmation.',
      };
      try {
        return await materialise(payload, executor, req);
      } catch {
        // Try the next most recent validated selection.
      }
    }

    const toolBreakdown = executor.trace.reduce<Record<string, number>>((counts, entry) => {
      counts[entry.name] = (counts[entry.name] ?? 0) + 1;
      return counts;
    }, {});
    const diagnostics = {
      rounds: MAX_TOOL_ROUNDS,
      successfulToolCalls: executor.trace.length,
      failedToolCalls: toolFailureCount,
      validatedSelections: executor.getValidatedSelections().length,
      seenComponents: executor.getSeenComponentCount(),
      seenCategories: executor.getSeenCategoryCounts(),
      toolBreakdown,
      recentToolErrors,
    };
    console.warn('[Smart Builder] AI finalisation incomplete; activating fallback.', diagnostics);
    return await degraded(
      req,
      `AI selection could not be finalised (${diagnostics.rounds} research rounds; ${diagnostics.successfulToolCalls} successful tool calls; ${diagnostics.failedToolCalls} tool errors; ${diagnostics.validatedSelections} verified selections; ${diagnostics.seenComponents} catalogue components seen; tools: ${Object.entries(toolBreakdown).map(([name, count]) => `${name}=${count}`).join(', ') || 'none'}; recovery: ${recoveryIssue.slice(0, 220)})`,
      executor,
    );
  } catch (error) {
    if (error instanceof AIError && error.code === 'aborted') throw error;
    const reason =
      error instanceof AIError
        ? error.code === 'not_configured'
          ? 'AI is not configured on the server'
          : error.message
        : error instanceof Error
          ? error.message
          : 'unexpected AI error';
    return degraded(req, reason, executor);
  }
}

/** Resolve the model's IDs to real rows and attach prices/totals. */
async function materialise(payload: FinalizePayload, executor: ToolExecutor, req: AIBuildRequest): Promise<AIBuildResponse> {
  const components = await executor.resolve(payload.items.map((i) => i.componentId));
  const byId = new Map(components.map((c) => [c.id, c]));

  const items = payload.items
    .map((item) => {
      const component = byId.get(item.componentId);
      if (!component) return null;
      if (item.category && item.category !== component.category) {
        throw new AIError('upstream_error', `The AI assigned ${component.name} to ${item.category}, but the catalogue classifies it as ${component.category}.`);
      }
      if (component.stockStatus === 'out_of_stock') {
        throw new AIError('upstream_error', `${component.name} is confirmed out of stock and cannot be selected.`);
      }
      return { category: component.category, componentId: component.id, reason: item.reason };
    })
    .filter((i): i is NonNullable<typeof i> => Boolean(i));

  if (items.length === 0) throw new AIError('upstream_error', 'The build contained no resolvable parts.');
  const selectedCategories = new Set(items.map((item) => item.category));
  const missingCategories = ESSENTIAL_CATEGORIES.filter((category) => !selectedCategories.has(category));
  if (missingCategories.length) {
    throw new AIError('upstream_error', `The build is incomplete. Missing: ${missingCategories.join(', ')}.`);
  }
  const compatibilityErrors = await executor.compatibilityErrors(items.map((item) => item.componentId));
  if (compatibilityErrors.length) throw new AIError('upstream_error', `Incompatible build: ${compatibilityErrors.join('; ')}`);
  if (new Set(items.map((item) => item.category)).size !== items.length) {
    throw new AIError('upstream_error', 'The build contains duplicate component categories.');
  }
  const cpu = components.find((component) => component.category === 'cpu');
  const wantsAMD = req.preferences?.includes('AMD CPU') || /(?:amd|ryzen).{0,24}(?:cpu|processor)|(?:cpu|processor).{0,24}(?:amd|ryzen)/i.test(req.notes ?? '');
  const wantsIntelCore = req.preferences?.includes('Intel CPU') || /(?:intel|core i[3579]).{0,24}(?:cpu|processor)|(?:cpu|processor).{0,24}(?:intel|core i[3579])/i.test(req.notes ?? '');
  if (wantsAMD && cpu && !/amd|ryzen/i.test(`${cpu.brand} ${cpu.name}`)) {
    throw new AIError('upstream_error', 'The selected CPU does not match the AMD preference.');
  }
  if (wantsIntelCore && cpu && (!/intel|core/i.test(`${cpu.brand} ${cpu.name}`) || /pentium|celeron/i.test(cpu.name))) {
    throw new AIError('upstream_error', 'The selected CPU does not match the Intel Core preference.');
  }

  const totalPrice = items.reduce((sum, i) => sum + (byId.get(i.componentId)?.price ?? 0), 0);
  if (totalPrice > req.budget) throw new AIError('upstream_error', 'The selected build exceeds the requested budget.');

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
