import AgentIcon from '../AgentIcon';

export default function SellerAttentionPanel({ items, onNavigate, loading }) {
  if (loading) {
    return (
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 20, padding: 24, textAlign: 'center', color: '#98a2b3' }}>
        Загрузка задач...
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div style={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 20, padding: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
        <AgentIcon name="check" size={22} muted />
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#0b0f19' }}>Сегодня критичных задач нет</div>
          <div style={{ fontSize: 13, color: '#667085' }}>Можно заняться улучшением карточек или настройками.</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 20, padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <AgentIcon name="alert" size={20} />
        <div style={{ fontSize: 15, fontWeight: 800, color: '#0b0f19' }}>Требует внимания</div>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#667085' }}>{items.length} {plural(items.length, 'задача', 'задачи', 'задач')}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map(item => (
          <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, background: '#f8fafc', borderRadius: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0b0f19' }}>{item.title}</div>
              <div style={{ fontSize: 12, color: '#667085', marginTop: 2 }}>{item.reason}</div>
            </div>
            <button onClick={() => onNavigate(item.tab)} style={priorityBtn(item.priority)}>{item.action}</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function priorityBtn(priority) {
  const map = {
    high: { bg: '#0b0f19', color: '#fff', border: 'none' },
    medium: { bg: '#fff', color: '#374151', border: '1px solid #e5e7eb' },
    low: { bg: '#fff', color: '#667085', border: '1px solid #e5e7eb' },
  };
  const s = map[priority] || map.medium;
  return {
    padding: '8px 16px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer',
    background: s.bg, color: s.color, border: s.border, whiteSpace: 'nowrap',
  };
}

function plural(n, one, two, many) {
  const m = n % 100;
  if (m >= 11 && m <= 19) return many;
  const d = m % 10;
  if (d === 1) return one;
  if (d >= 2 && d <= 4) return two;
  return many;
}
