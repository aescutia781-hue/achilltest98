/**
 * Rate Limiter por usuario.
 *
 * Limita la cantidad de jobs que un usuario puede tener corriendo simultáneamente.
 * Útil para prevenir que un cliente Teammate haga una device farm de 100 jobs
 * y deje a los demás esperando.
 *
 * Implementación: contador en Redis (atomic incr/decr)
 * Cuando un job arranca:   incr user:{id}:running
 * Cuando un job termina:   decr user:{id}:running
 *
 * Si user:{id}:running >= max → el worker espera y reencola con delay
 */

import { getRedis } from './redis-client.js'

// Cap por plan (jobs corriendo simultáneamente)
const CONCURRENCY_LIMITS = {
  trial:    2,     // Trial: muy limitado para que no abuse
  starter:  8,     // Starter: razonable para 1 usuario
  teammate: 30,    // Teammate: puede correr device farms grandes
  advance:  60,
  pro:      120,
  enterprise: 500,
}

function getLimit(plan) {
  return CONCURRENCY_LIMITS[plan] || CONCURRENCY_LIMITS.trial
}

/**
 * Intenta "reservar" un slot para un job.
 *
 * @returns {Promise<boolean>} true si se reservó, false si ya está en límite
 */
export async function tryAcquireSlot(userId, plan) {
  const redis = getRedis()
  const key   = `user:${userId}:running`
  const limit = getLimit(plan)

  // INCR atómico, después verificamos
  const current = await redis.incr(key)

  // Si excede el límite, hacer rollback
  if (current > limit) {
    await redis.decr(key)
    return false
  }

  // TTL de seguridad (10 min). Si el job se cuelga, el contador se resetea solo
  await redis.expire(key, 600)
  return true
}

/**
 * Libera el slot cuando termina el job.
 */
export async function releaseSlot(userId) {
  const redis = getRedis()
  const key   = `user:${userId}:running`
  const value = await redis.decr(key)
  // Si se fue a negativo (race condition), reset a 0
  if (value < 0) await redis.set(key, 0)
}

/**
 * Cuenta jobs activos de un usuario (para mostrar en UI).
 */
export async function getActiveJobs(userId) {
  const redis = getRedis()
  const value = await redis.get(`user:${userId}:running`)
  return parseInt(value || '0', 10)
}

/**
 * Devuelve el límite para mostrarlo en UI.
 */
export function getConcurrencyLimit(plan) {
  return getLimit(plan)
}
