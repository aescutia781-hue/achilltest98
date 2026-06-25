/**
 * Organization Invites Service
 *
 * Invitaciones por link compartible. Cualquiera con el link puede unirse.
 * El token forma parte de la URL: https://achilltest.io/join/{token}
 *
 * Configuración por invite:
 *   - role:     rol que se asigna al aceptar (qa por default)
 *   - maxUses:  cuántos usos permite (null = ilimitado)
 *   - expires:  cuándo expira (null = sin expiración)
 *   - revoked:  flag para inactivar manualmente
 *
 * El token usa 32 bytes random (256 bits) → suficiente para no necesitar
 * shrink ni rate limit agresivo. Aún así, validamos:
 *   - revoked === false
 *   - expiresAt > now
 *   - usesCount < maxUses (si está set)
 */

import { eq, and, desc, sql }   from 'drizzle-orm'
import { randomBytes }          from 'crypto'

import { getDb, schema }        from '../db/client.js'
import { addMember,
         ROLE_QA }              from './organizations-service.js'

/**
 * Crea un nuevo invite link.
 *
 * @param {object} opts
 * @param {string} opts.organizationId
 * @param {string} opts.createdBy
 * @param {string} [opts.role=qa]
 * @param {number} [opts.maxUses]
 * @param {number} [opts.expiresInDays]   Si se provee, calcula expiresAt
 */
export async function createInvite({ organizationId, createdBy, role = ROLE_QA, maxUses, expiresInDays }) {
  const db = getDb()

  if (!['qa', 'manager'].includes(role)) {
    throw new Error('Solo se pueden invitar como QA o Manager')
  }

  const token = 'invite_' + randomBytes(24).toString('hex')

  const expiresAt = expiresInDays
    ? new Date(Date.now() + parseInt(expiresInDays) * 86400000)
    : null

  const [invite] = await db.insert(schema.organizationInvites).values({
    organizationId,
    createdBy,
    token,
    role,
    maxUses: maxUses || null,
    expiresAt,
  }).returning()

  return invite
}

/**
 * Lista los invites activos de una org.
 */
export async function listInvites(organizationId) {
  const db = getDb()
  const invites = await db.select().from(schema.organizationInvites)
    .where(eq(schema.organizationInvites.organizationId, organizationId))
    .orderBy(desc(schema.organizationInvites.createdAt))

  // Marcar cuáles están "vivos"
  const now = new Date()
  return invites.map(i => ({
    ...i,
    isAlive: !i.isRevoked
      && (!i.expiresAt || new Date(i.expiresAt) > now)
      && (!i.maxUses || i.usesCount < i.maxUses),
  }))
}

/**
 * Lookup público: dado un token, devuelve info del invite + org SIN datos sensibles.
 * Para que el frontend muestre "Te invitan a unirte a {Acme Corp} como QA"
 * antes de pedirte que aceptes/cancelar.
 */
export async function lookupInviteByToken(token) {
  const db = getDb()
  const [invite] = await db.select().from(schema.organizationInvites)
    .where(eq(schema.organizationInvites.token, token)).limit(1)
  if (!invite) return { valid: false, error: 'Invite no encontrado' }

  if (invite.isRevoked) return { valid: false, error: 'Este invite fue revocado' }
  if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
    return { valid: false, error: 'Este invite expiró' }
  }
  if (invite.maxUses && invite.usesCount >= invite.maxUses) {
    return { valid: false, error: 'Este invite alcanzó su máximo de usos' }
  }

  // Cargar info de la org (sin secretos)
  const [org] = await db.select({
    id:          schema.organizations.id,
    name:        schema.organizations.name,
    slug:        schema.organizations.slug,
    description: schema.organizations.description,
    avatarUrl:   schema.organizations.avatarUrl,
    plan:        schema.organizations.plan,
    isPersonal:  schema.organizations.isPersonal,
  })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, invite.organizationId))
    .limit(1)

  if (!org) return { valid: false, error: 'Organización no encontrada' }
  if (org.isPersonal) return { valid: false, error: 'No se aceptan invitaciones a workspaces personales' }

  // Contar miembros para mostrar
  const [{ count }] = await db.select({ count: sql`count(*)::int` })
    .from(schema.organizationMembers)
    .where(eq(schema.organizationMembers.organizationId, org.id))

  return {
    valid: true,
    organization: org,
    role: invite.role,
    memberCount: count,
    expiresAt: invite.expiresAt,
  }
}

/**
 * Acepta un invite. Agrega al user como miembro con el role indicado.
 * Incrementa el contador de usos.
 */
export async function acceptInvite({ token, userId }) {
  const db = getDb()
  const [invite] = await db.select().from(schema.organizationInvites)
    .where(eq(schema.organizationInvites.token, token)).limit(1)
  if (!invite) throw new Error('Invite no válido')

  // Re-validar (concurrencia)
  if (invite.isRevoked) throw new Error('Este invite fue revocado')
  if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
    throw new Error('Este invite expiró')
  }
  if (invite.maxUses && invite.usesCount >= invite.maxUses) {
    throw new Error('Este invite alcanzó su máximo de usos')
  }

  // Verificar cuota de miembros del plan
  const [org] = await db.select().from(schema.organizations)
    .where(eq(schema.organizations.id, invite.organizationId)).limit(1)
  if (!org) throw new Error('Organización no existe')

  const { getPlanLimits } = await import('../config/plans.js')
  const limits = getPlanLimits(org.plan)
  const maxMembers = limits.maxMembers || 1
  if (maxMembers !== Infinity) {
    const [{ count }] = await db.select({ count: sql`count(*)::int` })
      .from(schema.organizationMembers)
      .where(eq(schema.organizationMembers.organizationId, org.id))
    if (count >= maxMembers) {
      throw new Error(`La organización alcanzó el máximo de ${maxMembers} miembros para su plan ${org.plan}`)
    }
  }

  // Agregar como miembro
  const result = await addMember({
    organizationId: invite.organizationId,
    userId,
    role:           invite.role,
    invitedBy:      invite.createdBy,
  })

  // Incrementar usos
  await db.update(schema.organizationInvites).set({
    usesCount:   sql`${schema.organizationInvites.usesCount} + 1`,
    lastUsedAt:  new Date(),
    lastUsedBy:  userId,
  }).where(eq(schema.organizationInvites.id, invite.id))

  return {
    organizationId: invite.organizationId,
    role:           invite.role,
    alreadyMember:  !result.created,
  }
}

/**
 * Revoca un invite (no se borra para conservar audit log).
 */
export async function revokeInvite({ inviteId, organizationId }) {
  const db = getDb()
  await db.update(schema.organizationInvites).set({
    isRevoked: true,
  })
    .where(and(
      eq(schema.organizationInvites.id, inviteId),
      eq(schema.organizationInvites.organizationId, organizationId),
    ))
}
