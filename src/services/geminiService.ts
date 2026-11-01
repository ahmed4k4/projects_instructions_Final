/**
 * Application-facing AI client.
 *
 * Gemini is the only provider in Phase 5. This facade keeps the agent and page
 * call sites stable: they speak `GeminiContent`, while the provider layer does
 * the vendor-specific work and the grounding decision.
 *
 *   • tool execution  → src/services/aiTools.ts (runs the deterministic engines)
 *   • agent loop      → src/services/buildAgent.ts
 *   • prompts         → src/services/prompts/*
 *   • grounding       → src/services/ai/grounding.ts
 */
import type { GenerateOptions, GeminiContent, GenerateResult, ToolCall } from '@/types/ai';
import {
  generateFromContents,
  generateStructured,
  getAIStatus,
  hasUsableProvider,
  testProviders,
  type AIStatus,
} from './ai/client';

export class AIClient {
  /** True when at least one provider has credentials / is local. */
  async isAvailable(): Promise<boolean> {
    return hasUsableProvider();
  }

  async status(): Promise<AIStatus> {
    return getAIStatus();
  }

  /**
   * One agentic turn. Streams when `onToken`/`onEvent` is supplied, otherwise
   * returns a single JSON result. Both paths produce the same shape.
   */
  async generate(contents: GeminiContent[], options: GenerateOptions = {}): Promise<GenerateResult> {
    return generateFromContents(contents, options);
  }

  /** Multi-turn chat convenience wrapper. */
  async streamChat(
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    options: GenerateOptions,
    onToken: (token: string) => void,
  ): Promise<string> {
    const contents: GeminiContent[] = messages
      .filter((m) => m.role !== 'assistant' || m.content.trim().length > 0)
      .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));

    const result = await this.generate(contents, { ...options, onToken });
    return result.text;
  }

  /** JSON-schema constrained call (Build Doctor, FPS estimation). */
  async structured<T>(
    contents: GeminiContent[],
    schema: Record<string, unknown>,
    options: GenerateOptions = {},
  ): Promise<T> {
    return generateStructured<T>(contents, schema, options);
  }

  /** Re-probe providers ("Test connection"). */
  async test(): Promise<AIStatus> {
    return testProviders();
  }
}

export const aiClient = new AIClient();

/** Backwards-compatible alias: earlier phases imported `geminiClient`. */
export const geminiClient = aiClient;

export type { AIStatus, ToolCall };

/* -------------------------------------------------------------------------- */
/*  High-level entry points (used by the pages)                               */
/* -------------------------------------------------------------------------- */

export { generateBuild, refineBuild } from './buildAgent';
export { analyseBuildHealth, runBuildDoctor, suggestUpgrades } from './buildDoctor';
export { askAdvisor } from './advisorAgent';
export { estimateFpsWithAi } from './performanceAi';
