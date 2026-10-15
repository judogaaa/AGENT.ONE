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

// ── 1. Guest guards ──
const guestGet = await api('GET', '/api/my/favorites');
if (guestGet.status === 401) ok('Guest GET /favorites → 401');
else fail('Guest GET /favorites', guestGet.status);

const guestPost = await api('POST', '/api/my/favorites/abc123');
if (guestPost.status === 401) ok('Guest POST → 401');
else fail('Guest POST', guestPost.status);

const guestDel = await api('DELETE', '/api/my/favorites/abc123');
if (guestDel.status === 401) ok('Guest DELETE → 401');
else fail('Guest DELETE', guestDel.status);

const guestIDs = await api('GET', '/api/my/favorites/ids');
if (guestIDs.status === 401) ok('Guest GET /favorites/ids → 401');
else fail('Guest GET /favorites/ids', guestIDs.status);

// ── 2. Business guard ──
const bizToken = await signin('demo@agentone.ru', 'demo123');
if (!bizToken) { fail('Business login'); } else {
  const bizGet = await api('GET', '/api/my/favorites', null, bizToken);
  if (bizGet.status === 403) ok('Business GET → 403');
  else fail('Business GET', bizGet.status);

  const bizPost = await api('POST', '/api/my/favorites/abc123', null, bizToken);
  if (bizPost.status === 403) ok('Business POST → 403');
  else fail('Business POST', bizPost.status);
}

// ── 3. Client favorites flow ──
const cliToken = await signin('client@agentone.ru', 'client123');
if (!cliToken) { fail('Client login'); } else {
  // Get products to have real IDs
  const products = await api('GET', '/api/products?limit=3');
  const prodData = unwrap(products);
  const prods = prodData?.products || [];
  if (prods.length < 2) {
    fail('Not enough products to test favorites', `Got ${prods.length}`);
  } else {
    const pid1 = prods[0].id;
    const pid2 = prods[1].id;
    const pid3 = prods[2].id;

    // Add favorite
    const add1 = await api('POST', '/api/my/favorites/' + pid1, null, cliToken);
    const add1d = unwrap(add1);
    if (add1.status === 200 && add1d?.favorite === true) ok('Add favorite #1');
    else fail('Add favorite #1', add1.status);

    const add2 = await api('POST', '/api/my/favorites/' + pid2, null, cliToken);
    if (add2.status === 200 && unwrap(add2)?.favorite === true) ok('Add favorite #2');
    else fail('Add favorite #2', add2.status);

    // Duplicate add
    const dup = await api('POST', '/api/my/favorites/' + pid1, null, cliToken);
    if (dup.status === 200) ok('Duplicate add OK (no 409)');
    else fail('Duplicate add', dup.status);

    // Get IDs
    const ids = await api('GET', '/api/my/favorites/ids', null, cliToken);
    const idsData = unwrap(ids);
    const favIds = idsData?.ids || [];
    if (favIds.includes(pid1) && favIds.includes(pid2)) ok('IDs contain added products');
    else fail('IDs check', JSON.stringify(favIds));

    // Get full favorites list
    const favs = await api('GET', '/api/my/favorites', null, cliToken);
    const favsData = unwrap(favs);
    const favItems = favsData?.favorites || [];
    if (favItems.length >= 2) ok('Full favorites list');
    else fail('Full favorites list', `Got ${favItems.length}`);

    // Each product has favorite:true
    const allFavTrue = favItems.every(p => p.favorite === true);
    if (allFavTrue) ok('All returned items have favorite:true');
    else fail('favorite:true flag');

    // Remove favorite
    const del = await api('DELETE', '/api/my/favorites/' + pid1, null, cliToken);
    if (del.status === 200 && unwrap(del)?.favorite === false) ok('Remove favorite');
    else fail('Remove favorite', del.status);

    // Verify removed
    const ids2 = await api('GET', '/api/my/favorites/ids', null, cliToken);
    const ids2Data = unwrap(ids2);
    if (!(ids2Data?.ids || []).includes(pid1)) ok('Removed product gone from IDs');
    else fail('Removed product still in IDs');

    // Remove remaining
    await api('DELETE', '/api/my/favorites/' + pid2, null, cliToken);
    if (pid3) await api('DELETE', '/api/my/favorites/' + pid3, null, cliToken);

    // 404 on non-existent product
    const fakeAdd = await api('POST', '/api/my/favorites/nonexistent123', null, cliToken);
    if (fakeAdd.status === 404) ok('Non-existent product → 404');
    else fail('Non-existent product', fakeAdd.status);
  }

  // ── 4. Existing endpoints still work ──
  const cart = await api('GET', '/api/my/orders', null, cliToken);
  if (cart.status === 200) ok('Orders still work after favorites');
  else fail('Orders broken', cart.status);

  const compare = await api('POST', '/api/compare', { productIds: [prods[0]?.id, prods[1]?.id].filter(Boolean) });
  if (compare.status === 200) ok('Compare still works');
  else fail('Compare broken', compare.status);
}

// ── 5. Business ops still work ──
if (bizToken) {
  const bizProducts = await api('GET', '/api/business/products', null, bizToken);
  if (bizProducts.status === 200) ok('Business products still work');
  else fail('Business products broken', bizProducts.status);

  const bizStats = await api('GET', '/api/business/dashboard/stats', null, bizToken);
  if (bizStats.status === 200) ok('Dashboard stats still work');
  else fail('Dashboard stats broken', bizStats.status);
}

// ── 6. Emoji scan ──
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
const files = walk('client/src', ['.jsx', '.js', '.css']);
let emojiCount = 0;
for (const f of files) {
  const c = fs.readFileSync(f, 'utf8');
  const matches = c.match(emojiRe);
  if (matches) {
    emojiCount += matches.length;
    fail(`Emoji in ${f}`, matches.slice(0, 3).join(','));
  }
}
if (emojiCount === 0) ok('0 emoji in client/src');
else fail(`emoji: ${emojiCount}`);

// ── Summary ──
const passed = results.filter(r => r.status === 'PASS').length;
const failed = results.filter(r => r.status === 'FAIL').length;
console.log('\nAGENT.ONE Favorites Audit 2026');
console.log('Backend:', BASE, '\n');
for (const r of results) {
  const icon = r.status === 'PASS' ? '✅' : '❌';
  console.log(`  ${icon} ${r.label}${r.detail ? ' — ' + r.detail : ''}`);
}
console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
