#!/usr/bin/env node
/**
 * Release checks for the PC Builder catalogue, stock states, compatibility
 * filter, numbered pagination and Smart Builder proxy model allowlist.
 * Runs without app dependencies.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [builder, card, catalogue, comparison, modal, comparePage, wizard, proxy, agent, aggregator, freshness, buildService, scraper, search, defaultRules, compatibilityFilter, useCatalogue, componentsService, candidateShortlist, aiTools] = await Promise.all([
  source('src/pages/Builder.tsx'),
  source('src/components/domain/ComponentCard.tsx'),
  source('src/lib/retailerCatalogue.ts'),
  source('src/components/retail/CompareTable.tsx'),
  source('src/components/retail/ComparePricesModal.tsx'),
  source('src/pages/Compare.tsx'),
  source('src/components/domain/SmartBuildWizard.tsx'),
  source('api/ai/[...path].ts'),
  source('src/services/buildAgent.ts'),
  source('src/services/retailers/aggregator.ts'),
  source('src/lib/stockFreshness.ts'),
  source('src/services/buildsService.ts'),
  source('supabase/functions/retailer-sync/parsers.ts'),
  source('src/services/searchService.ts'),
  source('src/lib/compatibility/defaultRules.ts'),
  source('src/lib/compatibility/filter.ts'),
  source('src/hooks/useCatalogue.ts'),
  source('src/services/componentsService.ts'),
  source('src/lib/scoring/candidateShortlist.ts'),
  source('src/services/aiTools.ts'),
]);

const checks = [];
function check(name, run) {
  try {
    run();
    checks.push({ name, ok: true });
    console.log(`PASS  ${name}`);
  } catch (error) {
    checks.push({ name, ok: false });
    console.error(`FAIL  ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

check('Builder paginates catalogue items in pages of 12', () => {
  assert.match(builder, /const COMPONENTS_PER_PAGE = 12/);
  assert.match(builder, /visible\.slice\(\(currentPage - 1\) \* COMPONENTS_PER_PAGE/);
  assert.match(builder, /<Pagination[\s\S]*?totalPages=\{totalPages\}/);
});
check('only-compatible toggle filters candidates against selected build', () => {
  assert.match(builder, /const \[onlyCompatible, setOnlyCompatible\] = useState\(false\)/);
  assert.match(builder, /const pairedRules = rules\.filter/);
  assert.match(builder, /evaluateCompatibility\(candidateItems, pairedRules\)/);
  assert.match(builder, /report\.checkedRules === 0/);
  assert.match(builder, /passesCompatibilityFilter\(status, onlyCompatible\)/);
  assert.match(builder, /import \{ passesCompatibilityFilter \} from '@\/lib\/compatibility\/filter'/);
});
check('compatible filter does not hide unverified/review candidates', () => {
  assert.match(compatibilityFilter, /return status !== 'incompatible'/);
  assert.match(builder, /passesCompatibilityFilter\(status, onlyCompatible\)/);
});
check('database compatibility rules merge with bundled safety rules', () => {
  assert.match(defaultRules, /DEFAULT_COMPATIBILITY_RULES/);
  assert.match(defaultRules, /remoteByKey\.get\(rule\.ruleKey\) \?\? rule/);
  assert.match(useCatalogue, /mergeCompatibilityRules\(remoteRules\)/);
  assert.match(componentsService, /mergeCompatibilityRules\(remote\)/);
});
check('missing counterpart/rules are labelled unverified rather than green-compatible', () => {
  assert.match(builder, /pairedRules\.length === 0/);
  assert.match(builder, /Hide only proven hard conflicts|Hide only parts with a confirmed conflict/);
  assert.match(builder, /report\.unverified\?\.length/);
  assert.match(builder, /hasReviewWarning/);
  assert.match(builder, /builder\.selection\.waitingForParts/);
});
check('page resets when catalogue filters or selections change', () => {
  assert.match(builder, /setPage\(1\);[\s\S]*?\}, \[category, query, sort, onlyCompatible, items\]\)/);
});
check('selecting a known-incompatible part is blocked with a reason', () => {
  assert.match(builder, /if \(report\.errors\.length > 0\)[\s\S]*?toast\.error[\s\S]*?return;/);
  assert.match(builder, /builder\.selection\.unverified/);
  assert.match(builder, /builder\.selection\.waitingForParts/);
});
check('unknown retailer stock is never converted to out-of-stock', () => {
  assert.match(catalogue, /return 'unknown';/);
  assert.match(catalogue, /stockStatus: link\.stockStatus \?\? component\.stockStatus/);
});
check('canonical offer ranking chooses in-stock before unknown/out-of-stock', () => {
  assert.match(catalogue, /rankOffers\(group\.offers\.filter/);
  assert.match(catalogue, /return rankOffers\(offers\)/);
});
check('each retailer keeps its own stock status and update timestamp', () => {
  assert.match(catalogue, /stockStatus: offer\.stockStatus/);
  assert.match(catalogue, /stockUpdatedAt: offer\.lastScrapedAt/);
  assert.match(catalogue, /stockUpdatedAt \?\? component\.updatedAt/);
});
check('component cards show four distinct stock states', () => {
  for (const state of ['in_stock', 'limited', 'out_of_stock', 'stockUnknown']) assert.ok(card.includes(state));
  assert.match(card, /compatibilityStatus === 'review'/);
});
check('retailer comparison only labels a confirmed in-stock offer as buy', () => {
  assert.match(comparison, /offer\.stockStatus === 'in_stock' \? t\('retail\.buy'\) : t\('retail\.visit'\)/);
  assert.match(modal, /offer\.stockStatus === 'in_stock' \? t\('retail\.buy'\) : t\('retail\.visit'\)/);
  assert.match(comparePage, /offer\.stockStatus === 'in_stock'/);
});
check('Smart Builder budget slider is bounded but manual entry remains unrestricted', () => {
  assert.match(wizard, /type="text"[\s\S]*?onChange=\{\(event\) => setBudgetInput\(event\.target\.value\.replace\(\/\[\^0-9\]\/g, ''\)\)\}/);
  assert.match(wizard, /type="range"[\s\S]*?min=\{10_000\}[\s\S]*?max=\{1_000_000\}/);
  assert.match(wizard, /Math\.min\(1_000_000, Math\.max\(10_000/);
});
check('AI catalogue shortlist includes low-cost, high-performance and best-value candidates', () => {
  assert.match(candidateShortlist, /affordable/);
  assert.match(candidateShortlist, /performance/);
  assert.match(candidateShortlist, /value/);
  assert.match(aiTools, /selectBudgetBalancedCandidates\(await this\.catalogue\(category\), budget, perCategory\)/);
  assert.match(aiTools, /selectBudgetBalancedCandidates\([\s\S]*?12/);
});
check('Vercel allows the Gemini 3.8 quality-tier model', () => {
  assert.ok(proxy.includes('gemini-3\\.8-flash'));
  assert.match(agent, /model: 'quality'/);
});
check('Smart Builder preserves parallel tool results before finalisation', () => {
  assert.match(agent, /contents\.push\(\{\s*role:\s*'user',\s*parts:\s*responseParts\s*\}\)/s);
  assert.match(agent, /allowedFunctionNames:[\s\S]*?finalize_build/);
});
check('stale or undated retailer stock is converted to unknown across all feeds', () => {
  assert.match(freshness, /STOCK_STATUS_MAX_AGE_MS = 48 \* 60 \* 60 \* 1000/);
  assert.match(aggregator, /getFreshStockStatus\(product\.stockStatus, feed\.capturedAt\)/);
  assert.match(aggregator, /getFreshStockStatus\(product\.stockStatus, capturedAt\)/);
  assert.match(aggregator, /getFreshStockStatus\(\(row\.stock_status[\s\S]*?row\.last_scraped_at\)/);
});
check('legacy saved builds do not invent an in-stock status', () => {
  assert.match(buildService, /stockStatus: 'unknown'/);
});
check('schema.org missing or unfamiliar availability is not marked in stock', () => {
  assert.match(scraper, /parseSchemaOrgStockStatus\(offers\?\.availability\)/);
  assert.match(scraper, /if \(!normalized\) return 'unknown'/);
  assert.match(scraper, /return 'unknown';\s*\}/);
});
check('price savings require confirmed in-stock offers from multiple retailers', () => {
  assert.match(aggregator, /distinctBuyableRetailers > 1 \? Math\.max\(0, dearest - cheapest\) : 0/);
  assert.match(search, /const pool = inStock/);
  assert.match(search, /distinctRetailers > 1/);
});

const failed = checks.filter((item) => !item.ok);
console.log(`\nBuilder release contract: ${checks.length - failed.length}/${checks.length} passed`);
if (failed.length) process.exit(1);
