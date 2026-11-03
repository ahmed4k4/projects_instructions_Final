import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Bell, LogOut, Menu, Moon, Search, Sun, User } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { useUIStore } from '@/store/useUIStore';
import { useBuildTotals } from '@/store/useBuildStore';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LanguageSwitcher } from './LanguageSwitcher';
import { Logo } from './Logo';

export function Topbar() {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const navigate = useNavigate();
  const theme = useUIStore((state) => state.theme);
  const toggleTheme = useUIStore((state) => state.toggleTheme);
  const setSidebarOpen = useUIStore((state) => state.setSidebarOpen);
  const commandOpen = useUIStore((state) => state.commandOpen);
  const setCommandOpen = useUIStore((state) => state.setCommandOpen);
  const { user, isLoading: authLoading, signOut } = useAuth();
  const totals = useBuildTotals();

  const shortcuts = [
    { label: t('nav.builder'), to: '/builder', keys: '⌘B' },
    { label: t('nav.advisor'), to: '/ai-advisor', keys: '⌘/' },
    { label: t('nav.prebuilt'), to: '/prebuilt', keys: '' },
  ];

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen(true);
      }
      if (event.key === 'Escape') setCommandOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setCommandOpen]);

  return (
    <>
      <header className="rigpilot-topbar sticky top-0 z-30 min-w-0 border-b backdrop-blur-2xl">
        {/*
         * `min-w-0` on the row AND on the search button is what keeps the topbar
         * inside a 375px viewport: a flex child defaults to `min-width: auto`,
         * so `w-full max-w-md` (448px) refused to shrink and pushed the header
         * 636px wide — the source of the page's horizontal scrollbar.
         */}
        <div className="flex h-16 min-w-0 items-center gap-2 px-4 sm:gap-3 sm:px-6">
          <div className="flex shrink-0 items-center gap-2 lg:hidden">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('nav.workspace')}
              onClick={() => setSidebarOpen(true)}
              className="min-h-11 min-w-11"
            >
              <Menu />
            </Button>
            <Logo compact className="hidden sm:flex" />
          </div>

          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            className={cn(
              'group ms-auto flex h-11 min-h-11 min-w-0 flex-1 max-w-md items-center gap-2.5 rounded-lg border border-border-strong sm:h-9',
              // After `sm:h-9`, so a coarse pointer keeps the 44px height on a
              // tablet that also matches the `sm` breakpoint.
              'pointer-coarse:min-h-11',
              'bg-surface/80 px-3 text-start text-sm text-muted-foreground transition-colors duration-200',
              'hover:border-primary/30 hover:bg-surface lg:ms-0',
            )}
          >
            <Search className="size-4 shrink-0" />
            <span className="flex-1 truncate">{t('common.search')}</span>
            <kbd className="hidden items-center gap-0.5 rounded border border-border-strong bg-surface-elevated px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:flex">
              <span className="text-xs">⌘</span>K
            </kbd>
          </button>

          <div className="ms-auto flex items-center gap-1.5">
            <div className="me-2 hidden items-center gap-2 rounded-full border border-border bg-surface/60 px-3 py-1.5 md:flex">
              <span className="size-1.5 rounded-full bg-success" />
              <span className="font-mono text-[11px] text-muted-foreground">
                {t('common.parts', { count: totals.itemCount })} ·{' '}
                {/*
                 * `dir="auto"`, not `dir="ltr"`. Intl already wraps an Arabic
                 * currency string in RTL marks (U+200F … ج.م. U+200F); forcing
                 * LTR overrode them and rendered "ج.م 379" with the currency
                 * first. `auto` lets the embedded marks place it correctly
                 * while still isolating the run from the surrounding sentence.
                 */}
                <span dir="auto" className="inline-block">
                  {formatCurrency(totals.totalPrice)}
                </span>
              </span>
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              aria-label={t('theme.toggle', { mode: t(theme === 'dark' ? 'theme.light' : 'theme.dark') })}
              className="relative"
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={theme}
                  initial={{ rotate: -90, opacity: 0, scale: 0.6 }}
                  animate={{ rotate: 0, opacity: 1, scale: 1 }}
                  exit={{ rotate: 90, opacity: 0, scale: 0.6 }}
                  transition={{ duration: reduce ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
                  className="grid place-items-center"
                >
                  {theme === 'dark' ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
                </motion.span>
              </AnimatePresence>
            </Button>

            <LanguageSwitcher className="hidden sm:flex" />

            <Button variant="ghost" size="icon" aria-label={t('nav.dashboard')} className="relative">
              <Bell className="size-[18px]" />
              <span className="absolute end-2.5 top-2.5 size-1.5 rounded-full bg-primary" />
            </Button>

            {authLoading ? (
              <span className="ms-1 size-9 animate-pulse rounded-full bg-surface-elevated" />
            ) : user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={t('account.signedIn')}
                    className="ms-1 grid size-9 place-items-center rounded-full border border-border-strong bg-gradient-to-br from-primary/30 to-secondary/20 text-xs font-semibold text-foreground transition hover:border-primary/40 pointer-coarse:size-11"
                  >
                    {(user.email ?? 'U').slice(0, 2).toUpperCase()}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  <DropdownMenuLabel>{t('account.signedIn')}</DropdownMenuLabel>
                  <div className="truncate px-2.5 pb-2 text-xs text-muted-foreground">{user.email}</div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate('/dashboard')}>
                    <User /> {t('nav.dashboard')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/builder')}>
                    <Search /> {t('nav.builder')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => void signOut()}>
                    <LogOut /> {t('account.signOut')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button size="sm" className="ms-1" onClick={() => navigate('/auth')}>
                {t('account.signIn')}
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Command palette (⌘K) */}
      <AnimatePresence>
        {commandOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-start justify-center bg-background/70 px-4 pt-[16vh] backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.18 }}
            onClick={() => setCommandOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: -12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.99 }}
              transition={{ duration: reduce ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}
              onClick={(event) => event.stopPropagation()}
              className="glass-strong w-full max-w-lg overflow-hidden rounded-2xl shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)]"
              role="dialog"
              aria-modal="true"
              aria-label={t('common.search')}
            >
              <div className="flex items-center gap-3 border-b border-border px-4 py-3">
                <Search className="size-4 text-muted-foreground" />
                <input
                  autoFocus
                  placeholder={t('common.search')}
                  className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
                />
                <kbd className="rounded border border-border-strong px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                  esc
                </kbd>
              </div>
              <ul className="p-2">
                {shortcuts.map((item) => (
                  <li key={item.to}>
                    <button
                      type="button"
                      onClick={() => {
                        navigate(item.to);
                        setCommandOpen(false);
                      }}
                      className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition hover:bg-surface-elevated hover:text-foreground"
                    >
                      {item.label}
                      <span className="font-mono text-[10px] text-muted-foreground/70">{item.keys}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
