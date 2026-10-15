import { useEffect, useRef, useState } from 'react';
import { useStore } from '../hooks/useStore';
import { getProductMainImage } from '../utils/productImages';
import { formatPrice, hasValidPrice } from '../utils/format';
import StatusBadge from './ui/StatusBadge';
import { useAnimatedAddToCart } from '../features/cart-animation/useAnimatedAddToCart';
import { useRequireAuth } from '../hooks/useRequireAuth';
import AgentIcon from './AgentIcon';

const S = { bd: '#e5e7eb', bg: '#f8fafc', t1: '#0b0f19', t2: '#667085', t3: '#98a2b3', btn: '#0b0f19' };

export default function AIManagerChat({ shopSlug, productId, product, source, inline = true, onClose }) {
  const s = useStore();
  const requireAuth = useRequireAuth();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [dialogId, setDialogId] = useState(null);
  const [leadCreated, setLeadCreated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showLogin, setShowLogin] = useState(false);
  const bottomRef = useRef(null);

  const user = s.user;
  const isGuest = !user;
  const isBusiness = user?.role === 'business';

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, open]);

  const startChat = () => {
    if (isBusiness) return;
    requireAuth(() => {
      setOpen(true);
      if (messages.length === 0) send('Здравствуйте', true);
    });
  };

  const send = async (text, isWelcome = false) => {
    if (!text.trim()) return;
    if (isBusiness) return;
    if (isGuest) { s.openAuthModal(); return; }
    setLoading(true); setError('');
    if (!isWelcome) setMessages(p => [...p, { role: 'client', message: text }]);
    try {
      const d = await s.sendAIManagerMessage({ shopSlug, productId, dialogId, message: text, source });
      setDialogId(d.dialogId); setLeadCreated(d.lead?.created || false);
      setMessages(p => [...p, { role: 'ai_manager', message: d.message, products: d.products, lead: d.lead, handoff: d.handoff }]);
    } catch (e) {
      setError(e.message || 'Не удалось отправить сообщение');
      if (!isWelcome) setMessages(p => [...p, { role: 'system', message: 'Сообщение не отправлено.', error: true }]);
    } finally { setLoading(false); setInput(''); }
  };

  const handleProductAction = (action, prod) => {
    if (action === 'open') { s.loadProduct(prod.id); s.setPage('product'); if (onClose) onClose(); }
    else if (action === 'cart') { /* handled inside ProductCard via useAnimatedAddToCart */ }
    else if (action === 'compare') requireAuth(() => s.addToCompare(prod));
    else if (action === 'lead') requireAuth(() => createLead());
  };

  const createLead = async () => {
    if (!dialogId || leadCreated) return;
    try {
      await s.createAIManagerLead(dialogId); setLeadCreated(true);
      setMessages(p => [...p, { role: 'system', message: 'Заявка создана и передана продавцу.', leadCreated: true }]);
    } catch (e) { setError(e.message || 'Не удалось создать заявку'); }
  };

  const quickPrompts = product
    ? ['Есть ли этот товар?', 'Какая доставка?', 'Есть гарантия?', 'Подберите похожий товар', 'Передать продавцу']
    : ['Подберите смартфон', 'Что лучше для игр?', 'Какие товары до 100 000?', 'Как оформить заказ?', 'Связаться с продавцом'];

  const fullChat = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ padding: '16px 22px', borderBottom: '1px solid ' + S.bd, background: '#fff', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={hdrIcon}><AgentIcon name="robot" size={24} muted /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: S.t1, lineHeight: 1.3 }}>AI-менеджер магазина</div>
            <div style={{ fontSize: 13, color: S.t2, marginTop: 3, lineHeight: 1.4 }}>
              Отвечает по данным магазина. Сложные вопросы передаёт продавцу.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <StatusBadge variant="ai" size="sm">Доступен 24/7</StatusBadge>
            <StatusBadge variant="muted" size="sm">По данным магазина</StatusBadge>
          </div>
          <button onClick={() => { setOpen(false); if (onClose) onClose(); }} style={closeBtnStyle}>×</button>
        </div>
      </div>

      {/* Benefit + Quick actions row */}
      <div style={{ padding: '10px 22px', borderBottom: '1px solid ' + S.bd, background: '#fff', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {quickPrompts.map(q => (
            <button key={q} onClick={() => { if (!loading) send(q); }} disabled={loading}
              style={quickBtnStyle(loading)}>{q}</button>
          ))}
        </div>
      </div>

      {/* Message area — the main space */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px', background: S.bg, minHeight: 0 }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: S.t3, padding: '48px 20px' }}>
            <div style={{ marginBottom: 14 }}><AgentIcon name="robot" size={48} muted /></div>
            <div style={{ fontWeight: 600, color: S.t2, fontSize: 15, marginBottom: 8 }}>Задайте вопрос AI-менеджеру</div>
            <div style={{ fontSize: 13, lineHeight: 1.6, maxWidth: 400, margin: '0 auto' }}>
              AI-менеджер ответит по данным магазина, поможет подобрать товар и при необходимости передаст вопрос продавцу.
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', alignItems: m.role === 'client' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '78%', padding: '14px 18px', borderRadius: 20, fontSize: 14, lineHeight: 1.6,
              background: m.role === 'client' ? S.btn : m.role === 'system' ? '#fff' : '#fff',
              color: m.role === 'client' ? '#fff' : S.t1,
              border: m.role !== 'client' ? '1px solid ' + S.bd : 'none', whiteSpace: 'pre-wrap',
            }}>
              {m.message}
              {m.leadCreated && <div style={{ marginTop: 8, fontSize: 12, color: '#2d5a3f', fontWeight: 600 }}>Заявка создана</div>}
            </div>
            {m.role === 'ai_manager' && m.products?.length > 0 && (
              <div style={{ marginTop: 14, width: '100%' }}>
                {m.products.map(p => <AIManagerProductCard key={p.id} product={p} onAction={handleProductAction} />)}
              </div>
            )}
            {m.role === 'ai_manager' && m.handoff && (
              <div style={{ marginTop: 8, fontSize: 12, color: S.t2 }}>Диалог передан продавцу</div>
            )}
          </div>
        ))}
        {error && (
          <div style={{ padding: '10px 14px', borderRadius: 12, fontSize: 13, background: '#faf4f4', border: '1px solid #eed9d9', color: '#7a2828', marginBottom: 12, fontWeight: 500 }}>{error}</div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div style={{ borderTop: '1px solid ' + S.bd, background: '#fff', flexShrink: 0, padding: '12px 18px', display: 'flex', gap: 12, alignItems: 'center' }}>
        <input
          value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !loading) { e.preventDefault(); send(input); } }}
          placeholder="Напишите вопрос..." disabled={loading}
          style={{
            flex: 1, padding: '13px 16px', border: '1px solid ' + S.bd, borderRadius: 16,
            fontSize: 14, fontFamily: 'inherit', outline: 'none',
            background: loading ? S.bg : '#fff', color: S.t1, height: 46, boxSizing: 'border-box',
          }}
        />
        <button onClick={() => send(input)} disabled={loading || !input.trim()}
          style={{
            padding: '13px 32px', borderRadius: 16, border: 'none', fontSize: 14, fontWeight: 600,
            background: loading || !input.trim() ? '#e5e7eb' : S.btn,
            color: loading || !input.trim() ? '#9ca3af' : '#fff',
            cursor: loading || !input.trim() ? 'not-allowed' : 'pointer', flexShrink: 0,
          }}>
          {loading ? '...' : 'Отправить'}
        </button>
      </div>
    </div>
  );

  // Large modal overlay — used by both inline (after click) and AccountPage dialogs
  const modalOverlay = (
    <div className="ao-modal-overlay" style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(11,15,25,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => { setOpen(false); if (onClose) onClose(); }}>
      <div className="ao-modal-content" style={{ background: '#fff', borderRadius: 24, width: 760, maxWidth: '94vw', height: 'min(82vh, 780px)', maxHeight: '92vh', overflow: 'hidden', border: '1px solid ' + S.bd, boxShadow: '0 24px 64px rgba(0,0,0,.1)' }} onClick={e => e.stopPropagation()}>
        {fullChat}
      </div>
    </div>
  );

  // AccountPage dialogs — always use inline={false}, show modal immediately
  if (!inline) return modalOverlay;

  // ProductPage context
  const productContext = product && <div style={{ fontSize: 12, color: S.t2, marginTop: 6, lineHeight: 1.4 }}>По товару: {product.name?.length > 60 ? product.name.slice(0, 60) + '...' : product.name}</div>;

  // ShopPage/ProductPage — compact preview card
  return (
    <div style={{ background: '#fff', border: '1px solid ' + S.bd, borderRadius: 22, overflow: 'hidden' }}>
      <div style={{ padding: '22px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 16 }}>
          <div style={{ width: 48, height: 48, borderRadius: 16, background: S.bg, border: '1px solid ' + S.bd, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <AgentIcon name="robot" size={24} muted />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: S.t1, lineHeight: 1.3 }}>AI-менеджер магазина</div>
            <div style={{ fontSize: 13, color: S.t2, marginTop: 4, lineHeight: 1.5 }}>
              Поможет подобрать товар, уточнить условия и передаст сложный вопрос продавцу.
            </div>
            {productContext}
            <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
              <StatusBadge variant="ai" size="sm">Доступен 24/7</StatusBadge>
              <StatusBadge variant="muted" size="sm">По данным магазина</StatusBadge>
            </div>
          </div>
        </div>

        {isGuest ? (
          <button onClick={startChat} style={ctaBtnStyle}>
            Войти, чтобы спросить
          </button>
        ) : isBusiness ? (
          <div style={{ fontSize: 13, color: S.t2, padding: '12px 16px', background: S.bg, borderRadius: 14, border: '1px solid ' + S.bd, lineHeight: 1.5 }}>
            AI-менеджер настраивается и управляется в кабинете продавца.
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={startChat} style={ctaBtnStyle}>
              {product ? 'Спросить о товаре' : 'Спросить AI-менеджера'}
            </button>
          </div>
        )}

        {showLogin && (
          <div style={{ marginTop: 10, padding: '10px 14px', background: S.bg, borderRadius: 14, border: '1px solid ' + S.bd, display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: S.t2 }}>Для общения с AI-менеджером нужно войти</span>
            <button onClick={() => s.openAuthModal()} style={{ padding: '6px 14px', borderRadius: 999, border: 'none', background: S.btn, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Войти</button>
            <button onClick={() => setShowLogin(false)} style={{ padding: '6px 14px', borderRadius: 999, border: '1px solid ' + S.bd, background: '#fff', color: S.t2, fontSize: 12, cursor: 'pointer' }}>Скрыть</button>
          </div>
        )}
      </div>

      {open && modalOverlay}
    </div>
  );
}

function AIManagerProductCard({ product: p, onAction }) {
  const img = getProductMainImage(p);
  const imgRef = useRef(/** @type {HTMLImageElement | null} */ (null));
  const { addToCartWithAnimation } = useAnimatedAddToCart();
  const requireAuth = useRequireAuth();

  const handleCart = () => {
    requireAuth(() => {
      addToCartWithAnimation({ ...p, shopId: p.shopId || '', shopName: p.shopName || '' }, imgRef.current);
    });
  };

  return (
    <div style={{ display: 'flex', gap: 16, padding: 16, background: '#fff', border: '1px solid ' + S.bd, borderRadius: 18, marginBottom: 14 }}>
      <div style={{ width: 96, height: 96, borderRadius: 16, background: S.bg, overflow: 'hidden', flexShrink: 0, border: '1px solid ' + S.bd, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {img ? <img ref={imgRef} src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 6 }} /> : <AgentIcon name="box" size={32} muted />}
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: S.t1, lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{p.name}</div>
        <div style={{ fontSize: 17, fontWeight: 800, color: S.t1, marginTop: 4 }}>{hasValidPrice(p.price) ? formatPrice(p.price) : 'по запросу'}</div>
        {p.reason && <div style={{ fontSize: 12, color: S.t2, marginTop: 3, lineHeight: 1.3 }}>{p.reason}</div>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0, justifyContent: 'center' }}>
        <button onClick={() => onAction('open', p)} style={{ padding: '6px 14px', borderRadius: 999, border: '1px solid ' + S.bd, background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 500, color: S.t1 }}>Открыть</button>
        <button onClick={handleCart} style={{ padding: '6px 14px', borderRadius: 999, border: 'none', background: S.t1, color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>В корзину</button>
      </div>
    </div>
  );
}

const hdrIcon = { width: 48, height: 48, borderRadius: 16, background: S.bg, border: '1px solid ' + S.bd, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };
const closeBtnStyle = { background: 'none', border: 'none', cursor: 'pointer', color: S.t3, fontSize: 22, lineHeight: 1, padding: '0 0 0 8px', flexShrink: 0 };
const ctaBtnStyle = { flex: 1, padding: '14px 24px', borderRadius: 16, border: 'none', background: S.btn, color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer' };
const quickBtnStyle = (loading) => ({ fontSize: 13, padding: '7px 15px', borderRadius: 999, border: '1px solid ' + S.bd, background: loading ? S.bg : '#fff', color: loading ? S.t3 : '#374151', cursor: loading ? 'default' : 'pointer', fontWeight: 500 });
const prodBtn = (outline) => ({ padding: '9px 20px', borderRadius: 14, border: outline ? '1px solid ' + S.bd : 'none', background: outline ? '#fff' : S.btn, color: outline ? S.t1 : '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', minWidth: 110 });
