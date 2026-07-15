import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';

const router = Router();

// GET /api/products?category=&search=
router.get('/', async (req, res) => {
  const { category, search } = req.query;
  let query = supabaseAdmin.from('products').select('*').eq('is_active', true).order('created_at', { ascending: false });
  if (category) query = query.eq('category', category);
  if (search) query = query.ilike('name', `%${search}%`);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ products: data });
});

// GET /api/products/:id
router.get('/:id', async (req, res) => {
  const { data, error } = await supabaseAdmin.from('products').select('*').eq('id', req.params.id).single();
  if (error) return res.status(404).json({ error: 'Product not found' });
  res.json({ product: data });
});

export default router;
