/**
 * Crypto Vault
 *
 * Maneja secretos sensibles (llaves de encriptación, secrets de OTP, passwords)
 * usando una "master key" del servidor.
 *
 * Estrategia:
 *   - El cliente envía: { value: "plaintext secret" }
 *   - Backend: encrypt(masterKey, value) → guardamos en DB
 *   - Cuando se necesita ejecutar: decrypt(masterKey, encryptedValue)
 *
 * Algoritmo: AES-256-GCM (authenticated encryption)
 *
 * La master key vive SOLO en env var SERVER_ENCRYPTION_KEY.
 * Si se pierde la master key, todos los secretos guardados se vuelven
 * indescifrables — esto es intencional y se documenta al cliente.
 */

import crypto from 'crypto'

const ALGO = 'aes-256-gcm'
const KEY_BYTES = 32   // 256 bits

let cachedMasterKey = null

function getMasterKey() {
  if (cachedMasterKey) return cachedMasterKey

  const fromEnv = process.env.SERVER_ENCRYPTION_KEY
  if (!fromEnv) {
    // En desarrollo, generar una y advertir (NO usar en prod)
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[CryptoVault] ⚠ SERVER_ENCRYPTION_KEY no configurada — usando key de desarrollo')
      cachedMasterKey = crypto.scryptSync('achilltest-dev-only-key', 'salt', KEY_BYTES)
      return cachedMasterKey
    }
    throw new Error('SERVER_ENCRYPTION_KEY no configurada')
  }

  // La env var puede venir como hex (64 chars) o base64
  if (/^[0-9a-fA-F]{64}$/.test(fromEnv)) {
    cachedMasterKey = Buffer.from(fromEnv, 'hex')
  } else {
    try {
      cachedMasterKey = Buffer.from(fromEnv, 'base64')
      if (cachedMasterKey.length !== KEY_BYTES) throw new Error('len')
    } catch {
      // Derivar de la string si no es hex/base64
      cachedMasterKey = crypto.scryptSync(fromEnv, 'achilltest-salt', KEY_BYTES)
    }
  }

  return cachedMasterKey
}

/**
 * Encripta un valor con la master key del servidor.
 * Devuelve { encryptedValue, iv, authTag } — todo en base64.
 */
export function encryptSecret(plaintext) {
  if (typeof plaintext !== 'string') plaintext = String(plaintext)

  const key    = getMasterKey()
  const iv     = crypto.randomBytes(12)            // GCM recomienda 12 bytes
  const cipher = crypto.createCipheriv(ALGO, key, iv)

  let encrypted = cipher.update(plaintext, 'utf8')
  encrypted = Buffer.concat([encrypted, cipher.final()])

  return {
    encryptedValue: encrypted.toString('base64'),
    iv:             iv.toString('base64'),
    authTag:        cipher.getAuthTag().toString('base64'),
  }
}

/**
 * Desencripta un valor previamente encriptado por encryptSecret.
 */
export function decryptSecret({ encryptedValue, iv, authTag }) {
  const key      = getMasterKey()
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(authTag, 'base64'))

  let decrypted = decipher.update(Buffer.from(encryptedValue, 'base64'))
  decrypted = Buffer.concat([decrypted, decipher.final()])

  return decrypted.toString('utf8')
}

/**
 * Genera un "hint" para mostrar al usuario sin revelar el secreto.
 * Ej: "AKIA...XYZ9" → "****XYZ9"
 */
export function generateHint(plaintext) {
  if (!plaintext) return '****'
  const s = String(plaintext)
  if (s.length <= 8) return '****'
  return `****${s.slice(-4)}`
}

/**
 * Helper: encripta varios secretos a la vez y devuelve filas listas para insertar.
 */
export function buildSecretRow({ collectionId, userId, secretType, label, plaintext }) {
  const { encryptedValue, iv, authTag } = encryptSecret(plaintext)
  return {
    collectionId,
    userId,
    secretType,
    label,
    encryptedValue,
    iv,
    authTag,
    displayHint: generateHint(plaintext),
  }
}
