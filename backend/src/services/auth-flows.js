/**
 * Auth Flows Service
 *
 * Ejecuta el flujo de autenticación antes de los tests de la colección
 * y devuelve los headers que deben inyectarse en cada request.
 *
 * Soporta:
 *   - bearer_static:  El cliente provee un token Bearer fijo
 *   - bearer_login:   Hace POST a /login con credenciales, extrae token
 *   - bearer_login_otp: Login + OTP (paso 2)
 *   - api_key:        Header X-API-Key fijo
 *   - basic:          Basic Auth con user:password
 *   - oauth2_client:  OAuth 2.0 Client Credentials grant
 *   - hmac:           Cada request firmado con HMAC (no devuelve headers fijos)
 *   - none:           Sin auth
 */

import { getOtp } from './otp-service.js'

/**
 * Ejecuta el flow de autenticación.
 *
 * @param {object} authConfig    Configuración del usuario (sin secretos)
 * @param {object} secrets       Map { secretLabel: plaintext }
 * @param {string} baseUrl       URL base de la API
 * @param {object} [otpConfig]   Config OTP (si aplica)
 *
 * @returns {{ headers: object, vars: object }}
 *   headers: a inyectar en cada request
 *   vars:    variables capturadas (token, refreshToken, etc) para uso futuro
 */
export async function executeAuthFlow(authConfig, secrets, baseUrl, otpConfig) {
  if (!authConfig?.type || authConfig.type === 'none') {
    return { headers: {}, vars: {} }
  }

  switch (authConfig.type) {
    case 'bearer_static':
      return _staticBearer(authConfig, secrets)

    case 'bearer_login':
      return await _loginFlow(authConfig, secrets, baseUrl, false, otpConfig)

    case 'bearer_login_otp':
      return await _loginFlow(authConfig, secrets, baseUrl, true, otpConfig)

    case 'api_key':
      return _apiKeyHeader(authConfig, secrets)

    case 'basic':
      return _basicAuth(authConfig, secrets)

    case 'oauth2_client':
      return await _oauth2ClientCredentials(authConfig, secrets, baseUrl)

    case 'hmac':
      // HMAC se aplica por request, no en flow inicial
      return { headers: {}, vars: { hmacSecret: secrets.hmac_secret } }

    default:
      throw new Error(`Tipo de auth desconocido: ${authConfig.type}`)
  }
}

// ── Implementaciones ──────────────────────────────────────────────────────────

function _staticBearer(config, secrets) {
  const token = secrets.bearer_token
  if (!token) throw new Error('Bearer token no configurado')
  return {
    headers: { Authorization: `Bearer ${token}` },
    vars:    { token },
  }
}

function _apiKeyHeader(config, secrets) {
  const apiKey   = secrets.api_key
  const header   = config.headerName || 'X-API-Key'
  if (!apiKey) throw new Error('API key no configurada')
  return {
    headers: { [header]: apiKey },
    vars:    { apiKey },
  }
}

function _basicAuth(config, secrets) {
  const user = config.username || secrets.username
  const pass = secrets.password
  if (!user || !pass) throw new Error('Basic auth requiere username y password')
  const token = Buffer.from(`${user}:${pass}`).toString('base64')
  return {
    headers: { Authorization: `Basic ${token}` },
    vars:    {},
  }
}

/**
 * Login flow estándar:
 *   1. POST {loginUrl} con { user, password }
 *   2. Si hay OTP: POST {otpVerifyUrl} con { challengeId, otp }
 *   3. Extrae el token del campo configurado (ej. "data.access_token")
 *   4. Devuelve el token como Bearer
 */
async function _loginFlow(config, secrets, baseUrl, requiresOtp, otpConfig) {
  const loginUrl = _resolveUrl(config.loginUrl, baseUrl)
  const username = config.username || secrets.username
  const password = secrets.password

  if (!username || !password) {
    throw new Error('Login flow requiere username y password en secretos')
  }

  // Construir body según el formato configurado
  const userField = config.usernameField || 'username'
  const passField = config.passwordField || 'password'

  const body = {
    [userField]: username,
    [passField]: password,
    ...(config.extraBody || {}),
  }

  // Paso 1: login
  const loginRes = await fetch(loginUrl, {
    method:  config.loginMethod || 'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })

  if (!loginRes.ok) {
    const text = await loginRes.text().catch(() => '')
    throw new Error(`Login falló (${loginRes.status}): ${text.slice(0, 200)}`)
  }

  const loginData = await loginRes.json()

  // Si requiere OTP como paso 2
  let finalData = loginData
  if (requiresOtp) {
    const otp = await getOtp(otpConfig)
    if (!otp) throw new Error('OTP no obtenido')

    const verifyUrl = _resolveUrl(otpConfig.verifyUrl, baseUrl)
    const challengeField = otpConfig.challengeField || 'challengeId'
    const otpField       = otpConfig.otpField       || 'otp'

    const verifyBody = {
      [challengeField]: _deepGet(loginData, otpConfig.challengeSource || 'challengeId'),
      [otpField]:       otp,
    }

    const verifyRes = await fetch(verifyUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(verifyBody),
    })

    if (!verifyRes.ok) {
      const text = await verifyRes.text().catch(() => '')
      throw new Error(`Verify OTP falló (${verifyRes.status}): ${text.slice(0, 200)}`)
    }
    finalData = await verifyRes.json()
  }

  // Extraer token del campo configurado
  const tokenPath = config.tokenField || 'token'
  const token     = _deepGet(finalData, tokenPath)
  if (!token) {
    throw new Error(`No se encontró token en el campo "${tokenPath}" del response`)
  }

  const tokenPrefix = config.tokenPrefix || 'Bearer '
  const headerName  = config.tokenHeader || 'Authorization'

  // Capturar también refresh token si existe
  const captured = { token }
  if (config.refreshTokenField) {
    captured.refreshToken = _deepGet(finalData, config.refreshTokenField)
  }

  return {
    headers: { [headerName]: `${tokenPrefix}${token}` },
    vars:    captured,
  }
}

/**
 * OAuth 2.0 Client Credentials grant.
 *   POST {tokenUrl}
 *     grant_type=client_credentials
 *     client_id=...
 *     client_secret=...
 *     scope=... (opcional)
 */
async function _oauth2ClientCredentials(config, secrets, baseUrl) {
  const tokenUrl     = _resolveUrl(config.tokenUrl, baseUrl)
  const clientId     = config.clientId || secrets.oauth_client_id
  const clientSecret = secrets.oauth_client_secret

  if (!clientId || !clientSecret) {
    throw new Error('OAuth 2.0 requiere clientId y clientSecret')
  }

  const params = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     clientId,
    client_secret: clientSecret,
    ...(config.scope ? { scope: config.scope } : {}),
  })

  const res = await fetch(tokenUrl, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    params.toString(),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`OAuth falló (${res.status}): ${text.slice(0, 200)}`)
  }

  const data = await res.json()
  const token = data.access_token
  if (!token) throw new Error('OAuth response no contiene access_token')

  return {
    headers: { Authorization: `Bearer ${token}` },
    vars:    { token, refreshToken: data.refresh_token },
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function _resolveUrl(url, baseUrl) {
  if (!url) throw new Error('URL requerida')
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  if (!baseUrl) return url
  // Concatenar base + path
  return baseUrl.replace(/\/$/, '') + (url.startsWith('/') ? url : '/' + url)
}

function _deepGet(obj, path) {
  if (!path) return undefined
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj)
}
