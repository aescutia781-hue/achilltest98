/**
 * Zephyr Scale Cloud REST API Client
 *
 * Zephyr Scale es el plugin de testing de Jira más usado en LATAM/enterprise.
 * Tiene su API REST aparte de Jira (en api.zephyrscale.smartbear.com) y usa
 * un Bearer token propio (NO el de OAuth Jira).
 *
 * El user obtiene su token desde:
 *   Jira → Apps → Zephyr Scale → API Access Tokens
 *
 * Docs: https://support.smartbear.com/zephyr-scale-cloud/api-docs/
 *
 * Endpoints principales que usamos:
 *   GET    /testcases?projectKey=X     Listar test cases
 *   POST   /testcases                   Crear test case
 *   GET    /testcases/{key}             Detalle
 *   GET    /testcycles?projectKey=X     Listar cycles
 *   POST   /testcycles                   Crear cycle
 *   POST   /testexecutions               Reportar resultado
 *   GET    /folders                       Folders de un proyecto
 *   GET    /statuses                      Statuses configurados
 *   GET    /priorities                    Priorities
 */

import { getZephyrToken }     from './jira-oauth.js'

const BASE_URL = 'https://api.zephyrscale.smartbear.com/v2'

async function _zephyrRequest(connectionId, path, options = {}) {
  const token = await getZephyrToken(connectionId)
  const url   = path.startsWith('http') ? path : `${BASE_URL}${path}`

  const res = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept':        'application/json',
      'Content-Type':  'application/json',
      'User-Agent':    'Achilltest',
      ...(options.headers || {}),
    },
    body: options.body,
  })

  if (!res.ok) {
    let body = null
    try { body = await res.json() } catch {}
    const message = body?.message || body?.errorMessage || `HTTP ${res.status}`
    const err = new Error(`Zephyr Scale: ${message}`)
    err.status = res.status
    err.response = body
    throw err
  }

  if (res.status === 204) return null
  return res.json()
}

// ── TEST CASES ──────────────────────────────────────────────────────────────

/**
 * Lista test cases de un project. Paginación con startAt/maxResults.
 */
export async function listTestCases(connectionId, projectKey, opts = {}) {
  const params = new URLSearchParams({
    projectKey,
    maxResults: String(opts.maxResults || 50),
    startAt:    String(opts.startAt || 0),
    ...(opts.folderId ? { folderId: String(opts.folderId) } : {}),
  })
  return _zephyrRequest(connectionId, `/testcases?${params}`)
}

export async function getTestCase(connectionId, testCaseKey) {
  return _zephyrRequest(connectionId, `/testcases/${testCaseKey}`)
}

/**
 * Crea un nuevo test case en Zephyr.
 *
 * @param {object} opts
 * @param {string} opts.projectKey
 * @param {string} opts.name
 * @param {string} [opts.objective]
 * @param {string} [opts.precondition]
 * @param {string} [opts.priorityName]
 * @param {string} [opts.statusName]
 * @param {Array}  [opts.labels]
 */
export async function createTestCase(connectionId, opts) {
  const body = {
    projectKey:   opts.projectKey,
    name:         opts.name,
    objective:    opts.objective,
    precondition: opts.precondition,
    priorityName: opts.priorityName,
    statusName:   opts.statusName,
    labels:       opts.labels,
  }
  return _zephyrRequest(connectionId, '/testcases', {
    method: 'POST',
    body:   JSON.stringify(body),
  })
}

/**
 * Crea los steps de un test case (separate endpoint en Zephyr v2).
 */
export async function createTestSteps(connectionId, testCaseKey, steps) {
  const body = {
    mode: 'OVERWRITE',
    items: steps.map(s => ({
      inline: {
        description:     s.description || '',
        expectedResult:  s.expectedResult || '',
        testData:        s.testData || '',
      },
    })),
  }
  return _zephyrRequest(connectionId, `/testcases/${testCaseKey}/teststeps`, {
    method: 'POST',
    body:   JSON.stringify(body),
  })
}

// ── TEST CYCLES ─────────────────────────────────────────────────────────────

export async function listTestCycles(connectionId, projectKey, opts = {}) {
  const params = new URLSearchParams({
    projectKey,
    maxResults: String(opts.maxResults || 50),
    startAt:    String(opts.startAt || 0),
  })
  return _zephyrRequest(connectionId, `/testcycles?${params}`)
}

/**
 * Crea un test cycle.
 *
 * @param {object} opts
 * @param {string} opts.projectKey
 * @param {string} opts.name
 * @param {string} [opts.description]
 * @param {string} [opts.plannedStartDate]   ISO date
 * @param {string} [opts.plannedEndDate]     ISO date
 * @param {string} [opts.statusName]
 */
export async function createTestCycle(connectionId, opts) {
  const body = {
    projectKey:        opts.projectKey,
    name:              opts.name,
    description:       opts.description,
    plannedStartDate:  opts.plannedStartDate,
    plannedEndDate:    opts.plannedEndDate,
    statusName:        opts.statusName || 'Not Executed',
  }
  return _zephyrRequest(connectionId, '/testcycles', {
    method: 'POST',
    body:   JSON.stringify(body),
  })
}

// ── EXECUTIONS ──────────────────────────────────────────────────────────────

/**
 * Reporta una ejecución (test result) a Zephyr.
 *
 * @param {object} opts
 * @param {string} opts.projectKey
 * @param {string} opts.testCaseKey      e.g. "ACME-T1234"
 * @param {string} [opts.testCycleKey]
 * @param {string} opts.statusName       "Pass" | "Fail" | "Blocked" | "Not Executed"
 * @param {string} [opts.comment]
 * @param {string} [opts.executionTime]  Duración en ms
 * @param {string} [opts.actualEndDate]  ISO date
 */
export async function createTestExecution(connectionId, opts) {
  const body = {
    projectKey:       opts.projectKey,
    testCaseKey:      opts.testCaseKey,
    testCycleKey:     opts.testCycleKey,
    statusName:       opts.statusName,
    comment:          opts.comment,
    executionTime:    opts.executionTime,
    actualEndDate:    opts.actualEndDate,
  }
  // Limpiar undefined
  for (const k of Object.keys(body)) {
    if (body[k] === undefined) delete body[k]
  }
  return _zephyrRequest(connectionId, '/testexecutions', {
    method: 'POST',
    body:   JSON.stringify(body),
  })
}

// ── METADATA (folders, statuses, priorities) ───────────────────────────────

export async function listFolders(connectionId, projectKey) {
  const params = new URLSearchParams({ projectKey, maxResults: '200' })
  return _zephyrRequest(connectionId, `/folders?${params}`)
}

export async function listStatuses(connectionId, projectKey, statusType = 'TEST_CASE') {
  const params = new URLSearchParams({ projectKey, statusType, maxResults: '100' })
  return _zephyrRequest(connectionId, `/statuses?${params}`)
}

export async function listPriorities(connectionId, projectKey) {
  const params = new URLSearchParams({ projectKey, maxResults: '50' })
  return _zephyrRequest(connectionId, `/priorities?${params}`)
}
