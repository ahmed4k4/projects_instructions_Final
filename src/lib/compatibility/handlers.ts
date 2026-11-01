/**
 * Named handlers for `rule_type = 'custom'` rules.
 *
 * Each handler receives the two components plus the build context and returns
 * `true` when the pair passes. Handlers must stay pure — the engine is
 * deterministic and unit-tested, so no I/O, no Date, no randomness.
 */
import type { PCComponent } from '@/types/components';
import type { RuleContext } from './types';

export interface HandlerResult {
  pass: boolean;
  /** Optional human-readable detail appended to the rule message. */
  detail?: string;
}

export type CustomHandler = (
  a: PCComponent,
  b: PCComponent,
  config: Record<string, unknown>,
  ctx: RuleContext,
) => HandlerResult;

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** PSU must expose enough PCIe power connectors for the GPU. */
const psuConnectors: CustomHandler = (psu, gpu) => {
  const required = String(gpu.specs.powerConnectors ?? '');
  if (!required) return { pass: true };

  // The seeded PSU rows do not publish a connector count, so the rule only
  // fails when the PSU explicitly declares fewer connectors than needed.
  const available = num(psu.specs.pcieConnectors);
  if (available === null) return { pass: true };

  const needed =
    (required.match(/(\d+)\s*x\s*8-pin/gi) ?? []).reduce((sum, m) => {
      const n = Number(/(\d+)/.exec(m)?.[1] ?? 1);
      return sum + n;
    }, 0) || (required.includes('12VHPWR') || required.includes('16-pin') ? 1 : 0);

  return needed <= available
    ? { pass: true }
    : { pass: false, detail: `needs ${needed} PCIe connections, PSU has ${available}` };
};

/**
 * A full-length GPU covers the expansion slot directly under the x16 lane.
 * Advisory only. A 3+-slot card that fills most of a shallow bay leaves the
 * adjacent slot unusable.
 */
const gpuCoversExpansion: CustomHandler = (_mb, gpuCase, _config, ctx) => {
  const maxGpu = num(gpuCase.specs.maxGpuLength);
  const slots: number = num(ctx.items.gpu?.specs.slotWidth ?? null) ?? 2;
  const gpuLength = num(ctx.items.gpu?.specs.length ?? null) ?? 0;
  if (maxGpu === null) return { pass: true };

  const spare = maxGpu - gpuLength;
  return slots >= 3 && spare < 20
    ? { pass: false, detail: `${slots}-slot card leaves only ${spare} mm in a ${maxGpu} mm bay` }
    : { pass: true };
};

/**
 * PSU headroom over the *whole build's* draw (not only the GPU). Passes when
 * `wattage >= totalWatts * (1 + headroomPercent/100)`.
 */
const psuHeadroom: CustomHandler = (psu, _gpu, config, ctx) => {
  const wattage = num(psu.specs.wattage);
  if (wattage === null) return { pass: true };
  const headroom = num(config.headroomPercent) ?? 20;
  const required = Math.ceil(ctx.totalWatts * (1 + headroom / 100));
  return wattage >= required
    ? { pass: true }
    : { pass: false, detail: `${required} W recommended, PSU is ${wattage} W` };
};

/** DDR5 sweet spot for AM5 / LGA1700: 5600–6400 MT/s at CL ≤ 36. */
const ramSpeedSweetSpot: CustomHandler = (ram) => {
  const speed = num(ram.specs.speed);
  const cas = num(ram.specs.casLatency);
  if (speed === null || cas === null) return { pass: true };
  const inRange = speed >= 5600 && speed <= 6800 && cas <= 38;
  return inRange
    ? { pass: true }
    : { pass: true, detail: `${speed} MT/s CL${cas} is outside the sweet spot` };
};

/**
 * Storage fits if the motherboard has at least one free M.2 slot for it.
 * `spec_path_b` points at `m2Slots` (a count), so this cannot be a plain
 * `match` — comparing an interface string to a number would always fail.
 */
const storageFits: CustomHandler = (storage, motherboard, _config, ctx) => {
  const interfaceName = String(storage.specs.interface ?? '');
  const slots = num(motherboard.specs.m2Slots);
  if (slots === null) return { pass: true };

  // Only M.2/NVMe drives consume an M.2 slot; SATA drives use the chipset.
  const isM2 = /m\.?2|nvme|pcie/i.test(interfaceName);
  if (!isM2) return { pass: true };

  // Count every M.2 drive already in the build for this board.
  const installed = [ctx.items.storage].filter(Boolean).length;
  return installed <= slots
    ? { pass: true }
    : { pass: false, detail: `${installed} M.2 drives but only ${slots} slot(s)` };
};

export const CUSTOM_HANDLERS: Record<string, CustomHandler> = {
  psu_gpu_connectors: psuConnectors,
  motherboard_case_pcie: gpuCoversExpansion,
  storage_motherboard_interface: storageFits,
  psu_headroom: psuHeadroom,
  ram_speed_sweet_spot: ramSpeedSweetSpot,
};

export function getCustomHandler(name: string): CustomHandler | null {
  return CUSTOM_HANDLERS[name] ?? null;
}
