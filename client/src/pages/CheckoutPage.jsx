import { useState } from 'react';
import { useStore, useApi } from '../hooks/useStore';
import { useRequireAuth } from '../hooks/useRequireAuth';
import { formatPrice } from '../utils/format';
import AgentIcon from '../components/AgentIcon';
import PdConsentField, { consentPayload } from '../components/PdConsent';
import { hasCurrentPersonalDataConsent } from '@legal/userConsent.js';

export default function CheckoutPage() {
  const s = useStore();
  const requireAuth = useRequireAuth();
  const { loading, error, call } = useApi();
  const [done, setDone] = useState(false);
  const [orderId, setOrderId] = useState('');
  const needsPdConsent = !hasCurrentPersonalDataConsent(s.user);

  const [name, setName] = useState(s.user?.displayName || '');
  const [phone, setPhone] = useState(s.user?.phone || '');
  const [email, setEmail] = useState(s.user?.email || '');
  const [delivery, setDelivery] = useState('pickup');
  const [payment, setPayment] = useState('cash');
  const [deliveryCity, setDeliveryCity] = useState(s.user?.deliveryCity || '');
  const [deliveryAddress, setDeliveryAddress] = useState(s.user?.deliveryAddress || '');
  const [deliveryComment, setDeliveryComment] = useState(s.user?.deliveryComment || '');
  const [pdConsent, setPdConsent] = useState(false);
  const [pdError, setPdError] = useState('');

  const items = s.cartItems;
  const total = items.reduce((sum, i) => sum + (Number(i.price) || 0) * (i.quantity || 1), 0);

  const performSubmit = async () => {
    if (!name || !phone || !email) return;
    if (needsPdConsent && !pdConsent) {
      setPdError('Дайте согласие на обработку персональных данных');
      return;
    }
    const payload = {
      items: items.map(i => ({ productId: i.productId, quantity: i.quantity })),
      customerName: name,
      customerPhone: phone,
      customerEmail: email,
      paymentMethod: payment,
      deliveryMethod: delivery,
      deliveryCity: deliveryCity || '',
      deliveryAddress: deliveryAddress || '',
      deliveryComment: deliveryComment || '',
      ...(needsPdConsent ? consentPayload(true, 'checkout') : {}),
    };
    try {
      const data = await call(() => s.createOrder(payload));
      setOrderId(data.orderId || '');
      setDone(true);
    } catch (e) {
      // error shown via useApi
    }
  };

  const submit = () => {
    if (!name || !phone || !email) return;
    requireAuth(() => performSubmit());
  };

  if (items.length === 0 && !done) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}><AgentIcon name="box" size={42} muted /></div>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#333' }}>Корзина пустая</div>
        <div style={{ fontSize: 14, color: '#999', marginTop: 6, marginBottom: 24 }}>Добавьте товары перед оформлением.</div>
        <button onClick={() => s.setPage('catalog')} style={{ padding: '12px 28px', background: '#111', color: '#fff', borderRadius: 999, fontSize: 14, fontWeight: 600, cursor: 'pointer', border: 'none' }}>Перейти в каталог</button>
      </div>
    );
  }

  if (done) {
    return (
      <div style={{ maxWidth:620, margin:'40px auto', padding:'0 16px' }}>
        <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:28, padding:'40px 36px', textAlign:'center' }}>
          {/* Icon */}
          <div style={{ width:72, height:72, borderRadius:'50%', background:'#f8fafc', border:'1px solid #e5e7eb', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0b0f19" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>

          <h2 style={{ fontSize:32, fontWeight:800, color:'#0b0f19', letterSpacing:'-0.02em', marginBottom:8 }}>Заказ создан!</h2>

          {orderId && (
            <div style={{ display:'inline-flex', alignItems:'center', gap:8, background:'#f8fafc', border:'1px solid #eef2f7', borderRadius:14, padding:'8px 16px', marginBottom:14 }}>
              <span style={{ fontSize:12, color:'#667085', fontWeight:500 }}>Номер заказа</span>
              <span style={{ fontSize:14, fontWeight:700, color:'#0b0f19', fontFamily:'monospace' }}>{orderId?.slice(0,14)}</span>
            </div>
          )}

          <p style={{ fontSize:14, color:'#667085', lineHeight:1.6, marginBottom:28, maxWidth:420, marginLeft:'auto', marginRight:'auto' }}>
            Мы передали заказ продавцу. Статус можно отслеживать в разделе «Мои заказы».
          </p>

          {/* Steps */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:12, marginBottom:28, textAlign:'center' }}>
            {[
              { n:'1', title:'Заказ передан', sub:'Продавец увидит заявку в кабинете' },
              { n:'2', title:'Подтверждение', sub:'Продавец уточнит детали заказа' },
              { n:'3', title:'Статус', sub:'Следите за заказом в личном кабинете' },
            ].map((step,i) => (
              <div key={i} style={{ padding:16, background:'#fafafa', borderRadius:16, border:'1px solid #eef2f7' }}>
                <div style={{ width:28, height:28, borderRadius:'50%', background:'#f0f0f3', color:'#667085', fontSize:13, fontWeight:700, display:'inline-flex', alignItems:'center', justifyContent:'center', marginBottom:8 }}>{step.n}</div>
                <div style={{ fontSize:13, fontWeight:700, color:'#0b0f19', marginBottom:4 }}>{step.title}</div>
                <div style={{ fontSize:11, color:'#667085', lineHeight:1.4 }}>{step.sub}</div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div style={{ display:'flex', gap:10, justifyContent:'center', flexWrap:'wrap' }}>
            {s.token && <button onClick={() => s.setPage('orders')} style={btnOk}>Мои заказы</button>}
            <button onClick={() => s.setPage('catalog')} style={btnCat}>В каталог</button>
          </div>
        </div>

        <div style={{ textAlign:'center', marginTop:14 }}>
          <a href="#" onClick={e => { e.preventDefault(); s.setPage('catalog'); }} style={{ fontSize:13, color:'#667085', textDecoration:'none' }}>Продолжить покупки</a>
        </div>
      </div>
    );
  }

  const payMethods = [
    { value: 'store', label: 'Оплата в магазине' },
    { value: 'cash', label: 'Наличными при получении' },
    { value: 'invoice', label: 'Счёт для юрлица' },
  ];

  return (
    <div style={{ padding: '30px 0 60px', maxWidth: 680, margin: '0 auto' }}>
      <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 20 }}>Оформление заказа</h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Contact info */}
        <div style={{ background: '#fff', border: '1px solid #e8e8e8', borderRadius: 12, padding: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Контактные данные</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div><label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Имя</label><input value={name} onChange={e => setName(e.target.value)} placeholder="Иван" style={{ width: '100%', padding: 12, border: '1px solid #ddd', borderRadius: 999, fontSize: 14 }} /></div>
            <div><label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Телефон</label><input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+7 (999) 123-45-67" style={{ width: '100%', padding: 12, border: '1px solid #ddd', borderRadius: 999, fontSize: 14 }} /></div>
            <div><label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Email</label><input value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" style={{ width: '100%', padding: 12, border: '1px solid #ddd', borderRadius: 999, fontSize: 14 }} /></div>
          </div>
        </div>

        {/* Delivery */}
        <div style={{ background: '#fff', border: '1px solid #e8e8e8', borderRadius: 12, padding: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Способ получения</h3>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
            {[
              { value: 'pickup', label: 'Самовывоз' },
              { value: 'delivery_agreement', label: 'Доставка по договорённости' },
            ].map(d => (
              <button key={d.value} onClick={() => setDelivery(d.value)} style={{ padding: '10px 20px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: delivery === d.value ? '2px solid #111' : '1px solid #ddd', background: delivery === d.value ? '#f8f8f8' : '#fff', color: '#333' }}>
                {d.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div><label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Город</label><input value={deliveryCity} onChange={e => setDeliveryCity(e.target.value)} placeholder="Москва" style={{ width: '100%', padding: 10, border: '1px solid #ddd', borderRadius: 12, fontSize: 14 }} /></div>
            <div><label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Адрес</label><input value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} placeholder="Улица, дом, квартира" style={{ width: '100%', padding: 10, border: '1px solid #ddd', borderRadius: 12, fontSize: 14 }} /></div>
            <div><label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Комментарий к доставке</label><textarea value={deliveryComment} onChange={e => setDeliveryComment(e.target.value)} placeholder="Дополнительные пожелания" style={{ width: '100%', padding: 10, border: '1px solid #ddd', borderRadius: 12, fontSize: 14, minHeight: 50, resize: 'vertical' }} /></div>
          </div>
        </div>

        {/* Payment */}
        <div style={{ background: '#fff', border: '1px solid #e8e8e8', borderRadius: 12, padding: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Способ оплаты</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {payMethods.map(m => (
              <button key={m.value} onClick={() => setPayment(m.value)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: payment === m.value ? '2px solid #111' : '1px solid #e8e8e8', background: payment === m.value ? '#f8f8f8' : '#fff', color: '#333' }}>
                <div style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid', borderColor: payment === m.value ? '#111' : '#ccc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {payment === m.value && <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#111' }} />}
                </div>
                {m.label}
              </button>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 12, fontSize: 13, fontWeight: 600, border: '1px solid #e8e8e8', background: '#f9f9f9', color: '#bbb', cursor: 'not-allowed' }}>
              <div style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid #ddd' }} />
              Онлайн-оплата через ЮKassa
              <span style={{ fontSize: 11, color: '#ccc' }}>— Будет доступно позже</span>
            </div>
          </div>
        </div>

        {/* Summary */}
        {needsPdConsent && (
          <PdConsentField checked={pdConsent} onChange={setPdConsent} error={pdError} source="checkout" />
        )}
        <div style={{ background: '#fff', border: '1px solid #e8e8e8', borderRadius: 12, padding: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 13, color: '#666' }}>К оплате</div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{formatPrice(total)}</div>
          </div>
          <button onClick={submit} disabled={loading || !name || !phone || !email || (needsPdConsent && !pdConsent)} style={{ padding: '14px 32px', background: loading || !name || !phone || !email || (needsPdConsent && !pdConsent) ? '#ccc' : '#111', color: '#fff', borderRadius: 999, fontSize: 15, fontWeight: 600, cursor: loading || !name || !phone || !email || (needsPdConsent && !pdConsent) ? 'not-allowed' : 'pointer', border: 'none' }}>
            {loading ? 'Создаём...' : 'Создать заказ'}
          </button>
        </div>

        {error && <div style={{ padding: 12, borderRadius: 8, fontSize: 13, textAlign: 'center', background: '#ffebee', color: '#c62828' }}>{error}</div>}
      </div>
    </div>
  );
}

const btnOk = { padding:'13px 28px', background:'#050505', color:'#fff', borderRadius:14, fontSize:14, fontWeight:700, cursor:'pointer', border:'none' };
const btnCat = { padding:'13px 28px', background:'#fff', color:'#344054', borderRadius:14, fontSize:14, fontWeight:600, cursor:'pointer', border:'1px solid #d0d5dd' };
