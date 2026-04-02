-- ============================================================
-- CareCircle Network — Provider Intelligence Schema
-- Project: CareCircleFit | dzbhoycmgaofvrpfajpc.supabase.co
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- ============================================================
-- TABLE: providers
-- Stores researched provider profiles with 7-dimension scoring
-- Populated automatically by /api/research-provider endpoint
-- ============================================================
CREATE TABLE IF NOT EXISTS providers (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_key          TEXT UNIQUE NOT NULL,          -- url-safe slug e.g. "assisting-seniors-llc"

  -- Identity
  name                  TEXT NOT NULL,
  loc                   TEXT,                          -- "City, State"
  type                  TEXT,                          -- provider type (ALF, SNF, Home Care, etc.)
  founded               INT,
  ownership             TEXT,

  -- Master score & recommendation
  overall_score         NUMERIC(3,1),                  -- 1.0 – 10.0
  recommendation        TEXT CHECK (recommendation IN (
                          'RECOMMEND',
                          'RECOMMEND_WITH_CAUTION',
                          'DO_NOT_RECOMMEND'
                        )),
  clinical_risk_level   TEXT CHECK (clinical_risk_level IN ('LOW','MODERATE','HIGH','UNKNOWN')),
  confidence_pct        INT CHECK (confidence_pct BETWEEN 0 AND 100),

  -- 7-dimension scores (JSONB — e.g. {"compliance":"8.5/10","clinical":"7.0/10",...,"overall":"7.8"})
  scores                JSONB,

  -- Score color classifications (JSONB — e.g. {"compliance":"sc-good",...})
  score_colors          JSONB,

  -- Narrative intelligence (JSONB arrays)
  green                 JSONB,    -- [{t: "title", b: "body"}, ...]
  red                   JSONB,    -- [{t: "title", b: "body"}, ...]
  findings              JSONB,    -- [{t: "good|warn|bad|info", title, detail, src}, ...]
  quotes                JSONB,    -- [{t: "quote text", a: "attribution"}, ...]

  -- Marketing vs Reality gap analysis
  marketing_claims      JSONB,    -- ["claim 1", "claim 2", ...]
  reality_signals       JSONB,    -- ["reality 1", "reality 2", ...]

  -- Staffing
  staffing_risk_patterns JSONB,   -- ["pattern 1", "pattern 2", ...]

  -- CareCircle positioning
  best_for              TEXT,
  avoid_if              TEXT,
  compare_note          TEXT,
  alternatives_note     TEXT,

  -- Data quality
  gaps                  TEXT,     -- known data gaps as free text

  -- Audit
  researched_by         TEXT DEFAULT 'admin',
  researched_at         TIMESTAMPTZ DEFAULT NOW(),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_providers_key
  ON providers(provider_key);

CREATE INDEX IF NOT EXISTS idx_providers_name
  ON providers(name);

CREATE INDEX IF NOT EXISTS idx_providers_recommendation
  ON providers(recommendation);

CREATE INDEX IF NOT EXISTS idx_providers_overall_score
  ON providers(overall_score DESC);

CREATE INDEX IF NOT EXISTS idx_providers_researched_at
  ON providers(researched_at DESC);

CREATE INDEX IF NOT EXISTS idx_providers_loc
  ON providers(loc);

-- ============================================================
-- ROW LEVEL SECURITY
-- Research results are internal — no anon read/write
-- All access goes through service_role (server-side API only)
-- ============================================================
ALTER TABLE providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_providers"
  ON providers FOR ALL
  TO service_role
  USING (true);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
CREATE TRIGGER providers_updated_at
  BEFORE UPDATE ON providers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- VERIFY
-- ============================================================
SELECT table_name, COUNT(*) AS column_count
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'providers'
GROUP BY table_name;
