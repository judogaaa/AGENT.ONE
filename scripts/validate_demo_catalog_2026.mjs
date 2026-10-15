import { readFileSync } from 'fs';
const data = JSON.parse(readFileSync('demo_catalog_2026/generated_catalog_2026.json', 'utf-8'));
const prods = data.products;
let err = 0;

const ALLOWED_CATEGORIES = ['electronics','auto','real_estate','repair','webdev','beauty','education','fashion','home','other'];

// 1. Product counts
const tn = prods.filter(p => p.shopSlug === 'technomarket');
const gp = prods.filter(p => p.shopSlug === 'gamepower');
const ss = prods.filter(p => p.shopSlug === 'smartspace');

console.log(`Products: ${prods.length} (expect 150)`);
if (prods.length !== 150) { err++; console.error(`FAIL: expected 150, got ${prods.length}`); }
for (const [label, shop, exp] of [['technomarket', tn, 50], ['gamepower', gp, 50], ['smartspace', ss, 50]]) {
  if (shop.length !== exp) { err++; console.error(`FAIL: ${label} has ${shop.length} (expect ${exp})`); }
}

// 2. Apple-only technomarket
const nonApple = tn.filter(p => p.brand !== 'Apple');
if (nonApple.length > 0) { err++; console.error(`FAIL: technomarket has ${nonApple.length} non-Apple: ${nonApple.map(p=>p.name).join(',')}`); }
for (const [label, shop] of [['gamepower', gp], ['smartspace', ss]]) {
  const apples = shop.filter(p => p.brand === 'Apple');
  if (apples.length > 0) { err++; console.error(`FAIL: ${label} has ${apples.length} Apple products`); }
}

// 3. SKU duplicates
const skus = new Set();
prods.forEach(p => { if (skus.has(p.sku)) { err++; console.error(`FAIL: duplicate SKU ${p.sku}`); } skus.add(p.sku); });

// 4. Field checks + image path check
prods.forEach(p => {
  if (!p.name) { err++; console.error(`FAIL: empty name (${p.sku})`); }
  if (!p.brand) { err++; console.error(`FAIL: empty brand (${p.sku})`); }
  if (!p.productType) { err++; console.error(`FAIL: empty productType (${p.sku})`); }
  if (!p.price || p.price <= 0) { err++; console.error(`FAIL: invalid price (${p.sku})`); }
  if (!ALLOWED_CATEGORIES.includes(p.category)) { err++; console.error(`FAIL: invalid category "${p.category}" (${p.sku})`); }
  if (!p.shopSlug) { err++; console.error(`FAIL: empty shopSlug (${p.sku})`); }
  if (!p.images || p.images.length !== 3) { err++; console.error(`FAIL: need exactly 3 images (${p.sku})`); }
  for (const img of (p.images || [])) {
    if (!img.startsWith(`/demo-products/${p.shopSlug}/`)) { err++; console.error(`FAIL: bad image path (${p.sku}): ${img}`); }
  }
});

// 5. CSV validation
const csvPath = 'demo_catalog_2026/photo_tasks_2026.csv';
let csvOk = false;
try {
  const csv = readFileSync(csvPath, 'utf-8');
  const lines = csv.trim().split('\n');
  console.log(`CSV lines: ${lines.length} (expect 151)`);

  const expectedHeader = 'shopSlug,sku,name,brand,category,productType,photo1_local,photo2_local,photo3_local,photo4_optional_local';
  if (lines[0] !== expectedHeader) { err++; console.error(`FAIL: CSV header mismatch`); }
  if (lines.length !== 151) { err++; console.error(`FAIL: CSV has ${lines.length} lines, expect 151`); }

  const csvSkus = new Set();
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols.length !== 10) { err++; console.error(`FAIL: CSV row ${i+1} has ${cols.length} cols, expect 10`); continue; }
    csvSkus.add(cols[1]);
    const shop = cols[0];
    for (let c = 6; c <= 9; c++) {
      if (!cols[c] || !cols[c].startsWith(`client/public/demo-products/${shop}/`)) {
        err++; console.error(`FAIL: CSV row ${i+1} col ${c} bad path: ${cols[c]}`);
      }
    }
  }

  // Check all products have CSV entry
  for (const p of prods) {
    if (!csvSkus.has(p.sku)) { err++; console.error(`FAIL: SKU ${p.sku} missing from CSV`); }
  }

  // Check photo paths match
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const sku = cols[1];
    const prod = prods.find(p => p.sku === sku);
    if (!prod) continue;
    for (let c = 6, imgIdx = 0; c <= 8; c++, imgIdx++) {
      const expected = `client/public${prod.images[imgIdx]}`;
      if (cols[c] !== expected) { err++; console.error(`FAIL: CSV photo${imgIdx+1} mismatch for ${sku}: "${cols[c]}" vs "${expected}"`); }
    }
  }
  csvOk = true;
} catch (e) { err++; console.error(`FAIL: CSV read error: ${e.message}`); }

if (err === 0) { console.log('All checks passed'); process.exit(0); }
else { console.error(`\n${err} error(s) found`); process.exit(1); }
