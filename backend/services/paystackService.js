import axios from 'axios';
import crypto from 'crypto';

const PAYSTACK_BASE = 'https://api.paystack.co';
const secretKey = process.env.PAYSTACK_SECRET_KEY;

const client = axios.create({
  baseURL: PAYSTACK_BASE,
  headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' },
});

/** Initializes a Paystack transaction. Amount must be passed in kobo (NGN * 100). */
export async function initializeTransaction({ email, amountNaira, reference, metadata, callback_url }) {
  const { data } = await client.post('/transaction/initialize', {
    email,
    amount: Math.round(amountNaira * 100),
    reference,
    metadata,
    callback_url,
  });
  return data.data; // { authorization_url, access_code, reference }
}

/** Verifies a transaction by reference (called after redirect or via webhook). */
export async function verifyTransaction(reference) {
  const { data } = await client.get(`/transaction/verify/${encodeURIComponent(reference)}`);
  return data.data; // { status, amount, customer, ... }
}

/** Validates the x-paystack-signature header on incoming webhooks. */
export function verifyWebhookSignature(rawBody, signatureHeader) {
  const hash = crypto.createHmac('sha512', secretKey).update(rawBody).digest('hex');
  return hash === signatureHeader;
}
