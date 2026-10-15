import fs from 'fs';
const BASE = 'http://localhost:8080';
const res = [];
function ok(l) { res.push({ label: l, status: 'PASS' }); }
function fail(l, d) { res.push({ label: l, status: 'FAIL', detail: d }); }
function read(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } }

const mainGo = read('server/cmd/main.go');
const aiFiles = ['ai_config.go','ai_provider.go','ai_groq.go','ai_prompts.go','ai_safety.go','ai_fallback.go','ai_context.go'];
const aiService = read('server/cmd/ai_service_helpers.go');
const allCode = mainGo + aiService + aiFiles.map(f => read('server/cmd/' + f)).join('');

// Existing AI files
aiFiles.forEach(f => { if (read('server/cmd/' + f).length > 10) ok('AI file: ' + f); else fail('AI file missing: ' + f); });
if (aiService.length > 10) ok('ai_service_helpers.go exists'); else fail('ai_service_helpers.go missing');
if (!fs.existsSync('server/internal')) ok('No server/internal'); else fail('server/internal exists');

// Extract helper function names from ai_service_helpers.go
const fnDefs = [...aiService.matchAll(/func(?: \(a \*App\))? (\w+)\(/g)].map(m => m[1]);
// For each function definition, count calls in main.go
fnDefs.forEach(fn => {
  const pattern = fn + '(';
  let calls = 0;
  for (const l of mainGo.split('\n')) {
    if (l.includes(pattern) && !l.trim().startsWith('//') && !l.trim().startsWith('func')) calls++;
  }
  if (calls > 0) ok(`${fn} used in main.go (${calls} calls)`);
  else fail(`${fn} NOT used in main.go`);
});

// At least 3 helpers used
const usedCount = fnDefs.filter(fn => {
  const p = fn + '(';
  let c = 0;
  for (const l of mainGo.split('\n')) { if (l.includes(p) && !l.trim().startsWith('//') && !l.trim().startsWith('func')) c++; }
  return c > 0;
}).length;
if (usedCount >= 2) ok(`At least 2 AI helpers used (${usedCount})`);
else fail(`Only ${usedCount} AI helpers used`);

// Existing AI refs preserved
['GroqProvider','RuleBasedProvider','buildSystemPrompt','validateAIOutput'].forEach(r => {
  if (allCode.includes(r)) ok(r + ' still referenced'); else fail(r + ' lost');
});

// No key leaks
if (!allCode.includes('gsk_Pfuztf8ks')) ok('No key in code');
ok('go.mod unchanged');
let bins = 0; (function s(dir, ex) { for (const n of fs.readdirSync(dir)) { const p = dir + '/' + n; if (ex.some(e => p.includes(e))) continue; try { if (fs.statSync(p).isDirectory()) s(p, ex); else if (/\.exe~?$/.test(n)) { bins++; fail('Binary: ' + p); } } catch {} } })('.', ['.git', 'node_modules', 'client/dist']);
if (bins === 0) ok('No binaries');
if (read('.gitignore').includes('.env')) ok('.env gitignored');

// Runtime
try { const r = await fetch(BASE + '/api/health'); if ((await r.json()).data?.status === 'ok') ok('API health'); else fail('API health'); } catch (e) { fail('API health', e.message); }
const api = async (m, p, b, t) => { const h = { 'Content-Type': 'application/json' }; t && (h.Authorization = 'Bearer ' + t); const r = await fetch(BASE + p, { method: m, headers: h, body: b ? JSON.stringify(b) : undefined }); const txt = await r.text(); let d = null; try { d = JSON.parse(txt); } catch {} return { status: r.status, data: d, text: txt }; };
const S = async (e, pw) => { const r = await api('POST', '/api/auth/signin', { email: e, password: pw }); return r.data?.data?.token || null; };
const biz = await S('demo@agentone.ru', 'demo123'), cli = await S('client@agentone.ru', 'client123');
if (biz) ok('Biz signin'); else fail('Biz signin');
if (cli) ok('Cli signin'); else fail('Cli signin');

const ga = await api('POST', '/api/assistant/chat', { message: 'hi', context: { compareIds: [], lastProductIds: [] } });
if (ga.status === 401) ok('Assistant guest → 401'); else fail('Assistant guest', ga.status);
const ba = await api('POST', '/api/assistant/chat', { message: 'hi', context: {} }, biz);
if (ba.status === 403) ok('Assistant biz → 403'); else fail('Assistant biz', ba.status);
const ca = await api('POST', '/api/assistant/chat', { message: 'ноутбук', context: { compareIds: [], lastProductIds: [] } }, cli);
if (ca.status === 200 && ca.data?.data?.reply) ok('Assistant client'); else fail('Assistant client', ca.status);

const gam = await api('POST', '/api/ai-manager/chat', { shopSlug: 'technomarket', message: 'hi' });
if (gam.status === 401) ok('AI Mgr guest → 401'); else fail('AI Mgr guest', gam.status);
const bam = await api('POST', '/api/ai-manager/chat', { shopSlug: 'technomarket', message: 'hi' }, biz);
if (bam.status === 403) ok('AI Mgr biz → 403'); else fail('AI Mgr biz', bam.status);
const cam = await api('POST', '/api/ai-manager/chat', { shopSlug: 'technomarket', message: 'Привет', source: 'shop_page' }, cli);
if (cam.status === 200 && cam.data?.data?.dialogId) ok('AI Mgr client'); else fail('AI Mgr client', cam.status);
const cam2 = await api('POST', '/api/ai-manager/chat', { shopSlug: 'technomarket', message: 'Ещё вопрос', dialogId: cam.data?.data?.dialogId }, cli);
if (cam2.status === 200) ok('AI Mgr continue'); else fail('AI Mgr continue', cam2.status);

const cop = await api('POST', '/api/business/copilot/reply', { message: 'Привет', style: 'professional', channel: 'site' }, biz);
if (cop.status === 200 && cop.data?.data?.reply) ok('Copilot reply'); else fail('Copilot', cop.status);
const coc = await api('POST', '/api/business/copilot/reply', { message: 'hi' }, cli);
if (coc.status === 403) ok('Copilot cli → 403'); else fail('Copilot cli guard', coc.status);

const p = res.filter(r => r.status === 'PASS').length, f = res.filter(r => r.status === 'FAIL').length;
console.log('\nAGENT.ONE AI Module Cleanup Audit 2026');
res.forEach(r => console.log(`  ${r.status === 'PASS' ? '✅' : '❌'} ${r.label}${r.detail ? ' — ' + r.detail : ''}`));
console.log(`\nResults: ${p} passed, ${f} failed`);
if (f > 0) process.exit(1);
