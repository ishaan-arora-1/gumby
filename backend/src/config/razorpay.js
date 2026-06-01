/**
 * Razorpay client + helpers.
 *
 * Env vars:
 *   RAZORPAY_KEY_ID         (required) — "rzp_test_xxx" or "rzp_live_xxx"
 *   RAZORPAY_KEY_SECRET     (required) — server-side secret
 *   RAZORPAY_WEBHOOK_SECRET (required) — value configured in the Razorpay
 *                                        dashboard for the webhook endpoint
 *
 * We lazy-init the SDK so a backend with the credentials missing still
 * boots — the /api/credits/checkout endpoint will return 503 instead.
 */
let Razorpay;
try {
  Razorpay = require('razorpay');
} catch {
  Razorpay = null;
}

let _client = null;
function getClient() {
  if (_client) return _client;
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!Razorpay || !key_id || !key_secret) return null;
  _client = new Razorpay({ key_id, key_secret });
  return _client;
}

function isEnabled() {
  return !!getClient();
}

function getPublicKeyId() {
  return process.env.RAZORPAY_KEY_ID || null;
}

function getWebhookSecret() {
  return process.env.RAZORPAY_WEBHOOK_SECRET || null;
}

module.exports = {
  getClient,
  isEnabled,
  getPublicKeyId,
  getWebhookSecret,
};
