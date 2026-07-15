import { supabaseAdmin } from '../config/supabase.js';

/**
 * Verifies the Supabase-issued JWT sent by the frontend in the
 * Authorization: Bearer <token> header, and attaches req.user.
 */
export async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing bearer token' });

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: 'Invalid or expired session' });

    req.user = data.user;
    next();
  } catch (err) {
    console.error('[auth] verification failed', err);
    res.status(401).json({ error: 'Authentication failed' });
  }
}
