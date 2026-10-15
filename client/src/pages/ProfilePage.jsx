import { useState, useEffect, useRef } from 'react';
import { useStore } from '../hooks/useStore';
import StatusBadge from '../components/ui/StatusBadge';
import CustomDatePicker from '../components/CustomDatePicker';
import CustomSelect from '../components/CustomSelect';
import { buildLoginUrl, getCurrentRelativePath } from '../utils/authUrl';

const C = { bg:'#fff', bd:'#e5e7eb', t1:'#0b0f19', t2:'#667085', t3:'#98a2b3', btn:'#050505' };
const page = { maxWidth:1120, margin:'0 auto', padding:'32px 20px 56px' };

export default function ProfilePage() {
  const s = useStore();
  if (!s.token) return <GuestCard s={s} />;
  if (s.user?.role === 'client') return <BuyerProfile s={s} />;
  if (s.user?.role === 'business') return <ShopProfile s={s} />;
  return <div style={{ textAlign:'center', padding:40, color:C.t3 }}>Загрузка...</div>;
}

function GuestCard({ s }) {
  return (
    <div style={{ maxWidth:440, margin:'80px auto', padding:'0 16px', textAlign:'center' }}>
      <div style={{ background:C.bg, border:'1px solid '+C.bd, borderRadius:24, padding:48 }}>
        <h2 style={{ fontSize:20, fontWeight:700, color:C.t1, marginBottom:6 }}>Войдите в аккаунт</h2>
        <p style={{ fontSize:14, color:C.t2, marginBottom:20 }}>Чтобы просматривать и редактировать профиль</p>
        <button onClick={() => window.location.assign(buildLoginUrl(getCurrentRelativePath()))} style={{ padding:'12px 28px', background:C.btn, color:'#fff', borderRadius:14, fontSize:14, fontWeight:700, cursor:'pointer', border:'none' }}>Войти</button>
      </div>
    </div>
  );
}

function getInitials(user) {
  const fn = String(user?.firstName || '').trim();
  const ln = String(user?.lastName || '').trim();
  const fromName = (fn.charAt(0) + ln.charAt(0)).trim();
  if (fromName) return fromName.toUpperCase();
  const em = String(user?.email || '').trim();
  if (em) return em.charAt(0).toUpperCase();
  return 'A';
}

function BuyerProfile({ s }) {
  const u = s.user || {};
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  const [form, setForm] = useState({
    firstName:'', lastName:'', patronymic:'', birthDate:'', phone:'',
    avatarUrl:'', deliveryCity:'', deliveryAddress:'', deliveryComment:'',
    payerType:'individual', billingName:'', billingCompanyName:'', billingInn:'',
  });

  useEffect(() => {
    setForm({
      firstName: u.firstName||'', lastName: u.lastName||'', patronymic: u.patronymic||'',
      birthDate: u.birthDate||'', phone: u.phone||'',
      avatarUrl: u.avatarUrl||'', deliveryCity: u.deliveryCity||'',
      deliveryAddress: u.deliveryAddress||'', deliveryComment: u.deliveryComment||'',
      payerType: u.payerType||'individual', billingName: u.billingName||'',
      billingCompanyName: u.billingCompanyName||'', billingInn: u.billingInn||'',
    });
  }, [u.id]);

  const set = (k, v) => setForm(f => ({...f, [k]: v}));
  const save = async () => {
    if (form.birthDate && new Date(form.birthDate) > new Date()) { setError('Дата рождения не может быть в будущем.'); return; }
    setError(''); setSaving(true); setSaved(false);
    try {
      await s.updateProfile({
        firstName: form.firstName, lastName: form.lastName, patronymic: form.patronymic,
        birthDate: form.birthDate, phone: form.phone, avatarUrl: form.avatarUrl,
        deliveryCity: form.deliveryCity, deliveryAddress: form.deliveryAddress,
        deliveryComment: form.deliveryComment, payerType: form.payerType,
        billingName: form.billingName, billingCompanyName: form.billingCompanyName,
        billingInn: form.billingInn,
      });
      setSaved(true);
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  const uploadAvatar = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    if (file.size > 5*1024*1024) { setError('Фото не более 5 МБ'); return; }
    const fd = new FormData(); fd.append('avatar', file);
    setError(''); setSaving(true);
    try {
      const r = await fetch('/api/my/avatar', { method:'POST', headers:{ Authorization:'Bearer '+s.token }, body:fd });
      const d = await r.json();
      if (d.ok) {
        set('avatarUrl', d.data.avatarUrl);
        if (d.data.profile) {
          s.user = d.data.profile;
          localStorage.setItem('profile', JSON.stringify(d.data.profile));
          s.notify();
        }
        setSaved(true);
      }
      else throw new Error(d.error);
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  const initials = getInitials(form);

  return (
    <div style={page}>
      <div style={{ marginBottom:20 }}>
        <h2 style={{ fontSize:26, fontWeight:800, color:C.t1, letterSpacing:'-0.02em', marginBottom:3 }}>Профиль покупателя</h2>
        <p style={{ fontSize:13, color:C.t2 }}>Данные используются для заказов, заявок и оформления покупок.</p>
      </div>

      <div style={{ display:'flex', gap:32, flexWrap:'wrap', alignItems:'flex-start' }}>
        {/* Avatar */}
        <div style={{ flex:'0 0 260px', minWidth:200 }}>
          <div style={{ background:C.bg, border:'1px solid '+C.bd, borderRadius:22, padding:28, textAlign:'center' }}>
            <div style={{ width:104, height:104, borderRadius:'50%', background: form.avatarUrl ? 'none' : '#f8fafc', border:'1px solid '+C.bd, margin:'0 auto 14px', overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center' }}>
              {form.avatarUrl ? <img src={form.avatarUrl} style={{ width:'100%', height:'100%', objectFit:'cover' }} alt="" /> : <span style={{ fontSize:32, fontWeight:800, color:C.t3 }}>{initials}</span>}
            </div>
            <div style={{ fontSize:11, color:C.t3, marginBottom:12 }}>JPG или PNG, до 5 МБ</div>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadAvatar} style={{ display:'none' }} />
            <button onClick={() => fileRef.current?.click()} style={{ ...btnSec, width:'100%', marginBottom:4 }}>Загрузить фото</button>
            {form.avatarUrl && <button onClick={() => { set('avatarUrl',''); setSaved(true); }} style={{ ...btnSec, width:'100%', color:C.t3, fontSize:11 }}>Удалить</button>}
          </div>
        </div>

        {/* Form */}
        <div style={{ flex:1, minWidth:300 }}>
          <div style={{ background:C.bg, border:'1px solid '+C.bd, borderRadius:22, padding:24 }}>
            {/* Personal */}
            <Section title="Личные данные">
              <Row><label style={lbl}>Фамилия</label><input value={form.lastName} onChange={e=>set('lastName',e.target.value)} style={inp} /></Row>
              <Row><label style={lbl}>Имя</label><input value={form.firstName} onChange={e=>set('firstName',e.target.value)} style={inp} /></Row>
              <Row><label style={lbl}>Отчество</label><input value={form.patronymic} onChange={e=>set('patronymic',e.target.value)} style={inp} /></Row>
              <Row><label style={lbl}>Дата рождения</label><CustomDatePicker value={form.birthDate} onChange={e=>set('birthDate',e.target.value)} placeholder="Дата рождения" /></Row>
            </Section>

            {/* Contacts */}
            <Section title="Контакты">
              <Row><label style={lbl}>Телефон</label><input value={form.phone} onChange={e=>set('phone',e.target.value)} style={inp} placeholder="+7 999 123-45-67" /></Row>
              <Row><label style={lbl}>Email</label><input value={u.email||''} readOnly style={{ ...inp, background:'#f8fafc', color:C.t2 }} /></Row>
              <div style={{ fontSize:11, color:C.t3, marginTop:2 }}>Email используется для входа в аккаунт.</div>
            </Section>

            {/* Delivery */}
            <Section title="Данные для заказов">
              <Row><label style={lbl}>Город</label><input value={form.deliveryCity} onChange={e=>set('deliveryCity',e.target.value)} style={inp} /></Row>
              <Row><label style={lbl}>Адрес доставки</label><input value={form.deliveryAddress} onChange={e=>set('deliveryAddress',e.target.value)} style={inp} /></Row>
              <Row><label style={lbl}>Комментарий</label><textarea value={form.deliveryComment} onChange={e=>set('deliveryComment',e.target.value)} style={{ ...inp, minHeight:60, resize:'vertical' }} /></Row>
            </Section>

            {/* Billing prep */}
            <Section title="Данные для оплаты">
              <div style={{ fontSize:11, color:C.t3, marginBottom:10 }}>Эти данные будут использоваться при оформлении заказа. Онлайн-оплата сейчас не активна.</div>
              <Row><label style={lbl}>Тип плательщика</label><CustomSelect value={form.payerType} onChange={e=>set('payerType',e.target.value)} options={[{value:'individual',label:'Физическое лицо'},{value:'company',label:'Компания'}]} placeholder="Выберите" /></Row>
              {form.payerType === 'individual' ? (
                <Row><label style={lbl}>ФИО для оплаты</label><input value={form.billingName} onChange={e=>set('billingName',e.target.value)} style={inp} placeholder={[form.lastName,form.firstName,form.patronymic].filter(Boolean).join(' ') || 'ФИО'} /></Row>
              ) : (
                <>
                  <Row><label style={lbl}>Название компании</label><input value={form.billingCompanyName} onChange={e=>set('billingCompanyName',e.target.value)} style={inp} /></Row>
                  <Row><label style={lbl}>ИНН</label><input value={form.billingInn} onChange={e=>set('billingInn',e.target.value)} style={inp} maxLength={12} /></Row>
                </>
              )}
              <Row><label style={lbl}>Email для чека</label><input value={u.email||''} readOnly style={{ ...inp, background:'#f8fafc', color:C.t2 }} /></Row>
              <Row><label style={lbl}>Телефон для чека</label><input value={form.phone} onChange={e=>set('phone',e.target.value)} style={inp} /></Row>
            </Section>

            {/* Save */}
            {error && <div style={{ padding:10, borderRadius:12, fontSize:12, background:'#fef2f2', color:'#991b1b', marginBottom:12 }}>{error}</div>}
            {saved && !error && <StatusBadge variant="success" style={{ marginBottom: 12 }}>Профиль сохранён</StatusBadge>}
            <button onClick={save} disabled={saving} style={{ width:'100%', padding:14, borderRadius:16, fontSize:15, fontWeight:700, cursor:'pointer', border:'none', background:saving?'#d1d5db':C.btn, color:'#fff' }}>
              {saving ? 'Сохраняем...' : 'Сохранить профиль'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginTop:24, paddingTop:20, borderTop:'1px solid '+C.bd }}>
      <div style={{ fontSize:14, fontWeight:700, color:C.t1, marginBottom:12 }}>{title}</div>
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>{children}</div>
    </div>
  );
}
function Row({ children }) { return <div style={{ display:'grid', gridTemplateColumns:'140px 1fr', gap:12, alignItems:'center' }}>{children}</div>; }

const lbl = { fontSize:13, fontWeight:600, color:'#475467', whiteSpace:'nowrap' };
const inp = { width:'100%', padding:'10px 14px', border:'1px solid '+C.bd, borderRadius:12, fontSize:14, outline:'none', boxSizing:'border-box' };
const btnSec = { padding:'8px 16px', borderRadius:12, fontSize:12, fontWeight:600, cursor:'pointer', border:'1px solid '+C.bd, background:C.bg, color:'#475467' };

// ── Business shop profile ──
function ShopProfile({ s }) {
  const shop = s.currentShop || {};
  const [form, setForm] = useState(buildShopForm(shop));
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('basic');
  const logoRef = useRef(null);
  const coverRef = useRef(null);
  const [uploading, setUploading] = useState({ logo: false, cover: false });

  useEffect(() => {
    if (s.token && s.user?.role === 'business') {
      s.loadMyShop();
    }
  }, [s.token, s.user?.role]);

  useEffect(() => {
    setForm(buildShopForm(s.currentShop || {}));
  }, [s.currentShop?.id]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const saveShop = async () => {
    setError(''); setSaving(true); setSaved(false);
    try {
      await s.saveShopProfile({
        name: form.name,
        description: form.description,
        about: form.about,
        category: form.category,
        logoUrl: form.logoUrl,
        coverUrl: form.coverUrl,
        color: form.color,
        aiTone: form.aiTone,
        customDomain: form.customDomain,
        phone: form.phone,
        email: form.email,
        city: form.city,
        contactMethod: form.contactMethod,
        workingHours: form.workingHours,
        showAiManager: form.showAiManager,
        tagline: form.tagline,
        isPublished: form.isPublished,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e.message || 'Не удалось сохранить');
    }
    setSaving(false);
  };

  const uploadFile = async (file, type) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError('Фото не более 5 МБ'); return; }
    setUploading(u => ({ ...u, [type]: true }));
    setError('');
    try {
      const fd = new FormData();
      const fieldName = type === 'logo' ? 'avatar' : 'cover';
      fd.append(fieldName, file);
      const endpoint = type === 'logo' ? '/my/shop/avatar' : '/my/shop/cover';
      const r = await fetch('/api' + endpoint, { method: 'POST', headers: { Authorization: 'Bearer ' + s.token }, body: fd });
      const d = await r.json();
      if (d.ok && d.data?.shop) {
        s.setCurrentShop(d.data.shop, s.currentProducts || []);
        set(type === 'logo' ? 'logoUrl' : 'coverUrl', d.data.url);
      } else {
        throw new Error(d.error || 'Ошибка загрузки');
      }
    } catch (e) { setError(e.message); }
    setUploading(u => ({ ...u, [type]: false }));
  };

  const shopUrl = typeof window !== 'undefined' ? window.location.origin + '/#/shop/' + (shop.slug || '') : '';
  const avatarInitial = (form.name || shop.name || 'M').charAt(0).toUpperCase();
  const hasCover = !!form.coverUrl;

  const tabs = [
    { key: 'basic', label: 'Основное' },
    { key: 'visual', label: 'Визуал' },
    { key: 'contacts', label: 'Контакты' },
    { key: 'storefront', label: 'Storefront' },
  ];

  return (
    <div style={page}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 26, fontWeight: 800, color: C.t1, letterSpacing: '-0.02em', marginBottom: 3 }}>Настройки магазина</h2>
        <p style={{ fontSize: 13, color: C.t2 }}>Настройте внешний вид и контакты. Изменения сразу видны покупателям.</p>
      </div>

      <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* Left: form */}
        <div style={{ flex: '1 1 560px', minWidth: 320 }}>
          <div style={{ background: C.bg, border: '1px solid ' + C.bd, borderRadius: 22, padding: 24 }}>
            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4, background: '#f8fafc', borderRadius: 14, padding: 4, marginBottom: 24 }}>
              {tabs.map(t => (
                <button key={t.key} onClick={() => setActiveTab(t.key)} style={{ flex: 1, padding: '8px 12px', borderRadius: 12, fontSize: 13, fontWeight: activeTab === t.key ? 600 : 500, border: 'none', cursor: 'pointer', background: activeTab === t.key ? '#fff' : 'transparent', color: activeTab === t.key ? C.t1 : C.t2, boxShadow: activeTab === t.key ? '0 1px 2px rgba(15,23,42,0.06)' : 'none' }}>{t.label}</button>
              ))}
            </div>

            {activeTab === 'basic' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Field label="Название магазина" value={form.name} onChange={v => set('name', v)} placeholder="Например, ТехноМаркет" />
                <Field label="Краткое описание" value={form.description} onChange={v => set('description', v)} placeholder="Что продаёт магазин в 1-2 предложения" />
                <Field label="Подробное описание / About" value={form.about} onChange={v => set('about', v)} placeholder="Расскажите о магазине подробнее" textarea rows={4} />
                <Field label="Слоган / tagline" value={form.tagline} onChange={v => set('tagline', v)} placeholder="Короткая фраза под названием" />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <Field label="Категория" value={form.category} onChange={v => set('category', v)} placeholder="electronics, fashion..." />
                  <div>
                    <label style={fieldLabel}>Публичный slug</label>
                    <div style={{ ...inp, background: '#f8fafc', color: C.t2, display: 'flex', alignItems: 'center' }}>@{shop.slug || '...'}</div>
                    <div style={{ fontSize: 11, color: C.t3, marginTop: 4 }}>Изменить slug пока нельзя.</div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'visual' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div>
                  <label style={fieldLabel}>Цвет бренда</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <input type="color" value={form.color} onChange={e => set('color', e.target.value)} style={{ width: 60, height: 44, border: '1px solid ' + C.bd, borderRadius: 12, cursor: 'pointer' }} />
                    <input value={form.color} onChange={e => set('color', e.target.value)} style={{ ...inp, flex: 1 }} placeholder="#111111" />
                  </div>
                </div>

                <div>
                  <label style={fieldLabel}>Логотип / аватар</label>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                    <div style={{ width: 72, height: 72, borderRadius: 18, background: form.logoUrl ? 'none' : form.color || '#0b0f19', border: '1px solid ' + C.bd, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 28, fontWeight: 800, overflow: 'hidden', flexShrink: 0 }}>
                      {form.logoUrl ? <img src={form.logoUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : avatarInitial}
                    </div>
                    <div style={{ flex: 1 }}>
                      <input ref={logoRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={e => uploadFile(e.target.files[0], 'logo')} />
                      <button onClick={() => logoRef.current?.click()} disabled={uploading.logo} style={{ ...btnSec, marginBottom: 6 }}>{uploading.logo ? 'Загрузка…' : 'Загрузить логотип'}</button>
                      <div style={{ fontSize: 11, color: C.t3 }}>JPG, PNG, WebP до 5 МБ</div>
                    </div>
                    {form.logoUrl && <button onClick={() => set('logoUrl', '')} style={{ ...btnSec, color: C.t3, fontSize: 11 }}>Удалить</button>}
                  </div>
                </div>

                <div>
                  <label style={fieldLabel}>Обложка магазина</label>
                  <div style={{ height: 140, borderRadius: 16, border: '1px solid ' + C.bd, background: hasCover ? '#f3f4f6' : 'linear-gradient(135deg, #f8fafc 0%, #e5e7eb 100%)', backgroundImage: hasCover ? `url(${form.coverUrl})` : 'none', backgroundSize: 'cover', backgroundPosition: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10, overflow: 'hidden' }}>
                    {!hasCover && <span style={{ fontSize: 12, fontWeight: 700, color: '#cbd5e1', letterSpacing: 2, textTransform: 'uppercase' }}>AGENT.ONE</span>}
                  </div>
                  <input ref={coverRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={e => uploadFile(e.target.files[0], 'cover')} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => coverRef.current?.click()} disabled={uploading.cover} style={btnSec}>{uploading.cover ? 'Загрузка…' : 'Загрузить обложку'}</button>
                    {form.coverUrl && <button onClick={() => set('coverUrl', '')} style={{ ...btnSec, color: C.t3 }}>Удалить</button>}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'contacts' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <Field label="Телефон" value={form.phone} onChange={v => set('phone', v)} placeholder="+7 (999) 123-45-67" />
                  <Field label="Email" value={form.email} onChange={v => set('email', v)} placeholder="shop@example.com" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <Field label="Город / регион" value={form.city} onChange={v => set('city', v)} placeholder="Москва" />
                  <Field label="Часы работы" value={form.workingHours} onChange={v => set('workingHours', v)} placeholder="Пн–Пт 10:00–20:00" />
                </div>
                <Field label="Предпочтительный способ связи" value={form.contactMethod} onChange={v => set('contactMethod', v)} placeholder="Телефон, WhatsApp, email..." />
              </div>
            )}

            {activeTab === 'storefront' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Toggle label="Магазин опубликован" checked={form.isPublished} onChange={v => set('isPublished', v)} hint="Если выключено, магазин не виден в каталоге." />
                <Toggle label="Показывать AI-менеджера" checked={form.showAiManager} onChange={v => set('showAiManager', v)} hint="Клиент сможет писать AI-менеджеру на странице магазина и товаров." />
                <Field label="Кастомный домен" value={form.customDomain} onChange={v => set('customDomain', v)} placeholder="shop.example.com" />
                <div style={{ fontSize: 12, color: C.t2, background: '#f8fafc', padding: 12, borderRadius: 12, border: '1px solid #f3f4f6' }}>
                  <strong>Ссылка на магазин:</strong>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
                    <span style={{ color: C.t1, fontWeight: 600, wordBreak: 'break-all' }}>{shopUrl}</span>
                    <button onClick={() => navigator.clipboard.writeText(shopUrl)} style={{ ...btnSec, fontSize: 11, padding: '4px 10px' }}>Копировать</button>
                  </div>
                </div>
              </div>
            )}

            {/* Footer */}
            <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid ' + C.bd }}>
              {error && <div style={{ padding: 10, borderRadius: 12, fontSize: 12, background: '#faf4f4', border: '1px solid #eed9d9', color: '#7a2828', marginBottom: 12 }}>{error}</div>}
              {saved && <StatusBadge variant="success" style={{ marginBottom: 12 }}>Настройки сохранены</StatusBadge>}
              <button onClick={saveShop} disabled={saving} style={{ padding: '12px 28px', background: saving ? '#d1d5db' : C.btn, color: '#fff', borderRadius: 14, fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', border: 'none' }}>{saving ? 'Сохранение…' : 'Сохранить настройки'}</button>
            </div>
          </div>
        </div>

        {/* Right: preview */}
        <div style={{ flex: '0 1 380px', minWidth: 300, position: 'sticky', top: 24 }}>
          <div style={{ background: C.bg, border: '1px solid ' + C.bd, borderRadius: 22, padding: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 14 }}>Предпросмотр</div>
            <div style={{ borderRadius: 20, border: '1px solid ' + C.bd, overflow: 'hidden' }}>
              <div style={{ height: 120, background: hasCover ? '#f3f4f6' : 'linear-gradient(135deg, #f8fafc 0%, #e5e7eb 100%)', backgroundImage: hasCover ? `url(${form.coverUrl})` : 'none', backgroundSize: 'cover', backgroundPosition: 'center', position: 'relative' }}>
                {!hasCover && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: 11, fontWeight: 700, color: '#cbd5e1', letterSpacing: 2, textTransform: 'uppercase' }}>AGENT.ONE</span></div>}
              </div>
              <div style={{ padding: '0 16px 18px', position: 'relative' }}>
                <div style={{ width: 72, height: 72, borderRadius: 18, border: '4px solid #fff', background: form.logoUrl ? 'none' : form.color || '#0b0f19', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 28, fontWeight: 800, overflow: 'hidden', marginTop: -36, boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}>
                  {form.logoUrl ? <img src={form.logoUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : avatarInitial}
                </div>
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: C.t1 }}>{form.name || 'Название магазина'}</div>
                  <div style={{ fontSize: 13, color: C.t2, marginTop: 2 }}>@{shop.slug || 'slug'}</div>
                  {form.tagline && <div style={{ fontSize: 12, color: C.t2, marginTop: 6, fontStyle: 'italic' }}>{form.tagline}</div>}
                  <p style={{ fontSize: 13, color: '#4b5563', marginTop: 10, lineHeight: 1.5 }}>{form.description || 'Краткое описание магазина.'}</p>

                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
                    {form.city && <PreviewChip>{form.city}</PreviewChip>}
                    {form.phone && <PreviewChip>{form.phone}</PreviewChip>}
                    {form.workingHours && <PreviewChip>{form.workingHours}</PreviewChip>}
                    {form.showAiManager && <StatusBadge variant="ai" size="sm">AI-менеджер 24/7</StatusBadge>}
                  </div>
                </div>
              </div>
            </div>
            {!form.isPublished && (
              <div style={{ marginTop: 12, padding: 10, borderRadius: 12, background: '#fff8ed', color: '#92400e', fontSize: 12, fontWeight: 600 }}>Магазин не опубликован — покупатели не видят его в каталоге.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function buildShopForm(shop) {
  return {
    name: shop.name || '',
    description: shop.description || '',
    about: shop.about || '',
    category: shop.category || '',
    logoUrl: shop.logoUrl || '',
    coverUrl: shop.coverUrl || '',
    color: shop.color || '#111111',
    aiTone: shop.aiTone || 'friendly',
    customDomain: shop.customDomain || '',
    phone: shop.phone || '',
    email: shop.email || '',
    city: shop.city || '',
    contactMethod: shop.contactMethod || '',
    workingHours: shop.workingHours || '',
    showAiManager: shop.showAiManager !== false,
    tagline: shop.tagline || '',
    isPublished: shop.isPublished !== false,
  };
}

function Field({ label, value, onChange, placeholder, textarea, rows }) {
  return (
    <div>
      <label style={fieldLabel}>{label}</label>
      {textarea
        ? <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows || 3} style={{ ...inp, minHeight: 80, resize: 'vertical' }} />
        : <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={inp} />}
    </div>
  );
}

function Toggle({ label, checked, onChange, hint }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, padding: 14, border: '1px solid ' + C.bd, borderRadius: 14 }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.t1 }}>{label}</div>
        {hint && <div style={{ fontSize: 12, color: C.t2, marginTop: 2 }}>{hint}</div>}
      </div>
      <div onClick={() => onChange(!checked)} style={{ width: 42, height: 24, borderRadius: 12, background: checked ? '#0b0f19' : '#e5e7eb', cursor: 'pointer', position: 'relative', flexShrink: 0 }}>
        <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: checked ? 21 : 3, transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.12)' }} />
      </div>
    </div>
  );
}

function PreviewChip({ children, style }) {
  return <span style={{ fontSize: 11, fontWeight: 600, color: '#475467', background: '#f8fafc', border: '1px solid #eef2f7', padding: '3px 8px', borderRadius: 999, ...style }}>{children}</span>;
}

const fieldLabel = { fontSize: 12, fontWeight: 600, color: '#475467', display: 'block', marginBottom: 5 };

