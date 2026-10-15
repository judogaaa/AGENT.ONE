// Convert non-JPEG images to true JPEG in demo photo pipeline
// Requires: npm install -D sharp
// Supports: --dry-run (default), --apply, --shop <slug>

import sharp from 'sharp';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

const ALLOWED = ['technomarket', 'gamepower', 'smartspace'];
const DIRS = ['demo_photo_inbox', 'client/public/demo-products', 'client/dist/demo-products'];
const DRY = !process.argv.includes('--apply');
if (DRY) console.log('DRY RUN — add --apply to convert\n');

const shopFilter = process.argv.includes('--shop') ? process.argv[process.argv.indexOf('--shop') + 1] : null;

const report = [];
const summary = { filesChecked: 0, alreadyJpeg: 0, converted: 0, unsupported: 0, failed: 0, byShop: {} };
for (const s of ALLOWED) summary.byShop[s] = { checked: 0, already: 0, converted: 0, failed: 0 };

function detectFormat(buf) {
  if (buf.length < 4) return 'too_small';
  const b = buf;
  if (b[0] === 255 && b[1] === 216 && b[2] === 255) return 'jpeg';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46) return 'riff'; // RIFF = WebP
  if (b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71) return 'png';
  // ftyp = AVIF/HEIF
  if (b.length >= 12) {
    const s = String.fromCharCode(b[4], b[5], b[6], b[7]);
    if (s === 'ftyp') return 'ftyp';
  }
  if (b[0] === 0x00 && b.length >= 12) {
    const s = String.fromCharCode(b[4], b[5], b[6], b[7]);
    if (s === 'ftyp') return 'ftyp';
  }
  return 'unknown';
}

for (const dir of DIRS) {
  for (const shop of ALLOWED) {
    if (shopFilter && shop !== shopFilter) continue;
    const shopDir = join(dir, shop);
    if (!existsSync(shopDir)) continue;
    const files = readdirSync(shopDir).filter(f => {
      const e = extname(f).toLowerCase();
      return e === '.jpg' || e === '.jpeg';
    });

    for (const file of files) {
      const fullPath = join(shopDir, file);
      if (!existsSync(fullPath)) continue;
      const buf = readFileSync(fullPath);
      const format = detectFormat(buf);
      summary.filesChecked++;
      if (!summary.byShop[shop]) summary.byShop[shop] = { checked: 0, already: 0, converted: 0, failed: 0 };
      summary.byShop[shop].checked++;

      let decision = '', converted = false, error = '';

      if (format === 'jpeg') {
        decision = 'already_jpeg';
        summary.alreadyJpeg++;
        summary.byShop[shop].already++;
      } else if (format === 'png' || format === 'riff' || format === 'ftyp') {
        decision = 'convert';
        if (!DRY) {
          try {
            const jpegBuf = await sharp(buf).flatten({ background: '#ffffff' }).jpeg({ quality: 90 }).toBuffer();
            writeFileSync(fullPath, jpegBuf);
            converted = true;
          } catch (e) { error = e.message; decision = 'failed'; }
        }
        if (converted) { summary.converted++; summary.byShop[shop].converted++; }
        else if (!DRY) { summary.failed++; summary.byShop[shop].failed++; }
      } else {
        decision = 'unsupported_' + format;
        summary.unsupported++;
      }

      if (decision !== 'already_jpeg' || format !== 'jpeg') {
        console.log(`  ${decision}: ${shop}/${file} (${format})${converted ? ' → JPG' : ''}`);
      }
      report.push({
        path: fullPath, shopSlug: shop, fileName: file,
        beforeMagicBytes: Array.from(buf.slice(0, 6)).map(b => b.toString(10)).join(' '),
        detectedFormat: format, decision, converted,
      });
    }
  }
}

// Reports
const csv = 'path,shopSlug,fileName,beforeMagicBytes,detectedFormat,decision,converted\n' +
  report.map(r => [r.path, r.shopSlug, r.fileName, r.beforeMagicBytes, r.detectedFormat, r.decision, r.converted].join(',')).join('\n');
writeFileSync('demo_catalog_2026/convert_demo_images_to_jpg_report_2026.csv', csv);
writeFileSync('demo_catalog_2026/convert_demo_images_to_jpg_summary_2026.json', JSON.stringify({ ...summary, dryRun: DRY, appliedAt: new Date().toISOString() }, null, 2));

console.log(`\nFiles checked: ${summary.filesChecked}`);
console.log(`Already JPEG: ${summary.alreadyJpeg}`);
console.log(`Converted: ${summary.converted}`);
console.log(`Unsupported: ${summary.unsupported}`);
console.log(`Failed: ${summary.failed}`);
for (const [shop, s] of Object.entries(summary.byShop)) {
  if (s.checked > 0) console.log(`  ${shop}: ${s.checked} checked, ${s.already} JPEG, ${s.converted} converted, ${s.failed} failed`);
}
if (DRY) console.log('\nDRY RUN — re-run with --apply');
