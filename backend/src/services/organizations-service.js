/**
 * Organizations Service
 *
 * Centro de la lógica multi-tenant. Maneja:
 *   - Creación de orgs (incluyendo auto-personal workspaces)
 *   - Membership: agregar/quitar users, cambiar roles
 *   - Switching: el user activo "ve" UNA org a la vez (current_organization_id)
 *   - Validación de permisos por rol
 *
 * Jerarquía de roles:
 *   owner   - dueño absoluto (1 por org). Único que puede borrar la org.
 *   manager - admin técnico, gestiona miembros e integraciones, no toca billing
 *   qa      - usuario regular, crea suites y runs, ve todo, no invita ni admin
 *
 * Reglas:
 *   • Toda org tiene exactamente UN owner.
 *   • Personal workspaces (is_personal=true) no pueden:
 *     - tener miembros adicionales (max 1 owner)
 *     - ser borradas (van con la cuenta del user)
 *     - cambiar de owner
 *   • Un user puede pertenecer a N orgs, pero su current_organization_id apunta a 1.
 */

import { eq, and, sql, inArray }  from 'drizzle-orm'
import { getDb, schema }          from '../db/client.js'

// ── Constantes de roles ─────────────────────────────────────────────────────

export const ROLE_OWNER   = 'owner'
export const ROLE_MANAGER = 'manager'
export const ROLE_QA      = 'qa'

const ROLE_HIERARCHY = { [ROLE_OWNER]: 3, [ROLE_MANAGER]: 2, [ROLE_QA]: 1 }

/**
 * Verifica si un rol cumple con el mínimo requerido.
 * isAtLeast('owner', 'manager') = true (owner >= manager)
 */
export function isAtLeast(actual, required) {
  return (ROLE_HIERARCHY[actual] || 0) >= (ROLE_HIERARCHY[required] || 0)
}

// ── Membership ──────────────────────────────────────────────────────────────

/**
 * Obtiene el membership de un user en una org. Null si no es miembro.
 */
export async function getMembership(userId, organizationId) {
  const db = getDb()
  const [m] = await db.select().from(schema.organizationMembers)
    .where(and(
      eq(schema.organizationMembers.userId, userId),
      eq(schema.organizationMembers.organizationId, organizationId),
    )).limit(1)
  return m || null
}

/**
 * Lista todas las orgs a las que pertenece un user.
 */
export async function listUserOrganizations(userId) {
  const db = getDb()
  // Join manual: members → organizations
  const memberships = await db.select().from(schema.organizationMembers)
    .where(eq(schema.organizationMembers.userId, userId))

  if (memberships.length === 0) return []

  const orgIds = memberships.map(m => m.organizationId)
  const orgs = await db.select().from(schema.organizations)
    .where(inArray(schema.organizations.id, orgIds))

  // Combinar org info con membership role
  const orgsById = Object.fromEntries(orgs.map(o => [o.id, o]))
  return memberships.map(m => ({
    organization: orgsById[m.organizationId],
    role:         m.role,
    joinedAt:     m.joinedAt,
    memberId:     m.id,
  })).filter(item => item.organization)
}

/**
 * Lista los miembros de una org.
 */
export async function listOrganizationMembers(organizationId) {
  const db = getDb()
  const members = await db.select().from(schema.organizationMembers)
    .where(eq(schema.organizationMembers.organizationId, organizationId))

  if (members.length === 0) return []

  const userIds = members.map(m => m.userId)
  const users = await db.select({
    id:    schema.users.id,
    email: schema.users.email,
    name:  schema.users.name,
  }).from(schema.users).where(inArray(schema.users.id, userIds))

  const usersById = Object.fromEntries(users.map(u => [u.id, u]))
  return members.map(m => ({
    id:       m.id,
    userId:   m.userId,
    user:     usersById[m.userId],
    role:     m.role,
    joinedAt: m.joinedAt,
    lastActiveAt: m.lastActiveAt,
    invitedBy: m.invitedBy,
  }))
}

/**
 * Cuenta los miembros activos de una org.
 */
export async function countMembers(organizationId) {
  const db = getDb()
  const [{ count }] = await db.select({ count: sql`count(*)::int` })
    .from(schema.organizationMembers)
    .where(eq(schema.organizationMembers.organizationId, organizationId))
  return count
}

// ── Creación de orgs ────────────────────────────────────────────────────────

/**
 * Crea una nueva org y agrega al user como owner.
 */
export async function createOrganization({ ownerId, name, description, isPersonal = false, plan = 'teammate' }) {
  const db = getDb()

  const slug = await _generateUniqueSlug(name || 'workspace')

  const [org] = await db.insert(schema.organizations).values({
    name,
    slug,
    description,
    ownerId,
    plan,
    isPersonal,
  }).returning()

  // Auto-añadir el owner como member
  await db.insert(schema.organizationMembers).values({
    organizationId: org.id,
    userId:         ownerId,
    role:           ROLE_OWNER,
  })

  return org
}

/**
 * Asegura que un user tenga AL MENOS un personal workspace. Si no lo tiene,
 * lo crea. Devuelve el personal workspace.
 *
 * Llamado al registrar un user nuevo y como fallback en authenticate middleware.
 */
export async function ensurePersonalWorkspace(userId) {
  const db = getDb()

  // Buscar si ya tiene uno
  const memberships = await db.select().from(schema.organizationMembers)
    .where(and(
      eq(schema.organizationMembers.userId, userId),
      eq(schema.organizationMembers.role, ROLE_OWNER),
    ))

  if (memberships.length > 0) {
    // Verificar si alguna es is_personal
    const orgIds = memberships.map(m => m.organizationId)
    const orgs = await db.select().from(schema.organizations)
      .where(inArray(schema.organizations.id, orgIds))
    const personal = orgs.find(o => o.isPersonal)
    if (personal) return personal
  }

  // Crear uno nuevo
  const [user] = await db.select().from(schema.users)
    .where(eq(schema.users.id, userId)).limit(1)
  if (!user) throw new Error('User no encontrado')

  const displayName = user.name || user.email.split('@')[0]
  const org = await createOrganization({
    ownerId:     userId,
    name:        `Personal de ${displayName}`,
    isPersonal:  true,
    plan:        user.plan || 'trial',
  })

  // Actualizar current_organization_id si no tiene
  await db.update(schema.users)
    .set({ currentOrganizationId: org.id, organizationId: org.id })
    .where(and(
      eq(schema.users.id, userId),
      sql`current_organization_id IS NULL`,
    ))

  return org
}

// ── Switching de organización activa ────────────────────────────────────────

/**
 * Cambia la org activa de un user. Valida que el user sea miembro.
 */
export async function switchActiveOrganization(userId, organizationId) {
  const membership = await getMembership(userId, organizationId)
  if (!membership) {
    throw new Error('No eres miembro de esta organización')
  }

  const db = getDb()
  await db.update(schema.users)
    .set({ currentOrganizationId: organizationId, role: membership.role })
    .where(eq(schema.users.id, userId))

  // Actualizar lastActiveAt
  await db.update(schema.organizationMembers)
    .set({ lastActiveAt: new Date() })
    .where(eq(schema.organizationMembers.id, membership.id))

  return membership
}

// ── Update org ─────────────────────────────────────────────────────────────

/**
 * Actualiza información de la org. Solo Owner/Manager pueden hacerlo.
 */
export async function updateOrganization(organizationId, updates) {
  const db = getDb()
  const allowed = {
    updatedAt: new Date(),
  }
  if (updates.name !== undefined)        allowed.name = updates.name.trim()
  if (updates.description !== undefined) allowed.description = updates.description?.trim() || null
  if (updates.avatarUrl !== undefined)   allowed.avatarUrl = updates.avatarUrl
  if (updates.settings !== undefined)    allowed.settings = updates.settings

  const [updated] = await db.update(schema.organizations).set(allowed)
    .where(eq(schema.organizations.id, organizationId))
    .returning()

  return updated
}

// ── Add member ─────────────────────────────────────────────────────────────

/**
 * Agrega un user como miembro de una org. Si ya es miembro, no hace nada.
 *
 * @returns {{ membership, created }}  created=true si el membership es nuevo
 */
export async function addMember({ organizationId, userId, role = ROLE_QA, invitedBy = null }) {
  const db = getDb()

  // Validar que el rol sea válido
  if (![ROLE_OWNER, ROLE_MANAGER, ROLE_QA].includes(role)) {
    throw new Error(`Rol inválido: ${role}`)
  }

  // No permitir miembros en personal workspaces
  const [org] = await db.select().from(schema.organizations)
    .where(eq(schema.organizations.id, organizationId)).limit(1)
  if (!org) throw new Error('Organización no encontrada')
  if (org.isPersonal) {
    throw new Error('No se pueden agregar miembros a un workspace personal')
  }

  // Ya es miembro?
  const existing = await getMembership(userId, organizationId)
  if (existing) {
    return { membership: existing, created: false }
  }

  const [created] = await db.insert(schema.organizationMembers).values({
    organizationId,
    userId,
    role,
    invitedBy,
  }).returning()

  return { membership: created, created: true }
}

// ── Update role ────────────────────────────────────────────────────────────

/**
 * Cambia el rol de un miembro. Reglas:
 *   - No se puede cambiar el rol del owner (debes transferir primero)
 *   - No se puede promover a alguien a owner por esta vía (usa transferOwnership)
 */
export async function updateMemberRole({ organizationId, userId, newRole }) {
  if (![ROLE_MANAGER, ROLE_QA].includes(newRole)) {
    throw new Error(`Rol inválido para cambio: ${newRole}. Para transferir ownership usa transferOwnership.`)
  }

  const db = getDb()
  const membership = await getMembership(userId, organizationId)
  if (!membership) throw new Error('No es miembro de esta organización')

  if (membership.role === ROLE_OWNER) {
    throw new Error('No se puede cambiar el rol del owner. Transfiere ownership primero.')
  }

  const [updated] = await db.update(schema.organizationMembers).set({
    role: newRole,
    updatedAt: new Date(),
  })
    .where(eq(schema.organizationMembers.id, membership.id))
    .returning()

  return updated
}

// ── Remove member ──────────────────────────────────────────────────────────

/**
 * Elimina a un miembro de una org. Reglas:
 *   - No se puede eliminar al owner por esta vía
 *   - Si el user tenía esta org como current_organization_id, se reasigna a la siguiente
 */
export async function removeMember({ organizationId, userId }) {
  const db = getDb()
  const membership = await getMembership(userId, organizationId)
  if (!membership) throw new Error('No es miembro')

  if (membership.role === ROLE_OWNER) {
    throw new Error('No se puede eliminar al owner. Transfiere ownership primero.')
  }

  // Eliminar membership
  await db.delete(schema.organizationMembers)
    .where(eq(schema.organizationMembers.id, membership.id))

  // Si era su current_org, cambiar al personal workspace
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1)
  if (user?.currentOrganizationId === organizationId) {
    const otherOrgs = await listUserOrganizations(userId)
    const personal = otherOrgs.find(o => o.organization.isPersonal)
    const fallback = personal?.organization?.id || otherOrgs[0]?.organization?.id || null

    if (fallback) {
      const fallbackMembership = await getMembership(userId, fallback)
      await db.update(schema.users).set({
        currentOrganizationId: fallback,
        role: fallbackMembership?.role || ROLE_QA,
      }).where(eq(schema.users.id, userId))
    }
  }

  return { removed: true }
}

// ── Transfer ownership ─────────────────────────────────────────────────────

/**
 * Transfiere ownership de la org al miembro indicado.
 * El owner anterior pasa a manager.
 */
export async function transferOwnership({ organizationId, fromUserId, toUserId }) {
  const db = getDb()

  if (fromUserId === toUserId) {
    throw new Error('No puedes transferir ownership a ti mismo')
  }

  const fromM = await getMembership(fromUserId, organizationId)
  const toM   = await getMembership(toUserId, organizationId)

  if (!fromM) throw new Error('No eres miembro')
  if (fromM.role !== ROLE_OWNER) throw new Error('Solo el owner puede transferir ownership')
  if (!toM) throw new Error('El usuario destino no es miembro')

  // Cambiar roles
  await db.transaction(async (tx) => {
    await tx.update(schema.organizationMembers)
      .set({ role: ROLE_MANAGER, updatedAt: new Date() })
      .where(eq(schema.organizationMembers.id, fromM.id))

    await tx.update(schema.organizationMembers)
      .set({ role: ROLE_OWNER, updatedAt: new Date() })
      .where(eq(schema.organizationMembers.id, toM.id))

    await tx.update(schema.organizations)
      .set({ ownerId: toUserId, updatedAt: new Date() })
      .where(eq(schema.organizations.id, organizationId))
  })

  return { transferred: true, newOwnerId: toUserId }
}

// ── Delete org ─────────────────────────────────────────────────────────────

/**
 * Elimina una org completa. Solo el owner puede. Cascade borra members, invites
 * y todo lo asociado (vía FK).
 */
export async function deleteOrganization({ organizationId, ownerId }) {
  const db = getDb()
  const [org] = await db.select().from(schema.organizations)
    .where(eq(schema.organizations.id, organizationId)).limit(1)
  if (!org) throw new Error('No encontrada')
  if (org.ownerId !== ownerId) throw new Error('Solo el owner puede eliminar la organización')
  if (org.isPersonal) throw new Error('No se puede eliminar un workspace personal')

  // CASCADE en FK borra members, invites, etc.
  await db.delete(schema.organizations)
    .where(eq(schema.organizations.id, organizationId))

  // Para los users que tenían esta como current_org, cambiar al personal
  const affectedUsers = await db.select().from(schema.users)
    .where(eq(schema.users.currentOrganizationId, organizationId))

  for (const u of affectedUsers) {
    const orgs = await listUserOrganizations(u.id)
    const personal = orgs.find(o => o.organization.isPersonal)
    const fallback = personal?.organization?.id || orgs[0]?.organization?.id || null
    if (fallback) {
      const m = await getMembership(u.id, fallback)
      await db.update(schema.users).set({
        currentOrganizationId: fallback,
        role: m?.role || ROLE_QA,
      }).where(eq(schema.users.id, u.id))
    }
  }

  return { deleted: true }
}

// ── Helpers ──

async function _generateUniqueSlug(name) {
  const db = getDb()
  const base = String(name)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim().replace(/\s+/g, '-').replace(/-+/g, '-')
    .slice(0, 40) || 'workspace'

  let slug = base
  let counter = 0
  while (true) {
    const existing = await db.select().from(schema.organizations)
      .where(eq(schema.organizations.slug, slug)).limit(1)
    if (existing.length === 0) return slug
    counter++
    slug = `${base}-${counter}`
  }
}
