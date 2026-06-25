/**
 * DOM Investigator
 *
 * Decide cómo obtener el contexto del DOM al momento del fallo para
 * pasárselo a Claude. Tiene dos estrategias:
 *
 *   1. SNAPSHOT (rápido, barato)
 *      Si el execution ya tiene dom_snapshot_url guardado, lo descarga.
 *      Si no, devuelve null y debe escalarse a re-ejecución.
 *
 *   2. RE-EXECUTE (preciso, costoso)
 *      Abre Playwright headless, ejecuta los steps del spec hasta UNO
 *      ANTES del paso que falló, captura DOM + screenshot, cierra.
 *
 * El service que orquesta repair (repair-agent.js) decide cuál usar
 * según presencia de snapshot y un flag de "force re-execute".
 *
 * El DOM se serializa de forma compacta para no inflar el prompt:
 *   - URL y title
 *   - Lista de elementos interactivos relevantes (botones, links, inputs)
 *   - Por elemento: text, attrs (id, data-testid, aria-label, class), bbox
 *   - HTML truncado del <body> (primeros 30K chars como fallback)
 */

import { chromium }      from 'playwright'
import { scanPageDom }   from './dom-scanner.js'

const RE_EXECUTE_TIMEOUT_MS = 30000

/**
 * Estrategia primaria: leer el snapshot guardado.
 *
 * @param {object} execution        El registro de executions
 * @returns {Promise<object|null>}  DOM context o null si no hay snapshot
 */
export async function investigateFromSnapshot(execution) {
  if (!execution.domSnapshotUrl) return null

  try {
    // El snapshot puede ser una URL (S3/CDN) o un path local
    let html
    if (execution.domSnapshotUrl.startsWith('http')) {
      const res = await fetch(execution.domSnapshotUrl)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      html = await res.text()
    } else {
      // Path local en /mnt/screenshots o similar
      const fs = await import('fs/promises')
      html = await fs.readFile(execution.domSnapshotUrl, 'utf-8')
    }

    // Parsear el HTML como pseudo-DOM para extraer info
    const summary = _extractInteractiveFromHTML(html)

    return {
      source:         'snapshot',
      pageUrl:        execution.pageUrlAtFail || null,
      pageTitle:      null,
      interactiveElements: summary.elements,
      htmlPreview:    html.length > 30000 ? html.slice(0, 30000) + '\n...[truncated]' : html,
      consoleLogs:    execution.consoleLogs || [],
    }
  } catch (err) {
    console.warn(`[Investigator] snapshot failed: ${err.message}`)
    return null
  }
}

/**
 * Estrategia fallback: re-ejecutar el spec hasta antes del paso roto.
 *
 * @param {object} opts
 * @param {string} opts.specCode        El código fuente del spec
 * @param {string} opts.targetUrl       URL inicial del test
 * @param {number} [opts.failedStepIndex] Si se sabe, parar justo antes
 *
 * @returns {Promise<object>}  DOM context completo
 */
export async function investigateByReExecuting({ specCode, targetUrl, failedStepIndex }) {
  let browser
  try {
    browser = await chromium.launch({ headless: true })
    const context = await browser.newContext()
    const page    = await context.newPage()

    // Capturar console logs
    const consoleLogs = []
    page.on('console', msg => {
      consoleLogs.push({
        type: msg.type(),
        text: msg.text().slice(0, 300),
      })
    })

    // Navegar al target inicial
    await page.goto(targetUrl, { timeout: RE_EXECUTE_TIMEOUT_MS, waitUntil: 'domcontentloaded' })

    // Re-ejecutar los pasos extraídos del specCode hasta el step problemático.
    // Heurística simple: extraer las líneas con `await page.X(...)` y
    // ejecutarlas en orden hasta failedStepIndex.
    const steps = _extractStepsFromSpec(specCode)
    const upTo  = failedStepIndex !== undefined && failedStepIndex !== null
      ? Math.max(0, failedStepIndex - 1)
      : steps.length - 1  // ejecutar todo menos el último

    for (let i = 0; i < Math.min(upTo, steps.length); i++) {
      const step = steps[i]
      try {
        await _executePlaywrightCall(page, step)
        await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {})
      } catch (err) {
        // Si un paso anterior también falla, paramos ahí — ese es el verdadero punto
        console.warn(`[Investigator] step ${i} falló: ${err.message}`)
        break
      }
    }

    // Capturar DOM en ese momento
    const scanned = await scanPageDom(page, { maxElements: 50 })

    // Tomar screenshot (base64)
    const screenshot = await page.screenshot({ type: 'jpeg', quality: 60, fullPage: false })
    const screenshotBase64 = screenshot.toString('base64')

    // HTML del body (truncado)
    const html = await page.content()
    const htmlPreview = html.length > 30000 ? html.slice(0, 30000) + '\n...[truncated]' : html

    return {
      source:               're_execute',
      pageUrl:              scanned.url,
      pageTitle:            scanned.title,
      interactiveElements:  scanned.elements,
      htmlPreview,
      consoleLogs,
      screenshotBase64,
    }
  } finally {
    if (browser) await browser.close().catch(() => {})
  }
}

// ── HELPERS ──────────────────────────────────────────────────────────────────

/**
 * Extrae elementos interactivos de un string HTML estático (sin browser).
 * Útil cuando solo tenemos el snapshot guardado.
 *
 * No es tan completo como scanPageDom (no sabe si está visible) pero
 * es suficiente para que el LLM identifique selectores alternativos.
 */
function _extractInteractiveFromHTML(html) {
  const elements = []
  const MAX = 50

  // Regex simple para encontrar elementos interactivos
  const patterns = [
    { tag: 'button',   regex: /<button\b([^>]*)>([\s\S]*?)<\/button>/gi },
    { tag: 'a',        regex: /<a\b([^>]*\bhref=[^>]*)>([\s\S]*?)<\/a>/gi },
    { tag: 'input',    regex: /<input\b([^>]*?)\s*\/?>/gi },
    { tag: 'select',   regex: /<select\b([^>]*)>([\s\S]*?)<\/select>/gi },
    { tag: 'textarea', regex: /<textarea\b([^>]*)>([\s\S]*?)<\/textarea>/gi },
  ]

  for (const { tag, regex } of patterns) {
    let match
    while ((match = regex.exec(html)) !== null && elements.length < MAX) {
      const attrs = _parseAttrs(match[1])
      const inner = match[2] ? _stripTags(match[2]).trim().slice(0, 100) : ''
      elements.push({
        tag,
        text:        inner,
        id:          attrs.id,
        testid:      attrs['data-testid'] || attrs['data-test'] || attrs['data-cy'],
        ariaLabel:   attrs['aria-label'],
        name:        attrs.name,
        type:        attrs.type,
        placeholder: attrs.placeholder,
        className:   attrs.class,
        href:        attrs.href,
      })
    }
    if (elements.length >= MAX) break
  }

  return { elements }
}

function _parseAttrs(attrsStr) {
  const attrs = {}
  if (!attrsStr) return attrs
  const regex = /([a-z\-:_]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi
  let m
  while ((m = regex.exec(attrsStr)) !== null) {
    attrs[m[1].toLowerCase()] = m[2] || m[3] || m[4] || ''
  }
  return attrs
}

function _stripTags(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Extrae las "acciones Playwright" línea por línea del specCode.
 * Devuelve algo procesable como [{ action: 'click', selector: '#login' }, ...]
 *
 * Soporta: click, fill, goto, press, hover, check, uncheck, selectOption
 */
function _extractStepsFromSpec(specCode) {
  const steps = []
  const lines = specCode.split('\n')
  // page.METHOD('selector', 'value'?)
  const re = /await\s+page\.(\w+)\s*\(\s*(['"`])([^'"`]+)\2(?:\s*,\s*(['"`])([^'"`]*)\4)?\s*\)/

  lines.forEach((line, index) => {
    const m = line.match(re)
    if (!m) return
    steps.push({
      lineIndex: index,
      method:    m[1],
      arg1:      m[3],
      arg2:      m[5] || null,
    })
  })

  return steps
}

/**
 * Ejecuta un step en el page de Playwright (con timeout corto para no colgarse).
 */
async function _executePlaywrightCall(page, step) {
  const timeout = 5000
  switch (step.method) {
    case 'goto':
      return await page.goto(step.arg1, { timeout, waitUntil: 'domcontentloaded' })
    case 'click':
      return await page.click(step.arg1, { timeout })
    case 'fill':
      return await page.fill(step.arg1, step.arg2 || '', { timeout })
    case 'press':
      return await page.press(step.arg1, step.arg2 || 'Enter', { timeout })
    case 'hover':
      return await page.hover(step.arg1, { timeout })
    case 'check':
      return await page.check(step.arg1, { timeout })
    case 'uncheck':
      return await page.uncheck(step.arg1, { timeout })
    case 'selectOption':
      return await page.selectOption(step.arg1, step.arg2 || '', { timeout })
    case 'waitForSelector':
      return await page.waitForSelector(step.arg1, { timeout })
    default:
      // No hacemos nada con métodos desconocidos (expect., etc.)
      return null
  }
}
