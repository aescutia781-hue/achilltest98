/**
 * Cola de ejecuciones de Achilltest.
 *
 * Estrategia:
 *   - Una sola cola "executions" donde se encolan los jobs
 *   - Prioridad por plan: teammate (1) > starter (5) > trial (10)
 *     (En BullMQ, menor = mayor prioridad)
 *   - Workers separados que consumen la cola
 *   - Eventos publicados via Redis pub/sub para que el API emita SSE
 */

import { Queue, QueueEvents } from 'bullmq'
import { getRedis }            from '../services/redis-client.js'

const QUEUE_NAME = 'executions'

const PRIORITY_BY_PLAN = {
  teammate: 1,
  starter:  5,
  trial:    10,
}

let queue       = null
let queueEvents = null

export function getQueue() {
  if (!queue) {
    queue = new Queue(QUEUE_NAME, { connection: getRedis() })
  }
  return queue
}

export function getQueueEvents() {
  if (!queueEvents) {
    queueEvents = new QueueEvents(QUEUE_NAME, { connection: getRedis() })
  }
  return queueEvents
}

/**
 * Encola una ejecución para que un worker la tome.
 *
 * @param {object} job
 * @param {string} job.executionId
 * @param {string} job.userId
 * @param {string} job.userPlan       trial | starter | teammate
 * @param {string} job.testName
 * @param {string} job.targetUrl
 * @param {string} job.instructions
 */
export async function enqueueExecution(job) {
  const q = getQueue()
  const priority = PRIORITY_BY_PLAN[job.userPlan] || 10

  await q.add('execute', job, {
    priority,
    jobId:    job.executionId,    // Idempotencia
    attempts: 20,                  // Reintentos suficientes para esperar a que liberen slots
    backoff:  { type: 'custom' },  // Usa la backoff strategy del worker
    removeOnComplete: { count: 1000, age: 86400 },
    removeOnFail:     { count: 1000, age: 86400 },
  })
}

/**
 * Cancela una ejecución encolada (si aún no empezó).
 */
export async function cancelExecution(executionId) {
  const q = getQueue()
  const job = await q.getJob(executionId)
  if (!job) return { cancelled: false, reason: 'Job no encontrado' }

  const state = await job.getState()
  if (state === 'waiting' || state === 'delayed') {
    await job.remove()
    return { cancelled: true }
  }
  return { cancelled: false, reason: `Job está en estado ${state}` }
}

/**
 * Obtiene el estado actual de una ejecución.
 */
export async function getExecutionStatus(executionId) {
  const q = getQueue()
  const job = await q.getJob(executionId)
  if (!job) return null
  return {
    state:    await job.getState(),
    progress: job.progress,
    returnvalue: job.returnvalue,
    failedReason: job.failedReason,
  }
}

// ── Pub/Sub para eventos en vivo ──────────────────────────────────────────────

/**
 * Publica un evento de una ejecución específica.
 * El API REST escucha estos eventos y los reenvía al frontend via SSE.
 */
export async function publishExecutionEvent(executionId, event) {
  const redis = getRedis()
  await redis.publish(`execution:${executionId}`, JSON.stringify(event))
}

/**
 * Suscribe un callback a los eventos de una ejecución.
 * Devuelve una función para cancelar la suscripción.
 */
export async function subscribeToExecution(executionId, callback) {
  // Crear un Redis cliente nuevo (no podemos usar el global porque pub/sub bloquea)
  const Redis = (await import('ioredis')).default
  const subscriber = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  })

  const channel = `execution:${executionId}`
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
