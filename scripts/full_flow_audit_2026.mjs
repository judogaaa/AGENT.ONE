import http from 'node:http';
import { Buffer } from 'node:buffer';

const BASE = 'http://localhost:8080';
let errors = 0;

function fail(label, status, detail) { errors++; console.error(`❌ ${label} (${status}): ${detail || ''}`); }
function ok(label) { console.log(`  ✅ ${label}`); }

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
    r.on('timeout', () => { r.destroy(); resolve({ status: 0, error: 'timeout' }); });
    if (data) r.write(data);
    r.end();
  });
}
function okResp(r) { return r.body?.ok === true; }
function httpGetRaw(path) {
  return new Promise(resolve => {
    http.get(BASE + path, { timeout: 5000 }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(Buffer.from(c)));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
    }).on('error', () => resolve({ status: 0, body: Buffer.alloc(0) }));
  });
}

async function assert(label, condition, status, detail) { if (condition) ok(label); else fail(label, status, detail); }

console.log('AGENT.ONE Full Flow Audit\n');

// 1. Public
console.log('── Public ──');
let r = await req('GET', '/api/health');
await assert('health', okResp(r), r.status, 'Backend down?');
r = await req('GET', '/api/products?limit=300');
await assert('products', okResp(r), r.status);
const prods = r.body?.data?.products || r.body?.products || [];
const shopSlugs = new Set(prods.map(p => p.shopSlug));
  await assert('demo shops present', [...shopSlugs].filter(s => ['technomarket','gamepower','smartspace'].includes(s)).length >= 3, 200, `demo: ${[...shopSlugs]}`);

r = await req('GET', '/api/shops');
const shops = r.body?.data?.shops || [];
  await assert('at least 3 shops', shops.length >= 3, 200, `got ${shops.length}`);
await assert('no format-shop', !shops.find(s => s.slug === 'format-shop'), 200);

// Demo image
const img = await httpGetRaw('/demo-products/technomarket/technomarket-001-1.jpg');
await assert('demo image magic bytes', img.status === 200 && img.body[0] === 255 && img.body[1] === 216 && img.body[2] === 255, img.status, `first: ${Array.from(img.body.slice(0,3)).join(' ')}`);

// 2. Auth
console.log('\n── Auth & Session ──');
let cli = await req('POST', '/api/auth/signin', { email: 'client@agentone.ru', password: 'client123' });
await assert('client signin', okResp(cli), cli.status);
const cliToken = cli.body.data?.token;
await assert('client token', !!cliToken, 200);

// Refresh simulation
let me1 = await req('GET', '/api/auth/me', null, cliToken);
const cliRole1 = me1.body?.data?.role || me1.body?.role;
await assert('client /me', cliRole1 === 'client', me1.status, cliRole1);
let me2 = await req('GET', '/api/auth/me', null, cliToken);
const cliRole2 = me2.body?.data?.role || me2.body?.role;
await assert('client /me re-check', cliRole2 === 'client', me2.status, 'role lost on re-check?');

let biz = await req('POST', '/api/auth/signin', { email: 'demo@agentone.ru', password: 'demo123' });
await assert('business signin', okResp(biz), biz.status);
const bizToken = biz.body.data?.token;
let me3 = await req('GET', '/api/auth/me', null, bizToken);
const bizRole1 = me3.body?.data?.role || me3.body?.role;
await assert('business /me', bizRole1 === 'business', me3.status);
let me4 = await req('GET', '/api/auth/me', null, bizToken);
const bizRole2 = me4.body?.data?.role || me4.body?.role;
await assert('business /me re-check', bizRole2 === 'business', me4.status, 'role lost on re-check?');

// 3. Client endpoints
console.log('\n── Client ──');
r = await req('GET', '/api/my/orders', null, cliToken);
await assert('my orders', okResp(r), r.status);
r = await req('GET', '/api/my/leads', null, cliToken);
await assert('my leads', okResp(r), r.status);
r = await req('POST', '/api/assistant/chat', { message: 'ноутбук', context: { compareIds: [], cartIds: [], lastProductIds: [], lastRecommendationId: '' } }, cliToken);
await assert('assistant chat', okResp(r), r.status);

// 4. Business endpoints
console.log('\n── Business ──');
r = await req('GET', '/api/business/dashboard/stats', null, bizToken);
await assert('stats', okResp(r), r.status);
r = await req('GET', '/api/business/products', null, bizToken);
await assert('business products', okResp(r), r.status);
r = await req('GET', '/api/business/orders', null, bizToken);
await assert('business orders', okResp(r), r.status);
r = await req('GET', '/api/my/leads', null, bizToken);
await assert('biz leads', okResp(r), r.status);
r = await req('POST', '/api/business/copilot/reply', { message: 'test', style: 'friendly' }, bizToken);
await assert('copilot reply', okResp(r), r.status);
r = await req('POST', '/api/business/copilot/leads', { name: 'Audit', message: 'audit test', customerNeed: 'test' }, bizToken);
await assert('copilot create lead', okResp(r), r.status);
r = await req('GET', '/api/business/payment-settings', null, bizToken);
await assert('payment settings', okResp(r), r.status);

// 5. Guards
console.log('\n── Guards ──');
r = await req('GET', '/api/business/dashboard/stats');
await assert('stats no token → 401', r.status === 401, r.status, 'Expected 401');
r = await req('POST', '/api/assistant/chat', { message: 'test' });
await assert('assistant no token → 401', r.status === 401, r.status, 'Expected 401');
r = await req('GET', '/api/business/dashboard/stats', null, cliToken);
await assert('stats client → 403', r.status === 403, r.status, 'Expected 403');
r = await req('POST', '/api/assistant/chat', { message: 'test' }, bizToken);
await assert('assistant business → 403', r.status === 403, r.status, 'Expected 403');

// 6. Token expiry check — bad token gets 401
r = await req('GET', '/api/auth/me', null, 'invalid-token-xxx');
await assert('bad token → 401', r.status === 401, r.status, 'Expected 401, frontend should clear session only on this');

console.log(`\n${errors === 0 ? '✅ All checks passed' : '❌ ' + errors + ' error(s)'}`);
process.exit(errors > 0 ? 1 : 0);
