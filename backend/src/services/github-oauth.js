/**
 * GitHub OAuth Flow
 *
 * Implementa el flow OAuth de GitHub Apps clásicas:
 *
 *   1. Cliente → /api/github/oauth/init
 *      ↓ Generamos state CSRF, lo guardamos en Redis con TTL 10min
 *      ↓ Redirect a github.com/login/oauth/authorize
 *
 *   2. Usuario autoriza en GitHub
 *      ↓ GitHub redirige a /api/github/oauth/callback?code=...&state=...
 *
 *   3. Backend → POST https://github.com/login/oauth/access_token
 *      ↓ Recibe access_token
 *      ↓ Llama a GET https://api.github.com/user para obtener info
 *      ↓ Cifra el token con crypto-vault.js (AES-256-GCM)
 *      ↓ Upsert en github_connections
 *
 *   4. Redirect al frontend con success/error
 *
 * Variables de entorno requeridas:
 *   GITHUB_CLIENT_ID
 *   GITHUB_CLIENT_SECRET
 *   GITHUB_OAUTH_REDIRECT_URI  (e.g. https://achilltest.io/api/github/oauth/callback)
 *   FRONTEND_URL                (para redirect final)
 *
 * Scopes solicitados:
 *   repo            → Crear/leer/escribir repos (incluye privados)
 *   user:email      → Leer el email del usuario (para mostrar)
 */

import { randomBytes }          from 'crypto'
import { eq }                   from 'drizzle-orm'

import { getDb, schema }        from '../db/client.js'
import { getRedis }             from './redis-client.js'
import { encryptValue,
         decryptValue }         from './crypto-vault.js'

const SCOPES = ['repo', 'user:email']

const STATE_TTL_SECONDS = 600  // 10 minutos para completar el flow

/**
 * Genera la URL para iniciar el flow OAuth.
 *
 * @param {string} userId       ID del usuario logueado en Achilltest
 * @param {string} [returnTo]   Path al que volver tras conectarse (e.g. "/suites/123")
 *
 * @returns {string} URL de GitHub
 */
export async function buildAuthorizeUrl(userId, returnTo = '/dashboard') {
  const clientId    = process.env.GITHUB_CLIENT_ID
  const redirectUri = process.env.GITHUB_OAUTH_REDIRECT_URI

  if (!clientId || !redirectUri) {
    throw new Error('GitHub OAuth no configurado (GITHUB_CLIENT_ID / GITHUB_OAUTH_REDIRECT_URI)')
  }

  // State CSRF token vinculado al userId
  const state = randomBytes(32).toString('hex')
  const redis = getRedis()
  const payload = JSON.stringify({ userId, returnTo, ts: Date.now() })
  await redis.setex(`github:oauth:state:${state}`, STATE_TTL_SECONDS, payload)

  const params = new URLSearchParams({
    client_id:    clientId,
    redirect_uri: redirectUri,
    scope:        SCOPES.join(' '),
    state,
    // allow_signup=false porque ya tenemos cuenta en Achilltest; OAuth solo conecta
    allow_signup: 'true',
  })

  return `https://github.com/login/oauth/authorize?${params.toString()}`
}

/**
 * Procesa el callback de GitHub. Llamado por la ruta /oauth/callback.
 *
 * @returns {{ userId, returnTo, connection }}
 */
export async function handleCallback({ code, state }) {
  if (!code || !state) {
    throw new Error('Faltan code o state')
  }

  // ── Validar state ──────────────────────────────────────────────────────
  const redis = getRedis()
  const key = `github:oauth:state:${state}`
  const payload = await redis.get(key)
  if (!payload) {
    throw new Error('State inválido o expirado. Vuelve a intentarlo.')
  }
  // One-shot: borrar el state inmediatamente para prevenir reuso
  await redis.del(key)

  let parsed
  try { parsed = JSON.parse(payload) }
  catch { throw new Error('State malformado') }

  const { userId, returnTo } = parsed

  // ── Intercambiar code por access_token ────────────────────────────────
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method:  'POST',
    headers: {
      'Accept':       'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id:     process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri:  process.env.GITHUB_OAUTH_REDIRECT_URI,
    }),
  })

  if (!tokenRes.ok) {
    throw new Error(`GitHub token exchange falló: HTTP ${tokenRes.status}`)
  }

  const tokenData = await tokenRes.json()
  if (tokenData.error) {
    throw new Error(`GitHub: ${tokenData.error_description || tokenData.error}`)
  }

  const accessToken = tokenData.access_token
  const tokenType   = tokenData.token_type
  const grantedScope = (tokenData.scope || '').split(',').map(s => s.trim()).filter(Boolean)

  if (!accessToken) {
    throw new Error('GitHub no devolvió access_token')
  }

  // Validar que los scopes que esperábamos estén
  const missing = SCOPES.filter(s => !grantedScope.includes(s))
  if (missing.length > 0) {
    throw new Error(`El usuario no autorizó los scopes necesarios: ${missing.join(', ')}`)
  }

  // ── Obtener info del usuario de GitHub ────────────────────────────────
  const userRes = await fetch('https://api.github.com/user', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept':        'application/vnd.github+json',
      'User-Agent':    'Achilltest',
    },
  })

  if (!userRes.ok) {
    throw new Error(`GitHub user info falló: HTTP ${userRes.status}`)
  }
  const ghUser = await userRes.json()

  // El user puede tener email oculto, pedir lista de emails
  let primaryEmail = ghUser.email
  if (!primaryEmail) {
    try {
      const emailsRes = await fetch('https://api.github.com/user/emails', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept':        'application/vnd.github+json',
          'User-Agent':    'Achilltest',
        },
      })
      if (emailsRes.ok) {
        const emails = await emailsRes.json()
        const primary = emails.find(e => e.primary) || emails[0]
        primaryEmail = primary?.email || null
      }
    } catch {}
  }

  // ── Cifrar y guardar en DB ─────────────────────────────────────────────
  const encrypted = encryptValue(accessToken)

  const db = getDb()
  // UPSERT por user_id
  const existing = await db.select().from(schema.githubConnections)
    .where(eq(schema.githubConnections.userId, userId)).limit(1)

  let connection
  if (existing.length > 0) {
    // Update existente (re-autenticación)
    const [updated] = await db.update(schema.githubConnections).set({
      githubUserId:         ghUser.id,
      githubUsername:       ghUser.login,
      githubEmail:          primaryEmail,
      avatarUrl:            ghUser.avatar_url,
      accessTokenEncrypted: encrypted,
      tokenType:            tokenType === 'bearer' ? 'oauth_app' : tokenType,
      scopes:               grantedScope,
      isActive:             true,
      lastError:            null,
      updatedAt:            new Date(),
    })
      .where(eq(schema.githubConnections.userId, userId))
      .returning()
    connection = updated
  } else {
    const [created] = await db.insert(schema.githubConnections).values({
      userId,
      githubUserId:         ghUser.id,
      githubUsername:       ghUser.login,
      githubEmail:          primaryEmail,
      avatarUrl:            ghUser.avatar_url,
      accessTokenEncrypted: encrypted,
      tokenType:            tokenType === 'bearer' ? 'oauth_app' : tokenType,
      scopes:               grantedScope,
      isActive:             true,
    }).returning()
    connection = created
  }

  return { userId, returnTo, connection }
}

/**
 * Recupera el access_token desencriptado para un user.
 * NUNCA exponer este token al cliente.
 */
export async function getAccessToken(userId) {
  const db = getDb()
  const [conn] = await db.select().from(schema.githubConnections)
    .where(eq(schema.githubConnections.userId, userId)).limit(1)

  if (!conn) throw new Error('No hay conexión de GitHub para este usuario')
  if (!conn.isActive) throw new Error('La conexión de GitHub está desactivada')

  const token = decryptValue(conn.accessTokenEncrypted)
  if (!token) throw new Error('No se pudo desencriptar el token de GitHub')

  // Actualizar last_used_at en background (sin bloquear)
  db.update(schema.githubConnections)
    .set({ lastUsedAt: new Date() })
    .where(eq(schema.githubConnections.userId, userId))
    .catch(() => {})

  return token
}

/**
 * Revoca la conexión y borra el token cifrado.
 */
export async function disconnectGitHub(userId) {
  const db = getDb()
  await db.delete(schema.githubConnections)
    .where(eq(schema.githubConnections.userId, userId))
}

/**
 * Verifica que un token sigue siendo válido haciendo una request a /user.
 * Útil antes de hacer operaciones costosas.
 */
export async function verifyToken(token) {
  try {
    const res = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept':        'application/vnd.github+json',
        'User-Agent':    'Achilltest',
      },
    })
    return res.ok
  } catch {
    return false
  }
}
