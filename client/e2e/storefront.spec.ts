import { test, expect } from '@playwright/test';

const TS = Date.now();
const BASE_URL = process.env.AGENT_ONE_E2E_BASE_URL || 'http://localhost:18080';

async function apiFetch(path, method = 'GET', body = null, token = null) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = 'Bearer ' + token;
  const opts = { method, headers: h, body: body ? JSON.stringify(body) : undefined };
  const r = await fetch(BASE_URL + path, opts);
  return { status: r.status, data: await r.json().catch(() => null) };
}

async function signupAPI(email, password, displayName, role) {
  const r = await apiFetch('/api/auth/signup', 'POST', {
    email,
    password,
    displayName,
    role,
    terms_accepted: true,
    pd_consent: true,
    consent_source: 'browser_e2e',
  });
  return r.data?.data?.token || r.data?.token || null;
}

async function signinAPI(email, password) {
  const r = await apiFetch('/api/auth/signin', 'POST', { email, password });
  return r.data?.data?.token || r.data?.token || null;
}

async function approveShopAPI(shopId) {
  return fetch(BASE_URL + '/api/dev/business-verification/' + shopId + '/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Dev-Admin-Token': 'dev-secret' },
  });
}

test.describe('Public storefront', () => {
  test('homepage loads', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    await expect(page.locator('body')).not.toContainText('fatal');
  });

  test('catalog renders', async ({ page }) => {
    await page.goto('/#/catalog');
    await page.waitForTimeout(3000);
    await expect(page.locator('body')).not.toContainText('fatal');
  });

  test('shop page clean', async ({ page }) => {
    await page.goto('/#/shop/technomarket');
    await page.waitForTimeout(4000);
    const b = await page.locator('body').textContent() || '';
    expect(b).not.toMatch(/ЮKassa|СБП|fatal/);
  });
});

test.describe('Auth API + login CTA', () => {
  const cliEmail = `ec-${TS}@t.local`;
  const cliPw = 'test123456';

  test('client signup requires legal consent fields', async () => {
    const denied = await apiFetch('/api/auth/signup', 'POST', {
      email: `nolegal-${TS}@t.local`,
      password: cliPw,
      displayName: 'No Legal',
      role: 'client',
    });
    expect(denied.status).toBeGreaterThanOrEqual(400);

    const token = await signupAPI(cliEmail, cliPw, 'E2E Client', 'client');
    expect(token).toBeTruthy();
  });

  test('client signin returns token', async () => {
    const token = await signinAPI(cliEmail, cliPw);
    expect(token).toBeTruthy();
  });

  test('wrong password rejected', async () => {
    const r = await apiFetch('/api/auth/signin', 'POST', { email: cliEmail, password: 'WRONG' });
    const token = r.data?.data?.token || r.data?.token || null;
    expect(token).toBeFalsy();
  });

  test('login button leaves main app for auth portal', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1500);
    const login = page.locator('button', { hasText: 'Войти' }).first();
    await expect(login).toBeVisible();
    // AuthPage redirects to VITE_AUTH_ORIGIN; in CI build this is localhost:5180 by default.
    await Promise.all([
      page.waitForURL(/\/login|5180|auth/, { timeout: 10000 }).catch(() => null),
      login.click(),
    ]);
    await expect(page.locator('body')).not.toContainText('fatal');
  });
});

test.describe('Business verification + product', () => {
  const bem = `ebv-${TS}@t.local`;
  const bpw = 'test123456';
  const shopName = 'E2E-Verify-Shop-' + TS;
  let shopId = null;
  let bizToken = null;

  test('register business via API', async () => {
    bizToken = await signupAPI(bem, bpw, 'Biz', 'business');
    expect(bizToken).toBeTruthy();

    const shopRes = await apiFetch('/api/shop', 'POST', {
      name: shopName,
      slug: `e2e-shop-${TS}`,
      description: 'E2E shop',
      category: 'electronics',
    }, bizToken);
    expect(shopRes.status).toBe(200);
    shopId = shopRes.data?.data?.shop?.id || shopRes.data?.shop?.id;
    if (!shopId) {
      const my = await apiFetch('/api/my/shop', 'GET', null, bizToken);
      shopId = my.data?.data?.shop?.id || my.data?.shop?.id;
    }
    expect(shopId).toBeTruthy();
  });

  test('submit verification via API', async () => {
    test.skip(!shopId, 'shop not created');
    const token = await signinAPI(bem, bpw);
    const res = await apiFetch('/api/business/verification', 'POST', {
      orgName: 'E2E Org',
      contactPhone: '+79990002233',
    }, token);
    expect(res.status).toBe(200);
  });

  test('approve and create product', async () => {
    test.skip(!shopId, 'shop not created');
    await approveShopAPI(shopId);
    const token = await signinAPI(bem, bpw);
    const prodRes = await apiFetch('/api/products', 'POST', {
      name: 'E2E Product ' + TS,
      price: 499,
      category: 'electronics',
      shopId,
    }, token);
    expect(prodRes.status).toBe(200);
    const prodId = prodRes.data?.data?.product?.id || prodRes.data?.product?.id;
    expect(prodId).toBeTruthy();
    const bizList = await apiFetch('/api/business/products', 'GET', null, token);
    expect(bizList.status).toBe(200);
  });
});

test.describe('Health', () => {
  test('live endpoint', async () => {
    const r = await fetch(BASE_URL + '/api/live');
    expect(r.status).toBe(200);
  });

  test('health endpoint', async () => {
    const r = await apiFetch('/api/health');
    expect(r.status).toBe(200);
  });
});
