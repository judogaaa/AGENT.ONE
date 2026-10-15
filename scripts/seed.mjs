// Local-only demo setup. Reserved example.com emails; no real customer or server data.
// Start the API at http://127.0.0.1:8080 before running this script.
import http from 'node:http'

const BASE = 'http://127.0.0.1:8080'
const accounts = [
  { email: 'demo-seller@example.com', password: 'LocalDemo!2026', displayName: 'Demo Seller', role: 'business' },
  { email: 'demo-client@example.com', password: 'LocalDemo!2026', displayName: 'Demo Buyer', role: 'client' },
]

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const json = body ? JSON.stringify(body) : null
    const headers = { 'Content-Type': 'application/json' }
    if (token) headers.Authorization = 'Bearer ' + token
    const req = http.request(BASE + path, { method, headers, timeout: 10000 }, res => {
      let text = ''
      res.on('data', chunk => { text += chunk })
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(text) }) }
        catch { resolve({ status: res.statusCode, body: { error: text } }) }
      })
    })
    req.on('timeout', () => req.destroy(new Error('Local API timed out')))
    req.on('error', reject)
    if (json) req.write(json)
    req.end()
  })
}

function ok(response) {
  return response.status >= 200 && response.status < 300 && response.body?.ok === true
}

async function ensureAccount(account) {
  let response = await request('POST', '/api/auth/signup', {
    email: account.email,
    password: account.password,
    displayName: account.displayName,
    role: account.role,
    terms_accepted: true,
    pd_consent: true,
    consent_source: 'local-demo',
  })
  if (!ok(response)) {
    response = await request('POST', '/api/auth/signin', {
      email: account.email,
      password: account.password,
    })
  }
  if (!ok(response)) {
    throw new Error('Local demo account cannot be created or authenticated (' + account.role + ')')
  }
  console.log('Ready: ' + account.role)
  return response.body.data?.token || ''
}

async function main() {
  // The address is deliberately fixed to loopback: this script must never
  // use a production endpoint or user-controlled AGENT_ONE_BASE_URL.
  const health = await request('GET', '/api/health')
  if (health.status !== 200) throw new Error('Local API health check failed')

  for (const account of accounts) await ensureAccount(account)

  console.log('\nLocal demonstration accounts:')
  for (const { role, email, password } of accounts) {
    console.log(role + ': ' + email + ' / ' + password)
  }
  console.log('Use these accounts only against your own local database.')
  console.log('Create or verify a store through business onboarding if required.')
  console.log('This script does not populate the product catalog or create orders.')
}

main().catch(error => {
  console.error('Local seed failed:', error.message)
  process.exitCode = 1
})
