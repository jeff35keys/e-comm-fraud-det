import axios from 'axios';
import { supabaseAdmin } from '../config/supabase.js';

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';
const HIGH_RISK_COUNTRIES = new Set(['RU', 'CN']);

/**
 * Builds the live feature vector for a checkout attempt from real
 * historical data in Supabase (velocity, average spend deviation, device/
 * location novelty), then calls the ML fraud-scoring microservice.
 */
export async function scoreTransaction({
  userId, amount, ip, email, cardBin, deviceFingerprint,
  billingCountry, shippingCountry, paymentMethod,
}) {
  const now = new Date();

  // --- Velocity: transactions by this user in the last hour ---
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const { count: txnCount1h } = await supabaseAdmin
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', oneHourAgo);

  // --- Failed attempts in the last hour ---
  const { count: failedAttempts } = await supabaseAdmin
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'failed')
    .gte('created_at', oneHourAgo);

  // --- Historical behavior profile ---
  const { data: stats } = await supabaseAdmin
    .from('user_transaction_stats')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('account_created_at')
    .eq('id', userId)
    .maybeSingle();

  const avgAmount = stats?.avg_amount || amount; // no history -> no deviation signal
  const avgAmountDeviation = avgAmount > 0 ? Math.abs(amount - avgAmount) / avgAmount : 0;

  const isNewDevice = stats?.last_device_fingerprint && deviceFingerprint
    ? (stats.last_device_fingerprint !== deviceFingerprint ? 1 : 0)
    : (stats ? 1 : 0);

  const isNewLocation = stats?.last_country
    ? (stats.last_country !== shippingCountry ? 1 : 0)
    : (stats ? 1 : 0);

  const accountAgeDays = profile?.account_created_at
    ? Math.max(0, Math.floor((now - new Date(profile.account_created_at)) / 86400000))
    : 0;

  const isHighRiskCountry = HIGH_RISK_COUNTRIES.has(shippingCountry) ? 1 : 0;
  const billingShippingMismatch = billingCountry && shippingCountry && billingCountry !== shippingCountry ? 1 : 0;

  const payload = {
    amount,
    hour: now.getHours(),
    day_of_week: now.getDay(),
    txn_count_1h: txnCount1h || 0,
    avg_amount_deviation: Number(avgAmountDeviation.toFixed(3)),
    is_new_device: isNewDevice,
    is_new_location: isNewLocation,
    distance_km: isNewLocation ? 500 : 5, // heuristic placeholder; swap for real geo-distance if lat/lng captured
    account_age_days: accountAgeDays,
    is_high_risk_country: isHighRiskCountry,
    payment_method: paymentMethod || 'card',
    billing_shipping_mismatch: billingShippingMismatch,
    failed_attempts_last_hour: failedAttempts || 0,
    email, ip, card_bin: cardBin,
  };

  try {
    const { data } = await axios.post(`${ML_SERVICE_URL}/predict`, payload, { timeout: 5000 });
    return { ...data, features: payload };
  } catch (err) {
    console.error('[fraudService] ML service call failed, falling back to rules-only:', err.message);
    // Fail-safe: if the ML microservice is down, default to REVIEW rather
    // than silently approving or blocking every transaction.
    return {
      decision: 'REVIEW',
      final_score: 0.5,
      ml_probability: null,
      rule_score: null,
      reasons: ['ML service unavailable - flagged for manual review as a safety fallback'],
      features: payload,
    };
  }
}

/** Updates the rolling per-user stats used to compute features on the next transaction. */
export async function updateUserStats(userId, amount, country, deviceFingerprint) {
  const { data: existing } = await supabaseAdmin
    .from('user_transaction_stats').select('*').eq('user_id', userId).maybeSingle();

  if (!existing) {
    await supabaseAdmin.from('user_transaction_stats').insert({
      user_id: userId, avg_amount: amount, txn_count_total: 1,
      last_country: country, last_device_fingerprint: deviceFingerprint,
      last_transaction_at: new Date().toISOString(),
    });
    return;
  }

  const newCount = existing.txn_count_total + 1;
  const newAvg = (existing.avg_amount * existing.txn_count_total + amount) / newCount;

  await supabaseAdmin.from('user_transaction_stats').update({
    avg_amount: newAvg, txn_count_total: newCount,
    last_country: country, last_device_fingerprint: deviceFingerprint,
    last_transaction_at: new Date().toISOString(),
  }).eq('user_id', userId);
}
