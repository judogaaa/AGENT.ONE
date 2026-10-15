// Cleanup extra shops via direct PostgreSQL
// Sets is_published=false for all shops except technomarket, gamepower, smartspace
// --apply to execute, without runs dry-run

import pg from 'pg';
import { writeFileSync } from 'fs';

const ALLOWED = new Set(['technomarket', 'gamepower', 'smartspace']);
const DRY = !process.argv.includes('--apply');
if (DRY) console.log('DRY RUN — add --apply to update DB\n');

const DB = process.env.DATABASE_URL || 'postgres://agentone:agentone@localhost:5432/agentone?sslmode=disable';
const pool = new pg.Pool({ connectionString: DB, max: 1 });

try {
  const { rows: shops } = await pool.query('SELECT id, slug, name, is_published, owner_id FROM shops ORDER BY slug');
  console.log(`Total shops: ${shops.length}`);
  shops.forEach(s => console.log(`  ${s.slug} — ${s.name} [${ALLOWED.has(s.slug) ? 'ALLOWED' : 'EXTRA'}] published=${s.is_published}`));

  const extra = shops.filter(s => !ALLOWED.has(s.slug));
  if (extra.length === 0) { console.log('\nNo extra shops.'); process.exit(0); }

  const report = [];
  let deactivated = 0, productCount = 0;

  for (const s of extra) {
    // Count products
    const { rows: prods } = await pool.query('SELECT COUNT(*) as cnt FROM products WHERE shop_id=$1', [s.id]);
    const cnt = parseInt(prods[0].cnt) || 0;
    productCount += cnt;

    if (!DRY) {
      await pool.query('UPDATE shops SET is_published=false WHERE id=$1', [s.id]);
      await pool.query('UPDATE products SET is_active=false WHERE shop_id=$1', [s.id]);
      console.log(`  DEACTIVATED: ${s.slug} (${cnt} products)`);
    } else {
      console.log(`  WOULD deactivate: ${s.slug} (${cnt} products)`);
    }
    deactivated++;
    report.push({ shopId: s.id, shopSlug: s.slug, shopName: s.name, decision: 'Deactivated (is_published=false)', productsAffected: cnt, reason: 'Not in allowed shop list' });
  }

  // Write reports
  const csv = 'shopId,shopSlug,shopName,decision,productsAffected,reason\n' +
    report.map(r => `${r.shopId},${r.shopSlug},${r.shopName},${r.decision},${r.productsAffected},${r.reason}`).join('\n');
  writeFileSync('demo_catalog_2026/allowed_shops_cleanup_report_2026.csv', csv);
  writeFileSync('demo_catalog_2026/allowed_shops_cleanup_summary_2026.json', JSON.stringify({
    allowedShops: [...ALLOWED], totalShopsBefore: shops.length, totalAllowed: shops.length - extra.length,
    totalExtra: extra.length, shopsDeactivated: deactivated, productsDeactivated: productCount,
    dryRun: DRY, appliedAt: new Date().toISOString(),
  }, null, 2));

  console.log(`\nExtra shops: ${extra.length}, Products affected: ${productCount}`);
  console.log('Reports: allowed_shops_cleanup_report_2026.csv, allowed_shops_cleanup_summary_2026.json');
  if (DRY) console.log('DRY RUN — re-run with --apply');
} finally {
  await pool.end();
}
