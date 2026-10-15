import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import React from 'react';
import AuthCompletePage from './AuthCompletePage';

function mockStore() {
  const listeners = [];
  return {
    setUser: vi.fn(),
    token: null,
    user: null,
    notify() { listeners.forEach(fn => fn()); },
    subscribe(fn) { listeners.push(fn); },
  };
}

function setup(overrides = {}) {
  const store = mockStore();
  const mockRefresh = vi.fn();

  global.fetch = vi.fn();

  // Set up window.location.search
  const search = overrides.search || '';
  Object.defineProperty(window, 'location', {
    value: {
      search,
      replace: vi.fn(),
      assign: vi.fn(),
    },
    writable: true,
  });

  return { store, mockRefresh };
}

// We need to mock useStore
vi.mock('../hooks/useStore', () => ({
  useStore: () => globalThis.__mockStore,
}));

describe('AuthCompletePage error handling', () => {
  beforeEach(() => {
    globalThis.__mockStore = mockStore();
    global.fetch = vi.fn();
  });

  const errorCases = [
    { code: 'oauth_cancelled', expected: 'Вход через Яндекс отменён.' },
    { code: 'oauth_state_invalid', expected: 'Не удалось подтвердить авторизацию.' },
    { code: 'oauth_expired', expected: 'Время авторизации истекло.' },
    { code: 'oauth_provider_error', expected: 'Яндекс временно не смог выполнить авторизацию.' },
    { code: 'oauth_not_linked', expected: 'Этот Яндекс ID ещё не связан с аккаунтом.' },
    { code: 'oauth_yandex_not_linked', expected: 'Этот аккаунт Яндекса ещё не зарегистрирован в AGENT.ONE. Перейдите к регистрации и создайте аккаунт.' },
    { code: 'oauth_email_required', expected: 'Яндекс не предоставил email,' },
    { code: 'oauth_account_exists', expected: 'Аккаунт с таким email уже существует.' },
    { code: 'oauth_unavailable', expected: 'Вход через Яндекс временно недоступен.' },
    { code: 'oauth_state_invalid_or_expired', expected: 'Сессия авторизации истекла или недействительна.' },
  ];

  for (const { code, expected } of errorCases) {
    it(`shows message for ${code}`, async () => {
      const search = `?error=${encodeURIComponent(code)}`;
      Object.defineProperty(window, 'location', {
        value: {
          search,
          replace: vi.fn(),
          assign: vi.fn(),
        },
        writable: true,
      });

      await act(async () => {
        render(<AuthCompletePage />);
      });

      const el = await screen.findByText((content) => content.includes(expected));
      expect(el).toBeTruthy();
      // /api/auth/refresh must NOT be called
      expect(global.fetch).not.toHaveBeenCalled();
    });
  }

  it('shows generic message for unknown error code', async () => {
    Object.defineProperty(window, 'location', {
      value: {
        search: '?error=unknown_error_code',
        replace: vi.fn(),
        assign: vi.fn(),
      },
      writable: true,
    });

    await act(async () => {
      render(<AuthCompletePage />);
    });

    const el = await screen.findByText(/Не удалось выполнить вход/);
    expect(el).toBeTruthy();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  const actionCases = [
    {
      code: 'oauth_yandex_not_linked',
      primaryLabel: 'Создать аккаунт',
      primaryUrl: expect.stringContaining('/register?return_to='),
      secondaryLabel: 'Вернуться ко входу',
      secondaryUrl: expect.stringContaining('/login?return_to='),
    },
    {
      code: 'oauth_cancelled',
      primaryLabel: 'Вернуться ко входу',
      primaryUrl: expect.stringContaining('/login?return_to='),
      secondaryLabel: 'Зарегистрироваться',
      secondaryUrl: expect.stringContaining('/register?return_to='),
    },
  ];

  for (const { code, primaryLabel, primaryUrl, secondaryLabel, secondaryUrl } of actionCases) {
    it(`renders mode-aware actions for ${code}`, async () => {
      const search = `?error=${encodeURIComponent(code)}&return_to=%2Fdashboard`;
      Object.defineProperty(window, 'location', {
        value: {
          search,
          replace: vi.fn(),
          assign: vi.fn(),
        },
        writable: true,
      });

      await act(async () => {
        render(<AuthCompletePage />);
      });

      const primary = screen.getByRole('button', { name: primaryLabel });
      const secondary = screen.getByRole('button', { name: secondaryLabel });
      fireEvent.click(primary);
      expect(window.location.assign).toHaveBeenCalledWith(primaryUrl);
      fireEvent.click(secondary);
      expect(window.location.assign).toHaveBeenCalledWith(secondaryUrl);
    });
  }

  it('does not render raw error_description', async () => {    Object.defineProperty(window, 'location', {
      value: {
        search: '?error=oauth_cancelled&error_description=some+raw+detail',
        replace: vi.fn(),
        assign: vi.fn(),
      },
      writable: true,
    });

    await act(async () => {
      render(<AuthCompletePage />);
    });

    // Error description must not appear
    expect(screen.queryByText(/some raw detail/)).toBeNull();
  });

  it('does not render HTML/script from query', async () => {
    Object.defineProperty(window, 'location', {
      value: {
        search: '?error=oauth_cancelled&error=<script>alert("xss")</script>',
        replace: vi.fn(),
        assign: vi.fn(),
      },
      writable: true,
    });

    await act(async () => {
      render(<AuthCompletePage />);
    });

    expect(screen.queryByText(/alert/)).toBeNull();
    expect(screen.queryByText(/xss/)).toBeNull();
  });

  it('does not call refresh when error param present', async () => {
    Object.defineProperty(window, 'location', {
      value: {
        search: '?error=oauth_cancelled',
        replace: vi.fn(),
        assign: vi.fn(),
      },
      writable: true,
    });

    await act(async () => {
      render(<AuthCompletePage />);
    });

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('spinner completes when error shown', async () => {
    Object.defineProperty(window, 'location', {
      value: {
        search: '?error=oauth_cancelled',
        replace: vi.fn(),
        assign: vi.fn(),
      },
      writable: true,
    });

    await act(async () => {
      render(<AuthCompletePage />);
    });

    // Error message should be visible, no spinner
    expect(screen.queryByText(/Завершаем вход/)).toBeNull();
  });

  it('«Создать аккаунт» opens only /register: no role, no terms_accepted, no email/password', async () => {
    Object.defineProperty(window, 'location', {
      value: {
        search: '?error=oauth_yandex_not_linked&return_to=%2Fdashboard',
        replace: vi.fn(),
        assign: vi.fn(),
      },
      writable: true,
    });

    await act(async () => {
      render(<AuthCompletePage />);
    });

    const registerBtn = screen.getByRole('button', { name: 'Создать аккаунт' });
    fireEvent.click(registerBtn);
    const url = window.location.assign.mock.calls[0][0];
    expect(url).toContain('/register?return_to=');
    expect(url).not.toContain('role=');
    expect(url).not.toContain('terms_accepted');
    expect(url).not.toContain('email=');
    expect(url).not.toContain('password=');
    expect(url).not.toContain('/api/auth/oauth');
  });

  it('removed provider errors fall back to generic safe handling and trigger no network call', async () => {
    Object.defineProperty(window, 'location', {
      value: {
        search: '?error=oauth_removed_provider&return_to=%2Faccount',
        replace: vi.fn(),
        assign: vi.fn(),
      },
      writable: true,
    });

    await act(async () => {
      render(<AuthCompletePage />);
    });

    expect(screen.getByText(/Не удалось выполнить вход/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Вернуться ко входу' }));
    const calls = global.fetch.mock.calls.map(c => String(c[0]));
    expect(calls.some(u => u.includes('/api/auth/oauth'))).toBe(false);
    expect(calls.some(u => u.includes('/api/auth/signup'))).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('«Создать аккаунт» keeps the sanitized return_to', async () => {
    Object.defineProperty(window, 'location', {
      value: {
        search: '?error=oauth_yandex_not_linked&return_to=https%3A%2F%2Fevil.example',
        replace: vi.fn(),
        assign: vi.fn(),
      },
      writable: true,
    });

    await act(async () => {
      render(<AuthCompletePage />);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Создать аккаунт' }));
    const url = window.location.assign.mock.calls[0][0];
    expect(url).not.toContain('evil.example');
    expect(url).toContain('return_to=');
  });
});
