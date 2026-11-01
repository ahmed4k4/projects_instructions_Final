import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Cpu, Github, Settings, X } from 'lucide-react';
import { NAV_ITEMS } from '@/lib/navigation';
import { cn } from '@/lib/utils';
import { spring, EASE_OUT } from '@/lib/motion';
import { useDirection, useUIStore } from '@/store/useUIStore';
import { useBuildStore } from '@/store/useBuildStore';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Logo } from './Logo';

/** Nav labels live in i18n; `NavItem.label` is the English fallback. */
const NAV_KEYS: Record<string, string> = {
  '/builder': 'nav.builder',
  '/builder/ai': 'nav.smartBuilder',
  '/ai-advisor': 'nav.advisor',
  '/prebuilt': 'nav.prebuilt',
  '/community': 'nav.community',
  '/dashboard': 'nav.dashboard',
  '/': 'nav.overview',
};

function isActivePath(path: string, to: string): boolean {
  return to === '/' ? path === '/' : path.startsWith(to);
}

interface SidebarProps {
  collapsed: boolean;
}

function NavContent({ collapsed }: SidebarProps) {
  const { pathname } = useLocation();
  const { t } = useTranslation();
  const { isRtl } = useDirection();
  const itemCount = useBuildStore((state) => Object.keys(state.items).length);

  return (
    <nav className="flex flex-1 flex-col gap-1 px-3" aria-label={t('nav.workspace')}>
      <p
        className={cn(
          'mb-2 px-2 pt-2 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground/70',
          collapsed && 'sr-only',
        )}
      >
        {t('nav.workspace')}
      </p>

      {NAV_ITEMS.map((item) => {
        const active = isActivePath(pathname, item.to);
        const Icon = item.icon;

        const link = (
          <NavLink
            key={item.to}
            to={item.to}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'group relative flex h-10 items-center gap-3 rounded-lg px-2.5 text-sm font-medium',
              'transition-colors duration-200',
              active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
              collapsed && 'justify-center px-0',
            )}
          >
            {active && (
              <motion.span
                layoutId="nav-indicator"
                className="absolute inset-0 rounded-lg border border-primary/20 bg-primary/10 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]"
                transition={spring}
              />
            )}
            {active && (
              <motion.span
                layoutId="nav-indicator-bar"
                className="absolute start-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-full bg-primary shadow-glow"
                transition={spring}
              />
            )}

            <Icon
              className={cn(
                'relative size-[18px] shrink-0 transition-colors',
                active ? 'text-primary-glow' : 'text-muted-foreground group-hover:text-foreground',
              )}
            />
            {!collapsed && (
              <>
                <span className="relative flex-1 truncate">{t(NAV_KEYS[item.to] ?? 'nav.workspace')}</span>
                {item.badge && (
                  <span className="relative rounded-full border border-accent/25 bg-accent/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-accent">
                    {item.badge}
                  </span>
                )}
                {item.to === '/builder' && itemCount > 0 && (
                  <span className="relative rounded-full bg-surface-elevated px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {itemCount}
                  </span>
                )}
              </>
            )}
          </NavLink>
        );

        return collapsed ? (
          <Tooltip key={item.to} delayDuration={150}>
            <TooltipTrigger asChild>{link}</TooltipTrigger>
            <TooltipContent side={isRtl ? 'left' : 'right'}>
              {t(NAV_KEYS[item.to] ?? 'nav.workspace')}
            </TooltipContent>
          </Tooltip>
        ) : (
          link
        );
      })}
    </nav>
  );
}

export function Sidebar({ collapsed }: SidebarProps) {
  const reduce = useReducedMotion();
  const sidebarOpen = useUIStore((state) => state.sidebarOpen);
  const setSidebarOpen = useUIStore((state) => state.setSidebarOpen);
  const sidebarCollapsed = useUIStore((state) => state.sidebarCollapsed);
  const setSidebarCollapsed = useUIStore((state) => state.setSidebarCollapsed);

  const width = sidebarCollapsed ? 76 : 248;
  const { t } = useTranslation();
  const { isRtl } = useDirection();

  return (
    <>
      {/* Desktop rail */}
      <motion.aside
        initial={false}
        animate={{ width }}
        transition={reduce ? { duration: 0 } : { duration: 0.28, ease: EASE_OUT }}
        className={cn(
          'fixed inset-y-0 start-0 z-40 hidden lg:flex flex-col border-e border-border',
          'bg-surface/60 backdrop-blur-xl',
        )}
      >
        <div className={cn('flex h-16 items-center px-4', collapsed && 'justify-center px-0')}>
          <Logo compact={sidebarCollapsed} />
        </div>

        <NavContent collapsed={sidebarCollapsed} />

        <div className="border-t border-border p-3">
          <div
            className={cn(
              'mb-3 flex min-w-0 items-center gap-2.5 rounded-lg border border-border bg-surface/70 p-2.5',
              sidebarCollapsed && 'justify-center',
            )}
          >
            <div className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary-glow">
              <Cpu className="size-4" />
            </div>
            {/* `min-w-0` on both the flex item and its parent is what lets
                truncate shrink instead of overflowing the sidebar. */}
            {!sidebarCollapsed && (
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-xs font-medium">{t('account.localWorkspace')}</p>
                <p className="truncate text-[10.5px] text-muted-foreground">{t('account.localHint')}</p>
              </div>
            )}
          </div>

          <div className={cn('flex items-center gap-1', sidebarCollapsed && 'flex-col')}>
            <button
              type="button"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              aria-label={sidebarCollapsed ? t('common.next') : t('common.back')}
              className="grid size-8 place-items-center rounded-md text-muted-foreground transition hover:bg-surface-elevated hover:text-foreground"
            >
              {/* Chevron points at the rail being expanded, so it flips in RTL. */}
              {sidebarCollapsed ? (
                <ChevronRight className={cn('size-4', isRtl && 'rotate-180')} />
              ) : (
                <ChevronLeft className={cn('size-4', isRtl && 'rotate-180')} />
              )}
            </button>
            {!sidebarCollapsed && (
              <>
                <a
                  href="https://github.com"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="GitHub"
                  className="grid size-8 place-items-center rounded-md text-muted-foreground transition hover:bg-surface-elevated hover:text-foreground"
                >
                  <Github className="size-4" />
                </a>
                <button
                  type="button"
                  aria-label={t('nav.overview')}
                  className="grid size-8 place-items-center rounded-md text-muted-foreground transition hover:bg-surface-elevated hover:text-foreground"
                >
                  <Settings className="size-4" />
                </button>
              </>
            )}
          </div>
        </div>
      </motion.aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setSidebarOpen(false)}
              className="fixed inset-0 z-40 bg-background/70 backdrop-blur-sm lg:hidden"
            />
            <motion.aside
              initial={{ x: isRtl ? '100%' : '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: isRtl ? '100%' : '-100%' }}
              transition={reduce ? { duration: 0 } : spring}
              className="fixed inset-y-0 start-0 z-50 flex w-[264px] flex-col border-e border-border bg-surface/95 backdrop-blur-xl lg:hidden"
            >
              <div className="flex h-16 items-center justify-between px-4">
                <Logo />
                <button
                  type="button"
                  onClick={() => setSidebarOpen(false)}
                  aria-label={t('common.close')}
                  className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-surface-elevated hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </div>
              <NavContent collapsed={false} />
              <div className="border-t border-border p-4 text-[11px] text-muted-foreground">
                {t('app.tagline')} · {NAV_ITEMS.length} {t('nav.workspace')}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
