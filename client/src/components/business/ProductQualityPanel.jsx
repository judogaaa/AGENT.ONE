import { useState } from 'react';
import { scoreProduct, getProductIssues, qualityLabel, qualityColor } from '../../utils/sellerQuality';
import { formatPrice } from '../../utils/format';
import { getProductMainImage } from '../../utils/productImages';
import AgentIcon from '../AgentIcon';

export default function ProductQualityPanel({ quality, products, onNavigate }) {
  const [showAll, setShowAll] = useState(false);
  const problematic = products.filter(p => getProductIssues(p).length > 0).sort((a, b) => scoreProduct(a) - scoreProduct(b));
  const displayed = showAll ? problematic : problematic.slice(0, 5);
  const qcol = qualityColor(quality.average);

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 20, padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#98a2b3', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4 }}>Качество карточек</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#0b0f19' }}>{quality.average}</div>
            <span style={{ fontSize: 13, color: '#667085' }}>из 100 · {qualityLabel(quality.average)}</span>
          </div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 999, background: qcol.bg, color: qcol.color, border: '1px solid ' + qcol.bg }}>
          {quality.problemCount > 0 ? `${quality.problemCount} проблем` : 'Всё в порядке'}
        </span>
      </div>

      {quality.problemCount === 0 ? (
        <div style={{ fontSize: 13, color: '#667085', padding: '8px 0' }}>Все карточки заполнены качественно.</div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            {displayed.map(p => {
              const score = scoreProduct(p);
              const issues = getProductIssues(p);
              const col = qualityColor(score);
              const img = getProductMainImage(p);
              return (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, background: '#f8fafc', borderRadius: 14 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: '#fff', border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                    {img ? <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 2 }} onError={e => { e.target.style.display = 'none'; }} /> : <AgentIcon name="box" size={16} muted />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name || 'Без названия'}</div>
                    <div style={{ fontSize: 11, color: '#98a2b3', marginTop: 1 }}>{issues.slice(0, 3).join(' · ')}</div>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 999, background: col.bg, color: col.color, whiteSpace: 'nowrap' }}>{score}</div>
                </div>
              );
            })}
          </div>
          {problematic.length > 5 && (
            <button onClick={() => setShowAll(v => !v)} style={{ width: '100%', padding: '10px', borderRadius: 12, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              {showAll ? 'Скрыть' : `Показать ещё ${problematic.length - 5}`}
            </button>
          )}
        </>
      )}
      <button onClick={() => onNavigate('products')} style={{ ...secondaryBtn, width: '100%', marginTop: 12 }}>Проверить товары</button>
    </div>
  );
}

const secondaryBtn = { padding: '10px 20px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid #e5e7eb', background: '#fff', color: '#374151' };
