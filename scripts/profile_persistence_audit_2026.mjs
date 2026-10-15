// Profile persistence audit — verifies profile fields survive logout/login/refresh
import http from 'node:http';

const BASE = 'http://localhost:8080';
let errors = 0;

function fail(label, detail) { errors++; console.error(`  ❌ ${label}: ${detail || ''}`); }
function ok(label) { console.log(`  ✅ ${label}`); }

function req(method, path, body, token) {
  return new Promise(resolve => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    const r = http.request(BASE + path, { method, headers, timeout: 10000 }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, body: d, raw: d.substring(0, 120) }); }
      });
    });
    r.on('error', e => resolve({ status: 0, error: e.message }));
    if (data) r.write(data);
    r.end();
  });
}

async function assert(desc, condition, detail) { if (condition) ok(desc); else fail(desc, detail); }

async function main() {
  console.log('AGENT.ONE Profile Persistence Audit\n');

  // ── Client profile ──
  console.log('── Client Profile ──');

  // 1. Login client
  let cli = await req('POST', '/api/auth/signin', { email: 'client@agentone.ru', password: 'client123' });
  await assert('client login', cli.status === 200 && cli.body.ok, cli.status);
  const cliToken = cli.body.data?.token;

  // 2. Read current profile
  let me = await req('GET', '/api/auth/me', null, cliToken);
  const origProfile = { ...(me.body.data || me.body) };
  await assert('GET /auth/me reads profile', !!origProfile.id, origProfile.id?.slice(0, 8));

  // 3. Save test values
  const testVals = {
    firstName: 'AuditFirst',
    phone: '+7123456789',
    deliveryCity: 'Москва',
    deliveryAddress: 'ул. Тестовая, 1',
  };
  let up = await req('PUT', '/api/auth/profile', testVals, cliToken);
  await assert('PUT /auth/profile saves', up.status === 200 && up.body.ok, up.status);
  const savedProfile = up.body.data?.profile || {};
  await assert('firstName persisted', savedProfile.firstName === 'AuditFirst', savedProfile.firstName);
  await assert('deliveryCity persisted', savedProfile.deliveryCity === 'Москва', savedProfile.deliveryCity);
  await assert('phone persisted', savedProfile.phone === '+7123456789', savedProfile.phone);
  await assert('deliveryAddress persisted', savedProfile.deliveryAddress === 'ул. Тестовая, 1', savedProfile.deliveryAddress);

  // 4. GET /auth/me returns same values
  let me2 = await req('GET', '/api/auth/me', null, cliToken);
  const reCheck = me2.body.data || me2.body;
  await assert('/auth/me returns saved firstName', reCheck.firstName === 'AuditFirst', reCheck.firstName);
  await assert('/auth/me returns saved city', reCheck.deliveryCity === 'Москва', reCheck.deliveryCity);

  // 5. Simulate logout → login
  console.log('\n  ── Logout/Login roundtrip ──');
  cli = await req('POST', '/api/auth/signin', { email: 'client@agentone.ru', password: 'client123' });
  const cliToken2 = cli.body.data?.token;
  let me3 = await req('GET', '/api/auth/me', null, cliToken2);
  const afterRelogin = me3.body.data || me3.body;
  await assert('firstName after relogin', afterRelogin.firstName === 'AuditFirst', afterRelogin.firstName);
  await assert('city after relogin', afterRelogin.deliveryCity === 'Москва', afterRelogin.deliveryCity);
  await assert('phone after relogin', afterRelogin.phone === '+7123456789', afterRelogin.phone);

  // 6. Restore original values
  console.log('\n  ── Restore original profile ──');
  await req('PUT', '/api/auth/profile', {
    firstName: origProfile.firstName || '',
    phone: origProfile.phone || '',
    deliveryCity: origProfile.deliveryCity || '',
    deliveryAddress: origProfile.deliveryAddress || '',
  }, cliToken2);
  let me4 = await req('GET', '/api/auth/me', null, cliToken2);
  const restored = me4.body.data || me4.body;
  await assert('firstName restored', restored.firstName === (origProfile.firstName || ''), `${restored.firstName} vs ${origProfile.firstName}`);
  await assert('city restored', restored.deliveryCity === (origProfile.deliveryCity || ''), `${restored.deliveryCity} vs ${origProfile.deliveryCity}`);

  // ── Business profile ──
  console.log('\n── Business Profile ──');
  let biz = await req('POST', '/api/auth/signin', { email: 'demo@agentone.ru', password: 'demo123' });
  const bizToken = biz.body.data?.token;
  let bizMe = await req('GET', '/api/auth/me', null, bizToken);
  const bizOrig = { ...(bizMe.body.data || bizMe.body) };

  // Save test biz values
  await req('PUT', '/api/auth/profile', {
    firstName: 'BizAudit',
    phone: '+7987654321',
    deliveryCity: 'СПб',
  }, bizToken);
  let bizRe = await req('GET', '/api/auth/me', null, bizToken);
  const bizSaved = bizRe.body.data || bizRe.body;
  await assert('biz firstName saved', bizSaved.firstName === 'BizAudit', bizSaved.firstName);
  await assert('biz city saved', bizSaved.deliveryCity === 'СПб', bizSaved.deliveryCity);

  // Relogin business
  biz = await req('POST', '/api/auth/signin', { email: 'demo@agentone.ru', password: 'demo123' });
  let bizMe2 = await req('GET', '/api/auth/me', null, biz.body.data?.token);
  const bizAfter = bizMe2.body.data || bizMe2.body;
  await assert('biz firstName after relogin', bizAfter.firstName === 'BizAudit', bizAfter.firstName);

  // Restore biz
  await req('PUT', '/api/auth/profile', {
    firstName: bizOrig.firstName || '',
    phone: bizOrig.phone || '',
    deliveryCity: bizOrig.deliveryCity || '',
  }, biz.body.data?.token);
  console.log('  (business profile restored)');

  console.log(`\n${errors === 0 ? '✅ All checks passed' : '❌ ' + errors + ' error(s)'}`);
  process.exit(errors > 0 ? 1 : 0);
}

main().catch(e => { console.error(e.message); process.exit(1); });
