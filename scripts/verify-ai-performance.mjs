#!/usr/bin/env node
import { readFileSync, existsSync, statSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` (${detail})` : ''}`);
};

const advisor = read('src/services/advisorAgent.ts');
const provider = read('src/services/ai/providers/geminiProvider.ts');
const models = read('src/services/ai/models.ts');
const hooks = read('src/hooks/useComponents.ts');
const aggregator = read('src/services/retailers/aggregator.ts');
const proxy = read('src/server/geminiProxy.ts');
const ui = read('src/pages/AIAdvisor.tsx');
const tools = read('src/services/aiTools.ts');
const buildAgent = read('src/services/buildAgent.ts');
const buildDoctor = read('src/services/buildDoctor.ts');

check('AI advisor passes onToken into generate (real token streaming)', /maxOutputTokens:\s*1_?200,[\s\S]*?onToken:/s.test(advisor));
check('interactive model is Gemini 3.5 Flash-Lite', /chat:\s*\['gemini-3\.5-flash-lite'/.test(models));
check('model cache uses current routing version', /nexus:ai:model:v3/.test(models));
check('interactive thinking is MINIMAL', /thinkingLevel:\s*'MINIMAL'/.test(advisor) && /thinkingConfig:\s*\{\s*thinkingLevel\s*\}/.test(provider));
check('provider uses Gemini SSE endpoint', /streamGenerateContent\?alt=sse/.test(provider));
check('slow first-token requests fall back after a bounded 8s deadline', /FIRST_TOKEN_TIMEOUT_MS = 8_000/.test(provider) && /AbortSignal.any/.test(provider));
check('fallback is limited to actual Google upstream errors', /x-ai-upstream.*google/.test(provider) && /'X-AI-Upstream':\s*'google'/.test(proxy));
check('tool rounds and tool calls are bounded', /MAX_TOOL_ROUNDS\s*=\s*2/.test(advisor) && /MAX_TOOL_CALLS\s*=\s*4/.test(advisor));
check('AI catalogue requests category-specific listings', /loadCatalogueForAI\(category\)/.test(tools) && /category \? \{ category \}/.test(hooks));
check('AI catalogue excludes slow secondary Sigma feed', /createCatalogue\(false, category\)/.test(hooks));
check('category snapshot fallback has short timeout', /retailer_snapshot_by_category/.test(aggregator) && /setTimeout\(\(\) => controller\.abort\(\), 2_500\)/.test(aggregator));
check('mobile rendering batches token updates per animation frame', /requestAnimationFrame/.test(ui) && /pendingTokensRef/.test(ui));
check('build-generation uses minimal thinking and streams narration', /maxOutputTokens:\s*1_?536/.test(buildAgent) && /thinkingLevel:\s*'MINIMAL'/.test(buildAgent) && /onToken:\s*options\.onNarration/.test(buildAgent));
check('AI upgrade and refinement output is EGP-only', !/\(\+\$|\(-\$|\(\$\$/.test(buildDoctor + buildAgent));
check('category snapshots exist for all supported categories', ['cpu','gpu','motherboard','ram','storage','psu','case','cooling'].every((category) => existsSync(`public/data/retailer_snapshot_by_category/${category}.json`)));
check('category snapshots are smaller than the full catalogue', ['cpu','gpu','motherboard','ram','storage','psu','case','cooling'].every((category) => statSync(`public/data/retailer_snapshot_by_category/${category}.json`).size < statSync('public/data/retailer_snapshot.json').size));

const failed = checks.filter((item) => !item.ok);
console.log(`\nAI performance contract: ${checks.length - failed.length}/${checks.length} passed`);
if (failed.length) process.exit(1);
