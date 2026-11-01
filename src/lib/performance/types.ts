export type Resolution = '1080p' | '1440p' | '4k';

export interface BenchmarkRow {
  gpuModel: string;
  gameTitle: string;
  resolution: Resolution;
  qualityPreset: string;
  fpsAvg: number;
  cpuTestUsed?: string | null;
}

export interface FpsEstimate {
  /** game → resolution → frames per second, rounded. */
  fps: Record<string, Partial<Record<Resolution, number>>>;
  bottleneck: {
    side: 'cpu' | 'gpu' | 'balanced';
    /** How far the weaker side holds the other back, in percent. */
    percent: number;
  };
  powerDraw: number;
  /** True when at least one number came from the AI fallback. */
  usedAiFallback: boolean;
}

/** Signature of the AI fallback, injected so the estimator stays pure. */
export type FpsAiFallback = (input: {
  gpuModel: string;
  games: string[];
  resolution: Resolution;
  preset: string;
}) => Promise<Array<{ gameTitle: string; resolution: Resolution; fpsAvg: number }>>;

export const RESOLUTIONS: Resolution[] = ['1080p', '1440p', '4k'];

/** Games the estimator reports by default (matches the seeded benchmarks). */
export const TRACKED_GAMES = [
  'Cyberpunk 2077',
  'CS2',
  'Valorant',
  'Fortnite',
  'Call of Duty Warzone',
  'Elden Ring',
  'Red Dead Redemption 2',
  'Baldurs Gate 3',
  'Hogwarts Legacy',
  'Starfield',
] as const;
