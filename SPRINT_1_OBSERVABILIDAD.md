# 🎯 SPRINT 1: Observabilidad

> Pegar esto en un chat NUEVO, junto con el ZIP de Achilltest y el HANDOFF_TEMPLATE.md

## Objetivo

Sin esto vives a ciegas en producción. Cuando algo crashee, ningún user te
avisa y lo descubres días después.

**Tiempo estimado:** 1 día (~6-8 horas de trabajo)

## Alcance

- [ ] **Sentry integration** (backend + frontend)
  - SDK de Sentry instalado y configurado
  - Captura automática de errores Fastify
  - Captura de errores no controlados en frontend (window.onerror)
  - Variables de entorno: SENTRY_DSN_BACKEND, SENTRY_DSN_FRONTEND
  - Sample rate configurable (default 1.0 dev, 0.1 prod)
  - Modo DEV: si no hay SENTRY_DSN, loggea a consola en lugar de fallar

- [ ] **Logger estructurado con pino**
  - Reemplazar console.log/error en backend con logger.info/error
  - Logs JSON estructurados (request_id, userId, orgId)
  - Pretty print en development, JSON en producción
  - Integración con Fastify (logger nativo)
  - Niveles: debug, info, warn, error
  - Sample rate de logs configurable

- [ ] **React ErrorBoundary**
  - Componente ErrorBoundary global en frontend
  - Wraps el children del layout.tsx
  - UI de fallback: "Algo salió mal" + botón "Recargar" + botón "Reportar a soporte"
  - Reporta automáticamente a Sentry
  - En desarrollo muestra el stack trace, en producción no

- [ ] **Error pages personalizadas**
  - /404 con diseño Achilltest
  - /500 (error.tsx en Next.js App Router)

- [ ] **Request ID en cada request**
  - Middleware Fastify que asigna UUID a cada req
  - Header X-Request-Id en response
  - Incluido en TODOS los logs de ese request
  - Frontend lo muestra en mensajes de error ("ID: abc-123 — comparte esto con soporte")

## No incluye (intencional)

- ❌ Datadog / New Relic / otros APMs (Sentry es suficiente para empezar)
- ❌ Distributed tracing con OpenTelemetry (overkill por ahora)
- ❌ Alertas custom (Sentry tiene sus propias notifs out-of-box)
- ❌ Log aggregation externa (Sentry + queries en DB son suficientes)
- ❌ Dashboards de Grafana (futuro cuando haya tráfico real)

## Archivos esperados

```
NUEVOS:
- backend/src/lib/logger.js              (pino wrapper)
- backend/src/lib/sentry.js              (init y helpers)
- backend/src/middleware/request-id.js   (middleware Fastify)
- frontend/src/components/ErrorBoundary.tsx
- frontend/src/lib/sentry.ts             (init frontend)
- frontend/src/app/error.tsx             (Next.js error boundary)
- frontend/src/app/not-found.tsx         (Next.js 404)

MODIFICADOS:
- backend/src/index.js                   (init Sentry + logger + request-id)
- backend/src/worker.js                  (init Sentry)
- frontend/src/app/layout.tsx            (wrap con ErrorBoundary)
- .env.example                           (SENTRY_DSN_*)
- backend/package.json                   (deps: @sentry/node, pino)
- frontend/package.json                  (deps: @sentry/nextjs)
- README.md                              (sección Observabilidad)
```

## Variables de entorno nuevas

```env
SENTRY_DSN_BACKEND=https://xxx@xxx.ingest.sentry.io/xxx
SENTRY_DSN_FRONTEND=https://xxx@xxx.ingest.sentry.io/xxx
SENTRY_ENVIRONMENT=production
SENTRY_SAMPLE_RATE=0.1
LOG_LEVEL=info
```

## Criterio de aceptación

```
✓ Lanzar una excepción en backend → aparece en Sentry
✓ Crashear un componente frontend → ErrorBoundary muestra UI + reporta a Sentry
✓ Cada log tiene request_id, userId (si auth), orgId (si auth)
✓ pino-pretty en dev, JSON en prod
✓ /api/notexiste → 404 personalizado + log estructurado
✓ Llamar /api/auth/login con body inválido → 400 + log con request_id
✓ Si no hay SENTRY_DSN, NO falla (modo DEV)
✓ Backend compila: node --check todos los .js
✓ Frontend compila: npm run build sin errores
```
