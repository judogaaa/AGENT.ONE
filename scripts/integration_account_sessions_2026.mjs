const BASE = process.env.ACCOUNT_SESSIONS_BASE || 'http://localhost:18081';
const results = [];
const TS = Date.now();

function ok(label) { results.push({ label, status: 'PASS' }); }
function fail(label, detail) { results.push({ label, status: 'FAIL', detail: String(detail || '') }); }

async function api(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(BASE + path, opts);
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}
  return { status: res.status, data, text, headers: res.headers };
}

function getCookie(res, name) {
  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) return null;
  const match = setCookie.match(new RegExp(`${name}=([^;]+)`));
  return match ? match[1] : null;
}

async function apiWithCookie(method, path, body, cookieVal) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookieVal) headers.Cookie = `agentone_refresh_token=${cookieVal}`;
  const opts = { method, headers, credentials: 'include' };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(BASE + path, opts);
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}
  return { status: res.status, data, text, headers: res.headers };
}

async function signup(email, password, name, role) {
  const res = await api('POST', '/api/auth/signup', {
    email,
    password,
    displayName: name,
    role,
    phone: '',
    terms_accepted: true,
    pd_consent: true,
    consent_source: 'integration_account_sessions',
  });
  if (res.data && res.data.ok) return { ...res.data.data, cookie: getCookie(res, 'agentone_refresh_token'), rawRes: res };
  return null;
}

async function signin(email, password) {
  const res = await api('POST', '/api/auth/signin', { email, password });
  if (res.data && res.data.ok) return { ...res.data.data, cookie: getCookie(res, 'agentone_refresh_token'), rawRes: res };
  return null;
}

async function run() {
  const email = `test-sessions-${TS}@test.ru`;
  const password = 'test-password-123';
  let sibling = null;

  // 1-4. Signup checks
  const su = await signup(email, password, 'Sessions Test', 'client');
  if (!su || !su.cookie) fail('signup cookie'); else ok('signup sets refresh cookie');
  if (su && su.cookie && /^[0-9a-f]{64}$/.test(su.cookie)) ok('cookie is 64 lowercase hex');
  else fail('cookie format');
  if (su) ok('signup returns access token');

  // 5. Signin
  const si = await signin(email, password);
  if (!si || !si.cookie) fail('signin cookie'); else ok('signin sets refresh cookie');
  if (si && si.cookie && si.cookie !== su?.cookie) ok('signin creates separate session');
  else fail('signin separate session');

  // 6. Cookie attributes
  if (si?.rawRes) {
    const sc = si.rawRes.headers.get('set-cookie') || '';
    if (sc.includes('HttpOnly')) ok('cookie HttpOnly');
    if (sc.includes('Path=/api/auth')) ok('cookie Path=/api/auth');
    if (sc.includes('SameSite=Lax')) ok('cookie SameSite=Lax');
    if (!sc.includes('Secure')) ok('dev cookie no Secure');
  }

  // 7. Refresh
  let newCookie = null;
  let newAccessToken = null;
  if (si && si.cookie) {
    const ref = await apiWithCookie('POST', '/api/auth/refresh', null, si.cookie);
    if (ref.status === 200) {
      ok('refresh returns 200');
      newCookie = getCookie(ref, 'agentone_refresh_token');
      if (newCookie && newCookie !== si.cookie) ok('refresh rotates cookie');
      else fail('refresh cookie rotation');
      if (ref.headers.get('cache-control')?.includes('no-store')) ok('refresh Cache-Control no-store');
      else fail('refresh no-store');
      if (ref.headers.get('pragma')?.includes('no-cache')) ok('refresh Pragma no-cache');
      if (ref.data?.data?.token) {
        newAccessToken = ref.data.data.token;
        const meRes = await api('GET', '/api/auth/me', null, newAccessToken);
        if (meRes.status === 200) ok('access JWT from refresh works');
        else fail('access JWT invalid');
      }
      // Profile matches signin shape
      if (ref.data?.data?.profile) {
        const prof = ref.data.data.profile;
        if (prof.id && prof.email && prof.role) ok('refresh profile shape OK');
        else fail('refresh profile missing fields');
      }
      // JSON must not contain raw cookie or hash
      const body = ref.text;
      if (newCookie && !body.includes(newCookie)) ok('JSON has no refresh token');
      else fail('JSON leaks token');
    } else fail('refresh 200', ref.status);
  }

  // 8. Old cookie after rotation → 401
  if (si && si.cookie && newCookie) {
    const refOld = await apiWithCookie('POST', '/api/auth/refresh', null, si.cookie);
    if (refOld.status === 401) ok('old cookie 401 after rotation');
    else fail('old cookie reused', refOld.status);
  }

  // 9-10. Missing/malformed
  if ((await api('POST', '/api/auth/refresh')).status === 401) ok('missing cookie 401');
  if ((await apiWithCookie('POST', '/api/auth/refresh', null, 'not-hex')).status === 401) ok('malformed cookie 401');

  // 11. Generic 401 message + cookie clearing
  const noCookie = await api('POST', '/api/auth/refresh');
  if (noCookie.data && !noCookie.data.ok && noCookie.data.error === 'invalid credentials') ok('generic 401 message');
  const clearCookie = noCookie.headers.get('set-cookie') || '';
  if (clearCookie.includes('agentone_refresh_token') && (clearCookie.includes('Max-Age=0') || clearCookie.includes('Expires=Thu'))) ok('failure clears cookie');

  // 12. Cache-Control on failure
  if ((noCookie.headers.get('cache-control') || '').includes('no-store')) ok('failure Cache-Control no-store');

  // 13. CONCURRENCY TEST — fully isolated
  const ccEmail = `test-concurrent-${TS}@test.ru`;
  const ccSignin = await signup(ccEmail, password, 'Concurrency', 'client');
  if (!ccSignin || !ccSignin.cookie) {
    fail('concurrency signin setup');
  } else {
    // Verify session is active before concurrent test
    const ccPreCheck = await apiWithCookie('POST', '/api/auth/refresh', null, ccSignin.cookie);
    if (ccPreCheck.status !== 200) {
      fail('concurrency pre-check', `status ${ccPreCheck.status}`);
    } else {
      const ccNewCookie = getCookie(ccPreCheck, 'agentone_refresh_token');
      if (!ccNewCookie) {
        fail('concurrency no new cookie');
      } else {
        const [r1, r2] = await Promise.allSettled([
          apiWithCookie('POST', '/api/auth/refresh', null, ccNewCookie),
          apiWithCookie('POST', '/api/auth/refresh', null, ccNewCookie),
        ]);
        const s1 = r1.value?.status || 0;
        const s2 = r2.value?.status || 0;
        const codes = [s1, s2].sort();
        if (codes[0] === 200 && codes[1] === 401) ok('concurrent: one 200 one 401');
        else fail('concurrent codes', `${s1},${s2}`);

        const afterReplay = await apiWithCookie('POST', '/api/auth/refresh', null, ccNewCookie);
        if (afterReplay.status === 401) ok('family revoked after concurrent');
        else fail('family not revoked', afterReplay.status);
      }
    }
  }

  // 14. Signin JSON shape: use the ccEmail user (definitely exists in this DB)
  const siCheck = await signin(ccEmail, password);
  if (siCheck && siCheck.token && siCheck.profile && siCheck.profile.id && siCheck.profile.role) {
    ok('signin JSON shape intact');
  } else {
    fail('signin JSON shape', siCheck ? 'missing fields' : 'null response');
  }

  sibling = await signin(ccEmail, password);

  // ─── LOGOUT TESTS ───

  const loEmail = `test-logout-${TS}@test.ru`;
  const lo = await signup(loEmail, password, 'Logout Test', 'client');
  if (!lo || !lo.cookie) { fail('logout setup signup'); }
  else {
    const loRef = await apiWithCookie('POST', '/api/auth/refresh', null, lo.cookie);
    const loNewCk = getCookie(loRef, 'agentone_refresh_token');
    if (!loNewCk) { fail('logout pre-rotation'); }
    else {
      const l1 = await apiWithCookie('POST', '/api/auth/logout', null, loNewCk);
      if (l1.status === 200) ok('logout valid cookie 200');
      else fail('logout 200', l1.status);
      if (l1.data?.ok && l1.data?.data?.status === 'logged_out') ok('logout JSON status');
      const l1ck = l1.headers.get('set-cookie') || '';
      if (l1ck.includes('agentone_refresh_token') && (l1ck.includes('Max-Age=0') || l1ck.includes('Thu, 01 Jan 1970'))) ok('logout clears cookie');
      if ((l1.headers.get('cache-control') || '').includes('no-store')) ok('logout Cache-Control no-store');
      const l1ref = await apiWithCookie('POST', '/api/auth/refresh', null, loNewCk);
      if (l1ref.status === 401) ok('logout: old cookie cannot refresh');
      else fail('logout: old cookie still works', l1ref.status);
    }
    const lOld = await apiWithCookie('POST', '/api/auth/logout', null, lo.cookie);
    if (lOld.status === 200) ok('logout old rotated cookie 200');
    else fail('logout old rotated', lOld.status);
  }

  const lNoCk = await api('POST', '/api/auth/logout');
  if (lNoCk.status === 200) ok('logout missing cookie 200');
  const lBad = await apiWithCookie('POST', '/api/auth/logout', null, 'not-hex');
  if (lBad.status === 200) ok('logout malformed cookie 200');
  const lRepeat = await apiWithCookie('POST', '/api/auth/logout', null, lNoCk.value || 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2');
  if (lRepeat.status === 200) ok('logout idempotent 200');

  // ─── LOGOUT-ALL TESTS ───
  let laSignupAttempted = false;
  let la = null;
  for (let retryTS = Date.now() + 1; retryTS < Date.now() + 1000; retryTS++) {
    const laEmail = `test-logoutall-${retryTS}@test.ru`;
    la = await signup(laEmail, password, 'LogoutAll Test', 'client');
    if (la?.token) { laSignupAttempted = true; break; }
  }
  if (!la?.token) { fail('logout-all setup signup', laSignupAttempted ? 'email conflict' : 'response null'); }
  else {
    const la1 = await api('POST', '/api/auth/logout-all');
    if (la1.status === 401) ok('logout-all missing JWT 401');
    const la3 = await api('POST', '/api/auth/logout-all', null, la.token);
    if (la3.status === 200) ok('logout-all valid JWT 200');
    if (la3.data?.ok && la3.data?.data?.status === 'all_sessions_revoked') ok('logout-all JSON status');
    const laRef = await apiWithCookie('POST', '/api/auth/refresh', null, la.cookie);
    if (laRef.status === 401) ok('logout-all: cookie cannot refresh');
    else fail('logout-all: cookie still works', laRef.status);
    const otherRef = await apiWithCookie('POST', '/api/auth/refresh', null, sibling.cookie);
    if (otherRef.status === 200) ok('logout-all: other user refresh works');
    else fail('logout-all: other user blocked', otherRef.status);
    const laRepeat = await api('POST', '/api/auth/logout-all', null, la.token);
    if (laRepeat.status === 200) ok('logout-all idempotent 200');
    const meCheck = await api('GET', '/api/auth/me', null, la.token);
    if (meCheck.status === 200) ok('logout-all: access JWT still valid (accepted)');
  }
}

run().then(() => {
  const p = results.filter(r => r.status === 'PASS').length;
  const f = results.filter(r => r.status === 'FAIL').length;
  console.log('\nACCOUNT SESSIONS RUNTIME TESTS');
  results.forEach(r => console.log(`  ${r.status === 'PASS' ? 'OK' : 'FAIL'} ${r.label}${r.detail ? ' — ' + r.detail : ''}`));
  console.log(`\nResults: ${p} passed, ${f} failed`);
  process.exit(f > 0 ? 1 : 0);
}).catch(e => { console.error(e); process.exit(1); });
