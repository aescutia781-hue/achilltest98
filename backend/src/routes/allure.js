/**
 * Rutas Allure
 *
 * Projects:
 *   POST   /api/allure/projects                    Crear project
 *   GET    /api/allure/projects                    Listar projects del user
 *   GET    /api/allure/projects/:id                Detalle + runs recientes
 *   PUT    /api/allure/projects/:id
 *   DELETE /api/allure/projects/:id
 *   GET    /api/allure/projects/:id/flaky          Lista de tests flaky
 *   GET    /api/allure/projects/:id/trend          Trend del pass rate
 *
 * Upload tokens:
 *   POST   /api/allure/projects/:id/rotate-token   Genera nuevo upload_token
 *   POST   /api/allure/projects/:id/upload         Recibe ZIP (auth con token)
 *
 * Runs:
 *   POST   /api/allure/runs/from-suite             Generar desde suite_run
 *   GET    /api/allure/runs                        Listar runs del user
 *   GET    /api/allure/runs/:id                    Detalle del run
 *   GET    /api/allure/runs/:id/stream             SSE en vivo
 *   DELETE /api/allure/runs/:id
 *
 *   POST   /api/allure/runs/:id/share              Activar share link
 *   DELETE /api/allure/runs/:id/share              Desactivar share link
 *
 * Public (no auth):
 *   GET    /api/allure/public/:shareToken          Lookup público del reporte
 */

import { eq, and, desc, gte, sql, inArray }     from 'drizzle-orm'

import { getDb, schema }                        from '../db/client.js'
import { authenticate, requireFeature }         from '../middleware/auth.js'
import { generateUploadToken, generateShareToken,
         verifyUploadToken, extractUploadToWorkDir } from '../services/allure-uploader.js'
import { processAllureRun,
         processSuiteRunAsAllure,
         subscribeToAllureRun }                 from '../services/allure-service.js'
import { compareWithPreviousRun }               from '../services/allure-history-tracker.js'
import { getPlanLimits }                        from '../config/plans.js'

export async function allureRoutes(app) {

  // ════════════════════════════════════════════════════════════════════════
  // PROJECTS
  // ════════════════════════════════════════════════════════════════════════

  app.post('/projects', { preHandler: [authenticate, requireFeature('allureReport')] }, async (req, reply) => {
    const { name, description, tags = [] } = req.body || {}
    if (!name?.trim()) {
      return reply.code(400).send({ success: false, error: 'name requerido' })
    }

    // Verificar cuota de projects
    const limits = getPlanLimits(req.user.plan)
    const maxProjects = limits.allureProjects ?? 3

    const db = getDb()
    if (maxProjects !== Infinity) {
      const [{ count }] = await db.select({ count: sql`count(*)::int` })
        .from(schema.allureProjects)
        .where(eq(schema.allureProjects.userId, req.user.userId))
      if (count >= maxProjects) {
        return reply.code(429).send({
          success: false,
          error:   `Tu plan permite máximo ${maxProjects} projects de Allure`,
        })
      }
    }

    // Generar upload token solo si el plan lo permite
    const canUseUploads = limits.allureExternalUploads === true
    const uploadToken = canUseUploads ? generateUploadToken() : null

    const [project] = await db.insert(schema.allureProjects).values({
      userId:         req.user.userId,
      organizationId: req.user.organizationId || null,
      name:           name.trim(),
      description:    description?.trim() || null,
      tags,
      uploadToken,
      uploadEnabled:  canUseUploads,
    }).returning()

    return reply.code(201).send({ success: true, data: project })
  })

  app.get('/projects', { preHandler: [authenticate, requireFeature('allureReport')] }, async (req, reply) => {
    const db = getDb()
    const projects = await db.select({
      id:             schema.allureProjects.id,
      name:           schema.allureProjects.name,
      description:    schema.allureProjects.description,
      tags:           schema.allureProjects.tags,
      uploadEnabled:  schema.allureProjects.uploadEnabled,
      lastRunId:      schema.allureProjects.lastRunId,
      lastRunAt:      schema.allureProjects.lastRunAt,
      lastPassRate:   schema.allureProjects.lastPassRate,
      totalRuns:      schema.allureProjects.totalRuns,
      createdAt:      schema.allureProjects.createdAt,
      updatedAt:      schema.allureProjects.updatedAt,
    })
      .from(schema.allureProjects)
      .where(eq(schema.allureProjects.userId, req.user.userId))
      .orderBy(desc(schema.allureProjects.updatedAt))

    return reply.send({ success: true, data: projects })
  })

  app.get('/projects/:id', { preHandler: [authenticate, requireFeature('allureReport')] }, async (req, reply) => {
    const db = getDb()
    const [project] = await db.select().from(schema.allureProjects)
      .where(and(
        eq(schema.allureProjects.id, req.params.id),
        eq(schema.allureProjects.userId, req.user.userId),
      )).limit(1)
    if (!project) return reply.code(404).send({ success: false, error: 'No encontrado' })

    // Runs recientes
    const recentRuns = await db.select({
      id:           schema.allureRuns.id,
      name:         schema.allureRuns.name,
      source:       schema.allureRuns.source,
      status:       schema.allureRuns.status,
      totalTests:   schema.allureRuns.totalTests,
      passed:       schema.allureRuns.passed,
      failed:       schema.allureRuns.failed,
      broken:       schema.allureRuns.broken,
      skipped:      schema.allureRuns.skipped,
      passRate:     schema.allureRuns.passRate,
      durationMs:   schema.allureRuns.durationMs,
      branch:       schema.allureRuns.branch,
      environment:  schema.allureRuns.environment,
      buildNumber:  schema.allureRuns.buildNumber,
      shareEnabled: schema.allureRuns.shareEnabled,
      createdAt:    schema.allureRuns.createdAt,
    })
      .from(schema.allureRuns)
      .where(eq(schema.allureRuns.projectId, project.id))
      .orderBy(desc(schema.allureRuns.createdAt))
      .limit(20)

    // Construir URL del upload endpoint (sin token, ese se muestra solo al rotar)
    const uploadUrl = `${req.protocol}://${req.hostname}/api/allure/projects/${project.id}/upload`

    // No devolver el upload_token completo (security)
    const safeProject = {
      ...project,
      uploadToken: project.uploadToken ? `${project.uploadToken.slice(0, 6)}...` : null,
      uploadUrl,
    }

    return reply.send({ success: true, data: { ...safeProject, recentRuns } })
  })

  app.put('/projects/:id', { preHandler: [authenticate, requireFeature('allureReport')] }, async (req, reply) => {
    const { name, description, tags, uploadEnabled } = req.body || {}
    const updates = { updatedAt: new Date() }

    if (name !== undefined)        updates.name = name.trim()
    if (description !== undefined) updates.description = description?.trim() || null
    if (tags !== undefined)        updates.tags = tags
    if (uploadEnabled !== undefined) updates.uploadEnabled = !!uploadEnabled

    const db = getDb()
    const [updated] = await db.update(schema.allureProjects).set(updates)
      .where(and(
        eq(schema.allureProjects.id, req.params.id),
        eq(schema.allureProjects.userId, req.user.userId),
      ))
      .returning()
    if (!updated) return reply.code(404).send({ success: false, error: 'No encontrado' })
    return reply.send({ success: true, data: updated })
  })

  app.delete('/projects/:id', { preHandler: [authenticate, requireFeature('allureReport')] }, async (req, reply) => {
    const db = getDb()
    const deleted = await db.delete(schema.allureProjects)
      .where(and(
        eq(schema.allureProjects.id, req.params.id),
        eq(schema.allureProjects.userId, req.user.userId),
      ))
      .returning()
    if (deleted.length === 0) return reply.code(404).send({ success: false, error: 'No encontrado' })
    return reply.send({ success: true, data: { deleted: true } })
  })

  app.get('/projects/:id/flaky', { preHandler: [authenticate, requireFeature('allureReport')] }, async (req, reply) => {
    const db = getDb()
    // Verificar dueño
    const [project] = await db.select().from(schema.allureProjects)
      .where(and(
        eq(schema.allureProjects.id, req.params.id),
        eq(schema.allureProjects.userId, req.user.userId),
      )).limit(1)
    if (!project) return reply.code(404).send({ success: false, error: 'No encontrado' })

    const flaky = await db.select().from(schema.allureFlakyTests)
      .where(eq(schema.allureFlakyTests.projectId, project.id))
      .orderBy(desc(schema.allureFlakyTests.flakyScore))

    return reply.send({ success: true, data: flaky })
  })

  app.get('/projects/:id/trend', { preHandler: [authenticate, requireFeature('allureReport')] }, async (req, reply) => {
    const db = getDb()
    const days = Math.min(parseInt(req.query.days || '90'), 365)
    const since = new Date(Date.now() - days * 86400000)

    const [project] = await db.select().from(schema.allureProjects)
      .where(and(
        eq(schema.allureProjects.id, req.params.id),
        eq(schema.allureProjects.userId, req.user.userId),
      )).limit(1)
    if (!project) return reply.code(404).send({ success: false, error: 'No encontrado' })

    const series = await db.select({
      id:         schema.allureRuns.id,
      totalTests: schema.allureRuns.totalTests,
      passed:     schema.allureRuns.passed,
      failed:     schema.allureRuns.failed,
      broken:     schema.allureRuns.broken,
      passRate:   schema.allureRuns.passRate,
      durationMs: schema.allureRuns.durationMs,
      createdAt:  schema.allureRuns.createdAt,
    })
      .from(schema.allureRuns)
      .where(and(
        eq(schema.allureRuns.projectId, project.id),
        eq(schema.allureRuns.status, 'completed'),
        gte(schema.allureRuns.createdAt, since),
      ))
      .orderBy(schema.allureRuns.createdAt)

    return reply.send({ success: true, data: { project, series } })
  })

  // ════════════════════════════════════════════════════════════════════════
  // UPLOAD TOKENS
  // ════════════════════════════════════════════════════════════════════════

  app.post('/projects/:id/rotate-token', { preHandler: [authenticate, requireFeature('allureReport')] }, async (req, reply) => {
    const limits = getPlanLimits(req.user.plan)
    if (!limits.allureExternalUploads) {
      return reply.code(403).send({
        success: false,
        error:   'Los uploads externos requieren plan Advance o superior',
      })
    }

    const db = getDb()
    const newToken = generateUploadToken()
    const [updated] = await db.update(schema.allureProjects).set({
      uploadToken:   newToken,
      uploadEnabled: true,
      updatedAt:     new Date(),
    })
      .where(and(
        eq(schema.allureProjects.id, req.params.id),
        eq(schema.allureProjects.userId, req.user.userId),
      ))
      .returning()
    if (!updated) return reply.code(404).send({ success: false, error: 'No encontrado' })

    // Devolver el token COMPLETO solo en este endpoint (única vez visible)
    return reply.send({ success: true, data: { uploadToken: newToken } })
  })

  // ── UPLOAD ENDPOINT (sin JWT auth, usa upload_token) ─────────────────────
  app.post('/projects/:id/upload', async (req, reply) => {
    const projectId = req.params.id

    // ── Verificar token ──────────────────────────────────────────────────
    const authHeader = req.headers.authorization || ''
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : req.headers['x-upload-token']

    if (!token) {
      return reply.code(401).send({ success: false, error: 'Upload token requerido' })
    }

    const db = getDb()
    const [project] = await db.select().from(schema.allureProjects)
      .where(eq(schema.allureProjects.id, projectId)).limit(1)

    if (!project) return reply.code(404).send({ success: false, error: 'Project no encontrado' })

    if (!project.uploadEnabled || !verifyUploadToken(token, project.uploadToken)) {
      return reply.code(403).send({ success: false, error: 'Token inválido o uploads deshabilitados' })
    }

    // ── Metadata opcional del CI/CD ──────────────────────────────────────
    const buildNumber = req.headers['x-build-number'] || null
    const branch      = req.headers['x-branch']       || null
    const commitSha   = req.headers['x-commit-sha']   || null
    const environment = req.headers['x-environment']  || null
    const runName     = req.headers['x-run-name']     || null

    // Verificar cuota mensual de runs
    const limits = getPlanLimits(req.user?.plan || 'teammate')
    // Nota: para uploads externos no hay req.user (no JWT); usamos el dueño del project
    const ownerLimits = getPlanLimits(await _getUserPlan(project.userId))
    const maxRunsPerMonth = ownerLimits.allureRunsPerMonth || 100

    const startOfMonth = new Date()
    startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0)
    const [{ count: monthCount }] = await db.select({ count: sql`count(*)::int` })
      .from(schema.allureRuns)
      .where(and(
        eq(schema.allureRuns.userId, project.userId),
        gte(schema.allureRuns.createdAt, startOfMonth),
      ))

    if (monthCount >= maxRunsPerMonth) {
      return reply.code(429).send({
        success: false,
        error:   `Límite mensual de ${maxRunsPerMonth} Allure runs alcanzado`,
      })
    }

    // ── Crear el registro del run ────────────────────────────────────────
    const [run] = await db.insert(schema.allureRuns).values({
      projectId,
      userId:        project.userId,
      name:          runName || `CI Build ${buildNumber || ''}`.trim(),
      source:        'upload',
      sourceRef:     'api',
      buildNumber,
      branch,
      commitSha,
      environment,
      status:        'pending',
    }).returning()

    // ── Recibir y extraer el ZIP ─────────────────────────────────────────
    let workDir = null
    try {
      const result = await extractUploadToWorkDir(req.raw, run.id)
      workDir = result.workDir

      // ── Procesar en background ──────────────────────────────────────────
      processAllureRun({
        runId: run.id,
        resultsDir: workDir,
        executor: {
          name:       'CI/CD Upload',
          type:       'ci-upload',
          buildName:  buildNumber ? `Build ${buildNumber}` : 'External Upload',
        },
        cleanupAfter: true,
      }).catch(err => console.error(`[Allure ${run.id}]`, err))

      return reply.code(201).send({
        success: true,
        data: {
          runId:        run.id,
          resultsCount: result.resultCount,
          message:      'Procesando reporte en background',
          reportUrl:    `/allure/runs/${run.id}`,
        },
      })
    } catch (err) {
      // Marcar el run como fallido
      await db.update(schema.allureRuns).set({
        status:       'failed',
        errorMessage: err.message,
        completedAt:  new Date(),
      }).where(eq(schema.allureRuns.id, run.id))

      return reply.code(400).send({ success: false, error: err.message })
    }
  })

  // ════════════════════════════════════════════════════════════════════════
  // RUNS
  // ════════════════════════════════════════════════════════════════════════

  // Generar desde suite_run
  app.post('/runs/from-suite', { preHandler: [authenticate, requireFeature('allureReport')] }, async (req, reply) => {
    const { suiteRunId, projectId, name } = req.body || {}
    if (!suiteRunId || !projectId) {
      return reply.code(400).send({ success: false, error: 'suiteRunId y projectId son requeridos' })
    }

    const db = getDb()
    // Verificar dueño del suite run
    const [suiteRun] = await db.select().from(schema.suiteRuns)
      .where(eq(schema.suiteRuns.id, suiteRunId)).limit(1)
    if (!suiteRun || suiteRun.userId !== req.user.userId) {
      return reply.code(404).send({ success: false, error: 'Suite run no encontrado' })
    }

    const [project] = await db.select().from(schema.allureProjects)
      .where(and(
        eq(schema.allureProjects.id, projectId),
        eq(schema.allureProjects.userId, req.user.userId),
      )).limit(1)
    if (!project) return reply.code(404).send({ success: false, error: 'Project no encontrado' })

    const [run] = await db.insert(schema.allureRuns).values({
      projectId,
      userId:    req.user.userId,
      name:      name?.trim() || `Suite Run ${suiteRunId.slice(0, 8)}`,
      source:    'suite_run',
      sourceRef: suiteRunId,
      status:    'pending',
    }).returning()

    // Procesar en background
    processSuiteRunAsAllure({ allureRunId: run.id, suiteRunId })
      .catch(err => console.error(`[Allure ${run.id}]`, err))

    return reply.code(201).send({
      success: true,
      data: { ...run, streamUrl: `/api/allure/runs/${run.id}/stream` },
    })
  })

  // Listar runs del user
  app.get('/runs', { preHandler: [authenticate, requireFeature('allureReport')] }, async (req, reply) => {
    const db = getDb()
    const limit = Math.min(parseInt(req.query.limit || '50'), 200)

    const runs = await db.select({
      id:           schema.allureRuns.id,
      projectId:    schema.allureRuns.projectId,
      name:         schema.allureRuns.name,
      source:       schema.allureRuns.source,
      status:       schema.allureRuns.status,
      totalTests:   schema.allureRuns.totalTests,
      passed:       schema.allureRuns.passed,
      failed:       schema.allureRuns.failed,
      broken:       schema.allureRuns.broken,
      skipped:      schema.allureRuns.skipped,
      passRate:     schema.allureRuns.passRate,
      durationMs:   schema.allureRuns.durationMs,
      branch:       schema.allureRuns.branch,
      environment:  schema.allureRuns.environment,
      buildNumber:  schema.allureRuns.buildNumber,
      reportUrl:    schema.allureRuns.reportUrl,
      shareEnabled: schema.allureRuns.shareEnabled,
      createdAt:    schema.allureRuns.createdAt,
    })
      .from(schema.allureRuns)
      .where(eq(schema.allureRuns.userId, req.user.userId))
      .orderBy(desc(schema.allureRuns.createdAt))
      .limit(limit)

    // Enriquecer con nombre del project
    const projectIds = [...new Set(runs.map(r => r.projectId))]
    const projects = projectIds.length
      ? await db.select({ id: schema.allureProjects.id, name: schema.allureProjects.name })
          .from(schema.allureProjects)
          .where(inArray(schema.allureProjects.id, projectIds))
      : []
    const pMap = Object.fromEntries(projects.map(p => [p.id, p.name]))

    const enriched = runs.map(r => ({ ...r, projectName: pMap[r.projectId] }))

    return reply.send({ success: true, data: enriched })
  })

  // Detalle de un run
  app.get('/runs/:id', { preHandler: [authenticate, requireFeature('allureReport')] }, async (req, reply) => {
    const db = getDb()
    const [run] = await db.select().from(schema.allureRuns)
      .where(and(
        eq(schema.allureRuns.id, req.params.id),
        eq(schema.allureRuns.userId, req.user.userId),
      )).limit(1)
    if (!run) return reply.code(404).send({ success: false, error: 'No encontrado' })

    const [project] = await db.select().from(schema.allureProjects)
      .where(eq(schema.allureProjects.id, run.projectId)).limit(1)

    // Comparación con el run anterior
    let comparison = null
    if (run.status === 'completed') {
      try {
        comparison = await compareWithPreviousRun(run.projectId, run.id)
      } catch {}
    }

    // No devolver el snapshot crudo (puede ser MB de JSON)
    const { testsSnapshot, ...safeRun } = run

    return reply.send({ success: true, data: { ...safeRun, project, comparison } })
  })

  // SSE stream
  app.get('/runs/:id/stream', { preHandler: [authenticate, requireFeature('allureReport')] }, async (req, reply) => {
    const db = getDb()
    const [run] = await db.select().from(schema.allureRuns)
      .where(and(
        eq(schema.allureRuns.id, req.params.id),
        eq(schema.allureRuns.userId, req.user.userId),
      )).limit(1)
    if (!run) return reply.code(404).send({ success: false, error: 'No encontrado' })

    reply.raw.writeHead(200, {
      'Content-Type':                'text/event-stream',
      'Cache-Control':               'no-cache, no-transform',
      'Connection':                  'keep-alive',
      'X-Accel-Buffering':           'no',
    })

    if (run.status === 'completed' || run.status === 'failed') {
      reply.raw.write(`event: final\ndata: ${JSON.stringify(run)}\n\n`)
      reply.raw.end()
      return
    }

    const heartbeat = setInterval(() => {
      try { reply.raw.write(`: ping\n\n`) } catch {}
    }, 15000)

    let unsubscribe = null
    try {
      unsubscribe = await subscribeToAllureRun(run.id, (event) => {
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

  app.delete('/runs/:id', { preHandler: [authenticate, requireFeature('allureReport')] }, async (req, reply) => {
    const db = getDb()
    const deleted = await db.delete(schema.allureRuns)
      .where(and(
        eq(schema.allureRuns.id, req.params.id),
        eq(schema.allureRuns.userId, req.user.userId),
      ))
      .returning()
    if (deleted.length === 0) return reply.code(404).send({ success: false, error: 'No encontrado' })
    return reply.send({ success: true, data: { deleted: true } })
  })

  // ── SHARE LINKS ──────────────────────────────────────────────────────────

  app.post('/runs/:id/share', { preHandler: [authenticate, requireFeature('allureReport')] }, async (req, reply) => {
    const limits = getPlanLimits(req.user.plan)
    if (!limits.allureShareLinks) {
      return reply.code(403).send({
        success: false,
        error:   'Los share links públicos requieren plan Advance o superior',
      })
    }

    const { expiresInDays } = req.body || {}
    const db = getDb()

    // Verificar dueño
    const [run] = await db.select().from(schema.allureRuns)
      .where(and(
        eq(schema.allureRuns.id, req.params.id),
        eq(schema.allureRuns.userId, req.user.userId),
      )).limit(1)
    if (!run) return reply.code(404).send({ success: false, error: 'No encontrado' })

    const shareToken = run.shareToken || generateShareToken()
    const shareExpiresAt = expiresInDays
      ? new Date(Date.now() + parseInt(expiresInDays) * 86400000)
      : null

    await db.update(schema.allureRuns).set({
      shareToken,
      shareEnabled: true,
      shareExpiresAt,
    }).where(eq(schema.allureRuns.id, run.id))

    return reply.send({
      success: true,
      data: {
        shareUrl:        `${req.protocol}://${req.hostname}/allure/shared/${shareToken}`,
        shareToken,
        expiresAt:       shareExpiresAt,
      },
    })
  })

  app.delete('/runs/:id/share', { preHandler: [authenticate, requireFeature('allureReport')] }, async (req, reply) => {
    const db = getDb()
    await db.update(schema.allureRuns).set({
      shareEnabled:   false,
      shareToken:     null,
      shareExpiresAt: null,
    })
      .where(and(
        eq(schema.allureRuns.id, req.params.id),
        eq(schema.allureRuns.userId, req.user.userId),
      ))
    return reply.send({ success: true, data: { deleted: true } })
  })

  // ── PUBLIC ───────────────────────────────────────────────────────────────
  // Sin auth — usa el share token

  app.get('/public/:shareToken', async (req, reply) => {
    const db = getDb()
    const [run] = await db.select().from(schema.allureRuns)
      .where(and(
        eq(schema.allureRuns.shareToken, req.params.shareToken),
        eq(schema.allureRuns.shareEnabled, true),
      )).limit(1)

    if (!run) return reply.code(404).send({ success: false, error: 'Reporte no disponible' })

    // Validar expiración
    if (run.shareExpiresAt && new Date(run.shareExpiresAt) < new Date()) {
      return reply.code(410).send({ success: false, error: 'El link público expiró' })
    }

    // Devolver solo info pública (sin user_id, sin sourceRef si es sensible)
    return reply.send({
      success: true,
      data: {
        id:          run.id,
        name:        run.name,
        status:      run.status,
        totalTests:  run.totalTests,
        passed:      run.passed,
        failed:      run.failed,
        broken:      run.broken,
        skipped:     run.skipped,
        passRate:    run.passRate,
        durationMs:  run.durationMs,
        branch:      run.branch,
        environment: run.environment,
        buildNumber: run.buildNumber,
        reportUrl:   run.reportUrl,
        createdAt:   run.createdAt,
        completedAt: run.completedAt,
      },
    })
  })
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function _getUserPlan(userId) {
  const db = getDb()
  const [u] = await db.select({ plan: schema.users.plan })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1)
  return u?.plan || 'teammate'
}
