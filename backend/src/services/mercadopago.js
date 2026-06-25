/**
 * Servicio de Mercado Pago para Achilltest.
 *
 * Flujo:
 *   1. Al iniciar el servidor → crear planes en MP si no existen
 *   2. Usuario elige plan → crear suscripción → redirigir a init_point de MP
 *   3. MP notifica via webhook → actualizar plan en DB
 *   4. Usuario cancela → cancelar suscripción en MP
 *
 * Planes:
 *   starter   → $78.99 USD/mes  → $1,380 MXN
 *   teammate  → $128.99 USD/mes → $2,252 MXN
 */

import { MercadoPagoConfig, PreApprovalPlan, PreApproval } from 'mercadopago'

let mp = null
let planApi = null
let subscriptionApi = null

function getApi() {
  if (!mp) {
    if (!process.env.MP_ACCESS_TOKEN) {
      throw new Error('MP_ACCESS_TOKEN no configurado')
    }
    mp = new MercadoPagoConfig({
      accessToken: process.env.MP_ACCESS_TOKEN,
      options:     { timeout: 10000 },
    })
    planApi         = new PreApprovalPlan(mp)
    subscriptionApi = new PreApproval(mp)
  }
  return { planApi, subscriptionApi }
}

const MP_PLAN_IDS = {
  starter:  process.env.MP_PLAN_STARTER_ID,
  teammate: process.env.MP_PLAN_TEAMMATE_ID,
}

// ── Inicialización ───────────────────────────────────────────────────────────

export async function initMercadoPagoPlans() {
  if (!process.env.MP_ACCESS_TOKEN) {
    console.warn('[MP] MP_ACCESS_TOKEN no configurado — saltando')
    return {}
  }

  const { planApi } = getApi()
  const currency = process.env.MP_CURRENCY || 'MXN'
  const prices = {
    starter:  parseFloat(process.env.MP_PRICE_STARTER  || '1380'),
    teammate: parseFloat(process.env.MP_PRICE_TEAMMATE || '2252'),
  }
  const results = {}

  for (const [planKey, price] of Object.entries(prices)) {
    const existingId = MP_PLAN_IDS[planKey]

    if (existingId) {
      console.log(`[MP] Plan ${planKey} configurado: ${existingId}`)
      results[planKey] = existingId
      continue
    }

    try {
      const plan = await planApi.create({
        body: {
          reason: `Achilltest ${planKey.charAt(0).toUpperCase() + planKey.slice(1)}`,
          auto_recurring: {
            frequency:          1,
            frequency_type:     'months',
            transaction_amount: price,
            currency_id:        currency,
            free_trial: {
              frequency:      5,
              frequency_type: 'days',
            },
          },
          payment_methods_allowed: {
            payment_types: [{ id: 'credit_card' }, { id: 'debit_card' }],
          },
          back_url: `${process.env.FRONTEND_URL}/pricing?status=success`,
        },
      })

      results[planKey] = plan.id
      console.log(`[MP] ✓ Plan ${planKey} creado: ${plan.id}`)
      console.log(`[MP] ⚠ Agrega a .env: MP_PLAN_${planKey.toUpperCase()}_ID=${plan.id}`)
    } catch (err) {
      console.error(`[MP] Error creando ${planKey}:`, err.message)
    }
  }

  return results
}

// ── Crear suscripción ────────────────────────────────────────────────────────

export async function createSubscription({ planId, userId, userEmail }) {
  const mpPlanId = MP_PLAN_IDS[planId]
  if (!mpPlanId) {
    throw new Error(`Plan ${planId} no configurado en Mercado Pago`)
  }

  const { subscriptionApi } = getApi()

  const subscription = await subscriptionApi.create({
    body: {
      preapproval_plan_id: mpPlanId,
      reason:              `Achilltest ${planId}`,
      payer_email:         userEmail,
      external_reference:  `${userId}|${planId}`,
      back_url:            `${process.env.FRONTEND_URL}/dashboard?payment=success`,
      status:              'pending',
    },
  })

  return {
    initPoint:      subscription.init_point,
    subscriptionId: subscription.id,
  }
}

export async function cancelSubscription(subscriptionId) {
  const { subscriptionApi } = getApi()
  await subscriptionApi.update({ id: subscriptionId, body: { status: 'cancelled' } })
}

export async function pauseSubscription(subscriptionId) {
  const { subscriptionApi } = getApi()
  await subscriptionApi.update({ id: subscriptionId, body: { status: 'paused' } })
}

export async function reactivateSubscription(subscriptionId) {
  const { subscriptionApi } = getApi()
  await subscriptionApi.update({ id: subscriptionId, body: { status: 'authorized' } })
}

export async function getSubscription(subscriptionId) {
  const { subscriptionApi } = getApi()
  return subscriptionApi.get({ id: subscriptionId })
}

export async function processWebhookNotification(notification) {
  const { type, data } = notification

  if (type === 'subscription_preapproval' || type === 'preapproval') {
    const { subscriptionApi } = getApi()
    const subscription = await subscriptionApi.get({ id: data.id })
    const [userId, planId] = (subscription.external_reference || '').split('|')

    return {
      event:          'subscription',
      subscriptionId: subscription.id,
      status:         subscription.status,
      userId,
      planId,
      nextPaymentDate:subscription.next_payment_date,
    }
  }

  if (type === 'payment') {
    return { event: 'payment', paymentId: data.id, status: data.status }
  }

  return { event: type, data }
}
