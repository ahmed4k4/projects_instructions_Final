/**
 * Prompt + tool contract for the Smart Builder agent.
 *
 * ── Contract ──────────────────────────────────────────────────────────────
 * The model may ONLY reference components it obtained from a tool call.
 * `runBuildAgent` enforces this after every turn: an unknown component ID
 * triggers one corrective re-prompt and then a deterministic fallback.
 *
 * The model is responsible for *selection and reasoning*; every number
 * (compatibility, score, price) comes back from a deterministic engine through
 * `check_compatibility` / `get_build_score`. It must never invent a spec.
 */
import type { AIBuildRequest, ToolDeclaration } from '@/types/ai';
import { USE_CASE_MAP } from '@/lib/constants';
import { formatCurrency } from '@/lib/utils';

/** Tool declarations handed to Gemini (JSON-schema style parameters). */
export function buildTools(): ToolDeclaration[] {
  return [
    {
      name: 'list_components',
      description:
        'List candidate components for one category, filtered by a maximum price and an optional minimum performance score. Always use this before picking a part.',
      parameters: {
        type: 'OBJECT',
        properties: {
          category: {
            type: 'STRING',
            enum: ['cpu', 'gpu', 'motherboard', 'ram', 'storage', 'psu', 'case', 'cooling'],
            description: 'Component category to search.',
          },
          budgetMax: {
            type: 'NUMBER',
            // EGYPTIAN POUNDS. Every price in the tool results is EGP, so a model
            // told USD here budgets a $600 card against a 95,000 EGP ceiling
            // and returns the cheapest part it can find.
            description: 'Maximum unit price in Egyptian pounds (EGP). Omit to see the whole category.',
          },
          minPerfScore: {
            type: 'NUMBER',
            description: 'Minimum performance score (0-100) when the user needs a floor.',
          },
        },
        required: ['category'],
      },
    },
    {
      name: 'get_component_details',
      description: 'Full technical specs, price and stock for one component by ID.',
      parameters: {
        type: 'OBJECT',
        properties: {
          id: { type: 'STRING', description: 'Component UUID from list_components.' },
        },
        required: ['id'],
      },
    },
    {
      name: 'check_compatibility',
      description:
        'Run the deterministic compatibility engine on a set of component IDs. Returns errors and warnings. Call this as soon as you have a full candidate list.',
      parameters: {
        type: 'OBJECT',
        properties: {
          componentIds: {
            type: 'ARRAY',
            items: { type: 'STRING' },
            description: 'Component UUIDs to evaluate together.',
          },
        },
        required: ['componentIds'],
      },
    },
    {
      name: 'get_build_score',
      description:
        'Score a candidate build (0-100, with a breakdown). Use it to compare alternatives before finalising.',
      parameters: {
        type: 'OBJECT',
        properties: {
          componentIds: { type: 'ARRAY', items: { type: 'STRING' } },
          useCase: {
            type: 'STRING',
            enum: ['gaming', 'ai', 'editing', 'programming', 'workstation', 'streaming'],
          },
        },
        required: ['componentIds', 'useCase'],
      },
    },
    {
      name: 'finalize_build',
      description:
        'Submit the finished build. Every component must have come from list_components. Include a short, specific reason for each part.',
      parameters: {
        type: 'OBJECT',
        properties: {
          buildName: { type: 'STRING', description: '3-5 word name, e.g. "Vector 1440p Strike".' },
          items: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                category: { type: 'STRING' },
                componentId: { type: 'STRING' },
                reason: {
                  type: 'STRING',
                  description: 'One sentence: why this part for this budget and workload.',
                },
              },
              required: ['category', 'componentId', 'reason'],
            },
          },
          explanation: {
            type: 'STRING',
            description: 'Two or three sentences on the overall trade-offs you made.',
          },
        },
        required: ['buildName', 'items', 'explanation'],
      },
    },
  ];
}

/** Language directive appended to every system instruction. */
export type PromptLocale = 'en' | 'ar';

export function languageInstruction(locale: PromptLocale): string {
  return locale === 'ar'
    ? 'اكتب بالعربية الفصحى المبسطة. المصطلحات التقنية وأسماء القطع والبرامج تبقى بالإنجليزية كما هي (مثل RTX 4070 و PCIe 4.0). إذا كتب المستخدم بالإنجليزية فأجب بالإنجليزية.'
    : 'Respond in English. If the user writes in Arabic, respond in Arabic (Modern Standard Arabic, keeping technical terms and product names in English).';
}

/** Detect the user's language from their text — used for auto-switching. */
export function detectLocale(text: string): PromptLocale {
  return /[\u0600-\u06FF]/.test(text) ? 'ar' : 'en';
}

/** System instruction: the rules the agent must follow on every turn. */
export function buildSystemInstruction(locale: PromptLocale = 'en'): string {
  return `You are Nexus, an expert PC builder with 15 years of experience. You select parts that fit a budget, a workload and a set of preferences, and you explain trade-offs honestly.

${languageInstruction(locale)}

HARD RULES — never break these:
1. You may only recommend components that you received from the list_components or get_component_details tools. NEVER invent a component, a model name or an ID.
2. Before finalising, call check_compatibility with every chosen ID. If it returns errors, replace the offending parts and re-check. Warnings are acceptable if you explain them.
3. Call get_build_score to compare candidate builds. Aim for the highest score within budget; do not exceed the budget.
4. Prefer current-generation parts and realistic pairings. Do not pair a flagship GPU with a budget CPU unless the user explicitly asked for it.
5. Keep every reason specific and quantitative ("24 GB VRAM covers 4K texture packs", not "good GPU").
6. Finish by calling finalize_build exactly once.

Be efficient: batch your list_components calls, do not re-fetch the same category, and stop as soon as you have a strong build. You have at most 8 tool rounds.`;
}

/** The user turn that starts the agent. */
export function buildUserInstruction(req: AIBuildRequest): string {
  const useCase = USE_CASE_MAP[req.useCase];
  const lines = [
    `Build me a PC.`,
    ``,
    `Budget: ${formatCurrency(req.budget)} (hard ceiling; all prices and budgets are Egyptian pounds / EGP)`,
    `Primary use case: ${useCase?.label ?? req.useCase} — ${useCase?.description ?? ''}`,
  ];

  if (req.resolution) lines.push(`Target resolution: ${req.resolution}`);
  if (req.performanceTarget) lines.push(`Performance target: ${req.performanceTarget}`);
  if (req.preferences?.length) lines.push(`Preferences: ${req.preferences.join(', ')}`);
  if (req.notes?.trim()) lines.push(`Additional notes: ${req.notes.trim()}`);

  lines.push(
    '',
    `Start by listing candidates for the parts that matter most for ${useCase?.label ?? req.useCase}, then work down to the rest.`,
  );

  return lines.join('\n');
}

/** One corrective re-prompt when the model used an ID it never fetched. */
export function buildCorrectionInstruction(unknownIds: string[]): string {
  return `Your final answer referenced component IDs that do not exist in the catalogue: ${unknownIds.join(
    ', ',
  )}. You must only use IDs returned by list_components. Re-do the selection and call finalize_build again with valid IDs.`;
}
