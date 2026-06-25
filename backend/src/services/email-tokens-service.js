/**
 * Email Tokens Service
 *
 * Maneja tokens "one-shot" enviados por email:
 *   - email_verification — confirma el email tras registro (TTL 7 días)
 *   - password_reset     — recupera contraseña (TTL 1 hora)
 *
 * Seguridad:
 *   - El token plain SOLO se devuelve al crearlo (para incluirlo en el email).
 *   - En DB solo guardamos su SHA-256 hash (token_hash).
 *   - Al consumir comparamos hash(input) vs token_hash en DB.
 *   - Uso one-shot: al consumir se marca used_at y deja de servir.
 *   - Rate limit conceptual: máx 5 tokens activos por user/tipo (purgamos viejos).
 */

import { randomBytes, createHash } from 'crypto'
import { eq, and, sql, isNull, lt }  from 'drizzle-orm'
import { getDb, schema }             from '../db/client.js'

export const TOKEN_TYPES = {
  EMAIL_VERIFICATION: 'email_verification',
  PASSWORD_RESET:     'password_reset',
}

const TTL_SECONDS = {
  email_verification: 7 * 24 * 3600,   // 7 días
  password_reset:     1 * 3600,        // 1 hora
}

/**
 * Genera un token nuevo y devuelve el plain (solo se ve UNA vez).
 *
 * @param {object} opts
 * @param {string} opts.userId
 * @param {string} opts.type      'email_verification' | 'password_reset'
 * @param {string} [opts.ip]
 * @param {string} [opts.userAgent]
 *
 * @returns {Promise<{ plain, expiresAt }>}
 */
export async function createEmailToken({ userId, type, ip, userAgent }) {
  if (!TTL_SECONDS[type]) {
    throw new Error(`Tipo de token desconocido: ${type}`)
  }

  const db = getDb()

  // Purga: invalida tokens viejos del mismo tipo para este user
  // (evita acumulación + previene confusión si pidieron varios reset)
  await db.update(schema.emailTokens)
    .set({ usedAt: new Date() })
    .where(and(
      eq(schema.emailTokens.userId, userId),
      eq(schema.emailTokens.type, type),
      isNull(schema.emailTokens.usedAt),
    ))

  // Generar token: prefijo + 32 bytes random
  // Prefijo ayuda al debugging y a clasificar visualmente.
  const prefix = type === 'password_reset' ? 'reset_' : 'verify_'
  const plain  = prefix + randomBytes(32).toString('hex')
  const hash   = _hashToken(plain)

  const expiresAt = new Date(Date.now() + TTL_SECONDS[type] * 1000)

  await db.insert(schema.emailTokens).values({
    userId,
    type,
    tokenHash:   hash,
    expiresAt,
    requestedIp: ip || null,
    userAgent:   userAgent ? userAgent.slice(0, 500) : null,
  })

  return { plain, expiresAt }
}

/**
 * Valida un token y devuelve el userId si es válido. Si valid=true, MARCA
 * el token como consumido (one-shot).
 *
 * @returns {{ valid, userId?, error?, type? }}
 */
export async function consumeEmailToken({ plain, expectedType }) {
  if (!plain || typeof plain !== 'string') {
    return { valid: false, error: 'Token vacío o inválido' }
  }

  const hash = _hashToken(plain)
  const db = getDb()

  const [token] = await db.select().from(schema.emailTokens)
    .where(and(
      eq(schema.emailTokens.tokenHash, hash),
      isNull(schema.emailTokens.usedAt),
    )).limit(1)

  if (!token) {
    return { valid: false, error: 'Token inválido o ya fue usado' }
  }

  if (expectedType && token.type !== expectedType) {
    return { valid: false, error: 'Token de tipo incorrecto' }
  }

  if (new Date(token.expiresAt) < new Date()) {
    return { valid: false, error: 'Este enlace expiró. Solicita uno nuevo.' }
  }

  // ── ONE-SHOT: marcar como usado ─────────────────────────────────────────
  await db.update(schema.emailTokens)
    .set({ usedAt: new Date() })
    .where(eq(schema.emailTokens.id, token.id))

  return {
    valid:  true,
    userId: token.userId,
    type:   token.type,
  }
}

/**
 * Solo valida (NO consume). Útil para preview en frontend (¿este link sirve?).
 */
export async function peekEmailToken(plain) {
  if (!plain) return { valid: false }

  const hash = _hashToken(plain)
  const db = getDb()

  const [token] = await db.select().from(schema.emailTokens)
    .where(and(
      eq(schema.emailTokens.tokenHash, hash),
      isNull(schema.emailTokens.usedAt),
    )).limit(1)

  if (!token) return { valid: false, error: 'Token inválido o ya fue usado' }
  if (new Date(token.expiresAt) < new Date()) {
    return { valid: false, error: 'Este enlace expiró' }
  }
  return { valid: true, type: token.type, userId: token.userId }
}

/**
 * Cleanup: borra tokens viejos expirados (>30 días) para mantener la tabla
 * pequeña. Llamado por el cleanup-scheduler.
 */
export async function cleanupExpiredTokens() {
  const db = getDb()
  const cutoff = new Date(Date.now() - 30 * 86400000)
  const result = await db.delete(schema.emailTokens)
    .where(lt(schema.emailTokens.expiresAt, cutoff))
  return { deleted: result.rowCount || 0 }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function _hashToken(plain) {
  return createHash('sha256').update(plain).digest('hex')
}
