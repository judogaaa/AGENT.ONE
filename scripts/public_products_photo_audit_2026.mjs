// Public products photo audit — fails if any active public product has no valid photo
import http from 'node:http';
import https from 'node:https';
import { Buffer } from 'node:buffer';

const BASE = 'http://localhost:8080';
let errors = 0;

function fail(label, detail) { errors++; console.error(`  ❌ ${label}: ${detail || ''}`); }
function ok(label) { console.log(`  ✅ ${label}`); }

function normalizeImages(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean).map(v => String(v).trim());
  if (typeof value === 'string') {
    const t = value.trim();
    if (!t || t === '{}' || t === '[]') return [];
    if (t.startsWith('{') && t.endsWith('}')) {
      return t.slice(1, -1).split(',').map(s => s.replace(/^"/, '').replace(/"$/, '').trim()).filter(Boolean);
    }
    if (t.startsWith('[')) { try { return normalizeImages(JSON.parse(t)); } catch {} }
    return t.split(/[\s\n,]+/).map(s => s.trim()).filter(Boolean);
  }
  return [];
}

function checkImage(url) {
  return new Promise(resolve => {
    const full = url.startsWith('http') ? url : (BASE + (url.startsWith('/') ? url : '/' + url));
    const getter = full.startsWith('https') ? https.get : http.get;
    getter(full, { timeout: 5000 }, res => {
      if (res.statusCode !== 200) return resolve({ ok: false, reason: `http_${res.statusCode}` });
      const ct = (res.headers['content-type'] || '').toLowerCase();
      if (!ct.startsWith('image/')) return resolve({ ok: false, reason: `content:${ct}` });
      const chunks = [];
      res.on('data', c => chunks.push(Buffer.from(c)));
      res.on('end', () => {
        const b = Buffer.concat(chunks);
        const jpg = b.length > 3 && b[0] === 255 && b[1] === 216 && b[2] === 255;
        const png = b.length > 8 && b[0] === 137 && b[1] === 80 && b[2] === 78;
        const webp = b.length > 12 && b[0] === 82 && b[1] === 73 && b[2] === 70;
        resolve({ ok: jpg || png || webp, reason: jpg ? 'jpg' : png ? 'png' : webp ? 'webp' : `bad_magic` });
      });
    }).on('error', e => resolve({ ok: false, reason: e.message }));
  });
}

async function main() {
  console.log('AGENT.ONE Public Products Photo Audit\n');

  // Fetch all active products
  const products = await new Promise(resolve => {
    http.get(BASE + '/api/products?limit=500', { timeout: 10000 }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(d);
          resolve((j.data?.products || j.products || []).filter(p => p.isActive));
        } catch { resolve([]); }
      });
    }).on('error', () => resolve([]));
  });

  console.log(`Active public products: ${products.length}\n`);

  let validPhoto = 0;
  let noImages = 0;
  let brokenImages = 0;
  const byShop = {};
  const issues = [];

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const slug = p.shopSlug || '?';
    if (!byShop[slug]) byShop[slug] = { total: 0, ok: 0, fail: 0 };
    byShop[slug].total++;

    const imgs = normalizeImages(p.images);
    if (imgs.length === 0 || imgs.every(i => !i)) {
      noImages++;
      byShop[slug].fail++;
      issues.push({ product: p, reason: 'no images' });
      continue;
    }

    let hasValid = false;
    for (const img of imgs) {
      const r = await checkImage(img);
      if (r.ok) { hasValid = true; break; }
    }
    if (hasValid) {
      validPhoto++;
      byShop[slug].ok++;
    } else {
      brokenImages++;
      byShop[slug].fail++;
      issues.push({ product: p, reason: `all images broken (${imgs.slice(0, 2).join(', ')})` });
    }
  }

  console.log('═'.repeat(50));
  console.log(`Valid photos: ${validPhoto}`);
  console.log(`No images:    ${noImages}`);
  console.log(`Broken imgs:  ${brokenImages}`);
  console.log('');
  console.log('By shop:');
  for (const [s, c] of Object.entries(byShop).sort()) {
    console.log(`  ${s.padEnd(14)} total=${c.total} ok=${c.ok} fail=${c.fail}`);
  }

  if (issues.length > 0) {
    console.log(`\n❌ ${issues.length} products with photo issues:`);
    issues.forEach(i => console.log(`  [${(i.product.id||'').slice(0,8)}] ${(i.product.shopSlug||'').padEnd(14)} ${i.product.name} — ${i.reason}`));
  }

  console.log(`\n${issues.length === 0 ? '✅ All active products have valid photos' : '❌ ' + issues.length + ' products need fixing'}`);
  process.exit(issues.length > 0 ? 1 : 0);
}

main().catch(e => { console.error(e.message); process.exit(1); });
