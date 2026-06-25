-- Achilltest — WCAG / Accesibilidad
-- Aplicar después de 0003_api_testing.sql

-- ── WCAG TARGETS ────────────────────────────────────────────────────────────
-- Cada URL/sitio que el cliente analiza periódicamente.
-- Permite tracking histórico por sitio.
CREATE TABLE IF NOT EXISTS wcag_targets (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

  name            TEXT NOT NULL,
  url             TEXT NOT NULL,

  -- Configuración por default cuando se ejecutan análisis
  default_level   TEXT NOT NULL DEFAULT 'AA',   -- A | AA | AAA
  default_device  TEXT,                         -- deviceId del catálogo
  -- Permitir personalizar reglas (lista de tags axe a incluir/excluir)
  config          JSONB DEFAULT '{}',

  -- Trends rápidos
  last_score      INTEGER,
  last_analysis_id UUID,
  last_analyzed_at TIMESTAMP,

  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wcag_targets_user ON wcag_targets(user_id);

-- ── WCAG ANALYSES ───────────────────────────────────────────────────────────
-- Cada vez que se ejecuta un análisis sobre una URL.
CREATE TABLE IF NOT EXISTS wcag_analyses (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  target_id       UUID REFERENCES wcag_targets(id) ON DELETE SET NULL,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Snapshot de los parámetros
  url             TEXT NOT NULL,
  name            TEXT,
  level           TEXT NOT NULL,                -- A | AA | AAA
  device_id       TEXT,                         -- desktop-chrome | iphone-15-pro | ...

  -- Estado
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending|running|completed|failed
  error_message   TEXT,

  -- Score y métricas
  score                INTEGER,                  -- 0-100
  total_issues         INTEGER DEFAULT 0,
  critical_count       INTEGER DEFAULT 0,
  high_count           INTEGER DEFAULT 0,
  medium_count         INTEGER DEFAULT 0,
  low_count            INTEGER DEFAULT 0,
  passed_rules         INTEGER DEFAULT 0,
  inapplicable_rules   INTEGER DEFAULT 0,

  -- Métricas por categoría
  category_scores      JSONB DEFAULT '{}',       -- { structure: 85, keyboard: 92, ... }

  -- Datos crudos del análisis
  axe_results          JSONB,                    -- Output original de axe-core
  structural_results   JSONB,                    -- Headings, landmarks
  keyboard_results     JSONB,                    -- Tab order, focus traps
  visual_results       JSONB,                    -- Touch targets, sizes
  cognitive_results    JSONB,                    -- Lectura, complejidad
  simulations          JSONB,                    -- URLs/paths a screenshots con filtros

  -- Reportes generados (paths relativos servidos como estáticos)
  report_html_url      TEXT,
  report_pdf_url       TEXT,
  report_json_url      TEXT,
  screenshot_url       TEXT,                     -- Screenshot principal de la página

  -- Metadata de la ejecución
  duration_ms          INTEGER,

  created_at           TIMESTAMP NOT NULL DEFAULT NOW(),
  started_at           TIMESTAMP,
  completed_at         TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_wcag_analyses_user      ON wcag_analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_wcag_analyses_target    ON wcag_analyses(target_id);
CREATE INDEX IF NOT EXISTS idx_wcag_analyses_createdat ON wcag_analyses(created_at DESC);

-- ── WCAG ISSUES ─────────────────────────────────────────────────────────────
-- Cada problema individual detectado. Permite drill-down y tracking.
CREATE TABLE IF NOT EXISTS wcag_issues (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  analysis_id          UUID NOT NULL REFERENCES wcag_analyses(id) ON DELETE CASCADE,

  -- Identificación
  rule_id              TEXT NOT NULL,                -- ej. "color-contrast"
  source               TEXT NOT NULL,                -- axe | structural | keyboard | visual | cognitive
  category             TEXT,                         -- contrast | aria | keyboard | semantic | ...

  -- Severidad y priorización
  severity             TEXT NOT NULL,                -- critical | high | medium | low
  impact               TEXT,                         -- minor | moderate | serious | critical (axe)
  wcag_criterion       TEXT,                         -- "1.4.3 Contrast (Minimum)"
  wcag_level           TEXT,                         -- A | AA | AAA
  affected_users       JSONB DEFAULT '[]',           -- ["color_blind", "low_vision", ...]

  -- Localización
  selector             TEXT,                         -- CSS selector del elemento
  html_snippet         TEXT,                         -- HTML del elemento problemático
  xpath                TEXT,
  page_section         TEXT,                         -- header | nav | main | footer

  -- Descripción técnica (del checker)
  rule_description     TEXT NOT NULL,
  technical_help       TEXT,
  help_url             TEXT,
  failure_summary      TEXT,

  -- Descripción humana (traducida por IA, opcional)
  human_title          TEXT,
  human_description    TEXT,
  human_impact         TEXT,
  human_fix_suggestion TEXT,
  fix_code_snippet     TEXT,

  -- Estado de remediación
  status               TEXT DEFAULT 'open',          -- open | resolved | ignored | wontfix
  ignored_reason       TEXT,

  created_at           TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wcag_issues_analysis ON wcag_issues(analysis_id);
CREATE INDEX IF NOT EXISTS idx_wcag_issues_severity ON wcag_issues(severity);
CREATE INDEX IF NOT EXISTS idx_wcag_issues_status   ON wcag_issues(status);
CREATE INDEX IF NOT EXISTS idx_wcag_issues_rule     ON wcag_issues(rule_id);
