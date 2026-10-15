import fs from 'fs';
const res = [];
function ok(l) { res.push({ label: l, status: 'PASS' }); }
function fail(l, d) { res.push({ label: l, status: 'FAIL', detail: d }); }
function read(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } }

const ciYml = read('.github/workflows/ci.yml');
const runner = read('scripts/ci_integration_2026.ps1');
const rtTest = read('scripts/integration_runtime_2026.mjs');
const startLocal = read('start-local.ps1');

// ─── Files ───
if (rtTest.length > 100) ok('Runtime script exists'); else fail('Runtime script missing');
if (runner.length > 100) ok('Integration runner exists'); else fail('Integration runner missing');
if (read('README.md').includes('P3.2')) ok('README P3.2 section'); else fail('README missing P3.2');

// ─── Runner structure ───
['param(','SelfTestFailurePropagation','KeepResources'].forEach(p => {
  if (runner.includes(p)) ok(`Runner: ${p}`); else fail(`Runner missing: ${p}`);
});
['INTEGRATION CI: FAIL','INTEGRATION CI: PASS','exit 1'].forEach(p => {
  if (runner.includes(p)) ok(`Runner: ${p}`); else fail(`Runner missing: ${p}`);
});
['agentone-ci-db','55432','18080','agentone_test'].forEach(p => {
  if (runner.includes(p)) ok(`Runner config: ${p}`); else fail(`Runner missing config: ${p}`);
});
if (!runner.includes('.env.bak') && !runner.includes('Copy-Item .env') && !runner.includes('Remove-Item .env')) ok('Runner: no .env mutation'); else fail('Runner mutates .env');
if (runner.includes('agentone-db')) ok('Runner: verifies agentone-db'); else fail('Runner: missing agentone-db check');
if (runner.includes('pg_isready')) ok('Runner: DB readiness check'); else fail('Runner: no DB readiness');
if (runner.includes('Invoke-RestMethod')) ok('Runner: backend readiness check'); else fail('Runner: no backend readiness');
if (runner.includes('RedirectStandardError')) ok('Runner: captures backend stderr'); else fail('Runner: no stderr capture');

// ─── Runtime test checks ───
const testTotal = (rtTest.match(/ok\(/g) || []).length;
if (testTotal >= 40) ok(`Runtime: ${testTotal} checks (>=40)`); else fail(`Runtime: only ${testTotal} checks`);
if (rtTest.includes('process.env.AGENT_ONE_BASE_URL')) ok('Runtime: uses AGENT_ONE_BASE_URL'); else fail('Runtime: no BASE_URL');
if (!rtTest.includes('api.groq.com')) ok('Runtime: no Groq URL'); else fail('Runtime: Groq URL');

// ─── CI workflow ───
if (ciYml.includes('runtime-integration')) ok('CI: runtime-integration job'); else fail('CI: no runtime-integration');
if (ciYml.includes('needs: static-and-unit')) ok('CI: needs static-and-unit'); else fail('CI: no needs');
if (ciYml.includes('static-and-unit')) ok('CI: static-and-unit job preserved'); else fail('CI: static-and-unit missing');
if (ciYml.includes('postgres:16')) ok('CI: postgres:16 service'); else fail('CI: no postgres:16');
if (ciYml.includes('agentone_test')) ok('CI: test DB/user agentone_test'); else fail('CI: wrong test DB');
if (ciYml.includes('timeout-minutes')) {
  const t = parseInt(ciYml.match(/timeout-minutes:\s*(\d+)/)?.[1]);
  if (t <= 15) ok(`CI: timeout ${t}min <=15`); else fail(`CI: timeout ${t}min`);
} else fail('CI: no timeout');
if (ciYml.includes('contents: read')) ok('CI: permissions contents read'); else fail('CI: no permissions');
if (!/GROQ_API_KEY:\s*"[^"]+"/.test(ciYml)) ok('CI: no GROQ_API_KEY value'); else fail('CI: GROQ_API_KEY value');
if (!/gsk_[A-Za-z0-9_-]{30,}/.test(ciYml)) ok('CI: no real gsk_ key'); else fail('CI: gsk_ key');
if (!ciYml.includes('secrets.')) ok('CI: no secrets context'); else fail('CI: secrets context');
if (ciYml.includes('checkout')) ok('CI: uses checkout'); else fail('CI: no checkout');
if (ciYml.includes('setup-go')) ok('CI: setup-go'); else fail('CI: no setup-go');
if (ciYml.includes('go build')) ok('CI: go build'); else fail('CI: no go build');
if (ciYml.includes('/tmp/agent-one-server')) ok('CI: binary outside project'); else fail('CI: binary in project');

// ─── start-local hygiene ───
if (startLocal.length > 100) ok('start-local.ps1 exists'); else fail('start-local missing');
if (startLocal.includes('./cmd') && !startLocal.includes('./cmd/main.go')) ok('start-local builds ./cmd'); else fail('start-local builds wrong target');
if (startLocal.includes('$env:TEMP')) ok('start-local binary in TEMP'); else fail('start-local binary not in TEMP');
if (!startLocal.includes('server/server.exe') && !startLocal.includes('server\\server.exe')) ok('start-local: no source binary'); else fail('start-local creates source binary');
if (!startLocal.includes('Stop-Process -Name')) ok('start-local: no Stop-Process -Name'); else fail('start-local: Stop-Process -Name');
if (startLocal.includes('.pid')) ok('start-local: PID file'); else fail('start-local: no PID file');
if (startLocal.includes('Get-NetTCPConnection')) ok('start-local: port check'); else fail('start-local: no port check');

// ─── Runner lifecycle ───
if (runner.includes('try {')) ok('Runner: try/finally'); else fail('Runner: no try');
if (runner.includes('finally {')) ok('Runner: has finally'); else fail('Runner: no finally');
if (runner.includes('Stop-Process -Id $proc.Id')) ok('Runner: exact PID stop'); else fail('Runner: no exact PID stop');
if (!runner.includes('Stop-Process -Name')) ok('Runner: no Stop-Process -Name'); else fail('Runner: Stop-Process -Name');
if (runner.includes('$containerName -eq "agentone-db"')) ok('Runner: DB name safety'); else fail('Runner: no DB name safety');

// ─── Safety ───
if (!read('server/go.mod').includes('testify')) ok('go.mod clean');
let bins = 0; (function s(dir, ex) { for (const n of fs.readdirSync(dir)) { const p = dir + '/' + n; if (ex.some(e => p.includes(e))) continue; try { if (fs.statSync(p).isDirectory()) s(p, ex); else if (/\.exe~?$/.test(n)) { bins++; fail('Binary: ' + p); } } catch {} } })('.', ['.git', 'node_modules', 'client/dist']);
if (bins === 0) ok('No binaries');
if (read('.gitignore').includes('.env')) ok('.env gitignored');
if (!fs.existsSync('server/internal')) ok('No server/internal');

const p = res.filter(r => r.status === 'PASS').length, f = res.filter(r => r.status === 'FAIL').length;
console.log('\nAGENT.ONE Integration Foundation Audit 2026');
res.forEach(r => console.log(`  ${r.status === 'PASS' ? '✅' : '❌'} ${r.label}${r.detail ? ' — ' + r.detail : ''}`));
console.log(`\nResults: ${p} passed, ${f} failed`);
if (f > 0) process.exit(1);
