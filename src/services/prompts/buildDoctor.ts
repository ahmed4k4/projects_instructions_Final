/**
 * Prompt contract for the Build Doctor.
 *
 * Input is a *grounded* snapshot: the build, its deterministic compatibility
 * report and its deterministic score. The model is asked to interpret those
 * numbers, never to recompute them.
 *
 * Response schema is enforced on the server (`responseSchema`), so the UI can
 * render fields without defensive parsing.
 */
import type { BuildScoreBreakdown } from '@/types/build';

export const DOCTOR_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING', description: 'Two sentences on the overall state of the build.' },
    strengths: { type: 'ARRAY', items: { type: 'STRING' } },
    weaknesses: { type: 'ARRAY', items: { type: 'STRING' } },
    verdict: {
      type: 'STRING',
      enum: ['excellent', 'good', 'needs_work', 'rebuild'],
    },
    upgrades: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          category: { type: 'STRING' },
          fromComponentId: { type: 'STRING', nullable: true },
          toComponentId: { type: 'STRING' },
          expectedScoreDelta: { type: 'NUMBER' },
          reason: { type: 'STRING' },
        },
        required: ['category', 'toComponentId', 'expectedScoreDelta', 'reason'],
      },
    },
  },
  required: ['summary', 'strengths', 'weaknesses', 'verdict', 'upgrades'],
} as const;

export function doctorSystemInstruction(): string {
  return `You are a senior PC build reviewer. You receive a build with already-computed facts: compatibility errors/warnings, sub-scores and totals.

RULES
- Never recompute or contradict the supplied numbers. Interpret them.
- The "upgrades" array must only reference component IDs that appear in the "Candidates" section of the input. Never invent an ID.
- Rank upgrades by value: expected score gain for the money.
- Be specific and blunt. "PSU is undersized for transient spikes on this GPU" beats "could be better".
- verdict: excellent (>=85 score and no errors), good (>=70), needs_work (>=50 or one error), rebuild (below 50 or multiple errors).
- Return at most 3 upgrades.`;
}

export interface DoctorInput {
  buildName: string;
  useCase: string;
  totalPrice: number;
  totalWatts: number;
  budget?: number;
  score: { total: number; breakdown: BuildScoreBreakdown };
  compatibility: { errors: string[]; warnings: string[] };
  parts: Array<{ id: string; category: string; name: string; price: number; perf: number | null }>;
  candidates: Array<{ id: string; category: string; name: string; price: number; perf: number | null }>;
}

export function doctorUserPrompt(input: DoctorInput): string {
  const parts = input.parts
    .map((p) => `- ${p.category}: ${p.name} (id ${p.id}, $${p.price}, perf ${p.perf ?? 'n/a'})`)
    .join('\n');

  const candidates = input.candidates
    .map((c) => `- ${c.category}: ${c.name} (id ${c.id}, $${c.price}, perf ${c.perf ?? 'n/a'})`)
    .join('\n');

  return `Review this build.

Name: ${input.buildName}
Use case: ${input.useCase}
Total: $${input.totalPrice}${input.budget ? ` (budget $${input.budget})` : ''}
Peak draw: ${input.totalWatts} W
Score: ${input.score.total}/100 — ${Object.entries(input.score.breakdown)
    .map(([k, v]) => `${k} ${v}`)
    .join(', ')}

Compatibility errors: ${input.compatibility.errors.length ? `\n- ${input.compatibility.errors.join('\n- ')}` : 'none'}
Compatibility warnings: ${input.compatibility.warnings.length ? `\n- ${input.compatibility.warnings.join('\n- ')}` : 'none'}

Parts:
${parts}

Candidates (the ONLY IDs you may suggest as upgrades):
${candidates || '(none)'}`;
}
