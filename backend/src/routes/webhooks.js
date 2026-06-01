/**
 * Razorpay webhook handler.
 *
 *   POST /api/webhooks/razorpay   — verifies HMAC, credits the user on
 *                                   payment.captured, marks the order row.
 *
 * Signature verification MUST run against the exact raw request bytes
 * Razorpay sent (any reformatting/whitespace change breaks the HMAC), so
 * this router is mounted with `express.raw()` BEFORE the global
 * `express.json()` middleware in src/index.js.
 */
const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const credits = require('../services/credits');
const razorpay = require('../config/razorpay');

router.post(
  '/razorpay',
  express.raw({ type: '*/*', limit: '1mb' }),
  async (req, res) => {
    const secret = razorpay.getWebhookSecret();
    if (!secret) {
      console.error('Razorpay webhook hit but RAZORPAY_WEBHOOK_SECRET is unset');
      return res.status(503).send('webhook not configured');
    }

    const signature = req.headers['x-razorpay-signature'];
    if (!signature || typeof signature !== 'string') {
      return res.status(400).send('missing signature');
    }
    const raw = req.body; // Buffer thanks to express.raw

    const expected = crypto
      .createHmac('sha256', secret)
      .update(raw)
      .digest('hex');

    // Constant-time compare; Buffer.from each side to a fixed-length hex
    // string so a length mismatch doesn't throw.
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(signature, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      console.warn('Razorpay webhook signature mismatch');
      return res.status(400).send('invalid signature');
    }

    let payload;
    try {
      payload = JSON.parse(raw.toString('utf8'));
    } catch {
      return res.status(400).send('invalid json');
    }

    const event = payload?.event;
    const payment = payload?.payload?.payment?.entity;

    // We only act on payment.captured — that's the moment money is
    // actually settled. We acknowledge everything else with 200 so
    // Razorpay doesn't retry forever.
    if (event !== 'payment.captured' || !payment) {
      return res.json({ ok: true, ignored: event });
    }

    try {
      await handlePaymentCaptured(payment);
      return res.json({ ok: true });
    } catch (err) {
      console.error('Razorpay webhook handler error:', err);
      // 500 makes Razorpay retry — that's what we want for a transient
      // DB blip. A poison-pill payload that always throws will eventually
      // be auto-disabled by Razorpay (and show up on the dashboard).
      return res.status(500).send('internal error');
    }
  }
);

async function handlePaymentCaptured(payment) {
  const orderId = payment.order_id;
  const paymentId = payment.id;
  const amountPaid = payment.amount; // paise

  // Look up our pre-recorded order row so we know exactly which user/pack
  // this payment belongs to. Falls back to the payment.notes blob if the
  // row is missing (shouldn't happen in normal operation).
  const { data: orderRow, error: orderErr } = await supabase
    .from('razorpay_orders')
    .select('*')
    .eq('id', orderId)
    .maybeSingle();
  if (orderErr) throw orderErr;

  let userId = orderRow?.user_id;
  let packId = orderRow?.pack_id;
  if (!userId || !packId) {
    const notes = payment.notes || {};
    userId = notes.user_id;
    packId = notes.pack_id;
    if (!userId || !packId) {
      console.warn(`Razorpay payment ${paymentId} has no user/pack mapping`);
      return;
    }
  }

  // Idempotency — if we've already credited this order, do nothing.
  if (orderRow?.credited) {
    console.log(`Razorpay payment ${paymentId} already credited, skipping`);
    return;
  }

  const pack = await credits.getPack(packId);
  if (!pack) {
    console.warn(`Razorpay payment ${paymentId} references unknown pack ${packId}`);
    return;
  }

  // Sanity check: amount paid should match the pack's price in the
  // order's currency. Order row is the source of truth for which
  // currency the customer was charged in — Razorpay's payment.currency
  // mirrors that, and we expect it to match pack.price_paise (INR) or
  // pack.price_cents (USD). Mismatches log loudly but never block the
  // credit grant — we'd rather over-credit a paying customer than
  // shortchange them.
  const paidCurrency = (payment.currency || orderRow?.currency || 'INR').toUpperCase();
  const expected =
    paidCurrency === 'USD' ? pack.price_cents :
    paidCurrency === 'INR' ? pack.price_paise :
    null;
  if (expected && amountPaid !== expected) {
    console.warn(
      `Razorpay payment ${paymentId} amount ${amountPaid} ${paidCurrency} ` +
      `!= pack ${pack.id} expected ${expected} ${paidCurrency}`
    );
  }

  await credits.grant({
    userId,
    amount: pack.credits,
    reason: 'purchase',
    refId: paymentId,
    packId: pack.id,
  });

  // Mark the order row as paid + credited. Use upsert in case the order
  // row was never created (rare: order created on a different env).
  await supabase
    .from('razorpay_orders')
    .upsert(
      {
        id: orderId,
        user_id: userId,
        pack_id: pack.id,
        amount_paise: amountPaid,
        currency: paidCurrency,
        status: 'paid',
        payment_id: paymentId,
        credited: true,
        raw_event: payment,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

  console.log(
    `[razorpay] credited user=${userId.slice(0, 8)} pack=${pack.id} ` +
    `credits=${pack.credits} amount=${amountPaid} ${paidCurrency} payment=${paymentId}`
  );
}

module.exports = router;
