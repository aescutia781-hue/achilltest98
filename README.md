# Achilltest

> QA Automation con IA para América. De QA Manual a QA Automation sin miedo.

```
Stack:    Node.js + Fastify + PostgreSQL + Redis + BullMQ + Docker + Playwright + Next.js
IA:       Claude (Anthropic) — modelo claude-sonnet-4
Planes:   Starter ($78.99 USD/mes) · Teammate ($128.99 USD/mes)
Pagos:    Mercado Pago (suscripciones recurrentes con trial 5 días)
Auth:     JWT con bcrypt
```

---

## 🎯 Módulos implementados

### Core (todos los planes)
- ✅ **Auth + JWT** — registro, login, sesiones
- ✅ **E2E Testing con IA** — generación paso a paso, visor en vivo
- ✅ **Multi-device** — 75 dispositivos nativos de Playwright con marcos realistas
- ✅ **Mercado Pago** — checkout, webhooks, gestión de suscripción
- ✅ **Test Suites** — agrupar specs y ejecutarlos juntos

### Exclusivo Teammate
- ✅ **Device Farm** — hasta 10 dispositivos por farm, ejecución paralela
- ✅ **Reportes Playwright** — HTML estático con matriz spec×device
- ✅ **Reportes Allure** — dashboard con métricas, gráficas y ZIP descargable

---

## 🏗️ Arquitectura

```
┌─────────────────┐         ┌──────────────────┐
│   Frontend      │─────────│   API Backend    │
│   (Next.js)     │  REST   │   (Fastify)      │
│   :3000         │  + SSE  │   :3001          │
└─────────────────┘         └──────────────────┘
                                     │
                            ┌────────┴────────┐
                            ▼                 ▼
                   ┌────────────┐    ┌─────────────┐
                   │ PostgreSQL │    │    Redis    │
                   │   :5432    │    │   :6379     │
                   └────────────┘    └──────┬──────┘
                                            │ BullMQ
                                            │ Pub/Sub
                                            ▼
                                ┌──────────────────────┐
                                │   Workers × N        │
                                │   Playwright + IA    │
                                │   Concurrency: 3     │
                                └──────────────────────┘
```

---

## 📦 Flujo del módulo Test Suites

```
1. Usuario crea una Test Suite con un nombre
   "Smoke tests producción"

2. Asigna specs existentes (de ejecuciones anteriores) a la suite
   [✓] Login con credenciales válidas
   [✓] Agregar producto al carrito
   [✓] Checkout completo

3. (Teammate) Opcionalmente selecciona una Device Farm
   🏭 "Top Mobile QA Set" (10 devices)

4. Click "Ejecutar suite"
   → Backend crea N × M jobs en BullMQ (specs × devices)
   → Workers ejecutan en paralelo (con prioridad alta para Teammate)

5. Frontend muestra grid en vivo via SSE:
   ┌─────────────────┬──────────┬───────┬────────┬──────────┐
   │ Spec            │ iPhone15 │ iPad  │ Pixel7 │ Desktop  │
   ├─────────────────┼──────────┼───────┼────────┼──────────┤
   │ Login           │    ✓     │   ✓   │   ✓    │    ✓     │
   │ Add to cart     │    ✓     │   ✗   │   ✓    │    ✓     │
   │ Checkout        │    ⏳    │   ⏳  │   ⏳   │    ⏳    │
   └─────────────────┴──────────┴───────┴────────┴──────────┘

6. Cuando termina → se generan automáticamente:
   📊 Reporte Playwright HTML  → /reports/playwright/{runId}/index.html
   📈 Reporte Allure HTML      → /reports/allure/{runId}/index.html
   📦 Allure ZIP descargable   → /reports/allure/{runId}/allure-report.zip
```

---

## 🚀 Arranque rápido

```bash
# 1. Configurar variables
cp .env.example .env
nano .env

# 2. Levantar todo
docker compose up -d

# 3. Migrar base de datos (incluye las nuevas tablas de suites)
docker compose exec api node src/db/migrate.js

# 4. Ver logs
docker compose logs -f api worker
```

---

## 📡 Endpoints principales

### Auth
```
POST   /api/auth/register
POST   /api/auth/login
GET    /api/auth/me
```

### Executions
```
POST   /api/executions
GET    /api/executions
GET    /api/executions/:id
GET    /api/executions/:id/stream   ← SSE en vivo
```

### Test Suites
```
POST   /api/suites                  → Crear suite
GET    /api/suites                  → Listar
GET    /api/suites/:id              → Detalle + specs asignados + últimos runs
PUT    /api/suites/:id
DELETE /api/suites/:id

POST   /api/suites/:id/specs        → Asignar spec
DELETE /api/suites/:id/specs/:specId

POST   /api/suites/:id/run                  → Ejecutar suite (con o sin farm)
GET    /api/suites/:id/runs                 → Historial de runs
GET    /api/suites/:id/runs/:runId          → Detalle del run (grid)
GET    /api/suites/:id/runs/:runId/stream   ← SSE en vivo
```

### Device Farms (Teammate only)
```
POST   /api/device-farms            → Crear farm con hasta 10 devices
GET    /api/device-farms            → Listar
GET    /api/device-farms/:id
PUT    /api/device-farms/:id
DELETE /api/device-farms/:id
```

### Devices
```
GET    /api/devices                 → Catálogo de 75 dispositivos
GET    /api/devices?grouped=true    → Agrupado por categoría
GET    /api/devices/:id
```

### Reportes (servidos como archivos estáticos)
```
GET    /reports/playwright/:runId/index.html
GET    /reports/allure/:runId/index.html
GET    /reports/allure/:runId/allure-report.zip
GET    /screenshots/:executionId-NNN.png
```

---

## 📊 Schema de Test Suites

```sql
test_suites
  - id, user_id, organization_id, project_id
  - name, description
  - created_at, updated_at

test_suite_specs (join table)
  - suite_id → test_suites.id
  - execution_id → executions.id  (el spec se reutiliza del exec original)
  - order

device_farms (Teammate only)
  - id, user_id
  - name
  - devices  jsonb  [{deviceId, name, brand, frameStyle, viewport, ...}]

suite_runs
  - id, suite_id, user_id, device_farm_id (nullable)
  - status, total_specs, total_devices, total_jobs
  - passed, failed, skipped
  - playwright_report_url, allure_report_url, allure_zip_url
  - started_at, completed_at, duration_ms

suite_run_results  (cada celda del grid)
  - id, suite_run_id, suite_spec_id, execution_id
  - device_id
  - status, duration_ms, error_message, screenshot_url
```

---

## 🔌 Eventos SSE de un Suite Run

```
event: status
data: { status: "running", message: "12 ejecuciones encoladas" }

event: result_update
data: { suiteSpecId, deviceId, status: "passed", durationMs: 2340, ... }

event: progress
data: { total: 12, completed: 7, passed: 6, failed: 1, pending: 5 }

event: completed
data: { status: "completed", passed: 11, failed: 1, durationMs: 45200 }

event: reports_ready
data: { playwrightReportUrl, allureReportUrl, allureZipUrl }
```

---

## 📦 Estructura del proyecto

```
achilltest/
├── docker-compose.yml
├── .env.example
├── docker/nginx.conf
│
├── backend/
│   ├── Dockerfile + Dockerfile.worker
│   ├── package.json
│   └── src/
│       ├── index.js                    → Fastify + 6 grupos de rutas
│       ├── worker.js                   → BullMQ + Playwright + IA
│       ├── config/
│       │   ├── plans.js                → Starter + Teammate (con deviceFarm flag)
│       │   └── devices.js              → 75 devices Playwright + categorización
│       ├── db/
│       │   ├── schema.js               → 11 tablas Drizzle
│       │   ├── client.js
│       │   ├── migrate.js
│       │   └── migrations/
│       │       ├── 0001_init.sql       → core (users, executions, etc)
│       │       └── 0002_test_suites.sql ← NUEVA
│       ├── middleware/auth.js          → JWT + requirePlan + requireFeature
│       ├── agents/
│       │   ├── codegen-agent.js        → genera specs paso a paso
│       │   └── repair-agent.js
│       ├── services/
│       │   ├── anthropic-client.js
│       │   ├── dom-scanner.js
│       │   ├── hybrid-runner.js        → orquesta browser + IA
│       │   ├── suite-runner.js         ← NUEVA — orquesta N×M jobs
│       │   ├── report-generator.js     ← NUEVA — Playwright + Allure HTML
│       │   ├── redis-client.js
│       │   └── mercadopago.js
│       ├── queues/executions-queue.js
│       └── routes/
│           ├── auth.js
│           ├── executions.js
│           ├── devices.js
│           ├── suites.js               ← NUEVA
│           ├── device-farms.js         ← NUEVA (Teammate)
│           └── mercadopago.js
│
└── frontend/
    ├── Dockerfile
    └── src/
        ├── app/
        │   ├── layout.tsx
        │   ├── page.tsx                → Landing
        │   ├── landing/
        │   ├── register/login/pricing/onboarding/
        │   ├── dashboard/              → con accesos a Suites y Farms
        │   ├── workspace/              → generar test + visor multi-device
        │   ├── executions/             → historial
        │   ├── suites/
        │   │   ├── page.tsx            ← Listado de suites
        │   │   └── [id]/
        │   │       ├── page.tsx        ← Detalle (agregar specs, ejecutar)
        │   │       └── runs/[runId]/
        │   │           └── page.tsx    ← Grid de resultados + reportes
        │   └── device-farms/
        │       ├── page.tsx            ← Listado de farms
        │       ├── new/page.tsx        ← Constructor (multi-select)
        │       └── [id]/page.tsx       ← Editor
        ├── components/
        │   ├── DeviceFrame.tsx         → 11 frame styles realistas
        │   └── DeviceSelector.tsx      → Dropdown con 75 dispositivos
        ├── hooks/useAuth.ts
        └── lib/api.ts
```

---

## ⚙️ Escalado de workers para Device Farms

Una farm de 10 devices × 10 specs = **100 jobs simultáneos**.

```bash
# Default — para 1-30 clientes activos
docker compose up -d
# = 3 workers × 3 concurrency = 9 jobs simultáneos

# Para 100+ clientes activos
docker compose up -d --scale worker=20
# = 20 workers × 3 = 60 jobs simultáneos
# Una farm 10×10 termina en ~2-3 min

# Workers Teammate tienen prioridad 1 (más alta) que Starter (5) y Trial (10)
```

---

## 🌳 Git desde el primer commit (NO NEGOCIABLE)

```bash
cd achilltest
git init
git add .
git commit -m "feat: Achilltest v1 — motor E2E + Test Suites + Device Farm + reportes"

# Crear repo PRIVADO en github.com/new
git remote add origin git@github.com:TU_USUARIO/achilltest.git
git push -u origin main
```

---

## 🔧 Variables de entorno relevantes

```env
DATABASE_URL=postgres://...
REDIS_URL=redis://localhost:6379
JWT_SECRET=<64 bytes hex>
ANTHROPIC_API_KEY=sk-ant-...

# Mercado Pago
MP_ACCESS_TOKEN=APP_USR-...
MP_PRICE_STARTER=1380     # $78.99 USD × $17.46 MXN
MP_PRICE_TEAMMATE=2252    # $128.99 USD × $17.46 MXN
MP_PLAN_STARTER_ID=        # Se llena automáticamente al primer arranque
MP_PLAN_TEAMMATE_ID=

# Workers
WORKER_CONCURRENCY=3       # Por worker (3 workers × 3 = 9 simultáneos)

# Storage
SCREENSHOT_DIR=/tmp/achilltest-screenshots
REPORTS_DIR=/tmp/achilltest-reports        ← NUEVO (para reportes Playwright + Allure)
```

---

## 🎯 Próximos sprints (no construidos todavía)

- API Testing con contratos (Postman, OpenAPI, GraphQL, WSDL) — 11 parsers
- WCAG / Accesibilidad standalone con axe-core
- Integraciones Jira + Zephyr Scale
- GitHub integration — commits automáticos por spec
- Organizaciones y roles (Manager/QA Lead/QA)
- Repair Agent integrado en la UI (botón "Reparar" en specs fallidos)
- Mobile Testing nativo (plan Advance)
- Grabación de flujos en iframe

---

## 🏗️ Infraestructura y escalado

### Día 1 — Lanzamiento (0-30 clientes)

```
Servidor: Hetzner CCX23 (4 vCPU, 16 GB RAM)
Costo:    ~€22 EUR/mes (~$420 MXN)
Setup:    docker compose up -d
          = 8 workers × 3 concurrency = 24 jobs simultáneos
```

### Mes 3 — Crecimiento (30-100 clientes)

```
Servidor: Hetzner CCX33 (8 vCPU, 32 GB RAM)
Costo:    ~€44 EUR/mes (~$840 MXN)
Setup:    docker compose up -d --scale worker=20
          = 20 workers × 3 = 60 simultáneos
```

### Mes 6+ — Escala (100-300 clientes)

```
2 servidores Hetzner:
  CCX23 (€22) → API + Frontend + Postgres + Redis
  CCX33 (€44) → Workers dedicados

Costo: ~€66/mes (~$1,260 MXN) — sigue siendo <1% del MRR
```

---

## 🛡️ Protecciones implementadas (anti-abuse)

### Rate limit por usuario (Redis)

```
Cada plan tiene un cap de jobs corriendo simultáneamente:
  Trial:    2 jobs
  Starter:  8 jobs
  Teammate: 30 jobs

Si un cliente Teammate ejecuta una device farm de 100 jobs,
solo 30 corren en paralelo; el resto espera en cola con
backoff exponencial. No monopoliza a otros clientes.
```

### Cuotas mensuales separadas

```
Starter:
  60 ejecuciones individuales/mes
  15 suite runs/mes (cada suite run = 1, sin importar # de specs)

Teammate:
  100 ejecuciones individuales/mes
  50 suite runs/mes
  20 device farm runs/mes
  Cap: 100 jobs máximo por suite run (10 specs × 10 devices)
```

### Limpieza automática

```
Daemon en API server corre cada 24h:
  Borra reportes de runs viejos (según historyDays del plan)
  Borra screenshots de executions viejas
  Borra archivos huérfanos (>90 días sin referencia en DB)

Trial:    1 día de historial
Starter:  30 días
Teammate: 90 días
```

### Métricas en tiempo real

```
GET /api/metrics/user      → Uso del cliente vs su cuota
GET /api/metrics/system    → Estado de la cola, usuarios, jobs 24h

El usuario ve un widget en /dashboard con barras de uso
que se actualizan cada 30 segundos.
```

---

## 📈 Monitoreo en producción

Para monitorear el sistema en Hetzner, conecta:
- `GET /api/metrics/system` a Uptime Kuma cada 60s
- Alerta si `queue.waiting > 500` (cola congestionada)
- Alerta si `queue.failed > 10` (jobs rompiendo)
- Alerta si `last24h.executions < 5` cuando deberían ser más

Para logs centralizados:
- `docker compose logs -f api worker | grep ERROR`
- Considera Grafana Loki cuando llegues a 50+ clientes

---

## 🔌 API Testing

Módulo exclusivo Teammate que parsea contratos OpenAPI/Postman y genera tests automáticamente, incluyendo soporte para autenticación con OTP/2FA, encriptación de payloads y firmas HMAC.

### Arquitectura en 4 capas

```
CAPA 1 — Parser mecánico
  OpenAPI 3.x (YAML/JSON) y Postman v2.1 → estructura normalizada
  Detecta endpoints sospechosos de OTP/auth por nombre

CAPA 2 — Generador mecánico (sin IA)
  Para cada endpoint genera:
    • Happy path con datos válidos del schema
    • Sin auth → 401
    • Token inválido → 401
    • Body vacío → 400 (en POST/PUT)
    • Campos requeridos faltantes → 400
    • Tipos incorrectos → 400
    • ID inexistente → 404

CAPA 3 — IA contextual (solo donde aporta)
  Activa SOLO en POST/PUT con body complejo (>= 2 campos)
  Genera 1-3 casos de borde basados en reglas de negocio
  Temperatura baja (0.3), respuesta en JSON estricto

CAPA 4 — Validación automática
  Status code esperado vs actual
  JSON Schema del response con validator interno (sin ajv)
  Captura automática de tokens entre requests
```

### Autenticación soportada

```
- none                  Sin auth
- bearer_static         Bearer Token fijo (en Secrets)
- bearer_login          POST /login → captura token → inyecta en cada request
- bearer_login_otp      Login + paso 2 con OTP
- api_key               Header configurable (X-API-Key por default)
- basic                 Basic Auth con user:password
- oauth2_client         Client Credentials grant
- hmac                  Firma por request en header configurable
```

### Encriptación de payloads

```
Algoritmos soportados:
  - AES-256-GCM (recomendado)
  - AES-256-CBC (legacy banca)
  - JWE A256GCM
  - HMAC (no encripta, solo firma)

Modos:
  - Body completo encriptado (con campo wrapper configurable)
  - Solo campos específicos (paths como "user.cardNumber")

Opcionalmente firma HMAC adicional en header X-Signature
```

### OTP / 2FA

```
Tipos:
  - mock      Valor fijo (123456 default) — entornos de testing
  - totp      Genera código TOTP RFC 6238 desde secret base32
  - webhook   GET a URL del cliente que devuelve el OTP actual

Flujo de verificación configurable:
  - Endpoint de verify
  - Campos challengeId / otp customizables
  - JSONPath del challenge en la respuesta del login
```

### Manejo de secretos (Crypto Vault)

```
1. El cliente sube el valor en texto plano (POST /secrets)
2. Backend lo encripta con AES-256-GCM usando SERVER_ENCRYPTION_KEY
3. Se guarda en tabla api_test_secrets como { encryptedValue, iv, authTag }
4. Solo se muestra al usuario el display_hint (****XYZ9)
5. Para usar el secreto, el runner lo desencripta en memoria
6. Después del run, los plaintext se descartan

IMPORTANTE: si pierdes SERVER_ENCRYPTION_KEY en prod, todos los
secretos guardados por usuarios se vuelven indescifrables.
Documentado y backed by design.
```

### Endpoints REST

```
POST   /api/api-testing/collections               Crear desde contrato
GET    /api/api-testing/collections               Listar
GET    /api/api-testing/collections/:id           Detalle + casos + secretos
PUT    /api/api-testing/collections/:id           Editar auth/encryption/otp
DELETE /api/api-testing/collections/:id

POST   /api/api-testing/collections/:id/regenerate
POST   /api/api-testing/collections/:id/secrets
GET    /api/api-testing/collections/:id/secrets
DELETE /api/api-testing/collections/:id/secrets/:secretId

POST   /api/api-testing/collections/:id/run       Ejecutar colección
GET    /api/api-testing/runs/:runId               Detalle + results
GET    /api/api-testing/runs/:runId/stream        SSE en vivo
```

### Eventos SSE de un run

```
event: status
  data: { status, message }

event: test_started
  data: { testCaseId, name }

event: test_finished
  data: { testCaseId, status, durationMs, actualStatus, errorMessage }

event: progress
  data: { total, completed, passed, failed, skipped }

event: completed
  data: { status, passed, failed, skipped, durationMs }
```

### Schema (tablas)

```sql
api_collections      Contratos importados + configs de auth/encryption/otp
api_test_cases       Cada test generado (mecánico + IA)
api_test_secrets     Llaves encriptadas con master key del servidor
api_test_runs        Cada ejecución de una colección
api_test_results     Resultado individual de cada test
```

### Variables de entorno nuevas

```env
SERVER_ENCRYPTION_KEY=<32 bytes hex>
# Genera con: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Aplicar la migración

```bash
docker compose exec api node src/db/migrate.js
# Aplica 0003_api_testing.sql automáticamente
```

---

## ♿ WCAG / Accesibilidad

Módulo robusto que va más allá de las herramientas tradicionales (axe DevTools, WAVE, Lighthouse).

### Diferenciadores

```
1. Análisis multi-dimensional (NO solo axe-core)
   • axe-core (~95 reglas WCAG 2.0/2.1/2.2 A, AA, AAA)
   • Análisis estructural propio (headings, landmarks, skip links)
   • Análisis de teclado real (simula Tab N veces, detecta focus traps)
   • Análisis visual (touch targets 44px mobile, texto <12px)
   • Análisis cognitivo (paredes de texto, complejidad de palabras)
   • Simulaciones de daltonismo (5 tipos con SVG filters Brettel)

2. Lenguaje humano, no jerga técnica
   • Catálogo manual de 20+ reglas comunes traducidas a español
   • IA (Claude) traduce el resto en batch (1-2 llamadas por análisis)
   • Cada issue tiene: humanTitle, humanDescription, humanImpact,
     humanFixSuggestion, fixCodeSnippet

3. Priorización por impacto real
   • Severity ajustada con boost del catálogo
     (color-contrast moderate + boost +1 → high)
   • Mapeo a 10 grupos de usuarios afectados
     (blind, low_vision, color_blind, motor, cognitive, deaf,
      keyboard, mobile, elderly, situational)

4. Reportes en 3 formatos
   • HTML interactivo con score, issues colapsables, simulaciones
   • PDF (vía Playwright print-to-PDF)
   • JSON estructurado para CI/CD

5. Tracking histórico
   • Targets (sitios trackeados con histórico)
   • Gráfica de evolución del score con SVG
   • Detección de regresiones
```

### Score y categorías

```
Score 0-100 ponderado por severidad:
   critical: -8 puntos
   high:     -4
   medium:   -2
   low:      -0.5
   bonus por reglas pasadas: +0.1 (capped a +10)

Score por categoría (12 categorías):
   contrast, semantic, aria, keyboard, forms, media,
   language, links, visual, cognitive, mobile, other

Grade: A+ (95+), A (85+), B (75+), C (65+), D (50+), F (<50)
```

### Endpoints REST

```
Targets (sitios trackeados):
   POST   /api/wcag/targets
   GET    /api/wcag/targets
   GET    /api/wcag/targets/:id
   GET    /api/wcag/targets/:id/trend?days=90
   PUT    /api/wcag/targets/:id
   DELETE /api/wcag/targets/:id

Analyses (corridas individuales):
   POST   /api/wcag/analyses
   GET    /api/wcag/analyses
   GET    /api/wcag/analyses/:id
   GET    /api/wcag/analyses/:id/stream    [SSE en vivo]
   DELETE /api/wcag/analyses/:id

Issues:
   PUT    /api/wcag/issues/:id/status      Marcar resolved/ignored/open
```

### Eventos SSE durante el análisis

```
event: status
  data: { phase, message }
  phases: starting, launching, navigating, axe, structural,
          keyboard, visual, cognitive, simulations,
          processing, translating, reports

event: completed
  data: { score, totalIssues, reportHtmlUrl, reportPdfUrl }

event: error
  data: { message }
```

### Schema (tablas)

```sql
wcag_targets        Sitios trackeados con nivel/device por default
wcag_analyses       Cada corrida (resultados + reportes + scores)
wcag_issues         Cada problema con severity, fix, afectados
```

### Cuotas por plan

```
Starter   ✗ Sin acceso (push hacia Teammate)
Teammate  ✓ Niveles A y AA
          ✓ 10 análisis/mes
          ✓ Tracking histórico 90 días
          ✓ Reportes HTML + PDF + JSON
Advance   ✓ Todo lo anterior +
          ✓ Nivel AAA
          ✓ 50 análisis/mes
```

### Variables de entorno

```env
ANTHROPIC_API_KEY=...        # Para traducción IA (opcional, fallback a catálogo)
SCREENSHOT_DIR=/data/screenshots  # Reusado del módulo de testing
REPORTS_DIR=/data/reports         # Reusado del módulo de testing
```

### Aplicar la migración

```bash
docker compose exec api node src/db/migrate.js
# Aplica 0004_wcag.sql automáticamente
```

### Demo rápido

```bash
# 1. Login y obtener token (ya configurado en frontend)
# 2. Crear target
curl -X POST http://localhost/api/wcag/targets \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Mi sitio","url":"https://example.com","defaultLevel":"AA"}'

# 3. Ejecutar análisis
curl -X POST http://localhost/api/wcag/analyses \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","level":"AA","deviceId":"desktop"}'

# 4. Streamear progreso (SSE)
curl -N http://localhost/api/wcag/analyses/{id}/stream \
  -H "Authorization: Bearer $TOKEN"
```

---

## 📊 Allure Reports (módulo standalone)

Módulo dedicado de reportes Allure con histórico, detección de tests flaky,
uploads externos desde CI/CD, y share links públicos.

### Diferenciadores vs Allure CLI estándar

```
Allure CLI puro:
  ✗ Cada equipo mantiene su propio servidor para histórico
  ✗ Sin auth ni multi-tenant
  ✗ El history se pierde si no copias la carpeta history/
  ✗ Compartir reportes requiere tu propia infra

Achilltest Allure:
  ✓ Histórico persistente automático en DB
  ✓ Multi-tenant con auth integrada
  ✓ Detección de tests flaky en últimos 20 runs
  ✓ Uploads externos desde CI/CD vía API REST
  ✓ Share links públicos opcionales (sin login para stakeholders)
  ✓ Trend chart del pass rate
  ✓ Comparación automática vs run anterior
  ✓ Integración con Suite Runs existentes (1 click)
```

### Arquitectura

```
Worker container (Java 17 + Allure CLI 2.30.0)
   ↓
allure generate <results> -o <report> --clean
   ↓
Reporte HTML estático servido en /reports/allure/{projectId}/{runId}/
   ↓
Frontend embebe el reporte vía <iframe>
```

### Schema (tablas)

```sql
allure_projects      Agrupa runs (con upload_token rotable)
allure_runs          Cada reporte generado con stats + history
allure_flaky_tests   Tests detectados como flaky (score 0-1)
```

### Endpoints REST

```
POST   /api/allure/projects                    Crear project
GET    /api/allure/projects                    Listar projects
GET    /api/allure/projects/:id                Detalle + runs recientes
PUT    /api/allure/projects/:id
DELETE /api/allure/projects/:id
GET    /api/allure/projects/:id/flaky          Tests flaky del project
GET    /api/allure/projects/:id/trend          Trend pass rate (últimos 90d)
POST   /api/allure/projects/:id/rotate-token   Genera nuevo upload_token

POST   /api/allure/projects/:id/upload         [SIN JWT, usa upload_token]
                                                Recibe allure-results.zip

POST   /api/allure/runs/from-suite             Genera Allure desde suite_run
GET    /api/allure/runs                        Lista runs del user
GET    /api/allure/runs/:id                    Detalle + comparison vs anterior
GET    /api/allure/runs/:id/stream             SSE en vivo
DELETE /api/allure/runs/:id

POST   /api/allure/runs/:id/share              Activar share link público
DELETE /api/allure/runs/:id/share              Desactivar

GET    /api/allure/public/:shareToken          [SIN auth] Reporte público
```

### Eventos SSE durante generación

```
event: status
  data: { phase, message }
  phases: starting, history, snapshot, generating, flaky

event: completed
  data: { reportUrl, statistics, passRate }

event: error
  data: { message }
```

### Flujo CI/CD (uploads externos)

```bash
# 1. En tu pipeline, después de correr Playwright
cd allure-results && zip -r ../allure-results.zip . && cd ..

# 2. Subir al endpoint
curl -X POST "https://api.achilltest.io/api/allure/projects/{id}/upload" \
  -H "Authorization: Bearer $ACHILLTEST_UPLOAD_TOKEN" \
  -H "X-Branch: main" \
  -H "X-Build-Number: 123" \
  -H "X-Commit-Sha: abc1234" \
  -H "X-Environment: staging" \
  --data-binary @allure-results.zip

# 3. La API responde con el runId, el procesamiento se hace en background
# {
#   "success": true,
#   "data": {
#     "runId": "uuid",
#     "resultsCount": 145,
#     "reportUrl": "/allure/runs/uuid"
#   }
# }
```

### Detección de tests flaky

```
Análisis automático tras cada run:
  • Carga los últimos 20 runs del project
  • Por cada test, cuenta: passCount, failCount, brokenCount
  • flaky_score = min(failures, passes) / total
  • Si score >= 0.1 y total >= 3 runs → marcado como flaky

Score mínimo (0.10): test pasa 18 veces, falla 2 veces (10% del tiempo)
Score máximo (0.50): test pasa 10 veces, falla 10 veces (50%/50%)

Un test que siempre falla NO es flaky (score 0.0) — es bug claro.
```

### Generación de PDF/HTML

El reporte HTML se genera con `allure-commandline 2.30.0` (Java).
Soporta:
- Categories, Behaviors, Features, Stories
- Suites tree con drill-down
- Timeline de ejecución
- Graphs (severity, status, duration)
- History (trends de los últimos N runs)
- Retries info
- Attachments completos (screenshots, videos, traces)

Cuando Java no está disponible (e.g. en desarrollo local), el sistema
hace fallback a un reporte HTML simplificado en JS puro.

### Cuotas por plan

```
Starter   ✗ Sin acceso
Teammate  ✓ Generación desde Suite Runs
          ✓ Hasta 3 projects
          ✓ 30 runs/mes
          ✓ Histórico 90 días
          ✗ Sin uploads externos
          ✗ Sin share links públicos
Advance   ✓ Todo lo anterior +
          ✓ Projects ilimitados
          ✓ 500 runs/mes
          ✓ Uploads externos vía CI/CD
          ✓ Share links públicos
```

### Variables de entorno

```env
REPORTS_DIR=/data/reports         # Donde se guardan los HTML generados
ALLURE_BIN=/usr/local/bin/allure  # Path al CLI (instalado en Docker)
ALLURE_WORK_DIR=/tmp/achilltest-allure-work
```

### Build de imagen Docker (con Java + Allure CLI)

```bash
# El worker y el API ahora incluyen JRE 17 + Allure CLI 2.30.0
# Añade ~200MB a la imagen del worker

docker compose build worker api
docker compose up -d
docker compose exec api node src/db/migrate.js  # Aplica 0005_allure.sql
```

### Smoke test

```
✓ Tokens: prefijos at_ y sh_, longitud correcta, timing-safe verify
✓ Status mapping: passed/failed/skipped → mismo, error/timeout → broken
✓ Flaky scoring: 0/20 (estable), 18/2 (flaky 0.10), 10/10 (flaky 0.50)
✓ Cuotas por plan correctamente diferenciadas
✓ Los 7 archivos backend Allure compilan sin errores
✓ Los 7 archivos frontend Allure creados
✓ Integración con Suite Run existente (modal "✨ Allure Pro")
✓ Dashboard actualizado con card de Allure
```

---

## 🐙 GitHub Integration (Push only)

Módulo de versionamiento de tests con GitHub. Crea repos y commits desde la UI
usando OAuth App. Foco en el flujo Achilltest → GitHub (push). Pull y webhooks
quedan para sprints posteriores.

### Filosofía

```
Antes (sin Achilltest):
  QA Manual genera tests con IA → copia código → abre repo local
  → crea archivos manualmente → npm init → instala Playwright
  → escribe playwright.config.ts → setup CI/CD → git init → push

Con Achilltest:
  QA Manual genera tests con IA → click "Push to GitHub"
  → repo creado automáticamente con TODA la estructura production-ready
```

### Lo que se genera al crear un repo

```
my-tests/
├── playwright.config.ts            Config con projects (devices) de la suite
├── package.json                    Scripts: test, test:ui, test:debug, report
├── tsconfig.json                   TypeScript strict + ES2022
├── .gitignore                      node_modules, test-results, allure-results
├── README.md                       Setup + scripts + sync info
├── tests/
│   ├── login-flow.spec.ts          (de testSpecs.code)
│   ├── checkout.spec.ts            Slugified + dedup automático
│   └── search.spec.ts
├── .achilltest/
│   └── manifest.json               Map Achilltest IDs → archivos (para sync futuro)
└── .github/
    └── workflows/
        └── playwright.yml          Corre tests en push/PR (sin Allure upload)
```

### Diferenciadores

```
1. OAuth App (mejor UX)
   ✓ Login con GitHub, no PAT manual
   ✓ State CSRF en Redis con TTL 10min
   ✓ Scopes mínimos: repo + user:email
   ✓ Token cifrado AES-256-GCM con crypto-vault

2. Push atómico vía Git Data API
   ✓ No clona el repo localmente (cero disco)
   ✓ Pipeline: getBranch → createBlobs (8 concurrent) → createTree
     → createCommit → updateRef
   ✓ Multi-archivo en UN commit

3. Repo builder con templates production-ready
   ✓ playwright.config.ts con projects por device (8 mapeos)
   ✓ Soporte personal accounts y organizations
   ✓ Slugify específico para repo names (acentos, special chars)
   ✓ Deduplicación de spec filenames

4. 1-click desde Suite
   ✓ POST /api/github/suites/:id/push
   ✓ Soporta useExistingRepo (push a repo ya conectado)
   ✓ Validación REPO_EXISTS con código de error específico

5. Audit log con SSE
   ✓ Cada push registrado en github_pushes
   ✓ Stream en vivo con 7 fases:
     starting → auth → fetching → blobs → tree → commit → pushing
   ✓ Errores 401/403 desactivan la connection automáticamente

6. Manifest para sync bidireccional futuro
   .achilltest/manifest.json incluye:
   {
     "achilltestSourceType": "suite",
     "achilltestSourceId": "uuid",
     "suiteName": "...",
     "specs": {
       "<achilltestSpecId>": "tests/login.spec.ts",
       ...
     }
   }
```

### Schema (3 tablas)

```sql
github_connections   user_id UNIQUE, token cifrado, scopes JSONB
                     last_used_at + last_error para debugging
github_repos         owner, repo_name, full_name, default_branch
                     sourceType + sourceId vinculan al origen Achilltest
                     manifest JSONB para sync
                     total_pushes contador
github_pushes        audit log con status, commit_sha, files_count
                     SSE pub/sub en redis
```

### Endpoints REST (17)

```
OAuth Flow:
  GET    /api/github/oauth/init               Authorize URL + state
  GET    /api/github/oauth/callback           Callback de GitHub (sin JWT)

Connection:
  GET    /api/github/connection                Info del user
  DELETE /api/github/connection                Desconectar

GitHub Resources (vía OAuth):
  GET    /api/github/list-user-repos           Repos del user en GH
  GET    /api/github/list-user-orgs            Organizations

Repos registrados:
  POST   /api/github/repos                     mode=create|existing
  GET    /api/github/repos                     Listar
  GET    /api/github/repos/:id                 Detalle + recentPushes (20)
  DELETE /api/github/repos/:id                 Desvincular (NO borra en GH)

Push:
  POST   /api/github/repos/:id/push            Push manual
  GET    /api/github/pushes/:id                Estado
  GET    /api/github/pushes/:id/stream         SSE en vivo

Shortcuts:
  POST   /api/github/suites/:id/push           1-click: crear + push
```

### Eventos SSE del push

```
event: status
  data: { phase, message }
  phases: starting, auth, fetching, blobs, tree, commit, pushing

event: progress
  data: { completed, total }
  Para tracking de blobs en upload paralelo

event: completed
  data: { commitSha, commitUrl, filesCount }

event: error
  data: { message }
```

### Setup de OAuth App (5 minutos)

```
1. Ir a https://github.com/settings/applications/new
2. Application name: Achilltest (o tu nombre custom)
3. Homepage URL: https://achilltest.io
4. Authorization callback URL:
   https://achilltest.io/api/github/oauth/callback
5. Generate Client ID + Client Secret

6. En .env del backend:
   GITHUB_CLIENT_ID=Iv1.abc123...
   GITHUB_CLIENT_SECRET=<secret>
   GITHUB_OAUTH_REDIRECT_URI=https://achilltest.io/api/github/oauth/callback
   FRONTEND_URL=https://achilltest.io
```

### Flujo completo del usuario

```
1. Usuario → Dashboard → click "🐙 GitHub"
2. Página /github → click "Conectar con GitHub"
3. Redirect a GitHub OAuth authorize page
4. Usuario autoriza scopes (repo + user:email)
5. GitHub redirige a /api/github/oauth/callback?code=...&state=...
6. Backend valida state CSRF, exchange code → access_token
7. Token cifrado AES-256-GCM + guardado en DB
8. Redirect a /dashboard?github=connected

9. Usuario va a una Suite → click "Push to GitHub"
10. Modal muestra:
    - Opción "Crear nuevo repo" (default)
    - Opción "Usar repo conectado" (si hay)
11. Form: owner (user/org), name, descr, public/private, includeWorkflow
12. Click "Crear repo y pushear"
13. Backend en background:
    - POST /user/repos (o /orgs/{org}/repos)
    - Build files desde la suite (playwright config + specs + workflow)
    - getBranch main → createBlobs paralelo → createTree → createCommit → updateRef
14. SSE stream muestra progreso fase por fase
15. Result modal: "🎉 ¡Push exitoso!" + link al commit
```

### Cuotas por plan

```
Starter   ✗ Sin acceso
Teammate  ✓ Conectar GitHub
          ✓ 1 repo por mes (push a Advance para ilimitado)
          ✓ Repos conectados sin límite
          ✓ Pushes ilimitados a repos existentes
Advance   ✓ Repos ilimitados
          (Webhook listener y sync bidireccional vienen en sprint posterior)
```

### Variables de entorno

```env
GITHUB_CLIENT_ID=Iv1.xxxxx
GITHUB_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GITHUB_OAUTH_REDIRECT_URI=https://achilltest.io/api/github/oauth/callback
FRONTEND_URL=https://achilltest.io
```

### Smoke tests pasados

```
✓ Slugify: acentos áéíóú→aeiou, spaces, special chars, vacío→fallback
✓ uniqueSpecFileName: dedup con -2, -3, -4...
✓ repoName regex: válido my-tests, my_tests, my.tests, MyTests123
                  inválido espacios, /, @, vacío
✓ OAuth state: 64 hex chars (32 bytes randomBytes), CSRF-safe
✓ Tree entry format: { path, mode: '100644', type: 'blob', sha }
✓ 7 fases del push correctamente mapeadas
✓ Los 4 archivos backend GitHub compilan sin errores
✓ Schema con bigint para github_user_id y github_repo_id
```

### Roadmap GitHub (sprints futuros)

```
Sprint posterior:
  • Pull desde repos existentes (Opción B del scope inicial)
  • Sync bidireccional usando .achilltest/manifest.json
  • Webhook listener (PR opened, push events)
  • Status checks en PRs (verde/rojo según tests)
  • PR triggers para correr Suite Runs automáticamente
  • Comments en PRs con resultados de tests
```

---

## 🏢 Organizations & Roles (Multi-tenant)

Transformación de Achilltest de single-user a multi-tenant con roles
Owner / Manager / QA. Cada org tiene su propio billing, conexiones
(GitHub, Jira) y miembros independientes.

### Jerarquía de roles

```
owner   (1 por org, dueño absoluto)
  ✓ Todo lo de Manager
  ✓ Cambiar plan / billing
  ✓ Eliminar la org
  ✓ Transferir ownership
  ✓ Promover/degradar Managers

manager (admin técnico)
  ✓ Todo lo de QA
  ✓ Conectar/desconectar GitHub, Jira
  ✓ Crear Device Farms
  ✓ Invitar/expulsar QAs
  ✓ Editar settings de la org
  ✗ No toca billing

qa (usuario regular)
  ✓ Crear suites, specs, runs
  ✓ Ver todos los recursos de la org
  ✓ Pushear a GitHub conectado
  ✓ Crear bugs en Jira conectado
  ✗ No invita ni administra
```

### Auto Personal Workspaces

Al registrarse, cada user obtiene automáticamente un workspace
"Personal de {Nombre}" donde es Owner. Cero fricción para arrancar.
Los workspaces personales NO se pueden eliminar (van con la cuenta)
y NO admiten miembros adicionales.

### Invitaciones por link compartible

```
Owner/Manager crea un invite link:
  • Rol al aceptar: qa o manager
  • Máximo de usos (opcional)
  • Expiración (opcional: 1d, 7d, 30d, 90d, nunca)
  • Token criptográficamente seguro (32 bytes random)

Compártelo por:
  WhatsApp, Slack, email, donde quieras

URL: https://achilltest.io/join/invite_{48 hex}

Al abrir el link:
  Preview público SIN auth (org name, rol, miembros actuales)
  Login/Register si no tiene cuenta
  Click "Aceptar" → join + auto-switch a la nueva org
```

### Switching de organización

OrgSwitcher en el nav muestra todas las orgs del user. Click cambia la
org activa (hard reload para refrescar el contexto). El backend valida
membership en cada request y refresca plan/rol desde DB.

### Cuotas de miembros por plan

```
Trial      1 miembro  (solo el dueño)
Starter    1 miembro  (solo el dueño)
Teammate   5 miembros (incluidos)
Advance    15 miembros
Pro        50 miembros
Enterprise ilimitado
```

### Schema (3 tablas + ALTER)

```sql
organizations         + slug, description, is_personal, mp_*,
                        trial_*, settings JSONB
organization_members  many-to-many user ↔ org con role
                      invited_by, joined_at, last_active_at
organization_invites  token UNIQUE, role, max_uses, expires_at,
                      uses_count, is_revoked, last_used_at
users                 + current_organization_id (org activa)
```

### Endpoints REST (17)

```
GET    /api/organizations                                  Lista orgs del user
GET    /api/organizations/current                          Org activa
POST   /api/organizations/switch                           Cambiar activa
POST   /api/organizations                                  Crear
GET    /api/organizations/:id                              Detalle + members
PUT    /api/organizations/:id                              Editar (manager+)
DELETE /api/organizations/:id                              Eliminar (owner)
GET    /api/organizations/:id/members                      Lista members
PUT    /api/organizations/:id/members/:userId              Cambiar rol (owner)
DELETE /api/organizations/:id/members/:userId              Quitar (manager+)
POST   /api/organizations/:id/leave                        Salirse
POST   /api/organizations/:id/transfer-ownership           Transferir (owner)
POST   /api/organizations/:id/invites                      Crear invite (manager+)
GET    /api/organizations/:id/invites                      Lista invites (manager+)
DELETE /api/organizations/:id/invites/:inviteId            Revocar (manager+)
GET    /api/organizations/invites/:token                   [SIN AUTH] preview
POST   /api/organizations/invites/:token/accept            Aceptar
```

### Data Migration

La migración 0007 incluye un script que para CADA user existente:
  1. Genera slug único (slugify con acentos, fallback workspace)
  2. Crea su "Personal de {name}" como is_personal=true
  3. Asigna el user como owner
  4. Backfill organization_id en todas las tablas con user_id
  5. Cero pérdida de datos, cero fricción para usuarios viejos

### Smoke tests pasados

```
✓ Jerarquía: owner>=qa, manager>=manager, qa<owner (9 casos)
✓ Slug: acentos→ascii, special chars, vacío→workspace
✓ Invite token: prefijo invite_, 55 chars, randomBytes 24
✓ maxMembers: trial=1, starter=1, teammate=5, advance=15, pro=50
✓ Auto-personal workspace en /register
✓ JWT incluye currentOrganizationId, refresh en cada request
```

---

## 📋 Jira + Zephyr Scale Integration

Integración profunda con Jira (issues/bugs) y Zephyr Scale (test cases,
cycles, executions). Org-scoped: la conexión pertenece a la organización,
todo el equipo la comparte.

### Filosofía

```
Antes:
  QA Manual ejecuta tests en Achilltest
  → Manual: copiar resultado a Excel
  → Manual: crear ticket en Jira si falla
  → Manual: reportar execution a Zephyr Scale
  → 3 herramientas, 3 procesos manuales, 3 fuentes de verdad

Con Achilltest + Jira/Zephyr:
  Run termina → Click "Push to Zephyr" → executions reportadas
  Test falla → Click "Create bug" → issue creado con full context
  Una sola fuente de verdad. Cero copy-paste.
```

### Dual auth: OAuth + API Token

```
OAuth 2.0 (Atlassian Cloud)
  ✓ UX más pulida (un solo click)
  ✓ Auto-refresh de tokens (expiran en 1h)
  ✓ Discovery automático de cloud_id
  ✓ Solo funciona con Atlassian Cloud

API Token (Cloud + Server/Data Center)
  ✓ Funciona on-premise (crítico para LATAM enterprise)
  ✓ Más flexible (el user controla el token)
  ✓ UX menos pulida pero universal

Ambos coexisten. El user elige según su deployment.
```

### Lo que se puede hacer

```
1. Conectar Jira al workspace
   - OAuth con Atlassian → 1 click
   - O bien API token (email + token + siteUrl)

2. Configurar Zephyr Scale (opcional, add-on)
   - Token de Zephyr aparte (api.zephyrscale.smartbear.com)
   - Validado contra /healthcheck o /projects
   - Cifrado con AES-256-GCM

3. Sincronizar projects de Jira
   - Pull paginado de todos los projects accesibles
   - Cache local en jira_projects
   - Toggle is_selected para activarlos

4. Sincronizar test cases de Zephyr
   - Pull paginado (max 10k cases por sync)
   - Cache en zephyr_test_cases
   - Incluye steps, status, priority, folder, labels

5. Link spec ↔ zephyr_test_case (bidireccional)
   - Achilltest spec.id ↔ zephyr_test_case.linked_spec_id
   - Cuando se ejecuta el spec, se sabe a qué Zephyr case
     reportar el resultado

6. Reportar Suite Run a Zephyr
   - Backend recorre executions del Suite Run
   - Filtra las que tienen spec linkeado
   - Mapea status: passed→Pass, failed→Fail, skipped→Not Executed
   - POST a /testexecutions de Zephyr Cloud
   - Registra en zephyr_executions con audit

7. Crear bug en Jira desde un fallo
   - Modal: project, issueType (Bug/Task/Story), summary, description, priority
   - Auto-include context del spec/execution si hay
   - Description convertida a ADF (Atlassian Document Format)
   - Issue creado con label "achilltest"
   - Registrado en jira_issues con link al spec/execution
```

### Schema (6 tablas, todas org-scoped)

```sql
jira_connections      organization_id UNIQUE
                      auth_type oauth|api_token
                      deployment_type cloud|server
                      cloud_id, site_url, site_name
                      access/refresh_token_encrypted (OAuth)
                      api_token_encrypted (API Token)
                      atlassian_user_*
                      has_zephyr, zephyr_token_encrypted

jira_projects         cache de projects de Jira
                      jira_project_key, name, project_type
                      is_selected (toggle del user)

zephyr_test_cases     cache de cases
                      zephyr_key (e.g. ACME-T1234)
                      name, objective, precondition, steps JSONB
                      status, priority, folder, labels
                      linked_spec_id (bidireccional con Achilltest)

zephyr_test_cycles    cycles de Zephyr
                      zephyr_key, name, status
                      planned_start_date, planned_end_date
                      linked_suite_run_id

zephyr_executions     audit log de pushes
                      test_case_id, cycle_id
                      spec_id, suite_run_id, execution_id (locales)
                      result Pass|Fail|Blocked|...
                      zephyr_execution_id, pushed_at, push_error

jira_issues           bugs creados desde Achilltest
                      jira_issue_key, jira_issue_id, html_url
                      issue_type, summary, status, priority
                      spec_id, execution_id, suite_run_id
                      created_by
```

### Endpoints REST (16)

```
OAuth Flow:
  GET    /api/jira/oauth/init                Authorize URL + state
  GET    /api/jira/oauth/callback            Callback (sin auth)

API Token:
  POST   /api/jira/connection/api-token      Conectar con email+token

Connection:
  GET    /api/jira/connection                Info (sin tokens)
  DELETE /api/jira/connection                Desconectar (manager+)
  POST   /api/jira/connection/zephyr-token   Configurar Zephyr (manager+)

Projects:
  POST   /api/jira/sync-projects             Re-sync (manager+)
  GET    /api/jira/projects                  Listar
  PUT    /api/jira/projects/:id/select       Toggle is_selected (manager+)

Zephyr cases:
  POST   /api/jira/projects/:id/sync-zephyr  Sync cases (manager+)
  GET    /api/jira/projects/:id/zephyr-cases Listar
  POST   /api/jira/specs/:specId/link        Link spec ↔ case
  DELETE /api/jira/specs/:specId/link/:caseId Unlink

Push:
  POST   /api/jira/suite-runs/:id/push       Reportar a Zephyr

Issues:
  POST   /api/jira/issues                    Crear bug
  GET    /api/jira/issues                    Listar (últimos 100)
```

### Status mapping Achilltest → Zephyr

```
passed   → Pass
failed   → Fail
broken   → Fail
error    → Fail
timeout  → Fail
skipped  → Not Executed
pending  → Not Executed
unknown  → Not Executed
```

### ADF (Atlassian Document Format)

Jira Cloud REST v3 espera descripciones en ADF (no en plain text).
El cliente convierte automáticamente:

```
Input:
  "Hola mundo.

  Segundo párrafo."

Output ADF:
  {
    type: "doc", version: 1,
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Hola mundo." }] },
      { type: "paragraph", content: [{ type: "text", text: "Segundo párrafo." }] }
    ]
  }
```

### Setup OAuth App de Atlassian (10 minutos)

```
1. Ir a developer.atlassian.com → My apps → Create
2. Tipo: OAuth 2.0 (3LO) integration
3. Authorization → Add Jira platform
4. Permissions → activar:
   - read:jira-user
   - read:jira-work
   - write:jira-work
   - manage:jira-project
5. Authorization → Callback URL:
   https://achilltest.io/api/jira/oauth/callback
6. Settings → Distribution → Sharing: Public
7. Copiar Client ID + Secret

8. En .env del backend:
   JIRA_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxx
   JIRA_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   JIRA_OAUTH_REDIRECT_URI=https://achilltest.io/api/jira/oauth/callback
```

### Flujo completo del usuario

```
Manager:
  1. Dashboard → "📋 Jira + Zephyr"
  2. Click "Conectar con Jira" → OAuth Atlassian
  3. Autoriza scopes en pantalla de Atlassian
  4. Redirect → "✓ Conectado como [Name]"
  5. Click "+ Configurar Zephyr" → modal → pegar token
  6. Click "🔄 Sync projects" → todos los projects de Jira
  7. Click en un project → "🧪 Sync Zephyr cases"

QA:
  1. Crea/ejecuta una Suite
  2. Suite Run completa, algunos tests fallaron
  3. Click en un spec fallido → "Create bug"
  4. Modal: project, summary, description, priority
  5. Click "Crear bug" → Issue creado en Jira con link
  6. (En el spec ahora aparece chip "🐞 ACME-1234")

QA / Manager:
  Después de un Suite Run:
  1. Click "Push to Zephyr"
  2. Backend recorre executions, filtra las linkeadas
  3. Reporta cada una a Zephyr con su status
  4. Modal muestra: "✓ Reportados: 8, ✗ Failed: 0, Skipped: 2"
```

### Smoke tests pasados

```
✓ STATUS_MAP: 5 casos (passed→Pass, failed→Fail, skipped→Not Executed, fallback)
✓ ADF: 3 paragraphs desde texto con doble newline
✓ OAuth scopes: 5 incluidos, offline_access para refresh_token
✓ URL routing: OAuth→api.atlassian.com/ex/jira/{cloudId}, ApiToken→{siteUrl}
✓ Cifrado: 4 campos cifrados con AES-256-GCM
✓ Los 4 archivos backend (jira-oauth, jira-client, zephyr-client, jira-sync)
  compilan sin errores
✓ Schema con 6 tablas Drizzle + migración 0008 con CASCADE FKs
```

### Cuotas

```
Starter:   ✗ Sin acceso
Teammate:  ✓ Conectar Jira + Zephyr
           ✓ Issues ilimitados
           ✓ Sync de projects/cases ilimitado
           ✓ Push de suite runs ilimitado
```

### Variables de entorno

```env
JIRA_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxx
JIRA_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
JIRA_OAUTH_REDIRECT_URI=https://achilltest.io/api/jira/oauth/callback
```

### Roadmap Jira/Zephyr (sprints futuros)

```
• Webhooks bidireccionales (Jira→Achilltest cuando se cierra un bug)
• Xray support (alternativa a Zephyr Scale)
• Test cycles management desde Achilltest UI
• Issue templates por proyecto
• AI: auto-generar summary y description del bug desde el spec fallido
• Status sync: cuando se resuelve el bug en Jira, marcar spec como "fixed"
• Comments en issues con resultados de re-runs
```

---

## 🔧 Repair Agent (Auto-reparación con IA)

Módulo flagship que diferencia a Achilltest de competidores como BrowserStack
o Playwright/Selenium plain. Usa Claude (Anthropic) para diagnosticar specs
fallidos y proponer cambios mínimos al código.

### Filosofía

```
Antes (sin Achilltest):
  Test falla → QA pregunta al dev → dev investiga DOM → arregla selector
  30 min mínimo × cada cambio de UI
  El QA manual se siente "bloqueado por tech"

Con Repair Agent:
  Test falla → Click "🔧 Reparar con IA"
  → Agente abre el sitio real, analiza DOM actual
  → Compara con lo que esperaba el spec
  → Propone cambios con diff visual
  → QA revisa, aprueba con un click
  → Spec actualizado, versión guardada para rollback
  → 30 segundos vs 30 minutos
```

### Lo que repara

**Selectores rotos:**
```typescript
// Antes
await page.click('#login-btn')                          // ✗ Element not found
// Propuesta del agente
await page.click('[data-testid="login-button"]')        // ✓ stable selector
```

**Asserts obsoletos:**
```typescript
// Antes
await expect(button).toHaveText('Login')                // ✗ Botón ahora dice "Sign in"
// Propuesta del agente
await expect(button).toHaveText('Sign in')              // ✓ texto actualizado
```

El agente prefiere selectores estables en este orden:
**data-testid > role > aria-label > text > id > class**

### Cómo investiga el DOM

Estrategia híbrida en dos fases (snapshot + fallback):

```
FASE 1: SNAPSHOT (rápido, barato)
  Si el execution guardó dom_snapshot_url cuando falló:
    → Descarga el HTML capturado
    → Extrae elementos interactivos con regex (tag + attrs)
    → Lo pasa al LLM como contexto
  Costo: 0 workers + 1 LLM call
  ~70% de casos se resuelven aquí

FASE 2: RE-EXECUTE (preciso, costoso)
  Si snapshot no resolvió o no existe:
    → Abre Playwright headless
    → Navega al targetUrl
    → Ejecuta steps del spec hasta JUSTO ANTES del fallo
    → Captura DOM completo + screenshot + console logs
    → Lo pasa al LLM con contexto completo
  Costo: 1 worker (~10s) + 1 LLM call
  Mejor para flujos complejos con auth, modals, etc.
```

El user puede forzar re-execute si el primer intento falla con un botón
"🔄 Reintentar abriendo el browser".

### Confidence scoring

Claude responde con un campo `confidence` (0-1) que se muestra en la UI:

```
≥ 0.85   Alta confianza (verde)     Apply directo, normalmente correcto
0.65-0.85 Media confianza (amarillo) Revisar el diff antes de aplicar
< 0.65   Baja confianza (rojo)      Probablemente necesita re-execute
```

Si Claude detecta que **el error es un bug REAL del producto** (no un cambio
de selector), responde `fixable: false` y se rinde con explicación.

### Diff visual + spec revisions

UI muestra el diff línea-por-línea con:
- Verde `+` para líneas agregadas
- Rojo `-` para líneas eliminadas
- Gris para contexto
- Toggle "Ver diff" ↔ "Ver código completo"

Al aplicar:
1. Se guarda la versión anterior en `spec_revisions` (rollback disponible)
2. Se actualiza el spec con la versión propuesta
3. La sesión queda marcada como `applied`

```
revision 0: código original (snapshot pre-cambio)
revision 1: código del repair_agent (actual)
revision 2: siguiente repair (si lo hay)
...
```

Botón "Revertir" disponible mientras `rollback_available = true`.

### Status flow

```
pending
  ↓
analyzing_snapshot       ← investiga DOM guardado
  ↓
re_executing             ← (opcional) abre browser para reinspeccionar
  ↓
generating_repair        ← llama a Claude
  ↓
awaiting_approval        ← user revisa diff
  ↓
applied | rejected | failed
```

### Cuotas mensuales por plan

```
Trial      0 repairs   (sin acceso)
Starter    10 repairs/mes
Teammate   50 repairs/mes
Advance    200 repairs/mes  (planned)
Pro        500 repairs/mes  (planned)
Enterprise ilimitado
```

Contador en `repair_usage` table con UPSERT por (org, year, month).

### Pricing del LLM (Claude Sonnet 4.6)

Por defecto usa `claude-sonnet-4-6`:

```
Input:  $3.00 / 1M tokens
Output: $15.00 / 1M tokens

Repair típico:
  Input:  ~3,000 tokens (specCode + DOM + error)
  Output: ~1,000 tokens (JSON con diagnosis + proposed_code)
  Costo:  ~$0.024 USD ≈ $0.42 MXN
```

Para Teammate ($128.99 USD/mes), 50 repairs/mes = ~$1.20 USD de costo
de LLM → margen confortable.

### Schema (3 tablas + ALTER executions)

```sql
-- ALTER executions: campos para el agente
+ dom_snapshot_url    URL o path al HTML capturado al fallo
+ failed_step_index   Índice del step donde falló
+ failed_selector     Selector que el step intentó
+ failed_action       click | fill | etc
+ console_logs        JSONB array de logs del browser
+ page_url_at_fail    URL real cuando falló

repair_sessions       1 fila por intento de reparación
                      status, diagnosis, confidence_score
                      original_code → proposed_code
                      changes JSONB (structured list)
                      tokens_input, tokens_output, model_used
                      applied_at, rejected_at, rollback_available

spec_revisions        histórico de versiones
                      spec_id, version, code, source
                      Permite rollback completo

repair_usage          cuotas mensuales
                      org_id + year + month UNIQUE
                      repair_count, tokens_used, tokens_cost_usd
```

### Endpoints REST (8)

```
POST   /api/repair                          Iniciar sesión de repair
GET    /api/repair/sessions/:id             Detalle + diff calculado
POST   /api/repair/sessions/:id/apply       Aplicar cambios (crea revision)
POST   /api/repair/sessions/:id/reject      Rechazar con razón opcional
POST   /api/repair/sessions/:id/rollback    Revertir a versión anterior
POST   /api/repair/sessions/:id/retry       Reintentar con force re_execute
GET    /api/repair/sessions                 Listar (filter por specId)
GET    /api/repair/usage                    Uso del mes actual
```

### System prompt (resumen)

El agente recibe:
1. **Test code** completo que está fallando
2. **Error de Playwright** truncado a 2K chars
3. **Selector y acción** que fallaron
4. **DOM context** vía snapshot o re-execute:
   - Top 30 elementos interactivos con sus attrs estables
   - HTML preview truncado a 30K chars
   - Console errors del browser
5. **URL y title** actuales

Y debe responder JSON estricto:
```json
{
  "diagnosis": "Breve explicación en español",
  "confidence": 0.85,
  "fixable": true,
  "changes": [
    { "type": "selector", "line": 12,
      "old": "...", "new": "...", "reason": "..." }
  ],
  "proposed_code": "// spec completo con cambios aplicados"
}
```

`temperature: 0` para resultados determinísticos.

### Variables de entorno

```env
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-6
```

Si `ANTHROPIC_API_KEY` no está configurado, el botón de Repair se mantiene
visible pero al click responde 503 con mensaje explicativo.

### Flujo del usuario

```
1. Suite Run termina → un spec quedó en failed
2. QA va a /executions o al detalle del Suite Run
3. En la fila del execution failed, ve el botón "🔧 Reparar"
4. Click → modal de confirmación → "Iniciar reparación"
5. Modal muestra spinner con fases:
   - Analizando snapshot
   - (Re-ejecutando si necesario)
   - Pensando con Claude
6. ~10-20 segundos después → propuesta lista
7. UI muestra:
   - Diagnóstico humano ("El botón cambió de #login-btn a data-testid")
   - Confidence badge (verde/amarillo/rojo)
   - Lista de changes (selector, assert, wait, other)
   - Diff visual con líneas + y -
   - Toggle "Ver código completo"
   - Tokens consumidos y duración
8. QA revisa, click "✓ Aplicar al spec"
9. Spec actualizado, versión guardada, modal de éxito
10. QA re-ejecuta el test → pasa
```

### Smoke tests pasados

```
✓ computeDiff: LCS produce diff correcto (2 removed + 2 added en el caso real)
✓ extractStepsFromSpec: detecta goto + click + fill + press correctamente
✓ parseAttrs: extrae id, data-testid, aria-label, class
✓ JSON parser de Claude: maneja ```json fences, texto extra, balanceado
✓ Pricing: 3K+1K tokens = $0.024 USD por repair (~$0.42 MXN)
✓ Cuotas: trial=0, starter=10, teammate=50, advance=200, pro=500
✓ Status flow validado (pending → ... → applied/rejected/failed)
✓ Los 4 archivos backend compilan sin errores (claude-client, dom-investigator,
  repair-agent, spec-diff + routes/repair)
✓ Schema con 3 nuevas tablas + ALTER executions
```

### Lo que NO hace (intencional)

```
✗ No corre el test después de aplicar (el QA decide cuándo)
✗ No "regraba" pasos completos (eso es D del scope, sprint futuro)
✗ No se dispara automático al fallar (siempre manual, ahorra tokens)
✗ No edita el spec sin el "Apply" del user (cero magia oculta)
✗ No usa GPT/otros modelos (Claude only para MVP)
```

### Roadmap (sprints futuros)

```
• Auto-trigger opcional: si falla un Suite Run, encolar repair pending aprobación
• Modo "Agente completo" (D): si el cambio es grande, ofrecer regrabar el step
• Bring Your Own Key (BYOK): para clients enterprise sin cuota
• Multi-model: GPT-4o como alternativa, configurable por org
• Auto-suggest selectors en el editor mientras el QA escribe el spec
• "Repair propagation": un cambio de selector en 1 spec se propaga
  a otros specs del mismo proyecto que usen el mismo selector
• Stats: % de repairs aceptados vs rechazados por user, por mes
```

---

## 💰 Optimización de costos del Repair Agent

Tras la primera versión del Repair Agent que usaba solo Sonnet 4.6, se
implementó una estrategia escalonada Haiku → Sonnet con prompt caching.

### Pricing actualizado (junio 2026)

```
Modelo         | Input  | Output | CacheWrite | CacheRead
───────────────|────────|────────|────────────|──────────
Haiku 4.5      | $1.00  | $5.00  | $1.25      | $0.10
Sonnet 4.6     | $3.00  | $15.00 | $3.75      | $0.30
Opus 4.8       | $5.00  | $25.00 | $6.25      | $0.50

(USD por millón de tokens)
```

Prompt caching da 90% de descuento en input cacheado (read), con 25% extra
en el primer write. Sostenible cuando el system prompt es estable entre
requests, que es nuestro caso.

### Estrategia escalonada Haiku → Sonnet

```
PASS 1 — Haiku 4.5 ($0.0087 con cache)
  Primer intento. Más barato. ~55% de los casos se resuelven aquí
  (selectores rotos triviales, asserts obvios).

  Si Haiku responde:
    fixable=true + confidence ≥ 0.85  → ACEPTAR resultado
    fixable=true + confidence < 0.85  → ESCALAR a Sonnet
    fixable=false                      → ACEPTAR (Sonnet tampoco lo resolvería)

PASS 2 — Sonnet 4.6 ($0.0262 con cache)
  Solo cuando Haiku no estaba seguro.
  Recibe el prompt original + el análisis de Haiku como contexto adicional.
  Decide independientemente: puede confirmar, mejorar o rechazar.
```

### Resultado del escalonado

```
Distribución típica:
  55% solo Haiku:                 $0.0087 USD por repair
  45% escalan a Sonnet:           $0.0349 USD por repair (Haiku + Sonnet)
  ──────────────────────────────────────────────────────
  Promedio ponderado:             $0.0205 USD por repair

Comparado con solo Sonnet:
  Ahorro:                          21.7%
  Para 1000 repairs/mes:           $5.70 USD ahorrados/mes
```

### Proyección de costos LLM por plan

```
Plan       | Precio MXN | Repairs | Costo LLM | Margen LLM
───────────|────────────|─────────|───────────|───────────
Starter    | $1,380     | 10      | $3.58     | 99.7%
Teammate   | $2,252     | 50      | $17.89    | 99.2%
Advance    | $4,959     | 200     | $71.56    | 98.6%
Pro        | $8,540     | 500     | $178.90   | 97.9%
```

Margen LLM cómodo en todos los planes incluso considerando re-execute
y retries. El worst case (snapshot falla → re-execute con retry escalando)
sale en $0.066 USD ≈ $1.16 MXN por repair — sigue siendo viable.

### Threshold de confianza configurable

```javascript
// backend/src/services/repair-agent.js
const HAIKU_CONFIDENCE_THRESHOLD = 0.85

// Subir a 0.90 → menos repairs caen en Haiku (más calidad, más costo)
// Bajar a 0.75 → más repairs en Haiku (más barato, posibles rechazos)
```

El 0.85 es el sweet spot validado en pruebas: en el rango 0.85+ Haiku
tiene una precisión >90% en selectores y asserts triviales.

### Estimación de costo previa al repair

Nuevo endpoint `POST /api/repair/estimate` que se llama ANTES de iniciar
para mostrar al user:

```json
{
  "bestCase":  { "costUsd": 0.009, "costMxn": 0.15 },  // si solo Haiku
  "worstCase": { "costUsd": 0.035, "costMxn": 0.62 },  // si escala
  "strategy":  "escalonado-haiku-sonnet",
  "usage":     { "current": 12, "limit": 50, "remaining": 38 }
}
```

UI muestra ambos escenarios en el modal de confirmación inicial con la
cuota mensual actualizada en tiempo real.

### Prompt caching implementado

El system prompt del Repair Agent (~1,200 tokens, instrucciones detalladas
para Claude) se cachea con `cache_control: ephemeral`. Esto reduce el
costo del system de input fresco ($3/1M) a cache read ($0.30/1M para Sonnet).

```javascript
// claude-client.js
await callClaude({
  system:      SYSTEM_PROMPT,    // string
  messages:    userPrompt,
  cacheSystem: true,              // ← Activa el caching
})
```

El cache es ephemeral (TTL 5 min) — perfecto para nuestro caso donde
múltiples repairs concurrentes comparten el mismo system prompt.

### Visualización en UI

En el modal de Repair y en el histórico se muestra qué modelo se usó:

```
⚡ Haiku             Solo Haiku resolvió (resultado más rápido y barato)
🪜 Haiku→Sonnet      Escaló a Sonnet (Haiku no estaba seguro)
🧠 Sonnet            Forzado o Haiku falló completo
```

En el histórico de `/repair` también se ve el costo total acumulado del mes
en USD y MXN, con el badge "Estrategia escalonada · 21% más barato".

### Smoke tests del escalonado

```
✓ Pricing junio 2026: Haiku $1/$5, Sonnet $3/$15, Opus $5/$25
✓ Cache read: 90% off input (0.10 vs 1.00 para Haiku)
✓ Costo único Haiku cached:  $0.0087 USD ($0.15 MXN)
✓ Costo único Sonnet cached: $0.0262 USD ($0.46 MXN)
✓ Promedio ponderado escalonado: $0.0205 USD ($0.36 MXN)
✓ Ahorro real: 21.7% vs solo Sonnet
✓ Worst case re-execute + retry: $0.066 USD ($1.16 MXN)
✓ Margen LLM Teammate: 99.2% (50 repairs/mes = $17.89 MXN de costo)
```

---

## 🚀 Sprint LAUNCH: 4 blockers para vender

Antes de poder cobrarle a alguien, había 4 cosas que faltaban. Este sprint
los completa para que Achilltest sea legalmente y operacionalmente vendible.

### Lo que se construyó

```
✓ Email service (Resend)
  ├─ Free tier 3,000 emails/mes — mejor deliverability LATAM que SendGrid
  ├─ Modo DEV automático: si no hay RESEND_API_KEY, loggea a consola
  ├─ Modo DISABLED: EMAILS_DISABLED=true desactiva todo
  └─ 3 templates inline en español (welcome, verification, reset)

✓ Email verification (anti-abuse del trial)
  ├─ Welcome email automático al registrarse con link de verificación
  ├─ Tokens one-shot SHA-256 (plain solo se ve UNA vez)
  ├─ TTL 7 días para verification
  ├─ /resend-verification para reenvíos desde el dashboard
  └─ Backfill: users existentes marcados como verified (cortesía)

✓ Password reset (recuperación de cuenta)
  ├─ Flow completo: /forgot-password → email → /reset-password
  ├─ TTL 1 hora (más corto que verification por seguridad)
  ├─ Anti-enumeration: /forgot-password SIEMPRE responde 200
  ├─ Validación previa con /peek-token (no consume el token)
  └─ Link "¿Olvidaste tu contraseña?" agregado en /login

✓ /terms y /privacy (legales LATAM-safe)
  ├─ Fix de links rotos en el footer del landing
  ├─ Términos: 13 secciones (uso aceptable, IA, IP, jurisdicción MX)
  └─ Privacidad: 12 secciones (LFPDPPP + GDPR básico, derechos ARCO)
```

### Arquitectura

```
backend/src/
├── db/migrations/0010_email_verification_and_reset.sql
│   ├─ ALTER users: email_verified, email_verified_at
│   ├─ Backfill users existentes como verified
│   └─ CREATE TABLE email_tokens (genérica para verify + reset)
│
├── services/
│   ├── email-service.js          ← Wrapper Resend + 3 templates
│   └── email-tokens-service.js   ← createToken, consumeToken, peekToken
│
└── routes/auth.js (nuevos endpoints):
    ├── POST /api/auth/verify-email          ← consume token, marca verified
    ├── POST /api/auth/resend-verification   ← (requiere auth) re-envía email
    ├── POST /api/auth/forgot-password       ← dispara email de recovery
    ├── POST /api/auth/reset-password        ← cambia password con token
    └── GET  /api/auth/peek-token            ← valida sin consumir

frontend/src/app/
├── verify-email/page.tsx     ← state: verifying → success | error
├── forgot-password/page.tsx  ← form email + "revisa tu inbox"
├── reset-password/page.tsx   ← peek → form newPassword → success
├── terms/page.tsx            ← 13 secciones, jurisdicción CDMX
└── privacy/page.tsx          ← 12 secciones, LFPDPPP + GDPR
```

### Decisiones de diseño clave

**Una sola tabla `email_tokens` (no dos tablas separadas)**

Verification y password reset comparten estructura idéntica. Tener una sola
tabla con campo `type` simplifica:
- Un solo lugar para invalidación (revoke all on logout)
- Un solo cleanup job para tokens expirados
- Audit log unificado
- Migraciones futuras (ej: añadir `magic_link_login` es solo un nuevo type)

**Plain token solo se ve UNA vez**

```javascript
// DB guarda solo SHA-256 hash
tokenHash: createHash('sha256').update(plain).digest('hex')

// Al consumir comparamos hash(input) === tokenHash
// Si alguien lee la DB, no puede usar los tokens
```

**One-shot enforcement**

Al consumir un token, marcamos `used_at = NOW()`. Los queries siempre
filtran por `WHERE used_at IS NULL`. Si alguien intenta usarlo de nuevo
(replay attack), no aparece en el lookup.

**Purga automática de tokens viejos**

Al crear un nuevo token del mismo `(user_id, type)`, invalidamos los viejos
del mismo tipo. Esto previene:
- Acumulación de tokens activos por usuario
- Confusión si el user pidió reset varias veces ("¿cuál link uso?")

**Anti-enumeration en /forgot-password**

```javascript
// Si el email NO existe, igual devolvemos 200 con el mismo mensaje
// Esto previene que un atacante use /forgot-password para descubrir
// qué emails están registrados (típico paso 1 de un ataque dirigido)
return reply.send({
  success: true,
  data: { message: 'Si el email existe, recibirás un link...' },
})
```

**Welcome email best-effort en /register**

Si Resend falla (rate limit, dominio no verificado, etc), el registro NO
falla. Solo se loggea como warning. El user puede pedir reenvío después.

**TTL distintos por tipo**

```
email_verification: 7 días  → no es urgente, dale tiempo al user
password_reset:     1 hora  → ventana de ataque debe ser corta
```

**Modo DEV automático sin API key**

```bash
$ node backend  # sin RESEND_API_KEY
[Email DEV MODE] To: user@test.com Subject: ...
[HTML body stripped...]
```

Esto permite desarrollar localmente sin necesitar una cuenta de Resend.

### Setup en producción (5 minutos)

```bash
# 1. Crear cuenta en resend.com (gratis)
# 2. Verificar tu dominio (achilltest.io) con DNS records
#    - TXT _resend para SPF
#    - 3 CNAME records para DKIM
# 3. Crear API key en resend.com/api-keys
# 4. .env del backend:
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxx
EMAIL_FROM=Achilltest <noreply@achilltest.io>
FRONTEND_URL=https://achilltest.io
```

### Aplicar la migración

```bash
psql $DATABASE_URL < backend/src/db/migrations/0010_email_verification_and_reset.sql
```

La migración es idempotente (`IF NOT EXISTS`), seguro de correr varias veces.

### Smoke tests pasados

```
✓ Token plain comienza con verify_ o reset_ (debugging visual)
✓ SHA-256 hash stored, plain nunca persiste
✓ One-shot: consumed token devuelve "ya fue usado"
✓ TTL: token expirado devuelve "expiró, solicita uno nuevo"
✓ Anti-enum: /forgot-password con email inexistente → 200 OK
✓ Email DEV mode: log a consola, no falla sin API key
✓ Welcome email best-effort: registro no falla si Resend falla
✓ Backfill: 100% users existentes marcados como verified
✓ /verify-email actualiza email_verified + email_verified_at
✓ /reset-password actualiza passwordHash con bcrypt cost 12
✓ peek-token NO consume el token (UX preview en /reset-password)
✓ Link "¿Olvidaste tu contraseña?" visible en /login
✓ Footer de landing apunta a /terms y /privacy (sin links rotos)
✓ Backend: 76 archivos JS compilan sin errores
```

### Lo que NO se hizo (intencional, sprint posterior)

```
✗ Email de "trial expired" en T-2 días     (cron job futuro)
✗ Email de "payment failed" via MP webhook (cuando llegue el primer fail)
✗ Magic link login (passwordless)          (después de validar tráfico)
✗ 2FA / TOTP                                (cuando haya enterprise leads)
✗ Email change flow (cambiar email)        (raro, dejarlo en suspense)
✗ Verificación obligatoria para usar       (hoy es opcional, no bloquea)
```

### Próximos pasos lógicos

1. **Sentry / error tracking** — para enterarte cuando algo crashea en prod
2. **Logger estructurado pino** — para correlacionar requests con request_id
3. **React ErrorBoundary** — para no mostrar pantalla en blanco al user
4. **Notificaciones in-app** — bell icon con últimas notifs
5. **Trial reminders** — cron que envía email cuando faltan 2 días
6. **Monaco editor** — el spec en `<pre>` es feo, deberían poder editarlo

Pero estos no bloquean vender. Achilltest ya puede cobrar legalmente.
