/**
 * OTP Service
 *
 * Genera códigos OTP para los tests de API que requieren 2FA.
 *
 * Modos soportados:
 *   - totp:    Genera código TOTP (Google Authenticator, Authy) desde un secret
 *   - mock:    Devuelve siempre un valor fijo (útil para entornos de testing
 *              donde el server acepta un OTP fijo configurable)
 *   - webhook: GET a una URL que devuelve el OTP actual (cliente expone
 *              un endpoint en su entorno de testing que lee el último SMS)
 */

import crypto from 'crypto'

// ── TOTP (RFC 6238) ──────────────────────────────────────────────────────────

/**
 * Genera un código TOTP a partir de un secret en base32 (formato estándar
 * usado por Google Authenticator, Authy, etc).
 *
 * @param {string} base32Secret  Secret en base32 (ej: "JBSWY3DPEHPK3PXP")
 * @param {object} [opts]
 * @param {number} [opts.period=30]   Periodo en segundos
 * @param {number} [opts.digits=6]    Cantidad de dígitos
 * @param {string} [opts.algorithm='sha1']
 */
export function generateTotp(base32Secret, opts = {}) {
  const period    = opts.period    || 30
  const digits    = opts.digits    || 6
  const algorithm = opts.algorithm || 'sha1'

  const secretBuf = _base32Decode(base32Secret)
  const counter   = Math.floor(Date.now() / 1000 / period)

  // 8-byte counter buffer (big-endian)
  const counterBuf = Buffer.alloc(8)
  counterBuf.writeBigUInt64BE(BigInt(counter))

  const hmac = crypto.createHmac(algorithm, secretBuf).update(counterBuf).digest()

  // Truncate dinámico
  const offset = hmac[hmac.length - 1] & 0x0f
  const binary =
    ((hmac[offset]     & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) <<  8) |
     (hmac[offset + 3] & 0xff)

  const code = (binary % Math.pow(10, digits)).toString().padStart(digits, '0')
  return code
}

// ── Helper: decodificar base32 ───────────────────────────────────────────────

function _base32Decode(s) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const cleaned  = s.replace(/=+$/, '').replace(/\s/g, '').toUpperCase()
  let bits = ''
  for (const ch of cleaned) {
    const idx = alphabet.indexOf(ch)
    if (idx === -1) continue
    bits += idx.toString(2).padStart(5, '0')
  }
  const bytes = []
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2))
  }
  return Buffer.from(bytes)
}

// ── API pública ──────────────────────────────────────────────────────────────

/**
 * Obtiene un código OTP según la configuración del cliente.
 *
 * @param {object} otpConfig
 * @param {boolean} otpConfig.enabled
 * @param {string}  otpConfig.type        totp | mock | webhook
 * @param {string}  [otpConfig.secret]    Para TOTP, secret en base32 (decrypted)
 * @param {string}  [otpConfig.mockValue] Para mock, valor fijo
 * @param {string}  [otpConfig.webhookUrl] Para webhook, URL que devuelve el OTP
 */
export async function getOtp(otpConfig) {
  if (!otpConfig?.enabled) return null

  const type = otpConfig.type || 'mock'

  if (type === 'totp') {
    if (!otpConfig.secret) throw new Error('TOTP secret requerido')
    return generateTotp(otpConfig.secret)
  }

  if (type === 'mock') {
    return otpConfig.mockValue || '123456'
  }

  if (type === 'webhook') {
    const res = await fetch(otpConfig.webhookUrl, { method: 'GET' })
    if (!res.ok) throw new Error(`OTP webhook devolvió ${res.status}`)
    const text = await res.text()
    // El webhook puede devolver el OTP directo o un JSON con campo "otp"
    try {
      const json = JSON.parse(text)
      return json.otp || json.code || json.value || text.trim()
    } catch {
      return text.trim()
    }
  }

  throw new Error(`Tipo de OTP desconocido: ${type}`)
}
