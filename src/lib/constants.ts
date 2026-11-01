import {
  Cpu,
  Fan,
  HardDrive,
  MemoryStick,
  Box,
  Plug,
  CircuitBoard,
  MonitorPlay,
  type LucideIcon,
} from 'lucide-react';
import type { ComponentCategory } from '@/types/components';
import type { UseCase } from '@/types/build';

export interface CategoryMeta {
  id: ComponentCategory;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  description: string;
  /** Tailwind color token used for icon tint + accents. */
  tone: 'primary' | 'accent' | 'secondary' | 'success' | 'warning' | 'danger';
}

/** Canonical build order — also the order of the builder sidebar. */
export const CATEGORIES: CategoryMeta[] = [
  {
    id: 'cpu',
    label: 'Processor',
    shortLabel: 'CPU',
    icon: Cpu,
    description: 'Headroom for gaming, compiling and AI workloads',
    tone: 'primary',
  },
  {
    id: 'motherboard',
    label: 'Motherboard',
    shortLabel: 'Board',
    icon: CircuitBoard,
    description: 'Socket, chipset and expansion for your platform',
    tone: 'accent',
  },
  {
    id: 'gpu',
    label: 'Graphics Card',
    shortLabel: 'GPU',
    icon: MonitorPlay,
    description: 'Frames per second and AI inference throughput',
    tone: 'secondary',
  },
  {
    id: 'ram',
    label: 'Memory',
    shortLabel: 'RAM',
    icon: MemoryStick,
    description: 'Capacity and speed for heavy multi-tasking',
    tone: 'success',
  },
  {
    id: 'storage',
    label: 'Storage',
    shortLabel: 'SSD',
    icon: HardDrive,
    description: 'Fast NVMe for games, projects and model weights',
    tone: 'warning',
  },
  {
    id: 'psu',
    label: 'Power Supply',
    shortLabel: 'PSU',
    icon: Plug,
    description: 'Clean, quiet headroom above your peak draw',
    tone: 'danger',
  },
  {
    id: 'case',
    label: 'Case',
    shortLabel: 'Case',
    icon: Box,
    description: 'Airflow, clearance and the look of the build',
    tone: 'primary',
  },
  {
    id: 'cooling',
    label: 'Cooling',
    shortLabel: 'Cooling',
    icon: Fan,
    description: 'Keep boost clocks high and the build quiet',
    tone: 'accent',
  },
];

export const CATEGORY_MAP: Record<ComponentCategory, CategoryMeta> = CATEGORIES.reduce(
  (acc, meta) => {
    acc[meta.id] = meta;
    return acc;
  },
  {} as Record<ComponentCategory, CategoryMeta>,
);

export interface UseCaseMeta {
  id: UseCase;
  label: string;
  description: string;
  /** Fraction of the budget typically spent on GPU for this use case. */
  gpuBias: number;
}

export const USE_CASES: UseCaseMeta[] = [
  { id: 'gaming', label: 'Gaming', description: 'High refresh 1440p / 4K play', gpuBias: 0.42 },
  { id: 'ai', label: 'AI & ML', description: 'Local LLMs, training, inference', gpuBias: 0.5 },
  { id: 'editing', label: 'Video Editing', description: 'Timeline scrubbing, 4K/8K exports', gpuBias: 0.35 },
  { id: 'programming', label: 'Programming', description: 'Compiles, containers, IDEs', gpuBias: 0.2 },
  { id: 'workstation', label: 'Workstation', description: 'CAD, simulation, rendering', gpuBias: 0.4 },
  { id: 'streaming', label: 'Streaming', description: 'Encode while you play', gpuBias: 0.38 },
];

export const USE_CASE_MAP: Record<UseCase, UseCaseMeta> = USE_CASES.reduce(
  (acc, meta) => {
    acc[meta.id] = meta;
    return acc;
  },
  {} as Record<UseCase, UseCaseMeta>,
);

export const CURRENCY = 'USD';

export const BUDGET_PRESETS = [1000, 1500, 2000, 3000, 4500] as const;

export const RESOLUTIONS = ['1080p', '1440p', '4K'] as const;

export const SCORE_LABELS: Record<string, string> = {
  compatibility: 'Compatibility',
  performance: 'Performance',
  value: 'Value',
  efficiency: 'Efficiency',
  upgradability: 'Upgradability',
};

export const APP_NAME = 'Nexus';
export const APP_TAGLINE = 'AI-Powered PC Builder';
