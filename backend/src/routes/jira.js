/**
 * Rutas Jira + Zephyr Scale
 *
 * OAuth Flow:
 *   GET    /api/jira/oauth/init                Genera URL de authorize
 *   GET    /api/jira/oauth/callback            Recibe code de Atlassian
 *
 * API Token (alternativa OAuth):
 *   POST   /api/jira/connection/api-token      Conectar con email + API token
 *
 * Connection:
 *   GET    /api/jira/connection                Info de la conexión activa
 *   DELETE /api/jira/connection                Desconectar
 *
 * Zephyr setup:
 *   POST   /api/jira/connection/zephyr-token   Configurar token de Zephyr Scale
 *
 * Projects:
 *   POST   /api/jira/sync-projects             Re-sync de projects desde Jira
 *   GET    /api/jira/projects                  Listar projects
 *   PUT    /api/jira/projects/:id/select       Toggle is_selected
 *
 * Zephyr test cases:
 *   POST   /api/jira/projects/:id/sync-zephyr  Sync test cases del project
 *   GET    /api/jira/projects/:id/zephyr-cases Listar test cases sincronizados
 *   POST   /api/jira/specs/:specId/link        Link spec ↔ zephyr case
 *
 * Suite Run push:
 *   POST   /api/jira/suite-runs/:id/push       Reportar resultados a Zephyr
 *
 * Issues:
 *   POST   /api/jira/issues                    Crear bug/issue
 *   GET    /api/jira/issues                    Listar issues creados
 */

import { eq, and, desc }                  from 'drizzle-orm'
import { getDb, schema }                  from '../db/client.js'
import { authenticate,
         requireFeature,
         requireRoleAtLeast,
         requireOrganization }            from '../middleware/auth.js'
import { buildAuthorizeUrl,
         handleCallback,
         connectWithApiToken,
         disconnectJira,
         setZephyrToken }                 from '../services/jira-oauth.js'
import { syncProjectsFromJira,
         syncZephyrTestCasesForProject,
         linkSpecToZephyrCase,
         unlinkSpec,
         pushSuiteRunToZephyr,
         createJiraIssueFromFailure }     from '../services/jira-sync.js'

const FRONTEND_URL = process.env.FRONTEND_URL || ''

export async function jiraRoutes(app) {

  // ════════════════════════════════════════════════════════════════════════
  // OAUTH FLOW
  // ════════════════════════════════════════════════════════════════════════

  app.get('/oauth/init', { preHandler: [authenticate, requireFeature('jiraIntegration'), requireOrganization, requireRoleAtLeast('manager')] }, async (req, reply) => {
    try {
      const url = await buildAuthorizeUrl(req.user.userId, req.user.currentOrganizationId, req.query.returnTo || '/jira')
      return reply.send({ success: true, data: { authorizeUrl: url } })
    } catch (err) {
      return reply.code(500).send({ success: false, error: err.message })
    }
  })

  // Callback SIN auth (viene de Atlassian redirect)
  app.get('/oauth/callback', async (req, reply) => {
    const { code, state, error } = req.query
    if (error) {
      return reply.redirect(`${FRONTEND_URL}/jira?error=${encodeURIComponent(error)}`)
    }
    try {
      const result = await handleCallback({ code, state })
      const safeReturn = (result.returnTo || '/jira').startsWith('/') ? result.returnTo : '/jira'
      return reply.redirect(`${FRONTEND_URL}${safeReturn}?jira=connected`)
    } catch (err) {
      console.error('[JiraOAuth] callback:', err)
      return reply.redirect(`${FRONTEND_URL}/jira?error=${encodeURIComponent(err.message)}`)
    }
  })

  // ════════════════════════════════════════════════════════════════════════
  // API TOKEN
  // ════════════════════════════════════════════════════════════════════════

  app.post('/connection/api-token', { preHandler: [authenticate, requireFeature('jiraIntegration'), requireOrganization, requireRoleAtLeast('manager')] }, async (req, reply) => {
    const { siteUrl, email, apiToken, deploymentType = 'cloud' } = req.body || {}
    try {
      const conn = await connectWithApiToken({
        userId:          req.user.userId,
        organizationId:  req.user.currentOrganizationId,
        siteUrl,
        email,
        apiToken,
        deploymentType,
      })
      // Devolver sin el token cifrado
      const { apiTokenEncrypted, accessTokenEncrypted, refreshTokenEncrypted, zephyrTokenEncrypted, ...safe } = conn
      return reply.code(201).send({ success: true, data: safe })
    } catch (err) {
      return reply.code(400).send({ success: false, error: err.message })
    }
  })

  // ════════════════════════════════════════════════════════════════════════
  // CONNECTION
  // ════════════════════════════════════════════════════════════════════════

  app.get('/connection', { preHandler: [authenticate, requireFeature('jiraIntegration'), requireOrganization] }, async (req, reply) => {
    const db = getDb()
    const [conn] = await db.select().from(schema.jiraConnections)
      .where(eq(schema.jiraConnections.organizationId, req.user.currentOrganizationId)).limit(1)

    if (!conn) return reply.send({ success: true, data: null })

    // Solo info safe (sin tokens)
    return reply.send({
      success: true,
      data: {
        id:                   conn.id,
        authType:             conn.authType,
        deploymentType:       conn.deploymentType,
        siteUrl:              conn.siteUrl,
        siteName:             conn.siteName,
        cloudId:              conn.cloudId,
        atlassianUserId:      conn.atlassianUserId,
        atlassianUserName:    conn.atlassianUserName,
        atlassianUserEmail:   conn.atlassianUserEmail,
        avatarUrl:            conn.avatarUrl,
        scopes:               conn.scopes,
        isActive:             conn.isActive,
        lastUsedAt:           conn.lastUsedAt,
        lastError:            conn.lastError,
        hasZephyr:            conn.hasZephyr,
        connectedAt:          conn.connectedAt,
      },
    })
  })

  app.delete('/connection', { preHandler: [authenticate, requireFeature('jiraIntegration'), requireOrganization, requireRoleAtLeast('manager')] }, async (req, reply) => {
    await disconnectJira(req.user.currentOrganizationId)
    return reply.send({ success: true, data: { disconnected: true } })
  })

  // ════════════════════════════════════════════════════════════════════════
  // ZEPHYR TOKEN
  // ════════════════════════════════════════════════════════════════════════

  app.post('/connection/zephyr-token', { preHandler: [authenticate, requireFeature('jiraIntegration'), requireOrganization, requireRoleAtLeast('manager')] }, async (req, reply) => {
    const { zephyrToken } = req.body || {}
    try {
      const result = await setZephyrToken(req.user.currentOrganizationId, zephyrToken)
      return reply.send({ success: true, data: result })
    } catch (err) {
      return reply.code(400).send({ success: false, error: err.message })
    }
  })

  // ════════════════════════════════════════════════════════════════════════
  // PROJECTS
  // ════════════════════════════════════════════════════════════════════════

  app.post('/sync-projects', { preHandler: [authenticate, requireFeature('jiraIntegration'), requireOrganization, requireRoleAtLeast('manager')] }, async (req, reply) => {
    try {
      const result = await syncProjectsFromJira(req.user.currentOrganizationId)
      return reply.send({ success: true, data: result })
    } catch (err) {
      return reply.code(err.status || 500).send({ success: false, error: err.message })
    }
  })

  app.get('/projects', { preHandler: [authenticate, requireFeature('jiraIntegration'), requireOrganization] }, async (req, reply) => {
    const db = getDb()
    const projects = await db.select().from(schema.jiraProjects)
      .where(eq(schema.jiraProjects.organizationId, req.user.currentOrganizationId))
      .orderBy(schema.jiraProjects.name)
    return reply.send({ success: true, data: projects })
  })

  app.put('/projects/:id/select', { preHandler: [authenticate, requireFeature('jiraIntegration'), requireOrganization, requireRoleAtLeast('manager')] }, async (req, reply) => {
    const { isSelected } = req.body || {}
    const db = getDb()
    const [updated] = await db.update(schema.jiraProjects).set({
      isSelected: Boolean(isSelected),
      updatedAt:  new Date(),
    })
      .where(and(
        eq(schema.jiraProjects.id, req.params.id),
        eq(schema.jiraProjects.organizationId, req.user.currentOrganizationId),
      ))
      .returning()
    if (!updated) return reply.code(404).send({ success: false, error: 'No encontrado' })
    return reply.send({ success: true, data: updated })
  })

  // ════════════════════════════════════════════════════════════════════════
  // ZEPHYR TEST CASES
  // ════════════════════════════════════════════════════════════════════════

  app.post('/projects/:id/sync-zephyr', { preHandler: [authenticate, requireFeature('jiraIntegration'), requireOrganization, requireRoleAtLeast('manager')] }, async (req, reply) => {
    try {
      const result = await syncZephyrTestCasesForProject(req.user.currentOrganizationId, req.params.id)
      return reply.send({ success: true, data: result })
    } catch (err) {
      return reply.code(err.status || 500).send({ success: false, error: err.message })
    }
  })

  app.get('/projects/:id/zephyr-cases', { preHandler: [authenticate, requireFeature('jiraIntegration'), requireOrganization] }, async (req, reply) => {
    const db = getDb()
    const cases = await db.select().from(schema.zephyrTestCases)
      .where(and(
        eq(schema.zephyrTestCases.organizationId, req.user.currentOrganizationId),
        eq(schema.zephyrTestCases.jiraProjectId, req.params.id),
      ))
      .orderBy(desc(schema.zephyrTestCases.lastSyncedAt))
    return reply.send({ success: true, data: cases })
  })

  app.post('/specs/:specId/link', { preHandler: [authenticate, requireFeature('jiraIntegration'), requireOrganization] }, async (req, reply) => {
    const { zephyrTestCaseId } = req.body || {}
    if (!zephyrTestCaseId) {
      return reply.code(400).send({ success: false, error: 'zephyrTestCaseId requerido' })
    }
    try {
      const result = await linkSpecToZephyrCase({
        organizationId:   req.user.currentOrganizationId,
        specId:           req.params.specId,
        zephyrTestCaseId,
      })
      return reply.send({ success: true, data: result })
    } catch (err) {
      return reply.code(400).send({ success: false, error: err.message })
    }
  })

  app.delete('/specs/:specId/link/:caseId', { preHandler: [authenticate, requireFeature('jiraIntegration'), requireOrganization] }, async (req, reply) => {
    await unlinkSpec(req.user.currentOrganizationId, req.params.caseId)
    return reply.send({ success: true, data: { unlinked: true } })
  })

  // ════════════════════════════════════════════════════════════════════════
  // SUITE RUN PUSH
  // ════════════════════════════════════════════════════════════════════════

  app.post('/suite-runs/:id/push', { preHandler: [authenticate, requireFeature('jiraIntegration'), requireOrganization] }, async (req, reply) => {
    const { cycleId } = req.body || {}
    try {
      const result = await pushSuiteRunToZephyr({
        organizationId: req.user.currentOrganizationId,
        suiteRunId:     req.params.id,
        cycleId,
        userId:         req.user.userId,
      })
      return reply.send({ success: true, data: result })
    } catch (err) {
      return reply.code(err.status || 500).send({ success: false, error: err.message })
    }
  })

  // ════════════════════════════════════════════════════════════════════════
  // ISSUES
  // ════════════════════════════════════════════════════════════════════════

  app.post('/issues', { preHandler: [authenticate, requireFeature('jiraIntegration'), requireOrganization] }, async (req, reply) => {
    const {
      jiraProjectId,
      summary,
      description,
      priority,
      issueType,
      specId,
      executionId,
      suiteRunId,
    } = req.body || {}

    if (!jiraProjectId || !summary?.trim()) {
      return reply.code(400).send({ success: false, error: 'jiraProjectId y summary requeridos' })
    }

    try {
      const issue = await createJiraIssueFromFailure({
        organizationId: req.user.currentOrganizationId,
        userId:         req.user.userId,
        jiraProjectId,
        summary:        summary.trim(),
        description,
        priority,
        issueType,
        specId,
        executionId,
        suiteRunId,
      })
      return reply.code(201).send({ success: true, data: issue })
    } catch (err) {
      return reply.code(err.status || 500).send({ success: false, error: err.message })
    }
  })

  app.get('/issues', { preHandler: [authenticate, requireFeature('jiraIntegration'), requireOrganization] }, async (req, reply) => {
    const db = getDb()
    const issues = await db.select().from(schema.jiraIssues)
      .where(eq(schema.jiraIssues.organizationId, req.user.currentOrganizationId))
      .orderBy(desc(schema.jiraIssues.createdAt))
      .limit(100)
    return reply.send({ success: true, data: issues })
  })
}
