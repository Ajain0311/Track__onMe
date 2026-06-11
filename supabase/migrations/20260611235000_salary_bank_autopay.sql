-- Test-bank details on salaries, bank snapshot on payouts, and a single-row
-- payroll settings table that drives the Autopay scheduler.

ALTER TABLE salaries ADD COLUMN IF NOT EXISTS bank_name      TEXT;
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS bank_account   TEXT;  -- TEST account number, never real
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS bank_ifsc      TEXT;

ALTER TABLE salary_payouts ADD COLUMN IF NOT EXISTS bank_ref TEXT;  -- e.g. 'AttendTrack Test Bank ••7421'

CREATE TABLE IF NOT EXISTS salary_settings (
  id              INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- single row
  autopay_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  autopay_day     INT NOT NULL DEFAULT 1 CHECK (autopay_day BETWEEN 1 AND 28),
  updated_by      UUID,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO salary_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE salary_settings ENABLE ROW LEVEL SECURITY;
