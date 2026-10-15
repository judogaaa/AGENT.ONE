const BASE = process.env.AGENT_ONE_BASE_URL || 'http://localhost:18080';
const DEV_TOKEN = process.env.DEV_ADMIN_TOKEN || 'dev-secret';
const results = [];
const TS = Date.now();

function ok(label) { results.push({ label, status: 'PASS' }); }
function fail(label, detail) { results.push({ label, status: 'FAIL', detail: String(detail || '') }); }

async function api(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(BASE + path, opts);
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}
  return { status: res.status, data, text };
}

function d(r) {
  if (r.data && r.data.ok === true && r.data.data !== undefined) return r.data.data;
  return r.data;
}

async function signup(email, password, name, role) {
  return d(await api('POST', '/api/auth/signup', {
    email,
    password,
    displayName: name,
    role,
    phone: '',
    terms_accepted: true,
    pd_consent: true,
    consent_source: 'integration_runtime',
  }));
}
async function signin(email, password) {
  return d(await api('POST', '/api/auth/signin', { email, password }));
}

async function waitForHealth(maxRetries = 30) {
  for (let i = 0; i < maxRetries; i++) {
    try { const r = await fetch(BASE + '/api/health'); if (r.ok && ((await r.json()).data?.status === 'ok')) return true; } catch {}
    await new Promise(r => setTimeout(r, 1000));
  }
  return false;
}

console.log('Waiting for backend...');
if (!await waitForHealth()) { fail('Backend unreachable'); console.log('\nFAILED'); process.exit(1); }
ok('Health endpoint reachable');

// ─── HEALTH ───
const h = await api('GET', '/api/health');
if (h.status === 200 && d(h)?.status === 'ok') ok('Health returns ok'); else fail('Health', h.status);
const hd = d(h);
if (hd?.shops >= 0 && hd?.products >= 0) ok('Health has counts'); else fail('Health missing counts');

// ─── AUTH ───
const cliEmail = `itc-${TS}@t.local`;
const bizEmail = `itb-${TS}@t.local`;

// Malformed signup
const badSignup = await api('POST', '/api/auth/signup', { displayName: 'Bad' });
if (badSignup.status >= 400) ok('Malformed signup rejected'); else fail('Malformed signup', badSignup.status);

// Valid signups
const cliSignup = await signup(cliEmail, 'test123', 'IT Client', 'client');
if (cliSignup?.token) ok('Client signup'); else fail('Client signup');

const bizSignup = await signup(bizEmail, 'test123', 'IT Biz', 'business');
if (bizSignup?.token) ok('Business signup'); else fail('Business signup');

const cliToken = cliSignup?.token;
const bizToken = bizSignup?.token;
if (!cliToken || !bizToken) { fail('No tokens'); process.exit(1); }

// Duplicate signup
const dupSignup = await signup(cliEmail, 'test123', 'Dup', 'client');
if (!dupSignup?.token) ok('Duplicate signup rejected'); else fail('Dup signup accepted');

// Wrong password
const wrongPw = await signin(cliEmail, 'WRONG');
if (!wrongPw?.token) ok('Wrong password → no token'); else fail('Wrong password accepted');

// Valid signin
const cliSignin = await signin(cliEmail, 'test123');
if (cliSignin?.token) ok('Client signin'); else fail('Client signin');

const bizSignin = await signin(bizEmail, 'test123');
if (bizSignin?.token) ok('Business signin'); else fail('Business signin');

// /auth/me
const cliMe = await api('GET', '/api/auth/me', null, cliToken);
if (cliMe.status === 200 && d(cliMe)?.role === 'client') ok('Client /auth/me'); else fail('Client /auth/me', cliMe.status);
const bizMe = await api('GET', '/api/auth/me', null, bizToken);
if (bizMe.status === 200 && d(bizMe)?.role === 'business') ok('Business /auth/me'); else fail('Business /auth/me');

// Guards
const noToken = await api('GET', '/api/auth/me');
if (noToken.status === 401) ok('No token → 401'); else fail('Auth guard', noToken.status);
const cliOnBiz = await api('GET', '/api/business/verification', null, cliToken);
if (cliOnBiz.status === 403) ok('Client on biz → 403'); else fail('Client biz guard', cliOnBiz.status);
const cliCreateProd = await api('POST', '/api/products', { name: 'x', price: 1 }, cliToken);
if (cliCreateProd.status === 403) ok('Client create product → 403'); else fail('Client create product', cliCreateProd.status);
const guestBizProd = await api('GET', '/api/business/products');
if (guestBizProd.status === 401) ok('Guest biz products → 401'); else fail('Guest biz products', guestBizProd.status);
const invalidToken = await api('POST', '/api/assistant/chat', { message: 'hi', context: {} }, 'bad-token');
if (invalidToken.status === 401) ok('Invalid token assistant → 401'); else fail('Invalid token', invalidToken.status);

// ─── SHOP + VERIFICATION ───
const createShop = await api('POST', '/api/shop', { name: 'IT-Test-Shop', slug: 'it-test-' + TS }, bizToken);
const shopCreated = d(createShop);
const shopId = shopCreated?.shop?.id;
const shopSlug = shopCreated?.shop?.slug || ('it-test-' + TS);
if (shopId) ok('Shop created'); else fail('Shop creation');

const verGet = await api('GET', '/api/business/verification', null, bizToken);
const verData = d(verGet);
if (verData?.status) ok('Verification status returned'); else fail('Verification status');

const verSubmit = await api('POST', '/api/business/verification', { orgName: 'IT Test Org', contactPhone: '+79990001122' }, bizToken);
if (verSubmit.status === 200 && d(verSubmit)?.status === 'pending') ok('Verification submit');
else fail('Verification submit', verSubmit.status);

const createPending = await api('POST', '/api/products', { name: 'Test', price: 100, category: 'electronics', shopId }, bizToken);
if (createPending.status === 403) ok('Pending cannot create product'); else fail('Pending create', createPending.status);

// Wrong dev token
const wrongApprove = await fetch(BASE + '/api/dev/business-verification/' + shopId + '/approve', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Dev-Admin-Token': 'WRONG' } });
if (wrongApprove.status === 401) ok('Dev approve wrong token → 401'); else fail('Dev wrong token', wrongApprove.status);

// Correct approve
const approve = await fetch(BASE + '/api/dev/business-verification/' + shopId + '/approve', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Dev-Admin-Token': DEV_TOKEN } });
if (approve.status === 200) ok('Dev approve'); else fail('Dev approve', approve.status);

// ─── PRODUCTS ───
const prod = await api('POST', '/api/products', { name: 'IT-Test-Prod', price: 500, category: 'electronics', shopId }, bizToken);
const prodData = d(prod);
const productId = prodData?.product?.id;
if (prod.status === 200 && productId) ok('Create product'); else fail('Create product', prod.status);

const bizProds = await api('GET', '/api/business/products', null, bizToken);
if (bizProds.status === 200) ok('Business products list'); else fail('Business products', bizProds.status);

const pubProds = await api('GET', '/api/products?limit=50');
if (pubProds.status === 200) ok('Public products list'); else fail('Public products');

if (productId) {
  const update = await api('PUT', '/api/products/' + productId, { name: 'IT-Test-Prod-Updated', price: 600 }, bizToken);
  if (update.status === 200) ok('Update product'); else fail('Update product');
}

// ─── FAVORITES ───
const favPid = productId;
if (favPid) {
  const addFav = await api('POST', '/api/my/favorites/' + favPid, null, cliToken);
  if (addFav.status === 200 && d(addFav)?.favorite === true) ok('Add favorite'); else fail('Add favorite', addFav.status);

  const addDup = await api('POST', '/api/my/favorites/' + favPid, null, cliToken);
  if (addDup.status === 200) ok('Duplicate add OK'); else fail('Dup add');

  const fIds = await api('GET', '/api/my/favorites/ids', null, cliToken);
  if ((d(fIds)?.ids || []).includes(favPid)) ok('Favorite IDs contain product'); else fail('Favorite IDs');

  const delFav = await api('DELETE', '/api/my/favorites/' + favPid, null, cliToken);
  if (delFav.status === 200) ok('Remove favorite'); else fail('Remove favorite');

  const fIds2 = await api('GET', '/api/my/favorites/ids', null, cliToken);
  if (!(d(fIds2)?.ids || []).includes(favPid)) ok('Favorite gone after removal'); else fail('Favorite still present');

  const guestFav = await api('POST', '/api/my/favorites/' + favPid);
  if (guestFav.status === 401) ok('Guest favorite → 401'); else fail('Guest fav guard', guestFav.status);
  const bizFav = await api('POST', '/api/my/favorites/' + favPid, null, bizToken);
  if (bizFav.status === 403) ok('Business favorite → 403'); else fail('Biz fav guard', bizFav.status);
}

// ─── AI FALLBACK ───
const assistant = await api('POST', '/api/assistant/chat', { message: 'ноутбук', context: { compareIds: [], lastProductIds: [] } }, cliToken);
if (assistant.status === 200 && d(assistant)?.reply) ok('Assistant chat'); else fail('Assistant chat', assistant.status);
const aReply = (d(assistant)?.reply || '').toLowerCase();
if (!aReply.includes('юкасса') && !aReply.includes('сбп') && !aReply.includes('оплатить')) ok('Assistant no fake payment');
else fail('Assistant payment claims', aReply.slice(0, 100));

const aiMgr = await api('POST', '/api/ai-manager/chat', { shopSlug, message: 'Расскажи про гарантию', source: 'shop_page' }, cliToken);
if (aiMgr.status === 200 && d(aiMgr)?.message) ok('AI Manager chat'); else fail('AI Manager chat', aiMgr.status);
const mgrReply = (d(aiMgr)?.message || '').toLowerCase();
if (!mgrReply.includes('юкасса') && !mgrReply.includes('бесплатная доставка') && !mgrReply.includes('скидка')) ok('AI Manager no fake claims');
else fail('AI Manager fake claims', mgrReply.slice(0, 100));

// ─── SAFETY ───
if (!JSON.stringify(d(h)).includes('GROQ_API_KEY') && !JSON.stringify(d(h)).includes('gsk_')) ok('No secrets in health'); else fail('Secrets in health');
if (d(assistant)?.reply && !d(assistant).reply.includes('GROQ')) ok('No secrets in assistant'); else fail('Secrets in assistant');
const bizMe2 = await api('GET', '/api/auth/me', null, bizToken);
if (d(bizMe2)?.role === 'business') ok('Persistence: biz /auth/me consistent'); else fail('Persistence biz');

const p = results.filter(r => r.status === 'PASS').length;
const f = results.filter(r => r.status === 'FAIL').length;
console.log(`\nAGENT.ONE Runtime Integration Audit 2026\nBackend: ${BASE}\n`);
for (const r of results) console.log(`  ${r.status === 'PASS' ? '✅' : '❌'} ${r.label}${r.detail ? ' — ' + r.detail : ''}`);
console.log(`\nResults: ${p} passed, ${f} failed`);
if (f > 0) process.exit(1);
