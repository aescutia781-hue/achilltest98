/**
 * Rutas Organizations
 *
 * Profile/Listing:
 *   GET    /api/organizations                       Listar todas las orgs del user
 *   GET    /api/organizations/current               La org activa (currentOrganizationId)
 *   POST   /api/organizations/switch                Cambiar org activa
 *
 * CRUD:
 *   POST   /api/organizations                       Crear nueva org
 *   GET    /api/organizations/:id                   Detalle (con miembros e invites)
 *   PUT    /api/organizations/:id                   Editar (manager+)
 *   DELETE /api/organizations/:id                   Eliminar (owner)
 *
 * Members:
 *   GET    /api/organizations/:id/members           Listar miembros
 *   PUT    /api/organizations/:id/members/:userId   Cambiar rol (owner only)
 *   DELETE /api/organizations/:id/members/:userId   Quitar miembro (manager+)
 *   POST   /api/organizations/:id/leave             Salirse de la org
 *
 * Ownership:
 *   POST   /api/organizations/:id/transfer-ownership   (owner only)
 *
 * Invites:
 *   POST   /api/organizations/:id/invites            Crear invite link (manager+)
 *   GET    /api/organizations/:id/invites            Listar invites (manager+)
 *   DELETE /api/organizations/:id/invites/:inviteId  Revocar (manager+)
 *
 * Public (sin auth):
 *   GET    /api/organizations/invites/:token         Info del invite (preview)
 *   POST   /api/organizations/invites/:token/accept  Aceptar invite (require auth)
 */

import { eq, and, desc }    from 'drizzle-orm'
import { getDb, schema }    from '../db/client.js'
import { authenticate,
         requireRoleAtLeast } from '../middleware/auth.js'
import {
  createOrganization,
  updateOrganization,
  deleteOrganization,
  switchActiveOrganization,
  listUserOrganizations,
  listOrganizationMembers,
  getMembership,
  addMember,
  updateMemberRole,
  removeMember,
  transferOwnership,
  countMembers,
  ROLE_OWNER, ROLE_MANAGER, ROLE_QA,
}                          from '../services/organizations-service.js'
import {
  createInvite,
  listInvites,
  revokeInvite,
  lookupInviteByToken,
  acceptInvite,
}                          from '../services/organization-invites-service.js'
import { getPlanLimits }   from '../config/plans.js'

export async function organizationsRoutes(app) {

  // ════════════════════════════════════════════════════════════════════════
  // PUBLIC INVITE LOOKUP — no requiere ser miembro (preview antes de aceptar)
  // ════════════════════════════════════════════════════════════════════════

  app.get('/invites/:token', async (req, reply) => {
    const result = await lookupInviteByToken(req.params.token)
    if (!result.valid) {
      return reply.code(404).send({ success: false, error: result.error })
    }
    return reply.send({ success: true, data: result })
  })

  app.post('/invites/:token/accept', { preHandler: [authenticate] }, async (req, reply) => {
    try {
      const result = await acceptInvite({
        token:  req.params.token,
        userId: req.user.userId,
      })

      // Auto-switch a la nueva org
      await switchActiveOrganization(req.user.userId, result.organizationId)

      return reply.send({
        success: true,
        data: {
          organizationId: result.organizationId,
          role:           result.role,
          alreadyMember:  result.alreadyMember,
        },
      })
    } catch (err) {
      return reply.code(400).send({ success: false, error: err.message })
    }
  })

  // ════════════════════════════════════════════════════════════════════════
  // PROFILE / LISTING
  // ════════════════════════════════════════════════════════════════════════

  app.get('/', { preHandler: [authenticate] }, async (req, reply) => {
    const orgs = await listUserOrganizations(req.user.userId)
    return reply.send({
      success: true,
      data: orgs.map(o => ({
        id:            o.organization.id,
        name:          o.organization.name,
        slug:          o.organization.slug,
        avatarUrl:     o.organization.avatarUrl,
        plan:          o.organization.plan,
        isPersonal:    o.organization.isPersonal,
        role:          o.role,
        joinedAt:      o.joinedAt,
        isCurrent:     o.organization.id === req.user.currentOrganizationId,
      })),
    })
  })

  app.get('/current', { preHandler: [authenticate] }, async (req, reply) => {
    const orgId = req.user.currentOrganizationId
    if (!orgId) return reply.send({ success: true, data: null })

    const db = getDb()
    const [org] = await db.select().from(schema.organizations)
      .where(eq(schema.organizations.id, orgId)).limit(1)
    if (!org) return reply.send({ success: true, data: null })

    const memberCount = await countMembers(orgId)
    return reply.send({
      success: true,
      data: { ...org, memberCount, role: req.user.role },
    })
  })

  app.post('/switch', { preHandler: [authenticate] }, async (req, reply) => {
    const { organizationId } = req.body || {}
    if (!organizationId) {
      return reply.code(400).send({ success: false, error: 'organizationId requerido' })
    }
    try {
      const m = await switchActiveOrganization(req.user.userId, organizationId)
      return reply.send({
        success: true,
        data: { organizationId, role: m.role },
      })
    } catch (err) {
      return reply.code(403).send({ success: false, error: err.message })
    }
  })

  // ════════════════════════════════════════════════════════════════════════
  // CREATE / DETAIL / UPDATE / DELETE
  // ════════════════════════════════════════════════════════════════════════

  app.post('/', { preHandler: [authenticate] }, async (req, reply) => {
    const { name, description, plan = 'teammate' } = req.body || {}
    if (!name?.trim()) {
      return reply.code(400).send({ success: false, error: 'name requerido' })
    }
    try {
      const org = await createOrganization({
        ownerId:     req.user.userId,
        name:        name.trim(),
        description: description?.trim() || null,
        plan,
        isPersonal:  false,
      })
      // Auto-switch a la nueva org
      await switchActiveOrganization(req.user.userId, org.id)
      return reply.code(201).send({ success: true, data: org })
    } catch (err) {
      return reply.code(500).send({ success: false, error: err.message })
    }
  })

  app.get('/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const orgId = req.params.id
    const m = await getMembership(req.user.userId, orgId)
    if (!m) return reply.code(403).send({ success: false, error: 'No eres miembro' })

    const db = getDb()
    const [org] = await db.select().from(schema.organizations)
      .where(eq(schema.organizations.id, orgId)).limit(1)
    if (!org) return reply.code(404).send({ success: false, error: 'No encontrada' })

    const members = await listOrganizationMembers(orgId)
    const limits = getPlanLimits(org.plan)

    return reply.send({
      success: true,
      data: {
        ...org,
        members,
        memberCount: members.length,
        currentUserRole: m.role,
        limits: { maxMembers: limits.maxMembers || 1 },
      },
    })
  })

  app.put('/:id', { preHandler: [authenticate, requireRoleAtLeast('manager')] }, async (req, reply) => {
    const orgId = req.params.id
    if (orgId !== req.user.currentOrganizationId) {
      return reply.code(403).send({ success: false, error: 'No puedes editar otra org' })
    }
    const updated = await updateOrganization(orgId, req.body || {})
    return reply.send({ success: true, data: updated })
  })

  app.delete('/:id', { preHandler: [authenticate, requireRoleAtLeast('owner')] }, async (req, reply) => {
    const orgId = req.params.id
    if (orgId !== req.user.currentOrganizationId) {
      return reply.code(403).send({ success: false, error: 'No puedes eliminar otra org' })
    }
    try {
      await deleteOrganization({ organizationId: orgId, ownerId: req.user.userId })
      return reply.send({ success: true, data: { deleted: true } })
    } catch (err) {
      return reply.code(400).send({ success: false, error: err.message })
    }
  })

  // ════════════════════════════════════════════════════════════════════════
  // MEMBERS
  // ════════════════════════════════════════════════════════════════════════

  app.get('/:id/members', { preHandler: [authenticate] }, async (req, reply) => {
    const m = await getMembership(req.user.userId, req.params.id)
    if (!m) return reply.code(403).send({ success: false, error: 'No eres miembro' })
    const members = await listOrganizationMembers(req.params.id)
    return reply.send({ success: true, data: members })
  })

  app.put('/:id/members/:userId', { preHandler: [authenticate, requireRoleAtLeast('owner')] }, async (req, reply) => {
    const orgId = req.params.id
    if (orgId !== req.user.currentOrganizationId) {
      return reply.code(403).send({ success: false, error: 'No puedes editar otra org' })
    }
    const { role } = req.body || {}
    try {
      const updated = await updateMemberRole({
        organizationId: orgId,
        userId:         req.params.userId,
        newRole:        role,
      })
      return reply.send({ success: true, data: updated })
    } catch (err) {
      return reply.code(400).send({ success: false, error: err.message })
    }
  })

  app.delete('/:id/members/:userId', { preHandler: [authenticate, requireRoleAtLeast('manager')] }, async (req, reply) => {
    const orgId = req.params.id
    if (orgId !== req.user.currentOrganizationId) {
      return reply.code(403).send({ success: false, error: 'No puedes editar otra org' })
    }
    try {
      await removeMember({ organizationId: orgId, userId: req.params.userId })
      return reply.send({ success: true, data: { removed: true } })
    } catch (err) {
      return reply.code(400).send({ success: false, error: err.message })
    }
  })

  app.post('/:id/leave', { preHandler: [authenticate] }, async (req, reply) => {
    const orgId = req.params.id
    try {
      const m = await getMembership(req.user.userId, orgId)
      if (!m) return reply.code(404).send({ success: false, error: 'No eres miembro' })
      if (m.role === ROLE_OWNER) {
        return reply.code(400).send({
          success: false,
          error:   'No puedes salirte siendo owner. Transfiere ownership primero.',
        })
      }
      await removeMember({ organizationId: orgId, userId: req.user.userId })
      return reply.send({ success: true, data: { left: true } })
    } catch (err) {
      return reply.code(400).send({ success: false, error: err.message })
    }
  })

  // ── Transfer ownership ──────────────────────────────────────────────────

  app.post('/:id/transfer-ownership', { preHandler: [authenticate, requireRoleAtLeast('owner')] }, async (req, reply) => {
    const orgId = req.params.id
    if (orgId !== req.user.currentOrganizationId) {
      return reply.code(403).send({ success: false, error: 'No puedes editar otra org' })
    }
    const { newOwnerId } = req.body || {}
    if (!newOwnerId) {
      return reply.code(400).send({ success: false, error: 'newOwnerId requerido' })
    }
    try {
      const result = await transferOwnership({
        organizationId: orgId,
        fromUserId:     req.user.userId,
        toUserId:       newOwnerId,
      })
      return reply.send({ success: true, data: result })
    } catch (err) {
      return reply.code(400).send({ success: false, error: err.message })
    }
  })

  // ════════════════════════════════════════════════════════════════════════
  // INVITES
  // ════════════════════════════════════════════════════════════════════════

  app.post('/:id/invites', { preHandler: [authenticate, requireRoleAtLeast('manager')] }, async (req, reply) => {
    const orgId = req.params.id
    if (orgId !== req.user.currentOrganizationId) {
      return reply.code(403).send({ success: false, error: 'No puedes invitar a otra org' })
    }
    const { role = 'qa', maxUses, expiresInDays } = req.body || {}

    // Verificar cuota de miembros antes de crear invite
    const db = getDb()
    const [org] = await db.select().from(schema.organizations)
      .where(eq(schema.organizations.id, orgId)).limit(1)
    if (!org) return reply.code(404).send({ success: false, error: 'Org no encontrada' })

    const limits = getPlanLimits(org.plan)
    const maxMembers = limits.maxMembers || 1
    if (maxMembers !== Infinity) {
      const count = await countMembers(orgId)
      if (count >= maxMembers) {
        return reply.code(429).send({
          success: false,
          error:   `Tu plan ${org.plan} permite hasta ${maxMembers} miembros. Sube de plan para invitar más.`,
        })
      }
    }

    try {
      const invite = await createInvite({
        organizationId: orgId,
        createdBy:      req.user.userId,
        role,
        maxUses:        maxUses ? parseInt(maxUses) : null,
        expiresInDays:  expiresInDays ? parseInt(expiresInDays) : null,
      })
      const baseUrl = process.env.FRONTEND_URL || ''
      return reply.code(201).send({
        success: true,
        data: {
          ...invite,
          shareUrl: `${baseUrl}/join/${invite.token}`,
        },
      })
    } catch (err) {
      return reply.code(400).send({ success: false, error: err.message })
    }
  })

  app.get('/:id/invites', { preHandler: [authenticate, requireRoleAtLeast('manager')] }, async (req, reply) => {
    const orgId = req.params.id
    if (orgId !== req.user.currentOrganizationId) {
      return reply.code(403).send({ success: false, error: 'No puedes ver invites de otra org' })
    }
    const invites = await listInvites(orgId)
    const baseUrl = process.env.FRONTEND_URL || ''
    return reply.send({
      success: true,
      data: invites.map(i => ({ ...i, shareUrl: `${baseUrl}/join/${i.token}` })),
    })
  })

  app.delete('/:id/invites/:inviteId', { preHandler: [authenticate, requireRoleAtLeast('manager')] }, async (req, reply) => {
    const orgId = req.params.id
    if (orgId !== req.user.currentOrganizationId) {
      return reply.code(403).send({ success: false, error: 'No puedes revocar invites de otra org' })
    }
    await revokeInvite({
      inviteId:       req.params.inviteId,
      organizationId: orgId,
    })
    return reply.send({ success: true, data: { revoked: true } })
  })
}
