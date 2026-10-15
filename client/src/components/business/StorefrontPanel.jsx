import { useState } from 'react';
import AgentIcon from '../AgentIcon';

export default function StorefrontPanel({ shop, stats, aiEnabled }) {
  const [copied, setCopied] = useState(false);
  const slug = shop?.slug || '';
  const name = shop?.name || 'Мой магазин';
  const productCount = stats?.productsTotal ?? 0;
  const url = slug ? `${window.location.origin}/#/shop/${slug}` : '';

  const copy = () => {
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 20, padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <AgentIcon name="store" size={20} muted />
        <div style={{ fontSize: 15, fontWeight: 800, color: '#0b0f19' }}>Публичный магазин</div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        {shop?.logoUrl ? (
          <img src={shop.logoUrl} alt="" style={{ width: 48, height: 48, borderRadius: 12, objectFit: 'contain', border: '1px solid #e5e7eb' }} />
        ) : (
          <div style={{ width: 48, height: 48, borderRadius: 12, background: '#f8fafc', border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AgentIcon name="store" size={22} muted />
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#0b0f19', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
          {slug && <div style={{ fontSize: 12, color: '#667085' }}>@{slug}</div>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
        <div style={{ padding: 10, background: '#f8fafc', borderRadius: 12 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#0b0f19' }}>{productCount}</div>
          <div style={{ fontSize: 11, color: '#667085' }}>Товаров в каталоге</div>
        </div>
        <div style={{ padding: 10, background: '#f8fafc', borderRadius: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: aiEnabled ? '#065f46' : '#9ca3af' }}>{aiEnabled ? 'Включён' : 'Выключен'}</div>
          <div style={{ fontSize: 11, color: '#667085' }}>AI-менеджер</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => slug && window.open('/#/shop/' + slug, '_blank')} disabled={!slug} style={{ ...primaryBtn, opacity: slug ? 1 : 0.5 }}>Открыть магазин</button>
        <button onClick={copy} disabled={!url} style={{ ...secondaryBtn, opacity: url ? 1 : 0.5 }}>{copied ? 'Скопировано' : 'Копировать ссылку'}</button>
      </div>
    </div>
  );
}

const primaryBtn = { padding: '10px 18px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', background: '#0b0f19', color: '#fff', whiteSpace: 'nowrap' };
const secondaryBtn = { padding: '10px 18px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid #e5e7eb', background: '#fff', color: '#374151', whiteSpace: 'nowrap' };
