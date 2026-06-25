-- Achilltest — GitHub Integration (Push only)
-- Aplicar después de 0005_allure.sql

-- ── GITHUB CONNECTIONS ──────────────────────────────────────────────────────
-- Conexión OAuth de un user con GitHub. Solo una activa por user.
CREATE TABLE IF NOT EXISTS github_connections (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,

  -- Info de la cuenta de GitHub
  github_user_id      BIGINT NOT NULL,
  github_username     TEXT NOT NULL,
  github_email        TEXT,
  avatar_url          TEXT,

  -- Token cifrado (AES-256-GCM via crypto-vault.js)
  access_token_encrypted   TEXT NOT NULL,
  -- GitHub OAuth Apps no rotan tokens (los User-to-Server SÍ lo hacen, GH Apps).
  -- Para OAuth Apps el token no expira a menos que el user revoque acceso.
  token_type          TEXT DEFAULT 'oauth_app',  -- oauth_app | github_app

  -- Scopes otorgados (para validar antes de cada call)
  scopes              JSONB DEFAULT '[]',

  -- Estado de la conexión
  is_active           BOOLEAN DEFAULT true,
  last_used_at        TIMESTAMP,
  last_error          TEXT,

  connected_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_github_conn_user     ON github_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_github_conn_github   ON github_connections(github_user_id);

-- ── GITHUB REPOS ────────────────────────────────────────────────────────────
-- Repos creados/conectados desde Achilltest.
-- Source apunta a la entidad de la que provienen los archivos.
CREATE TABLE IF NOT EXISTS github_repos (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id       UUID NOT NULL REFERENCES github_connections(id) ON DELETE CASCADE,

  -- Identificación en GitHub
  github_repo_id      BIGINT NOT NULL,
  owner               TEXT NOT NULL,           -- username o org
  repo_name           TEXT NOT NULL,
  full_name           TEXT NOT NULL,           -- "owner/repo"
  default_branch      TEXT NOT NULL DEFAULT 'main',
  visibility          TEXT NOT NULL DEFAULT 'private',  -- private | public
  html_url            TEXT NOT NULL,
  clone_url           TEXT,

  -- Source: de dónde vienen los archivos del repo
  source_type         TEXT,                    -- suite | workspace | api_collection
  source_id           UUID,                    -- id de la entidad source
  source_name         TEXT,                    -- nombre cacheado para display

  -- Estado del último push
  last_commit_sha     TEXT,
  last_commit_message TEXT,
  last_pushed_at      TIMESTAMP,
  last_file_count     INTEGER DEFAULT 0,
  total_pushes        INTEGER DEFAULT 0,

  -- Manifest del último push (Achilltest IDs → archivos en el repo)
  -- Útil para diff en siguientes pushes
  manifest            JSONB DEFAULT '{}',

  created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP NOT NULL DEFAULT NOW(),

  UNIQUE(user_id, github_repo_id)
);

CREATE INDEX IF NOT EXISTS idx_github_repos_user    ON github_repos(user_id);
CREATE INDEX IF NOT EXISTS idx_github_repos_source  ON github_repos(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_github_repos_conn    ON github_repos(connection_id);

-- ── GITHUB PUSHES (audit log) ───────────────────────────────────────────────
-- Cada push hecho desde Achilltest. Útil para historial y debugging.
CREATE TABLE IF NOT EXISTS github_pushes (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  repo_id             UUID NOT NULL REFERENCES github_repos(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  status              TEXT NOT NULL DEFAULT 'pending',  -- pending|pushing|completed|failed

  branch              TEXT NOT NULL DEFAULT 'main',
  commit_sha          TEXT,
  commit_message      TEXT NOT NULL,

  -- Detalles del push
  files_count         INTEGER DEFAULT 0,
  files_added         INTEGER DEFAULT 0,
  files_modified      INTEGER DEFAULT 0,
  files_removed       INTEGER DEFAULT 0,

  -- Output
  error_message       TEXT,
  commit_url          TEXT,
  duration_ms         INTEGER,

  created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  started_at          TIMESTAMP,
  completed_at        TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_github_pushes_repo   ON github_pushes(repo_id);
CREATE INDEX IF NOT EXISTS idx_github_pushes_user   ON github_pushes(user_id);
CREATE INDEX IF NOT EXISTS idx_github_pushes_date   ON github_pushes(created_at DESC);
