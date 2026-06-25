import { eq }              from 'drizzle-orm'
import { getDb, schema }    from '../db/client.js'
import { authenticate }     from '../middleware/auth.js'
import {
  createSubscription,
  cancelSubscription,
  pauseSubscription,
  reactivateSubscription,
  getSubscription,
  processWebhookNotification,
} from '../services/mercadopago.js'

export async function mpRoutes(app) {

  // POST /api/mp/subscribe
  app.post('/subscribe', { preHandler: [authenticate] }, async (req, reply) => {
    const { planId } = req.body || {}

    if (!planId || !['starter', 'teammate'].includes(planId)) {
      return reply.code(400).send({
        success: false,
        error:   'planId inválido. Debe ser: starter | teammate',
      })
    }

    const db = getDb()
    const [user] = await db.select().from(schema.users)
      .where(eq(schema.users.id, req.user.userId)).limit(1)

    if (!user) return reply.code(404).send({ success: false, error: 'Usuario no encontrado' })

    if (user.plan === planId && user.mpSubscriptionStatus === 'authorized') {
      return reply.code(400).send({
        success: false,
        error:   `Ya tienes el plan ${planId} activo`,
      })
    }

    try {
      const { initPoint, subscriptionId } = await createSubscription({
        planId,
        userId:    user.id,
        userEmail: user.email,
      })

      await db.update(schema.users).set({
        mpSubscriptionId:     subscriptionId,
        mpSubscriptionStatus: 'pending',
        mpPlanId:             planId,
        updatedAt:            new Date(),
      }).where(eq(schema.users.id, user.id))

      return reply.send({
        success: true,
        data:    { initPoint, subscriptionId, planId },
      })
    } catch (err) {
      req.log.error({ err }, 'Error creando suscripción MP')
      return reply.code(500).send({
        success: false,
        error:   `Error con Mercado Pago: ${err.message}`,
      })
    }
  })

  // POST /api/mp/webhook — viene de MP, sin auth
  app.post('/webhook', async (req, reply) => {
    try {
      const result = await processWebhookNotification(req.body)
      req.log.info({ result }, '[MP Webhook]')

      if (result.event === 'subscription' && result.userId) {
        const db = getDb()
        const newPlan = _mapStatusToPlan(result.status, result.planId)

        const updates = {
          plan:                 newPlan,
          mpSubscriptionId:     result.subscriptionId,
          mpSubscriptionStatus: result.status,
          updatedAt:            new Date(),
        }

        if (result.status === 'authorized') {
          updates.trialEndsAt    = null
          updates.isTrialExpired = false
          updates.paidSince      = new Date()
        }
        if (result.status === 'cancelled') {
          updates.plan      = 'trial'
          updates.paidSince = null
        }

        await db.update(schema.users).set(updates)
          .where(eq(schema.users.id, result.userId))
      }

      return reply.send({ received: true })
    } catch (err) {
      req.log.error({ err }, '[MP Webhook] Error')
      return reply.send({ received: true, error: err.message })
    }
  })

  // GET /api/mp/subscription
  app.get('/subscription', { preHandler: [authenticate] }, async (req, reply) => {
    const db = getDb()
    const [user] = await db.select().from(schema.users)
      .where(eq(schema.users.id, req.user.userId)).limit(1)

    if (!user?.mpSubscriptionId) {
      return reply.send({
        success: true,
        data:    { status: 'none', plan: user?.plan || 'trial' },
      })
    }

    try {
      const sub = await getSubscription(user.mpSubscriptionId)
      return reply.send({
        success: true,
        data: {
          subscriptionId:  sub.id,
          status:          sub.status,
          plan:            user.plan,
          nextPaymentDate: sub.next_payment_date,
          amount:          sub.auto_recurring?.transaction_amount,
          currency:        sub.auto_recurring?.currency_id,
        },
      })
    } catch {
      return reply.send({
        success: true,
        data:    { status: user.mpSubscriptionStatus || 'unknown', plan: user.plan },
      })
    }
  })

  // DELETE /api/mp/subscription
  app.delete('/subscription', { preHandler: [authenticate] }, async (req, reply) => {
    const db = getDb()
    const [user] = await db.select().from(schema.users)
      .where(eq(schema.users.id, req.user.userId)).limit(1)

    if (!user?.mpSubscriptionId) {
      return reply.code(400).send({ success: false, error: 'No tienes una suscripción activa' })
    }

    try {
      await cancelSubscription(user.mpSubscriptionId)
      await db.update(schema.users).set({
        plan:                 'trial',
        mpSubscriptionStatus: 'cancelled',
        paidSince:            null,
        updatedAt:            new Date(),
      }).where(eq(schema.users.id, user.id))

      return reply.send({ success: true, data: { message: 'Suscripción cancelada' } })
    } catch (err) {
      return reply.code(500).send({ success: false, error: err.message })
    }
  })

  // POST /api/mp/subscription/pause
  app.post('/subscription/pause', { preHandler: [authenticate] }, async (req, reply) => {
    const db = getDb()
    const [user] = await db.select().from(schema.users)
      .where(eq(schema.users.id, req.user.userId)).limit(1)

    if (!user?.mpSubscriptionId) {
      return reply.code(400).send({ success: false, error: 'No tienes suscripción activa' })
    }

    try {
      await pauseSubscription(user.mpSubscriptionId)
      await db.update(schema.users).set({
        mpSubscriptionStatus: 'paused',
        updatedAt:            new Date(),
      }).where(eq(schema.users.id, user.id))
      return reply.send({ success: true, data: { message: 'Suscripción pausada' } })
    } catch (err) {
      return reply.code(500).send({ success: false, error: err.message })
    }
  })

  // POST /api/mp/subscription/reactivate
  app.post('/subscription/reactivate', { preHandler: [authenticate] }, async (req, reply) => {
    const db = getDb()
    const [user] = await db.select().from(schema.users)
      .where(eq(schema.users.id, req.user.userId)).limit(1)

    if (!user?.mpSubscriptionId) {
      return reply.code(400).send({ success: false, error: 'No hay suscripción para reactivar' })
    }

    try {
      await reactivateSubscription(user.mpSubscriptionId)
      await db.update(schema.users).set({
        mpSubscriptionStatus: 'authorized',
        updatedAt:            new Date(),
      }).where(eq(schema.users.id, user.id))
      return reply.send({ success: true, data: { message: 'Suscripción reactivada' } })
    } catch (err) {
      return reply.code(500).send({ success: false, error: err.message })
    }
  })
}

function _mapStatusToPlan(mpStatus, planId) {
  if (mpStatus === 'authorized') return planId
  if (mpStatus === 'paused')     return planId
  if (mpStatus === 'cancelled')  return 'trial'
  return 'trial'
}
