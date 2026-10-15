import AgentIcon from '../AgentIcon';

export default function SalesChannelsPanel({ aiEnabled }) {
  const channels = [
    { key: 'site', label: 'Сайт магазина', status: 'connected', hint: 'Подключён' },
    { key: 'ai', label: 'AI-менеджер', status: aiEnabled ? 'connected' : 'disabled', hint: aiEnabled ? 'Подключён' : 'Выключен' },
    { key: 'avito', label: 'Avito', status: 'planned', hint: 'Скоро' },
    { key: 'whatsapp', label: 'WhatsApp', status: 'planned', hint: 'Скоро' },
    { key: 'vk', label: 'VK', status: 'planned', hint: 'Скоро' },
  ];

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 20, padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <AgentIcon name="chat" size={20} muted />
        <div style={{ fontSize: 15, fontWeight: 800, color: '#0b0f19' }}>Каналы продаж</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
        {channels.map(c => (
          <div key={c.key} style={{ padding: 14, background: '#f8fafc', borderRadius: 16, border: '1px solid ' + (c.status === 'connected' ? '#e5e7eb' : '#f3f4f6') }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <StatusDot status={c.status} />
              <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{c.label}</span>
            </div>
            <div style={{ fontSize: 11, color: '#667085' }}>{c.hint}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12, fontSize: 12, color: '#98a2b3' }}>Подключения каналов появятся позже.</div>
    </div>
  );
}

function StatusDot({ status }) {
  const colors = {
    connected: '#065f46',
    disabled: '#9ca3af',
    planned: '#d1d5db',
  };
  return <div style={{ width: 8, height: 8, borderRadius: '50%', background: colors[status] || '#d1d5db', flexShrink: 0 }} />;
}
