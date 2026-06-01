/**
 * Credit ledger service — thin wrappers around the SQL functions in
 * migration 009_credits.sql. All writes go through these helpers so the
 * spend/grant logic stays in one place and we never hand-roll an INSERT
 * to `credit_transactions` from a route file.
 */
const supabase = require('../config/supabase');

// Pricing rule (mirrored on the web client). We deliberately keep this
// here instead of reading from the DB on every /generate call — the
// table values rarely change, and the latency on the hot path matters.
const COST_PER_VIDEO = {
  5: 50,
  10: 100,
};

/**
 * Master kill-switch for the entire credit system.
 *
 * The credit ledger + preflight + debit are skipped wholesale whenever
 * this returns false. Existing iOS clients and any local dev work keep
 * generating videos exactly like before — no 402s, no balance writes,
 * no migration required.
 *
 * Resolution order:
 *   1. CREDITS_ENABLED=true  → force on (e.g. staging without Razorpay)
 *   2. CREDITS_ENABLED=false → force off (e.g. promo / bulk test)
 *   3. RAZORPAY_KEY_ID set   → on (real money path is wired up)
 *   4. otherwise             → off
 *
 * Plan: tomorrow, after KYC + adding the Razorpay keys to .env, this
 * flips on automatically. No code change needed.
 */
function isEnabled() {
  const flag = (process.env.CREDITS_ENABLED || '').toLowerCase();
  if (flag === 'true' || flag === '1' || flag === 'yes') return true;
  if (flag === 'false' || flag === '0' || flag === 'no') return false;
  return !!process.env.RAZORPAY_KEY_ID;
}

function creditsForVideoDuration(seconds) {
  const n = Number(seconds) || 10;
  const bucket = n >= 8 ? 10 : 5;
  return COST_PER_VIDEO[bucket];
}

async function getBalance(userId) {
  const { data, error } = await supabase
    .from('user_credits')
    .select('balance')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    // Table not migrated yet — treat as zero so callers don't 500.
    // The /generate path uses isEnabled() to skip the check entirely
    // when credits aren't wired up; this branch is mostly for the
    // sidebar balance chip on web.
    if (/does not exist|schema cache|relation .* does not exist/i.test(error.message || '')) {
      return 0;
    }
    throw error;
  }
  return data?.balance ?? 0;
}

async function listTransactions(userId, limit = 50) {
  const { data, error } = await supabase
    .from('credit_transactions')
    .select('id, delta, reason, ref_id, pack_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

// Columns selected on every pack read. Kept as a constant so the public
// pack list and the single-pack lookup can't drift apart. `price_cents`
// (USD) is nullable on packs that aren't offered internationally; the
// /checkout endpoint rejects USD requests for those.
const PACK_COLS = 'id, label, credits, price_paise, price_cents, blurb, sort_order';

async function listActivePacks() {
  const { data, error } = await supabase
    .from('credit_packs')
    .select(PACK_COLS)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function getPack(id) {
  const { data, error } = await supabase
    .from('credit_packs')
    .select(`${PACK_COLS}, is_active`)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data || !data.is_active) return null;
  return data;
}

/**
 * Returns the {amount, currency} to charge for a given pack + currency
 * code, or null if the pack isn't offered in that currency. Amount is
 * always in the currency's minor unit (paise for INR, cents for USD) —
 * the unit Razorpay's API expects.
 */
function priceFor(pack, currency) {
  const cur = (currency || 'INR').toUpperCase();
  if (cur === 'INR' && pack.price_paise) {
    return { amount: pack.price_paise, currency: 'INR' };
  }
  if (cur === 'USD' && pack.price_cents) {
    return { amount: pack.price_cents, currency: 'USD' };
  }
  return null;
}

/**
 * Atomic debit. Throws on insufficient balance (the SQL CHECK constraint
 * fires) — caller should map that to a 402.
 */
async function spendForJob(userId, amount, jobId) {
  const { data, error } = await supabase.rpc('credit_spend_for_job', {
    p_user_id: userId,
    p_amount: amount,
    p_job_id: jobId,
  });
  if (error) {
    if (
      /balance.*check|check constraint|negative|violates check/i.test(error.message || '')
    ) {
      const e = new Error('insufficient_credits');
      e.code = 'INSUFFICIENT_CREDITS';
      throw e;
    }
    throw error;
  }
  return data;
}

/**
 * Atomic credit. Used by:
 *   - Razorpay webhook on payment.captured  → reason='purchase'
 *   - Manual admin grants                   → reason='grant'
 *   - Pipeline failure refunds              → reason='refund'
 */
async function grant({ userId, amount, reason, refId = null, packId = null }) {
  const { data, error } = await supabase.rpc('credit_grant', {
    p_user_id: userId,
    p_amount: amount,
    p_reason: reason,
    p_ref_id: refId,
    p_pack_id: packId,
  });
  if (error) throw error;
  return data;
}

/**
 * Refund a previously-spent amount on a job (used by the pipeline when
 * status flips to 'failed'). Idempotent: if a refund row for this job
 * already exists, no-ops.
 */
async function refundForJob(userId, amount, jobId) {
  if (!amount || amount <= 0) return null;
  const { data: existing, error: existsErr } = await supabase
    .from('credit_transactions')
    .select('id')
    .eq('user_id', userId)
    .eq('reason', 'refund')
    .eq('ref_id', jobId)
    .maybeSingle();
  if (existsErr) {
    console.warn('refundForJob existence check failed:', existsErr.message);
  }
  if (existing) return null;
  return grant({ userId, amount, reason: 'refund', refId: jobId });
}

module.exports = {
  COST_PER_VIDEO,
  isEnabled,
  creditsForVideoDuration,
  getBalance,
  listTransactions,
  listActivePacks,
  getPack,
  priceFor,
  spendForJob,
  grant,
  refundForJob,
};
