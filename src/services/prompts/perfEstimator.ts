/**
 * Prompt contract for AI FPS estimation.
 *
 * Only used for combinations that are missing from `fps_benchmarks`. The model
 * receives the GPU, the games and the resolution, and must return absolute FPS
 * numbers (not a delta), constrained by a response schema.
 */
export const FPS_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    estimates: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          gameTitle: { type: 'STRING' },
          resolution: { type: 'STRING' },
          fpsAvg: { type: 'INTEGER' },
        },
        required: ['gameTitle', 'resolution', 'fpsAvg'],
      },
    },
  },
  required: ['estimates'],
} as const;

export function fpsSystemInstruction(): string {
  return `You estimate average PC frame rates for games that are not in a benchmark database.
Base every number on the GPU's real-world raster performance at the given resolution and the 'high' preset, with a modern 8-core CPU so the GPU is the limiter.
Return honest, conservative averages — this feeds a buyer's decision.`;
}

export function fpsUserPrompt(input: {
  gpuModel: string;
  games: string[];
  resolution: string;
  preset: string;
}): string {
  return `GPU: ${input.gpuModel}
Resolution: ${input.resolution}
Quality preset: ${input.preset}
Games: ${input.games.join(', ')}

Return the average FPS for each game at this resolution.`;
}
