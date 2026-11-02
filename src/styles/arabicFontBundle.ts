/**
 * Arabic UI face — loaded on demand.
 *
 * This module exists only to be dynamically imported. Vite turns it into its own
 * CSS chunk, so a visitor who never switches to Arabic never downloads the
 * ~125 kB of IBM Plex Sans Arabic woff2 that used to sit in the base stylesheet
 * (it was the largest single cost of first paint on mobile).
 *
 * Imported by `src/i18n/fonts.ts`; do not import it eagerly anywhere.
 */
import '@fontsource/ibm-plex-sans-arabic/400.css';
import '@fontsource/ibm-plex-sans-arabic/500.css';
import '@fontsource/ibm-plex-sans-arabic/600.css';
import '@fontsource/ibm-plex-sans-arabic/700.css';

export {};
