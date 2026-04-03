-- supabase-training-schema.sql
-- Run this in the Supabase SQL editor to create the training_progress table.
-- This tracks every module completion and quiz score per contractor.

CREATE TABLE IF NOT EXISTS training_progress (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  email          text        NOT NULL,
  name           text        NOT NULL,
  role           text        NOT NULL,
  module_id      text        NOT NULL,
  module_title   text        NOT NULL,
  quiz_score     integer     CHECK (quiz_score >= 0 AND quiz_score <= 100),
  completed_at   timestamptz NOT NULL DEFAULT now(),

  -- One record per person per module; re-attempts update in place
  UNIQUE (email, module_id)
);

-- Index for fast lookups by email (admin dashboard, progress queries)
CREATE INDEX IF NOT EXISTS idx_training_progress_email ON training_progress (email);

-- Row-level security: only service_role can read/write (no direct client access)
ALTER TABLE training_progress ENABLE ROW LEVEL SECURITY;

-- Allow service_role full access (used by Vercel functions)
CREATE POLICY "service_role_full_access" ON training_progress
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
