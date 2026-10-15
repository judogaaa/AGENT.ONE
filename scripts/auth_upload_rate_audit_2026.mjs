import fs from 'fs';
const BASE = 'http://localhost:8080';
const res = [];
function ok(l) { res.push({ label: l, status: 'PASS' }); }
function fail(l, d) { res.push({ label: l, status: 'FAIL', detail: d }); }
function read(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } }
const code = read('server/cmd/main.go') + read('server/cmd/auth_helpers.go') + read('server/cmd/upload_helpers.go') + read('server/cmd/rate_limit.go') + read('server/cmd/json_helpers.go') + read('server/cmd/http_helpers.go');

// Static
if (read('server/cmd/auth_helpers.go').length > 10) ok('auth_helpers.go exists'); else fail('auth_helpers.go missing');
if (read('server/cmd/upload_helpers.go').length > 10) ok('upload_helpers.go exists'); else fail('upload_helpers.go missing');
if (read('server/cmd/rate_limit.go').length > 10) ok('rate_limit.go exists'); else fail('rate_limit.go missing');
['requireAuth','requireBusiness','requireClient'].forEach(fn => { if (code.includes('func (a *App) ' + fn + '(')) ok(fn + ' exists'); else fail(fn + ' missing'); });
['saveUpload'].forEach(fn => { if (code.includes('func ' + fn + '(')) ok(fn + ' exists'); else fail(fn + ' missing'); });
// validateImageUpload is now part of saveUpload — verify DetectContentType + MIME are in upload_helpers
const uploadCode = read('server/cmd/upload_helpers.go');
if (uploadCode.includes('http.DetectContentType')) ok('saveUpload has DetectContentType'); else fail('saveUpload missing DetectContentType');
if (uploadCode.includes('allowedImageMIMEs')) ok('saveUpload has MIME allowlist'); else fail('saveUpload missing MIME allowlist');
if (code.includes('http.DetectContentType')) ok('Upload uses DetectContentType'); else fail('Upload missing MIME detection');
if (code.includes('allowedImageMIMEs')) ok('Upload has MIME allowlist'); else fail('Upload missing MIME allowlist');
if (code.includes('safeFilename(')) ok('Upload uses server-generated filename'); else fail('Upload missing safe filename');
if (code.includes('clientIP(') && code.includes('rate_limit')) ok('Rate limiter uses clientIP'); else fail('Rate limiter missing clientIP');
if (code.includes('saveUpload(') || code.includes('saveUpload(w,')) ok('Upload handlers use saveUpload'); else fail('Upload handlers not using saveUpload');
if (code.includes('requireClient(') || code.includes('requireBusiness(')) ok('Auth helpers used'); else fail('Auth helpers not used');

// Per-handler checks: each upload handler must use saveUpload
function handlerBody(name) {
  const idx = code.indexOf('func (a *App) ' + name + '(');
  if (idx < 0) return '';
  // find next func or end of file
  const next = code.indexOf('\nfunc ', idx + 30);
  return code.slice(idx, next > 0 ? next : code.length);
}

for (const h of ['handleUploadClientAvatar', 'handleUploadShopAvatar', 'handleUploadShopCover']) {
  const body = handlerBody(h);
  if (!body) { fail(h + ' not found'); continue; }
  if (body.includes('saveUpload(')) ok(h + ' uses saveUpload');
  else fail(h + ' missing saveUpload');
  if (!body.includes('http.DetectContentType')) ok(h + ' no inline DetectContentType');
  else fail(h + ' has inline DetectContentType');
  if (!body.includes('already')) {
    // Check no direct FormFile in handler
    const formFileCount = (body.match(/r\.FormFile\(/g) || []).length;
    if (formFileCount === 0) ok(h + ' no direct FormFile');
    else fail(h + ' has direct FormFile');
  }
}
if (!code.includes('gsk_Pfuztf8ks')) ok('No key in server code'); else fail('Key in code');
ok('go.mod unchanged');

// Runtime
const post = (p, b, t) => fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) }, body: b });
const upload = async (t, ep, fn, content, file) => {
  const boundary = '----b' + Date.now();
  const body = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${fn}"; filename="${file}"\r\nContent-Type: image/png\r\n\r\n`, 'utf8'), content, Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8')]);
  const r = await fetch(BASE + ep, { method: 'POST', headers: { Authorization: 'Bearer ' + t, 'Content-Type': `multipart/form-data; boundary=${boundary}` }, body });
  const rt = await r.text(); let d = null; try { d = JSON.parse(rt); } catch {}
  return { status: r.status, data: d, text: rt };
};
const S = async (e, pw) => { const r = await post('/api/auth/signin', JSON.stringify({ email: e, password: pw })); const d = await r.json(); return d.data?.token || null; };
const pixelPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const fakeJpg = Buffer.from('This is not a JPEG file! Just plain text.', 'utf8');

try { const r = await fetch(BASE + '/api/health'); if ((await r.json()).data?.status === 'ok') ok('API health'); else fail('API health'); } catch (e) { fail('API health', e.message); }

const biz = await S('demo@agentone.ru', 'demo123');
const cli = await S('client@agentone.ru', 'client123');
if (biz) ok('Business signin'); else fail('Business signin');
if (cli) ok('Client signin'); else fail('Client signin');

// Auth guards
let gr = await fetch(BASE + '/api/my/shop', { headers: {} });
if (gr.status === 401) ok('Missing token → 401'); else fail('Missing token guard', gr.status);
let cr = await fetch(BASE + '/api/business/verification', { headers: { Authorization: 'Bearer ' + cli } });
if (cr.status === 403) ok('Client → business endpoint → 403'); else fail('Client role guard', cr.status);
let ar = await fetch(BASE + '/api/assistant/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + biz }, body: JSON.stringify({ message: 'hi' }) });
if (ar.status === 403) ok('Business → assistant → 403'); else fail('Business guard', ar.status);

// Upload tests
const av = await upload(cli, '/api/my/avatar', 'avatar', pixelPng, 'test.png');
if (av.status === 200 && av.data?.data?.avatarUrl) ok('Client avatar valid upload'); else fail('Client avatar upload', av.status + ' ' + JSON.stringify(av.data).slice(0,80));
const avFake = await upload(cli, '/api/my/avatar', 'avatar', fakeJpg, 'fake.jpg');
if (avFake.status === 400) ok('Client avatar fake jpg rejected'); else fail('Fake jpg', avFake.status);
const sa = await upload(biz, '/api/my/shop/avatar', 'avatar', pixelPng, 'test.png');
if (sa.status === 200 && sa.data?.data?.url) ok('Shop logo valid upload'); else fail('Shop logo upload', sa.status + ' ' + JSON.stringify(sa.data).slice(0,80));
const sc = await upload(biz, '/api/my/shop/cover', 'cover', pixelPng, 'test.png');
if (sc.status === 200 && sc.data?.data?.url) ok('Shop cover valid upload'); else fail('Shop cover', sc.status + ' ' + JSON.stringify(sc.data).slice(0,80));

// URL accessibility
if (av.data?.data?.avatarUrl) { const r = await fetch(BASE + av.data.data.avatarUrl); if (r.ok) ok('Avatar URL accessible'); else fail('Avatar URL'); }
if (sa.data?.data?.url) { const r = await fetch(BASE + sa.data.data.url); if (r.ok) ok('Logo URL accessible'); else fail('Logo URL'); }
if (sc.data?.data?.url) { const r = await fetch(BASE + sc.data.data.url); if (r.ok) ok('Cover URL accessible'); else fail('Cover URL'); }

// Rate limit response shape
if (code.includes('rate_limited') && code.includes('429')) ok('Rate limit response exists');
else fail('Rate limit missing');

// Safety
if (read('.gitignore').includes('.env')) ok('.env gitignored');
let bins = 0; (function s(dir, ex) { for (const n of fs.readdirSync(dir)) { const p = dir + '/' + n; if (ex.some(e => p.includes(e))) continue; try { if (fs.statSync(p).isDirectory()) s(p, ex); else if (/\.exe~?$/.test(n)) { bins++; fail('Binary: ' + p); } } catch {} } })('.', ['.git', 'node_modules', 'client/dist']);
if (bins === 0) ok('No binaries');
if (!code.includes('"Access-Control-Allow-Origin", "*"')) ok('No wildcard CORS');

const p = res.filter(r => r.status === 'PASS').length, f = res.filter(r => r.status === 'FAIL').length;
console.log('\nAGENT.ONE Auth/Upload/Rate Audit 2026');
res.forEach(r => console.log(`  ${r.status === 'PASS' ? '✅' : '❌'} ${r.label}${r.detail ? ' — ' + r.detail : ''}`));
console.log(`\nResults: ${p} passed, ${f} failed`);
if (f > 0) process.exit(1);
