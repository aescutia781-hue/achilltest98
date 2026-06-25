/**
 * Allure History Tracker
 *
 * Maneja dos responsabilidades:
 *
 *   1. History de Allure (carpeta history/) — usada por Allure CLI para
 *      generar trends en el reporte. Se preserva entre runs del mismo project.
 *
 *   2. Detección de flaky tests — análisis post-procesamiento de los
 *      últimos N runs para identificar tests que pasan/fallan intermitentemente.
 *
 * Un test es "flaky" si:
 *   - Tiene >= 3 corridas en los últimos N runs
 *   - Mezcla pass + fail (no es siempre uno solo)
 *   - flaky_score se calcula como: min(pass, fail) / total
 *     score 0.5 = perfectamente impredecible (50/50)
 *     score 0.1 = mayormente estable con fallos ocasionales
 */

import { eq, desc, and }     from 'drizzle-orm'
import { getDb, schema }     from '../db/client.js'
import { existsSync }        from 'fs'
import { join }              from 'path'

const FLAKY_ANALYSIS_RUNS = 20   // Cuántos runs analizar
const MIN_RUNS_TO_FLAG    = 3    // Mínimo de runs para considerar flaky
const FLAKY_THRESHOLD     = 0.1  // Score >= 0.1 = flaky

/**
 * Devuelve la carpeta history/ del run inmediatamente anterior del mismo project.
 * Allure CLI usa esto para acumular trends.
 *
 * @param {string} projectId
 * @returns {string | null} Path a history/ o null si es el primer run
 */
export async function getPreviousHistoryDir(projectId) {
  const db = getDb()
  const previousRuns = await db.select({
    id:        schema.allureRuns.id,
    reportUrl: schema.allureRuns.reportUrl,
  })
    .from(schema.allureRuns)
    .where(and(
      eq(schema.allureRuns.projectId, projectId),
      eq(schema.allureRuns.status, 'completed'),
    ))
    .orderBy(desc(schema.allureRuns.completedAt))
    .limit(1)

  if (previousRuns.length === 0) return null

  // El reportUrl es /reports/allure/{projectId}/{runId}/report/index.html
  // Necesitamos la ruta absoluta a history/
  const REPORTS_DIR = process.env.REPORTS_DIR || '/tmp/achilltest-reports'
  const previousId  = previousRuns[0].id
  const historyDir  = join(REPORTS_DIR, 'allure', projectId, previousId, 'report', 'history')

  return existsSync(historyDir) ? historyDir : null
}

/**
 * Analiza los últimos N runs del project para detectar tests flaky.
 * Actualiza la tabla allure_flaky_tests con los resultados.
 *
 * @param {string} projectId
 */
export async function analyzeFlakyTests(projectId) {
  const db = getDb()

  // Cargar los snapshots de los últimos N runs
  const recentRuns = await db.select({
    id:            schema.allureRuns.id,
    testsSnapshot: schema.allureRuns.testsSnapshot,
    createdAt:     schema.allureRuns.createdAt,
  })
    .from(schema.allureRuns)
    .where(and(
      eq(schema.allureRuns.projectId, projectId),
      eq(schema.allureRuns.status, 'completed'),
    ))
    .orderBy(desc(schema.allureRuns.createdAt))
    .limit(FLAKY_ANALYSIS_RUNS)

  if (recentRuns.length < MIN_RUNS_TO_FLAG) return { analyzed: 0, flaky: [] }

  // Agregar por testFullName
  const testStats = new Map()
  // Map<fullName, { passCount, failCount, brokenCount, total, lastStatus, lastRunId, lastSeenAt }>

  // Recorrer del más reciente al más antiguo
  for (const run of recentRuns) {
    const snapshot = run.testsSnapshot || {}
    for (const [fullName, t] of Object.entries(snapshot)) {
      if (!testStats.has(fullName)) {
        testStats.set(fullName, {
          name:         t.name || fullName,
          passCount:    0,
          failCount:    0,
          brokenCount:  0,
          total:        0,
          lastStatus:   t.status,         // Primero encontrado = más reciente
          lastRunId:    run.id,
          lastSeenAt:   run.createdAt,
        })
      }
      const stats = testStats.get(fullName)
      stats.total++
      if      (t.status === 'passed') stats.passCount++
      else if (t.status === 'failed') stats.failCount++
      else if (t.status === 'broken') stats.brokenCount++
    }
  }

  // Calcular flaky score y filtrar
  const flakyTests = []
  for (const [fullName, stats] of testStats.entries()) {
    if (stats.total < MIN_RUNS_TO_FLAG) continue

    const failures = stats.failCount + stats.brokenCount
    const successes = stats.passCount
    const minOf = Math.min(failures, successes)
    const score = stats.total > 0 ? minOf / stats.total : 0

    if (score >= FLAKY_THRESHOLD) {
      flakyTests.push({
        projectId,
        testFullName: fullName,
        testName:     stats.name,
        runsAnalyzed: stats.total,
        passCount:    stats.passCount,
        failCount:    stats.failCount,
        brokenCount:  stats.brokenCount,
        flakyScore:   score.toFixed(2),
        lastStatus:   stats.lastStatus,
        lastRunId:    stats.lastRunId,
        lastSeenAt:   stats.lastSeenAt,
      })
    }
  }

  // Borrar los flaky tests viejos del project y reescribir
  // (más simple que upsert con uniqueness en pgcrypto)
  await db.delete(schema.allureFlakyTests)
    .where(eq(schema.allureFlakyTests.projectId, projectId))

  if (flakyTests.length > 0) {
    // Insertar en chunks
    for (let i = 0; i < flakyTests.length; i += 50) {
      await db.insert(schema.allureFlakyTests).values(flakyTests.slice(i, i + 50))
    }
  }

  return { analyzed: recentRuns.length, flaky: flakyTests.length }
}

/**
 * Compara el run actual con el anterior y devuelve los tests cuya
 * status cambió. Útil para destacar "lo nuevo" en el listado.
 *
 * @param {string} projectId
 * @param {string} currentRunId
 * @returns {{ newFailures, newPasses, stillFailing }}
 */
export async function compareWithPreviousRun(projectId, currentRunId) {
  const db = getDb()

  const runs = await db.select({
    id:            schema.allureRuns.id,
    testsSnapshot: schema.allureRuns.testsSnapshot,
  })
    .from(schema.allureRuns)
    .where(and(
      eq(schema.allureRuns.projectId, projectId),
      eq(schema.allureRuns.status, 'completed'),
    ))
    .orderBy(desc(schema.allureRuns.createdAt))
    .limit(2)

  if (runs.length < 2) {
    return { newFailures: [], newPasses: [], stillFailing: [] }
  }

  const current  = runs.find(r => r.id === currentRunId)?.testsSnapshot || runs[0].testsSnapshot || {}
  const previous = runs.find(r => r.id !== currentRunId)?.testsSnapshot || runs[1].testsSnapshot || {}

  const newFailures = []
  const newPasses   = []
  const stillFailing = []

  for (const [name, cur] of Object.entries(current)) {
    const prev = previous[name]
    const curFailed = cur.status === 'failed' || cur.status === 'broken'
    const prevFailed = prev?.status === 'failed' || prev?.status === 'broken'

    if (curFailed && !prevFailed) {
      newFailures.push({ name, status: cur.status, previousStatus: prev?.status || 'new' })
    } else if (!curFailed && prevFailed && cur.status === 'passed') {
      newPasses.push({ name, previousStatus: prev?.status })
    } else if (curFailed && prevFailed) {
      stillFailing.push({ name, status: cur.status })
    }
  }

  return { newFailures, newPasses, stillFailing }
}
