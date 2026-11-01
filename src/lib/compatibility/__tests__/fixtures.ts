/**
 * Test fixtures mirroring the seeded catalogue (`supabase/seed.sql`).
 * Keeping them in one place means the engine tests exercise the same spec
 * shapes the real database produces.
 */
import type { ComponentCategory, PCComponent } from '@/types/components';
import type { CompatibilityRule } from '../types';

let seq = 0;

function component(
  category: ComponentCategory,
  name: string,
  price: number,
  specs: Record<string, unknown>,
  powerDrawWatts: number | null = 0,
  performanceScore = 80,
): PCComponent {
  seq += 1;
  return {
    id: `${category}-${seq}`,
    category,
    brand: name.split(' ')[0] ?? 'Brand',
    model: name,
    name,
    specs,
    price,
    currency: 'USD',
    stockStatus: 'in_stock',
    storeLinks: [],
    performanceScore,
    powerDrawWatts,
    imageUrl: null,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

export const cpuAm5 = () =>
  component(
    'cpu',
    'AMD Ryzen 7 7800X3D',
    379,
    {
      socket: 'AM5',
      cores: 8,
      threads: 16,
      tdp: 120,
      ramType: 'DDR5',
      integratedGraphics: true,
    },
    120,
    96,
  );

export const cpuLga = () =>
  component(
    'cpu',
    'Intel Core i7-14700K',
    409,
    {
      socket: 'LGA1700',
      cores: 20,
      threads: 28,
      tdp: 253,
      ramType: 'DDR5',
      integratedGraphics: true,
    },
    253,
    90,
  );

export const mbAm5 = () =>
  component(
    'motherboard',
    'ASUS X670E',
    399,
    {
      socket: 'AM5',
      chipset: 'X670E',
      formFactor: 'ATX',
      ramType: 'DDR5',
      maxRam: 128,
      ramSlots: 4,
      m2Slots: 4,
    },
    25,
    92,
  );

export const mbLga = () =>
  component(
    'motherboard',
    'ASUS Z790',
    429,
    {
      socket: 'LGA1700',
      chipset: 'Z790',
      formFactor: 'ATX',
      ramType: 'DDR5',
      maxRam: 192,
      ramSlots: 4,
      m2Slots: 5,
    },
    28,
    91,
  );

export const ramDdr5 = () =>
  component(
    'ram',
    'G.Skill 32GB DDR5-6000',
    119,
    {
      type: 'DDR5',
      capacity: 32,
      speed: 6000,
      casLatency: 30,
      sticks: 2,
      height: 44,
    },
    12,
    90,
  );

export const ramDdr4 = () =>
  component(
    'ram',
    'Kingston 32GB DDR4-3600',
    74,
    {
      type: 'DDR4',
      capacity: 32,
      speed: 3600,
      casLatency: 18,
      sticks: 2,
      height: 34,
    },
    10,
    70,
  );

export const gpu4090 = () =>
  component(
    'gpu',
    'NVIDIA RTX 4090',
    1799,
    {
      vram: 24,
      tdp: 450,
      length: 304,
      recommendedPsu: 850,
      slotWidth: 3,
      powerConnectors: '1x 16-pin',
    },
    450,
    100,
  );

export const gpu4070 = () =>
  component(
    'gpu',
    'NVIDIA RTX 4070',
    549,
    {
      vram: 12,
      tdp: 200,
      length: 244,
      recommendedPsu: 650,
      slotWidth: 2,
      powerConnectors: '1x 8-pin',
    },
    200,
    76,
  );

export const psu750 = () =>
  component(
    'psu',
    'be quiet! 750W',
    109,
    {
      wattage: 750,
      efficiency: '80+ Gold',
      modular: 'Full',
    },
    null,
    88,
  );

export const psu1000 = () =>
  component(
    'psu',
    'Seasonic 1000W',
    289,
    {
      wattage: 1000,
      efficiency: '80+ Titanium',
      modular: 'Full',
    },
    null,
    98,
  );

export const caseRoomy = () =>
  component('case', 'Lian Li O11 Dynamic EVO', 179, {
    formFactorSupport: ['E-ATX', 'ATX', 'mATX', 'ITX'],
    maxGpuLength: 426,
    maxCoolerHeight: 167,
    radiatorSupport: ['360mm', '280mm', '240mm'],
  });

export const caseSmall = () =>
  component('case', 'Fractal North', 139, {
    formFactorSupport: ['ATX', 'mATX', 'ITX'],
    maxGpuLength: 355,
    maxCoolerHeight: 170,
    radiatorSupport: ['360mm', '240mm'],
  });

export const caseTiny = () =>
  component('case', 'Small ITX', 99, {
    formFactorSupport: ['ITX', 'mATX'],
    maxGpuLength: 280,
    maxCoolerHeight: 140,
    radiatorSupport: ['240mm'],
  });

export const coolerAir = () =>
  component(
    'cooling',
    'Noctua NH-D15',
    109,
    {
      type: 'Air',
      tdpRating: 250,
      socketSupport: ['AM5', 'AM4', 'LGA1700', 'LGA1200'],
      height: 165,
      radiatorSize: null,
    },
    3,
    92,
  );

export const coolerTallAir = () =>
  component(
    'cooling',
    'Tall Air Tower',
    79,
    {
      type: 'Air',
      tdpRating: 180,
      socketSupport: ['AM5'],
      height: 172,
      radiatorSize: null,
    },
    3,
    70,
  );

export const coolerAio = () =>
  component(
    'cooling',
    'Arctic 360 AIO',
    129,
    {
      type: 'AIO',
      tdpRating: 300,
      socketSupport: ['AM5', 'AM4', 'LGA1700'],
      height: 63,
      radiatorSize: 360,
    },
    12,
    97,
  );

export const storageNvme = () =>
  component(
    'storage',
    'Samsung 990 Pro 2TB',
    169,
    {
      type: 'NVMe',
      interface: 'PCIe 4.0 x4',
      capacity: 2000,
      readSpeed: 7450,
      writeSpeed: 6900,
      formFactor: 'M.2 2280',
    },
    8,
    97,
  );

/** The 12 rules seeded by migration 001, in their camelCase form. */
export const RULES: CompatibilityRule[] = [
  {
    ruleKey: 'cpu_motherboard_socket',
    categoryA: 'cpu',
    categoryB: 'motherboard',
    ruleType: 'match',
    specPathA: 'socket',
    specPathB: 'socket',
    config: {},
    message: 'The CPU socket must match the motherboard socket.',
    severity: 'error',
  },
  {
    ruleKey: 'cpu_ram_type',
    categoryA: 'cpu',
    categoryB: 'ram',
    ruleType: 'match',
    specPathA: 'ramType',
    specPathB: 'type',
    config: {},
    message: 'Memory type must match the CPU controller.',
    severity: 'error',
  },
  {
    ruleKey: 'motherboard_ram_type',
    categoryA: 'motherboard',
    categoryB: 'ram',
    ruleType: 'match',
    specPathA: 'ramType',
    specPathB: 'type',
    config: {},
    message: 'Motherboard only accepts its designed memory generation.',
    severity: 'error',
  },
  {
    ruleKey: 'ram_capacity_max',
    categoryA: 'ram',
    categoryB: 'motherboard',
    ruleType: 'max',
    specPathA: 'capacity',
    specPathB: 'maxRam',
    config: { multiplier: 'sticks' },
    message: 'Total memory exceeds the motherboard maximum.',
    severity: 'error',
  },
  {
    ruleKey: 'gpu_case_length',
    categoryA: 'gpu',
    categoryB: 'case',
    ruleType: 'max',
    specPathA: 'length',
    specPathB: 'maxGpuLength',
    config: {},
    message: 'The graphics card is longer than the case supports.',
    severity: 'error',
  },
  {
    ruleKey: 'cooling_case_height',
    categoryA: 'cooling',
    categoryB: 'case',
    ruleType: 'max',
    specPathA: 'height',
    specPathB: 'maxCoolerHeight',
    config: { appliesWhen: { type: 'Air' } },
    message: 'The air cooler is taller than the case allows.',
    severity: 'error',
  },
  {
    ruleKey: 'cooling_socket_support',
    categoryA: 'cooling',
    categoryB: 'cpu',
    ruleType: 'match',
    specPathA: 'socketSupport',
    specPathB: 'socket',
    config: {},
    message: 'This cooler has no mounting kit for this socket.',
    severity: 'error',
  },
  {
    ruleKey: 'psu_wattage_min',
    categoryA: 'psu',
    categoryB: 'gpu',
    ruleType: 'min',
    specPathA: 'wattage',
    specPathB: 'recommendedPsu',
    config: { headroomPercent: 15 },
    message: 'The PSU is below the GPU recommended wattage plus headroom.',
    severity: 'error',
  },
  {
    ruleKey: 'psu_gpu_connectors',
    categoryA: 'psu',
    categoryB: 'gpu',
    ruleType: 'custom',
    specPathA: 'connectors',
    specPathB: 'powerConnectors',
    config: {},
    message: 'The PSU does not provide the GPU power connectors.',
    severity: 'warning',
  },
  {
    ruleKey: 'case_motherboard_formfactor',
    categoryA: 'case',
    categoryB: 'motherboard',
    ruleType: 'formfactor',
    specPathA: 'formFactorSupport',
    specPathB: 'formFactor',
    config: {},
    message: 'The motherboard form factor is not supported by this case.',
    severity: 'error',
  },
  {
    ruleKey: 'motherboard_case_pcie',
    categoryA: 'motherboard',
    categoryB: 'case',
    ruleType: 'custom',
    specPathA: 'pcie',
    specPathB: 'maxGpuLength',
    config: {},
    message: 'The GPU may cover expansion slots.',
    severity: 'warning',
  },
  {
    ruleKey: 'storage_motherboard_interface',
    categoryA: 'storage',
    categoryB: 'motherboard',
    ruleType: 'custom',
    specPathA: 'interface',
    specPathB: 'm2Slots',
    config: {},
    message: 'All M.2 slots are occupied.',
    severity: 'warning',
  },
];
