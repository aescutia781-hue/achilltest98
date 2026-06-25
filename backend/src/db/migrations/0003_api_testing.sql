-- Achilltest — API Testing
-- Aplicar después de 0002_test_suites.sql

-- ── API COLLECTIONS ─────────────────────────────────────────────────────────
-- Una "colección" es la importación de un contrato (OpenAPI/Postman) que
-- agrupa N endpoints con sus tests generados.
CREATE TABLE IF NOT EXISTS api_collections (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  project_id      UUID REFERENCES projects(id) ON DELETE SET NULL,

  name            TEXT NOT NULL,
  description     TEXT,

  -- Contrato
  contract_type   TEXT NOT NULL,            -- openapi | postman | insomnia
  contract_data   JSONB NOT NULL,           -- el contrato parseado
  base_url        TEXT,                     -- override del server del contrato

  -- Auth config (sin secretos)
  auth_config     JSONB DEFAULT '{}',       -- { type, loginUrl, tokenField, ... }
  -- Encryption config (sin la llave)
  encryption_config JSONB DEFAULT '{}',     -- { enabled, algo, fields, wrapper }
  -- OTP config (sin el secret)
  otp_config      JSONB DEFAULT '{}',       -- { enabled, type, verifyUrl, ... }

  total_endpoints INTEGER DEFAULT 0,
  total_tests     INTEGER DEFAULT 0,

  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_collections_user ON api_collections(user_id);

-- ── API TEST CASES ──────────────────────────────────────────────────────────
-- Cada caso de prueba generado para un endpoint.
CREATE TABLE IF NOT EXISTS api_test_cases (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  collection_id   UUID NOT NULL REFERENCES api_collections(id) ON DELETE CASCADE,

  -- Identificación
  endpoint        TEXT NOT NULL,            -- "POST /api/users"
  test_name       TEXT NOT NULL,            -- "Happy path: crear usuario válido"
  category        TEXT NOT NULL,            -- happy_path | negative | edge | security
  generated_by    TEXT NOT NULL,            -- mechanical | ai

  -- Definición del test (lo que ejecuta el runner)
  request_method  TEXT NOT NULL,
  request_path    TEXT NOT NULL,            -- con {placeholders}
  request_headers JSONB DEFAULT '{}',
  request_query   JSONB DEFAULT '{}',
  request_body    JSONB,
  -- Para encadenamiento
  capture_vars    JSONB DEFAULT '{}',       -- { token: "$.data.token" }
  use_vars        JSONB DEFAULT '[]',       -- ["token", "userId"]
  -- Para encriptación
  needs_encryption BOOLEAN DEFAULT false,
  needs_auth       BOOLEAN DEFAULT true,
  -- Para casos de seguridad (forzar omisión)
  override_auth    BOOLEAN DEFAULT false,   -- ej. test "sin auth" envía SIN header

  -- Validaciones esperadas
  expected_status   INTEGER NOT NULL,
  expected_schema   JSONB,                  -- JSON Schema del response esperado
  validations       JSONB DEFAULT '[]',     -- [{type: "headerExists", value: ...}, ...]

  -- Orden y dependencias
  "order"           INTEGER DEFAULT 0,
  depends_on        UUID REFERENCES api_test_cases(id) ON DELETE SET NULL,

  enabled         BOOLEAN DEFAULT true,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_test_cases_collection ON api_test_cases(collection_id);
CREATE INDEX IF NOT EXISTS idx_api_test_cases_endpoint   ON api_test_cases(endpoint);

-- ── API TEST SECRETS ────────────────────────────────────────────────────────
-- Llaves de encriptación, OTP secrets, login credentials.
-- Encriptados con master key del servidor (column-level encryption simulado).
CREATE TABLE IF NOT EXISTS api_test_secrets (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  collection_id   UUID NOT NULL REFERENCES api_collections(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Qué tipo de secreto
  secret_type     TEXT NOT NULL,            -- encryption_key | hmac_secret | otp_totp | login_password | api_key | oauth_secret
  -- Identificador (para que un mismo collection tenga varios secretos del mismo tipo)
  label           TEXT NOT NULL,

  -- El valor ya viene encriptado con la master key
  encrypted_value TEXT NOT NULL,            -- AES-256-GCM(masterKey, plaintext)
  iv              TEXT NOT NULL,            -- IV usado
  auth_tag        TEXT NOT NULL,            -- auth tag GCM

  -- Hint mostrado al usuario (4 últimos chars o similar) para que recuerde sin revelar
  display_hint    TEXT,

  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),

  UNIQUE(collection_id, secret_type, label)
);

CREATE INDEX IF NOT EXISTS idx_api_test_secrets_collection ON api_test_secrets(collection_id);

-- ── API TEST RUNS ───────────────────────────────────────────────────────────
-- Cada vez que se ejecuta una colección completa.
CREATE TABLE IF NOT EXISTS api_test_runs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  collection_id   UUID NOT NULL REFERENCES api_collections(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  status          TEXT NOT NULL DEFAULT 'pending',
  base_url        TEXT,                     -- URL contra la que se corrió

  total_tests     INTEGER NOT NULL,
  passed          INTEGER DEFAULT 0,
  failed          INTEGER DEFAULT 0,
  skipped         INTEGER DEFAULT 0,

  duration_ms     INTEGER,
  report_url      TEXT,

  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  started_at      TIMESTAMP,
  completed_at    TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_api_test_runs_collection ON api_test_runs(collection_id);
CREATE INDEX IF NOT EXISTS idx_api_test_runs_user       ON api_test_runs(user_id);

-- ── API TEST RESULTS ────────────────────────────────────────────────────────
-- El resultado individual de cada test dentro de un run.
CREATE TABLE IF NOT EXISTS api_test_results (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id          UUID NOT NULL REFERENCES api_test_runs(id) ON DELETE CASCADE,
  test_case_id    UUID NOT NULL REFERENCES api_test_cases(id) ON DELETE CASCADE,

  status          TEXT NOT NULL DEFAULT 'pending',  -- pending|passed|failed|skipped
  duration_ms     INTEGER,

  -- Lo que pasó realmente
  actual_method   TEXT,
  actual_url      TEXT,
  actual_headers  JSONB,
  actual_body     JSONB,                    -- el body que se envió (post-encriptación)
  actual_status   INTEGER,
  actual_response JSONB,                    -- response (post-desencriptación)

  -- Validaciones que se ejecutaron y su resultado
  validation_results JSONB DEFAULT '[]',
  error_message   TEXT,

  started_at      TIMESTAMP,
  completed_at    TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_api_test_results_run    ON api_test_results(run_id);
CREATE INDEX IF NOT EXISTS idx_api_test_results_status ON api_test_results(status);
