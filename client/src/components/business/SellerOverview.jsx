import { useMemo, useState } from 'react';
import { useStore } from '../../hooks/useStore';
import { formatPrice } from '../../utils/format';
import { qualitySummary, qualityLabel, qualityColor } from '../../utils/sellerQuality';
import { buildRecommendations, buildAttentionItems } from '../../utils/sellerRecommendations';
import AgentIcon from '../AgentIcon';
import MotionNumber from '../motion/MotionNumber';
import SellerAttentionPanel from './SellerAttentionPanel';
import ProductQualityPanel from './ProductQualityPanel';
import SellerRecommendations from './SellerRecommendations';
import SalesChannelsPanel from './SalesChannelsPanel';
import StorefrontPanel from './StorefrontPanel';
import './SellerOverview.css';

const INNER_TABS = [
  { key: 'summary', label: 'Сводка' },
  { key: 'attention', label: 'Требует внимания' },
  { key: 'ai', label: 'AI' },
  { key: 'cards', label: 'Карточки' },
  { key: 'store', label: 'Магазин' },
  { key: 'channels', label: 'Каналы' },
  { key: 'actions', label: 'Действия' },
];

export default function SellerOverview({ onNavigate }) {
  const s = useStore();
  const [activeTab, setActiveTab] = useState('summary');
  const stats = s.dashboardStats || {};
  const products = s.businessProducts || [];
  const orders = s.businessOrders || [];
  const leads = s.myLeads || [];
  const dialogs = s.aiManagerDialogs || [];
  const settings = s.aiManagerSettings || {};
  const shop = s.currentShop || {};

  const quality = useMemo(() => qualitySummary(products), [products]);
  const recommendations = useMemo(() => buildRecommendations({ stats, products, orders, leads, dialogs, aiManagerSettings: settings }), [stats, products, orders, leads, dialogs, settings]);
  const attention = useMemo(() => buildAttentionItems({ stats, products, orders, leads, dialogs, aiManagerSettings: settings }), [stats, products, orders, leads, dialogs, settings]);

  const aiSummary = {
    enabled: settings.enabled !== false,
    mode: settings.mode || 'assistive',
    waiting: (s.aiManagerCounts?.waiting_seller ?? dialogs.filter(d => d.status === 'waiting_seller').length),
    leads: (s.aiManagerCounts?.lead_created ?? dialogs.filter(d => d.status === 'lead_created').length),
    total: (s.aiManagerCounts?.total ?? dialogs.length),
  };

  const common = { stats, products, orders, leads, dialogs, settings, shop, quality, aiSummary, recommendations, attention, onNavigate, setActiveTab };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div>
        <h3 style={{ fontSize: 20, fontWeight: 800, color: '#0b0f19', margin: '0 0 4px' }}>Рабочий центр продавца</h3>
        <p style={{ fontSize: 13, color: '#667085', margin: 0 }}>Обзор магазина, задачи и действия на сегодня</p>
      </div>

      {/* Inner tabs */}
      <OverviewTabs active={activeTab} onChange={setActiveTab} />

      {/* Tab content */}
      <div style={{ minHeight: 200 }}>
        {activeTab === 'summary' && <SummaryTab {...common} />}
        {activeTab === 'attention' && <AttentionTab {...common} />}
        {activeTab === 'ai' && <AiTab {...common} />}
        {activeTab === 'cards' && <QualityTab {...common} />}
        {activeTab === 'store' && <StoreTab {...common} />}
        {activeTab === 'channels' && <ChannelsTab {...common} />}
        {activeTab === 'actions' && <ActionsTab {...common} />}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
//  INNER TABS
// ═══════════════════════════════════════════════

function OverviewTabs({ active, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '4px 0', scrollbarWidth: 'none' }}>
      {INNER_TABS.map(t => {
        const isActive = active === t.key;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            style={{
              padding: '8px 16px',
              borderRadius: 999,
              border: 'none',
              background: isActive ? '#0b0f19' : 'transparent',
              color: isActive ? '#fff' : '#6b7280',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all .15s',
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════
//  SUMMARY TAB
// ═══════════════════════════════════════════════

function SummaryTab({ stats, orders, leads, quality, aiSummary, attention, onNavigate, setActiveTab, shop }) {
  const newOrders = orders.filter(o => o.orderStatus === 'created');
  const newLeads = leads.filter(l => (l.status || 'new') === 'new');
  const kpi = [
    { label: 'Заказы', value: stats.ordersTotal ?? 0, icon: 'checklist' },
    { label: 'Заявки', value: stats.leadsTotal ?? 0, icon: 'document' },
    { label: 'Диалоги', value: aiSummary.total, icon: 'chat' },
    { label: 'Товары', value: stats.productsTotal ?? 0, icon: 'box' },
    { label: 'Проблемы', value: quality.problemCount, icon: 'alert', warn: quality.problemCount > 0 },
  ];

  const quickActions = [
    { label: 'Добавить товар', tab: 'products', icon: 'box' },
    { label: 'AI-менеджер', tab: 'ai-manager', icon: 'robot' },
    { label: 'Проверить товары', tab: 'products', icon: 'check' },
    { label: 'Заказы', tab: 'orders', icon: 'checklist' },
    { label: 'Магазин', tab: null, icon: 'store', onClick: () => window.open('/#/shop/' + (shop.slug || ''), '_blank') },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
        {kpi.map(c => (
          <div key={c.label} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <AgentIcon name={c.icon} size={16} muted />
              <span style={{ fontSize: 11, color: '#667085', fontWeight: 500 }}>{c.label}</span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: c.warn ? '#991b1b' : '#0b0f19' }}>
              <MotionNumber value={c.value} />
            </div>
          </div>
        ))}
      </div>

      {/* Two explicit columns */}
      <div className="so-summary-grid">
        <div className="so-summary-col">
          <MiniAttention items={attention} onNavigate={onNavigate} onShowAll={() => setActiveTab('attention')} />
          <CompactAiCard aiSummary={aiSummary} onNavigate={onNavigate} />
        </div>
        <div className="so-summary-col">
          <QuickActions actions={quickActions} onNavigate={onNavigate} />
          <CompactOrdersLeads newOrders={newOrders} newLeads={newLeads} ordersTotal={orders.length} leadsTotal={leads.length} onNavigate={onNavigate} />
        </div>
      </div>
    </div>
  );
}

function MiniAttention({ items, onNavigate, onShowAll }) {
  if (items.length === 0) {
    return (
      <div style={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 18, padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
        <AgentIcon name="check" size={20} muted />
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0b0f19' }}>Критичных задач нет</div>
          <div style={{ fontSize: 12, color: '#667085' }}>Всё под контролем.</div>
        </div>
      </div>
    );
  }

  const top = items.slice(0, 4);
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 18, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#0b0f19' }}>Требует внимания</div>
        <button onClick={onShowAll} style={{ fontSize: 12, fontWeight: 600, color: '#667085', background: 'none', border: 'none', cursor: 'pointer' }}>Все {items.length}</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {top.map(item => (
          <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, background: '#f8fafc', borderRadius: 12 }}>
            <AgentIcon name="alert" size={16} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
              <div style={{ fontSize: 11, color: '#667085', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.reason}</div>
            </div>
            <button onClick={() => onNavigate(item.tab)} style={miniActionBtn(item.priority)}>{item.action}</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function QuickActions({ actions, onNavigate }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 18, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#0b0f19', marginBottom: 10 }}>Быстрые действия</div>
      <div className="so-actions-grid">
        {actions.map(a => (
          <button
            key={a.label}
            onClick={() => a.onClick ? a.onClick() : onNavigate(a.tab)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 12, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer' }}
          >
            <AgentIcon name={a.icon} size={16} muted />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>{a.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function CompactAiCard({ aiSummary, onNavigate }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 18, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0b0f19' }}>AI-менеджер 24/7</div>
          <div style={{ fontSize: 12, color: '#667085', marginTop: 2 }}>{aiSummary.enabled ? 'Включён' : 'Выключен'} · {modeLabel(aiSummary.mode)}</div>
        </div>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: aiSummary.enabled ? '#065f46' : '#9ca3af', flexShrink: 0 }} />
      </div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
        <div><span style={{ fontSize: 18, fontWeight: 800, color: '#0b0f19' }}>{aiSummary.total}</span><span style={{ fontSize: 11, color: '#667085', marginLeft: 4 }}>диалогов</span></div>
        <div><span style={{ fontSize: 18, fontWeight: 800, color: aiSummary.waiting > 0 ? '#991b1b' : '#0b0f19' }}>{aiSummary.waiting}</span><span style={{ fontSize: 11, color: '#667085', marginLeft: 4 }}>ждут</span></div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => onNavigate('ai-manager')} style={primaryBtnSm}>Открыть AI-менеджер</button>
        <button onClick={() => onNavigate('ai-manager')} style={secondaryBtnSm}>Настроить</button>
      </div>
    </div>
  );
}

function CompactOrdersLeads({ newOrders, newLeads, ordersTotal, leadsTotal, onNavigate }) {
  const orderLine = newOrders[0];
  const leadLine = newLeads[0];
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 18, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#0b0f19', marginBottom: 10 }}>Новые заказы и заявки</div>
      <div className="so-mini-orders-grid" style={{ marginBottom: 12 }}>
        <div style={{ padding: 10, background: '#f8fafc', borderRadius: 12 }}>
          <div style={{ fontSize: 11, color: '#667085', marginBottom: 2 }}>Новых заказов</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#0b0f19' }}>{newOrders.length}<span style={{ fontSize: 12, color: '#98a2b3', marginLeft: 3 }}>/ {ordersTotal}</span></div>
          {orderLine ? (
            <div style={{ fontSize: 11, color: '#667085', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>#{orderLine.id?.slice(0, 8)} · {formatPrice(orderLine.totalAmount)}</div>
          ) : (
            <div style={{ fontSize: 11, color: '#98a2b3', marginTop: 4 }}>Новых заказов нет</div>
          )}
        </div>
        <div style={{ padding: 10, background: '#f8fafc', borderRadius: 12 }}>
          <div style={{ fontSize: 11, color: '#667085', marginBottom: 2 }}>Новых заявок</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#0b0f19' }}>{newLeads.length}<span style={{ fontSize: 12, color: '#98a2b3', marginLeft: 3 }}>/ {leadsTotal}</span></div>
          {leadLine ? (
            <div style={{ fontSize: 11, color: '#667085', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{leadLine.name || 'Клиент'}</div>
          ) : (
            <div style={{ fontSize: 11, color: '#98a2b3', marginTop: 4 }}>Новых заявок нет</div>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => onNavigate('orders')} style={{ ...secondaryBtnSm, flex: 1 }}>Заказы</button>
        <button onClick={() => onNavigate('clients')} style={{ ...secondaryBtnSm, flex: 1 }}>Заявки</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
//  OTHER TABS
// ═══════════════════════════════════════════════

function AttentionTab({ attention, onNavigate }) {
  const s = useStore();
  return <SellerAttentionPanel items={attention} onNavigate={onNavigate} loading={s.dashboardStatsLoading} />;
}

function AiTab({ aiSummary, settings, recommendations, onNavigate }) {
  const copilotActions = [
    { label: 'Проверить качество товаров', tab: 'products', icon: 'check' },
    { label: 'Найти клиентов без ответа', tab: 'ai-manager', icon: 'chat' },
    { label: 'Подготовить ответы', tab: 'copilot', icon: 'pencil' },
    { label: 'Показать заказы в работе', tab: 'orders', icon: 'checklist' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 20, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#0b0f19' }}>{aiSummary.enabled ? 'AI-менеджер включён' : 'AI-менеджер выключен'}</div>
            <div style={{ fontSize: 13, color: '#667085', marginTop: 4 }}>
              Режим: {modeLabel(aiSummary.mode)} · {aiSummary.total} {plural(aiSummary.total, 'диалог', 'диалога', 'диалогов')} · {aiSummary.waiting} {plural(aiSummary.waiting, 'ждёт продавца', 'ждут продавца', 'ждут продавца')}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 999, background: aiSummary.enabled ? '#ecfdf5' : '#f3f4f6', color: aiSummary.enabled ? '#065f46' : '#6b7280', border: '1px solid ' + (aiSummary.enabled ? '#ecfdf5' : '#e5e7eb') }}>
              {aiSummary.enabled ? 'Включён' : 'Отключён'}
            </span>
            <span style={{ fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 999, background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb' }}>
              {modeLabel(aiSummary.mode)}
            </span>
          </div>
        </div>
        {!aiSummary.enabled && (
          <div style={{ padding: 12, background: '#f8fafc', borderRadius: 14, border: '1px solid #e5e7eb', marginBottom: 12 }}>
            <div style={{ fontSize: 13, color: '#374151' }}>AI-менеджер выключен. Клиенты не получают автоматические ответы.</div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => onNavigate('ai-manager')} style={primaryBtnSm}>Открыть AI-менеджер</button>
          <button onClick={() => onNavigate('ai-manager')} style={secondaryBtnSm}>Настроить правила</button>
          <button onClick={() => onNavigate('ai-manager')} style={secondaryBtnSm}>Посмотреть диалоги</button>
        </div>
      </div>

      <SellerRecommendations recommendations={recommendations} onNavigate={onNavigate} />

      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 20, padding: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#0b0f19', marginBottom: 12 }}>Что может сделать Copilot</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
          {copilotActions.map(a => (
            <button key={a.label} onClick={() => onNavigate(a.tab)} style={actionHubBtn}>
              <AgentIcon name={a.icon} size={16} muted />
              <span>{a.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function QualityTab({ quality, products, onNavigate }) {
  return <ProductQualityPanel quality={quality} products={products} onNavigate={onNavigate} />;
}

function StoreTab({ shop, stats, aiSummary }) {
  return <StorefrontPanel shop={shop} stats={stats} aiEnabled={aiSummary.enabled} />;
}

function ChannelsTab({ aiSummary }) {
  return <SalesChannelsPanel aiEnabled={aiSummary.enabled} />;
}

function ActionsTab({ attention, quality, aiSummary, orders, leads, onNavigate, shop }) {
  const newOrders = orders.filter(o => o.orderStatus === 'created').length;
  const waiting = aiSummary.waiting;
  const problems = quality.problemCount;

  const mainActions = [
    { label: 'Добавить товар', tab: 'products', icon: 'box' },
    { label: 'Открыть AI-менеджер', tab: 'ai-manager', icon: 'robot' },
    { label: 'Проверить товары', tab: 'products', icon: 'check' },
    { label: 'Открыть заказы', tab: 'orders', icon: 'checklist' },
    { label: 'Открыть заявки', tab: 'clients', icon: 'document' },
    { label: 'Открыть магазин', tab: null, icon: 'store', onClick: () => window.open('/#/shop/' + (shop.slug || ''), '_blank') },
    { label: 'Открыть Sales Copilot', tab: 'copilot', icon: 'pencil' },
  ];

  const scenarios = [
    { label: 'Есть новые заказы', count: newOrders, action: 'Открыть заказы', tab: 'orders', icon: 'checklist' },
    { label: 'Клиенты ждут ответа', count: waiting, action: 'Открыть диалоги', tab: 'ai-manager', icon: 'chat' },
    { label: 'Слабые карточки', count: problems, action: 'Проверить товары', tab: 'products', icon: 'check' },
  ].filter(s => s.count > 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 20, padding: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#0b0f19', marginBottom: 12 }}>Быстрые действия</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
          {mainActions.map(a => (
            <button key={a.label} onClick={() => a.onClick ? a.onClick() : onNavigate(a.tab)} style={actionHubBtn}>
              <AgentIcon name={a.icon} size={18} muted />
              <span>{a.label}</span>
            </button>
          ))}
        </div>
      </div>

      {scenarios.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 20, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0b0f19', marginBottom: 12 }}>Частые сценарии</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {scenarios.map(s => (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: '#f8fafc', borderRadius: 14 }}>
                <AgentIcon name={s.icon} size={18} muted />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{s.label}</div>
                  <div style={{ fontSize: 12, color: '#667085' }}>{s.count} {plural(s.count, 'запись', 'записи', 'записей')}</div>
                </div>
                <button onClick={() => onNavigate(s.tab)} style={secondaryBtnSm}>{s.action}</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {attention.length === 0 && (
        <div style={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 18, padding: 16, textAlign: 'center', color: '#667085', fontSize: 13 }}>
          Сейчас нет срочных действий.
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════

function modeLabel(mode) {
  const map = {
    off: 'Выключен',
    assistive: 'Подсказки',
    auto_reply: 'Автоответ',
    auto_reply_and_lead: 'Автоответ + заявки',
  };
  return map[mode] || mode;
}

function plural(n, one, two, many) {
  const m = n % 100;
  if (m >= 11 && m <= 19) return many;
  const d = m % 10;
  if (d === 1) return one;
  if (d >= 2 && d <= 4) return two;
  return many;
}

function miniActionBtn(priority) {
  const map = {
    high: { bg: '#0b0f19', color: '#fff' },
    medium: { bg: '#fff', color: '#374151', border: '#e5e7eb' },
    low: { bg: '#fff', color: '#667085', border: '#e5e7eb' },
  };
  const s = map[priority] || map.medium;
  return {
    padding: '6px 12px', borderRadius: 999, fontSize: 11, fontWeight: 600, cursor: 'pointer',
    background: s.bg, color: s.color, border: s.border ? '1px solid ' + s.border : 'none', whiteSpace: 'nowrap',
  };
}

const primaryBtnSm = { padding: '8px 16px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none', background: '#0b0f19', color: '#fff' };
const secondaryBtnSm = { padding: '8px 16px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid #e5e7eb', background: '#fff', color: '#374151' };
const actionHubBtn = { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'left' };
