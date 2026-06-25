import { eq, and, desc, inArray, sql } from 'drizzle-orm'

import { getDb, schema }                    from '../db/client.js'
import { authenticate, requireFeature }     from '../middleware/auth.js'
import { startSuiteRun, subscribeToSuiteRun } from '../services/suite-runner.js'

export async function suiteRoutes(app) {

  // ── POST /api/suites ─────────────────────────────────────────────────────
  // Crear una nueva suite
  app.post('/', { preHandler: [authenticate, requireFeature('testSuites')] }, async (req, reply) => {
    const { name, description, projectId } = req.body || {}

    if (!name?.trim()) {
      return reply.code(400).send({ success: false, error: 'El nombre es requerido' })
    }

    const db = getDb()
    const [suite] = await db.insert(schema.testSuites).values({
      userId:       req.user.userId,
      organizationId: req.user.organizationId || null,
      projectId:    projectId || null,
      name:         name.trim(),
      description:  description?.trim() || null,
    }).returning()

    return reply.code(201).send({ success: true, data: suite })
  })

  // ── GET /api/suites ──────────────────────────────────────────────────────
  // Listar suites del usuario
  app.get('/', { preHandler: [authenticate, requireFeature('testSuites')] }, async (req, reply) => {
    const db = getDb()

    const suites = await db.select().from(schema.testSuites)
      .where(eq(schema.testSuites.userId, req.user.userId))
      .orderBy(desc(schema.testSuites.updatedAt))

    // Incluir conteo de specs por suite
    const suiteIds = suites.map(s => s.id)
    let specCounts = {}
    if (suiteIds.length > 0) {
      const counts = await db
        .select({
          suiteId: schema.testSuiteSpecs.suiteId,
          count:   sql`count(*)::int`,
        })
        .from(schema.testSuiteSpecs)
        .where(inArray(schema.testSuiteSpecs.suiteId, suiteIds))
        .groupBy(schema.testSuiteSpecs.suiteId)
      specCounts = Object.fromEntries(counts.map(c => [c.suiteId, c.count]))
    }

    // Último run por suite
    let lastRuns = {}
    if (suiteIds.length > 0) {
      const runs = await db.select().from(schema.suiteRuns)
        .where(inArray(schema.suiteRuns.suiteId, suiteIds))
        .orderBy(desc(schema.suiteRuns.createdAt))
      for (const r of runs) {
        if (!lastRuns[r.suiteId]) lastRuns[r.suiteId] = r
      }
    }

    const data = suites.map(s => ({
      ...s,
      specCount:  specCounts[s.id] || 0,
      lastRun:    lastRuns[s.id] || null,
    }))

    return reply.send({ success: true, data })
  })

  // ── GET /api/suites/:id ──────────────────────────────────────────────────
  app.get('/:id', { preHandler: [authenticate, requireFeature('testSuites')] }, async (req, reply) => {
    const db = getDb()

    const [suite] = await db.select().from(schema.testSuites)
      .where(and(
        eq(schema.testSuites.id, req.params.id),
        eq(schema.testSuites.userId, req.user.userId),
      )).limit(1)

    if (!suite) return reply.code(404).send({ success: false, error: 'Suite no encontrada' })

    // Cargar specs asignados con su detalle
    const suiteSpecs = await db.select().from(schema.testSuiteSpecs)
      .where(eq(schema.testSuiteSpecs.suiteId, suite.id))

    let specs = []
    if (suiteSpecs.length > 0) {
      const execIds = suiteSpecs.map(s => s.executionId)
      const executions = await db.select().from(schema.executions)
        .where(inArray(schema.executions.id, execIds))

      specs = suiteSpecs.map(ss => {
        const exec = executions.find(e => e.id === ss.executionId)
        return {
          suiteSpecId:  ss.id,
          executionId:  ss.executionId,
          order:        ss.order,
          testName:     exec?.testName,
          targetUrl:    exec?.targetUrl,
          hasSpecCode:  !!exec?.specCode,
          createdAt:    ss.createdAt,
        }
      })
    }

    // Últimos 5 runs
    const recentRuns = await db.select().from(schema.suiteRuns)
      .where(eq(schema.suiteRuns.suiteId, suite.id))
      .orderBy(desc(schema.suiteRuns.createdAt))
      .limit(5)

    return reply.send({
      success: true,
      data: { ...suite, specs, recentRuns },
    })
  })

  // ── PUT /api/suites/:id ──────────────────────────────────────────────────
  app.put('/:id', { preHandler: [authenticate, requireFeature('testSuites')] }, async (req, reply) => {
    const { name, description } = req.body || {}
    const db = getDb()

    const [updated] = await db.update(schema.testSuites)
      .set({
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(description !== undefined ? { description: description?.trim() || null } : {}),
        updatedAt: new Date(),
      })
      .where(and(
        eq(schema.testSuites.id, req.params.id),
        eq(schema.testSuites.userId, req.user.userId),
      ))
      .returning()

    if (!updated) return reply.code(404).send({ success: false, error: 'Suite no encontrada' })
    return reply.send({ success: true, data: updated })
  })

  // ── DELETE /api/suites/:id ────────────────────────────────────────────────
  app.delete('/:id', { preHandler: [authenticate, requireFeature('testSuites')] }, async (req, reply) => {
    const db = getDb()
    const deleted = await db.delete(schema.testSuites)
      .where(and(
        eq(schema.testSuites.id, req.params.id),
        eq(schema.testSuites.userId, req.user.userId),
      ))
      .returning()

    if (deleted.length === 0) return reply.code(404).send({ success: false, error: 'Suite no encontrada' })
    return reply.send({ success: true, data: { deleted: true } })
  })

  // ── POST /api/suites/:id/specs ──────────────────────────────────────────
  // Asignar un spec (execution) a una suite
  app.post('/:id/specs', { preHandler: [authenticate, requireFeature('testSuites')] }, async (req, reply) => {
    const { executionId } = req.body || {}

    if (!executionId) {
      return reply.code(400).send({ success: false, error: 'executionId es requerido' })
    }

    const db = getDb()

    // Verificar que el usuario es dueño de la suite y del execution
    const [suite] = await db.select().from(schema.testSuites)
      .where(and(
        eq(schema.testSuites.id, req.params.id),
        eq(schema.testSuites.userId, req.user.userId),
      )).limit(1)
    if (!suite) return reply.code(404).send({ success: false, error: 'Suite no encontrada' })

    const [exec] = await db.select().from(schema.executions)
      .where(and(
        eq(schema.executions.id, executionId),
        eq(schema.executions.userId, req.user.userId),
      )).limit(1)
    if (!exec) return reply.code(404).send({ success: false, error: 'Ejecución no encontrada' })

    if (!exec.specCode) {
      return reply.code(400).send({
        success: false,
        error: 'Esta ejecución no tiene código generado todavía. Espera a que termine antes de agregarla a una suite.',
      })
    }

    try {
      const [added] = await db.insert(schema.testSuiteSpecs).values({
        suiteId:     suite.id,
        executionId: exec.id,
        order:       0,
      }).returning()

      return reply.code(201).send({ success: true, data: added })
    } catch (err) {
      if (err.message?.includes('unique')) {
        return reply.code(409).send({ success: false, error: 'Este spec ya está en la suite' })
      }
      throw err
    }
  })

  // ── DELETE /api/suites/:id/specs/:suiteSpecId ───────────────────────────
  app.delete('/:id/specs/:suiteSpecId', { preHandler: [authenticate, requireFeature('testSuites')] }, async (req, reply) => {
    const db = getDb()

    // Verificar dueño de la suite
    const [suite] = await db.select().from(schema.testSuites)
      .where(and(
        eq(schema.testSuites.id, req.params.id),
        eq(schema.testSuites.userId, req.user.userId),
      )).limit(1)
    if (!suite) return reply.code(404).send({ success: false, error: 'Suite no encontrada' })

    await db.delete(schema.testSuiteSpecs)
      .where(and(
        eq(schema.testSuiteSpecs.id, req.params.suiteSpecId),
        eq(schema.testSuiteSpecs.suiteId, suite.id),
      ))

    return reply.send({ success: true, data: { removed: true } })
  })

  // ── POST /api/suites/:id/run ────────────────────────────────────────────
  // Ejecutar la suite. Opcionalmente con device farm (Teammate+)
  app.post('/:id/run', { preHandler: [authenticate, requireFeature('testSuites')] }, async (req, reply) => {
    const { deviceFarmId } = req.body || {}
    const db = getDb()

    // Verificar dueño
    const [suite] = await db.select().from(schema.testSuites)
      .where(and(
        eq(schema.testSuites.id, req.params.id),
        eq(schema.testSuites.userId, req.user.userId),
      )).limit(1)
    if (!suite) return reply.code(404).send({ success: false, error: 'Suite no encontrada' })

    try {
      const result = await startSuiteRun({
        suiteId:      suite.id,
        userId:       req.user.userId,
        userPlan:     req.user.plan,
        deviceFarmId: deviceFarmId || null,
      })

      return reply.code(201).send({
        success: true,
        data: {
          ...result,
          streamUrl: `/api/suites/${suite.id}/runs/${result.suiteRunId}/stream`,
        },
      })
    } catch (err) {
      return reply.code(400).send({ success: false, error: err.message })
    }
  })

  // ── GET /api/suites/:id/runs ────────────────────────────────────────────
  app.get('/:id/runs', { preHandler: [authenticate, requireFeature('testSuites')] }, async (req, reply) => {
    const db = getDb()
    const limit = Math.min(parseInt(req.query.limit || '20'), 100)

    // Verificar dueño
    const [suite] = await db.select().from(schema.testSuites)
      .where(and(
        eq(schema.testSuites.id, req.params.id),
        eq(schema.testSuites.userId, req.user.userId),
      )).limit(1)
    if (!suite) return reply.code(404).send({ success: false, error: 'Suite no encontrada' })

    const runs = await db.select().from(schema.suiteRuns)
      .where(eq(schema.suiteRuns.suiteId, suite.id))
      .orderBy(desc(schema.suiteRuns.createdAt))
      .limit(limit)

    return reply.send({ success: true, data: runs })
  })

  // ── GET /api/suites/:id/runs/:runId ─────────────────────────────────────
  app.get('/:id/runs/:runId', { preHandler: [authenticate, requireFeature('testSuites')] }, async (req, reply) => {
    const db = getDb()

    const [run] = await db.select().from(schema.suiteRuns)
      .where(and(
        eq(schema.suiteRuns.id, req.params.runId),
        eq(schema.suiteRuns.userId, req.user.userId),
      )).limit(1)
    if (!run) return reply.code(404).send({ success: false, error: 'Run no encontrado' })

    // Cargar resultados completos (grid)
    const results = await db.select().from(schema.suiteRunResults)
      .where(eq(schema.suiteRunResults.suiteRunId, run.id))

    // Cargar specs de la suite para mostrar nombres
    const suiteSpecs = await db.select().from(schema.testSuiteSpecs)
      .where(eq(schema.testSuiteSpecs.suiteId, run.suiteId))
    const execIds = suiteSpecs.map(s => s.executionId)
    const executions = execIds.length
      ? await db.select().from(schema.executions).where(inArray(schema.executions.id, execIds))
      : []

    const specMap = {}
    for (const ss of suiteSpecs) {
      const exec = executions.find(e => e.id === ss.executionId)
      specMap[ss.id] = {
        suiteSpecId: ss.id,
        testName:    exec?.testName,
        targetUrl:   exec?.targetUrl,
      }
    }

    // Lista única de devices
    const deviceIds = [...new Set(results.map(r => r.deviceId))]

    // Device farm details
    let deviceFarm = null
    if (run.deviceFarmId) {
      const [farm] = await db.select().from(schema.deviceFarms)
        .where(eq(schema.deviceFarms.id, run.deviceFarmId)).limit(1)
      deviceFarm = farm
    }

    return reply.send({
      success: true,
      data: {
        run,
        specs:       Object.values(specMap),
        deviceIds,
        deviceFarm,
        results,
      },
    })
  })

  // ── GET /api/suites/:id/runs/:runId/stream ──────────────────────────────
  // SSE en vivo del progreso del run
  app.get('/:id/runs/:runId/stream', { preHandler: [authenticate, requireFeature('testSuites')] }, async (req, reply) => {
    const db = getDb()

    const [run] = await db.select().from(schema.suiteRuns)
      .where(and(
        eq(schema.suiteRuns.id, req.params.runId),
        eq(schema.suiteRuns.userId, req.user.userId),
      )).limit(1)
    if (!run) return reply.code(404).send({ success: false, error: 'Run no encontrado' })

    reply.raw.writeHead(200, {
      'Content-Type':                'text/event-stream',
      'Cache-Control':               'no-cache, no-transform',
      'Connection':                  'keep-alive',
      'X-Accel-Buffering':           'no',
    })

    if (run.status === 'completed' || run.status === 'failed') {
      reply.raw.write(`event: final\ndata: ${JSON.stringify({
        status: run.status,
        passed: run.passed,
        failed: run.failed,
        playwrightReportUrl: run.playwrightReportUrl,
        allureReportUrl:     run.allureReportUrl,
        allureZipUrl:        run.allureZipUrl,
      })}\n\n`)
      reply.raw.end()
      return
    }

    const heartbeat = setInterval(() => {
      try { reply.raw.write(`: ping\n\n`) } catch {}
    }, 15000)

    let unsubscribe = null
    try {
      unsubscribe = await subscribeToSuiteRun(run.id, (event) => {
        try {
          reply.raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`)
          if (event.type === 'completed' || event.type === 'reports_ready') {
            // Esperar 5s adicionales para que llegue reports_ready si está pendiente
            if (event.type === 'reports_ready') {
              setTimeout(() => {
                clearInterval(heartbeat)
                try { reply.raw.end() } catch {}
              }, 1000)
            }
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
}
