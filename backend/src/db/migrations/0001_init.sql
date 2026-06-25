-- Achilltest — Schema inicial
-- Ejecutar con: psql $DATABASE_URL -f 0001_init.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── USERS ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email                  TEXT NOT NULL UNIQUE,
  password_hash          TEXT NOT NULL,
  name                   TEXT NOT NULL,

  plan                   TEXT NOT NULL DEFAULT 'trial',
  organization_id        UUID,
  role                   TEXT DEFAULT 'owner',

  trial_started_at       TIMESTAMP,
  trial_ends_at          TIMESTAMP,
  is_trial_expired       BOOLEAN DEFAULT false,
  specs_used_trial       INTEGER DEFAULT 0,

  mp_subscription_id     TEXT,
  mp_subscription_status TEXT,
  mp_plan_id             TEXT,
  paid_since             TIMESTAMP,

  created_at             TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMP NOT NULL DEFAULT NOW(),
  last_login_at          TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email           ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_organization_id ON users(organization_id);
CREATE INDEX IF NOT EXISTS idx_users_mp_subscription ON users(mp_subscription_id) WHERE mp_subscription_id IS NOT NULL;

-- ── ORGANIZATIONS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organizations (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         TEXT NOT NULL,
  owner_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan         TEXT NOT NULL DEFAULT 'teammate',
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── PROJECTS ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  target_url      TEXT,
  config          JSONB DEFAULT '{}',
  github_repo     TEXT,
  github_branch   TEXT DEFAULT 'main',
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);

-- ── EXECUTIONS ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS executions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id      UUID REFERENCES projects(id) ON DELETE SET NULL,

  test_name       TEXT NOT NULL,
  target_url      TEXT NOT NULL,
  instructions    TEXT,
  device_id       TEXT DEFAULT 'desktop-chrome',

  spec_code       TEXT,
  spec_file_name  TEXT,

  status          TEXT NOT NULL DEFAULT 'pending',
  result          JSONB DEFAULT '{}',
  error_message   TEXT,
  screenshots_url TEXT,
  video_url       TEXT,

  duration_ms     INTEGER,

  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  started_at      TIMESTAMP,
  completed_at    TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_executions_user_id    ON executions(user_id);
CREATE INDEX IF NOT EXISTS idx_executions_project_id ON executions(project_id);
CREATE INDEX IF NOT EXISTS idx_executions_status     ON executions(status);
CREATE INDEX IF NOT EXISTS idx_executions_created_at ON executions(created_at DESC);

-- ── API TESTS ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_tests (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id    UUID REFERENCES projects(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  contract_type TEXT,
  contract_data JSONB,
  test_cases    JSONB,
  status        TEXT NOT NULL DEFAULT 'pending',
  result        JSONB DEFAULT '{}',
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMP
);

-- ── WCAG REPORTS ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wcag_reports (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_url   TEXT NOT NULL,
  standard     TEXT NOT NULL,
  violations   JSONB,
  total_issues INTEGER,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── ALLURE REPORTS ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS allure_reports (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id  UUID REFERENCES projects(id) ON DELETE SET NULL,
  report_data JSONB,
  report_url  TEXT,
  zip_url     TEXT,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── INTEGRATIONS ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS integrations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL,
  config          JSONB,
  credentials     JSONB,
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
