/**
 * Cleanup Service.
 *
 * Borra reportes y screenshots de runs viejos según el plan del usuario:
 *   - Trial:    1 día de historial
 *   - Starter:  30 días
 *   - Teammate: 90 días
 *
 * Se ejecuta diariamente desde el API server (cron interno con setInterval).
 *
 * También limpia:
 *   - Slots de rate limiting fantasma en Redis
 *   - Jobs viejos de BullMQ (la cola los limpia automático con removeOnComplete)
 */

import { eq, and, lt, inArray }     from 'drizzle-orm'
import { rmSync, existsSync, readdirSync, statSync } from 'fs'
import { join }                     from 'path'

import { getDb, schema }            from '../db/client.js'
import { getPlanLimits }            from '../config/plans.js'

const REPORTS_DIR    = process.env.REPORTS_DIR    || '/tmp/achilltest-reports'
const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR || '/tmp/achilltest-screenshots'

const HISTORY_DAYS = {
  trial:    1,
  starter:  30,
  teammate: 90,
  advance:  180,
  pro:      365,
  enterprise: 730,
}

/**
 * Ejecuta una pasada completa de limpieza.
 */
export async function runCleanup() {
  console.log(`[Cleanup] Iniciando: ${new Date().toISOString()}`)

  const stats = {
    suiteRunsDeleted:  0,
    executionsDeleted: 0,
    reportsDeleted:    0,
    screenshotsDeleted:0,
    bytesFreed:        0,
  }

  try {
    await _cleanupSuiteRuns(stats)
    await _cleanupExecutions(stats)
    await _cleanupOrphanedReports(stats)
    await _cleanupOrphanedScreenshots(stats)
  } catch (err) {
    console.error(`[Cleanup] Error:`, err.message)
  }

  console.log(`[Cleanup] Completado:`, stats)
  return stats
}

// ── Suite Runs ───────────────────────────────────────────────────────────────

async function _cleanupSuiteRuns(stats) {
  const db = getDb()

  // Cargar todos los usuarios con sus planes para conocer el cutoff de cada uno
  const users = await db.select({
    id:   schema.users.id,
    plan: schema.users.plan,
  }).from(schema.users)

  for (const user of users) {
    const daysToKeep = HISTORY_DAYS[user.plan] ?? 30
    const cutoff = new Date(Date.now() - daysToKeep * 86400000)

    // Encontrar suite_runs viejos
    const oldRuns = await db.select({
      id:                  schema.suiteRuns.id,
      playwrightReportUrl: schema.suiteRuns.playwrightReportUrl,
      allureReportUrl:     schema.suiteRuns.allureReportUrl,
    })
      .from(schema.suiteRuns)
      .where(and(
        eq(schema.suiteRuns.userId, user.id),
        lt(schema.suiteRuns.createdAt, cutoff),
      ))

    if (oldRuns.length === 0) continue

    // Borrar carpetas de reportes en disco
    for (const run of oldRuns) {
      const pwDir = join(REPORTS_DIR, 'playwright', run.id)
      const alDir = join(REPORTS_DIR, 'allure', run.id)

      stats.bytesFreed += _safeRm(pwDir)
      stats.bytesFreed += _safeRm(alDir)
    }

    // Borrar registros en DB (cascada borra suite_run_results)
    const runIds = oldRuns.map(r => r.id)
    await db.delete(schema.suiteRuns).where(inArray(schema.suiteRuns.id, runIds))

    stats.suiteRunsDeleted += oldRuns.length
    stats.reportsDeleted   += oldRuns.length * 2   // 2 reportes por run
  }
}

// ── Executions ───────────────────────────────────────────────────────────────

async function _cleanupExecutions(stats) {
  const db = getDb()

  const users = await db.select({
    id:   schema.users.id,
    plan: schema.users.plan,
  }).from(schema.users)

  for (const user of users) {
    const daysToKeep = HISTORY_DAYS[user.plan] ?? 30
    const cutoff = new Date(Date.now() - daysToKeep * 86400000)

    const oldExecs = await db.select({
      id:     schema.executions.id,
      result: schema.executions.result,
    })
      .from(schema.executions)
      .where(and(
        eq(schema.executions.userId, user.id),
        lt(schema.executions.createdAt, cutoff),
      ))

    if (oldExecs.length === 0) continue

    // Borrar screenshots asociados (los nombres siguen el patrón {execId}-NNN.png)
    for (const exec of oldExecs) {
      try {
        const files = readdirSync(SCREENSHOT_DIR).filter(f => f.startsWith(exec.id + '-'))
        for (const f of files) {
          const path = join(SCREENSHOT_DIR, f)
          stats.bytesFreed += _safeRm(path)
          stats.screenshotsDeleted++
        }
      } catch {}
    }

    await db.delete(schema.executions).where(inArray(schema.executions.id, oldExecs.map(e => e.id)))
    stats.executionsDeleted += oldExecs.length
  }
}

// ── Reportes huérfanos (sin entrada en DB) ──────────────────────────────────

async function _cleanupOrphanedReports(stats) {
  const db = getDb()

  // IDs de runs vivos
  const liveRuns = await db.select({ id: schema.suiteRuns.id }).from(schema.suiteRuns)
  const liveSet = new Set(liveRuns.map(r => r.id))

  for (const subdir of ['playwright', 'allure']) {
    const dir = join(REPORTS_DIR, subdir)
    if (!existsSync(dir)) continue

    try {
      const dirs = readdirSync(dir)
      for (const d of dirs) {
        if (!liveSet.has(d)) {
          // Es huérfano
          const path = join(dir, d)
          stats.bytesFreed += _safeRm(path)
          stats.reportsDeleted++
        }
      }
    } catch {}
  }
}

// ── Screenshots huérfanos ───────────────────────────────────────────────────

async function _cleanupOrphanedScreenshots(stats) {
  const db = getDb()

  if (!existsSync(SCREENSHOT_DIR)) return

  // Cargar IDs de executions vivas
  const liveExecs = await db.select({ id: schema.executions.id }).from(schema.executions)
  const liveSet = new Set(liveExecs.map(e => e.id))

  // También considerar archivos viejos sin match (más de 90 días)
  const veryOldCutoff = Date.now() - 90 * 86400000

  try {
    const files = readdirSync(SCREENSHOT_DIR)
    for (const f of files) {
      // Extraer executionId del nombre (formato: {uuid}-NNN.png)
      const execId = f.split('-').slice(0, 5).join('-')

      const path = join(SCREENSHOT_DIR, f)
      let shouldDelete = false

      // Si no hay execution viva → huérfano
      if (!liveSet.has(execId)) shouldDelete = true

      // Si el archivo es muy viejo → borrar igual
      try {
        if (statSync(path).mtimeMs < veryOldCutoff) shouldDelete = true
      } catch {}

      if (shouldDelete) {
        stats.bytesFreed += _safeRm(path)
        stats.screenshotsDeleted++
      }
    }
  } catch {}
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function _safeRm(path) {
  let bytes = 0
  try {
    if (!existsSync(path)) return 0

    // Calcular tamaño antes de borrar (recursivo)
    const stat = statSync(path)
    if (stat.isDirectory()) {
      bytes = _dirSize(path)
    } else {
      bytes = stat.size
    }

    rmSync(path, { recursive: true, force: true })
  } catch {}
  return bytes
}

function _dirSize(dir) {
  let size = 0
  try {
    const items = readdirSync(dir)
    for (const item of items) {
      const p = join(dir, item)
      const stat = statSync(p)
      if (stat.isDirectory()) size += _dirSize(p)
      else                    size += stat.size
    }
  } catch {}
  return size
}

// ── Scheduler ────────────────────────────────────────────────────────────────

let intervalHandle = null

/**
 * Inicia el scheduler. Corre cleanup cada 24 horas.
 * Se llama desde index.js al arrancar el API.
 */
export function startCleanupScheduler(intervalMs = 86400000) {
  if (intervalHandle) return

  // Primera pasada en 1 minuto (para no bloquear el arranque)
  setTimeout(() => {
    runCleanup().catch(err => console.error('[Cleanup]', err))
  }, 60000)

  // Pasadas periódicas
  intervalHandle = setInterval(() => {
    runCleanup().catch(err => console.error('[Cleanup]', err))
  }, intervalMs)

  console.log(`[Cleanup] Scheduler iniciado (cada ${intervalMs / 3600000}h)`)
}

export function stopCleanupScheduler() {
  if (intervalHandle) {
    clearInterval(intervalHandle)
    intervalHandle = null
  }
}
