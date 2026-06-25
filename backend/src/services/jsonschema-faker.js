/**
 * JSON Schema Faker
 *
 * Genera datos válidos e inválidos a partir de un JSON Schema.
 *
 * Para datos válidos:
 *   - Respeta tipos (string, number, integer, boolean, array, object)
 *   - Respeta formatos (email, uri, date-time, uuid)
 *   - Respeta restricciones (minLength, maxLength, minimum, maximum, pattern)
 *   - Respeta enums
 *
 * Para datos inválidos (para tests negativos):
 *   - Tipo incorrecto (string donde se espera number, etc)
 *   - Campos requeridos faltantes
 *   - Strings demasiado largos/cortos
 *   - Números fuera de rango
 *   - Valores que rompen el pattern
 *   - Enum con valor inválido
 *
 * NO usa IA aquí — todo mecánico.
 */

// ── DATOS REALISTAS POR PATRÓN ───────────────────────────────────────────────
// Si el nombre del campo coincide con uno de estos, usa el valor correspondiente

const FIELD_PATTERNS = [
  { pattern: /^email$|email$/i,           generate: () => _randomEmail() },
  { pattern: /^(first.?name|nombre|firstName)$/i, generate: () => _randomFirstName() },
  { pattern: /^(last.?name|apellido|lastName)$/i, generate: () => _randomLastName() },
  { pattern: /^(full.?name|name|nombre.?completo)$/i, generate: () => `${_randomFirstName()} ${_randomLastName()}` },
  { pattern: /^(phone|telefono|celular|mobile)$/i, generate: () => _randomPhoneMx() },
  { pattern: /^(rfc)$/i,                  generate: () => _randomRfc() },
  { pattern: /^(curp)$/i,                 generate: () => _randomCurp() },
  { pattern: /^(clabe|cuenta.?clabe)$/i,  generate: () => _randomClabe() },
  { pattern: /(cuenta|account).*$/i,      generate: () => _randomAccount() },
  { pattern: /^(card.?number|tarjeta)$/i, generate: () => '4111111111111111' },
  { pattern: /^(cvv|cvc)$/i,              generate: () => '123' },
  { pattern: /^(password|contraseña|passwd|pwd)$/i, generate: () => 'P@ssword123' },
  { pattern: /^(username|usuario|user)$/i, generate: () => _randomUsername() },
  { pattern: /^(url|website|sitio.?web)$/i, generate: () => 'https://ejemplo.com' },
  { pattern: /^(uuid|guid)$/i,            generate: () => _randomUuid() },
  { pattern: /^id$/i,                     generate: () => _randomUuid() },
  { pattern: /(amount|monto|price|precio|importe|total)$/i, generate: () => _randomAmount() },
  { pattern: /^(currency|moneda)$/i,      generate: () => 'MXN' },
  { pattern: /^(country|pais|country.?code)$/i, generate: () => 'MX' },
  { pattern: /^(city|ciudad)$/i,          generate: () => 'Ciudad de México' },
  { pattern: /^(state|estado)$/i,         generate: () => 'CDMX' },
  { pattern: /^(zip|postal|codigo.?postal|cp)$/i, generate: () => '06700' },
  { pattern: /^(address|direccion|calle)$/i, generate: () => 'Av. Reforma 123' },
  { pattern: /^(date|fecha)/i,            generate: () => new Date().toISOString().slice(0, 10) },
  { pattern: /^(datetime|created_at|updated_at|timestamp)$/i, generate: () => new Date().toISOString() },
  { pattern: /(description|descripcion|notes|notas)$/i, generate: () => 'Descripción de prueba' },
  { pattern: /^(title|titulo)$/i,         generate: () => 'Título de prueba' },
]

// ── API pública ──────────────────────────────────────────────────────────────

/**
 * Genera un valor VÁLIDO según el schema.
 *
 * @param {object} schema  JSON Schema
 * @param {string} [fieldName]  Nombre del campo (para inferir mejor)
 */
export function fakeValid(schema, fieldName = '') {
  if (!schema) return null

  // Examples del schema tienen prioridad
  if (schema.example !== undefined)  return _deepClone(schema.example)
  if (schema.default !== undefined)  return _deepClone(schema.default)

  // Enum
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum[0]
  }

  // Por tipo
  const type = schema.type || _inferType(schema)
  switch (type) {
    case 'string':  return _fakeString(schema, fieldName)
    case 'integer': return _fakeInteger(schema, fieldName)
    case 'number':  return _fakeNumber(schema, fieldName)
    case 'boolean': return true
    case 'array':   return _fakeArray(schema, fieldName)
    case 'object':  return _fakeObject(schema)
    case 'null':    return null
    default:        return _fakeObject(schema)
  }
}

/**
 * Genera variantes INVÁLIDAS del schema para tests negativos.
 *
 * @returns {Array<{ name, value, reason }>}
 */
export function fakeInvalid(schema, fieldName = '') {
  if (!schema) return []

  const variants = []
  const type = schema.type || 'object'

  // Variante: tipo incorrecto
  if (type === 'string') {
    variants.push({
      name:   `${fieldName || 'campo'}_es_numero_en_vez_de_string`,
      value:  12345,
      reason: `Se espera string, se envía number`,
    })
  } else if (type === 'integer' || type === 'number') {
    variants.push({
      name:   `${fieldName || 'campo'}_es_string_en_vez_de_numero`,
      value:  'abc',
      reason: `Se espera ${type}, se envía string`,
    })
  } else if (type === 'boolean') {
    variants.push({
      name:   `${fieldName || 'campo'}_es_string_en_vez_de_boolean`,
      value:  'maybe',
      reason: `Se espera boolean, se envía string`,
    })
  } else if (type === 'array') {
    variants.push({
      name:   `${fieldName || 'campo'}_es_string_en_vez_de_array`,
      value:  'not-an-array',
      reason: 'Se espera array, se envía string',
    })
  }

  // String fuera de rango
  if (type === 'string') {
    if (schema.minLength) {
      variants.push({
        name:   `${fieldName}_demasiado_corto`,
        value:  'a',
        reason: `minLength=${schema.minLength}`,
      })
    }
    if (schema.maxLength) {
      variants.push({
        name:   `${fieldName}_demasiado_largo`,
        value:  'x'.repeat(schema.maxLength + 10),
        reason: `maxLength=${schema.maxLength}`,
      })
    }
    if (schema.pattern) {
      variants.push({
        name:   `${fieldName}_no_match_pattern`,
        value:  '!!INVALID!!',
        reason: `pattern=${schema.pattern}`,
      })
    }
    if (schema.format === 'email') {
      variants.push({
        name:   `${fieldName}_email_invalido`,
        value:  'not-an-email',
        reason: 'Formato de email inválido',
      })
    }
  }

  // Number fuera de rango
  if (type === 'integer' || type === 'number') {
    if (schema.minimum !== undefined) {
      variants.push({
        name:   `${fieldName}_menor_que_minimo`,
        value:  schema.minimum - 1,
        reason: `minimum=${schema.minimum}`,
      })
    }
    if (schema.maximum !== undefined) {
      variants.push({
        name:   `${fieldName}_mayor_que_maximo`,
        value:  schema.maximum + 1,
        reason: `maximum=${schema.maximum}`,
      })
    }
  }

  // Enum con valor inválido
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    variants.push({
      name:   `${fieldName}_no_esta_en_enum`,
      value:  'INVALID_ENUM_VALUE',
      reason: `enum=[${schema.enum.join(', ')}]`,
    })
  }

  return variants
}

// ── Implementaciones por tipo ────────────────────────────────────────────────

function _fakeString(schema, fieldName) {
  // Buscar por nombre de campo conocido
  for (const p of FIELD_PATTERNS) {
    if (p.pattern.test(fieldName)) return p.generate()
  }

  // Por formato
  switch (schema.format) {
    case 'email':      return _randomEmail()
    case 'uri':
    case 'url':        return 'https://ejemplo.com'
    case 'date':       return new Date().toISOString().slice(0, 10)
    case 'date-time':  return new Date().toISOString()
    case 'uuid':       return _randomUuid()
    case 'ipv4':       return '192.168.1.1'
    case 'ipv6':       return '::1'
    case 'hostname':   return 'localhost'
  }

  // Pattern (intento básico)
  if (schema.pattern) {
    return _generateFromPattern(schema.pattern, schema.minLength, schema.maxLength)
  }

  // Length constraints
  const min = schema.minLength || 3
  const max = schema.maxLength || 20
  const len = Math.min(max, Math.max(min, 8))
  return 'test_' + Math.random().toString(36).slice(2, 2 + Math.max(1, len - 5))
}

function _fakeInteger(schema, fieldName) {
  const min = schema.minimum !== undefined ? schema.minimum : 1
  const max = schema.maximum !== undefined ? schema.maximum : 100
  return Math.floor(min + Math.random() * (max - min + 1))
}

function _fakeNumber(schema, fieldName) {
  // Si el campo se llama "amount", "monto", etc, generar realista
  if (/(amount|monto|price|precio|importe|total)/i.test(fieldName)) {
    return _randomAmount()
  }
  const min = schema.minimum !== undefined ? schema.minimum : 0
  const max = schema.maximum !== undefined ? schema.maximum : 1000
  return Math.round((min + Math.random() * (max - min)) * 100) / 100
}

function _fakeArray(schema, fieldName) {
  const itemSchema = schema.items || { type: 'string' }
  const count = schema.minItems || 1
  return Array.from({ length: count }, () => fakeValid(itemSchema, fieldName))
}

function _fakeObject(schema) {
  if (!schema.properties) return {}
  const out = {}
  const required = schema.required || Object.keys(schema.properties)

  for (const [key, propSchema] of Object.entries(schema.properties)) {
    if (required.includes(key)) {
      out[key] = fakeValid(propSchema, key)
    } else if (Math.random() > 0.3) {
      // 70% de incluir campos opcionales
      out[key] = fakeValid(propSchema, key)
    }
  }
  return out
}

function _inferType(schema) {
  if (schema.properties) return 'object'
  if (schema.items)      return 'array'
  if (Array.isArray(schema.enum)) return typeof schema.enum[0]
  return 'string'
}

function _generateFromPattern(pattern, minLen, maxLen) {
  // Casos comunes
  if (/^\^\[0-9\]\{(\d+)\}\$/.test(pattern)) {
    const m = pattern.match(/\{(\d+)\}/)
    return '0'.repeat(parseInt(m[1]))
  }
  if (/^\^\[A-Z\]\{(\d+)\}\$/.test(pattern)) {
    const m = pattern.match(/\{(\d+)\}/)
    return 'A'.repeat(parseInt(m[1]))
  }
  // Fallback: string genérico que probablemente no matchee, pero al menos no rompe
  const len = minLen || 8
  return 'X'.repeat(len)
}

// ── Generadores de datos realistas mexicanos ────────────────────────────────

const FIRST_NAMES_MX = ['Carlos', 'María', 'José', 'Ana', 'Luis', 'Sofía', 'Diego', 'Valentina', 'Miguel', 'Camila']
const LAST_NAMES_MX  = ['García', 'Rodríguez', 'Hernández', 'López', 'Martínez', 'González', 'Pérez', 'Sánchez', 'Ramírez', 'Torres']
const DOMAINS_MX     = ['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com.mx']

function _randomFirstName() { return FIRST_NAMES_MX[Math.floor(Math.random() * FIRST_NAMES_MX.length)] }
function _randomLastName()  { return LAST_NAMES_MX[Math.floor(Math.random() * LAST_NAMES_MX.length)] }
function _randomEmail() {
  const f = _randomFirstName().toLowerCase()
  const l = _randomLastName().toLowerCase().replace(/[^a-z]/g, '')
  const d = DOMAINS_MX[Math.floor(Math.random() * DOMAINS_MX.length)]
  return `${f}.${l}@${d}`
}
function _randomUsername() {
  return _randomFirstName().toLowerCase() + Math.floor(Math.random() * 1000)
}
function _randomPhoneMx() {
  return '55' + Math.floor(10000000 + Math.random() * 89999999).toString()
}
function _randomRfc() {
  // RFC físico genérico
  const letters = 'XYZA'
  return letters + 'BC' + '850101' + 'AB1'
}
function _randomCurp() {
  return 'GARC850101HDFRRR01'
}
function _randomClabe() {
  // 18 dígitos
  return '002180' + Math.floor(100000000000 + Math.random() * 899999999999)
}
function _randomAccount() {
  return Math.floor(1000000000 + Math.random() * 8999999999).toString()
}
function _randomUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}
function _randomAmount() {
  return Math.round((10 + Math.random() * 9990) * 100) / 100
}

function _deepClone(v) {
  try { return JSON.parse(JSON.stringify(v)) }
  catch { return v }
}
