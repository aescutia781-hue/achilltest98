/**
 * Payload Encryption Service
 *
 * Encripta y desencripta payloads de API según la configuración del cliente.
 *
 * Modos soportados:
 *
 * 1. AES-256-GCM con clave compartida
 *    Body original:    { monto: 100 }
 *    Body enviado:     { data: "iv:authTag:ciphertext" en base64 }
 *
 * 2. AES-256-CBC (legacy, aún común en banca)
 *    Body original:    { monto: 100 }
 *    Body enviado:     { data: "iv:ciphertext" en base64 }
 *
 * 3. HMAC signature (no encripta, solo firma)
 *    Body original:    { monto: 100 }
 *    Body enviado:     { monto: 100 } + header X-Signature: HMAC-SHA256
 *
 * 4. Por campos específicos
 *    Body original:    { user: "juan", cardNumber: "4111..." }
 *    Body enviado:     { user: "juan", cardNumber: "<encrypted>" }
 *
 * 5. JWE (RFC 7516) — simplificado para A256GCM
 */

import crypto from 'crypto'

// ── AES-256-GCM ──────────────────────────────────────────────────────────────

function aesGcmEncrypt(plaintext, keyBuf) {
  const iv     = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuf, iv)
  const enc    = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag    = cipher.getAuthTag()
  // Formato: iv (12B) + tag (16B) + ciphertext, todo en base64
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

function aesGcmDecrypt(payloadB64, keyBuf) {
  const buf = Buffer.from(payloadB64, 'base64')
  const iv  = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const ct  = buf.subarray(28)
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuf, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
}

// ── AES-256-CBC ──────────────────────────────────────────────────────────────

function aesCbcEncrypt(plaintext, keyBuf) {
  const iv     = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-cbc', keyBuf, iv)
  const enc    = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return Buffer.concat([iv, enc]).toString('base64')
}

function aesCbcDecrypt(payloadB64, keyBuf) {
  const buf = Buffer.from(payloadB64, 'base64')
  const iv  = buf.subarray(0, 16)
  const ct  = buf.subarray(16)
  const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuf, iv)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
}

// ── Key parsing ──────────────────────────────────────────────────────────────

/**
 * Convierte una key del usuario a Buffer de 32 bytes (256 bits).
 * Acepta: base64, hex, o string raw (se hashea con SHA-256).
 */
function parseKey(key) {
  if (Buffer.isBuffer(key)) return key

  // Hex (64 chars = 32 bytes)
  if (/^[0-9a-fA-F]{64}$/.test(key)) return Buffer.from(key, 'hex')

  // Base64 que decodifica a 32 bytes
  try {
    const buf = Buffer.from(key, 'base64')
    if (buf.length === 32) return buf
  } catch {}

  // Fallback: hashear el string
  return crypto.createHash('sha256').update(key, 'utf8').digest()
}

// ── HMAC ─────────────────────────────────────────────────────────────────────

function hmacSign({ body, secret, algorithm = 'sha256' }) {
  const data = typeof body === 'string' ? body : JSON.stringify(body)
  return crypto.createHmac(algorithm, secret).update(data, 'utf8').digest('hex')
}

// ── JWE simplificado (A256GCM direct) ────────────────────────────────────────

function jweEncrypt(plaintext, keyBuf) {
  const header = { alg: 'dir', enc: 'A256GCM' }
  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url')

  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuf, iv)
  cipher.setAAD(Buffer.from(headerB64))
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return [
    headerB64,
    '',                                // encrypted_key (empty para dir)
    iv.toString('base64url'),
    ct.toString('base64url'),
    tag.toString('base64url'),
  ].join('.')
}

function jweDecrypt(token, keyBuf) {
  const [headerB64, /*ek*/, ivB64, ctB64, tagB64] = token.split('.')
  const iv  = Buffer.from(ivB64, 'base64url')
  const ct  = Buffer.from(ctB64, 'base64url')
  const tag = Buffer.from(tagB64, 'base64url')
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuf, iv)
  decipher.setAAD(Buffer.from(headerB64))
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
}

// ── API pública ──────────────────────────────────────────────────────────────

/**
 * Encripta un body de request según la config del cliente.
 *
 * @param {object} body                 El body original (objeto JSON)
 * @param {object} config
 * @param {boolean} config.enabled
 * @param {string}  config.algorithm    aes-256-gcm | aes-256-cbc | hmac | jwe
 * @param {string}  config.mode         body | fields
 * @param {string[]} [config.fields]    Para mode=fields, qué campos encriptar
 * @param {string}  [config.wrapperField] Para mode=body, en qué campo va el encrypted
 * @param {string}  config.key          Clave en plaintext (ya decryptada del vault)
 * @param {string}  [config.hmacSecret] Secret para HMAC
 * @param {string}  [config.hmacHeader] Header donde va la firma
 *
 * @returns {{ body, headers }}  Body modificado + headers extra a añadir
 */
export function encryptRequestPayload(body, config) {
  if (!config?.enabled) return { body, headers: {} }

  const algo = (config.algorithm || 'aes-256-gcm').toLowerCase()
  const mode = config.mode || 'body'
  const extraHeaders = {}

  // HMAC no encripta, solo firma
  if (algo === 'hmac') {
    const signature = hmacSign({ body, secret: config.hmacSecret || config.key })
    extraHeaders[config.hmacHeader || 'X-Signature'] = signature
    return { body, headers: extraHeaders }
  }

  const keyBuf = parseKey(config.key)
  const json   = JSON.stringify(body)

  // Encriptar todo el body
  if (mode === 'body') {
    let payload
    if (algo === 'aes-256-cbc') payload = aesCbcEncrypt(json, keyBuf)
    else if (algo === 'jwe')    payload = jweEncrypt(json, keyBuf)
    else                        payload = aesGcmEncrypt(json, keyBuf)   // default GCM

    const wrapperField = config.wrapperField || 'data'
    const newBody = { [wrapperField]: payload }

    // Si pidió firma HMAC ADEMÁS de encripción
    if (config.hmacSecret) {
      extraHeaders[config.hmacHeader || 'X-Signature'] = hmacSign({
        body: newBody, secret: config.hmacSecret,
      })
    }

    return { body: newBody, headers: extraHeaders }
  }

  // Encriptar solo ciertos campos
  if (mode === 'fields' && Array.isArray(config.fields)) {
    const newBody = JSON.parse(json)
    for (const field of config.fields) {
      const value = _deepGet(newBody, field)
      if (value === undefined) continue

      const valueStr = typeof value === 'string' ? value : JSON.stringify(value)
      let enc
      if (algo === 'aes-256-cbc') enc = aesCbcEncrypt(valueStr, keyBuf)
      else if (algo === 'jwe')    enc = jweEncrypt(valueStr, keyBuf)
      else                        enc = aesGcmEncrypt(valueStr, keyBuf)

      _deepSet(newBody, field, enc)
    }
    return { body: newBody, headers: extraHeaders }
  }

  return { body, headers: extraHeaders }
}

/**
 * Desencripta un response según la misma config.
 */
export function decryptResponsePayload(responseBody, config) {
  if (!config?.enabled || !responseBody) return responseBody

  const algo = (config.algorithm || 'aes-256-gcm').toLowerCase()
  if (algo === 'hmac') return responseBody   // HMAC no encripta nada

  const keyBuf = parseKey(config.key)
  const mode   = config.mode || 'body'

  try {
    if (mode === 'body') {
      const wrapperField = config.wrapperField || 'data'
      const payload = responseBody[wrapperField]
      if (typeof payload !== 'string') return responseBody

      let decrypted
      if (algo === 'aes-256-cbc') decrypted = aesCbcDecrypt(payload, keyBuf)
      else if (algo === 'jwe')    decrypted = jweDecrypt(payload, keyBuf)
      else                        decrypted = aesGcmDecrypt(payload, keyBuf)

      try { return JSON.parse(decrypted) } catch { return decrypted }
    }

    if (mode === 'fields' && Array.isArray(config.fields)) {
      const out = JSON.parse(JSON.stringify(responseBody))
      for (const field of config.fields) {
        const enc = _deepGet(out, field)
        if (typeof enc !== 'string') continue
        try {
          let dec
          if (algo === 'aes-256-cbc') dec = aesCbcDecrypt(enc, keyBuf)
          else if (algo === 'jwe')    dec = jweDecrypt(enc, keyBuf)
          else                        dec = aesGcmDecrypt(enc, keyBuf)
          try { _deepSet(out, field, JSON.parse(dec)) }
          catch { _deepSet(out, field, dec) }
        } catch {}
      }
      return out
    }
  } catch (err) {
    console.error('[decryptResponse]', err.message)
  }

  return responseBody
}

// ── Helpers para paths estilo "user.cardNumber" ──────────────────────────────

function _deepGet(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj)
}

function _deepSet(obj, path, value) {
  const keys = path.split('.')
  const last = keys.pop()
  const tgt = keys.reduce((o, k) => {
    if (o[k] === undefined) o[k] = {}
    return o[k]
  }, obj)
  tgt[last] = value
}
