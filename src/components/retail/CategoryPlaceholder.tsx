import type { ComponentCategory } from '@/types/components';

/**
 * Category placeholder artwork.
 *
 * Retailer CDs are inconsistent about serving product photos: Alfrensia's listing
 * pages return a WooCommerce placeholder for most items, and some stores block
 * hotlinking. Rather than show a broken image or an empty box, every card falls
 * back to a category illustration drawn as an inline SVG — no extra request, no
 * 404, and it works at any size.
 *
 * Inline SVG rather than `/placeholders/gpu.png` files: eight PNGs would be eight
 * more assets to build, cache and keep in sync with the theme, and a flat colour
 * can never follow the light/dark tokens. These use `currentColor`.
 */

/** A short, legible glyph per category, drawn on a 24×24 grid. */
const GLYPHS: Record<string, string> = {
  // CPU: square die with pins
  cpu: 'M7 7h10v10H7z M9 9h6v6H9z M3 9h2 M3 12h2 M3 15h2 M19 9h2 M19 12h2 M19 15h2 M9 3v2 M12 3v2 M15 3v2 M9 19v2 M12 19v2 M15 19v2',
  // GPU: card with two fans
  gpu: 'M3 8h18v8H3z M6 10h4v4H6z M14 10h4v4h-4z M6 16v2 M18 16v2',
  // Motherboard: board with a socket
  motherboard: 'M3 4h18v16H3z M6 7h5v5H6z M14 7h4v3h-4z M14 13h4v4h-4z M6 15h5v2H6z',
  // RAM: stick with contacts
  ram: 'M2 7h20v8H2z M5 9v4 M8 9v4 M11 9v4 M14 9v4 M17 9v4 M4 17v2 M20 17v2',
  // Storage: drive with a platter
  storage: 'M3 5h18v14H3z M7 9h10 M7 12h10 M7 15h6',
  // PSU: unit with a fan and plug
  psu: 'M3 5h18v14H3z M7 8h6v6H7z M16 9h3 M16 12h3 M16 15h3',
  // Case: tower with drive bays
  case: 'M5 3h10v18H5z M7 6h6 M7 9h6 M7 12h6 M17 6h2 M17 10h2',
  // Cooling: fan blades
  cooling: 'M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0 M12 9V4 M14.5 13.5l4 3 M9.5 13.5l-4 3',
};

export interface PlaceholderProps {
  category: ComponentCategory | null;
  className?: string;
  /** Accessible name; omitted makes the SVG decorative. */
  label?: string;
}

/**
 * Inline category illustration.
 *
 * Marked `aria-hidden` unless a label is supplied: a decorative glyph next to a
 * product name adds nothing for a screen reader.
 */
export function CategoryPlaceholder({ category, className, label }: PlaceholderProps) {
  const glyph: string = (category ? GLYPHS[category] : undefined) ?? GLYPHS.gpu ?? '';

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {glyph.split(' M').map((segment, index) => (
        <path key={index} d={index === 0 ? segment : `M${segment}`} />
      ))}
    </svg>
  );
}

/** Fallback image path for plain `<img>` consumers (e.g. the build share card). */
export const PLACEHOLDER_BY_CATEGORY: Record<string, string> = {
  cpu: '/placeholders/cpu.svg',
  gpu: '/placeholders/gpu.svg',
  motherboard: '/placeholders/motherboard.svg',
  ram: '/placeholders/ram.svg',
  storage: '/placeholders/storage.svg',
  psu: '/placeholders/psu.svg',
  case: '/placeholders/case.svg',
  cooling: '/placeholders/cooling.svg',
};

/** Default used when a category is unknown. */
export const DEFAULT_PLACEHOLDER = '/placeholders/gpu.svg';
