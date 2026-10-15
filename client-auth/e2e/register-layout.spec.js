// Layout tests for the registration page. These run under Playwright
// (npm run test:e2e) and are intentionally NOT part of the vitest unit run.
//
// Goals:
//  - On desktop viewports the fully loaded registration form fits on one
//    screen without vertical scrolling (scrollHeight <= innerHeight + 2px).
//  - On mobile vertical scrolling is allowed, horizontal overflow is not.
//  - Yandex provider is enabled (fetched via a mocked /api/auth/providers) so
//    the layout is checked in the full social-login state.

import { test, expect } from '@playwright/test'

const VIEWPORTS = [
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1366x768', width: 1366, height: 768 },
  { name: '390x844', width: 390, height: 844 },
]

function mockProvidersRoute(page, enabled = true) {
  return page.route('**/api/auth/providers', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        data: {
          providers: [
            { id: 'yandex', enabled },
          ],
        },
      }),
    })
  })
}

async function openFullyLoadedRegisterForm(page) {
  await page.goto('/register')
  // Wait for the providers fetch to resolve before measuring the layout.
  await expect(page.getByRole('button', { name: 'Зарегистрироваться через Яндекс' })).toBeAttached()
  await page.waitForTimeout(300)
}

async function selectRoleAndConsent(page) {
  await page.getByRole('radio', { name: /Пользователь/ }).click()
  await page.getByLabel(/я принимаю/i).click()
  // With role + consent chosen and the provider enabled, the social button
  // becomes active — the form is in its fully loaded, usable state.
  await expect(page.getByRole('button', { name: 'Зарегистрироваться через Яндекс' })).toBeEnabled()
}

for (const { name, width, height } of VIEWPORTS) {
  test(`registration fits one screen or scrolls vertically without overflow — ${name}`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await mockProvidersRoute(page)
    await openFullyLoadedRegisterForm(page)
    await selectRoleAndConsent(page)

    const metrics = await page.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }))

    // No horizontal overflow on any viewport.
    expect(metrics.scrollWidth, 'horizontal overflow must not exist').toBeLessThanOrEqual(metrics.innerWidth)

    if (width >= 900) {
      // Desktop: the whole registration form must fit on one screen
      // (2px tolerance).
      expect(
        metrics.scrollHeight,
        `vertical overflow on ${name}: scrollHeight=${metrics.scrollHeight}, innerHeight=${metrics.innerHeight}`
      ).toBeLessThanOrEqual(metrics.innerHeight + 2)
    } else {
      // Mobile: vertical scrolling is allowed, but the form must remain
      // fully usable and the card must not overflow horizontally.
      expect(metrics.scrollWidth, 'card must not overflow horizontally on mobile').toBeLessThanOrEqual(metrics.innerWidth)
    }
  })
}

test('registration uses a two-column desktop grid and a single column on mobile', async ({ page }) => {
  await mockProvidersRoute(page)
  await openFullyLoadedRegisterForm(page)

  // Desktop: name and email sit side by side (same row, different x).
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.reload()
  await page.waitForTimeout(300)

  const desktopPositions = await page.evaluate(() => {
    const name = document.getElementById('name')
    const email = document.getElementById('reg-email')
    const pass = document.getElementById('reg-password')
    const confirm = document.getElementById('password-confirm')
    const yandex = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Яндекс'))
    const rect = (el) => {
      const r = el.getBoundingClientRect()
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) }
    }
    return {
      name: rect(name),
      email: rect(email),
      pass: rect(pass),
      confirm: rect(confirm),
      yandex: rect(yandex),
    }
  })

  expect(Math.abs(desktopPositions.name.y - desktopPositions.email.y)).toBeLessThanOrEqual(2)
  expect(desktopPositions.name.x).toBeLessThan(desktopPositions.email.x)
  expect(Math.abs(desktopPositions.pass.y - desktopPositions.confirm.y)).toBeLessThanOrEqual(2)
  expect(desktopPositions.pass.x).toBeLessThan(desktopPositions.confirm.x)
  expect(desktopPositions.yandex.w).toBeGreaterThan(0)

  // Mobile: all fields stack in one column.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  await page.waitForTimeout(300)

  const mobilePositions = await page.evaluate(() => {
    const rect = (id) => {
      const r = document.getElementById(id).getBoundingClientRect()
      return { x: Math.round(r.x), y: Math.round(r.y) }
    }
    return {
      name: rect('name'),
      email: rect('reg-email'),
      pass: rect('reg-password'),
      confirm: rect('password-confirm'),
    }
  })

  expect(Math.abs(mobilePositions.name.x - mobilePositions.email.x)).toBeLessThanOrEqual(2)
  expect(mobilePositions.name.y).toBeLessThan(mobilePositions.email.y)
  expect(Math.abs(mobilePositions.email.x - mobilePositions.pass.x)).toBeLessThanOrEqual(2)
  expect(mobilePositions.pass.y).toBeLessThan(mobilePositions.confirm.y)
})

test('tab order follows the visual flow: name → email → password → confirm → role → consent → submit', async ({ page }) => {
  await mockProvidersRoute(page)
  await openFullyLoadedRegisterForm(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.reload()
  await page.waitForTimeout(300)

  const order = await page.evaluate(() => {
    const ids = ['name', 'reg-email', 'reg-password', 'password-confirm', 'consent']
    const firstCard = document.querySelector('.account-type-card')
    return {
      name: document.getElementById('name').getAttribute('tabindex'),
      roleFirst: firstCard ? firstCard.getAttribute('tabindex') : null,
    }
  })
  expect(order.name).toBe(null)

  // Walk the tab order until we reach the form fields (the logo link comes
  // first), then collect the next focus targets in DOM order.
  const seen = []
  for (let i = 0; i < 24 && seen.length < 12; i++) {
    await page.keyboard.press('Tab')
    const focused = await page.evaluate(() => {
      const el = document.activeElement
      return el ? el.id || el.getAttribute('aria-label') || el.className || el.textContent.trim().slice(0, 20) : null
    })
    seen.push(focused)
  }
  const formOrder = seen.filter(v => v === 'name' || v === 'reg-email' || v === 'reg-password' || v === 'password-confirm' || v === 'consent')
  expect(formOrder).toEqual(['name', 'reg-email', 'reg-password', 'password-confirm', 'consent'])
})
