import { test, expect } from '@playwright/test';

const BASE = process.env.AGENT_ONE_E2E_BASE_URL || 'http://localhost:18080';

test.describe('fly-to-cart visible', () => {
  test('ghost flies visibly with large size', async ({ page }) => {
    const ts = Date.now();
    const signupRes = await page.request.post(BASE + '/api/auth/signup', {
      data: {
        email: `flyvis-${ts}@test.ru`,
        password: 'test123456',
        displayName: 'FV',
        role: 'client',
        terms_accepted: true,
        pd_consent: true,
        consent_source: 'browser_e2e',
      },
    });
    const token = (await signupRes.json())?.data?.token;
    expect(token, 'signup token').toBeTruthy();

    await page.goto(BASE);
    await page.evaluate((t) => {
      localStorage.setItem('token', t);
      location.reload();
    }, token);
    await page.waitForTimeout(2000);
    await page.locator('button').filter({ hasText: 'Смотреть каталог' }).first().click();
    await page.waitForTimeout(2000);

    const details = page.locator('button').filter({ hasText: 'Подробнее' }).first();
    if ((await details.count()) === 0) {
      test.skip(true, 'no catalog products available in this environment');
    }
    await details.click();
    await page.waitForTimeout(2000);

    const srcImg = page.locator('img[alt]').first();
    const srcBox = await srcImg.boundingBox();
    if (!srcBox || srcBox.width < 30) {
      test.skip(true, `source image too small: ${JSON.stringify(srcBox)}`);
    }

    const cartBtn = page.locator('button').filter({ hasText: 'В корзину' }).first();
    await cartBtn.click();

    const ghost = page.locator('[data-fly-to-cart-ghost="true"]');
    await ghost.waitFor({ state: 'visible', timeout: 3000 });
    const startBox = await ghost.boundingBox();
    expect(startBox, 'ghost start box').toBeTruthy();
    expect(startBox.width).toBeGreaterThan(20);
  });
});
