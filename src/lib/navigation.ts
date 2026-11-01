import {
  Boxes,
  LayoutDashboard,
  LayoutTemplate,
  MessageSquareCode,
  Sparkles,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { UseCase } from '@/types/build';
import type { ComponentCategory } from '@/types/components';

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  description: string;
  /** Visible only on larger screens or in docs. */
  primary?: boolean;
  badge?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Builder', to: '/builder', icon: Wrench, description: 'Pick every part', primary: true },
  {
    label: 'Smart Builder',
    to: '/builder/ai',
    icon: Sparkles,
    description: 'Describe it, AI specs it',
    badge: 'AI',
  },
  {
    label: 'AI Advisor',
    to: '/ai-advisor',
    icon: MessageSquareCode,
    description: 'Ask Gemini anything',
  },
  { label: 'Prebuilt', to: '/prebuilt', icon: LayoutTemplate, description: 'Curated configurations' },
  { label: 'Community', to: '/community', icon: Users, description: 'Builds from the crowd' },
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard, description: 'Your builds and alerts' },
];

export const SECONDARY_NAV: NavItem[] = [
  { label: 'Overview', to: '/', icon: Boxes, description: 'Back to landing' },
];

/* -------------------------------------------------------------------------- */
/*  Prebuilt catalogue metadata                                               */
/* -------------------------------------------------------------------------- */

export interface PrebuiltFilter {
  id: 'all' | UseCase;
  label: string;
}

export const PREBUILT_FILTERS: PrebuiltFilter[] = [
  { id: 'all', label: 'All builds' },
  { id: 'gaming', label: 'Gaming' },
  { id: 'ai', label: 'AI & ML' },
  { id: 'editing', label: 'Editing' },
  { id: 'programming', label: 'Programming' },
  { id: 'workstation', label: 'Workstation' },
  { id: 'streaming', label: 'Streaming' },
];

/* -------------------------------------------------------------------------- */
/*  Builder helpers                                                           */
/* -------------------------------------------------------------------------- */

/** Components required for a complete, bootable build. */
export const ESSENTIAL_CATEGORIES: ComponentCategory[] = [
  'cpu',
  'motherboard',
  'ram',
  'psu',
  'storage',
  'case',
];

export const BUILD_ORDER: ComponentCategory[] = [
  'cpu',
  'motherboard',
  'gpu',
  'ram',
  'storage',
  'psu',
  'case',
  'cooling',
];
