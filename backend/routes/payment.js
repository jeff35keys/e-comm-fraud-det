import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { verifyTransaction, verifyWebhookSignature } from '../services/paystackService.js';
import { updateUserStats } from '../services/fraudService.js';

const router = Router();

// GET /api/payment/verify/:reference  (called by frontend after Paystack redirect)
router.get('/verify/:reference', requireAuth, async (req, res) => {
  try {
    const result = await verifyTransaction(req.params.reference);
    const success = result.status === 'success';

    const { data: txn } = await supabaseAdmin
      .from('transactions').select('*').eq('paystack_reference', req.params.reference).single();
    if (!txn) return res.status(404).json({ error: 'Transaction not found' });

    await supabaseAdmin.from('transactions')
      .update({ status: success ? 'success' : 'failed' })
      .eq('id', txn.id);

    if (success) {
      const { data: order } = await supabaseAdmin.from('orders').select('*').eq('id', txn.order_id).single();
      // Preserve a 'review' status set by the fraud engine; otherwise mark paid.
      const newStatus = order.status === 'review' ? 'review' : 'paid';
      await supabaseAdmin.from('orders').update({ status: newStatus }).eq('id', txn.order_id);

      await updateUserStats(txn.user_id, txn.amount, order.shipping_country, txn.device_fingerprint);

      // Decrement stock for each item
      const { data: items } = await supabaseAdmin.from('order_items').select('*').eq('order_id', txn.order_id);
      for (const item of items || []) {
        await supabaseAdmin.rpc('decrement_stock', { p_product_id: item.product_id, p_qty: item.quantity })
          .catch(() => {}); // no-op if the RPC function isn't installed; see database/functions.sql
      }
    }

    res.json({ success, status: result.status, amount: result.amount / 100 });
  } catch (err) {
    console.error('[payment/verify] error', err);
    res.status(500).json({ error: 'Verification failed', detail: err.message });
  }
});

// POST /api/payment/webhook  (Paystack server-to-server callback - source of truth)
// IMPORTANT: this route must receive the RAW body for signature verification;
// see server.js where express.raw() is applied specifically to this path.
router.post('/webhook', async (req, res) => {
  const signature = req.headers['x-paystack-signature'];
  const rawBody = req.body; // Buffer, thanks to express.raw() middleware

  if (!signature || !verifyWebhookSignature(rawBody, signature)) {
    return res.status(401).send('Invalid signature');
  }

  const event = JSON.parse(rawBody.toString('utf8'));

  if (event.event === 'charge.success') {
    const reference = event.data.reference;
    const { data: txn } = await supabaseAdmin
      .from('transactions').select('*').eq('paystack_reference', reference).single();

    if (txn && txn.status !== 'success') {
      await supabaseAdmin.from('transactions').update({ status: 'success' }).eq('id', txn.id);
      const { data: order } = await supabaseAdmin.from('orders').select('*').eq('id', txn.order_id).single();
      const newStatus = order.status === 'review' ? 'review' : 'paid';
      await supabaseAdmin.from('orders').update({ status: newStatus }).eq('id', txn.order_id);
      await updateUserStats(txn.user_id, txn.amount, order.shipping_country, txn.device_fingerprint);
    }
  }

  res.sendStatus(200);
});

export default router;
