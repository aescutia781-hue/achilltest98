import { eq, and, desc, gte, sql } from 'drizzle-orm'
import { v4 as uuid }              from 'uuid'

import { getDb, schema }           from '../db/client.js'
import { authenticate }            from '../middleware/auth.js'
import { getPlanLimits, getPlan }  from '../config/plans.js'
import {
  enqueueExecution,
  getExecutionStatus,
  cancelExecution,
  subscribeToExecution,
} from '../queues/executions-queue.js'

const TRIAL_DAYS = 5

export async function executionRoutes(app) {

  // ── POST /api/executions ─────────────────────────────────────────────────────
  // Crear y encolar una nueva ejecución
  app.post('/', { preHandler: [authenticate] }, async (req, reply) => {
    const { testName, targetUrl, instructions, projectId, deviceId } = req.body || {}

    if (!testName?.trim() || !targetUrl?.trim() || !instructions?.trim()) {
      return reply.code(400).send({
        success: false,
        error:   'testName, targetUrl e instructions son requeridos',
      })
    }

    if (!_isValidUrl(targetUrl)) {
      return reply.code(400).send({ success: false, error: 'targetUrl no es una URL válida' })
    }

    const db = getDb()
    const [user] = await db.select().from(schema.users)
      .where(eq(schema.users.id, req.user.userId)).limit(1)

    if (!user) return reply.code(404).send({ success: false, error: 'Usuario no encontrado' })

    // ── Verificar límites según el plan ─────────────────────────────────────
    const limits = getPlanLimits(user.plan)
    const startOfMonth = new Date()
    startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0)

    // Contar ejecuciones del mes
    const [{ count }] = await db
      .select({ count: sql`count(*)::int` })
      .from(schema.executions)
      .where(and(
        eq(schema.executions.userId, user.id),
        gte(schema.executions.createdAt, startOfMonth),
      ))

    if (count >= limits.e2ePerMonth) {
      return reply.code(403).send({
        success:   false,
        error:     `Has alcanzado el límite mensual de ${limits.e2ePerMonth} ejecuciones para tu plan ${user.plan}`,
        upgradeUrl:'/pricing',
      })
    }

    // Trial: límite especial de specs totales
    if (user.plan === 'trial') {
      if ((user.specsUsedTrial || 0) >= getPlan('trial').trialMaxSpecs) {
        return reply.code(403).send({
          success:   false,
          error:     'Has usado los 10 specs gratuitos del trial. Actualiza a Starter para continuar.',
          upgradeUrl:'/pricing',
        })
      }
      // Verificar que el trial no haya expirado
      if (user.trialEndsAt && new Date(user.trialEndsAt) < new Date()) {
        return reply.code(403).send({
          success:   false,
          error:     'Tu trial ha expirado. Actualiza a Starter para continuar.',
          upgradeUrl:'/pricing',
        })
      }
    }

    // ── Crear el registro en DB ─────────────────────────────────────────────
    const [execution] = await db.insert(schema.executions).values({
      userId:       user.id,
      projectId:    projectId || null,
      testName:     testName.trim(),
      targetUrl:    targetUrl.trim(),
      instructions: instructions.trim(),
      deviceId:     deviceId || 'desktop-chrome',
      status:       'pending',
    }).returning()

    // Incrementar contador del trial
    if (user.plan === 'trial') {
      await db.update(schema.users)
        .set({ specsUsedTrial: (user.specsUsedTrial || 0) + 1 })
        .where(eq(schema.users.id, user.id))
    }

    // ── Encolar el job ──────────────────────────────────────────────────────
    await enqueueExecution({
      executionId:  execution.id,
      userId:       user.id,
      userPlan:     user.plan,
      testName:     execution.testName,
      targetUrl:    execution.targetUrl,
      instructions: execution.instructions,
      deviceId:     execution.deviceId,
    })

    return reply.code(201).send({
      success: true,
      data: {
        executionId: execution.id,
        status:      'pending',
        streamUrl:   `/api/executions/${execution.id}/stream`,
      },
    })
  })

  // ── GET /api/executions ──────────────────────────────────────────────────────
  // Listar ejecuciones del usuario (paginado)
  app.get('/', { preHandler: [authenticate] }, async (req, reply) => {
    const db = getDb()
    const limit  = Math.min(parseInt(req.query.limit  || '20'), 100)
    const offset = Math.max(parseInt(req.query.offset || '0'),  0)

    const rows = await db.select({
      id:           schema.executions.id,
      testName:     schema.executions.testName,
      targetUrl:    schema.executions.targetUrl,
      status:       schema.executions.status,
      durationMs:   schema.executions.durationMs,
      createdAt:    schema.executions.createdAt,
      completedAt:  schema.executions.completedAt,
    })
      .from(schema.executions)
      .where(eq(schema.executions.userId, req.user.userId))
      .orderBy(desc(schema.executions.createdAt))
      .limit(limit)
      .offset(offset)

    return reply.send({ success: true, data: rows })
  })

  // ── GET /api/executions/:id ─────────────────────────────────────────────────
  app.get('/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const db = getDb()
    const [execution] = await db.select().from(schema.executions)
      .where(and(
        eq(schema.executions.id, req.params.id),
        eq(schema.executions.userId, req.user.userId),
      )).limit(1)

    if (!execution) {
      return reply.code(404).send({ success: false, error: 'Ejecución no encontrada' })
    }

    // También obtener status real de la cola
    const queueStatus = await getExecutionStatus(req.params.id)

    return reply.send({
      success: true,
      data: {
        ...execution,
        queueStatus,
      },
    })
  })

  // ── DELETE /api/executions/:id ──────────────────────────────────────────────
  // Cancelar una ejecución encolada
  app.delete('/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const db = getDb()
    const [execution] = await db.select().from(schema.executions)
      .where(and(
        eq(schema.executions.id, req.params.id),
        eq(schema.executions.userId, req.user.userId),
      )).limit(1)

    if (!execution) {
      return reply.code(404).send({ success: false, error: 'Ejecución no encontrada' })
    }

    if (execution.status === 'completed' || execution.status === 'failed') {
      return reply.code(400).send({ success: false, error: 'La ejecución ya finalizó' })
    }

    const result = await cancelExecution(req.params.id)

    await db.update(schema.executions).set({
      status:       'cancelled',
      completedAt:  new Date(),
    }).where(eq(schema.executions.id, req.params.id))

    return reply.send({ success: true, data: result })
  })

  // ── GET /api/executions/:id/stream ──────────────────────────────────────────
  // Server-Sent Events: emite eventos en vivo de una ejecución
  app.get('/:id/stream', { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params
    const db = getDb()

    // Verificar que el usuario es dueño
    const [execution] = await db.select().from(schema.executions)
      .where(and(
        eq(schema.executions.id, id),
        eq(schema.executions.userId, req.user.userId),
      )).limit(1)

    if (!execution) {
      return reply.code(404).send({ success: false, error: 'Ejecución no encontrada' })
    }

    // Setup SSE
    reply.raw.writeHead(200, {
      'Content-Type':                'text/event-stream',
      'Cache-Control':               'no-cache, no-transform',
      'Connection':                  'keep-alive',
      'X-Accel-Buffering':           'no',
      'Access-Control-Allow-Origin': '*',
    })

    // Si ya terminó, enviar el resultado y cerrar
    if (execution.status === 'completed' || execution.status === 'failed') {
      reply.raw.write(`event: final\ndata: ${JSON.stringify({
        status:   execution.status,
        specCode: execution.specCode,
        error:    execution.errorMessage,
        result:   execution.result,
      })}\n\n`)
      reply.raw.end()
      return
    }

    // Heartbeat cada 15s para mantener la conexión viva
    const heartbeat = setInterval(() => {
      try { reply.raw.write(`: ping\n\n`) } catch {}
    }, 15000)

    // Suscribirse al canal pub/sub de esta ejecución
    let unsubscribe = null
    try {
      unsubscribe = await subscribeToExecution(id, (event) => {
        try {
          reply.raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`)
          if (event.type === 'status' && ['completed', 'failed'].includes(event.data?.status)) {
            // Esperar un poco para que llegue el evento 'result' y luego cerrar
            setTimeout(() => {
              clearInterval(heartbeat)
              try { reply.raw.end() } catch {}
            }, 2000)
          }
        } catch {}
      })
    } catch (err) {
      reply.raw.write(`event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`)
      reply.raw.end()
      return
    }

    // Cleanup cuando el cliente cierra la conexión
    req.raw.on('close', async () => {
      clearInterval(heartbeat)
      if (unsubscribe) await unsubscribe()
    })
  })
}

function _isValidUrl(str) {
  try {
    const u = new URL(str)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}
