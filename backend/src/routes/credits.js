/**
 * Credit balance + Razorpay checkout routes.
 *
 *   GET  /api/credits/balance      — current user's balance
 *   GET  /api/credits/transactions — paginated ledger for current user
 *   GET  /api/credits/packs        — public list of purchasable packs
 *   POST /api/credits/checkout     — { packId } → Razorpay Order + key id
 *   POST /api/credits/admin/grant  — admin-only manual grant (test mode)
 *
 * The Razorpay webhook lives in routes/webhooks.js so it can mount
 * BEFORE the JSON body-parser (signature verification needs the raw
 * body bytes).
 */
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const credits = require('../services/credits');
const supabase = require('../config/supabase');
const razorpay = require('../config/razorpay');

// ---------- Public ----------
router.get('/packs', async (req, res) => {
  try {
    const packs = await credits.listActivePacks();
    res.json({ success: true, data: packs });
  } catch (err) {
    console.error('credits packs error:', err);
    res.status(500).json({ success: false, error: 'Failed to load packs' });
  }
});

// ---------- Authed ----------
router.use(authMiddleware);

router.get('/balance', async (req, res) => {
  try {
    const balance = await credits.getBalance(req.user.id);
    res.json({ success: true, data: { balance } });
  } catch (err) {
    console.error('credits balance error:', err);
    res.status(500).json({ success: false, error: 'Failed to load balance' });
  }
});

router.get('/transactions', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const data = await credits.listTransactions(req.user.id, limit);
    res.json({ success: true, data });
  } catch (err) {
    console.error('credits transactions error:', err);
    res.status(500).json({ success: false, error: 'Failed to load transactions' });
  }
});

/**
 * Create a Razorpay Order for the requested pack. The client then opens
 * Razorpay Checkout with this order_id, the user pays, and Razorpay POSTs
 * the captured event to our webhook — that's where the credit grant
 * actually happens. We never trust the client to confirm a purchase.
 */
router.post('/checkout', async (req, res) => {
  if (!razorpay.isEnabled()) {
    return res.status(503).json({
      success: false,
      error: 'Razorpay is not configured. Set RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET.',
    });
  }

  const { packId, currency } = req.body || {};
  if (!packId || typeof packId !== 'string') {
    return res.status(400).json({ success: false, error: 'packId is required' });
  }
  const requestedCurrency = (typeof currency === 'string' ? currency : 'INR').toUpperCase();
  if (!['INR', 'USD'].includes(requestedCurrency)) {
    return res.status(400).json({
      success: false,
      error: 'currency must be INR or USD',
    });
  }

  try {
    const pack = await credits.getPack(packId);
    if (!pack) {
      return res.status(404).json({ success: false, error: 'Pack not found' });
    }

    // Resolve the amount in the requested currency. USD is only enabled
    // on packs that have a `price_cents` value populated — gives us a
    // clean way to opt specific packs out of international sale later.
    const price = credits.priceFor(pack, requestedCurrency);
    if (!price) {
      return res.status(400).json({
        success: false,
        error: `Pack "${pack.id}" is not available in ${requestedCurrency}`,
      });
    }

    const client = razorpay.getClient();
    // Receipt is a free-form short string; useful for reconciliation in
    // the Razorpay dashboard. Keep <=40 chars.
    const receipt = `bu_${pack.id}_${Date.now().toString(36)}`.slice(0, 40);
    const order = await client.orders.create({
      amount: price.amount,
      currency: price.currency,
      receipt,
      // Notes show up on the Razorpay dashboard and in the webhook
      // payload — useful for support tickets / reconciliation. The
      // webhook also uses these as a fallback if the razorpay_orders
      // row went missing.
      notes: {
        user_id: req.user.id,
        pack_id: pack.id,
        credits: String(pack.credits),
        currency: price.currency,
        product: 'blink_ugc_credits',
      },
    });

    // Persist the order so the webhook can look it up later and tie the
    // payment to the right user + pack without trusting Razorpay notes.
    // `amount_paise` is the minor-unit amount in WHATEVER currency the
    // order is in — paise for INR orders, cents for USD orders. The
    // column name is a legacy artifact of the INR-only first version.
    const { error: insErr } = await supabase
      .from('razorpay_orders')
      .insert({
        id: order.id,
        user_id: req.user.id,
        pack_id: pack.id,
        amount_paise: price.amount,
        currency: price.currency,
        status: 'created',
        raw_event: order,
      });
    if (insErr) {
      console.warn('Failed to persist razorpay_orders row:', insErr.message);
      // Non-fatal — the webhook can still credit via notes as a fallback.
    }

    // Compute a friendly major-unit price for the client to display.
    // Razorpay returns the canonical minor-unit value in `amount`.
    const majorUnit = Math.round(price.amount / 100);
    return res.json({
      success: true,
      data: {
        orderId: order.id,
        amount: price.amount,
        currency: price.currency,
        keyId: razorpay.getPublicKeyId(),
        pack: {
          id: pack.id,
          label: pack.label,
          credits: pack.credits,
          // Friendly display values. `priceInr` is left for backwards
          // compatibility with any client that read it before currency
          // support landed.
          priceMajor: majorUnit,
          priceInr: price.currency === 'INR' ? majorUnit : null,
          priceUsd: price.currency === 'USD' ? majorUnit : null,
        },
        user: {
          id: req.user.id,
          email: req.user.email || '',
          name: req.user.user_metadata?.full_name || req.user.email || '',
        },
      },
    });
  } catch (err) {
    console.error('credits checkout error:', err);
    return res.status(500).json({
      success: false,
      error: err?.error?.description || err?.message || 'Failed to start checkout',
    });
  }
});

/**
 * Admin-only manual grant for testing. Gated by a shared-secret header
 * (`X-Admin-Token: $ADMIN_API_TOKEN`). Not exposed to clients.
 */
router.post('/admin/grant', async (req, res) => {
  const adminToken = req.headers['x-admin-token'];
  if (!process.env.ADMIN_API_TOKEN || adminToken !== process.env.ADMIN_API_TOKEN) {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }
  const { userId, amount, reason } = req.body || {};
  if (!userId || !Number.isInteger(amount) || amount <= 0) {
    return res.status(400).json({ success: false, error: 'userId + positive amount required' });
  }
  try {
    const newBalance = await credits.grant({
      userId,
      amount,
      reason: reason || 'grant',
      refId: 'admin',
    });
    res.json({ success: true, data: { balance: newBalance } });
  } catch (err) {
    console.error('credits admin grant error:', err);
    res.status(500).json({ success: false, error: 'Grant failed' });
  }
});

module.exports = router;
