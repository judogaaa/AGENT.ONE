import http from 'node:http';
import https from 'node:https';

const BASE = 'http://localhost:8080';
let errors = 0;

function fail(label, detail) { errors++; console.error(`  ❌ ${label}: ${detail || ''}`); }
function ok(label) { console.log(`  ✅ ${label}`); }

function req(method, path, body, token) {
  return new Promise(resolve => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    const r = http.request(BASE + path, { method, headers, timeout: 10000 }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, body: d, raw: d.substring(0, 120) }); }
      });
    });
    r.on('error', e => resolve({ status: 0, error: e.message }));
    if (data) r.write(data);
    r.end();
  });
}

function checkImageUrl(url) {
  return new Promise(resolve => {
    if (!url || typeof url !== 'string') return resolve(false);
    const fullUrl = url.startsWith('http') ? url : (BASE + (url.startsWith('/') ? url : '/' + url));
    const getter = fullUrl.startsWith('https') ? https.get : http.get;
    getter(fullUrl, { timeout: 5000 }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        const isJpg = d.length > 4 && d[0] === '\xff' && d[1] === '\xd8' || d.length > 3 && d[0] === 'R' && d[1] === 'I' && d[2] === 'F' && d[3] === 'F';
        resolve(res.statusCode === 200 && (res.headers['content-type'] || '').startsWith('image/'));
      });
    }).on('error', () => resolve(false));
  });
}

async function assert(desc, condition, detail) { if (condition) ok(desc); else fail(desc, detail); }

async function main() {
  console.log('AGENT.ONE Assistant Audit v2\n');

  // Auth
  const cli = await req('POST', '/api/auth/signin', { email: 'client@agentone.ru', password: 'client123' });
  await assert('client signin', cli.status === 200 && cli.body.ok, cli.status);
  const cliToken = cli.body.data?.token;
  const biz = await req('POST', '/api/auth/signin', { email: 'demo@agentone.ru', password: 'demo123' });
  const bizToken = biz.body.data?.token;

  // Guards
  console.log('\n── Guards ──');
  let r = await req('POST', '/api/assistant/chat', { message: 'test' });
  await assert('guest → 401', r.status === 401, r.status);
  r = await req('POST', '/api/assistant/chat', { message: 'test' }, bizToken);
  await assert('business → 403', r.status === 403, r.status);

  // Product search with images
  console.log('\n── Product Search + Images ──');
  r = await req('POST', '/api/assistant/chat', { message: 'iPhone до 200000', context: {} }, cliToken);
  await assert('iPhone search 200', r.status === 200 && r.body.ok, r.status);
  const prods = r.body.data?.products || r.body?.products || [];
  await assert('has products', prods.length > 0, prods.length);
  if (prods.length > 0) {
    await assert('product has id', !!prods[0].id);
    await assert('product has name', !!prods[0].name);
    await assert('product has price', prods[0].price > 0, prods[0].price);
    const pImg = prods[0];
    const hasImgs = (Array.isArray(pImg.images) && pImg.images.length > 0);
    await assert('product has images array', hasImgs, JSON.stringify(pImg.images || pImg).substring(0,100));
    if (hasImgs) {
      const imgOk = await checkImageUrl(pImg.images[0]);
      await assert('image URL resolves (HTTP 200 + image) ' + pImg.images[0], imgOk);
    }
  }

  // Gaming PC search
  r = await req('POST', '/api/assistant/chat', { message: 'игровой компьютер с RTX', context: {} }, cliToken);
  await assert('gaming PC search 200', r.status === 200, r.status);
  const gp = r.body.data?.products || r.body?.products || [];
  if (gp.length > 0) {
    const hasImgs = (Array.isArray(gp[0].images) && gp[0].images.length > 0);
    await assert('gaming PC has images', hasImgs, JSON.stringify(gp[0].images || 'none').substring(0,100));
    if (hasImgs) {
      const imgOk = await checkImageUrl(gp[0].images[0]);
      await assert('gaming PC image resolves', imgOk, gp[0].images[0]);
    }
  }

  // Smart home search
  r = await req('POST', '/api/assistant/chat', { message: 'умный дом', context: {} }, cliToken);
  await assert('smart home 200', r.status === 200, r.status);
  // Note: result count depends on catalog; just verify endpoint works

  // Checkout help
  console.log('\n── Checkout Help ──');
  r = await req('POST', '/api/assistant/chat', { message: 'как оформить заказ', context: {} }, cliToken);
  await assert('checkout help 200', r.status === 200, r.status);
  const reply = (r.body.data?.reply || r.body?.reply || '').toLowerCase();
  await assert('no Оплатить in reply', !reply.includes('оплатит'), reply.substring(0,80));
  await assert('no ЮKassa/card/sbp claims', !reply.includes('юkassa') && !reply.includes('юкасса') && !reply.includes('карт'), reply.substring(0,80));

  // Order help
  r = await req('POST', '/api/assistant/chat', { message: 'где мой заказ', context: {} }, cliToken);
  await assert('order help 200', r.status === 200, r.status);

  // Unknown fallback
  r = await req('POST', '/api/assistant/chat', { message: 'xyzqw12345', context: {} }, cliToken);
  await assert('unknown → honest fallback', r.status === 200, r.status);
  const r2 = (r.body.data?.reply || r.body?.reply || '').toLowerCase();
  await assert('no fake warranty/delivery/discount', !r2.includes('гаранти') && !r2.includes('скидк') && !r2.includes('доставк'), r2.substring(0,80));

  console.log(`\n${errors === 0 ? '✅ All checks passed' : '❌ ' + errors + ' error(s)'}`);
  process.exit(errors > 0 ? 1 : 0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
