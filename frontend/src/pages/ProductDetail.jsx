import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useCart } from '../context/CartContext';

export default function ProductDetail() {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const [qty, setQty] = useState(1);
  const { addItem } = useCart();
  const navigate = useNavigate();

  useEffect(() => {
    supabase.from('products').select('*').eq('id', id).single()
      .then(({ data }) => setProduct(data));
  }, [id]);

  if (!product) return <p style={{ padding: 24 }}>Loading…</p>;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24, display: 'flex', gap: 32, flexWrap: 'wrap' }}>
      <img src={product.image_url} alt={product.name} style={{ width: 340, height: 340, objectFit: 'cover', borderRadius: 12 }} />
      <div style={{ flex: 1, minWidth: 260 }}>
        <h1 style={{ fontSize: 24 }}>{product.name}</h1>
        <p style={{ color: '#666' }}>{product.description}</p>
        <p style={{ fontSize: 22, fontWeight: 700 }}>₦{Number(product.price).toLocaleString()}</p>
        <p style={{ color: product.stock > 0 ? '#0a7d2e' : '#c0392b' }}>
          {product.stock > 0 ? `${product.stock} in stock` : 'Out of stock'}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '16px 0' }}>
          <button onClick={() => setQty(Math.max(1, qty - 1))} style={qtyBtn}>−</button>
          <span>{qty}</span>
          <button onClick={() => setQty(qty + 1)} style={qtyBtn}>+</button>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={() => addItem(product, qty)}
            disabled={product.stock <= 0}
            style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: '#111', color: '#fff' }}
          >
            Add to Cart
          </button>
          <button
            onClick={() => { addItem(product, qty); navigate('/cart'); }}
            disabled={product.stock <= 0}
            style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #111', background: '#fff', color: '#111' }}
          >
            Buy Now
          </button>
        </div>
      </div>
    </div>
  );
}

const qtyBtn = { width: 32, height: 32, borderRadius: 6, border: '1px solid #ddd', background: '#fff' };
