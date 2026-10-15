// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import LoginPage from '../pages/LoginPage'

const originalLocation = window.location

function stubLocation() {
  delete window.location
  const navigations = []
  window.location = {
    ...originalLocation,
    get href() {
      return navigations.length ? navigations[navigations.length - 1] : ''
    },
    set href(url) {
      navigations.push(String(url))
    },
    assign: vi.fn(url => navigations.push(String(url))),
    replace: vi.fn(url => navigations.push(String(url))),
    navigations,
  }
}

function mockProviders(overrides) {
  const providers = [{ id: 'yandex', enabled: overrides?.yandex ?? true }]
  global.fetch = vi.fn().mockImplementation(async (url) => {
    if (String(url).includes('/api/auth/providers')) {
      return { ok: true, json: async () => ({ ok: true, data: { providers } }) }
    }
    return { ok: false, status: 404, json: async () => ({ ok: false, error: 'not found' }) }
  })
}

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login?return_to=%2Fdashboard']}>
      <LoginPage />
    </MemoryRouter>
  )
}

function mockFailFetch() {
  global.fetch = vi.fn().mockImplementation(async (url) => {
    if (String(url).includes('/api/auth/providers')) {
      return { ok: true, json: async () => ({ ok: true, data: { providers: [{ id: 'yandex', enabled: true }] } }) }
    }
    if (String(url).includes('/api/auth/signin')) {
      return { ok: false, status: 401, json: async () => ({ ok: false, error: 'invalid credentials' }) }
    }
    return { ok: false, status: 500, json: async () => ({ ok: false, error: 'unexpected' }) }
  })
}

async function attemptFailLogin() {
  mockFailFetch()
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'missing@test.com' } })
  fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: 'wrong-pass' } })
  fireEvent.click(screen.getByRole('button', { name: 'Войти' }))
  await waitFor(() => {
    expect(screen.getByText(/Неверный email или пароль/)).toBeTruthy()
  })
}

async function failEmailLogin() {
  renderLogin()
  await attemptFailLogin()
}

beforeEach(() => {
  stubLocation()
  mockProviders()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.location = originalLocation
})

describe('LoginPage — email and Yandex only', () => {
  it('renders login form and only the Yandex social button', () => {
    renderLogin()
    expect(screen.getByRole('heading', { name: 'Войти' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Войти' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Продолжить с Яндексом' })).toBeTruthy()
    expect(screen.queryByText(/telegram/i)).toBeNull()
  })

  it('renders the footer registration link preserving the safe return_to', () => {
    renderLogin()
    const link = screen.getByRole('link', { name: /создать аккаунт/i })
    expect(link.getAttribute('href')).toBe('/register?return_to=%2Fdashboard')
  })
})

describe('LoginPage — Yandex login URL', () => {
  it('has mode=login and no signup parameters', () => {
    renderLogin()
    fireEvent.click(screen.getByRole('button', { name: 'Продолжить с Яндексом' }))
    const href = window.location.href
    expect(href).toContain('/api/auth/oauth/yandex/start')
    expect(href).toContain('mode=login')
    expect(href).not.toContain('role=')
    expect(href).not.toContain('terms_accepted')
  })

  it('a double click on the Yandex button fires exactly one redirect', () => {
    renderLogin()
    const btn = screen.getByRole('button', { name: 'Продолжить с Яндексом' })
    fireEvent.click(btn)
    fireEvent.click(btn)
    expect(window.location.navigations).toHaveLength(1)
    expect(window.location.navigations[0]).toContain('/api/auth/oauth/yandex/start')
  })
})

describe('LoginPage — email login', () => {
  it('submits email+password and redirects to /auth/complete', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, data: { token: 't', profile: { role: 'client' } } }),
    })
    renderLogin()
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'test@test.com' } })
    fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }))
    await waitFor(() => {
      expect(window.location.assign).toHaveBeenCalledWith(expect.stringContaining('/auth/complete?return_to=%2Fdashboard'))
    })
  })

  it('shows a single uniform message for invalid credentials and does not redirect', async () => {
    await failEmailLogin()
    expect(screen.getByText('Неверный email или пароль. Если аккаунта ещё нет, создайте его на странице регистрации.')).toBeTruthy()
    expect(window.location.assign).not.toHaveBeenCalled()
    expect(window.location.navigations).toHaveLength(0)
  })
})

describe('LoginPage — explicit registration action after invalid credentials', () => {
  it('shows the explicit registration button only after invalid credentials', async () => {
    renderLogin()
    expect(document.querySelector('.auth-error-action a')).toBeNull()
    await attemptFailLogin()
    const actionBtn = document.querySelector('.auth-error-action a')
    expect(actionBtn).toBeTruthy()
    expect(actionBtn.textContent.trim()).toBe('Создать аккаунт')
  })

  it('opens /register only, preserving safe return_to and nothing else', async () => {
    await failEmailLogin()
    const href = document.querySelector('.auth-error-action a').getAttribute('href')
    expect(href).toBe('/register?return_to=%2Fdashboard')
    expect(href).not.toContain('role=')
    expect(href).not.toContain('terms_accepted')
    expect(href).not.toContain('email=')
    expect(href).not.toContain('password=')
  })
})

describe('LoginPage — provider availability', () => {
  it('disables the Yandex button when providers report it disabled', async () => {
    mockProviders({ yandex: false })
    renderLogin()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Продолжить с Яндексом' }).disabled).toBe(true)
    })
  })
})
