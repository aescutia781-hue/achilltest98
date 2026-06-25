# 🔄 Handoff Document — Achilltest

Este documento se pega como **primer mensaje** de cada chat nuevo, junto con el
ZIP del proyecto actual. Le da al nuevo Claude el contexto exacto que necesita.

---

## ⚡ TL;DR del proyecto

**Achilltest** — SaaS de QA Automation con IA, target LATAM (ES/EN/PT).

- **Identidad:** achilltest.io · color #3a515a · logo en ACHILL.zip
- **Misión:** "De QA Manual a QA Automation sin miedo"
- **Filosofía:** "La IA es el asistente. Playwright es el ejecutor. Tú eres el QA."
- **Meta de negocio:** 150 clientes Teammate ≈ $227K MXN/mes
- **Tipo de cambio referencia:** $17.46 MXN / USD

## 📊 Estado actual del proyecto

```
✅ 156 archivos de código
✅ 76 archivos JS backend (todos compilan)
✅ 19,045 líneas TypeScript/TSX
✅ 18,769 líneas JavaScript backend
✅ 10 migraciones SQL aplicadas
✅ 40 páginas Next.js
✅ 48 services
✅ 14 routes
✅ 2,256 líneas README
```

### Lo que YA está construido (95-100%)

```
✅ Auth completo (register, login, logout, change pwd, password reset, email verification)
✅ Multi-tenant: organizations, roles owner/manager/qa, invites por link, transfer ownership
✅ E2E Testing con Playwright (workspace, suites, device farms, queue, worker)
✅ API Testing (OpenAPI parser, Postman parser, OTP auth flows, crypto vault)
✅ Accessibility WCAG (axe-core, 6 dimensiones)
✅ Allure Reports (history, flaky detection, upload tokens)
✅ GitHub Integration (OAuth + push de repos + workflows)
✅ Jira + Zephyr Scale (OAuth + API token + sync + bug creation)
✅ Repair Agent con IA (escalonado Haiku→Sonnet, prompt caching, diff visual)
✅ Mercado Pago integration
✅ Email transaccional con Resend (welcome, verification, reset)
✅ Landing + pricing + onboarding + terms + privacy
```

### Lo que FALTA (priorizado)

```
🔴 Observabilidad: Sentry, logger pino, React ErrorBoundary
🟡 Crons: trial expired email, payment failed handler, scheduled runs
🟡 UX polish: Monaco editor, bell notifications, global search (cmd+K)
🟡 Email cron jobs: trial reminders en T-2 días
⚪ Enterprise: BYOK, 2FA, webhooks bidireccionales, audit log, API pública
```

---

## 🎯 EL SPRINT DE ESTE CHAT

> **REEMPLAZA ESTA SECCIÓN** con el sprint específico que vas a atacar.
> Solo describe UN sprint por chat para mantener el contexto enfocado.

### Sprint: [NOMBRE DEL SPRINT]

**Objetivo:** [qué problema resuelve este sprint]

**Alcance:**
- [ ] [tarea 1]
- [ ] [tarea 2]
- [ ] [tarea 3]

**No incluye (intencional):**
- [cosa que NO se hace en este sprint, dejar claro]

---

## 🧬 Stack técnico (no cambia entre sprints)

```
Backend:
- Node.js 22 + Fastify
- PostgreSQL + Drizzle ORM (schema en backend/src/db/schema.js)
- Redis (BullMQ para queue)
- Playwright para ejecución de tests
- Anthropic Claude API (claude-sonnet-4-6 + claude-haiku-4-5)
- Resend para emails
- Mercado Pago para pagos
- AES-256-GCM para cifrado de tokens (crypto-vault.js)
- JWT + bcrypt para auth

Frontend:
- Next.js 15 (App Router) + React + TypeScript
- Tailwind o inline styles (mezclado, depende del archivo)
- Sin librerías UI pesadas (todo custom)

Infra:
- Hetzner CCX33 (servidor con Docker Compose)
- docker-compose.yml en raíz
- Workers escalables (docker compose up -d --scale worker=N)
```

## 📐 Convenciones de código

```
- Archivos JS backend usan ESM (import/export, no require)
- Comentarios en español, código en inglés (variables, funciones)
- Validar sintaxis con: node --check archivo.js
- Migraciones SQL en backend/src/db/migrations/NNNN_nombre.sql
  Idempotentes (IF NOT EXISTS) por defecto
- Schema Drizzle DEBE actualizarse cuando hay nueva migración SQL
- Services en backend/src/services/
- Routes en backend/src/routes/, prefijo /api/X
- Pages frontend en frontend/src/app/<ruta>/page.tsx
- Components compartidos en frontend/src/components/
```

## 🎨 Diseño / UI (referencia)

```
Colores base:
- Fondo: #08080f (casi negro)
- Cards: #0e0e1a
- Texto principal: #f0f0fc
- Texto secundario: #c4c4d8
- Texto muted: #7070a0
- Borders: rgba(255,255,255,.07)
- Primary: #7c5cbf (morado)
- Accent: #c4a8ff (morado claro)
- Success: #22c55e
- Warning: #fbbf24
- Error: #f87171
- Teal: #26b5aa (Jira/Zephyr accent)

Tipografía:
- UI: Inter, system-ui, sans-serif
- Código: JetBrains Mono, monospace
```

## 🗂️ Estructura del proyecto

```
achilltest/
├── backend/
│   ├── src/
│   │   ├── db/
│   │   │   ├── schema.js (Drizzle, 942 líneas)
│   │   │   └── migrations/ (10 archivos SQL)
│   │   ├── services/ (48 archivos)
│   │   ├── routes/ (14 archivos)
│   │   ├── middleware/auth.js
│   │   ├── queues/executions-queue.js
│   │   ├── parsers/openapi-parser.js + postman-parser.js
│   │   ├── config/plans.js
│   │   ├── index.js (entry point Fastify)
│   │   └── worker.js (entry point worker BullMQ)
│   ├── Dockerfile
│   ├── Dockerfile.worker
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── app/ (40 páginas Next.js)
│   │   │   ├── landing/, dashboard/, workspace/, suites/, allure/
│   │   │   ├── github/, jira/, repair/, organizations/, join/
│   │   │   ├── pricing/, login/, register/, onboarding/
│   │   │   ├── verify-email/, forgot-password/, reset-password/
│   │   │   ├── terms/, privacy/
│   │   │   └── executions/, wcag/, device-farms/, api-testing/
│   │   ├── components/ (16 componentes)
│   │   ├── lib/api.ts
│   │   └── hooks/useAuth.ts
│   └── package.json
├── docker-compose.yml
├── .env.example
├── README.md (2,256 líneas)
└── HANDOFF_TEMPLATE.md (este archivo)
```

## 💰 Planes y pricing

```
Trial      $0 MXN/mes      5 días, 1 user, 10 specs, sin features avanzados
Starter    $1,380 MXN/mes  1 user, recording, repair (10/mes)
Teammate   $2,252 MXN/mes  5 miembros, Jira, GitHub, repair (50/mes)
Advance    $4,959 MXN/mes  15 miembros, repair (200/mes)
Pro        $8,540 MXN/mes  50 miembros, repair (500/mes)
Enterprise Custom           Ilimitado, BYOK, SLA
```

## 🚨 Reglas del Claude del nuevo chat

```
1. NUNCA reinventar lo que ya existe — siempre buscar primero con grep
2. Antes de crear un archivo, verificar con bash `ls` o `find`
3. Validar sintaxis con `node --check` o `tsc --noEmit` antes de declarar éxito
4. Comentar en español (alineado con el resto del código)
5. Usar AES-256-GCM (crypto-vault.js) para cualquier secreto que vaya a DB
6. Para nuevas migraciones: SIEMPRE actualizar schema.js de Drizzle también
7. Para nuevos endpoints: documentar arriba del archivo con lista
8. Si algo es ambiguo, preguntar antes de codear (no asumir)
9. Al terminar el sprint: documentar en README + smoke tests + ZIP final
10. NO sobre-construir: hacer lo que pide el sprint y stop
```

---

## 📋 Cómo iniciar este chat

1. Subir el ZIP actual de Achilltest
2. Pegar este documento entero como primer mensaje
3. Reemplazar la sección "EL SPRINT DE ESTE CHAT" con el sprint específico
4. Esperar que Claude verifique el estado y confirme que entendió antes de codear
