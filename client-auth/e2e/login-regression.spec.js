// Regression check: the compact registration layout must not affect the
// login page (shared AuthLayout / auth.css).

import { test, expect } from '@playwright/test'

test('login page keeps its narrow single-column card', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/login')

  const metrics = await page.evaluate(() => {
    const card = document.querySelector('.auth-card')
    const r = card.getBoundingClientRect()
    return { width: Math.round(r.width), maxWidth: getComputedStyle(card).maxWidth }
  })

  // The login card stays narrow (the wide variant is registration-only).
  const hasWide = await page.evaluate(() => !!document.querySelector('.auth-card--wide'))
  expect(metrics.maxWidth).toBe('420px')
  expect(metrics.width).toBeLessThanOrEqual(420)
  expect(hasWide).toBe(false)
})
