import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import RegisterPage from '../pages/RegisterPage'
import App from '../App'
import LegalHub from '@legal/components/LegalHub.jsx'
import CookieBanner, { openCookieSettings } from '@legal/components/CookieBanner.jsx'
import { LEGAL_PAGES, LEGAL_FOOTER_LINKS, LEGAL_HUB_SECTIONS } from '@legal/config.js'
import { COOKIE_STORAGE_KEY } from '@legal/cookieCategories.js'
import { resetAnalyticsForTests } from '@legal/analyticsGate.js'
import { LEGAL_DOCUMENTS } from '@legal/documents.js'
import { PUBLIC_CONTACTS, PUBLIC_ADMIN_NAME, COMMERCIAL_REQUISITES_NOTICE } from '@legal/config.js'

vi.mock('../utils/auth', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    signup: vi.fn(async () => ({ token: 't', profile: { role: 'client' } })),
    fetchProviders: vi.fn(async () => [{ id: 'yandex', enabled: true }]),
    buildCompleteUrl: vi.fn(() => 'http://main/auth/complete'),
    getYandexOAuthUrl: vi.fn(() => '/api/auth/oauth/yandex/start?mode=signup'),
  }
})

function fillRegisterForm({ pdConsent = false, termsConsent = false } = {}) {
  fireEvent.change(screen.getByLabelText(/^Имя$/i), { target: { value: 'Ivan' } })
  fireEvent.change(screen.getByLabelText(/^Email$/i), { target: { value: 'a@b.com' } })
  fireEvent.change(screen.getByLabelText(/^Пароль$/i), { target: { value: '123456' } })
  fireEvent.change(screen.getByLabelText(/Подтверждение/i), { target: { value: '123456' } })
  fireEvent.click(screen.getAllByRole('radio', { name: /Пользователь/i })[0])
  if (termsConsent) fireEvent.click(document.getElementById('terms-consent'))
  if (pdConsent) fireEvent.click(document.getElementById('pd-consent'))
}

afterEach(() => {
  cleanup()
  localStorage.removeItem(COOKIE_STORAGE_KEY)
  resetAnalyticsForTests()
})

describe('RegisterPage PD consent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('blocks submit without mandatory PD consent', async () => {
    const { signup } = await import('../utils/auth')
    render(<MemoryRouter><RegisterPage /></MemoryRouter>)
    fillRegisterForm({ termsConsent: true, pdConsent: false })
    fireEvent.click(screen.getByRole('button', { name: /Создать аккаунт/i }))
    expect(signup).not.toHaveBeenCalled()
    expect(screen.getByText(/согласие на обработку персональных данных/i)).toBeTruthy()
  })

  it('does not require marketing consent', () => {
    render(<MemoryRouter><RegisterPage /></MemoryRouter>)
    expect(screen.queryByLabelText(/рекламные/i)).toBeNull()
  })
})

describe('auth App legal footer', () => {
  it('renders footer links to legal hub and key documents', () => {
    render(<MemoryRouter initialEntries={['/login']}><App /></MemoryRouter>)
    for (const page of LEGAL_FOOTER_LINKS) {
      expect(screen.getAllByRole('link', { name: page.title }).length).toBeGreaterThan(0)
    }
    expect(screen.queryByRole('button', { name: /Настройки cookie/i })).toBeNull()
  })
})

describe('legal routes', () => {
  it('opens legal hub', () => {
    render(<MemoryRouter initialEntries={['/legal']}><App /></MemoryRouter>)
    expect(screen.getAllByRole('heading', { name: /Юридический центр/i }).length).toBeGreaterThan(0)
    for (const section of LEGAL_HUB_SECTIONS) {
      expect(screen.getByRole('heading', { name: section.title })).toBeTruthy()
    }
  })

  it('opens privacy legal page', () => {
    render(<MemoryRouter initialEntries={['/legal/privacy']}><App /></MemoryRouter>)
    expect(screen.getAllByRole('heading', { name: /Политика обработки персональных данных/i }).length).toBeGreaterThan(0)
  })

  it('renders clickable public contacts on requisites page', () => {
    render(<MemoryRouter initialEntries={['/legal/requisites']}><App /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: PUBLIC_CONTACTS.platformTitle })).toBeTruthy()
    if (PUBLIC_CONTACTS.email) {
      expect(screen.getByRole('link', { name: PUBLIC_CONTACTS.email }).getAttribute('href')).toBe('mailto:' + PUBLIC_CONTACTS.email)
    }
    if (PUBLIC_CONTACTS.telegram && PUBLIC_CONTACTS.telegramUrl) {
      expect(screen.getByRole('link', { name: PUBLIC_CONTACTS.telegram }).getAttribute('href')).toBe(PUBLIC_CONTACTS.telegramUrl)
    }
    if (!PUBLIC_CONTACTS.email && !PUBLIC_CONTACTS.telegramUrl) {
      expect(screen.getByText(/Контакты не настроены/i)).toBeTruthy()
    }
  })

  it('opens all legal document slugs', () => {
    for (const page of LEGAL_PAGES) {
      cleanup()
      render(<MemoryRouter initialEntries={[page.path]}><App /></MemoryRouter>)
      expect(screen.getAllByRole('heading', { name: page.title }).length).toBeGreaterThan(0)
    }
  })
})

describe('cookie banner', () => {
  it('appears on first visit', () => {
    render(<MemoryRouter><CookieBanner useRouterLink LinkComponent={undefined} /></MemoryRouter>)
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText(/AGENT\.ONE использует файлы cookie/i)).toBeTruthy()
  })

  it('necessary-only keeps optional categories disabled', async () => {
    render(<CookieBanner />)
    fireEvent.click(screen.getByRole('button', { name: /^Отклонить$/i }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    const saved = JSON.parse(localStorage.getItem(COOKIE_STORAGE_KEY))
    expect(saved.categories.necessary).toBe(true)
    expect(saved.categories.functional).toBe(false)
    expect(saved.categories.analytics).toBe(false)
    expect(saved.categories.marketing).toBe(false)
    expect(saved.decidedAt).toBeTruthy()
    expect(saved.version).toBeTruthy()
  })

  it('reopens accept/reject banner from internal settings event', async () => {
    localStorage.setItem(COOKIE_STORAGE_KEY, JSON.stringify({
      version: '2026-08-03-cookie-v1',
      decidedAt: new Date().toISOString(),
      categories: { necessary: true, functional: false, analytics: false, marketing: false },
    }))
    render(<CookieBanner />)
    expect(screen.queryByRole('dialog')).toBeNull()
    openCookieSettings()
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeTruthy()
      expect(screen.getByRole('button', { name: /^Принять$/i })).toBeTruthy()
      expect(screen.getByRole('button', { name: /^Отклонить$/i })).toBeTruthy()
      expect(screen.queryByRole('button', { name: /Сохранить выбор/i })).toBeNull()
    })
  })

  it('cookies policy page can reset choice and reopen banner', async () => {
    localStorage.setItem(COOKIE_STORAGE_KEY, JSON.stringify({
      version: '2026-08-03-cookie-v1',
      decidedAt: new Date().toISOString(),
      categories: { necessary: true, functional: true, analytics: false, marketing: false },
    }))
    render(
      <MemoryRouter initialEntries={['/legal/cookies']}>
        <App />
      </MemoryRouter>
    )
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Изменить выбор cookie/i }))
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeTruthy()
      expect(screen.getByRole('button', { name: /^Принять$/i })).toBeTruthy()
      expect(screen.getByRole('button', { name: /^Отклонить$/i })).toBeTruthy()
    })
    expect(localStorage.getItem(COOKIE_STORAGE_KEY)).toBeNull()
  })
})

describe('public legal documents safety', () => {
  const forbidden = [
    /GROQ_API_KEY/i,
    /OPENROUTER/i,
    /JWT_SECRET/i,
    /DATABASE_URL/i,
    /llama-/i,
    /gemma/i,
    /api\.groq\.com/i,
    /openrouter\.ai/i,
    /agentone_sso_refresh_token/,
    /bcrypt/i,
    /PostgreSQL/i,
    /Redis/i,
  ]

  it('documents contain no secrets or internal infra details', () => {
    const blob = JSON.stringify(LEGAL_DOCUMENTS)
    for (const pattern of forbidden) {
      expect(blob).not.toMatch(pattern)
    }
  })

  it('documents mention AI neutrally', () => {
    const blob = JSON.stringify(LEGAL_DOCUMENTS)
    expect(blob).toMatch(/внешние информационные системы/i)
    expect(blob).toMatch(/не должны передаваться платёжные реквизиты/i)
  })

  it('documents use public admin contacts and omit owner personal data', () => {
    const blob = JSON.stringify(LEGAL_DOCUMENTS)
    expect(blob).toMatch(PUBLIC_CONTACTS.email)
    expect(blob).toMatch(PUBLIC_CONTACTS.telegram)
    expect(blob).toMatch(PUBLIC_ADMIN_NAME)
    expect(blob).not.toMatch(/\[REQUIRED:/i)
    expect(blob).not.toMatch(/Оператор персональных данных/i)
    expect(blob).not.toMatch(/Телефон:/i)
    expect(blob).not.toMatch(/Наименование \/ ФИО/i)
    expect(blob).not.toMatch(/birthDate|patronymic|дата рождения|отчество/i)
  })

  it('requisites page states commercial details are pending', () => {
    const requisites = LEGAL_DOCUMENTS.requisites
    const blob = JSON.stringify(requisites)
    expect(blob).toMatch(COMMERCIAL_REQUISITES_NOTICE)
  })
})

describe('LegalHub standalone', () => {
  it('lists hub sections with document links', () => {
    render(<MemoryRouter><LegalHub useRouterLink={false} /></MemoryRouter>)
    expect(screen.getAllByRole('heading', { name: /Юридический центр/i }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('link').length).toBeGreaterThanOrEqual(LEGAL_PAGES.length)
  })
})
