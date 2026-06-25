/**
 * Rutas de métricas/observabilidad.
 *
 *   GET /api/metrics/user        Métricas del usuario actual (uso de su cuota)
 *   GET /api/metrics/system      Métricas del sistema (admin/debug)
 *
 * El endpoint de sistema NO requiere auth pero solo retorna datos agregados,
 * útil para healthchecks de monitoring tipo Uptime Kuma / Grafana.
 */

import { eq, and, gte, sql }          from 'drizzle-orm'

import { getDb, schema }              from '../db/client.js'
import { authenticate }               from '../middleware/auth.js'
import { getQueue }                   from '../queues/executions-queue.js'
import { getActiveJobs, getConcurrencyLimit } from '../services/rate-limiter.js'
import { getPlanLimits }              from '../config/plans.js'

export async function metricsRoutes(app) {

  // ── GET /api/metrics/user ────────────────────────────────────────────────
  // Uso del cliente vs su cuota
  app.get('/user', { preHandler: [authenticate] }, async (req, reply) => {
    const db = getDb()
    const limits = getPlanLimits(req.user.plan)

    const startOfMonth = new Date()
    startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0)

    // Conteos del mes actual
    const [{ executionsThisMonth }] = await db
      .select({ executionsThisMonth: sql`count(*)::int` })
      .from(schema.executions)
      .where(and(
        eq(schema.executions.userId, req.user.userId),
        gte(schema.executions.createdAt, startOfMonth),
      ))

    const [{ suiteRunsThisMonth }] = await db
      .select({ suiteRunsThisMonth: sql`count(*)::int` })
      .from(schema.suiteRuns)
      .where(and(
        eq(schema.suiteRuns.userId, req.user.userId),
        gte(schema.suiteRuns.createdAt, startOfMonth),
      ))

    const [{ deviceFarmRunsThisMonth }] = await db
      .select({ deviceFarmRunsThisMonth: sql`count(*)::int` })
      .from(schema.suiteRuns)
      .where(and(
        eq(schema.suiteRuns.userId, req.user.userId),
        gte(schema.suiteRuns.createdAt, startOfMonth),
        sql`device_farm_id IS NOT NULL`,
      ))

    // Jobs corriendo ahora
    const activeJobs = await getActiveJobs(req.user.userId)

    return reply.send({
      success: true,
      data: {
        plan:    req.user.plan,
        usage: {
          executions: {
            used:  executionsThisMonth,
            limit: limits.e2ePerMonth || 0,
            pct:   limits.e2ePerMonth ? Math.round(executionsThisMonth / limits.e2ePerMonth * 100) : 0,
          },
          suiteRuns: {
            used:  suiteRunsThisMonth,
            limit: limits.suiteRunsPerMonth || 0,
            pct:   limits.suiteRunsPerMonth ? Math.round(suiteRunsThisMonth / limits.suiteRunsPerMonth * 100) : 0,
          },
          deviceFarmRuns: {
            used:  deviceFarmRunsThisMonth,
            limit: limits.deviceFarmRunsPerMonth || 0,
            pct:   limits.deviceFarmRunsPerMonth ? Math.round(deviceFarmRunsThisMonth / limits.deviceFarmRunsPerMonth * 100) : 0,
          },
        },
        concurrency: {
          activeJobs,
          limit: getConcurrencyLimit(req.user.plan),
        },
      },
    })
  })

  // ── GET /api/metrics/system ──────────────────────────────────────────────
  // Métricas globales del sistema (para monitoring)
  app.get('/system', async (req, reply) => {
    const db = getDb()
    const q = getQueue()

    try {
      // Estado de la cola
      const [
        waiting,
        active,
        completed,
        failed,
        delayed,
      ] = await Promise.all([
        q.getWaitingCount(),
        q.getActiveCount(),
        q.getCompletedCount(),
        q.getFailedCount(),
        q.getDelayedCount(),
      ])

      // Stats agregados de DB
      const [users]      = await db.select({ count: sql`count(*)::int` }).from(schema.users)
      const [activePlans] = await db.select({
        starter:  sql`count(*) filter (where plan='starter')::int`,
        teammate: sql`count(*) filter (where plan='teammate')::int`,
        trial:    sql`count(*) filter (where plan='trial')::int`,
      }).from(schema.users)

      const last24h = new Date(Date.now() - 86400000)
      const [execs24h] = await db
        .select({ count: sql`count(*)::int` })
        .from(schema.executions)
        .where(gte(schema.executions.createdAt, last24h))

      const [suiteRuns24h] = await db
        .select({ count: sql`count(*)::int` })
        .from(schema.suiteRuns)
        .where(gte(schema.suiteRuns.createdAt, last24h))

      return reply.send({
        success: true,
        data: {
          timestamp: new Date().toISOString(),
          uptime:    process.uptime(),
          queue: {
            waiting, active, completed, failed, delayed,
            total: waiting + active + delayed,
          },
          users: {
            total:    users.count,
            starter:  activePlans.starter,
            teammate: activePlans.teammate,
            trial:    activePlans.trial,
          },
          last24h: {
            executions: execs24h.count,
            suiteRuns:  suiteRuns24h.count,
          },
        },
      })
    } catch (err) {
      return reply.code(500).send({ success: false, error: err.message })
    }
  })
}
