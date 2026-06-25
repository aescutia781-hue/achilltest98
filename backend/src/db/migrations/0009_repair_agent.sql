-- Achilltest — Repair Agent (Sprint C)
-- Auto-reparar selectores rotos y asserts obsoletos usando Claude.
-- Aplicar después de 0008_jira_zephyr.sql.

-- ── EXTENDER EXECUTIONS con datos para el agente ───────────────────────────
-- Cuando un test falla, capturamos snapshot del DOM + step donde falló
ALTER TABLE executions
  ADD COLUMN IF NOT EXISTS dom_snapshot_url   TEXT,
  ADD COLUMN IF NOT EXISTS failed_step_index  INTEGER,
  ADD COLUMN IF NOT EXISTS failed_selector    TEXT,
  ADD COLUMN IF NOT EXISTS failed_action      TEXT,
  ADD COLUMN IF NOT EXISTS console_logs       JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS page_url_at_fail   TEXT;

-- ── REPAIR SESSIONS ────────────────────────────────────────────────────────
-- Cada vez que un user dispara el Repair Agent sobre un spec/execution,
-- se crea una sesión que contiene el estado y los tokens consumidos.
CREATE TABLE IF NOT EXISTS repair_sessions (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Target del repair
  spec_id             UUID,                       -- test_spec o test_suite_spec
  execution_id        UUID,                       -- execution fallida (opcional)
  suite_run_id        UUID,                       -- si vino de un suite run

  -- Estado de la sesión
  status              TEXT NOT NULL DEFAULT 'pending',
  -- pending | analyzing_snapshot | re_executing | analyzing_dom |
  -- generating_repair | awaiting_approval | applied | rejected | failed

  -- Estrategia
  investigation_mode  TEXT,                       -- snapshot | re_execute | combined

  -- Original spec code (snapshot inicial para diff y rollback)
  original_code       TEXT,
  proposed_code       TEXT,

  -- Diagnóstico del agente
  diagnosis           TEXT,                       -- explicación humana del problema
  confidence_score    NUMERIC(3,2),               -- 0.00 - 1.00 (qué tan seguro está)

  -- Cambios propuestos (estructurados para diff visual)
  changes             JSONB DEFAULT '[]',
  -- [
  --   { type: 'selector', line: 12, old: '#login-btn',
  --     new: '[data-testid="login-button"]', reason: '...' },
  --   { type: 'assert',   line: 23, old: "'Login'", new: "'Sign in'",
  --     reason: 'Botón ahora dice Sign in' },
  --   { type: 'add_step', after_line: 8,
  --     code: "await page.click('.accept-cookies')",
  --     reason: 'Modal de cookies bloquea el flujo' }
  -- ]

  -- Métricas (auditoría y cuotas)
  tokens_input        INTEGER DEFAULT 0,
  tokens_output       INTEGER DEFAULT 0,
  model_used          TEXT,                       -- claude-sonnet-4-6, etc.
  duration_ms         INTEGER,

  -- Resultado
  applied_at          TIMESTAMP,
  applied_by          UUID REFERENCES users(id),
  rejected_at         TIMESTAMP,
  rejection_reason    TEXT,
  error_message       TEXT,

  -- Rollback info
  applied_to_version  INTEGER,                    -- número de versión post-aplicación
  rollback_available  BOOLEAN DEFAULT true,

  created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_repair_sessions_org   ON repair_sessions(organization_id);
CREATE INDEX IF NOT EXISTS idx_repair_sessions_user  ON repair_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_repair_sessions_spec  ON repair_sessions(spec_id);
CREATE INDEX IF NOT EXISTS idx_repair_sessions_exec  ON repair_sessions(execution_id);
CREATE INDEX IF NOT EXISTS idx_repair_sessions_date  ON repair_sessions(created_at DESC);

-- ── SPEC REVISIONS (histórico de cambios para rollback) ────────────────────
-- Cada vez que se aplica un repair, se guarda la versión anterior
CREATE TABLE IF NOT EXISTS spec_revisions (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  spec_id             UUID NOT NULL,

  version             INTEGER NOT NULL,
  code                TEXT NOT NULL,
  source              TEXT NOT NULL,
  -- manual | repair_agent | recording | ai_generation

  -- Si vino de un repair, link a la session
  repair_session_id   UUID REFERENCES repair_sessions(id) ON DELETE SET NULL,

  created_by          UUID NOT NULL REFERENCES users(id),
  created_at          TIMESTAMP NOT NULL DEFAULT NOW(),

  UNIQUE(spec_id, version)
);

CREATE INDEX IF NOT EXISTS idx_spec_revisions_spec ON spec_revisions(spec_id);
CREATE INDEX IF NOT EXISTS idx_spec_revisions_org  ON spec_revisions(organization_id);

-- ── REPAIR USAGE (cuotas mensuales por org) ────────────────────────────────
-- Contadores mensuales de repairs ejecutados (no cuenta los fallidos)
CREATE TABLE IF NOT EXISTS repair_usage (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  year                INTEGER NOT NULL,
  month               INTEGER NOT NULL,

  repair_count        INTEGER NOT NULL DEFAULT 0,
  tokens_used         INTEGER NOT NULL DEFAULT 0,
  tokens_cost_usd     NUMERIC(10,4) DEFAULT 0,

  updated_at          TIMESTAMP NOT NULL DEFAULT NOW(),

  UNIQUE(organization_id, year, month)
);

CREATE INDEX IF NOT EXISTS idx_repair_usage_org ON repair_usage(organization_id, year, month);
