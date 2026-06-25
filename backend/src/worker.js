/**
 * Worker de Achilltest.
 *
 * Este proceso corre como un servicio Docker separado del API.
 * Consume la cola "executions" de BullMQ y ejecuta cada job:
 *   1. Levanta el runner híbrido (browser + IA)
 *   2. Emite eventos en vivo via Redis pub/sub
 *   3. Guarda el resultado en PostgreSQL
 *
 * Escalado: docker compose up -d --scale worker=20
 * Cada worker maneja WORKER_CONCURRENCY ejecuciones simultáneas (default 3).
 */

import 'dotenv/config'
import { Worker }                   from 'bullmq'
import { createServer }             from 'http'
import { eq }                       from 'drizzle-orm'

import { getRedis }                 from './services/redis-client.js'
import { runExecution }             from './services/hybrid-runner.js'
import { publishExecutionEvent }    from './queues/executions-queue.js'
import { updateSuiteRunResult }     from './services/suite-runner.js'
import { tryAcquireSlot, releaseSlot } from './services/rate-limiter.js'
import { getDb, schema }            from './db/client.js'

const QUEUE_NAME   = 'executions'
const CONCURRENCY  = parseInt(process.env.WORKER_CONCURRENCY || '3')
const WORKER_ID    = process.env.HOSTNAME || `worker-${Math.random().toString(36).slice(2, 8)}`

console.log(`[Worker ${WORKER_ID}] Iniciando con concurrencia=${CONCURRENCY}`)

// ── Worker BullMQ ─────────────────────────────────────────────────────────────

const worker = new Worker(
  QUEUE_NAME,
  async (job) => {
    const { executionId, testName, targetUrl, instructions, deviceId, userId, userPlan } = job.data
    console.log(`[Worker ${WORKER_ID}] Tomando job ${executionId}`)

    // ── Rate limit por usuario ────────────────────────────────────────────
    // Si el usuario ya tiene su cap de jobs corriendo, reencolar con delay
    const acquired = await tryAcquireSlot(userId, userPlan || 'trial')
    if (!acquired) {
      console.log(`[Worker ${WORKER_ID}] Rate limit hit para user ${userId}, reencolando job ${executionId}`)
      // Volver a encolar con delay de 5 segundos
      throw new Error('USER_RATE_LIMIT')   // BullMQ reintentará automáticamente
    }

    const db = getDb()

    try {
      // Marcar como running en DB
      await db.update(schema.executions).set({
        status:    'running',
        startedAt: new Date(),
      }).where(eq(schema.executions.id, executionId))

      // Callback que publica cada evento al canal pub/sub de esta ejecución
      const onEvent = async (event) => {
        await publishExecutionEvent(executionId, event)
        if (event.type === 'step' && typeof event.data?.stepNum === 'number') {
          await job.updateProgress({ step: event.data.stepNum, status: event.type })
        }
      }

      // Correr la ejecución
      const result = await runExecution({
        executionId, testName, targetUrl, instructions, deviceId,
      }, onEvent)

    // Guardar resultado en DB
    if (result.success) {
      await db.update(schema.executions).set({
        status:         'completed',
        specCode:       result.specCode,
        specFileName:   result.specFileName,
        result:         {
          stepsCount:   result.stepsExecuted.length,
          screenshots:  result.screenshots,
        },
        durationMs:     result.durationMs,
        completedAt:    new Date(),
      }).where(eq(schema.executions.id, executionId))
    } else {
      await db.update(schema.executions).set({
        status:        'failed',
        errorMessage:  result.error,
        result:        {
          stepsCount:  result.stepsExecuted?.length || 0,
          screenshots: result.screenshots || [],
        },
        durationMs:    result.durationMs,
        completedAt:   new Date(),
      }).where(eq(schema.executions.id, executionId))
    }

    // Si el job es parte de un suite run → notificar al runner
    if (job.data.suiteRunMeta) {
      const { suiteRunId, suiteSpecId } = job.data.suiteRunMeta
      try {
        await updateSuiteRunResult({
          suiteRunId,
          suiteSpecId,
          executionId,
          deviceId:      deviceId || 'desktop-chrome',
          success:       result.success,
          errorMessage:  result.error,
          screenshotUrl: result.screenshots?.[result.screenshots.length - 1] || null,
          durationMs:    result.durationMs,
        })
      } catch (err) {
        console.error(`[Worker] Error actualizando suite_run:`, err.message)
      }
    }

      return result
    } finally {
      // Siempre liberar el slot de rate limiting (haya éxito o error)
      await releaseSlot(userId).catch(() => {})
    }
  },
  {
    connection:  getRedis(),
    concurrency: CONCURRENCY,
    // Reintentar jobs que fallaron por rate limit con delay
    settings: {
      backoffStrategy: (attemptsMade, err) => {
        if (err?.message === 'USER_RATE_LIMIT') return 5000   // 5 seg
        return Math.min(1000 * Math.pow(2, attemptsMade), 30000)
      },
    },
  }
)

worker.on('completed', (job) => {
  console.log(`[Worker ${WORKER_ID}] ✓ Job ${job.id} completado`)
})

worker.on('failed', (job, err) => {
  console.error(`[Worker ${WORKER_ID}] ✗ Job ${job?.id} falló:`, err.message)
})

worker.on('error', (err) => {
  console.error(`[Worker ${WORKER_ID}] Error:`, err.message)
})

// ── Healthcheck HTTP ──────────────────────────────────────────────────────────
// Docker compose hace healthcheck en /health del puerto 3002

const healthServer = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      status:      'ok',
      workerId:    WORKER_ID,
      concurrency: CONCURRENCY,
      running:     worker.isRunning(),
    }))
  } else {
    res.writeHead(404).end()
  }
})

const HEALTH_PORT = parseInt(process.env.HEALTH_PORT || '3002')
healthServer.listen(HEALTH_PORT, () => {
  console.log(`[Worker ${WORKER_ID}] Healthcheck en :${HEALTH_PORT}/health`)
})

// ── Graceful shutdown ─────────────────────────────────────────────────────────

async function shutdown(signal) {
  console.log(`[Worker ${WORKER_ID}] Recibida señal ${signal}, cerrando...`)
  try { await worker.close() } catch {}
  try { healthServer.close() } catch {}
  process.exit(0)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT',  () => shutdown('SIGINT'))

console.log(`[Worker ${WORKER_ID}] Esperando jobs...`)
