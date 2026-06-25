import Anthropic from '@anthropic-ai/sdk'

let client = null

export function getClaudeClient() {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY no configurada en .env')
    }
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return client
}

/**
 * Llamada genérica a Claude con manejo de errores y reintentos.
 */
export async function askClaude({
  system,
  messages,
  model = 'claude-sonnet-4-20250514',
  maxTokens = 4096,
  temperature = 0.2,
  retries = 2,
}) {
  const c = getClaudeClient()
  let lastErr

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await c.messages.create({
        model,
        max_tokens:  maxTokens,
        temperature,
        system,
        messages,
      })
      const text = response.content.find(b => b.type === 'text')?.text || ''
      return { text, usage: response.usage, raw: response }
    } catch (err) {
      lastErr = err
      // Reintentar solo en errores transitorios
      if (err.status === 429 || err.status === 529 || err.status >= 500) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
        continue
      }
      throw err
    }
  }
  throw lastErr
}

/**
 * Parsea JSON del output de Claude (que a veces viene en bloques ```json).
 */
export function parseClaudeJson(text) {
  let s = text.trim()
  // Quitar markdown code fences
  s = s.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '')
  // Buscar el primer { o [ válido
  const m = s.match(/[\{\[][\s\S]*[\}\]]/)
  if (m) s = m[0]
  return JSON.parse(s)
}
