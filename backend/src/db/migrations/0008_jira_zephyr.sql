-- Achilltest — Jira + Zephyr Scale Integration (Sprint B)
-- Org-scoped: la conexión pertenece a la ORG, no al user
-- OAuth 2.0 (Atlassian Cloud) + API Token (Server/Data Center) como fallback
-- Aplicar después de 0007_organizations_expand.sql

-- ── JIRA CONNECTIONS ────────────────────────────────────────────────────────
-- Una conexión Jira por org (uno solo activo a la vez)
CREATE TABLE IF NOT EXISTS jira_connections (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id     UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  connected_by        UUID NOT NULL REFERENCES users(id),

  -- Tipo de auth
  auth_type           TEXT NOT NULL,        -- oauth | api_token
  deployment_type     TEXT NOT NULL,        -- cloud | server

  -- Cloud OAuth (Atlassian Cloud)
  cloud_id            TEXT,                  -- ID interno del site (Atlassian)
  site_url            TEXT NOT NULL,         -- e.g. https://acme.atlassian.net
  site_name           TEXT,
  access_token_encrypted   TEXT,             -- cifrado AES-256-GCM
  refresh_token_encrypted  TEXT,
  token_expires_at    TIMESTAMP,             -- OAuth tokens expiran en 1h, refresh con refresh_token

  -- API Token (Server/Data Center o Cloud personal)
  api_token_encrypted TEXT,                  -- el API token cifrado
  api_email           TEXT,                  -- email del user (parte del basic auth)

  -- Info del user de Atlassian
  atlassian_user_id   TEXT,
  atlassian_user_name TEXT,
  atlassian_user_email TEXT,
  avatar_url          TEXT,

  -- Scopes/permisos otorgados
  scopes              JSONB DEFAULT '[]',

  -- Estado
  is_active           BOOLEAN NOT NULL DEFAULT true,
  last_used_at        TIMESTAMP,
  last_error          TEXT,

  -- Zephyr Scale (plugin add-on)
  has_zephyr          BOOLEAN DEFAULT false,
  zephyr_token_encrypted TEXT,              -- Zephyr usa un token propio aparte

  connected_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jira_conn_org ON jira_connections(organization_id);

-- ── JIRA PROJECTS (sincronizados) ───────────────────────────────────────────
-- Cache de los proyectos de Jira a los que el usuario tiene acceso
CREATE TABLE IF NOT EXISTS jira_projects (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  connection_id       UUID NOT NULL REFERENCES jira_connections(id) ON DELETE CASCADE,

  jira_project_id     TEXT NOT NULL,          -- ID en Jira
  jira_project_key    TEXT NOT NULL,          -- key tipo "ACME"
  name                TEXT NOT NULL,
  description         TEXT,
  avatar_url          TEXT,
  project_type        TEXT,                    -- software | service_desk | business
  is_archived         BOOLEAN DEFAULT false,

  -- Selección del user: cuáles proyectos quiere sincronizar
  is_selected         BOOLEAN DEFAULT false,

  last_synced_at      TIMESTAMP,

  created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP NOT NULL DEFAULT NOW(),

  UNIQUE(connection_id, jira_project_id)
);

CREATE INDEX IF NOT EXISTS idx_jira_projects_org ON jira_projects(organization_id);
CREATE INDEX IF NOT EXISTS idx_jira_projects_conn ON jira_projects(connection_id);

-- ── ZEPHYR TEST CASES ──────────────────────────────────────────────────────
-- Cache de los test cases de Zephyr Scale
CREATE TABLE IF NOT EXISTS zephyr_test_cases (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  jira_project_id     UUID NOT NULL REFERENCES jira_projects(id) ON DELETE CASCADE,

  zephyr_key          TEXT NOT NULL,            -- e.g. "ACME-T1234"
  name                TEXT NOT NULL,
  objective           TEXT,
  precondition        TEXT,

  status              TEXT,                      -- Draft | Approved | Deprecated
  priority            TEXT,                      -- High | Normal | Low
  folder              TEXT,
  labels              JSONB DEFAULT '[]',

  -- Steps del test
  steps               JSONB DEFAULT '[]',        -- [{ description, expectedResult }]

  -- Linked Achilltest spec (si está vinculado)
  linked_spec_id      UUID,

  last_synced_at      TIMESTAMP NOT NULL DEFAULT NOW(),

  created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP NOT NULL DEFAULT NOW(),

  UNIQUE(jira_project_id, zephyr_key)
);

CREATE INDEX IF NOT EXISTS idx_zephyr_tests_org   ON zephyr_test_cases(organization_id);
CREATE INDEX IF NOT EXISTS idx_zephyr_tests_proj  ON zephyr_test_cases(jira_project_id);
CREATE INDEX IF NOT EXISTS idx_zephyr_tests_link  ON zephyr_test_cases(linked_spec_id) WHERE linked_spec_id IS NOT NULL;

-- ── ZEPHYR TEST CYCLES ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS zephyr_test_cycles (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  jira_project_id     UUID NOT NULL REFERENCES jira_projects(id) ON DELETE CASCADE,

  zephyr_key          TEXT NOT NULL,
  name                TEXT NOT NULL,
  description         TEXT,
  status              TEXT,                       -- Not Executed | In Progress | Done
  planned_start_date  TIMESTAMP,
  planned_end_date    TIMESTAMP,

  -- Vinculación con un Suite Run de Achilltest
  linked_suite_run_id UUID,

  created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP NOT NULL DEFAULT NOW(),

  UNIQUE(jira_project_id, zephyr_key)
);

CREATE INDEX IF NOT EXISTS idx_zephyr_cycles_org   ON zephyr_test_cycles(organization_id);
CREATE INDEX IF NOT EXISTS idx_zephyr_cycles_proj  ON zephyr_test_cycles(jira_project_id);

-- ── ZEPHYR EXECUTIONS (resultados reportados) ──────────────────────────────
-- Cada vez que reportamos a Zephyr el resultado de un test, se queda registrado
CREATE TABLE IF NOT EXISTS zephyr_executions (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  test_case_id        UUID NOT NULL REFERENCES zephyr_test_cases(id) ON DELETE CASCADE,
  cycle_id            UUID REFERENCES zephyr_test_cycles(id) ON DELETE SET NULL,

  -- Achilltest source
  spec_id             UUID,
  suite_run_id        UUID,
  execution_id        UUID,

  -- Resultado
  result              TEXT NOT NULL,              -- Pass | Fail | Blocked | Not Executed | Work In Progress
  comment             TEXT,
  executed_by         UUID REFERENCES users(id),

  -- Zephyr lo guardó?
  zephyr_execution_id TEXT,                       -- ID que devuelve Zephyr
  pushed_at           TIMESTAMP,
  push_error          TEXT,

  created_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_zephyr_exec_org      ON zephyr_executions(organization_id);
CREATE INDEX IF NOT EXISTS idx_zephyr_exec_case     ON zephyr_executions(test_case_id);
CREATE INDEX IF NOT EXISTS idx_zephyr_exec_cycle    ON zephyr_executions(cycle_id);
CREATE INDEX IF NOT EXISTS idx_zephyr_exec_suite    ON zephyr_executions(suite_run_id);

-- ── JIRA ISSUES (bugs creados desde Achilltest) ────────────────────────────
-- Cuando un test falla, podemos crear un bug en Jira directamente
CREATE TABLE IF NOT EXISTS jira_issues (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  jira_project_id     UUID NOT NULL REFERENCES jira_projects(id) ON DELETE CASCADE,

  -- Identificación en Jira
  jira_issue_key      TEXT NOT NULL,              -- e.g. "ACME-1234"
  jira_issue_id       TEXT NOT NULL,              -- ID interno
  issue_type          TEXT NOT NULL,              -- Bug | Task | Story
  summary             TEXT NOT NULL,
  status              TEXT,                        -- Open | In Progress | Done | etc
  priority            TEXT,
  html_url            TEXT NOT NULL,

  -- Linked source
  spec_id             UUID,
  execution_id        UUID,
  suite_run_id        UUID,

  -- Quién la creó
  created_by          UUID NOT NULL REFERENCES users(id),

  created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP NOT NULL DEFAULT NOW(),

  UNIQUE(jira_project_id, jira_issue_id)
);

CREATE INDEX IF NOT EXISTS idx_jira_issues_org      ON jira_issues(organization_id);
CREATE INDEX IF NOT EXISTS idx_jira_issues_proj     ON jira_issues(jira_project_id);
CREATE INDEX IF NOT EXISTS idx_jira_issues_spec     ON jira_issues(spec_id) WHERE spec_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jira_issues_run      ON jira_issues(suite_run_id) WHERE suite_run_id IS NOT NULL;
