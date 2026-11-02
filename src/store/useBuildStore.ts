import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { ComponentCategory, PCComponent } from '@/types/components';
import type { BuildSelection, BuildTotals, UseCase } from '@/types/build';

interface BuildState {
  buildName: string;
  useCase: UseCase;
  budget: number;
  items: BuildSelection;
  quantities: Partial<Record<ComponentCategory, number>>;
  lastUpdatedAt: string | null;

  addComponent: (component: PCComponent) => void;
  removeComponent: (category: ComponentCategory) => void;
  setQuantity: (category: ComponentCategory, quantity: number) => void;
  clearBuild: () => void;
  setBuildName: (name: string) => void;
  setUseCase: (useCase: UseCase) => void;
  setBudget: (budget: number) => void;
  hydrateFromSelection: (selection: BuildSelection, name?: string) => void;
}

export const useBuildStore = create<BuildState>()(
  persist(
    immer((set) => ({
      buildName: 'Untitled Build',
      useCase: 'gaming',
      // EGP. The old 1800 was a USD-era default; at the current rate it is about
      // $36 and cannot buy a CPU. 60,000 EGP is a realistic 1440p gaming budget.
      budget: 60_000,
      items: {},
      quantities: {},
      lastUpdatedAt: null,

      addComponent: (component) =>
        set((state) => {
          state.items[component.category] = component;
          state.quantities[component.category] = state.quantities[component.category] ?? 1;
          state.lastUpdatedAt = new Date().toISOString();
        }),

      removeComponent: (category) =>
        set((state) => {
          delete state.items[category];
          delete state.quantities[category];
          state.lastUpdatedAt = new Date().toISOString();
        }),

      setQuantity: (category, quantity) =>
        set((state) => {
          if (quantity <= 0) {
            delete state.items[category];
            delete state.quantities[category];
          } else {
            state.quantities[category] = Math.min(quantity, 16);
          }
          state.lastUpdatedAt = new Date().toISOString();
        }),

      clearBuild: () =>
        set((state) => {
          state.items = {};
          state.quantities = {};
          state.lastUpdatedAt = new Date().toISOString();
        }),

      setBuildName: (name) =>
        set((state) => {
          state.buildName = name;
        }),

      setUseCase: (useCase) =>
        set((state) => {
          state.useCase = useCase;
        }),

      setBudget: (budget) =>
        set((state) => {
          state.budget = Math.max(0, budget);
        }),

      hydrateFromSelection: (selection, name) =>
        set((state) => {
          state.items = selection;
          state.quantities = Object.fromEntries(Object.keys(selection).map((category) => [category, 1]));
          if (name) state.buildName = name;
          state.lastUpdatedAt = new Date().toISOString();
        }),
    })),
    {
      name: 'nexus-build',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // Only the user's data is persisted — never actions.
      partialize: (state) => ({
        buildName: state.buildName,
        useCase: state.useCase,
        budget: state.budget,
        items: state.items,
        quantities: state.quantities,
        lastUpdatedAt: state.lastUpdatedAt,
      }),
    },
  ),
);

/* -------------------------------------------------------------------------- */
/*  Selectors — derived values (kept pure so they work with useMemo too)       */
/* -------------------------------------------------------------------------- */

type TotalsTuple = [totalPrice: number, totalWatts: number, itemCount: number, filledCategories: number];

export function selectTotals(state: BuildState): TotalsTuple {
  const components = Object.values(state.items).filter((c): c is PCComponent => Boolean(c));
  const totalPrice = components.reduce((sum, c) => sum + c.price * (state.quantities[c.category] ?? 1), 0);
  const totalWatts = components.reduce((sum, c) => sum + (c.powerDrawWatts ?? 0), 0);
  return [totalPrice, totalWatts, components.length, components.length];
}

export const selectComponents = (state: BuildState): PCComponent[] =>
  Object.values(state.items).filter((c): c is PCComponent => Boolean(c));

/**
 * Derived build totals.
 *
 * Deliberately subscribes to three PRIMITIVE slices instead of running one
 * selector that returns a tuple/object. React 18's dev `useSyncExternalStore`
 * calls `getSnapshot` during the passive-effect phase and rejects a fresh
 * object/array reference, which throws "Maximum update depth exceeded".
 * Everything derived from them is computed in the hook body, so the snapshot
 * stays referentially stable.
 */
export function useBuildTotals(): BuildTotals {
  const items = useBuildStore((state) => state.items);
  const quantities = useBuildStore((state) => state.quantities);

  let totalPrice = 0;
  let totalWatts = 0;
  let itemCount = 0;

  for (const component of Object.values(items)) {
    if (!component) continue;
    itemCount += 1;
    totalPrice += component.price * (quantities[component.category] ?? 1);
    totalWatts += component.powerDrawWatts ?? 0;
  }

  return { totalPrice, totalWatts, itemCount, filledCategories: itemCount };
}
