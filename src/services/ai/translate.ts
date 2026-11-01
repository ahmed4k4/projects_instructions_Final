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
 * the result as a `user` turn with `functionResponse` parts. OpenAI-style
 * providers need one `tool` message per call, matched by `tool_call_id`.
 */
export function toNeutralMessages(contents: GeminiContent[], systemInstruction?: string): ChatMessage[] {
  const messages: ChatMessage[] = [];
  if (systemInstruction) messages.push({ role: 'system', content: systemInstruction });

  // Track call ids per function name so responses can be matched back.
  const pendingCalls = new Map<string, string>();

  for (const content of contents) {
    const callParts = content.parts.filter((p) => p.functionCall);
    const responseParts = content.parts.filter((p) => p.functionResponse);
    const textParts = content.parts.filter((p) => typeof p.text === 'string' && p.text.trim().length > 0);

    // 1. Assistant turn with tool calls.
    if (callParts.length > 0) {
      const toolCalls = callParts.map((p, index) => {
        const call = p.functionCall!;
        const id = `call_${messages.length}_${index}`;
        pendingCalls.set(call.name, id);
        return { id, name: call.name, args: call.args ?? {} };
      });
      messages.push({
        role: 'assistant',
        content: textParts
          .map((p) => p.text)
          .join('')
          .trim(),
        toolCalls,
      });
      continue;
    }

    // 2. Tool results returned by the executor.
    if (responseParts.length > 0) {
      for (const part of responseParts) {
        const response = part.functionResponse!;
        messages.push({
          role: 'tool',
          content: JSON.stringify(response.response ?? {}),
          toolCallId: pendingCalls.get(response.name) ?? 'call_0',
          toolName: response.name,
        });
      }
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
    tools: options.tools,
    temperature: options.temperature,
    maxTokens: options.maxOutputTokens,
    jsonSchema: options.responseSchema,
  };
}
