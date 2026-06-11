-- Salaries + payout ledger.
-- Backend-only tables (service role). RLS is enabled with no policies so
-- anon/authenticated clients cannot touch them directly.

CREATE TABLE IF NOT EXISTS salaries (
  user_id        UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  base_salary    NUMERIC(12,2) NOT NULL CHECK (base_salary >= 0),
  currency       TEXT NOT NULL DEFAULT 'INR',
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  updated_by     UUID,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS salary_payouts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period        TEXT NOT NULL,                       -- 'YYYY-MM'
  amount        NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  currency      TEXT NOT NULL DEFAULT 'INR',
  status        TEXT NOT NULL DEFAULT 'pending',     -- pending | paid | failed
  method        TEXT NOT NULL DEFAULT 'simulated',   -- stripe_test | simulated
  provider_ref  TEXT,                                -- e.g. Stripe PaymentIntent id
  note          TEXT,
  dispatched_by UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, period)
);

CREATE INDEX IF NOT EXISTS idx_salary_payouts_period ON salary_payouts (period);
CREATE INDEX IF NOT EXISTS idx_salary_payouts_user   ON salary_payouts (user_id);

ALTER TABLE salaries       ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_payouts ENABLE ROW LEVEL SECURITY;
