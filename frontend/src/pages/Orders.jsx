import { useEffect, useState } from 'react';
import api from '../lib/api';

export default function Orders() {
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    api.get('/api/orders/mine').then(({ data }) => setOrders(data.orders || []));
  }, []);

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: 24 }}>
      <h2>My Orders</h2>
      {orders.length === 0 && <p>No orders yet.</p>}
      {orders.map((o) => (
        <div key={o.id} style={{ border: '1px solid #eee', borderRadius: 10, padding: 14, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <strong>Order #{o.id.slice(0, 8)}</strong>
            <span style={{ textTransform: 'capitalize', color: statusColor(o.status) }}>{o.status}</span>
          </div>
          <p style={{ margin: '4px 0' }}>₦{Number(o.total_amount).toLocaleString()} · {new Date(o.created_at).toLocaleDateString()}</p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {(o.order_items || []).map((item) => (
              <li key={item.id}>{item.products?.name} × {item.quantity}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function statusColor(status) {
  if (status === 'paid' || status === 'delivered') return '#0a7d2e';
  if (status === 'review') return '#c47f00';
  if (status === 'blocked' || status === 'failed') return '#c0392b';
  return '#666';
}
