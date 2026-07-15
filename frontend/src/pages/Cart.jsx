import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';

export default function Cart() {
  const { items, removeItem, updateQuantity, total } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();

  if (items.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <p>Your cart is empty.</p>
        <Link to="/">Continue shopping</Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: 24 }}>
      <h2>Your Cart</h2>
      {items.map(({ product, quantity }) => (
        <div key={product.id} style={{ display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid #eee', padding: '12px 0' }}>
          <img src={product.image_url} style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 8 }} />
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontWeight: 600 }}>{product.name}</p>
            <p style={{ margin: 0, color: '#666' }}>₦{Number(product.price).toLocaleString()}</p>
          </div>
          <input
            type="number" min={1} value={quantity}
            onChange={(e) => updateQuantity(product.id, Number(e.target.value))}
            style={{ width: 50, padding: 6 }}
          />
          <button onClick={() => removeItem(product.id)} style={{ border: 'none', background: 'none', color: '#c0392b', cursor: 'pointer' }}>
            Remove
          </button>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, fontWeight: 700 }}>
        <span>Total</span>
        <span>₦{total.toLocaleString()}</span>
      </div>
      <button
        onClick={() => user ? navigate('/checkout') : navigate('/login?next=/checkout')}
        style={{ marginTop: 16, width: '100%', padding: 12, borderRadius: 8, border: 'none', background: '#111', color: '#fff' }}
      >
        Proceed to Checkout
      </button>
    </div>
  );
}
