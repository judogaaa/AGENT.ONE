// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import RegisterPage from '../pages/RegisterPage'

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
    if (String(url).includes('/api/auth/signup')) {
      return { ok: true, json: async () => ({ ok: true, data: { token: 't', profile: { role: 'client' } } }) }
    }
    return { ok: false, status: 404, json: async () => ({ ok: false, error: 'not found' }) }
  })
}

function renderRegister() {
  return render(
    <MemoryRouter initialEntries={['/register?return_to=%2Faccount']}>
      <RegisterPage />
    </MemoryRouter>
  )
}

function selectRoleAndConsent(role = /Пользователь/) {
  fireEvent.click(screen.getByRole('radio', { name: role }))
  fireEvent.click(screen.getByLabelText(/Пользовательское соглашение/i))
  fireEvent.click(screen.getByLabelText(/согласие на обработку персональных данных/i))
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

describe('RegisterPage — email and Yandex only', () => {
  it('renders registration form and only the Yandex social button', () => {
    renderRegister()
    expect(screen.getByRole('heading', { name: 'Создать аккаунт' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Создать аккаунт' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Зарегистрироваться через Яндекс' })).toBeTruthy()
    expect(screen.queryByText(/telegram/i)).toBeNull()
  })

  it('keeps email and Yandex signup disabled until role and consent are selected', () => {
    renderRegister()
    expect(screen.getByRole('button', { name: 'Создать аккаунт' }).disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Зарегистрироваться через Яндекс' }).disabled).toBe(true)
    selectRoleAndConsent()
    expect(screen.getByRole('button', { name: 'Создать аккаунт' }).disabled).toBe(false)
    expect(screen.getByRole('button', { name: 'Зарегистрироваться через Яндекс' }).disabled).toBe(false)
  })
})

describe('RegisterPage — email signup', () => {
  it('submits role and consent only through explicit registration', async () => {
    renderRegister()
    fireEvent.change(screen.getByLabelText('Имя'), { target: { value: 'Ivan' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ivan@example.com' } })
    fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: '123456' } })
    fireEvent.change(screen.getByLabelText('Подтверждение пароля'), { target: { value: '123456' } })
    selectRoleAndConsent()
    fireEvent.click(screen.getByRole('button', { name: 'Создать аккаунт' }))

    await waitFor(() => expect(window.location.assign).toHaveBeenCalledWith(expect.stringContaining('/auth/complete?return_to=%2Faccount')))
    const signupCall = global.fetch.mock.calls.find(([u]) => String(u).includes('/api/auth/signup'))
    expect(signupCall).toBeTruthy()
    const payload = JSON.parse(signupCall[1].body)
    expect(payload.role).toBe('client')
    expect(payload.terms_accepted).toBe(true)
    expect(payload.pd_consent).toBe(true)
  })
})

describe('RegisterPage — Yandex signup', () => {
  it('carries signup mode, selected role, consent and safe return_to', () => {
    renderRegister()
    selectRoleAndConsent(/Бизнес/)
    fireEvent.click(screen.getByRole('button', { name: 'Зарегистрироваться через Яндекс' }))
    expect(window.location.navigations).toHaveLength(1)
    const href = window.location.navigations[0]
    expect(href).toContain('/api/auth/oauth/yandex/start')
    expect(href).toContain('mode=signup')
    expect(href).toContain('role=business')
    expect(href).toContain('terms_accepted=true')
    expect(href).toContain('return_to=%2Faccount')
  })

  it('a double click on the Yandex button fires exactly one redirect', () => {
    renderRegister()
    selectRoleAndConsent()
    const btn = screen.getByRole('button', { name: 'Зарегистрироваться через Яндекс' })
    fireEvent.click(btn)
    fireEvent.click(btn)
    expect(window.location.navigations).toHaveLength(1)
  })

  it('disables the Yandex button when providers report it disabled', async () => {
    mockProviders({ yandex: false })
    renderRegister()
    selectRoleAndConsent()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Зарегистрироваться через Яндекс' }).disabled).toBe(true)
    })
  })
})
