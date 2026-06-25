# 🎯 SPRINT 5: Enterprise Features

> Pegar esto en un chat NUEVO, **SOLO cuando tengas un cliente enterprise pidiéndolo**.
> Si lo construyes antes, es over-engineering.

## Objetivo

Features que NO mueven la aguja para los primeros 10-50 clientes pero son
must-have para vender a equipos de >20 personas o regulados.

**Tiempo estimado:** 3-5 días (depende del scope que pidan)

## Decisión: ¿lo necesitas ahora?

```
SÍ construye Sprint 5 si:
  ✓ Un lead te dice "necesito BYOK / 2FA / audit log para firmar"
  ✓ Tienes 3+ leads enterprise en pipeline ($5K+ USD/mes cada uno)
  ✓ Una empresa regulada (banco, salud, gov) te pide compliance

NO construyas Sprint 5 si:
  ✗ Estás imaginando lo que necesitarían (sin lead real)
  ✗ Tienes <10 clientes pagando
  ✗ Es "para tenerlo listo cuando venga"
```

## Alcance modular (elegir qué construir según el lead)

### Módulo 5A: BYOK (Bring Your Own Key) — Anthropic

- [ ] User enterprise pega su propia API key de Anthropic
- [ ] Tabla `org_byok_credentials` (org_id, provider, encrypted_key)
- [ ] AES-256-GCM con crypto-vault.js
- [ ] Repair Agent usa la key del org si existe, else la default de Achilltest
- [ ] Sin límites de cuota cuando BYOK está activo
- [ ] Settings UI en `/organizations/:id` → tab "AI Credentials"
- [ ] Test de la key antes de guardar (call /messages con 10 tokens)

### Módulo 5B: 2FA / TOTP

- [ ] Usar `speakeasy` o `otpauth` para TOTP
- [ ] Tabla `user_2fa` (user_id, secret_encrypted, backup_codes[], enabled_at)
- [ ] Flow: settings → enable 2FA → QR code → enter código → enabled
- [ ] Login flow: si user tiene 2FA, pedir código tras password
- [ ] Backup codes (10 códigos de un solo uso)
- [ ] Recovery: si pierde phone, usar backup code

### Módulo 5C: Audit log

- [ ] Tabla `audit_log` (org_id, user_id, action, resource_type, resource_id, ip, ua, metadata, created_at)
- [ ] Service `audit-log-service.js` con `logAction()`
- [ ] Acciones a registrar: login, member added/removed, role changed, plan changed, integration connected/disconnected, suite deleted, ownership transferred
- [ ] Página `/organizations/:id/audit-log` con filtros
- [ ] Export a CSV
- [ ] Retención 1 año (configurable por enterprise)

### Módulo 5D: Webhooks bidireccionales Jira

- [ ] Endpoint `/api/webhooks/jira` para recibir events
- [ ] Verificación HMAC del webhook secret
- [ ] Events soportados:
  - `jira:issue_updated` → si fue creado desde Achilltest, marcar spec como linked-bug-status
  - `jira:issue_closed` → notificar al user que creó el bug
- [ ] UI: en cada `jira_issue` mostrar el status actual sincronizado

### Módulo 5E: API pública con keys

- [ ] Tabla `api_keys` (org_id, key_prefix, key_hash, scopes[], created_by, last_used_at, expires_at)
- [ ] Settings UI para crear/rotar/revocar keys
- [ ] Middleware `apiKeyAuth` que valida Bearer ak_xxx
- [ ] Endpoints públicos versionados: `/api/v1/public/...`
  - `POST /api/v1/public/runs` (crear run)
  - `GET /api/v1/public/runs/:id`
  - `GET /api/v1/public/suites`
- [ ] Rate limiting por key (no por user)
- [ ] Documentación OpenAPI 3 en `/api/v1/public/docs`

### Módulo 5F: SSO (SAML / OIDC) — solo Enterprise tier

- [ ] Tabla `org_sso_config` (org_id, provider, metadata_xml, sso_url, certificate)
- [ ] Endpoint `/api/auth/sso/init?org_slug=xxx`
- [ ] Flow SAML 2.0 con `samlify` lib
- [ ] Auto-provisioning de users en login SSO
- [ ] JIT (just-in-time) provisioning con role mapping
- [ ] **Reserve esto para tier Enterprise con cuota >$5K USD/mes**

### Módulo 5G: Admin dashboard interno

- [ ] Página `/admin` (requiere ser super-admin, nuevo rol)
- [ ] Tabla `super_admins` (user_id)
- [ ] Stats globales: usuarios totales, MRR, churn, top users
- [ ] Gestión: ver cualquier org, suspender, refund manual
- [ ] Logs de Sentry inline (no abrir Sentry para todo)
- [ ] Métricas de uso del Repair Agent (% éxito, tokens, costos)

### Módulo 5H: Status page público

- [ ] Página `/status` pública (no requiere auth)
- [ ] Auto-check de servicios cada 30s: backend, workers, redis, postgres
- [ ] Histórico de últimos 30 días
- [ ] Incidents manuales (crear incidente, postmortem)
- [ ] RSS feed de incidentes

### Módulo 5I: Compliance docs

- [ ] DPA (Data Processing Agreement) template
- [ ] SOC 2 readiness checklist (no certificación, pero docs)
- [ ] GDPR specific docs (DPO contact, sub-processors list)
- [ ] Data residency options (DB en EU vs LATAM)

## Estimaciones por módulo

```
5A BYOK              ~6 horas    🟢 PRIORITY ALTA si lead pide costos
5B 2FA               ~8 horas    🟡 PRIORITY MEDIA, requerido por enterprise
5C Audit log         ~12 horas   🟡 PRIORITY MEDIA, requerido compliance
5D Webhooks Jira     ~8 horas    🟢 PRIORITY ALTA si lead usa Jira mucho
5E API pública       ~16 horas   🟡 PRIORITY MEDIA, devs lo pedirán
5F SSO               ~24 horas   🔴 SOLO con cliente >$5K USD/mes
5G Admin dashboard   ~12 horas   🟢 Interno, te ayuda a ti
5H Status page       ~6 horas    🟢 Pública, mejora confianza
5I Compliance docs   ~8 horas    🟡 Necesario para industries reguladas
```

## Cómo priorizar

Cuando llegues a este sprint, **NO construyas todo**. Pregunta al lead:

```
"¿Qué es lo MÍNIMO que necesitas para firmar el contrato?"
```

Y construye SOLO eso. El resto espera al siguiente lead que lo pida.
