import { useStore } from '../hooks/useStore';
import StatusBadge from './ui/StatusBadge';
import AgentIcon from './AgentIcon';
import { buildRegisterUrl } from '../utils/authUrl';

const sWrap = { padding: '80px 20px 60px', textAlign: 'center', background: 'linear-gradient(135deg,#f8f9fa 0%,#fff 50%,#f0f4ff 100%)', borderRadius: '0 0 40px 40px', marginBottom: 60, overflow: 'hidden' };
const h1Style = { fontSize: 'clamp(28px,5vw,52px)', fontWeight: 900, letterSpacing: '-.03em', lineHeight: 1.1, marginBottom: 20, wordBreak: 'break-word' };
const gradStyle = { background: 'linear-gradient(135deg,#667eea,#764ba2)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' };
const pStyle = { fontSize: 16, color: '#666', marginBottom: 36, maxWidth: 520, margin: '0 auto 36px', lineHeight: 1.6 };
const btnRow = { display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' };
const btnPrim = { background: '#111', color: '#fff', padding: '14px 28px', borderRadius: 999, fontSize: 15, fontWeight: 600, cursor: 'pointer', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,.15)' };
const btnSec = { background: '#fff', color: '#333', padding: '14px 28px', borderRadius: 999, fontSize: 15, fontWeight: 600, cursor: 'pointer', border: '1px solid #ddd' };
const statsRow = { display: 'flex', gap: 30, justifyContent: 'center', marginTop: 40, paddingTop: 30, borderTop: '1px solid #eee', flexWrap: 'wrap' };
const statNum = { fontSize: 24, fontWeight: 800 };
const statLabel = { fontSize: 11, color: '#999', marginTop: 4 };

export default function Hero() {
  const s = useStore();
  const role = s.user?.role;

  if (role === 'client') {
    return (
      <section style={sWrap}>
        <h1 style={h1Style}>
          Покупайте товары<br />
          <span style={gradStyle}>с AI-помощником 24/7</span>
        </h1>
        <p style={pStyle}>
          Смотрите товары, сравнивайте предложения, добавляйте в корзину и оформляйте заказы в одном месте.
        </p>
        <div style={btnRow}>
          <button style={btnPrim} onClick={() => { s.setPage('catalog'); s.loadShops(); }}>Смотреть каталог</button>
          <button style={btnSec} onClick={() => { s.setPage('orders'); s.loadMyOrders(); }}>Мои заказы →</button>
        </div>
        <div style={statsRow}>
          <div style={{ textAlign: 'center' }}><div style={statNum}>24/7</div><div style={statLabel}>AI работает</div></div>
          <div style={{ textAlign: 'center' }}><div style={statNum}>0₽</div><div style={statLabel}>Начало</div></div>
          <div style={{ textAlign: 'center' }}><div style={statNum}>3 мин</div><div style={statLabel}>До первого лида</div></div>
        </div>
      </section>
    );
  }

  if (role === 'business') {
    return (
      <section style={sWrap}>
        <h1 style={h1Style}>
          Продавайте товары<br />
          <span style={gradStyle}>с AI-продавцом 24/7</span>
        </h1>
        <p style={pStyle}>
          Загружайте товары, обрабатывайте заказы, ведите клиентов и отвечайте покупателям с помощью AI Sales Copilot.
        </p>
        <div style={btnRow}>
          <button style={btnPrim} onClick={() => { s.setPage('dashboard'); s.loadDashboardStats(); }}>Открыть кабинет</button>
          <button style={btnSec} onClick={() => { s.setPage('shop'); s.loadMyShop(); }}>Мой магазин</button>
        </div>
        <div style={statsRow}>
          <div style={{ textAlign: 'center' }}><div style={statNum}>24/7</div><div style={statLabel}>AI работает</div></div>
          <div style={{ textAlign: 'center' }}><div style={statNum}>0₽</div><div style={statLabel}>Начало</div></div>
          <div style={{ textAlign: 'center' }}><div style={statNum}>3 мин</div><div style={statLabel}>До первого лида</div></div>
        </div>
      </section>
    );
  }

  return (
    <section style={sWrap}>
      <h1 style={h1Style}>
        Покупайте и продавайте товары<br />
        <span style={gradStyle}>с AI-помощником 24/7</span>
      </h1>
      <p style={pStyle}>
        Сравнивайте предложения, добавляйте товары в корзину и получайте AI-рекомендации перед покупкой.
      </p>
      <div style={btnRow}>
        <button style={btnPrim} onClick={() => { s.setPage('catalog'); s.loadShops(); }}>Смотреть каталог</button>
        <button style={btnSec} onClick={() => window.location.assign(buildRegisterUrl())}>Создать магазин</button>
      </div>
      <div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginTop: 40, flexWrap: 'wrap' }}>
        <div style={{ background: '#fff', borderRadius: 18, padding: '16px 24px', border: '1px solid #e5e7eb', textAlign: 'center', minWidth: 120 }}><div style={statNum}>24/7</div><div style={statLabel}>AI работает</div></div>
        <div style={{ background: '#fff', borderRadius: 18, padding: '16px 24px', border: '1px solid #e5e7eb', textAlign: 'center', minWidth: 120 }}><div style={statNum}>0 ₽</div><div style={statLabel}>Старт</div></div>
        <div style={{ background: '#fff', borderRadius: 18, padding: '16px 24px', border: '1px solid #e5e7eb', textAlign: 'center', minWidth: 120 }}><div style={statNum}>3 мин</div><div style={statLabel}>Первый заказ</div></div>
      </div>
      {/* Preview card */}
      <div style={{ maxWidth: 500, margin: '32px auto 0', background: '#fff', borderRadius: 24, border: '1px solid #e5e7eb', boxShadow: '0 8px 30px rgba(15,23,42,.06)', padding: 24, display: 'flex', gap: 16, alignItems: 'center', textAlign: 'left' }}>
        <div style={{ width: 72, height: 72, borderRadius: 18, background: '#f8f8fa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, flexShrink: 0 }}><AgentIcon name="box" size={32} muted /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: '#667eea', fontWeight: 600, marginBottom: 4 }}>AI подберёт лучший товар</div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Сравните цены и характеристики</div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>AI проанализирует описание, бренд, состояние и доставку</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <StatusBadge variant="neutral" size="sm">Сравнение</StatusBadge>
            <StatusBadge variant="neutral" size="sm">Корзина</StatusBadge>
            <StatusBadge variant="dark" size="sm">AI</StatusBadge>
          </div>
        </div>
      </div>
    </section>
  );
}
