/**
 * Text and structured-value coercion for anything rendered in a chat bubble.
 *
 * Two separate problems live here:
 *
 *  1. `[object Object]`. The provider now drops non-string model text at the
 *     boundary, but a chat is a place where a single stringified object is
 *     immediately visible to the user. `toDisplayText` is the second line of
 *     defence; `appendText` is the third (it makes the stream accumulator total,
 *     so `undefined + 'text'` can never produce "undefinedtext" either).
 *
 *  2. Structured answers. The advisor and the build generator can legitimately
 *     return JSON — a recommended part, a whole build. Dumping that as prose was
 *     how the object reached the DOM in the first place. `parseStructured` turns
 *     a JSON payload into a known shape that the UI can render as a card, and
 *     `formatStructured` is the readable fallback for anything unrecognised.
 */

/** What a model payload looked like, once recognised. */
export type StructuredPayload =
  | { kind: 'component'; data: Record<string, unknown> }
  | { kind: 'build'; data: Record<string, unknown> }
  | { kind: 'json'; data: unknown };

/** Keys that mark a payload as a single recommended part. */
const COMPONENT_KEYS = ['componentId', 'component_id', 'category', 'specs'];
/** Keys that mark a payload as a whole build. */
const BUILD_KEYS = ['items', 'components', 'parts'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Classify a parsed JSON value. Unrecognised objects are still renderable. */
function classifyPayload(value: unknown): StructuredPayload {
  if (isRecord(value)) {
    const keys = Object.keys(value);
    if (BUILD_KEYS.some((key) => key in value) && !keys.includes('componentId')) {
      return { kind: 'build', data: value };
    }
    if (COMPONENT_KEYS.some((key) => key in value)) {
      return { kind: 'component', data: value };
    }
  }
  return { kind: 'json', data: value };
}

/**
 * Parse a chat message that is *entirely* a JSON object or array.
 *
 * Deliberately strict: a model that writes prose containing a JSON example must
 * keep its prose. Only a message whose trimmed body starts with `{`/`[` and
 * ends with the matching bracket, and that actually parses, is treated as data.
 */
export function parseStructured(text: unknown): StructuredPayload | null {
  const raw = typeof text === 'string' ? text.trim() : '';
  if (!raw) return null;

  // Strip a ```json fence if the model added one.
  const fenced = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(raw);
  const body = (fenced?.[1] ?? raw).trim();

  const first = body[0];
  const last = body[body.length - 1];
  if (!((first === '{' && last === '}') || (first === '[' && last === ']'))) return null;

  try {
    return classifyPayload(JSON.parse(body));
  } catch {
    return null;
  }
}

/**
 * Pretty JSON for display. Assignment keeps the object shape visible instead of
 * producing `[object Object]` — which is what `String(value)` did.
 */
export function formatStructured(value: unknown): string {
  return toDisplayText(value);
}

export function toDisplayText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  if (value instanceof Error) return value.message;

  try {
    return JSON.stringify(value, null, 2) ?? '';
  } catch {
    // Circular structures cannot be serialised; a readable label beats a crash.
    return '[unrenderable value]';
  }
}

/**
 * Guard for streamed accumulation (`prev + chunk`).
 *
 * `undefined + 'text'` produced the literal string "undefinedtext" whenever a
 * frame arrived without text, and the same expression is what turned a nested
 * object into `[object Object]`. This makes the accumulator total.
 */
export function appendText(existing: string | undefined | null, chunk: unknown): string {
  return `${existing ?? ''}${toDisplayText(chunk)}`;
}
