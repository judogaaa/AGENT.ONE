import { useEffect, useState, useRef } from 'react';
import { useStore } from '../hooks/useStore';
import { getCategoryLabel } from '../constants/categories';
import { getProductMainImage, normalizeImages } from '../utils/productImages';
import { hasValidPrice, formatPrice, getConditionLabel } from '../utils/format';
import AgentIcon from '../components/AgentIcon';
import StatusBadge from '../components/ui/StatusBadge';
import AIManagerChat from '../components/AIManagerChat';
import { useAnimatedAddToCart } from '../features/cart-animation/useAnimatedAddToCart';
import { useRequireAuth } from '../hooks/useRequireAuth';

const ST = {
  page: { maxWidth: 1240, margin: '0 auto', padding: '24px 20px 56px' },
  breadcrumb: { fontSize: 13, color: '#667085', marginBottom: 16 },
  backBtn: { padding: '7px 16px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#344054' },
  mainImg: { width: '100%', height: '100%', objectFit: 'contain' },
  thumb: (active) => ({ width: 72, height: 72, borderRadius: 14, border: active ? '2px solid #111' : '1px solid #e5e7eb', background: '#f8f8fa', overflow: 'hidden', cursor: 'pointer', flexShrink: 0, opacity: active ? 1 : 0.6 }),
  chip: { fontSize: 11, padding: '3px 10px', borderRadius: 999, background: '#f8fafc', color: '#475467', border: '1px solid #eef2f7' },
  btn: { padding: '13px 28px', borderRadius: 14, fontSize: 14, fontWeight: 700, cursor: 'pointer', border: 'none', background: '#050505', color: '#fff' },
  btnSec: { padding: '13px 22px', borderRadius: 14, fontSize: 14, fontWeight: 600, cursor: 'pointer', border: '1px solid #e5e7eb', background: '#fff', color: '#344054' },
};

export default function ProductPage() {
  const s = useStore();
  const requireAuth = useRequireAuth();
  const { addToCartWithAnimation } = useAnimatedAddToCart();
  const mainImgRef = useRef(/** @type {HTMLImageElement | null} */ (null));
  const p = s.selectedProduct;
  const shop = s._productShop;
  const [imgIdx, setImgIdx] = useState(0);
  const [showContact, setShowContact] = useState(false);
  const [contactMsg, setContactMsg] = useState('');
  const [contactName, setContactName] = useState(s.user?.displayName || '');
  const [contactPhone, setContactPhone] = useState(s.user?.phone || '');
  const [contactEmail, setContactEmail] = useState(s.user?.email || '');
  const [contactSent, setContactSent] = useState(false);
  const [contactError, setContactError] = useState('');
  const [accOpen, setAccOpen] = useState({ about: true, specs: false, delivery: false, reviews: false, qa: false });

  useEffect(() => {
    const hash = window.location.hash;
    const match = hash.match(/#\/product\/(.+)/);
    if (match) { s.loadProduct(match[1]); return; }
    if (!p && s.allProducts.length > 0) { s.setPage('catalog'); }
  }, []);

  if (!p) return <div style={{ textAlign: 'center', padding: 80, color: '#9ca3af', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 20, maxWidth: 500, margin: '60px auto' }}>Загрузка...</div>;

  const images = normalizeImages(p.images);
  const img = images[imgIdx] || null;
  const isInCompare = s.compareItems.find(c => c.id === p.id);

  const handleCompare = () => {
    requireAuth(() => {
      isInCompare ? s.removeFromCompare(p.id) : s.addToCompare(p);
    });
  };
  const handleContact = async () => {
    setContactError('');
    if (!contactMsg.trim()) { setContactError('Введите сообщение'); return; }
    try {
      await s.contactProduct(p.id, { message: contactMsg, name: contactName, phone: contactPhone, email: contactEmail, source: 'product_contact' });
      setContactSent(true);
    } catch (e) { setContactError(e.message); }
  };
  const openContact = () => {
    requireAuth(() => { setShowContact(true); setContactSent(false); });
  };
  const toggleAcc = (k) => setAccOpen(prev => ({ ...prev, [k]: !prev[k] }));

  const catLabel = getCategoryLabel(p.category) || p.category || 'Товар';

  return (
    <div style={ST.page}>
      {/* Breadcrumbs */}
      <div style={ST.breadcrumb}>
        <a href="#" onClick={e => { e.preventDefault(); s.setPage('catalog'); }} style={{ color: '#667085', textDecoration: 'none' }}>Каталог</a>
        <span style={{ margin: '0 6px', color: '#d0d5dd' }}>/</span>
        <span style={{ color: '#98a2b3' }}>{catLabel}</span>
        <span style={{ margin: '0 6px', color: '#d0d5dd' }}>/</span>
        <span style={{ color: '#475467' }}>{p.name?.slice(0, 40)}{(p.name?.length || 0) > 40 ? '…' : ''}</span>
      </div>

      {/* Main 2-col */}
      <div style={{ display: 'flex', gap: 48, marginTop: 8, flexWrap: 'wrap' }}>
        {/* Gallery */}
        <div style={{ flex: '1 1 520px', minWidth: 300, maxWidth: 640 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            {/* Thumbnails */}
            {images.length > 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                {images.slice(0, 5).map((src, i) => (
                  <div key={i} onClick={() => setImgIdx(i)} style={ST.thumb(i === imgIdx)}>
                    <img src={src} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                  </div>
                ))}
                {images.length > 5 && (
                  <div style={{ ...ST.thumb(false), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, color: '#9ca3af' }}>
                    +{images.length - 5}
                  </div>
                )}
              </div>
            )}
            {/* Main image */}
            <div style={{ flex: 1, background: '#f8f9fa', borderRadius: 22, border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', minHeight: 420, maxHeight: 540 }}>
              {img ? <img ref={mainImgRef} src={img} style={ST.mainImg} alt={p.name} /> : <AgentIcon name="box" size={48} muted />}
            </div>
          </div>
          {/* Nav */}
          {images.length > 1 && (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 10, alignItems: 'center' }}>
              <button onClick={() => setImgIdx(i => Math.max(0, i - 1))} disabled={imgIdx === 0} style={{ width: 32, height: 32, borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', cursor: imgIdx > 0 ? 'pointer' : 'default', opacity: imgIdx > 0 ? 1 : 0.4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: '#667085' }}>◂</button>
              <span style={{ fontSize: 12, color: '#98a2b3' }}>{imgIdx + 1} / {images.length}</span>
              <button onClick={() => setImgIdx(i => Math.min(images.length - 1, i + 1))} disabled={imgIdx >= images.length - 1} style={{ width: 32, height: 32, borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', cursor: imgIdx < images.length - 1 ? 'pointer' : 'default', opacity: imgIdx < images.length - 1 ? 1 : 0.4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: '#667085' }}>▸</button>
            </div>
          )}
        </div>

        {/* Details */}
        <div style={{ flex: '1 1 320px', minWidth: 280 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#667eea', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{catLabel}</div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#0b0f19', lineHeight: 1.15, marginBottom: 10 }}>{p.name}</h1>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#0b0f19', marginBottom: 10 }}>
            {hasValidPrice(p.price) ? formatPrice(p.price) : 'по запросу'}
            {p.oldPrice && p.oldPrice > 0 && <span style={{ fontSize: 16, color: '#9ca3af', textDecoration: 'line-through', marginLeft: 10, fontWeight: 600 }}>{formatPrice(p.oldPrice)}</span>}
          </div>

          {/* Chips */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {p.brand && <span style={ST.chip}>{p.brand}</span>}
            {p.color && <span style={ST.chip}>{p.color}</span>}
            <StatusBadge variant={p.condition === 'new' ? 'success' : 'muted'} size="sm">{getConditionLabel(p.condition)}</StatusBadge>
            {p.deliveryTerm && <span style={ST.chip}>{p.deliveryTerm}</span>}
            {p.productType && <span style={ST.chip}>{p.productType}</span>}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, marginTop: 22, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
               onClick={() => requireAuth(() => s.toggleFavorite(p.id, p).catch(() => {}))}
              style={{
                width: 44, height: 44, borderRadius: 14, border: s.isFavorite(p.id) ? '1px solid #d1d5db' : '1px solid #e5e7eb',
                background: s.isFavorite(p.id) ? '#f3f4f6' : '#fff', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all .15s', flexShrink: 0,
              }}
              aria-label={s.isFavorite(p.id) ? 'Убрать из избранного' : 'Добавить в избранное'}
            >
              <AgentIcon name="heart" size={18} filled={s.isFavorite(p.id)} muted={!s.isFavorite(p.id)} />
            </button>
            <button onClick={() => requireAuth(() => addToCartWithAnimation(p, mainImgRef.current))} style={ST.btn}>В корзину</button>
            <button onClick={handleCompare} style={{ ...ST.btnSec, background: isInCompare ? '#050505' : '#fff', color: isInCompare ? '#fff' : '#344054', display: 'inline-flex', alignItems: 'center', gap: 4 }}>{isInCompare ? <><AgentIcon name="check" size={13} /> В сравнении</> : 'Сравнить'}</button>
            <button onClick={() => { if (s.user && s.user.id === p.shopId) return; openContact(); }} style={{ ...ST.btnSec, borderColor: '#e5e7eb', color: '#475467' }}>Написать продавцу</button>
          </div>

          {/* Seller */}
          {shop && (
            <div onClick={() => { s.currentSlug = shop.shopSlug; s.setPage('shop'); s.loadShop(shop.shopSlug); }} style={{ marginTop: 20, padding: 16, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 18, cursor: 'pointer', transition: 'border-color 150ms' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Продавец</div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ width: 48, height: 48, borderRadius: 14, background: '#f8f8fa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, overflow: 'hidden' }}>
                  {shop.shopLogoUrl ? <img src={shop.shopLogoUrl} style={{ width: '100%', height: '100%', borderRadius: 14, objectFit: 'cover' }} alt="" /> : <span style={{ fontSize: 18, fontWeight: 800, color: '#667085' }}>{shop.shopName?.charAt(0) || 'S'}</span>}
                </div>
                <div>
                  <div style={{ fontWeight: 650, fontSize: 15, color: '#0b0f19' }}>{shop.shopName}</div>
                  <div style={{ fontSize: 12, color: '#667085', marginTop: 1 }}>@{shop.shopSlug}</div>
                </div>
                <span style={{ marginLeft: 'auto', fontSize: 14, color: '#9ca3af' }}>→</span>
              </div>
            </div>
          )}

          {/* AI Manager */}
          {shop && shop.shopSlug && (
            <div style={{ marginTop: 14 }}>
              <AIManagerChat shopSlug={shop.shopSlug} productId={p.id} product={p} source="product_page" inline />
            </div>
          )}

          {/* Info strip */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 14 }}>
            <InfoCell icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#667085" strokeWidth="1.5" strokeLinecap="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16,8 20,8 23,11 23,16 16,16"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>} title="Доставка" text={p.deliveryTerm || 'Уточните у продавца'} />
            <InfoCell icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#667085" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>} title="Гарантия" text="Уточните у продавца" />
            <InfoCell icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#667085" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>} title="Оплата" text="По договорённости" />
          </div>
        </div>
      </div>

      {/* Accordions */}
      <div style={{ marginTop: 48, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 22, overflow: 'hidden' }}>
        {/* О товаре */}
        <AccSection title="О товаре" open={accOpen.about} onToggle={() => toggleAcc('about')}>
          {p.description && <p style={{ fontSize: 14, color: '#475467', lineHeight: 1.7 }}>{p.description}</p>}
          {p.benefits?.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              {p.benefits.map((b, i) => (
                <span key={i} style={{ fontSize: 12, fontWeight: 500, padding: '5px 12px', borderRadius: 999, background: '#f8fafc', color: '#475467', border: '1px solid #eef2f7' }}>{b}</span>
              ))}
            </div>
          )}
          {!p.description && !p.benefits?.length && <p style={{ fontSize: 14, color: '#9ca3af' }}>Описание не указано.</p>}
        </AccSection>

        {/* Характеристики */}
        <AccSection title="Характеристики" open={accOpen.specs} onToggle={() => toggleAcc('specs')}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: '6px 24px' }}>
            {[
              ['Категория', catLabel],
              ['Бренд', p.brand],
              ['Цвет', p.color],
              ['Состояние', getConditionLabel(p.condition)],
              ['Срок доставки', p.deliveryTerm],
              ['Тип товара', p.productType],
            ].filter(r => r[1]).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f8f8fa', fontSize: 13 }}>
                <span style={{ color: '#98a2b3' }}>{k}</span>
                <span style={{ color: '#344054', fontWeight: 500 }}>{v}</span>
              </div>
            ))}
          </div>
        </AccSection>

        {/* Доставка и оплата */}
        <AccSection title="Доставка и оплата" open={accOpen.delivery} onToggle={() => toggleAcc('delivery')}>
          <div style={{ fontSize: 14, color: '#475467', lineHeight: 1.7 }}>
            <p><strong>Доставка:</strong> {p.deliveryTerm || 'Уточните у продавца'}</p>
            <p><strong>Оплата:</strong> Оформление заявки через AGENT.ONE. Способ оплаты согласуется с продавцом. Онлайн-оплата в данный момент не подключена.</p>
          </div>
        </AccSection>

        {/* Отзывы */}
        <AccSection title="Отзывы" open={accOpen.reviews} onToggle={() => toggleAcc('reviews')}>
          <p style={{ fontSize: 14, color: '#9ca3af' }}>Отзывов пока нет.</p>
        </AccSection>

        {/* Вопросы */}
        <AccSection title="Вопросы и ответы" open={accOpen.qa} onToggle={() => toggleAcc('qa')} isLast>
          <p style={{ fontSize: 14, color: '#9ca3af', marginBottom: 10 }}>Пока нет вопросов по товару.</p>
          <button onClick={openContact} style={{ ...ST.btn, fontSize: 13, padding: '8px 20px' }}>Написать продавцу</button>
        </AccSection>
      </div>

      {/* Contact modal */}
      {showContact && (
        <div onClick={() => setShowContact(false)} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(15,23,42,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 24, padding: 28, maxWidth: 440, width: '90%', maxHeight: '90vh', overflow: 'auto' }}>
            <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Написать продавцу</h3>
            <p style={{ fontSize: 13, color: '#667085', marginBottom: 18 }}>Продавец получит вашу заявку и свяжется с вами</p>
            {!contactSent ? (
              <>
                <input value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Ваше имя *" style={fld} />
                <input value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="Телефон" style={fld} />
                <textarea value={contactMsg} onChange={e => setContactMsg(e.target.value)} placeholder="Сообщение *" maxLength={1000} rows={3} style={{ ...fld, minHeight: 70, resize: 'vertical' }} />
                {s.productContactReply?.reply && <div style={{ padding: 10, background: '#f8fafc', borderRadius: 12, fontSize: 13, color: '#475467', marginTop: 8 }}>{s.productContactReply.reply}</div>}
                {contactError && <div style={{ padding: 8, borderRadius: 10, fontSize: 12, background: '#fef2f2', color: '#991b1b', marginTop: 8 }}>{contactError}</div>}
                <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                  <button onClick={handleContact} disabled={s.productContactLoading} style={{ flex: 1, padding: 13, background: '#050505', color: '#fff', borderRadius: 14, fontSize: 14, fontWeight: 700, cursor: 'pointer', border: 'none' }}>{s.productContactLoading ? 'Отправка...' : 'Отправить'}</button>
                  <button onClick={() => setShowContact(false)} style={{ padding: '13px 22px', background: '#fff', color: '#475467', borderRadius: 14, fontSize: 14, fontWeight: 600, cursor: 'pointer', border: '1px solid #e5e7eb' }}>Отмена</button>
                </div>
              </>
            ) : (
              <>
                {s.productContactReply?.reply && <div style={{ padding: 14, background: '#f8fafc', borderRadius: 14, fontSize: 14, color: '#475467', marginBottom: 14 }}>{s.productContactReply.reply}</div>}
                <p style={{ fontSize: 13, color: '#065f46', textAlign: 'center', marginBottom: 12, fontWeight: 600 }}>Сообщение отправлено продавцу</p>
                <button onClick={() => setShowContact(false)} style={{ width: '100%', padding: 13, background: '#050505', color: '#fff', borderRadius: 14, fontSize: 14, fontWeight: 700, cursor: 'pointer', border: 'none' }}>Закрыть</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AccSection({ title, open, onToggle, children, isLast }) {
  return (
    <div style={{ borderBottom: isLast ? 'none' : '1px solid #f3f4f6' }}>
      <button onClick={onToggle} aria-expanded={open} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 15, fontWeight: 700, color: '#0b0f19' }}>
        {title}
        <span style={{ fontSize: 13, color: '#9ca3af', transition: 'transform 200ms', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</span>
      </button>
      {open && <div style={{ padding: '0 24px 20px' }}>{children}</div>}
    </div>
  );
}

function InfoCell({ icon, title, text }) {
  return (
    <div style={{ padding: 14, background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb' }}>
      <div style={{ marginBottom: 6, display:'flex', justifyContent:'center' }}>{icon}</div>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#667085', marginBottom: 2 }}>{title}</div>
      <div style={{ fontSize: 11, color: '#98a2b3' }}>{text}</div>
    </div>
  );
}

const fld = { width: '100%', padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: 12, fontSize: 14, outline: 'none', marginBottom: 10, display: 'block', boxSizing: 'border-box' };
