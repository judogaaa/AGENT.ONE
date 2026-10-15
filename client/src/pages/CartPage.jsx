import { useStore } from '../hooks/useStore';
import { useRequireAuth } from '../hooks/useRequireAuth';
import { formatPrice } from '../utils/format';
import { getProductMainImage } from '../utils/productImages';
import AgentIcon from '../components/AgentIcon';

export default function CartPage() {
  const s = useStore();
  const requireAuth = useRequireAuth();
  const items = s.cartItems;

  const total = items.reduce((sum, i) => sum + (Number(i.price) || 0) * (i.quantity || 1), 0);

  // Check if items are from multiple shops
  const shops = new Set(items.map(i => i.shopId));
  const multiShop = shops.size > 1;

  if (items.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}><AgentIcon name="box" size={42} muted /></div>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#333' }}>Корзина пустая</div>
        <div style={{ fontSize: 14, color: '#999', marginTop: 6, marginBottom: 24 }}>Перейдите в каталог, чтобы выбрать товар.</div>
        <button onClick={() => s.setPage('catalog')} style={{ padding: '12px 28px', background: '#111', color: '#fff', borderRadius: 999, fontSize: 14, fontWeight: 600, cursor: 'pointer', border: 'none' }}>
          Перейти в каталог
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '30px 0 60px', maxWidth: 720, margin: '0 auto' }}>
      <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 20 }}>Корзина</h2>

      {multiShop && (
        <div style={{ padding: 12, background: '#fff8e1', borderRadius: 12, fontSize: 13, color: '#f57f17', marginBottom: 16 }}>
          На первом этапе можно оформить заказ только у одного продавца. Удалите товары из других магазинов.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map(item => (
          <div key={item.productId} style={{ display: 'flex', gap: 14, alignItems: 'center', background: '#fff', border: '1px solid #e8e8e8', borderRadius: 12, padding: 14 }}>
            <div style={{ width: 56, height: 56, borderRadius: 10, background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>
              {getProductMainImage(item) ? <img src={getProductMainImage(item)} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 10 }} alt="" /> : <AgentIcon name="box" size={22} muted />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{item.name}</div>
              <div style={{ fontSize: 12, color: '#999' }}>{item.shopName}</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#111', marginTop: 2 }}>
                {formatPrice(item.price)}
                {item.oldPrice && <span style={{ fontSize: 11, color: '#999', textDecoration: 'line-through', marginLeft: 6 }}>{formatPrice(item.oldPrice)}</span>}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #ddd', borderRadius: 999, overflow: 'hidden' }}>
                <button onClick={() => s.updateCartQuantity(item.productId, item.quantity - 1)} style={{ width: 32, height: 32, border: 'none', background: '#f5f5f5', cursor: 'pointer', fontSize: 16, fontWeight: 600 }}>−</button>
                <span style={{ width: 40, textAlign: 'center', fontSize: 13, fontWeight: 600 }}>{item.quantity}</span>
                <button onClick={() => s.updateCartQuantity(item.productId, item.quantity + 1)} style={{ width: 32, height: 32, border: 'none', background: '#f5f5f5', cursor: 'pointer', fontSize: 16, fontWeight: 600 }}>+</button>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, minWidth: 80, textAlign: 'right' }}>
                {formatPrice(item.price * item.quantity)}
              </div>
              <button onClick={() => s.removeFromCart(item.productId)} style={{ padding: 6, border: 'none', background: 'none', cursor: 'pointer', color: '#ccc' }}><AgentIcon name="x" size={14} /></button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, padding: 20, background: '#fff', border: '1px solid #e8e8e8', borderRadius: 12 }}>
        <div>
          <div style={{ fontSize: 13, color: '#666' }}>Итого</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{formatPrice(total)}</div>
        </div>
        <button
          onClick={() => requireAuth(() => s.setPage('checkout'))}
          disabled={multiShop}
          style={{ padding: '14px 32px', background: multiShop ? '#ccc' : '#111', color: '#fff', borderRadius: 999, fontSize: 15, fontWeight: 600, cursor: multiShop ? 'not-allowed' : 'pointer', border: 'none' }}
        >
          Оформить заказ
        </button>
      </div>
    </div>
  );
}
