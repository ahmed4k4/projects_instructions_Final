import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const checks = [];
function check(name, condition, detail = '') {
  checks.push({ name, ok: Boolean(condition), detail });
}

const vite = read('vite.config.ts');
const router = read('src/router.tsx');
const i18n = read('src/i18n/index.ts');
const css = read('src/styles/globals.css');
const logo = read('src/components/layout/Logo.tsx');
const packageJson = JSON.parse(read('package.json'));
const health = read('api/auth/health.ts');
const button = read('src/components/ui/button.tsx');
const componentCard = read('src/components/domain/ComponentCard.tsx');
const buildSummary = read('src/components/domain/BuildSummaryPanel.tsx');
const gradientMesh = read('src/components/shared/GradientMesh.tsx');

check('Vite dev server wires signup endpoint', vite.includes("'/api/auth/signup': signupHandler"));
check('Vite dev server wires login endpoint', vite.includes("'/api/auth/login': loginHandler"));
check('Vite dev server wires safe auth health endpoint', vite.includes("'/api/auth/health': authHealthHandler"));
check('Vite dev server loads server-only Supabase env', vite.includes("'SUPABASE_SERVICE_ROLE_KEY'") && vite.includes("loadEnv(server.config.mode, process.cwd(), '')"));
check('React Router v7 startTransition flag is on RouterProvider (supported prop)', /<RouterProvider\s+router=\{router\}\s+future=\{\{\s*v7_startTransition:\s*true\s*\}\}/.test(router) && !/createBrowserRouter\([\s\S]*?future:\s*\{\s*v7_startTransition/.test(router));
check('i18next debug logging explicitly disabled', /debug:\s*false/.test(i18n));
check('RIGPILOT dark canvas token', /--background:\s*10 15 30/.test(css));
check('Signal cyan token', /--primary:\s*66 217 245/.test(css));
check('Orbit violet token', /--secondary:\s*154 135 255/.test(css));
check('Volt lime token', /--accent:\s*184 243 107/.test(css));
check('Chip-and-direction logo mark', logo.includes('RIGPILOT') && logo.includes('rigpilot-chip'));
check('Primary action glow uses Signal Cyan', button.includes('rgba(66,217,245,0.24)'));
check('Hardware cards use the RIGPILOT surface system', componentCard.includes('rigpilot-panel'));
check('Build Score is labelled in the build summary', buildSummary.includes("t('builder.buildScore.label')"));
check('Hero ambient mesh uses brand tokens, not gaming-purple literals', gradientMesh.includes('var(--secondary)') && !gradientMesh.includes('99 102 241'));
check('Auth health reports current release', health.includes("release: '1.2.1'"));
check('Both Supabase auth handlers exist', existsSync(resolve(root, 'api/auth/signup.ts')) && existsSync(resolve(root, 'api/auth/login.ts')));
check('Project release version updated', packageJson.version === '1.2.1');

for (const item of checks) {
  console.log(`${item.ok ? 'PASS' : 'FAIL'} ${item.name}${item.detail ? ` — ${item.detail}` : ''}`);
}
const failed = checks.filter((item) => !item.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`);
if (failed.length) process.exit(1);
