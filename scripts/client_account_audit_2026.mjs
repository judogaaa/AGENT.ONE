import fs from 'fs';

const BASE = 'http://localhost:8080';
const results = [];

function ok(label) { results.push({ label, status: 'PASS' }); }
function fail(label, detail) { results.push({ label, status: 'FAIL', detail }); }

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

function unwrap(r) {
  if (r.data && r.data.ok === true && r.data.data !== undefined) return r.data.data;
  return r.data;
}

async function signin(email, password) {
  const r = await api('POST', '/api/auth/signin', { email, password });
  return unwrap(r)?.token || null;
}

// Guest
const guestAppeals = await api('GET', '/api/my/appeals');
if (guestAppeals.status === 401) ok('Guest appeals → 401');
else fail('Guest appeals guard', guestAppeals.status);

// Client
const cliToken = await signin('client@agentone.ru', 'client123');
if (!cliToken) { fail('Client login'); process.exit(1); }
ok('Client login');

const appeals = await api('GET', '/api/my/appeals', null, cliToken);
const aData = unwrap(appeals);
if (appeals.status === 200 && aData?.items && aData?.counts) ok('GET /api/my/appeals');
else fail('Appeals endpoint', appeals.status);

const orders = await api('GET', '/api/my/orders', null, cliToken);
if (orders.status === 200) ok('GET /api/my/orders');
else fail('Orders', orders.status);

const favs = await api('GET', '/api/my/favorites', null, cliToken);
if (favs.status === 200) ok('GET /api/my/favorites');
else fail('Favorites', favs.status);

const favIds = await api('GET', '/api/my/favorites/ids', null, cliToken);
if (favIds.status === 200) ok('GET /api/my/favorites/ids');
else fail('Favorite IDs', favIds.status);

// Business
const bizToken = await signin('demo@agentone.ru', 'demo123');
if (!bizToken) { fail('Business login'); } else {
  ok('Business login');
  const bizAppeals = await api('GET', '/api/my/appeals', null, bizToken);
  if (bizAppeals.status === 403) ok('Business appeals → 403');
  else fail('Business appeals guard', bizAppeals.status);

  const bizStats = await api('GET', '/api/business/dashboard/stats', null, bizToken);
  if (bizStats.status === 200) ok('Business dashboard stats');
  else fail('Business dashboard', bizStats.status);

  const bizProducts = await api('GET', '/api/business/products', null, bizToken);
  if (bizProducts.status === 200) ok('Business products');
  else fail('Business products', bizProducts.status);
}

// Existing endpoints
const assistant = await api('POST', '/api/assistant/chat', { message: 'ноутбук', context: { compareIds: [], lastProductIds: [] } }, cliToken);
if (assistant.status === 200) ok('Assistant chat');
else fail('Assistant chat', assistant.status);

const compare = await api('POST', '/api/compare', { productIds: ['03f8036e1295d71d', '4426d3f0f1a0f0f4'] });
if (compare.status === 200) ok('Compare');
else fail('Compare', compare.status);

// Emoji scan
function walk(dir, exts) {
  const out = [];
  for (const x of fs.readdirSync(dir)) {
    const p = dir + '/' + x;
    try {
      if (fs.statSync(p).isDirectory()) out.push(...walk(p, exts));
      else if (exts.some(e => p.endsWith(e))) out.push(p);
    } catch {}
  }
  return out;
}
const emojiRe = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
let emojiCount = 0;
for (const f of walk('client/src', ['.jsx', '.js', '.css'])) {
  const c = fs.readFileSync(f, 'utf8');
  const matches = c.match(emojiRe);
  if (matches) { emojiCount += matches.length; fail('Emoji in ' + f, matches.slice(0, 3).join(',')); }
}
if (emojiCount === 0) ok('0 emoji in client/src');

// Summary
const passed = results.filter(r => r.status === 'PASS').length;
const failed = results.filter(r => r.status === 'FAIL').length;
console.log('\nAGENT.ONE Client Account Audit 2026');
console.log('Backend:', BASE, '\n');
for (const r of results) {
  const icon = r.status === 'PASS' ? '✅' : '❌';
  console.log(`  ${icon} ${r.label}${r.detail ? ' — ' + r.detail : ''}`);
}
console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
