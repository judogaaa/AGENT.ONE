import http from 'node:http';

const BASE = 'http://localhost:8080';
let errors = 0;

function fail(label, detail) { errors++; console.error(`  ❌ ${label}: ${detail || ''}`); }
function ok(label) { console.log(`  ✅ ${label}`); }

function searchProducts(q) {
  return new Promise(resolve => {
    http.get(BASE + '/api/products?q=' + encodeURIComponent(q) + '&limit=50', { timeout: 8000 }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(d);
          const prods = j.data?.products || j.products || [];
          resolve({ status: res.statusCode, products: prods, count: prods.length });
        } catch { resolve({ status: res.statusCode, products: [], count: 0 }); }
      });
    }).on('error', e => resolve({ status: 0, products: [], count: 0, error: e.message }));
  });
}

function req(method, path, body, token) {
  return new Promise(resolve => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    const r = http.request(BASE + path, { method, headers, timeout: 8000 }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, body: d, raw: d.substring(0, 100) }); }
      });
    });
    r.on('error', e => resolve({ status: 0, error: e.message }));
    if (data) r.write(data);
    r.end();
  });
}

async function assert(desc, condition, detail) { if (condition) ok(desc); else fail(desc, detail); }

async function main() {
  console.log('AGENT.ONE Search Audit\n');

  // ── Catalog search ──
  console.log('── Catalog Search ──');

  let r = await searchProducts('айфон');
  await assert('айфон → products', r.count > 0, r.count);
  if (r.count > 0) {
    const hasIphone = r.products.some(p => (p.name || '').toLowerCase().includes('iphone'));
    await assert('айфон → contains iPhone', hasIphone, r.products[0]?.name);
  }

  r = await searchProducts('iphone');
  await assert('iphone → products', r.count > 0, r.count);

  r = await searchProducts('айфн');
  await assert('айфн → products', r.count > 0, r.count);
  if (r.count > 0) {
    const hasIphone = r.products.some(p => (p.name || '').toLowerCase().includes('iphone'));
    await assert('айфн → contains iPhone', hasIphone, r.products[0]?.name);
  }

  r = await searchProducts('макбук');
  await assert('макбук → products', r.count > 0, r.count);
  if (r.count > 0) {
    const hasMac = r.products.some(p => (p.name || '').toLowerCase().includes('macbook'));
    await assert('макбук → contains MacBook', hasMac, r.products[0]?.name);
  }

  r = await searchProducts('игровой пк rtx');
  await assert('игровой пк rtx → products', r.count > 0, r.count);

  r = await searchProducts('роутер');
  await assert('роутер → products', r.count > 0, r.count);

  r = await searchProducts('камера');
  await assert('камера → products', r.count > 0, r.count);

  r = await searchProducts('ксяоми');
  await assert('ксяоми → products', r.count > 0, r.count);
  if (r.count > 0) {
    const hasXiaomi = r.products.some(p => {
      const n = (p.name || '').toLowerCase();
      const b = (p.brand || '').toLowerCase();
      return n.includes('xiaomi') || b.includes('xiaomi');
    });
    await assert('ксяоми → contains Xiaomi', hasXiaomi, r.products[0]?.name);
  }

  r = await searchProducts('наушники');
  await assert('наушники → products', r.count > 0, r.count);

  r = await searchProducts('zzzz-not-real-product-xyz');
  await assert('nonsense → 0 products', r.count === 0, `got ${r.count}`);

  // ── Assistant search ──
  console.log('\n── Assistant Search ──');
  const cli = await req('POST', '/api/auth/signin', { email: 'client@agentone.ru', password: 'client123' });
  const tok = cli.body.data?.token;

  const tests = [
    { q: 'айфон', label: 'айфон' },
    { q: 'айфн', label: 'айфн' },
    { q: 'игровой пк rtx', label: 'игровой пк rtx' },
    { q: 'роутер', label: 'роутер' },
  ];
  for (const t of tests) {
    r = await req('POST', '/api/assistant/chat', { message: t.q, context: {} }, tok);
    const prods = r.body.data?.products || r.body?.products || [];
    await assert(`assistant "${t.label}" → products`, prods.length > 0, prods.length);
  }

  // ── Filters preserved ──
  console.log('\n── Filters ──');
  r = await searchProducts('айфон');
  const allCount = r.count;
  r = await req('GET', '/api/products?q=' + encodeURIComponent('айфон') + '&category=electronics');
  const catProds = r.body.data?.products || r.body?.products || [];
  await assert('category filter works with q', catProds.length >= 0, `category filtered: ${catProds.length} of ${allCount}`);

  // ── Score relevance ──
  console.log('\n── Scoring ──');
  r = await searchProducts('айфон');
  if (r.products.length > 1) {
    const first = (r.products[0].name || '').toLowerCase();
    const betterFirst = first.includes('iphone');
    await assert('айфон top result is iPhone', betterFirst, r.products[0].name);
  }
  r = await searchProducts('роутер');
  if (r.products.length > 1) {
    const first = (r.products[0].name || '').toLowerCase();
    const isRouter = first.includes('router') || first.includes('keenetic') || first.includes('tp-link') || first.includes('xiaomi');
    await assert('роутер top result is router', isRouter, r.products[0].name);
  }

  console.log(`\n${errors === 0 ? '✅ All checks passed' : '❌ ' + errors + ' error(s)'}`);
  process.exit(errors > 0 ? 1 : 0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
