/**
 * Postman Collection v2.1 Parser
 *
 * Convierte una colección Postman en la misma estructura normalizada
 * que el parser de OpenAPI. Esto permite reutilizar el generador.
 *
 * Postman es más libre que OpenAPI (no necesariamente tiene schemas),
 * pero podemos derivar:
 *   - method, url, headers, body, query → del request
 *   - schemas tipo "se espera object con campos X, Y, Z" → del example response
 */

const OTP_KEYWORDS  = ['otp', 'mfa', '2fa', 'verify', 'verification', 'totp', 'authcode']
const AUTH_KEYWORDS = ['login', 'signin', 'sign-in', 'auth', 'token', 'session']

export function parsePostman(contract) {
  if (typeof contract === 'string') {
    contract = JSON.parse(contract)
  }

  const result = {
    info: {
      title:       contract.info?.name        || 'Postman Collection',
      description: contract.info?.description || '',
      version:     contract.info?.version     || '1.0.0',
    },
    servers:   _extractServers(contract),
    endpoints: [],
    components:{},
  }

  // Variables de la colección (Postman las llama "variable")
  const collectionVars = {}
  for (const v of contract.variable || []) {
    if (v.key) collectionVars[v.key] = v.value
  }

  _walkItems(contract.item || [], result.endpoints, [], collectionVars)
  return result
}

function _walkItems(items, endpoints, folderPath, collectionVars) {
  for (const item of items) {
    if (item.item) {
      // Es una carpeta
      _walkItems(item.item, endpoints, [...folderPath, item.name], collectionVars)
    } else if (item.request) {
      // Es un request individual
      endpoints.push(_parseRequest(item, folderPath, collectionVars))
    }
  }
}

function _parseRequest(item, folderPath, collectionVars) {
  const req = item.request
  const method = (req.method || 'GET').toUpperCase()

  // URL puede ser string o object
  const urlObj = typeof req.url === 'string'
    ? _parseUrlString(req.url, collectionVars)
    : _parseUrlObject(req.url, collectionVars)

  // Headers
  const headerParams = (req.header || []).filter(h => !h.disabled).map(h => ({
    name:     h.key,
    in:       'header',
    required: !h.disabled,
    schema:   _inferSchema(h.value),
    example:  h.value,
  }))

  // Query params
  const queryParams = urlObj.query.map(q => ({
    name:     q.key,
    in:       'query',
    required: !q.disabled,
    schema:   _inferSchema(q.value),
    example:  q.value,
  }))

  // Path params (Postman los marca como :paramName en el path)
  const pathParams = urlObj.pathParams.map(p => ({
    name:     p,
    in:       'path',
    required: true,
    schema:   { type: 'string' },
  }))

  // Body
  let requestBody = null
  if (req.body) {
    requestBody = _parseBody(req.body)
  }

  // Response examples → derivar schema esperado
  const responses = _parseResponses(item.response || [])

  // Detectar OTP/auth
  const name = (item.name || '').toLowerCase()
  const path = urlObj.path.toLowerCase()
  const suspectedOtp  = OTP_KEYWORDS.some(k => name.includes(k) || path.includes(k))
  const suspectedAuth = AUTH_KEYWORDS.some(k => name.includes(k) || path.includes(k))

  // Detectar auth
  let security = null
  if (req.auth) {
    if (req.auth.type === 'bearer') security = [{ type: 'bearer' }]
    else if (req.auth.type === 'apikey') security = [{ type: 'apiKey' }]
    else if (req.auth.type === 'basic') security = [{ type: 'basic' }]
  }

  return {
    method,
    path:        urlObj.path,
    operationId: _slugify(folderPath.concat(item.name).join('_')),
    summary:     item.name || '',
    description: item.description || '',
    tags:        folderPath.length > 0 ? [folderPath[0]] : [],
    pathParams,
    queryParams,
    headerParams,
    requestBody,
    responses,
    security,
    suspectedOtp,
    suspectedAuth,
  }
}

// ── URL parsing ──────────────────────────────────────────────────────────────

function _parseUrlString(urlStr, vars) {
  const expanded = _expandVars(urlStr, vars)
  try {
    const u = new URL(expanded.startsWith('http') ? expanded : 'http://placeholder' + expanded)
    const pathParams = []
    const path = u.pathname.replace(/:([a-zA-Z_]\w*)/g, (_, name) => {
      pathParams.push(name)
      return `{${name}}`
    })
    const query = []
    for (const [k, v] of u.searchParams) query.push({ key: k, value: v, disabled: false })
    return { path, query, pathParams }
  } catch {
    return { path: urlStr, query: [], pathParams: [] }
  }
}

function _parseUrlObject(urlObj, vars) {
  const pathSegments = (urlObj.path || []).map(s => {
    if (typeof s === 'string') return s
    return s.value || ''
  })

  const pathParams = []
  const pathParts = pathSegments.map(s => {
    if (s.startsWith(':')) {
      pathParams.push(s.slice(1))
      return `{${s.slice(1)}}`
    }
    return s
  })

  return {
    path:       '/' + pathParts.join('/'),
    query:      (urlObj.query || []).filter(q => !q.disabled !== true),
    pathParams,
  }
}

function _expandVars(s, vars) {
  return s.replace(/\{\{([^}]+)\}\}/g, (_, name) => vars[name.trim()] || `{{${name}}}`)
}

// ── Body parsing ─────────────────────────────────────────────────────────────

function _parseBody(body) {
  switch (body.mode) {
    case 'raw': {
      let parsed = null
      try { parsed = JSON.parse(body.raw) } catch { parsed = body.raw }
      const ct = body.options?.raw?.language === 'json' ? 'application/json' : 'text/plain'
      return {
        contentType: ct,
        schema:      typeof parsed === 'object' ? _inferObjectSchema(parsed) : { type: 'string' },
        required:    true,
        examples:    { default: { value: parsed } },
      }
    }
    case 'urlencoded': {
      const obj = {}
      for (const p of body.urlencoded || []) obj[p.key] = p.value
      return {
        contentType: 'application/x-www-form-urlencoded',
        schema:      _inferObjectSchema(obj),
        required:    true,
        examples:    { default: { value: obj } },
      }
    }
    case 'formdata': {
      const obj = {}
      for (const p of body.formdata || []) obj[p.key] = p.value
      return {
        contentType: 'multipart/form-data',
        schema:      _inferObjectSchema(obj),
        required:    true,
        examples:    { default: { value: obj } },
      }
    }
    default:
      return null
  }
}

function _parseResponses(responses) {
  const out = {}
  for (const r of responses) {
    const code = String(r.code || r.status || 200)
    let body = null
    try { body = JSON.parse(r.body) } catch { body = r.body }

    out[code] = {
      description: r.name || '',
      schema:      typeof body === 'object' ? _inferObjectSchema(body) : null,
      examples:    { default: { value: body } },
    }
  }

  // Si no hay responses definidos, asumir 200 genérico
  if (Object.keys(out).length === 0) {
    out['200'] = { description: 'Success', schema: null, examples: {} }
  }

  return out
}

// ── Schema inference desde ejemplos ─────────────────────────────────────────

function _inferSchema(value) {
  if (value === null || value === undefined) return { type: 'string' }
  if (typeof value === 'number')   return { type: Number.isInteger(value) ? 'integer' : 'number' }
  if (typeof value === 'boolean')  return { type: 'boolean' }
  if (Array.isArray(value)) {
    if (value.length === 0) return { type: 'array', items: { type: 'string' } }
    return { type: 'array', items: _inferSchema(value[0]) }
  }
  if (typeof value === 'object')   return _inferObjectSchema(value)
  return { type: 'string' }
}

function _inferObjectSchema(obj) {
  if (!obj || typeof obj !== 'object') return { type: 'object' }
  const properties = {}
  for (const [k, v] of Object.entries(obj)) {
    properties[k] = _inferSchema(v)
  }
  return {
    type: 'object',
    properties,
    required: Object.keys(properties),   // Asumir todos requeridos del ejemplo
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function _extractServers(contract) {
  // Postman no tiene "servers" formal; mirar la primera URL absoluta de los requests
  const urls = new Set()
  function walk(items) {
    for (const item of items || []) {
      if (item.item) walk(item.item)
      else if (item.request) {
        const url = typeof item.request.url === 'string'
          ? item.request.url
          : item.request.url?.raw
        if (url) {
          try {
            const u = new URL(url.replace(/\{\{[^}]+\}\}/g, 'placeholder'))
            urls.add(`${u.protocol}//${u.host}`)
          } catch {}
        }
      }
    }
  }
  walk(contract.item)
  return [...urls].map(u => ({ url: u, description: '' }))
}

function _slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}
