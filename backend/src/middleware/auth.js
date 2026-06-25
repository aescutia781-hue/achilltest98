import jwt from 'jsonwebtoken'
import { planHasAccess, hasFeature } from '../config/plans.js'

const JWT_SECRET     = process.env.JWT_SECRET
const JWT_EXPIRES_IN = '30d'

if (!JWT_SECRET) {
  console.warn('[Auth] ⚠ JWT_SECRET no configurado — generando token inseguro temporal')
}

/**
 * Genera un JWT firmado.
 *
 * El token incluye:
 *   - userId               (para identificar al usuario)
 *   - email                (para logs y auditoría)
 *   - plan                 (cacheado para autorización rápida sin DB hit)
 *   - organizationId       (compatibilidad legacy — la org "primaria" del user)
 *   - currentOrganizationId (org activa al momento de generar el token)
 *   - role                 (rol en current_organization)
 *
 * NOTA: plan, currentOrganizationId y role se refrescan en cada request
 *       desde DB en el middleware `authenticate` para reflejar cambios
 *       (membership added/removed, org switch, plan upgrade, etc).
 */
export function generateToken(user) {
  return jwt.sign(
    {
      userId:                user.id,
      email:                 user.email,
      plan:                  user.plan,
      organizationId:        user.organizationId,
      currentOrganizationId: user.currentOrganizationId || user.organizationId,
      role:                  user.role,
    },
    JWT_SECRET || 'unsafe-dev-secret',
    { expiresIn: JWT_EXPIRES_IN },
  )
}

/**
 * Verifica y decodifica un JWT.
 * Lanza si es inválido o expirado.
 */
export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET || 'unsafe-dev-secret')
}

// ── MIDDLEWARES PARA FASTIFY ──────────────────────────────────────────────────

/**
 * Middleware: requiere autenticación válida.
 *
 * Adjunta req.user con:
 *   { userId, email, plan, organizationId, currentOrganizationId, role }
 *
 * En cada request refresca currentOrganizationId, role y plan desde DB
 * para que cambios (org switch, membership update, plan upgrade) se reflejen
 * sin requerir nuevo login.
 */
export async function authenticate(req, reply) {
  const authHeader = req.headers.authorization || ''
  const token      = authHeader.replace(/^Bearer\s+/i, '').trim()

  if (!token) {
    return reply.code(401).send({ success: false, error: 'Token requerido' })
  }

  let decoded
  try {
    decoded = verifyToken(token)
  } catch (err) {
    const msg = err.name === 'TokenExpiredError'
      ? 'Sesión expirada — vuelve a iniciar sesión'
      : 'Token inválido'
    return reply.code(401).send({ success: false, error: msg })
  }

  // Refrescar contexto org desde DB en cada request
  try {
    const { getDb, schema } = await import('../db/client.js')
    const { eq, and } = await import('drizzle-orm')
    const db = getDb()

    const [user] = await db.select({
      id:                    schema.users.id,
      email:                 schema.users.email,
      organizationId:        schema.users.organizationId,
      currentOrganizationId: schema.users.currentOrganizationId,
    }).from(schema.users).where(eq(schema.users.id, decoded.userId)).limit(1)

    if (!user) {
      return reply.code(401).send({ success: false, error: 'Usuario no existe' })
    }

    const currentOrgId = user.currentOrganizationId || user.organizationId

    // Resolver el plan y rol desde la org activa
    let plan = decoded.plan || 'trial'
    let role = decoded.role || 'qa'

    if (currentOrgId) {
      const [org] = await db.select({ plan: schema.organizations.plan })
        .from(schema.organizations)
        .where(eq(schema.organizations.id, currentOrgId)).limit(1)
      if (org) plan = org.plan

      const [m] = await db.select({ role: schema.organizationMembers.role })
        .from(schema.organizationMembers)
        .where(and(
          eq(schema.organizationMembers.userId, decoded.userId),
          eq(schema.organizationMembers.organizationId, currentOrgId),
        )).limit(1)
      if (m) role = m.role
    }

    req.user = {
      userId:                decoded.userId,
      email:                 user.email,
      organizationId:        user.organizationId,
      currentOrganizationId: currentOrgId,
      plan,
      role,
    }
  } catch (err) {
    console.error('[Auth] error refrescando contexto:', err)
    req.user = decoded
  }
}

/**
 * Middleware factory: requiere un plan mínimo.
 *
 * @example
 *   app.get('/api/wcag', { preHandler: [authenticate, requirePlan('teammate')] }, ...)
 */
export function requirePlan(minPlan) {
  return async (req, reply) => {
    if (!planHasAccess(req.user?.plan || 'trial', minPlan)) {
      return reply.code(403).send({
        success:    false,
        error:      `Esta función requiere el plan ${minPlan} o superior`,
        required:   minPlan,
        current:    req.user?.plan,
        upgradeUrl: '/pricing',
      })
    }
  }
}

/**
 * Middleware factory: requiere un módulo específico.
 *
 * @example
 *   app.post('/api/api-tests', { preHandler: [authenticate, requireFeature('apiTesting')] }, ...)
 */
export function requireFeature(feature) {
  return async (req, reply) => {
    if (!hasFeature(req.user?.plan || 'trial', feature)) {
      return reply.code(403).send({
        success:    false,
        error:      `El módulo "${feature}" no está disponible en tu plan`,
        feature,
        current:    req.user?.plan,
        upgradeUrl: '/pricing',
      })
    }
  }
}

/**
 * Middleware factory: requiere un rol específico.
 *
 * @example
 *   app.delete('/api/users/:id', { preHandler: [authenticate, requireRole(['owner', 'manager'])] }, ...)
 */
export function requireRole(allowedRoles) {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles]
  return async (req, reply) => {
    if (!roles.includes(req.user?.role)) {
      return reply.code(403).send({
        success: false,
        error:   `Esta acción requiere rol: ${roles.join(' o ')}`,
        current: req.user?.role,
      })
    }
  }
}

/**
 * Middleware factory: requiere al menos un rol mínimo (con jerarquía).
 * owner > manager > qa
 *
 * @example
 *   // Permite owner Y manager:
 *   app.post('/api/...', { preHandler: [authenticate, requireRoleAtLeast('manager')] }, ...)
 */
const ROLE_HIERARCHY = { owner: 3, manager: 2, qa: 1 }

export function requireRoleAtLeast(minRole) {
  const min = ROLE_HIERARCHY[minRole] || 0
  return async (req, reply) => {
    const actual = ROLE_HIERARCHY[req.user?.role] || 0
    if (actual < min) {
      return reply.code(403).send({
        success: false,
        error:   `Esta acción requiere rol ${minRole} o superior`,
        current: req.user?.role,
      })
    }
  }
}

/**
 * Middleware: requiere que el user tenga una org activa (no solo personal).
 * Útil para endpoints que asumen contexto de equipo.
 */
export async function requireOrganization(req, reply) {
  if (!req.user?.currentOrganizationId) {
    return reply.code(400).send({
      success: false,
      error:   'No hay una organización activa',
    })
  }
}
