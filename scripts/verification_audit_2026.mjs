const BASE = 'http://localhost:8080';
const DEV_TOKEN = 'X-Dev-Admin-Token';
const DEV_SECRET = 'dev-secret';
const results = [];

function ok(label) { results.push({ label, status: 'PASS' }); }
function fail(label, detail) { results.push({ label, status: 'FAIL', detail }); }

async function api(method, path, body, token, extraHeaders) {
  const headers = { 'Content-Type': 'application/json', ...extraHeaders };
  if (token) headers.Authorization = 'Bearer ' + token;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(BASE + path, opts);
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}
  return { status: res.status, data, text };
}
function unwrap(r) {
  if (r.data && r.data.ok === true && r.data.data !== undefined) return r.data.data;
  return r.data;
}
async function signin(email, password) {
  const r = await api('POST', '/api/auth/signin', { email, password });
  return unwrap(r)?.token || null;
}

// ── Public/demo ──
const shop = await api('GET', '/api/shop/technomarket');
const sData = unwrap(shop)?.shop || {};
if (sData.verificationStatus === 'approved') ok('Demo shop verificationStatus approved');
else fail('Demo shop verification', sData.verificationStatus);

const shops = await api('GET', '/api/shops');
if ((unwrap(shops)?.shops || []).length >= 3) ok('At least 3 shops in catalog');
else fail('Shops list');

// ── Client restrictions ──
const cli = await signin('client@agentone.ru', 'client123');
if (cli) ok('Client login'); else fail('Client login');

const cliGet = await api('GET', '/api/business/verification', null, cli);
if (cliGet.status === 403) ok('Client verification GET → 403');
else fail('Client verification GET', cliGet.status);

const cliPost = await api('POST', '/api/business/verification', { orgName: 'Test', contactPhone: '+7' }, cli);
if (cliPost.status === 403) ok('Client verification POST → 403');
else fail('Client verification POST', cliPost.status);

// ── Approved business ──
const biz = await signin('demo@agentone.ru', 'demo123');
if (biz) ok('Business login'); else fail('Business login');

const bizVer = await api('GET', '/api/business/verification', null, biz);
if (bizVer.status === 200 && unwrap(bizVer)?.status === 'approved') ok('Approved business verification GET');
else fail('Approved business verification', JSON.stringify(unwrap(bizVer)));

const bizStats = await api('GET', '/api/business/dashboard/stats', null, biz);
if (bizStats.status === 200) ok('Approved business dashboard stats');
else fail('Approved business stats', bizStats.status);

const bizProds = await api('GET', '/api/business/products', null, biz);
if (bizProds.status === 200) ok('Approved business products list');
else fail('Approved business products', bizProds.status);

const bizAI = await api('POST', '/api/ai-manager/chat', { shopSlug: 'technomarket', message: 'hello', source: 'shop_page' }, cli);
if (bizAI.status === 200) ok('AI Manager works for approved shop');
else fail('AI Manager', bizAI.status);

// ── Pending business scenario ──
// Create test user with unique email
const ts = Date.now();
const testEmail = `p4test_${ts}@agentone.test`;
const signup = await api('POST', '/api/auth/signup', {
  email: testEmail,
  password: 'test123',
  displayName: 'P4 Test Shop',
  role: 'business',
  shopName: 'P4 Test Store',
  terms_accepted: true,
  pd_consent: true,
  consent_source: 'verification_audit',
});
const testToken = unwrap(signup)?.token;
if (!testToken) { fail('Test business signup'); } else {
  ok('Test business signup');

  // Create shop for this business
  const createShop = await api('POST', '/api/shop', { name: 'P4 Test Store', slug: 'p4test-' + ts }, testToken);
  if (createShop.status === 200) ok('Test shop created');
  else { fail('Test shop creation', createShop.status); }

  const testShopId = unwrap(createShop)?.shop?.id || '';

  // Submit verification
  const submit = await api('POST', '/api/business/verification', {
    orgName: 'P4 Test Org', contactPhone: '+79990001122', inn: '1234567890', legalAddress: 'Test Street 1',
  }, testToken);
  if (submit.status === 200 && unwrap(submit)?.status === 'pending') ok('Verification submitted → pending');
  else fail('Verification submit', submit.status + ' ' + JSON.stringify(unwrap(submit)));

  // Confirm pending
  const pendingGet = await api('GET', '/api/business/verification', null, testToken);
  if (unwrap(pendingGet)?.status === 'pending') ok('Pending status confirmed');
  else fail('Pending status', JSON.stringify(unwrap(pendingGet)));

  // Pending business cannot create product
  const createProd = await api('POST', '/api/products', { name: 'Test', price: 100, category: 'electronics', shopId: testShopId }, testToken);
  if (createProd.status === 403) ok('Pending business cannot create product');
  else fail('Pending create product', createProd.status);

  // Approve via dev endpoint
  const approve = await api('POST', '/api/dev/business-verification/' + testShopId + '/approve', null, null, { [DEV_TOKEN]: DEV_SECRET });
  if (approve.status === 200) ok('Dev approve works');
  else fail('Dev approve', approve.status);

  // Confirm approved
  const nowApproved = await api('GET', '/api/business/verification', null, testToken);
  if (unwrap(nowApproved)?.status === 'approved') ok('Approved after dev approve');
  else fail('Approved after approve', JSON.stringify(unwrap(nowApproved)));

  // Now can create product
  const create2 = await api('POST', '/api/products', { name: 'Test Prod', price: 200, category: 'electronics', shopId: testShopId }, testToken);
  if (create2.status === 200) ok('Approved business can create product');
  else fail('Approved create product', create2.status);

  // Reject via dev endpoint
  const reject = await api('POST', '/api/dev/business-verification/' + testShopId + '/reject', { reason: 'test rejection' }, null, { [DEV_TOKEN]: DEV_SECRET });
  if (reject.status === 200) ok('Dev reject works');
  else fail('Dev reject', reject.status);

  const rejectedGet = await api('GET', '/api/business/verification', null, testToken);
  if (unwrap(rejectedGet)?.status === 'rejected') ok('Rejected status confirmed');
  else fail('Rejected status', JSON.stringify(unwrap(rejectedGet)));

  // Rejected cannot create product
  const create3 = await api('POST', '/api/products', { name: 'Test3', price: 300, category: 'electronics', shopId: testShopId }, testToken);
  if (create3.status === 403) ok('Rejected business cannot create product');
  else fail('Rejected create product', create3.status);

  // Resubmit
  const resub = await api('POST', '/api/business/verification', { orgName: 'P4 Resubmit', contactPhone: '+79991112233' }, testToken);
  if (resub.status === 200 && unwrap(resub)?.status === 'pending') ok('Resubmit → pending');
  else fail('Resubmit', resub.status);

  // Re-approve to restore clean state
  await api('POST', '/api/dev/business-verification/' + testShopId + '/approve', null, null, { [DEV_TOKEN]: DEV_SECRET });
}

// ── Security: dev endpoint requires token ──
const noToken = await api('POST', '/api/dev/business-verification/abc123/approve', null, null);
if (noToken.status === 401) ok('Dev approve without token → 401');
else fail('Dev approve without token', noToken.status);

// No private legal fields in public shop
const shopText = JSON.stringify(shop.data);
if (!shopText.includes('legalAddress') && !shopText.includes('legal_address')) ok('No private fields in public shop');
else fail('Private fields in public shop');

// ── Summary ──
const passed = results.filter(r => r.status === 'PASS').length;
const failed = results.filter(r => r.status === 'FAIL').length;
console.log('\nAGENT.ONE Verification Audit 2026');
console.log('Backend:', BASE, '\n');
for (const r of results) {
  console.log(`  ${r.status === 'PASS' ? '✅' : '❌'} ${r.label}${r.detail ? ' — ' + r.detail : ''}`);
}
console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
