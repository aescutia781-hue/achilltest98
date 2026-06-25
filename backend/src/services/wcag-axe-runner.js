/**
 * axe-core Runner
 *
 * Inyecta axe-core en la página y ejecuta el análisis.
 * Maneja:
 *   - Carga del script axe.min.js
 *   - Configuración de tags WCAG (A, AA, AAA, best-practice)
 *   - Captura del resultado en formato JSON
 *   - Manejo de timeouts y errores
 */

import { readFileSync, existsSync } from 'fs'
import { join, dirname }            from 'path'
import { fileURLToPath }            from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// axe-core 4.10 (verbatim del paquete oficial, embedded para no depender de CDN)
// En producción real, instalarías "axe-core" como npm dep
let _axeSource = null

function loadAxeSource() {
  if (_axeSource) return _axeSource
  // Intentar cargar desde node_modules
  const candidates = [
    join(process.cwd(), 'node_modules/axe-core/axe.min.js'),
    join(__dirname, '../../node_modules/axe-core/axe.min.js'),
    '/app/node_modules/axe-core/axe.min.js',
  ]
  for (const p of candidates) {
    if (existsSync(p)) {
      _axeSource = readFileSync(p, 'utf-8')
      return _axeSource
    }
  }
  // Si no está, devolver null para que se cargue desde CDN
  return null
}

/**
 * Mapeo de niveles WCAG a tags de axe-core.
 */
const LEVEL_TAGS = {
  'A':   ['wcag2a', 'wcag21a', 'wcag22a'],
  'AA':  ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'],
  'AAA': ['wcag2a', 'wcag2aa', 'wcag2aaa', 'wcag21a', 'wcag21aa', 'wcag21aaa', 'wcag22a', 'wcag22aa', 'wcag22aaa'],
}

/**
 * Ejecuta el análisis de axe-core sobre una página Playwright.
 *
 * @param {import('playwright').Page} page  Página de Playwright
 * @param {object} options
 * @param {string} options.level             A | AA | AAA
 * @param {string[]} [options.includeTags]   Tags adicionales (best-practice, etc)
 * @param {string[]} [options.excludeRules]  Reglas específicas a excluir
 *
 * @returns {Promise<AxeResults>}
 */
export async function runAxeAnalysis(page, options = {}) {
  const level = options.level || 'AA'
  const tags  = [...(LEVEL_TAGS[level] || LEVEL_TAGS.AA)]

  // Incluir best-practice por default si no está excluido
  if (options.includeTags?.includes('best-practice') !== false) {
    tags.push('best-practice')
  }

  // ── 1. Inyectar axe-core en la página ───────────────────────────────────
  const axeSource = loadAxeSource()
  if (axeSource) {
    await page.evaluate(axeSource)
  } else {
    // Fallback a CDN
    await page.addScriptTag({ url: 'https://cdn.jsdelivr.net/npm/axe-core@4.10.2/axe.min.js' })
  }

  // ── 2. Esperar que axe esté disponible ──────────────────────────────────
  await page.waitForFunction(() => typeof window.axe !== 'undefined', { timeout: 5000 })

  // ── 3. Ejecutar el análisis ─────────────────────────────────────────────
  const results = await page.evaluate(async ([tags, excludeRules]) => {
    // Configurar
    const rules = {}
    for (const r of (excludeRules || [])) {
      rules[r] = { enabled: false }
    }

    const config = {
      runOnly: { type: 'tag', values: tags },
      rules,
      // Performance: solo lo esencial
      resultTypes: ['violations', 'passes', 'incomplete', 'inapplicable'],
      // Selectores
      selectors: true,
      ancestry: true,
      xpath:    true,
    }

    try {
      const r = await window.axe.run(document, config)
      return {
        success:        true,
        violations:     r.violations,
        passes:         r.passes,
        incomplete:     r.incomplete,
        inapplicable:   r.inapplicable,
        url:            r.url,
        timestamp:      r.timestamp,
        testEngineName: r.testEngine?.name,
        testEngineVersion: r.testEngine?.version,
      }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  }, [tags, options.excludeRules || []])

  if (!results.success) {
    throw new Error(`axe-core falló: ${results.error}`)
  }

  return results
}

/**
 * Aplana los nodos de las violaciones a una lista lineal de issues
 * (axe agrupa nodos por regla, nosotros queremos uno por nodo afectado).
 */
export function flattenViolations(axeResults) {
  const flat = []

  for (const violation of axeResults.violations || []) {
    for (const node of violation.nodes) {
      flat.push({
        ruleId:        violation.id,
        impact:        node.impact || violation.impact || 'minor',
        ruleDescription: violation.help,
        ruleHelp:      violation.helpUrl,
        wcagTags:      violation.tags || [],
        wcagCriterion: _extractWcagCriterion(violation.tags),
        wcagLevel:     _extractWcagLevel(violation.tags),
        selector:      node.target?.[0] || '',
        htmlSnippet:   node.html || '',
        xpath:         node.xpath?.[0] || '',
        ancestry:      node.ancestry?.[0] || '',
        failureSummary:node.failureSummary || '',
        any:           node.any || [],
        all:           node.all || [],
        none:          node.none || [],
      })
    }
  }

  return flat
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function _extractWcagCriterion(tags) {
  // Tags como "wcag143" → "1.4.3"
  for (const t of tags || []) {
    const m = t.match(/^wcag(\d)(\d{1,2})(\d?)$/)
    if (m) {
      const [, principle, guideline, criterion] = m
      return criterion ? `${principle}.${guideline}.${criterion}` : `${principle}.${guideline}`
    }
  }
  return null
}

function _extractWcagLevel(tags) {
  if (!tags) return null
  if (tags.some(t => t.endsWith('aaa'))) return 'AAA'
  if (tags.some(t => t.endsWith('aa')))  return 'AA'
  if (tags.some(t => t === 'wcag2a' || t === 'wcag21a' || t === 'wcag22a')) return 'A'
  return null
}
