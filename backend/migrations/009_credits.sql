-- Credit ledger + Razorpay payment plumbing for Blink UGC.
--
-- One credit = ₹2 (₹1 = 0.5 credit). A 5-second video costs 50 credits, a
-- 10-second video costs 100 credits. Credits are purchased in fixed packs
-- (the `credit_packs` table below) — there are no individual top-ups.
--
-- All money values are stored in PAISE (₹1 = 100 paise) so we never deal
-- in floats. Razorpay's API also natively speaks paise, which keeps the
-- types consistent end-to-end.
--
-- Idempotent — safe to re-run.

-- ---------- user_credits ----------
-- One row per user. The balance is the source of truth at any point in
-- time; the `credit_transactions` table below is the immutable ledger.
CREATE TABLE IF NOT EXISTS user_credits (
    user_id     UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    balance     INT NOT NULL DEFAULT 0 CHECK (balance >= 0),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_credits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own credits" ON user_credits;
CREATE POLICY "Users can read own credits" ON user_credits
    FOR SELECT USING (auth.uid() = user_id);
-- Writes always go through the service role from the backend.

-- ---------- credit_transactions ----------
-- Immutable ledger. Every change to user_credits.balance must have a
-- corresponding row here. `delta` is positive for credit grants/purchases,
-- negative for debits (job spend). `reason` describes the source.
-- `ref_id` is a free-form correlator — Razorpay payment id for purchases,
-- ugc_jobs.id for spends/refunds.
CREATE TABLE IF NOT EXISTS credit_transactions (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    delta       INT NOT NULL,
    reason      TEXT NOT NULL,                    -- 'purchase' | 'spend' | 'refund' | 'grant'
    ref_id      TEXT,                             -- e.g. 'pay_xxx' or job uuid
    pack_id     TEXT,                             -- credit_packs.id for purchases
    metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_tx_user
    ON credit_transactions (user_id, created_at DESC);

ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own credit transactions" ON credit_transactions;
CREATE POLICY "Users can read own credit transactions" ON credit_transactions
    FOR SELECT USING (auth.uid() = user_id);

-- ---------- credit_packs ----------
-- The four purchasable packs. `price_paise` is the gross INR price the
-- user pays at checkout (already inclusive of any Razorpay fees we eat).
-- `credits` is what lands in their `user_credits.balance` on payment
-- capture.
CREATE TABLE IF NOT EXISTS credit_packs (
    id            TEXT PRIMARY KEY,
    label         TEXT NOT NULL,
    credits       INT NOT NULL CHECK (credits > 0),
    price_paise   INT NOT NULL CHECK (price_paise > 0),
    blurb         TEXT NOT NULL DEFAULT '',
    sort_order    INT NOT NULL DEFAULT 0,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE credit_packs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view active packs" ON credit_packs;
CREATE POLICY "Anyone can view active packs" ON credit_packs
    FOR SELECT USING (is_active = true);

-- Seed the four packs the team finalized. Idempotent via ON CONFLICT.
INSERT INTO credit_packs (id, label, credits, price_paise, blurb, sort_order, is_active)
VALUES
    ('starter', 'Starter',   250, 50000,  '5 short videos to try the product', 1, true),
    ('creator', 'Creator', 1000, 180000, '~20 short videos · best for solo creators', 2, true),
    ('studio',  'Studio',  3000, 540000, '~60 short videos · a month of daily content', 3, true),
    ('agency',  'Agency',  7500, 1350000, '~150 short videos · agency-scale volume', 4, true)
ON CONFLICT (id) DO UPDATE
SET label = EXCLUDED.label,
    credits = EXCLUDED.credits,
    price_paise = EXCLUDED.price_paise,
    blurb = EXCLUDED.blurb,
    sort_order = EXCLUDED.sort_order,
    is_active = EXCLUDED.is_active;

-- ---------- razorpay_orders ----------
-- Audit row for every Razorpay Order we create. The webhook handler uses
-- this to look up which user/pack the payment belongs to (Razorpay's
-- own `notes` blob is convenient but a server-side row keeps things
-- tamper-proof).
CREATE TABLE IF NOT EXISTS razorpay_orders (
    id            TEXT PRIMARY KEY,               -- Razorpay order_id ("order_xxx")
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pack_id       TEXT NOT NULL REFERENCES credit_packs(id),
    amount_paise  INT NOT NULL,
    currency      TEXT NOT NULL DEFAULT 'INR',
    status        TEXT NOT NULL DEFAULT 'created'
        CHECK (status IN ('created','paid','failed','cancelled')),
    payment_id    TEXT,                           -- Razorpay payment_id once captured
    credited      BOOLEAN NOT NULL DEFAULT FALSE, -- idempotency guard: did we credit yet?
    raw_event     JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_razorpay_orders_user
    ON razorpay_orders (user_id, created_at DESC);

ALTER TABLE razorpay_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own razorpay orders" ON razorpay_orders;
CREATE POLICY "Users can view own razorpay orders" ON razorpay_orders
    FOR SELECT USING (auth.uid() = user_id);

-- ---------- credit_spend_for_job(jobId, userId, amount) ----------
-- Atomic debit. Inserts the ledger row and decrements user_credits in one
-- statement. Raises if balance would go negative — caller catches that
-- and surfaces 402 to the client.
CREATE OR REPLACE FUNCTION credit_spend_for_job(
    p_user_id UUID,
    p_amount  INT,
    p_job_id  TEXT
) RETURNS INT AS $$
DECLARE
    new_balance INT;
BEGIN
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'credit_spend_for_job: amount must be positive';
    END IF;

    -- Lock the row, then update. If the row doesn't exist, insert it at 0
    -- so the subsequent CHECK constraint trips and gives us a clean error.
    INSERT INTO user_credits (user_id, balance)
    VALUES (p_user_id, 0)
    ON CONFLICT (user_id) DO NOTHING;

    UPDATE user_credits
       SET balance = balance - p_amount,
           updated_at = NOW()
     WHERE user_id = p_user_id
    RETURNING balance INTO new_balance;

    -- The CHECK (balance >= 0) constraint on user_credits is what enforces
    -- the no-overdraft rule; we re-raise it as a friendlier message.
    IF new_balance IS NULL THEN
        RAISE EXCEPTION 'credit_spend_for_job: user_credits row missing for %', p_user_id;
    END IF;

    INSERT INTO credit_transactions (user_id, delta, reason, ref_id)
    VALUES (p_user_id, -p_amount, 'spend', p_job_id);

    RETURN new_balance;
END;
$$ LANGUAGE plpgsql;

-- ---------- credit_grant(userId, amount, reason, refId, packId) ----------
-- Atomic credit. Used by the Razorpay webhook (`reason='purchase'`) and
-- the admin grant endpoint (`reason='grant'`) and the refund path
-- (`reason='refund'`).
CREATE OR REPLACE FUNCTION credit_grant(
    p_user_id UUID,
    p_amount  INT,
    p_reason  TEXT,
    p_ref_id  TEXT DEFAULT NULL,
    p_pack_id TEXT DEFAULT NULL
) RETURNS INT AS $$
DECLARE
    new_balance INT;
BEGIN
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'credit_grant: amount must be positive';
    END IF;

    INSERT INTO user_credits (user_id, balance)
    VALUES (p_user_id, p_amount)
    ON CONFLICT (user_id) DO UPDATE
       SET balance = user_credits.balance + EXCLUDED.balance,
           updated_at = NOW()
    RETURNING balance INTO new_balance;

    INSERT INTO credit_transactions (user_id, delta, reason, ref_id, pack_id)
    VALUES (p_user_id, p_amount, p_reason, p_ref_id, p_pack_id);

    RETURN new_balance;
END;
$$ LANGUAGE plpgsql;
