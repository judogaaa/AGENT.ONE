import { useState, useEffect, useRef } from 'react';
import { useStore } from '../hooks/useStore';
import { formatPrice, getConditionLabel, getProductTypeLabel } from '../utils/format';
import { getCategoryLabel } from '../constants/categories';
import BrandMark from '../components/BrandMark';
import { getProductMainImage } from '../utils/productImages';
import AgentIcon from '../components/AgentIcon';
import { loadFunctionalJSON, saveFunctionalJSON } from '@legal/functionalStorage.js';
import StatusBadge from '../components/ui/StatusBadge';
import { useAnimatedAddToCart } from '../features/cart-animation/useAnimatedAddToCart';
import { useRequireAuth } from '../hooks/useRequireAuth';

const ST = {
  chatBg: '#fff', chatBorder: '#e5e7eb', chatR: 24,
  userBg: '#0b0f19', userCol: '#fff',
  asstBg: '#f5f6f8', asstCol: '#374151',
  cardBg: '#fff', cardBorder: '#e5e7eb', cardR: 14,
  primary: '#0b0f19',
};

const SHOP_MAP = {
  technomarket: 'ТехноМаркет',
  'техномаркет': 'ТехноМаркет',
  gamepower: 'GamePower',
  smartspace: 'SmartSpace',
};

function normalShop(product) {
  if (!product) return '';
  const slug = (product.shopSlug || '').toLowerCase();
  const name = (product.shopName || '').toLowerCase();
  for (const [k, v] of Object.entries(SHOP_MAP)) {
    if (slug.includes(k) || name.includes(k)) return v;
  }
  return product.shopName || '';
}

function AssistantProductImage({ product, width, height }) {
  const [failed, setFailed] = useState(false);
  const src = getProductMainImage(product);
  const w = width || 56;
  const h = height || 56;

  if (!src || failed) {
    return (
      <div style={{ width: w, height: h, borderRadius: 12, background: '#f8fafc', border: '1px solid #eef2f7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <AgentIcon name="box" size={20} muted />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt=""
      onError={() => setFailed(true)}
      loading="lazy"
      style={{ width: w, height: h, borderRadius: 12, objectFit: 'contain', flexShrink: 0, padding: 4, background: '#f8fafc' }}
    />
  );
}

// ─── Standalone card components with local refs ───

function AssistantResultCard({ product: p, onOpen, onCompare, normalShop }) {
  const imgRef = useRef(/** @type {HTMLImageElement | null} */ (null));
  const { addToCartWithAnimation } = useAnimatedAddToCart();
  const requireAuth = useRequireAuth();
  const hasId = !!p.id;
  const src = getProductMainImage(p);
  const [imgFailed, setImgFailed] = useState(false);
  const w = 64, h = 64;

  const handleCart = () => {
    requireAuth(() => {
      addToCartWithAnimation(
        { id: p.id, name: p.name, price: p.price, shopName: p.shopName, image: getProductMainImage(p) },
        imgRef.current
      );
    });
  };

  return (
    <div style={{ background: ST.cardBg, borderRadius: ST.cardR, border: '1px solid ' + ST.cardBorder, display: 'flex', gap: 10, padding: 10, alignItems: 'stretch', minHeight: 88 }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = '#d0d5dd'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,.04)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = ST.cardBorder; e.currentTarget.style.boxShadow = 'none'; }}>
      <div style={{ flexShrink: 0, alignSelf: 'center' }}>
        {src && !imgFailed ? (
          <img ref={imgRef} src={src} alt="" onError={() => setImgFailed(true)}
            style={{ width: w, height: h, borderRadius: 12, objectFit: 'contain', flexShrink: 0, padding: 4, background: '#f8fafc' }} />
        ) : (
          <div style={{ width: w, height: h, borderRadius: 12, background: '#f8fafc', border: '1px solid #eef2f7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <AgentIcon name="box" size={20} muted />
          </div>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 1 }}>
        {(p.brand || p.category) && (
          <div style={{ fontSize: 10.5, color: '#98a2b3', lineHeight: 1.2 }}>
            {[p.brand, p.category ? (getCategoryLabel(p.category) || p.category) : ''].filter(Boolean).join(' · ')}
          </div>
        )}
        <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.25, color: ST.primary, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.name}</div>
        <div style={{ fontSize: 15, fontWeight: 800, color: ST.primary }}>{formatPrice(p.price)}</div>
        {p.shopName && <div style={{ fontSize: 11, color: '#98a2b3' }}>{normalShop(p)}</div>}
      </div>
      {hasId && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, justifyContent: 'center', flexShrink: 0 }}>
          <button onClick={(e) => { e.stopPropagation(); onOpen(p); }} style={btnXs}>Открыть</button>
          <button onClick={(e) => { e.stopPropagation(); handleCart(); }} style={btnXsOutline}>В корзину</button>
          <button onClick={(e) => { e.stopPropagation(); requireAuth(() => onCompare(p)); }} style={btnXsGhost}>Сравнить</button>
        </div>
      )}
    </div>
  );
}

function AssistantRecCard({ recommendation: r, onOpen, onCart, normalShop }) {
  const imgRef = useRef(/** @type {HTMLImageElement | null} */ (null));
  const { addToCartWithAnimation } = useAnimatedAddToCart();
  const requireAuth = useRequireAuth();
  const hasId = !!r.id;
  const src = getProductMainImage(r);
  const [imgFailed, setImgFailed] = useState(false);
  const w = 56, h = 56;

  const handleCart = () => {
    requireAuth(() => {
      addToCartWithAnimation(
        { id: r.id, name: r.name, price: r.price, shopName: r.shopName, image: getProductMainImage(r) },
        imgRef.current
      );
    });
  };

  return (
    <div style={{ background: ST.cardBg, borderRadius: ST.cardR, padding: 12, border: '1px solid ' + ST.cardBorder, borderLeft: '3px solid ' + ST.primary }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: ST.primary, marginBottom: 8, letterSpacing: 0.3 }}>Рекомендация</div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {src && !imgFailed ? (
          <img ref={imgRef} src={src} alt="" onError={() => setImgFailed(true)}
            style={{ width: w, height: h, borderRadius: 12, objectFit: 'contain', flexShrink: 0, padding: 4, background: '#f8fafc' }} />
        ) : (
          <div style={{ width: w, height: h, borderRadius: 12, background: '#f8fafc', border: '1px solid #eef2f7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <AgentIcon name="box" size={20} muted />
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: ST.primary }}>{r.name}</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: ST.primary, marginTop: 2 }}>{formatPrice(r.price)}</div>
          {r.shopName && <div style={{ fontSize: 11, color: '#98a2b3', marginTop: 1 }}>{normalShop(r)}</div>}
        </div>
      </div>
      {r.reason && <div style={{ fontSize: 11, color: '#667085', marginTop: 8, lineHeight: 1.35 }}>{r.reason}</div>}
      {r.pros?.length > 0 && (
        <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
          {r.pros.map((pro, i) => <StatusBadge key={i} variant="neutral" size="sm">{pro}</StatusBadge>)}
        </div>
      )}
      {hasId && (
        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          <button onClick={(e) => { e.stopPropagation(); onOpen(r); }} style={btnXs}>Открыть</button>
          <button onClick={(e) => { e.stopPropagation(); handleCart(); }} style={btnXsOutline}>В корзину</button>
        </div>
      )}
    </div>
  );
}

export default function AssistantPage() {
  const s = useStore();
  const requireAuth = useRequireAuth();
  const [messages, setMessages] = useState(() => loadFunctionalJSON('assistant_msgs', []));
  const [lastProductIds, setLastProductIds] = useState(() => loadFunctionalJSON('assistant_lpi', []));
  const [lastRecId, setLastRecId] = useState(() => loadFunctionalJSON('assistant_lri', '') || '');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (!loading) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 100);
    }
  }, [messages, loading]);

  const pushMsg = (msg) => {
    setMessages(prev => {
      const next = [...prev, msg];
      saveFunctionalJSON('assistant_msgs', next);
      return next;
    });
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 100);
  };

  const handleOpenProduct = (p) => {
    if (!p.id) return;
    s.loadProduct(p.id);
    s.setPage('product');
  };

  const handleCompareAdd = (p) => {
    if (!p.id) return;
    s.addToCompare({ id: p.id, name: p.name, price: p.price, shopName: p.shopName, images: p.images });
    s.showToast?.('Добавлено в сравнение');
    pushMsg({ id: Date.now(), role: 'assistant', text: `«${p.name}» добавлен в сравнение. Добавьте ещё товары и напишите «сравни», чтобы я сравнил их.` });
  };

  const performSend = async (msg) => {
    setInput('');
    const userMsg = { id: Date.now(), role: 'user', text: msg };
    const updated = [...messages, userMsg];
    setMessages(updated);
    saveFunctionalJSON('assistant_msgs', updated);
    setLoading(true);
    try {
      const ctx = { compareIds: s.compareItems.map(i => i.id).filter(Boolean), lastProductIds: lastProductIds };
      const d = await s.api('/assistant/chat', { method: 'POST', body: JSON.stringify({ message: msg, context: ctx }) });
      const newLpi = d.products?.map(p => p.id).filter(Boolean) || lastProductIds;
      const newLri = (d.recommendations?.[0]?.productId || d.recommendations?.[0]?.id || lastRecId);
      setLastProductIds(newLpi);
      setLastRecId(newLri);
      saveFunctionalJSON('assistant_lpi', newLpi);
      saveFunctionalJSON('assistant_lri', newLri);
      const asstMsg = { id: Date.now() + 1, role: 'assistant', text: d.reply, intent: d.intent, products: d.products, recommendations: d.recommendations, comparison: d.comparison, suggestions: d.suggestions };
      const final = [...updated, asstMsg];
      setMessages(final);
      saveFunctionalJSON('assistant_msgs', final);
    } catch (e) {
      const errMsg = e.message || 'Ошибка';
      if (errMsg.includes('401') || errMsg.includes('войдите')) pushMsg({ id: Date.now() + 1, role: 'assistant', text: 'Войдите как покупатель, чтобы использовать AI-ассистента.', error: true });
      else if (errMsg.includes('403') || errMsg.includes('продавц')) pushMsg({ id: Date.now() + 1, role: 'assistant', text: 'AI-ассистент доступен только покупателю.', error: true });
      else pushMsg({ id: Date.now() + 1, role: 'assistant', text: 'Не удалось получить ответ ассистента. Проверьте сервер и попробуйте ещё раз.', error: true });
    }
    setLoading(false);
  };

  const send = (text) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;
    requireAuth(() => performSend(msg));
  };

  const clear = () => {
    setMessages([]);
    setLastProductIds([]);
    setLastRecId('');
    saveFunctionalJSON('assistant_msgs', []);
    saveFunctionalJSON('assistant_lpi', []);
    saveFunctionalJSON('assistant_lri', '');
  };

  // ─── comparison block — structured AI summary ───
  const ComparisonBlock = ({ items, recommendations, intent }) => {
    if (!items?.length) return null;
    const rec = recommendations?.[0];

    return (
      <div style={{ marginTop: 6, background: ST.cardBg, borderRadius: 16, border: '1px solid ' + ST.cardBorder, overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '12px 14px', borderBottom: '1px solid #f0f2f5' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: ST.primary, marginBottom: 4 }}>
            Сравнение ({items.length})
          </div>
          <div style={{ fontSize: 11, color: '#98a2b3', lineHeight: 1.3 }}>
            Сравнил товары по цене, данным карточки и ключевым параметрам
          </div>
        </div>

        {/* Items — structured rows */}
        {items.map((it, i) => (
          <div key={i} style={{ padding: '10px 14px', borderBottom: i < items.length - 1 ? '1px solid #f4f5f7' : 'none', display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ flexShrink: 0, width: 22, textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#98a2b3' }}>{i + 1}</div>
            <AssistantProductImage product={it} width={44} height={44} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: ST.primary, display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{it.name}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: ST.primary }}>{formatPrice(it.price)}</span>
                {it.shopName && <span style={{ fontSize: 11, color: '#98a2b3' }}>{normalShop(it)}</span>}
              </div>
              {(it.brand || it.condition || it.deliveryTerm) && (
                <div style={{ fontSize: 10.5, color: '#98a2b3', marginTop: 2 }}>
                  {[it.brand && it.brand, it.condition && getConditionLabel(it.condition), it.deliveryTerm && it.deliveryTerm].filter(Boolean).join(' · ')}
                </div>
              )}
              {it.pros?.length > 0 && (
                <div style={{ display: 'flex', gap: 4, marginTop: 3, flexWrap: 'wrap' }}>
                  {it.pros.map((p, j) => <StatusBadge key={j} variant="neutral" size="sm">{p}</StatusBadge>)}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Recommendation at bottom */}
        {rec && <AssistantRecCard recommendation={rec} onOpen={handleOpenProduct} onCart={() => {}} normalShop={normalShop} />}
      </div>
    );
  };

  // ─── main render ───
  const isBusiness = s.user?.role === 'business';

  if (isBusiness) {
    return (
      <div style={{ maxWidth: 540, margin: '80px auto', padding: '0 16px' }}>
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 24, padding: 40, textAlign: 'center' }}>
          <BrandMark size={48} />
          <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 16, marginBottom: 8 }}>AI-ассистент покупателя</h2>
          <p style={{ color: '#6b7280', fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>Этот AI-ассистент предназначен для покупателей. Для продавца AI Sales Copilot находится в кабинете бизнеса.</p>
          <button onClick={() => { s.setPage('dashboard'); }} style={btnPill}>Открыть Dashboard</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 16px 60px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <BrandMark size={32} />
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 2 }}>AI-ассистент</h2>
          <p style={{ color: '#6b7280', fontSize: 12.5 }}>Опишите, что ищете — я подберу товары, сравню варианты и помогу оформить заказ.</p>
        </div>
      </div>

      {/* Messages + Composer */}
      <div style={{ marginBottom: 8 }}>
        {/* Starter */}
        {messages.length === 0 && (
          <div style={{ background: '#fff', border: '1px solid ' + ST.chatBorder, borderRadius: ST.chatR, padding: '40px 24px 32px', textAlign: 'center', marginBottom: 16 }}>
            <p style={{ fontSize: 22, fontWeight: 700, color: '#0b0f19', marginBottom: 4 }}>Чем могу помочь?</p>
            <p style={{ fontSize: 13, color: '#667085', marginBottom: 24 }}>Опишите задачу — я подберу реальные товары из каталога AGENT.ONE</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 28 }}>
              {[{label:'iPhone до 200 000 ₽',q:'iPhone до 200 000 ₽'},{label:'Игровой ПК с RTX',q:'Игровой ПК с RTX'},{label:'MacBook для работы',q:'MacBook для работы'},{label:'Умный дом',q:'Умный дом'},{label:'Как оформить заказ?',q:'Как оформить заказ?'}].map(t => (
                <span key={t.label} onClick={() => { if (!loading) send(t.q); }} style={{ fontSize: 11.5, padding: '6px 14px', borderRadius: 999, background: loading ? '#f0f0f3' : '#f8fafc', border: '1px solid ' + ST.cardBorder, color: loading ? '#b0b7c3' : '#475467', cursor: loading ? 'default' : 'pointer', fontWeight: 500 }}>{t.label}</span>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10, maxWidth: 580, margin: '0 auto' }}>
              {[
                {icon:'search',title:'Подбор',sub:'Найду товары по бюджету, бренду и характеристикам'},
                {icon:'sync',title:'Сравнение',sub:'Покажу отличия и помогу выбрать лучший вариант'},
                {icon:'checklist',title:'Оформление',sub:'Подскажу, как добавить товар в корзину и создать заказ'},
              ].map(c => (
                <div key={c.title} style={{ padding: 14, background: '#fff', borderRadius: 14, border: '1px solid #eef2f7', textAlign: 'center' }}>
                  <div style={{ marginBottom: 6, display: 'flex', justifyContent: 'center' }}><AgentIcon name={c.icon} size={20} muted /></div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0b0f19', marginBottom: 3 }}>{c.title}</div>
                  <div style={{ fontSize: 10.5, color: '#667085', lineHeight: 1.35 }}>{c.sub}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        {messages.map((m, mi) => {
          const isUser = m.role === 'user';
          const allProds = m.products || [];
          const isLast = mi === messages.length - 1;

          return (
            <div key={m.id} style={{ marginBottom: 20 }}>
              {/* User message — right-aligned compact bubble */}
              {isUser && (
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <div style={{ display: 'inline-block', maxWidth: '75%', padding: '10px 18px', borderRadius: 20, background: ST.userBg, color: ST.userCol, fontSize: 13.5, lineHeight: 1.45 }}>{m.text}</div>
                </div>
              )}

              {/* AI message — left-aligned with avatar */}
              {!isUser && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                    <BrandMark size={22} />
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#98a2b3', letterSpacing: 0.2 }}>AI‑ассистент</span>
                  </div>

                  {/* Error bubble */}
                  {m.error && (
                    <div style={{ padding: '10px 16px', borderRadius: 16, background: '#fff8f5', border: '1px solid #ffd4c4', color: '#8b4513', fontSize: 12.5, lineHeight: 1.45 }}>{m.text}</div>
                  )}

                  {/* Reply text */}
                  {m.text && !m.error && (
                    <div style={{ marginBottom: ((allProds.length > 0 || m.comparison?.items?.length || m.recommendations?.length || m.success) ? 12 : 0) }}>
                      <span style={{ padding: '9px 16px', borderRadius: 18, background: ST.asstBg, color: ST.asstCol, fontSize: 13.5, lineHeight: 1.5, display: 'inline-block' }}>{m.text}</span>
                    </div>
                  )}

                  {/* Products section */}
                  {allProds.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#98a2b3', marginBottom: 8, letterSpacing: 0.3 }}>
                        {allProds.length === 1 ? 'Найден 1 товар' : `Найдено ${allProds.length} товаров`}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 8 }}>
                        {allProds.map(p => <AssistantResultCard key={p.id} product={p} onOpen={handleOpenProduct} onCompare={handleCompareAdd} normalShop={normalShop} />)}
                      </div>
                    </div>
                  )}

                  {/* Comparison */}
                  {m.comparison?.items?.length > 0 && (
                    <ComparisonBlock items={m.comparison.items} recommendations={m.recommendations} intent={m.intent} />
                  )}

                  {/* Standalone recommendation (no comparison) */}
                  {m.recommendations?.length > 0 && !m.comparison?.items?.length && (
                    <div style={{ marginTop: 4 }}>
                      {m.recommendations.map((r, i) => <AssistantRecCard key={i} recommendation={r} onOpen={handleOpenProduct} onCart={() => {}} normalShop={normalShop} />)}
                    </div>
                  )}

                  {/* Cart success */}
                  {m.success === 'cart' && (
                    <div style={{ background: ST.cardBg, borderRadius: 14, padding: '10px 14px', marginTop: 6, border: '1px solid ' + ST.cardBorder }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: ST.asstCol, marginBottom: 8 }}>Товар добавлен в корзину</div>
                      <button onClick={() => s.setPage('cart')} style={btnXs}>Открыть корзину</button>
                    </div>
                  )}

                  {/* Suggestions */}
                  {m.suggestions?.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                      {m.suggestions.map((sug, i) => (
                        <span key={i} onClick={() => { if (!loading) send(sug); }} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 999, background: loading ? '#f0f0f3' : '#f8fafc', border: '1px solid ' + ST.cardBorder, color: loading ? '#b0b7c3' : '#6b7280', cursor: loading ? 'default' : 'pointer' }}>{sug}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Loading */}
        {loading && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
              <BrandMark size={22} />
              <span style={{ fontSize: 11, fontWeight: 600, color: '#98a2b3', letterSpacing: 0.2 }}>AI‑ассистент</span>
            </div>
            <span style={{ display: 'inline-block', padding: '9px 16px', borderRadius: 18, background: ST.asstBg, color: '#6b7280', fontSize: 13.5 }}>Подбираю товары из каталога...</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Composer — unified block */}
      <div style={{ background: '#fff', borderRadius: 22, border: '1px solid ' + ST.cardBorder, padding: '5px 5px 5px 16px', display: 'flex', gap: 6, alignItems: 'center', transition: 'border .15s' }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !loading && input.trim()) send(); }}
          disabled={loading}
          placeholder="Например: хочу смартфон до 150 000 ₽ с хорошей камерой"
          style={{ flex: 1, padding: '10px 0', border: 'none', fontSize: 13.5, outline: 'none', background: 'transparent', color: ST.primary, opacity: loading ? 0.5 : 1 }}
        />
        <button
          onClick={() => send()}
          disabled={loading || !input.trim()}
          style={{
            padding: '10px 20px', background: loading || !input.trim() ? '#d0d5dd' : ST.primary, color: '#fff', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: loading || !input.trim() ? 'default' : 'pointer', border: 'none',
            flexShrink: 0, transition: 'background .15s',
          }}
        >
          {loading ? '...' : 'Отправить'}
        </button>
      </div>

      {messages.length > 0 && (
        <button onClick={clear} disabled={loading} style={{ marginTop: 10, padding: '6px 14px', background: 'transparent', color: '#98a2b3', borderRadius: 999, fontSize: 11, fontWeight: 500, cursor: loading ? 'default' : 'pointer', border: 'none', opacity: loading ? 0.3 : 0.6 }}>
          Очистить диалог
        </button>
      )}
    </div>
  );
}

const btnXs = { padding: '4px 13px', borderRadius: 999, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: 'none', background: '#0b0f19', color: '#fff', height: 28, display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap' };
const btnXsOutline = { padding: '4px 13px', borderRadius: 999, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: '1px solid #e5e7eb', background: '#fff', color: '#374151', height: 28, display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap' };
const btnXsGhost = { padding: '4px 13px', borderRadius: 999, fontSize: 11, fontWeight: 500, cursor: 'pointer', border: '1px solid transparent', background: 'transparent', color: '#6b7280', height: 28, display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap' };
const btnPill = { padding: '12px 28px', background: '#111', color: '#fff', borderRadius: 999, fontSize: 14, fontWeight: 600, cursor: 'pointer', border: 'none' };
const btnPillOutline = { padding: '12px 28px', background: '#fff', color: '#6b7280', borderRadius: 999, fontSize: 14, fontWeight: 600, cursor: 'pointer', border: '1px solid #e5e7eb' };
