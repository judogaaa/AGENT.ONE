import { useEffect, useState, useRef } from 'react';
import { useStore } from '../hooks/useStore';
import StatusBadge from '../components/ui/StatusBadge';
import SlidingTabs from '../components/SlidingTabs';
import ProductCard from '../components/ProductCard';
import { formatPrice } from '../utils/format';
import { getProductMainImage } from '../utils/productImages';
import AgentIcon from '../components/AgentIcon';
import AIManagerChat from '../components/AIManagerChat';
import { buildLoginUrl, getCurrentRelativePath } from '../utils/authUrl';

const C = { bg:'#fff', bd:'#e5e7eb', t1:'#0b0f19', t2:'#667085', t3:'#98a2b3', btn:'#050505' };
const page = { maxWidth:1040, margin:'0 auto', padding:'32px 20px 56px' };

export default function AccountPage() {
  const s = useStore();
  const [tab, setTab] = useState(s.accountTab || 'orders');

  useEffect(() => {
    s.accountTab = tab;
  }, [tab]);

  useEffect(() => {
    if (s.token) { s.loadMyOrders(); s.loadFavorites(); s.loadMyAppeals(); }
  }, [s.page]);

  if (!s.token) {
    return (
      <div style={{ maxWidth:440, margin:'80px auto', padding:'0 16px', textAlign:'center' }}>
        <div style={{ background:C.bg, border:'1px solid '+C.bd, borderRadius:24, padding:48 }}>
          <div style={{ fontSize:18, fontWeight:700, color:C.t1, marginBottom:6 }}>Войдите в аккаунт</div>
          <div style={{ fontSize:14, color:C.t2, marginBottom:20 }}>Войдите или зарегистрируйтесь, чтобы видеть заказы и заявки.</div>
          <button onClick={() => window.location.assign(buildLoginUrl(getCurrentRelativePath()))} style={{ padding:'12px 28px', background:C.btn, color:'#fff', borderRadius:14, fontSize:14, fontWeight:700, cursor:'pointer', border:'none' }}>Войти</button>
        </div>
      </div>
    );
  }

  if (s.user?.role === 'business') {
    return (
      <div style={{ maxWidth:440, margin:'80px auto', padding:'0 16px', textAlign:'center' }}>
        <div style={{ background:C.bg, border:'1px solid '+C.bd, borderRadius:24, padding:48 }}>
          <div style={{ fontSize:18, fontWeight:700, color:C.t1, marginBottom:6 }}>Заявки покупателей</div>
          <div style={{ fontSize:14, color:C.t2, marginBottom:20 }}>Заявки покупателей находятся в Dashboard → Клиенты.</div>
          <button onClick={() => { s.setPage('dashboard'); s.loadDashboardStats(); }} style={{ padding:'12px 28px', background:C.btn, color:'#fff', borderRadius:14, fontSize:14, fontWeight:700, cursor:'pointer', border:'none' }}>Открыть Dashboard</button>
        </div>
      </div>
    );
  }

  const orders = s.myOrders;
  const favs = Array.isArray(s.favorites) ? s.favorites : [];
  const conversations = Array.isArray(s.appeals) ? s.appeals : [];
  const user = s.user;

  return (
    <div style={page}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:12 }}>
        <div>
          <h2 style={{ fontSize:26, fontWeight:800, color:C.t1, letterSpacing:'-0.02em', marginBottom:3 }}>Мой аккаунт</h2>
          <p style={{ fontSize:13, color:C.t2 }}>Заказы, избранное, обращения и профиль</p>
        </div>
        <button onClick={() => s.logout()} style={btnOut}>Выйти</button>
      </div>

      {/* Tabs */}
      <div style={{ marginBottom:20 }}>
        <SlidingTabs
          tabs={[
            { value:'orders', label:`Заказы${orders.length > 0 ? ` · ${orders.length}` : ''}` },
            { value:'favorites', label:`Избранное${s.favoriteIds.length > 0 ? ` · ${s.favoriteIds.length}` : ''}` },
            { value:'appeals', label:`Сообщения${s.appealsCounts?.all > 0 ? ` · ${s.appealsCounts.all}` : ''}` },
            { value:'profile', label:'Профиль' },
          ]}
          value={tab} onChange={setTab}
        />
      </div>

      {/* Orders */}
      {tab === 'orders' && (
        <OrdersSection orders={orders} s={s} C={C} />
      )}

      {/* Favorites */}
      {tab === 'favorites' && (
        <>
          <h3 style={{ fontSize:17, fontWeight:700, color:C.t1, marginBottom:14 }}>Избранное</h3>
          <p style={{ fontSize:13, color:C.t2, marginTop: -10, marginBottom: 16 }}>Сохранённые товары</p>
          {s.favoritesLoading ? (
            <div style={emptyCard}><div style={{ fontWeight:600, color:C.t1, marginBottom:4 }}>Загружаем...</div></div>
          ) : favs.length === 0 ? (
            <div style={emptyCard}>
              <div style={{ fontWeight:600, color:C.t1, marginBottom:4 }}>В избранном пока пусто</div>
              <div style={{ fontSize:13, color:C.t2, marginBottom:14 }}>Сохраняйте товары, чтобы быстро вернуться к ним позже.</div>
              <button onClick={() => s.setPage('catalog')} style={btnPri}>Перейти в каталог</button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 16 }}>
              {favs.map(p => <ProductCard key={p.id} product={p} />)}
            </div>
          )}
        </>
      )}

      {/* Conversations */}
      {tab === 'appeals' && (
        <ConversationsSection shops={conversations} s={s} C={C} />
      )}

      {/* Profile */}
      {tab === 'profile' && (
        <ProfileSection user={user} s={s} C={C} />
      )}
    </div>
  );
}

// ─── Orders Section ───
function OrdersSection({ orders, s, C }) {
  const [search, setSearch] = useState('');
  const [ofilter, setOFilter] = useState('all');

  const filtered = orders.filter(o => {
    if (ofilter === 'active') return !['completed','cancelled'].includes(o.orderStatus);
    if (ofilter === 'done') return o.orderStatus === 'completed';
    if (ofilter === 'cancelled') return o.orderStatus === 'cancelled';
    return true;
  }).filter(o => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (o.items || []).some(i => (i.productName||'').toLowerCase().includes(q)) ||
           (o.customerName||'').toLowerCase().includes(q) || o.id.toLowerCase().includes(q);
  });

  return (
    <>
      <h3 style={{ fontSize:17, fontWeight:700, color:C.t1, marginBottom:14 }}>Мои заказы</h3>
      <p style={{ fontSize:13, color:C.t2, marginTop: -10, marginBottom: 16 }}>Покупки и оформление</p>
      <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
        {[{k:'all',l:'Все'},{k:'active',l:'В обработке'},{k:'done',l:'Завершённые'}].map(f => (
          <button key={f.k} onClick={() => setOFilter(f.k)} style={{ padding:'6px 16px', borderRadius:999, fontSize:12, fontWeight: ofilter===f.k?700:500, cursor:'pointer', border:'none', background: ofilter===f.k?'#0b0f19':'#f3f4f6', color: ofilter===f.k?'#fff':'#374151' }}>{f.l}</button>
        ))}
        {orders.length > 0 && <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск по заказу" style={{ marginLeft:'auto', padding:'6px 14px', border:'1px solid #e5e7eb', borderRadius:999, fontSize:12, outline:'none', minWidth:180 }} />}
      </div>
      {filtered.length === 0 ? (
        <div style={emptyCard}>
          <div style={{ fontWeight:600, color:C.t1, marginBottom:4 }}>{orders.length === 0 ? 'Заказов пока нет' : 'Ничего не найдено'}</div>
          <div style={{ fontSize:13, color:C.t2, marginBottom:14 }}>{orders.length === 0 ? 'Когда вы оформите заказ, он появится здесь.' : 'Попробуйте изменить фильтр.'}</div>
          {orders.length === 0 && <button onClick={() => s.setPage('catalog')} style={btnPri}>Перейти в каталог</button>}
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {filtered.map(o => <OrderCard key={o.id} o={o} s={s} />)}
        </div>
      )}
    </>
  );
}

// ─── Conversations Section ───
export function ConversationsSection({ shops, s, C }) {
  const [selectedShop, setSelectedShop] = useState(/** @type {string|null} */ (null));
  const [messages, setMessages] = useState(/** @type {Array} */ ([]));
  const [loadingChat, setLoadingChat] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState('all');
  const abortRef = useRef(null);

  const convPage = Math.max(1, Number(s.appealsCounts?.page) || 1);
  const convTotalPages = Math.max(1, Number(s.appealsCounts?.totalPages) || 1);

  const openShop = async (shopId) => {
    if (abortRef.current) abortRef.current.abort();
    setSelectedShop(shopId); setSelectedTopic('all'); setLoadingChat(true);
    const ctrl = new AbortController(); abortRef.current = ctrl;
    try {
      const d = await s.api(`/my/appeals/${shopId}`, { signal: ctrl.signal });
      setMessages(d.messages || []);
    } catch (e) { if (e.name !== 'AbortError') setMessages([]); }
    finally { setLoadingChat(false); }
  };

  const closeShop = () => {
    if (abortRef.current) abortRef.current.abort();
    setSelectedShop(null); setMessages([]);
  };

  // Compute topics from messages
  const topicMap = {};
  messages.forEach(m => {
    const pid = m.productId || '_general';
    if (!topicMap[pid]) topicMap[pid] = { productId: m.productId, productName: m.productName, productImage: m.productImage, count: 0 };
    topicMap[pid].count++;
  });
  const topics = Object.values(topicMap);
  const allCount = messages.length;

  const filteredMessages = selectedTopic === 'all' ? messages
    : messages.filter(m => (m.productId || '_general') === selectedTopic);

  const selectedShopData = shops.find(sc => sc.shopId === selectedShop);

  // ─ Empty state ─
  if (shops.length === 0) {
    return (
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '0 16px' }}>
        <h3 style={{ fontSize: 17, fontWeight: 700, color: C.t1, marginBottom: 4 }}>Сообщения</h3>
        <p style={{ fontSize: 13, color: C.t2, marginBottom: 20 }}>Ваши переписки с магазинами по товарам и заказам</p>
        <div style={{ background: '#fff', border: '1px solid ' + C.bd, borderRadius: 24, padding: '60px 32px', textAlign: 'center' }}>
          <div style={{ width: 48, height: 48, borderRadius: 16, background: '#f8fafc', border: '1px solid #eef2f7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#98a2b3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </div>
          <div style={{ fontWeight: 600, fontSize: 15, color: C.t1, marginBottom: 6 }}>У вас пока нет сообщений</div>
          <div style={{ fontSize: 13, color: C.t2, marginBottom: 20, lineHeight: 1.5 }}>Задайте вопрос на странице товара или магазина — переписка появится здесь.</div>
          <button onClick={() => s.setPage('catalog')} style={btnPri}>Перейти в каталог</button>
        </div>
      </div>
    );
  }

  return (
    <div className="conv-messenger" style={{
      background: '#fff',
      border: '1px solid ' + C.bd,
      borderRadius: 24,
      overflow: 'hidden',
      display: 'flex',
      height: 'clamp(620px, calc(100vh - 230px), 780px)',
      position: 'relative',
    }}>
      {/* ── Sidebar ── */}
      <div className="conv-sidebar" style={{
        width: selectedShop ? 332 : '100%',
        minWidth: selectedShop ? 332 : 0,
        maxWidth: selectedShop ? 360 : '100%',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        borderRight: selectedShop ? '1px solid ' + C.bd : 'none',
        transition: 'width 200ms, min-width 200ms',
      }}>
        {/* Sidebar header */}
        <div style={{ padding: '18px 20px', borderBottom: '1px solid ' + C.bd, flexShrink: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.t1, letterSpacing: '-0.01em' }}>Магазины</div>
          <div style={{ fontSize: 12, color: C.t3, marginTop: 2 }}>{shops.length} {shops.length === 1 ? 'переписка' : shops.length < 5 ? 'переписки' : 'переписок'}</div>
        </div>

        {/* Store list */}
        <div className="conv-store-list" style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain' }}>
          {shops.map(sc => (
            <button key={sc.shopId}
              className="conv-store-row"
              aria-current={selectedShop === sc.shopId ? 'true' : undefined}
              onClick={() => openShop(sc.shopId)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', width: '100%', textAlign: 'left',
                background: selectedShop === sc.shopId ? '#f7f8fa' : 'transparent',
                border: 'none', borderLeft: selectedShop === sc.shopId ? '3px solid ' + C.btn : '3px solid transparent',
                cursor: 'pointer', fontFamily: 'inherit', transition: 'background 150ms, border-color 150ms',
                outline: 'none',
              }}
              onMouseEnter={e => { if (selectedShop !== sc.shopId) e.currentTarget.style.background = '#fafbfc'; }}
              onMouseLeave={e => { if (selectedShop !== sc.shopId) e.currentTarget.style.background = 'transparent'; }}
              onFocus={e => { e.currentTarget.style.boxShadow = 'inset 0 0 0 2px ' + C.btn; }}
              onBlur={e => { e.currentTarget.style.boxShadow = 'none'; }}>
              {/* Avatar */}
              <div aria-hidden="true" style={{
                width: 44, height: 44, borderRadius: 14,
                background: '#f3f5f7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                fontSize: 17, fontWeight: 700, color: C.t1, letterSpacing: '-0.01em',
                overflow: 'hidden',
              }}>
                {sc.shopLogo ? (
                  <img src={sc.shopLogo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  (sc.shopName || '?')[0].toUpperCase()
                )}
              </div>
              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <div style={{ fontWeight: selectedShop === sc.shopId ? 700 : 600, fontSize: 13, color: C.t1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sc.shopName}</div>
                </div>
                <div style={{ fontSize: 12, color: C.t2, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.35 }}>{sc.lastPreview || 'Нет сообщений'}</div>
                <div style={{ fontSize: 11, color: C.t3, marginTop: 3 }}>{sc.topicCount} тем{sc.messageCount ? ` · ${sc.messageCount} сообщ.` : ''}</div>
              </div>
              {/* Chevron */}
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, color: '#d1d5db' }}><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          ))}
        </div>

        {/* Pagination footer */}
        {convTotalPages > 1 && (
          <div className="conv-sidebar-pagination" style={{ padding: '12px 20px', borderTop: '1px solid ' + C.bd, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            <button disabled={convPage <= 1} onClick={() => s.loadMyAppeals(convPage - 1)} aria-label="Предыдущая страница"
              style={{ width: 32, height: 32, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: convPage <= 1 ? 'default' : 'pointer', border: '1px solid ' + C.bd, background: '#fff', color: convPage <= 1 ? '#d1d5db' : C.t1, opacity: convPage <= 1 ? 0.4 : 1, fontFamily: 'inherit', fontSize: 13 }}>
              ←
            </button>
            <span style={{ fontSize: 12, color: C.t2, fontVariantNumeric: 'tabular-nums' }}>{convPage} из {convTotalPages}</span>
            <button disabled={convPage >= convTotalPages} onClick={() => s.loadMyAppeals(convPage + 1)} aria-label="Следующая страница"
              style={{ width: 32, height: 32, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: convPage >= convTotalPages ? 'default' : 'pointer', border: '1px solid ' + C.bd, background: '#fff', color: convPage >= convTotalPages ? '#d1d5db' : C.t1, opacity: convPage >= convTotalPages ? 0.4 : 1, fontFamily: 'inherit', fontSize: 13 }}>
              →
            </button>
          </div>
        )}
      </div>

      {/* ── Right chat panel ── */}
      <div className={'conv-chat-panel' + (selectedShop && selectedShopData ? ' conv-chat-active' : '')} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }} aria-label="История сообщений">
        {selectedShop && selectedShopData ? (
          <>
            {/* Chat header */}
            <div className="conv-chat-header" style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px',
              borderBottom: '1px solid ' + C.bd, flexShrink: 0, background: '#fff', position: 'sticky', top: 0, zIndex: 10, minHeight: 60,
            }}>
              <button onClick={closeShop} aria-label="Назад к списку магазинов"
                className="conv-back-btn"
                style={{ width: 44, height: 44, borderRadius: 14, display: 'none', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: '1px solid ' + C.bd, background: '#fff', color: C.t2, fontSize: 16, flexShrink: 0, fontFamily: 'inherit', padding: 0 }}>
                ←
              </button>
              <div aria-hidden="true" style={{
                width: 38, height: 38, borderRadius: 13, background: '#f3f5f7',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                fontSize: 15, fontWeight: 700, color: C.t1, overflow: 'hidden',
              }}>
                {selectedShopData.shopLogo ? (
                  <img src={selectedShopData.shopLogo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (selectedShopData.shopName || '?')[0].toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: C.t1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedShopData.shopName}</div>
                <div style={{ fontSize: 11, color: C.t3, marginTop: 1 }}>{allCount} сообщ. · {topics.length} тем</div>
              </div>
              {selectedShopData.shopSlug && (
                <button onClick={() => { s.loadShop(selectedShopData.shopSlug); s.setPage('shop'); }}
                  style={{ padding: '6px 15px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid ' + C.bd, background: '#fff', color: '#475467', whiteSpace: 'nowrap', flexShrink: 0, fontFamily: 'inherit' }}>
                  Магазин
                </button>
              )}
            </div>

            {/* Topic bar */}
            {allCount > 0 && (
              <div className="conv-topic-bar" style={{
                display: 'flex', gap: 8, padding: '10px 20px', borderBottom: '1px solid ' + C.bd,
                flexShrink: 0, overflowX: 'auto', whiteSpace: 'nowrap', background: '#fff', position: 'sticky', top: 60, zIndex: 9,
                scrollbarWidth: 'none',
              }}>
                <button onClick={() => setSelectedTopic('all')} aria-selected={selectedTopic === 'all'}
                  style={{
                    height: 32, padding: '0 12px', borderRadius: 999, fontSize: 12, fontWeight: selectedTopic === 'all' ? 600 : 400,
                    cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, fontFamily: 'inherit', transition: 'all 150ms',
                    border: selectedTopic === 'all' ? '1px solid ' + C.btn : '1px solid ' + C.bd,
                    background: selectedTopic === 'all' ? C.btn : '#fff',
                    color: selectedTopic === 'all' ? '#fff' : C.t2,
                  }}>
                  Все · {allCount}
                </button>
                {topics.map(t => (
                  <button key={t.productId || '_general'} onClick={() => setSelectedTopic(t.productId || '_general')}
                    aria-selected={selectedTopic === (t.productId || '_general')}
                    style={{
                      height: 32, padding: '0 12px', borderRadius: 999, fontSize: 12,
                      fontWeight: selectedTopic === (t.productId || '_general') ? 600 : 400,
                      cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, fontFamily: 'inherit',
                      transition: 'all 150ms', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis',
                      border: selectedTopic === (t.productId || '_general') ? '1px solid ' + C.btn : '1px solid ' + C.bd,
                      background: selectedTopic === (t.productId || '_general') ? C.btn : '#fff',
                      color: selectedTopic === (t.productId || '_general') ? '#fff' : C.t2,
                    }}>
                    {t.productName || 'Общий вопрос'} · {t.count}
                  </button>
                ))}
              </div>
            )}

            {/* Messages area */}
            <div className="conv-messages" style={{ flex: 1, overflowY: 'auto', background: '#f8f9fb', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {loadingChat ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '0 8px' }}>
                  {[1,2,3].map(i => (
                    <div key={i} style={{ display: 'flex', justifyContent: i % 2 === 0 ? 'flex-end' : 'flex-start' }}>
                      <div style={{
                        width: i % 2 === 0 ? '55%' : '48%', height: i === 2 ? 52 : 40,
                        borderRadius: 18, background: i % 2 === 0 ? '#e5e7eb' : '#eef0f3',
                        animation: 'conv-pulse 1.5s ease-in-out infinite',
                      }} />
                    </div>
                  ))}
                </div>
              ) : filteredMessages.length === 0 ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ textAlign: 'center', color: C.t3 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.t2, marginBottom: 4 }}>Нет сообщений по теме</div>
                    <div style={{ fontSize: 12 }}>Выберите «Все» чтобы увидеть весь диалог</div>
                  </div>
                </div>
              ) : (
                filteredMessages.map((m, i) => {
                  const prevSame = i > 0 && filteredMessages[i - 1].productId === m.productId;
                  const prevDate = i > 0 ? fmtDateDay(filteredMessages[i - 1].createdAt) : '';
                  const curDate = fmtDateDay(m.createdAt);
                  const showDate = i === 0 || (curDate && curDate !== prevDate);

                  return (
                    <div key={m.id}>
                      {/* Date separator */}
                      {showDate && curDate && (
                        <div style={{ display: 'flex', justifyContent: 'center', margin: '14px 0 8px' }}>
                          <span style={{ fontSize: 11, color: C.t3, background: '#f0f1f4', borderRadius: 999, padding: '3px 12px', fontWeight: 500 }}>{curDate}</span>
                        </div>
                      )}

                      {/* Product divider */}
                      {!prevSame && m.productId && m.productName && (
                        <ProductDivider message={m} s={s} C={C} />
                      )}

                      {/* General topic divider */}
                      {!prevSame && !m.productId && i > 0 && (() => {
                        const prev = filteredMessages[i - 1];
                        if (prev.productId) return <GeneralTopicDivider C={C} />;
                        return null;
                      })()}

                      {/* Message bubble */}
                      <MessageBubble message={m} C={C} s={s} />
                    </div>
                  );
                })
              )}
              <div style={{ height: 4, flexShrink: 0 }} ref={el => { if (el) { setTimeout(() => el.scrollIntoView?.({ behavior: 'smooth' }), 50); } }} />
            </div>

            {/* Read-only footer */}
            <div className="conv-readonly-footer" style={{ padding: '11px 20px', borderTop: '1px solid ' + C.bd, background: '#fff', flexShrink: 0, textAlign: 'center' }}>
              <span style={{ fontSize: 11, color: C.t3 }}>История обращений доступна только для просмотра</span>
            </div>
          </>
        ) : (
          /* No shop selected placeholder */
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, padding: 40, color: C.t3, background: '#f8f9fb' }}>
            <div style={{ width: 52, height: 52, borderRadius: 18, background: '#fff', border: '1px solid ' + C.bd, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#98a2b3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </div>
            <div style={{ fontWeight: 600, fontSize: 15, color: C.t2 }}>Выберите магазин</div>
            <div style={{ fontSize: 13, textAlign: 'center', maxWidth: 280, lineHeight: 1.5 }}>Здесь появится история ваших обращений и ответов</div>
          </div>
        )}
      </div>

      {/* Mobile back button (arrows-only for narrow screens via Media) */}
      <style>{`
        .conv-back-btn { display: none !important; }
        @media (max-width: 680px) {
          .conv-messenger { border-radius: 16px !important; }
          .conv-sidebar { width: 100% !important; max-width: 100% !important; min-width: 100% !important; border-right: none !important; }
          .conv-chat-panel.conv-chat-active { position: fixed; inset: 0; z-index: 100; background: #fff; }
          .conv-chat-header { padding-left: 16px !important; padding-right: 16px !important; }
          .conv-topic-bar { padding-left: 16px !important; padding-right: 16px !important; }
          .conv-messages { padding: 16px 12px !important; }
          .conv-readonly-footer { padding-left: 16px !important; padding-right: 16px !important; }
          .conv-back-btn { display: flex !important; }
        }
        @keyframes conv-pulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 0.8; }
        }
        .conv-store-list::-webkit-scrollbar { width: 5px; }
        .conv-store-list::-webkit-scrollbar-thumb { background: #e0e3e8; border-radius: 10px; }
        .conv-messages::-webkit-scrollbar { width: 5px; }
        .conv-messages::-webkit-scrollbar-thumb { background: #d5d9de; border-radius: 10px; }
        .conv-topic-bar::-webkit-scrollbar { height: 0; }
      `}</style>
    </div>
  );
}

// ── Message bubble ──
function MessageBubble({ message: m, C, s }) {
  const isClient = m.senderType === 'client';
  const isAI = m.senderType === 'ai' || m.senderType === 'ai_manager';
  const isShop = m.senderType === 'shop' || m.senderType === 'business';
  const isUnknown = !isClient && !isAI && !isShop;

  // Unknown sender → event
  if (isUnknown) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div style={{
          maxWidth: '70%', background: 'transparent', border: '1px dashed ' + C.bd,
          borderRadius: 16, padding: '10px 14px', fontSize: 13, lineHeight: 1.45, color: C.t2,
        }}>
          <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.text}</div>
          <div style={{ fontSize: 10, marginTop: 4, color: C.t3, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span>Событие</span>
            <span>{m.createdAt ? fmtMsgTime(m.createdAt) : ''}</span>
          </div>
        </div>
      </div>
    );
  }

  const isRight = isClient;

  return (
    <div style={{ display: 'flex', justifyContent: isRight ? 'flex-end' : 'flex-start' }}>
      <div style={{
        maxWidth: '66%', minWidth: 0, wordBreak: 'break-word',
        background: isRight ? '#050505' : '#fff',
        color: isRight ? '#fff' : C.t1,
        borderRadius: isRight ? '18px 18px 6px 18px' : '18px 18px 18px 6px',
        border: isRight ? 'none' : '1px solid ' + C.bd,
        padding: '11px 15px', fontSize: 13, lineHeight: 1.45,
        boxShadow: isRight ? 'none' : '0 1px 2px rgba(0,0,0,0.03)',
      }}>
        {/* Sender label for shop/AI */}
        {!isRight && (
          <div style={{ fontSize: 11, fontWeight: 600, color: C.t2, marginBottom: 3 }}>
            {isAI ? 'AI-менеджер' : 'Магазин'}
          </div>
        )}
        <div style={{ whiteSpace: 'pre-wrap' }}>{m.text}</div>
        <div style={{
          fontSize: 10, marginTop: 4, opacity: isRight ? 0.55 : 0.5,
          display: 'flex', justifyContent: 'space-between', gap: 8,
        }}>
          <span>{isRight ? 'Вы' : (isAI ? 'AI' : '')}</span>
          <span>{m.createdAt ? fmtMsgTime(m.createdAt) : ''}</span>
        </div>
      </div>
    </div>
  );
}

// ── Product divider ──
function ProductDivider({ message: m, s, C }) {
  const imgSrc = m.productImage || '';
  const [imgOk, setImgOk] = useState(true);
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, margin: '10px 0 6px',
      background: 'rgba(248,249,251,0.8)', borderRadius: 14, padding: '8px 14px', height: 44,
    }}>
      <div style={{
        width: 30, height: 30, borderRadius: 10, background: '#eef1f5', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
      }}>
        {imgSrc && imgOk ? (
          <img src={imgSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={() => setImgOk(false)} />
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#98a2b3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
        )}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: C.t1, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {m.productName}
      </div>
      {m.productId && (
        <button onClick={() => { s.loadProduct(m.productId); s.setPage('product'); }}
          style={{ padding: '4px 12px', borderRadius: 999, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: '1px solid ' + C.bd, background: '#fff', color: C.t2, whiteSpace: 'nowrap', flexShrink: 0, fontFamily: 'inherit' }}>
          Открыть
        </button>
      )}
    </div>
  );
}

// ── General topic divider ──
function GeneralTopicDivider({ C }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0 6px' }}>
      <div style={{ flex: 1, height: 1, background: C.bd }} />
      <span style={{ fontSize: 11, color: C.t3, fontWeight: 500, whiteSpace: 'nowrap' }}>Общий вопрос</span>
      <div style={{ flex: 1, height: 1, background: C.bd }} />
    </div>
  );
}

// ── Helpers ──
function fmtMsgTime(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    return h + ':' + m;
  } catch { return ''; }
}

function fmtDateDay(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diff = (today - target) / 86400000;
    if (diff === 0) return 'Сегодня';
    if (diff === 1) return 'Вчера';
    if (diff < 7) return d.toLocaleDateString('ru', { weekday: 'long' });
    if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString('ru', { day: 'numeric', month: 'long' });
    return d.toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch { return ''; }
}

// ─── Profile Section ───
function ProfileSection({ user, s, C }) {
  const [name, setName] = useState(user?.firstName || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [city, setCity] = useState(user?.deliveryCity || '');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const save = async () => {
    setSaving(true); setDone(false);
    try {
      await s.updateProfile({ firstName: name, phone, deliveryCity: city });
      setDone(true);
    } catch {} finally { setSaving(false); }
  };

  return (
    <>
      <h3 style={{ fontSize:17, fontWeight:700, color:C.t1, marginBottom:14 }}>Профиль</h3>
      <p style={{ fontSize:13, color:C.t2, marginTop: -10, marginBottom: 16 }}>Личные данные</p>
      <div style={{ background:C.bg, border:'1px solid '+C.bd, borderRadius:18, padding:24, maxWidth:500 }}>
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div>
            <div style={{ fontSize:12, fontWeight:600, color:C.t3, marginBottom:4 }}>Email</div>
            <div style={{ fontSize:14, color:C.t1 }}>{user?.email}</div>
          </div>
          <div>
            <div style={{ fontSize:12, fontWeight:600, color:C.t3, marginBottom:4 }}>Имя</div>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Ваше имя" style={{ padding:'8px 14px', border:'1px solid #e5e7eb', borderRadius:14, fontSize:14, width:'100%', boxSizing:'border-box', outline:'none' }} />
          </div>
          <div>
            <div style={{ fontSize:12, fontWeight:600, color:C.t3, marginBottom:4 }}>Телефон</div>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+7 ..." style={{ padding:'8px 14px', border:'1px solid #e5e7eb', borderRadius:14, fontSize:14, width:'100%', boxSizing:'border-box', outline:'none' }} />
          </div>
          <div>
            <div style={{ fontSize:12, fontWeight:600, color:C.t3, marginBottom:4 }}>Город доставки</div>
            <input value={city} onChange={e => setCity(e.target.value)} placeholder="Ваш город" style={{ padding:'8px 14px', border:'1px solid #e5e7eb', borderRadius:14, fontSize:14, width:'100%', boxSizing:'border-box', outline:'none' }} />
          </div>
          <button onClick={save} disabled={saving} style={{ padding:'10px 24px', background:C.btn, color:'#fff', borderRadius:999, fontSize:14, fontWeight:600, cursor:'pointer', border:'none', opacity: saving?.7:1 }}>{saving ? 'Сохранение...' : done ? 'Сохранено' : 'Сохранить'}</button>
        </div>
        <div style={{ marginTop:24, paddingTop:16, borderTop:'1px solid '+C.bd }}>
          <button onClick={() => s.logout()} style={{ ...btnOut, width:'100%', background:'#fef2f2', color:'#991b1b', borderColor:'#fecaca' }}>Выйти из аккаунта</button>
        </div>
      </div>
    </>
  );
}

// ─── AI Manager Dialogs Section ───
function DialogsSection({ dialogs, s, C }) {
  const [selected, setSelected] = useState(null);

  if (selected) {
    return <DialogDetail dialog={selected} s={s} C={C} onBack={() => setSelected(null)} />;
  }

  if (dialogs.length === 0) {
    return (
      <div style={emptyCard}>
        <div style={{ fontWeight:600, color:C.t1, marginBottom:4 }}>Диалогов пока нет</div>
        <div style={{ fontSize:13, color:C.t2, marginBottom:14 }}>Начните диалог с AI-менеджером на странице товара или магазина.</div>
        <button onClick={() => s.setPage('catalog')} style={btnPri}>Перейти в каталог</button>
      </div>
    );
  }

  return (
    <>
      <h3 style={{ fontSize:17, fontWeight:700, color:C.t1, marginBottom:14 }}>Диалоги с AI-менеджерами</h3>
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {dialogs.map(d => (
          <div key={d.id} style={{ background:C.bg, border:'1px solid '+C.bd, borderRadius:18, padding:16, cursor:'pointer' }} onClick={() => setSelected(d)}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:10, flexWrap:'wrap' }}>
              <div>
                <div style={{ fontWeight:700, fontSize:14, color:C.t1 }}>{d.shopName || 'Магазин'}</div>
                <div style={{ fontSize:12, color:C.t2, marginTop:2 }}>{d.productName || 'Диалог с магазином'}</div>
                <div style={{ fontSize:12, color:C.t3, marginTop:6, lineHeight:1.4 }}>{d.lastMessage || 'Нет сообщений'}</div>
              </div>
              <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4 }}>
                <StatusBadge variant="muted" size="sm">{dialogStatusLabel(d.status)}</StatusBadge>
                {d.lastActor && <span style={{ fontSize:11, color:C.t3 }}>Последнее: {actorLabel(d.lastActor)}</span>}
              </div>
            </div>
            {d.leadId && <div style={{ marginTop:8, fontSize:11, color:'#065f46', fontWeight:600 }}>Заявка создана</div>}
          </div>
        ))}
      </div>
    </>
  );
}

function DialogDetail({ dialog, s, C, onBack }) {
  const [showChat, setShowChat] = useState(false);

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
        <button onClick={onBack} style={{ ...btnSec, padding:'6px 14px' }}>← Назад</button>
        <h3 style={{ fontSize:17, fontWeight:700, color:C.t1, margin:0 }}>Диалог в {dialog.shopName || 'магазине'}</h3>
      </div>
      <div style={{ background:C.bg, border:'1px solid '+C.bd, borderRadius:18, padding:16, marginBottom:16 }}>
        <div style={{ fontSize:13, color:C.t2, marginBottom:4 }}>Статус: <strong style={{ color:C.t1 }}>{dialogStatusLabel(dialog.status)}</strong></div>
        <div style={{ fontSize:13, color:C.t2, marginBottom:4 }}>Товар: {dialog.productName || '—'}</div>
        <div style={{ fontSize:12, color:C.t3 }}>Последнее сообщение: {dialog.lastMessage || '—'}</div>
        {dialog.leadId && <div style={{ marginTop:10, fontSize:12, color:'#065f46', fontWeight:600 }}>Заявка создана и передана продавцу</div>}
      </div>
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:16 }}>
        {dialog.productId && <button onClick={() => { s.loadProduct(dialog.productId); s.setPage('product'); }} style={btnPriSm}>Открыть товар</button>}
        <button onClick={() => { s.loadShop(dialog.shopSlug); s.setPage('shop'); }} style={btnSecSm}>Открыть магазин</button>
        {!dialog.leadId && <button onClick={() => { s.createAIManagerLead(dialog.id); s.showToast('Заявка создана'); }} style={btnSecSm}>Создать заявку</button>}
        <button onClick={() => setShowChat(true)} style={btnPriSm}>Продолжить диалог</button>
      </div>
      {showChat && (
        <AIManagerChat shopSlug={dialog.shopSlug} productId={dialog.productId} dialogId={dialog.id} source="dialog_history" inline={false} onClose={() => setShowChat(false)} />
      )}
    </div>
  );
}

function dialogStatusLabel(status) {
  const m = { open:'Открыт', waiting_client:'Ждёт клиента', waiting_seller:'Ждёт продавца', lead_created:'Заявка создана', taken_over:'Передан продавцу', closed:'Закрыт' };
  return m[status] || status;
}

function actorLabel(actor) {
  const m = { client:'Вы', ai_manager:'AI-менеджер', business:'Продавец', system:'Система' };
  return m[actor] || actor;
}

// ─── Leads Section ───
function LeadsSection({ leads, s, C }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const waiting = leads.filter(l => ['new','in_progress'].includes(l.status)).length;
  const answered = leads.filter(l => ['contacted','deal'].includes(l.status)).length;
  const closed = leads.filter(l => ['rejected','cancelled'].includes(l.status)).length;

  const filtered = leads.filter(l => {
    if (statusFilter !== 'all' && normalizeFilterStatus(l.status) !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const name = (l.productName || '').toLowerCase();
      const shop = (l.shopName || '').toLowerCase();
      if (!name.includes(q) && !shop.includes(q)) return false;
    }
    return true;
  });

  const resetFilters = () => { setSearch(''); setStatusFilter('all'); };

  const filters = [
    { value:'all', label:'Все', count:leads.length },
    { value:'waiting', label:'Ожидают', count:waiting },
    { value:'answered', label:'С ответом', count:answered },
    { value:'closed', label:'Закрытые', count:closed },
  ];

  return (
    <>
      <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', flexWrap:'wrap', gap:12, marginBottom:14 }}>
        <div>
          <h3 style={{ fontSize:17, fontWeight:700, color:C.t1, marginBottom:2 }}>Мои заявки</h3>
          <p style={{ fontSize:12, color:C.t3 }}>Здесь собраны вопросы и обращения, отправленные продавцам</p>
        </div>
      </div>

      {/* Stats */}
      {leads.length > 0 && (
        <div style={{ display:'flex', gap:10, marginBottom:14, flexWrap:'wrap' }}>
          {filters.map(f => (
            <button key={f.value} onClick={() => setStatusFilter(f.value)} style={{
              ...(statusFilter === f.value ? statsChipActive : statsChip),
            }}>
              {f.label} <span style={{ fontWeight:400, opacity:0.7, marginLeft:3 }}>{f.count}</span>
            </button>
          ))}
        </div>
      )}

      {/* Search */}
      {leads.length > 0 && (
        <div style={{ marginBottom:14, display:'flex', gap:10 }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Поиск по товару или магазину"
            style={searchInput}
          />
          {search && (
            <button onClick={() => setSearch('')} style={btnSearchClear}>Сбросить</button>
          )}
        </div>
      )}

      {/* No leads at all */}
      {leads.length === 0 && (
        <div style={emptyCard}>
          <div style={{ fontWeight:600, color:C.t1, marginBottom:4 }}>Заявок пока нет</div>
          <div style={{ fontSize:13, color:C.t2, marginBottom:14, maxWidth:380, marginLeft:'auto', marginRight:'auto' }}>
            Когда вы зададите вопрос продавцу или отправите обращение через AI-ассистента, оно появится здесь.
          </div>
          <div style={{ display:'flex', gap:8, justifyContent:'center', flexWrap:'wrap' }}>
            <button onClick={() => s.setPage('catalog')} style={btnPri}>Открыть каталог</button>
            <button onClick={() => s.setPage('assistant')} style={btnSec}>Открыть AI-ассистент</button>
          </div>
        </div>
      )}

      {/* No results for filter */}
      {leads.length > 0 && filtered.length === 0 && (
        <div style={emptyCard}>
          <div style={{ fontWeight:600, color:C.t1, marginBottom:4 }}>По выбранным фильтрам заявок нет</div>
          <div style={{ fontSize:13, color:C.t2, marginBottom:14 }}>Попробуйте изменить параметры поиска.</div>
          <button onClick={resetFilters} style={btnSec}>Сбросить фильтры</button>
        </div>
      )}

      {/* Lead cards */}
      {filtered.length > 0 && (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {filtered.map(l => <LeadCard key={l.id} l={l} s={s} C={C} />)}
        </div>
      )}
    </>
  );
}

// ─── Lead Card ───
function LeadCard({ l, s, C }) {
  const [open, setOpen] = useState(false);
  const images = parseLeadImages(l.productImages);
  const mainImage = images[0] || '';
  const hasProduct = !!l.productId;
  const hasShop = !!l.shopSlug;
  const displayName = shopDisplayName(l.shopName);

  return (
    <div style={{ background:C.bg, border:'1px solid '+C.bd, borderRadius:20, padding:18, transition:'border .15s' }}
      onMouseEnter={e => e.currentTarget.style.borderColor = '#d0d5dd'}
      onMouseLeave={e => e.currentTarget.style.borderColor = C.bd}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12, marginBottom:10, flexWrap:'wrap' }}>
        {/* Product preview */}
        <div style={{ display:'flex', gap:10, alignItems:'center', minWidth:0, flex:1 }}>
          <LeadProductImage productImage={mainImage} productName={l.productName} />
          <div style={{ minWidth:0 }}>
            <div style={{ fontWeight:700, fontSize:14, color:C.t1, lineHeight:1.25, display:'-webkit-box', WebkitLineClamp:1, WebkitBoxOrient:'vertical', overflow:'hidden' }}>
              {l.productName || 'Заявка в магазин'}
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:2, flexWrap:'wrap' }}>
              {displayName && <span style={{ fontSize:12, color:C.t3 }}>{displayName}</span>}
              {l.productPrice > 0 && <span style={{ fontSize:12, fontWeight:600, color:C.t2 }}>{formatPrice(l.productPrice)}</span>}
            </div>
          </div>
        </div>
        {/* Status + date */}
        <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4 }}>
          <div style={{ display:'flex', gap:6, alignItems:'center' }}>
            {l.source && <span style={{ fontSize:10, fontWeight:500, color:C.t3, background:'#f8fafc', border:'1px solid '+C.bd, padding:'1px 7px', borderRadius:999 }}>{sourceLabel(l.source)}</span>}
            <StatusBadge variant={leadStatusVariant(l.status)} size="sm">{leadStatusLabel(l.status)}</StatusBadge>
          </div>
          {l.createdAt && <span style={{ fontSize:11, color:C.t3 }}>{fmtDate(l.createdAt)}</span>}
        </div>
      </div>

      {/* Timeline */}
      <div style={{ display:'flex', gap:4, marginBottom:10, alignItems:'center' }}>
        {leadTimeline(l).map((step, i) => (
          <div key={i} style={{ flex:1, display:'flex', alignItems:'center', gap:4 }}>
            {i > 0 && <div style={{ flex:1, height:1, background: step.done ? '#d0d5dd' : '#eef2f7', minWidth:12 }} />}
            <div style={{ width:16, height:16, borderRadius:'50%', background:step.active ? '#0b0f19' : step.done ? '#d0d5dd' : '#eef2f7', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
              {step.done && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:10, fontSize:10, color:C.t3 }}>
        {leadTimeline(l).map((s, i) => <span key={i} style={{ fontWeight: s.active ? 600 : 400, color: s.active ? C.t1 : C.t3 }}>{s.label}</span>)}
      </div>

      {/* Message preview (collapsed) */}
      {!open && l.message && (
        <div style={{ fontSize:12, color:'#475467', lineHeight:1.5, background:'#f8fafc', padding:'8px 12px', borderRadius:12, marginBottom:8, display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>
          {l.message}
        </div>
      )}

      {/* Expand toggle */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
        <button onClick={() => setOpen(!open)} style={btnDet}>
          {open ? 'Скрыть детали' : 'Подробнее'}
          <span style={{ marginLeft:4, transition:'transform 200ms', display:'inline-block', transform:open?'rotate(180deg)':'rotate(0deg)' }}>▾</span>
        </button>
        <div style={{ display:'flex', gap:6, flex:1, justifyContent:'flex-end', flexWrap:'wrap' }}>
          {hasProduct && <button onClick={() => { s.loadProduct(l.productId); s.setPage('product'); }} style={btnPriSm}>Открыть товар</button>}
          {hasShop && <button onClick={() => { s.loadShop(l.shopSlug); s.setPage('shop'); }} style={btnSecSm}>Открыть магазин</button>}
          <button onClick={() => s.setPage('assistant')} style={btnGhostSm}>AI-ассистент</button>
          <button onClick={() => s.setPage('catalog')} style={btnGhostSm}>Каталог</button>
        </div>
      </div>

      {/* Expanded details */}
      {open && (
        <div style={{ marginTop:14, paddingTop:14, borderTop:'1px solid #eef2f7' }}>
          {/* Question */}
          {l.message && (
            <div style={{ marginBottom:10 }}>
              <div style={{ fontSize:10, fontWeight:600, color:C.t3, marginBottom:6, letterSpacing:'0.03em' }}>Ваш вопрос</div>
              <div style={{ fontSize:12, color:'#475467', lineHeight:1.6, background:'#f8fafc', padding:'10px 14px', borderRadius:12 }}>{l.message}</div>
            </div>
          )}

          {/* Seller/system response */}
          {l.aiReply ? (
            <div style={{ marginBottom:10 }}>
              <div style={{ fontSize:10, fontWeight:600, color:C.t3, marginBottom:6, letterSpacing:'0.03em' }}>Статус обращения</div>
              <div style={{ fontSize:12, color:'#475467', lineHeight:1.6, background:'#fff', padding:'10px 14px', borderRadius:12, border:'1px solid '+C.bd }}>{l.aiReply}</div>
            </div>
          ) : (
            <div style={{ marginBottom:10, padding:'10px 14px', background:'#f8fafc', borderRadius:12, fontSize:12, color:C.t3, textAlign:'center' }}>
              Продавец ещё не ответил. Когда появится ответ, он будет отображён здесь.
            </div>
          )}

          {/* Meta */}
          <div style={{ display:'flex', gap:12, flexWrap:'wrap', fontSize:11, color:C.t3, marginBottom:10 }}>
            {l.customerNeed && <span>Цель: {l.customerNeed}</span>}
            {l.deliveryCity && <span>Город: {l.deliveryCity}</span>}
            {l.contactPreference && <span>Связь: {l.contactPreference === 'phone' ? 'Телефон' : l.contactPreference === 'email' ? 'Email' : l.contactPreference === 'whatsapp' ? 'WhatsApp' : l.contactPreference}</span>}
          </div>

          {/* Extra actions */}
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            {hasProduct && <button onClick={() => { s.loadProduct(l.productId); s.setPage('product'); }} style={btnPriSm}>Открыть товар</button>}
            {hasShop && <button onClick={() => { s.loadShop(l.shopSlug); s.setPage('shop'); }} style={btnSecSm}>Открыть магазин</button>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Image component ───
function LeadProductImage({ productImage, productName }) {
  const [failed, setFailed] = useState(false);
  const src = productImage || '';
  if (!src || failed) {
    return (
      <div style={{ width:64, height:64, borderRadius:14, background:'#f8fafc', border:'1px solid #eef2f7', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
        <AgentIcon name="box" size={22} muted />
      </div>
    );
  }
  return (
    <img src={src} alt={productName || ''} onError={() => setFailed(true)} loading="lazy"
      style={{ width:64, height:64, borderRadius:14, objectFit:'contain', padding:5, background:'#f8fafc', border:'1px solid #eef2f7', flexShrink:0 }} />
  );
}

// ─── Helpers ───
function parseLeadImages(raw) {
  if (!raw) return [];
  try { const arr = JSON.parse(raw); return Array.isArray(arr) ? arr : []; } catch { return []; }
}

function leadStatusLabel(s) {
  const m = { new:'Новая', sent:'Отправлена', created:'Создана', in_progress:'В работе', contacted:'Есть ответ', answered:'Есть ответ', replied:'Есть ответ', deal:'Сделка', closed:'Завершена', completed:'Завершена', cancelled:'Закрыта', rejected:'Закрыта' };
  return m[s] || 'Статус уточняется';
}

function leadStatusVariant(s) {
  if (s === 'deal' || s === 'contacted' || s === 'answered' || s === 'replied') return 'success';
  if (s === 'closed' || s === 'completed' || s === 'cancelled' || s === 'rejected') return 'muted';
  return 'neutral';
}

function normalizeFilterStatus(s) {
  if (['new','sent','created','in_progress'].includes(s)) return 'waiting';
  if (['contacted','answered','replied','deal'].includes(s)) return 'answered';
  if (['closed','completed','cancelled','rejected'].includes(s)) return 'closed';
  return 'waiting';
}

function leadTimeline(l) {
  const s = l.status;
  const steps = [
    { key:'created', label:'Создана' },
    { key:'processing', label:'В работе' },
    { key:'answered', label:'Ответ' },
    { key:'closed', label:'Завершена' },
  ];
  let idx = 1;
  if (['in_progress'].includes(s)) idx = 2;
  else if (['contacted','answered','replied'].includes(s)) idx = 3;
  else if (['closed','completed'].includes(s)) idx = 4;
  else if (['cancelled','rejected'].includes(s)) idx = 0;
  return steps.map((step, i) => ({
    label: step.label,
    active: i === idx - 1,
    done: i < idx - 1,
  }));
}

function sourceLabel(s) {
  const m = { assistant:'AI-ассистент', product_contact:'Карточка товара', shop_contact:'Магазин', copilot:'Продавец' };
  return m[s] || s || 'AGENT.ONE';
}

function shopDisplayName(name) {
  if (!name) return '';
  const n = name.toLowerCase();
  if (n.includes('техномаркет') || n.includes('technomarket')) return 'ТехноМаркет';
  if (n.includes('gamepower')) return 'GamePower';
  if (n.includes('smartspace')) return 'SmartSpace';
  return name;
}

function fmtDate(d) {
  try { return new Date(d).toLocaleDateString('ru-RU'); } catch { return ''; }
}

// ─── Order section (unchanged core) ───
function ItemImg({ item }) {
  const [failed, setFailed] = useState(false);
  const src = getProductMainImage(item);
  if (!src || failed) return <AgentIcon name="box" size={20} muted />;
  return <img src={src} style={{ width:'100%', height:'100%', objectFit:'contain', padding:4 }} alt="" onError={() => setFailed(true)} />;
}

function OrderCard({ o, s }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={orderCard}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:8 }}>
        <div>
          <div style={{ fontWeight:700, fontSize:15, color:C.t1 }}>Заказ #{o.id?.slice(0,8)}</div>
          {o.createdAt && <div style={{ fontSize:11, color:C.t3, marginTop:2 }}>{fmtDate(o.createdAt)}</div>}
          {o.shopName && <div style={{ fontSize:12, color:C.t2, marginTop:2 }}>{o.shopName}</div>}
        </div>
        <div style={{ fontSize:18, fontWeight:800, color:C.t1 }}>{formatPrice(o.totalAmount)}</div>
      </div>
      <div style={{ display:'flex', gap:6, marginTop:10, flexWrap:'wrap', alignItems:'center' }}>
        <StatusBadge variant={orderStatusVariant(o.orderStatus)} size="sm">{statusLabel(o.orderStatus)}</StatusBadge>
        <span style={chipMeta}>{payLabel(o.paymentMethod)}</span>
        <span style={chipMeta}>{delivLabel(o.deliveryMethod)}</span>
        {o.items?.length > 0 && <span style={chipMeta}>{o.items.length} {itemWord(o.items.length)}</span>}
      </div>
      {o.items?.length > 0 && (
        <div style={{ display:'flex', gap:8, marginTop:10, flexWrap:'wrap' }}>
          {o.items.slice(0, 2).map(item => (
            <div key={item.id} onClick={(e) => { if (item.productId) { e.stopPropagation(); s.loadProduct(item.productId); s.setPage('product'); } }}
              style={{ display:'flex', alignItems:'center', gap:10, background:'#fff', borderRadius:14, padding:10, border:'1px solid #e5e7eb', cursor: item.productId ? 'pointer' : 'default', maxWidth:360, minWidth:200, transition:'border-color 150ms' }}
              onMouseEnter={e => item.productId && (e.currentTarget.style.borderColor = '#d0d5dd')}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; }}
            >
              <div style={{ width:52, height:52, borderRadius:12, background:'#f8fafc', border:'1px solid #eef2f7', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, overflow:'hidden' }}>
                <ItemImg item={item} />
              </div>
              <div style={{ minWidth:0, flex:1 }}>
                <div style={{ fontSize:12, fontWeight:700, color:C.t1, lineHeight:1.3, display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>{item.productName || 'Товар'}</div>
                <div style={{ display:'flex', gap:6, alignItems:'baseline', marginTop:3 }}>
                  <span style={{ fontSize:13, fontWeight:800, color:C.t1 }}>{formatPrice(item.price)}</span>
                  <span style={{ fontSize:11, color:C.t3 }}>· {item.quantity || 1} шт.</span>
                </div>
              </div>
            </div>
          ))}
          {o.items.length > 2 && <span style={{ fontSize:11, fontWeight:600, color:C.t2, background:'#f8fafc', border:'1px solid #e5e7eb', borderRadius:999, padding:'4px 10px', alignSelf:'center' }}>+{o.items.length - 2} ещё</span>}
        </div>
      )}
      <div style={{ marginTop:12 }}>
        <button onClick={() => setOpen(!open)} style={btnDet}>
          {open ? 'Скрыть детали' : 'Детали заказа'}
          <span style={{ marginLeft:4, transition:'transform 200ms', display:'inline-block', transform:open?'rotate(180deg)':'rotate(0deg)' }}>▾</span>
        </button>
      </div>
      {open && (
        <div style={{ marginTop:14, paddingTop:14, borderTop:'1px solid #eef2f7' }}>
          <div style={{ display:'grid', gridTemplateColumns:'minmax(0,1fr) 300px', gap:20, alignItems:'start' }}>
            <div style={{ minWidth:0 }}>
              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:22, fontWeight:800, color:C.t1, marginBottom:2 }}>Детали заказа</div>
                <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                  <span style={{ fontSize:13, color:C.t2 }}>Заказ #{o.id?.slice(0,8)}</span>
        <StatusBadge variant={orderStatusVariant(o.orderStatus)} size="sm">{statusLabel(o.orderStatus)}</StatusBadge>
                  {o.createdAt && <span style={{ fontSize:12, color:C.t3 }}>{fmtDate(o.createdAt)}</span>}
                </div>
              </div>
              {o.orderStatus !== 'cancelled' && (
                <div style={{ display:'flex', gap:0, marginBottom:20, overflowX:'auto', padding:'8px 0' }}>
                  {orderTimeline(o).map((step, i) => (
                    <div key={i} style={{ flex:1, minWidth:70, textAlign:'center', position:'relative' }}>
                      {i > 0 && <div style={{ position:'absolute', top:12, right:'50%', width:'100%', height:2, background:step.done ? '#d1d5db' : '#eef2f7', zIndex:0 }} />}
                      <div style={{ width:24, height:24, borderRadius:'50%', background:step.active ? '#0b0f19' : step.done ? '#d1d5db' : '#eef2f7', color:step.active ? '#fff' : step.done ? '#fff' : '#98a2b3', fontSize:11, fontWeight:700, display:'inline-flex', alignItems:'center', justifyContent:'center', position:'relative', zIndex:1, marginBottom:6 }}>{step.done ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg> : i + 1}</div>
                      <div style={{ fontSize:10, fontWeight:600, color:step.active ? C.t1 : C.t3, whiteSpace:'nowrap' }}>{step.label}</div>
                    </div>
                  ))}
                </div>
              )}
              {o.orderStatus === 'cancelled' && (
                <div style={{ marginBottom:20, padding:'12px 16px', background:'#fef2f2', borderRadius:14, border:'1px solid #fecdca', fontSize:13, color:'#b42318', fontWeight:600 }}>Заказ отменён</div>
              )}
              <div style={{ background:C.bg, border:'1px solid '+C.bd, borderRadius:18, padding:16, marginBottom:16 }}>
                <div style={{ fontSize:14, fontWeight:700, color:C.t1, marginBottom:12 }}>Товары в заказе</div>
                {o.items?.length > 0 ? (
                  <>
                    {o.items.map(item => (
                      <div key={item.id} onClick={() => item.productId && s.loadProduct(item.productId) && s.setPage('product')}
                        style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 0', borderBottom:'1px solid #f5f5f5', cursor: item.productId ? 'pointer' : 'default', borderRadius:12, margin:'0 -8px', paddingLeft:8, paddingRight:8 }}
                        onMouseEnter={e => item.productId && (e.currentTarget.style.background = '#fafafa')}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        <div style={{ width:68, height:68, borderRadius:14, background:'#f8fafc', border:'1px solid #eef2f7', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, overflow:'hidden', fontSize:16, fontWeight:800, color:'#667085' }}>
                          {getProductMainImage(item) ? <img src={getProductMainImage(item)} style={{ width:'100%', height:'100%', objectFit:'contain', padding:6 }} alt="" /> : <AgentIcon name="box" size={24} muted />}
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontWeight:600, fontSize:13, color:C.t1, lineHeight:1.3, display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>{item.productName || 'Товар'}</div>
                          {o.shopName && <div style={{ fontSize:11, color:C.t3, marginTop:2 }}>{shopDisplayName(o.shopName || '')}</div>}
                        </div>
                        <div style={{ color:C.t2, fontSize:12, whiteSpace:'nowrap', textAlign:'right' }}>{formatPrice(item.price)} × {item.quantity}</div>
                        <div style={{ fontWeight:700, fontSize:14, color:C.t1, whiteSpace:'nowrap', textAlign:'right', minWidth:72 }}>{formatPrice(item.price * item.quantity)}</div>
                        {item.productId && (
                          <button onClick={(e) => { e.stopPropagation(); s.loadProduct(item.productId); s.setPage('product'); }} style={{ ...btnDet, fontSize:11, padding:'4px 10px', flexShrink:0 }}>Открыть</button>
                        )}
                      </div>
                    ))}
                    <div style={{ display:'flex', justifyContent:'space-between', paddingTop:12, marginTop:8, borderTop:'1px solid #eef2f7' }}>
                      <span style={{ fontSize:13, color:C.t2 }}>{itemWord(o.items.length)}</span>
                      <span style={{ fontSize:16, fontWeight:800, color:C.t1 }}>{formatPrice(o.totalAmount)}</span>
                    </div>
                  </>
                ) : (
                  <div style={{ padding:14, background:'#f8fafc', borderRadius:14, fontSize:12, color:C.t3, textAlign:'center' }}>Состав заказа пока недоступен</div>
                )}
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div style={{ background:C.bg, border:'1px solid '+C.bd, borderRadius:16, padding:14 }}>
                  <div style={{ fontSize:11, fontWeight:600, color:C.t3, marginBottom:8, textTransform:'uppercase', letterSpacing:'0.03em' }}>Доставка</div>
                  <div style={{ fontSize:14, fontWeight:600, color:C.t1, marginBottom:4 }}>{delivLabel(o.deliveryMethod)}</div>
                  <div style={{ fontSize:11, color:C.t3 }}>По договорённости</div>
                </div>
                <div style={{ background:C.bg, border:'1px solid '+C.bd, borderRadius:16, padding:14 }}>
                  <div style={{ fontSize:11, fontWeight:600, color:C.t3, marginBottom:8, textTransform:'uppercase', letterSpacing:'0.03em' }}>Оплата</div>
                  <div style={{ fontSize:14, fontWeight:600, color:C.t1, marginBottom:4 }}>{payLabel(o.paymentMethod)}</div>
                  <div style={{ fontSize:11, color:C.t3 }}>{o.paymentMethod === 'cash' ? 'При получении' : o.paymentMethod === 'store' ? 'В магазине' : 'По договорённости'}</div>
                </div>
              </div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div style={{ background:C.bg, border:'1px solid '+C.bd, borderRadius:18, padding:16 }}>
                <div style={{ fontSize:13, fontWeight:700, color:C.t1, marginBottom:12 }}>Сводка заказа</div>
                <div style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', fontSize:13 }}>
                  <span style={{ color:C.t2 }}>Товары ({o.items?.length || 0})</span>
                  <span style={{ color:C.t1, fontWeight:600 }}>{formatPrice(o.totalAmount)}</span>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', fontSize:13, borderBottom:'1px solid #eef2f7' }}>
                  <span style={{ color:C.t2 }}>Доставка</span>
                  <span style={{ color:C.t3 }}>По договорённости</span>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', paddingTop:10, fontSize:14 }}>
                  <span style={{ fontWeight:700, color:C.t1 }}>Итого</span>
                  <span style={{ fontWeight:800, color:C.t1 }}>{formatPrice(o.totalAmount)}</span>
                </div>
              </div>
              <div style={{ background:C.bg, border:'1px solid '+C.bd, borderRadius:18, padding:16 }}>
                <div style={{ fontSize:13, fontWeight:700, color:C.t1, marginBottom:10 }}>Магазин</div>
                <div style={{ width:44, height:44, borderRadius:14, background:'#f8fafc', border:'1px solid #eef2f7', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, fontWeight:800, color:'#667085', marginBottom:8 }}>
                  {shopDisplayName(o.shopName || '').charAt(0)}
                </div>
                <div style={{ fontSize:14, fontWeight:600, color:C.t1 }}>{shopDisplayName(o.shopName || '')}</div>
                {o.shopSlug && <div style={{ fontSize:11, color:C.t3, marginTop:2 }}>@{o.shopSlug}</div>}
                {o.shopSlug && (
                  <button onClick={() => { s.currentSlug = o.shopSlug; s.setPage('shop'); s.loadShop(o.shopSlug); }} style={{ marginTop:10, ...btnDet, width:'100%', textAlign:'center' }}>
                    Открыть магазин
                  </button>
                )}
              </div>
              <div style={{ background:C.bg, border:'1px solid '+C.bd, borderRadius:18, padding:16 }}>
                <div style={{ fontSize:13, fontWeight:700, color:C.t1, marginBottom:8 }}>Нужна помощь?</div>
                <div style={{ fontSize:11, color:C.t3, lineHeight:1.5, marginBottom:12 }}>
                  По вопросам заказа напишите продавцу со страницы товара или магазина.
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  <button onClick={() => s.setPage('catalog')} style={btnSec}>В каталог</button>
                  {o.shopSlug && <button onClick={() => { s.currentSlug = o.shopSlug; s.setPage('shop'); s.loadShop(o.shopSlug); }} style={btnPri}>Открыть магазин</button>}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Styles ───
function orderStatusVariant(s) {
  if (s === 'accepted' || s === 'completed') return 'success';
  if (s === 'cancelled') return 'danger';
  if (s === 'ready') return 'warning';
  return 'neutral';
}

const profCell = { background:C.bg, border:'1px solid '+C.bd, borderRadius:18, padding:'16px 20px' };
const profLabel = { fontSize:11, color:C.t3, fontWeight:500, marginBottom:4 };
const profVal = { fontSize:15, fontWeight:700, color:C.t1, wordBreak:'break-all' };
const emptyCard = { textAlign:'center', padding:40, background:C.bg, border:'1px solid '+C.bd, borderRadius:18 };
const orderCard = { background:C.bg, border:'1px solid '+C.bd, borderRadius:18, padding:18 };
const btnPri = { padding:'8px 18px', borderRadius:14, fontSize:12, fontWeight:700, cursor:'pointer', border:'none', background:C.btn, color:'#fff' };
const btnPriSm = { padding:'5px 14px', borderRadius:999, fontSize:11, fontWeight:600, cursor:'pointer', border:'none', background:'#0b0f19', color:'#fff' };
const btnSec = { padding:'8px 18px', borderRadius:14, fontSize:12, fontWeight:600, cursor:'pointer', border:'1px solid '+C.bd, background:C.bg, color:'#475467' };
const btnSecSm = { padding:'5px 14px', borderRadius:999, fontSize:11, fontWeight:600, cursor:'pointer', border:'1px solid '+C.bd, background:C.bg, color:'#475467' };
const btnGhostSm = { padding:'5px 14px', borderRadius:999, fontSize:11, fontWeight:500, cursor:'pointer', border:'1px solid transparent', background:'transparent', color:C.t2 };
const btnOut = { padding:'8px 20px', borderRadius:14, fontSize:12, fontWeight:600, cursor:'pointer', border:'1px solid '+C.bd, background:C.bg, color:'#475467' };
const btnDet = { padding:'6px 14px', borderRadius:999, fontSize:12, fontWeight:600, cursor:'pointer', border:'1px solid '+C.bd, background:C.bg, color:C.t2 };
const chipMeta = { fontSize:11, fontWeight:500, color:'#475467', background:'#f8fafc', border:'1px solid #eef2f7', padding:'3px 10px', borderRadius:999, display:'inline-flex', alignItems:'center' };

const statsChip = { fontSize:11, fontWeight:500, color:'#475467', padding:'5px 14px', borderRadius:999, background:'#fff', border:'1px solid '+C.bd, cursor:'pointer' };
const statsChipActive = { fontSize:11, fontWeight:700, color:'#fff', padding:'5px 14px', borderRadius:999, background:C.btn, border:'1px solid '+C.btn, cursor:'pointer' };
const searchInput = { flex:1, padding:'9px 16px', borderRadius:999, border:'1px solid '+C.bd, fontSize:12, outline:'none', background:'#fff' };
const btnSearchClear = { ...btnGhostSm };

function statusLabel(s) { const m = { accepted:'Принят', created:'Создан', processing:'В обработке', completed:'Завершён', cancelled:'Отменён', received:'Получен' }; return m[s] || 'Статус уточняется'; }
function payLabel(s) { const m = { store:'Оплата в магазине', cash:'Наличными', invoice:'Счёт', delivery_agreement:'По договорённости', card:'Картой', sbp:'СБП' }; return m[s] || 'По договорённости'; }
function delivLabel(s) { const m = { pickup:'Самовывоз', delivery:'Доставка', delivery_agreement:'По договорённости' }; return m[s] || 'По договорённости'; }
function itemWord(n) { return n === 1 ? 'товар' : n < 5 ? 'товара' : 'товаров'; }

function orderTimeline(o) {
  const s = o.orderStatus;
  const steps = ['Создан','Подтверждён','Оплата','Передан','Завершён'];
  const idx = ['new','pending','accepted'].includes(s) ? 1 : ['confirmed','processing','in_progress'].includes(s) ? 2 : ['completed','received','done'].includes(s) ? 5 : 1;
  return steps.map((label, i) => ({
    label, active: i === idx - 1, done: i < idx
  }));
}
