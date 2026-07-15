import { Router } from 'express';
import { randomUUID } from 'crypto';
import { supabaseAdmin } from '../config/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { scoreTransaction } from '../services/fraudService.js';
import { initializeTransaction } from '../services/paystackService.js';

const router = Router();

// POST /api/orders/checkout
// body: { items: [{product_id, quantity}], shipping_address, shipping_country, billing_country, device_fingerprint }
router.post('/checkout', requireAuth, async (req, res) => {
  const { items, shipping_address, shipping_country, billing_country, device_fingerprint } = req.body;
  const user = req.user;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Cart is empty' });
  }

  try {
    // 1) Fetch products & validate stock, compute total server-side (never trust client prices)
    const productIds = items.map((i) => i.product_id);
    const { data: products, error: prodErr } = await supabaseAdmin
      .from('products').select('*').in('id', productIds);
    if (prodErr) throw prodErr;

    let total = 0;
    const orderItemsPayload = [];
    for (const item of items) {
      const product = products.find((p) => p.id === item.product_id);
      if (!product) return res.status(400).json({ error: `Product ${item.product_id} not found` });
      if (product.stock < item.quantity) {
        return res.status(400).json({ error: `Insufficient stock for ${product.name}` });
      }
      total += Number(product.price) * item.quantity;
      orderItemsPayload.push({ product_id: product.id, quantity: item.quantity, unit_price: product.price });
    }

    // 2) Create order (status: pending)
    const { data: order, error: orderErr } = await supabaseAdmin
      .from('orders')
      .insert({
        user_id: user.id, status: 'pending', total_amount: total,
        shipping_address, shipping_country, billing_country,
      })
      .select().single();
    if (orderErr) throw orderErr;

    await supabaseAdmin.from('order_items').insert(
      orderItemsPayload.map((oi) => ({ ...oi, order_id: order.id }))
    );

    // 3) Create a transaction record (status: initiated)
    const reference = `SUG-${order.id.slice(0, 8)}-${randomUUID().slice(0, 8)}`;
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;

    const { data: txn, error: txnErr } = await supabaseAdmin
      .from('transactions')
      .insert({
        order_id: order.id, user_id: user.id, paystack_reference: reference,
        amount: total, payment_method: 'card', ip_address: ip,
        device_fingerprint: device_fingerprint || null, status: 'initiated',
      })
      .select().single();
    if (txnErr) throw txnErr;

    // 4) FRAUD CHECK - the core ML + rules gate before money moves
    const fraudResult = await scoreTransaction({
      userId: user.id, amount: total, ip, email: user.email,
      deviceFingerprint: device_fingerprint, billingCountry: billing_country,
      shippingCountry: shipping_country, paymentMethod: 'card',
    });

    await supabaseAdmin.from('fraud_logs').insert({
      transaction_id: txn.id, order_id: order.id, user_id: user.id,
      ml_probability: fraudResult.ml_probability, rule_score: fraudResult.rule_score,
      final_score: fraudResult.final_score, decision: fraudResult.decision,
      reasons: fraudResult.reasons, raw_features: fraudResult.features,
    });

    if (fraudResult.decision === 'BLOCK') {
      await supabaseAdmin.from('orders').update({ status: 'blocked' }).eq('id', order.id);
      await supabaseAdmin.from('transactions').update({ status: 'failed' }).eq('id', txn.id);
      return res.status(403).json({
        error: 'Transaction blocked by fraud detection system',
        decision: fraudResult.decision,
        reasons: fraudResult.reasons,
        order_id: order.id,
      });
    }

    if (fraudResult.decision === 'REVIEW') {
      await supabaseAdmin.from('orders').update({ status: 'review' }).eq('id', order.id);
      // Still allow payment to proceed to Paystack, but the order stays
      // flagged for manual review before it ships (per 2.5 decision system:
      // "high-risk score -> manual review" while payment can still complete
      // or you can choose to block outright here for a stricter policy).
    }

    // 5) Initialize Paystack transaction (only reached for APPROVE / REVIEW)
    const paystackData = await initializeTransaction({
      email: user.email,
      amountNaira: total,
      reference,
      metadata: { order_id: order.id, user_id: user.id },
      callback_url: `${process.env.FRONTEND_URL}/order-confirmation`,
    });

    res.json({
      order_id: order.id,
      reference,
      fraud_decision: fraudResult.decision,
      authorization_url: paystackData.authorization_url,
      access_code: paystackData.access_code,
    });
  } catch (err) {
    console.error('[checkout] error', err);
    res.status(500).json({ error: 'Checkout failed', detail: err.message });
  }
});

// GET /api/orders/mine
router.get('/mine', requireAuth, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('orders')
    .select('*, order_items(*, products(name, image_url))')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ orders: data });
});

// GET /api/orders/:id
router.get('/:id', requireAuth, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('orders')
    .select('*, order_items(*, products(name, image_url)), transactions(*)')
    .eq('id', req.params.id).eq('user_id', req.user.id).single();
  if (error) return res.status(404).json({ error: 'Order not found' });
  res.json({ order: data });
});

export default router;
