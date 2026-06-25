/**
 * Codegen Agent v2
 *
 * Genera specs de Playwright a partir de instrucciones en lenguaje natural.
 * Filosofía: planificar UN paso a la vez, re-escaneando el DOM antes de cada decisión.
 * Esto resuelve el problema clásico de "agente que planea todo de golpe y se equivoca
 * porque no vio el dropdown que apareció después de hacer click".
 *
 * Pipeline:
 *   1. Plan inicial — analizar instrucciones, decidir URL inicial y objetivo
 *   2. Loop:
 *      a. Escanear DOM actual
 *      b. Preguntar a Claude: "¿cuál es el siguiente paso?"
 *      c. Validar que el elemento existe
 *      d. Ejecutar (click / fill / select / etc)
 *      e. Si falla → reintentar con scroll o re-escaneo extendido
 *   3. Generar el spec final consolidado
 */

import { askClaude, parseClaudeJson } from '../services/anthropic-client.js'
import { scanPageDom, formatDomForAI } from '../services/dom-scanner.js'

const SYSTEM_PLAN = `Eres un experto en QA Automation que trabaja con Playwright en TypeScript.
Tu trabajo es generar tests E2E robustos a partir de instrucciones en lenguaje natural.

Reglas:
1. Decide UN solo paso a la vez basado en el DOM actual
2. Prefiere selectores estables: data-testid > id > role+name > aria-label
3. Nunca uses XPath ni selectores complejos por clase
4. Si necesitas esperar algo, usa expect().toBeVisible() con timeout
5. Responde SIEMPRE en formato JSON puro, sin markdown ni explicaciones`

const SYSTEM_GENERATE = `Eres un experto en QA Automation con Playwright TypeScript.
Generas el código final del spec basado en los pasos ejecutados.

Reglas del código generado:
1. Usa la sintaxis moderna de Playwright (page.locator, page.getByRole, etc.)
2. Cada paso debe tener await
3. Usa expect() para los asserts
4. Añade comentarios cortos describiendo cada bloque lógico
5. Mantén el código limpio y legible`

// ── PLANIFICAR UN PASO ────────────────────────────────────────────────────────

/**
 * Pide a Claude que decida el siguiente paso a ejecutar.
 *
 * @param {object} ctx
 * @param {string} ctx.instructions  Instrucciones originales del usuario
 * @param {string} ctx.targetUrl     URL del sitio a testear
 * @param {Array}  ctx.stepsExecuted Pasos ya ejecutados (con success/fail)
 * @param {object} ctx.dom           Resultado de scanPageDom()
 *
 * @returns {{ action, selector, value, reasoning, isComplete, assertion }}
 */
export async function planNextStep({ instructions, targetUrl, stepsExecuted, dom }) {
  const domText      = formatDomForAI(dom)
  const stepsText    = stepsExecuted.length === 0
    ? '(ningún paso ejecutado todavía)'
    : stepsExecuted.map((s, i) => `${i + 1}. ${s.action} ${s.selector || ''} ${s.value || ''} → ${s.success ? '✓' : '✗ ' + s.error}`).join('\n')

  const userPrompt = `# Instrucción del usuario
${instructions}

# URL objetivo
${targetUrl}

# Pasos ya ejecutados
${stepsText}

# Estado actual del DOM
${domText}

# Tarea
Decide el SIGUIENTE paso para cumplir la instrucción del usuario. Responde con JSON:

{
  "isComplete": false,                    // true si ya cumpliste todo
  "action":     "click|fill|select|navigate|wait|assert",
  "selector":   "{selector estable}",     // ej: "#email" o "button:'Iniciar sesión'"
  "value":      "...",                    // para fill/select
  "assertion":  "...",                    // para action=assert: qué verificar
  "reasoning":  "1 línea explicando por qué este paso"
}

Si el objetivo ya se cumplió, responde con isComplete: true y agrega un assertion final.`

  const { text } = await askClaude({
    system:   SYSTEM_PLAN,
    messages: [{ role: 'user', content: userPrompt }],
    maxTokens: 800,
    temperature: 0.1,
  })

  return parseClaudeJson(text)
}

// ── EJECUTAR UN PASO ──────────────────────────────────────────────────────────

/**
 * Ejecuta el paso decidido por la IA sobre la página de Playwright.
 * Implementa 3 niveles de recuperación si el paso falla:
 *   1. Probar el selector directo
 *   2. Hacer scroll + reintentar
 *   3. Buscar por texto en todo el documento (getByText)
 */
export async function executeStep(page, step) {
  const { action, selector, value, assertion } = step
  const startedAt = Date.now()

  try {
    switch (action) {
      case 'navigate':
        await page.goto(value || selector, { waitUntil: 'domcontentloaded', timeout: 15000 })
        break

      case 'click':
        await _clickWithRetry(page, selector)
        break

      case 'fill':
        await _fillWithRetry(page, selector, value)
        break

      case 'select':
        await _selectWithRetry(page, selector, value)
        break

      case 'wait':
        const ms = parseInt(value) || 1000
        await page.waitForTimeout(Math.min(ms, 5000))
        break

      case 'assert':
        await _assertVisible(page, selector || assertion)
        break

      default:
        throw new Error(`Acción desconocida: ${action}`)
    }

    return { success: true, durationMs: Date.now() - startedAt, ...step }
  } catch (err) {
    return {
      success:    false,
      error:      err.message,
      durationMs: Date.now() - startedAt,
      ...step,
    }
  }
}

// ── ESTRATEGIAS DE RECUPERACIÓN ───────────────────────────────────────────────

async function _clickWithRetry(page, selector) {
  const loc = _toLocator(page, selector)

  try {
    await loc.first().click({ timeout: 5000 })
    return
  } catch {}

  // Nivel 2: scroll
  try {
    await loc.first().scrollIntoViewIfNeeded({ timeout: 3000 })
    await loc.first().click({ timeout: 3000 })
    return
  } catch {}

  // Nivel 3: buscar por texto si el selector tenía formato "role:'name'"
  const textMatch = selector.match(/['"]([^'"]+)['"]/)
  if (textMatch) {
    const text = textMatch[1]
    await page.getByText(text, { exact: false }).first().click({ timeout: 3000 })
    return
  }

  throw new Error(`No se pudo hacer click en: ${selector}`)
}

async function _fillWithRetry(page, selector, value) {
  const loc = _toLocator(page, selector)

  try {
    await loc.first().fill(value, { timeout: 5000 })
    return
  } catch {}

  await loc.first().scrollIntoViewIfNeeded({ timeout: 3000 })
  await loc.first().fill(value, { timeout: 3000 })
}

async function _selectWithRetry(page, selector, value) {
  const loc = _toLocator(page, selector)
  await loc.first().selectOption(value, { timeout: 5000 })
}

async function _assertVisible(page, target) {
  const loc = _toLocator(page, target)
  await loc.first().waitFor({ state: 'visible', timeout: 8000 })
}

/**
 * Convierte un selector tipo "button:'Login'" en un Locator de Playwright.
 */
function _toLocator(page, selector) {
  if (!selector) throw new Error('Selector vacío')

  // role:"text" → getByRole
  const roleMatch = selector.match(/^([a-z]+):["'](.+?)["']$/i)
  if (roleMatch) {
    const [, role, name] = roleMatch
    if (['button', 'link', 'checkbox', 'radio', 'textbox', 'tab', 'menuitem'].includes(role.toLowerCase())) {
      return page.getByRole(role.toLowerCase(), { name, exact: false })
    }
    // Otros tags → buscar por texto
    return page.locator(role).filter({ hasText: name })
  }

  // CSS / id / atributo → locator directo
  return page.locator(selector)
}

// ── GENERAR SPEC FINAL ────────────────────────────────────────────────────────

/**
 * Después de ejecutar todos los pasos exitosamente, pide a Claude
 * que genere el spec.ts limpio y bien estructurado.
 */
export async function generateSpecCode({ instructions, targetUrl, testName, stepsExecuted }) {
  const stepsText = stepsExecuted.map((s, i) => {
    const parts = [`${i + 1}. action=${s.action}`]
    if (s.selector)  parts.push(`selector=${s.selector}`)
    if (s.value)     parts.push(`value=${s.value}`)
    if (s.assertion) parts.push(`assertion=${s.assertion}`)
    return parts.join(' | ')
  }).join('\n')

  const userPrompt = `# Test a generar
Nombre: ${testName}
URL: ${targetUrl}
Instrucciones originales: ${instructions}

# Pasos ejecutados (todos exitosamente)
${stepsText}

# Tarea
Genera el spec.ts COMPLETO de Playwright. Solo el código TypeScript, sin explicaciones ni markdown.

Estructura esperada:
\`\`\`
import { test, expect } from '@playwright/test'

test('${testName}', async ({ page }) => {
  // ... pasos convertidos a código limpio
})
\`\`\`

Responde con SOLO el código del spec, sin \`\`\`typescript ni nada más.`

  const { text } = await askClaude({
    system:   SYSTEM_GENERATE,
    messages: [{ role: 'user', content: userPrompt }],
    maxTokens: 2000,
    temperature: 0.2,
  })

  // Limpiar code fences si los puso
  let code = text.trim()
  code = code.replace(/^```(?:typescript|ts|javascript|js)?\s*\n?/i, '')
  code = code.replace(/\n?```\s*$/i, '')

  return code.trim()
}
