import http from 'node:http';
import { existsSync, writeFileSync } from 'fs';

const BASE = 'http://localhost:8080';
const PUBLIC = 'client/public';
const DIST = 'client/dist';
let errors = 0;

// ── helpers ──
function normalizeImages(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean).map(v => String(v).trim());
  if (typeof value === 'string') {
    const t = value.trim();
    if (!t) return [];
    if (t.startsWith('[')) { try { const a = JSON.parse(t); return normalizeImages(a); } catch {} }
    return t.split(/[\s\n]+/).map(s => s.trim()).filter(Boolean);
  }
  return [];
}

function httpGet(url) {
  return new Promise(resolve => {
    const r = http.get(url, { timeout: 5000 }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(Buffer.from(c)));
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        resolve({ status: res.statusCode, ct: res.headers['content-type'] || '', body });
      });
    });
    r.on('error', e => resolve({ status: 0, ct: '', body: Buffer.alloc(0), error: e.message }));
    r.on('timeout', () => { r.destroy(); resolve({ status: 0, ct: '', body: Buffer.alloc(0), error: 'timeout' }); });
  });
}

// ── Fetch products ──
console.log('Fetching products...');
const products = [];
try {
  const resp = await httpGet(BASE + '/api/products?limit=300');
  if (resp.status !== 200) { console.error('Failed to fetch products:', resp.status); process.exit(1); }
  const d = JSON.parse(resp.body.toString());
  const list = d.data?.products || d.products || d.items || [];
  products.push(...list);
} catch (e) { console.error('API error:', e.message); process.exit(1); }

console.log(`Products fetched: ${products.length}`);

// ── Check each image URL ──
const okRows = [], errRows = [];
const header = 'productName,shopSlug,imageUrl,statusCode,contentType,firstBytes,publicExists,distExists,errorReason\n';
let checked = 0;

for (const p of products) {
  const imgs = normalizeImages(p.images);
  for (const url of imgs) {
    // Only verify demo-products URLs, skip external https images
    if (!url.startsWith('/demo-products/')) continue;
    checked++;

    const fullUrl = url.startsWith('http') ? url : BASE + url;
    const localPath = url.startsWith('/') ? url.slice(1) : url; // remove leading /
    const publicExists = existsSync(PUBLIC + '/' + localPath);
    const distExists = existsSync(DIST + '/' + localPath);

    const resp = await httpGet(fullUrl);
    const firstBytes = resp.body.slice(0, 20);
    const firstHex = Array.from(firstBytes.slice(0, 6)).map(b => b.toString(10)).join(' ');
    const isHtml = firstBytes.slice(0, 10).toString().toLowerCase().includes('<!doctype') || firstBytes.slice(0, 10).toString().toLowerCase().includes('<html');

    let reason = '';
    if (resp.status === 0) reason = 'Connection failed';
    else if (resp.status !== 200) reason = `HTTP ${resp.status}`;
    else if (!resp.ct.startsWith('image/')) reason = `bad content-type: ${resp.ct}`;
    else if (isHtml) reason = 'HTML instead of image (SPA fallback)';
    else if (url.endsWith('.jpg') || url.endsWith('.jpeg')) {
      if (firstBytes[0] !== 255 || firstBytes[1] !== 216 || firstBytes[2] !== 255) reason = `invalid JPG magic bytes: ${firstHex}`;
    }
    // Missing local files are also fatal for demo-products paths
    if (!reason && !publicExists) reason = 'missing in client/public';
    if (!reason && !distExists) reason = 'missing in client/dist';

    if (reason) {
      errors++;
      errRows.push([p.name||'', p.shopSlug||'', url, resp.status, resp.ct, firstHex, publicExists, distExists, reason].join(','));
    } else {
      okRows.push([p.name||'', p.shopSlug||'', url, resp.status, resp.ct, firstHex, publicExists, distExists, ''].join(','));
    }
  }
  if (checked % 50 === 0) console.log(`  ${checked} images checked...`);
}

// ── Write reports ──
writeFileSync('demo_catalog_2026/http_image_check_errors_2026.csv', header + errRows.join('\n'));
writeFileSync('demo_catalog_2026/http_image_check_2026.csv', header + okRows.join('\n'));

const missingPublic = errRows.filter(r => r.includes('missing in client/public')).length;
const missingDist = errRows.filter(r => r.includes('missing in client/dist')).length;
const http404 = errRows.filter(r => r.includes('HTTP 404')).length;
const badStatus = errRows.filter(r => r.includes('HTTP 50') || r.includes('HTTP 40') && !r.includes('HTTP 404')).length;
const badCT = errRows.filter(r => r.includes('bad content-type')).length;
const htmlErr = errRows.filter(r => r.includes('HTML instead')).length;
const magicErr = errRows.filter(r => r.includes('invalid JPG magic')).length;
const connErr = errRows.filter(r => r.includes('Connection failed')).length;
console.log(`\nProducts checked: ${products.length}`);
console.log(`Image URLs checked: ${checked}`);
console.log(`OK: ${okRows.length}`);
console.log(`Fatal errors: ${errRows.length}`);
console.log(`  HTTP 404: ${http404}`);
console.log(`  Bad HTTP status: ${badStatus}`);
console.log(`  Bad content-type: ${badCT}`);
console.log(`  HTML instead of image: ${htmlErr}`);
console.log(`  Invalid magic bytes: ${magicErr}`);
console.log(`  Missing public: ${missingPublic}`);
console.log(`  Missing dist: ${missingDist}`);
console.log(`  Connection failed: ${connErr}`);
if (errRows.length > 0) {
  for (const e of errRows.slice(0, 5)) console.log(`  ${e}`);
  if (errRows.length > 5) console.log(`  ... and ${errRows.length - 5} more`);
  console.log(`\nErrors CSV: demo_catalog_2026/http_image_check_errors_2026.csv`);
  process.exit(1);
} else {
  console.log('All images OK');
  process.exit(0);
}
