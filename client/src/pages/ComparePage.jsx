import { useState, useEffect } from 'react';
import { useStore } from '../hooks/useStore';
import { getProductMainImage } from '../utils/productImages';
import { formatPrice, getConditionLabel, getProductTypeLabel } from '../utils/format';
import { getCategoryLabel } from '../constants/categories';
import AgentIcon from '../components/AgentIcon';

const C = { bg:'#fff', bd:'#e5e7eb', rb:'#f0f0f3', t1:'#0b0f19', t2:'#667085', t3:'#98a2b3', btn:'#050505' };
const page = { maxWidth:1240, margin:'0 auto', padding:'28px 20px 56px' };

// ── Product image with fallback ──
function ProductImg({ src, alt }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return (
    <div style={{ width:'100%', height:'100%', background:'#f8fafc', border:'1px solid #e5e7eb', borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <span style={{ fontSize:11, fontWeight:600, color:'#98a2b3' }}>Нет фото</span>
    </div>
  );
  return <img src={src} alt={alt} style={{ width:'100%', height:'100%', objectFit:'contain', padding:4 }} onError={() => setFailed(true)} />;
}
function getRecommendation(items) {
  const avail = items.filter(i => !i.unavailable);
  if (avail.length < 2) return null;
  const fields = ['shopName','brand','color','deliveryTerm','productType','category','price','oldPrice','benefits','description'];
  const scored = avail.map(p => {
    const filled = fields.filter(f => p[f] != null && p[f] !== '' && (!Array.isArray(p[f]) || p[f].length > 0)).length;
    const completenessScore = filled / fields.length;
    const maxPrice = Math.max(...avail.map(x => x.price || 0)) || 1;
    const priceScore = 1 - ((p.price || 0) / maxPrice);
    const conditionScore = (p.condition || 'new') === 'new' ? 1 : 0.5;
    const deliveryScore = p.deliveryTerm ? 1 : 0;
    const infoScore = ((p.description ? 1 : 0) + ((p.benefits || []).length > 0 ? 1 : 0)) / 2;
    const score = priceScore * 0.35 + completenessScore * 0.25 + conditionScore * 0.15 + deliveryScore * 0.10 + infoScore * 0.15;
    const reasons = [];
    if (priceScore > 0.55) reasons.push('Сильная цена');
    if (completenessScore > 0.55) reasons.push('Карточка заполнена лучше остальных');
    if (conditionScore === 1) reasons.push('Новое состояние');
    if (deliveryScore > 0) reasons.push('Указан срок доставки');
    if (infoScore > 0) reasons.push('Есть описание или преимущества');
    return { product: p, score, reasons, confidence: avail.length >= 3 && completenessScore > 0.5 ? 'high' : 'medium' };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0];
}

export default function ComparePage() {
  const s = useStore();
  const items = s.compareItems;
  const [syncing, setSyncing] = useState(true);

  useEffect(() => { (async () => { if (s.compareItems.length > 0) await s.syncCompareItems(); setSyncing(false); })(); }, []);

  const avail = items.filter(i => !i.unavailable);
  const openProduct = (id) => { s.loadProduct(id); s.setPage('product'); };
  const rec = getRecommendation(items);

  if (items.length === 0) return <EmptyState s={s} />;

  const allFields = [
    { key:'price', label:'Цена', render: p => <span style={{ fontWeight:800, color:C.t1 }}>{formatPrice(p.price,'—')}</span> },
    { key:'oldPrice', label:'Цена до скидки', render: p => p.oldPrice ? <span style={{ color:C.t3, textDecoration:'line-through' }}>{formatPrice(p.oldPrice)}</span> : <span style={{ color:C.t3 }}>—</span> },
    { key:'shopName', label:'Магазин', render: p => <span>{p.shopName || '—'}</span> },
    { key:'category', label:'Категория', render: p => <span>{getCategoryLabel(p.category) || '—'}</span> },
    { key:'brand', label:'Бренд', render: p => <span>{p.brand || '—'}</span> },
    { key:'color', label:'Цвет', render: p => <span>{p.color || '—'}</span> },
    { key:'condition', label:'Состояние', render: p => <span>{getConditionLabel(p.condition)}</span> },
    { key:'deliveryTerm', label:'Срок доставки', render: p => <span>{p.deliveryTerm || '—'}</span> },
    { key:'productType', label:'Тип товара', render: p => <span>{getProductTypeLabel(p.productType)}</span> },
    { key:'keyboardType', label:'Клавиатура', render: p => <span>{p.keyboardType || '—'}</span> },
    { key:'keyboardConnection', label:'Подключение', render: p => <span>{p.keyboardConnection || '—'}</span> },
  ];

  return (
    <div style={page}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:10 }}>
        <div>
          <h2 style={{ fontSize:26, fontWeight:800, color:C.t1, letterSpacing:'-0.02em', marginBottom:3 }}>Сравнение товаров</h2>
          <p style={{ fontSize:13, color:C.t2 }}>Сравните характеристики и выберите подходящий вариант</p>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <span style={{ fontSize:12, fontWeight:600, color:C.t1, background:'#f3f4f6', padding:'4px 12px', borderRadius:999 }}>{avail.length} товара</span>
          <button onClick={() => s.clearCompare()} style={btnClear}>Очистить</button>
        </div>
      </div>

      {items.some(i => i.unavailable) && <div style={unavailBar}>Некоторые товары больше недоступны.</div>}

      {/* Main */}
      <div style={{ display:'grid', gridTemplateColumns:'minmax(0,1fr) 320px', gap:20, alignItems:'start' }}>
        {/* Table */}
        <div style={{ background:C.bg, border:'1px solid ' + C.bd, borderRadius:20, overflow:'hidden' }}>
          <div style={{ overflowX:'auto', maxWidth:'100%' }}>
            <table style={{ borderCollapse:'collapse', width:'100%', minWidth:avail.length * 180 + 180 }}>
              <thead>
                <tr>
                  <th style={{ ...th, width:180, position:'sticky', left:0, zIndex:2, background:'#fafafa', borderRight:'1px solid ' + C.bd, borderBottom:'1px solid ' + C.bd, textAlign:'left', verticalAlign:'middle', padding:'14px 18px' }}>
                    <div style={{ fontSize:14, fontWeight:700, color:'#0b0f19', lineHeight:1.2, whiteSpace:'nowrap' }}>Параметры</div>
                    <div style={{ fontSize:11, fontWeight:500, color:'#98a2b3', lineHeight:1.2, whiteSpace:'nowrap', marginTop:3 }}>Данные карточек</div>
                  </th>
                  {items.map(p => (
                    <th key={p.id} style={{ ...th, opacity: p.unavailable ? 0.45 : 1, verticalAlign:'top' }}>
                      <div style={{ width:72, height:56, borderRadius:12, overflow:'hidden', margin:'0 auto 8px' }}>
                        {p.unavailable ? <span style={{ fontSize:16, color:C.t3 }}>—</span> : <ProductImg src={getProductMainImage(p)} alt={p.name} />}
                      </div>
                      <div style={{ fontSize:12, fontWeight:700, color:C.t1, lineHeight:1.25, display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden', marginBottom:3 }}>{p.name}</div>
                      {!p.unavailable && <div style={{ fontSize:13, fontWeight:800, color:C.t1, marginBottom:1 }}>{formatPrice(p.price)}</div>}
                      <div style={{ fontSize:10, color:C.t3, marginBottom:6, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:140 }}>{p.shopName}</div>
                      <button onClick={() => s.removeFromCompare(p.id)} style={btnRemove}>Убрать</button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allFields.map(f => (
                  <tr key={f.key}>
                    <td style={{ ...td, ...labelTd, borderBottom:'1px solid ' + C.rb }}>{f.label}</td>
                    {items.map(p => <td key={p.id} style={{ ...td, borderBottom:'1px solid ' + C.rb, opacity: p.unavailable ? 0.4 : 1 }}>{f.render(p)}</td>)}
                  </tr>
                ))}
                <tr>
                  <td style={{ ...td, ...labelTd }}>Преимущества</td>
                  {items.map(p => <td key={p.id} style={{ ...td, opacity: p.unavailable ? 0.4 : 1 }}>{p.benefits?.length > 0 ? p.benefits.map((b,i) => <div key={i} style={{ marginBottom:2, fontSize:11 }}>{b}</div>) : <span style={{ color:C.t3 }}>—</span>}</td>)}
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Recommendation Dashboard */}
        <div style={{ background:C.bg, border:'1px solid ' + C.bd, borderRadius:20, padding:24, position:'sticky', top:20 }}>
          <div style={{ fontSize:10, fontWeight:600, color:C.t3, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:16 }}>Рекомендация</div>

          {!rec ? (
            <div style={{ textAlign:'center', padding:'32px 0' }}>
              <p style={{ fontSize:13, color:C.t2, lineHeight:1.6 }}>Добавьте ещё товары, чтобы<br/>получить рекомендацию.</p>
            </div>
          ) : (
            <>
              <div style={{ width:'100%', height:120, borderRadius:16, overflow:'hidden', marginBottom:14 }}>
                <ProductImg src={getProductMainImage(rec.product)} alt={rec.product.name} />
              </div>
              <div style={{ fontSize:15, fontWeight:700, color:C.t1, lineHeight:1.25, marginBottom:4 }}>{rec.product.name}</div>
              <div style={{ fontSize:20, fontWeight:800, color:C.t1, marginBottom:6 }}>{formatPrice(rec.product.price)}</div>
              <div style={{ fontSize:12, color:C.t3, marginBottom:14 }}>{rec.product.shopName || ''}</div>

              <div style={{ backgroundColor:'#f8fafc', borderRadius:14, padding:14, marginBottom:16 }}>
                <div style={{ fontSize:11, fontWeight:700, color:C.t2, marginBottom:8 }}>Почему этот товар:</div>
                {rec.reasons.map((r,i) => (
                  <div key={i} style={{ fontSize:12, color:C.t2, lineHeight:1.6, padding:'4px 0', borderBottom:i < rec.reasons.length-1 ? '1px solid ' + C.rb : 'none' }}>{r}</div>
                ))}
              </div>

              <button onClick={() => openProduct(rec.product.id)} style={{ width:'100%', padding:'12px 0', borderRadius:14, fontSize:14, fontWeight:700, cursor:'pointer', border:'none', background:C.btn, color:'#fff' }}>Перейти к товару</button>

              <p style={{ fontSize:10, color:C.t3, marginTop:12, lineHeight:1.5, textAlign:'center' }}>Расчёт: цена, заполненность, состояние, доставка, описание</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ s }) {
  return (
    <div style={{ maxWidth:440, margin:'80px auto', padding:'0 16px', textAlign:'center' }}>
      <div style={{ background:C.bg, border:'1px solid ' + C.bd, borderRadius:24, padding:48 }}>
        <h2 style={{ fontSize:20, fontWeight:700, color:C.t1, marginBottom:6 }}>Сравнение пустое</h2>
        <p style={{ fontSize:14, color:C.t2, lineHeight:1.5, marginBottom:20 }}>Добавьте товары из каталога, чтобы сравнить характеристики.</p>
        <button onClick={() => s.setPage('catalog')} style={{ padding:'12px 28px', background:C.btn, color:'#fff', borderRadius:14, fontSize:14, fontWeight:700, cursor:'pointer', border:'none' }}>Перейти в каталог</button>
      </div>
    </div>
  );
}

const th = { padding:'14px 16px', fontSize:11, color:C.t2, fontWeight:600, textAlign:'center', borderBottom:'1px solid ' + C.bd };
const td = { padding:'9px 14px', fontSize:12, color:C.t2, verticalAlign:'middle', minWidth:130, textAlign:'center' };
const labelTd = { fontWeight:600, color:'#475467', textAlign:'left', background:'#fafafa', position:'sticky', left:0, zIndex:1, borderRight:'1px solid ' + C.bd };
const btnClear = { padding:'7px 18px', background:C.bg, color:'#475467', borderRadius:12, fontSize:12, fontWeight:600, cursor:'pointer', border:'1px solid ' + C.bd };
const btnRemove = { padding:'4px 12px', borderRadius:999, fontSize:11, fontWeight:600, cursor:'pointer', border:'1px solid ' + C.bd, background:C.bg, color:C.t2 };
const unavailBar = { background:'#fef9f0', border:'1px solid #f5e6d3', borderRadius:14, padding:'10px 16px', marginBottom:16, fontSize:13, color:'#92400e' };
