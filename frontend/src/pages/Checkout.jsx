import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { getDeviceFingerprint } from '../lib/fingerprint';
import api from '../lib/api';

export default function Checkout() {
  const { items, total, clearCart } = useCart();
  const navigate = useNavigate();
  const [form, setForm] = useState({ address: '', shippingCountry: 'NG', billingCountry: 'NG' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [blockedReasons, setBlockedReasons] = useState(null);

  async function handlePay(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setBlockedReasons(null);

    try {
      const { data } = await api.post('/api/orders/checkout', {
        items: items.map((i) => ({ product_id: i.product.id, quantity: i.quantity })),
        shipping_address: form.address,
        shipping_country: form.shippingCountry,
        billing_country: form.billingCountry,
        device_fingerprint: getDeviceFingerprint(),
      });

      clearCart();
      // Redirect to Paystack's hosted checkout page
      window.location.href = data.authorization_url;
    } catch (err) {
      const resp = err.response?.data;
      if (resp?.decision === 'BLOCK') {
        setBlockedReasons(resp.reasons || []);
      } else {
        setError(resp?.error || 'Checkout failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 500, margin: '0 auto', padding: 24 }}>
      <h2>Checkout</h2>
      <p style={{ fontWeight: 700 }}>Total: ₦{total.toLocaleString()}</p>

      {blockedReasons && (
        <div style={{ background: '#fdecea', border: '1px solid #f5c6cb', padding: 12, borderRadius: 8, marginBottom: 16 }}>
          <strong>Transaction blocked by fraud detection.</strong>
          <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
            {blockedReasons.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}
      {error && <p style={{ color: '#c0392b' }}>{error}</p>}

      <form onSubmit={handlePay}>
        <label style={label}>Shipping Address</label>
        <textarea
          required value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
          style={{ ...input, minHeight: 70 }}
        />

        <label style={label}>Shipping Country</label>
        <select value={form.shippingCountry} onChange={(e) => setForm({ ...form, shippingCountry: e.target.value })} style={input}>
          {['NG', 'GH', 'US', 'UK', 'CA', 'ZA'].map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        <label style={label}>Billing Country</label>
        <select value={form.billingCountry} onChange={(e) => setForm({ ...form, billingCountry: e.target.value })} style={input}>
          {['NG', 'GH', 'US', 'UK', 'CA', 'ZA'].map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        <button type="submit" disabled={loading} style={{ width: '100%', padding: 12, marginTop: 16, borderRadius: 8, border: 'none', background: '#111', color: '#fff' }}>
          {loading ? 'Processing…' : 'Pay with Paystack'}
        </button>
      </form>
    </div>
  );
}

const label = { display: 'block', margin: '12px 0 4px', fontSize: 13, color: '#444' };
const input = { width: '100%', padding: 10, border: '1px solid #ddd', borderRadius: 8, boxSizing: 'border-box' };
