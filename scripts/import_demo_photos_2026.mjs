import { readFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join, basename, dirname } from 'path';

const OVERWRITE = process.argv.includes('--overwrite');
const CSV = 'demo_catalog_2026/photo_tasks_2026.csv';
const INBOX = 'demo_photo_inbox';
const DEST = 'client/public/demo-products';

if (!existsSync(CSV)) { console.error(`CSV not found: ${CSV}`); process.exit(1); }
if (!existsSync(INBOX)) { console.error(`Inbox not found: ${INBOX}`); process.exit(1); }

const csv = readFileSync(CSV, 'utf-8');
const lines = csv.trim().split('\n').slice(1); // skip header

// Build expected mapping: shopSlug -> sku -> [photo paths]
const expected = new Map();
for (const line of lines) {
  const cols = line.split(',');
  if (cols.length < 10) continue;
  const shop = cols[0], sku = cols[1];
  if (!expected.has(shop)) expected.set(shop, new Map());
  expected.get(shop).set(sku, { photo1: cols[6], photo2: cols[7], photo3: cols[8], photo4: cols[9] });
}

// Scan inbox files
function scanDir(dir) {
  const files = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) { files.push(...scanDir(full)); }
    else if (e.isFile()) files.push(full);
  }
  return files;
}

const inboxFiles = scanDir(INBOX);
console.log(`Inbox files found: ${inboxFiles.length}`);

let copied = 0, skipped = 0, missing = 0, unsupported = 0, unknown = 0;

for (const [shop, skuMap] of expected) {
  for (const [sku, paths] of skuMap) {
    for (const key of ['photo1', 'photo2', 'photo3', 'photo4']) {
      const destPath = paths[key];
      if (!destPath) continue;
      const destFile = join(DEST, destPath.replace('client/public/demo-products/', ''));
      const dDir = dirname(destFile);
      if (!existsSync(dDir)) mkdirSync(dDir, { recursive: true });

      // Skip if exists and not overwriting
      if (existsSync(destFile) && !OVERWRITE) { skipped++; continue; }

      // Look for matching inbox file
      const num = key === 'photo4' ? '4' : key.replace('photo', '');
      const expectedName = `${sku}-${num}.jpg`;
      let found = null;

      // Check both inbox layouts
      const candidates = [
        join(INBOX, shop, expectedName),    // inbox/shop/sku-N.jpg
        join(INBOX, expectedName),           // inbox/sku-N.jpg
      ];

      for (const c of candidates) {
        if (existsSync(c)) { found = c; break; }
      }

      // Also scan all inbox files for name match (handles subdirs)
      if (!found) {
        found = inboxFiles.find(f => basename(f) === expectedName);
      }

      // Try .jpeg fallback
      if (!found) {
        const jpegName = expectedName.replace('.jpg', '.jpeg');
        for (const c of [join(INBOX, shop, jpegName), join(INBOX, jpegName)]) {
          if (existsSync(c)) { found = c; console.warn(`Warning: .jpeg source -> .jpg: ${c}`); break; }
        }
        if (!found) {
          found = inboxFiles.find(f => basename(f) === jpegName);
          if (found) console.warn(`Warning: .jpeg source -> .jpg: ${found}`);
        }
      }

      // Check for unsupported extensions matching this SKU
      if (!found) {
        for (const f of inboxFiles) {
          const bn = basename(f);
          if (bn.startsWith(sku + '-') && (bn.endsWith('.png') || bn.endsWith('.webp'))) {
            unsupported++; console.warn(`Unsupported: ${f} (convert to .jpg)`);
          }
        }
      }

      if (found) {
        copyFileSync(found, destFile);
        copied++;
      } else {
        missing++;
      }
    }
  }
}

// Report unknown inbox files
for (const f of inboxFiles) {
  const bn = basename(f);
  const match = bn.match(/^(.+)-(\d)\.(jpg|jpeg|png|webp)$/);
  if (!match) { unknown++; console.warn(`Unknown file: ${f}`); }
}

console.log(`\n--- Import Report ---`);
console.log(`Copied: ${copied}`);
console.log(`Skipped/Exists: ${skipped}`);
console.log(`Missing: ${missing}`);
console.log(`Unsupported: ${unsupported}`);
console.log(`Unknown files: ${unknown}`);
console.log('Done.');
