import fs from 'fs';
import path from 'path';

const BASE = 'http://localhost:8080';
const results = [];

function ok(label) { results.push({ label, status: 'PASS' }); }
function fail(label, detail) { results.push({ label, status: 'FAIL', detail }); }

async function api(method, pathStr, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(BASE + pathStr, opts);
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}
  return { status: res.status, data, text };
}

function unwrap(r) {
  if (r.data && r.data.ok === true && r.data.data !== undefined) return r.data.data;
  return r.data;
}

async function signin(email, password) {
  const r = await api('POST', '/api/auth/signin', { email, password });
  return unwrap(r)?.token || null;
}

async function upload(token, endpoint, fieldName, content, filename) {
  const boundary = '----boundary' + Date.now();
  let body = '';
  body += `--${boundary}\r\n`;
  body += `Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\n`;
  body += `Content-Type: image/png\r\n\r\n`;
  const buf = Buffer.concat([Buffer.from(body, 'utf8'), content, Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8')]);
  const res = await fetch(BASE + endpoint, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body: buf,
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}
  return { status: res.status, data, text };
}

// Minimal valid PNG (1x1 white pixel)
const pixelPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

// ═══════════════════════════════════════
// CLIENT PROFILE PERSISTENCE
// ═══════════════════════════════════════

const cliToken = await signin('client@agentone.ru', 'client123');
if (!cliToken) { fail('Client login'); } else ok('Client login');

// Save original profile
const origMe = await api('GET', '/api/auth/me', null, cliToken);
const origProfile = unwrap(origMe) || {};
const origName = origProfile.firstName || '';
const origPhone = origProfile.phone || '';
const origCity = origProfile.deliveryCity || '';
const origAvatar = origProfile.avatarUrl || '';

// Update profile fields
const update = await api('PUT', '/api/auth/profile', {
  firstName: 'PersistenceTest', phone: '+79990001122', deliveryCity: 'PersistCity',
}, cliToken);
const updProfile = unwrap(update);
if (update.status === 200 && updProfile?.profile?.firstName === 'PersistenceTest') ok('Client PUT profile');
else fail('Client PUT profile', JSON.stringify({ status: update.status, got: updProfile?.profile?.firstName }));

// Upload avatar
const avatarUp = await upload(cliToken, '/api/my/avatar', 'avatar', pixelPng, 'test.png');
const avatarData = unwrap(avatarUp);
const avatarUrl = avatarData?.avatarUrl;
if (avatarUrl && avatarUrl.startsWith('/uploads/')) ok('Client upload avatar');
else fail('Client avatar upload', JSON.stringify(avatarData));

// Verify GET /auth/me returns new data
const meAfter = await api('GET', '/api/auth/me', null, cliToken);
const meAfterData = unwrap(meAfter);
if (meAfterData?.firstName === 'PersistenceTest' && meAfterData?.deliveryCity === 'PersistCity') ok('GET /auth/me reflects changes');
else fail('GET /auth/me after update', JSON.stringify(meAfterData));

// Verify avatar accessible via HTTP
if (avatarUrl) {
  const imgTest = await fetch(BASE + avatarUrl);
  if (imgTest.status === 200) ok('Avatar URL accessible');
  else fail('Avatar URL not reachable', imgTest.status);
}

// Logout and re-login (simulate new session)
const cliToken2 = await signin('client@agentone.ru', 'client123');
if (!cliToken2) { fail('Client re-login'); } else {
  ok('Client re-login');
  const me2 = await api('GET', '/api/auth/me', null, cliToken2);
  const me2Data = unwrap(me2) || {};
  if (me2Data?.firstName === 'PersistenceTest') ok('Client name survives relogin');
  else fail('Client name after relogin', me2Data?.firstName);
  if (me2Data?.deliveryCity === 'PersistCity') ok('Client city survives relogin');
  else fail('Client city after relogin', me2Data?.deliveryCity);
  if (me2Data?.avatarUrl && me2Data.avatarUrl.startsWith('/uploads/')) ok('Client avatarUrl survives relogin');
  else fail('Client avatarUrl after relogin', me2Data?.avatarUrl);
}

// Restore original profile
await api('PUT', '/api/auth/profile', {
  firstName: origName, phone: origPhone, deliveryCity: origCity,
}, cliToken2 || cliToken);

// ═══════════════════════════════════════
// BUSINESS SHOP PERSISTENCE
// ═══════════════════════════════════════

const bizToken = await signin('demo@agentone.ru', 'demo123');
if (!bizToken) { fail('Business login'); } else ok('Business login');

// Save original shop fields
const origShopR = await api('GET', '/api/my/shop', null, bizToken);
const origShop = unwrap(origShopR)?.shop || {};
const origSTagline = origShop.tagline || '';
const origSAbout = origShop.about || '';
const origSCity = origShop.city || '';
const origSPhone = origShop.phone || '';
const origSEmail = origShop.email || '';
const origSHours = origShop.workingHours || '';
const origSMethod = origShop.contactMethod || '';

// Update shop fields
const shopUp = await api('PUT', '/api/my/shop', {
  tagline: 'PersistTag', about: 'PersistAbout', city: 'PersistCity',
  phone: '+79991112233', email: 'persist@test.ru',
  workingHours: '24/7', contactMethod: 'PersistMethod',
}, bizToken);
const shopUpData = unwrap(shopUp)?.shop || {};
if (shopUp.status === 200 && shopUpData.tagline === 'PersistTag') ok('Business PUT shop fields');
else fail('Business PUT shop', shopUp.text);

// Upload logo and cover
const logoUp = await upload(bizToken, '/api/my/shop/avatar', 'avatar', pixelPng, 'logo.png');
const logoData = unwrap(logoUp) || {};
const logoUrl = logoData?.url || logoData?.shop?.logoUrl || '';
if (logoUrl && logoUrl.startsWith('/uploads/')) ok('Business upload logo');
else fail('Business logo upload', JSON.stringify(logoData));

const coverUp = await upload(bizToken, '/api/my/shop/cover', 'cover', pixelPng, 'cover.png');
const coverData = unwrap(coverUp) || {};
const coverUrl = coverData?.url || coverData?.shop?.coverUrl || '';
if (coverUrl && coverUrl.startsWith('/uploads/')) ok('Business upload cover');
else fail('Business cover upload', JSON.stringify(coverData));

// Verify GET /api/my/shop returns saved data
const shopAfter = await api('GET', '/api/my/shop', null, bizToken);
const shopAfterData = unwrap(shopAfter)?.shop || {};
if (shopAfterData.tagline === 'PersistTag') ok('Shop tagline persists');
else fail('Shop tagline', shopAfterData.tagline);
if (shopAfterData.about === 'PersistAbout') ok('Shop about persists');
else fail('Shop about', shopAfterData.about);
if (shopAfterData.phone === '+79991112233') ok('Shop phone persists');
else fail('Shop phone', shopAfterData.phone);

// Verify logo/cover accessible
if (logoUrl) {
  const logoTest = await fetch(BASE + logoUrl);
  if (logoTest.status === 200) ok('Logo URL accessible');
  else fail('Logo URL not reachable', logoTest.status);
}
if (coverUrl) {
  const coverTest = await fetch(BASE + coverUrl);
  if (coverTest.status === 200) ok('Cover URL accessible');
  else fail('Cover URL not reachable', coverTest.status);
}

// Logout and re-login
const bizToken2 = await signin('demo@agentone.ru', 'demo123');
if (!bizToken2) { fail('Business re-login'); } else {
  ok('Business re-login');
  const shop2 = await api('GET', '/api/my/shop', null, bizToken2);
  const shop2Data = unwrap(shop2)?.shop || {};
  if (shop2Data.tagline === 'PersistTag') ok('Shop tagline survives relogin');
  else fail('Shop tagline after relogin', shop2Data.tagline);
  if (shop2Data.about === 'PersistAbout') ok('Shop about survives relogin');
  else fail('Shop about after relogin', shop2Data.about);
  if (shop2Data.phone === '+79991112233') ok('Shop phone survives relogin');
  else fail('Shop phone after relogin', shop2Data.phone);
}

// Restore original shop fields
await api('PUT', '/api/my/shop', {
  tagline: origSTagline, about: origSAbout, city: origSCity,
  phone: origSPhone, email: origSEmail,
  workingHours: origSHours, contactMethod: origSMethod,
}, bizToken2 || bizToken);

// ═══════════════════════════════════════
// AI MANAGER SETTINGS PERSISTENCE
// ═══════════════════════════════════════

// Save original AI settings
const origAi = await api('GET', '/api/business/ai-manager/settings', null, bizToken2 || bizToken);
const origAiData = unwrap(origAi)?.settings || {};

// Update AI settings
const aiUp = await api('PUT', '/api/business/ai-manager/settings', {
  aiGreeting: 'PersistGreeting', aiTone: 'friendly',
  aiStylePrompt: 'PersistStyle', aiForbiddenClaims: 'PersistForbidden',
  aiPreferredCTA: 'PersistCTA',
}, bizToken2 || bizToken);
if (aiUp.status === 200) ok('AI settings PUT');
else fail('AI settings PUT', aiUp.status);

const aiGet = await api('GET', '/api/business/ai-manager/settings', null, bizToken2 || bizToken);
const aiGetData = unwrap(aiGet)?.settings || {};
if (aiGetData.aiGreeting === 'PersistGreeting') ok('AI greeting persists');
else fail('AI greeting', aiGetData.aiGreeting);
if (aiGetData.aiPreferredCTA === 'PersistCTA') ok('AI CTA persists');
else fail('AI CTA', aiGetData.aiPreferredCTA);

// Relogin and re-check
const bizToken3 = await signin('demo@agentone.ru', 'demo123');
const aiRecheck = await api('GET', '/api/business/ai-manager/settings', null, bizToken3);
const aiRecheckData = unwrap(aiRecheck)?.settings || {};
if (aiRecheckData.aiGreeting === 'PersistGreeting') ok('AI greeting survives relogin');
else fail('AI greeting after relogin', aiRecheckData.aiGreeting);

// Restore original AI settings
await api('PUT', '/api/business/ai-manager/settings', {
  aiGreeting: origAiData.aiGreeting || '',
  aiTone: origAiData.aiTone || 'professional',
  aiStylePrompt: origAiData.aiStylePrompt || '',
  aiForbiddenClaims: origAiData.aiForbiddenClaims || '',
  aiPreferredCTA: origAiData.aiPreferredCTA || '',
}, bizToken3);

// ═══════════════════════════════════════
// SAFETY
// ═══════════════════════════════════════

// Check .env not tracked
const gitignore = fs.readFileSync('.gitignore', 'utf8');
if (gitignore.includes('.env')) ok('.env in .gitignore');
else fail('.env not in .gitignore');

// Check no gsk_ in server code files (pattern, not real key)
const gskRe = /gsk_[A-Za-z0-9_-]{20,}/;
const gskFiles = [];
for (const f of fs.readdirSync('server/cmd').filter(x => x.endsWith('.go'))) {
  const c = fs.readFileSync('server/cmd/' + f, 'utf8');
  if (gskRe.test(c)) gskFiles.push(f);
}
if (gskFiles.length === 0) ok('No gsk_ pattern in server code');
else fail('gsk_ pattern found in: ' + gskFiles.join(','));

// Summary
const passed = results.filter(r => r.status === 'PASS').length;
const failed = results.filter(r => r.status === 'FAIL').length;
console.log('\nAGENT.ONE Persistence Audit 2026');
console.log('Backend:', BASE, '\n');
for (const r of results) {
  const icon = r.status === 'PASS' ? '✅' : '❌';
  console.log(`  ${icon} ${r.label}${r.detail ? ' — ' + r.detail : ''}`);
}
console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
