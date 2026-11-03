import { describe, expect, it } from 'vitest';
import { appendText, formatStructured, parseStructured, toDisplayText } from '@/lib/displayText';

/**
 * `[object Object]` in the chat bubble.
 *
 * The provider joined `p.text ?? ''` — and `??` only falls back on null, so a
 * part whose text was an OBJECT passed through and `.join('')` stringified it.
 * The symptom the user saw was a bubble reading "[object Object]".
 */
describe('toDisplayText', () => {
  it('passes strings through unchanged', () => {
    expect(toDisplayText('Build me a PC.')).toBe('Build me a PC.');
  });

  it('renders an object as JSON instead of [object Object]', () => {
    const value = { reason: 'budget', items: [] };
    const text = toDisplayText(value);
    expect(text).not.toContain('[object Object]');
    expect(JSON.parse(text)).toEqual(value);
  });

  it('handles primitives and errors', () => {
    expect(toDisplayText(42)).toBe('42');
    expect(toDisplayText(false)).toBe('false');
    expect(toDisplayText(new Error('boom'))).toBe('boom');
  });

  it('returns empty for nullish values', () => {
    expect(toDisplayText(null)).toBe('');
    expect(toDisplayText(undefined)).toBe('');
  });

  it('survives a circular structure', () => {
    const circular = {};
    circular.self = circular;
    expect(toDisplayText(circular)).toBe('[unrenderable value]');
  });
});

describe('appendText', () => {
  it('never produces "undefinedtext" on a frame with no text', () => {
    expect(appendText(undefined, 'Hello')).toBe('Hello');
    expect(appendText(null, 'Hello')).toBe('Hello');
  });

  it('coerces an object chunk rather than concatenating [object Object]', () => {
    const result = appendText('Prefix ', { items: [1] });
    expect(result).not.toContain('[object Object]');
    expect(result.startsWith('Prefix ')).toBe(true);
  });

  it('accumulates normally across streamed chunks', () => {
    expect(['a', 'b', 'c'].reduce((acc, chunk) => appendText(acc, chunk), '')).toBe('abc');
  });
});

/**
 * Structured answers.
 *
 * The advisor can legitimately return JSON — a recommended part or a whole
 * build. That payload must be recognised and rendered as a card, never dumped
 * into the DOM as `[object Object]`.
 */
describe('parseStructured', () => {
  it('recognises a component payload', () => {
    const result = parseStructured(
      '{"componentId":"gpu-5090","category":"gpu","name":"RTX 5090","price":475000}',
    );
    expect(result?.kind).toBe('component');
  });

  it('recognises a build payload', () => {
    const result = parseStructured('{"name":"4K build","items":[{"name":"RTX 5090","price":475000}]}');
    expect(result?.kind).toBe('build');
  });

  it('keeps arbitrary JSON renderable rather than dropping it', () => {
    const result = parseStructured('[{"a":1}]');
    expect(result?.kind).toBe('json');
  });

  it('strips a ```json fence', () => {
    expect(parseStructured('```json\n{"category":"cpu"}\n```')?.kind).toBe('component');
  });

  it('leaves prose alone, even when it mentions JSON', () => {
    expect(parseStructured('Try {"category":"cpu"} in the builder.')).toBeNull();
    expect(parseStructured('A normal answer about sockets.')).toBeNull();
  });

  it('is null for empty or unparsable input', () => {
    expect(parseStructured('')).toBeNull();
    expect(parseStructured('{broken')).toBeNull();
  });

  it('formats an unrecognised payload as JSON, never [object Object]', () => {
    const payload = parseStructured('{"deep":{"a":[1,2]}}');
    const text = formatStructured(payload?.data);
    expect(text).not.toContain('[object Object]');
    expect(JSON.parse(text)).toEqual({ deep: { a: [1, 2] } });
  });
});
