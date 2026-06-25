/**
 * Repair Agent v2
 *
 * Cuando un spec generado falla en una ejecución posterior (el sitio cambió,
 * el selector ya no existe, etc), este agente:
 *   1. Reproduce el spec original paso a paso
 *   2. Detecta exactamente en qué paso falla
 *   3. En ese momento captura: screenshot + DOM real
 *   4. Pide a Claude que corrija solo el paso problemático
 *   5. Valida la corrección reproduciéndola
 *   6. Repite hasta 3 iteraciones si la corrección también falla
 *
 * Devuelve el spec corregido (o un diagnóstico claro si no pudo).
 */

import { chromium } from 'playwright'
import { askClaude, parseClaudeJson } from '../services/anthropic-client.js'
import { scanPageDom, formatDomForAI } from '../services/dom-scanner.js'

const MAX_REPAIR_ITERATIONS = 3
const HEADLESS = process.env.HEADLESS !== 'false'

const SYSTEM = `Eres un experto en Playwright TypeScript especializado en reparar tests E2E que fallaron.

Cuando un test falla:
1. Recibes el spec original, el paso que falló y el DOM real en ese momento
2. Decides cómo corregir SOLO ese paso (no reescribas todo el spec)
3. Prefieres selectores más estables: data-testid > id > role+name > aria-label
4. Si el sitio cambió mucho, sugieres una corrección razonable

Responde siempre en JSON puro.`

/**
 * Repara un spec que falló.
 *
 * @param {object} input
 * @param {string} input.specCode       Código TypeScript del spec original
 * @param {string} input.targetUrl
 * @param {string} input.errorMessage   Mensaje de error del último run
 *
 * @returns {{ success, repairedCode?, diagnosis?, iterations }}
 */
export async function repairSpec({ specCode, targetUrl, errorMessage }) {
  let currentSpec = specCode
  const iterations = []

  for (let i = 0; i < MAX_REPAIR_ITERATIONS; i++) {
    iterations.push({ attempt: i + 1, startedAt: Date.now() })

    // Reproducir el spec actual
    const reproduction = await _reproduceSpec(currentSpec, targetUrl)

    if (reproduction.success) {
      // Ya no falla — la corrección funcionó
      return {
        success:      true,
        repairedCode: currentSpec,
        iterations:   iterations.length,
        message:      i === 0 ? 'El spec funcionó correctamente' : `Reparado en ${i} iteración(es)`,
      }
    }

    iterations[i].failureStep = reproduction.failureStep
    iterations[i].failureError = reproduction.error

    // Pedir corrección a Claude
    const fix = await _askClaudeForFix({
      specCode:      currentSpec,
      failureStep:   reproduction.failureStep,
      failureError:  reproduction.error,
      domAtFailure:  reproduction.domAtFailure,
      screenshotPath:reproduction.screenshotPath,
    })

    if (!fix.canFix) {
      return {
        success:    false,
        diagnosis:  fix.diagnosis,
        iterations: iterations.length,
        lastError:  reproduction.error,
      }
    }

    currentSpec = fix.repairedSpec
    iterations[i].endedAt = Date.now()
  }

  // Si después de 3 iteraciones aún falla
  return {
    success:    false,
    diagnosis:  `Después de ${MAX_REPAIR_ITERATIONS} intentos de reparación, el spec sigue fallando. Probablemente el sitio cambió significativamente.`,
    iterations: iterations.length,
    repairedCode: currentSpec,  // El último intento por si sirve
  }
}

// ── Reproducir el spec hasta el fallo ─────────────────────────────────────────

async function _reproduceSpec(specCode, targetUrl) {
  let browser, context, page

  try {
    browser = await chromium.launch({ headless: HEADLESS })
    context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
    page    = await context.newPage()

    // Extraer las acciones del spec
    const actions = _parseSpecActions(specCode)
    let failureStep = null
    let lastError = null

    for (let i = 0; i < actions.length; i++) {
      const action = actions[i]
      try {
        await _executeAction(page, action, targetUrl)
        // Pausa breve para que la página reaccione
        await page.waitForTimeout(200)
      } catch (err) {
        failureStep = { ...action, stepIndex: i }
        lastError   = err.message
        break
      }
    }

    if (failureStep) {
      // Capturar estado en el momento del fallo
      const dom = await scanPageDom(page)
      const domText = formatDomForAI(dom)

      return {
        success:     false,
        failureStep,
        error:       lastError,
        domAtFailure: domText,
      }
    }

    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  } finally {
    try { await context?.close() } catch {}
    try { await browser?.close() } catch {}
  }
}

/**
 * Extrae las acciones de un spec.ts (parser muy básico pero efectivo).
 */
function _parseSpecActions(specCode) {
  const actions = []
  const lines = specCode.split('\n')

  for (const line of lines) {
    const trimmed = line.trim()

    // page.goto('...')
    const goto = trimmed.match(/page\.goto\(['"`]([^'"`]+)['"`]/)
    if (goto) { actions.push({ kind: 'goto', value: goto[1] }); continue }

    // page.locator('...').click()
    const click = trimmed.match(/page\.locator\(['"`]([^'"`]+)['"`].*?\.click\(/)
    if (click) { actions.push({ kind: 'click', selector: click[1] }); continue }

    // page.getByRole('...', { name: '...' }).click()
    const roleClick = trimmed.match(/page\.getByRole\(['"`]([^'"`]+)['"`].*?name:\s*['"`]([^'"`]+)['"`].*?\.click\(/)
    if (roleClick) { actions.push({ kind: 'clickRole', role: roleClick[1], name: roleClick[2] }); continue }

    // page.getByText('...').click()
    const textClick = trimmed.match(/page\.getByText\(['"`]([^'"`]+)['"`].*?\.click\(/)
    if (textClick) { actions.push({ kind: 'clickText', text: textClick[1] }); continue }

    // page.locator('...').fill('...')
    const fill = trimmed.match(/page\.locator\(['"`]([^'"`]+)['"`].*?\.fill\(['"`]([^'"`]*)['"`]/)
    if (fill) { actions.push({ kind: 'fill', selector: fill[1], value: fill[2] }); continue }

    // expect(...).toBeVisible()
    const visible = trimmed.match(/expect\(.*?locator\(['"`]([^'"`]+)['"`].*?toBeVisible/)
    if (visible) { actions.push({ kind: 'expectVisible', selector: visible[1] }); continue }

    // expect(page).toHaveURL('...')
    const url = trimmed.match(/expect\(page\)\.toHaveURL\(['"`]([^'"`]+)['"`]/)
    if (url) { actions.push({ kind: 'expectUrl', value: url[1] }); continue }
  }

  return actions
}

async function _executeAction(page, action) {
  switch (action.kind) {
    case 'goto':
      await page.goto(action.value, { waitUntil: 'domcontentloaded', timeout: 15000 })
      break
    case 'click':
      await page.locator(action.selector).first().click({ timeout: 8000 })
      break
    case 'clickRole':
      await page.getByRole(action.role, { name: action.name }).first().click({ timeout: 8000 })
      break
    case 'clickText':
      await page.getByText(action.text, { exact: false }).first().click({ timeout: 8000 })
      break
    case 'fill':
      await page.locator(action.selector).first().fill(action.value, { timeout: 8000 })
      break
    case 'expectVisible':
      await page.locator(action.selector).first().waitFor({ state: 'visible', timeout: 8000 })
      break
    case 'expectUrl':
      // Espera y compara
      await page.waitForURL(url => url.toString().includes(action.value), { timeout: 8000 })
      break
    default:
      throw new Error(`Acción desconocida: ${action.kind}`)
  }
}

// ── Pedir a Claude que corrija el paso problemático ───────────────────────────

async function _askClaudeForFix({ specCode, failureStep, failureError, domAtFailure }) {
  const prompt = `# Spec original
\`\`\`typescript
${specCode}
\`\`\`

# Paso que falló
${JSON.stringify(failureStep, null, 2)}

# Error
${failureError}

# DOM real en el momento del fallo
${domAtFailure}

# Tarea
Analiza el DOM real y decide cómo corregir SOLO el paso que falló.

Responde con JSON:
{
  "canFix":       true,
  "diagnosis":    "1 línea explicando qué cambió",
  "repairedSpec": "spec completo con SOLO el paso problemático corregido"
}

Si el DOM cambió tanto que no se puede reparar razonablemente:
{
  "canFix":    false,
  "diagnosis": "explicación clara de por qué no se puede arreglar automáticamente"
}`

  const { text } = await askClaude({
    system:    SYSTEM,
    messages:  [{ role: 'user', content: prompt }],
    maxTokens: 3000,
    temperature: 0.1,
  })

  return parseClaudeJson(text)
}
