/**
 * Rutas Repair Agent
 *
 *   POST   /api/repair/estimate            Estimar costo y cuota ANTES de iniciar
 *   POST   /api/repair                     Iniciar sesión de reparación
 *   GET    /api/repair/sessions/:id        Detalle (incluye diff calculado)
 *   POST   /api/repair/sessions/:id/apply  Aplicar cambios (crea revision)
 *   POST   /api/repair/sessions/:id/reject Rechazar
 *   POST   /api/repair/sessions/:id/rollback   Revertir aplicación
 *   GET    /api/repair/sessions            Listar (con filtro por specId)
 *   GET    /api/repair/usage               Uso del mes actual
 *
 *   POST   /api/repair/sessions/:id/retry  Re-intentar con re-execute si snapshot falló
 *
 * Permisos: cualquier miembro con plan Teammate puede usar repair en su org.
 */

import { eq, and, desc }    from 'drizzle-orm'
import { getDb, schema }    from '../db/client.js'
import {
  authenticate,
  requireFeature,
  requireOrganization,
}                           from '../middleware/auth.js'
import {
  startRepair,
  applyRepair,
  rejectRepair,
  rollbackRepair,
  getRepairSession,
  getCurrentMonthUsage,
}                           from '../services/repair-agent.js'
import { computeDiff,
         diffStats }        from '../services/spec-diff.js'
import { getPlanLimits }    from '../config/plans.js'
import { isClaudeConfigured,
         estimateCost,
         MODELS }           from '../services/claude-client.js'

export async function repairRoutes(app) {

  // ════════════════════════════════════════════════════════════════════════
  // ESTIMATE COST (antes de iniciar el repair, mostrar al user)
  // ════════════════════════════════════════════════════════════════════════

  app.post('/estimate', { preHandler: [authenticate, requireFeature('repair'), requireOrganization] }, async (req, reply) => {
    const { specId, executionId } = req.body || {}
    if (!specId && !executionId) {
      return reply.code(400).send({ success: false, error: 'specId o executionId requerido' })
    }

    const db = getDb()

    let specCode = ''
    let errorMessage = ''
    if (executionId) {
      const [e] = await db.select().from(schema.executions)
        .where(eq(schema.executions.id, executionId)).limit(1)
      if (e) {
        specCode = e.specCode || ''
        errorMessage = e.errorMessage || ''
      }
    }

    // Aproximación: system prompt + spec + error + DOM context
    const SYSTEM_TOKENS_APPROX = 1200
    const DOM_TOKENS_APPROX    = 1500
    const userText = specCode + errorMessage + ' '.repeat(DOM_TOKENS_APPROX * 3.7)
    const expectedOutput = Math.max(800, Math.ceil(specCode.length / 3.7) + 300)

    const haikuEstimate = estimateCost({
      systemText:           ' '.repeat(SYSTEM_TOKENS_APPROX * 3.7),
      userText,
      expectedOutputTokens: expectedOutput,
      model:                MODELS.HAIKU,
      cacheSystem:          true,
    })

    const sonnetEstimate = estimateCost({
      systemText:           ' '.repeat(SYSTEM_TOKENS_APPROX * 3.7),
      userText,
      expectedOutputTokens: expectedOutput,
      model:                MODELS.SONNET,
      cacheSystem:          true,
    })

    const bestCase  = haikuEstimate
    const worstCase = {
      inputTokens:  haikuEstimate.inputTokens + sonnetEstimate.inputTokens,
      outputTokens: haikuEstimate.outputTokens + sonnetEstimate.outputTokens,
      costUsd:      Number((haikuEstimate.costUsd + sonnetEstimate.costUsd).toFixed(6)),
      costMxn:      Number(((haikuEstimate.costUsd + sonnetEstimate.costUsd) * 17.46).toFixed(4)),
    }

    const { getCurrentMonthUsage } = await import('../services/repair-agent.js')
    const usage = await getCurrentMonthUsage(req.user.currentOrganizationId)
    const limits = getPlanLimits(req.user.plan)
    const maxRepairs = limits.repairsPerMonth ?? 0

    return reply.send({
      success: true,
      data: {
        bestCase,
        worstCase,
        averageCostUsd: Number(((bestCase.costUsd + worstCase.costUsd) / 2).toFixed(6)),
        averageCostMxn: Number(((bestCase.costUsd + worstCase.costUsd) / 2 * 17.46).toFixed(4)),
        strategy: 'escalonado-haiku-sonnet',
        models: { pass1: MODELS.HAIKU, pass2: MODELS.SONNET },
        usage: {
          current:   usage.repairCount || 0,
          limit:     maxRepairs === Infinity ? null : maxRepairs,
          remaining: maxRepairs === Infinity ? null : Math.max(0, maxRepairs - (usage.repairCount || 0)),
        },
      },
    })
  })

  // ════════════════════════════════════════════════════════════════════════
  // START REPAIR
  // ════════════════════════════════════════════════════════════════════════

  app.post('/', { preHandler: [authenticate, requireFeature('repair'), requireOrganization] }, async (req, reply) => {
    const { specId, executionId, suiteRunId, forceReExecute = false } = req.body || {}

    if (!specId && !executionId) {
      return reply.code(400).send({
        success: false,
        error:   'specId o executionId requerido',
      })
    }

    if (!isClaudeConfigured()) {
      return reply.code(503).send({
        success: false,
        error:   'Repair Agent no disponible. ANTHROPIC_API_KEY no configurado.',
      })
    }

    // ── Verificar cuota mensual ───────────────────────────────────────────
    const limits = getPlanLimits(req.user.plan)
    const maxRepairs = limits.repairsPerMonth ?? 0

    if (maxRepairs === 0) {
      return reply.code(403).send({
        success: false,
        error:   `Tu plan ${req.user.plan} no incluye Repair Agent. Sube a Teammate o superior.`,
        upgradeUrl: '/pricing',
      })
    }

    const usage = await getCurrentMonthUsage(req.user.currentOrganizationId)
    if (maxRepairs !== Infinity && usage.repairCount >= maxRepairs) {
      return reply.code(429).send({
        success: false,
        error:   `Has alcanzado tu cuota mensual de ${maxRepairs} repairs. Se reinicia el día 1 del próximo mes.`,
        current: usage.repairCount,
        limit:   maxRepairs,
      })
    }

    try {
      const session = await startRepair({
        organizationId:  req.user.currentOrganizationId,
        userId:          req.user.userId,
        specId,
        executionId,
        suiteRunId,
        forceReExecute,
      })
      return reply.code(201).send({ success: true, data: session })
    } catch (err) {
      console.error('[Repair] start:', err)
      return reply.code(err.status || 500).send({ success: false, error: err.message })
    }
  })

  // ════════════════════════════════════════════════════════════════════════
  // SESSION DETAIL (con diff calculado on-the-fly)
  // ════════════════════════════════════════════════════════════════════════

  app.get('/sessions/:id', { preHandler: [authenticate, requireFeature('repair'), requireOrganization] }, async (req, reply) => {
    const session = await getRepairSession(req.params.id, req.user.currentOrganizationId)
    if (!session) return reply.code(404).send({ success: false, error: 'No encontrada' })

    let diff = null
    let stats = null
    if (session.originalCode && session.proposedCode) {
      diff = computeDiff(session.originalCode, session.proposedCode)
      stats = diffStats(diff)
    }

    return reply.send({
      success: true,
      data: { ...session, diff, diffStats: stats },
    })
  })

  // ════════════════════════════════════════════════════════════════════════
  // APPLY / REJECT / ROLLBACK
  // ════════════════════════════════════════════════════════════════════════

  app.post('/sessions/:id/apply', { preHandler: [authenticate, requireFeature('repair'), requireOrganization] }, async (req, reply) => {
    try {
      const result = await applyRepair({
        sessionId: req.params.id,
        userId:    req.user.userId,
      })
      return reply.send({ success: true, data: result })
    } catch (err) {
      return reply.code(400).send({ success: false, error: err.message })
    }
  })

  app.post('/sessions/:id/reject', { preHandler: [authenticate, requireFeature('repair'), requireOrganization] }, async (req, reply) => {
    const { reason } = req.body || {}
    try {
      const result = await rejectRepair({
        sessionId: req.params.id,
        userId:    req.user.userId,
        reason,
      })
      return reply.send({ success: true, data: result })
    } catch (err) {
      return reply.code(400).send({ success: false, error: err.message })
    }
  })

  app.post('/sessions/:id/rollback', { preHandler: [authenticate, requireFeature('repair'), requireOrganization] }, async (req, reply) => {
    try {
      const result = await rollbackRepair({
        sessionId: req.params.id,
        userId:    req.user.userId,
      })
      return reply.send({ success: true, data: result })
    } catch (err) {
      return reply.code(400).send({ success: false, error: err.message })
    }
  })

  // ════════════════════════════════════════════════════════════════════════
  // RETRY (forzar re-execute si el snapshot no resolvió)
  // ════════════════════════════════════════════════════════════════════════

  app.post('/sessions/:id/retry', { preHandler: [authenticate, requireFeature('repair'), requireOrganization] }, async (req, reply) => {
    const db = getDb()
    const [session] = await db.select().from(schema.repairSessions)
      .where(and(
        eq(schema.repairSessions.id, req.params.id),
        eq(schema.repairSessions.organizationId, req.user.currentOrganizationId),
      )).limit(1)

    if (!session) return reply.code(404).send({ success: false, error: 'No encontrada' })

    try {
      const newSession = await startRepair({
        organizationId:  req.user.currentOrganizationId,
        userId:          req.user.userId,
        specId:          session.specId,
        executionId:     session.executionId,
        suiteRunId:      session.suiteRunId,
        forceReExecute:  true,
      })
      return reply.code(201).send({ success: true, data: newSession })
    } catch (err) {
      return reply.code(err.status || 500).send({ success: false, error: err.message })
    }
  })

  // ════════════════════════════════════════════════════════════════════════
  // LIST + USAGE
  // ════════════════════════════════════════════════════════════════════════

  app.get('/sessions', { preHandler: [authenticate, requireFeature('repair'), requireOrganization] }, async (req, reply) => {
    const db = getDb()
    const where = [eq(schema.repairSessions.organizationId, req.user.currentOrganizationId)]
    if (req.query.specId) {
      where.push(eq(schema.repairSessions.specId, req.query.specId))
    }
    const sessions = await db.select().from(schema.repairSessions)
      .where(and(...where))
      .orderBy(desc(schema.repairSessions.createdAt))
      .limit(Math.min(parseInt(req.query.limit) || 50, 100))
    return reply.send({ success: true, data: sessions })
  })

  app.get('/usage', { preHandler: [authenticate, requireFeature('repair'), requireOrganization] }, async (req, reply) => {
    const usage = await getCurrentMonthUsage(req.user.currentOrganizationId)
    const limits = getPlanLimits(req.user.plan)
    const maxRepairs = limits.repairsPerMonth ?? 0

    return reply.send({
      success: true,
      data: {
        ...usage,
        limit:     maxRepairs === Infinity ? null : maxRepairs,
        remaining: maxRepairs === Infinity
          ? null
          : Math.max(0, maxRepairs - (usage.repairCount || 0)),
      },
    })
  })
}
