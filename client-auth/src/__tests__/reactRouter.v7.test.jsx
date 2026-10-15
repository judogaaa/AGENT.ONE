/**
 * react-router-dom v7 compatibility checks for client-auth.
 * Covers BrowserRouter, Routes/Route/Navigate/Link, redirects, search params.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter, BrowserRouter, Routes, Route, Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import App from '../App.jsx'

function NavProbe() {
  const navigate = useNavigate()
  const location = useLocation()
  return (
    <div>
      <div data-testid="path">{location.pathname}</div>
      <button type="button" onClick={() => navigate('/register')}>go-register</button>
      <Link to="/login?return_to=%2Faccount">to-login</Link>
    </div>
  )
}

function SearchProbe() {
  const [params] = useSearchParams()
  return <div data-testid="return">{params.get('return_to') || ''}</div>
}

describe('react-router-dom v7 auth portal', () => {
  afterEach(() => cleanup())

  it('exports BrowserRouter and mounts App routes', () => {
    expect(typeof BrowserRouter).toBe('function')
    render(
      <MemoryRouter initialEntries={['/login']}>
        <App />
      </MemoryRouter>
    )
    expect(screen.getByRole('heading', { name: /войти/i })).toBeTruthy()
  })

  it('register route renders', () => {
    render(
      <MemoryRouter initialEntries={['/register']}>
        <App />
      </MemoryRouter>
    )
    expect(screen.getByRole('heading', { name: /создать аккаунт|регистрац/i })).toBeTruthy()
  })

  it('legacy /terms and /privacy redirect to /legal/*', () => {
    render(
      <MemoryRouter initialEntries={['/terms']}>
        <App />
      </MemoryRouter>
    )
    expect(document.body.textContent).toMatch(/пользовательск|соглашен|услов/i)

    cleanup()
    render(
      <MemoryRouter initialEntries={['/privacy']}>
        <App />
      </MemoryRouter>
    )
    expect(document.body.textContent).toMatch(/политик|конфиденциальн|персональн/i)
  })

  it('unknown path falls back to /login via Navigate', () => {
    render(
      <MemoryRouter initialEntries={['/does-not-exist']}>
        <App />
      </MemoryRouter>
    )
    expect(screen.getByRole('heading', { name: /войти/i })).toBeTruthy()
  })

  it('Link and useNavigate work under MemoryRouter', () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<NavProbe />} />
          <Route path="/register" element={<div data-testid="reg">registered</div>} />
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByTestId('path').textContent).toBe('/login')
    fireEvent.click(screen.getByRole('button', { name: 'go-register' }))
    expect(screen.getByTestId('reg')).toBeTruthy()
  })

  it('useSearchParams reads return_to', () => {
    render(
      <MemoryRouter initialEntries={['/login?return_to=%2Fdashboard']}>
        <Routes>
          <Route path="/login" element={<SearchProbe />} />
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByTestId('return').textContent).toBe('/dashboard')
  })

  it('legal hub and cookie policy routes resolve', () => {
    render(
      <MemoryRouter initialEntries={['/legal']}>
        <App />
      </MemoryRouter>
    )
    expect(document.body.textContent).toMatch(/юридическ/i)

    cleanup()
    render(
      <MemoryRouter initialEntries={['/legal/cookies']}>
        <App />
      </MemoryRouter>
    )
    expect(document.body.textContent).toMatch(/cookie/i)
  })
})
