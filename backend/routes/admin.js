import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

async function requireAdmin(req, res, next) {
  const { data: profile } = await supabaseAdmin
    .from('profiles').select('is_admin').eq('id', req.user.id).maybeSingle();
  if (!profile?.is_admin) return res.status(403).json({ error: 'Admin access required' });
  next();
}

// GET /api/admin/fraud-logs - review queue for flagged transactions
router.get('/fraud-logs', requireAuth, requireAdmin, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('fraud_logs')
    .select('*, orders(id, status, total_amount)')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ logs: data });
});

// POST /api/admin/orders/:id/resolve  { action: 'approve' | 'block' }
router.post('/orders/:id/resolve', requireAuth, requireAdmin, async (req, res) => {
  const { action } = req.body;
  const status = action === 'approve' ? 'paid' : 'blocked';
  const { error } = await supabaseAdmin.from('orders').update({ status }).eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, status });
});

// POST /api/admin/blacklist  { type: 'email'|'ip'|'card_bin', value, reason }
router.post('/blacklist', requireAuth, requireAdmin, async (req, res) => {
  const { type, value, reason } = req.body;
  const { error } = await supabaseAdmin.from('blacklist').insert({ type, value, reason });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// GET /api/admin/model-metrics - proxy the ML service's offline evaluation metrics
router.get('/model-metrics', requireAuth, requireAdmin, async (req, res) => {
  try {
    const r = await fetch(`${process.env.ML_SERVICE_URL || 'http://localhost:8000'}/metrics`);
    res.json(await r.json());
  } catch (err) {
    res.status(502).json({ error: 'ML service unreachable' });
  }
});

export default router;
