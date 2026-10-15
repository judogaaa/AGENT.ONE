import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

function makeStore(overrides = {}) {
  return {
    user: { id: 'u1', role: 'business', displayName: 'Test', onboarding: { status: 'required' } },
    token: 'mock-token',
    setPage: vi.fn(),
    submitBusinessOnboarding: vi.fn(),
    ...overrides,
  };
}

vi.mock('../hooks/useStore', () => ({
  useStore: () => globalThis.__obStore,
}));

import BusinessOnboardingPage from './BusinessOnboardingPage';

function confirmPdConsent() {
  fireEvent.click(document.getElementById('pd-consent'));
}

describe('BusinessOnboardingPage', () => {
  beforeEach(() => {
    globalThis.__obStore = makeStore();
  });

  it('renders three legal type cards', () => {
    render(<BusinessOnboardingPage />);
    expect(screen.getByText('Самозанятый')).toBeTruthy();
    expect(screen.getByText('Индивидуальный предприниматель')).toBeTruthy();
    expect(screen.getByText('Юридическое лицо')).toBeTruthy();
  });

  it('submit is disabled without legal type selection', () => {
    render(<BusinessOnboardingPage />);
    expect(screen.getByRole('button', { name: /Продолжить в бизнес-кабинет/ }).disabled).toBe(true);
  });

  it('submit is disabled until authority checkbox confirmed', () => {
    render(<BusinessOnboardingPage />);
    fireEvent.click(screen.getByRole('radio', { name: /Самозанятый/ }));
    fireEvent.change(screen.getByLabelText('ФИО'), { target: { value: 'Иванов Иван Иванович' } });
    fireEvent.change(screen.getByLabelText('ИНН'), { target: { value: '123456789012' } });
    fireEvent.change(screen.getByLabelText('Регион'), { target: { value: 'Москва' } });
    fireEvent.change(screen.getByLabelText('Название на витрине'), { target: { value: 'Магазин Ивана' } });
    fireEvent.change(screen.getByLabelText('Контактный телефон'), { target: { value: '+7 900 000-00-00' } });
    fireEvent.change(screen.getByLabelText('Контактный email'), { target: { value: 'a@b.ru' } });
    expect(screen.getByRole('button', { name: /Продолжить в бизнес-кабинет/ }).disabled).toBe(true);
  });

  it('self_employed shows only its fields and hides legal entity fields', () => {
    render(<BusinessOnboardingPage />);
    fireEvent.click(screen.getByRole('radio', { name: /Самозанятый/ }));
    expect(screen.getByLabelText('ФИО')).toBeTruthy();
    expect(screen.getByLabelText('ИНН')).toBeTruthy();
    expect(screen.getByLabelText('Регион')).toBeTruthy();
    expect(screen.getByLabelText('Название на витрине')).toBeTruthy();
    expect(screen.queryByLabelText('Полное наименование')).toBeNull();
    expect(screen.queryByLabelText('КПП')).toBeNull();
    expect(screen.queryByLabelText('ОГРН')).toBeNull();
    expect(screen.queryByLabelText('ОГРНИП')).toBeNull();
  });

  it('legal_entity shows company fields', () => {
    render(<BusinessOnboardingPage />);
    fireEvent.click(screen.getByRole('radio', { name: /Юридическое лицо/ }));
    expect(screen.getByLabelText('Полное наименование')).toBeTruthy();
    expect(screen.getByLabelText('Сокращённое наименование')).toBeTruthy();
    expect(screen.getByLabelText('ИНН')).toBeTruthy();
    expect(screen.getByLabelText('КПП')).toBeTruthy();
    expect(screen.getByLabelText('ОГРН')).toBeTruthy();
    expect(screen.getByLabelText('Юридический адрес')).toBeTruthy();
    expect(screen.getByLabelText('ФИО представителя')).toBeTruthy();
    expect(screen.getByLabelText('Должность представителя')).toBeTruthy();
    expect(screen.queryByLabelText('ОГРНИП')).toBeNull();
    expect(screen.queryByLabelText('Регион')).toBeNull();
  });

  it('individual_entrepreneur shows OGRNIP and registration address', () => {
    render(<BusinessOnboardingPage />);
    fireEvent.click(screen.getByRole('radio', { name: /Индивидуальный предприниматель/ }));
    expect(screen.getByLabelText('ОГРНИП')).toBeTruthy();
    expect(screen.getByLabelText('Адрес регистрации')).toBeTruthy();
  });

  it('submits whitelisted payload for self_employed', async () => {
    const submit = vi.fn().mockResolvedValue({ onboarding: { status: 'pending_review', legalType: 'self_employed' } });
    globalThis.__obStore = makeStore({ submitBusinessOnboarding: submit });
    render(<BusinessOnboardingPage />);
    fireEvent.click(screen.getByRole('radio', { name: /Самозанятый/ }));
    fireEvent.change(screen.getByLabelText('ФИО'), { target: { value: '  Иванов Иван Иванович  ' } });
    fireEvent.change(screen.getByLabelText('ИНН'), { target: { value: '123456789012' } });
    fireEvent.change(screen.getByLabelText('Регион'), { target: { value: 'Москва' } });
    fireEvent.change(screen.getByLabelText('Название на витрине'), { target: { value: 'Магазин Ивана' } });
    fireEvent.change(screen.getByLabelText('Контактный телефон'), { target: { value: '+7 900 000-00-00' } });
    fireEvent.change(screen.getByLabelText('Контактный email'), { target: { value: 'a@b.ru' } });
    fireEvent.click(screen.getByLabelText(/Подтверждаю достоверность/));
    confirmPdConsent();
    fireEvent.click(screen.getByRole('button', { name: /Продолжить в бизнес-кабинет/ }));
    expect(submit).toHaveBeenCalledTimes(1);
    const payload = submit.mock.calls[0][0];
    expect(Object.keys(payload).sort()).toEqual(
      ['authority_confirmed', 'consent_source', 'contactEmail', 'contactPhone', 'displayName', 'fullName', 'inn12', 'legalType', 'pd_consent', 'region'].sort()
    );
    expect(payload.legalType).toBe('self_employed');
    expect(payload.pd_consent).toBe(true);
    expect(payload.fullName).toBe('Иванов Иван Иванович');
    expect(payload.authority_confirmed).toBe(true);
    expect(payload.inn10).toBeUndefined();
    expect(payload.kpp).toBeUndefined();
  });

  it('rejects invalid INN length with field error', () => {
    render(<BusinessOnboardingPage />);
    fireEvent.click(screen.getByRole('radio', { name: /Юридическое лицо/ }));
    fireEvent.change(screen.getByLabelText('Полное наименование'), { target: { value: 'ООО Ромашка' } });
    fireEvent.change(screen.getByLabelText('Сокращённое наименование'), { target: { value: 'ООО Ромашка' } });
    fireEvent.change(screen.getByLabelText('ИНН'), { target: { value: '123456789' } });
    fireEvent.change(screen.getByLabelText('КПП'), { target: { value: '770001001' } });
    fireEvent.change(screen.getByLabelText('ОГРН'), { target: { value: '1027700132195' } });
    fireEvent.change(screen.getByLabelText('Юридический адрес'), { target: { value: 'Москва' } });
    fireEvent.change(screen.getByLabelText('ФИО представителя'), { target: { value: 'Иванов Иван' } });
    fireEvent.change(screen.getByLabelText('Должность представителя'), { target: { value: 'Директор' } });
    fireEvent.change(screen.getByLabelText('Контактный телефон'), { target: { value: '+7 900 000-00-00' } });
    fireEvent.change(screen.getByLabelText('Контактный email'), { target: { value: 'a@b.ru' } });
    fireEvent.click(screen.getByLabelText(/Подтверждаю достоверность/));
    expect(screen.getByText('Должно быть 10 цифр')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Продолжить в бизнес-кабинет/ }).disabled).toBe(true);
  });

  it('rejects invalid OGRNIP / OGRN / KPP lengths', () => {
    render(<BusinessOnboardingPage />);
    fireEvent.click(screen.getByRole('radio', { name: /Индивидуальный предприниматель/ }));
    fireEvent.change(screen.getByLabelText('ФИО'), { target: { value: 'Иванов Иван' } });
    fireEvent.change(screen.getByLabelText('ИНН'), { target: { value: '123456789012' } });
    fireEvent.change(screen.getByLabelText('ОГРНИП'), { target: { value: '12345678901234' } });
    fireEvent.change(screen.getByLabelText('Название на витрине'), { target: { value: 'Магазин' } });
    fireEvent.change(screen.getByLabelText('Адрес регистрации'), { target: { value: 'Москва' } });
    fireEvent.change(screen.getByLabelText('Контактный телефон'), { target: { value: '+7 900 000-00-00' } });
    fireEvent.change(screen.getByLabelText('Контактный email'), { target: { value: 'a@b.ru' } });
    fireEvent.click(screen.getByLabelText(/Подтверждаю достоверность/));
    expect(screen.getByText('Должно быть 15 цифр')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Продолжить в бизнес-кабинет/ }).disabled).toBe(true);
  });

  it('shows error and keeps form values when server rejects', async () => {
    const submit = vi.fn().mockRejectedValue(new Error('invalid legal type'));
    globalThis.__obStore = makeStore({ submitBusinessOnboarding: submit });
    render(<BusinessOnboardingPage />);
    fireEvent.click(screen.getByRole('radio', { name: /Самозанятый/ }));
    fireEvent.change(screen.getByLabelText('ФИО'), { target: { value: 'Иванов Иван' } });
    fireEvent.change(screen.getByLabelText('ИНН'), { target: { value: '123456789012' } });
    fireEvent.change(screen.getByLabelText('Регион'), { target: { value: 'Москва' } });
    fireEvent.change(screen.getByLabelText('Название на витрине'), { target: { value: 'Магазин' } });
    fireEvent.change(screen.getByLabelText('Контактный телефон'), { target: { value: '+7 900 000-00-00' } });
    fireEvent.change(screen.getByLabelText('Контактный email'), { target: { value: 'a@b.ru' } });
    fireEvent.click(screen.getByLabelText(/Подтверждаю достоверность/));
    confirmPdConsent();
    fireEvent.click(screen.getByRole('button', { name: /Продолжить в бизнес-кабинет/ }));
    await screen.findByText('invalid legal type');
    expect(screen.getByLabelText('ФИО').value).toBe('Иванов Иван');
    expect(screen.getByLabelText('ИНН').value).toBe('123456789012');
    expect(screen.getByRole('button', { name: /Продолжить в бизнес-кабинет/ }).disabled).toBe(false);
  });

  it('does not double-submit while request is in flight', () => {
    let resolveFn;
    const submit = vi.fn().mockImplementation(() => new Promise((resolve) => { resolveFn = resolve; }));
    globalThis.__obStore = makeStore({ submitBusinessOnboarding: submit });
    render(<BusinessOnboardingPage />);
    fireEvent.click(screen.getByRole('radio', { name: /Самозанятый/ }));
    fireEvent.change(screen.getByLabelText('ФИО'), { target: { value: 'Иванов Иван' } });
    fireEvent.change(screen.getByLabelText('ИНН'), { target: { value: '123456789012' } });
    fireEvent.change(screen.getByLabelText('Регион'), { target: { value: 'Москва' } });
    fireEvent.change(screen.getByLabelText('Название на витрине'), { target: { value: 'Магазин' } });
    fireEvent.change(screen.getByLabelText('Контактный телефон'), { target: { value: '+7 900 000-00-00' } });
    fireEvent.change(screen.getByLabelText('Контактный email'), { target: { value: 'a@b.ru' } });
    fireEvent.click(screen.getByLabelText(/Подтверждаю достоверность/));
    confirmPdConsent();
    fireEvent.click(screen.getByRole('button', { name: /Продолжить в бизнес-кабинет/ }));
    fireEvent.click(screen.getByRole('button', { name: /Сохраняем/ }));
    expect(submit).toHaveBeenCalledTimes(1);
    resolveFn({ onboarding: { status: 'pending_review' } });
  });

  it('redirects client role to home and renders nothing', () => {
    globalThis.__obStore = makeStore({ user: { id: 'u2', role: 'client', onboarding: null } });
    const { container } = render(<BusinessOnboardingPage />);
    expect(globalThis.__obStore.setPage).toHaveBeenCalledWith('home');
    expect(container.firstChild).toBeNull();
  });

  it('redirects completed business to dashboard', () => {
    globalThis.__obStore = makeStore({ user: { id: 'u3', role: 'business', onboarding: { status: 'pending_review' } } });
    const { container } = render(<BusinessOnboardingPage />);
    expect(globalThis.__obStore.setPage).toHaveBeenCalledWith('dashboard');
    expect(container.firstChild).toBeNull();
  });

  it('redirects guest to home', () => {
    globalThis.__obStore = makeStore({ user: null, token: null });
    const { container } = render(<BusinessOnboardingPage />);
    expect(globalThis.__obStore.setPage).toHaveBeenCalledWith('home');
    expect(container.firstChild).toBeNull();
  });

  it('navigates to dashboard after successful submit', async () => {
    const submit = vi.fn().mockResolvedValue({ onboarding: { status: 'pending_review', legalType: 'legal_entity' } });
    globalThis.__obStore = makeStore({ submitBusinessOnboarding: submit });
    render(<BusinessOnboardingPage />);
    fireEvent.click(screen.getByRole('radio', { name: /Юридическое лицо/ }));
    fireEvent.change(screen.getByLabelText('Полное наименование'), { target: { value: 'ООО Ромашка' } });
    fireEvent.change(screen.getByLabelText('Сокращённое наименование'), { target: { value: 'ООО Ромашка' } });
    fireEvent.change(screen.getByLabelText('ИНН'), { target: { value: '1234567890' } });
    fireEvent.change(screen.getByLabelText('КПП'), { target: { value: '770001001' } });
    fireEvent.change(screen.getByLabelText('ОГРН'), { target: { value: '1027700132195' } });
    fireEvent.change(screen.getByLabelText('Юридический адрес'), { target: { value: 'Москва' } });
    fireEvent.change(screen.getByLabelText('ФИО представителя'), { target: { value: 'Иванов Иван' } });
    fireEvent.change(screen.getByLabelText('Должность представителя'), { target: { value: 'Директор' } });
    fireEvent.change(screen.getByLabelText('Контактный телефон'), { target: { value: '+7 900 000-00-00' } });
    fireEvent.change(screen.getByLabelText('Контактный email'), { target: { value: 'a@b.ru' } });
    fireEvent.click(screen.getByLabelText(/Подтверждаю достоверность/));
    confirmPdConsent();
    fireEvent.click(screen.getByRole('button', { name: /Продолжить в бизнес-кабинет/ }));
    await waitFor(() => expect(globalThis.__obStore.setPage).toHaveBeenCalledWith('dashboard'));
  });

  it('renders radio group semantics for legal type', () => {
    render(<BusinessOnboardingPage />);
    const group = screen.getByRole('radiogroup');
    expect(group).toBeTruthy();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
  });
});
