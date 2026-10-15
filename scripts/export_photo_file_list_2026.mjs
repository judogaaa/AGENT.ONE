import { readFileSync, writeFileSync } from 'fs';

const CSV = 'demo_catalog_2026/photo_tasks_2026.csv';
const csv = readFileSync(CSV, 'utf-8');
const lines = csv.trim().split('\n').slice(1);

// Plain text list
const fileList = [];
const byShop = {};

for (const line of lines) {
  const cols = line.split(',');
  if (cols.length < 10) continue;
  const shop = cols[0], sku = cols[1], name = cols[2];
  if (!byShop[shop]) byShop[shop] = [];

  const photos = [];
  for (let c = 6; c <= 9; c++) {
    if (cols[c]) { fileList.push(cols[c]); photos.push(cols[c]); }
  }
  byShop[shop].push({ sku, name, photos });
}

writeFileSync('demo_catalog_2026/photo_file_list_2026.txt', fileList.join('\n'));
console.log(`photo_file_list_2026.txt: ${fileList.length} files`);

// Markdown by shop
let md = '# Photo File List by Shop\n\n';
for (const [shop, items] of Object.entries(byShop)) {
  md += `## ${shop} (${items.length} products)\n\n`;
  for (const item of items) {
    md += `### ${item.sku} — ${item.name}\n`;
    item.photos.forEach(p => { md += `- ${p}\n`; });
    md += '\n';
  }
}
writeFileSync('demo_catalog_2026/photo_file_list_by_shop_2026.md', md);
console.log(`photo_file_list_by_shop_2026.md created`);
console.log('Done.');
