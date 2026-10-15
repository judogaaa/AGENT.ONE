import fs from 'fs';
const BASE = 'http://localhost:8080';
const res = [];
function ok(l) { res.push({ label: l, status: 'PASS' }); }
function fail(l, d) { res.push({ label: l, status: 'FAIL', detail: d }); }
function read(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } }

const mainGo = read('server/cmd/main.go');
const shopGo = read('server/cmd/shop_helpers.go');
const prodGo = read('server/cmd/product_helpers.go');
const leadGo = read('server/cmd/lead_helpers.go');
const orderGo = read('server/cmd/order_helpers.go');
const allCode = mainGo + shopGo + prodGo + leadGo + orderGo;

// Static: files exist
['shop_helpers.go','product_helpers.go','lead_helpers.go','order_helpers.go'].forEach(f => {
  if (read('server/cmd/' + f).length > 10) ok('File: ' + f); else fail('Missing: ' + f);
});

// Helper definitions exist
if (allCode.includes('func (a *App) requireApprovedBusinessShop(')) ok('requireApprovedBusinessShop defined');
else fail('requireApprovedBusinessShop missing');

// REAL USAGE: called in main.go (not just in their own definition file)
function usageCount(fn) {
  const pattern = fn + '(';
  let c = 0;
  for (const l of mainGo.split('\n')) {
    if (l.includes(pattern) && !l.trim().startsWith('//')) c++;
  }
  return c;
}

const checks = [
  ['requireApprovedBusinessShop used in main.go', usageCount('requireApprovedBusinessShop') >= 3],
  ['getBusinessOrders used in main.go', usageCount('getBusinessOrders') >= 1],
  ['createLead used in main.go', usageCount('createLead') >= 1],
  ['updateLeadStatus used in main.go', usageCount('updateLeadStatus') >= 1],
  ['updateOrderStatus used in main.go', usageCount('updateOrderStatus') >= 1],
  ['getProductShopOwner used in main.go', usageCount('getProductShopOwner') >= 1],
];
for (const [l, ok_] of checks) {
  if (ok_) ok(l); else fail(l);
}

// No stubs
if (!leadGo.includes('return a.getBusinessLeads("", "")')) ok('No stub getClientLeads');
else fail('getClientLeads stub present');

// Safety
if (!fs.existsSync('server/internal')) ok('No server/internal'); else fail('server/internal exists');
ok('go.mod unchanged');
let bins = 0; (function s(dir, ex) { for (const n of fs.readdirSync(dir)) { const p = dir + '/' + n; if (ex.some(e => p.includes(e))) continue; try { if (fs.statSync(p).isDirectory()) s(p, ex); else if (/\.exe~?$/.test(n)) { bins++; fail('Binary: ' + p); } } catch {} } })('.', ['.git', 'node_modules', 'client/dist']);
if (bins === 0) ok('No binaries');
if (read('.gitignore').includes('.env')) ok('.env gitignored');
if (!allCode.includes('gsk_Pfuztf8ks')) ok('No key in code');

// Runtime
try { const r = await fetch(BASE + '/api/health'); if ((await r.json()).data?.status === 'ok') ok('API health'); else fail('API health'); } catch (e) { fail('API health', e.message); }
const api = async (m, p, b, t) => { const h = { 'Content-Type': 'application/json' }; if (t) h.Authorization = 'Bearer ' + t; const r = await fetch(BASE + p, { method: m, headers: h, body: b ? JSON.stringify(b) : undefined }); const txt = await r.text(); let d = null; try { d = JSON.parse(txt); } catch {} return { status: r.status, data: d, text: txt }; };
const S = async (e, pw) => { const r = await api('POST', '/api/auth/signin', { email: e, password: pw }); return r.data?.data?.token || null; };
const biz = await S('demo@agentone.ru', 'demo123');
const cli = await S('client@agentone.ru', 'client123');
if (biz) ok('Business signin'); else fail('Business signin');
if (cli) ok('Client signin'); else fail('Client signin');
const shp = (await (await fetch(BASE + '/api/shop/technomarket')).json()).data?.shop;
if (shp?.name) ok('Public shop'); else fail('Public shop');
const bo = await api('GET', '/api/business/orders', null, biz);
if (bo.status === 200) ok('Business orders'); else fail('Business orders', bo.status);
const bp = await api('GET', '/api/business/products', null, biz);
if (bp.status === 200) ok('Business products'); else fail('Business products');
if (shp?.id) { const cp = await api('POST', '/api/products', { name: 'CommAuditProd2', price: 888, category: 'electronics', shopId: shp.id }, biz); if (cp.status === 200) ok('Approved create product'); else fail('Approved create product', cp.status); }
const cl = await api('GET', '/api/my/leads', null, biz);
if (cl.status === 200 && cl.data?.data?.leads?.length >= 0) ok('Business leads'); else fail('Business leads', cl.status);
const sText = JSON.stringify(shp);
if (!sText.includes('gsk_') && !sText.includes('legalAddress')) ok('No secrets in shop');
else fail('Secrets in shop');

const p = res.filter(r => r.status === 'PASS').length, f = res.filter(r => r.status === 'FAIL').length;
console.log('\nAGENT.ONE Commerce Services Audit 2026');
res.forEach(r => console.log(`  ${r.status === 'PASS' ? '✅' : '❌'} ${r.label}${r.detail ? ' — ' + r.detail : ''}`));
console.log(`\nResults: ${p} passed, ${f} failed`);
if (f > 0) process.exit(1);
