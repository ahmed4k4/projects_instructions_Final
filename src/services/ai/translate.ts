/**
 * Adapter between the agents' Gemini-shaped conversation and the neutral
 * `ChatMessage[]` spoken by every provider.
 *
 * The agent loops (buildAgent / advisorAgent) were written against
 * `GeminiContent[]` in Phase 2. Rather than rewrite three agents, one adapter
 * converts at the boundary — and keeps working if a Gemini-shaped provider is
 * ever added back.
 */
import type { GenerateOptions, GeminiContent } from '@/types/ai';
import type { ChatMessage, ChatRequest } from './providers/types';

/**
 * Convert Gemini contents into neutral messages.
 *
 * Gemini represents a tool call as a `model` turn with `functionCall` parts and
 * all results (including parallel calls) as one `user` turn with multiple
 * `functionResponse` parts. Preserve that original turn boundary and IDs.
 */
export function toNeutralMessages(contents: GeminiContent[], systemInstruction?: string): ChatMessage[] {
  const messages: ChatMessage[] = [];
  if (systemInstruction) messages.push({ role: 'system', content: systemInstruction });

  for (const content of contents) {
    const callParts = content.parts.filter((p) => p.functionCall);
    const responseParts = content.parts.filter((p) => p.functionResponse);
    const textParts = content.parts.filter((p) => typeof p.text === 'string' && p.text.trim().length > 0);

    // 1. Assistant turn with tool calls.
    if (callParts.length > 0) {
      const toolCalls = callParts.map((p, index) => {
        const call = p.functionCall!;
        const id = `call_${messages.length}_${index}`;
        return {
          id,
          name: call.name,
          args: call.args ?? {},
          // Survives the round-trip: Gemini rejects a resumed loop without it.
          ...(p.thoughtSignature ? { thoughtSignature: p.thoughtSignature } : {}),
        };
      });
      messages.push({
        role: 'assistant',
        content: textParts
          .map((p) => p.text)
          .join('')
          .trim(),
        toolCalls,
        parts: content.parts,
      });
      continue;
    }

    // 2. Tool results returned by the executor.
    if (responseParts.length > 0) {
      // Keep parallel function responses in one original Gemini user turn.
      // Reconstructing one tool message per response turns a single tool-result
      // batch into multiple consecutive user messages, which breaks turn pairing.
      messages.push({
        role: 'tool',
        content: JSON.stringify(responseParts.map((part) => part.functionResponse?.response ?? {})),
        parts: content.parts,
        ...(responseParts.length === 1
          ? {
              toolCallId: responseParts[0]?.functionResponse?.id,
              toolName: responseParts[0]?.functionResponse?.name,
            }
          : {}),
      });
      continue;
    }

    // 3. Plain text turn.
    const text = textParts
      .map((p) => p.text)
      .join('')
      .trim();
    if (text) {
      messages.push({ role: content.role === 'model' ? 'assistant' : 'user', content: text });
    }
  }

  return messages;
}

/** Map the agent-facing options onto a provider request. */
export function toNeutralRequest(options: GenerateOptions): Omit<ChatRequest, 'messages'> {
  return {
    model: options.model,
    tools: options.tools,
    toolConfig: options.toolConfig,
    temperature: options.temperature,
    thinkingLevel: options.thinkingLevel,
    maxTokens: options.maxOutputTokens,
    jsonSchema: options.responseSchema,
  };
}
