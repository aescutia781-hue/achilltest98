import Redis from 'ioredis'

let redis = null

export function getRedis() {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: null,    // Necesario para BullMQ
      enableReadyCheck:     false,
    })
    redis.on('error', err => console.error('[Redis] Error:', err.message))
  }
  return redis
}

export async function closeRedis() {
  if (redis) {
    await redis.quit()
    redis = null
  }
}
