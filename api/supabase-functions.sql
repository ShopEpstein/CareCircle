-- ============================================================
-- CareCircle — Encrypted Sensitive Data Insert Function
-- Run AFTER supabase-schema.sql in the same SQL Editor session
-- ============================================================
-- This function runs with SECURITY DEFINER so it can write to
-- sensitive_contractor_data even when called with service_role.
-- The encryption key is passed from the Vercel function server-side
-- and never stored or logged by Supabase.
-- ============================================================

CREATE OR REPLACE FUNCTION insert_sensitive_contractor_data(
  p_submission_id       UUID,
  p_tax_id_type         TEXT,
  p_tax_id              TEXT,
  p_bank_routing        TEXT,
  p_bank_account        TEXT,
  p_bank_account_type   TEXT,
  p_encryption_key      TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO sensitive_contractor_data (
    submission_id,
    tax_id_type,
    tax_id_encrypted,
    bank_routing_encrypted,
    bank_account_encrypted,
    bank_account_type
  ) VALUES (
    p_submission_id,
    p_tax_id_type,
    CASE WHEN p_tax_id IS NOT NULL AND p_tax_id != ''
      THEN pgp_sym_encrypt(p_tax_id, p_encryption_key)
      ELSE NULL
    END,
    CASE WHEN p_bank_routing IS NOT NULL AND p_bank_routing != ''
      THEN pgp_sym_encrypt(p_bank_routing, p_encryption_key)
      ELSE NULL
    END,
    CASE WHEN p_bank_account IS NOT NULL AND p_bank_account != ''
      THEN pgp_sym_encrypt(p_bank_account, p_encryption_key)
      ELSE NULL
    END,
    p_bank_account_type
  )
  ON CONFLICT (submission_id) DO NOTHING;
END;
$$;

-- Grant execute to service_role only
REVOKE ALL ON FUNCTION insert_sensitive_contractor_data FROM PUBLIC;
GRANT EXECUTE ON FUNCTION insert_sensitive_contractor_data TO service_role;

-- ============================================================
-- DECRYPT HELPER (for Chase's use only — run manually in SQL editor)
-- Usage: SELECT * FROM decrypt_sensitive_data('submission-uuid-here');
-- ============================================================
CREATE OR REPLACE FUNCTION decrypt_sensitive_data(
  p_submission_id UUID,
  p_encryption_key TEXT DEFAULT current_setting('app.encryption_key', true)
)
RETURNS TABLE (
  submission_id       UUID,
  tax_id_type         TEXT,
  tax_id_decrypted    TEXT,
  bank_routing        TEXT,
  bank_account        TEXT,
  bank_account_type   TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    scd.submission_id,
    scd.tax_id_type,
    CASE WHEN scd.tax_id_encrypted IS NOT NULL
      THEN pgp_sym_decrypt(scd.tax_id_encrypted::bytea, p_encryption_key)
      ELSE NULL
    END AS tax_id_decrypted,
    CASE WHEN scd.bank_routing_encrypted IS NOT NULL
      THEN pgp_sym_decrypt(scd.bank_routing_encrypted::bytea, p_encryption_key)
      ELSE NULL
    END AS bank_routing,
    CASE WHEN scd.bank_account_encrypted IS NOT NULL
      THEN pgp_sym_decrypt(scd.bank_account_encrypted::bytea, p_encryption_key)
      ELSE NULL
    END AS bank_account,
    scd.bank_account_type
  FROM sensitive_contractor_data scd
  WHERE scd.submission_id = p_submission_id;
END;
$$;

REVOKE ALL ON FUNCTION decrypt_sensitive_data FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decrypt_sensitive_data TO service_role;

-- ============================================================
-- VERIFY functions were created
-- ============================================================
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('insert_sensitive_contractor_data', 'decrypt_sensitive_data', 'update_updated_at');
