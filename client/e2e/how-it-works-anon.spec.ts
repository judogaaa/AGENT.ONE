import { test, expect } from '@playwright/test';

const BASE = process.env.AGENT_ONE_E2E_BASE_URL || 'http://localhost:18080';

test.describe('anonymous how-it-works', () => {
  test('guest sees unified buyer+business steps', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    const bodyText = await page.locator('body').innerText();

    expect(bodyText, 'guest subtitle').toContain('Три шага для покупателей и бизнеса');
    expect(bodyText, 'step 1').toContain('Выберите свою цель');
    expect(bodyText, 'step 2').toContain('Используйте AI-помощника');
    expect(bodyText, 'step 3').toContain('Покупайте и продавайте');

    expect(bodyText, 'client subtitle absent').not.toContain('Три шага до выгодной покупки с AI');
    expect(bodyText, 'client step 1 absent').not.toContain('Найдите товар');
    expect(bodyText, 'client step 2 absent').not.toContain('Сравните с AI');
    expect(bodyText, 'client step 3 absent').not.toContain('Оформите заказ');

    expect(bodyText.includes('01') && bodyText.includes('02') && bodyText.includes('03'), 'all three step numbers present').toBe(true);
    expect(errors, 'no page errors').toEqual([]);
  });
});
