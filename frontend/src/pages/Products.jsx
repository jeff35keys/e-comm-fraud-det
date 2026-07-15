import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useCart } from '../context/CartContext';

export default function Products() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const { addItem } = useCart();

  useEffect(() => {
    fetchProducts();
  }, []);

  async function fetchProducts() {
    setLoading(true);
    let query = supabase.from('products').select('*').eq('is_active', true);
    if (search) query = query.ilike('name', `%${search}%`);
    const { data, error } = await query;
    if (!error) setProducts(data || []);
    setLoading(false);
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <input
          placeholder="Search products..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && fetchProducts()}
          style={{ flex: 1, padding: '10px 12px', border: '1px solid #ddd', borderRadius: 8 }}
        />
        <button onClick={fetchProducts} style={{ padding: '10px 16px', borderRadius: 8, border: 'none', background: '#111', color: '#fff' }}>
          Search
        </button>
      </div>

      {loading ? <p>Loading products…</p> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 20 }}>
          {products.map((p) => (
            <div key={p.id} style={{ border: '1px solid #eee', borderRadius: 12, overflow: 'hidden' }}>
              <Link to={`/product/${p.id}`}>
                <img src={p.image_url} alt={p.name} style={{ width: '100%', height: 160, objectFit: 'cover' }} />
              </Link>
              <div style={{ padding: 12 }}>
                <Link to={`/product/${p.id}`} style={{ textDecoration: 'none', color: '#111' }}>
                  <h3 style={{ fontSize: 15, margin: '0 0 6px' }}>{p.name}</h3>
                </Link>
                <p style={{ fontWeight: 700, margin: '0 0 10px' }}>₦{Number(p.price).toLocaleString()}</p>
                <button
                  onClick={() => addItem(p, 1)}
                  disabled={p.stock <= 0}
                  style={{ width: '100%', padding: 8, borderRadius: 8, border: 'none', background: p.stock > 0 ? '#111' : '#ccc', color: '#fff' }}
                >
                  {p.stock > 0 ? 'Add to Cart' : 'Out of Stock'}
                </button>
              </div>
            </div>
          ))}
          {products.length === 0 && <p>No products found.</p>}
        </div>
      )}
    </div>
  );
}
