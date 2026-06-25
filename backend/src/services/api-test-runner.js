/**
 * API Test Runner
 *
 * Ejecuta una colección de tests de API en orden:
 *   1. Resuelve los secretos del vault
 *   2. Ejecuta el flow de auth (login, OTP si aplica)
 *   3. Para cada test case:
 *      a. Sustituye variables {{token}}, {{userId}}, etc en el path/headers/body
 *      b. Encripta el body si la config lo requiere
 *      c. Aplica HMAC si está configurado
 *      d. Envía el request via fetch
 *      e. Desencripta el response si la config lo requiere
 *      f. Valida status y schema con ajv-style validator
 *      g. Captura variables del response para los próximos tests
 *      h. Guarda el resultado en DB
 *   4. Genera resumen final
 *
 * Eventos Redis pub/sub:
 *   - status         { status, message }
 *   - test_started   { testCaseId, name }
 *   - test_finished  { testCaseId, status, durationMs }
 *   - progress       { completed, total, passed, failed }
 *   - completed      { passed, failed, durationMs }
 */

import { eq, asc }                          from 'drizzle-orm'
import { getDb, schema }                    from '../db/client.js'
import { getRedis }                         from './redis-client.js'
import { decryptSecret }                    from './crypto-vault.js'
import { executeAuthFlow }                  from './auth-flows.js'
import { encryptRequestPayload, decryptResponsePayload } from './payload-crypto.js'
import { validateAgainstSchema }            from './schema-validator.js'

/**
 * Ejecuta una colección completa.
 *
 * @param {object} opts
 * @param {string} opts.runId           ID del api_test_runs ya creado
 * @param {string} opts.collectionId
 * @param {string} opts.userId
 */
export async function runApiCollection({ runId, collectionId, userId }) {
  const db = getDb()
  const startedAt = Date.now()

  await db.update(schema.apiTestRuns).set({
    status: 'running', startedAt: new Date(runId === undefined ? undefined : Date.now()),
  }).where(eq(schema.apiTestRuns.id, runId))

  await _publish(runId, 'status', { status: 'running', message: 'Cargando configuración...' })

  // ── 1. Cargar colección y secretos ──────────────────────────────────────
  const [collection] = await db.select().from(schema.apiCollections)
    .where(eq(schema.apiCollections.id, collectionId)).limit(1)
  if (!collection) throw new Error('Collection no encontrada')

  const rawSecrets = await db.select().from(schema.apiTestSecrets)
    .where(eq(schema.apiTestSecrets.collectionId, collectionId))

  // Desencriptar los secretos del vault en memoria
  const secrets = {}
  for (const s of rawSecrets) {
    try {
      const value = decryptSecret({
        encryptedValue: s.encryptedValue,
        iv:             s.iv,
        authTag:        s.authTag,
      })
      secrets[s.label] = value
    } catch (err) {
      console.error(`[Runner] No se pudo desencriptar secret ${s.label}:`, err.message)
    }
  }

  // Cargar test cases en orden
  const testCases = await db.select().from(schema.apiTestCases)
    .where(eq(schema.apiTestCases.collectionId, collectionId))
    .orderBy(asc(schema.apiTestCases.order))

  const enabledCases = testCases.filter(t => t.enabled)
  const baseUrl = _resolveBaseUrl(collection)

  // ── 2. Ejecutar auth flow ───────────────────────────────────────────────
  let authHeaders = {}
  const vars = {}
  try {
    await _publish(runId, 'status', { status: 'authenticating', message: 'Ejecutando autenticación...' })

    const authConfig = collection.authConfig || {}
    const otpConfig = {
      ...(collection.otpConfig || {}),
      secret: secrets.otp_secret,    // Inyectar el secret desde vault
    }
    if (authConfig.type !== 'none' && authConfig.type) {
      const flow = await executeAuthFlow(authConfig, secrets, baseUrl, otpConfig)
      authHeaders = flow.headers
      Object.assign(vars, flow.vars)
    }
  } catch (err) {
    await db.update(schema.apiTestRuns).set({
      status: 'failed',
      completedAt: new Date(),
      durationMs: Date.now() - startedAt,
    }).where(eq(schema.apiTestRuns.id, runId))

    await _publish(runId, 'status', { status: 'failed', message: `Auth falló: ${err.message}` })
    return
  }

  // ── 3. Preparar encryption config con la key del vault ──────────────────
  const encConfig = collection.encryptionConfig?.enabled
    ? { ...collection.encryptionConfig, key: secrets.encryption_key, hmacSecret: secrets.hmac_secret }
    : null

  // ── 4. Ejecutar cada test ───────────────────────────────────────────────
  let passed = 0, failed = 0, skipped = 0
  await _publish(runId, 'status', { status: 'executing', message: `Ejecutando ${enabledCases.length} tests...` })

  for (const tc of enabledCases) {
    const result = await _runOneTest({
      runId, testCase: tc, baseUrl, authHeaders, encConfig, vars,
    })

    if      (result.status === 'passed') passed++
    else if (result.status === 'failed') failed++
    else                                 skipped++

    await _publish(runId, 'progress', {
      total:     enabledCases.length,
      completed: passed + failed + skipped,
      passed, failed, skipped,
    })
  }

  // ── 5. Resumen ──────────────────────────────────────────────────────────
  const durationMs = Date.now() - startedAt
  const finalStatus = failed > 0 ? 'failed' : 'completed'

  await db.update(schema.apiTestRuns).set({
    status:      finalStatus,
    passed, failed, skipped,
    durationMs,
    completedAt: new Date(),
  }).where(eq(schema.apiTestRuns.id, runId))

  await _publish(runId, 'completed', { status: finalStatus, passed, failed, skipped, durationMs })
}

// ── Ejecutar 1 test ──────────────────────────────────────────────────────────

async function _runOneTest({ runId, testCase, baseUrl, authHeaders, encConfig, vars }) {
  const db = getDb()
  const startedAt = Date.now()

  await _publish(runId, 'test_started', { testCaseId: testCase.id, name: testCase.testName })

  // Crear el registro de resultado pendiente
  const [resultRow] = await db.insert(schema.apiTestResults).values({
    runId,
    testCaseId: testCase.id,
    status:    'running',
    startedAt: new Date(),
  }).returning()

  let actualStatus, actualResponse, actualBody, actualUrl
  let validationResults = []
  let errorMessage = null
  let testStatus = 'passed'

  try {
    // ── 1. Resolver variables ────────────────────────────────────────────
    let path     = _substituteVars(testCase.requestPath, vars)
    const query  = _substituteVarsDeep(testCase.requestQuery, vars)
    let headers  = _substituteVarsDeep(testCase.requestHeaders || {}, vars)
    let body     = testCase.requestBody ? _substituteVarsDeep(testCase.requestBody, vars) : null

    // ── 2. Inyectar auth (salvo que el test la sobreescriba) ─────────────
    if (testCase.needsAuth && !testCase.overrideAuth) {
      headers = { ...authHeaders, ...headers }
    }

    // ── 3. Construir URL completa ────────────────────────────────────────
    let url = _resolveUrl(path, baseUrl)
    const qs = _buildQueryString(query)
    if (qs) url += (url.includes('?') ? '&' : '?') + qs
    actualUrl = url

    // ── 4. Encriptar body si aplica ──────────────────────────────────────
    let finalBody = body
    if (encConfig?.enabled && body !== null && testCase.needsEncryption !== false) {
      const enc = encryptRequestPayload(body, encConfig)
      finalBody = enc.body
      headers   = { ...headers, ...enc.headers }
    }
    actualBody = finalBody

    // ── 5. Enviar request ────────────────────────────────────────────────
    const init = {
      method:  testCase.requestMethod,
      headers: {
        'Content-Type': 'application/json',
        'Accept':       'application/json',
        ...headers,
      },
    }
    if (finalBody !== null && finalBody !== undefined && testCase.requestMethod !== 'GET') {
      init.body = typeof finalBody === 'string' ? finalBody : JSON.stringify(finalBody)
    }

    let res
    try {
      res = await fetch(url, init)
    } catch (err) {
      // Errores de red, DNS, etc.
      throw new Error(`Network error: ${err.message}`)
    }
    actualStatus = res.status

    // ── 6. Parsear response ──────────────────────────────────────────────
    const text = await res.text()
    let responseJson = text
    try { responseJson = JSON.parse(text) } catch {}

    // ── 7. Desencriptar response si aplica ───────────────────────────────
    if (encConfig?.enabled && typeof responseJson === 'object' && responseJson !== null) {
      responseJson = decryptResponsePayload(responseJson, encConfig)
    }
    actualResponse = responseJson

    // ── 8. Validaciones ──────────────────────────────────────────────────
    // 8a. Status code
    if (actualStatus !== testCase.expectedStatus) {
      validationResults.push({
        type: 'status',
        passed: false,
        expected: testCase.expectedStatus,
        actual: actualStatus,
      })
      testStatus = 'failed'
      errorMessage = `Status ${actualStatus}, esperado ${testCase.expectedStatus}`
    } else {
      validationResults.push({ type: 'status', passed: true, expected: testCase.expectedStatus, actual: actualStatus })
    }

    // 8b. Schema (solo para responses exitosos)
    if (testCase.expectedSchema && actualStatus >= 200 && actualStatus < 300) {
      const schemaResult = validateAgainstSchema(actualResponse, testCase.expectedSchema)
      validationResults.push({
        type:   'schema',
        passed: schemaResult.valid,
        errors: schemaResult.errors,
      })
      if (!schemaResult.valid && testStatus === 'passed') {
        testStatus = 'failed'
        errorMessage = `Schema inválido: ${schemaResult.errors[0]?.message || 'desconocido'}`
      }
    }

    // 8c. Validaciones adicionales custom
    for (const v of testCase.validations || []) {
      const r = _runCustomValidation(v, { actualStatus, actualResponse, headers: res.headers })
      validationResults.push(r)
      if (!r.passed && testStatus === 'passed') {
        testStatus = 'failed'
        errorMessage = `Validación falló: ${r.message || v.type}`
      }
    }

    // ── 9. Capturar variables si pasó ────────────────────────────────────
    if (testStatus === 'passed' && testCase.captureVars) {
      for (const [varName, path] of Object.entries(testCase.captureVars)) {
        const val = _extractJsonPath(actualResponse, path)
        if (val !== undefined) vars[varName] = val
      }
    }
  } catch (err) {
    testStatus   = 'failed'
    errorMessage = err.message
    validationResults.push({ type: 'execution', passed: false, message: err.message })
  }

  // ── Guardar resultado ──────────────────────────────────────────────────
  await db.update(schema.apiTestResults).set({
    status:         testStatus,
    durationMs:     Date.now() - startedAt,
    actualMethod:   testCase.requestMethod,
    actualUrl,
    actualHeaders:  authHeaders,   // No incluir todos los headers, solo los relevantes
    actualBody,
    actualStatus,
    actualResponse,
    validationResults,
    errorMessage,
    completedAt:    new Date(),
  }).where(eq(schema.apiTestResults.id, resultRow.id))

  await _publish(runId, 'test_finished', {
    testCaseId:  testCase.id,
    name:        testCase.testName,
    status:      testStatus,
    durationMs:  Date.now() - startedAt,
    actualStatus,
    errorMessage,
  })

  return { status: testStatus }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function _resolveBaseUrl(collection) {
  if (collection.baseUrl) return collection.baseUrl
  const servers = collection.contractData?.servers || []
  return servers[0]?.url || 'http://localhost'
}

function _resolveUrl(path, baseUrl) {
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  return baseUrl.replace(/\/$/, '') + (path.startsWith('/') ? path : '/' + path)
}

function _buildQueryString(query) {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(query || {})) {
    if (v !== null && v !== undefined) params.set(k, String(v))
  }
  return params.toString()
}

function _substituteVars(str, vars) {
  if (typeof str !== 'string') return str
  return str.replace(/\{\{([^}]+)\}\}/g, (_, name) => {
    const val = vars[name.trim()]
    return val !== undefined ? String(val) : `{{${name}}}`
  })
}

function _substituteVarsDeep(obj, vars) {
  if (obj === null || obj === undefined) return obj
  if (typeof obj === 'string') return _substituteVars(obj, vars)
  if (Array.isArray(obj)) return obj.map(v => _substituteVarsDeep(v, vars))
  if (typeof obj === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(obj)) {
      out[k] = _substituteVarsDeep(v, vars)
    }
    return out
  }
  return obj
}

function _extractJsonPath(obj, path) {
  // Soporta paths simples: "$.data.token" o "data.token" o "token"
  const parts = path.replace(/^\$\./, '').split('.')
  let cur = obj
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined
    cur = cur[p]
  }
  return cur
}

function _runCustomValidation(validation, ctx) {
  switch (validation.type) {
    case 'header_exists': {
      const ok = ctx.headers.has(validation.name)
      return { type: 'header_exists', passed: ok, name: validation.name }
    }
    case 'response_contains': {
      const text = typeof ctx.actualResponse === 'string'
        ? ctx.actualResponse
        : JSON.stringify(ctx.actualResponse)
      const ok = text.includes(validation.value)
      return { type: 'response_contains', passed: ok, value: validation.value }
    }
    case 'response_time': {
      // Lo manejaríamos pasando durationMs aquí
      return { type: 'response_time', passed: true }
    }
    default:
      return { type: validation.type, passed: true }
  }
}

async function _publish(runId, type, data) {
  try {
    const redis = getRedis()
    await redis.publish(`api_run:${runId}`, JSON.stringify({
      type, data, timestamp: Date.now(),
    }))
  } catch {}
}

/**
 * Suscribe a eventos de un api_test_run.
 */
export async function subscribeToApiRun(runId, callback) {
  const Redis = (await import('ioredis')).default
  const subscriber = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  })

  const channel = `api_run:${runId}`
  await subscriber.subscribe(channel)

  subscriber.on('message', (ch, msg) => {
    if (ch !== channel) return
    try { callback(JSON.parse(msg)) } catch {}
  })

  return async () => {
    await subscriber.unsubscribe(channel)
    await subscriber.quit()
  }
}
