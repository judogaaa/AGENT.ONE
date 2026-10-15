import { readFileSync, existsSync, statSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { join, basename } from 'path';

const CSV = 'demo_catalog_2026/photo_tasks_2026.csv';
const csv = readFileSync(CSV, 'utf-8');
const lines = csv.trim().split('\n').slice(1);

let requiredTotal = 0, requiredExist = 0, requiredMissing = 0, optionalExist = 0;
const shopCounts = {};
const missing = [], existing = [];
const unknown = [];
const validSkus = new Set();

for (const line of lines) {
  const cols = line.split(',');
  if (cols.length < 10) continue;
  validSkus.add(cols[1]);
  const shop = cols[0], sku = cols[1], name = cols[2], brand = cols[3], pt = cols[5];
  if (!shopCounts[shop]) shopCounts[shop] = { required: 0, exist: 0, missing: 0 };
  shopCounts[shop].required += 3;

  for (let c = 6; c <= 9; c++) {
    const path = cols[c]; if (!path) continue;
    const isRequired = c <= 8;
    if (isRequired) requiredTotal++;

    const exists = existsSync(path) && statSync(path).size > 0;
    if (exists) {
      if (isRequired) { requiredExist++; shopCounts[shop].exist++; }
      else optionalExist++;
      existing.push({ shopSlug: shop, sku, name, brand, productType: pt, photo: ['photo1','photo2','photo3','photo4'][c-6], path });
    } else if (isRequired) {
      requiredMissing++; shopCounts[shop].missing++;
      missing.push({ shopSlug: shop, sku, name, brand, productType: pt, missingPhoto: ['photo1','photo2','photo3','photo4'][c-6], path });
    }
  }
}

// Scan for unknown files
function scanDir(dir, depth) {
  if (depth > 3) return;
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) { scanDir(full, depth+1); continue; }
      const bn = basename(full);
      // Skip known files and hidden
      if (bn.startsWith('.') || bn === 'photo_tasks_2026.csv') continue;
      // Check if matches expected SKU pattern
      const match = bn.match(/^(.+)-(\d)\.(.+)$/);
      if (!match) { unknown.push({ path: full, reason: 'Bad filename format' }); continue; }
      const [_, sku, num, ext] = match;
      if (!validSkus.has(sku)) { unknown.push({ path: full, reason: `Unknown SKU: ${sku}` }); continue; }
      if (ext !== 'jpg' && ext !== 'jpeg') { unknown.push({ path: full, reason: `Unsupported extension: .${ext}` }); continue; }
    }
  } catch(e) { /* ignore missing dirs */ }
}
scanDir('client/public/demo-products', 0);
scanDir('demo_photo_inbox', 0);

// Write reports
writeFileSync('demo_catalog_2026/photo_missing_2026.csv', 'shopSlug,sku,name,brand,productType,missingPhoto,path\n' + missing.map(r => [r.shopSlug,r.sku,r.name,r.brand,r.productType,r.missingPhoto,r.path].join(',')).join('\n'));
writeFileSync('demo_catalog_2026/photo_existing_2026.csv', 'shopSlug,sku,name,brand,productType,photo,path\n' + existing.map(r => [r.shopSlug,r.sku,r.name,r.brand,r.productType,r.photo,r.path].join(',')).join('\n'));
writeFileSync('demo_catalog_2026/photo_unknown_2026.csv', 'path,reason\n' + unknown.map(r => `${r.path},${r.reason}`).join('\n'));

// Report
console.log(`Total products: ${lines.length}`);
console.log(`Required photos expected: ${requiredTotal}`);
console.log(`Required photos existing: ${requiredExist}`);
console.log(`Required photos missing: ${requiredMissing}`);
console.log(`Optional photos existing: ${optionalExist}`);
console.log('');

for (const [shop, c] of Object.entries(shopCounts)) {
  console.log(`${shop}: ${c.exist}/${c.required} required photos`);
}

console.log(`\nReports:`);
console.log(`  photo_missing_2026.csv (${missing.length} rows)`);
console.log(`  photo_existing_2026.csv (${existing.length} rows)`);
console.log(`  photo_unknown_2026.csv (${unknown.length} rows)`);
if (requiredMissing === 0) console.log('\nAll required photos present!');
else console.log(`\n${requiredMissing} photos missing.`);
