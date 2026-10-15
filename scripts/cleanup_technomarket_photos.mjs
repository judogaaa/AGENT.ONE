// Cleanup technomarket photos — apply directly to DB via API
// --apply to actually update DB, without runs dry-run

import http from 'node:http';
import { existsSync } from 'fs';

const BASE = 'http://localhost:8080';
const DRY = !process.argv.includes('--apply');
if (DRY) console.log('DRY RUN — add --apply to update DB\n');

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    const r = http.request(BASE + path, { method, headers }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, body: d }); }
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}
function ok(r) { return r.body?.ok === true; }

async function main() {
  // Sign in as business
  const signin = await req('POST', '/api/auth/signin', { email: 'demo@agentone.ru', password: 'demo123' });
  if (!ok(signin)) { console.error('Signin failed'); process.exit(1); }
  const token = signin.body.data.token;

  // Get shop products
  const shop = await req('GET', '/api/shop/technomarket');
  if (!ok(shop)) { console.error('Shop load failed'); process.exit(1); }
  const products = shop.body.data.products || [];
  console.log(`Technomarket products in DB: ${products.length}`);

  let deactivated = 0, trimmed = 0, okCount = 0;

  for (const p of products) {
    // Build sku from images or name
    const imgs = normalizeImages(p.images);
    const valid = imgs.filter(img => {
      const fp = 'client/public' + img;
      return existsSync(fp);
    });

    if (valid.length === 0) {
      console.log(`  Deactivate: ${p.name} (sku ${p.id?.slice(0,8)}, 0 valid photos)`);
      if (!DRY) {
        const r = await req('PUT', '/api/products/' + p.id, { isActive: false }, token);
        if (ok(r)) deactivated++;
        else console.error(`    Failed: ${r.body?.error || r.status}`);
      } else {
        deactivated++;
      }
    } else if (valid.length !== imgs.length) {
      console.log(`  Trim: ${p.name} (${valid.length}/${imgs.length} photos)`);
      if (!DRY) {
        const r = await req('PUT', '/api/products/' + p.id, { images: valid, isActive: true }, token);
        if (ok(r)) trimmed++;
        else console.error(`    Failed: ${r.body?.error || r.status}`);
      } else {
        trimmed++;
      }
    } else {
      okCount++;
    }
  }

  console.log(`\nResult: ${deactivated} deactivated, ${trimmed} trimmed, ${okCount} unchanged`);
  if (DRY) console.log('DRY RUN — re-run with --apply to apply changes');
}

function normalizeImages(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean).map(v => String(v).trim());
  if (typeof value === 'string') {
    const t = value.trim();
    if (!t) return [];
    if (t.startsWith('[')) { try { return normalizeImages(JSON.parse(t)); } catch {} }
    return t.split(/[\s\n]+/).map(s => s.trim()).filter(Boolean);
  }
  return [];
}

main().catch(e => { console.error(e.message); process.exit(1); });
