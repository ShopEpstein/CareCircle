-- supabase-addendum-schema.sql
-- Contractor addendum/amendment records with e-signature

CREATE TABLE IF NOT EXISTS contractor_addendums (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  addendum_id     TEXT        UNIQUE NOT NULL,         -- e.g. ADD-001-CONNELY
  contractor_name TEXT        NOT NULL,
  contractor_email TEXT       NOT NULL,
  addendum_title  TEXT        NOT NULL,
  terms_json      JSONB       NOT NULL DEFAULT '{}',   -- structured special terms
  signer_legal_name TEXT,
  agreed          BOOLEAN     DEFAULT FALSE,
  signed_at       TIMESTAMPTZ,
  signed_at_display TEXT,
  ip_note         TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  created_by      TEXT        DEFAULT 'chase_turnquest'
);

ALTER TABLE contractor_addendums ENABLE ROW LEVEL SECURITY;

-- Anon can insert (sign) — service_role can read all
CREATE POLICY "anon_insert_addendum" ON contractor_addendums FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_addendum" ON contractor_addendums FOR UPDATE TO anon USING (agreed = false);
CREATE POLICY "service_role_all_addendums" ON contractor_addendums FOR ALL TO service_role USING (true);
