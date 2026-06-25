/**
 * Allure Service (orquestador)
 *
 * Coordina la generación de un Allure run completo:
 *   1. Crear el registro allure_runs en estado 'processing'
 *   2. Obtener los allure-results (de Suite Run, de upload, o de path local)
 *   3. Obtener el history del run anterior del project
 *   4. Llamar al builder para generar el reporte HTML
 *   5. Actualizar las estadísticas en allure_runs
 *   6. Actualizar el project con last_run_id, last_pass_rate, etc.
 *   7. Re-correr el análisis de flaky tests del project
 *   8. Limpiar work directories temporales
 *
 * Eventos Redis pub/sub:
 *   - status     { phase, message }
 *   - completed  { reportUrl, statistics }
 *   - error      { message }
 */

import { eq, sql }                          from 'drizzle-orm'
import { rm }                               from 'fs/promises'

import { getDb, schema }                    from '../db/client.js'
import { getRedis }                         from './redis-client.js'
import { buildAllureReport,
         buildTestsSnapshot,
         cleanupWorkDir }                   from './allure-report-builder.js'
import { getPreviousHistoryDir,
         analyzeFlakyTests }                from './allure-history-tracker.js'
import { buildAllureResultsFromSuiteRun }   from './allure-from-suite-run.js'

/**
 * Genera un Allure run completo. Esta función se llama en background
 * (no bloquea el HTTP request).
 *
 * @param {object} opts
 * @param {string} opts.runId            ID del allure_run ya creado en estado 'pending'
 * @param {string} opts.resultsDir       Path local a allure-results YA preparados
 *                                       (de upload o de conversión de suite_run)
 * @param {object} [opts.executor]       Metadata opcional del ejecutor
 * @param {boolean} [opts.cleanupAfter]  Borrar resultsDir al terminar (default true)
 */
export async function processAllureRun(opts) {
  const { runId, resultsDir, executor, cleanupAfter = true } = opts
  const db = getDb()
  const startedAt = Date.now()

  // Marcar como processing
  await db.update(schema.allureRuns).set({
    status:    'processing',
    startedAt: new Date(),
  }).where(eq(schema.allureRuns.id, runId))

  await _publish(runId, 'status', { phase: 'starting', message: 'Iniciando generación...' })

  try {
    // ── 1. Cargar el run para conocer projectId ─────────────────────────
    const [run] = await db.select().from(schema.allureRuns)
      .where(eq(schema.allureRuns.id, runId)).limit(1)
    if (!run) throw new Error('Allure run no encontrado')

    const projectId = run.projectId

    // ── 2. Obtener history previo del project ───────────────────────────
    await _publish(runId, 'status', { phase: 'history', message: 'Cargando histórico previo...' })
    const previousHistoryDir = await getPreviousHistoryDir(projectId)

    // ── 3. Snapshot de tests ─────────────────────────────────────────────
    await _publish(runId, 'status', { phase: 'snapshot', message: 'Procesando tests...' })
    const testsSnapshot = await buildTestsSnapshot(resultsDir)

    // ── 4. Generar reporte ───────────────────────────────────────────────
    await _publish(runId, 'status', { phase: 'generating', message: 'Generando reporte HTML (Allure CLI)...' })
    const buildResult = await buildAllureReport({
      resultsDir,
      projectId,
      runId,
      previousHistoryDir,
      executor,
    })

    // ── 5. Actualizar el run con stats ───────────────────────────────────
    const stats = buildResult.statistics
    const passRate = stats.total > 0
      ? ((stats.passed / stats.total) * 100).toFixed(2)
      : '0.00'

    await db.update(schema.allureRuns).set({
      status:        'completed',
      totalTests:    stats.total,
      passed:        stats.passed,
      failed:        stats.failed,
      broken:        stats.broken,
      skipped:       stats.skipped,
      unknown:       stats.unknown,
      passRate,
      durationMs:    stats.durationMs || (Date.now() - startedAt),
      severityStats: stats.severityStats || {},
      reportUrl:     buildResult.reportUrl,
      resultsZipUrl: buildResult.resultsZipUrl,
      reportSizeKb:  buildResult.reportSizeKb,
      testsSnapshot,
      completedAt:   new Date(),
    }).where(eq(schema.allureRuns.id, runId))

    // ── 6. Actualizar el project ─────────────────────────────────────────
    await db.update(schema.allureProjects).set({
      lastRunId:     runId,
      lastRunAt:     new Date(),
      lastPassRate:  passRate,
      totalRuns:     sql`${schema.allureProjects.totalRuns} + 1`,
      updatedAt:     new Date(),
    }).where(eq(schema.allureProjects.id, projectId))

    // ── 7. Análisis de flaky tests del project ────────────────────────────
    await _publish(runId, 'status', { phase: 'flaky', message: 'Analizando tests flaky...' })
    await analyzeFlakyTests(projectId).catch(err => {
      console.warn(`[AllureService ${runId}] Flaky analysis failed:`, err.message)
    })

    // ── 8. Limpieza ──────────────────────────────────────────────────────
    if (cleanupAfter) {
      await cleanupWorkDir(resultsDir).catch(() => {})
    }

    await _publish(runId, 'completed', {
      reportUrl:    buildResult.reportUrl,
      statistics:   stats,
      passRate,
    })

    console.log(`[AllureService ${runId}] ✓ Pass rate ${passRate}%, ${stats.total} tests, ${Date.now() - startedAt}ms`)

  } catch (err) {
    console.error(`[AllureService ${runId}] Error:`, err)

    await db.update(schema.allureRuns).set({
      status:       'failed',
      errorMessage: err.message,
      durationMs:   Date.now() - startedAt,
      completedAt:  new Date(),
    }).where(eq(schema.allureRuns.id, runId))

    await _publish(runId, 'error', { message: err.message })
  }
}

/**
 * Wrapper: dispara la generación desde un Suite Run.
 */
export async function processSuiteRunAsAllure({ allureRunId, suiteRunId }) {
  let resultsDir = null
  try {
    resultsDir = await buildAllureResultsFromSuiteRun(suiteRunId)
    await processAllureRun({
      runId: allureRunId,
      resultsDir,
      executor: {
        name:       'Achilltest Suite Run',
        type:       'achilltest-suite',
        buildName:  `Suite Run ${suiteRunId.slice(0, 8)}`,
      },
      cleanupAfter: true,
    })
  } catch (err) {
    console.error(`[AllureService] processSuiteRunAsAllure failed:`, err)
    const db = getDb()
    await db.update(schema.allureRuns).set({
      status:       'failed',
      errorMessage: err.message,
      completedAt:  new Date(),
    }).where(eq(schema.allureRuns.id, allureRunId)).catch(() => {})
  }
}

// ── pub/sub ──────────────────────────────────────────────────────────────────

async function _publish(runId, type, data) {
  try {
    const redis = getRedis()
    await redis.publish(`allure:${runId}`, JSON.stringify({
      type, data, timestamp: Date.now(),
    }))
  } catch {}
}

export async function subscribeToAllureRun(runId, callback) {
  const Redis = (await import('ioredis')).default
  const subscriber = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  })
  const channel = `allure:${runId}`
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
