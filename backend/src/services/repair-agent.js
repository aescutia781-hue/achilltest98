/**
 * Repair Agent
 *
 * Orquesta el flujo completo de reparación:
 *
 *   1. Carga el spec y la execution fallida
 *   2. Investiga el DOM (snapshot → fallback re-execute)
 *   3. Llama a Claude con prompt estructurado
 *   4. Parsea la respuesta JSON con:
 *      - diagnosis
 *      - confidence_score (0-1)
 *      - proposed_code (spec reparado)
 *      - changes[] (lista estructurada para diff visual)
 *   5. Persiste todo en repair_sessions con status awaiting_approval
 *
 * El user revisa el diff en UI y aprueba/rechaza:
 *   - applyRepair() → actualiza el spec, crea spec_revision, marca como applied
 *   - rejectRepair() → marca como rejected, no toca el spec
 *   - rollbackRepair() → restaura la versión anterior del spec
 */

import { eq, and, sql }          from 'drizzle-orm'
import { getDb, schema }         from '../db/client.js'
import { callClaudeForJson,
         isClaudeConfigured,
         MODELS }                from './claude-client.js'
import {
  investigateFromSnapshot,
  investigateByReExecuting,
}                                from './dom-investigator.js'

// Threshold de confianza para aceptar el resultado de Haiku sin escalar.
// 0.85 = solo aceptamos si Haiku está MUY seguro. Por debajo, escalamos a Sonnet.
// Si subes a 0.90 → menos repairs caen en Haiku (más calidad, más costo).
// Si bajas a 0.75 → más repairs en Haiku (más barato, más rechazos posibles).
const HAIKU_CONFIDENCE_THRESHOLD = 0.85

// ════════════════════════════════════════════════════════════════════════════
// SYSTEM PROMPT
// ════════════════════════════════════════════════════════════════════════════

const SYSTEM_PROMPT = `You are an expert QA automation engineer specialized in Playwright test repair.

Your task is to diagnose and fix a broken Playwright test based on:
1. The original test code that's failing
2. The error message from Playwright
3. The current state of the DOM (interactive elements available now)
4. Console logs at the time of failure

You can fix two types of issues:

**Selector issues** — the element exists but the selector changed:
- '#login-btn' → '[data-testid="login-button"]'
- '.submit' → 'button:has-text("Send")'
- Always prefer stable selectors: data-testid > role > aria-label > text > id > class

**Assertion issues** — the page changed but the test expectation is outdated:
- expect(text).toBe('Login') → expect(text).toBe('Sign in')
- expect(url).toContain('/dashboard') → expect(url).toContain('/home')

You must respond with ONLY a JSON object (no markdown, no prose) with this structure:

{
  "diagnosis": "Brief human explanation in Spanish of what's broken and why",
  "confidence": 0.85,
  "fixable": true,
  "changes": [
    {
      "type": "selector" | "assert" | "wait" | "other",
      "line": 12,
      "old": "page.click('#login-btn')",
      "new": "page.click('[data-testid=\\"login-button\\"]')",
      "reason": "Brief reason in Spanish"
    }
  ],
  "proposed_code": "// full spec code with changes applied"
}

Rules:
- "confidence" must be between 0 and 1. Use 0.9+ only if you're very sure.
- If you can't identify a clear fix, set "fixable": false and explain in diagnosis.
- "proposed_code" must be the COMPLETE spec code with changes, ready to save.
- Keep the original structure: imports, test() wrapper, comments. Only change what's broken.
- If the error is a REAL bug in the product (not a flaky selector), set fixable: false.
- Diagnosis should be brief (1-3 sentences). The user needs a quick understanding.

For Spanish-speaking users, "diagnosis" and "reason" must be in Spanish.`

// ════════════════════════════════════════════════════════════════════════════
// MAIN ENTRY: REPAIR
// ════════════════════════════════════════════════════════════════════════════

/**
 * Inicia una sesión de reparación.
 *
 * @param {object} opts
 * @param {string} opts.organizationId
 * @param {string} opts.userId
 * @param {string} [opts.specId]       Si se da, repara el spec directo
 * @param {string} [opts.executionId]  Si se da, repara basándose en esta execution
 * @param {string} [opts.suiteRunId]
 * @param {boolean} [opts.forceReExecute=false]  Saltar el snapshot, ir directo a re-ejecutar
 *
 * @returns {Promise<object>} la repair_session creada con changes propuestos
 */
export async function startRepair(opts) {
  if (!isClaudeConfigured()) {
    throw new Error('El Repair Agent no está disponible (ANTHROPIC_API_KEY no configurado)')
  }

  const db = getDb()
  const startedAt = Date.now()

  // ── Cargar contexto ────────────────────────────────────────────────────
  const { execution, spec, originalCode } = await _loadContext(opts)

  if (!originalCode?.trim()) {
    throw new Error('No se encontró código del spec a reparar')
  }

  // Crear sesión en estado pending
  const [session] = await db.insert(schema.repairSessions).values({
    organizationId:    opts.organizationId,
    userId:            opts.userId,
    specId:            opts.specId || execution?.id || null,
    executionId:       opts.executionId || null,
    suiteRunId:        opts.suiteRunId || null,
    status:            'pending',
    originalCode,
    investigationMode: opts.forceReExecute ? 're_execute' : 'snapshot',
  }).returning()

  try {
    // ── Investigar DOM ─────────────────────────────────────────────────────
    await _updateStatus(session.id, 'analyzing_snapshot')

    let domContext = null
    if (!opts.forceReExecute && execution) {
      domContext = await investigateFromSnapshot(execution)
    }

    if (!domContext && execution?.targetUrl) {
      await _updateStatus(session.id, 're_executing')
      domContext = await investigateByReExecuting({
        specCode:        originalCode,
        targetUrl:       execution.targetUrl,
        failedStepIndex: execution.failedStepIndex,
      })
      await db.update(schema.repairSessions)
        .set({ investigationMode: 're_execute' })
        .where(eq(schema.repairSessions.id, session.id))
    }

    if (!domContext) {
      throw new Error('No se pudo obtener contexto del DOM. ¿La URL target sigue accesible?')
    }

    // ── Llamar a Claude (estrategia escalonada Haiku → Sonnet) ────────────
    await _updateStatus(session.id, 'generating_repair')

    const userPrompt = _buildUserPrompt({ originalCode, execution, domContext })

    // ════ PASS 1: HAIKU 4.5 ════════════════════════════════════════════════
    // Más barato (~$0.01). El 50-60% de repairs son selectores triviales que
    // Haiku resuelve perfectamente.
    const haikuResult = await callClaudeForJson({
      system:       SYSTEM_PROMPT,
      messages:     userPrompt,
      model:        MODELS.HAIKU,
      maxTokens:    4096,
      temperature:  0,
      cacheSystem:  true,    // ← Prompt caching del system prompt
    })

    const haikuAi = haikuResult.json
    if (typeof haikuAi.fixable !== 'boolean') {
      throw new Error('Respuesta de Haiku inválida: falta "fixable"')
    }

    const haikuConfidence = parseFloat(haikuAi.confidence) || 0

    // ¿Aceptamos el resultado de Haiku? Sí, si:
    //   - Haiku dice fixable=true CON confianza ≥ threshold
    //   - O Haiku dice fixable=false (significa: ni Sonnet lo arreglaría)
    //
    // Escalamos a Sonnet si:
    //   - Haiku dice fixable=true PERO confidence < threshold
    //   (no escalamos en "fixable=false" porque ahí Haiku ya hizo su análisis)
    const shouldEscalate = haikuAi.fixable === true && haikuConfidence < HAIKU_CONFIDENCE_THRESHOLD

    let finalResult = haikuResult
    let finalAi     = haikuAi
    let escalated   = false

    if (shouldEscalate) {
      // ════ PASS 2: SONNET 4.6 (solo si Haiku no estaba seguro) ═══════════
      // Le pasamos el prompt + el intento de Haiku como contexto
      // (Sonnet decide independientemente: puede confirmar, mejorar o rechazar)
      console.log(`[Repair ${session.id}] Escalando a Sonnet (Haiku confidence=${haikuConfidence})`)
      escalated = true

      const escalatedPrompt = userPrompt + `

## Intento previo (Haiku 4.5)

Un modelo más pequeño ya analizó este caso. Su análisis fue:

\`\`\`json
${JSON.stringify({
  diagnosis: haikuAi.diagnosis,
  confidence: haikuAi.confidence,
  changes: haikuAi.changes,
}, null, 2)}
\`\`\`

Considera el análisis previo PERO toma tu propia decisión. Puedes:
- Confirmar el diagnóstico si lo encuentras correcto
- Mejorarlo si ves un mejor selector o assert
- Rechazarlo si el análisis es incorrecto
- Detectar issues que Haiku no vio`

      const sonnetResult = await callClaudeForJson({
        system:       SYSTEM_PROMPT,
        messages:     escalatedPrompt,
        model:        MODELS.SONNET,
        maxTokens:    4096,
        temperature:  0,
        cacheSystem:  true,
      })

      const sonnetAi = sonnetResult.json
      if (typeof sonnetAi.fixable !== 'boolean') {
        // Sonnet falló de algún modo. Fallback al resultado de Haiku.
        console.warn(`[Repair ${session.id}] Sonnet respondió inválido, usando Haiku`)
      } else {
        finalResult = sonnetResult
        finalAi     = sonnetAi
      }
    }

    // ── Persistir resultado ───────────────────────────────────────────────
    const durationMs = Date.now() - startedAt
    const finalStatus = finalAi.fixable === false ? 'failed' : 'awaiting_approval'

    // Tokens TOTALES (Haiku siempre + Sonnet si escaló)
    const totalInputTokens  = haikuResult.usage.inputTokens
                            + haikuResult.usage.cacheCreationTokens
                            + haikuResult.usage.cacheReadTokens
                            + (escalated ? finalResult.usage.inputTokens
                                         + finalResult.usage.cacheCreationTokens
                                         + finalResult.usage.cacheReadTokens : 0)
    const totalOutputTokens = haikuResult.usage.outputTokens
                            + (escalated ? finalResult.usage.outputTokens : 0)
    const totalCostUsd      = haikuResult.usage.costUsd
                            + (escalated ? finalResult.usage.costUsd : 0)

    const [updated] = await db.update(schema.repairSessions).set({
      status:           finalStatus,
      diagnosis:        finalAi.diagnosis || 'Sin diagnóstico',
      confidenceScore:  finalAi.confidence != null ? String(finalAi.confidence) : null,
      proposedCode:     finalAi.fixable ? (finalAi.proposed_code || null) : null,
      changes:          finalAi.changes || [],
      tokensInput:      totalInputTokens,
      tokensOutput:     totalOutputTokens,
      modelUsed:        escalated
                          ? `${MODELS.HAIKU} → ${finalResult.model}`
                          : finalResult.model,
      durationMs,
      errorMessage:     finalAi.fixable === false ? finalAi.diagnosis : null,
      updatedAt:        new Date(),
    })
      .where(eq(schema.repairSessions.id, session.id))
      .returning()

    // ── Incrementar uso mensual (combina ambos passes) ────────────────────
    await _incrementUsage(opts.organizationId, {
      inputTokens:  totalInputTokens,
      outputTokens: totalOutputTokens,
      costUsd:      totalCostUsd,
    })

    return updated
  } catch (err) {
    console.error(`[Repair] error en session ${session.id}:`, err)
    await db.update(schema.repairSessions).set({
      status:        'failed',
      errorMessage:  err.message,
      durationMs:    Date.now() - startedAt,
      updatedAt:     new Date(),
    }).where(eq(schema.repairSessions.id, session.id))
    throw err
  }
}

// ════════════════════════════════════════════════════════════════════════════
// APPLY / REJECT / ROLLBACK
// ════════════════════════════════════════════════════════════════════════════

/**
 * Aplica los cambios propuestos al spec y crea una nueva revision.
 */
export async function applyRepair({ sessionId, userId }) {
  const db = getDb()
  const [session] = await db.select().from(schema.repairSessions)
    .where(eq(schema.repairSessions.id, sessionId)).limit(1)
  if (!session) throw new Error('Sesión de repair no encontrada')

  if (session.status !== 'awaiting_approval') {
    throw new Error(`No se puede aplicar: status actual es "${session.status}"`)
  }
  if (!session.proposedCode) {
    throw new Error('No hay código propuesto para aplicar')
  }
  if (!session.specId) {
    throw new Error('La sesión no está vinculada a un spec')
  }

  // ── Determinar próxima versión ─────────────────────────────────────────
  const [{ maxVersion }] = await db.select({
    maxVersion: sql`COALESCE(MAX(${schema.specRevisions.version}), 0)`,
  })
    .from(schema.specRevisions)
    .where(eq(schema.specRevisions.specId, session.specId))

  const nextVersion = Number(maxVersion) + 1

  // ── Guardar la versión actual (snapshot pre-cambio) ───────────────────
  // Solo si no existe ya una versión 1 (primera ejecución del repair)
  if (nextVersion === 1) {
    await db.insert(schema.specRevisions).values({
      organizationId: session.organizationId,
      specId:         session.specId,
      version:        0,                   // versión "base"
      code:           session.originalCode,
      source:         'manual',
      createdBy:      userId,
    }).onConflictDoNothing()
  }

  // ── Insertar nueva revision con el código propuesto ───────────────────
  await db.insert(schema.specRevisions).values({
    organizationId:   session.organizationId,
    specId:           session.specId,
    version:          nextVersion,
    code:             session.proposedCode,
    source:           'repair_agent',
    repairSessionId:  session.id,
    createdBy:        userId,
  })

  // ── Actualizar el spec (tabla principal — puede ser test_specs o test_suite_specs) ──
  await _updateSpecCode(session.specId, session.proposedCode)

  // ── Marcar sesión como applied ────────────────────────────────────────
  const [updated] = await db.update(schema.repairSessions).set({
    status:            'applied',
    appliedAt:         new Date(),
    appliedBy:         userId,
    appliedToVersion:  nextVersion,
    updatedAt:         new Date(),
  })
    .where(eq(schema.repairSessions.id, sessionId))
    .returning()

  return { ...updated, newVersion: nextVersion }
}

/**
 * Rechaza un repair propuesto (no aplica nada).
 */
export async function rejectRepair({ sessionId, userId, reason }) {
  const db = getDb()
  const [updated] = await db.update(schema.repairSessions).set({
    status:           'rejected',
    rejectedAt:       new Date(),
    rejectionReason:  reason?.trim() || null,
    updatedAt:        new Date(),
  })
    .where(eq(schema.repairSessions.id, sessionId))
    .returning()
  if (!updated) throw new Error('Sesión no encontrada')
  return updated
}

/**
 * Revierte un repair aplicado (restaura la revision anterior).
 */
export async function rollbackRepair({ sessionId, userId }) {
  const db = getDb()
  const [session] = await db.select().from(schema.repairSessions)
    .where(eq(schema.repairSessions.id, sessionId)).limit(1)
  if (!session) throw new Error('Sesión no encontrada')
  if (session.status !== 'applied') {
    throw new Error('Solo se puede revertir un repair que ya fue aplicado')
  }
  if (!session.rollbackAvailable) {
    throw new Error('Rollback no disponible para este repair')
  }
  if (!session.appliedToVersion) {
    throw new Error('No hay versión registrada para revertir')
  }

  // Buscar la revision anterior
  const previousVersion = session.appliedToVersion - 1
  const [prev] = await db.select().from(schema.specRevisions)
    .where(and(
      eq(schema.specRevisions.specId, session.specId),
      eq(schema.specRevisions.version, previousVersion),
    )).limit(1)

  if (!prev) {
    throw new Error(`No se encontró la versión ${previousVersion} para revertir`)
  }

  // Restaurar el código
  await _updateSpecCode(session.specId, prev.code)

  // Marcar como no-rollbackable (ya se usó)
  await db.update(schema.repairSessions).set({
    rollbackAvailable: false,
    updatedAt:         new Date(),
  }).where(eq(schema.repairSessions.id, sessionId))

  return { restoredFromVersion: previousVersion, code: prev.code }
}

// ════════════════════════════════════════════════════════════════════════════
// LISTING / DETAIL
// ════════════════════════════════════════════════════════════════════════════

export async function getRepairSession(sessionId, organizationId) {
  const db = getDb()
  const [session] = await db.select().from(schema.repairSessions)
    .where(and(
      eq(schema.repairSessions.id, sessionId),
      eq(schema.repairSessions.organizationId, organizationId),
    )).limit(1)
  return session || null
}

export async function listRepairSessionsForSpec({ specId, organizationId, limit = 20 }) {
  const db = getDb()
  return db.select().from(schema.repairSessions)
    .where(and(
      eq(schema.repairSessions.specId, specId),
      eq(schema.repairSessions.organizationId, organizationId),
    ))
    .orderBy(sql`${schema.repairSessions.createdAt} DESC`)
    .limit(limit)
}

export async function getCurrentMonthUsage(organizationId) {
  const db = getDb()
  const now = new Date()
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth() + 1
  const [usage] = await db.select().from(schema.repairUsage)
    .where(and(
      eq(schema.repairUsage.organizationId, organizationId),
      eq(schema.repairUsage.year, year),
      eq(schema.repairUsage.month, month),
    )).limit(1)
  return usage || { repairCount: 0, tokensUsed: 0, tokensCostUsd: '0' }
}

// ════════════════════════════════════════════════════════════════════════════
// HELPERS INTERNOS
// ════════════════════════════════════════════════════════════════════════════

async function _updateStatus(sessionId, status) {
  const db = getDb()
  await db.update(schema.repairSessions)
    .set({ status, updatedAt: new Date() })
    .where(eq(schema.repairSessions.id, sessionId))
}

/**
 * Carga la execution y el spec asociado para construir el contexto.
 */
async function _loadContext({ specId, executionId }) {
  const db = getDb()

  let execution = null
  if (executionId) {
    const [e] = await db.select().from(schema.executions)
      .where(eq(schema.executions.id, executionId)).limit(1)
    execution = e || null
  }

  // El "spec" puede ser:
  //   - test_specs (creación standalone)
  //   - test_suite_specs (parte de una suite)
  //   - el specCode de un execution directo
  let spec = null
  let originalCode = null

  if (specId) {
    // Probar primero como testSpecs (si existe)
    if (schema.testSpecs) {
      const [s] = await db.select().from(schema.testSpecs)
        .where(eq(schema.testSpecs.id, specId)).limit(1).catch(() => [null])
      if (s) { spec = s; originalCode = s.code }
    }
    // Probar como testSuiteSpecs
    if (!spec && schema.testSuiteSpecs) {
      const [s] = await db.select().from(schema.testSuiteSpecs)
        .where(eq(schema.testSuiteSpecs.id, specId)).limit(1).catch(() => [null])
      if (s) { spec = s; originalCode = s.code || s.specCode }
    }
  }

  // Fallback: usar el specCode del execution directamente
  if (!originalCode && execution?.specCode) {
    originalCode = execution.specCode
  }

  return { execution, spec, originalCode }
}

/**
 * Actualiza el código del spec en la tabla correspondiente.
 */
async function _updateSpecCode(specId, newCode) {
  const db = getDb()

  // Intentar testSpecs primero
  if (schema.testSpecs) {
    try {
      const r = await db.update(schema.testSpecs).set({
        code:      newCode,
        updatedAt: new Date(),
      }).where(eq(schema.testSpecs.id, specId)).returning()
      if (r.length > 0) return
    } catch {}
  }

  // testSuiteSpecs como fallback
  if (schema.testSuiteSpecs) {
    try {
      // Usar el campo 'code' o 'specCode' según exista
      const update = schema.testSuiteSpecs.code
        ? { code: newCode, updatedAt: new Date() }
        : { specCode: newCode, updatedAt: new Date() }
      await db.update(schema.testSuiteSpecs).set(update)
        .where(eq(schema.testSuiteSpecs.id, specId))
    } catch {}
  }
}

/**
 * Construye el prompt para Claude con todo el contexto.
 */
function _buildUserPrompt({ originalCode, execution, domContext }) {
  const parts = []

  parts.push('## Test code que está fallando')
  parts.push('```javascript')
  parts.push(originalCode)
  parts.push('```')

  if (execution?.errorMessage) {
    parts.push('\n## Error de Playwright')
    parts.push('```')
    parts.push(execution.errorMessage.slice(0, 2000))
    parts.push('```')
  }

  if (execution?.failedSelector) {
    parts.push(`\n## Selector que falló: \`${execution.failedSelector}\``)
  }
  if (execution?.failedAction) {
    parts.push(`Acción que falló: \`${execution.failedAction}\``)
  }
  if (execution?.failedStepIndex !== null && execution?.failedStepIndex !== undefined) {
    parts.push(`Step index fallido: ${execution.failedStepIndex}`)
  }

  parts.push('\n## Estado actual de la página')
  if (domContext.pageUrl)   parts.push(`URL: ${domContext.pageUrl}`)
  if (domContext.pageTitle) parts.push(`Title: ${domContext.pageTitle}`)
  parts.push(`Investigación obtenida vía: ${domContext.source}`)

  // Elementos interactivos
  if (domContext.interactiveElements?.length > 0) {
    parts.push('\n### Elementos interactivos disponibles (top 30)')
    const slim = domContext.interactiveElements.slice(0, 30).map(e => {
      const parts = []
      parts.push(`<${e.tag}`)
      if (e.id) parts.push(`id="${e.id}"`)
      if (e.testid) parts.push(`data-testid="${e.testid}"`)
      if (e.ariaLabel) parts.push(`aria-label="${e.ariaLabel}"`)
      if (e.name) parts.push(`name="${e.name}"`)
      if (e.type) parts.push(`type="${e.type}"`)
      if (e.placeholder) parts.push(`placeholder="${e.placeholder}"`)
      if (e.role) parts.push(`role="${e.role}"`)
      if (e.className) parts.push(`class="${(e.className || '').slice(0, 80)}"`)
      let s = parts.join(' ') + '>'
      if (e.text) s += `  ${e.text.slice(0, 80)}`
      return s
    }).join('\n')
    parts.push('```html')
    parts.push(slim)
    parts.push('```')
  }

  // Console logs (errores son los más relevantes)
  if (domContext.consoleLogs?.length > 0) {
    const errors = domContext.consoleLogs.filter(l => l.type === 'error').slice(0, 5)
    if (errors.length > 0) {
      parts.push('\n### Errores en consola del browser')
      parts.push(errors.map(e => `- [${e.type}] ${e.text}`).join('\n'))
    }
  }

  parts.push('\n## Tu tarea')
  parts.push('Diagnostica el problema y propón cambios mínimos para que el test pase. Responde SOLO con el JSON estructurado.')

  return parts.join('\n')
}

/**
 * Incrementa el contador mensual de uso.
 */
async function _incrementUsage(organizationId, usage) {
  const db = getDb()
  const now = new Date()
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth() + 1
  const totalTokens = (usage.inputTokens || 0) + (usage.outputTokens || 0)
  const costUsd = usage.costUsd || 0

  // UPSERT
  const existing = await db.select().from(schema.repairUsage)
    .where(and(
      eq(schema.repairUsage.organizationId, organizationId),
      eq(schema.repairUsage.year, year),
      eq(schema.repairUsage.month, month),
    )).limit(1)

  if (existing.length > 0) {
    await db.update(schema.repairUsage).set({
      repairCount:     sql`${schema.repairUsage.repairCount} + 1`,
      tokensUsed:      sql`${schema.repairUsage.tokensUsed} + ${totalTokens}`,
      tokensCostUsd:   sql`(${schema.repairUsage.tokensCostUsd}::numeric + ${costUsd})::text`,
      updatedAt:       new Date(),
    }).where(eq(schema.repairUsage.id, existing[0].id))
  } else {
    await db.insert(schema.repairUsage).values({
      organizationId,
      year,
      month,
      repairCount:   1,
      tokensUsed:    totalTokens,
      tokensCostUsd: String(costUsd),
    })
  }
}
