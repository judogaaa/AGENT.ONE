// Delete products without valid photos — hard delete + update demo catalog
// --dry-run (default): scan and report only
// --apply: hard delete from DB + update JSON files
import http from 'node:http';
import https from 'node:https';
import pg from 'pg';
import { readFileSync, writeFileSync } from 'fs';
import { Buffer } from 'node:buffer';

const BASE = 'http://localhost:8080';
const DRY = !process.argv.includes('--apply');
if (DRY) console.log('DRY RUN — add --apply to hard-delete products\n');
else console.log('APPLY MODE — will hard-delete products without valid photos\n');

const DB = process.env.DATABASE_URL || 'postgres://agentone:agentone@localhost:5432/agentone?sslmode=disable';

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
        const isWebp = body.length > 12 && body[0] === 82 && body[1] === 73 && body[2] === 70 && body[3] === 70;
        if (isJpg || isPng || isWebp) resolve({ ok: true, type: isJpg ? 'jpg' : isPng ? 'png' : 'webp' });
        else resolve({ ok: false, reason: `bad_magic:${body.slice(0,4).toString('hex')}` });
      });
    }).on('error', e => resolve({ ok: false, reason: `error:${e.message}` }));
  });
}

function updateCatalogJson(filePath, deleteIds) {
  const data = JSON.parse(readFileSync(filePath, 'utf-8'));
  const products = Array.isArray(data) ? data : (data.products || []);
  const before = products.length;
  const filtered = Array.isArray(data)
    ? products.filter(p => !deleteIds.has(p.sku || p.id || p.slug))
    : { ...data, products: products.filter(p => !deleteIds.has(p.sku || p.id || p.slug)) };
  const after = Array.isArray(filtered) ? filtered.length : filtered.products.length;
  const removed = before - after;
  if (removed > 0) {
    if (DRY) {
      console.log(`  Would update ${filePath}: ${before} -> ${after} (remove ${removed})`);
    } else {
      writeFileSync(filePath, JSON.stringify(filtered, null, 2));
      const isArr = Array.isArray(filtered);
      const totalField = isArr ? 'count' : 'total';
      if (!isArr && after !== filtered[totalField]) {
        filtered[totalField] = after;
        writeFileSync(filePath, JSON.stringify(filtered, null, 2));
      }
      console.log(`  Updated ${filePath}: ${before} -> ${after} (removed ${removed})`);
    }
  }
  return removed;
}

async function main() {
  const pool = new pg.Pool({ connectionString: DB, max: 3 });

  // 1. Query all products
  console.log('Querying all products from DB...');
  const { rows: allProducts } = await pool.query('SELECT p.id, p.name, p.price, p.category, p.images, p.is_active, s.slug as shop_slug, s.name as shop_name, s.id as shop_id FROM products p LEFT JOIN shops s ON p.shop_id = s.id ORDER BY s.slug, p.name');
  console.log(`Total products in DB: ${allProducts.length}\n`);

  // 2. Analyze images
  const withPhotos = [];
  const noImages = [];
  const brokenImages = [];
  const byShop = {};

  for (let i = 0; i < allProducts.length; i++) {
    const p = allProducts[i];
    const slug = p.shop_slug || 'unknown';
    if (!byShop[slug]) byShop[slug] = { total: 0, ok: 0, noimg: 0, broken: 0, items: [] };
    byShop[slug].total++;

    const imgs = normalizeImages(p.images);
    if (imgs.length === 0 || imgs.every(img => !img)) {
      noImages.push(p);
      byShop[slug].noimg++;
      byShop[slug].items.push({ id: p.id, name: p.name, reason: 'no images' });
      continue;
    }

    let hasValid = false;
    for (const img of imgs) {
      const r = await checkImageUrl(img);
      if (r.ok) { hasValid = true; break; }
    }
    if (hasValid) {
      withPhotos.push(p);
      byShop[slug].ok++;
    } else {
      brokenImages.push(p);
      byShop[slug].broken++;
      byShop[slug].items.push({ id: p.id, name: p.name, reason: `all images broken (${imgs.slice(0, 2).join(', ')})` });
    }

    if ((noImages.length + brokenImages.length + withPhotos.length) % 20 === 0) {
      process.stdout.write(`\r  Scanned ${noImages.length + brokenImages.length + withPhotos.length}/${allProducts.length}...`);
    }
  }
  console.log('\r  Done.                                  \n');

  const candidates = [...noImages, ...brokenImages];

  // 3. Report
  console.log('='.repeat(65));
  console.log('RESULTS');
  console.log('='.repeat(65));
  console.log(`Total products in DB:           ${allProducts.length}`);
  console.log(`With at least one valid photo:  ${withPhotos.length}`);
  console.log(`Without any images:             ${noImages.length}`);
  console.log(`With broken images only:        ${brokenImages.length}`);
  console.log(`Candidates to delete:           ${candidates.length}`);
  console.log('');

  console.log('By shop:');
  console.log('  Shop          Total  Valid  NoImg Broken');
  for (const [slug, c] of Object.entries(byShop).sort()) {
    console.log(`  ${slug.padEnd(14)} ${String(c.total).padStart(5)} ${String(c.ok).padStart(5)} ${String(c.noimg).padStart(5)} ${String(c.broken).padStart(6)}`);
  }

  if (candidates.length === 0) {
    console.log('\nAll products have valid photos. Nothing to delete.');
    await pool.end();
    process.exit(0);
  }

  // 4. Check references
  console.log('\n' + '='.repeat(65));
  console.log('REFERENCE CHECK');
  console.log('='.repeat(65));
  const deleteIds = new Set(candidates.map(p => p.id));
  const idList = candidates.map(p => p.id);
  const placeholders = idList.map((_, i) => '$' + (i + 1));

  const { rows: orderRefs } = await pool.query(
    `SELECT COUNT(*) as cnt FROM order_items WHERE product_id IN (${placeholders.join(',')})`, idList
  );
  const { rows: leadRefs } = await pool.query(
    `SELECT COUNT(*) as cnt FROM leads WHERE product_id IN (${placeholders.join(',')})`, idList
  );

  console.log(`order_items referencing candidates: ${orderRefs[0].cnt}`);
  console.log(`leads referencing candidates:        ${leadRefs[0].cnt}`);

  // 5. Detail list
  console.log('\n' + '='.repeat(65));
  console.log('CANDIDATES TO DELETE:');
  console.log('='.repeat(65));
  const grouped = {};
  for (const c of candidates) {
    const slug = c.shop_slug || 'unknown';
    if (!grouped[slug]) grouped[slug] = [];
    grouped[slug].push(c);
  }
  for (const [slug, items] of Object.entries(grouped).sort()) {
    console.log(`\n  ${slug} (${items.length} products):`);
    for (const item of items) {
      const reason = brokenImages.includes(item) ? 'BROKEN' : 'NO_IMG';
      const active = item.is_active ? 'active' : 'inactive';
      const raw = Array.isArray(item.images) ? JSON.stringify(item.images).substring(0, 60) : String(item.images || 'NULL').substring(0, 60);
      console.log(`    [${item.id.slice(0, 10)}] ${reason.padEnd(7)} ${active.padEnd(8)} ${item.name || 'unnamed'}`);
      console.log(`           images: ${raw}`);
    }
  }

  if (DRY) {
    console.log(`\nDRY RUN complete. Run with --apply to hard-delete ${candidates.length} products.`);
    await pool.end();
    process.exit(0);
  }

  // 6. APPLY MODE
  console.log('\n' + '='.repeat(65));
  console.log('APPLYING DELETION...');
  console.log('='.repeat(65));

  // 6a. Backup report
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `demo_catalog_2026/deleted_no_photo_products_${ts}.json`;
  const backupData = candidates.map(p => ({
    id: p.id,
    name: p.name,
    shop_slug: p.shop_slug,
    shop_name: p.shop_name,
    shop_id: p.shop_id,
    price: p.price,
    category: p.category,
    is_active: p.is_active,
    images: Array.isArray(p.images) ? p.images : (p.images || []),
    reason: noImages.includes(p) ? 'no images' : 'broken images',
  }));
  writeFileSync(backupPath, JSON.stringify(backupData, null, 2));
  console.log(`Backup saved: ${backupPath}`);

  // 6b. Delete from DB
  console.log(`\nDeleting ${candidates.length} products from DB...`);
  const delQ = `DELETE FROM products WHERE id IN (${placeholders.join(',')})`;
  const delResult = await pool.query(delQ, idList);
  console.log(`Deleted: ${delResult.rowCount} rows`);

  // 6c. Build SKU set for JSON update (from candidates that had SKUs + also products without images from catalog JSON)
  // Collect SKU set from catalog JSON by matching product names per shop
  const skuSet = new Set();
  // Load catalog to build SKU -> name map
  try {
    const catData = JSON.parse(readFileSync('demo_catalog_2026/generated_catalog_2026.json', 'utf-8'));
    const nameToSku = new Map(); // key: shopSlug||name
    for (const cp of catData.products) {
      const key = `${cp.shopSlug}||${cp.name}`;
      if (cp.sku) nameToSku.set(key, cp.sku);
    }
    for (const c of candidates) {
      const key = `${c.shop_slug}||${c.name}`;
      const sku = nameToSku.get(key);
      if (sku) skuSet.add(sku);
    }
  } catch {}

  const nameMap = new Map();
  for (const c of candidates) {
    const slug = c.shop_slug;
    if (!nameMap.has(slug)) nameMap.set(slug, new Set());
    nameMap.get(slug).add(c.name);
  }

  function filterJsonProducts(products) {
    return products.filter(p => {
      const sku = p.sku || p.slug || p.id;
      if (skuSet.has(sku)) return false;
      const shop = p.shopSlug;
      if (shop && nameMap.has(shop) && nameMap.get(shop).has(p.name)) return false;
      return true;
    });
  }

  // Update generated_catalog_2026.json
  const genPath = 'demo_catalog_2026/generated_catalog_2026.json';
  const genData = JSON.parse(readFileSync(genPath, 'utf-8'));
  const genBefore = genData.products.length;
  genData.products = filterJsonProducts(genData.products);
  const genAfter = genData.products.length;
  genData.total = genAfter;
  if (!DRY) {
    writeFileSync(genPath, JSON.stringify(genData, null, 2));
  }
  console.log(`  ${genPath}: ${genBefore} -> ${genAfter} (removed ${genBefore - genAfter})`);

  // Update shop JSON files
  const shopFiles = [
    'demo_catalog_2026/shops/technomarket_products.json',
    'demo_catalog_2026/shops/gamepower_products.json',
    'demo_catalog_2026/shops/smartspace_products.json',
  ];
  for (const fp of shopFiles) {
    try {
      const data = JSON.parse(readFileSync(fp, 'utf-8'));
      const before = data.length;
      const filtered = filterJsonProducts(data);
      const after = filtered.length;
      if (before !== after) {
        writeFileSync(fp, JSON.stringify(filtered, null, 2));
        console.log(`  ${fp}: ${before} -> ${after} (removed ${before - after})`);
      } else {
        console.log(`  ${fp}: no changes`);
      }
    } catch (e) {
      console.log(`  ${fp}: SKIP (${e.message})`);
    }
  }

  // 6e. Verify
  const { rows: remaining } = await pool.query('SELECT COUNT(*) as cnt FROM products');
  console.log(`\nProducts in DB after cleanup: ${remaining[0].cnt}`);

  await pool.end();
  console.log('\nDone.');
}

main().catch(e => { console.error(e.message || e); process.exit(1); });
