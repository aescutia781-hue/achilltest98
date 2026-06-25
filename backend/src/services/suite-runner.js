/**
 * Suite Runner — Orquesta la ejecución de una suite completa.
 *
 * Sin device farm (Starter):
 *   N specs × 1 device = N jobs encolados
 *
 * Con device farm (Teammate):
 *   N specs × M devices = N×M jobs encolados (paralelos)
 *
 * Para cada job:
 *   1. Toma el spec_code del execution original
 *   2. Crea una NUEVA execution con ese código + el device de la farm
 *   3. Encola en BullMQ con prioridad por plan
 *   4. Cuando termina → actualiza suite_run_results
 *   5. Cuando todos terminan → marca suite_run como completed
 *
 * Eventos emitidos via Redis pub/sub al canal `suite_run:{id}`:
 *   - status         { status, message }
 *   - result_update  { suiteSpecId, deviceId, status, ... }
 *   - progress       { completed, total, passed, failed }
 *   - completed      { summary, reports }
 */

import { eq, and, gte, sql }       from 'drizzle-orm'
import { v4 as uuid }               from 'uuid'

import { getDb, schema }            from '../db/client.js'
import { enqueueExecution, publishExecutionEvent } from '../queues/executions-queue.js'
import { getRedis }                 from './redis-client.js'
import { getPlanLimits }            from '../config/plans.js'

/**
 * Inicia una ejecución de suite.
 *
 * @param {object} opts
 * @param {string} opts.suiteId
 * @param {string} opts.userId
 * @param {string} opts.userPlan
 * @param {string|null} opts.deviceFarmId   Si null → 1 device (Desktop Chrome)
 *
 * @returns {{ suiteRunId, totalJobs }}
 */
export async function startSuiteRun({ suiteId, userId, userPlan, deviceFarmId = null }) {
  const db = getDb()

  // ── 0. Verificar cuotas mensuales ───────────────────────────────────────
  const limits = getPlanLimits(userPlan)
  const startOfMonth = new Date()
  startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0)

  // Contar suite runs del mes
  const [{ totalRuns }] = await db
    .select({ totalRuns: sql`count(*)::int` })
    .from(schema.suiteRuns)
    .where(and(
      eq(schema.suiteRuns.userId, userId),
      gte(schema.suiteRuns.createdAt, startOfMonth),
    ))

  if (totalRuns >= (limits.suiteRunsPerMonth || 0)) {
    throw new Error(
      `Has alcanzado el límite de ${limits.suiteRunsPerMonth} suite runs/mes para tu plan ${userPlan}. ` +
      `Actualiza o espera al próximo mes.`,
    )
  }

  // Si usa Device Farm, contar device farm runs del mes
  if (deviceFarmId) {
    const [{ totalFarmRuns }] = await db
      .select({ totalFarmRuns: sql`count(*)::int` })
      .from(schema.suiteRuns)
      .where(and(
        eq(schema.suiteRuns.userId, userId),
        gte(schema.suiteRuns.createdAt, startOfMonth),
        sql`device_farm_id IS NOT NULL`,
      ))

    if (totalFarmRuns >= (limits.deviceFarmRunsPerMonth || 0)) {
      throw new Error(
        `Has alcanzado el límite de ${limits.deviceFarmRunsPerMonth} device farm runs/mes. ` +
        `Puedes ejecutar suites sin device farm o actualizar tu plan.`,
      )
    }
  }

  // ── 1. Cargar la suite y sus specs ──────────────────────────────────────
  const [suite] = await db.select().from(schema.testSuites)
    .where(eq(schema.testSuites.id, suiteId)).limit(1)

  if (!suite) throw new Error('Suite no encontrada')

  const suiteSpecs = await db.select()
    .from(schema.testSuiteSpecs)
    .where(eq(schema.testSuiteSpecs.suiteId, suiteId))

  if (suiteSpecs.length === 0) {
    throw new Error('La suite no tiene specs asignados')
  }

  // Cargar el spec_code de cada execution original
  const specsWithCode = []
  for (const ss of suiteSpecs) {
    const [exec] = await db.select().from(schema.executions)
      .where(eq(schema.executions.id, ss.executionId)).limit(1)

    if (!exec || !exec.specCode) {
      console.warn(`[SuiteRun] Spec ${ss.executionId} no tiene código generado, saltando`)
      continue
    }

    specsWithCode.push({
      suiteSpecId:  ss.id,
      executionId:  exec.id,
      testName:     exec.testName,
      targetUrl:    exec.targetUrl,
      instructions: exec.instructions,
      specCode:     exec.specCode,
    })
  }

  if (specsWithCode.length === 0) {
    throw new Error('Ningún spec de la suite tiene código generado todavía')
  }

  // ── 2. Cargar device farm (si aplica) ────────────────────────────────────
  let devices = [{ deviceId: 'desktop-chrome', name: 'Desktop Chrome' }]

  if (deviceFarmId) {
    if (userPlan !== 'teammate' && userPlan !== 'advance' && userPlan !== 'pro' && userPlan !== 'enterprise') {
      throw new Error('Device Farm requiere plan Teammate o superior')
    }

    const [farm] = await db.select().from(schema.deviceFarms)
      .where(eq(schema.deviceFarms.id, deviceFarmId)).limit(1)

    if (!farm) throw new Error('Device Farm no encontrada')

    devices = farm.devices  // [{deviceId, name, frameStyle, viewport, ...}]
    if (devices.length === 0) throw new Error('La Device Farm no tiene dispositivos')
    if (devices.length > 10) throw new Error('Máximo 10 dispositivos por Device Farm')
  }

  // ── 3. Crear el suite_run ──────────────────────────────────────────────
  const totalSpecs   = specsWithCode.length
  const totalDevices = devices.length
  const totalJobs    = totalSpecs * totalDevices

  // Cap de jobs por suite run (Teammate=100, otros más bajos)
  const maxJobs = limits.maxJobsPerSuiteRun || 50
  if (totalJobs > maxJobs) {
    throw new Error(
      `Esta ejecución generaría ${totalJobs} jobs (${totalSpecs} specs × ${totalDevices} devices). ` +
      `El máximo por suite run en tu plan es ${maxJobs}. Reduce el número de specs o devices.`,
    )
  }

  const [suiteRun] = await db.insert(schema.suiteRuns).values({
    suiteId,
    userId,
    deviceFarmId,
    status:       'running',
    totalSpecs,
    totalDevices,
    totalJobs,
    startedAt:    new Date(),
  }).returning()

  console.log(`[SuiteRun ${suiteRun.id}] Iniciando: ${totalSpecs} specs × ${totalDevices} devices = ${totalJobs} jobs`)

  // ── 4. Para cada spec × device → crear execution y encolarla ────────────
  for (const spec of specsWithCode) {
    for (const device of devices) {

      // Crear una NUEVA execution para este run (con el spec original como código)
      const [newExec] = await db.insert(schema.executions).values({
        userId,
        testName:     `[Suite Run] ${spec.testName} on ${device.name || device.deviceId}`,
        targetUrl:    spec.targetUrl,
        instructions: `[Replay de suite] ${spec.instructions || ''}`,
        deviceId:     device.deviceId,
        status:       'pending',
        // Marcar que es de un suite run vía result
        result:       { fromSuiteRun: suiteRun.id, originalExecutionId: spec.executionId },
      }).returning()

      // Crear el resultado pendiente en suite_run_results
      await db.insert(schema.suiteRunResults).values({
        suiteRunId:  suiteRun.id,
        suiteSpecId: spec.suiteSpecId,
        executionId: newExec.id,
        deviceId:    device.deviceId,
        status:      'pending',
      })

      // Encolar el job en BullMQ con prioridad alta
      await enqueueExecution({
        executionId:    newExec.id,
        userId,
        userPlan,
        testName:       newExec.testName,
        targetUrl:      newExec.targetUrl,
        instructions:   newExec.instructions,
        deviceId:       device.deviceId,
        // Metadata para que el worker actualice el suite run cuando termine
        suiteRunMeta: {
          suiteRunId:    suiteRun.id,
          suiteSpecId:   spec.suiteSpecId,
        },
      })
    }
  }

  // Publicar evento inicial
  await publishSuiteEvent(suiteRun.id, 'status', {
    status:  'running',
    message: `${totalJobs} ejecuciones encoladas`,
  })

  return {
    suiteRunId: suiteRun.id,
    totalJobs,
    totalSpecs,
    totalDevices,
  }
}

/**
 * Actualiza el resultado de un suite_run_result cuando un job termina.
 * El worker llama esto al final de cada ejecución que es parte de un suite run.
 *
 * @param {object} opts
 * @param {string} opts.suiteRunId
 * @param {string} opts.suiteSpecId
 * @param {string} opts.executionId
 * @param {string} opts.deviceId
 * @param {boolean} opts.success
 * @param {string} [opts.errorMessage]
 * @param {string} [opts.screenshotUrl]
 * @param {number} [opts.durationMs]
 */
export async function updateSuiteRunResult({
  suiteRunId, suiteSpecId, executionId, deviceId,
  success, errorMessage, screenshotUrl, durationMs,
}) {
  const db = getDb()

  const status = success ? 'passed' : 'failed'

  // Actualizar el resultado individual
  await db.update(schema.suiteRunResults)
    .set({
      status,
      durationMs,
      errorMessage,
      screenshotUrl,
      completedAt: new Date(),
    })
    .where(and(
      eq(schema.suiteRunResults.suiteRunId, suiteRunId),
      eq(schema.suiteRunResults.executionId, executionId),
    ))

  // Recalcular agregados del suite_run
  const results = await db.select().from(schema.suiteRunResults)
    .where(eq(schema.suiteRunResults.suiteRunId, suiteRunId))

  const passed  = results.filter(r => r.status === 'passed').length
  const failed  = results.filter(r => r.status === 'failed').length
  const skipped = results.filter(r => r.status === 'skipped').length
  const pending = results.filter(r => r.status === 'pending').length

  const [suiteRun] = await db.select().from(schema.suiteRuns)
    .where(eq(schema.suiteRuns.id, suiteRunId)).limit(1)

  const allDone = pending === 0
  const updates = { passed, failed, skipped }

  if (allDone && suiteRun.status !== 'completed') {
    updates.status       = failed > 0 ? 'failed' : 'completed'
    updates.completedAt  = new Date()
    updates.durationMs   = Date.now() - new Date(suiteRun.startedAt).getTime()
  }

  await db.update(schema.suiteRuns).set(updates)
    .where(eq(schema.suiteRuns.id, suiteRunId))

  // Emitir eventos
  await publishSuiteEvent(suiteRunId, 'result_update', {
    suiteSpecId, deviceId, status, durationMs, errorMessage, screenshotUrl,
  })

  await publishSuiteEvent(suiteRunId, 'progress', {
    total:     results.length,
    completed: passed + failed + skipped,
    pending,
    passed,
    failed,
    skipped,
  })

  if (allDone) {
    await publishSuiteEvent(suiteRunId, 'completed', {
      status:    updates.status,
      passed, failed, skipped,
      durationMs: updates.durationMs,
    })

    // Generar reportes en background (no bloquear)
    setImmediate(() => _generateReports(suiteRunId).catch(err => {
      console.error('[SuiteRun] Error generando reportes:', err.message)
    }))
  }
}

// ── PUBLISH EVENTS ────────────────────────────────────────────────────────────

async function publishSuiteEvent(suiteRunId, type, data) {
  const redis = getRedis()
  await redis.publish(`suite_run:${suiteRunId}`, JSON.stringify({
    type, data, timestamp: Date.now(),
  }))
}

/**
 * Suscribe a los eventos de un suite_run específico.
 * Devuelve función de cleanup.
 */
export async function subscribeToSuiteRun(suiteRunId, callback) {
  const Redis = (await import('ioredis')).default
  const subscriber = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  })

  const channel = `suite_run:${suiteRunId}`
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

// ── REPORTES PLAYWRIGHT + ALLURE ─────────────────────────────────────────────

/**
 * Genera los reportes Playwright y Allure consolidados para un suite_run.
 * Se ejecuta async después de que termina el run.
 */
async function _generateReports(suiteRunId) {
  const db = getDb()
  const { generatePlaywrightReport, generateAllureReport } = await import('./report-generator.js')

  try {
    const playwrightUrl = await generatePlaywrightReport(suiteRunId)
    const { reportUrl: allureUrl, zipUrl: allureZip } = await generateAllureReport(suiteRunId)

    await db.update(schema.suiteRuns).set({
      playwrightReportUrl: playwrightUrl,
      allureReportUrl:     allureUrl,
      allureZipUrl:        allureZip,
      reportsGeneratedAt:  new Date(),
    }).where(eq(schema.suiteRuns.id, suiteRunId))

    await publishSuiteEvent(suiteRunId, 'reports_ready', {
      playwrightReportUrl: playwrightUrl,
      allureReportUrl:     allureUrl,
      allureZipUrl:        allureZip,
    })
  } catch (err) {
    console.error(`[Reports ${suiteRunId}] Error:`, err.message)
  }
}
