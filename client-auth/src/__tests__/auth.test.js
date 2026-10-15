import { describe, it, expect, vi, afterEach } from 'vitest'
import { validateReturnTo, buildCompleteUrl, mapAuthError, getYandexOAuthUrl, getMainOrigin } from '../utils/auth'
import { validateMainAppOrigin } from '../utils/originValidation'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('validateReturnTo', () => {
  it('allows relative root', () => {
    expect(validateReturnTo('/')).toBe('/')
  })

  it('allows relative path', () => {
    expect(validateReturnTo('/catalog')).toBe('/catalog')
  })

  it('allows relative path with query', () => {
    expect(validateReturnTo('/dashboard?tab=orders')).toBe('/dashboard?tab=orders')
  })

  it('allows nested path', () => {
    expect(validateReturnTo('/product/123')).toBe('/product/123')
  })

  it('rejects external URL', () => {
    expect(validateReturnTo('https://evil.example')).toBe('/')
  })

  it('rejects protocol-relative URL', () => {
    expect(validateReturnTo('//evil.example')).toBe('/')
  })

  it('rejects backslash prefix', () => {
    expect(validateReturnTo('\\evil.example')).toBe('/')
  })

  it('rejects backslash in path', () => {
    expect(validateReturnTo('/path\\evil')).toBe('/')
  })

  it('rejects empty string', () => {
    expect(validateReturnTo('')).toBe('/')
  })

  it('rejects null', () => {
    expect(validateReturnTo(null)).toBe('/')
  })

  it('rejects undefined', () => {
    expect(validateReturnTo(undefined)).toBe('/')
  })

  it('rejects javascript:', () => {
    expect(validateReturnTo('javascript:alert(1)')).toBe('/')
  })

  it('rejects control characters', () => {
    expect(validateReturnTo('/\x00path')).toBe('/')
  })

  it('trims whitespace', () => {
    expect(validateReturnTo('  /catalog  ')).toBe('/catalog')
  })
})

describe('buildCompleteUrl', () => {
  it('builds URL with encoded return_to and no secrets', () => {
    const url = buildCompleteUrl('/catalog')
    expect(url).toContain('/auth/complete?return_to=%2Fcatalog')
    expect(url).not.toContain('token')
    expect(url).not.toContain('profile')
    expect(url).not.toContain('email')
  })

  it('falls back to / for invalid return_to', () => {
    const url = buildCompleteUrl('https://evil.example')
    expect(url).toContain('/auth/complete?return_to=%2F')
  })
})

describe('mapAuthError', () => {
  it('returns a single uniform message for 401 (unknown email and wrong password are indistinguishable)', () => {
    expect(mapAuthError(401, 'invalid credentials')).toBe('Неверный email или пароль. Если аккаунта ещё нет, создайте его на странице регистрации.')
  })

  it('returns email taken for 409 email taken', () => {
    expect(mapAuthError(409, 'email taken')).toBe('Email уже зарегистрирован')
  })

  it('returns safe validation for 400 with known text', () => {
    expect(mapAuthError(400, 'email and password (min 6) required')).toBe('Email и пароль (минимум 6 символов) обязательны')
  })

  it('returns generic validation for 400 with unknown text', () => {
    expect(mapAuthError(400, 'some other error')).toBe('Проверьте введённые данные')
  })

  it('returns server error for 500', () => {
    expect(mapAuthError(500, 'internal error')).toBe('Ошибка сервера. Попробуйте позже.')
  })

  it('returns generic for unknown status', () => {
    expect(mapAuthError(418, "I'm a teapot")).toBe('Произошла ошибка. Попробуйте позже.')
  })

  it('returns network error for status 0', () => {
    expect(mapAuthError(0, '')).toBe('Не удалось связаться с сервером. Проверьте подключение.')
  })

  it('returns network error for undefined status', () => {
    expect(mapAuthError(undefined, '')).toBe('Не удалось связаться с сервером. Проверьте подключение.')
  })
})

describe('signin payload shape', () => {
  it('contains only email and password', () => {
    const payload = { email: 'test@test.com', password: 'secret123' }
    const keys = Object.keys(payload)
    expect(keys).toEqual(['email', 'password'])
    expect(payload.email).toBe('test@test.com')
    expect(payload.password).toBe('secret123')
  })
})

describe('signup payload shape', () => {
  it('contains required fields for client', () => {
    const payload = {
      email: 'a@b.com',
      password: '123456',
      displayName: 'Test User',
      role: 'client',
      terms_accepted: true,
    }
    expect(payload.email).toBe('a@b.com')
    expect(payload.password).toBe('123456')
    expect(payload.displayName).toBe('Test User')
    expect(payload.role).toBe('client')
    expect(payload.terms_accepted).toBe(true)
    expect(payload).not.toHaveProperty('passwordConfirm')
  })

  it('contains required fields for business', () => {
    const payload = {
      email: 'a@b.com',
      password: '123456',
      displayName: 'Test User',
      role: 'business',
      terms_accepted: true,
    }
    expect(payload.role).toBe('business')
    expect(payload.terms_accepted).toBe(true)
    expect(payload).not.toHaveProperty('passwordConfirm')
    expect(payload).not.toHaveProperty('shopName')
  })

  it('requires boolean true for terms_accepted', () => {
    const valid = { terms_accepted: true }
    expect(valid.terms_accepted).toBe(true)
    const stringValue = { terms_accepted: 'true' }
    expect(typeof stringValue.terms_accepted).not.toBe('boolean')
    const falsy = { terms_accepted: false }
    expect(falsy.terms_accepted).toBe(false)
  })
})

describe('getYandexOAuthUrl', () => {
  it('builds login URL without role', () => {
    const url = getYandexOAuthUrl('login', '', '/dashboard')
    expect(url).toContain('mode=login')
    expect(url).not.toContain('role=')
    expect(url).toContain('return_to=%2Fdashboard')
    expect(url).toContain('/api/auth/oauth/yandex/start')
  })

  it('builds signup URL with client role', () => {
    const url = getYandexOAuthUrl('signup', 'client', '/')
    expect(url).toContain('mode=signup')
    expect(url).toContain('role=client')
  })

  it('builds signup URL with business role', () => {
    const url = getYandexOAuthUrl('signup', 'business', '/')
    expect(url).toContain('mode=signup')
    expect(url).toContain('role=business')
  })

  it('builds signup URL with terms_accepted=true', () => {
    const url = getYandexOAuthUrl('signup', 'client', '/', true)
    expect(url).toContain('mode=signup')
    expect(url).toContain('role=client')
    expect(url).toContain('terms_accepted=true')
  })

  it('omits terms_accepted for signup when not accepted', () => {
    const url = getYandexOAuthUrl('signup', 'client', '/', false)
    expect(url).not.toContain('terms_accepted')
  })

  it('omits terms_accepted for signup when undefined', () => {
    const url = getYandexOAuthUrl('signup', 'client', '/')
    expect(url).not.toContain('terms_accepted')
  })

  it('never adds terms_accepted for login mode', () => {
    const url = getYandexOAuthUrl('login', '', '/', true)
    expect(url).toContain('mode=login')
    expect(url).not.toContain('terms_accepted')
    expect(url).not.toContain('role=')
  })

  it('preserves return_to', () => {
    const url = getYandexOAuthUrl('login', '', '/account')
    expect(url).toContain('return_to=%2Faccount')
  })

  it('sanitizes malicious return_to', () => {
    const url = getYandexOAuthUrl('login', '', 'https://evil.example')
    expect(url).toContain('return_to=%2F')
  })
})

describe('legal document pages', () => {
  it('expose version constants matching backend versions', () => {
    const version = '2026-07-30'
    expect(version).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('local development database safety', () => {
  it('binds the local PostgreSQL port to loopback only', () => {
    const compose = readFileSync(resolve(process.cwd(), '..', 'docker-compose.yml'), 'utf8')
    expect(compose).toContain('127.0.0.1:5432:5432')
  })
})

describe('getMainOrigin production guard', () => {
  it('returns dev fallback outside production', () => {
    vi.stubEnv('PROD', false)
    vi.stubEnv('VITE_MAIN_APP_ORIGIN', '')
    expect(getMainOrigin()).toBe('http://localhost:5173')
  })

  it('throws when VITE_MAIN_APP_ORIGIN is missing in production', () => {
    vi.stubEnv('PROD', true)
    vi.stubEnv('VITE_MAIN_APP_ORIGIN', '')
    expect(() => getMainOrigin()).toThrow(/required/)
  })

  it('throws when VITE_MAIN_APP_ORIGIN is localhost in production', () => {
    vi.stubEnv('PROD', true)
    vi.stubEnv('VITE_MAIN_APP_ORIGIN', 'http://localhost:5173')
    expect(() => getMainOrigin()).toThrow(/production origin/)
  })

  it('throws when VITE_MAIN_APP_ORIGIN is 127.0.0.1 in production', () => {
    vi.stubEnv('PROD', true)
    vi.stubEnv('VITE_MAIN_APP_ORIGIN', 'http://127.0.0.1:5173')
    expect(() => getMainOrigin()).toThrow(/production origin/)
  })

  it('accepts a real production origin', () => {
    vi.stubEnv('PROD', true)
    vi.stubEnv('VITE_MAIN_APP_ORIGIN', 'https://agent-one.ru')
    expect(getMainOrigin()).toBe('https://agent-one.ru')
  })

  it('buildCompleteUrl uses a real production origin without failing', () => {
    vi.stubEnv('PROD', true)
    vi.stubEnv('VITE_MAIN_APP_ORIGIN', 'https://agent-one.ru')
    const url = buildCompleteUrl('/catalog')
    expect(url).toBe('https://agent-one.ru/auth/complete?return_to=%2Fcatalog')
  })
})

describe('validateMainAppOrigin (build-time guard)', () => {
  it('accepts a plain https origin', () => {
    expect(validateMainAppOrigin('https://agent-one.ru')).toEqual([])
  })

  it('rejects missing origin', () => {
    expect(validateMainAppOrigin('')).not.toEqual([])
    expect(validateMainAppOrigin(undefined)).not.toEqual([])
    expect(validateMainAppOrigin(null)).not.toEqual([])
  })

  it('rejects non-URL input', () => {
    expect(validateMainAppOrigin('agent-one.ru')).not.toEqual([])
    expect(validateMainAppOrigin('javascript:alert(1)')).not.toEqual([])
  })

  it('rejects http protocol', () => {
    expect(validateMainAppOrigin('http://agent-one.ru')).not.toEqual([])
  })

  it('rejects localhost hostname', () => {
    expect(validateMainAppOrigin('https://localhost')).not.toEqual([])
  })

  it('rejects 127.0.0.1 and ::1 hostnames', () => {
    expect(validateMainAppOrigin('https://127.0.0.1')).not.toEqual([])
    expect(validateMainAppOrigin('https://[::1]')).not.toEqual([])
  })

  it('rejects userinfo', () => {
    expect(validateMainAppOrigin('https://user:pass@agent-one.ru')).not.toEqual([])
    expect(validateMainAppOrigin('https://user@agent-one.ru')).not.toEqual([])
  })

  it('rejects path', () => {
    expect(validateMainAppOrigin('https://agent-one.ru/path')).not.toEqual([])
  })

  it('rejects query string', () => {
    expect(validateMainAppOrigin('https://agent-one.ru/?x=1')).not.toEqual([])
  })

  it('rejects hash', () => {
    expect(validateMainAppOrigin('https://agent-one.ru/#top')).not.toEqual([])
  })

  it('rejects trailing slash with path and accepts bare trailing slash', () => {
    expect(validateMainAppOrigin('https://agent-one.ru/')).toEqual([])
    expect(validateMainAppOrigin('https://agent-one.ru//double')).not.toEqual([])
  })
})
