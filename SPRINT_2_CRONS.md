# 🎯 SPRINT 2: Operaciones automatizadas (Crons)

> Pegar esto en un chat NUEVO, junto con el ZIP de Achilltest y el HANDOFF_TEMPLATE.md

## Objetivo

Sin esto los pagos se caen silenciosamente. Un user paga, MP falla un cargo
recurrente, el user no se entera, se va. Conversión perdida.

**Tiempo estimado:** 1.5 días (~10-12 horas)

## Alcance

- [ ] **Cron orquestador (node-cron o bull-mq schedulers)**
  - Service `backend/src/services/cron-scheduler.js`
  - Jobs ejecutados desde el worker, NO desde el backend principal
  - Lock distribuido en Redis (evitar doble ejecución con N workers)
  - Logging estructurado de cada job

- [ ] **Job: Trial expiring soon (T-2 días)**
  - Corre diariamente a las 9am
  - Busca users con `trial_ends_at` entre 1 y 2 días
  - Envía email "Tu trial termina en X días"
  - Template en email-service.js: trialEndingEmail()
  - Marca con flag en DB para no re-enviar (trial_reminder_sent)

- [ ] **Job: Trial expired**
  - Corre cada hora
  - Busca users con `trial_ends_at < NOW()` y `is_trial_expired = false`
  - Marca `is_trial_expired = true`
  - Si están en plan 'trial', mueve a 'expired' (nuevo estado)
  - Email: trialExpiredEmail() con CTA a /pricing

- [ ] **Job: Payment failed handler**
  - Webhook listener en /api/mercadopago/webhooks
  - Si MP reporta payment failed, marca org.mp_subscription_status='past_due'
  - Email passmentFailedEmail() al owner de la org
  - 3 reintentos en 7 días, luego suspende cuenta
  - UI banner cuando past_due

- [ ] **Job: Scheduled suite runs (cron tests)**
  - Nueva tabla `scheduled_runs` (suite_id, cron_expr, next_run_at, is_active)
  - Cron evaluador corre cada minuto, busca next_run_at < NOW()
  - Encola el run en BullMQ
  - UI en `/suites/:id` para configurar cron (5 presets + custom)
  - Resultados se notifican al owner por email si fallan

- [ ] **Job: Cleanup tokens expirados**
  - Diario, llama a cleanupExpiredTokens() de email-tokens-service.js
  - Borra tokens >30 días

## No incluye (intencional)

- ❌ Distributed cron entre múltiples regions (single region es suficiente)
- ❌ UI para gestionar crons globalmente (admin dashboard es otro sprint)
- ❌ Notificaciones push (móvil)
- ❌ SMS notifications
- ❌ Retry policies sofisticados (3 intentos básicos por ahora)

## Archivos esperados

```
NUEVOS:
- backend/src/services/cron-scheduler.js
- backend/src/services/crons/trial-reminder.js
- backend/src/services/crons/trial-expired.js
- backend/src/services/crons/payment-failed.js
- backend/src/services/crons/scheduled-runs.js
- backend/src/services/crons/cleanup.js
- backend/src/db/migrations/0011_scheduled_runs.sql
- frontend/src/components/ScheduleRunModal.tsx
- frontend/src/components/PastDueBanner.tsx

MODIFICADOS:
- backend/src/worker.js                       (init cron scheduler)
- backend/src/services/email-service.js       (3 templates nuevos)
- backend/src/services/mercadopago.js         (webhook handler payment failed)
- backend/src/routes/mercadopago.js           (webhook endpoint)
- backend/src/db/schema.js                    (scheduledRuns table)
- frontend/src/app/suites/[id]/page.tsx       (botón "Programar runs")
- frontend/src/app/layout.tsx                 (PastDueBanner global)
- .env.example                                (CRON_ENABLED, MP_WEBHOOK_SECRET)
```

## Templates de email nuevos

```javascript
// email-service.js
trialEndingEmail({ name, daysLeft, ctaUrl })   // "Tu trial termina en 2 días"
trialExpiredEmail({ name, ctaUrl })            // "Tu trial expiró — sube a Starter"
paymentFailedEmail({ name, amount, retryDate, ctaUrl })  // "Falló tu pago"
```

## Criterio de aceptación

```
✓ User registrado hace 3 días: NO recibe trial reminder
✓ User registrado hace 4 días: SÍ recibe trial reminder (T-1)
✓ User con trial_ends_at < NOW: pasa a is_trial_expired=true
✓ Forzar payment_failed via webhook: email enviado + banner UI visible
✓ Schedulear suite "diario 9am": se ejecuta a las 9am
✓ Worker cae y se reinicia: el cron NO se ejecuta 2 veces (Redis lock)
✓ Tokens email_tokens >30 días: borrados por cleanup
✓ docker compose up -d --scale worker=3: solo UN worker corre cada cron
```
