-- Achilltest — Organizations expansion (Sprint A)
-- Multi-tenant con roles Owner/Manager/QA, invitaciones por link compartible
-- Auto-personal workspace para todos los users existentes
-- Aplicar después de 0006_github.sql

-- ── EXPANDIR ORGANIZATIONS ──────────────────────────────────────────────────
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS slug              TEXT,
  ADD COLUMN IF NOT EXISTS description       TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url        TEXT,
  ADD COLUMN IF NOT EXISTS is_personal       BOOLEAN DEFAULT false,

  -- Billing transferido aquí (era de users)
  ADD COLUMN IF NOT EXISTS mp_subscription_id     TEXT,
  ADD COLUMN IF NOT EXISTS mp_subscription_status TEXT,
  ADD COLUMN IF NOT EXISTS mp_plan_id             TEXT,
  ADD COLUMN IF NOT EXISTS paid_since             TIMESTAMP,

  -- Trial
  ADD COLUMN IF NOT EXISTS trial_started_at  TIMESTAMP,
  ADD COLUMN IF NOT EXISTS trial_ends_at     TIMESTAMP,
  ADD COLUMN IF NOT EXISTS is_trial_expired  BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS specs_used_trial  INTEGER DEFAULT 0,

  -- Settings
  ADD COLUMN IF NOT EXISTS settings          JSONB DEFAULT '{}';

CREATE UNIQUE INDEX IF NOT EXISTS idx_orgs_slug ON organizations(slug) WHERE slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orgs_owner ON organizations(owner_id);

-- ── ORGANIZATION MEMBERS ────────────────────────────────────────────────────
-- Mapeo many-to-many: un user puede pertenecer a múltiples orgs con distintos roles
CREATE TABLE IF NOT EXISTS organization_members (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  role                TEXT NOT NULL DEFAULT 'qa',  -- owner | manager | qa

  -- Quién invitó
  invited_by          UUID REFERENCES users(id),
  joined_at           TIMESTAMP NOT NULL DEFAULT NOW(),

  -- Última actividad
  last_active_at      TIMESTAMP,

  created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP NOT NULL DEFAULT NOW(),

  UNIQUE(organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_org      ON organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user     ON organization_members(user_id);

-- ── ORGANIZATION INVITES (link compartible) ─────────────────────────────────
-- Cualquiera con el link puede unirse. El token es la "credencial".
CREATE TABLE IF NOT EXISTS organization_invites (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Token único del invite (forma parte de la URL)
  token               TEXT NOT NULL UNIQUE,

  -- Configuración del invite
  role                TEXT NOT NULL DEFAULT 'qa',     -- role que se asigna al aceptar
  max_uses            INTEGER,                          -- null = ilimitado
  uses_count          INTEGER NOT NULL DEFAULT 0,

  -- Expiración
  expires_at          TIMESTAMP,                        -- null = no expira
  is_revoked          BOOLEAN NOT NULL DEFAULT false,

  -- Audit
  last_used_at        TIMESTAMP,
  last_used_by        UUID REFERENCES users(id),

  created_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_invites_org      ON organization_invites(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_invites_token    ON organization_invites(token);

-- ── CURRENT_ORGANIZATION_ID en users (para "active workspace") ──────────────
-- El user puede estar en N orgs; current_organization_id indica cuál ve ahora
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS current_organization_id UUID REFERENCES organizations(id);

-- ── DATA MIGRATION: Crear personal workspace para usuarios existentes ───────
-- Para CADA user que no tiene org, crear una "Personal de {name}" y migrarlo
DO $$
DECLARE
  rec RECORD;
  new_org_id UUID;
  slug_base TEXT;
  slug_final TEXT;
  slug_counter INT;
BEGIN
  FOR rec IN
    SELECT id, email, name, plan, role,
           trial_started_at, trial_ends_at, is_trial_expired, specs_used_trial,
           mp_subscription_id, mp_subscription_status, mp_plan_id, paid_since,
           organization_id
    FROM users
    WHERE organization_id IS NULL
       OR organization_id NOT IN (SELECT id FROM organizations)
  LOOP
    -- Generar slug único: nombre lowercased + número si colisiona
    slug_base := lower(regexp_replace(
      regexp_replace(coalesce(rec.name, split_part(rec.email, '@', 1)),
        '[^a-zA-Z0-9\s-]', '', 'g'),
      '\s+', '-', 'g'));
    slug_base := substring(slug_base, 1, 40);
    IF slug_base = '' THEN slug_base := 'workspace'; END IF;
    slug_final := slug_base;
    slug_counter := 0;

    WHILE EXISTS (SELECT 1 FROM organizations WHERE slug = slug_final) LOOP
      slug_counter := slug_counter + 1;
      slug_final := slug_base || '-' || slug_counter::text;
    END LOOP;

    -- Crear personal workspace
    INSERT INTO organizations (
      name, slug, owner_id, plan, is_personal,
      trial_started_at, trial_ends_at, is_trial_expired, specs_used_trial,
      mp_subscription_id, mp_subscription_status, mp_plan_id, paid_since
    ) VALUES (
      'Personal de ' || coalesce(rec.name, split_part(rec.email, '@', 1)),
      slug_final,
      rec.id,
      coalesce(rec.plan, 'trial'),
      true,
      rec.trial_started_at, rec.trial_ends_at,
      coalesce(rec.is_trial_expired, false),
      coalesce(rec.specs_used_trial, 0),
      rec.mp_subscription_id, rec.mp_subscription_status,
      rec.mp_plan_id, rec.paid_since
    )
    RETURNING id INTO new_org_id;

    -- Actualizar user con su org y current_organization_id
    UPDATE users
       SET organization_id        = new_org_id,
           current_organization_id = new_org_id,
           role                    = 'owner'
     WHERE id = rec.id;

    -- Insertar membership como owner
    INSERT INTO organization_members (organization_id, user_id, role, joined_at)
    VALUES (new_org_id, rec.id, 'owner', NOW())
    ON CONFLICT (organization_id, user_id) DO NOTHING;
  END LOOP;
END $$;

-- ── BACKFILL: Migrar datos existentes a tener organization_id ──────────────
-- Cualquier tabla con organization_id NULL, lo asigna desde users.organization_id
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT table_name FROM information_schema.columns
    WHERE column_name = 'organization_id'
      AND table_schema = 'public'
      AND table_name <> 'organizations'
      AND table_name <> 'users'
  LOOP
    -- Si la tabla tiene user_id, copia el organization_id del user dueño
    EXECUTE format('
      UPDATE %I t
         SET organization_id = u.organization_id
        FROM users u
       WHERE t.organization_id IS NULL
         AND t.user_id = u.id
         AND u.organization_id IS NOT NULL
    ', tbl);
  END LOOP;
END $$;

-- ── Backfill organization_members con creators de orgs (si quedó alguno) ────
INSERT INTO organization_members (organization_id, user_id, role, joined_at)
SELECT o.id, o.owner_id, 'owner', o.created_at
  FROM organizations o
 WHERE NOT EXISTS (
   SELECT 1 FROM organization_members m
    WHERE m.organization_id = o.id AND m.user_id = o.owner_id
 );

-- ── Índices finales ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_current_org   ON users(current_organization_id);
