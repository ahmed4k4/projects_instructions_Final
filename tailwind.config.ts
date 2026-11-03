import { Config } from 'tailwindcss';
import plugin from 'tailwindcss/plugin';
import animate from 'tailwindcss-animate';

/**
 * `pointer-coarse:` — true when the primary input is a finger.
 *
 * Width breakpoints answer "how much room is there", not "can this be tapped".
 * A 768–1024px tablet lays out the desktop grid and still gets 32px icon
 * buttons, which were the last sub-44px targets left on the site.
 */
const coarsePointer = plugin(({ addVariant }) => {
  addVariant('pointer-coarse', '@media (pointer: coarse)');
});

/**
 * Logical (direction-aware) spacing and inset utilities.
 *
 * Tailwind v3 has no `ms/me/ps/pe/start/end`, so they are generated here from
 * the same spacing scale. These map to CSS logical properties, which flip
 * automatically inside `dir="rtl"` — no per-component RTL variants needed.
 */
const logicalProperties = plugin(({ addUtilities, matchUtilities, theme }) => {
  matchUtilities(
    {
      ms: (value: string) => ({ marginInlineStart: value }),
      me: (value: string) => ({ marginInlineEnd: value }),
      ps: (value: string) => ({ paddingInlineStart: value }),
      pe: (value: string) => ({ paddingInlineEnd: value }),
      start: (value: string) => ({ insetInlineStart: value }),
      end: (value: string) => ({ insetInlineEnd: value }),
      'border-s': (value: string) => ({ borderInlineStartWidth: value }),
      'border-e': (value: string) => ({ borderInlineEndWidth: value }),
    },
    {
      values: theme('spacing'),
      supportsNegativeValues: true,
      // Without this, arbitrary values such as `lg:ps-[var(--sidebar-w)]`
      // resolve against an EMPTY scale and Tailwind silently emits no rule,
      // which is what left the main column sitting under the sidebar.
      modifiers: 'any',
    },
  );

  // Explicit arbitrary-value forms, so app-shell offsets never depend on
  // whether a token happens to exist in the spacing scale.
  addUtilities({
    '.ps-sidebar': { paddingInlineStart: 'var(--sidebar-w)' },
    '.pe-sidebar': { paddingInlineEnd: 'var(--sidebar-w)' },
  });

  addUtilities({
    '.text-start': { textAlign: 'start' },
    '.text-end': { textAlign: 'end' },
    '.float-start': { float: 'inline-start' },
    '.float-end': { float: 'inline-end' },
    '.rounded-s': { borderRadius: '0.625rem 0 0 0.625rem' },
    '.rounded-e': { borderRadius: '0 0.625rem 0.625rem 0' },
  });
});

/**
 * NEXUS theme — every colour resolves to a CSS variable declared in
 * `src/styles/globals.css`, so dark/light switching is a single class swap
 * on <html> with zero component changes.
 */
const config: Config = {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: { DEFAULT: "1rem", sm: "1.5rem", lg: "2rem", xl: "3rem" },
      screens: { "2xl": "1440px" },
    },
    extend: {
      colors: {
        background: "rgb(var(--background) / <alpha-value>)",
        surface: {
          DEFAULT: "rgb(var(--surface) / <alpha-value>)",
          elevated: "rgb(var(--surface-elevated) / <alpha-value>)",
          inset: "rgb(var(--surface-inset) / <alpha-value>)",
        },
        border: {
          DEFAULT: "var(--border)",
          strong: "var(--border-strong)",
        },
        foreground: "rgb(var(--foreground) / <alpha-value>)",
        muted: {
          DEFAULT: "rgb(var(--surface) / <alpha-value>)",
          foreground: "rgb(var(--muted-foreground) / <alpha-value>)",
        },
        primary: {
          DEFAULT: "rgb(var(--primary) / <alpha-value>)",
          glow: "rgb(var(--primary-glow) / <alpha-value>)",
          foreground: "rgb(var(--primary-foreground) / <alpha-value>)",
        },
        secondary: {
          DEFAULT: "rgb(var(--secondary) / <alpha-value>)",
          foreground: "rgb(var(--secondary-foreground) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "rgb(var(--accent) / <alpha-value>)",
          foreground: "rgb(var(--accent-foreground) / <alpha-value>)",
        },
        success: "rgb(var(--success) / <alpha-value>)",
        warning: "rgb(var(--warning) / <alpha-value>)",
        danger: "rgb(var(--danger) / <alpha-value>)",
        ring: "rgb(var(--primary) / <alpha-value>)",
      },
      fontFamily: {
        sans: [
          "Inter Variable",
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      borderRadius: {
        lg: "0.625rem",
        xl: "0.875rem",
        "2xl": "1.125rem",
      },
      boxShadow: {
        glow: "0 0 40px -10px rgb(66 217 245 / 0.48)",
        "glow-sm": "0 0 24px -8px rgb(66 217 245 / 0.34)",
        "glow-accent": "0 0 40px -12px rgb(184 243 107 / 0.30)",
        card: "0 1px 0 0 rgb(255 255 255 / 0.04) inset, 0 20px 40px -24px rgb(0 0 0 / 0.6)",
        "inner-line": "inset 0 1px 0 0 rgb(255 255 255 / 0.05)",
      },
      backgroundImage: {
        "grid-pattern":
          "linear-gradient(to right, rgb(255 255 255 / 0.045) 1px, transparent 1px), linear-gradient(to bottom, rgb(255 255 255 / 0.045) 1px, transparent 1px)",
        "radial-fade":
          "radial-gradient(ellipse at center, transparent 0%, rgb(var(--background)) 70%)",
        "primary-gradient":
          "linear-gradient(135deg, rgb(var(--primary)) 0%, rgb(var(--secondary)) 55%, rgb(var(--accent)) 100%)",
        "text-gradient":
          "linear-gradient(120deg, rgb(var(--foreground)) 0%, rgb(var(--primary-glow)) 45%, rgb(var(--accent)) 100%)",
        shimmer:
          "linear-gradient(90deg, transparent 0%, rgb(255 255 255 / 0.06) 50%, transparent 100%)",
      },
      backgroundSize: {
        grid: "48px 48px",
        "grid-sm": "24px 24px",
      },
      keyframes: {
        "mesh-drift": {
          "0%, 100%": { transform: "translate3d(0,0,0) scale(1)" },
          "33%": { transform: "translate3d(3%, -4%, 0) scale(1.08)" },
          "66%": { transform: "translate3d(-3%, 3%, 0) scale(0.96)" },
        },
        shimmer: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
        "pulse-ring": {
          "0%": { opacity: "0.6", transform: "scale(0.9)" },
          "70%, 100%": { opacity: "0", transform: "scale(1.6)" },
        },
        glitch: {
          "0%, 100%": { transform: "translate(0)" },
          "20%": { transform: "translate(-2px, 1px)" },
          "40%": { transform: "translate(2px, -1px)" },
          "60%": { transform: "translate(-1px, -2px)" },
          "80%": { transform: "translate(1px, 2px)" },
        },
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "mesh-drift": "mesh-drift 22s ease-in-out infinite",
        shimmer: "shimmer 1.8s ease-in-out infinite",
        "pulse-ring": "pulse-ring 2.4s cubic-bezier(0.2, 0.6, 0.3, 1) infinite",
        glitch: "glitch 400ms steps(2, end) infinite",
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
      transitionTimingFunction: {
        nexus: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [animate, logicalProperties, coarsePointer],
};

export default config;
