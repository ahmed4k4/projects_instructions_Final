/**
 * Regression checks for the Smart Builder tool loop.
 * Runs without installing the application dependencies (Node 22+).
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { toNeutralMessages } from '../src/services/ai/translate.ts';

const modelTurn = {
  role: 'model',
  parts: [
    { functionCall: { name: 'list_components', args: { category: 'cpu' }, id: 'cpu-call' }, thoughtSignature: 'sig-cpu' },
    { functionCall: { name: 'list_components', args: { category: 'gpu' }, id: 'gpu-call' }, thoughtSignature: 'sig-gpu' },
    { functionCall: { name: 'list_components', args: { category: 'motherboard' }, id: 'board-call' }, thoughtSignature: 'sig-board' },
  ],
};
const toolResultTurn = {
  role: 'user',
  parts: [
    { functionResponse: { name: 'list_components', response: { category: 'cpu' }, id: 'cpu-call' } },
    { functionResponse: { name: 'list_components', response: { category: 'gpu' }, id: 'gpu-call' } },
    { functionResponse: { name: 'list_components', response: { category: 'motherboard' }, id: 'board-call' } },
  ],
};

const neutral = toNeutralMessages([
  { role: 'user', parts: [{ text: 'Build a programming PC.' }] },
  modelTurn,
  toolResultTurn,
]);
const toolMessages = neutral.filter((message) => message.role === 'tool');
assert.equal(toolMessages.length, 1, 'parallel function results must remain one Gemini user turn');
assert.equal(toolMessages[0].parts.length, 3, 'the result batch must keep all functionResponse parts');
assert.deepEqual(
  toolMessages[0].parts.map((part) => part.functionResponse?.id),
  ['cpu-call', 'gpu-call', 'board-call'],
  'each response must keep the exact id of its matching function call',
);
assert.deepEqual(
  toolMessages[0].parts.map((part) => part.functionResponse?.name),
  ['list_components', 'list_components', 'list_components'],
);

const buildAgent = await readFile(new URL('../src/services/buildAgent.ts', import.meta.url), 'utf8');
const translate = await readFile(new URL('../src/services/ai/translate.ts', import.meta.url), 'utf8');
const provider = await readFile(new URL('../src/services/ai/providers/geminiProvider.ts', import.meta.url), 'utf8');
const proxy = await readFile(new URL('../api/ai/[...path].ts', import.meta.url), 'utf8');
const executor = await readFile(new URL('../src/services/aiTools.ts', import.meta.url), 'utf8');
const prompt = await readFile(new URL('../src/services/prompts/buildGenerator.ts', import.meta.url), 'utf8');
const models = await readFile(new URL('../src/services/ai/models.ts', import.meta.url), 'utf8');
const aiClient = await readFile(new URL('../src/services/ai/client.ts', import.meta.url), 'utf8');

assert.match(buildAgent, /contents\.push\(\{\s*role:\s*'user',\s*parts:\s*responseParts\s*\}\)/s,
  'parallel tool results must be appended as a single user turn');
assert.doesNotMatch(buildAgent, /onToken:\s*options\.onNarration/,
  'Smart Builder function calls must not use the lossy chat streaming path');
assert.match(buildAgent, /allowedFunctionNames:[\s\S]*?finalize_build/,
  'the final retry must force finalize_build');
assert.match(buildAgent, /allowedFunctionNames:[\s\S]*?list_components/,
  'an empty first turn must force a catalogue request instead of looping in AUTO mode');
assert.match(translate, /parts:\s*content\.parts/,
  'the neutral adapter must preserve the complete functionResponse batch');
assert.match(provider, /if \(req\.toolConfig\) body\.toolConfig = req\.toolConfig/,
  'the provider must forward Gemini toolConfig to the REST API');
assert.ok(proxy.includes('gemini-3\\.8-flash'), "Vercel proxy must allow the agent's primary Gemini 3.8 model");
assert.match(models, /quality:\s*\['gemini-3\.8-flash'/, 'quality routing must select Gemini 3.8 Flash first');
assert.match(buildAgent, /getValidatedSelections\(\)/, 'agent must recover verified builds if the model omits finalize_build');
assert.match(executor, /rememberValidatedSelection/, 'executor must remember deterministic compatibility checks');
assert.match(buildAgent, /recoverWithForcedFinalisation\(/, 'agent must make a bounded AI-only finalisation call after tool-loop exhaustion');
assert.match(buildAgent, /allowedFunctionNames:\s*\['finalize_build'\]/, 'recovery may call only finalize_build');
assert.match(buildAgent, /toolBreakdown/, 'fallback diagnostics must show which tools were actually called');
assert.match(buildAgent, /FINALISATION RECOVERY OVERRIDE/, 'recovery prompt must explicitly override the earlier mandatory research-tool steps');
assert.match(buildAgent, /selectBuildFromSnapshot\(/, 'AI must make a fresh structured selection from a complete catalogue snapshot before tool-loop exhaustion');
assert.match(aiClient, /model:\s*options\.model/, 'structured generation must preserve the requested quality model tier');
assert.match(buildAgent, /parseFinalizeJson\(/, 'plain JSON generation must be available when constrained JSON schema output fails');
assert.match(buildAgent, /\['rate_limited', 'unauthorized', 'not_configured', 'network', 'upstream_timeout'\]/, 'transport and quota failures must not burn more AI attempts');
assert.match(buildAgent, /function appendUserText[\s\S]*?last\.parts\.push\(\{ text \}\)/, 'additional user instructions must be merged into the same Gemini turn when adjacent');
assert.match(buildAgent, /attempt === 0[\s\S]*?geminiClient\.structured[\s\S]*?geminiClient\.generate/s, 'selection recovery must have independent constrained and plain-JSON paths');
assert.match(buildAgent, /const initialSelection = await selectBuildFromSnapshot/, 'structured AI selection must run before the multi-round tool loop');
assert.match(buildAgent, /recovery: \$\{recoveryIssue\.slice\(0, 220\)\}/, 'fallback message must expose the actual AI recovery validation reason');
assert.match(buildAgent, /component\.stockStatus === 'out_of_stock'/, 'final materialisation must reject confirmed out-of-stock parts');
assert.match(executor, /getComponent\(id: string\)/, 'AI selection validation must resolve stock state from the known catalogue');
assert.match(executor, /getSeenCategoryCounts\(/, 'diagnostics must report which catalogue categories were exposed');
assert.match(executor, /getFinalisationSnapshot\(/, 'recovery must prepare actual candidates for every category');
assert.match(buildAgent, /AUTHORITATIVE RECOVERY CATALOGUE/, 'the AI must see the complete category shortlist before forced finalisation');
assert.match(prompt, /authoritative recovery catalogue snapshot/, 'the system and tool contract must accept only IDs in the real recovery snapshot');

console.log('PASS: parallel function responses are grouped into one user turn');
console.log('PASS: every functionResponse keeps its matching call id');
console.log('PASS: Smart Builder uses non-streaming tool turns');
console.log('PASS: finalisation retry forces finalize_build');
console.log('PASS: Gemini toolConfig is forwarded to the API');
console.log('PASS: Vercel allowlist contains the active Gemini 3.8 model');
console.log('PASS: validated AI build candidate recovery is enabled');
console.log('\n26/26 Smart Builder regression checks passed.');
