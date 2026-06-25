/**
 * Jira REST API Client
 *
 * Wrapper unificado para los dos modos de auth:
 *   - OAuth Cloud:  https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3/...
 *   - API Token:    {siteUrl}/rest/api/3/...   (Basic Auth)
 *
 * El cliente decide automáticamente cómo armar la URL y los headers
 * a partir de la connection en DB.
 *
 * Docs: https://developer.atlassian.com/cloud/jira/platform/rest/v3/
 */

import { eq }                       from 'drizzle-orm'
import { getDb, schema }            from '../db/client.js'
import { getAccessToken,
         getApiCredentials }        from './jira-oauth.js'

/**
 * Construye baseUrl + headers según el tipo de auth.
 *
 * @returns {{ baseUrl, headers }}
 */
async function _resolveClient(connectionId) {
  const db = getDb()
  const [conn] = await db.select().from(schema.jiraConnections)
    .where(eq(schema.jiraConnections.id, connectionId)).limit(1)
  if (!conn) throw new Error('Conexión no encontrada')
  if (!conn.isActive) throw new Error('Conexión inactiva')

  const headers = {
    'Accept':       'application/json',
    'Content-Type': 'application/json',
    'User-Agent':   'Achilltest',
  }

  let baseUrl
  if (conn.authType === 'oauth') {
    const token = await getAccessToken(connectionId)
    headers.Authorization = `Bearer ${token}`
    baseUrl = `https://api.atlassian.com/ex/jira/${conn.cloudId}`
  } else if (conn.authType === 'api_token') {
    const { email, apiToken } = await getApiCredentials(connectionId)
    const basic = Buffer.from(`${email}:${apiToken}`).toString('base64')
    headers.Authorization = `Basic ${basic}`
    baseUrl = conn.siteUrl
  } else {
    throw new Error(`authType desconocido: ${conn.authType}`)
  }

  return { baseUrl, headers, connection: conn }
}

async function _request(connectionId, path, options = {}) {
  const { baseUrl, headers } = await _resolveClient(connectionId)
  const url = path.startsWith('http') ? path : `${baseUrl}${path}`

  const res = await fetch(url, {
    method: options.method || 'GET',
    headers: { ...headers, ...(options.headers || {}) },
    body:   options.body,
  })

  if (!res.ok) {
    let body = null
    try { body = await res.json() } catch {}
    const message = body?.errorMessages?.[0] || body?.message || `HTTP ${res.status}`
    const err = new Error(`Jira: ${message}`)
    err.status = res.status
    err.response = body
    throw err
  }

  if (res.status === 204) return null
  return res.json()
}

// ── PROJECTS ────────────────────────────────────────────────────────────────

/**
 * Lista proyectos accesibles. Soporta paginación.
 */
export async function listProjects(connectionId, opts = {}) {
  const params = new URLSearchParams({
    startAt:    String(opts.startAt || 0),
    maxResults: String(opts.maxResults || 50),
    orderBy:    opts.orderBy || 'name',
  })
  return _request(connectionId, `/rest/api/3/project/search?${params}`)
}

export async function getProject(connectionId, projectKeyOrId) {
  return _request(connectionId, `/rest/api/3/project/${projectKeyOrId}`)
}

// ── USER ────────────────────────────────────────────────────────────────────

export async function getMyself(connectionId) {
  return _request(connectionId, '/rest/api/3/myself')
}

// ── ISSUE TYPES ─────────────────────────────────────────────────────────────

/**
 * Lista los issue types disponibles para un proyecto.
 * Necesario para crear Bug correctamente (algunos proyectos no tienen "Bug").
 */
export async function getIssueTypesForProject(connectionId, projectKeyOrId) {
  // /rest/api/3/issuetype/project devuelve los tipos disponibles para el project
  const params = new URLSearchParams({ projectId: projectKeyOrId })
  try {
    return await _request(connectionId, `/rest/api/3/issuetype/project?${params}`)
  } catch {
    // Fallback: traer todos los issue types
    return await _request(connectionId, '/rest/api/3/issuetype')
  }
}

// ── ISSUES ──────────────────────────────────────────────────────────────────

/**
 * Crea un issue (típicamente Bug) en un proyecto.
 *
 * @param {object} opts
 * @param {string} opts.projectKey
 * @param {string} opts.summary
 * @param {string} [opts.description]   En formato Atlassian Document Format (ADF)
 * @param {string} [opts.issueType='Bug']
 * @param {string} [opts.priority]
 * @param {Array}  [opts.labels]
 */
export async function createIssue(connectionId, opts) {
  const description = opts.description
    ? _textToADF(opts.description)
    : undefined

  const body = {
    fields: {
      project:   { key: opts.projectKey },
      summary:   opts.summary,
      issuetype: { name: opts.issueType || 'Bug' },
      ...(description ? { description } : {}),
      ...(opts.priority ? { priority: { name: opts.priority } } : {}),
      ...(opts.labels?.length ? { labels: opts.labels } : {}),
    },
  }

  return _request(connectionId, '/rest/api/3/issue', {
    method: 'POST',
    body:   JSON.stringify(body),
  })
}

/**
 * Obtiene un issue por key o ID.
 */
export async function getIssue(connectionId, issueKeyOrId) {
  return _request(connectionId, `/rest/api/3/issue/${issueKeyOrId}`)
}

/**
 * Construye una URL pública de un issue.
 */
export async function buildIssueUrl(connectionId, issueKey) {
  const { connection } = await _resolveClient(connectionId)
  return `${connection.siteUrl}/browse/${issueKey}`
}

// ── HELPERS ────────────────────────────────────────────────────────────────

/**
 * Convierte un string de texto plano a Atlassian Document Format (ADF).
 * Jira Cloud REST v3 espera ADF en lugar de texto plano para descripciones.
 *
 * Mantiene saltos de línea como párrafos separados.
 */
function _textToADF(text) {
  const paragraphs = String(text).split(/\n\n+/).map(p => p.trim()).filter(Boolean)
  return {
    type:    'doc',
    version: 1,
    content: paragraphs.map(p => ({
      type:    'paragraph',
      content: [{ type: 'text', text: p }],
    })),
  }
}
