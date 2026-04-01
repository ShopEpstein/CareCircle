-- ============================================================
-- CareCircle Network — Contractor Onboarding Schema
-- Project: CareCircleFit | dzbhoycmgaofvrpfajpc.supabase.co
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Enable pgcrypto for encryption of sensitive fields
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- TABLE 1: contractor_submissions
-- Core record — one row per onboarding submission
-- ============================================================
CREATE TABLE IF NOT EXISTS contractor_submissions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id         TEXT UNIQUE NOT NULL,           -- human-readable e.g. OB-1743521234567
  session_token         TEXT NOT NULL,                   -- browser session identifier
  submitted_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status                TEXT NOT NULL DEFAULT 'complete' CHECK (status IN ('complete', 'pending', 'flagged')),

  -- Contractor identity
  legal_name            TEXT NOT NULL,
  preferred_name        TEXT,
  email                 TEXT NOT NULL,
  phone                 TEXT NOT NULL,
  mailing_address       TEXT NOT NULL,
  emergency_contact     TEXT NOT NULL,

  -- Role & authorization (prefilled by Chase)
  assigned_role         TEXT NOT NULL,
  assigned_role_label   TEXT,
  prefilled_by_admin    BOOLEAN DEFAULT FALSE,

  -- Authorized products (array of product keys)
  authorized_products   TEXT[] NOT NULL DEFAULT '{}',

  -- Background
  sales_experience_years TEXT,
  experience_notes      TEXT,
  prior_experience_tags TEXT[],                          -- e.g. ['exp_homecare','exp_alf']

  -- Logistics
  has_transportation    BOOLEAN,
  vehicle_type          TEXT,
  availability          TEXT,
  working_hours_pref    TEXT,
  work_method           TEXT,
  geography             TEXT,

  -- Equipment
  has_smartphone        BOOLEAN DEFAULT FALSE,
  has_laptop            BOOLEAN DEFAULT FALSE,
  has_quiet_space       BOOLEAN DEFAULT FALSE,
  has_daily_email       BOOLEAN DEFAULT FALSE,
  has_call_log          BOOLEAN DEFAULT FALSE,

  -- Payment method (non-sensitive)
  payment_method        TEXT CHECK (payment_method IN ('ach', 'zelle')),
  bank_name             TEXT,                            -- Bank name only (not sensitive)
  zelle_contact         TEXT,                            -- Phone/email for zelle

  -- W-9 non-sensitive fields
  w9_entity_type        TEXT,
  w9_business_name      TEXT,
  w9_address            TEXT,
  w9_city               TEXT,
  w9_state              TEXT,
  w9_zip                TEXT,

  -- Commission tier (default on intake)
  commission_tier       TEXT DEFAULT 'silver',
  relationship_closer   BOOLEAN DEFAULT FALSE,

  -- Admin notes
  admin_notes           TEXT,
  reviewed_by           TEXT,
  reviewed_at           TIMESTAMPTZ,

  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE 2: document_acknowledgments
-- One row per document signed/acknowledged per submission
-- ============================================================
CREATE TABLE IF NOT EXISTS document_acknowledgments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id     UUID NOT NULL REFERENCES contractor_submissions(id) ON DELETE CASCADE,

  document_type     TEXT NOT NULL CHECK (document_type IN (
                      'independent_contractor_agreement',
                      'commission_schedule_exhibit_a',
                      'contractor_handbook_receipt'
                    )),

  -- Electronic signature data
  signer_legal_name TEXT NOT NULL,
  agreed            BOOLEAN NOT NULL DEFAULT FALSE,
  signed_at         TIMESTAMPTZ NOT NULL,
  signed_at_display TEXT NOT NULL,                       -- human-readable timestamp from browser

  -- Checkboxes confirmed (JSON array of checkbox IDs)
  checkboxes_confirmed TEXT[] DEFAULT '{}',

  -- Document version
  document_version  TEXT DEFAULT '1.0',

  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE 3: sensitive_data
-- W-9 tax ID + banking routing/account numbers
-- Stored encrypted — never returned to browser
-- Access: service_role key only (Chase server-side)
-- ============================================================
CREATE TABLE IF NOT EXISTS sensitive_contractor_data (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id     UUID NOT NULL REFERENCES contractor_submissions(id) ON DELETE CASCADE,

  -- W-9 sensitive fields — encrypted at rest
  tax_id_type       TEXT CHECK (tax_id_type IN ('ssn', 'ein')),
  tax_id_encrypted  TEXT,                                -- pgp_sym_encrypt(tax_id, key)

  -- Banking — encrypted at rest
  bank_routing_encrypted  TEXT,                          -- pgp_sym_encrypt(routing, key)
  bank_account_encrypted  TEXT,                          -- pgp_sym_encrypt(account, key)
  bank_account_type       TEXT CHECK (bank_account_type IN ('checking', 'savings')),

  -- Audit
  created_at        TIMESTAMPTZ DEFAULT NOW(),

  -- One-to-one with submission
  CONSTRAINT unique_submission_sensitive UNIQUE (submission_id)
);

-- ============================================================
-- TABLE 4: onboarding_final_acknowledgments
-- The 8 Section 8 acknowledgments from intake form
-- ============================================================
CREATE TABLE IF NOT EXISTS onboarding_final_acknowledgments (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id        UUID NOT NULL REFERENCES contractor_submissions(id) ON DELETE CASCADE,

  ack_handbook         BOOLEAN NOT NULL DEFAULT FALSE,
  ack_commission       BOOLEAN NOT NULL DEFAULT FALSE,
  ack_commission_only  BOOLEAN NOT NULL DEFAULT FALSE,
  ack_clawback         BOOLEAN NOT NULL DEFAULT FALSE,
  ack_confidentiality  BOOLEAN NOT NULL DEFAULT FALSE,
  ack_private_pay      BOOLEAN NOT NULL DEFAULT FALSE,
  ack_assisting_seniors BOOLEAN NOT NULL DEFAULT FALSE,
  ack_conduct          BOOLEAN NOT NULL DEFAULT FALSE,

  -- All 8 must be true — enforced here and in app
  all_confirmed        BOOLEAN GENERATED ALWAYS AS (
    ack_handbook AND ack_commission AND ack_commission_only AND ack_clawback
    AND ack_confidentiality AND ack_private_pay AND ack_assisting_seniors AND ack_conduct
  ) STORED,

  confirmed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at           TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_submission_acks UNIQUE (submission_id)
);

-- ============================================================
-- TABLE 5: admin_prefill_tokens
-- Chase pre-fills contractor details before sending link
-- ============================================================
CREATE TABLE IF NOT EXISTS admin_prefill_tokens (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token             TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),

  -- Prefill data
  contractor_name   TEXT,
  assigned_role     TEXT,
  authorized_products TEXT[],

  -- Usage tracking
  created_by        TEXT DEFAULT 'chase_turnquest',
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  used_at           TIMESTAMPTZ,
  used              BOOLEAN DEFAULT FALSE,
  expires_at        TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 days'
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_submissions_submitted_at
  ON contractor_submissions(submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_submissions_status
  ON contractor_submissions(status);

CREATE INDEX IF NOT EXISTS idx_submissions_email
  ON contractor_submissions(email);

CREATE INDEX IF NOT EXISTS idx_submissions_legal_name
  ON contractor_submissions(legal_name);

CREATE INDEX IF NOT EXISTS idx_doc_acks_submission
  ON document_acknowledgments(submission_id);

CREATE INDEX IF NOT EXISTS idx_sensitive_submission
  ON sensitive_contractor_data(submission_id);

CREATE INDEX IF NOT EXISTS idx_final_acks_submission
  ON onboarding_final_acknowledgments(submission_id);

CREATE INDEX IF NOT EXISTS idx_prefill_token
  ON admin_prefill_tokens(token);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- contractor_submissions: INSERT from anon (portal), SELECT/UPDATE service_role only
ALTER TABLE contractor_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_insert_submissions"
  ON contractor_submissions FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "service_role_all_submissions"
  ON contractor_submissions FOR ALL
  TO service_role
  USING (true);

-- document_acknowledgments: same pattern
ALTER TABLE document_acknowledgments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_insert_doc_acks"
  ON document_acknowledgments FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "service_role_all_doc_acks"
  ON document_acknowledgments FOR ALL
  TO service_role
  USING (true);

-- sensitive_contractor_data: NO anon access — service_role only
ALTER TABLE sensitive_contractor_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_only_sensitive"
  ON sensitive_contractor_data FOR ALL
  TO service_role
  USING (true);

-- sensitive data INSERT goes through API function (service_role), not browser
-- The portal calls /api/submit-onboarding which uses the service_role key server-side

-- onboarding_final_acknowledgments: INSERT anon, all else service_role
ALTER TABLE onboarding_final_acknowledgments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_insert_final_acks"
  ON onboarding_final_acknowledgments FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "service_role_all_final_acks"
  ON onboarding_final_acknowledgments FOR ALL
  TO service_role
  USING (true);

-- admin_prefill_tokens: SELECT anon (to read token on load), INSERT/UPDATE service_role
ALTER TABLE admin_prefill_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read_prefill_token"
  ON admin_prefill_tokens FOR SELECT
  TO anon
  USING (used = false AND expires_at > NOW());

CREATE POLICY "service_role_all_prefill"
  ON admin_prefill_tokens FOR ALL
  TO service_role
  USING (true);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER contractor_submissions_updated_at
  BEFORE UPDATE ON contractor_submissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- ADMIN VIEW (convenience — joins all tables)
-- ============================================================
CREATE OR REPLACE VIEW admin_onboarding_view AS
SELECT
  cs.submission_id,
  cs.submitted_at,
  cs.status,
  cs.legal_name,
  cs.email,
  cs.phone,
  cs.assigned_role_label AS role,
  cs.authorized_products,
  cs.payment_method,
  cs.bank_name,
  cs.w9_entity_type,
  cs.commission_tier,
  cs.relationship_closer,
  cs.prefilled_by_admin,
  cs.availability,
  cs.work_method,
  cs.geography,
  cs.sales_experience_years,
  cs.admin_notes,
  fa.all_confirmed AS all_acks_confirmed,
  (SELECT COUNT(*) FROM document_acknowledgments da WHERE da.submission_id = cs.id) AS docs_signed,
  scd.tax_id_type,
  scd.bank_account_type,
  cs.id AS internal_id
FROM contractor_submissions cs
LEFT JOIN onboarding_final_acknowledgments fa ON fa.submission_id = cs.id
LEFT JOIN sensitive_contractor_data scd ON scd.submission_id = cs.id
ORDER BY cs.submitted_at DESC;

-- Grant view access to service_role
GRANT SELECT ON admin_onboarding_view TO service_role;

-- ============================================================
-- VERIFY SETUP
-- ============================================================
SELECT
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_name = t.table_name AND table_schema = 'public') AS column_count
FROM information_schema.tables t
WHERE table_schema = 'public'
  AND table_name IN (
    'contractor_submissions',
    'document_acknowledgments',
    'sensitive_contractor_data',
    'onboarding_final_acknowledgments',
    'admin_prefill_tokens'
  )
ORDER BY table_name;
