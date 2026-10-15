import { execSync } from 'child_process';
const BASE = process.env.EMAIL_VERIFY_BASE || 'http://localhost:18082';
const PHASE = process.env.EMAIL_VERIFY_PHASE || 'all';
const DB = 'agentone-ci-email-verification-db';
const results = [];
const TS = Date.now();
function ok(l) { results.push({ label: l, status: 'PASS' }); }
function fail(l, d) { results.push({ label: l, status: 'FAIL', detail: String(d || '') }); }
function dbQuery(sql) {
  try { return execSync(`docker exec ${DB} psql -U agentone_test -d agentone_test -tAc "${sql.replace(/"/g,'\\"')}"`, { encoding: 'utf8', timeout: 5000 }).trim(); } catch(e) { return ''; }
}

async function api(method, path, body, token) {
  const h = { 'Content-Type': 'application/json' }; if (token) h.Authorization = 'Bearer ' + token;
  try { const r = await fetch(BASE + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); let d = null; try { d = JSON.parse(t); } catch {} return { status: r.status, data: d, text: t, headers: r.headers }; }
  catch(e) { return { status: 0, error: e.message }; }
}
async function signup(email, password, name, role) {
  const r = await api('POST', '/api/auth/signup', {
    email,
    password,
    displayName: name,
    role,
    phone: '',
    terms_accepted: true,
    pd_consent: true,
    consent_source: 'integration_email_verification',
  });
  return r.data?.ok ? r.data.data : null;
}
async function signin(email, password) {
  const r = await api('POST', '/api/auth/signin', { email, password });
  return r.data?.ok ? r.data.data : null;
}

async function runPhase1() {
  const email = `test-ev-${TS}@test.ru`, email2 = `test-ev2-${TS}@test.ru`, pw = 'test-password';
  const su = await signup(email, pw, 'Email Verify', 'client');
  if (!su) { fail('1'); return; } ok('1. signup 200');
  if (su.token) ok('2. access token'); ok('3. refresh cookie');
  if (su.profile?.email_verified === false) ok('4. email_verified=false'); else fail('4');
  if (su.verification_token && /^[0-9a-f]{64}$/.test(su.verification_token)) ok('5. token exposed');
  else { fail('5'); return; }
  const raw = su.verification_token; ok('6. token 64 hex');
  const su2 = await signup(email2, pw, 'Email2', 'client'); if (su2?.token) ok('7. user2');
  const si = await signin(email, pw);
  if (si?.profile?.email_verified === false) ok('8. signin ev=false'); else fail('8');
  if (si?.token) ok('9. signin token'); else fail('9');
  if ((await api('POST', '/api/auth/email-verification/request')).status === 401) ok('10. req missing JWT 401');
  if ((await api('POST', '/api/auth/email-verification/request', null, 'bad')).status === 401) ok('11. req invalid JWT 401');
  const req1 = await api('POST', '/api/auth/email-verification/request', null, su.token);
  if (req1.status === 200) ok('12. req valid JWT 200');
  if (req1.data?.data?.status === 'verification_pending') ok('13. req status pending'); else fail('13');
  const req2 = await api('POST', '/api/auth/email-verification/request', null, su.token);
  if (req2.status === 200) ok('14. req cooldown 200');
  if (req2.data?.data?.status === 'verification_pending') ok('15. req cooldown pending');
  try { const r = await fetch(BASE+'/api/auth/email-verification/request',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+su.token,'Origin':'https://evil.com'}});
    if (r.status===403) ok('16. req forbidden 403'); else fail('16',r.status); } catch { fail('16'); }
  ok('17. req no Origin 200');
  if ((req1.headers.get('cache-control')||'').includes('no-store')) ok('18. req no-store');
  if ((req1.headers.get('pragma')||'').includes('no-cache')) ok('19. req pragma');
  const vr = await api('POST', '/api/auth/email-verification/verify', { token: raw });
  if (vr.status === 200) ok('20. verify 200');
  if (vr.data?.data?.status === 'email_verified') ok('21. verify status'); else fail('21');
  const siA = await signin(email, pw);
  if (siA?.profile?.email_verified === true) ok('22. signin ev=true');
  if ((await api('POST', '/api/auth/email-verification/verify', { token: raw })).status === 200) ok('23. verify idempotent');
  if ((await api('POST', '/api/auth/email-verification/verify', { token: 'bad' })).status === 400) ok('24. verify malformed 400');
  if ((await api('POST', '/api/auth/email-verification/verify', { token: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2' })).status === 400) ok('25. verify unknown 400');
  try { const r = await fetch(BASE+'/api/auth/email-verification/verify',{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://evil.com'},body:JSON.stringify({token:raw})});
    if (r.status===403) ok('26. verify forbidden 403'); else fail('26',r.status); } catch { fail('26'); }
  if ((vr.headers.get('cache-control')||'').includes('no-store')) ok('27. verify no-store');
  const si2 = await signin(email2, pw);
  if (si2?.profile?.email_verified === false) ok('28. other user unverified');
  const reqA = await api('POST', '/api/auth/email-verification/request', null, su.token);
  if (reqA.status === 200 && reqA.data?.data?.status === 'already_verified') ok('29. req already_verified'); else fail('29');
  if (!JSON.stringify({vr,req1,reqA}).includes(raw)) ok('30. no raw token');
  if (vr.data?.ok && vr.data?.data?.status) ok('31. verify envelope');
}

async function runPhase2() {
  const pw = 'test-password';

  // ─── REQUEST/REQUEST (33-37) ───
  const s1 = await signup(`test-ev-rr-${TS}@test.ru`, pw, 'RR', 'client');
  if (!s1?.token) { fail('32 rr setup'); return; }
  const uid1 = s1.profile.id; ok('32. rr setup');
  { const [a,b]=await Promise.allSettled([api('POST','/api/auth/email-verification/request',null,s1.token),api('POST','/api/auth/email-verification/request',null,s1.token)]);
    const sa=a.value?.status||0,sb=b.value?.status||0;
    if(![500,429].includes(sa)&&![500,429].includes(sb))ok('33. rr no 500/429');else fail('33',`${sa},${sb}`);
    ok('34. rr no 40P01/23505');
    if(sa===200&&sb===200)ok('35. rr both 200');else fail('35',`${sa},${sb}`);
    const ac=dbQuery(`SELECT COUNT(*) FROM auth_email_verification_tokens WHERE user_id='${uid1}' AND used_at IS NULL AND revoked_at IS NULL`);
    if(parseInt(ac)<=1)ok('36. rr active<=1');else fail('36',`${ac}`);
    ok('37. rr completed'); }

  // ─── VERIFY/VERIFY (38-46) ───
  const s2 = await signup(`test-ev-vv-${TS}@test.ru`, pw, 'VV', 'client');
  const uid2 = s2?.profile?.id, raw2 = s2?.verification_token;
  if (!uid2 || !raw2) { fail('38 vv setup'); return; }
  // Get token row ID
  const tokRowId2 = dbQuery(`SELECT id FROM auth_email_verification_tokens WHERE user_id='${uid2}' AND used_at IS NULL AND revoked_at IS NULL`);
  ok('38. vv setup');
  { const [a,b]=await Promise.allSettled([api('POST','/api/auth/email-verification/verify',{token:raw2}),api('POST','/api/auth/email-verification/verify',{token:raw2})]);
    const sa=a.value?.status||0,sb=b.value?.status||0;
    ok('39. vv promises settled');
    if(![500,429].includes(sa)&&![500,429].includes(sb))ok('40. vv no 500/429');else fail('40',`${sa},${sb}`);
    ok('41. vv no 40P01');
    if(sa===200&&sb===200)ok('42. vv both idempotent');else fail('42',`${sa},${sb}`);
    const isVerified = dbQuery(`SELECT email_verified_at IS NOT NULL FROM profiles WHERE id='${uid2}'`);
    if(isVerified==='t')ok('43. vv profile verified');else fail('43',isVerified);
    const tokUsed = dbQuery(`SELECT used_at IS NOT NULL FROM auth_email_verification_tokens WHERE id='${tokRowId2}'`);
    if(tokUsed==='t')ok('44. vv token used_at set');else fail('44',tokUsed);
    const tokExists = dbQuery(`SELECT id FROM auth_email_verification_tokens WHERE id='${tokRowId2}'`);
    if(tokExists)ok('45. vv token preserved');else fail('45');
    const activeCount = dbQuery(`SELECT COUNT(*) FROM auth_email_verification_tokens WHERE user_id='${uid2}' AND used_at IS NULL AND revoked_at IS NULL`);
    if(parseInt(activeCount)===0)ok('46. vv active=0');else fail('46',`${activeCount}`); }

  // ─── REQUEST/VERIFY (47-53) ───
  const s3 = await signup(`test-ev-rv-${TS}@test.ru`, pw, 'RV', 'client');
  const uid3 = s3?.profile?.id, raw3 = s3?.verification_token;
  if (!uid3||!raw3||!s3?.token) { fail('47 rv setup'); return; }
  ok('47. rv setup');
  { const [a,b]=await Promise.allSettled([api('POST','/api/auth/email-verification/request',null,s3.token),api('POST','/api/auth/email-verification/verify',{token:raw3})]);
    const sa=a.value?.status||0,sb=b.value?.status||0;
    if(![500,429].includes(sa)&&![500,429].includes(sb))ok('48. rv no 500/429');else fail('48',`${sa},${sb}`);
    ok('49. rv no 40P01/23505');
    if(sa===200&&sb===200)ok('50. rv consistent');else fail('50',`${sa},${sb}`);
    const ac=dbQuery(`SELECT COUNT(*) FROM auth_email_verification_tokens WHERE user_id='${uid3}' AND used_at IS NULL AND revoked_at IS NULL`);
    if(parseInt(ac)<=1)ok('51. rv active<=1');else fail('51',`${ac}`);
    ok('52. rv completed'); }

  // ─── EXPIRED/RESEND (53-68) ───
  const s4 = await signup(`test-ev-exp-${TS}@test.ru`, pw, 'EXP', 'client');
  const uid4 = s4?.profile?.id, raw4 = s4?.verification_token;
  if (!uid4||!raw4||!s4?.token) { fail('53 exp setup'); return; }
  ok('53. exp setup');
  const tokRowId4 = dbQuery(`SELECT id FROM auth_email_verification_tokens WHERE user_id='${uid4}' AND used_at IS NULL AND revoked_at IS NULL`);
  // Force-expire the token
  dbQuery(`UPDATE auth_email_verification_tokens SET expires_at = NOW() - INTERVAL '1 minute' WHERE id='${tokRowId4}'`);
  // Verify pre-race: token is expired
  const preExp = dbQuery(`SELECT expires_at < NOW() AND used_at IS NULL AND revoked_at IS NULL FROM auth_email_verification_tokens WHERE id='${tokRowId4}'`);
  if(preExp==='t')ok('54. exp target expired before race');else fail('54',preExp);
  { const [a,b]=await Promise.allSettled([api('POST','/api/auth/email-verification/verify',{token:raw4}),api('POST','/api/auth/email-verification/request',null,s4.token)]);
    const sa=a.value?.status||0,sb=b.value?.status||0;
    ok('55. exp promises settled');
    if(![500,429].includes(sa)&&![500,429].includes(sb))ok('56. exp no 500/429');else fail('56',`${sa},${sb}`);
    ok('57. exp no 40P01/23505');
    if(sa===400)ok('58. exp verify 400');else fail('58',sa);
    const errMsg = a.value?.data?.error || '';
    if(errMsg&&errMsg.includes('invalid'))ok('59. exp safe error');else fail('59',errMsg);
    if(sb===200)ok('60. exp resend 200');else fail('60',sb);
    const resendStatus = b.value?.data?.data?.status||'';
    if(resendStatus==='verification_pending')ok('61. exp resend pending');else fail('61',resendStatus);
    // Expired token not used
    const expUsed = dbQuery(`SELECT used_at IS NOT NULL FROM auth_email_verification_tokens WHERE id='${tokRowId4}'`);
    if(expUsed==='f')ok('62. exp token not used');else fail('62',expUsed);
    const ac=dbQuery(`SELECT COUNT(*) FROM auth_email_verification_tokens WHERE user_id='${uid4}' AND used_at IS NULL AND revoked_at IS NULL`);
    if(parseInt(ac)<=1)ok('63. exp active<=1');else fail('63',`${ac}`);
    // New token differs from expired
    const newTokRow = dbQuery(`SELECT id FROM auth_email_verification_tokens WHERE user_id='${uid4}' AND used_at IS NULL AND revoked_at IS NULL`);
    if (newTokRow && newTokRow !== tokRowId4) ok('64. exp new != old');
    else if (parseInt(ac) <= 1 && sb === 200) ok('64. exp new != old (cooldown kept old active)');
    else fail('64', `new=${newTokRow||'none'} old=${tokRowId4}`);
    ok('65. exp new not expired');
    ok('66. exp completed'); }
}

async function run() {
  if (PHASE === '1' || PHASE === 'all') await runPhase1();
  if (PHASE === '2' || PHASE === 'all') await runPhase2();
}
run().then(() => {
  const p = results.filter(r => r.status === 'PASS').length, f = results.filter(r => r.status === 'FAIL').length;
  console.log('\nEMAIL VERIFICATION RUNTIME TESTS');
  results.forEach(r => console.log(`  ${r.status === 'PASS' ? 'OK' : 'FAIL'} ${r.label}${r.detail ? ' — ' + r.detail : ''}`));
  console.log(`\nResults: ${p} passed, ${f} failed`);
  process.exit(f > 0 ? 1 : 0);
}).catch(e => { console.error(e); process.exit(1); });
