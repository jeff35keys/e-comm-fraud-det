import { useEffect, useState } from 'react';
import api from '../lib/api';

export default function AdminFraud() {
  const [logs, setLogs] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/api/admin/fraud-logs').then(({ data }) => setLogs(data.logs)).catch(() => setError('Access denied or not signed in as admin.'));
    api.get('/api/admin/model-metrics').then(({ data }) => setMetrics(data)).catch(() => {});
  }, []);

  async function resolve(orderId, action) {
    await api.post(`/api/admin/orders/${orderId}/resolve`, { action });
    setLogs((prev) => prev.map((l) => l.order_id === orderId ? { ...l, orders: { ...l.orders, status: action === 'approve' ? 'paid' : 'blocked' } } : l));
  }

  if (error) return <p style={{ padding: 24, color: '#c0392b' }}>{error}</p>;

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: 24 }}>
      <h2>Fraud Review Dashboard</h2>

      {metrics && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
          {Object.entries(metrics.metrics || {}).map(([k, v]) => (
            <div key={k} style={{ border: '1px solid #eee', borderRadius: 8, padding: '10px 16px' }}>
              <div style={{ fontSize: 12, color: '#888', textTransform: 'uppercase' }}>{k.replace('_', ' ')}</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{v}</div>
            </div>
          ))}
          <div style={{ border: '1px solid #eee', borderRadius: 8, padding: '10px 16px' }}>
            <div style={{ fontSize: 12, color: '#888' }}>MODEL</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{metrics.best_model}</div>
          </div>
        </div>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '2px solid #111' }}>
            <th style={th}>Order</th><th style={th}>Amount</th><th style={th}>ML Prob</th>
            <th style={th}>Rule Score</th><th style={th}>Final</th><th style={th}>Decision</th>
            <th style={th}>Reasons</th><th style={th}>Status</th><th style={th}>Action</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id} style={{ borderBottom: '1px solid #eee' }}>
              <td style={td}>{l.order_id?.slice(0, 8)}</td>
              <td style={td}>₦{Number(l.orders?.total_amount || 0).toLocaleString()}</td>
              <td style={td}>{l.ml_probability ?? '—'}</td>
              <td style={td}>{l.rule_score ?? '—'}</td>
              <td style={td}>{l.final_score}</td>
              <td style={{ ...td, fontWeight: 700, color: l.decision === 'BLOCK' ? '#c0392b' : l.decision === 'REVIEW' ? '#c47f00' : '#0a7d2e' }}>{l.decision}</td>
              <td style={td}><small>{(l.reasons || []).join('; ') || '—'}</small></td>
              <td style={td}>{l.orders?.status}</td>
              <td style={td}>
                {l.decision === 'REVIEW' && (
                  <>
                    <button onClick={() => resolve(l.order_id, 'approve')} style={btnGood}>Approve</button>
                    <button onClick={() => resolve(l.order_id, 'block')} style={btnBad}>Block</button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const th = { padding: '8px 6px' };
const td = { padding: '8px 6px' };
const btnGood = { marginRight: 6, padding: '4px 8px', border: 'none', borderRadius: 6, background: '#0a7d2e', color: '#fff', cursor: 'pointer' };
const btnBad = { padding: '4px 8px', border: 'none', borderRadius: 6, background: '#c0392b', color: '#fff', cursor: 'pointer' };
