/**
 * OpenAPI Parser
 *
 * Convierte un contrato OpenAPI 3.0/3.1 (YAML/JSON) en una lista normalizada
 * de endpoints que el generador puede usar para crear casos de prueba.
 *
 * Estructura normalizada por endpoint:
 * {
 *   method:           "POST",
 *   path:             "/users/{id}",
 *   operationId:      "createUser",
 *   summary:          "Crear usuario",
 *   tags:             ["users"],
 *   pathParams:       [{ name, schema, required }],
 *   queryParams:      [{ name, schema, required }],
 *   headerParams:     [{ name, schema, required }],
 *   requestBody:      { contentType, schema, required, examples },
 *   responses:        {
 *     200: { description, schema, examples },
 *     400: { ... },
 *     401: { ... }
 *   },
 *   security:         [{ type: "bearer" }, ...],
 *   suspectedOtp:     boolean,    // heurística: nombre contiene "otp", "verify", "2fa", "mfa"
 *   suspectedAuth:    boolean,    // nombre contiene "login", "auth", "signin", "token"
 * }
 */

const OTP_KEYWORDS  = ['otp', 'mfa', '2fa', 'verify', 'verification', 'totp', 'authcode']
const AUTH_KEYWORDS = ['login', 'signin', 'sign-in', 'auth', 'token', 'session']

export function parseOpenApi(contract) {
  if (typeof contract === 'string') {
    contract = _parseJsonOrYaml(contract)
  }

  const result = {
    info: {
      title:       contract.info?.title       || 'API',
      description: contract.info?.description || '',
      version:     contract.info?.version     || '1.0.0',
    },
    servers:   _extractServers(contract),
    endpoints: [],
    security:  contract.security || [],
    components:contract.components || {},
  }

  const paths = contract.paths || {}
  for (const [path, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue

    // Parámetros comunes a todos los métodos en este path
    const commonParams = pathItem.parameters || []

    for (const method of ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']) {
      const op = pathItem[method]
      if (!op) continue

      const endpoint = _parseOperation(method.toUpperCase(), path, op, commonParams, contract)
      result.endpoints.push(endpoint)
    }
  }

  return result
}

function _parseOperation(method, path, op, commonParams, contract) {
  const allParams = [...commonParams, ...(op.parameters || [])]
    .map(p => _resolveRef(p, contract))

  const pathParams   = allParams.filter(p => p.in === 'path')
  const queryParams  = allParams.filter(p => p.in === 'query')
  const headerParams = allParams.filter(p => p.in === 'header')

  // Request body
  let requestBody = null
  if (op.requestBody) {
    const rb = _resolveRef(op.requestBody, contract)
    const contentTypes = Object.keys(rb.content || {})
    const ct = contentTypes.includes('application/json') ? 'application/json' : contentTypes[0]
    if (ct) {
      const body = rb.content[ct]
      requestBody = {
        contentType: ct,
        schema:      _resolveRef(body.schema, contract),
        required:    rb.required !== false,
        examples:    body.examples || (body.example ? { default: { value: body.example } } : {}),
      }
    }
  }

  // Responses
  const responses = {}
  for (const [code, response] of Object.entries(op.responses || {})) {
    const r = _resolveRef(response, contract)
    const ct = r.content?.['application/json']
    responses[code] = {
      description: r.description || '',
      schema:      ct ? _resolveRef(ct.schema, contract) : null,
      examples:    ct?.examples || (ct?.example ? { default: { value: ct.example } } : {}),
    }
  }

  // Detectar OTP/auth por nombre del path o operationId
  const lcId   = (op.operationId || '').toLowerCase()
  const lcPath = path.toLowerCase()
  const suspectedOtp  = OTP_KEYWORDS.some(k => lcId.includes(k) || lcPath.includes(k))
  const suspectedAuth = AUTH_KEYWORDS.some(k => lcId.includes(k) || lcPath.includes(k))

  return {
    method,
    path,
    operationId:   op.operationId || `${method.toLowerCase()}_${path.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}`,
    summary:       op.summary || '',
    description:   op.description || '',
    tags:          op.tags || [],
    pathParams,
    queryParams,
    headerParams,
    requestBody,
    responses,
    security:      op.security !== undefined ? op.security : null,
    suspectedOtp,
    suspectedAuth,
  }
}

function _extractServers(contract) {
  const servers = contract.servers || []
  return servers.map(s => ({
    url:         s.url,
    description: s.description || '',
  }))
}

/**
 * Resuelve $ref recursivamente. OpenAPI tiene referencias como:
 *   { "$ref": "#/components/schemas/User" }
 */
function _resolveRef(node, contract, visited = new Set()) {
  if (!node || typeof node !== 'object') return node
  if (Array.isArray(node)) return node.map(n => _resolveRef(n, contract, visited))

  if (node.$ref) {
    if (visited.has(node.$ref)) return node   // Evitar loops
    visited.add(node.$ref)
    const target = _resolvePath(contract, node.$ref)
    return _resolveRef(target, contract, visited)
  }

  // Recursivo en objetos
  const out = {}
  for (const [k, v] of Object.entries(node)) {
    out[k] = _resolveRef(v, contract, visited)
  }
  return out
}

function _resolvePath(contract, refPath) {
  // "#/components/schemas/User" → contract.components.schemas.User
  if (!refPath.startsWith('#/')) return null
  const parts = refPath.slice(2).split('/').map(p => p.replace(/~1/g, '/').replace(/~0/g, '~'))
  let cur = contract
  for (const p of parts) {
    if (cur == null) return null
    cur = cur[p]
  }
  return cur
}

/**
 * Parser muy simple de YAML → JSON.
 * Soporta el subset que típicamente aparece en specs OpenAPI.
 * Para YAML complejo el cliente puede enviar JSON o nos delega.
 */
function _parseJsonOrYaml(text) {
  text = text.trim()

  // JSON
  if (text.startsWith('{') || text.startsWith('[')) {
    return JSON.parse(text)
  }

  // YAML — usar js-yaml si está disponible
  try {
    // eslint-disable-next-line no-eval
    return _yamlParse(text)
  } catch (err) {
    throw new Error(`No se pudo parsear el contrato como JSON ni YAML: ${err.message}`)
  }
}

/**
 * Mini YAML parser. Solo lo esencial: mappings, sequences, strings, numbers,
 * booleans. Suficiente para OpenAPI estándar.
 */
function _yamlParse(text) {
  // Eliminar comentarios y normalizar
  const lines = text.split('\n').map(l => l.replace(/(\s)#.*$/, '$1').trimEnd())

  const root = {}
  const stack = [{ indent: -1, node: root, isArray: false }]

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    if (raw.trim() === '' || raw.trim().startsWith('#')) continue

    const indent = raw.length - raw.trimStart().length
    const line   = raw.trim()

    // Salir hasta el nivel correcto
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop()
    }
    const parent = stack[stack.length - 1].node

    // Item de array
    if (line.startsWith('- ')) {
      const rest = line.slice(2).trim()
      if (!Array.isArray(parent)) {
        // Convertir parent en array si fue declarado como objeto vacío
        // Esto no pasa normalmente porque "key:" sin nada espera array via siguiente línea
      }
      const arr = Array.isArray(parent) ? parent : (parent._pendingArray || [])

      // Si el item es "key: value" inline
      const kvMatch = rest.match(/^([^:]+):\s*(.*)$/)
      if (kvMatch) {
        const obj = {}
        const k = kvMatch[1].trim()
        const v = kvMatch[2].trim()
        obj[k] = v ? _parseScalar(v) : {}
        arr.push(obj)
        if (!v) stack.push({ indent, node: obj[k], isArray: false })
      } else {
        arr.push(_parseScalar(rest))
      }
      continue
    }

    // key: value
    const m = line.match(/^([^:]+):\s*(.*)$/)
    if (!m) continue
    const key   = m[1].trim()
    const value = m[2].trim()

    if (value === '' || value === null) {
      // Sigue un objeto o array en próximas líneas
      const next = lines.slice(i + 1).find(l => l.trim() !== '' && !l.trim().startsWith('#'))
      if (next && next.trim().startsWith('- ')) {
        parent[key] = []
        stack.push({ indent, node: parent[key], isArray: true })
      } else {
        parent[key] = {}
        stack.push({ indent, node: parent[key], isArray: false })
      }
    } else {
      parent[key] = _parseScalar(value)
    }
  }

  return root
}

function _parseScalar(v) {
  v = v.trim()
  if (v.startsWith('"') && v.endsWith('"')) return v.slice(1, -1)
  if (v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1)
  if (v === 'true')  return true
  if (v === 'false') return false
  if (v === 'null')  return null
  if (/^-?\d+$/.test(v))         return parseInt(v, 10)
  if (/^-?\d*\.\d+$/.test(v))    return parseFloat(v)
  return v
}
