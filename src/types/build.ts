import type { ComponentCategory, PCComponent } from './components';

export type UseCase = 'gaming' | 'ai' | 'editing' | 'programming' | 'workstation' | 'streaming';

export interface BuildScoreBreakdown {
  compatibility: number;
  performance: number;
  value: number;
  efficiency: number;
  upgradability: number;
}

export type ScoreKey = keyof BuildScoreBreakdown;

export interface Build {
  id: string;
  userId: string | null;
  name: string;
  slug: string;
  description?: string;
  useCase?: UseCase;
  totalPrice: number;
  totalPowerWatts: number;
  buildScore: number | null;
  scoreBreakdown: BuildScoreBreakdown | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BuildItem {
  id: string;
  buildId: string;
  componentId: string;
  quantity: number;
  priceAtAdd: number;
}

/** In-memory selection used by the builder before anything is persisted. */
export type BuildSelection = Partial<Record<ComponentCategory, PCComponent>>;

export interface CompatibilityIssue {
  ruleKey: string;
  severity: 'error' | 'warning';
  message: string;
  categories: ComponentCategory[];
}

export interface BuildTotals {
  totalPrice: number;
  totalWatts: number;
  itemCount: number;
  filledCategories: number;
}

export interface CommunityBuild {
  id: string;
  buildId: string;
  authorId: string;
  title: string;
  tags: string[];
  ratingAvg: number;
  ratingCount: number;
  views: number;
  publishedAt: string;
}
