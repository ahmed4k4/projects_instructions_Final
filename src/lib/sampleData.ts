/**
 * The display model for a build card.
 *
 * -- What used to be here --------------------------------------------------
 * A 32-component demo catalogue (sampleComponents) and six hand-written
 * community builds. Both are gone in Phase 15 (docs/AUDIT.md section 63):
 *
 *   - the Builder, the AI advisor and the Prebuilt page read real Egyptian
 *     retailer listings (hooks/useComponents, lib/retailerCatalogue);
 *   - community fallbacks are generated from that catalogue, not invented.
 *
 * What remains is the SHAPE a card and a detail page need, shared by database
 * rows, generated configurations and generated builds.
 */
import type { BuildScoreBreakdown } from '@/types/build';

/**
 * The display shape shared by database rows, generated configurations and
 * generated builds — what a card and the detail page need.
 */
export interface SampleBuild {
  id: string;
  name: string;
  slug: string;
  description: string;
  useCase: string;
  totalPrice: number;
  totalPowerWatts: number;
  buildScore: number;
  scoreBreakdown: BuildScoreBreakdown;
  isPublic: boolean;
  componentIds: string[];
  createdAt: string;
}
