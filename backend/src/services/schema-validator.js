/**
 * JSON Schema Validator
 *
 * Validador ligero (sin dependencias) que cubre el subset de JSON Schema
 * más común en OpenAPI:
 *   - type: string | integer | number | boolean | array | object | null
 *   - required, properties
 *   - minimum, maximum, minLength, maxLength
 *   - pattern, format (email, date-time, uuid, uri)
 *   - enum
 *   - items (para arrays)
 *   - $ref (resuelto previamente por el parser, asumimos schema ya flat)
 *
 * Devuelve { valid, errors: [{ path, message }] }
 */

const FORMAT_REGEX = {
  email:     /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  date:      /^\d{4}-\d{2}-\d{2}$/,
  'date-time': /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
  uuid:      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
  uri:       /^https?:\/\/.+/,
  ipv4:      /^(\d{1,3}\.){3}\d{1,3}$/,
}

export function validateAgainstSchema(data, schema) {
  const errors = []
  _validate(data, schema, '$', errors)
  return { valid: errors.length === 0, errors }
}

function _validate(data, schema, path, errors) {
  if (!schema) return

  // Type check
  const expectedType = schema.type
  if (expectedType) {
    const actualType = _typeOf(data)
    // number permite integer
    if (expectedType === 'number' && actualType === 'integer') {
      // ok
    } else if (expectedType !== actualType) {
      errors.push({ path, message: `Tipo incorrecto: esperaba ${expectedType}, recibió ${actualType}` })
      return  // Sin sentido seguir validando si el tipo es incorrecto
    }
  }

  // Enum
  if (Array.isArray(schema.enum)) {
    if (!schema.enum.some(v => _deepEqual(v, data))) {
      errors.push({ path, message: `Valor no está en enum: [${schema.enum.join(', ')}]` })
    }
  }

  // String
  if (typeof data === 'string') {
    if (schema.minLength !== undefined && data.length < schema.minLength) {
      errors.push({ path, message: `String demasiado corto (${data.length}, min ${schema.minLength})` })
    }
    if (schema.maxLength !== undefined && data.length > schema.maxLength) {
      errors.push({ path, message: `String demasiado largo (${data.length}, max ${schema.maxLength})` })
    }
    if (schema.pattern) {
      try {
        const re = new RegExp(schema.pattern)
        if (!re.test(data)) errors.push({ path, message: `No matchea pattern ${schema.pattern}` })
      } catch {}
    }
    if (schema.format && FORMAT_REGEX[schema.format]) {
      if (!FORMAT_REGEX[schema.format].test(data)) {
        errors.push({ path, message: `Formato ${schema.format} inválido` })
      }
    }
  }

  // Number / integer
  if (typeof data === 'number') {
    if (schema.minimum !== undefined && data < schema.minimum) {
      errors.push({ path, message: `Valor ${data} < minimum ${schema.minimum}` })
    }
    if (schema.maximum !== undefined && data > schema.maximum) {
      errors.push({ path, message: `Valor ${data} > maximum ${schema.maximum}` })
    }
    if (schema.exclusiveMinimum !== undefined && data <= schema.exclusiveMinimum) {
      errors.push({ path, message: `Valor ${data} <= exclusiveMinimum ${schema.exclusiveMinimum}` })
    }
    if (schema.exclusiveMaximum !== undefined && data >= schema.exclusiveMaximum) {
      errors.push({ path, message: `Valor ${data} >= exclusiveMaximum ${schema.exclusiveMaximum}` })
    }
    if (expectedType === 'integer' && !Number.isInteger(data)) {
      errors.push({ path, message: `Esperaba integer, recibió decimal ${data}` })
    }
  }

  // Array
  if (Array.isArray(data)) {
    if (schema.minItems !== undefined && data.length < schema.minItems) {
      errors.push({ path, message: `Array demasiado corto (${data.length}, min ${schema.minItems})` })
    }
    if (schema.maxItems !== undefined && data.length > schema.maxItems) {
      errors.push({ path, message: `Array demasiado largo (${data.length}, max ${schema.maxItems})` })
    }
    if (schema.items) {
      data.forEach((item, i) => _validate(item, schema.items, `${path}[${i}]`, errors))
    }
  }

  // Object
  if (data !== null && typeof data === 'object' && !Array.isArray(data)) {
    if (Array.isArray(schema.required)) {
      for (const req of schema.required) {
        if (data[req] === undefined) {
          errors.push({ path: `${path}.${req}`, message: `Campo requerido faltante: "${req}"` })
        }
      }
    }
    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (data[key] !== undefined) {
          _validate(data[key], propSchema, `${path}.${key}`, errors)
        }
      }
    }
  }
}

function _typeOf(v) {
  if (v === null)            return 'null'
  if (Array.isArray(v))      return 'array'
  if (Number.isInteger(v))   return 'integer'
  return typeof v
}

function _deepEqual(a, b) {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (a === null || b === null) return false
  if (typeof a === 'object') {
    return JSON.stringify(a) === JSON.stringify(b)
  }
  return false
}
