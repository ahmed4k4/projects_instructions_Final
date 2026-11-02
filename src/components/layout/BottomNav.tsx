import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Boxes, LayoutDashboard, MessageSquareCode, Search, Wrench, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Bottom navigation for phones (< md).
 *
 * Why a bottom bar rather than only the hamburger: the five destinations below
 * are used constantly, and on a 375px screen a drawer costs two taps and hides
 * the current location. This keeps "where am I" visible at all times, which is
 * the single biggest usability gap the Phase 7 review flagged.
 *
 * Layout notes
 *   · `pb-[env(safe-area-inset-bottom)]` clears the iPhone home indicator.
 *   · Each item is a 56px-tall column, comfortably above the 44px minimum.
 *   · The AppShell reserves matching bottom padding so nothing is covered.
 */

interface Tab {
  to: string;
  icon: LucideIcon;
  labelKey: string;
  /** Match the child route too (`/builder/ai` highlights Builder's sibling). */
  end?: boolean;
}

const TABS: Tab[] = [
  { to: '/builder', icon: Wrench, labelKey: 'nav.builder', end: true },
  { to: '/search', icon: Search, labelKey: 'nav.search' },
  { to: '/builder/ai', icon: Boxes, labelKey: 'nav.smartBuilder' },
  { to: '/ai-advisor', icon: MessageSquareCode, labelKey: 'nav.advisor' },
  { to: '/dashboard', icon: LayoutDashboard, labelKey: 'nav.dashboard' },
];

export function BottomNav() {
  const { t } = useTranslation();

  return (
    <nav
      aria-label={t('nav.primary')}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/85 backdrop-blur-xl pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {/* Five tabs: Builder · Search · Smart Builder · Advisor · Dashboard.
          Community moves to the drawer on phones — five is the practical limit
          before labels start truncating at 375px. */}
      <ul className="grid grid-cols-5">
        {TABS.map((tab) => (
          <li key={tab.to}>
            <NavLink
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                cn(
                  'flex min-h-14 flex-col items-center justify-center gap-1 px-1 pb-1.5 pt-2 text-[10px] font-medium transition-colors',
                  isActive ? 'text-primary-glow' : 'text-muted-foreground active:text-foreground',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      'grid size-8 place-items-center rounded-lg transition-colors',
                      isActive && 'bg-primary/12',
                    )}
                  >
                    <tab.icon className="size-[18px]" />
                  </span>
                  <span className="max-w-full truncate leading-none">{t(tab.labelKey)}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default BottomNav;
