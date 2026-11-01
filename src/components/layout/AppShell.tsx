import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useReducedMotion } from 'framer-motion';
import { useUIStore } from '@/store/useUIStore';
import type { Theme } from '@/store/useUIStore';
import { applyDocumentLanguage, directionOf } from '@/i18n';
import { cn } from '@/lib/utils';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { PageTransition } from '@/components/shared/PageTransition';

function applyThemeClass(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.classList.toggle('light', theme === 'light');
}

/** Persistent chrome: sidebar + topbar around the animated route outlet. */
export function AppShell() {
  const { t } = useTranslation();
  const reduce = useReducedMotion();

  // One atomic selector per value: zustand v5 compares snapshots with ===, so a
  // selector returning a fresh object literal would loop forever.
  const theme = useUIStore((state) => state.theme);
  const language = useUIStore((state) => state.language);
  const sidebarCollapsed = useUIStore((state) => state.sidebarCollapsed);
  const setSidebarOpen = useUIStore((state) => state.setSidebarOpen);
  const { pathname } = useLocation();

  // Brief crossfade when the language flips — a hard swap of every string at
  // once is jarring, and the direction change moves the whole layout.
  const [fading, setFading] = useState(false);
  const [lastLanguage, setLastLanguage] = useState(language);

  useEffect(() => {
    applyThemeClass(theme);
  }, [theme]);

  useEffect(() => {
    applyDocumentLanguage(language);
    if (language === lastLanguage) return;

    setLastLanguage(language);
    if (reduce) return;

    setFading(true);
    const timer = setTimeout(() => setFading(false), 200);
    return () => clearTimeout(timer);
  }, [language, lastLanguage, reduce]);

  // Close the mobile drawer whenever the route changes. The equality check is
  // essential: writing `false` on every navigation would notify subscribers
  // that are not actually reading this value and can re-trigger this effect.
  useEffect(() => {
    if (useUIStore.getState().sidebarOpen) setSidebarOpen(false);
  }, [pathname, setSidebarOpen]);

  return (
    <div className="relative min-h-[100dvh] bg-background" dir={directionOf(language)}>
      <Sidebar collapsed={sidebarCollapsed} />

      <div
        className="flex min-h-[100dvh] flex-col transition-[padding] duration-300 ease-nexus lg:ps-sidebar"
        style={{ ['--sidebar-w' as string]: `${sidebarCollapsed ? 76 : 248}px` }}
      >
        <Topbar />
        <main className="flex-1">
          {/* No extra motion wrapper here: PageTransition already animates the
              route, and nesting a second <motion.div> collapsed the page to zero
              height (it inherited no height from a flex parent). */}
          <div
            className={cn('transition-opacity duration-200', fading && 'opacity-60')}
            data-language-fade
          >
            <PageTransition />
          </div>
        </main>
        <footer className="border-t border-border px-6 py-5 text-xs text-muted-foreground">
          <div className="flex flex-col items-center justify-between gap-2 sm:flex-row">
            <p>{t('footer.copyright', { year: new Date().getFullYear() })}</p>
            <p className="font-mono text-[11px]">{t('footer.engine')}</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
