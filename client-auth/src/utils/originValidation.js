// validateMainAppOrigin checks that VITE_MAIN_APP_ORIGIN is a safe
// production origin. It returns a list of problems (empty when valid).
// Used both by the build-time guard (vite.config.js) and by runtime tests.
export function validateMainAppOrigin(origin) {
  const problems = []
  if (!origin) {
    problems.push('VITE_MAIN_APP_ORIGIN is required for the production build')
    return problems
  }
  let parsed
  try {
    parsed = new URL(origin)
  } catch {
    problems.push(`VITE_MAIN_APP_ORIGIN is not a valid URL: ${origin}`)
    return problems
  }
  if (parsed.protocol !== 'https:') {
    problems.push('protocol must be https:')
  }
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
    problems.push('hostname must not be localhost, 127.0.0.1 or ::1')
  }
  if (parsed.username || parsed.password) {
    problems.push('userinfo is not allowed')
  }
  if (parsed.pathname !== '/' && parsed.pathname !== '') {
    problems.push('path is not allowed')
  }
  if (parsed.search) {
    problems.push('query string is not allowed')
  }
  if (parsed.hash) {
    problems.push('hash is not allowed')
  }
  return problems
}
