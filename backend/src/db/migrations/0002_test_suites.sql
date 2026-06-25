-- Achilltest — Test Suites + Device Farm + Suite Runs
-- Aplicar después de 0001_init.sql

-- ── TEST SUITES ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS test_suites (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  project_id      UUID REFERENCES projects(id) ON DELETE SET NULL,

  name            TEXT NOT NULL,
  description     TEXT,

  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_test_suites_user_id ON test_suites(user_id);

-- ── SUITE ↔ SPECS ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS test_suite_specs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  suite_id      UUID NOT NULL REFERENCES test_suites(id) ON DELETE CASCADE,
  execution_id  UUID NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
  "order"       INTEGER DEFAULT 0,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),

  UNIQUE(suite_id, execution_id)
);

CREATE INDEX IF NOT EXISTS idx_suite_specs_suite     ON test_suite_specs(suite_id);
CREATE INDEX IF NOT EXISTS idx_suite_specs_execution ON test_suite_specs(execution_id);

-- ── DEVICE FARMS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS device_farms (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

  name            TEXT NOT NULL,
  devices         JSONB NOT NULL,

  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_device_farms_user_id ON device_farms(user_id);

-- ── SUITE RUNS ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS suite_runs (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  suite_id               UUID NOT NULL REFERENCES test_suites(id) ON DELETE CASCADE,
  user_id                UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_farm_id         UUID REFERENCES device_farms(id) ON DELETE SET NULL,

  status                 TEXT NOT NULL DEFAULT 'pending',
  total_specs            INTEGER NOT NULL,
  total_devices          INTEGER NOT NULL DEFAULT 1,
  total_jobs             INTEGER NOT NULL,
  passed                 INTEGER DEFAULT 0,
  failed                 INTEGER DEFAULT 0,
  skipped                INTEGER DEFAULT 0,

  playwright_report_url  TEXT,
  allure_report_url      TEXT,
  allure_zip_url         TEXT,
  reports_generated_at   TIMESTAMP,

  duration_ms            INTEGER,

  created_at             TIMESTAMP NOT NULL DEFAULT NOW(),
  started_at             TIMESTAMP,
  completed_at           TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_suite_runs_suite_id   ON suite_runs(suite_id);
CREATE INDEX IF NOT EXISTS idx_suite_runs_user_id    ON suite_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_suite_runs_created_at ON suite_runs(created_at DESC);

-- ── SUITE RUN RESULTS ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS suite_run_results (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  suite_run_id    UUID NOT NULL REFERENCES suite_runs(id) ON DELETE CASCADE,
  suite_spec_id   UUID NOT NULL REFERENCES test_suite_specs(id) ON DELETE CASCADE,
  execution_id    UUID REFERENCES executions(id) ON DELETE SET NULL,
  device_id       TEXT NOT NULL,

  status          TEXT NOT NULL DEFAULT 'pending',
  duration_ms     INTEGER,
  error_message   TEXT,
  screenshot_url  TEXT,

  started_at      TIMESTAMP,
  completed_at    TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_suite_run_results_run  ON suite_run_results(suite_run_id);
CREATE INDEX IF NOT EXISTS idx_suite_run_results_spec ON suite_run_results(suite_spec_id);
