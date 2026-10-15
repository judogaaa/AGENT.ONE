import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../hooks/useStore';
import { formatPrice, getConditionLabel, hasValidPrice } from '../utils/format';
import { getProductMainImage } from '../utils/productImages';
import CartTarget from '../features/cart-animation/CartTarget';
import AgentIcon from './AgentIcon';
import { buildLoginUrl } from '../utils/authUrl';

export default function Header() {
  const s = useStore();
  const isAuth = !!s.token;
  const isBusiness = s.user?.role === 'business';
  const cartCount = s.cartItems.reduce((sum, i) => sum + i.quantity, 0);
  const compareCount = s.compareItems.length;
  const favCount = s.favoriteIds?.length || 0;

  return (
    <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #eee', background: 'rgba(255,255,255,.9)', position: 'sticky', top: 0, zIndex: 100, backdropFilter: 'blur(10px)', maxWidth: 1100, margin: '0 auto' }}>
      <a style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-.03em', textDecoration: 'none', color: '#111' }} href="#" onClick={() => s.setPage('home')}>
        AGENT<em style={{ color: '#888', fontWeight: 400 }}>.ONE</em>
      </a>
      <nav style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <a href="#" onClick={() => s.setPage('home')} style={{ fontSize: 13, color: s.page === 'home' ? '#fff' : '#666', padding: '6px 14px', borderRadius: 999, textDecoration: 'none', cursor: 'pointer', background: s.page === 'home' ? '#111' : 'transparent' }}>Главная</a>
        <a href="#" onClick={() => { s.setPage('catalog'); s.loadShops(); }} style={{ fontSize: 13, color: s.page === 'catalog' ? '#fff' : '#666', padding: '6px 14px', borderRadius: 999, textDecoration: 'none', cursor: 'pointer', background: s.page === 'catalog' ? '#111' : 'transparent' }}>Каталог</a>
        {isBusiness ? (
          <a href="#" onClick={() => { s.setDashboardTab('ai-manager'); s.setPage('dashboard'); }} style={{ fontSize: 13, color: s.page === 'dashboard' && s.dashboardTab === 'ai-manager' ? '#fff' : '#667eea', padding: '6px 14px', borderRadius: 999, textDecoration: 'none', cursor: 'pointer', background: s.page === 'dashboard' && s.dashboardTab === 'ai-manager' ? '#667eea' : 'transparent', fontWeight: s.page === 'dashboard' && s.dashboardTab === 'ai-manager' ? 600 : 400 }}>AI-менеджер</a>
        ) : (
          <a href="#" onClick={() => s.setPage('assistant')} style={{ fontSize: 13, color: s.page === 'assistant' ? '#fff' : '#667eea', padding: '6px 14px', borderRadius: 999, textDecoration: 'none', cursor: 'pointer', background: s.page === 'assistant' ? '#667eea' : 'transparent', fontWeight: s.page === 'assistant' ? 600 : 400 }}>AI-ассистент</a>
        )}

        {!isBusiness && <CommerceDrawer s={s} cartCount={cartCount} compareCount={compareCount} favCount={favCount} />}

        {isAuth && isBusiness && (
          <a href="#" onClick={async () => { await s.loadMyShop(); if (s.currentShop?.slug) { s.currentSlug = s.currentShop.slug; window.location.hash = '#/shop/' + s.currentShop.slug; s.setPage('shop'); } }} style={{ fontSize: 13, color: s.page === 'shop' ? '#fff' : '#666', padding: '6px 14px', borderRadius: 999, textDecoration: 'none', cursor: 'pointer', background: s.page === 'shop' ? '#111' : 'transparent' }}>Мой магазин</a>
        )}
        {isAuth && isBusiness && (
          <a href="#" onClick={() => { s.setDashboardTab('overview'); s.setPage('dashboard'); s.loadDashboardStats(); }} style={{ fontSize: 13, color: s.page === 'dashboard' && s.dashboardTab !== 'ai-manager' ? '#fff' : '#666', padding: '6px 14px', borderRadius: 999, textDecoration: 'none', cursor: 'pointer', background: s.page === 'dashboard' && s.dashboardTab !== 'ai-manager' ? '#111' : 'transparent' }}>Кабинет</a>
        )}
        {isAuth && !isBusiness && (
          <a href="#" onClick={() => s.setPage('orders')} style={{ fontSize: 13, color: s.page === 'orders' ? '#fff' : '#666', padding: '6px 14px', borderRadius: 999, textDecoration: 'none', cursor: 'pointer', background: s.page === 'orders' ? '#111' : 'transparent' }}>Мои заказы</a>
        )}
        {isAuth && (
          <a href="#" onClick={() => s.setPage('profile')} style={{ fontSize: 13, color: s.page === 'profile' ? '#fff' : '#666', padding: '6px 14px', borderRadius: 999, textDecoration: 'none', cursor: 'pointer', background: s.page === 'profile' ? '#111' : 'transparent' }}>Профиль</a>
        )}
        {!isAuth && (
          <button onClick={() => window.location.assign(buildLoginUrl())} style={{ background: '#111', color: '#fff', padding: '8px 18px', borderRadius: 999, fontWeight: 600, fontSize: 13, cursor: 'pointer', border: 'none' }}>Войти</button>
        )}
        {isAuth && (
          <button onClick={() => s.logout()} style={{ background: '#111', color: '#fff', padding: '8px 18px', borderRadius: 999, fontWeight: 600, fontSize: 13, cursor: 'pointer', border: 'none' }}>Выйти</button>
        )}
      </nav>
    </header>
  );
}

/* ── CommerceDrawer — full right-side panel ── */
function CommerceDrawer({ s, cartCount, compareCount, favCount }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('cart');
  const ref = useRef(null);
  const drawerRef = useRef(null);
  const total = cartCount + compareCount + favCount;

  // Escape close
  useEffect(() => {
    if (!open) return;
    if (s.user?.role === 'client') s.loadFavorites();
    const h = e => {
      if (e.key === 'Escape') {
        const tag = (e.target && e.target.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
        e.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [open]);

  const handleBackdrop = (e) => {
    if (drawerRef.current && !drawerRef.current.contains(e.target)) setOpen(false);
  };

  const cartTotal = s.cartItems.reduce((sum, i) => sum + (i.price || 0) * (i.quantity || 1), 0);

  return (
    <div ref={ref} style={{ flexShrink: 0 }}>
      <CartTarget>
      <button
        onClick={() => { setOpen(o => !o); if (!open && cartCount > 0) setTab('cart'); }}
        style={{ position: 'relative', fontSize: 13, color: open ? '#111' : '#666', padding: '8px 18px', borderRadius: 999, cursor: 'pointer', border: open ? '1px solid #d1d5db' : 'none', background: open ? '#f4f5f7' : 'transparent', fontWeight: 500 }}
      >
        Мои товары
        {total > 0 && (
          <span style={{ position: 'absolute', top: -3, right: -4, background: '#667eea', color: '#fff', fontSize: 10, fontWeight: 700, minWidth: 18, height: 18, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>{total}</span>
        )}
      </button>
      </CartTarget>

      {open && createPortal(
        <>
          <div onClick={handleBackdrop} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.18)', zIndex: 9998 }} />
          <div ref={drawerRef} style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 9999,
            width: Math.min(520, window.innerWidth), maxWidth: '100vw',
            background: 'rgba(255,255,255,.98)', borderLeft: '1px solid #e5e7eb',
            boxShadow: '-8px 0 40px rgba(15,23,42,.1)', display: 'flex', flexDirection: 'column',
          }}>
            {/* Header */}
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #f5f5f5', flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 18 }}>Мои товары</div>
                  <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 2 }}>Корзина, сравнение, избранное</div>
                </div>
                <button onClick={() => setOpen(false)} style={{ fontSize: 20, padding: '0 4px', cursor: 'pointer', border: 'none', background: 'none', color: '#9ca3af', lineHeight: 1 }}>×</button>
              </div>
              <div style={{ display: 'flex', gap: 16, marginTop: 14, fontSize: 13, color: '#9ca3af' }}>
                <span>Корзина · {cartCount}</span>
                <span>Сравнение · {compareCount}</span>
                <span>Избранное · {favCount}</span>
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 6, padding: '12px 24px 0', flexShrink: 0 }}>
              {[
                { key: 'cart', label: 'Корзина', count: cartCount },
                { key: 'compare', label: 'Сравнение', count: compareCount },
                { key: 'favorites', label: 'Избранное', count: favCount },
              ].map(t => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  style={{ padding: '8px 18px', borderRadius: 999, fontSize: 13, fontWeight: tab === t.key ? 700 : 400, cursor: 'pointer', border: 'none', background: tab === t.key ? '#111' : '#f4f5f7', color: tab === t.key ? '#fff' : '#6b7280' }}>
                  {t.label}{t.count > 0 && <span style={{ opacity: .7 }}> · {t.count}</span>}
                </button>
              ))}
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px 24px' }}>
              {/* Cart */}
              {tab === 'cart' && (
                s.cartItems.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 40 }}>
                    <p style={{ fontSize: 14, color: '#374151', fontWeight: 600, marginBottom: 6 }}>Корзина пока пустая</p>
                    <p style={{ fontSize: 13, color: '#9ca3af', marginBottom: 18 }}>Добавьте товары из каталога</p>
                    <button onClick={() => { setOpen(false); s.setPage('catalog'); }} style={{ padding: '10px 22px', background: '#111', color: '#fff', borderRadius: 999, fontSize: 14, fontWeight: 600, cursor: 'pointer', border: 'none' }}>Перейти в каталог</button>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {s.cartItems.map(item => (
                        <div key={item.productId} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 12, borderRadius: 16, background: '#f8f8fa', border: '1px solid #f0f0f0' }}>
                          <div style={{ width: 56, height: 56, borderRadius: 14, background: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0, overflow: 'hidden' }}>
                            {getProductMainImage(item) ? <img src={getProductMainImage(item)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : <AgentIcon name="box" size={20} muted />}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                            <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>{hasValidPrice(item.price) ? formatPrice(item.price, '') : ''} × {item.quantity}</div>
                          </div>
                          <div style={{ fontSize: 15, fontWeight: 800, color: '#111' }}>{hasValidPrice(item.price) ? formatPrice(item.price * item.quantity) : ''}</div>
                          <button onClick={() => s.removeFromCart(item.productId)} style={{ padding: '6px 10px', fontSize: 16, cursor: 'pointer', border: 'none', background: 'none', color: '#9ca3af', lineHeight: 1, borderRadius: 8 }}>×</button>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #e5e7eb', marginTop: 16, paddingTop: 14 }}>
                      <span style={{ fontSize: 15, fontWeight: 600, color: '#374151' }}>Итого</span>
                      <span style={{ fontSize: 18, fontWeight: 800, color: '#111' }}>{formatPrice(cartTotal)}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                      <button onClick={() => { setOpen(false); s.setPage('cart'); }} style={{ flex: 1, padding: '12px', background: '#111', color: '#fff', borderRadius: 999, fontSize: 14, fontWeight: 600, cursor: 'pointer', border: 'none' }}>Открыть корзину</button>
                    </div>
                  </>
                )
              )}

              {/* Compare */}
              {tab === 'compare' && (
                s.compareItems.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 40 }}>
                    <p style={{ fontSize: 14, color: '#374151', fontWeight: 600, marginBottom: 6 }}>В сравнении пока нет товаров</p>
                    <p style={{ fontSize: 13, color: '#9ca3af', marginBottom: 18 }}>Добавьте товары из каталога, чтобы сравнить их вручную.</p>
                    <button onClick={() => { setOpen(false); s.setPage('catalog'); }} style={{ padding: '10px 22px', background: '#111', color: '#fff', borderRadius: 999, fontSize: 14, fontWeight: 600, cursor: 'pointer', border: 'none' }}>Перейти в каталог</button>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {s.compareItems.map(item => (
                        <div key={item.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 12, borderRadius: 16, background: item.unavailable ? '#fafafa' : '#f8f8fa', border: '1px solid #f0f0f0', opacity: item.unavailable ? .7 : 1 }}>
                          <div style={{ width: 56, height: 56, borderRadius: 14, background: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0, overflow: 'hidden' }}>
                            {getProductMainImage(item) ? <img src={getProductMainImage(item)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : item.image ? <img src={item.image} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : <AgentIcon name="box" size={20} muted />}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: item.unavailable ? '#9ca3af' : '#111' }}>{item.unavailable ? 'Товар недоступен' : (item.name || 'Без названия')}</div>
                            {item.shopName && !item.unavailable && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{item.shopName}</div>}
                            {!item.unavailable && <div style={{ fontSize: 15, fontWeight: 800, color: '#111' }}>{formatPrice(item.price)}</div>}
                          </div>
                          <button onClick={() => s.removeFromCompare(item.id)} style={{ padding: '6px 10px', fontSize: 16, cursor: 'pointer', border: 'none', background: 'none', color: '#9ca3af', lineHeight: 1, borderRadius: 8 }}>×</button>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                      <button onClick={() => { setOpen(false); s.setPage('compare'); }} style={{ flex: 1, padding: '12px', background: '#111', color: '#fff', borderRadius: 999, fontSize: 14, fontWeight: 600, cursor: 'pointer', border: 'none' }}>Открыть полное сравнение</button>
                    </div>
                    {s.compareItems.length > 0 && (
                      <button onClick={() => s.clearCompare()} style={{ width: '100%', marginTop: 10, padding: '10px', background: '#fff', color: '#6b7280', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid #e5e7eb' }}>Очистить сравнение</button>
                    )}
                  </>
                )
              )}

              {/* Favorites */}
              {tab === 'favorites' && (
                s.favorites.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 40 }}>
                    <p style={{ fontSize: 14, color: '#374151', fontWeight: 600, marginBottom: 6 }}>В избранном пока пусто</p>
                    <p style={{ fontSize: 13, color: '#9ca3af', marginBottom: 18 }}>Сохраняйте товары, чтобы быстро к ним вернуться.</p>
                    <button onClick={() => { setOpen(false); s.setPage('catalog'); }} style={{ padding: '10px 22px', background: '#111', color: '#fff', borderRadius: 999, fontSize: 14, fontWeight: 600, cursor: 'pointer', border: 'none' }}>Перейти в каталог</button>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {s.favorites.map(item => (
                        <div key={item.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 12, borderRadius: 16, background: '#f8f8fa', border: '1px solid #f0f0f0' }}>
                          <div style={{ width: 56, height: 56, borderRadius: 14, background: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0, overflow: 'hidden' }}>
                            {getProductMainImage(item) ? <img src={getProductMainImage(item)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : <AgentIcon name="box" size={20} muted />}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                            {item.shopName && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{item.shopName}</div>}
                            <div style={{ fontSize: 15, fontWeight: 800, color: '#111' }}>{formatPrice(item.price)}</div>
                          </div>
                          <button onClick={() => s.toggleFavorite(item.id).catch(() => {})} style={{ padding: '6px 10px', fontSize: 16, cursor: 'pointer', border: 'none', background: 'none', color: '#9ca3af', lineHeight: 1, borderRadius: 8, transition: 'color .15s' }}
                            onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                            onMouseLeave={e => e.currentTarget.style.color = '#9ca3af'}
                          ><AgentIcon name="heart" size={16} filled /></button>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                      <button onClick={() => { setOpen(false); s.accountTab = 'favorites'; s.setPage('orders'); }} style={{ flex: 1, padding: '12px', background: '#111', color: '#fff', borderRadius: 999, fontSize: 14, fontWeight: 600, cursor: 'pointer', border: 'none' }}>Открыть избранное</button>
                    </div>
                  </>
                )
              )}

            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
