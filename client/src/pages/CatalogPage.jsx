import { useEffect, useState } from 'react';
import { useStore } from '../hooks/useStore';
import { useRequireAuth } from '../hooks/useRequireAuth';
import CatalogFilters from '../components/CatalogFilters';
import ProductCard from '../components/ProductCard';
import { formatPrice, getConditionLabel, hasValidPrice } from '../utils/format';
import { getProductMainImage } from '../utils/productImages';
import SlidingTabs from '../components/SlidingTabs';
import StatusBadge from '../components/ui/StatusBadge';
import AgentIcon from '../components/AgentIcon';

const ST = {
  page: { maxWidth: 1240, margin: '0 auto', padding: '32px 20px 56px' },
  title: { fontSize: 26, fontWeight: 800, color: '#0b0f19', letterSpacing: '-0.02em' },
  subtitle: { fontSize: 14, color: '#667085', marginTop: 2 },
  toolbar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, marginBottom: 16, flexWrap: 'wrap', gap: 10 },
  searchRow: { display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center' },
  input: { flex: 1, padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: 14, fontSize: 14, outline: 'none', background: '#fff', boxSizing: 'border-box' },
  btn: { padding: '10px 18px', background: '#050505', color: '#fff', borderRadius: 14, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', whiteSpace: 'nowrap' },
  btnSec: { padding: '10px 18px', background: '#fff', color: '#667085', borderRadius: 14, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' },
  empty: { textAlign: 'center', padding: 64, color: '#667085', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 20 },
  emptyTitle: { fontSize: 16, fontWeight: 600, color: '#0b0f19', marginBottom: 4 },
  emptySub: { fontSize: 13, color: '#667085', marginTop: 4, marginBottom: 16 },
  err: { textAlign: 'center', padding: 40, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 16, marginBottom: 20 },
  errText: { fontSize: 14, color: '#991b1b', marginBottom: 12 },
};

export default function CatalogPage() {
  const s = useStore();
  const requireAuth = useRequireAuth();
  const [tab, setTab] = useState('products');
  const [viewMode, setViewMode] = useState('grid');
  const [filters, setFilters] = useState({ q: '', category: '', sort: '', minPrice: '', maxPrice: '', brand: '', color: '', deliveryTerm: '', keyboardType: '', keyboardConnection: '', condition: '' });
  const [searchInput, setSearchInput] = useState('');

  useEffect(() => {
    s.loadShops();
    s.loadProducts({ limit: 200 }).catch(() => {});
    s.loadCatalogFacets({ limit: 200 }).catch(() => {});
  }, []);

  useEffect(() => {
    if (tab === 'products') {
      s.loadProducts({ ...filters, limit: 200 });
      s.loadCatalogFacets({ ...filters });
    }
  }, [filters, tab]);

  const doSearch = () => { setFilters(f => ({ ...f, q: searchInput })); };
  const clearSearch = () => { setSearchInput(''); setFilters(f => ({ ...f, q: '' })); };
  const handleFilters = (newFilters) => setFilters(newFilters);
  const openShop = (slug) => { s.currentSlug = slug; s.setPage('shop'); s.loadShop(slug); };
  const hasActiveFilters = !!(filters.brand || filters.color || filters.deliveryTerm || filters.keyboardType || filters.keyboardConnection || filters.condition || filters.minPrice || filters.maxPrice);

  const productCount = s.allProducts?.length || 0;
  const shopCount = s.shops?.length || 0;

  return (
    <div style={ST.page}>
      {/* Header */}
      <h2 style={ST.title}>Каталог</h2>
      <p style={ST.subtitle}>{productCount} товаров из {shopCount} магазинов</p>

      {/* Tabs + View Toggle */}
      <div style={ST.toolbar}>
        <SlidingTabs tabs={[{ value: 'products', label: `Товары\u00A0${productCount}` }, { value: 'shops', label: `Магазины\u00A0${shopCount}` }]} value={tab} onChange={setTab} />
        {tab === 'products' && (
          <div style={{ display: 'flex', gap: 2, background: '#f3f4f6', borderRadius: 12, padding: 2, flexShrink: 0 }}>
            <button onClick={() => setViewMode('grid')} style={{ width: 32, height: 30, borderRadius: 10, border: 'none', cursor: 'pointer', background: viewMode === 'grid' ? '#fff' : 'transparent', color: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: viewMode === 'grid' ? '0 1px 2px rgba(15,23,42,.06)' : 'none' }} title="Плитка"><AgentIcon name="grid" size={16} /></button>
            <button onClick={() => setViewMode('list')} style={{ width: 32, height: 30, borderRadius: 10, border: 'none', cursor: 'pointer', background: viewMode === 'list' ? '#fff' : 'transparent', color: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: viewMode === 'list' ? '0 1px 2px rgba(15,23,42,.06)' : 'none' }} title="Список"><AgentIcon name="list" size={16} /></button>
          </div>
        )}
      </div>

      {/* Shops tab */}
      {tab === 'shops' && (
        <div style={{ marginTop: 8 }}>
          {s.shops.length === 0 ? (
            <div style={{ textAlign:'center', padding:40, fontSize:14, color:'#98a2b3', background:'#fff', border:'1px solid #e5e7eb', borderRadius:20 }}>Магазинов пока нет</div>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))', gap:16 }}>
              {s.shops.map(shop => <StoreCard key={shop.id} shop={shop} products={s.allProducts} onOpen={() => openShop(shop.slug)} />)}
            </div>
          )}
        </div>
      )}

      {/* Products tab */}
      {tab === 'products' && (
        <>
          {/* Error */}
          {s.productsError && (
            <div style={ST.err}>
              <p style={ST.errText}>{s.productsError}</p>
              <button onClick={() => { s.productsError = ''; s.loadProducts({ limit: 200 }).catch(() => {}); }} style={ST.btn}>Повторить</button>
            </div>
          )}

          {/* Search + Filters */}
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 20, padding: 16, marginBottom: 16 }}>
            <div style={ST.searchRow}>
              <div style={{ position: 'relative', flex: 1 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#98a2b3" strokeWidth="2" strokeLinecap="round" style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input type="text" value={searchInput} onChange={e => setSearchInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && doSearch()} placeholder="Поиск товаров" style={{ ...ST.input, paddingLeft: 36 }} />
              </div>
              <button onClick={doSearch} style={ST.btn}>Найти</button>
              {filters.q && <button onClick={clearSearch} style={ST.btnSec}>Сбросить</button>}
            </div>
            <div className="catalog-filter-scroll" style={{ marginTop: 4 }}>
              <CatalogFilters filters={filters} onChangeFilters={handleFilters} />
            </div>
          </div>

          {/* Empty */}
          {productCount === 0 && (
            <div style={ST.empty}>
              <div style={ST.emptyTitle}>Товаров по этим фильтрам не найдено</div>
              <div style={ST.emptySub}>Попробуйте убрать часть фильтров или изменить запрос.</div>
              {hasActiveFilters && (
                <button onClick={() => setFilters({ q: filters.q, category: filters.category, sort: filters.sort, minPrice: '', maxPrice: '', brand: '', color: '', deliveryTerm: '', keyboardType: '', keyboardConnection: '', condition: '' })} style={ST.btn}>Сбросить фильтры</button>
              )}
            </div>
          )}

          {/* Grid/List */}
          {productCount > 0 && (
            <div style={viewMode === 'list' ? { display: 'flex', flexDirection: 'column', gap: 10 } : { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 16 }}>
              {s.allProducts.map(p => {
                const mainImg = getProductMainImage(p);
                const inCompare = s.compareItems.find(c => c.id === p.id);

                if (viewMode === 'list') return (
                  <div key={p.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: 14, display: 'flex', gap: 14, alignItems: 'center' }}>
                    <div style={{ width: 88, height: 88, borderRadius: 14, background: '#f8f8fa', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                      {mainImg ? <img src={mainImg} style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 8 }} alt={p.name} /> : <AgentIcon name="box" size={28} muted />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, color: '#0b0f19', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                      <div style={{ fontSize: 12, color: '#667085', marginTop: 2 }}>{p.shopName}{p.brand ? <span style={{ marginLeft: 6, color: '#98a2b3' }}>{p.brand}</span> : ''}</div>
                      <div style={{ fontSize: 17, fontWeight: 800, color: '#0b0f19', marginTop: 4 }}>{hasValidPrice(p.price) ? formatPrice(p.price) : 'по запросу'}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button onClick={e => { e.stopPropagation(); requireAuth(() => s.toggleFavorite(p.id, p).catch(() => {})); }} style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid #e5e7eb', background: s.isFavorite(p.id) ? '#f3f4f6' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><AgentIcon name="heart" size={15} filled={s.isFavorite(p.id)} muted={!s.isFavorite(p.id)} /></button>
                      <button onClick={() => { s.loadProduct(p.id); s.setPage('product'); }} style={ST.btn}>Подробнее</button>
                    </div>
                  </div>
                );

                // Grid card
                return <ProductCard key={p.id} product={p} />;
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StoreCard({ shop, products, onOpen }) {
  const displayName = shopDisplayName(shop);
  const desc = shopDescription(shop);
  const productCount = products?.filter(p => p.shopId === shop.id || p.shopSlug === shop.slug).length || 0;
  const hasCover = !!shop.coverUrl;
  const hasLogo = !!shop.logoUrl;
  const initial = displayName.charAt(0).toUpperCase();
  const categoryLabel = shop.category === 'electronics' ? 'Электроника' : shop.category;

  return (
    <div
      onClick={onOpen}
      style={{
        background: '#fff', border: '1px solid #e5e7eb', borderRadius: 22, overflow: 'hidden', cursor: 'pointer',
        transition: 'border-color 150ms, transform 150ms', display: 'flex', flexDirection: 'column',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = '#d0d5dd'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; }}
    >
      {/* Cover */}
      <div style={{
        height: 120, background: hasCover ? '#f3f4f6' : 'linear-gradient(135deg, #f8fafc 0%, #e5e7eb 100%)',
        backgroundImage: hasCover ? `url(${shop.coverUrl})` : 'none', backgroundSize: 'cover', backgroundPosition: 'center', position: 'relative',
      }}>
        {!hasCover && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#cbd5e1', letterSpacing: 2, textTransform: 'uppercase' }}>AGENT.ONE</span>
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: '0 18px 18px', position: 'relative', flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Avatar */}
        <div style={{
          width: 64, height: 64, borderRadius: 18, border: '3px solid #fff', background: hasLogo ? 'none' : (shop.color || '#0b0f19'),
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 24, fontWeight: 800,
          overflow: 'hidden', marginTop: -32, boxShadow: '0 4px 12px rgba(0,0,0,0.06)', flexShrink: 0,
        }}>
          {hasLogo ? <img src={shop.logoUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : initial}
        </div>

        <div style={{ marginTop: 12, flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 17, color: '#0b0f19' }}>{displayName}</div>
          <div style={{ fontSize: 13, color: '#667085', marginTop: 2 }}>@{shop.slug}</div>
          {shop.tagline && <div style={{ fontSize: 12, color: '#667085', marginTop: 4, fontStyle: 'italic' }}>{shop.tagline}</div>}
          <div style={{ fontSize: 13, color: '#667085', lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', marginTop: 8 }}>
            {desc || 'Магазин на AGENT.ONE'}
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
            {productCount > 0 && <StatusBadge variant="muted" size="sm">{productCount} {pluralize(productCount, 'товар', 'товара', 'товаров')}</StatusBadge>}
            {categoryLabel && <StatusBadge variant="muted" size="sm">{categoryLabel}</StatusBadge>}
            {shop.showAiManager !== false && <StatusBadge variant="ai" size="sm">AI-менеджер</StatusBadge>}
          </div>
        </div>

        {/* CTA */}
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#344054' }}>Открыть магазин</span>
          <span style={{ fontSize: 14, color: '#98a2b3' }}>→</span>
        </div>
      </div>
    </div>
  );
}

function pluralize(n, one, two, many) {
  const m = n % 100;
  if (m >= 11 && m <= 19) return many;
  const d = m % 10;
  if (d === 1) return one;
  if (d >= 2 && d <= 4) return two;
  return many;
}

function shopDisplayName(shop) {
  return shop.name || shop.title || 'Магазин';
}
function shopDescription(shop) {
  return shop.description || '';
}

