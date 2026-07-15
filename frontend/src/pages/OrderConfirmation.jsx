import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import api from '../lib/api';

export default function OrderConfirmation() {
  const [params] = useSearchParams();
  const reference = params.get('reference') || params.get('trxref');
  const [status, setStatus] = useState('verifying');
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!reference) { setStatus('missing'); return; }
    api.get(`/api/payment/verify/${reference}`)
      .then(({ data }) => { setResult(data); setStatus(data.success ? 'success' : 'failed'); })
      .catch(() => setStatus('failed'));
  }, [reference]);

  return (
    <div style={{ maxWidth: 480, margin: '60px auto', padding: 24, textAlign: 'center' }}>
      {status === 'verifying' && <p>Verifying your payment…</p>}
      {status === 'success' && (
        <>
          <h2 style={{ color: '#0a7d2e' }}>Payment Successful 🎉</h2>
          <p>Amount paid: ₦{result?.amount?.toLocaleString()}</p>
          <p>Your order is being processed. If it was flagged for review, our team will confirm shortly.</p>
        </>
      )}
      {status === 'failed' && <h2 style={{ color: '#c0392b' }}>Payment could not be verified.</h2>}
      {status === 'missing' && <p>No payment reference found.</p>}
      <Link to="/">Back to store</Link>
    </div>
  );
}
