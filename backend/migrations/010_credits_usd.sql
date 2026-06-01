-- USD pricing for international customers (PayPal-via-Razorpay).
--
-- Razorpay's PayPal payment method only accepts USD-denominated orders,
-- so we keep a parallel `price_cents` (USD) column alongside the
-- existing `price_paise` (INR). The /checkout endpoint takes a currency
-- and returns the matching amount; the webhook keys off whichever
-- column matches the captured payment.
--
-- USD prices are NOT a flat FX conversion of the INR prices — they're
-- bumped to absorb PayPal's international fee structure
-- (4.4% + $0.30 per transaction) which hits small packs disproportionately
-- hard. Review and adjust before going live.
--
--   Pack     | INR    | USD    | per-credit USD | INR-equiv @ ₹84/$
--   ---------|--------|--------|----------------|-------------------
--   Starter  | ₹500   | $7     | $0.0280        | ₹588
--   Creator  | ₹1,800 | $25    | $0.0250        | ₹2,100
--   Studio   | ₹5,400 | $70    | $0.0233        | ₹5,880
--   Agency   | ₹13,500| $170   | $0.0227        | ₹14,280
--
-- Idempotent — safe to re-run.

ALTER TABLE credit_packs
    ADD COLUMN IF NOT EXISTS price_cents INT
        CHECK (price_cents IS NULL OR price_cents > 0);

-- Backfill USD prices for the existing four packs. ON CONFLICT in the
-- original seed handles INR; this UPDATE handles USD. Safe to re-run.
UPDATE credit_packs SET price_cents = 700   WHERE id = 'starter';
UPDATE credit_packs SET price_cents = 2500  WHERE id = 'creator';
UPDATE credit_packs SET price_cents = 7000  WHERE id = 'studio';
UPDATE credit_packs SET price_cents = 17000 WHERE id = 'agency';

-- Audit the currency on every Razorpay order we create. Existing rows
-- default to INR (which is what they all were before this migration).
ALTER TABLE razorpay_orders
    ALTER COLUMN currency SET DEFAULT 'INR';

-- Drop the old CHECK that only allowed INR (if it exists from a future
-- tightening) and add a relaxed one that allows both currencies. We
-- intentionally don't lock the column down further — Razorpay supports
-- a wider menu of currencies and we may add EUR/GBP later.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'razorpay_orders'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%currency%'
    ) THEN
        ALTER TABLE razorpay_orders
            DROP CONSTRAINT IF EXISTS razorpay_orders_currency_check;
    END IF;
END$$;

ALTER TABLE razorpay_orders
    ADD CONSTRAINT razorpay_orders_currency_check
    CHECK (currency IN ('INR', 'USD'));
