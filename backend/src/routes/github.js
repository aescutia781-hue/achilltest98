/**
 * Rutas GitHub
 *
 * OAuth:
 *   GET    /api/github/oauth/init          Genera URL de authorize y redirige
 *   GET    /api/github/oauth/callback      Recibe el code y completa flow
 *
 * Connection:
 *   GET    /api/github/connection          Info de la conexión activa
 *   DELETE /api/github/connection          Desconectar GitHub
 *
 * Repos:
 *   POST   /api/github/repos               Crear repo nuevo en GitHub
 *   GET    /api/github/repos               Listar repos registrados en Achilltest
 *   GET    /api/github/repos/:id           Detalle de un repo
 *   DELETE /api/github/repos/:id           Olvidar el repo (no borra en GitHub)
 *   GET    /api/github/list-user-repos     Listar repos del user en GitHub
 *
 * Push:
 *   POST   /api/github/repos/:id/push      Pushear archivos al repo
 *   GET    /api/github/pushes/:id          Estado de un push
 *   GET    /api/github/pushes/:id/stream   SSE en vivo del push
 *
 * Shortcuts (1-click):
 *   POST   /api/github/suites/:id/push     Crear repo + push de una suite
 */

import { eq, and, desc, sql }            from 'drizzle-orm'
import { getDb, schema }                 from '../db/client.js'
import { authenticate, requireFeature }  from '../middleware/auth.js'
import { buildAuthorizeUrl,
         handleCallback,
         disconnectGitHub }              from '../services/github-oauth.js'
import { createRepoAndRegister,
         registerExistingRepo,
         pushFilesToRepo,
         subscribeToPush }               from '../services/github-push.js'
import { buildFromSuite,
         buildFromWorkspace }            from '../services/github-repo-builder.js'
import { getAccessToken }                from '../services/github-oauth.js'
import { listUserRepos,
         listUserOrgs,
         repoExists }                    from '../services/github-client.js'
import { getPlanLimits }                 from '../config/plans.js'
import { randomUUID }                    from 'crypto'

const FRONTEND_URL = process.env.FRONTEND_URL || ''

export async function githubRoutes(app) {

  // ════════════════════════════════════════════════════════════════════════
  // OAUTH FLOW
  // ════════════════════════════════════════════════════════════════════════

  app.get('/oauth/init', { preHandler: [authenticate] }, async (req, reply) => {
    const returnTo = req.query.returnTo || '/dashboard'
    try {
      const url = await buildAuthorizeUrl(req.user.userId, returnTo)
      return reply.send({ success: true, data: { authorizeUrl: url } })
    } catch (err) {
      return reply.code(500).send({ success: false, error: err.message })
    }
  })

  // El callback NO requiere JWT (viene desde GitHub redirect, no del frontend)
  app.get('/oauth/callback', async (req, reply) => {
    const { code, state, error } = req.query

    if (error) {
      // GitHub puede mandar error=access_denied si el user rechaza
      return reply.redirect(`${FRONTEND_URL}/github/connect?error=${encodeURIComponent(error)}`)
    }

    try {
      const result = await handleCallback({ code, state })
      const safeReturn = (result.returnTo || '/dashboard').startsWith('/')
        ? result.returnTo
        : '/dashboard'
      return reply.redirect(`${FRONTEND_URL}${safeReturn}?github=connected`)
    } catch (err) {
      console.error('[GitHub OAuth] callback error:', err)
      return reply.redirect(`${FRONTEND_URL}/github/connect?error=${encodeURIComponent(err.message)}`)
    }
  })

  // ════════════════════════════════════════════════════════════════════════
  // CONNECTION
  // ════════════════════════════════════════════════════════════════════════

  app.get('/connection', { preHandler: [authenticate] }, async (req, reply) => {
    const db = getDb()
    const [conn] = await db.select({
      id:             schema.githubConnections.id,
      githubUserId:   schema.githubConnections.githubUserId,
      githubUsername: schema.githubConnections.githubUsername,
      githubEmail:    schema.githubConnections.githubEmail,
      avatarUrl:      schema.githubConnections.avatarUrl,
      scopes:         schema.githubConnections.scopes,
      isActive:       schema.githubConnections.isActive,
      lastUsedAt:     schema.githubConnections.lastUsedAt,
      lastError:      schema.githubConnections.lastError,
      connectedAt:    schema.githubConnections.connectedAt,
    })
      .from(schema.githubConnections)
      .where(eq(schema.githubConnections.userId, req.user.userId))
      .limit(1)

    if (!conn) return reply.send({ success: true, data: null })
    return reply.send({ success: true, data: conn })
  })

  app.delete('/connection', { preHandler: [authenticate] }, async (req, reply) => {
    await disconnectGitHub(req.user.userId)
    return reply.send({ success: true, data: { disconnected: true } })
  })

  // ════════════════════════════════════════════════════════════════════════
  // GITHUB REPOS DEL USUARIO (en GitHub, no en DB)
  // ════════════════════════════════════════════════════════════════════════

  app.get('/list-user-repos', { preHandler: [authenticate, requireFeature('githubIntegration')] }, async (req, reply) => {
    try {
      const token = await getAccessToken(req.user.userId)
      const repos = await listUserRepos(token, {
        type:    req.query.type || 'owner',
        sort:    'updated',
        perPage: Math.min(parseInt(req.query.perPage) || 30, 100),
        page:    parseInt(req.query.page) || 1,
      })

      // Devolver solo los campos relevantes
      const slim = repos.map(r => ({
        id:           r.id,
        name:         r.name,
        fullName:     r.full_name,
        owner:        r.owner?.login,
        description:  r.description,
        private:      r.private,
        defaultBranch: r.default_branch,
        htmlUrl:      r.html_url,
        updatedAt:    r.updated_at,
        language:     r.language,
      }))

      return reply.send({ success: true, data: slim })
    } catch (err) {
      return reply.code(err.status || 500).send({ success: false, error: err.message })
    }
  })

  app.get('/list-user-orgs', { preHandler: [authenticate, requireFeature('githubIntegration')] }, async (req, reply) => {
    try {
      const token = await getAccessToken(req.user.userId)
      const orgs = await listUserOrgs(token)
      return reply.send({
        success: true,
        data: orgs.map(o => ({
          id:      o.id,
          login:   o.login,
          avatar:  o.avatar_url,
        })),
      })
    } catch (err) {
      return reply.code(err.status || 500).send({ success: false, error: err.message })
    }
  })

  // ════════════════════════════════════════════════════════════════════════
  // REPOS REGISTRADOS EN ACHILLTEST
  // ════════════════════════════════════════════════════════════════════════

  app.get('/repos', { preHandler: [authenticate, requireFeature('githubIntegration')] }, async (req, reply) => {
    const db = getDb()
    const repos = await db.select().from(schema.githubRepos)
      .where(eq(schema.githubRepos.userId, req.user.userId))
      .orderBy(desc(schema.githubRepos.updatedAt))

    return reply.send({ success: true, data: repos })
  })

  app.post('/repos', { preHandler: [authenticate, requireFeature('githubIntegration')] }, async (req, reply) => {
    const {
      mode = 'create',                  // create | existing
      repoName,
      description,
      isPrivate = true,
      org,
      sourceType,
      sourceId,
      sourceName,
      owner,                             // requerido si mode === 'existing'
    } = req.body || {}

    // Verificar cuota mensual de repos
    const limits = getPlanLimits(req.user.plan)
    const maxReposPerMonth = limits.githubReposPerMonth || 1

    const db = getDb()
    if (maxReposPerMonth !== Infinity) {
      const startOfMonth = new Date()
      startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0)
      const [{ count }] = await db.select({ count: sql`count(*)::int` })
        .from(schema.githubRepos)
        .where(and(
          eq(schema.githubRepos.userId, req.user.userId),
          sql`${schema.githubRepos.createdAt} >= ${startOfMonth}`,
        ))
      if (count >= maxReposPerMonth) {
        return reply.code(429).send({
          success: false,
          error:   `Tu plan permite máximo ${maxReposPerMonth} repos/mes. Has alcanzado el límite.`,
        })
      }
    }

    try {
      let registered
      if (mode === 'existing') {
        if (!owner || !repoName) {
          return reply.code(400).send({ success: false, error: 'owner y repoName son requeridos' })
        }
        registered = await registerExistingRepo({
          userId:     req.user.userId,
          owner,
          repoName,
          sourceType,
          sourceId,
          sourceName,
        })
      } else {
        if (!repoName?.trim()) {
          return reply.code(400).send({ success: false, error: 'repoName requerido' })
        }
        // Validar el nombre del repo
        if (!/^[a-zA-Z0-9._-]+$/.test(repoName)) {
          return reply.code(400).send({
            success: false,
            error:   'repoName solo puede contener letras, números, ., - y _',
          })
        }
        registered = await createRepoAndRegister({
          userId:      req.user.userId,
          repoName:    repoName.trim(),
          description,
          isPrivate,
          org,
          sourceType,
          sourceId,
          sourceName,
        })
      }

      return reply.code(201).send({ success: true, data: registered })
    } catch (err) {
      if (err.code === 'REPO_EXISTS') {
        return reply.code(409).send({
          success: false,
          error:   err.message,
          code:    'REPO_EXISTS',
          data:    { owner: err.owner, repoName: err.repoName },
        })
      }
      return reply.code(err.status || 500).send({ success: false, error: err.message })
    }
  })

  app.get('/repos/:id', { preHandler: [authenticate, requireFeature('githubIntegration')] }, async (req, reply) => {
    const db = getDb()
    const [repo] = await db.select().from(schema.githubRepos)
      .where(and(
        eq(schema.githubRepos.id, req.params.id),
        eq(schema.githubRepos.userId, req.user.userId),
      )).limit(1)
    if (!repo) return reply.code(404).send({ success: false, error: 'No encontrado' })

    // Últimos pushes
    const pushes = await db.select({
      id:            schema.githubPushes.id,
      status:        schema.githubPushes.status,
      commitSha:     schema.githubPushes.commitSha,
      commitMessage: schema.githubPushes.commitMessage,
      filesCount:    schema.githubPushes.filesCount,
      commitUrl:     schema.githubPushes.commitUrl,
      branch:        schema.githubPushes.branch,
      errorMessage:  schema.githubPushes.errorMessage,
      durationMs:    schema.githubPushes.durationMs,
      createdAt:     schema.githubPushes.createdAt,
    })
      .from(schema.githubPushes)
      .where(eq(schema.githubPushes.repoId, repo.id))
      .orderBy(desc(schema.githubPushes.createdAt))
      .limit(20)

    return reply.send({ success: true, data: { ...repo, recentPushes: pushes } })
  })

  app.delete('/repos/:id', { preHandler: [authenticate, requireFeature('githubIntegration')] }, async (req, reply) => {
    // Solo borra el registro local — NO borra el repo en GitHub
    const db = getDb()
    const deleted = await db.delete(schema.githubRepos)
      .where(and(
        eq(schema.githubRepos.id, req.params.id),
        eq(schema.githubRepos.userId, req.user.userId),
      ))
      .returning()
    if (deleted.length === 0) return reply.code(404).send({ success: false, error: 'No encontrado' })
    return reply.send({ success: true, data: { unlinked: true } })
  })

  // ════════════════════════════════════════════════════════════════════════
  // PUSH
  // ════════════════════════════════════════════════════════════════════════

  app.post('/repos/:id/push', { preHandler: [authenticate, requireFeature('githubIntegration')] }, async (req, reply) => {
    const {
      commitMessage,
      branch,
      sourceType,     // si no se da, usa el del repo
      sourceId,       // si no se da, usa el del repo
      includeWorkflow = true,
    } = req.body || {}

    if (!commitMessage?.trim()) {
      return reply.code(400).send({ success: false, error: 'commitMessage requerido' })
    }

    const db = getDb()
    const [repo] = await db.select().from(schema.githubRepos)
      .where(and(
        eq(schema.githubRepos.id, req.params.id),
        eq(schema.githubRepos.userId, req.user.userId),
      )).limit(1)
    if (!repo) return reply.code(404).send({ success: false, error: 'Repo no encontrado' })

    const useSourceType = sourceType || repo.sourceType
    const useSourceId   = sourceId   || repo.sourceId

    if (!useSourceType || !useSourceId) {
      return reply.code(400).send({
        success: false,
        error:   'Este repo no tiene una source asociada. Provee sourceType y sourceId.',
      })
    }

    // ── Construir archivos según el source ────────────────────────────────
    let buildResult
    try {
      if (useSourceType === 'suite') {
        buildResult = await buildFromSuite(useSourceId, { includeWorkflow })
      } else if (useSourceType === 'workspace') {
        buildResult = await buildFromWorkspace(req.user.userId, { includeWorkflow })
      } else {
        return reply.code(400).send({
          success: false,
          error:   `sourceType "${useSourceType}" no soportado aún`,
        })
      }
    } catch (err) {
      return reply.code(400).send({ success: false, error: err.message })
    }

    if (buildResult.files.length === 0) {
      return reply.code(400).send({ success: false, error: 'No hay archivos para pushear' })
    }

    // ── Crear registro de push ──────────────────────────────────────────
    const [push] = await db.insert(schema.githubPushes).values({
      repoId:        repo.id,
      userId:        req.user.userId,
      status:        'pending',
      branch:        branch || repo.defaultBranch,
      commitMessage: commitMessage.trim(),
      filesCount:    buildResult.files.length,
    }).returning()

    // ── Push en background ──────────────────────────────────────────────
    pushFilesToRepo({
      pushId:        push.id,
      userId:        req.user.userId,
      repoId:        repo.id,
      files:         buildResult.files,
      commitMessage: commitMessage.trim(),
      branch:        branch || repo.defaultBranch,
      manifest:      buildResult.manifest,
    }).catch(err => {
      console.error(`[GitHubPush ${push.id}]`, err)
    })

    return reply.code(201).send({
      success: true,
      data: {
        pushId:    push.id,
        streamUrl: `/api/github/pushes/${push.id}/stream`,
        filesCount: buildResult.files.length,
      },
    })
  })

  app.get('/pushes/:id', { preHandler: [authenticate, requireFeature('githubIntegration')] }, async (req, reply) => {
    const db = getDb()
    const [push] = await db.select().from(schema.githubPushes)
      .where(and(
        eq(schema.githubPushes.id, req.params.id),
        eq(schema.githubPushes.userId, req.user.userId),
      )).limit(1)
    if (!push) return reply.code(404).send({ success: false, error: 'No encontrado' })
    return reply.send({ success: true, data: push })
  })

  app.get('/pushes/:id/stream', { preHandler: [authenticate, requireFeature('githubIntegration')] }, async (req, reply) => {
    const db = getDb()
    const [push] = await db.select().from(schema.githubPushes)
      .where(and(
        eq(schema.githubPushes.id, req.params.id),
        eq(schema.githubPushes.userId, req.user.userId),
      )).limit(1)
    if (!push) return reply.code(404).send({ success: false, error: 'No encontrado' })

    reply.raw.writeHead(200, {
      'Content-Type':                'text/event-stream',
      'Cache-Control':               'no-cache, no-transform',
      'Connection':                  'keep-alive',
      'X-Accel-Buffering':           'no',
    })

    if (push.status === 'completed' || push.status === 'failed') {
      reply.raw.write(`event: final\ndata: ${JSON.stringify(push)}\n\n`)
      reply.raw.end()
      return
    }

    const heartbeat = setInterval(() => {
      try { reply.raw.write(`: ping\n\n`) } catch {}
    }, 15000)

    let unsubscribe = null
    try {
      unsubscribe = await subscribeToPush(push.id, (event) => {
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

  // ════════════════════════════════════════════════════════════════════════
  // SHORTCUTS — 1-click integraciones
  // ════════════════════════════════════════════════════════════════════════

  // Crear repo + push de UNA suite en una sola operación
  app.post('/suites/:id/push', { preHandler: [authenticate, requireFeature('githubIntegration')] }, async (req, reply) => {
    const {
      repoName,
      description,
      isPrivate = true,
      org,
      commitMessage,
      branch,
      includeWorkflow = true,
      useExistingRepo,        // ID de github_repos si quiere pushear a uno ya conectado
    } = req.body || {}

    const db = getDb()

    // Validar dueño de la suite
    const [suite] = await db.select().from(schema.testSuites)
      .where(and(
        eq(schema.testSuites.id, req.params.id),
        eq(schema.testSuites.userId, req.user.userId),
      )).limit(1)
    if (!suite) return reply.code(404).send({ success: false, error: 'Suite no encontrada' })

    try {
      // ── Build files primero (para validar que hay specs) ────────────────
      const buildResult = await buildFromSuite(suite.id, { includeWorkflow })
      if (buildResult.files.length === 0) {
        return reply.code(400).send({ success: false, error: 'La suite no tiene specs' })
      }

      // ── Decidir si crear o usar existente ───────────────────────────────
      let repo
      if (useExistingRepo) {
        const [existing] = await db.select().from(schema.githubRepos)
          .where(and(
            eq(schema.githubRepos.id, useExistingRepo),
            eq(schema.githubRepos.userId, req.user.userId),
          )).limit(1)
        if (!existing) return reply.code(404).send({ success: false, error: 'Repo no encontrado' })
        repo = existing

        // Actualizar source si no la tenía
        if (!repo.sourceType) {
          await db.update(schema.githubRepos).set({
            sourceType: 'suite',
            sourceId:   suite.id,
            sourceName: suite.name,
            updatedAt:  new Date(),
          }).where(eq(schema.githubRepos.id, repo.id))
        }
      } else {
        // Verificar cuota mensual
        const limits = getPlanLimits(req.user.plan)
        const maxReposPerMonth = limits.githubReposPerMonth || 1
        if (maxReposPerMonth !== Infinity) {
          const startOfMonth = new Date()
          startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0)
          const [{ count }] = await db.select({ count: sql`count(*)::int` })
            .from(schema.githubRepos)
            .where(and(
              eq(schema.githubRepos.userId, req.user.userId),
              sql`${schema.githubRepos.createdAt} >= ${startOfMonth}`,
            ))
          if (count >= maxReposPerMonth) {
            return reply.code(429).send({
              success: false,
              error:   `Tu plan permite máximo ${maxReposPerMonth} repos/mes`,
            })
          }
        }

        const finalRepoName = (repoName || buildResult.repoName).trim()
        repo = await createRepoAndRegister({
          userId:     req.user.userId,
          repoName:   finalRepoName,
          description: description || `Tests de "${suite.name}" - Generado por Achilltest`,
          isPrivate,
          org,
          sourceType: 'suite',
          sourceId:   suite.id,
          sourceName: suite.name,
        })
      }

      // ── Crear push y disparar ───────────────────────────────────────────
      const finalCommitMessage = commitMessage?.trim()
        || `chore: sync ${buildResult.files.length} files from Achilltest suite "${suite.name}"`

      const [push] = await db.insert(schema.githubPushes).values({
        repoId:        repo.id,
        userId:        req.user.userId,
        status:        'pending',
        branch:        branch || repo.defaultBranch,
        commitMessage: finalCommitMessage,
        filesCount:    buildResult.files.length,
      }).returning()

      pushFilesToRepo({
        pushId:        push.id,
        userId:        req.user.userId,
        repoId:        repo.id,
        files:         buildResult.files,
        commitMessage: finalCommitMessage,
        branch:        branch || repo.defaultBranch,
        manifest:      buildResult.manifest,
      }).catch(err => console.error(`[GitHubPush ${push.id}]`, err))

      return reply.code(201).send({
        success: true,
        data: {
          repo,
          pushId:    push.id,
          streamUrl: `/api/github/pushes/${push.id}/stream`,
          filesCount: buildResult.files.length,
        },
      })

    } catch (err) {
      if (err.code === 'REPO_EXISTS') {
        return reply.code(409).send({
          success: false,
          error:   err.message,
          code:    'REPO_EXISTS',
          data:    { owner: err.owner, repoName: err.repoName },
        })
      }
      return reply.code(err.status || 500).send({ success: false, error: err.message })
    }
  })
}
