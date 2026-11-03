import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Elnekhely serves its product photos only to requests that carry NO Referer.
 *
 * Measured against four header profiles on live URLs:
 *   no Referer            -> 200 image/*
 *   their own Referer     -> 200
 *   any foreign Referer   -> **403**
 *
 * A browser sends our origin by default, which is exactly the refused case, so
 * every `<img>` that renders a retailer photo must opt out of sending one. This
 * is a source-level assertion because the failure is invisible in unit tests and
 * only appears on the deployed origin.
 */
const RETAIL_IMAGE_FILES = [
  'src/components/retail/SearchResultCard.tsx',
  'src/components/retail/SearchBar.tsx',
  'src/pages/Compare.tsx',
];

describe('retailer image tags', () => {
  it.each(RETAIL_IMAGE_FILES)('%s suppresses the Referer header', (file) => {
    const source = readFileSync(file, 'utf8');
    const tags = [...source.matchAll(/<img\b[\s\S]*?\/>/g)].map((m) => m[0]);

    expect(tags.length, `${file} should render at least one <img>`).toBeGreaterThan(0);
    for (const tag of tags) {
      expect(tag, `${file} has an <img> without referrerPolicy="${'no-referrer'}"`).toContain(
        'referrerPolicy="no-referrer"',
      );
    }
  });
});
