import { eq, and, desc }              from 'drizzle-orm'

import { getDb, schema }              from '../db/client.js'
import { authenticate, requireFeature } from '../middleware/auth.js'
import { getPlanLimits }              from '../config/plans.js'
import { getDeviceById }              from '../config/devices.js'

const MAX_DEVICES = 10

export async function deviceFarmRoutes(app) {

  // ── POST /api/device-farms ───────────────────────────────────────────────
  app.post('/', { preHandler: [authenticate, requireFeature('deviceFarm')] }, async (req, reply) => {
    const { name, devices } = req.body || {}

    if (!name?.trim()) {
      return reply.code(400).send({ success: false, error: 'El nombre es requerido' })
    }
    if (!Array.isArray(devices) || devices.length === 0) {
      return reply.code(400).send({ success: false, error: 'Debe haber al menos 1 dispositivo' })
    }
    const limits = getPlanLimits(req.user.plan)
    const max = limits.deviceFarmMaxDevices || MAX_DEVICES
    if (devices.length > max) {
      return reply.code(400).send({
        success: false,
        error:   `Máximo ${max} dispositivos por farm en tu plan`,
      })
    }

    // Validar y enriquecer cada device contra el catálogo
    const enriched = []
    for (const d of devices) {
      const deviceId = typeof d === 'string' ? d : d.deviceId
      const cat = getDeviceById(deviceId)
      if (!cat) {
        return reply.code(400).send({
          success: false,
          error:   `Dispositivo "${deviceId}" no existe en el catálogo`,
        })
      }
      enriched.push({
        deviceId:           cat.id,
        name:               cat.name,
        category:           cat.category,
        brand:              cat.brand,
        frameStyle:         cat.frameStyle,
        viewport:           cat.viewport,
        defaultBrowserType: cat.defaultBrowserType,
      })
    }

    const db = getDb()
    const [farm] = await db.insert(schema.deviceFarms).values({
      userId:         req.user.userId,
      organizationId: req.user.organizationId || null,
      name:           name.trim(),
      devices:        enriched,
    }).returning()

    return reply.code(201).send({ success: true, data: farm })
  })

  // ── GET /api/device-farms ────────────────────────────────────────────────
  app.get('/', { preHandler: [authenticate, requireFeature('deviceFarm')] }, async (req, reply) => {
    const db = getDb()
    const farms = await db.select().from(schema.deviceFarms)
      .where(eq(schema.deviceFarms.userId, req.user.userId))
      .orderBy(desc(schema.deviceFarms.updatedAt))

    return reply.send({ success: true, data: farms })
  })

  // ── GET /api/device-farms/:id ────────────────────────────────────────────
  app.get('/:id', { preHandler: [authenticate, requireFeature('deviceFarm')] }, async (req, reply) => {
    const db = getDb()
    const [farm] = await db.select().from(schema.deviceFarms)
      .where(and(
        eq(schema.deviceFarms.id, req.params.id),
        eq(schema.deviceFarms.userId, req.user.userId),
      )).limit(1)

    if (!farm) return reply.code(404).send({ success: false, error: 'Device Farm no encontrada' })
    return reply.send({ success: true, data: farm })
  })

  // ── PUT /api/device-farms/:id ────────────────────────────────────────────
  app.put('/:id', { preHandler: [authenticate, requireFeature('deviceFarm')] }, async (req, reply) => {
    const { name, devices } = req.body || {}
    const updates = { updatedAt: new Date() }

    if (name !== undefined) updates.name = name.trim()

    if (devices !== undefined) {
      const limits = getPlanLimits(req.user.plan)
      const max = limits.deviceFarmMaxDevices || MAX_DEVICES
      if (!Array.isArray(devices) || devices.length === 0) {
        return reply.code(400).send({ success: false, error: 'Debe haber al menos 1 dispositivo' })
      }
      if (devices.length > max) {
        return reply.code(400).send({ success: false, error: `Máximo ${max} dispositivos` })
      }
      const enriched = []
      for (const d of devices) {
        const did = typeof d === 'string' ? d : d.deviceId
        const cat = getDeviceById(did)
        if (!cat) return reply.code(400).send({ success: false, error: `Device "${did}" no existe` })
        enriched.push({
          deviceId:           cat.id,
          name:               cat.name,
          category:           cat.category,
          brand:              cat.brand,
          frameStyle:         cat.frameStyle,
          viewport:           cat.viewport,
          defaultBrowserType: cat.defaultBrowserType,
        })
      }
      updates.devices = enriched
    }

    const db = getDb()
    const [updated] = await db.update(schema.deviceFarms)
      .set(updates)
      .where(and(
        eq(schema.deviceFarms.id, req.params.id),
        eq(schema.deviceFarms.userId, req.user.userId),
      ))
      .returning()

    if (!updated) return reply.code(404).send({ success: false, error: 'Device Farm no encontrada' })
    return reply.send({ success: true, data: updated })
  })

  // ── DELETE /api/device-farms/:id ─────────────────────────────────────────
  app.delete('/:id', { preHandler: [authenticate, requireFeature('deviceFarm')] }, async (req, reply) => {
    const db = getDb()
    const deleted = await db.delete(schema.deviceFarms)
      .where(and(
        eq(schema.deviceFarms.id, req.params.id),
        eq(schema.deviceFarms.userId, req.user.userId),
      ))
      .returning()

    if (deleted.length === 0) return reply.code(404).send({ success: false, error: 'Device Farm no encontrada' })
    return reply.send({ success: true, data: { deleted: true } })
  })
}
