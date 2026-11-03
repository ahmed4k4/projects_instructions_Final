/**
 * Prompt contract for the AI Advisor chat.
 *
 * Two modes, one instruction: `general` (no build in context) and
 * `scoped` (the active build is injected as a tool result).
 *
 * The advisor answers in prose with markdown, and refers to components by
 * `[[component:UUID|Name]]` markers. The renderer turns those markers into
 * citation chips, and the chat service records the IDs it actually verified.
 */
import type { ToolDeclaration } from '@/types/ai';
import { languageInstruction, type PromptLocale } from './buildGenerator';

export const ADVISOR_TOOLS: ToolDeclaration[] = [
  {
    name: 'list_components',
    description: 'Search the catalogue for components of one category.',
    parameters: {
      type: 'OBJECT',
      properties: {
        category: {
          type: 'STRING',
          enum: ['cpu', 'gpu', 'motherboard', 'ram', 'storage', 'psu', 'case', 'cooling'],
        },
        budgetMax: { type: 'NUMBER' },
        minPerfScore: { type: 'NUMBER' },
      },
      required: ['category'],
    },
  },
  {
    name: 'get_component_details',
    description: 'Full specs, price and stock for one component ID.',
    parameters: {
      type: 'OBJECT',
      properties: { id: { type: 'STRING' } },
      required: ['id'],
    },
  },
  {
    name: 'suggest_alternatives',
    description: 'Return 2-3 alternatives to a component, optionally under a price cap.',
    parameters: {
      type: 'OBJECT',
      properties: {
        componentId: { type: 'STRING' },
        budget: { type: 'NUMBER' },
      },
      required: ['componentId'],
    },
  },
  {
    name: 'check_compatibility',
    description: 'Check a set of component IDs for compatibility errors and warnings.',
    parameters: {
      type: 'OBJECT',
      properties: {
        componentIds: { type: 'ARRAY', items: { type: 'STRING' } },
      },
      required: ['componentIds'],
    },
  },
];

export function advisorSystemInstruction(hasBuildContext: boolean, locale: PromptLocale = 'en'): string {
  return `You are Nexus, a patient, precise PC-building advisor. You answer questions about hardware, compatibility, upgrades and value.

${languageInstruction(locale)}

STYLE
- Answer in markdown. Lead with the direct answer, then the reasoning. Keep it under ~180 words unless the user asks for depth.
- Be honest about uncertainty. Never invent benchmarks or specifications.
- When you mention a component that is already in the user's build or that you looked up with a tool, cite it inline as [[component:<id>|<Name>]] so the UI can render a chip. Only cite IDs that exist in a tool result.
- All budgets, prices, and component costs are in Egyptian pounds (EGP / ج.م.) only. Never use USD, dollars, or convert prices to another currency.
- Numbers about the user's own build (price, watts, score, compatibility) must come from the attached CURRENT BUILD SNAPSHOT or check_compatibility tool, never from model memory.

${
  hasBuildContext
    ? 'A build snapshot may be supplied below. Treat that snapshot as the authoritative source and do not call a tool merely to read it.'
    : 'No build is in context. Ask for budget and purpose before recommending specific parts if the question is vague.'
}

TOOL BUDGET
- Use tools only when live Egyptian catalogue data, exact component details, or compatibility validation is needed.
- Prefer one compact batch of independent calls. Never repeat a search that already returned enough options.
- If the provided context is sufficient, answer immediately without tools.

If a question is outside PC building, answer briefly and steer back.`;
}

/** Suggested prompts, adapted to whether a build is loaded and the UI language. */
export function advisorSuggestions(
  hasBuildContext: boolean,
  budget?: number,
  locale: PromptLocale = 'en',
): string[] {
  if (locale === 'ar') {
    return hasBuildContext
      ? [
          'هل أستطيع ترقية كرت الشاشة دون تغيير مزوّد الطاقة؟',
          'أين أكبر عنق زجاجة في تجميعتي الآن؟',
          'ما أرخص تغيير يمنحني أكبر تحسّن في الأداء؟',
          'هل هذه التجميعة هادئة بما يكفي لغرفة نوم؟',
        ]
      : [
          budget ? `ابنِ لي جهاز ألعاب بدقّة 1440p بميزانية ${budget.toLocaleString('en-EG')} جنيه مصري` : 'ابنِ لي جهاز ألعاب بدقّة 1440p بميزانية 75,000 جنيه مصري',
          'أي كرت شاشة أحتاج لتشغيل نموذج 13B محليًا؟',
          'هل DDR5 أفضل من DDR4 في 2026؟',
          'اشرح عنق الزجاجة في المعالج بفقرة واحدة.',
        ];
  }

  if (hasBuildContext) {
    return [
      'Can I upgrade the GPU without changing the PSU?',
      'Where is my biggest bottleneck right now?',
      'What is the cheapest change that gains the most performance?',
      'Is this build quiet enough for a bedroom?',
    ];
  }
  return [
    budget ? `Build me a 1440p gaming PC with a budget of EGP ${budget.toLocaleString('en-EG')}` : 'Build me a 1440p gaming PC with a budget of EGP 75,000',
    'What GPU do I need to run a 13B model locally?',
    'Is DDR5 worth it over DDR4 in 2026?',
    'Explain CPU bottlenecking in one paragraph.',
  ];
}
