-- supabase-guardian-pay-schema.sql
-- Run in Supabase SQL editor to create the guardian_pay_rates table.
-- Stores per-guardian pay rate overrides, experience level, and location.

CREATE TABLE IF NOT EXISTS guardian_pay_rates (
  email            text        PRIMARY KEY,
  name             text,
  base_rate        numeric(6,2) NOT NULL DEFAULT 15.00,
  experience_level text,        -- New, Experienced, Senior, Beacon, Seraph
  location         text,        -- City or service area
  notes            text,
  updated_at       timestamptz  NOT NULL DEFAULT now()
);

-- Row-level security: service_role only
ALTER TABLE guardian_pay_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON guardian_pay_rates
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
