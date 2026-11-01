import { describe, expect, it, vi } from 'vitest';
import type { PCComponent } from '@/types/components';
import {
  averageFpsAt,
  cpuPenaltyFactor,
  detectBottleneck,
  estimateFps,
  estimateFpsSync,
  matchGpuModel,
} from '../estimator';
import type { BenchmarkRow, FpsAiFallback } from '../types';

const part = (category: 'cpu' | 'gpu', model: string, perf: number, watts: number): PCComponent => ({
  id: `${category}-1`,
  category,
  brand: model.split(' ')[0] ?? 'X',
  model,
  name: model,
  specs: {},
  price: 100,
  currency: 'USD',
  stockStatus: 'in_stock',
  storeLinks: [],
  performanceScore: perf,
  powerDrawWatts: watts,
  imageUrl: null,
  isActive: true,
  createdAt: '',
  updatedAt: '',
});

const cpu = (perf = 96) => part('cpu', 'Ryzen 7 7800X3D', perf, 120);
const gpu4090 = (perf = 100) => part('gpu', 'GeForce RTX 4090', perf, 450);

const benchmarks: BenchmarkRow[] = [
  {
    gpuModel: 'GeForce RTX 4090',
    gameTitle: 'Cyberpunk 2077',
    resolution: '1080p',
    qualityPreset: 'high',
    fpsAvg: 192,
  },
  {
    gpuModel: 'GeForce RTX 4090',
    gameTitle: 'Cyberpunk 2077',
    resolution: '1440p',
    qualityPreset: 'high',
    fpsAvg: 134,
  },
  {
    gpuModel: 'GeForce RTX 4090',
    gameTitle: 'Cyberpunk 2077',
    resolution: '4k',
    qualityPreset: 'high',
    fpsAvg: 81,
  },
  { gpuModel: 'GeForce RTX 4090', gameTitle: 'CS2', resolution: '1080p', qualityPreset: 'high', fpsAvg: 480 },
];

describe('matchGpuModel', () => {
  it('matches an exact catalogue model', () => {
    expect(matchGpuModel('GeForce RTX 4090', ['GeForce RTX 4090'])).toBe('GeForce RTX 4090');
  });

  it('matches vendor variants by prefix', () => {
    expect(matchGpuModel('RTX 4090 Founders Edition', ['GeForce RTX 4090'])).toBe('GeForce RTX 4090');
  });

  it('does not confuse a 4070 Ti Super with a 4070', () => {
    const models = ['GeForce RTX 4070', 'GeForce RTX 4070 Ti Super'];
    expect(matchGpuModel('GeForce RTX 4070 Ti Super', models)).toBe('GeForce RTX 4070 Ti Super');
  });

  it('returns null for an unknown GPU', () => {
    expect(matchGpuModel('Arc B580', ['GeForce RTX 4090'])).toBeNull();
  });
});

describe('cpuPenaltyFactor', () => {
  it('does not penalise when the CPU is within 15 points of the GPU', () => {
    expect(cpuPenaltyFactor(90, 100, '1080p')).toBe(1);
    expect(cpuPenaltyFactor(85, 100, '1080p')).toBe(1);
  });

  it('penalises harder at lower resolutions', () => {
    expect(cpuPenaltyFactor(80, 100, '1080p')).toBe(0.7);
    expect(cpuPenaltyFactor(80, 100, '1440p')).toBe(0.88);
    expect(cpuPenaltyFactor(80, 100, '4k')).toBe(0.96);
  });

  it('is a no-op when either score is missing', () => {
    expect(cpuPenaltyFactor(null, 100, '1080p')).toBe(1);
    expect(cpuPenaltyFactor(80, null, '1080p')).toBe(1);
  });
});

describe('detectBottleneck', () => {
  it('reports balanced for close scores', () => {
    expect(detectBottleneck(96, 100)).toEqual({ side: 'balanced', percent: 4 });
  });

  it('names the CPU as the limiter when it falls behind', () => {
    const b = detectBottleneck(80, 100);
    expect(b.side).toBe('cpu');
    expect(b.percent).toBe(25); // 20 / 80
  });

  it('names the GPU when it is the slower side', () => {
    expect(detectBottleneck(100, 80).side).toBe('gpu');
  });

  it('handles a missing component', () => {
    expect(detectBottleneck(null, 100)).toEqual({ side: 'balanced', percent: 0 });
  });
});

describe('estimateFpsSync', () => {
  it('returns the benchmark numbers for a balanced build', () => {
    const est = estimateFpsSync({ items: { cpu: cpu(), gpu: gpu4090() }, benchmarks });
    expect(est.fps['Cyberpunk 2077']).toEqual({ '1080p': 192, '1440p': 134, '4k': 81 });
    expect(est.usedAiFallback).toBe(false);
    expect(est.powerDraw).toBe(570);
  });

  it('applies the CPU penalty when the CPU lags', () => {
    const est = estimateFpsSync({ items: { cpu: cpu(70), gpu: gpu4090() }, benchmarks });
    // delta 30 → 1080p × 0.7 = 134, 1440p × 0.88 = 118, 4k × 0.96 = 78
    expect(est.fps['Cyberpunk 2077']?.['1080p']).toBe(134);
    expect(est.fps['Cyberpunk 2077']?.['1440p']).toBe(118);
    expect(est.fps['Cyberpunk 2077']?.['4k']).toBe(78);
    expect(est.bottleneck.side).toBe('cpu');
  });

  it('returns empty numbers when no GPU is selected', () => {
    const est = estimateFpsSync({ items: { cpu: cpu() }, benchmarks });
    expect(est.fps['Cyberpunk 2077']).toEqual({});
    expect(est.bottleneck.side).toBe('balanced');
  });

  it('reports nothing at all for an unknown GPU without a fallback', () => {
    const est = estimateFpsSync({ items: { cpu: cpu(), gpu: part('gpu', 'Arc B580', 70, 190) }, benchmarks });
    expect(averageFpsAt(est, '1080p')).toBeNull();
  });

  it('is deterministic', () => {
    const args = { items: { cpu: cpu(), gpu: gpu4090() }, benchmarks };
    expect(estimateFpsSync(args)).toEqual(estimateFpsSync(args));
  });

  it('averages only the resolutions it knows', () => {
    const est = estimateFpsSync({ items: { cpu: cpu(), gpu: gpu4090() }, benchmarks });
    // Only Cyberpunk has 4k; CS2 has 1080p only.
    expect(averageFpsAt(est, '4k')).toBe(81);
    expect(averageFpsAt(est, '1080p')).toBe(Math.round((192 + 480) / 2));
  });
});

describe('estimateFps — AI fallback path', () => {
  it('fills missing combinations from the AI without touching measured rows', async () => {
    const aiFallback = vi.fn<FpsAiFallback>(async ({ games, resolution }) =>
      games.map((gameTitle) => ({ gameTitle, resolution, fpsAvg: 111 })),
    );

    const est = await estimateFps({
      items: { cpu: cpu(), gpu: gpu4090() },
      benchmarks,
      aiFallback,
      games: ['Cyberpunk 2077', 'CS2', 'Starfield'],
    });

    // Measured rows survive untouched.
    expect(est.fps['Cyberpunk 2077']?.['1080p']).toBe(192);
    expect(est.fps['CS2']?.['1080p']).toBe(480);
    // Missing ones come from the fallback.
    expect(est.fps['Starfield']?.['1080p']).toBe(111);
    expect(est.usedAiFallback).toBe(true);
    expect(aiFallback).toHaveBeenCalled();
  });

  it('does not call the AI when every combination is covered', async () => {
    const aiFallback = vi.fn<FpsAiFallback>(async () => []);
    // Only ask for the one game that is fully benchmarked at all resolutions.
    const est = await estimateFps({
      items: { cpu: cpu(), gpu: gpu4090() },
      benchmarks,
      aiFallback,
      games: ['Cyberpunk 2077'],
    });

    expect(aiFallback).not.toHaveBeenCalled();
    expect(est.usedAiFallback).toBe(false);
  });

  it('survives a failing AI fallback', async () => {
    const aiFallback = vi.fn<FpsAiFallback>(async () => {
      throw new Error('Gemini unavailable');
    });

    const est = await estimateFps({
      items: { cpu: cpu(), gpu: gpu4090() },
      benchmarks,
      aiFallback,
      games: ['Cyberpunk 2077', 'Starfield'],
    });

    expect(est.fps['Cyberpunk 2077']?.['1080p']).toBe(192);
    expect(est.fps['Starfield']).toEqual({});
    expect(est.usedAiFallback).toBe(false);
  });

  it('uses the AI for an unknown GPU', async () => {
    const aiFallback = vi.fn<FpsAiFallback>(async ({ games, resolution }) =>
      games.map((gameTitle) => ({ gameTitle, resolution, fpsAvg: 60 })),
    );

    const est = await estimateFps({
      items: { cpu: cpu(), gpu: part('gpu', 'Arc B580', 70, 190) },
      benchmarks,
      aiFallback,
      games: ['Starfield'],
    });

    expect(est.fps['Starfield']?.['1440p']).toBe(60);
    expect(est.usedAiFallback).toBe(true);
  });
});
