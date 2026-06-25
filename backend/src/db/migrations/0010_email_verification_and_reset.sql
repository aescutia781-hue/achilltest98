-- Achilltest — Email verification + Password reset (Sprint LAUNCH)
-- Aplicar después de 0009_repair_agent.sql.

-- ── EXTENDER USERS ──────────────────────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_verified_at   TIMESTAMP;

-- Backfill: marcar como verificados a los usuarios que ya existían (cortesía,
-- no obligamos a usuarios viejos a re-verificar). Los nuevos sí van por el flow.
UPDATE users SET email_verified = true, email_verified_at = COALESCE(created_at, NOW())
 WHERE email_verified = false;

-- ── EMAIL TOKENS ────────────────────────────────────────────────────────────
-- Tabla genérica para tokens "one-shot" enviados por email.
-- Tipos:
--   email_verification — confirma email del nuevo registro
--   password_reset     — recuperación de contraseña
--
-- Se usa una tabla en vez de dos para tener UN solo lugar de invalidación
-- (revoke all on logout, expire on use, audit log).
CREATE TABLE IF NOT EXISTS email_tokens (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  type            TEXT NOT NULL,                    -- email_verification | password_reset
  token_hash      TEXT NOT NULL,                    -- SHA-256 del token (NO guardamos plain)

  expires_at      TIMESTAMP NOT NULL,
  used_at         TIMESTAMP,                        -- cuando se consumió (one-shot)

  -- Audit
  requested_ip    TEXT,
  user_agent      TEXT,

  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Lookup por token_hash, descartar usados/expirados
CREATE INDEX IF NOT EXISTS idx_email_tokens_hash   ON email_tokens(token_hash) WHERE used_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_email_tokens_user   ON email_tokens(user_id, type);
CREATE INDEX IF NOT EXISTS idx_email_tokens_expire ON email_tokens(expires_at);
