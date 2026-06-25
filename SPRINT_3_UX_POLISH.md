# 🎯 SPRINT 3: UX Polish

> Pegar esto en un chat NUEVO, junto con el ZIP de Achilltest y el HANDOFF_TEMPLATE.md

## Objetivo

Sin esto el producto se siente "beta" comparado con BrowserStack o Mabl.
Mejoras de percepción de calidad que mueven la aguja de conversión.

**Tiempo estimado:** 2 días (~14-16 horas)

## Alcance

- [ ] **Monaco editor para spec code**
  - Reemplazar el `<pre>` del workspace y suites con Monaco
  - Syntax highlighting JavaScript/TypeScript
  - Mostrar definiciones de Playwright para autocomplete
  - Read-only por default, modo editable si user tiene permiso
  - Theme dark alineado con el resto de Achilltest
  - Lazy-load (Monaco es pesado, ~2MB)

- [ ] **Notificaciones in-app (bell icon)**
  - Nueva tabla `notifications` (user_id, type, title, body, link, read_at)
  - Service `notifications-service.js` con notifyUser()
  - Bell icon en el nav del dashboard con badge de no leídas
  - Dropdown con últimas 10 notifs
  - Tipos iniciales:
    - suite_run_completed (success/fail)
    - invite_accepted (org owner)
    - repair_applied
    - jira_bug_created
    - payment_failed (urgente, no auto-marcar leída)
  - Polling cada 30s o realtime con SSE (preferir SSE)

- [ ] **Global search (cmd+K)**
  - Componente CommandPalette flotante (Spotlight-style)
  - Buscar en: suites, specs, runs (por nombre), miembros de org
  - Atajo de teclado cmd+K (mac) / ctrl+K (windows)
  - Resultados agrupados por tipo
  - Click navega a la URL correspondiente
  - Recent items cuando no hay query

- [ ] **Sample suite pre-creada al registrarse**
  - Cuando se crea personal workspace, crear sample suite "Mi primer test"
  - 3 specs de ejemplo: Google search, login form, contact form
  - Marca `is_sample = true` en DB
  - Banner "Esta es una suite de ejemplo — puedes editarla o eliminarla"

- [ ] **Empty states mejorados**
  - Página vacía de Suites: "Crea tu primera suite" con CTA grande
  - Página vacía de Executions: "Sin ejecuciones aún" con tutorial inline
  - Página vacía de Allure: "Aún no tienes reportes — graba tu primer test"
  - Cada empty state con icono SVG custom (no emoji)

- [ ] **Loading skeletons**
  - Reemplazar "Cargando..." genérico con skeletons que matchean el layout
  - Páginas con skeletons: /dashboard, /suites, /executions, /repair

## No incluye (intencional)

- ❌ Tema light (sin demanda real, sería un sprint dedicado)
- ❌ i18n / multi-idioma (sprint dedicado, hoy todo es español)
- ❌ Customización de colores per-org
- ❌ Mobile app nativa
- ❌ Drag-and-drop reordering de specs en suites

## Archivos esperados

```
NUEVOS:
- backend/src/services/notifications-service.js
- backend/src/routes/notifications.js
- backend/src/db/migrations/0012_notifications.sql
- backend/src/services/sample-suite-builder.js
- frontend/src/components/MonacoEditor.tsx
- frontend/src/components/NotificationBell.tsx
- frontend/src/components/CommandPalette.tsx
- frontend/src/components/EmptyState.tsx (genérico reutilizable)
- frontend/src/components/Skeleton.tsx (genérico)
- frontend/src/hooks/useNotifications.ts
- frontend/src/hooks/useCommandPalette.ts

MODIFICADOS:
- frontend/src/app/workspace/page.tsx       (Monaco en lugar de <pre>)
- frontend/src/app/suites/[id]/page.tsx     (Monaco para spec preview)
- frontend/src/app/dashboard/page.tsx       (NotificationBell en nav)
- frontend/src/app/layout.tsx               (CommandPalette global con cmd+K)
- frontend/src/app/executions/page.tsx      (empty state + skeleton)
- frontend/src/app/suites/page.tsx          (empty state + skeleton)
- backend/src/services/organizations-service.js  (crear sample al ensurePersonalWorkspace)
- frontend/package.json                     (deps: @monaco-editor/react)
```

## Endpoints REST nuevos

```
GET    /api/notifications              Listar últimas 20
GET    /api/notifications/unread       Contador de no leídas
POST   /api/notifications/mark-read    Marcar como leídas (todas o por id)
DELETE /api/notifications/:id          Borrar una

GET    /api/search?q=xxx&type=all      Búsqueda global
```

## Criterio de aceptación

```
✓ Workspace muestra el spec con Monaco y syntax highlighting
✓ cmd+K abre el CommandPalette desde cualquier página
✓ Suite Run completa: aparece notif en el bell icon con badge "1"
✓ User nuevo: ve su sample suite "Mi primer test" en /suites
✓ /executions vacío: muestra ilustración + CTA "Ejecuta tu primer test"
✓ /dashboard carga: muestra skeletons en lugar de "Cargando..."
✓ NotificationBell vacío: muestra mensaje "Sin notificaciones nuevas"
✓ Mobile: bell icon y CommandPalette siguen siendo usables
✓ Frontend compila sin errores ni warnings de TypeScript
```
