/**
 * Jira + Zephyr Sync Service
 *
 * Orquestación de las operaciones de alto nivel entre Achilltest, Jira y Zephyr:
 *
 *   1. syncProjectsFromJira()
 *      Pull de todos los projects de Jira accesibles → upsert en jira_projects
 *
 *   2. syncZephyrTestCasesForProject()
 *      Pull de los test cases de Zephyr de un project → upsert en zephyr_test_cases
 *
 *   3. linkSpecToZephyrCase()
 *      Crea/actualiza la relación spec ↔ zephyr_test_case
 *
 *   4. pushExecutionToZephyr()
 *      Mapea el status de Achilltest → Zephyr y reporta la ejecución
 *
 *   5. createJiraIssueFromFailure()
 *      Crea un Bug en Jira con summary y description desde un spec/execution fallido
 */

import { eq, and, inArray, sql }   from 'drizzle-orm'
import { getDb, schema }           from '../db/client.js'
import * as jiraClient             from './jira-client.js'
import * as zephyrClient           from './zephyr-client.js'

// ── 1. SYNC PROJECTS ──────────────────────────────────────────────────────

export async function syncProjectsFromJira(organizationId) {
  const db = getDb()
  const [conn] = await db.select().from(schema.jiraConnections)
    .where(eq(schema.jiraConnections.organizationId, organizationId)).limit(1)
  if (!conn) throw new Error('No hay conexión Jira en esta organización')

  // Paginar projects
  const allProjects = []
  let startAt = 0
  while (true) {
    const page = await jiraClient.listProjects(conn.id, { startAt, maxResults: 50 })
    const items = page?.values || []
    allProjects.push(...items)
    if (page?.isLast || items.length === 0) break
    startAt += items.length
  }

  // Upsert en jira_projects
  let inserted = 0, updated = 0
  for (const p of allProjects) {
    const existing = await db.select().from(schema.jiraProjects)
      .where(and(
        eq(schema.jiraProjects.connectionId, conn.id),
        eq(schema.jiraProjects.jiraProjectId, String(p.id)),
      )).limit(1)

    const payload = {
      organizationId,
      connectionId:    conn.id,
      jiraProjectId:   String(p.id),
      jiraProjectKey:  p.key,
      name:            p.name,
      description:     p.description || null,
      avatarUrl:       p.avatarUrls?.['48x48'] || null,
      projectType:     p.projectTypeKey || null,
      isArchived:      Boolean(p.archived),
      lastSyncedAt:    new Date(),
      updatedAt:       new Date(),
    }

    if (existing.length > 0) {
      await db.update(schema.jiraProjects).set(payload)
        .where(eq(schema.jiraProjects.id, existing[0].id))
      updated++
    } else {
      await db.insert(schema.jiraProjects).values({ ...payload, isSelected: false })
      inserted++
    }
  }

  // Marcar como inactivos los que ya no aparecen
  if (allProjects.length > 0) {
    const liveIds = allProjects.map(p => String(p.id))
    await db.update(schema.jiraProjects).set({ isArchived: true, updatedAt: new Date() })
      .where(and(
        eq(schema.jiraProjects.connectionId, conn.id),
        sql`${schema.jiraProjects.jiraProjectId} NOT IN (${sql.join(liveIds.map(id => sql`${id}`), sql`, `)})`,
      ))
  }

  return { inserted, updated, total: allProjects.length }
}

// ── 2. SYNC ZEPHYR TEST CASES ──────────────────────────────────────────────

export async function syncZephyrTestCasesForProject(organizationId, jiraProjectId) {
  const db = getDb()
  const [conn] = await db.select().from(schema.jiraConnections)
    .where(eq(schema.jiraConnections.organizationId, organizationId)).limit(1)
  if (!conn) throw new Error('No hay conexión Jira')
  if (!conn.hasZephyr) throw new Error('Esta org no tiene Zephyr Scale configurado')

  const [project] = await db.select().from(schema.jiraProjects)
    .where(eq(schema.jiraProjects.id, jiraProjectId)).limit(1)
  if (!project) throw new Error('Proyecto Jira no encontrado')

  // Paginar test cases
  const allCases = []
  let startAt = 0
  while (true) {
    const page = await zephyrClient.listTestCases(conn.id, project.jiraProjectKey, { startAt, maxResults: 100 })
    const items = page?.values || []
    allCases.push(...items)
    if (page?.isLast || items.length < 100) break
    startAt += items.length
    if (startAt > 10000) break  // safety: máximo 10k casos
  }

  let inserted = 0, updated = 0
  for (const tc of allCases) {
    const existing = await db.select().from(schema.zephyrTestCases)
      .where(and(
        eq(schema.zephyrTestCases.jiraProjectId, project.id),
        eq(schema.zephyrTestCases.zephyrKey, tc.key),
      )).limit(1)

    const payload = {
      organizationId,
      jiraProjectId:  project.id,
      zephyrKey:      tc.key,
      name:           tc.name || tc.key,
      objective:      tc.objective || null,
      precondition:   tc.precondition || null,
      status:         tc.status?.name || tc.statusName || null,
      priority:       tc.priority?.name || tc.priorityName || null,
      folder:         tc.folder?.name || tc.folderName || null,
      labels:         tc.labels || [],
      steps:          tc.testScript?.steps || tc.steps || [],
      lastSyncedAt:   new Date(),
      updatedAt:      new Date(),
    }

    if (existing.length > 0) {
      // No sobrescribir linked_spec_id (es local)
      await db.update(schema.zephyrTestCases).set(payload)
        .where(eq(schema.zephyrTestCases.id, existing[0].id))
      updated++
    } else {
      await db.insert(schema.zephyrTestCases).values(payload)
      inserted++
    }
  }

  return { inserted, updated, total: allCases.length, projectKey: project.jiraProjectKey }
}

// ── 3. LINK SPEC ↔ ZEPHYR CASE ─────────────────────────────────────────────

export async function linkSpecToZephyrCase({ organizationId, specId, zephyrTestCaseId }) {
  const db = getDb()
  const [tc] = await db.select().from(schema.zephyrTestCases)
    .where(and(
      eq(schema.zephyrTestCases.id, zephyrTestCaseId),
      eq(schema.zephyrTestCases.organizationId, organizationId),
    )).limit(1)
  if (!tc) throw new Error('Test case Zephyr no encontrado')

  await db.update(schema.zephyrTestCases).set({
    linkedSpecId: specId,
    updatedAt:    new Date(),
  }).where(eq(schema.zephyrTestCases.id, zephyrTestCaseId))

  return { linked: true, zephyrKey: tc.zephyrKey }
}

export async function unlinkSpec(organizationId, zephyrTestCaseId) {
  const db = getDb()
  await db.update(schema.zephyrTestCases).set({
    linkedSpecId: null,
    updatedAt:    new Date(),
  }).where(and(
    eq(schema.zephyrTestCases.id, zephyrTestCaseId),
    eq(schema.zephyrTestCases.organizationId, organizationId),
  ))
}

// ── 4. PUSH EXECUTION TO ZEPHYR ────────────────────────────────────────────

// Mapeo de status Achilltest → Zephyr
const STATUS_MAP = {
  passed:    'Pass',
  failed:    'Fail',
  broken:    'Fail',
  error:     'Fail',
  timeout:   'Fail',
  skipped:   'Not Executed',
  pending:   'Not Executed',
  unknown:   'Not Executed',
}

/**
 * Reporta a Zephyr el resultado de todas las executions de un Suite Run que
 * tengan specs linkeados a test cases.
 *
 * @param {object} opts
 * @param {string} opts.organizationId
 * @param {string} opts.suiteRunId
 * @param {string} [opts.cycleId]      Si se da, crear/usar este cycle
 * @param {string} [opts.userId]
 */
export async function pushSuiteRunToZephyr({ organizationId, suiteRunId, cycleId, userId }) {
  const db = getDb()
  const [conn] = await db.select().from(schema.jiraConnections)
    .where(eq(schema.jiraConnections.organizationId, organizationId)).limit(1)
  if (!conn) throw new Error('No hay conexión Jira')
  if (!conn.hasZephyr) throw new Error('Zephyr Scale no configurado')

  // Obtener executions del suite run
  const executions = await db.select().from(schema.executions)
    .where(eq(schema.executions.suiteRunId, suiteRunId))

  // Filtrar las que tienen un spec con linked_spec_id en zephyr
  const specIds = [...new Set(executions.map(e => e.specId).filter(Boolean))]
  if (specIds.length === 0) {
    return { pushed: 0, skipped: executions.length, reason: 'Ningún spec linkeado a Zephyr' }
  }

  const linkedCases = await db.select().from(schema.zephyrTestCases)
    .where(and(
      eq(schema.zephyrTestCases.organizationId, organizationId),
      inArray(schema.zephyrTestCases.linkedSpecId, specIds),
    ))

  const casesBySpecId = Object.fromEntries(linkedCases.map(c => [c.linkedSpecId, c]))

  // Determinar cycleKey (si hay)
  let cycleKey
  if (cycleId) {
    const [cycle] = await db.select().from(schema.zephyrTestCycles)
      .where(eq(schema.zephyrTestCycles.id, cycleId)).limit(1)
    cycleKey = cycle?.zephyrKey
  }

  let pushed = 0, failed = 0, skipped = 0
  for (const exec of executions) {
    const tc = casesBySpecId[exec.specId]
    if (!tc) { skipped++; continue }

    const zephyrStatus = STATUS_MAP[exec.status] || 'Not Executed'

    // Obtener projectKey desde el jira project del test case
    const [proj] = await db.select().from(schema.jiraProjects)
      .where(eq(schema.jiraProjects.id, tc.jiraProjectId)).limit(1)
    if (!proj) { skipped++; continue }

    try {
      const zResult = await zephyrClient.createTestExecution(conn.id, {
        projectKey:    proj.jiraProjectKey,
        testCaseKey:   tc.zephyrKey,
        testCycleKey:  cycleKey,
        statusName:    zephyrStatus,
        comment:       _buildExecutionComment(exec),
        executionTime: exec.durationMs,
        actualEndDate: exec.completedAt
          ? new Date(exec.completedAt).toISOString()
          : new Date().toISOString(),
      })

      // Registrar en zephyr_executions
      await db.insert(schema.zephyrExecutions).values({
        organizationId,
        testCaseId:        tc.id,
        cycleId:           cycleId || null,
        specId:            exec.specId,
        suiteRunId,
        executionId:       exec.id,
        result:            zephyrStatus,
        comment:           _buildExecutionComment(exec),
        executedBy:        userId || null,
        zephyrExecutionId: zResult?.id ? String(zResult.id) : null,
        pushedAt:          new Date(),
      })
      pushed++
    } catch (err) {
      console.error(`[ZephyrPush] error reportando ${tc.zephyrKey}:`, err.message)
      await db.insert(schema.zephyrExecutions).values({
        organizationId,
        testCaseId:        tc.id,
        cycleId:           cycleId || null,
        specId:            exec.specId,
        suiteRunId,
        executionId:       exec.id,
        result:            zephyrStatus,
        comment:           _buildExecutionComment(exec),
        executedBy:        userId || null,
        pushError:         err.message,
      })
      failed++
    }
  }

  return { pushed, failed, skipped, total: executions.length }
}

function _buildExecutionComment(exec) {
  const parts = [`Reported by Achilltest`]
  if (exec.durationMs) parts.push(`Duration: ${(exec.durationMs / 1000).toFixed(1)}s`)
  if (exec.errorMessage) parts.push(`Error: ${exec.errorMessage}`)
  return parts.join(' | ')
}

// ── 5. CREATE JIRA ISSUE FROM FAILURE ──────────────────────────────────────

/**
 * Crea un Bug en Jira a partir de un spec o execution fallido.
 *
 * @param {object} opts
 * @param {string} opts.organizationId
 * @param {string} opts.userId
 * @param {string} opts.jiraProjectId
 * @param {string} [opts.specId]
 * @param {string} [opts.executionId]
 * @param {string} [opts.suiteRunId]
 * @param {string} opts.summary
 * @param {string} [opts.description]
 * @param {string} [opts.priority]
 * @param {string} [opts.issueType='Bug']
 */
export async function createJiraIssueFromFailure(opts) {
  const db = getDb()
  const [conn] = await db.select().from(schema.jiraConnections)
    .where(eq(schema.jiraConnections.organizationId, opts.organizationId)).limit(1)
  if (!conn) throw new Error('No hay conexión Jira')

  const [project] = await db.select().from(schema.jiraProjects)
    .where(and(
      eq(schema.jiraProjects.id, opts.jiraProjectId),
      eq(schema.jiraProjects.organizationId, opts.organizationId),
    )).limit(1)
  if (!project) throw new Error('Proyecto Jira no encontrado')

  // Build description con detalles del fallo
  let description = opts.description || ''
  if (opts.executionId) {
    const [exec] = await db.select().from(schema.executions)
      .where(eq(schema.executions.id, opts.executionId)).limit(1)
    if (exec) {
      description += `\n\nGenerated from Achilltest execution ${exec.id}.\nStatus: ${exec.status}\n`
      if (exec.errorMessage) description += `Error: ${exec.errorMessage}\n`
      if (exec.durationMs) description += `Duration: ${(exec.durationMs / 1000).toFixed(1)}s\n`
    }
  }
  description += `\nReported by Achilltest at ${new Date().toISOString()}`

  // Crear issue
  const issue = await jiraClient.createIssue(conn.id, {
    projectKey:  project.jiraProjectKey,
    summary:     opts.summary,
    description,
    issueType:   opts.issueType || 'Bug',
    priority:    opts.priority,
    labels:      ['achilltest'],
  })

  const htmlUrl = await jiraClient.buildIssueUrl(conn.id, issue.key)

  // Persistir en jira_issues
  const [persisted] = await db.insert(schema.jiraIssues).values({
    organizationId: opts.organizationId,
    jiraProjectId:  project.id,
    jiraIssueKey:   issue.key,
    jiraIssueId:    String(issue.id),
    issueType:      opts.issueType || 'Bug',
    summary:        opts.summary,
    status:         'Open',
    priority:       opts.priority || null,
    htmlUrl,
    specId:         opts.specId || null,
    executionId:    opts.executionId || null,
    suiteRunId:     opts.suiteRunId || null,
    createdBy:      opts.userId,
  }).returning()

  return persisted
}
