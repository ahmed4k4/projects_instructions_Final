import {
  Boxes,
  LayoutDashboard,
  LayoutTemplate,
  MessageSquareCode,
  Search,
  Sparkles,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { UseCase } from '@/types/build';
import type { ComponentCategory } from '@/types/components';

export interface NavItem {
  /** i18n key; resolved by the shell, never rendered raw. */
  labelKey: string;
  to: string;
  icon: LucideIcon;
  /** Visible only on larger screens or in docs. */
  primary?: boolean;
  badge?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { labelKey: 'nav.builder', to: '/builder', icon: Wrench, primary: true },
  { labelKey: 'nav.search', to: '/search', icon: Search, primary: true },
  { labelKey: 'nav.smartBuilder', to: '/builder/ai', icon: Sparkles, badge: 'AI' },
  { labelKey: 'nav.advisor', to: '/ai-advisor', icon: MessageSquareCode },
  { labelKey: 'nav.prebuilt', to: '/prebuilt', icon: LayoutTemplate },
  { labelKey: 'nav.community', to: '/community', icon: Users },
  { labelKey: 'nav.dashboard', to: '/dashboard', icon: LayoutDashboard },
];

export const SECONDARY_NAV: NavItem[] = [{ labelKey: 'nav.overview', to: '/', icon: Boxes }];

/* -------------------------------------------------------------------------- */
/*  Prebuilt catalogue metadata                                               */
/* -------------------------------------------------------------------------- */

export interface PrebuiltFilter {
  id: 'all' | UseCase;
}

export const PREBUILT_FILTERS: PrebuiltFilter[] = [
  { id: 'all' },
  { id: 'gaming' },
  { id: 'ai' },
  { id: 'editing' },
  { id: 'programming' },
  { id: 'workstation' },
  { id: 'streaming' },
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
