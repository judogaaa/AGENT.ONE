#!/usr/bin/env node
/**
 * Temporary PR pre-merge verifier for production Docker image + auth portal.
 */
const APP = process.env.AGENT_ONE_VERIFY_APP_URL || 'http://127.0.0.1:8080'
const AUTH = process.env.AGENT_ONE_VERIFY_AUTH_URL || ''
const results = []

function ok(label) { results.push({ label, status: 'PASS' }) }
function fail(label, detail) { results.push({ label, status: 'FAIL', detail: String(detail || '') }) }

async function fetchText(url) {
  const res = await fetch(url, { redirect: 'manual' })
  const text = await res.text()
  return { status: res.status, text, headers: res.headers }
}

async function expectStatus(label, url, want = 200) {
  try {
    const r = await fetchText(url)
    if (r.status === want) ok(label)
    else fail(label, `status=${r.status} url=${url}`)
    return r
  } catch (e) {
    fail(label, e.message)
    return null
  }
}

async function expectSpaHtml(label, url) {
  const r = await expectStatus(label + ' status', url, 200)
  if (!r) return
  if (/<!doctype html>/i.test(r.text)) ok(label + ' html')
  else fail(label + ' html', 'missing doctype')
}

async function main() {
  console.log('APP=', APP)
  console.log('AUTH=', AUTH || '(missing)')

  await expectStatus('/api/live', `${APP}/api/live`, 200)
  await expectStatus('/api/health', `${APP}/api/health`, 200)

  // Direct open + refresh of SPA paths must return index.html (not 404)
  for (const path of ['/', '/catalog', '/legal', '/shop/test-shop', '/account', '/dashboard']) {
    await expectSpaHtml(`app ${path}`, `${APP}${path}`)
  }

  const api404 = await fetchText(`${APP}/api/definitely-missing-${Date.now()}`)
  if (api404.status >= 400) ok('unknown api not spa-hijacked')
  else fail('unknown api not spa-hijacked', `status=${api404.status}`)

  const meta = await fetchText(`${APP}/api/legal/meta`)
  if (meta.status === 200) ok('/api/legal/meta')
  else fail('/api/legal/meta', `status=${meta.status}`)

  if (!AUTH) {
    fail('auth portal url missing', 'AGENT_ONE_VERIFY_AUTH_URL unset')
  } else {
    for (const path of ['/login', '/register', '/legal', '/legal/cookies', '/terms', '/privacy']) {
      await expectSpaHtml(`auth ${path}`, `${AUTH}${path}`)
    }
  }

  const fs = await import('node:fs')
  if (!fs.existsSync('migrations') && !fs.existsSync('server/migrations')) ok('no migrations/ directory')
  else fail('migrations directory present')

  const failed = results.filter((r) => r.status === 'FAIL')
  console.log('\nAGENT.ONE PR Docker Verify')
  for (const r of results) {
    console.log(`  ${r.status === 'PASS' ? 'PASS' : 'FAIL'} ${r.label}${r.detail ? ' — ' + r.detail : ''}`)
  }
  console.log(`\nResults: ${results.length - failed.length} passed, ${failed.length} failed`)
  if (failed.length) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
