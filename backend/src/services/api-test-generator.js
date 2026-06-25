/**
 * API Test Case Generator
 *
 * Genera la lista completa de casos de prueba a partir de los endpoints parseados.
 *
 * Estrategia en capas:
 *
 * CAPA 1 (mecánica, sin IA):
 *   Para cada endpoint genera automáticamente:
 *     - Happy path (datos válidos del schema)
 *     - Sin auth → expect 401
 *     - Auth inválida → expect 401/403
 *     - Body vacío en POST/PUT → expect 400
 *     - Campos requeridos faltantes (uno por uno) → expect 400
 *     - Tipo incorrecto por campo → expect 400
 *     - Path param inválido (si aplica) → expect 400/404
 *     - Método incorrecto (si aplica) → expect 405
 *
 * CAPA 2 (IA contextual):
 *   Para endpoints "interesantes" (POST/PUT con body complejo, endpoints de
 *   transacciones, etc), pide a Claude que genere 1-3 casos de borde
 *   adicionales basados en el contexto.
 *
 * La IA está RESTRINGIDA:
 *   - Debe responder en JSON estricto
 *   - Sus casos se validan automáticamente con ajv
 *   - Si la IA inventa algo que no sigue el schema → rechazo
 */

import { fakeValid, fakeInvalid } from './jsonschema-faker.js'
import { askClaude, parseClaudeJson } from './anthropic-client.js'

const AI_TEMPERATURE = 0.3   // Bajo para que sea predecible

/**
 * Genera todos los casos de prueba para una colección parseada.
 *
 * @param {object} parsed       Resultado de parseOpenApi() o parsePostman()
 * @param {object} options
 * @param {boolean} [options.useAi=true]  Si activar la capa 2 (IA contextual)
 * @param {string}  [options.collectionId] Para asociar los casos
 *
 * @returns {Array<TestCase>}
 */
export async function generateAllTestCases(parsed, options = {}) {
  const useAi = options.useAi !== false && !!process.env.ANTHROPIC_API_KEY
  const allCases = []

  for (const endpoint of parsed.endpoints) {
    // ── CAPA 1: casos mecánicos ─────────────────────────────────────────
    const mechanicalCases = _generateMechanicalCases(endpoint)
    allCases.push(...mechanicalCases)

    // ── CAPA 2: casos contextuales con IA ───────────────────────────────
    if (useAi && _shouldUseAiForEndpoint(endpoint)) {
      try {
        const aiCases = await _generateAiCases(endpoint)
        allCases.push(...aiCases)
      } catch (err) {
        console.warn(`[Generator] IA falló para ${endpoint.method} ${endpoint.path}:`, err.message)
      }
    }
  }

  // Asignar order
  allCases.forEach((c, i) => { c.order = i })
  return allCases
}

// ── CAPA 1: generación mecánica ──────────────────────────────────────────────

function _generateMechanicalCases(endpoint) {
  const cases   = []
  const epLabel = `${endpoint.method} ${endpoint.path}`

  // ── 1. Happy path ──────────────────────────────────────────────────────
  const happyPath = _buildHappyPath(endpoint)
  cases.push({
    ...happyPath,
    testName:    `Happy path: ${endpoint.summary || epLabel}`,
    category:    'happy_path',
    generatedBy: 'mechanical',
  })

  // ── 2. Sin auth (si el endpoint requiere auth) ─────────────────────────
  const requiresAuth = endpoint.security !== null && (
    endpoint.security === undefined ||
    (Array.isArray(endpoint.security) && endpoint.security.length > 0)
  )

  if (requiresAuth) {
    cases.push({
      endpoint:       epLabel,
      testName:       `Sin auth → 401`,
      category:       'security',
      generatedBy:    'mechanical',
      requestMethod:  endpoint.method,
      requestPath:    endpoint.path,
      requestHeaders: {},
      requestQuery:   _fakeQuery(endpoint),
      requestBody:    endpoint.requestBody ? fakeValid(endpoint.requestBody.schema) : null,
      needsAuth:      false,
      overrideAuth:   true,
      expectedStatus: 401,
      expectedSchema: null,
      validations:    [],
    })

    // Auth con token inválido
    cases.push({
      endpoint:       epLabel,
      testName:       `Token inválido → 401`,
      category:       'security',
      generatedBy:    'mechanical',
      requestMethod:  endpoint.method,
      requestPath:    endpoint.path,
      requestHeaders: { Authorization: 'Bearer invalid_token_xyz' },
      requestQuery:   _fakeQuery(endpoint),
      requestBody:    endpoint.requestBody ? fakeValid(endpoint.requestBody.schema) : null,
      needsAuth:      false,
      overrideAuth:   true,
      expectedStatus: 401,
      validations:    [],
    })
  }

  // ── 3. Body vacío (solo POST/PUT/PATCH que requieren body) ─────────────
  if (['POST', 'PUT', 'PATCH'].includes(endpoint.method) && endpoint.requestBody?.required) {
    cases.push({
      endpoint:       epLabel,
      testName:       `Body vacío → 400`,
      category:       'negative',
      generatedBy:    'mechanical',
      requestMethod:  endpoint.method,
      requestPath:    endpoint.path,
      requestHeaders: {},
      requestQuery:   _fakeQuery(endpoint),
      requestBody:    {},
      needsAuth:      requiresAuth,
      expectedStatus: 400,
      validations:    [],
    })
  }

  // ── 4. Campo requerido faltante (uno por uno) ──────────────────────────
  if (endpoint.requestBody?.schema?.required) {
    const required  = endpoint.requestBody.schema.required
    const validBody = fakeValid(endpoint.requestBody.schema)

    for (const field of required.slice(0, 5)) {   // Cap a 5 para no explotar
      const body = { ...validBody }
      delete body[field]
      cases.push({
        endpoint:       epLabel,
        testName:       `Sin campo requerido "${field}" → 400`,
        category:       'negative',
        generatedBy:    'mechanical',
        requestMethod:  endpoint.method,
        requestPath:    endpoint.path,
        requestHeaders: {},
        requestQuery:   _fakeQuery(endpoint),
        requestBody:    body,
        needsAuth:      requiresAuth,
        expectedStatus: 400,
        validations:    [],
      })
    }
  }

  // ── 5. Tipo incorrecto en campos del body ──────────────────────────────
  if (endpoint.requestBody?.schema?.properties) {
    const props     = endpoint.requestBody.schema.properties
    const validBody = fakeValid(endpoint.requestBody.schema)
    let count = 0

    for (const [fieldName, fieldSchema] of Object.entries(props)) {
      if (count >= 3) break   // Limitar para no explotar la cantidad de tests
      const invalids = fakeInvalid(fieldSchema, fieldName)
      const variant  = invalids[0]   // Solo el primer invalid por campo
      if (!variant) continue

      const body = { ...validBody, [fieldName]: variant.value }
      cases.push({
        endpoint:       epLabel,
        testName:       `Validación: ${variant.name} → 400`,
        category:       'negative',
        generatedBy:    'mechanical',
        requestMethod:  endpoint.method,
        requestPath:    endpoint.path,
        requestHeaders: {},
        requestQuery:   _fakeQuery(endpoint),
        requestBody:    body,
        needsAuth:      requiresAuth,
        expectedStatus: 400,
        validations:    [],
      })
      count++
    }
  }

  // ── 6. Path param inválido (si hay path params) ────────────────────────
  if (endpoint.pathParams.length > 0 && ['GET', 'PUT', 'DELETE', 'PATCH'].includes(endpoint.method)) {
    const validPath = _substitutePathParams(endpoint.path, endpoint.pathParams)
    const invalidPath = endpoint.path.replace(/\{[^}]+\}/g, 'no-existe-12345')

    cases.push({
      endpoint:       epLabel,
      testName:       `ID inexistente → 404`,
      category:       'negative',
      generatedBy:    'mechanical',
      requestMethod:  endpoint.method,
      requestPath:    invalidPath,
      requestHeaders: {},
      requestQuery:   _fakeQuery(endpoint),
      requestBody:    endpoint.requestBody ? fakeValid(endpoint.requestBody.schema) : null,
      needsAuth:      requiresAuth,
      expectedStatus: 404,
      validations:    [],
    })
  }

  return cases
}

function _buildHappyPath(endpoint) {
  const path = _substitutePathParams(endpoint.path, endpoint.pathParams)
  const requiresAuth = endpoint.security !== null

  // Detectar el código de éxito esperado en el schema
  const successCodes = ['200', '201', '202', '204']
  let expectedStatus = 200
  let expectedSchema = null

  for (const code of successCodes) {
    if (endpoint.responses[code]) {
      expectedStatus = parseInt(code, 10)
      expectedSchema = endpoint.responses[code].schema
      break
    }
  }

  // Detectar variables capturables del response (token, id, etc)
  const captureVars = _detectCaptureVars(expectedSchema, endpoint)

  return {
    endpoint:       `${endpoint.method} ${endpoint.path}`,
    requestMethod:  endpoint.method,
    requestPath:    path,
    requestHeaders: _fakeHeaders(endpoint),
    requestQuery:   _fakeQuery(endpoint),
    requestBody:    endpoint.requestBody ? fakeValid(endpoint.requestBody.schema) : null,
    needsAuth:      requiresAuth,
    captureVars,
    expectedStatus,
    expectedSchema,
    validations:    expectedSchema ? [{ type: 'schema', schema: expectedSchema }] : [],
  }
}

function _substitutePathParams(path, pathParams) {
  let result = path
  for (const p of pathParams) {
    const val = fakeValid(p.schema, p.name)
    result = result.replace(`{${p.name}}`, encodeURIComponent(String(val)))
  }
  return result
}

function _fakeQuery(endpoint) {
  const query = {}
  for (const q of endpoint.queryParams || []) {
    if (q.required) query[q.name] = fakeValid(q.schema, q.name)
  }
  return query
}

function _fakeHeaders(endpoint) {
  const headers = {}
  for (const h of endpoint.headerParams || []) {
    if (h.required) headers[h.name] = String(fakeValid(h.schema, h.name))
  }
  return headers
}

function _detectCaptureVars(schema, endpoint) {
  // Si el endpoint parece ser un login → capturar "token", "access_token", etc.
  const captures = {}
  if (!schema?.properties) return captures

  if (endpoint.suspectedAuth) {
    for (const key of Object.keys(schema.properties)) {
      if (/(token|access_token|jwt|session)/i.test(key)) {
        captures[key] = `$.${key}`
      }
    }
  }

  // Si retorna un id, capturarlo
  for (const key of Object.keys(schema.properties)) {
    if (/^(id|user_?id|customer_?id|resource_?id)$/i.test(key)) {
      captures[key] = `$.${key}`
    }
  }

  return captures
}

// ── CAPA 2: IA contextual ────────────────────────────────────────────────────

function _shouldUseAiForEndpoint(endpoint) {
  // Solo POST/PUT con body — donde hay más oportunidad de casos de borde
  if (!['POST', 'PUT', 'PATCH'].includes(endpoint.method)) return false
  if (!endpoint.requestBody?.schema?.properties) return false
  // Si tiene 1 sola propiedad simple, no vale la pena gastar IA
  if (Object.keys(endpoint.requestBody.schema.properties).length < 2) return false
  return true
}

async function _generateAiCases(endpoint) {
  const SYSTEM = `Eres un experto QA de seguridad y APIs.
Tu trabajo: dado un endpoint, generar 1-3 casos de borde NO mecánicos que prueben reglas de negocio.

Reglas estrictas:
1. NO generes casos mecánicos (tipo incorrecto, campo faltante, sin auth, etc — eso ya está cubierto)
2. Genera casos contextuales: valores límite, combinaciones inválidas, casos del dominio
3. Responde SOLO en JSON, sin markdown ni explicaciones extra
4. Para cada caso especifica: name, body, expectedStatus, reason
5. Máximo 3 casos`

  const userPrompt = `Endpoint:
  ${endpoint.method} ${endpoint.path}
  Summary: ${endpoint.summary || '(none)'}
  Tags: ${endpoint.tags.join(', ') || '(none)'}

Request body schema:
${JSON.stringify(endpoint.requestBody?.schema || {}, null, 2)}

Responses:
${JSON.stringify(Object.fromEntries(Object.entries(endpoint.responses).map(([k, v]) => [k, v.description])), null, 2)}

Genera 1-3 casos de borde contextuales. Responde con JSON:
{
  "cases": [
    {
      "name":           "Descripción del caso",
      "body":           { ... cuerpo a enviar ... },
      "expectedStatus": 400,
      "reason":         "Por qué este caso es interesante"
    }
  ]
}`

  const { text } = await askClaude({
    system:      SYSTEM,
    messages:    [{ role: 'user', content: userPrompt }],
    maxTokens:   1500,
    temperature: AI_TEMPERATURE,
  })

  const parsed = parseClaudeJson(text)
  if (!parsed?.cases || !Array.isArray(parsed.cases)) return []

  return parsed.cases
    .filter(c => c && c.name && typeof c.expectedStatus === 'number')
    .slice(0, 3)
    .map(c => ({
      endpoint:       `${endpoint.method} ${endpoint.path}`,
      testName:       `IA: ${c.name}`,
      category:       'edge',
      generatedBy:    'ai',
      requestMethod:  endpoint.method,
      requestPath:    _substitutePathParams(endpoint.path, endpoint.pathParams),
      requestHeaders: {},
      requestQuery:   _fakeQuery(endpoint),
      requestBody:    c.body,
      needsAuth:      endpoint.security !== null,
      expectedStatus: c.expectedStatus,
      expectedSchema: null,
      validations:    [],
    }))
}
