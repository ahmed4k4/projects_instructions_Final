import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import i18n, { directionOf, isLanguage, type AppLanguage, type Direction } from '@/i18n';

export type Theme = 'dark' | 'light';

interface UIState {
  theme: Theme;
  /**
   * UI language. Kept here (not only in i18next) so components can subscribe
   * to it reactively with the same selector discipline as the rest of the store.
   */
  language: AppLanguage;
  sidebarOpen: boolean;
  sidebarCollapsed: boolean;
  commandOpen: boolean;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  setLanguage: (language: AppLanguage) => void;
  toggleLanguage: () => void;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setCommandOpen: (open: boolean) => void;
}

function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.classList.toggle('light', theme === 'light');
}

export const useUIStore = create<UIState>()(
  persist(
    // `theme` / `language` are kept in sync with <html> by AppShell, so there is
    // no write during rehydration (writes mid-subscribe are a classic loop source).
    (set, get) => ({
      theme: 'dark',
      language: isLanguage(i18n.language) ? i18n.language : 'en',
      sidebarOpen: false,
      sidebarCollapsed: false,
      commandOpen: false,

      toggleTheme: () => {
        const next: Theme = get().theme === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        set({ theme: next });
      },
      setTheme: (theme) => {
        applyTheme(theme);
        set({ theme });
      },

      setLanguage: (language) => {
        void i18n.changeLanguage(language);
        set({ language });
      },
      toggleLanguage: () => {
        const next: AppLanguage = get().language === 'ar' ? 'en' : 'ar';
        void i18n.changeLanguage(next);
        set({ language: next });
      },

      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      setCommandOpen: (open) => set({ commandOpen: open }),
    }),
    {
      name: 'nexus-ui',
      storage: createJSONStorage(() => localStorage),
      // Only durable UI preferences are persisted — transient state like
      // `sidebarOpen` / `commandOpen` must not survive a reload.
      partialize: (state) => ({
        theme: state.theme,
        language: state.language,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
    },
  ),
);

/** Current layout direction, derived from the active language. */
export function useDirection(): { dir: Direction; isRtl: boolean; sign: 1 | -1 } {
  const language = useUIStore((state) => state.language);
  const dir = directionOf(language);
  return { dir, isRtl: dir === 'rtl', sign: dir === 'rtl' ? -1 : 1 };
}
