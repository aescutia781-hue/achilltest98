/**
 * Claude Client — Anthropic API wrapper
 *
 * Wrapper minimalista para llamar a la API de Anthropic.
 * No usamos @anthropic-ai/sdk porque agrega ~500KB y nuestro uso es acotado.
 *
 * Docs: https://docs.anthropic.com/en/api/messages
 *
 * Variables de entorno:
 *   ANTHROPIC_API_KEY     — API key de Anthropic
 *   ANTHROPIC_MODEL       — default: claude-haiku-4-5 (pass 1 del escalonado)
 *
 * Pricing actualizado (junio 2026, oficial Anthropic):
 *   Haiku 4.5:  $1.00 input / $5.00 output  por 1M tokens
 *   Sonnet 4.6: $3.00 input / $15.00 output por 1M tokens
 *   Opus 4.8:   $5.00 input / $25.00 output por 1M tokens
 *
 *   Prompt caching: 90% off en input cacheado (write 1.25x, read 0.1x)
 *   Batch API: 50% off en todo (no usado por ahora — necesitamos respuestas sync)
 */

const DEFAULT_MODEL = 'claude-haiku-4-5'    // Pass 1 del escalonado
const SONNET_MODEL  = 'claude-sonnet-4-6'   // Pass 2 fallback
const API_URL       = 'https://api.anthropic.com/v1/messages'

// Modelos disponibles y sus identifiers exactos (para el escalonado)
export const MODELS = {
  HAIKU:  'claude-haiku-4-5',
  SONNET: 'claude-sonnet-4-6',
  OPUS:   'claude-opus-4-8',
}

// Pricing por modelo (USD por millón de tokens). Junio 2026.
// cache_write: 1.25x del input price. cache_read: 0.1x del input price (90% descuento).
const PRICING = {
  'claude-haiku-4-5':  {
    input:       1.00,
    output:      5.00,
    cacheWrite:  1.25,    // 1.25 × input
    cacheRead:   0.10,    // 0.1 × input (90% off)
  },
  'claude-sonnet-4-6': {
    input:       3.00,
    output:     15.00,
    cacheWrite:  3.75,
    cacheRead:   0.30,
  },
  'claude-opus-4-8':   {
    input:       5.00,
    output:     25.00,
    cacheWrite:  6.25,
    cacheRead:   0.50,
  },
  // Aliases para fallbacks
  'claude-opus-4-7':   { input: 5.00, output: 25.00, cacheWrite: 6.25, cacheRead: 0.50 },
  'claude-opus-4-6':   { input: 5.00, output: 25.00, cacheWrite: 6.25, cacheRead: 0.50 },
}

/**
 * Llama a Claude con un prompt estructurado.
 *
 * @param {object} opts
 * @param {string|Array} opts.system  System prompt. Si es array de bloques,
 *                                     se preserva tal cual (permite cache_control).
 * @param {Array|string} opts.messages  Array de { role, content } o string
 * @param {string} [opts.model]
 * @param {number} [opts.maxTokens=4096]
 * @param {number} [opts.temperature=0]   default 0 para análisis de código
 * @param {boolean} [opts.cacheSystem=false]  Si true y system es string, lo envuelve
 *                                             en un bloque con cache_control:ephemeral.
 *                                             Activa prompt caching (90% off en reads).
 *
 * @returns {Promise<{ text, model, usage }>}
 *   usage incluye: inputTokens, outputTokens, cacheCreationTokens,
 *                  cacheReadTokens, costUsd
 */
export async function callClaude(opts) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY no configurado. Repair Agent deshabilitado.')
  }

  const model = opts.model || process.env.ANTHROPIC_MODEL || DEFAULT_MODEL

  // Normalizar messages
  let messages
  if (typeof opts.messages === 'string') {
    messages = [{ role: 'user', content: opts.messages }]
  } else if (Array.isArray(opts.messages)) {
    messages = opts.messages
  } else {
    throw new Error('messages debe ser string o array')
  }

  // Normalizar system para soportar caching
  let system = opts.system
  if (system && opts.cacheSystem && typeof system === 'string') {
    system = [{
      type: 'text',
      text: system,
      cache_control: { type: 'ephemeral' },
    }]
  }

  const body = {
    model,
    max_tokens:  opts.maxTokens || 4096,
    temperature: opts.temperature !== undefined ? opts.temperature : 0,
    messages,
    ...(system ? { system } : {}),
  }

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type':       'application/json',
      'x-api-key':          apiKey,
      'anthropic-version':  '2023-06-01',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    let errorBody = null
    try { errorBody = await res.json() } catch {}
    const message = errorBody?.error?.message || `HTTP ${res.status}`
    const err = new Error(`Claude: ${message}`)
    err.status = res.status
    err.response = errorBody
    throw err
  }

  const data = await res.json()

  // Extraer texto (puede haber múltiples content blocks)
  const text = (data.content || [])
    .filter(c => c.type === 'text')
    .map(c => c.text)
    .join('')

  // Calcular costo (incluye prompt caching)
  // Anthropic devuelve:
  //   input_tokens                  → input fresco no cacheado
  //   cache_creation_input_tokens   → input que se está escribiendo al cache
  //   cache_read_input_tokens       → input que vino del cache (90% off)
  //   output_tokens                 → output
  const inputTokens          = data.usage?.input_tokens || 0
  const cacheCreationTokens  = data.usage?.cache_creation_input_tokens || 0
  const cacheReadTokens      = data.usage?.cache_read_input_tokens || 0
  const outputTokens         = data.usage?.output_tokens || 0
  const pricing              = PRICING[model] || PRICING[DEFAULT_MODEL]

  const costUsd = (
    inputTokens         * pricing.input      +
    cacheCreationTokens * pricing.cacheWrite +
    cacheReadTokens     * pricing.cacheRead  +
    outputTokens        * pricing.output
  ) / 1_000_000

  return {
    text,
    model,
    stopReason: data.stop_reason,
    usage: {
      inputTokens,
      outputTokens,
      cacheCreationTokens,
      cacheReadTokens,
      costUsd: Number(costUsd.toFixed(6)),
    },
  }
}

/**
 * Igual que callClaude pero extrae un JSON del response.
 * El system prompt debe instruir al modelo a responder SOLO en JSON.
 *
 * Maneja casos donde el modelo envuelve el JSON en ```json fences.
 */
export async function callClaudeForJson(opts) {
  const result = await callClaude(opts)

  // Limpiar fences si los hay
  let cleaned = result.text.trim()

  // Algunos modelos envuelven en ```json ... ```
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim()
  }

  // Si después de limpiar no empieza con { o [, buscar el primer {
  if (!cleaned.startsWith('{') && !cleaned.startsWith('[')) {
    const firstBrace = cleaned.indexOf('{')
    if (firstBrace >= 0) cleaned = cleaned.slice(firstBrace)
  }

  // Algunos casos: hay texto extra después del JSON. Tratar de balancearlo.
  let parsed
  try {
    parsed = JSON.parse(cleaned)
  } catch (err) {
    // Intento de recuperación: cortar hasta la última } balanceada
    const lastBrace = cleaned.lastIndexOf('}')
    if (lastBrace > 0) {
      try {
        parsed = JSON.parse(cleaned.slice(0, lastBrace + 1))
      } catch {
        throw new Error(`Claude respondió JSON malformado: ${err.message}\nResponse: ${result.text.slice(0, 300)}`)
      }
    } else {
      throw new Error(`Claude no respondió JSON válido: ${result.text.slice(0, 300)}`)
    }
  }

  return { ...result, json: parsed }
}

/**
 * Verifica si la API key está configurada.
 */
export function isClaudeConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY)
}

/**
 * Estimación rápida de tokens (heurística, no exacta).
 *
 * No usamos un tokenizer real porque agregaría 2-3MB de deps.
 * Para nuestro propósito (estimar costo ANTES de llamar) la heurística
 * de "1 token ≈ 4 chars en inglés / 3.5 chars en español" es suficiente.
 *
 * El error típico es ±10% — útil para mostrar al user "esto costará ~$0.03".
 */
export function estimateTokens(text) {
  if (!text) return 0
  // 1 token ≈ 3.7 chars (promedio mixto código + español)
  return Math.ceil(text.length / 3.7)
}

/**
 * Estima el costo total de una llamada DADO un prompt, antes de hacer la llamada.
 *
 * @param {object} opts
 * @param {string} opts.systemText
 * @param {string} opts.userText
 * @param {number} [opts.expectedOutputTokens=1000]  Estimación de output
 * @param {string} [opts.model]
 * @param {boolean} [opts.cacheSystem=false]  Si true, asume cache HIT en system
 *
 * @returns {{ inputTokens, outputTokens, costUsd, costMxn }}
 */
export function estimateCost({
  systemText = '',
  userText = '',
  expectedOutputTokens = 1000,
  model = DEFAULT_MODEL,
  cacheSystem = false,
}) {
  const systemTokens = estimateTokens(systemText)
  const userTokens   = estimateTokens(userText)
  const pricing      = PRICING[model] || PRICING[DEFAULT_MODEL]

  let costUsd
  if (cacheSystem && systemTokens > 1024) {
    // El system viene del cache (90% off). Solo cuenta como cache read.
    costUsd = (
      systemTokens         * pricing.cacheRead +
      userTokens           * pricing.input     +
      expectedOutputTokens * pricing.output
    ) / 1_000_000
  } else {
    costUsd = (
      (systemTokens + userTokens) * pricing.input +
      expectedOutputTokens         * pricing.output
    ) / 1_000_000
  }

  return {
    inputTokens:  systemTokens + userTokens,
    outputTokens: expectedOutputTokens,
    costUsd:      Number(costUsd.toFixed(6)),
    costMxn:      Number((costUsd * 17.46).toFixed(4)),  // MXN @ 17.46
    model,
  }
}
