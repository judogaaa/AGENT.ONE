import { useState, useEffect, useRef, useMemo } from 'react';
import { useStore, useApi } from '../hooks/useStore';
import { formatPrice } from '../utils/format';
import CustomSelect from '../components/CustomSelect';
import StatusBadge from '../components/ui/StatusBadge';
import SlidingTabs from '../components/SlidingTabs';
import AgentIcon from '../components/AgentIcon';
import AIManagerWorkspace from '../components/business/AIManagerWorkspace';
import { buildLoginUrl, getCurrentRelativePath } from '../utils/authUrl';
import SellerOverview from '../components/business/SellerOverview';
import PaymentSettingsPanel from '../components/business/PaymentSettingsPanel';
import DashboardProducts from '../components/business/DashboardProducts';

const TABS = [
  { key: 'overview', label: 'Обзор' },
  { key: 'products', label: 'Товары' },
  { key: 'orders', label: 'Заказы' },
  { key: 'clients', label: 'Клиенты' },
  { key: 'ai-manager', label: 'AI-менеджер' },
  { key: 'copilot', label: 'AI Sales Copilot' },
  { key: 'payment', label: 'Оплата' },
];

export default function DashboardPage() {
  const s = useStore();
  const [tab, setTab] = useState(s.dashboardTab || 'overview');

  useEffect(() => {
    if (s.dashboardTab && s.dashboardTab !== tab) {
      setTab(s.dashboardTab);
    }
  }, [s.dashboardTab]);

  const switchTab = (t) => { setTab(t); s.setDashboardTab(t); };

  useEffect(() => {
    if (!s.token || s.user?.role !== 'business') return;
    if (tab === 'overview') {
      s.loadDashboardStats();
      s.loadBusinessProducts();
      s.loadBusinessOrders();
      s.loadMyLeads();
      s.loadAIManagerSettings();
      s.loadBusinessAIManagerDialogs();
    }
    if (tab === 'products') s.loadBusinessProducts();
    if (tab === 'orders') s.loadBusinessOrders();
    if (tab === 'clients') s.loadMyLeads();
    if (tab === 'ai-manager') { s.loadAIManagerSettings(); s.loadBusinessAIManagerDialogs(); }
    if (tab === 'payment') s.loadPaymentSettings();
  }, [tab, s.token]);

  if (!s.authChecked || s.authLoading) {
    return (
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: 40, textAlign: 'center', color: '#9ca3af' }}>
        {s.authLoading ? 'Проверяем сессию...' : 'Загрузка...'}
      </div>
    );
  }

  if (!s.token) {
    return (
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: 40, textAlign: 'center' }}>
        <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 12 }}>Войдите, чтобы открыть кабинет продавца.</p>
        <button onClick={() => window.location.assign(buildLoginUrl(getCurrentRelativePath()))} style={{ padding: '12px 28px', background: '#111', color: '#fff', borderRadius: 999, fontSize: 14, fontWeight: 600, cursor: 'pointer', border: 'none' }}>Войти</button>
      </div>
    );
  }

  if (s.user?.role !== 'business') {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}><AgentIcon name="store" size={48} muted /></div>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#333', marginBottom: 8 }}>Раздел доступен продавцам</div>
        <div style={{ fontSize: 14, color: '#999' }}>Зарегистрируйтесь как продавец, чтобы получить доступ к кабинету.</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '30px 0 60px' }}>
      <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Кабинет продавца</h2>
      <p style={{ color: '#666', fontSize: 14, marginBottom: 20 }}>Управляйте магазином, товарами и заказами</p>

      {/* Tab bar */}
      <div style={{ marginBottom: 24 }}>
        <SlidingTabs
          tabs={TABS.map(t => ({ value: t.key, label: t.label }))}
          value={tab}
          onChange={switchTab}
          ariaLabel="Разделы кабинета"
        />
      </div>

      {tab === 'overview' && <SellerOverview onNavigate={switchTab} />}
      {tab === 'products' && <DashboardProducts />}
      {tab === 'orders' && <Orders />}
      {tab === 'clients' && <Clients />}
      {tab === 'ai-manager' && <AIManager />}
      {tab === 'copilot' && <Copilot />}
      {tab === 'payment' && <PaymentSettingsPanel />}
    </div>
  );
}

// ═══════════════════════════════════════════════
//  AI MANAGER
// ═══════════════════════════════════════════════

function AIManager() {
  return <AIManagerWorkspace />;
}

// ═══════════════════════════════════════════════
//  ORDERS
// ═══════════════════════════════════════════════

const STATUS_MAP = {
  created: 'Создан', accepted: 'Принят', ready: 'Готов', completed: 'Завершён', cancelled: 'Отменён',
};

function Orders() {
  const s = useStore();
  const { call } = useApi();
  const [changing, setChanging] = useState(null);
  const [orderStatusDrafts, setOrderStatusDrafts] = useState({});

  const openStatusEdit = id => {
    const o = s.businessOrders.find(x => x.id === id);
    setOrderStatusDrafts(d => ({ ...d, [id]: o ? o.orderStatus : '' }));
    setChanging(id);
  };

  const setStatusDraft = (id, val) => {
    setOrderStatusDrafts(d => ({ ...d, [id]: val }));
  };

  const cancelStatusEdit = () => {
    setOrderStatusDrafts(d => {
      const copy = { ...d };
      delete copy[changing];
      return copy;
    });
    setChanging(null);
  };

  const changeStatus = async (id, status) => {
    await call(() => s.updateOrderStatus(id, status));
    setOrderStatusDrafts(d => {
      const copy = { ...d };
      delete copy[id];
      return copy;
    });
    setChanging(null);
  };

  if (s.businessOrders.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: '#999', background: '#fff', border: '1px solid #e8e8e8', borderRadius: 12 }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}><AgentIcon name="checklist" size={28} muted /></div>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#333' }}>Заказов пока нет.</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {s.businessOrders.map(o => (
        <div key={o.id} style={{ background: '#fff', border: '1px solid #e8e8e8', borderRadius: 12, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Заказ #{o.id?.slice(0, 8)}</div>
              <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>{o.createdAt ? new Date(o.createdAt).toLocaleDateString('ru-RU') : ''}</div>
            </div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>{o.totalAmount ? Number(o.totalAmount).toLocaleString('ru-RU') : '—'} ₽</div>
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap', fontSize: 13, color: '#555' }}>
            <div><strong>Клиент:</strong> {o.customerName}</div>
            <div><strong>Тел:</strong> {o.customerPhone}</div>
            <div><strong>Email:</strong> {o.customerEmail}</div>
            <div><strong>Оплата:</strong> {o.paymentMethod === 'store' ? 'В магазине' : o.paymentMethod === 'cash' ? 'Наличные' : o.paymentMethod === 'invoice' ? 'Счёт' : o.paymentMethod}</div>
            <div><strong>Получение:</strong> {o.deliveryMethod === 'pickup' ? 'Самовывоз' : 'Доставка'}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <StatusBadge status={o.orderStatus} />
            {changing === o.id ? (
              <div style={{ display: 'flex', gap: 6 }}>
                <CustomSelect value={orderStatusDrafts[o.id] || o.orderStatus} onChange={e => setStatusDraft(o.id, e.target.value)} options={STATUSES.map(s => ({ value: s, label: STATUS_MAP[s] }))} />
                <button onClick={() => changeStatus(o.id, orderStatusDrafts[o.id] || o.orderStatus)} style={{ padding: '6px 14px', background: '#111', color: '#fff', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none' }}>OK</button>
                <button onClick={() => cancelStatusEdit()} style={{ padding: '6px 14px', background: '#f5f5f5', color: '#333', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid #ddd' }}>Отмена</button>
              </div>
            ) : (
              <button onClick={() => openStatusEdit(o.id)} style={{ padding: '6px 14px', background: '#f5f5f5', color: '#333', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid #ddd' }}>Сменить статус</button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════
//  CLIENTS
// ═══════════════════════════════════════════════

function Clients() {
  const s = useStore();
  const leads = s.myLeads || [];
  const [statusFilter, setStatusFilter] = useState('all');

  const counts = () => {
    const c = { all: leads.length, new: 0, in_progress: 0, contacted: 0, deal: 0, rejected: 0 };
    leads.forEach(l => { const st = l.status || 'new'; c[st] = (c[st] || 0) + 1; });
    return c;
  };
  const c = counts();

  const filtered = statusFilter === 'all' ? leads : leads.filter(l => (l.status || 'new') === statusFilter);

  const setStatus = async (leadId, status) => {
    try {
      await s.updateBusinessLeadStatus(leadId, status);
      s.loadMyLeads();
      s.showToast?.('Статус заявки обновлён');
    } catch (e) { s.showToast?.('Не удалось обновить статус'); }
  };

  const statuses = [
    { key: 'all', label: 'Все', count: c.all },
    { key: 'new', label: 'Новые', count: c.new },
    { key: 'in_progress', label: 'В работе', count: c.in_progress },
    { key: 'contacted', label: 'Связались', count: c.contacted },
    { key: 'deal', label: 'Сделки', count: c.deal },
    { key: 'rejected', label: 'Отказы', count: c.rejected },
  ];

  return (
    <div>
      {/* Funnel */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))', gap: 10, marginBottom: 20 }}>
        {statuses.map(st => (
          <div key={st.key} onClick={() => setStatusFilter(st.key)} style={{ background: '#fff', border: statusFilter === st.key ? '2px solid #111' : '1px solid #e5e7eb', borderRadius: 14, padding: 14, cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#111' }}>{st.count}</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{st.label}</div>
          </div>
        ))}
      </div>

      {/* AI leads summary */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, fontSize: 12, color: '#9ca3af', flexWrap: 'wrap' }}>
        <span style={{ background: '#f3f0ff', color: '#667eea', padding: '4px 10px', borderRadius: 999, fontWeight: 600 }}>AI-заявок: {leads.filter(l => l.source === 'assistant' || l.source === 'copilot').length}</span>
      </div>

      {leads.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16 }}>
          Заявок пока нет
        </div>
      )}

      {filtered.length === 0 && leads.length > 0 && (
        <div style={{ textAlign: 'center', padding: 24, color: '#9ca3af', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16 }}>
          Нет заявок с этим статусом
        </div>
      )}

      {filtered.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(l => (
            <div key={l.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{l.name || 'Клиент без имени'}</div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                    {[l.phone, l.email].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  {l.source && <StatusBadge variant="muted" size="sm">{sourceLabel(l.source)}</StatusBadge>}
                  <StatusBadge variant={leadVariant(l.status || 'new')} size="sm">{statusLabel(l.status || 'new')}</StatusBadge>
                  {l.createdAt && <span style={{ fontSize: 11, color: '#9ca3af' }}>{new Date(l.createdAt).toLocaleDateString('ru-RU')}</span>}
                </div>
              </div>

              {/* Body */}
              <div style={{ marginTop: 8 }}>
                {l.productName && <div style={{ fontSize: 12, color: '#667eea' }}>Товар: {l.productName}</div>}
                {l.customerNeed && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{l.customerNeed}</div>}
                {l.deliveryCity && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>Город: {l.deliveryCity}</div>}
                {l.contactPreference && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>Связь: {prefLabel(l.contactPreference)}</div>}
              </div>

              {l.message && <div style={{ fontSize: 12, color: '#555', marginTop: 8, lineHeight: 1.5, background: '#f9f9f9', padding: '8px 12px', borderRadius: 10 }}>{l.message}</div>}
              {l.aiReply && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4, lineHeight: 1.5, background: '#f3f0ff', padding: '8px 12px', borderRadius: 10, border: '1px solid #dfe4ff' }}>AI-менеджер: {l.aiReply}</div>}
              {l.sellerNote && <div style={{ fontSize: 12, color: '#374151', marginTop: 4, lineHeight: 1.5, background: '#f8f8fa', padding: '8px 12px', borderRadius: 10, border: '1px solid #e5e7eb' }}>Заметка: {l.sellerNote}</div>}

              {/* Status actions */}
              <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                {statuses.filter(s => s.key !== 'all').map(st => (
                  <button
                    key={st.key}
                    onClick={() => setStatus(l.id, st.key)}
                    style={{
                      padding: '4px 12px', borderRadius: 999, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      border: (l.status || 'new') === st.key ? '2px solid #111' : '1px solid #e5e7eb',
                      background: (l.status || 'new') === st.key ? '#111' : '#fff',
                      color: (l.status || 'new') === st.key ? '#fff' : '#6b7280',
                    }}
                  >
                    {statusLabel(st.key)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
//  COPILOT
// ═══════════════════════════════════════════════

function intentLabel(i) {
  const m = { ask_stock: 'Наличие', ask_price: 'Цена', ask_delivery: 'Доставка', ask_discount: 'Скидка', expensive_objection: 'Возражение', product_selection: 'Подбор', product_details: 'Подробности', close_deal: 'Покупка', first_contact: 'Первичный контакт', fallback: 'Общий запрос' };
  return m[i] || i;
}

const sel = { padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 13, background: '#fff', color: '#374151', outline: 'none', cursor: 'pointer' };
const btnSm = { padding: '5px 12px', borderRadius: 999, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: 'none', background: '#111', color: '#fff' };
const btnSmOut = { padding: '5px 12px', borderRadius: 999, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: '1px solid #e5e7eb', background: '#fff', color: '#374151' };
const fld = { padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 14, width: '100%', boxSizing: 'border-box' };
const lbl = { fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 };

function Copilot() {
  const s = useStore();
  const { call } = useApi();
  const [message, setMessage] = useState('');
  const [style, setStyle] = useState('friendly');
  const [channel, setChannel] = useState('');
  const [scenario, setScenario] = useState('auto');
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState('');
  const [leadModal, setLeadModal] = useState(false);
  const [leadForm, setLeadForm] = useState({ name: '', phone: '', email: '', channel: '', productId: '', customerNeed: '', contactPreference: '', deliveryCity: '' });
  const [leadSent, setLeadSent] = useState(false);
  const [leadLoading, setLeadLoading] = useState(false);
  const [leadError, setLeadError] = useState('');

  const handleSubmit = async () => {
    if (!message.trim()) return;
    setResult(null);
    try {
      const d = await call(() => s.copilotSend(message, style, channel || undefined, scenario !== 'auto' ? scenario : undefined));
      setResult(d);
      if (d.detected?.intent) setLeadForm(f => ({ ...f, customerNeed: intentLabel(d.detected.intent) }));
    } catch (e) { /* ошибка показывается в useApi */ }
  };

  const copyText = (text, key) => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => { setCopied(key); setTimeout(() => setCopied(''), 2000); });
  };

  const openLead = () => {
    if (result) {
      setLeadForm(f => ({
        ...f,
        message: message,
        aiReply: result.reply || '',
        channel: channel,
      }));
    }
    setLeadSent(false);
    setLeadError('');
    setLeadModal(true);
  };

  const submitLead = async () => {
    const hasMessage = (leadForm.message || '').trim();
    const hasNeed = (leadForm.customerNeed || '').trim();
    if (!hasMessage && !hasNeed) {
      setLeadError('Укажите сообщение клиента или потребность.');
      return;
    }
    setLeadError('');
    setLeadLoading(true);
    try {
      await s.createCopilotLead({
        name: leadForm.name || 'Клиент',
        phone: leadForm.phone || '',
        email: leadForm.email || '',
        channel: leadForm.channel || '',
        productId: leadForm.productId || '',
        customerNeed: leadForm.customerNeed || '',
        message: hasMessage,
        aiReply: leadForm.aiReply || '',
        contactPreference: leadForm.contactPreference || '',
        deliveryCity: leadForm.deliveryCity || '',
      });
      setLeadSent(true);
      s.showToast?.('Лид создан');
      s.loadMyLeads?.();
    } catch (e) {
      setLeadError(e.message || 'Не удалось создать лид');
    }
    setLeadLoading(false);
  };

  const insertProduct = (p) => {
    const line = `Могу предложить: ${p.name} — ${formatPrice(p.price)}`;
    setResult(prev => ({ ...prev, reply: (prev.reply || '') + '\n' + line }));
  };

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>AI Sales Copilot</h3>
        <p style={{ fontSize: 13, color: '#6b7280' }}>Помогает отвечать клиентам из Avito, VK, WhatsApp и других каналов — подбирает товары, генерирует ответы и создаёт заявки.</p>
        {s.businessProducts?.length > 0 && (
          <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 12, color: '#9ca3af' }}>
            <span>Товаров: {s.businessProducts.length}</span>
            {s.businessLeads && <span>Заявок: {s.businessLeads.length}</span>}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 20, alignItems: 'start' }}>
        {/* LEFT: Input */}
        <div>
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 20, padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#374151' }}>Сообщение клиента</div>
            <textarea value={message} onChange={e => setMessage(e.target.value)} rows={6} placeholder="Вставьте сообщение клиента из Avito, VK, WhatsApp или чата на сайте." style={{ width: '100%', padding: 12, border: '1px solid #e5e7eb', borderRadius: 12, fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }} maxLength={4000} />
            <div style={{ fontSize: 11, color: '#9ca3af', textAlign: 'right', marginTop: 2 }}>{message.length}/4000</div>

            {/* Quick examples */}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
              {['Есть в наличии?', 'Дорого, сделаете дешевле?', 'Можно доставку сегодня?', 'Хочу купить, как оформить?'].map(ex => (
                <span key={ex} onClick={() => setMessage(ex)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 999, background: '#f8f8fa', border: '1px solid #e5e7eb', color: '#6b7280', cursor: 'pointer' }}>{ex}</span>
              ))}
            </div>
          </div>

          {/* Settings */}
          <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
            <CustomSelect value={channel} onChange={e => setChannel(e.target.value)} options={[{value:'',label:'Без канала'},{value:'avito',label:'Avito'},{value:'vk',label:'VK'},{value:'whatsapp',label:'WhatsApp'},{value:'site',label:'Сайт'},{value:'phone',label:'Телефон'}]} placeholder="Канал" />
            <CustomSelect value={scenario} onChange={e => setScenario(e.target.value)} options={[{value:'auto',label:'Автоопределение'},{value:'first_contact',label:'Первичный ответ'},{value:'ask_price',label:'Цена и наличие'},{value:'ask_delivery',label:'Доставка'},{value:'ask_discount',label:'Скидка/торг'},{value:'expensive_objection',label:'Возражение "дорого"'},{value:'product_selection',label:'Подбор товара'},{value:'close_deal',label:'Завершение сделки'}]} placeholder="Сценарий" />
            <CustomSelect value={style} onChange={e => setStyle(e.target.value)} options={[{value:'friendly',label:'Дружелюбно'},{value:'short',label:'Коротко'},{value:'professional',label:'Профессионально'},{value:'confident',label:'Уверенно'},{value:'minimal',label:'Максимально кратко'}]} placeholder="Стиль" />
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            <button onClick={handleSubmit} disabled={s.copilotLoading || !message.trim()} style={{ padding: '10px 24px', background: s.copilotLoading || !message.trim() ? '#d1d5db' : '#111', color: '#fff', borderRadius: 999, fontSize: 14, fontWeight: 600, cursor: s.copilotLoading || !message.trim() ? 'not-allowed' : 'pointer', border: 'none' }}>
              {s.copilotLoading ? 'Подбираем...' : 'Подобрать ответ'}
            </button>
            <button onClick={() => { setMessage(''); setResult(null); }} style={{ padding: '10px 20px', background: '#fff', color: '#6b7280', borderRadius: 999, fontSize: 14, fontWeight: 600, cursor: 'pointer', border: '1px solid #e5e7eb' }}>Очистить</button>
          </div>
        </div>

        {/* RIGHT: Results */}
        <div>
          {!result && (
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 20, padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
              Вставьте сообщение клиента — AI подготовит ответ, подберёт товары и предложит следующий шаг.
            </div>
          )}

          {result && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Main reply */}
              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#667eea', marginBottom: 6 }}>Готовый ответ</div>
                <div style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{result.reply}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                  <button onClick={() => copyText(result.reply, 'main')} style={btnSm}>{copied === 'main' ? '{/* [ok] */} Скопировано' : 'Скопировать'}</button>
                  {result.shortReply && <button onClick={() => copyText(result.shortReply, 'short')} style={btnSmOut}>{copied === 'short' ? '{/* [ok] */}' : 'Сделать короче'}</button>}
                  {result.detailedReply && <button onClick={() => copyText(result.detailedReply, 'detail')} style={btnSmOut}>{copied === 'detail' ? '{/* [ok] */}' : 'Подробнее'}</button>}
                  <button onClick={openLead} style={{ ...btnSmOut, color: '#667eea', borderColor: '#667eea' }}>Создать лид</button>
                </div>
              </div>

              {/* Next step */}
              {result.nextStep && (
                <div style={{ background: '#f8f8fa', border: '1px solid #e5e7eb', borderRadius: 14, padding: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Следующий шаг</div>
                  <div style={{ fontSize: 13, color: '#6b7280' }}>{result.nextStep}</div>
                  {result.followUp && (
                    <div style={{ marginTop: 6 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 2 }}>Follow-up</div>
                      <div style={{ fontSize: 13, color: '#6b7280' }}>{result.followUp}</div>
                      <button onClick={() => copyText(result.followUp, 'follow')} style={{ ...btnSmOut, marginTop: 4 }}>{copied === 'follow' ? '{/* [ok] */}' : 'Скопировать follow-up'}</button>
                    </div>
                  )}
                </div>
              )}

              {/* Objection handling */}
              {result.objectionReply && (
                <div style={{ background: '#fff8ed', border: '1px solid #f3dfbf', borderRadius: 14, padding: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#92400e', marginBottom: 4 }}>Обработка возражения</div>
                  <div style={{ fontSize: 13, color: '#92400e' }}>{result.objectionReply}</div>
                  <button onClick={() => copyText(result.objectionReply, 'obj')} style={{ ...btnSmOut, marginTop: 6, color: '#92400e', borderColor: '#f3dfbf' }}>{copied === 'obj' ? '{/* [ok] */}' : 'Скопировать'}</button>
                </div>
              )}

              {/* Matched products */}
              {result.products?.length > 0 && (
                <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 8 }}>Подходящие товары</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {result.products.map(p => (
                      <div key={p.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 10, background: '#f8f8fa', borderRadius: 12 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                          <div style={{ fontSize: 13, fontWeight: 800, color: '#111' }}>{formatPrice(p.price)}</div>
                          {(p.brand || p.productType) && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{[p.brand, p.productType].filter(Boolean).join(' · ')}</div>}
                        </div>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          <button onClick={() => s.loadProduct(p.id)} style={btnSmOut}>Открыть</button>
                          <button onClick={() => insertProduct(p)} style={btnSmOut}>Вставить</button>
                          <button onClick={() => { setLeadForm(f => ({ ...f, productId: p.id, customerNeed: 'Хочу купить' })); openLead(); }} style={{ ...btnSmOut, color: '#667eea', borderColor: '#667eea' }}>Лид</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Detected */}
              {result.detected && Object.values(result.detected).some(Boolean) && (
                <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Что понял AI</div>
                  <div style={{ fontSize: 12, color: '#6b7280', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {result.detected.intent && <span>Намерение: <strong>{intentLabel(result.detected.intent)}</strong></span>}
                    {result.detected.urgency && <span>Срочность: {result.detected.urgency === 'high' ? 'Высокая' : 'Обычная'}</span>}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Create Lead Modal */}
      {leadModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,.3)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => !leadLoading && setLeadModal(false)}>
          <div style={{ background: '#fff', borderRadius: 24, maxWidth: 720, width: '92%', maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px 0', flexShrink: 0 }}>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700 }}>Создать лид</h3>
                <p style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>Клиент из переписки</p>
              </div>
              <button onClick={() => setLeadModal(false)} style={{ fontSize: 20, padding: '0 4px', cursor: 'pointer', border: 'none', background: 'none', color: '#9ca3af', lineHeight: 1 }}>×</button>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px' }}>
              {!leadSent ? (
    <div className="ao-panel-reveal" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {/* 2-col grid for compact fields */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div><label style={lbl}>Имя клиента</label><input value={leadForm.name} onChange={e => setLeadForm(f => ({ ...f, name: e.target.value }))} placeholder="Клиент" style={fld} /></div>
                    <div><label style={lbl}>Телефон</label><input value={leadForm.phone} onChange={e => setLeadForm(f => ({ ...f, phone: e.target.value }))} placeholder="+7 (999) 123-45-67" style={fld} /></div>
                    <div><label style={lbl}>Email</label><input value={leadForm.email} onChange={e => setLeadForm(f => ({ ...f, email: e.target.value }))} placeholder="client@example.com" style={fld} /></div>
                    <div><label style={lbl}>Город доставки</label><input value={leadForm.deliveryCity} onChange={e => setLeadForm(f => ({ ...f, deliveryCity: e.target.value }))} placeholder="Город" style={fld} /></div>
                    <div><label style={lbl}>Способ связи</label><CustomSelect value={leadForm.contactPreference} onChange={e => setLeadForm(f => ({ ...f, contactPreference: e.target.value }))} options={[{value:'',label:'Не выбрано'},{value:'phone',label:'Телефон'},{value:'whatsapp',label:'WhatsApp'},{value:'email',label:'Email'}]} placeholder="Не выбрано" /></div>
                    <div><label style={lbl}>Потребность</label><input value={leadForm.customerNeed} onChange={e => setLeadForm(f => ({ ...f, customerNeed: e.target.value }))} placeholder="Хочу купить / уточнить детали" style={fld} /></div>
                  </div>
                  {leadForm.message && (
                    <div>
                      <label style={lbl}>Сообщение клиента</label>
                      <div style={{ fontSize: 12, color: '#555', background: '#f9f9f9', padding: '8px 12px', borderRadius: 10, maxHeight: 100, overflow: 'auto' }}>{leadForm.message}</div>
                    </div>
                  )}
                  {leadForm.aiReply && (
                    <div>
                      <label style={lbl}>AI-ответ</label>
                      <div style={{ fontSize: 12, color: '#6b7280', background: '#f3f0ff', padding: '8px 12px', borderRadius: 10, border: '1px solid #dfe4ff', maxHeight: 100, overflow: 'auto' }}>{leadForm.aiReply.slice(0, 500)}{leadForm.aiReply.length > 500 && '...'}</div>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: 24 }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>{/* [ok] */}</div>
                  <p style={{ fontWeight: 600, fontSize: 16 }}>Лид создан</p>
                  <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>Заявка появилась во вкладке «Клиенты»</p>
                </div>
              )}
            </div>

            {/* Footer */}
            {!leadSent && (
              <div style={{ padding: '12px 24px 20px', borderTop: '1px solid #f5f5f5', flexShrink: 0 }}>
                {!leadForm.phone && !leadForm.email && (
                  <div style={{ fontSize: 11, color: '#92400e', background: '#fff8ed', padding: '6px 10px', borderRadius: 8, marginBottom: 8 }}>Контакт не указан. Лид будет создан без телефона и email.</div>
                )}
                {leadError && (
                  <div style={{ fontSize: 12, color: '#991b1b', background: '#fef2f2', padding: '8px 12px', borderRadius: 8, marginBottom: 8 }}>{leadError}</div>
                )}
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={submitLead} disabled={leadLoading} style={{ flex: 1, padding: 12, background: leadLoading ? '#d1d5db' : '#111', color: '#fff', borderRadius: 999, fontSize: 14, fontWeight: 600, cursor: leadLoading ? 'not-allowed' : 'pointer', border: 'none' }}>{leadLoading ? 'Создаём...' : 'Создать лид'}</button>
                  <button onClick={() => { setLeadModal(false); setLeadError(''); }} style={{ padding: '12px 20px', background: '#fff', color: '#6b7280', borderRadius: 999, fontSize: 14, fontWeight: 600, cursor: 'pointer', border: '1px solid #e5e7eb' }}>Отмена</button>
                </div>
              </div>
            )}
            {leadSent && (
              <div style={{ padding: '12px 24px 20px', borderTop: '1px solid #f5f5f5', flexShrink: 0, display: 'flex', gap: 10 }}>
                <button onClick={() => setLeadModal(false)} style={{ flex: 1, padding: 12, background: '#111', color: '#fff', borderRadius: 999, fontSize: 14, fontWeight: 600, cursor: 'pointer', border: 'none' }}>Готово</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
//  PAYMENT
// ═══════════════════════════════════════════════

function sourceLabel(s) {
  const map = { product_contact: 'Заявка по товару', ai_compare: 'AI-сравнение', shop_contact: 'Заявка магазина', assistant: 'AI-ассистент', copilot: 'AI Sales Copilot' };
  return map[s] || s || 'Заявка';
}
function prefLabel(v) { const m={phone:'Телефон',whatsapp:'WhatsApp',email:'Email'}; return m[v]||v; }
function needLabel(v) { const m={buy:'Хочу купить',details:'Уточнить детали',compare:'Сравнить с другим',consult:'Консультация'}; return m[v]||v; }
function statusLabel(s) { const m={new:'Новая',in_progress:'В работе',contacted:'Связались',deal:'Сделка',rejected:'Отказ'}; return m[s]||s; }
function leadVariant(s) { if(s==='new')return'info';if(s==='in_progress')return'neutral';if(s==='contacted')return'neutral';if(s==='deal')return'success';return'muted'; }
