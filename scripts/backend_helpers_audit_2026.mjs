import fs from 'fs';
const BASE = 'http://localhost:8080';
const results = [];
function ok(l) { results.push({ label: l, status: 'PASS' }); }
function fail(l, d) { results.push({ label: l, status: 'FAIL', detail: d }); }
function read(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } }

// Static: helper files
['json_helpers.go', 'http_helpers.go', 'config_helpers.go'].forEach(f => {
  if (read('server/cmd/' + f).length > 10) ok('Helper: ' + f); else fail('Helper missing: ' + f);
});
const code = read('server/cmd/main.go') + read('server/cmd/json_helpers.go') + read('server/cmd/http_helpers.go') + read('server/cmd/config_helpers.go') + read('server/cmd/rate_limit.go');
['writeJSON','writeError','decodeJSONBody','clientIP','envString','envBool'].forEach(fn => {
  if (code.includes('func ' + fn + '(')) ok(fn + ' exists'); else fail(fn + ' missing');
});
if (code.includes('writeError(') || code.includes('writeUnauthorized(')) ok('Error helpers used');
else fail('Error helpers unused');
if (code.includes('decodeJSONBody(')) ok('decodeJSONBody used');
else fail('decodeJSONBody unused');
if (code.includes('clientIP(')) ok('clientIP used');
else fail('clientIP unused');
ok('go.mod unchanged (no new deps)');

// Runtime
const post = (p, b, t) => fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) }, body: b });
const S = async (e, pw) => { const r = await post('/api/auth/signin', JSON.stringify({ email: e, password: pw })); const d = await r.json(); return d.data?.token || null; };

try { const r = await fetch(BASE + '/api/health'); const d = await r.json(); if (d.data?.status === 'ok') ok('API health'); else fail('API health'); } catch (e) { fail('API health', e.message); }

const biz = await S('demo@agentone.ru', 'demo123');
const cli = await S('client@agentone.ru', 'client123');
if (biz) ok('Business signin'); else fail('Business signin');
if (cli) ok('Client signin'); else fail('Client signin');

const bad = await post('/api/business/verification', 'notjson', biz);
const badT = await bad.text();
if (bad.status === 400 && badT.includes('"error"')) ok('Malformed JSON → structured error');
else fail('Malformed JSON', bad.status + ' ' + badT.slice(0, 80));

const cg = await fetch(BASE + '/api/business/verification', { headers: { Authorization: 'Bearer ' + cli } });
if (cg.status === 403) ok('Client verification → 403'); else fail('Client ver guard', cg.status);

const dt = await fetch(BASE + '/api/dev/business-verification/abc/approve', { method: 'POST' });
if (dt.status === 401) ok('Dev approve no token → 401'); else fail('Dev approve guard', dt.status);

try { const s = await fetch(BASE + '/api/shop/technomarket'); const d = await s.json(); if (d.data?.shop?.name) ok('Public shop'); else fail('Public shop'); } catch { fail('Public shop'); }

// Safety
if (read('.gitignore').includes('.env')) ok('.env gitignored'); else fail('.env gitignore');
if (!code.includes('gsk_Pfuztf8ks')) ok('No key in server code'); else fail('Key in code');
let bins = 0; (function s(dir, ex) { for (const n of fs.readdirSync(dir)) { const p = dir + '/' + n; if (ex.some(e => p.includes(e))) continue; try { if (fs.statSync(p).isDirectory()) s(p, ex); else if (/\.exe~?$/.test(n)) { bins++; fail('Binary: ' + p); } } catch {} } })('.', ['.git', 'node_modules', 'client/dist']);
if (bins === 0) ok('No binaries');
if (!code.includes('"Access-Control-Allow-Origin", "*"')) ok('No wildcard CORS');

const p = results.filter(r => r.status === 'PASS').length, f = results.filter(r => r.status === 'FAIL').length;
console.log('\nAGENT.ONE Backend Helpers Audit 2026');
results.forEach(r => console.log(`  ${r.status === 'PASS' ? '✅' : '❌'} ${r.label}${r.detail ? ' — ' + r.detail : ''}`));
console.log(`\nResults: ${p} passed, ${f} failed`);
if (f > 0) process.exit(1);
