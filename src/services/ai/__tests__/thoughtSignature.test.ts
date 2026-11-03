/**
 * Regression tests for the Phase 5 → 6 blocking bug.
 *
 * Gemini attaches a `thoughtSignature` to every `functionCall` part and rejects
 * a resumed tool loop that does not echo it back:
 *
 *   400 Function call is missing a thought_signature in functionCall parts.
 *
 * The fix is that the raw model turn is replayed verbatim. These tests fail if
 * anyone reintroduces the part-rebuilding that used to strip the signature.
 */
import { describe, expect, it, vi } from 'vitest';
import { toGeminiContents } from '@/services/ai/providers/geminiProvider';
import { toNeutralMessages } from '@/services/ai/translate';
import type { ChatMessage } from '@/services/ai/providers/types';
import type { GeminiContentPart } from '@/types/ai';

const SIGNATURE = 'EmAKXgFpFH0TyTEMwolPr0rPDmuO+NLoCYhju8PBUJdRzmdw7g8=';

/** Index a part without tripping `noUncheckedIndexedAccess`. */
function partAt(turn: { parts?: ReadonlyArray<unknown> } | undefined, index: number): GeminiContentPart {
  const part = turn?.parts?.[index];
  if (!part) throw new Error(`missing part ${index}`);
  return part as GeminiContentPart;
}

const MODEL_TURN = {
  role: 'model',
  parts: [
    { text: 'Let me check the catalogue.' },
    {
      functionCall: { name: 'list_components', args: { category: 'gpu' }, id: 'call_1' },
      thoughtSignature: SIGNATURE,
    },
  ],
};

describe('thought_signature preservation', () => {
  it('replays raw parts byte-for-byte through the neutral layer', () => {
    const messages = toNeutralMessages([MODEL_TURN] as ChatMessage[] as never);
    expect(messages).toHaveLength(1);
    expect(partAt(messages[0], 1).thoughtSignature).toBe(SIGNATURE);

    const { contents } = toGeminiContents(messages);
    expect(partAt(contents[0], 1).thoughtSignature).toBe(SIGNATURE);
    expect(partAt(contents[0], 1).functionCall?.id).toBe('call_1');
  });

  it('keeps the signature when only toolCalls are available', () => {
    const messages: ChatMessage[] = [
      {
        role: 'assistant',
        content: '',
        toolCalls: [{ name: 'list_components', args: {}, id: 'call_1', thoughtSignature: SIGNATURE }],
      },
    ];

    const { contents } = toGeminiContents(messages);
    expect(partAt(contents[0], 0).thoughtSignature).toBe(SIGNATURE);
  });

  it('does not emit an undefined signature key', () => {
    const { contents } = toGeminiContents([
      { role: 'assistant', content: '', toolCalls: [{ name: 'x', args: {} }] },
    ]);
    expect(Object.keys(partAt(contents[0], 0))).toEqual(['functionCall']);
  });

  it('sends function responses as user parts, one per call', () => {
    const { contents } = toGeminiContents([
      { role: 'tool', content: '{"components":[]}', toolName: 'list_components', toolCallId: 'call_1' },
    ]);
    expect(contents[0]?.role).toBe('user');
    expect(partAt(contents[0], 0).functionResponse).toMatchObject({
      name: 'list_components',
      id: 'call_1',
    });
  });

  it('preserves IDs for parallel calls that share the same function name', () => {
    const turns = [
      {
        role: 'model',
        parts: [
          { functionCall: { name: 'list_components', args: { category: 'cpu' }, id: 'list_cpu' }, thoughtSignature: SIGNATURE },
          { functionCall: { name: 'list_components', args: { category: 'gpu' }, id: 'list_gpu' }, thoughtSignature: SIGNATURE },
        ],
      },
      {
        role: 'user',
        parts: [
          { functionResponse: { name: 'list_components', response: { category: 'cpu' }, id: 'list_cpu' } },
          { functionResponse: { name: 'list_components', response: { category: 'gpu' }, id: 'list_gpu' } },
        ],
      },
    ];

    const messages = toNeutralMessages(turns as never);
    const toolMessages = messages.filter((message) => message.role === 'tool');
    expect(toolMessages).toHaveLength(1);
    const { contents } = toGeminiContents(messages);
    expect(contents[1]?.role).toBe('user');
    expect(contents[1]?.parts).toHaveLength(2);
    expect(partAt(contents[1], 0).functionResponse?.id).toBe('list_cpu');
    expect(partAt(contents[1], 1).functionResponse?.id).toBe('list_gpu');
  });

  it('does not manufacture an ID when Gemini omitted the original call ID', () => {
    const messages = toNeutralMessages([
      { role: 'user', parts: [{ functionResponse: { name: 'list_components', response: { ok: true } } }] },
    ] as never);
    expect(messages[0]?.toolCallId).toBeUndefined();
    const { contents } = toGeminiContents(messages);
    expect(partAt(contents[0], 0).functionResponse).not.toHaveProperty('id');
  });
});

describe('streamed tool-call assembly', () => {
  it('keeps the signature from the final frame of a split turn', async () => {
    const frames = [
      { candidates: [{ content: { role: 'model', parts: [{ text: 'Checking' }] } }] },
      {
        candidates: [
          {
            content: {
              role: 'model',
              parts: [
                {
                  functionCall: { name: 'list_components', args: { category: 'gpu' }, id: 'call_9' },
                  thoughtSignature: SIGNATURE,
                },
              ],
            },
          },
        ],
      },
    ];

    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        for (const frame of frames) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(frame)}\r\n\r\n`));
        }
        controller.close();
      },
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(body, { status: 200 })),
    );

    const { geminiProvider } = await import('@/services/ai/providers/geminiProvider');
    const result = await geminiProvider.streamChat(
      { messages: [{ role: 'user', content: 'find a gpu' }] },
      () => undefined,
    );

    expect(result.toolCalls[0]?.thoughtSignature).toBe(SIGNATURE);
    expect(result.modelParts?.some((p) => p.thoughtSignature === SIGNATURE)).toBe(true);

    vi.unstubAllGlobals();
  });
});
