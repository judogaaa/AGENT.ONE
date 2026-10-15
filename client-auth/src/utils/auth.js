export function getMainOrigin() {
  const origin = import.meta.env.VITE_MAIN_APP_ORIGIN
  if (import.meta.env.PROD) {
    if (!origin) {
      throw new Error('VITE_MAIN_APP_ORIGIN is required for the production build')
    }
    if (/localhost|127\.0\.0\.1/i.test(origin)) {
      throw new Error('VITE_MAIN_APP_ORIGIN must be a real production origin')
    }
  }
  return origin || 'http://localhost:5173'
}

export function validateReturnTo(returnTo) {
  if (!returnTo || typeof returnTo !== 'string') return '/'
  const trimmed = returnTo.trim()
  if (!trimmed.startsWith('/')) return '/'
  if (trimmed.startsWith('//')) return '/'
  if (/[\\\x00-\x1f\x7f]/.test(trimmed)) return '/'
  try {
    const url = new URL(trimmed, 'http://dummy')
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '/'
    if (url.hostname !== 'dummy') return '/'
  } catch {
    return '/'
  }
  return trimmed
}

export function buildCompleteUrl(returnTo) {
  const safe = validateReturnTo(returnTo)
  const origin = getMainOrigin().replace(/\/+$/, '')
  return origin + '/auth/complete?return_to=' + encodeURIComponent(safe)
}

export function mapAuthError(status, errorText) {
  // A single uniform message for both an unknown email and a wrong password:
  // the user must not be able to tell whether an email is registered.
  if (status === 401) return 'Неверный email или пароль. Если аккаунта ещё нет, создайте его на странице регистрации.'
  if (status === 409 && errorText === 'email taken') return 'Email уже зарегистрирован'
  if (status === 400) {
    if (errorText === 'email and password (min 6) required') return 'Email и пароль (минимум 6 символов) обязательны'
    return 'Проверьте введённые данные'
  }
  if (status >= 500) return 'Ошибка сервера. Попробуйте позже.'
  if (status === 0 || status === undefined) return 'Не удалось связаться с сервером. Проверьте подключение.'
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'Нет подключения к интернету'
  return 'Произошла ошибка. Попробуйте позже.'
}

export async function signin(email, password) {
  const response = await fetch('/api/auth/signin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  })
  const data = await response.json()
  if (!response.ok || !data.ok) {
    const err = new Error(mapAuthError(response.status, data.error))
    err.status = response.status
    throw err
  }
  return data.data
}

export function getYandexOAuthUrl(mode, role, returnTo, termsAccepted, pdConsent) {
  return buildOAuthStartUrl('/api/auth/oauth/yandex/start', mode, role, returnTo, termsAccepted, pdConsent)
}

function buildOAuthStartUrl(path, mode, role, returnTo, termsAccepted, pdConsent) {
  const params = new URLSearchParams()
  params.set('mode', mode)
  if (mode === 'signup' && role) {
    params.set('role', role)
  }
  if (mode === 'signup' && termsAccepted === true) {
    params.set('terms_accepted', 'true')
  }
  if (mode === 'signup' && pdConsent === true) {
    params.set('pd_consent', 'true')
  }
  const safeReturnTo = validateReturnTo(returnTo)
  params.set('return_to', safeReturnTo)
  return path + '?' + params.toString()
}

export async function fetchProviders() {
  try {
    const res = await fetch('/api/auth/providers', { credentials: 'include' })
    if (!res.ok) return []
    const data = await res.json()
    if (!data.ok) return []
    return data.data.providers || []
  } catch {
    return []
  }
}

export async function signup(payload) {
  const response = await fetch('/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  })
  const data = await response.json()
  if (!response.ok || !data.ok) {
    const err = new Error(mapAuthError(response.status, data.error))
    err.status = response.status
    throw err
  }
  return data.data
}
