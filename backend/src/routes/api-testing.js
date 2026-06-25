/**
 * Rutas de API Testing
 *
 * Endpoints expuestos:
 *
 *   POST   /api/api-testing/collections           Crear desde contrato
 *   GET    /api/api-testing/collections           Listar
 *   GET    /api/api-testing/collections/:id       Detalle + casos generados
 *   PUT    /api/api-testing/collections/:id       Editar metadatos
 *   DELETE /api/api-testing/collections/:id
 *
 *   POST   /api/api-testing/collections/:id/regenerate    Re-genera casos
 *   POST   /api/api-testing/collections/:id/secrets       Guarda un secret
 *   GET    /api/api-testing/collections/:id/secrets       Lista (sin valores)
 *   DELETE /api/api-testing/collections/:id/secrets/:secretId
 *
 *   POST   /api/api-testing/collections/:id/run           Ejecuta la colección
 *   GET    /api/api-testing/runs/:runId                   Detalle del run
 *   GET    /api/api-testing/runs/:runId/stream            SSE en vivo
 */

import { eq, and, desc, inArray }       from 'drizzle-orm'

import { getDb, schema }                from '../db/client.js'
import { authenticate, requireFeature } from '../middleware/auth.js'
import { parseOpenApi }                 from '../parsers/openapi-parser.js'
import { parsePostman }                 from '../parsers/postman-parser.js'
import { generateAllTestCases }         from '../services/api-test-generator.js'
import { buildSecretRow }               from '../services/crypto-vault.js'
import { runApiCollection, subscribeToApiRun } from '../services/api-test-runner.js'

export async function apiTestingRoutes(app) {

  // ── POST /api/api-testing/collections ────────────────────────────────────
  // Crear una colección desde un contrato.
  // Body: { name, description, contractType, contract, baseUrl }
  app.post('/collections', { preHandler: [authenticate, requireFeature('apiTesting')] }, async (req, reply) => {
    const { name, description, contractType, contract, baseUrl } = req.body || {}

    if (!name?.trim() || !contractType || !contract) {
      return reply.code(400).send({
        success: false,
        error:   'name, contractType y contract son requeridos',
      })
    }

    if (!['openapi', 'postman'].includes(contractType)) {
      return reply.code(400).send({
        success: false,
        error:   'contractType debe ser openapi o postman',
      })
    }

    let parsed
    try {
      if (contractType === 'openapi') parsed = parseOpenApi(contract)
      else                            parsed = parsePostman(contract)
    } catch (err) {
      return reply.code(400).send({
        success: false,
        error:   `No se pudo parsear el contrato: ${err.message}`,
      })
    }

    if (!parsed.endpoints || parsed.endpoints.length === 0) {
      return reply.code(400).send({
        success: false,
        error:   'El contrato no contiene endpoints válidos',
      })
    }

    const db = getDb()
    const finalBaseUrl = baseUrl || parsed.servers[0]?.url || null

    // Detectar endpoints sospechosos para sugerir auth/OTP al usuario
    const suspectedOtpEndpoints  = parsed.endpoints.filter(e => e.suspectedOtp).map(e => `${e.method} ${e.path}`)
    const suspectedAuthEndpoints = parsed.endpoints.filter(e => e.suspectedAuth).map(e => `${e.method} ${e.path}`)

    const [collection] = await db.insert(schema.apiCollections).values({
      userId:         req.user.userId,
      organizationId: req.user.organizationId || null,
      name:           name.trim(),
      description:    description?.trim() || null,
      contractType,
      contractData:   parsed,
      baseUrl:        finalBaseUrl,
      authConfig:     { type: 'none' },
      encryptionConfig: { enabled: false },
      otpConfig:      { enabled: false },
      totalEndpoints: parsed.endpoints.length,
      totalTests:     0,
    }).returning()

    // Generar casos de prueba en background (no bloquear la respuesta)
    _generateCasesAsync(collection.id, parsed)

    return reply.code(201).send({
      success: true,
      data: {
        collection,
        suggestions: {
          suspectedOtpEndpoints,
          suspectedAuthEndpoints,
          hasSecuritySchemes: parsed.endpoints.some(e => e.security),
        },
      },
    })
  })

  // ── GET /api/api-testing/collections ─────────────────────────────────────
  app.get('/collections', { preHandler: [authenticate, requireFeature('apiTesting')] }, async (req, reply) => {
    const db = getDb()
    const list = await db.select({
      id:             schema.apiCollections.id,
      name:           schema.apiCollections.name,
      description:    schema.apiCollections.description,
      contractType:   schema.apiCollections.contractType,
      baseUrl:        schema.apiCollections.baseUrl,
      totalEndpoints: schema.apiCollections.totalEndpoints,
      totalTests:     schema.apiCollections.totalTests,
      createdAt:      schema.apiCollections.createdAt,
      updatedAt:      schema.apiCollections.updatedAt,
    })
      .from(schema.apiCollections)
      .where(eq(schema.apiCollections.userId, req.user.userId))
      .orderBy(desc(schema.apiCollections.updatedAt))

    return reply.send({ success: true, data: list })
  })

  // ── GET /api/api-testing/collections/:id ─────────────────────────────────
  app.get('/collections/:id', { preHandler: [authenticate, requireFeature('apiTesting')] }, async (req, reply) => {
    const db = getDb()
    const [collection] = await db.select().from(schema.apiCollections)
      .where(and(
        eq(schema.apiCollections.id, req.params.id),
        eq(schema.apiCollections.userId, req.user.userId),
      )).limit(1)

    if (!collection) return reply.code(404).send({ success: false, error: 'No encontrada' })

    // Cargar casos
    const cases = await db.select().from(schema.apiTestCases)
      .where(eq(schema.apiTestCases.collectionId, collection.id))
      .orderBy(schema.apiTestCases.order)

    // Cargar secretos (sin valores!)
    const secrets = await db.select({
      id:          schema.apiTestSecrets.id,
      secretType:  schema.apiTestSecrets.secretType,
      label:       schema.apiTestSecrets.label,
      displayHint: schema.apiTestSecrets.displayHint,
      createdAt:   schema.apiTestSecrets.createdAt,
    })
      .from(schema.apiTestSecrets)
      .where(eq(schema.apiTestSecrets.collectionId, collection.id))

    // Últimos 5 runs
    const recentRuns = await db.select().from(schema.apiTestRuns)
      .where(eq(schema.apiTestRuns.collectionId, collection.id))
      .orderBy(desc(schema.apiTestRuns.createdAt))
      .limit(5)

    return reply.send({
      success: true,
      data: { ...collection, cases, secrets, recentRuns },
    })
  })

  // ── PUT /api/api-testing/collections/:id ─────────────────────────────────
  // Edita metadatos y configs (auth, encryption, otp) — no las llaves
  app.put('/collections/:id', { preHandler: [authenticate, requireFeature('apiTesting')] }, async (req, reply) => {
    const { name, description, baseUrl, authConfig, encryptionConfig, otpConfig } = req.body || {}
    const updates = { updatedAt: new Date() }

    if (name !== undefined)             updates.name = name.trim()
    if (description !== undefined)      updates.description = description?.trim() || null
    if (baseUrl !== undefined)          updates.baseUrl = baseUrl
    if (authConfig !== undefined)       updates.authConfig = authConfig
    if (encryptionConfig !== undefined) updates.encryptionConfig = encryptionConfig
    if (otpConfig !== undefined)        updates.otpConfig = otpConfig

    const db = getDb()
    const [updated] = await db.update(schema.apiCollections)
      .set(updates)
      .where(and(
        eq(schema.apiCollections.id, req.params.id),
        eq(schema.apiCollections.userId, req.user.userId),
      ))
      .returning()

    if (!updated) return reply.code(404).send({ success: false, error: 'No encontrada' })
    return reply.send({ success: true, data: updated })
  })

  // ── DELETE /api/api-testing/collections/:id ──────────────────────────────
  app.delete('/collections/:id', { preHandler: [authenticate, requireFeature('apiTesting')] }, async (req, reply) => {
    const db = getDb()
    const deleted = await db.delete(schema.apiCollections)
      .where(and(
        eq(schema.apiCollections.id, req.params.id),
        eq(schema.apiCollections.userId, req.user.userId),
      ))
      .returning()

    if (deleted.length === 0) return reply.code(404).send({ success: false, error: 'No encontrada' })
    return reply.send({ success: true, data: { deleted: true } })
  })

  // ── POST /api/api-testing/collections/:id/regenerate ─────────────────────
  app.post('/collections/:id/regenerate', { preHandler: [authenticate, requireFeature('apiTesting')] }, async (req, reply) => {
    const db = getDb()
    const [collection] = await db.select().from(schema.apiCollections)
      .where(and(
        eq(schema.apiCollections.id, req.params.id),
        eq(schema.apiCollections.userId, req.user.userId),
      )).limit(1)
    if (!collection) return reply.code(404).send({ success: false, error: 'No encontrada' })

    // Borrar casos viejos
    await db.delete(schema.apiTestCases)
      .where(eq(schema.apiTestCases.collectionId, collection.id))

    // Regenerar
    _generateCasesAsync(collection.id, collection.contractData)

    return reply.send({ success: true, data: { message: 'Regenerando casos en background' } })
  })

  // ── POST /api/api-testing/collections/:id/secrets ────────────────────────
  // Guarda un secreto (encriptado con master key del servidor)
  // Body: { secretType, label, value }
  app.post('/collections/:id/secrets', { preHandler: [authenticate, requireFeature('apiTesting')] }, async (req, reply) => {
    const { secretType, label, value } = req.body || {}

    if (!secretType || !label || !value) {
      return reply.code(400).send({
        success: false,
        error:   'secretType, label y value son requeridos',
      })
    }

    const validTypes = [
      'encryption_key', 'hmac_secret', 'otp_secret',
      'bearer_token',   'api_key',     'password',
      'username',       'oauth_client_secret', 'oauth_client_id',
    ]
    if (!validTypes.includes(secretType)) {
      return reply.code(400).send({
        success: false,
        error:   `secretType inválido. Debe ser: ${validTypes.join(', ')}`,
      })
    }

    const db = getDb()
    const [collection] = await db.select().from(schema.apiCollections)
      .where(and(
        eq(schema.apiCollections.id, req.params.id),
        eq(schema.apiCollections.userId, req.user.userId),
      )).limit(1)
    if (!collection) return reply.code(404).send({ success: false, error: 'No encontrada' })

    // Si ya existe ese type+label, sobreescribir
    const existing = await db.select().from(schema.apiTestSecrets)
      .where(and(
        eq(schema.apiTestSecrets.collectionId, collection.id),
        eq(schema.apiTestSecrets.secretType, secretType),
        eq(schema.apiTestSecrets.label, label),
      )).limit(1)

    const row = buildSecretRow({
      collectionId: collection.id,
      userId:       req.user.userId,
      secretType,
      label,
      plaintext:    value,
    })

    if (existing.length > 0) {
      const [updated] = await db.update(schema.apiTestSecrets).set({
        encryptedValue: row.encryptedValue,
        iv:             row.iv,
        authTag:        row.authTag,
        displayHint:    row.displayHint,
        updatedAt:      new Date(),
      })
        .where(eq(schema.apiTestSecrets.id, existing[0].id))
        .returning()

      return reply.send({
        success: true,
        data: {
          id:          updated.id,
          secretType:  updated.secretType,
          label:       updated.label,
          displayHint: updated.displayHint,
        },
      })
    }

    const [inserted] = await db.insert(schema.apiTestSecrets).values(row).returning()

    return reply.code(201).send({
      success: true,
      data: {
        id:          inserted.id,
        secretType:  inserted.secretType,
        label:       inserted.label,
        displayHint: inserted.displayHint,
      },
    })
  })

  // ── GET /api/api-testing/collections/:id/secrets ─────────────────────────
  // Lista los secretos (sin valores, solo metadata)
  app.get('/collections/:id/secrets', { preHandler: [authenticate, requireFeature('apiTesting')] }, async (req, reply) => {
    const db = getDb()
    const secrets = await db.select({
      id:          schema.apiTestSecrets.id,
      secretType:  schema.apiTestSecrets.secretType,
      label:       schema.apiTestSecrets.label,
      displayHint: schema.apiTestSecrets.displayHint,
      createdAt:   schema.apiTestSecrets.createdAt,
    })
      .from(schema.apiTestSecrets)
      .where(eq(schema.apiTestSecrets.collectionId, req.params.id))

    return reply.send({ success: true, data: secrets })
  })

  // ── DELETE /api/api-testing/collections/:id/secrets/:secretId ────────────
  app.delete('/collections/:id/secrets/:secretId', { preHandler: [authenticate, requireFeature('apiTesting')] }, async (req, reply) => {
    const db = getDb()
    await db.delete(schema.apiTestSecrets)
      .where(and(
        eq(schema.apiTestSecrets.id, req.params.secretId),
        eq(schema.apiTestSecrets.collectionId, req.params.id),
      ))
    return reply.send({ success: true, data: { deleted: true } })
  })

  // ── POST /api/api-testing/collections/:id/run ────────────────────────────
  app.post('/collections/:id/run', { preHandler: [authenticate, requireFeature('apiTesting')] }, async (req, reply) => {
    const { baseUrl } = req.body || {}
    const db = getDb()

    const [collection] = await db.select().from(schema.apiCollections)
      .where(and(
        eq(schema.apiCollections.id, req.params.id),
        eq(schema.apiCollections.userId, req.user.userId),
      )).limit(1)
    if (!collection) return reply.code(404).send({ success: false, error: 'No encontrada' })

    // Contar casos activos
    const cases = await db.select({ count: schema.apiTestCases.id })
      .from(schema.apiTestCases)
      .where(and(
        eq(schema.apiTestCases.collectionId, collection.id),
        eq(schema.apiTestCases.enabled, true),
      ))

    if (cases.length === 0) {
      return reply.code(400).send({
        success: false,
        error:   'La colección no tiene casos generados. Espera unos segundos a que terminen.',
      })
    }

    // Crear el run
    const [run] = await db.insert(schema.apiTestRuns).values({
      collectionId: collection.id,
      userId:       req.user.userId,
      status:       'pending',
      baseUrl:      baseUrl || collection.baseUrl,
      totalTests:   cases.length,
    }).returning()

    // Ejecutar en background (NO esperamos)
    runApiCollection({ runId: run.id, collectionId: collection.id, userId: req.user.userId })
      .catch(err => {
        console.error(`[ApiRun ${run.id}] Error:`, err)
      })

    return reply.code(201).send({
      success: true,
      data: {
        runId:     run.id,
        streamUrl: `/api/api-testing/runs/${run.id}/stream`,
      },
    })
  })

  // ── GET /api/api-testing/runs/:runId ─────────────────────────────────────
  app.get('/runs/:runId', { preHandler: [authenticate, requireFeature('apiTesting')] }, async (req, reply) => {
    const db = getDb()
    const [run] = await db.select().from(schema.apiTestRuns)
      .where(and(
        eq(schema.apiTestRuns.id, req.params.runId),
        eq(schema.apiTestRuns.userId, req.user.userId),
      )).limit(1)
    if (!run) return reply.code(404).send({ success: false, error: 'Run no encontrado' })

    // Cargar resultados con nombre del test
    const results = await db.select({
      id:                schema.apiTestResults.id,
      testCaseId:        schema.apiTestResults.testCaseId,
      status:            schema.apiTestResults.status,
      durationMs:        schema.apiTestResults.durationMs,
      actualMethod:      schema.apiTestResults.actualMethod,
      actualUrl:         schema.apiTestResults.actualUrl,
      actualStatus:      schema.apiTestResults.actualStatus,
      actualResponse:    schema.apiTestResults.actualResponse,
      validationResults: schema.apiTestResults.validationResults,
      errorMessage:      schema.apiTestResults.errorMessage,
      completedAt:       schema.apiTestResults.completedAt,
    })
      .from(schema.apiTestResults)
      .where(eq(schema.apiTestResults.runId, run.id))

    // Hidratar con info del test case
    const caseIds = results.map(r => r.testCaseId)
    const cases = caseIds.length
      ? await db.select({
          id:       schema.apiTestCases.id,
          testName: schema.apiTestCases.testName,
          category: schema.apiTestCases.category,
          endpoint: schema.apiTestCases.endpoint,
        })
          .from(schema.apiTestCases)
          .where(inArray(schema.apiTestCases.id, caseIds))
      : []

    const caseMap = Object.fromEntries(cases.map(c => [c.id, c]))
    const fullResults = results.map(r => ({
      ...r,
      testName: caseMap[r.testCaseId]?.testName,
      category: caseMap[r.testCaseId]?.category,
      endpoint: caseMap[r.testCaseId]?.endpoint,
    }))

    return reply.send({ success: true, data: { run, results: fullResults } })
  })

  // ── GET /api/api-testing/runs/:runId/stream ──────────────────────────────
  // SSE en vivo
  app.get('/runs/:runId/stream', { preHandler: [authenticate, requireFeature('apiTesting')] }, async (req, reply) => {
    const db = getDb()
    const [run] = await db.select().from(schema.apiTestRuns)
      .where(and(
        eq(schema.apiTestRuns.id, req.params.runId),
        eq(schema.apiTestRuns.userId, req.user.userId),
      )).limit(1)
    if (!run) return reply.code(404).send({ success: false, error: 'Run no encontrado' })

    reply.raw.writeHead(200, {
      'Content-Type':                'text/event-stream',
      'Cache-Control':               'no-cache, no-transform',
      'Connection':                  'keep-alive',
      'X-Accel-Buffering':           'no',
    })

    if (run.status === 'completed' || run.status === 'failed') {
      reply.raw.write(`event: final\ndata: ${JSON.stringify(run)}\n\n`)
      reply.raw.end()
      return
    }

    const heartbeat = setInterval(() => {
      try { reply.raw.write(`: ping\n\n`) } catch {}
    }, 15000)

    let unsubscribe = null
    try {
      unsubscribe = await subscribeToApiRun(run.id, (event) => {
        try {
          reply.raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`)
          if (event.type === 'completed') {
            setTimeout(() => {
              clearInterval(heartbeat)
              try { reply.raw.end() } catch {}
            }, 2000)
          }
        } catch {}
      })
    } catch (err) {
      reply.raw.write(`event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`)
      reply.raw.end()
      return
    }

    req.raw.on('close', async () => {
      clearInterval(heartbeat)
      if (unsubscribe) await unsubscribe()
    })
  })
}

// ── Generación async de casos ─────────────────────────────────────────────────

async function _generateCasesAsync(collectionId, parsed) {
  try {
    const db = getDb()
    const cases = await generateAllTestCases(parsed, { useAi: true })

    // Insertar en bulk
    if (cases.length > 0) {
      const rows = cases.map(c => ({
        collectionId,
        endpoint:        c.endpoint,
        testName:        c.testName,
        category:        c.category,
        generatedBy:     c.generatedBy,
        requestMethod:   c.requestMethod,
        requestPath:     c.requestPath,
        requestHeaders:  c.requestHeaders || {},
        requestQuery:    c.requestQuery || {},
        requestBody:     c.requestBody || null,
        captureVars:     c.captureVars || {},
        useVars:         c.useVars || [],
        needsEncryption: c.needsEncryption !== false,
        needsAuth:       c.needsAuth !== false,
        overrideAuth:    c.overrideAuth || false,
        expectedStatus:  c.expectedStatus,
        expectedSchema:  c.expectedSchema || null,
        validations:     c.validations || [],
        order:           c.order,
      }))

      // Insertar en chunks de 50
      for (let i = 0; i < rows.length; i += 50) {
        await db.insert(schema.apiTestCases).values(rows.slice(i, i + 50))
      }
    }

    await db.update(schema.apiCollections).set({
      totalTests: cases.length,
      updatedAt:  new Date(),
    }).where(eq(schema.apiCollections.id, collectionId))

    console.log(`[ApiGen] ✓ ${cases.length} tests generados para collection ${collectionId}`)
  } catch (err) {
    console.error(`[ApiGen] Error generando casos:`, err.message)
  }
}
