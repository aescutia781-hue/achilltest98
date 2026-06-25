/**
 * GitHub Push Service
 *
 * Orquesta el flow de push a un repo usando la Git Data API de GitHub.
 * Esto nos permite hacer commits multi-archivo en una sola operación sin
 * clonar el repo localmente.
 *
 * Flow estándar:
 *   1. Obtener la HEAD del branch (commit SHA actual)
 *   2. Crear un blob por cada archivo (devuelve SHA del blob)
 *   3. Crear un tree que referencia esos blobs (base_tree para mantener archivos no tocados)
 *   4. Crear un commit apuntando al tree, con parent = HEAD actual
 *   5. Actualizar la ref del branch para apuntar al nuevo commit
 *
 * Esto produce un commit atómico con todos los archivos en GitHub.
 */

import { eq, sql }            from 'drizzle-orm'
import { getDb, schema }      from '../db/client.js'
import { getAccessToken }     from './github-oauth.js'
import { getRedis }           from './redis-client.js'
import { createRepo,
         repoExists,
         getBranch,
         createBlob,
         createTree,
         createCommit,
         updateRef,
         getAuthenticatedUser } from './github-client.js'

/**
 * Push de un set de archivos a un repo existente.
 *
 * @param {object} opts
 * @param {string} opts.pushId          ID del registro github_pushes (estado pending)
 * @param {string} opts.userId
 * @param {string} opts.repoId          ID del github_repos
 * @param {Array}  opts.files           [{ path, content, encoding }]
 * @param {string} opts.commitMessage
 * @param {string} [opts.branch]        Default = default_branch del repo
 * @param {object} [opts.manifest]      Manifest a guardar en el repo row
 */
export async function pushFilesToRepo(opts) {
  const { pushId, userId, repoId, files, commitMessage, manifest } = opts
  const db        = getDb()
  const startedAt = Date.now()

  // Marcar push como pushing
  await db.update(schema.githubPushes).set({
    status:    'pushing',
    startedAt: new Date(),
  }).where(eq(schema.githubPushes.id, pushId))

  await _publishStatus(pushId, 'status', { phase: 'starting', message: 'Iniciando push...' })

  try {
    // ── 1. Cargar repo ───────────────────────────────────────────────────
    const [repo] = await db.select().from(schema.githubRepos)
      .where(eq(schema.githubRepos.id, repoId)).limit(1)
    if (!repo) throw new Error('Repo no encontrado')

    const branch = opts.branch || repo.defaultBranch || 'main'

    // ── 2. Obtener token del user ────────────────────────────────────────
    await _publishStatus(pushId, 'status', { phase: 'auth', message: 'Autenticando con GitHub...' })
    const token = await getAccessToken(userId)

    // ── 3. Obtener HEAD del branch ───────────────────────────────────────
    await _publishStatus(pushId, 'status', { phase: 'fetching', message: `Leyendo branch ${branch}...` })
    const branchInfo = await getBranch(token, repo.owner, repo.repoName, branch)
    const headCommitSha = branchInfo.commit.sha
    const headTreeSha   = branchInfo.commit.commit.tree.sha

    // ── 4. Crear blobs en paralelo (cap a 10 concurrentes) ───────────────
    await _publishStatus(pushId, 'status', {
      phase: 'blobs',
      message: `Subiendo ${files.length} archivos...`,
    })

    const treeEntries = []
    const CONCURRENCY = 8
    const queue = [...files]
    const inFlight = []
    let completed = 0

    while (queue.length > 0 || inFlight.length > 0) {
      // Llenar el pool
      while (inFlight.length < CONCURRENCY && queue.length > 0) {
        const file = queue.shift()
        const p = (async () => {
          const sha = await createBlob(token, repo.owner, repo.repoName, file.content, file.encoding || 'utf-8')
          completed++
          if (completed % 5 === 0 || completed === files.length) {
            await _publishStatus(pushId, 'progress', {
              completed, total: files.length,
            })
          }
          return {
            path: file.path,
            mode: '100644',
            type: 'blob',
            sha,
          }
        })()
        inFlight.push(p)
      }
      // Esperar al menos uno
      const result = await Promise.race(inFlight.map(p => p.then(v => ({ p, v }))))
      treeEntries.push(result.v)
      inFlight.splice(inFlight.indexOf(result.p), 1)
    }

    // ── 5. Crear tree ────────────────────────────────────────────────────
    await _publishStatus(pushId, 'status', { phase: 'tree', message: 'Construyendo árbol de archivos...' })
    const newTree = await createTree(token, repo.owner, repo.repoName, treeEntries, headTreeSha)

    // ── 6. Crear commit ──────────────────────────────────────────────────
    await _publishStatus(pushId, 'status', { phase: 'commit', message: 'Creando commit...' })
    const commit = await createCommit(
      token,
      repo.owner,
      repo.repoName,
      commitMessage,
      newTree.sha,
      headCommitSha,
    )

    // ── 7. Update ref ────────────────────────────────────────────────────
    await _publishStatus(pushId, 'status', { phase: 'pushing', message: `Pusheando a ${branch}...` })
    await updateRef(token, repo.owner, repo.repoName, branch, commit.sha)

    const commitUrl = `${repo.htmlUrl}/commit/${commit.sha}`

    // ── 8. Actualizar registros ──────────────────────────────────────────
    await db.update(schema.githubPushes).set({
      status:        'completed',
      commitSha:     commit.sha,
      commitUrl,
      filesCount:    files.length,
      durationMs:    Date.now() - startedAt,
      completedAt:   new Date(),
    }).where(eq(schema.githubPushes.id, pushId))

    await db.update(schema.githubRepos).set({
      lastCommitSha:     commit.sha,
      lastCommitMessage: commitMessage,
      lastPushedAt:      new Date(),
      lastFileCount:     files.length,
      totalPushes:       sql`${schema.githubRepos.totalPushes} + 1`,
      manifest:          manifest || repo.manifest,
      updatedAt:         new Date(),
    }).where(eq(schema.githubRepos.id, repoId))

    await _publishStatus(pushId, 'completed', {
      commitSha: commit.sha,
      commitUrl,
      filesCount: files.length,
    })

    console.log(`[GitHubPush ${pushId}] ✓ ${files.length} archivos en ${commit.sha.slice(0,7)}, ${Date.now() - startedAt}ms`)

    return { commitSha: commit.sha, commitUrl }

  } catch (err) {
    console.error(`[GitHubPush ${pushId}] Error:`, err)

    await db.update(schema.githubPushes).set({
      status:       'failed',
      errorMessage: err.message,
      durationMs:   Date.now() - startedAt,
      completedAt:  new Date(),
    }).where(eq(schema.githubPushes.id, pushId))

    await _publishStatus(pushId, 'error', { message: err.message })

    // Si el error fue auth-related, marcar la conexión
    if (err.status === 401 || err.status === 403) {
      await db.update(schema.githubConnections).set({
        lastError: err.message,
        isActive:  err.status === 401 ? false : true,
      }).where(eq(schema.githubConnections.userId, userId)).catch(() => {})
    }

    throw err
  }
}

/**
 * Crea un repo en GitHub y registra en DB.
 *
 * @param {object} opts
 * @param {string} opts.userId
 * @param {string} opts.repoName
 * @param {string} [opts.description]
 * @param {boolean} [opts.isPrivate=true]
 * @param {string} [opts.org]
 * @param {string} [opts.sourceType]    suite | workspace | api_collection
 * @param {string} [opts.sourceId]
 * @param {string} [opts.sourceName]
 *
 * @returns {object} El registro github_repos creado
 */
export async function createRepoAndRegister(opts) {
  const { userId, repoName, description, isPrivate = true, org, sourceType, sourceId, sourceName } = opts

  const db = getDb()

  // Cargar conexión
  const [connection] = await db.select().from(schema.githubConnections)
    .where(eq(schema.githubConnections.userId, userId)).limit(1)
  if (!connection) throw new Error('No hay conexión de GitHub. Conecta primero.')
  if (!connection.isActive) throw new Error('La conexión de GitHub está desactivada')

  const token = await getAccessToken(userId)

  // Determinar owner (user o org)
  const owner = org || connection.githubUsername

  // ── Verificar si ya existe ──────────────────────────────────────────────
  const exists = await repoExists(token, owner, repoName)
  if (exists) {
    throw Object.assign(new Error(`El repo ${owner}/${repoName} ya existe`), { code: 'REPO_EXISTS', owner, repoName })
  }

  // ── Crear repo en GitHub ────────────────────────────────────────────────
  const ghRepo = await createRepo(token, {
    name:        repoName,
    description,
    private:     isPrivate,
    org,
    autoInit:    true,    // Inicializa con README para que tenga un commit base
  })

  // ── Registrar en DB ────────────────────────────────────────────────────
  const [registered] = await db.insert(schema.githubRepos).values({
    userId,
    connectionId:  connection.id,
    githubRepoId:  ghRepo.id,
    owner:         ghRepo.owner.login,
    repoName:      ghRepo.name,
    fullName:      ghRepo.full_name,
    defaultBranch: ghRepo.default_branch || 'main',
    visibility:    ghRepo.private ? 'private' : 'public',
    htmlUrl:       ghRepo.html_url,
    cloneUrl:      ghRepo.clone_url,
    sourceType:    sourceType || null,
    sourceId:      sourceId || null,
    sourceName:    sourceName || null,
  }).returning()

  return registered
}

/**
 * Registra un repo EXISTENTE de GitHub en Achilltest (sin crearlo).
 * Útil cuando el repo ya está en GitHub y queremos pushear a él.
 */
export async function registerExistingRepo(opts) {
  const { userId, owner, repoName, sourceType, sourceId, sourceName } = opts
  const db = getDb()

  const [connection] = await db.select().from(schema.githubConnections)
    .where(eq(schema.githubConnections.userId, userId)).limit(1)
  if (!connection) throw new Error('No hay conexión de GitHub')

  const token = await getAccessToken(userId)

  // Obtener info real del repo desde GitHub para validar
  let ghRepo
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repoName}`, {
      headers: {
        'Authorization':       `Bearer ${token}`,
        'Accept':              'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent':          'Achilltest',
      },
    })
    if (!res.ok) {
      throw new Error(`No se encontró el repo ${owner}/${repoName}`)
    }
    ghRepo = await res.json()
  } catch (err) {
    throw new Error(`No se pudo acceder al repo: ${err.message}`)
  }

  // Si ya está registrado, devolver
  const existing = await db.select().from(schema.githubRepos).where(
    eq(schema.githubRepos.githubRepoId, ghRepo.id),
  ).limit(1)

  if (existing.length > 0 && existing[0].userId === userId) {
    return existing[0]
  }

  // Crear registro
  const [registered] = await db.insert(schema.githubRepos).values({
    userId,
    connectionId:  connection.id,
    githubRepoId:  ghRepo.id,
    owner:         ghRepo.owner.login,
    repoName:      ghRepo.name,
    fullName:      ghRepo.full_name,
    defaultBranch: ghRepo.default_branch || 'main',
    visibility:    ghRepo.private ? 'private' : 'public',
    htmlUrl:       ghRepo.html_url,
    cloneUrl:      ghRepo.clone_url,
    sourceType:    sourceType || null,
    sourceId:      sourceId || null,
    sourceName:    sourceName || null,
  }).returning()

  return registered
}

// ── pub/sub para SSE ─────────────────────────────────────────────────────────

async function _publishStatus(pushId, type, data) {
  try {
    const redis = getRedis()
    await redis.publish(`github:push:${pushId}`, JSON.stringify({
      type, data, timestamp: Date.now(),
    }))
  } catch {}
}

export async function subscribeToPush(pushId, callback) {
  const Redis = (await import('ioredis')).default
  const subscriber = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  })
  const channel = `github:push:${pushId}`
  await subscriber.subscribe(channel)
  subscriber.on('message', (ch, msg) => {
    if (ch !== channel) return
    try { callback(JSON.parse(msg)) } catch {}
  })
  return async () => {
    await subscriber.unsubscribe(channel)
    await subscriber.quit()
  }
}
