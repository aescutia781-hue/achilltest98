/**
 * WCAG Translator
 *
 * Convierte issues técnicos a descripción humana en español:
 *   1. Si la regla está en el catálogo KNOWN_RULES → usa la traducción manual
 *   2. Si NO está → usa Claude para traducirla
 *
 * Genera para cada issue:
 *   - humanTitle:           Título corto y claro
 *   - humanDescription:     Qué pasa
 *   - humanImpact:          A quién afecta y por qué importa
 *   - humanFixSuggestion:   Cómo arreglarlo en términos simples
 *   - fixCodeSnippet:       Ejemplo de código del fix (opcional)
 */

import { askClaude, parseClaudeJson }   from './anthropic-client.js'
import { KNOWN_RULES, getRuleMetadata,
         AFFECTED_USER_GROUPS }         from '../config/wcag-rules.js'

const TRANSLATION_TEMPERATURE = 0.2

/**
 * Traduce una lista de issues a lenguaje humano.
 *
 * Issues que se pueden traducir mecánicamente (vía catálogo) son rápidos.
 * Issues no catalogados se mandan a la IA en BATCH (1 sola llamada para
 * los que faltan).
 *
 * @param {Array} issues   Lista de issues parseados del axe + analyzers
 * @param {object} [opts]
 * @param {boolean} [opts.useAi=true]  Si traducir con IA los no-catalogados
 *
 * @returns {Array} Mismos issues con humanTitle/Description/etc poblados
 */
export async function translateIssues(issues, opts = {}) {
  const useAi = opts.useAi !== false && !!process.env.ANTHROPIC_API_KEY
  const out = issues.map(i => ({ ...i }))

  // ── 1. Aplicar traducción del catálogo ─────────────────────────────────
  const needsAi = []
  for (const issue of out) {
    const meta = getRuleMetadata(issue.ruleId)

    if (meta?.humanTitle) {
      issue.humanTitle       = meta.humanTitle
      issue.humanDescription = meta.humanDescription
      issue.humanImpact      = meta.humanImpact || _impactFromUsers(meta.affectedUsers)
      issue.humanFixSuggestion = meta.fixSuggestionTemplate
        ? meta.fixSuggestionTemplate(issue.details || {})
        : null
      issue.affectedUsers    = meta.affectedUsers || []
      issue.category         = meta.category || 'other'
    } else if (useAi) {
      needsAi.push(issue)
    } else {
      // Sin IA, usar la descripción técnica directamente
      issue.humanTitle = issue.ruleDescription || issue.ruleId
      issue.humanDescription = issue.failureSummary || issue.ruleDescription || ''
      issue.affectedUsers = ['blind', 'low_vision']   // Default conservador
    }
  }

  // ── 2. Traducir el resto con IA en batch ───────────────────────────────
  if (needsAi.length > 0) {
    try {
      const translations = await _translateBatchWithAi(needsAi)

      for (const issue of needsAi) {
        const t = translations[issue.ruleId]
        if (t) {
          issue.humanTitle         = t.title
          issue.humanDescription   = t.description
          issue.humanImpact        = t.impact
          issue.humanFixSuggestion = t.fix
          issue.fixCodeSnippet     = t.code || null
          issue.affectedUsers      = t.affectedUsers || ['blind', 'low_vision']
          issue.category           = t.category || 'other'
        } else {
          // Fallback si la IA falla para este issue específico
          issue.humanTitle         = issue.ruleDescription || issue.ruleId
          issue.humanDescription   = issue.failureSummary || ''
          issue.affectedUsers      = ['blind', 'low_vision']
          issue.category           = 'other'
        }
      }
    } catch (err) {
      console.warn('[Translator] IA falló:', err.message)
      // Fallback masivo
      for (const issue of needsAi) {
        issue.humanTitle = issue.ruleDescription || issue.ruleId
        issue.humanDescription = issue.failureSummary || ''
        issue.affectedUsers = ['blind', 'low_vision']
        issue.category = 'other'
      }
    }
  }

  return out
}

// ── Traducción batch con IA ─────────────────────────────────────────────────

async function _translateBatchWithAi(issues) {
  // Deduplicar por ruleId (mismas reglas tienen misma traducción)
  const uniqueRules = new Map()
  for (const i of issues) {
    if (!uniqueRules.has(i.ruleId)) {
      uniqueRules.set(i.ruleId, {
        ruleId:           i.ruleId,
        ruleDescription:  i.ruleDescription,
        failureSummary:   i.failureSummary,
        wcagCriterion:    i.wcagCriterion,
        wcagLevel:        i.wcagLevel,
      })
    }
  }

  const rulesArr = Array.from(uniqueRules.values())

  // Cap a 20 reglas por batch (para no exceder context)
  const chunks = []
  for (let i = 0; i < rulesArr.length; i += 20) {
    chunks.push(rulesArr.slice(i, i + 20))
  }

  const result = {}

  for (const chunk of chunks) {
    const SYSTEM = `Eres un experto en accesibilidad WCAG y comunicador.
Traduce errores técnicos de accesibilidad a explicaciones claras en ESPAÑOL para QA Engineers no especializados.

Reglas estrictas:
1. Responde SOLO en JSON, sin markdown, sin texto extra.
2. Cada explicación debe ser concisa pero útil.
3. NO uses jerga técnica innecesaria.
4. Especifica qué grupos de usuarios se ven afectados.
5. La sugerencia de fix debe ser accionable.

Grupos de usuarios disponibles (usa estos IDs):
  blind         - Personas ciegas con lectores de pantalla
  low_vision    - Personas con baja visión
  color_blind   - Personas con daltonismo
  motor         - Discapacidad motora
  cognitive     - Discapacidad cognitiva
  deaf          - Personas sordas
  keyboard      - Usuarios solo con teclado
  mobile        - Usuarios mobile
  elderly       - Adultos mayores
  situational   - Situaciones temporales

Categorías disponibles (usa estos IDs):
  contrast | semantic | aria | keyboard | forms | media | language | links | visual | cognitive | mobile | other`

    const userPrompt = `Traduce estos errores WCAG. Para cada uno devuelve título, descripción, impacto, fix y grupos afectados.

Errores:
${chunk.map((r, i) => `
${i+1}. ruleId: "${r.ruleId}"
   description: ${r.ruleDescription || '(none)'}
   failure: ${r.failureSummary?.slice(0, 200) || '(none)'}
   wcag: ${r.wcagCriterion || '?'} (nivel ${r.wcagLevel || '?'})
`).join('')}

Responde con JSON:
{
  "translations": {
    "rule-id-1": {
      "title": "Título claro y corto (máx 60 chars)",
      "description": "Qué problema hay (1-2 oraciones)",
      "impact": "A quién afecta y por qué importa (1-2 oraciones)",
      "fix": "Cómo arreglarlo en español simple (1-2 oraciones)",
      "code": "Snippet de código de ejemplo del fix (opcional, máx 200 chars)",
      "affectedUsers": ["blind", "..."],
      "category": "contrast"
    }
  }
}`

    try {
      const { text } = await askClaude({
        system:      SYSTEM,
        messages:    [{ role: 'user', content: userPrompt }],
        maxTokens:   3000,
        temperature: TRANSLATION_TEMPERATURE,
      })

      const parsed = parseClaudeJson(text)
      if (parsed?.translations) {
        Object.assign(result, parsed.translations)
      }
    } catch (err) {
      console.warn('[Translator] Batch falló:', err.message)
    }
  }

  return result
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function _impactFromUsers(userIds = []) {
  if (userIds.length === 0) return ''
  const labels = userIds
    .map(id => AFFECTED_USER_GROUPS[id])
    .filter(Boolean)
    .map(g => g.label)
  return `Afecta a: ${labels.join(', ')}.`
}
