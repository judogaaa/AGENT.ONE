import AgentIcon from '../AgentIcon';

export default function SellerRecommendations({ recommendations, onNavigate }) {
  if (!recommendations || recommendations.length === 0) return null;

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 20, padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <AgentIcon name="robot" size={20} muted />
        <div style={{ fontSize: 15, fontWeight: 800, color: '#0b0f19' }}>AI-рекомендации</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {recommendations.map(r => (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, background: '#f8fafc', borderRadius: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#0b0f19' }}>{r.title}</div>
                <ImpactBadge impact={r.impact} />
              </div>
              <div style={{ fontSize: 12, color: '#667085', marginTop: 2, lineHeight: 1.4 }}>{r.reason}</div>
            </div>
            <button onClick={() => onNavigate(r.tab)} style={primaryBtn}>{r.action}</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ImpactBadge({ impact }) {
  const map = {
    'Высокий': { bg: '#fef2f2', color: '#991b1b', border: '#fecaca' },
    'Средний': { bg: '#fffbeb', color: '#92400e', border: '#fde68a' },
    'Низкий': { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
  };
  const s = map[impact] || map['Средний'];
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: s.bg, color: s.color, border: '1px solid ' + s.border, whiteSpace: 'nowrap' }}>
      {impact} приоритет
    </span>
  );
}

const primaryBtn = { padding: '8px 16px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none', background: '#0b0f19', color: '#fff', whiteSpace: 'nowrap' };
