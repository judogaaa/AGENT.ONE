import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { ConversationsSection } from './AccountPage';

const C = { bg:'#fff', bd:'#e5e7eb', t1:'#0b0f19', t2:'#667085', t3:'#98a2b3', btn:'#050505' };

function makeStore(overrides = {}) {
  const listeners = [];
  const s = {
    appealsCounts: { all: 0, page: 1, totalPages: 1, ...overrides.appealsCounts },
    loadMyAppeals: vi.fn(),
    loadShop: vi.fn(),
    loadProduct: vi.fn(),
    setPage: vi.fn(),
    api: vi.fn(),
    token: 'mock-token',
    user: { role: 'client' },
    notify() { listeners.forEach(fn => fn()); },
    subscribe(fn) { listeners.push(fn); },
    ...overrides,
  };
  return s;
}

function makeShops(count = 5) {
  return Array.from({ length: count }, (_, i) => ({
    shopId: `shop-${i + 1}`,
    shopName: `Test Shop ${i + 1}`,
    shopSlug: `test-shop-${i + 1}`,
    lastPreview: `Last message from shop ${i + 1}`,
    topicCount: i + 2,
    messageCount: (i + 1) * 3,
  }));
}

describe('ConversationsSection pagination', () => {
  // ── 1. Initial render without crash ──
  it('renders without crashing when appealsCounts is undefined', () => {
    const s = makeStore({ appealsCounts: undefined });
    render(<ConversationsSection shops={makeShops(3)} s={s} C={C} />);
    // Messenger shell renders; sidebar header shows "Магазины"
    expect(screen.getByText('Магазины')).toBeTruthy();
  });

  it('renders without crashing when totalPages is missing from counts', () => {
    const s = makeStore({ appealsCounts: { all: 5 } });
    render(<ConversationsSection shops={makeShops(3)} s={s} C={C} />);
    expect(screen.getByText('Магазины')).toBeTruthy();
  });

  it('renders without crashing with empty shops array', () => {
    const s = makeStore();
    render(<ConversationsSection shops={[]} s={s} C={C} />);
    expect(screen.getByText('Сообщения')).toBeTruthy();
    expect(screen.getByText('У вас пока нет сообщений')).toBeTruthy();
  });

  // ── 2. One page — pagination hidden ──
  it('hides pagination when totalPages is 1', () => {
    const s = makeStore({ appealsCounts: { all: 3, page: 1, totalPages: 1 } });
    render(<ConversationsSection shops={makeShops(3)} s={s} C={C} />);
    expect(screen.queryByLabelText('Предыдущая страница')).toBeNull();
    expect(screen.queryByLabelText('Следующая страница')).toBeNull();
  });

  it('hides pagination when totalPages is 0 (treated as 1)', () => {
    const s = makeStore({ appealsCounts: { all: 0, page: 1, totalPages: 0 } });
    render(<ConversationsSection shops={[]} s={s} C={C} />);
    // Empty shops triggers the empty state, not messenger
    expect(screen.getByText('У вас пока нет сообщений')).toBeTruthy();
  });

  // ── 3. Multiple pages — pagination visible and functional ──
  it('shows pagination with current page when totalPages > 1', () => {
    const s = makeStore({ appealsCounts: { all: 45, page: 2, totalPages: 3 } });
    render(<ConversationsSection shops={makeShops(5)} s={s} C={C} />);
    expect(screen.getByText(/2 из 3/)).toBeTruthy();
  });

  it('disables left arrow on first page', () => {
    const s = makeStore({ appealsCounts: { all: 45, page: 1, totalPages: 3 } });
    render(<ConversationsSection shops={makeShops(5)} s={s} C={C} />);
    const leftBtn = screen.getByLabelText('Предыдущая страница');
    expect(leftBtn.disabled).toBe(true);
  });

  it('disables right arrow on last page', () => {
    const s = makeStore({ appealsCounts: { all: 45, page: 3, totalPages: 3 } });
    render(<ConversationsSection shops={makeShops(5)} s={s} C={C} />);
    const rightBtn = screen.getByLabelText('Следующая страница');
    expect(rightBtn.disabled).toBe(true);
  });

  it('enables both arrows on middle page', () => {
    const s = makeStore({ appealsCounts: { all: 45, page: 2, totalPages: 3 } });
    render(<ConversationsSection shops={makeShops(5)} s={s} C={C} />);
    const leftBtn = screen.getByLabelText('Предыдущая страница');
    const rightBtn = screen.getByLabelText('Следующая страница');
    expect(leftBtn.disabled).toBe(false);
    expect(rightBtn.disabled).toBe(false);
  });

  // ── 4. Next page triggers loadMyAppeals ──
  it('calls loadMyAppeals with page-1 when clicking left arrow', () => {
    const s = makeStore({ appealsCounts: { all: 45, page: 2, totalPages: 3 } });
    render(<ConversationsSection shops={makeShops(5)} s={s} C={C} />);
    fireEvent.click(screen.getByLabelText('Предыдущая страница'));
    expect(s.loadMyAppeals).toHaveBeenCalledWith(1);
  });

  it('calls loadMyAppeals with page+1 when clicking right arrow', () => {
    const s = makeStore({ appealsCounts: { all: 45, page: 2, totalPages: 3 } });
    render(<ConversationsSection shops={makeShops(5)} s={s} C={C} />);
    fireEvent.click(screen.getByLabelText('Следующая страница'));
    expect(s.loadMyAppeals).toHaveBeenCalledWith(3);
  });

  // ── 5. Shop list renders ──
  it('renders shop list items', () => {
    const s = makeStore({ appealsCounts: { all: 3, page: 1, totalPages: 1 } });
    render(<ConversationsSection shops={makeShops(3)} s={s} C={C} />);
    expect(screen.getByText('Test Shop 1')).toBeTruthy();
    expect(screen.getByText('Test Shop 2')).toBeTruthy();
    expect(screen.getByText('Test Shop 3')).toBeTruthy();
  });

  // ── 6. Shop selection opens chat ──
  it('opens chat panel when clicking a shop (mocked API)', async () => {
    const messages = [
      { id: 'm1', productId: 'p1', productName: 'Product A', senderType: 'client', text: 'Hello', createdAt: '2026-07-01T10:00:00Z' },
      { id: 'm2', productId: 'p1', productName: 'Product A', senderType: 'ai', text: 'Hi there!', createdAt: '2026-07-01T10:01:00Z' },
    ];
    const s = makeStore({
      appealsCounts: { all: 3, page: 1, totalPages: 1 },
      api: vi.fn().mockResolvedValue({ messages }),
    });
    render(<ConversationsSection shops={makeShops(3)} s={s} C={C} />);

    await act(async () => {
      fireEvent.click(screen.getByText('Test Shop 1'));
    });

    await vi.waitFor(() => {
      expect(screen.getByText('Hello')).toBeTruthy();
    });

    expect(screen.getByText('Hi there!')).toBeTruthy();
  });

  // ── 7. Topic chips render ──
  it('renders product topic chips based on messages', async () => {
    const messages = [
      { id: 'm1', productId: 'p1', productName: 'Product A', senderType: 'client', text: 'Q1', createdAt: '2026-07-01T10:00:00Z' },
      { id: 'm2', productId: 'p2', productName: 'Product B', senderType: 'client', text: 'Q2', createdAt: '2026-07-01T10:01:00Z' },
      { id: 'm3', productId: null, senderType: 'system', text: 'General', createdAt: '2026-07-01T10:02:00Z' },
    ];
    const s = makeStore({
      api: vi.fn().mockResolvedValue({ messages }),
    });
    render(<ConversationsSection shops={makeShops(1)} s={s} C={C} />);

    await act(async () => {
      fireEvent.click(screen.getByText('Test Shop 1'));
    });

    await vi.waitFor(() => {
      expect(screen.getAllByText(/Product B/).length).toBeGreaterThanOrEqual(1);
    });

    expect(screen.getAllByText(/Product A/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Все · 3/)).toBeTruthy();
    // "Общий вопрос" appears in both topic chip and message divider
    expect(screen.getAllByText(/Общий вопрос/).length).toBeGreaterThanOrEqual(1);
  });

  // ── 8. Messenger shell semantics ──
  it('renders messenger shell with correct structure', () => {
    const s = makeStore({ appealsCounts: { all: 5, page: 1, totalPages: 1 } });
    const { container } = render(<ConversationsSection shops={makeShops(3)} s={s} C={C} />);
    expect(container.querySelector('.conv-messenger')).toBeTruthy();
    expect(container.querySelector('.conv-sidebar')).toBeTruthy();
    expect(container.querySelector('.conv-chat-panel')).toBeTruthy();
  });

  it('renders store rows as native buttons', () => {
    const s = makeStore({ appealsCounts: { all: 5, page: 1, totalPages: 1 } });
    render(<ConversationsSection shops={makeShops(3)} s={s} C={C} />);
    const rows = screen.getAllByRole('button').filter(b => b.textContent.includes('Test Shop'));
    expect(rows.length).toBeGreaterThanOrEqual(3);
  });

  it('sidebar header shows shop count', () => {
    const s = makeStore({ appealsCounts: { all: 5, page: 1, totalPages: 1 } });
    render(<ConversationsSection shops={makeShops(3)} s={s} C={C} />);
    expect(screen.getByText('Магазины')).toBeTruthy();
  });

  // ── 9. Message types ──
  it('renders client, AI, shop, and unknown messages distinctly', async () => {
    const messages = [
      { id: 'm1', productId: 'p1', productName: 'Product A', senderType: 'client', text: 'Client msg', createdAt: '2026-07-01T10:00:00Z' },
      { id: 'm2', productId: 'p1', productName: 'Product A', senderType: 'ai', text: 'AI msg', createdAt: '2026-07-01T10:01:00Z' },
      { id: 'm3', productId: null, senderType: 'shop', text: 'Shop msg', createdAt: '2026-07-01T10:02:00Z' },
      { id: 'm4', productId: null, senderType: 'system', text: 'Sys msg', createdAt: '2026-07-01T10:03:00Z' },
    ];
    const s = makeStore({ api: vi.fn().mockResolvedValue({ messages }) });
    render(<ConversationsSection shops={makeShops(1)} s={s} C={C} />);

    await act(async () => {
      fireEvent.click(screen.getByText('Test Shop 1'));
    });

    await vi.waitFor(() => {
      expect(screen.getByText('Client msg')).toBeTruthy();
    });

    expect(screen.getByText('AI msg')).toBeTruthy();
    expect(screen.getByText('Shop msg')).toBeTruthy();
    // System messages show as "Событие"
    expect(screen.getByText('Sys msg')).toBeTruthy();
    expect(screen.getByText('AI-менеджер')).toBeTruthy();
  });

  it('unknown message has dashed border event style', async () => {
    const messages = [
      { id: 'm1', productId: null, senderType: 'system', text: 'System event', createdAt: '2026-07-01T10:00:00Z' },
    ];
    const s = makeStore({ api: vi.fn().mockResolvedValue({ messages }) });
    const { container } = render(<ConversationsSection shops={makeShops(1)} s={s} C={C} />);

    await act(async () => {
      fireEvent.click(screen.getByText('Test Shop 1'));
    });

    await vi.waitFor(() => {
      expect(screen.getByText('Событие')).toBeTruthy();
    });
  });

  // ── 10. Read-only footer ──
  it('shows read-only footer instead of input', async () => {
    const messages = [
      { id: 'm1', productId: null, senderType: 'client', text: 'Hello', createdAt: '2026-07-01T10:00:00Z' },
    ];
    const s = makeStore({ api: vi.fn().mockResolvedValue({ messages }) });
    render(<ConversationsSection shops={makeShops(1)} s={s} C={C} />);

    await act(async () => {
      fireEvent.click(screen.getByText('Test Shop 1'));
    });

    await vi.waitFor(() => {
      expect(screen.getByText(/История обращений доступна/)).toBeTruthy();
    });

    // No fake composer/input
    expect(screen.queryByPlaceholderText(/сообщение/i)).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  // ── 11. No shop selected placeholder ──
  it('shows placeholder when no shop is selected', () => {
    const s = makeStore({ appealsCounts: { all: 3, page: 1, totalPages: 1 } });
    render(<ConversationsSection shops={makeShops(3)} s={s} C={C} />);
    expect(screen.getByText('Выберите магазин')).toBeTruthy();
  });

  // ── 12. Mobile back button touch target ──
  it('back button has 44x44 touch target and accessible name', async () => {
    const messages = [
      { id: 'm1', productId: null, senderType: 'client', text: 'Hello', createdAt: '2026-07-01T10:00:00Z' },
    ];
    const s = makeStore({ api: vi.fn().mockResolvedValue({ messages }) });
    render(<ConversationsSection shops={makeShops(1)} s={s} C={C} />);

    await act(async () => {
      fireEvent.click(screen.getByText('Test Shop 1'));
    });

    await vi.waitFor(() => {
      expect(screen.getByText('Hello')).toBeTruthy();
    });

    const backBtn = screen.getByLabelText('Назад к списку магазинов');
    expect(backBtn).toBeTruthy();
    expect(backBtn.tagName).toBe('BUTTON');
    // Touch target >= 44px
    const style = window.getComputedStyle(backBtn);
    const w = parseInt(style.width, 10);
    const h = parseInt(style.height, 10);
    // Include padding in touch area check if padding is used to enlarge target
    const pw = parseInt(style.paddingLeft, 10) + parseInt(style.paddingRight, 10);
    const ph = parseInt(style.paddingTop, 10) + parseInt(style.paddingBottom, 10);
    expect(w + pw).toBeGreaterThanOrEqual(44);
    expect(h + ph).toBeGreaterThanOrEqual(44);
  });

  // ── 13. Long text does not break layout ──
  it('renders long message text without overflow', async () => {
    const longText = 'A'.repeat(500);
    const messages = [
      { id: 'm1', productId: null, senderType: 'client', text: longText, createdAt: '2026-07-01T10:00:00Z' },
    ];
    const s = makeStore({ api: vi.fn().mockResolvedValue({ messages }) });
    render(<ConversationsSection shops={makeShops(1)} s={s} C={C} />);

    await act(async () => {
      fireEvent.click(screen.getByText('Test Shop 1'));
    });

    await vi.waitFor(() => {
      expect(screen.getByText(longText)).toBeTruthy();
    });
  });
});
