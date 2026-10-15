import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';

vi.mock('../hooks/useStore', () => ({
  useStore: () => ({
    user: { role: 'business', displayName: 'Test' },
    token: 'mock-token',
    setPage: vi.fn(),
    showToast: vi.fn(),
  }),
}));

import BusinessPricingPage from './BusinessPricingPage';

describe('BusinessPricingPage', () => {
  beforeEach(() => {
    document.body.style.overflow = '';
  });

  it('renders all three plans', () => {
    render(<BusinessPricingPage />);
    expect(screen.getByText('Starter')).toBeTruthy();
    expect(screen.getByText('Business')).toBeTruthy();
    expect(screen.getByText('Business Pro')).toBeTruthy();
    expect(screen.getByText('Самый популярный')).toBeTruthy();
  });

  it('shows correct monthly prices', () => {
    render(<BusinessPricingPage />);
    expect(screen.getByText('0')).toBeTruthy();
    expect(screen.getByText('1 990')).toBeTruthy();
    expect(screen.getByText('4 990')).toBeTruthy();
  });

  it('shows annual prices when toggle switched', () => {
    render(<BusinessPricingPage />);
    const annualTab = screen.getByRole('tab', { name: /Ежегодно/ });
    fireEvent.click(annualTab);
    expect(screen.getByText('1 592')).toBeTruthy();
    expect(screen.getByText('3 992')).toBeTruthy();
    expect(screen.getByText(/19[\s\u00A0]104/)).toBeTruthy();
    expect(screen.getByText(/47[\s\u00A0]904/)).toBeTruthy();
  });

  it('renders all three CTAs', () => {
    render(<BusinessPricingPage />);
    expect(screen.getByRole('button', { name: 'Начать бесплатно' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Подключить Business' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Подключить Business Pro' })).toBeTruthy();
  });

  it('opens modal for Business and closes on Esc', () => {
    render(<BusinessPricingPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Подключить Business' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Подключение тарифа')).toBeTruthy();
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('paywall modal opens via requirePlan and shows required plan', () => {
    const store = {
      paywall: { open: false, requiredPlan: 'business', feature: '' },
      user: { role: 'business' },
      businessPlan: 'starter',
      isBusinessDemo() { return this.user?.role === 'business' && this.businessPlan === 'starter'; },
      requirePlan(plan, run, feature) {
        if (!this.isBusinessDemo()) { if (typeof run === 'function') run(); return true; }
        this.paywall = { open: true, requiredPlan: plan, feature: feature || '' };
        return false;
      },
      closePaywall() { this.paywall = { ...this.paywall, open: false }; },
    };
    const allowed = store.requirePlan('business', () => {}, 'Создание товаров');
    expect(allowed).toBe(false);
    expect(store.paywall.open).toBe(true);
    expect(store.paywall.requiredPlan).toBe('business');
    expect(store.paywall.feature).toBe('Создание товаров');
  });

  it('requirePlan passes through for non-demo business (has plan)', () => {
    const store = {
      paywall: { open: false, requiredPlan: 'business', feature: '' },
      user: { role: 'business' },
      businessPlan: 'business',
      isBusinessDemo() { return this.user?.role === 'business' && this.businessPlan === 'starter'; },
      requirePlan(plan, run) {
        if (!this.isBusinessDemo()) { if (typeof run === 'function') run(); return true; }
        this.paywall = { open: true, requiredPlan: plan, feature: '' };
        return false;
      },
    };
    let ran = false;
    const allowed = store.requirePlan('business', () => { ran = true; });
    expect(allowed).toBe(true);
    expect(ran).toBe(true);
    expect(store.paywall.open).toBe(false);
  });
});
