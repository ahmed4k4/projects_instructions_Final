/**
 * PC component domain contracts.
 *
 * `specs` in the database is a free-form JSONB blob (each category has a
 * different technical shape). The typed interfaces below describe the *known*
 * keys per category so the compatibility engine (Phase 2) can rely on them,
 * while `PCComponent.specs` stays open for vendor-specific extras.
 */

export type ComponentCategory =
  'cpu' | 'gpu' | 'motherboard' | 'ram' | 'storage' | 'psu' | 'case' | 'cooling';

/** `unknown` is a first-class state: a retailer that does not publish stock
 * must never be presented as either available or sold out. */
export type StockStatus = 'in_stock' | 'out_of_stock' | 'limited' | 'unknown';

export interface StoreLink {
  store: string;
  url: string;
  price: number;
  /** Exact stock state reported for this retailer listing. */
  stockStatus?: StockStatus;
  /** Timestamp of this retailer's own stock/price snapshot. */
  stockUpdatedAt?: string;
}

export interface CPU {
  socket: string;
  cores: number;
  threads: number;
  baseClock: number;
  boostClock: number;
  tdp: number;
  integratedGraphics: boolean;
  ramType: string;
}

export interface GPU {
  vram: number;
  tdp: number;
  length: number;
  recommendedPsu: number;
  slotWidth: number;
}

export interface Motherboard {
  socket: string;
  chipset: string;
  formFactor: string;
  ramType: string;
  maxRam: number;
  ramSlots: number;
  m2Slots: number;
}

export interface RAM {
  type: string;
  capacity: number;
  speed: number;
  casLatency: number;
  sticks: number;
  height: number;
}

export interface Storage {
  type: string;
  interface: string;
  capacity: number;
  readSpeed: number;
  writeSpeed: number;
  formFactor: string;
}

export interface PSU {
  wattage: number;
  efficiency: string;
  modular: string;
  length: number;
  atxStandard: string;
}

export interface Case {
  formFactorSupport: string[];
  maxGpuLength: number;
  maxCoolerHeight: number;
  radiatorSupport: string[];
}

export interface Cooling {
  type: string;
  tdpRating: number;
  socketSupport: string[];
  height: number;
  radiatorSize: number | null;
}

/** Discriminated union of the eight spec shapes. */
export type ComponentSpecs = CPU | GPU | Motherboard | RAM | Storage | PSU | Case | Cooling;

export interface PCComponent {
  id: string;
  category: ComponentCategory;
  brand: string;
  model: string;
  name: string;
  /**
   * Arabic display fields (migration 007). Nullable: the UI falls back to
   * `name` / `description` — read them through src/lib/i18nContent.ts.
   */
  nameAr?: string | null;
  description?: string | null;
  descriptionAr?: string | null;
  specs: Record<string, unknown>;
  price: number;
  currency: string;
  stockStatus: StockStatus;
  storeLinks: StoreLink[];
  performanceScore: number | null;
  powerDrawWatts: number | null;
  imageUrl: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A component resolved with its specs narrowed to a category. */
export type TypedComponent<T extends ComponentCategory> = PCComponent & {
  category: T;
  specs: Record<string, unknown> & (T extends 'cpu' ? CPU : unknown);
};
