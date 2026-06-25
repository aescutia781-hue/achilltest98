# 📚 Guía: Cómo dividir el desarrollo en múltiples chats

Este documento explica el flujo para continuar Achilltest en varios chats
separados, manteniendo coherencia y sin perder contexto.

---

## ¿Por qué múltiples chats?

Cada chat tiene un límite de contexto. Cuando el chat se llena:
- Las respuestas se vuelven más lentas
- Claude puede olvidar decisiones tempranas
- Riesgo de re-implementar cosas que ya existen
- El historial se compacta (resumen, no detalle)

**Regla:** 1 sprint = 1 chat = 1 entregable claro.

---

## El flujo recomendado

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  CHAT ACTUAL (este)                                         │
│  └─ ZIP listo: achilltest.zip (503 KB)                      │
│  └─ Estado: 78% del sistema                                 │
│                                                             │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼  Descarga el ZIP
                         │
            ┌────────────┴────────────┐
            │                         │
            ▼                         ▼
┌──────────────────────┐  ┌──────────────────────┐
│  CHAT 1: Sprint 1    │  │  CHAT 2: Sprint 2    │
│  Observabilidad      │  │  Crons               │
│  (puede ser paralelo │  │  (puede ser paralelo │
│   con CHAT 2)        │  │   con CHAT 1)        │
└──────────┬───────────┘  └──────────┬───────────┘
           │                         │
           ▼                         ▼
   Entrega: ZIP nuevo        Entrega: ZIP nuevo
   con observabilidad        con crons
           │                         │
           └─────────────┬───────────┘
                         │ Merge manual de ambos ZIPs
                         ▼
            ┌──────────────────────┐
            │  CHAT 3: Sprint 3    │
            │  UX Polish           │
            └──────────┬───────────┘
                       │
                       ▼
            ┌──────────────────────┐
            │  CHAT 4: Sprint 4    │
            │  Pre-launch          │
            └──────────┬───────────┘
                       │
                       ▼
                  🚀 LANZAMIENTO
                       │
                       ▼  (cuando llegue lead enterprise)
            ┌──────────────────────┐
            │  CHAT 5: Sprint 5    │
            │  Enterprise features │
            └──────────────────────┘
```

---

## Paso a paso para iniciar un nuevo chat

### 1. Tener listo el ZIP actual

El último ZIP entregado debe estar en tu computadora local. Si hiciste
cambios manuales después, comprimí la carpeta de nuevo.

### 2. Abrir un NUEVO chat en claude.ai

Importante: NO continuar el chat actual. Empezar uno nuevo (clic en "+").

### 3. Como primer mensaje, pegar EN ORDEN:

```
1) HANDOFF_TEMPLATE.md (contenido completo)
2) SPRINT_X_*.md (el específico del sprint que vas a atacar)
3) Subir el ZIP de Achilltest como archivo adjunto
```

### 4. Esperar la confirmación de Claude

Claude debería:
- Descomprimir el ZIP
- Verificar el estado actual con grep/find
- Confirmarte que entendió el sprint
- Hacer 2-3 preguntas de clarificación si son necesarias
- ESPERAR tu OK antes de empezar a codear

### 5. Al final del sprint

Claude entrega:
- ZIP nuevo con los cambios
- Resumen de lo que se hizo
- README actualizado
- Smoke tests del sprint pasados

Vos:
- Descargar ZIP
- Probar localmente
- Si algo está mal: pedir fix en el mismo chat
- Si está bien: cerrar el chat, archivar el ZIP

---

## Recomendación de orden

### Opción A: Secuencial (más seguro)

```
Chat 1: Sprint 1 — Observabilidad      (1 día)
Chat 2: Sprint 2 — Crons               (1.5 días)
Chat 3: Sprint 3 — UX Polish           (2 días)
Chat 4: Sprint 4 — Pre-Launch          (1.5 días)
─────────────────────────────────────
TOTAL: 6 días → ~90% del sistema → LANZAMIENTO
```

Recomendado si querés revisar cada cambio antes del siguiente.

### Opción B: Paralelo (más rápido)

```
Día 1-2: Chat 1 (Observabilidad) + Chat 2 (Crons) EN PARALELO
         ↓ Merge manual de ambos ZIPs
Día 3-4: Chat 3 (UX Polish)
Día 5:   Chat 4 (Pre-Launch)
─────────────────────────────────────
TOTAL: 5 días → ~90% del sistema → LANZAMIENTO
```

Riesgo: si Sprint 1 y Sprint 2 tocan el mismo archivo, hay conflictos al
mergear. Es manejable porque son áreas distintas (observabilidad vs crons).

---

## Cómo mergear 2 ZIPs (caso paralelo)

Si corres Sprint 1 y Sprint 2 en paralelo, vas a recibir 2 ZIPs distintos.
Para combinarlos:

```bash
# 1. Extraer ambos
unzip achilltest-sprint1.zip -d sprint1/
unzip achilltest-sprint2.zip -d sprint2/

# 2. Empezar de base con sprint1
cp -r sprint1 achilltest-merged

# 3. Aplicar los NUEVOS archivos de sprint2
# (los que no existían en sprint1)
diff -r sprint1 sprint2 | grep "Only in sprint2" \
  | awk '{print $3 "/" $4}' | while read f; do
  mkdir -p "achilltest-merged/$(dirname ${f#sprint2/})"
  cp -r "$f" "achilltest-merged/${f#sprint2/}"
done

# 4. Archivos que cambiaron en AMBOS: revisar manualmente
diff -r sprint1 sprint2 | grep "differ"
# Para cada uno, decidir cómo mergear (usar tu IDE con diff visual)
```

Realísticamente: 5-10 archivos en conflicto, 30 minutos de merge manual.

---

## Reglas para los chats nuevos

Para que cada Claude sepa qué hacer, el HANDOFF_TEMPLATE.md ya incluye:

```
1. NUNCA reinventar lo que ya existe
2. Verificar antes de crear: ls / find / grep
3. Validar sintaxis: node --check
4. Comentar en español
5. Usar crypto-vault.js para secretos en DB
6. Migraciones SQL + actualizar schema.js Drizzle juntos
7. Documentar endpoints en comentarios
8. Preguntar si hay ambigüedad
9. Terminar con: README + smoke tests + ZIP
10. NO sobre-construir
```

---

## Tip importante

Cuando inicies cada chat nuevo, tu memoria persistente (Memories de Claude)
ya contiene info sobre Achilltest. Pero el detalle técnico fino NO está ahí
— está en el HANDOFF_TEMPLATE + el ZIP que pegues.

**El handoff hace de "save game" entre chats.**

---

## Archivos generados para esta estrategia

```
HANDOFF_TEMPLATE.md              ← Pegar en CADA chat nuevo
SPRINT_1_OBSERVABILIDAD.md       ← Sprint específico
SPRINT_2_CRONS.md                ← Sprint específico
SPRINT_3_UX_POLISH.md            ← Sprint específico
SPRINT_4_LAUNCH.md               ← Sprint específico
SPRINT_5_ENTERPRISE.md           ← Solo cuando un cliente lo pida
GUIA_MULTI_CHAT.md               ← Este archivo (referencia)
```

Todos están en la raíz del ZIP. Cuando inicies un nuevo chat:

1. Abrir el ZIP localmente
2. Copiar contenido de HANDOFF_TEMPLATE.md
3. Copiar contenido del SPRINT_X específico
4. Pegar ambos como primer mensaje en el nuevo chat
5. Adjuntar el ZIP completo
