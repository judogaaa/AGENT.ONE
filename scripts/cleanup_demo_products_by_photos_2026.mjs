// Cleanup demo products based on actual photo files
// Supports: --dry-run, --apply, --shop <slug>
import pg from 'pg';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const ALLOWED = ['technomarket', 'gamepower', 'smartspace'];
const DRY = !process.argv.includes('--apply');
if (DRY) console.log('DRY RUN — add --apply to update DB & JSON\n');

const shopFilter = process.argv.includes('--shop') ? process.argv[process.argv.indexOf('--shop') + 1] : null;
if (shopFilter && !ALLOWED.includes(shopFilter)) { console.error(`Unknown shop: ${shopFilter}`); process.exit(1); }

const DB = process.env.DATABASE_URL || 'postgres://agentone:agentone@localhost:5432/agentone?sslmode=disable';
const pool = new pg.Pool({ connectionString: DB, max: 1 });

// ── Read catalog ──
const catalog = JSON.parse(readFileSync('demo_catalog_2026/generated_catalog_2026.json', 'utf-8'));
const products = catalog.products.filter(p => ALLOWED.includes(p.shopSlug) && (!shopFilter || p.shopSlug === shopFilter));
console.log(`Products in catalog: ${products.length}`);

// ── For each product, check photos ──
const report = [];
let totalActive = 0, totalDeactivated = 0, totalTrimmed = 0, totalNotFound = 0;
const byShop = {};

for (const p of products) {
  const shop = p.shopSlug;
  if (!byShop[shop]) byShop[shop] = { checked: 0, activeAfter: 0, deactivated: 0, trimmed: 0, notFoundInDb: 0 };
  byShop[shop].checked++;

  // Determine SKU from product
  const sku = p.sku || p.slug || '';
  const valid = [];
  const checks = { public1: false, public2: false, public3: false, dist1: false, dist2: false, dist3: false };

  for (let i = 1; i <= 3; i++) {
    const imgPath = `/demo-products/${shop}/${sku}-${i}.jpg`;
    const publicF = 'client/public' + imgPath;
    const distF = 'client/dist' + imgPath;
    const pubExists = existsSync(publicF);
    const distExists = existsSync(distF);
    checks['public' + i] = pubExists;
    checks['dist' + i] = distExists;
    if (pubExists && distExists) valid.push(imgPath);
  }

  const prevLen = (p.images || []).length;
  let decision = '';

  if (valid.length === 0) {
    decision = 'deactivated';
    if (!DRY) {
      p.isActive = false;
      p.images = [];
      if (sku) {
        const { rows } = await pool.query('SELECT id FROM products WHERE shop_id IN (SELECT id FROM shops WHERE slug=$1) AND name=$2', [shop, p.name]);
        if (rows.length > 0) {
          await pool.query("UPDATE products SET is_active=false, images='{}' WHERE id=$1", [rows[0].id]);
        } else {
          byShop[shop].notFoundInDb++;
          totalNotFound++;
        }
      }
    }
    totalDeactivated++;
    byShop[shop].deactivated++;
  } else if (valid.length !== prevLen) {
    decision = 'trimmed';
    if (!DRY) {
      p.images = valid;
      p.isActive = true;
      if (sku) {
        const { rows } = await pool.query('SELECT id FROM products WHERE shop_id IN (SELECT id FROM shops WHERE slug=$1) AND name=$2', [shop, p.name]);
        if (rows.length > 0) {
          // Format as PostgreSQL text array: {url1,url2,url3}
          const pgArray = '{' + valid.map(u => '"' + u.replace(/"/g,'\\"') + '"').join(',') + '}';
          await pool.query("UPDATE products SET is_active=true, images=$1::text[] WHERE id=$2", [pgArray, rows[0].id]);
        } else {
          byShop[shop].notFoundInDb++;
          totalNotFound++;
        }
      }
    }
    totalTrimmed++;
    byShop[shop].trimmed++;
    totalActive++;
    byShop[shop].activeAfter++;
  } else {
    decision = 'unchanged';
    if (!DRY) p.isActive = true;
    totalActive++;
    byShop[shop].activeAfter++;
  }

  const dbMatched = decision !== 'deactivated' || !DRY;

  report.push({
    shopSlug: shop, sku, name: p.name, validPhotoCount: valid.length, decision,
    imagesBefore: prevLen, imagesAfter: valid.length,
    public1: checks.public1, public2: checks.public2, public3: checks.public3,
    dist1: checks.dist1, dist2: checks.dist2, dist3: checks.dist3,
    dbMatched, reason: decision === 'deactivated' ? 'No valid photos' : (decision === 'trimmed' ? 'Some photos missing' : ''),
  });

  if (!DRY && (totalDeactivated + totalTrimmed) % 10 === 0) console.log(`  ${totalDeactivated + totalTrimmed}/${products.length}...`);
}

// ── Write back JSON ──
if (!DRY) {
  catalog.products = catalog.products.map(p => {
    const updated = products.find(x => x.sku === p.sku || x.name === p.name);
    return updated || p;
  });
  catalog.total = catalog.products.filter(p => p.isActive !== false).length;
  writeFileSync('demo_catalog_2026/generated_catalog_2026.json', JSON.stringify(catalog, null, 2));

  // Update per-shop files
  for (const shop of ALLOWED) {
    const shopProds = catalog.products.filter(p => p.shopSlug === shop);
    writeFileSync(`demo_catalog_2026/shops/${shop}_products.json`, JSON.stringify(shopProds, null, 2));
  }
}

// ── Reports ──
const csv = 'shopSlug,sku,name,validPhotoCount,decision,imagesBefore,imagesAfter,public1,public2,public3,dist1,dist2,dist3,dbMatched,reason\n' +
  report.map(r => [r.shopSlug, r.sku, r.name, r.validPhotoCount, r.decision, r.imagesBefore, r.imagesAfter, r.public1, r.public2, r.public3, r.dist1, r.dist2, r.dist3, r.dbMatched, r.reason].join(',')).join('\n');
writeFileSync('demo_catalog_2026/cleanup_products_by_photos_report_2026.csv', csv);

const summary = { dryRun: DRY, appliedAt: new Date().toISOString(), totalChecked: products.length, totalActiveAfter: totalActive, totalDeactivated, totalTrimmed, totalNotFoundInDb: totalNotFound, byShop };
writeFileSync('demo_catalog_2026/cleanup_products_by_photos_summary_2026.json', JSON.stringify(summary, null, 2));

console.log(`\nActive after: ${totalActive}`);
console.log(`Deactivated: ${totalDeactivated}`);
console.log(`Trimmed: ${totalTrimmed}`);
console.log(`Not found in DB: ${totalNotFound}`);
for (const [shop, s] of Object.entries(byShop)) {
  console.log(`  ${shop}: ${s.activeAfter} active, ${s.deactivated} deactivated, ${s.trimmed} trimmed, ${s.notFoundInDb} not found`);
}
console.log(`\nReports: cleanup_products_by_photos_report_2026.csv, cleanup_products_by_photos_summary_2026.json`);
if (DRY) console.log('DRY RUN — re-run with --apply');

await pool.end();
