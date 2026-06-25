-- Achilltest — Allure Reports
-- Aplicar después de 0004_wcag.sql

-- ── ALLURE PROJECTS ─────────────────────────────────────────────────────────
-- Un "project" agrupa runs relacionados (mismo proyecto QA, mismo entorno).
-- El histórico se acumula por project, no por run individual.
CREATE TABLE IF NOT EXISTS allure_projects (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

  name            TEXT NOT NULL,
  description     TEXT,
  -- Categorías de tests (regression, smoke, api, e2e) para filtrado
  tags            JSONB DEFAULT '[]',

  -- Token de upload (para uploads externos vía API/CI)
  upload_token    TEXT UNIQUE,
  upload_enabled  BOOLEAN DEFAULT false,

  -- Trends rápidos (para listado sin queries)
  last_run_id     UUID,
  last_run_at     TIMESTAMP,
  last_pass_rate  NUMERIC(5,2),

  -- Stats agregadas
  total_runs      INTEGER DEFAULT 0,

  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_allure_projects_user      ON allure_projects(user_id);
CREATE INDEX IF NOT EXISTS idx_allure_projects_token     ON allure_projects(upload_token);

-- ── ALLURE RUNS ─────────────────────────────────────────────────────────────
-- Cada vez que se genera un reporte Allure (desde Suite Run, upload, etc).
CREATE TABLE IF NOT EXISTS allure_runs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id      UUID NOT NULL REFERENCES allure_projects(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Identificación
  name            TEXT,
  -- Fuente del run
  source          TEXT NOT NULL,         -- suite_run | upload | manual | ci
  source_ref      TEXT,                  -- ID del suite_run si aplica, o nombre del CI
  -- Build info (metadata del CI/CD)
  build_number    TEXT,
  branch          TEXT,
  commit_sha      TEXT,
  environment     TEXT,                  -- staging | production | dev

  -- Estado del procesamiento
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending|processing|completed|failed
  error_message   TEXT,

  -- Estadísticas (computadas al procesar)
  total_tests     INTEGER DEFAULT 0,
  passed          INTEGER DEFAULT 0,
  failed          INTEGER DEFAULT 0,
  broken          INTEGER DEFAULT 0,
  skipped         INTEGER DEFAULT 0,
  unknown         INTEGER DEFAULT 0,
  pass_rate       NUMERIC(5,2),
  duration_ms     INTEGER,

  -- Stats por severity de Allure (blocker, critical, normal, minor, trivial)
  severity_stats  JSONB DEFAULT '{}',

  -- Reporte generado
  report_url      TEXT,                  -- /reports/allure/{projectId}/{runId}/index.html
  results_zip_url TEXT,                  -- ZIP descargable de allure-results raw
  report_size_kb  INTEGER,

  -- Compartir público
  share_token     TEXT UNIQUE,           -- Si activado, accesible sin auth
  share_enabled   BOOLEAN DEFAULT false,
  share_expires_at TIMESTAMP,

  -- Snapshot de tests (para flaky detection)
  -- Map de testFullName → status, para comparar entre runs
  tests_snapshot  JSONB,

  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  started_at      TIMESTAMP,
  completed_at    TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_allure_runs_project   ON allure_runs(project_id);
CREATE INDEX IF NOT EXISTS idx_allure_runs_user      ON allure_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_allure_runs_share     ON allure_runs(share_token);
CREATE INDEX IF NOT EXISTS idx_allure_runs_createdat ON allure_runs(created_at DESC);

-- ── ALLURE FLAKY TESTS ──────────────────────────────────────────────────────
-- Tests que pasan/fallan intermitentemente en el mismo project.
-- Se actualiza después de cada run con un análisis de los últimos N runs.
CREATE TABLE IF NOT EXISTS allure_flaky_tests (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id      UUID NOT NULL REFERENCES allure_projects(id) ON DELETE CASCADE,

  test_full_name  TEXT NOT NULL,
  test_name       TEXT,
  -- Stats de los últimos 20 runs
  runs_analyzed   INTEGER NOT NULL,
  pass_count      INTEGER NOT NULL,
  fail_count      INTEGER NOT NULL,
  broken_count    INTEGER NOT NULL,
  -- Score de flakiness: 0.0 = estable, 1.0 = totalmente impredecible
  flaky_score     NUMERIC(3,2) NOT NULL,
  -- Último status conocido
  last_status     TEXT,
  last_run_id     UUID,
  last_seen_at    TIMESTAMP NOT NULL,

  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),

  UNIQUE(project_id, test_full_name)
);

CREATE INDEX IF NOT EXISTS idx_allure_flaky_project ON allure_flaky_tests(project_id);
CREATE INDEX IF NOT EXISTS idx_allure_flaky_score   ON allure_flaky_tests(flaky_score DESC);
