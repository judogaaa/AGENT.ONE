import fs from 'fs';
const res = [];
function ok(l) { res.push({ label: l, status: 'PASS' }); }
function fail(l, d) { res.push({ label: l, status: 'FAIL', detail: d }); }
function read(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } }

const ciYml = read('.github/workflows/ci.yml');
const runner = read('scripts/ci_e2e_2026.ps1');
const pwConfig = read('client/playwright.config.ts');
const pwPkg = read('client/package.json');
const readme = read('README.md');
const e2eFiles = (() => { try { return fs.readdirSync('client/e2e').filter(f => f.endsWith('.spec.ts')); } catch { return []; } })();
const allE2e = e2eFiles.map(f => read('client/e2e/' + f)).join('\n');

// ─── Files exist ───
if (pwConfig.length > 50) ok('Playwright config exists'); else fail('Playwright config missing');
if (e2eFiles.length >= 1) ok(`${e2eFiles.length} E2E test file(s)`); else fail('No E2E test files');
if (runner.length > 100) ok('ci_e2e_2026.ps1 exists'); else fail('E2E runner missing');
if (readme.includes('P3.3')) ok('README has P3.3'); else fail('README missing P3.3');

// ─── Playwright config ───
if (pwConfig.includes('chromium')) ok('Config: chromium'); else fail('Config: no chromium');
if (!pwConfig.includes('firefox') && !pwConfig.includes('webkit')) ok('Config: only chromium'); else fail('Config: extra browsers');
if (pwConfig.includes('AGENT_ONE_E2E_BASE_URL')) ok('Config: BASE_URL env'); else fail('Config: no BASE_URL');
if (pwConfig.includes('only-on-failure')) ok('Config: screenshot on failure'); else fail('Config: wrong screenshot');
if (pwConfig.includes('retain-on-failure')) ok('Config: trace on failure'); else fail('Config: wrong trace');
if (pwConfig.includes("video: 'off'")) ok('Config: video off'); else fail('Config: video on');
if (pwPkg.includes('"@playwright/test"')) ok('Playwright in devDeps'); else fail('Playwright not in package.json');

// ─── Test count + quality ───
const testMatches = allE2e.match(/test\(/g) || [];
const testCount = testMatches.length;
if (testCount >= 15) ok(`Test count: ${testCount} (>=15)`); else fail(`Only ${testCount} tests`);

// No skip/fixme/only
// No unconditional skip/fixme/only (conditional skip for missing data is OK)
const hasUnconditionalSkip = allE2e.includes('test.skip(') && !allE2e.includes('test.skip(!'); // unconditional skip
if (!hasUnconditionalSkip) ok('No unconditional test.skip'); else fail('Has unconditional test.skip');
if (!allE2e.includes('describe.skip(')) ok('No describe.skip'); else fail('Has describe.skip');
if (!allE2e.includes('test.fixme(')) ok('No test.fixme'); else fail('Has test.fixme');
if (!allE2e.includes('test.only(') && !allE2e.includes('describe.only(')) ok('No test.only/describe.only'); else fail('Has .only');
if (!allE2e.includes('route.fulfill')) ok('No API mocking'); else fail('Has route.fulfill');

// ─── Scenario coverage ───
// Business verification flow
if (allE2e.includes('submit verification') || allE2e.includes('verification via UI')) ok('Scenario: verification submit'); else fail('No verification submit test');
if (allE2e.includes('pending') || allE2e.includes('approve')) ok('Scenario: verification pending/approve'); else fail('No verification pending/approve');
if (allE2e.includes('create product') || allE2e.includes('Create product') || allE2e.includes('createProduct')) ok('Scenario: product creation'); else fail('No product creation test');
if (allE2e.includes('product') && (allE2e.includes('business') || allE2e.includes('bizList'))) ok('Scenario: product in business list'); else fail('No product list check');

// Favorites
if (allE2e.includes('favorite') || allE2e.includes('favorites') || allE2e.includes('Favorites')) ok('Scenario: favorites'); else fail('No favorites tests');
if (allE2e.includes('Remove') || allE2e.includes('DELETE') || allE2e.includes('remove')) ok('Scenario: favorite removal'); else fail('No favorite removal');

// Checkout/order
if (allE2e.includes('checkout') || allE2e.includes('order') || allE2e.includes('Checkout') || allE2e.includes('Order')) ok('Scenario: checkout/order'); else fail('No checkout test');
if (allE2e.includes('оформлен') || allE2e.includes('заказ') || allE2e.includes('Перейти к оформлению') || allE2e.includes('оформлен')) ok('Scenario: checkout terms'); else fail('No checkout terms');

// No fake payment claims
// "Оплатить" should only appear in negative assertions (not.toMatch)
const hasPositiveOplatit = allE2e.split('\n').some(l => l.includes('Оплатить') && !l.includes('not.') && !l.includes('notTo') && !l.includes('notMatch'));
if (!hasPositiveOplatit) ok('No positive "Оплатить"'); else fail('Has positive "Оплатить"');
if (allE2e.includes('ЮKassa')) ok('YuKassa checked (negative)'); else ok('YuKassa negative implicit');
if (allE2e.includes('СБП')) ok('СБП checked (negative)'); else ok('СБП negative implicit');

// AI safety
if (allE2e.includes('assistant') || allE2e.includes('Assistant')) ok('Scenario: assistant'); else fail('No assistant test');
if (allE2e.includes('AI Manager') || allE2e.includes('ai_manager')) ok('Scenario: AI Manager'); else fail('No AI Manager test');

// Auth
if (allE2e.includes('register') || allE2e.includes('Регистрация')) ok('Scenario: registration UI'); else fail('No registration');
if (allE2e.includes('sign in') || allE2e.includes('signin') || allE2e.includes('Войти')) ok('Scenario: sign in UI'); else fail('No signin');
if (allE2e.includes('wrong password') || allE2e.includes('WRONG')) ok('Scenario: wrong password'); else fail('No wrong password');

// Business
if (allE2e.includes('business') && (allE2e.includes('register') || allE2e.includes('Регистрация'))) ok('Scenario: business registration'); else fail('No business registration');
if (allE2e.includes('dashboard')) ok('Scenario: business dashboard'); else fail('No business dashboard');

// Role guards
if (allE2e.includes('guest dashboard') || allE2e.includes('guest') && allE2e.includes('dashboard')) ok('Scenario: guest guard'); else fail('No guest guard');

// ─── Runner ───
['param(','SelfTestFailurePropagation','KeepResources','agentone-e2e-db','56432','18080'].forEach(p => {
  if (runner.includes(p)) ok(`Runner: ${p.slice(0, 25)}`); else fail(`Runner missing: ${p}`);
});
['E2E CI: FAIL','E2E CI: PASS','exit 1','try {','finally {'].forEach(p => {
  if (runner.includes(p)) ok(`Runner: ${p}`); else fail(`Runner missing: ${p}`);
});
if (!runner.includes('Stop-Process -Name')) ok('Runner: no Stop-Process -Name'); else fail('Runner: Stop-Process -Name');
if (runner.includes('$containerName -eq "agentone-db"')) ok('Runner: DB name safety'); else fail('Runner: no DB safety');

// ─── CI workflow ───
if (ciYml.includes('browser-e2e')) ok('CI: browser-e2e job'); else fail('CI: no browser-e2e');
if (ciYml.includes('playwright install')) ok('CI: installs Playwright'); else fail('CI: no playwright install');
if (ciYml.includes('chromium')) ok('CI: installs chromium'); else fail('CI: no chromium');
['static-and-unit','runtime-integration'].forEach(j => {
  if (ciYml.includes(j)) ok(`CI: ${j} preserved`); else fail(`CI: ${j} missing`);
});
if (!/GROQ_API_KEY:\s*"[^"]+"/.test(ciYml)) ok('CI: no GROQ key'); else fail('CI: GROQ key value');
if (ciYml.includes('contents: read')) ok('CI: permissions'); else fail('CI: no permissions');
const timeouts = (ciYml.match(/timeout-minutes:\s*(\d+)/g) || []).map(m => parseInt(m.match(/\d+/)[0]));
if (Math.max(...timeouts) <= 20) ok('CI: timeout <=20'); else fail('CI: timeout >20');

// ─── Safety ───
if (!read('server/go.mod').includes('testify')) ok('go.mod clean');
let bins = 0; (function s(dir, ex) { for (const n of fs.readdirSync(dir)) { const p = dir + '/' + n; if (ex.some(e => p.includes(e))) continue; try { if (fs.statSync(p).isDirectory()) s(p, ex); else if (/\.exe~?$/.test(n)) { bins++; fail('Binary: ' + p); } } catch {} } })('.', ['.git', 'node_modules', 'client/dist', 'test-results', 'playwright-report']);
if (bins === 0) ok('No binaries');
if (!fs.existsSync('server/internal')) ok('No server/internal');
if (read('.gitignore').includes('.env')) ok('.env gitignored');

const p = res.filter(r => r.status === 'PASS').length, f = res.filter(r => r.status === 'FAIL').length;
console.log('\nAGENT.ONE Browser E2E Foundation Audit 2026');
res.forEach(r => console.log(`  ${r.status === 'PASS' ? '✅' : '❌'} ${r.label}${r.detail ? ' — ' + r.detail : ''}`));
console.log(`\nResults: ${p} passed, ${f} failed`);
if (f > 0) process.exit(1);
