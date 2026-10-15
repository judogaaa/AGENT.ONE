import { useEffect, useRef, useState, useCallback } from 'react';
import { useStore } from '../hooks/useStore';
import './BusinessPricingPage.css';

const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    priceMonthly: 0,
    priceAnnualMonthly: 0,
    priceAnnualTotal: 0,
    description: 'Чтобы попробовать платформу и открыть свой магазин без риска.',
    features: [
      'До 20 товаров',
      'Каталог и витрина магазина',
      'Приём и управление заказами',
      'Базовый кабинет продавца',
      'Работа с клиентами и заявками',
    ],
    cta: 'Начать бесплатно',
    variant: 'white',
    highlighted: false,
  },
  {
    id: 'business',
    name: 'Business',
    badge: 'Самый популярный',
    priceMonthly: 1990,
    priceAnnualMonthly: 1592,
    priceAnnualTotal: 19104,
    description: 'Полная автоматизация продаж с AI по цене одного кофе в день.',
    features: [
      'До 500 товаров',
      'Всё из тарифа Starter',
      'AI-менеджер магазина 24/7',
      'AI Sales Copilot',
      'Настройка поведения AI',
      'Аналитика магазина и заявок',
      'Приоритетная обработка заказов',
      'Поддержка в чате',
    ],
    cta: 'Подключить Business',
    variant: 'accent',
    highlighted: true,
  },
  {
    id: 'business-pro',
    name: 'Business Pro',
    priceMonthly: 4990,
    priceAnnualMonthly: 3992,
    priceAnnualTotal: 47904,
    description: 'Для растущих команд с большим каталогом и потоком клиентов.',
    features: [
      'Неограниченное количество товаров',
      'Всё из тарифа Business',
      'Несколько сотрудников с ролями',
      'Расширенная аналитика и отчёты',
      'Максимальная скорость AI',
      'Приоритетная поддержка 24/7',
      'Будущие интеграции с внешними каналами',
    ],
    cta: 'Подключить Business Pro',
    variant: 'white',
    highlighted: false,
  },
];

const fmt = (n) => new Intl.NumberFormat('ru-RU').format(n);

function PeriodToggle({ value, onChange }) {
  const options = [
    { key: 'monthly', label: 'Ежемесячно' },
    { key: 'annual', label: 'Ежегодно', badge: '−20%' },
  ];
  const handleKey = (e, idx) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      onChange(options[(idx + 1) % options.length].key);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      onChange(options[(idx - 1 + options.length) % options.length].key);
    }
  };
  return (
    <div role="tablist" aria-label="Период оплаты" className="bp-toggle">
      {options.map((o, idx) => {
        const active = value === o.key;
        return (
          <button
            key={o.key}
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onKeyDown={(e) => handleKey(e, idx)}
            onClick={() => onChange(o.key)}
            className={`bp-toggle-btn ${active ? 'bp-toggle-btn--active' : ''}`}
          >
            <span>{o.label}</span>
            {o.badge && <span className="bp-toggle-badge">{o.badge}</span>}
          </button>
        );
      })}
    </div>
  );
}

function Check({ accent }) {
  return (
    <span className={`bp-check${accent ? ' bp-check--accent' : ''}`}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </span>
  );
}

function PricingCard({ plan, period, onCta }) {
  const isHighlighted = plan.highlighted;
  const priceMain = period === 'annual' ? plan.priceAnnualMonthly : plan.priceMonthly;
  const subText = plan.priceMonthly === 0
    ? 'Бесплатно, без карты'
    : (period === 'annual' && plan.priceAnnualTotal > 0 ? `${fmt(plan.priceAnnualTotal)} ₽ в год` : 'Без скрытых платежей');

  return (
    <div className={`bp-card${isHighlighted ? ' bp-card--featured' : ''}`}>
      {plan.badge && <div className="bp-badge">{plan.badge}</div>}
      <div className="bp-name">{plan.name}</div>
      <div className="bp-desc">{plan.description}</div>
      <div className="bp-price-row">
        <span className="bp-price">{fmt(priceMain)}</span>
        <span className="bp-period">₽ / месяц</span>
      </div>
      <div className="bp-sub">{subText}</div>
      <div className="bp-divider" />
      <ul className="bp-features">
        {plan.features.map((f) => (
          <li key={f} className="bp-feature">
            <Check accent={isHighlighted} />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => onCta(plan)}
        className={`bp-cta ${plan.variant === 'accent' ? 'bp-cta--dark' : 'bp-cta--white'}`}
        aria-label={plan.cta}
      >
        {plan.cta}
      </button>
    </div>
  );
}

function PricingModal({ open, planName, onClose, onSubmit }) {
  const closeRef = useRef(null);
  const dialogRef = useRef(null);
  const lastFocusedRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    lastFocusedRef.current = document.activeElement;
    const t = setTimeout(() => closeRef.current?.focus(), 30);
    document.body.style.overflow = 'hidden';
    return () => {
      clearTimeout(t);
      document.body.style.overflow = '';
      const last = lastFocusedRef.current;
      if (last && typeof last.focus === 'function') {
        try { last.focus(); } catch {}
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key === 'Tab' && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll(
          'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      onClick={onClose}
      role="presentation"
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bp-modal-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 20,
          padding: '28px 24px 22px',
          maxWidth: 420, width: '100%',
          boxShadow: '0 20px 56px rgba(0,0,0,0.2)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div id="bp-modal-title" style={{ fontSize: 18, fontWeight: 700, color: '#0b0f19', letterSpacing: '-0.01em' }}>Подключение тарифа</div>
          <button
            ref={closeRef}
            type="button"
            aria-label="Закрыть"
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: 4, color: '#9ca3af', fontSize: 20, lineHeight: 1,
            }}
          >×</button>
        </div>
        <p style={{ fontSize: 13.5, color: '#4b5563', lineHeight: 1.6, marginTop: 10 }}>
          Онлайн-подключение тарифов в разработке. Оставьте заявку — свяжемся с вами{planName ? <span> по тарифу <strong>{planName}</strong></span> : null} сразу после запуска оплаты.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 18 }}>
          <button
            type="button"
            onClick={onSubmit}
            style={{
              width: '100%', padding: '12px 16px',
              background: '#0b0f19', color: '#fff',
              border: 'none', borderRadius: 999,
              fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
            }}
          >Оставить заявку</button>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: '100%', padding: '11px 16px',
              background: '#fff', color: '#4b5563',
              border: '1px solid #e5e7eb', borderRadius: 999,
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >Закрыть</button>
        </div>
      </div>
    </div>
  );
}

export default function BusinessPricingPage() {
  const s = useStore();
  const [period, setPeriod] = useState('monthly');
  const [modalPlan, setModalPlan] = useState(null);

  const handleCta = useCallback((plan) => {
    if (plan.id === 'starter') {
      s.setPage('shop');
      return;
    }
    setModalPlan(plan);
  }, [s]);

  const closeModal = useCallback(() => setModalPlan(null), []);
  const submitModal = useCallback(() => {
    s.showToast?.('Заявка принята. Мы свяжемся с вами после запуска оплаты.', 'success');
    setModalPlan(null);
  }, [s]);

  return (
    <div className="bp-page">
      <div className="bp-container">
        <div className="bp-hero">
          <div className="bp-label">Тарифы</div>
          <h1 className="bp-title">Тарифы для бизнеса</h1>
          <p className="bp-subtitle">
            Выберите подходящий тариф для управления магазином, клиентами и AI-инструментами AGENT.ONE.
          </p>
          <div className="bp-toggle-wrap">
            <div className="bp-toggle-label">Период оплаты</div>
            <PeriodToggle value={period} onChange={setPeriod} />
          </div>
        </div>

        <div className="bp-grid">
          {PLANS.map((plan) => (
            <div key={plan.id} className="bp-card-cell">
              <PricingCard plan={plan} period={period} onCta={handleCta} />
            </div>
          ))}
        </div>

        <p className="bp-footer">
          Все цены указаны в рублях. Без скрытых платежей. Отменить подписку можно в&nbsp;любой момент.
        </p>
      </div>

      <PricingModal
        open={!!modalPlan}
        planName={modalPlan?.name}
        onClose={closeModal}
        onSubmit={submitModal}
      />
    </div>
  );
}
