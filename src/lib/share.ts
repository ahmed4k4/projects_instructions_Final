import LZString from 'lz-string';
import type { BuildSelection } from '@/types/build';
import { appUrl } from './appUrl';

/**
 * Anonymous build sharing — everything happens in the URL fragment.
 *
 * A build is encoded into `#b=<lz-string>`, so a shared link carries the whole
 * selection with it: no account, no database row, no server round-trip. The
 * fragment is used rather than a query string because it is never sent to the
 * server and never appears in referrer headers.
 *
 * Payload shape is deliberately narrow — only component ids and quantities, so a
 * link cannot smuggle arbitrary data into the app. Recipients resolve the ids
 * against their own catalogue, which also means a removed part degrades to
 * "missing" instead of corrupting the build.
 */

export const SHARE_HASH_PREFIX = '#b=';

/** Current payload version. Bump only on a breaking shape change. */
const PAYLOAD_VERSION = 1;

export interface SharedBuildPayload {
  v: number;
  /** Build name, trimmed to keep URLs short. */
  n?: string;
  /** category → component id */
  i: Record<string, string>;
  /** category → quantity, omitted when 1 */
  q?: Record<string, number>;
}

export interface DecodedShare {
  selection: BuildSelection;
  name?: string;
}

/** Serialise the current selection into a compact payload object. */
export function createSharePayload(
  selection: BuildSelection,
  name?: string,
  quantities?: Partial<Record<string, number>>,
): SharedBuildPayload {
  const items: Record<string, string> = {};
  for (const [category, component] of Object.entries(selection)) {
    if (component?.id) items[category] = component.id;
  }

  const payload: SharedBuildPayload = { v: PAYLOAD_VERSION, i: items };

  const trimmed = name?.trim();
  if (trimmed) payload.n = trimmed.slice(0, 60);

  const qty: Record<string, number> = {};
  for (const [category, count] of Object.entries(quantities ?? {})) {
    if (count && count > 1) qty[category] = count;
  }
  if (Object.keys(qty).length) payload.q = qty;

  return payload;
}

/**
 * Encode a selection into the `#b=` fragment value.
 * Returns an empty string when there is nothing worth sharing.
 */
export function encodeBuildFragment(
  selection: BuildSelection,
  name?: string,
  quantities?: Partial<Record<string, number>>,
): string {
  const payload = createSharePayload(selection, name, quantities);
  if (Object.keys(payload.i).length === 0) return '';
  return LZString.compressToEncodedURIComponent(JSON.stringify(payload));
}

/** Absolute share URL for the current origin. */
export function buildShareUrl(
  selection: BuildSelection,
  name?: string,
  quantities?: Partial<Record<string, number>>,
): string | null {
  const payload = encodeBuildFragment(selection, name, quantities);
  if (!payload) return null;
  // Always point at the landing/build page — a shared build is a fresh session,
  // not a snapshot of the sharer's current route.
  // `appUrl()` honours VITE_APP_URL so a staging deploy does not hand out
  // preview links.
  return `${appUrl()}/${SHARE_HASH_PREFIX}${payload}`;
}

function isPayload(value: unknown): value is SharedBuildPayload {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<SharedBuildPayload>;
  return typeof candidate.v === 'number' && Boolean(candidate.i) && typeof candidate.i === 'object';
}

/**
 * Decode an encoded fragment back into component ids.
 * Returns `null` for anything malformed — a bad link must never throw.
 */
export function decodeBuildFragment(encoded: string): SharedBuildPayload | null {
  if (!encoded) return null;
  try {
    const json = LZString.decompressFromEncodedURIComponent(encoded);
    if (!json) return null;
    const parsed = JSON.parse(json) as unknown;
    if (!isPayload(parsed)) return null;
    if (parsed.v > PAYLOAD_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Read `#b=` from a hash string (defaults to the current location).
 * Accepts both `#b=…` and a bare encoded value.
 */
export function readShareFragment(hash?: string): SharedBuildPayload | null {
  const source = hash ?? (typeof window === 'undefined' ? '' : window.location.hash);
  if (!source) return null;
  const trimmed = source.startsWith('#') ? source.slice(1) : source;
  const value = trimmed.startsWith('b=') ? trimmed.slice(2) : trimmed;
  return decodeBuildFragment(value);
}

/**
 * Resolve a payload's ids against a catalogue.
 *
 * Unknown ids are reported back so the UI can tell the user that a part in the
 * shared build no longer exists, instead of silently dropping it.
 */
export function resolveSharedBuild<T extends { id: string; category: string }>(
  payload: SharedBuildPayload,
  catalogue: readonly T[],
): { selection: BuildSelection; quantities: Record<string, number>; missing: string[] } {
  const byId = new Map(catalogue.map((component) => [component.id, component]));
  const selection: BuildSelection = {};
  const quantities: Record<string, number> = {};
  const missing: string[] = [];

  for (const [category, id] of Object.entries(payload.i)) {
    const component = byId.get(id);
    if (!component) {
      missing.push(id);
      continue;
    }
    // Trust the catalogue's own category over the payload's.
    (selection as Record<string, T>)[component.category] = component;
    quantities[component.category] = payload.q?.[category] ?? 1;
  }

  return { selection, quantities, missing };
}
