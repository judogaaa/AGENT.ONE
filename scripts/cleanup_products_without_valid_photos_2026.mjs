// Cleanup products without valid photos
// --dry-run (default): scan and report only
// --apply: deactivate products with 0 valid photos via DB
import http from 'node:http';
import https from 'node:https';
import pg from 'pg';

const BASE = 'http://localhost:8080';
const DRY = !process.argv.includes('--apply');
if (DRY) console.log('DRY RUN — add --apply to deactivate products\n');
else console.log('APPLY MODE — will deactivate products without valid photos\n');

let errors = 0;

function normalizeImages(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean).map(v => String(v).trim());
  if (typeof value === 'string') {
    const t = value.trim();
    if (!t || t === '{}' || t === '[]') return [];
    if (t.startsWith('{') && t.endsWith('}')) {
      return t.slice(1, -1).split(',').map(s => s.replace(/^"/, '').replace(/"$/, '').replace(/^\s+|\s+$/g, '')).filter(Boolean);
    }
    if (t.startsWith('[')) {
      try { return normalizeImages(JSON.parse(t)); } catch {}
    }
    return t.split(/[\s\n,]+/).map(s => s.replace(/^\s+|\s+$/g, '').replace(/^"|"$/g, '')).filter(Boolean);
  }
  return [];
}

function checkImageUrl(url) {
  return new Promise(resolve => {
    if (!url || typeof url !== 'string' || url.length < 3) return resolve({ ok: false, reason: 'empty_url' });
    const fullUrl = url.startsWith('http') ? url : (BASE + (url.startsWith('/') ? url : '/' + url));
    const getter = fullUrl.startsWith('https') ? https.get : http.get;
    getter(fullUrl, { timeout: 6000 }, res => {
      if (res.statusCode !== 200) return resolve({ ok: false, reason: `http_${res.statusCode}` });
      const ct = (res.headers['content-type'] || '').toLowerCase();
      if (!ct.startsWith('image/')) return resolve({ ok: false, reason: `not_image:${ct}` });
      const chunks = [];
      res.on('data', c => chunks.push(Buffer.from(c)));
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        const isJpg = body.length > 3 && body[0] === 255 && body[1] === 216 && body[2] === 255;
        const isPng = body.length > 8 && body[0] === 137 && body[1] === 80 && body[2] === 78 && body[3] === 71;
        const isWebp= body.length > 12 && body[0] === 82 && body[1] === 73 && body[2] === 70 && body[3] === 70;
        if (isJpg || isPng || isWebp) resolve({ ok: true, type: isJpg ? 'jpg' : isPng ? 'png' : 'webp' });
        else resolve({ ok: false, reason: `bad_magic:${body.slice(0,4).toString('hex')}` });
      });
    }).on('error', e => resolve({ ok: false, reason: `error:${e.message}` }));
  });
}

async function main() {
  // Fetch all products
  console.log('Fetching all active products...');
  const allProducts = await new Promise(resolve => {
    http.get(BASE + '/api/products?limit=500', { timeout: 10000 }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { const j = JSON.parse(d); resolve((j.data?.products || j.products || []).filter(p => p.isActive)); }
        catch { resolve([]); }
      });
    }).on('error', () => resolve([]));
  });

  console.log(`Active products in API: ${allProducts.length}\n`);

  // Analyze each product
  const valid = [];
  const noImages = [];
  const brokenImages = [];
  const byShop = {};

  for (const p of allProducts) {
    const slug = p.shopSlug || 'unknown';
    if (!byShop[slug]) byShop[slug] = { total: 0, valid: 0, noImg: 0, broken: 0, candidates: [] };
    byShop[slug].total++;

    const imgs = normalizeImages(p.images);
    if (imgs.length === 0 || imgs.every(i => !i)) {
      noImages.push(p);
      byShop[slug].noImg++;
      byShop[slug].candidates.push({ id: p.id, name: p.name, shop: slug, reason: 'no images' });
      continue;
    }

    // Check each image
    let hasValid = false;
    for (const img of imgs) {
      const r = await checkImageUrl(img);
      if (r.ok) { hasValid = true; break; }
    }
    if (hasValid) {
      valid.push(p);
      byShop[slug].valid++;
    } else {
      brokenImages.push(p);
      byShop[slug].broken++;
      byShop[slug].candidates.push({ id: p.id, name: p.name, shop: slug, reason: `all images broken/404 (${imgs.slice(0, 2).join(', ')})` });
    }

    if ((valid.length + noImages.length + brokenImages.length) % 20 === 0) {
      process.stdout.write(`\r  Scanned ${valid.length + noImages.length + brokenImages.length}/${allProducts.length}...`);
    }
  }
  console.log(`\n  Done.\n`);

  // Report
  console.log('═'.repeat(60));
  console.log('RESULTS');
  console.log('═'.repeat(60));
  console.log(`Total active products:     ${allProducts.length}`);
  console.log(`Products with valid photo: ${valid.length}`);
  console.log(`Products WITHOUT images:   ${noImages.length}`);
  console.log(`Products with BROKEN imgs: ${brokenImages.length}`);
  console.log(`Candidates to deactivate:  ${noImages.length + brokenImages.length}`);
  console.log(`\nActive after cleanup:      ${valid.length}`);
  console.log('');

  console.log('By shop:');
  console.log('  Shop          Total Valid NoImg Broken');
  for (const [slug, c] of Object.entries(byShop).sort()) {
    console.log(`  ${slug.padEnd(14)} ${String(c.total).padStart(5)} ${String(c.valid).padStart(5)} ${String(c.noImg).padStart(5)} ${String(c.broken).padStart(6)}`);
  }

  const candidates = [...noImages, ...brokenImages];
  if (candidates.length === 0) {
    console.log('\nAll active products have valid photos. Nothing to do.');
    process.exit(0);
  }

  console.log('\n' + '═'.repeat(60));
  console.log('CANDIDATES TO DEACTIVATE:');
  console.log('═'.repeat(60));
  candidates.forEach(p => {
    const reason = brokenImages.includes(p) ? 'BROKEN' : 'NO_IMG';
    console.log(`  [${p.id.slice(0, 8)}] ${reason.padEnd(7)} ${(p.shopSlug||'').padEnd(14)} ${p.name}`);
  });

  if (DRY) {
    console.log(`\nDRY RUN complete. Run with --apply to deactivate ${candidates.length} products.`);
    process.exit(0);
  }

  // Apply mode via DB
  console.log(`\nDeactivating ${candidates.length} products via DB...`);
  const DB = process.env.DATABASE_URL || 'postgres://agentone:agentone@localhost:5432/agentone?sslmode=disable';
  const pool = new pg.Pool({ connectionString: DB, max: 1 });

  let deactivated = 0;
  const ids = candidates.map(p => p.id);
  const placeholders = ids.map((_, i) => '$' + (i + 1));
  const q = `UPDATE products SET is_active=false WHERE id IN (${placeholders.join(',')}) AND is_active=true`;
  const result = await pool.query(q, ids);
  deactivated = result.rowCount || 0;
  console.log(`Deactivated: ${deactivated}/${candidates.length}`);
  await pool.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
