import fs from 'fs';
import { execFileSync, execSync } from 'child_process';
const res = [];
function ok(l) { res.push({ label: l, status: 'PASS' }); }
function fail(l, d) { res.push({ label: l, status: 'FAIL', detail: d }); }
function read(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } }

// ── CI files ──
const ciYml = read('.github/workflows/ci.yml');
const ciRunner = read('scripts/ci_static_2026.ps1');
if (ciYml.length > 50) ok('ci.yml exists'); else fail('ci.yml missing');
if (ciRunner.length > 50) ok('ci_static_2026.ps1 exists'); else fail('ci_static_2026.ps1 missing');

// ── Runner self-test infrastructure ──
if (ciRunner.includes('param(')) ok('Runner has param('); else fail('Runner missing param(');
if (ciRunner.includes('SelfTestFailurePropagation')) ok('Runner has SelfTestFailurePropagation'); else fail('Runner missing SelfTestFailurePropagation');
if (ciRunner.includes('CI FAILURE PROPAGATION SELF-TEST')) ok('Runner has controlled failure branch'); else fail('Runner missing failure branch');
if (ciRunner.includes('CI STATIC: FAIL')) ok('Runner outputs CI STATIC: FAIL'); else fail('Runner missing FAIL output');
if (ciRunner.includes('exit 1')) ok('Runner uses exit 1 on failure'); else fail('Runner missing exit 1');
if (ciRunner.includes('failedSteps')) ok('Runner tracks failedSteps'); else fail('Runner missing failedSteps');

// ── Test files ──
const testFiles = fs.readdirSync('server/cmd').filter(f => f.endsWith('_test.go'));
if (testFiles.length >= 3) ok(`${testFiles.length} test files`); else fail(`${testFiles.length} test files`);

let totalTests = 0;
for (const f of testFiles) {
  const matches = read('server/cmd/' + f).match(/func Test\w+\(/g);
  if (matches) totalTests += matches.length;
}
if (totalTests >= 18) ok(`${totalTests} test cases`); else fail(`Only ${totalTests} test cases`);

for (const f of testFiles) {
  const c = read('server/cmd/' + f);
  if (c.includes('package main')) ok(`${f} uses package main`);
  else fail(`${f} wrong package`);
  // Helper *_test.go files may omit "testing" when they only provide fixtures.
  if (!/func\s+Test\w+\(/.test(c) || c.includes('"testing"')) ok(`${f} testing import ok`);
  else fail(`${f} no testing`);
}

const allTests = testFiles.map(f => read('server/cmd/' + f)).join('');
if (!allTests.includes('testify')) ok('No testify'); else fail('testify found');

// ── CI workflow checks ──
const ciChecks = [
  ['push', 'CI triggers on push'],
  ['pull_request', 'CI triggers on pull_request'],
  ['workflow_dispatch', 'CI has workflow_dispatch'],
  ['checkout', 'CI uses checkout'],
  ['setup-go', 'CI uses setup-go'],
  ['setup-node', 'CI uses setup-node'],
  ['npm ci', 'CI uses npm ci'],
  ['npm run build', 'CI uses npm run build'],
  ['go test', 'CI uses go test'],
  ['go vet', 'CI uses go vet'],
  ['gofmt', 'CI checks gofmt'],
  ['contents: read', 'CI permissions contents: read'],
];
for (const [pat, label] of ciChecks) {
  if (ciYml.includes(pat)) ok(label); else fail(label);
}

if (ciYml.includes('timeout-minutes') && /\d+/.test(ciYml.match(/timeout-minutes:\s*(\d+)/)?.[1])) {
  const t = parseInt(ciYml.match(/timeout-minutes:\s*(\d+)/)[1]);
  if (t <= 15) ok('CI timeout <= 15 min'); else fail('CI timeout > 15: ' + t);
} else fail('CI missing timeout-minutes');

if (!/GROQ_API_KEY:\s*"[^"]+"/.test(ciYml)) ok('CI has no GROQ_API_KEY value'); else fail('CI contains GROQ_API_KEY');
const ciNoScanner = ciYml.replace(/gsk_[A-Za-z0-9_-]\{20,\}/g, '');
if (!ciNoScanner.includes('gsk_Pfuztf8ks')) ok('CI has no real secrets'); else fail('CI contains real secrets');

// ── go.mod/no deps ──
if (!read('server/go.mod').includes('testify')) ok('go.mod clean (no testify)');

// ── gofmt baseline (portable: use gofmt from PATH on Linux CI and Windows) ──
try {
  const status = execSync('git ls-files -- "server/cmd/*.go"', { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  let unformatted = 0;
  for (const f of status) {
    const diff = execFileSync('gofmt', ['-d', f], { encoding: 'utf8' });
    if (diff.trim()) { unformatted++; fail('Unformatted: ' + f); }
  }
  if (status.length === 0) fail('No Go files found for gofmt check');
  else if (unformatted === 0) ok('All tracked Go files gofmt-clean');
  else fail(unformatted + ' unformatted files');
} catch (e) { fail('gofmt check failed: ' + e.message); }

// ── No binaries ──
let bins = 0; (function s(dir, ex) { for (const n of fs.readdirSync(dir)) { const p = dir + '/' + n; if (ex.some(e => p.includes(e))) continue; try { if (fs.statSync(p).isDirectory()) s(p, ex); else if (/\.exe~?$/.test(n)) { bins++; fail('Binary: ' + p); } } catch {} } })('.', ['.git', 'node_modules', 'client/dist']);
if (bins === 0) ok('No binaries');

// ── README ──
const readme = read('README.md');
if (readme.includes('README_LOCAL_START.md')) ok('README has local start guide'); else fail('README missing local start guide');
if (readme.includes('docker compose up -d')) ok('README has local PostgreSQL startup'); else fail('README missing local Docker step');
if (readme.includes('go test ./cmd')) ok('README mentions go test'); else fail('README missing go test');
if (readme.includes('.github/workflows/ci.yml')) ok('README links CI workflow'); else fail('README missing CI link');

// ── Existing AI/commerce helpers preserved ──
['ai_config.go','ai_provider.go','ai_groq.go','ai_prompts.go','ai_safety.go','ai_fallback.go','ai_context.go'].forEach(f => {
  if (read('server/cmd/' + f).length > 10) ok('AI file: ' + f); else fail('AI file missing: ' + f);
});
if (read('server/cmd/ai_service_helpers.go').length > 10) ok('ai_service_helpers.go exists'); else fail('ai_service_helpers.go missing');
if (!fs.existsSync('server/internal')) ok('No server/internal'); else fail('server/internal exists');

// ── .env ──
if (read('.gitignore').includes('.env')) ok('.env gitignored'); else fail('.env not in gitignore');

const p = res.filter(r => r.status === 'PASS').length, f = res.filter(r => r.status === 'FAIL').length;
console.log('\nAGENT.ONE CI Foundation Audit 2026');
res.forEach(r => console.log(`  ${r.status === 'PASS' ? '✅' : '❌'} ${r.label}${r.detail ? ' — ' + r.detail : ''}`));
console.log(`\nResults: ${p} passed, ${f} failed`);
if (f > 0) process.exit(1);
