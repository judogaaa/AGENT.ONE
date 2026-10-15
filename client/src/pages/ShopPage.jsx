import { useEffect, useState } from 'react';
import { useStore } from '../hooks/useStore';
import { useRequireAuth } from '../hooks/useRequireAuth';
import { displayShopName, displayShopDescription } from '../utils/shopDisplay';
import ProductCard from '../components/ProductCard';
import AIManagerChat from '../components/AIManagerChat';
import AgentIcon from '../components/AgentIcon';
import StatusBadge from '../components/ui/StatusBadge';
import PdConsentField, { consentPayload } from '../components/PdConsent';
import { hasCurrentPersonalDataConsent } from '@legal/userConsent.js';

const S = {
  bd: '#e5e7eb', bg: '#f8fafc', t1: '#0b0f19', t2: '#667085', t3: '#98a2b3',
  white: '#fff', btn: '#0b0f19',
};

export default function ShopPage() {
  const s = useStore();
  const requireAuth = useRequireAuth();
  const [copied, setCopied] = useState(false);
  const [contactForm, setContactForm] = useState({ name: '', phone: '', email: '', message: '' });
  const [contactPdConsent, setContactPdConsent] = useState(false);
  const [contactPdError, setContactPdError] = useState('');
  const [showContact, setShowContact] = useState(false);
  const [contactSubmitted, setContactSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewText, setReviewText] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState('');

  useEffect(() => {
    const hash = window.location.hash;
    const match = hash.match(/#\/shop\/(.+)/);
    if (match) { s.currentSlug = match[1]; s.loadShop(match[1]); s.loadShopReviews(match[1]); }
  }, []);

  useEffect(() => { if (s.contactSent) { setContactSubmitted(true); s.contactSent = false; } }, [s.contactSent]);

  if (!s.currentShop) {
    return (
      <div style={{ maxWidth: 460, margin: '80px auto', padding: '0 16px', textAlign: 'center' }}>
        <div style={{ background: S.white, border: '1px solid ' + S.bd, borderRadius: 24, padding: 48 }}>
          <div style={{ fontSize: 14, color: S.t2, marginBottom: 4 }}>Загрузка магазина...</div>
        </div>
      </div>
    );
  }

  const shop = s.currentShop;
  const isOwner = s.user?.role === 'business' && s.user?.id && shop.ownerId && String(s.user.id) === String(shop.ownerId);
  const showAiManager = shop.showAiManager !== false;
  const hasCover = !!shop.coverUrl;
  const shopName = displayShopName(shop);
  const shopDesc = displayShopDescription(shop);
  const initial = shopName ? shopName[0].toUpperCase() : 'M';
  const needsPdConsent = !hasCurrentPersonalDataConsent(s.user);

  const copyLink = async () => {
    const url = window.location.origin + '/#/shop/' + s.currentSlug;
    try { await navigator.clipboard.writeText(url); } catch {}
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };
  const submitContact = async () => {
    setError('');
    setContactPdError('');
    if (needsPdConsent && !contactPdConsent) {
      setContactPdError('Дайте согласие на обработку персональных данных');
      return;
    }
    try {
      await s.contactShop(s.currentSlug, {
        ...contactForm,
        ...(needsPdConsent ? consentPayload(true, 'shop_contact') : {}),
      });
      setContactSubmitted(true);
    } catch (e) { setError(e.message); }
  };

  // Badges
  const badges = [];
  if (s.shopTrustStatus === 'reliable') badges.push({ label: 'Надёжный продавец', variant: 'success' });
  if (showAiManager) badges.push({ label: 'AI 24/7', variant: 'ai' });
  if (shop.city) badges.push({ label: shop.city, variant: 'neutral' });
  if (s.shopOrdersCount > 0) badges.push({ label: s.shopOrdersCount + ' заказов', variant: 'muted' });
  if (s.shopJoinedYear) badges.push({ label: 'С ' + s.shopJoinedYear, variant: 'muted' });

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 16px 60px' }}>
      {/* Owner toolbar */}
      {isOwner && (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8, padding:'6px 16px', marginBottom:12, background:S.bg, border:'1px solid '+S.bd, borderRadius:14 }}>
          <span style={{ fontSize:12, color:S.t2 }}>Вы управляете магазином</span>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => s.setPage('profile')} style={ownerLink}>Редактировать</button>
            <button onClick={() => s.setPage('dashboard')} style={ownerLink}>Кабинет</button>
            <button onClick={() => s.setPage('ai-manager')} style={ownerLink}>AI-менеджер</button>
          </div>
        </div>
      )}

      {/* Storefront card */}
      <div style={{ background:S.white, border:'1px solid '+S.bd, borderRadius:24, overflow:'hidden', marginBottom:20 }}>

        {/* Hero Cover */}
        <div style={{
          height:180, borderRadius:'23px 23px 0 0', overflow:'hidden',
          background: hasCover ? '#f1f5f9' : 'linear-gradient(135deg, #f8fafc 0%, #eef2f7 100%)',
          backgroundImage: hasCover ? `url(${shop.coverUrl})` : 'none',
          backgroundSize:'cover', backgroundPosition:'center', position:'relative',
        }}>
          {!hasCover && (
            <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <span style={{ fontSize:12, fontWeight:700, color:'#cbd5e1', letterSpacing:3, textTransform:'uppercase' }}>AGENT.ONE</span>
            </div>
          )}
        </div>

        {/* Identity */}
        <div style={{ padding:'20px 22px 20px' }}>
          <div style={{ display:'flex', gap:14, alignItems:'center' }}>
            <div style={{
              width:72, height:72, borderRadius:20, border:'1px solid '+S.bd,
              background:S.white, display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:28, fontWeight:800, color: shop.color || S.t1, flexShrink:0, overflow:'hidden',
            }}>
              {shop.logoUrl ? <img src={shop.logoUrl} style={{ width:'100%',height:'100%',objectFit:'cover' }} alt="" /> : <span>{initial}</span>}
            </div>
            <div style={{ minWidth:0, flex:1 }}>
              <h1 style={{ fontSize:22, fontWeight:800, margin:'0 0 2px', color:S.t1, lineHeight:1.2 }}>{shopName}</h1>
              <div style={{ fontSize:13, color:S.t2 }}>@{shop.slug}</div>
              {shop.tagline && <div style={{ fontSize:13, color:S.t2, marginTop:3, lineHeight:1.4 }}>{shop.tagline}</div>}
            </div>
            {!isOwner && (
              <div style={{ display:'flex', gap:8, flexShrink:0, flexWrap:'wrap', justifyContent:'flex-end' }}>
                <button onClick={() => requireAuth(() => { setShowContact(true); setContactSubmitted(false); setError(''); if (s.user) setContactForm(c => ({ ...c, name:s.user.displayName||'', phone:s.user.phone||'', email:s.user.email||'' })); })} style={btnPrimary}>Написать</button>
                <button onClick={copyLink} style={btnSecondary}>{copied ? 'Ссылка скопирована' : <AgentIcon name="arrow-right" size={14} />}</button>
              </div>
            )}
          </div>

          {/* Badges */}
          {badges.length > 0 && (
            <div style={{ display:'flex', gap:6, marginTop:14, flexWrap:'wrap' }}>
              {badges.map((b, i) => <StatusBadge key={i} variant={b.variant} size="sm">{b.label}</StatusBadge>)}
            </div>
          )}

          {/* Description + About */}
          {(shopDesc || shop.about) && (
            <div style={{ marginTop:12, paddingTop:12, borderTop:'1px solid '+S.bd }}>
              {shopDesc && <p style={{ fontSize:13, color:'#4b5563', margin:0, lineHeight:1.6 }}>{shopDesc}</p>}
              {shop.about && <p style={{ fontSize:13, color:S.t2, margin:0, marginTop: shopDesc?6:0, lineHeight:1.55 }}>{shop.about}</p>}
            </div>
          )}

          {/* Contacts row */}
          {(shop.phone || shop.email || shop.workingHours || shop.contactMethod) && (
            <div style={{ display:'flex', gap:8, marginTop:12, flexWrap:'wrap', alignItems:'center' }}>
              {shop.phone && <StatusBadge variant="neutral" size="sm">{shop.phone}</StatusBadge>}
              {shop.email && <StatusBadge variant="neutral" size="sm">{shop.email}</StatusBadge>}
              {shop.workingHours && <StatusBadge variant="muted" size="sm">{shop.workingHours}</StatusBadge>}
              {shop.contactMethod && <StatusBadge variant="neutral" size="sm">{shop.contactMethod}</StatusBadge>}
            </div>
          )}
        </div>
      </div>

      {/* AI Manager */}
      {showAiManager && !isOwner && (
        <div style={{ marginBottom: 20 }}>
          <AIManagerChat shopSlug={s.currentSlug} source="shop_page" inline />
        </div>
      )}

      {/* Products */}
      <div style={{ marginBottom:36 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:16 }}>
          <h3 style={{ fontSize:18, fontWeight:800, margin:0, color:S.t1 }}>Товары магазина</h3>
          <span style={{ fontSize:13, color:S.t2 }}>{s.currentProducts.length} товаров</span>
        </div>
        {s.currentProducts.length === 0 ? (
          <div style={{ textAlign:'center', padding:'48px 20px', color:S.t3, background:S.white, border:'1px solid '+S.bd, borderRadius:20 }}>
            <div style={{ fontSize:14, fontWeight:600, color:'#374151', marginBottom:4 }}>В магазине пока нет товаров</div>
            <div style={{ fontSize:13 }}>Загляните позже или посмотрите другие магазины.</div>
          </div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:14 }}>
            {s.currentProducts.map(p => <ProductCard key={p.id} product={p} />)}
          </div>
        )}
      </div>

      {/* Reviews */}
      <div>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:14 }}>
          <h3 style={{ fontSize:18, fontWeight:800, margin:0, color:S.t1 }}>Отзывы</h3>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            {s.shopReviewsCount > 0 && <span style={{ fontSize:13, color:S.t2 }}>{Number(s.shopRatingAvg).toFixed(1)} · {s.shopReviewsCount} отзывов</span>}
            <button onClick={() => requireAuth(() => { setShowReviewForm(true); setReviewError(''); })} style={{ padding:'8px 16px', background: S.btn, color:'#fff', borderRadius:999, fontSize:13, fontWeight:600, cursor:'pointer', border:'none' }}>Оставить отзыв</button>
          </div>
        </div>
        {s.shopReviews.length === 0 && <p style={{ color:S.t3, fontSize:13, margin:0 }}>Отзывов пока нет.</p>}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:10, marginTop: s.shopReviews.length>0?0:undefined }}>
          {s.shopReviews.slice(0,10).map(rv => (
            <div key={rv.id} style={{ background:S.white, border:'1px solid '+S.bd, borderRadius:16, padding:14 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                <span style={{ fontWeight:700, fontSize:13, color:S.t1 }}>{rv.authorName}</span>
                <span style={{ display:'inline-flex', gap:1, color:'#f5a623', fontSize:12 }}>
                  {Array.from({length:rv.rating}, (_,i)=> <AgentIcon key={'sf_'+i} name="star" size={13} />)}
                  <span style={{ color:'#e5e7eb', display:'inline-flex', gap:1 }}>
                    {Array.from({length:5-rv.rating}, (_,i)=> <AgentIcon key={'es_'+i} name="star" size={13} />)}
                  </span>
                </span>
              </div>
              {rv.text && <p style={{ fontSize:13, color:'#4b5563', lineHeight:1.5, margin:0 }}>{rv.text}</p>}
              <div style={{ fontSize:11, color:S.t3, marginTop:6 }}>{rv.createdAt ? new Date(rv.createdAt).toLocaleDateString('ru-RU'):''}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Review form modal */}
      {showReviewForm && (
        <div onClick={() => setShowReviewForm(false)} style={{ position:'fixed', inset:0, background:'rgba(11,15,25,.35)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background:S.white, borderRadius:20, padding:24, maxWidth:420, width:'91%' }}>
            <h3 style={{ fontSize:17, fontWeight:800, marginBottom:14, color:S.t1 }}>Оставить отзыв</h3>
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:12, color:S.t2, marginBottom:6 }}>Оценка</div>
              <div style={{ display:'flex', gap:4 }}>
                {[1,2,3,4,5].map(n => (
                  <button key={n} onClick={() => setReviewRating(n)} style={{ background:'none', border:'none', cursor:'pointer', padding:2, color: n <= reviewRating ? '#f5a623' : '#e5e7eb' }} aria-label={`${n} звезд`}>
                    <AgentIcon name="star" size={22} />
                  </button>
                ))}
              </div>
            </div>
            <textarea value={reviewText} onChange={e => setReviewText(e.target.value)} placeholder="Ваш отзыв (необязательно)" maxLength={1000} style={{ width:'100%', padding:'10px 12px', border:'1px solid '+S.bd, borderRadius:12, fontSize:13, minHeight:80, resize:'vertical', outline:'none', display:'block', boxSizing:'border-box', marginBottom:10 }} />
            {reviewError && <div style={{ padding:8, borderRadius:10, fontSize:12, background:'#fef2f2', color:'#991b1b', marginBottom:10 }}>{reviewError}</div>}
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={async () => {
                setReviewSubmitting(true); setReviewError('');
                try {
                  await s.createShopReview(s.currentSlug, { rating: reviewRating, text: reviewText });
                  await s.loadShopReviews(s.currentSlug);
                  setShowReviewForm(false);
                  setReviewText('');
                  setReviewRating(5);
                } catch (e) { setReviewError(e.message || 'Ошибка отправки'); }
                setReviewSubmitting(false);
              }} disabled={reviewSubmitting} style={{ flex:1, padding:11, background:S.btn, color:'#fff', borderRadius:999, fontSize:13, fontWeight:600, cursor: reviewSubmitting ? 'wait' : 'pointer', border:'none', opacity: reviewSubmitting ? .6 : 1 }}>{reviewSubmitting ? 'Отправка...' : 'Отправить'}</button>
              <button onClick={() => setShowReviewForm(false)} style={{ padding:'11px 18px', background:S.bg, color:'#374151', borderRadius:999, fontSize:13, fontWeight:600, cursor:'pointer', border:'1px solid '+S.bd }}>Отмена</button>
            </div>
          </div>
        </div>
      )}

      {/* Contact Modal */}
      {showContact && (
        <div style={{ position:'fixed', inset:0, background:'rgba(11,15,25,.35)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }} onClick={() => setShowContact(false)}>
          <div style={{ background:S.white, borderRadius:20, padding:24, maxWidth:420, width:'91%', maxHeight:'90vh', overflow:'auto' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize:17, fontWeight:800, marginBottom:14, color:S.t1 }}>Связаться с продавцом</h3>
            {!contactSubmitted ? (<>
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                <input value={contactForm.name} onChange={e => setContactForm({...contactForm, name:e.target.value})} placeholder="Ваше имя" style={inp} />
                <input value={contactForm.phone} onChange={e => setContactForm({...contactForm, phone:e.target.value})} placeholder="Телефон" style={inp} />
                <input value={contactForm.email} onChange={e => setContactForm({...contactForm, email:e.target.value})} placeholder="Email" style={inp} />
                <textarea value={contactForm.message} onChange={e => setContactForm({...contactForm, message:e.target.value})} maxLength={1000} placeholder="Сообщение" style={{...inp, minHeight:80, resize:'vertical'}} />
              </div>
              {needsPdConsent && (
                <PdConsentField checked={contactPdConsent} onChange={setContactPdConsent} error={contactPdError} source="shop_contact" id="shop-contact-pd-consent" />
              )}
              {error && <div style={{ padding:8, borderRadius:10, fontSize:12, background:'#fef2f2', color:'#991b1b', marginTop:10 }}>{error}</div>}
              <div style={{ display:'flex', gap:8, marginTop:14 }}>
                <button onClick={submitContact} style={{ flex:1, padding:11, background:S.btn, color:'#fff', borderRadius:999, fontSize:13, fontWeight:600, cursor:'pointer', border:'none' }}>Отправить</button>
                <button onClick={() => setShowContact(false)} style={{ padding:'11px 18px', background:S.bg, color:'#374151', borderRadius:999, fontSize:13, fontWeight:600, cursor:'pointer', border:'1px solid '+S.bd }}>Отмена</button>
              </div>
            </>) : (<>
              <div style={{ textAlign:'center', padding:'16px 0' }}>
                <div style={{ fontSize:14, fontWeight:700, color:'#065f46' }}>Сообщение отправлено</div>
              </div>
              <button onClick={() => setShowContact(false)} style={{ width:'100%', padding:11, background:S.btn, color:'#fff', borderRadius:999, fontSize:13, fontWeight:600, cursor:'pointer', border:'none' }}>Закрыть</button>
            </>)}
          </div>
        </div>
      )}

      {s.leadFormOpen && <LeadFormInline />}
    </div>
  );
}

function LeadFormInline() {
  const s = useStore();
  const needsPdConsent = !hasCurrentPersonalDataConsent(s.user);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [msg, setMsg] = useState('');
  const [pdConsent, setPdConsent] = useState(false);
  const [pdError, setPdError] = useState('');
  const submit = async () => {
    if (!name || !phone) return;
    if (needsPdConsent && !pdConsent) {
      setPdError('Дайте согласие на обработку персональных данных');
      return;
    }
    await s.createLead({
      shopId: s.currentShop?.id,
      productId: s.leadProductId,
      name,
      phone,
      email: '',
      message: msg,
      ...(needsPdConsent ? consentPayload(true, 'shop_lead_inline') : {}),
    });
    s.setLeadForm(false);
  };
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(11,15,25,.35)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }} onClick={() => s.setLeadForm(false)}>
      <div style={{ background:'#fff', borderRadius:20, padding:22, maxWidth:360, width:'91%' }} onClick={e => e.stopPropagation()}>
        <h3 style={{ fontSize:17, fontWeight:800, marginBottom:14, color:'#0b0f19' }}>Оставить заявку</h3>
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Имя" style={inp} />
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Телефон" style={inp} />
          <textarea value={msg} onChange={e => setMsg(e.target.value)} placeholder="Сообщение" style={{...inp, minHeight:70, resize:'vertical'}} />
        </div>
        {needsPdConsent && (
          <PdConsentField checked={pdConsent} onChange={setPdConsent} error={pdError} source="shop_lead_inline" id="shop-lead-inline-pd-consent" />
        )}
        <div style={{ display:'flex', gap:8, marginTop:14 }}>
          <button onClick={submit} style={{ flex:1, padding:11, background:'#0b0f19', color:'#fff', borderRadius:999, fontSize:13, fontWeight:600, cursor:'pointer', border:'none' }}>Отправить</button>
          <button onClick={() => s.setLeadForm(false)} style={{ padding:'11px 16px', background:'#f8fafc', color:'#374151', borderRadius:999, fontSize:13, fontWeight:600, cursor:'pointer', border:'1px solid #e5e7eb' }}>Отмена</button>
        </div>
      </div>
    </div>
  );
}

const btnPrimary = { padding:'10px 22px', borderRadius:999, fontSize:13, fontWeight:600, cursor:'pointer', border:'none', background:'#0b0f19', color:'#fff' };
const btnSecondary = { padding:'10px 16px', borderRadius:999, fontSize:13, fontWeight:600, cursor:'pointer', border:'1px solid '+S.bd, background:'#fff', color:'#374151', display:'flex', alignItems:'center', gap:4 };
const ownerLink = { padding:'4px 8px', fontSize:12, fontWeight:600, cursor:'pointer', border:'none', background:'none', color:'#667085', textDecoration:'none' };
const inp = { width:'100%', padding:'10px 13px', border:'1px solid #e5e7eb', borderRadius:12, fontSize:14, outline:'none', color:'#0b0f19', boxSizing:'border-box', fontFamily:'inherit' };
