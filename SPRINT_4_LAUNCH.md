# 🎯 SPRINT 4: Pre-Launch Validation

> Pegar esto en un chat NUEVO, junto con el ZIP de Achilltest y el HANDOFF_TEMPLATE.md

## Objetivo

Probar end-to-end el sistema completo como un user nuevo, fix de bugs
encontrados, deploy a producción y monitoreo activo del primer día.

**Tiempo estimado:** 1.5 días (~10-12 horas)

## Alcance

- [ ] **End-to-end testing manual del happy path**
  - Crear cuenta nueva desde landing
  - Recibir welcome email + verificar email
  - Onboarding completo + workspace
  - Grabar primer test con recording
  - Ejecutar test, ver screenshots
  - Crear suite, agregar test, ejecutar suite run
  - Ver Allure report del suite run
  - Reparar un spec con Repair Agent (forzar fallo primero)
  - Subir a plan Starter via Mercado Pago (sandbox)
  - Crear org, invitar miembro por link
  - Conectar GitHub, hacer push de un repo
  - Conectar Jira, sync projects, crear bug
  - Cambiar contraseña, logout, forgot password, reset password
  - **Documentar TODOS los bugs encontrados** en BUGS_FOUND.md

- [ ] **Mobile responsive QA**
  - Probar TODAS las páginas públicas en mobile (iPhone 13 size)
  - Probar dashboard y workspace en tablet
  - Fix de overflow, scroll horizontal, botones tap-area <44px
  - Verificar formularios (forgot password, login, register)

- [ ] **Performance basics**
  - Lighthouse score >80 en landing y pricing
  - Imágenes optimizadas (next/image donde aplique)
  - Bundle size analysis: rebajar si >2MB initial
  - Verificar lazy load de Monaco editor

- [ ] **Security checklist**
  - Headers de seguridad (helmet en Fastify)
    - X-Content-Type-Options: nosniff
    - Strict-Transport-Security
    - X-Frame-Options: DENY (excepto iframe del workspace)
    - Content-Security-Policy básica
  - Rate limiting verificado en login, register, forgot-password
  - Verificar que tokens en URL NO se loguean (en logger + Sentry)
  - SQL injection: verificar que TODO usa Drizzle params (no string concat)
  - XSS: verificar que el ADF de Jira no se renderice como HTML raw
  - Secrets rotation policy documentada

- [ ] **Deploy a producción**
  - Verificar docker-compose.yml en Hetzner CCX33
  - DNS apuntando a achilltest.io
  - Certificado SSL (Let's Encrypt via Caddy/Nginx)
  - Backups automáticos de PostgreSQL configurados
  - Variables de entorno de prod configuradas (TODAS):
    - DATABASE_URL
    - REDIS_URL
    - JWT_SECRET (¡random nuevo!)
    - ANTHROPIC_API_KEY
    - RESEND_API_KEY
    - SENTRY_DSN_BACKEND + FRONTEND
    - MP_ACCESS_TOKEN
    - GITHUB_CLIENT_ID/SECRET
    - JIRA_CLIENT_ID/SECRET
    - FRONTEND_URL=https://achilltest.io
  - Verificar que Resend dominio esté verificado
  - Verificar webhook endpoints funcionando

- [ ] **Smoke tests en producción**
  - Crear cuenta real en achilltest.io
  - Verificar email llega de noreply@achilltest.io
  - Ejecutar primer test
  - Verificar logs aparecen en Sentry
  - Verificar metrics en /api/metrics/system

- [ ] **Documentación de soporte**
  - README pulido (ya existe, solo verificar consistencia)
  - FAQ inicial (10 preguntas más probables)
  - Email de soporte: support@achilltest.io configurado
  - Status page o método para reportar incidentes

## No incluye (intencional)

- ❌ Load testing con K6/Artillery (cuando haya tráfico real)
- ❌ Tests automatizados E2E (deuda técnica conocida — manual por ahora)
- ❌ Disaster recovery completo (backups + restore probado es suficiente)
- ❌ Beta program formal (cada user inicial es valioso, no proceso)

## Archivos esperados

```
NUEVOS:
- BUGS_FOUND.md                              (registro de bugs del QA manual)
- DEPLOY.md                                  (runbook de deploy)
- FAQ.md                                     (10 preguntas frecuentes)
- backend/src/lib/security-headers.js        (helmet wrapper)

MODIFICADOS:
- backend/src/index.js                       (helmet + headers)
- backend/package.json                       (deps: @fastify/helmet, @fastify/rate-limit)
- README.md                                  (sección DEPLOY pulida)
- docker-compose.yml                         (verificar todos los services)
```

## Criterio de aceptación

```
✓ User nuevo desde 0: crea cuenta, ejecuta test, paga, todo OK
✓ Email llega de noreply@achilltest.io (NO de "@onresend.com")
✓ Páginas públicas tienen Lighthouse >80
✓ No hay overflow horizontal en mobile (iPhone 13)
✓ Headers de seguridad presentes en cada response (verificar con curl -I)
✓ Sentry recibe 0 errores en una sesión limpia
✓ Logs estructurados visibles en /var/log o Sentry
✓ Backup de PostgreSQL automático funciona (probar restore)
✓ SSL grade A en SSLLabs
✓ BUGS_FOUND.md tiene <5 bugs críticos (fixearlos)
```
