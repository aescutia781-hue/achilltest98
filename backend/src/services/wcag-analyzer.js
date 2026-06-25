/**
 * WCAG Analyzer (motor principal)
 *
 * Orquesta el pipeline completo de análisis:
 *   1. Lanza Playwright + navega a la URL (con device emulation si aplica)
 *   2. Inyecta y corre axe-core
 *   3. Corre analyzers custom (estructural, teclado, visual, cognitivo)
 *   4. Captura screenshots con simulaciones de daltonismo
 *   5. Aplana issues y aplica severity calculada
 *   6. Traduce a lenguaje humano (catálogo + IA)
 *   7. Calcula score
 *   8. Genera reportes HTML/JSON/PDF
 *   9. Guarda todo en DB
 *
 * Eventos Redis pub/sub:
 *   - status   { phase, message }
 *   - progress { step, total }
 *   - completed { score, totalIssues }
 *   - error    { message }
 */

import { chromium, devices as playwrightDevices } from 'playwright'
import { mkdirSync }                  from 'fs'
import { eq }                         from 'drizzle-orm'

import { getDb, schema }              from '../db/client.js'
import { getRedis }                   from './redis-client.js'
import { getDeviceById }              from '../config/devices.js'
import { runAxeAnalysis, flattenViolations } from './wcag-axe-runner.js'
import { runStructuralAnalysis }      from './wcag-structural-analyzer.js'
import { runKeyboardAnalysis }        from './wcag-keyboard-analyzer.js'
import { runVisualAnalysis }          from './wcag-visual-analyzer.js'
import { runCognitiveAnalysis }       from './wcag-cognitive-analyzer.js'
import { captureSimulations }         from './wcag-colorblind-simulator.js'
import { translateIssues }            from './wcag-translator.js'
import { calculateScores }            from './wcag-scorer.js'
import { generateWcagReports }        from './wcag-report-generator.js'
import { calculateSeverity, getRuleMetadata } from '../config/wcag-rules.js'

const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR || '/tmp/achilltest-screenshots'
const NAV_TIMEOUT    = 30000

/**
 * Ejecuta un análisis WCAG completo.
 *
 * @param {object} opts
 * @param {string} opts.analysisId        ID del wcag_analyses ya creado
 * @param {string} opts.url
 * @param {string} opts.level             A | AA | AAA
 * @param {string} [opts.deviceId]        Device del catálogo
 * @param {object} [opts.config]          { skipSimulations, useAi, ... }
 */
export async function runWcagAnalysis(opts) {
  const { analysisId, url, level = 'AA', deviceId, config = {} } = opts

  const db = getDb()
  const startedAt = Date.now()

  // Marcar como running
  await db.update(schema.wcagAnalyses).set({
    status:    'running',
    startedAt: new Date(),
  }).where(eq(schema.wcagAnalyses.id, analysisId))

  await _publish(analysisId, 'status', { phase: 'starting', message: 'Iniciando análisis...' })

  let browser = null
  try {
    mkdirSync(SCREENSHOT_DIR, { recursive: true })

    // ── 1. Lanzar browser con device emulation ──────────────────────────
    await _publish(analysisId, 'status', { phase: 'launching', message: 'Abriendo navegador...' })

    browser = await chromium.launch({ headless: true })

    const deviceMeta = deviceId ? getDeviceById(deviceId) : null
    const deviceCategory = deviceMeta?.category || 'desktop'

    let contextOpts = {}
    if (deviceMeta && deviceMeta.id && playwrightDevices[deviceMeta.name]) {
      contextOpts = { ...playwrightDevices[deviceMeta.name] }
    } else {
      contextOpts = {
        viewport: { width: 1280, height: 800 },
        userAgent: 'Mozilla/5.0 (Achilltest WCAG Analyzer)',
      }
    }

    const context = await browser.newContext(contextOpts)
    const page    = await context.newPage()

    // ── 2. Navegar ──────────────────────────────────────────────────────
    await _publish(analysisId, 'status', { phase: 'navigating', message: `Cargando ${url}...` })
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT })
    // Esperar a que cargue contenido dinámico básico
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})

    // ── 3. axe-core ─────────────────────────────────────────────────────
    await _publish(analysisId, 'status', { phase: 'axe', message: 'Ejecutando reglas axe-core...' })
    const axeResults = await runAxeAnalysis(page, { level })

    // ── 4. Analyzers custom ──────────────────────────────────────────────
    await _publish(analysisId, 'status', { phase: 'structural', message: 'Analizando estructura HTML...' })
    const structuralResults = await runStructuralAnalysis(page)

    await _publish(analysisId, 'status', { phase: 'keyboard', message: 'Probando navegación con teclado...' })
    const keyboardResults = await runKeyboardAnalysis(page)

    await _publish(analysisId, 'status', { phase: 'visual', message: 'Analizando diseño visual...' })
    const visualResults = await runVisualAnalysis(page, deviceCategory)

    await _publish(analysisId, 'status', { phase: 'cognitive', message: 'Analizando carga cognitiva...' })
    const cognitiveResults = await runCognitiveAnalysis(page)

    // ── 5. Screenshot principal ──────────────────────────────────────────
    const screenshotPath = `${SCREENSHOT_DIR}/${analysisId}-main.png`
    await page.screenshot({ path: screenshotPath, fullPage: false })

    // ── 6. Simulaciones de daltonismo (opcional) ─────────────────────────
    let simulations = null
    if (!config.skipSimulations) {
      await _publish(analysisId, 'status', { phase: 'simulations', message: 'Generando simulaciones visuales...' })
      try {
        const sims = await captureSimulations(page, SCREENSHOT_DIR, analysisId)
        simulations = { simulations: sims }
      } catch (err) {
        console.warn('[WCAG] Simulations failed:', err.message)
      }
    }

    await context.close()
    await browser.close()
    browser = null

    // ── 7. Aplanar issues ────────────────────────────────────────────────
    await _publish(analysisId, 'status', { phase: 'processing', message: 'Procesando resultados...' })

    const rawAxeIssues = flattenViolations(axeResults).map(v => ({
      source:          'axe',
      ruleId:          v.ruleId,
      impact:          v.impact,
      ruleDescription: v.ruleDescription,
      ruleHelp:        v.ruleHelp,
      helpUrl:         v.ruleHelp,
      wcagCriterion:   v.wcagCriterion,
      wcagLevel:       v.wcagLevel,
      selector:        v.selector,
      htmlSnippet:     v.htmlSnippet,
      xpath:           v.xpath,
      failureSummary:  v.failureSummary,
    }))

    const customIssues = [
      ...(structuralResults.issues || []),
      ...(keyboardResults.issues   || []),
      ...(visualResults.issues     || []),
      ...(cognitiveResults.issues  || []),
    ]

    const allIssues = [...rawAxeIssues, ...customIssues]

    // Aplicar severity
    for (const issue of allIssues) {
      if (issue.source === 'axe') {
        issue.severity = calculateSeverity(issue.impact, issue.ruleId)
      } else {
        // Para issues custom, usar la severity del catálogo o medium como default
        const meta = getRuleMetadata(issue.ruleId)
        issue.severity = meta?.severity || 'medium'
      }
    }

    // ── 8. Traducción a lenguaje humano ──────────────────────────────────
    await _publish(analysisId, 'status', { phase: 'translating', message: 'Traduciendo a lenguaje humano...' })
    const translatedIssues = await translateIssues(allIssues, { useAi: config.useAi !== false })

    // ── 9. Calcular score ────────────────────────────────────────────────
    const passedRules = (axeResults.passes || []).length
    const { score, byCategory, bySeverity } = calculateScores(translatedIssues, passedRules)

    // ── 10. Actualizar wcag_analyses ─────────────────────────────────────
    await db.update(schema.wcagAnalyses).set({
      status:             'completed',
      score,
      totalIssues:        translatedIssues.length,
      criticalCount:      bySeverity.critical,
      highCount:          bySeverity.high,
      mediumCount:        bySeverity.medium,
      lowCount:           bySeverity.low,
      passedRules,
      inapplicableRules:  (axeResults.inapplicable || []).length,
      categoryScores:     byCategory,
      axeResults:         { violations: axeResults.violations, passes_count: passedRules },   // No guardar todo
      structuralResults,
      keyboardResults: { ...keyboardResults, tabOrder: undefined },   // tabOrder es muy verbose
      visualResults,
      cognitiveResults,
      simulations,
      screenshotUrl:      `/screenshots/${analysisId}-main.png`,
      durationMs:         Date.now() - startedAt,
      completedAt:        new Date(),
    }).where(eq(schema.wcagAnalyses.id, analysisId))

    // ── 11. Insertar issues individuales ─────────────────────────────────
    if (translatedIssues.length > 0) {
      const rows = translatedIssues.map(i => ({
        analysisId,
        ruleId:              i.ruleId,
        source:              i.source,
        category:            i.category || 'other',
        severity:            i.severity,
        impact:              i.impact,
        wcagCriterion:       i.wcagCriterion,
        wcagLevel:           i.wcagLevel,
        affectedUsers:       i.affectedUsers || [],
        selector:            i.selector || null,
        htmlSnippet:         i.htmlSnippet || null,
        xpath:               i.xpath || null,
        pageSection:         null,
        ruleDescription:     i.ruleDescription || '',
        technicalHelp:       i.ruleHelp || null,
        helpUrl:             i.helpUrl || null,
        failureSummary:      i.failureSummary || null,
        humanTitle:          i.humanTitle || null,
        humanDescription:    i.humanDescription || null,
        humanImpact:         i.humanImpact || null,
        humanFixSuggestion:  i.humanFixSuggestion || null,
        fixCodeSnippet:      i.fixCodeSnippet || null,
      }))

      // Insertar en chunks
      for (let i = 0; i < rows.length; i += 50) {
        await db.insert(schema.wcagIssues).values(rows.slice(i, i + 50))
      }
    }

    // ── 12. Generar reportes ─────────────────────────────────────────────
    await _publish(analysisId, 'status', { phase: 'reports', message: 'Generando reportes...' })

    // Re-cargar el analysis con los datos actualizados
    const [updated] = await db.select().from(schema.wcagAnalyses)
      .where(eq(schema.wcagAnalyses.id, analysisId)).limit(1)

    // Para el PDF, abrimos browser otra vez (más sencillo que pasar uno existente)
    let pdfBrowser = null
    if (config.generatePdf !== false) {
      try { pdfBrowser = await chromium.launch({ headless: true }) }
      catch {}
    }

    const reportUrls = await generateWcagReports(updated, translatedIssues, { browser: pdfBrowser })
    if (pdfBrowser) await pdfBrowser.close().catch(() => {})

    await db.update(schema.wcagAnalyses).set({
      reportHtmlUrl: reportUrls.html,
      reportJsonUrl: reportUrls.json,
      reportPdfUrl:  reportUrls.pdf,
    }).where(eq(schema.wcagAnalyses.id, analysisId))

    // ── 13. Si está asociado a un target, actualizar el target ──────────
    if (opts.targetId) {
      await db.update(schema.wcagTargets).set({
        lastScore:       score,
        lastAnalysisId:  analysisId,
        lastAnalyzedAt:  new Date(),
        updatedAt:       new Date(),
      }).where(eq(schema.wcagTargets.id, opts.targetId))
    }

    // ── 14. Evento final ─────────────────────────────────────────────────
    await _publish(analysisId, 'completed', {
      score,
      totalIssues: translatedIssues.length,
      reportHtmlUrl: reportUrls.html,
      reportPdfUrl:  reportUrls.pdf,
    })

    console.log(`[WCAG ${analysisId}] ✓ Score ${score}, ${translatedIssues.length} issues, ${Date.now() - startedAt}ms`)

  } catch (err) {
    console.error(`[WCAG ${analysisId}] Error:`, err)
    if (browser) await browser.close().catch(() => {})

    await db.update(schema.wcagAnalyses).set({
      status:       'failed',
      errorMessage: err.message,
      durationMs:   Date.now() - startedAt,
      completedAt:  new Date(),
    }).where(eq(schema.wcagAnalyses.id, analysisId))

    await _publish(analysisId, 'error', { message: err.message })
  }
}

// ── pub/sub ──────────────────────────────────────────────────────────────────

async function _publish(analysisId, type, data) {
  try {
    const redis = getRedis()
    await redis.publish(`wcag:${analysisId}`, JSON.stringify({
      type, data, timestamp: Date.now(),
    }))
  } catch {}
}

export async function subscribeToWcagAnalysis(analysisId, callback) {
  const Redis = (await import('ioredis')).default
  const subscriber = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  })
  const channel = `wcag:${analysisId}`
  await subscriber.subscribe(channel)
  subscriber.on('message', (ch, msg) => {
    if (ch !== channel) return
    try { callback(JSON.parse(msg)) } catch {}
  })
  return async () => {
    await subscriber.unsubscribe(channel)
    await subscriber.quit()
  }
}
