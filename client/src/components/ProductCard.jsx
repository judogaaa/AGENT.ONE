import { useState, useRef } from 'react';
import { useStore } from '../hooks/useStore';
import { getProductMainImage } from '../utils/productImages';
import { formatPrice, hasValidPrice } from '../utils/format';
import AgentIcon from './AgentIcon';
import { useAnimatedAddToCart } from '../features/cart-animation/useAnimatedAddToCart';
import { useRequireAuth } from '../hooks/useRequireAuth';

const ST = {
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' },
  imageArea: { aspectRatio: '3/2', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' },
  image: { width: '100%', height: '100%', objectFit: 'contain', padding: 10, boxSizing: 'border-box' },
  overlay: { position: 'absolute', top: 6, right: 6, display: 'flex', flexDirection: 'column', gap: 4, zIndex: 1 },
  iconBtn: { width: 28, height: 28, borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, transition: 'all .15s' },
  iconBtnActive: { width: 28, height: 28, borderRadius: 8, border: '1px solid #d1d5db', background: '#f3f4f6', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, transition: 'all .15s' },
  content: { padding: '10px 12px 12px', display: 'flex', flexDirection: 'column', flex: 1 },
  meta: { fontSize: 10, fontWeight: 600, color: '#667085', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 2 },
  name: { fontSize: 13, fontWeight: 700, color: '#0b0f19', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' },
  shopName: { fontSize: 10, color: '#98a2b3', marginTop: 1 },
  priceRow: { marginTop: 6, display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' },
  price: { fontSize: 15, fontWeight: 800, color: '#0b0f19' },
  oldPrice: { fontSize: 12, color: '#9ca3af', textDecoration: 'line-through' },
  actions: { marginTop: 'auto', paddingTop: 8, display: 'flex', gap: 5 },
  btnPrimary: { flex: 1, padding: '7px 0', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none', background: '#0b0f19', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 },
  btnSecondary: { width: 34, height: 34, borderRadius: 999, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, transition: 'all .15s', flexShrink: 0 },
};

export default function ProductCard({ product }) {
  const s = useStore();
  const requireAuth = useRequireAuth();
  const [imgError, setImgError] = useState(false);
  const imgRef = useRef(/** @type {HTMLImageElement | null} */ (null));
  const { addToCartWithAnimation } = useAnimatedAddToCart();
  const imageUrl = getProductMainImage(product);
  const isFav = s.isFavorite ? s.isFavorite(product.id) : false;
  const isInCompare = s.compareItems?.find(i => i.id === product.id);

  const openProduct = () => { s.loadProduct(product.id); s.setPage('product'); };

  const handleFavorite = (e) => { e.stopPropagation(); requireAuth(() => s.toggleFavorite(product.id, product).catch(() => {})); };
  const handleCart = (e) => { e.stopPropagation(); requireAuth(() => addToCartWithAnimation(product, imgRef.current)); };
  const handleCompare = (e) => { e.stopPropagation(); requireAuth(() => s.addToCompare(product)); };

  return (
    <div style={ST.card}>
      <div style={ST.imageArea}>
        {imageUrl && !imgError ? (
          <img ref={imgRef} src={imageUrl} alt={product.name || ''} onError={() => setImgError(true)} style={ST.image} />
        ) : (
          <AgentIcon name="box" size={28} muted />
        )}
        <div style={ST.overlay}>
          <button onClick={handleFavorite} style={isFav ? ST.iconBtnActive : ST.iconBtn}
            onMouseEnter={e => { if (!isFav) { e.currentTarget.style.borderColor = '#d1d5db'; e.currentTarget.style.background = '#f9fafb'; } }}
            onMouseLeave={e => { if (!isFav) { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.background = '#fff'; } }}
            aria-label={isFav ? 'Убрать из избранного' : 'Добавить в избранное'}
          ><AgentIcon name="heart" size={14} filled={isFav} muted={!isFav} /></button>
          <button onClick={handleCompare} style={isInCompare ? ST.iconBtnActive : ST.iconBtn}
            onMouseEnter={e => { if (!isInCompare) { e.currentTarget.style.borderColor = '#d1d5db'; e.currentTarget.style.background = '#f9fafb'; } }}
            onMouseLeave={e => { if (!isInCompare) { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.background = '#fff'; } }}
            aria-label="Добавить в сравнение"
          ><AgentIcon name="compare" size={13} muted={!isInCompare} /></button>
        </div>
      </div>

      <div style={ST.content}>
        {product.brand && <div style={ST.meta}>{product.brand}</div>}
        {!product.brand && product.category && <div style={ST.meta}>{product.category}</div>}
        <div style={ST.name}>{product.name || 'Товар'}</div>
        {product.shopName && <div style={ST.shopName}>{product.shopName}</div>}

        <div style={ST.priceRow}>
          <span style={ST.price}>{hasValidPrice(product.price) ? formatPrice(product.price) : 'по запросу'}</span>
          {hasValidPrice(product.oldPrice) && <span style={ST.oldPrice}>{formatPrice(product.oldPrice)}</span>}
        </div>

        <div style={ST.actions}>
          <button onClick={openProduct} style={ST.btnPrimary}>Подробнее</button>
          <button onClick={handleCart} style={ST.btnSecondary}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#d1d5db'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; }}
            aria-label="Добавить в корзину"><AgentIcon name="cart" size={15} /></button>
        </div>
      </div>
    </div>
  );
}
