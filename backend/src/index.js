import 'dotenv/config'
import Fastify       from 'fastify'
import cors          from '@fastify/cors'
import rateLimit     from '@fastify/rate-limit'
import staticPlugin  from '@fastify/static'

import { authRoutes }            from './routes/auth.js'
import { mpRoutes }              from './routes/mercadopago.js'
import { executionRoutes }       from './routes/executions.js'
import { deviceRoutes }          from './routes/devices.js'
import { suiteRoutes }           from './routes/suites.js'
import { deviceFarmRoutes }      from './routes/device-farms.js'
import { metricsRoutes }         from './routes/metrics.js'
import { apiTestingRoutes }      from './routes/api-testing.js'
import { wcagRoutes }            from './routes/wcag.js'
import { allureRoutes }          from './routes/allure.js'
import { githubRoutes }          from './routes/github.js'
import { organizationsRoutes }   from './routes/organizations.js'
import { jiraRoutes }            from './routes/jira.js'
import { repairRoutes }          from './routes/repair.js'
import { initMercadoPagoPlans }  from './services/mercadopago.js'
import { startCleanupScheduler } from './services/cleanup-service.js'

const PORT = parseInt(process.env.PORT || '3001')
const HOST = process.env.HOST || '0.0.0.0'

const app = Fastify({
  logger: { level: process.env.NODE_ENV === 'production' ? 'warn' : 'info' },
  bodyLimit: 10 * 1024 * 1024,    // 10 MB para contratos grandes
})

async function start() {
  await app.register(cors, {
    origin:      process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  })

  await app.register(rateLimit, {
    max:        100,
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({
      success: false,
      error:   'Demasiadas peticiones. Espera un momento.',
    }),
  })

  // Screenshots estáticos
  await app.register(staticPlugin, {
    root:   process.env.SCREENSHOT_DIR || '/tmp/achilltest-screenshots',
    prefix: '/screenshots/',
    decorateReply: false,
  })

  // Reportes generados (Playwright + Allure)
  await app.register(staticPlugin, {
    root:   process.env.REPORTS_DIR || '/tmp/achilltest-reports',
    prefix: '/reports/',
    decorateReply: false,
  })

  await app.register(authRoutes,        { prefix: '/api/auth' })
  await app.register(mpRoutes,          { prefix: '/api/mp' })
  await app.register(executionRoutes,   { prefix: '/api/executions' })
  await app.register(deviceRoutes,      { prefix: '/api/devices' })
  await app.register(suiteRoutes,       { prefix: '/api/suites' })
  await app.register(deviceFarmRoutes,  { prefix: '/api/device-farms' })
  await app.register(metricsRoutes,     { prefix: '/api/metrics' })
  await app.register(apiTestingRoutes,  { prefix: '/api/api-testing' })
  await app.register(wcagRoutes,        { prefix: '/api/wcag' })
  await app.register(allureRoutes,        { prefix: '/api/allure' })
  await app.register(githubRoutes,        { prefix: '/api/github' })
  await app.register(organizationsRoutes, { prefix: '/api/organizations' })
  await app.register(jiraRoutes,          { prefix: '/api/jira' })
  await app.register(repairRoutes,        { prefix: '/api/repair' })

  app.get('/health', async () => ({
    status:    'ok',
    timestamp: new Date().toISOString(),
    uptime:    process.uptime(),
  }))

  app.get('/', async () => ({ name: 'Achilltest API', version: '1.0.0' }))

  if (process.env.MP_ACCESS_TOKEN) {
    try { await initMercadoPagoPlans() }
    catch (err) { app.log.warn({ err: err.message }, '[MP] init failed') }
  }

  // Arrancar el scheduler de limpieza de reportes/screenshots viejos
  startCleanupScheduler()

  await app.listen({ port: PORT, host: HOST })

  console.log(`
🚀 Achilltest Backend
   URL: http://${HOST}:${PORT}
   Env: ${process.env.NODE_ENV || 'development'}
   MP:  ${process.env.MP_ACCESS_TOKEN ? '✓' : '✗'}
   AI:  ${process.env.ANTHROPIC_API_KEY ? '✓' : '✗'}
`)
}

start().catch(err => { console.error(err); process.exit(1) })
