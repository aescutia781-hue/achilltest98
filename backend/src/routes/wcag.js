/**
 * Rutas WCAG / Accesibilidad
 *
 * Targets (sitios trackeados):
 *   POST   /api/wcag/targets
 *   GET    /api/wcag/targets
 *   GET    /api/wcag/targets/:id
 *   PUT    /api/wcag/targets/:id
 *   DELETE /api/wcag/targets/:id
 *   GET    /api/wcag/targets/:id/trend       Histórico de scores
 *
 * Analyses (corridas individuales):
 *   POST   /api/wcag/analyses                Ejecutar análisis ad-hoc
 *   GET    /api/wcag/analyses                Listar
 *   GET    /api/wcag/analyses/:id            Detalle + issues
 *   GET    /api/wcag/analyses/:id/issues     Lista paginada de issues
 *   GET    /api/wcag/analyses/:id/stream     SSE en vivo
 *   DELETE /api/wcag/analyses/:id
 *
 * Issues:
 *   PUT    /api/wcag/issues/:id/status       Marcar como resolved/ignored
 */

import { eq, and, desc, gte, inArray, sql }     from 'drizzle-orm'

import { getDb, schema }                        from '../db/client.js'
import { authenticate, requireFeature }         from '../middleware/auth.js'
import { runWcagAnalysis, subscribeToWcagAnalysis } from '../services/wcag-analyzer.js'
import { getPlanLimits }                        from '../config/plans.js'

export async function wcagRoutes(app) {

  // ── TARGETS ──────────────────────────────────────────────────────────────

  app.post('/targets', { preHandler: [authenticate, requireFeature('accessibility')] }, async (req, reply) => {
    const { name, url, defaultLevel = 'AA', defaultDevice = null, config = {} } = req.body || {}

    if (!name?.trim() || !url?.trim()) {
      return reply.code(400).send({ success: false, error: 'name y url son requeridos' })
    }
    if (!['A', 'AA', 'AAA'].includes(defaultLevel)) {
      return reply.code(400).send({ success: false, error: 'defaultLevel debe ser A, AA o AAA' })
    }
    if (!_isValidUrl(url)) {
      return reply.code(400).send({ success: false, error: 'URL inválida' })
    }

    const db = getDb()
    const [target] = await db.insert(schema.wcagTargets).values({
      userId:         req.user.userId,
      organizationId: req.user.organizationId || null,
      name:           name.trim(),
      url:            url.trim(),
      defaultLevel,
      defaultDevice:  defaultDevice || null,
      config,
    }).returning()

    return reply.code(201).send({ success: true, data: target })
  })

  app.get('/targets', { preHandler: [authenticate, requireFeature('accessibility')] }, async (req, reply) => {
    const db = getDb()
    const targets = await db.select().from(schema.wcagTargets)
      .where(eq(schema.wcagTargets.userId, req.user.userId))
      .orderBy(desc(schema.wcagTargets.updatedAt))
    return reply.send({ success: true, data: targets })
  })

  app.get('/targets/:id', { preHandler: [authenticate, requireFeature('accessibility')] }, async (req, reply) => {
    const db = getDb()
    const [target] = await db.select().from(schema.wcagTargets)
      .where(and(
        eq(schema.wcagTargets.id, req.params.id),
        eq(schema.wcagTargets.userId, req.user.userId),
      )).limit(1)
    if (!target) return reply.code(404).send({ success: false, error: 'No encontrado' })

    // Últimos 10 análisis
    const analyses = await db.select().from(schema.wcagAnalyses)
      .where(eq(schema.wcagAnalyses.targetId, target.id))
      .orderBy(desc(schema.wcagAnalyses.createdAt))
      .limit(10)

    return reply.send({ success: true, data: { ...target, recentAnalyses: analyses } })
  })

  app.put('/targets/:id', { preHandler: [authenticate, requireFeature('accessibility')] }, async (req, reply) => {
    const { name, url, defaultLevel, defaultDevice, config } = req.body || {}
    const updates = { updatedAt: new Date() }

    if (name !== undefined) updates.name = name.trim()
    if (url !== undefined) {
      if (!_isValidUrl(url)) return reply.code(400).send({ success: false, error: 'URL inválida' })
      updates.url = url.trim()
    }
    if (defaultLevel !== undefined) {
      if (!['A', 'AA', 'AAA'].includes(defaultLevel)) {
        return reply.code(400).send({ success: false, error: 'defaultLevel inválido' })
      }
      updates.defaultLevel = defaultLevel
    }
    if (defaultDevice !== undefined) updates.defaultDevice = defaultDevice
    if (config !== undefined) updates.config = config

    const db = getDb()
    const [updated] = await db.update(schema.wcagTargets).set(updates)
      .where(and(
        eq(schema.wcagTargets.id, req.params.id),
        eq(schema.wcagTargets.userId, req.user.userId),
      ))
      .returning()
    if (!updated) return reply.code(404).send({ success: false, error: 'No encontrado' })
    return reply.send({ success: true, data: updated })
  })

  app.delete('/targets/:id', { preHandler: [authenticate, requireFeature('accessibility')] }, async (req, reply) => {
    const db = getDb()
    const deleted = await db.delete(schema.wcagTargets)
      .where(and(
        eq(schema.wcagTargets.id, req.params.id),
        eq(schema.wcagTargets.userId, req.user.userId),
      ))
      .returning()
    if (deleted.length === 0) return reply.code(404).send({ success: false, error: 'No encontrado' })
    return reply.send({ success: true, data: { deleted: true } })
  })

  // ── GET /targets/:id/trend ─────────────────────────────────────────────
  app.get('/targets/:id/trend', { preHandler: [authenticate, requireFeature('accessibility')] }, async (req, reply) => {
    const db = getDb()
    const days = Math.min(parseInt(req.query.days || '90'), 365)
    const since = new Date(Date.now() - days * 86400000)

    // Verificar dueño
    const [target] = await db.select().from(schema.wcagTargets)
      .where(and(
        eq(schema.wcagTargets.id, req.params.id),
        eq(schema.wcagTargets.userId, req.user.userId),
      )).limit(1)
    if (!target) return reply.code(404).send({ success: false, error: 'No encontrado' })

    const series = await db.select({
      id:          schema.wcagAnalyses.id,
      score:       schema.wcagAnalyses.score,
      totalIssues: schema.wcagAnalyses.totalIssues,
      criticalCount: schema.wcagAnalyses.criticalCount,
      highCount:   schema.wcagAnalyses.highCount,
      createdAt:   schema.wcagAnalyses.createdAt,
    })
      .from(schema.wcagAnalyses)
      .where(and(
        eq(schema.wcagAnalyses.targetId, target.id),
        eq(schema.wcagAnalyses.status, 'completed'),
        gte(schema.wcagAnalyses.createdAt, since),
      ))
      .orderBy(schema.wcagAnalyses.createdAt)

    return reply.send({ success: true, data: { target, series } })
  })

  // ── ANALYSES ─────────────────────────────────────────────────────────────

  app.post('/analyses', { preHandler: [authenticate, requireFeature('accessibility')] }, async (req, reply) => {
    const { targetId, url, name, level = 'AA', deviceId, config = {} } = req.body || {}

    // ¿De un target o ad-hoc?
    let analysisUrl = url
    let actualTargetId = null

    const db = getDb()

    if (targetId) {
      const [target] = await db.select().from(schema.wcagTargets)
        .where(and(
          eq(schema.wcagTargets.id, targetId),
          eq(schema.wcagTargets.userId, req.user.userId),
        )).limit(1)
      if (!target) return reply.code(404).send({ success: false, error: 'Target no encontrado' })

      actualTargetId = target.id
      analysisUrl = url || target.url
    }

    if (!analysisUrl) {
      return reply.code(400).send({ success: false, error: 'URL requerida (o targetId)' })
    }
    if (!_isValidUrl(analysisUrl)) {
      return reply.code(400).send({ success: false, error: 'URL inválida' })
    }
    if (!['A', 'AA', 'AAA'].includes(level)) {
      return reply.code(400).send({ success: false, error: 'Nivel debe ser A, AA o AAA' })
    }

    // Verificar cuota mensual
    const limits = getPlanLimits(req.user.plan)
    const maxPerMonth = limits.wcagPerMonth || 10

    const startOfMonth = new Date()
    startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0)
    const [{ count }] = await db.select({ count: sql`count(*)::int` })
      .from(schema.wcagAnalyses)
      .where(and(
        eq(schema.wcagAnalyses.userId, req.user.userId),
        gte(schema.wcagAnalyses.createdAt, startOfMonth),
      ))

    if (count >= maxPerMonth) {
      return reply.code(429).send({
        success: false,
        error:   `Límite mensual de ${maxPerMonth} análisis WCAG alcanzado para tu plan.`,
      })
    }

    // AAA solo para planes superiores
    if (level === 'AAA' && !limits.accessibilityTags?.includes('wcag2aaa') && req.user.plan === 'teammate') {
      return reply.code(403).send({
        success: false,
        error:   'Nivel AAA requiere plan Advance o superior',
      })
    }

    // Crear el registro
    const [analysis] = await db.insert(schema.wcagAnalyses).values({
      targetId:    actualTargetId,
      userId:      req.user.userId,
      url:         analysisUrl,
      name:        name?.trim() || null,
      level,
      deviceId:    deviceId || null,
      status:      'pending',
    }).returning()

    // Ejecutar en background (no esperar)
    runWcagAnalysis({
      analysisId: analysis.id,
      url:        analysisUrl,
      level,
      deviceId,
      targetId:   actualTargetId,
      config,
    }).catch(err => {
      console.error(`[WCAG ${analysis.id}] uncaught:`, err)
    })

    return reply.code(201).send({
      success: true,
      data: {
        ...analysis,
        streamUrl: `/api/wcag/analyses/${analysis.id}/stream`,
      },
    })
  })

  app.get('/analyses', { preHandler: [authenticate, requireFeature('accessibility')] }, async (req, reply) => {
    const db = getDb()
    const limit = Math.min(parseInt(req.query.limit || '50'), 200)

    const analyses = await db.select({
      id:            schema.wcagAnalyses.id,
      targetId:      schema.wcagAnalyses.targetId,
      url:           schema.wcagAnalyses.url,
      name:          schema.wcagAnalyses.name,
      level:         schema.wcagAnalyses.level,
      deviceId:      schema.wcagAnalyses.deviceId,
      status:        schema.wcagAnalyses.status,
      score:         schema.wcagAnalyses.score,
      totalIssues:   schema.wcagAnalyses.totalIssues,
      criticalCount: schema.wcagAnalyses.criticalCount,
      highCount:     schema.wcagAnalyses.highCount,
      durationMs:    schema.wcagAnalyses.durationMs,
      createdAt:     schema.wcagAnalyses.createdAt,
      completedAt:   schema.wcagAnalyses.completedAt,
    })
      .from(schema.wcagAnalyses)
      .where(eq(schema.wcagAnalyses.userId, req.user.userId))
      .orderBy(desc(schema.wcagAnalyses.createdAt))
      .limit(limit)

    return reply.send({ success: true, data: analyses })
  })

  app.get('/analyses/:id', { preHandler: [authenticate, requireFeature('accessibility')] }, async (req, reply) => {
    const db = getDb()
    const [analysis] = await db.select().from(schema.wcagAnalyses)
      .where(and(
        eq(schema.wcagAnalyses.id, req.params.id),
        eq(schema.wcagAnalyses.userId, req.user.userId),
      )).limit(1)
    if (!analysis) return reply.code(404).send({ success: false, error: 'No encontrado' })

    const issues = await db.select().from(schema.wcagIssues)
      .where(eq(schema.wcagIssues.analysisId, analysis.id))

    return reply.send({ success: true, data: { ...analysis, issues } })
  })

  app.delete('/analyses/:id', { preHandler: [authenticate, requireFeature('accessibility')] }, async (req, reply) => {
    const db = getDb()
    const deleted = await db.delete(schema.wcagAnalyses)
      .where(and(
        eq(schema.wcagAnalyses.id, req.params.id),
        eq(schema.wcagAnalyses.userId, req.user.userId),
      ))
      .returning()
    if (deleted.length === 0) return reply.code(404).send({ success: false, error: 'No encontrado' })
    return reply.send({ success: true, data: { deleted: true } })
  })

  // ── SSE Stream ────────────────────────────────────────────────────────
  app.get('/analyses/:id/stream', { preHandler: [authenticate, requireFeature('accessibility')] }, async (req, reply) => {
    const db = getDb()
    const [analysis] = await db.select().from(schema.wcagAnalyses)
      .where(and(
        eq(schema.wcagAnalyses.id, req.params.id),
        eq(schema.wcagAnalyses.userId, req.user.userId),
      )).limit(1)
    if (!analysis) return reply.code(404).send({ success: false, error: 'No encontrado' })

    reply.raw.writeHead(200, {
      'Content-Type':                'text/event-stream',
      'Cache-Control':               'no-cache, no-transform',
      'Connection':                  'keep-alive',
      'X-Accel-Buffering':           'no',
    })

    if (analysis.status === 'completed' || analysis.status === 'failed') {
      reply.raw.write(`event: final\ndata: ${JSON.stringify(analysis)}\n\n`)
      reply.raw.end()
      return
    }

    const heartbeat = setInterval(() => {
      try { reply.raw.write(`: ping\n\n`) } catch {}
    }, 15000)

    let unsubscribe = null
    try {
      unsubscribe = await subscribeToWcagAnalysis(analysis.id, (event) => {
        try {
          reply.raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`)
          if (event.type === 'completed' || event.type === 'error') {
            setTimeout(() => {
              clearInterval(heartbeat)
              try { reply.raw.end() } catch {}
            }, 1000)
          }
        } catch {}
      })
    } catch (err) {
      reply.raw.write(`event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`)
      reply.raw.end()
      return
    }

    req.raw.on('close', async () => {
      clearInterval(heartbeat)
      if (unsubscribe) await unsubscribe()
    })
  })

  // ── PUT /issues/:id/status ────────────────────────────────────────────
  app.put('/issues/:id/status', { preHandler: [authenticate, requireFeature('accessibility')] }, async (req, reply) => {
    const { status, ignoredReason } = req.body || {}
    if (!['open', 'resolved', 'ignored', 'wontfix'].includes(status)) {
      return reply.code(400).send({ success: false, error: 'Status inválido' })
    }

    const db = getDb()
    // Verificar que el issue pertenece a un análisis del usuario
    const [issue] = await db.select({ analysisId: schema.wcagIssues.analysisId })
      .from(schema.wcagIssues)
      .where(eq(schema.wcagIssues.id, req.params.id))
      .limit(1)
    if (!issue) return reply.code(404).send({ success: false, error: 'No encontrado' })

    const [analysis] = await db.select({ id: schema.wcagAnalyses.id })
      .from(schema.wcagAnalyses)
      .where(and(
        eq(schema.wcagAnalyses.id, issue.analysisId),
        eq(schema.wcagAnalyses.userId, req.user.userId),
      )).limit(1)
    if (!analysis) return reply.code(403).send({ success: false, error: 'Forbidden' })

    await db.update(schema.wcagIssues)
      .set({ status, ignoredReason: status === 'ignored' ? (ignoredReason || null) : null })
      .where(eq(schema.wcagIssues.id, req.params.id))

    return reply.send({ success: true, data: { id: req.params.id, status } })
  })
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function _isValidUrl(u) {
  try {
    const url = new URL(u)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch { return false }
}
