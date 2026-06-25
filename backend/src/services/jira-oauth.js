/**
 * Jira OAuth + API Token Service
 *
 * Soporta DOS modos de autenticación:
 *
 *  1) OAuth 2.0 (Atlassian Cloud) — recomendado, mejor UX
 *     • Authorization Code flow estándar
 *     • Tokens expiran en 1h, se refrescan automáticamente
 *     • Solo Atlassian Cloud (no Server/Data Center)
 *
 *  2) API Token (Cloud + Server/Data Center) — fallback
 *     • User ingresa email + API token desde id.atlassian.com
 *     • Funciona también con Jira Server/Data Center (on-prem)
 *     • UX menos pulida pero más flexible para LATAM
 *
 * Variables de entorno:
 *   JIRA_CLIENT_ID
 *   JIRA_CLIENT_SECRET
 *   JIRA_OAUTH_REDIRECT_URI    (e.g. https://achilltest.io/api/jira/oauth/callback)
 *   FRONTEND_URL
 */

import { randomBytes }                from 'crypto'
import { eq }                         from 'drizzle-orm'
import { getDb, schema }              from '../db/client.js'
import { getRedis }                   from './redis-client.js'
import { encryptValue, decryptValue } from './crypto-vault.js'

// Scopes requeridos. Si activamos Zephyr Scale, se piden estos adicionales.
const SCOPES = [
  'read:jira-user',
  'read:jira-work',
  'write:jira-work',
  'manage:jira-project',
  // 'manage:jira-configuration',  // opcional
  'offline_access',                  // para refresh_token
]

const STATE_TTL_SECONDS = 600  // 10 minutos para completar OAuth

// ── OAUTH FLOW ──────────────────────────────────────────────────────────────

/**
 * Genera la URL para iniciar el OAuth flow de Atlassian.
 *
 * @param {string} userId         User que inicia la conexión
 * @param {string} organizationId Org que recibe la conexión
 * @param {string} [returnTo]
 */
export async function buildAuthorizeUrl(userId, organizationId, returnTo = '/jira') {
  const clientId    = process.env.JIRA_CLIENT_ID
  const redirectUri = process.env.JIRA_OAUTH_REDIRECT_URI
  if (!clientId || !redirectUri) {
    throw new Error('Jira OAuth no configurado (JIRA_CLIENT_ID / JIRA_OAUTH_REDIRECT_URI)')
  }

  const state = randomBytes(32).toString('hex')
  const redis = getRedis()
  const payload = JSON.stringify({ userId, organizationId, returnTo, ts: Date.now() })
  await redis.setex(`jira:oauth:state:${state}`, STATE_TTL_SECONDS, payload)

  const params = new URLSearchParams({
    audience:      'api.atlassian.com',
    client_id:     clientId,
    scope:         SCOPES.join(' '),
    redirect_uri:  redirectUri,
    state,
    response_type: 'code',
    prompt:        'consent',  // forzar consent para obtener refresh_token
  })

  return `https://auth.atlassian.com/authorize?${params.toString()}`
}

/**
 * Procesa el callback de Atlassian. Intercambia code por tokens, descubre el
 * cloudId del site, y guarda la conexión en DB.
 */
export async function handleCallback({ code, state }) {
  if (!code || !state) throw new Error('Faltan code o state')

  // Validar state
  const redis = getRedis()
  const key = `jira:oauth:state:${state}`
  const payload = await redis.get(key)
  if (!payload) throw new Error('State inválido o expirado. Vuelve a intentarlo.')
  await redis.del(key)

  let parsed
  try { parsed = JSON.parse(payload) }
  catch { throw new Error('State malformado') }

  const { userId, organizationId, returnTo } = parsed

  // ── Intercambiar code por tokens ────────────────────────────────────────
  const tokenRes = await fetch('https://auth.atlassian.com/oauth/token', {
    method: 'POST',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type:    'authorization_code',
      client_id:     process.env.JIRA_CLIENT_ID,
      client_secret: process.env.JIRA_CLIENT_SECRET,
      code,
      redirect_uri:  process.env.JIRA_OAUTH_REDIRECT_URI,
    }),
  })

  if (!tokenRes.ok) {
    throw new Error(`Atlassian token exchange falló: HTTP ${tokenRes.status}`)
  }
  const tokenData = await tokenRes.json()
  if (tokenData.error) {
    throw new Error(`Atlassian: ${tokenData.error_description || tokenData.error}`)
  }

  const accessToken  = tokenData.access_token
  const refreshToken = tokenData.refresh_token
  const expiresIn    = tokenData.expires_in || 3600
  const grantedScope = (tokenData.scope || '').split(' ').filter(Boolean)

  // ── Descubrir el cloudId (accessible resources) ─────────────────────────
  const resourcesRes = await fetch('https://api.atlassian.com/oauth/token/accessible-resources', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept':        'application/json',
    },
  })
  if (!resourcesRes.ok) {
    throw new Error(`No se pudo obtener accessible-resources: HTTP ${resourcesRes.status}`)
  }
  const resources = await resourcesRes.json()
  if (!resources || resources.length === 0) {
    throw new Error('No tienes acceso a ningún site de Jira con tu cuenta')
  }
  // Tomamos el primer site (típicamente solo hay uno por org)
  const site = resources[0]

  // ── Obtener info del user de Atlassian ──────────────────────────────────
  const userRes = await fetch(`https://api.atlassian.com/ex/jira/${site.id}/rest/api/3/myself`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept':        'application/json',
    },
  })
  let atlUser = {}
  if (userRes.ok) atlUser = await userRes.json()

  // ── Guardar conexión cifrada ───────────────────────────────────────────
  const db = getDb()
  const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000)

  const accessTokenEncrypted  = encryptValue(accessToken)
  const refreshTokenEncrypted = refreshToken ? encryptValue(refreshToken) : null

  // UPSERT por organizationId
  const existing = await db.select().from(schema.jiraConnections)
    .where(eq(schema.jiraConnections.organizationId, organizationId)).limit(1)

  let connection
  if (existing.length > 0) {
    const [updated] = await db.update(schema.jiraConnections).set({
      connectedBy:             userId,
      authType:                'oauth',
      deploymentType:          'cloud',
      cloudId:                 site.id,
      siteUrl:                 site.url,
      siteName:                site.name,
      accessTokenEncrypted,
      refreshTokenEncrypted,
      tokenExpiresAt,
      apiTokenEncrypted:       null,
      apiEmail:                null,
      atlassianUserId:         atlUser.accountId,
      atlassianUserName:       atlUser.displayName,
      atlassianUserEmail:      atlUser.emailAddress,
      avatarUrl:               atlUser.avatarUrls?.['48x48'],
      scopes:                  grantedScope,
      isActive:                true,
      lastError:               null,
      updatedAt:               new Date(),
    })
      .where(eq(schema.jiraConnections.organizationId, organizationId))
      .returning()
    connection = updated
  } else {
    const [created] = await db.insert(schema.jiraConnections).values({
      organizationId,
      connectedBy:             userId,
      authType:                'oauth',
      deploymentType:          'cloud',
      cloudId:                 site.id,
      siteUrl:                 site.url,
      siteName:                site.name,
      accessTokenEncrypted,
      refreshTokenEncrypted,
      tokenExpiresAt,
      atlassianUserId:         atlUser.accountId,
      atlassianUserName:       atlUser.displayName,
      atlassianUserEmail:      atlUser.emailAddress,
      avatarUrl:               atlUser.avatarUrls?.['48x48'],
      scopes:                  grantedScope,
      isActive:                true,
    }).returning()
    connection = created
  }

  return { userId, organizationId, returnTo, connection }
}

// ── API TOKEN AUTH (Cloud + Server) ─────────────────────────────────────────

/**
 * Configura conexión con API Token (Basic Auth con email:token).
 *
 * @param {object} opts
 * @param {string} opts.userId
 * @param {string} opts.organizationId
 * @param {string} opts.siteUrl        URL completa del Jira (e.g. https://acme.atlassian.net)
 * @param {string} opts.email
 * @param {string} opts.apiToken
 * @param {string} [opts.deploymentType=cloud]
 */
export async function connectWithApiToken({ userId, organizationId, siteUrl, email, apiToken, deploymentType = 'cloud' }) {
  if (!siteUrl?.trim() || !email?.trim() || !apiToken?.trim()) {
    throw new Error('siteUrl, email y apiToken son requeridos')
  }
  const cleanSiteUrl = siteUrl.trim().replace(/\/$/, '')

  // ── Validar credenciales contra /myself ─────────────────────────────────
  const basicAuth = Buffer.from(`${email.trim()}:${apiToken.trim()}`).toString('base64')
  const myselfRes = await fetch(`${cleanSiteUrl}/rest/api/3/myself`, {
    headers: {
      'Authorization': `Basic ${basicAuth}`,
      'Accept':        'application/json',
    },
  })
  if (!myselfRes.ok) {
    const txt = await myselfRes.text().catch(() => '')
    throw new Error(`Credenciales inválidas: HTTP ${myselfRes.status}. ${txt.slice(0, 200)}`)
  }
  const atlUser = await myselfRes.json()

  // ── Guardar ──────────────────────────────────────────────────────────────
  const db = getDb()
  const apiTokenEncrypted = encryptValue(apiToken.trim())

  const existing = await db.select().from(schema.jiraConnections)
    .where(eq(schema.jiraConnections.organizationId, organizationId)).limit(1)

  let connection
  if (existing.length > 0) {
    const [updated] = await db.update(schema.jiraConnections).set({
      connectedBy:             userId,
      authType:                'api_token',
      deploymentType,
      cloudId:                 null,
      siteUrl:                 cleanSiteUrl,
      siteName:                atlUser.displayName ? `${atlUser.displayName}'s site` : cleanSiteUrl,
      accessTokenEncrypted:    null,
      refreshTokenEncrypted:   null,
      tokenExpiresAt:          null,
      apiTokenEncrypted,
      apiEmail:                email.trim(),
      atlassianUserId:         atlUser.accountId,
      atlassianUserName:       atlUser.displayName,
      atlassianUserEmail:      atlUser.emailAddress || email.trim(),
      avatarUrl:               atlUser.avatarUrls?.['48x48'],
      scopes:                  [],
      isActive:                true,
      lastError:               null,
      updatedAt:               new Date(),
    })
      .where(eq(schema.jiraConnections.organizationId, organizationId))
      .returning()
    connection = updated
  } else {
    const [created] = await db.insert(schema.jiraConnections).values({
      organizationId,
      connectedBy:             userId,
      authType:                'api_token',
      deploymentType,
      siteUrl:                 cleanSiteUrl,
      siteName:                cleanSiteUrl,
      apiTokenEncrypted,
      apiEmail:                email.trim(),
      atlassianUserId:         atlUser.accountId,
      atlassianUserName:       atlUser.displayName,
      atlassianUserEmail:      atlUser.emailAddress || email.trim(),
      avatarUrl:               atlUser.avatarUrls?.['48x48'],
      isActive:                true,
    }).returning()
    connection = created
  }

  return connection
}

// ── REFRESH TOKEN ──────────────────────────────────────────────────────────

/**
 * Refresca el access_token usando el refresh_token.
 * Atlassian tokens expiran en 1h.
 */
export async function refreshAccessToken(connectionId) {
  const db = getDb()
  const [conn] = await db.select().from(schema.jiraConnections)
    .where(eq(schema.jiraConnections.id, connectionId)).limit(1)
  if (!conn) throw new Error('Conexión no encontrada')
  if (conn.authType !== 'oauth') throw new Error('Refresh solo aplica a OAuth')
  if (!conn.refreshTokenEncrypted) throw new Error('No hay refresh_token guardado')

  const refreshToken = decryptValue(conn.refreshTokenEncrypted)

  const res = await fetch('https://auth.atlassian.com/oauth/token', {
    method: 'POST',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type:    'refresh_token',
      client_id:     process.env.JIRA_CLIENT_ID,
      client_secret: process.env.JIRA_CLIENT_SECRET,
      refresh_token: refreshToken,
    }),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`Refresh falló: HTTP ${res.status}. ${txt.slice(0, 200)}`)
  }
  const data = await res.json()
  const newAccessToken  = data.access_token
  const newRefreshToken = data.refresh_token || refreshToken
  const expiresIn       = data.expires_in || 3600

  const accessTokenEncrypted  = encryptValue(newAccessToken)
  const refreshTokenEncrypted = encryptValue(newRefreshToken)
  const tokenExpiresAt        = new Date(Date.now() + expiresIn * 1000)

  await db.update(schema.jiraConnections).set({
    accessTokenEncrypted,
    refreshTokenEncrypted,
    tokenExpiresAt,
    updatedAt: new Date(),
  }).where(eq(schema.jiraConnections.id, connectionId))

  return newAccessToken
}

// ── GET ACCESS TOKEN (refresca si está por expirar) ────────────────────────

/**
 * Obtiene el access_token actual (refrescando si está por expirar).
 * Sólo para OAuth. Para API Token usar getApiCredentials.
 */
export async function getAccessToken(connectionId) {
  const db = getDb()
  const [conn] = await db.select().from(schema.jiraConnections)
    .where(eq(schema.jiraConnections.id, connectionId)).limit(1)
  if (!conn) throw new Error('Conexión no encontrada')
  if (!conn.isActive) throw new Error('Conexión inactiva')
  if (conn.authType !== 'oauth') throw new Error('Conexión no es OAuth')

  // Refresh si quedan <5 minutos
  const now = Date.now()
  const expiresAt = conn.tokenExpiresAt ? new Date(conn.tokenExpiresAt).getTime() : 0
  if (expiresAt - now < 5 * 60 * 1000) {
    return await refreshAccessToken(connectionId)
  }

  const token = decryptValue(conn.accessTokenEncrypted)

  // Actualizar last_used_at en background
  db.update(schema.jiraConnections)
    .set({ lastUsedAt: new Date() })
    .where(eq(schema.jiraConnections.id, connectionId))
    .catch(() => {})

  return token
}

/**
 * Obtiene credenciales para API Token (Basic Auth).
 */
export async function getApiCredentials(connectionId) {
  const db = getDb()
  const [conn] = await db.select().from(schema.jiraConnections)
    .where(eq(schema.jiraConnections.id, connectionId)).limit(1)
  if (!conn) throw new Error('Conexión no encontrada')
  if (conn.authType !== 'api_token') throw new Error('Conexión no es API token')
  const apiToken = decryptValue(conn.apiTokenEncrypted)
  return { email: conn.apiEmail, apiToken }
}

// ── DISCONNECT ─────────────────────────────────────────────────────────────

export async function disconnectJira(organizationId) {
  const db = getDb()
  await db.delete(schema.jiraConnections)
    .where(eq(schema.jiraConnections.organizationId, organizationId))
}

// ── ZEPHYR TOKEN ───────────────────────────────────────────────────────────

/**
 * Configura el token de Zephyr Scale (es separado del de Jira).
 * Zephyr Scale Cloud: https://api.zephyrscale.smartbear.com
 */
export async function setZephyrToken(organizationId, zephyrToken) {
  if (!zephyrToken?.trim()) throw new Error('Token vacío')

  // Validar contra API de Zephyr
  const res = await fetch('https://api.zephyrscale.smartbear.com/v2/healthcheck', {
    headers: {
      'Authorization': `Bearer ${zephyrToken.trim()}`,
      'Accept':        'application/json',
    },
  })
  if (!res.ok && res.status !== 404) {
    // /healthcheck a veces no existe, intentamos otro endpoint conocido
    const res2 = await fetch('https://api.zephyrscale.smartbear.com/v2/projects?maxResults=1', {
      headers: { 'Authorization': `Bearer ${zephyrToken.trim()}`, 'Accept': 'application/json' },
    })
    if (!res2.ok) {
      throw new Error(`Zephyr Scale token inválido: HTTP ${res2.status}`)
    }
  }

  const db = getDb()
  const encrypted = encryptValue(zephyrToken.trim())
  await db.update(schema.jiraConnections).set({
    hasZephyr:            true,
    zephyrTokenEncrypted: encrypted,
    updatedAt:            new Date(),
  }).where(eq(schema.jiraConnections.organizationId, organizationId))

  return { hasZephyr: true }
}

export async function getZephyrToken(connectionId) {
  const db = getDb()
  const [conn] = await db.select().from(schema.jiraConnections)
    .where(eq(schema.jiraConnections.id, connectionId)).limit(1)
  if (!conn || !conn.hasZephyr) throw new Error('Zephyr Scale no configurado para esta org')
  return decryptValue(conn.zephyrTokenEncrypted)
}
