import http from 'node:http';

const BASE = 'http://localhost:8080';
const SHOP_SLUG = 'technomarket';

let errors = 0;

function fail(endpoint, status, body, hint) {
  errors++;
  console.error(`❌ ${endpoint} — status ${status}`);
  if (body) console.error(`   body: ${body}`);
  if (hint) console.error(`   hint: ${hint}`);
}

function ok(label) {
  console.log(`  ✅ ${label}`);
}

// ── helpers ──
function req(method, path, body, token) {
  return new Promise((resolve) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    const url = new URL(path, BASE);
    const r = http.request(url, { method, headers, timeout: 8000 }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        try {
          const j = JSON.parse(d);
          resolve({ status: res.statusCode, ok: j.ok, data: j.data, error: j.error, raw: d });
        } catch {
          resolve({ status: res.statusCode, ok: false, raw: d.substring(0, 120) });
        }
      });
    });
    r.on('error', (e) => resolve({ status: 0, ok: false, error: e.message }));
    r.on('timeout', () => { r.destroy(); resolve({ status: 0, ok: false, error: 'timeout' }); });
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}
const get = (p, t) => req('GET', p, null, t);
const post = (p, b, t) => req('POST', p, b, t);
const put = (p, b, t) => req('PUT', p, b, t);

function httpGetRaw(path) {
  return new Promise(resolve => {
    const r = http.request(BASE + path, { method: 'GET', timeout: 5000 }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(Buffer.from(c)));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    r.on('error', () => resolve(Buffer.alloc(0)));
    r.on('timeout', () => { r.destroy(); resolve(Buffer.alloc(0)); });
    r.end();
  });
}

async function assertOk(label, result, expectStatus = 200) {
  if (result.status === 0) return fail(label, result.status, result.error, 'Backend not running? Start Go server.');
  if (result.ok) return ok(label);
  fail(label, result.status, result.error || result.raw);
}

async function assertStatus(endpoint, result, expectedStatus, expectOk = false, hint) {
  if (result.status === 0) return fail(endpoint, result.status, result.error, 'Backend not running?');
  if (expectOk && result.ok) return ok(endpoint);
  if (!expectOk && result.status === expectedStatus) return ok(endpoint);
  fail(endpoint, result.status, result.ok ? 'unexpected ok' : result.error || result.raw, hint);
}

// ── main ──
console.log('AGENT.ONE smoke test');
console.log(`Backend: ${BASE}\n`);

// 1. Backend alive
const health = await get('/api/health');
if (health.status === 0 || !health.ok) {
  console.error('\nBackend is not running on http://localhost:8080. Start Docker and Go server first.\n');
  process.exit(1);
}
console.log('── Public ──');
ok('health');
await assertOk('products', await get('/api/products'));
await assertOk('catalog/facets', await get('/api/catalog/facets'));
await assertOk('shop technomarket', await get(`/api/shop/${SHOP_SLUG}`));
await assertStatus('brand mark', await get('/brand-mark.png'), 200, false);

// Demo image — magic bytes check
const demoImg = await get('/demo-products/technomarket/technomarket-001-1.jpg');
const demoImgRaw = await httpGetRaw('/demo-products/technomarket/technomarket-001-1.jpg');
const firstBytes = Array.from(demoImgRaw.slice(0, 3));
const isJpg = firstBytes[0] === 255 && firstBytes[1] === 216 && firstBytes[2] === 255;
if (demoImg.status === 200 && isJpg) ok('demo image JPG magic bytes');
else fail('demo image magic bytes', demoImg.status, firstBytes.join(' '), 'Expected 255 216 255. If 60 33 68 = HTML, SPA fallback is broken.');

// API image normalization check
const prodList = await get('/api/products');
const products = prodList.data?.products || prodList.products || [];
const iphone = products.find(p => p.name === 'iPhone 16 Pro Max 256GB');
if (iphone) {
  const imgs = typeof iphone.images === 'string' ? iphone.images.split(/[\s\n]+/).filter(Boolean) : (iphone.images || []);
  const firstImg = imgs[0] || '';
  if (firstImg.includes('demo-products/technomarket/technomarket-001-1')) ok('API image normalization');
  else fail('API image normalization', 200, firstImg, 'Expected /demo-products/technomarket/technomarket-001-1.jpg');
} else {
  ok('API image normalization (product not found in API)');
}

// 2. Auth
console.log('\n── Auth ──');
const bizLogin = await post('/api/auth/signin', { email: 'demo@agentone.ru', password: 'demo123' });
await assertOk('business signin', bizLogin);
const bizToken = bizLogin.data?.token;
if (!bizToken) { fail('business token', 200, 'no token in response'); } else { ok('business token'); }

const bizMe = await get('/api/auth/me', bizToken);
await assertOk('business /me', bizMe);

const cliLogin = await post('/api/auth/signin', { email: 'client@agentone.ru', password: 'client123' });
await assertOk('client signin', cliLogin);
const cliToken = cliLogin.data?.token;
if (!cliToken) { fail('client token', 200, 'no token'); } else { ok('client token'); }

const cliMe = await get('/api/auth/me', cliToken);
await assertOk('client /me', cliMe);

// 3. Business
console.log('\n── Business ──');
await assertOk('dashboard stats', await get('/api/business/dashboard/stats', bizToken));
await assertOk('business products', await get('/api/business/products', bizToken));
await assertOk('business orders', await get('/api/business/orders', bizToken));
await assertOk('payment settings', await get('/api/business/payment-settings', bizToken));
await assertOk('my leads (biz)', await get('/api/my/leads', bizToken));

// Copilot reply
const cpReply = await post('/api/business/copilot/reply', {
  message: 'Клиент спрашивает про доставку и выбор ноутбука',
  channel: 'site', scenario: 'auto', style: 'professional',
}, bizToken);
await assertOk('copilot reply', cpReply);

// Copilot create lead
const cpLead = await post('/api/business/copilot/leads', {
  name: 'Smoke Lead ' + Date.now(),
  phone: '', email: '',
  channel: 'site', productId: '',
  customerNeed: 'Smoke test',
  message: 'Проверка создания лида',
  aiReply: 'Тестовый ответ',
  contactPreference: 'phone',
  deliveryCity: 'Smoke City',
}, bizToken);
await assertOk('copilot create lead', cpLead);

// 4. Client
console.log('\n── Client ──');
await assertOk('my orders', await get('/api/my/orders', cliToken));
await assertOk('my leads (cli)', await get('/api/my/leads', cliToken));

const asstChat = await post('/api/assistant/chat', {
  message: 'найди ноутбук для работы',
  context: { compareIds: [], cartIds: [], lastProductIds: [], lastRecommendationId: '' },
}, cliToken);
await assertOk('assistant chat', asstChat);

// 5. Guards
console.log('\n── Guards ──');
await assertStatus('stats → 401 no token', await get('/api/business/dashboard/stats'), 401, false, 'Without token should return 401');
await assertStatus('assistant → 401 no token', await post('/api/assistant/chat', { message: 'test' }), 401, false);
await assertStatus('stats → 403 client', await get('/api/business/dashboard/stats', cliToken), 403, false);
await assertStatus('assistant → 403 business', await post('/api/assistant/chat', { message: 'test' }, bizToken), 403, false, 'Business blocked from buyer assistant');

// Unknown API
await assertStatus('unknown API → 404', await post('/api/unknown-smoke-test-123', {}), 404, false);

// ── result ──
console.log(`\n${errors === 0 ? '✅ AGENT.ONE smoke passed' : '❌ AGENT.ONE smoke failed'}`);
process.exit(errors > 0 ? 1 : 0);
