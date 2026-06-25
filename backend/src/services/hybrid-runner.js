/**
 * Hybrid Runner — orquesta una sesión completa de generación + ejecución.
 *
 * Para cada ejecución:
 *   1. Abre un browser de Playwright
 *   2. Navega al targetUrl
 *   3. Loop:
 *      - Escanea DOM
 *      - Pide a Claude el siguiente paso
 *      - Ejecuta el paso
 *      - Emite evento al frontend (SSE/WebSocket)
 *      - Toma screenshot
 *   4. Cuando Claude dice isComplete=true → genera el spec.ts final
 *   5. Cierra el browser
 *
 * Eventos emitidos:
 *   - status:   'starting' | 'navigating' | 'planning' | 'executing' | 'completed' | 'failed'
 *   - step:     { stepNum, action, selector, value, success, screenshot }
 *   - log:      mensaje informativo
 *   - result:   { specCode, screenshots, durationMs }
 */

import { chromium, firefox, webkit } from 'playwright'
import { v4 as uuid } from 'uuid'
import { mkdirSync, writeFileSync } from 'fs'
import { join }                     from 'path'

import { scanPageDom }                                 from '../services/dom-scanner.js'
import { planNextStep, executeStep, generateSpecCode } from '../agents/codegen-agent.js'
import { getPlaywrightDeviceConfig }                   from '../config/devices.js'

const MAX_STEPS         = 25      // Hard limit por sesión
const SCREENSHOT_DIR    = process.env.SCREENSHOT_DIR || '/tmp/achilltest-screenshots'
const HEADLESS          = process.env.HEADLESS !== 'false'

try { mkdirSync(SCREENSHOT_DIR, { recursive: true }) } catch {}

/**
 * Corre una ejecución completa.
 *
 * @param {object} job
 * @param {string} job.executionId
 * @param {string} job.testName
 * @param {string} job.targetUrl
 * @param {string} job.instructions
 * @param {function} onEvent     callback(event) — para emitir al frontend
 */
export async function runExecution(job, onEvent = () => {}) {
  const startedAt = Date.now()
  const screenshots = []
  const stepsExecuted = []

  let browser, context, page

  function emit(type, data) {
    try { onEvent({ type, data, timestamp: Date.now() }) } catch {}
  }

  try {
    emit('status', { status: 'starting', message: 'Iniciando ejecución...' })

    // ── 1. Abrir browser con el dispositivo seleccionado ────────────────────
    const deviceConfig = getPlaywrightDeviceConfig(job.deviceId)
    const browserType  = deviceConfig.defaultBrowserType || 'chromium'

    const engine = browserType === 'webkit'  ? webkit
                 : browserType === 'firefox' ? firefox
                 :                             chromium

    browser = await engine.launch({ headless: HEADLESS })
    context = await browser.newContext({
      ...deviceConfig,
      locale:            'es-MX',
      ignoreHTTPSErrors: true,
    })
    page = await context.newPage()

    emit('log', `Dispositivo: ${job.deviceId || 'Desktop Chrome'} (${deviceConfig.viewport?.width}x${deviceConfig.viewport?.height} ${browserType})`)

    // ── 2. Navegar a la URL inicial ─────────────────────────────────────────
    emit('status', { status: 'navigating', message: `Navegando a ${job.targetUrl}` })
    await page.goto(job.targetUrl, { waitUntil: 'domcontentloaded', timeout: 20000 })

    const initialScreenshot = await _takeScreenshot(page, job.executionId, 0)
    screenshots.push(initialScreenshot)
    emit('step', {
      stepNum:    0,
      action:     'navigate',
      value:      job.targetUrl,
      success:    true,
      screenshot: initialScreenshot,
    })

    // ── 3. Loop principal — paso a paso ─────────────────────────────────────
    let stepNum    = 1
    let isComplete = false
    let consecutiveFails = 0

    while (!isComplete && stepNum <= MAX_STEPS) {
      emit('status', { status: 'planning', message: `Pensando paso ${stepNum}...` })

      // a. Escanear DOM actual
      const dom = await scanPageDom(page)

      // b. Pedir el siguiente paso a Claude
      const plan = await planNextStep({
        instructions:  job.instructions,
        targetUrl:     job.targetUrl,
        stepsExecuted,
        dom,
      })

      emit('log', `Plan: ${plan.action} ${plan.selector || ''} ${plan.reasoning ? `— ${plan.reasoning}` : ''}`)

      if (plan.isComplete) {
        isComplete = true
        // Si la IA dejó un assertion final, ejecutarlo
        if (plan.assertion || plan.selector) {
          emit('status', { status: 'executing', message: `Verificación final...` })
          const finalStep = await executeStep(page, {
            action:    'assert',
            selector:  plan.selector,
            assertion: plan.assertion,
          })
          stepsExecuted.push(finalStep)

          const ss = await _takeScreenshot(page, job.executionId, stepNum)
          screenshots.push(ss)
          emit('step', { stepNum, ...finalStep, screenshot: ss })
        }
        break
      }

      // c. Ejecutar el paso
      emit('status', { status: 'executing', message: `Ejecutando paso ${stepNum}: ${plan.action}` })
      const result = await executeStep(page, plan)
      stepsExecuted.push(result)

      // Pequeña pausa para que la página reaccione
      await page.waitForTimeout(300)

      // d. Tomar screenshot
      const ss = await _takeScreenshot(page, job.executionId, stepNum)
      screenshots.push(ss)
      emit('step', { stepNum, ...result, screenshot: ss })

      // e. Gestión de fallos
      if (!result.success) {
        consecutiveFails++
        if (consecutiveFails >= 3) {
          throw new Error(`3 pasos consecutivos fallaron. Último error: ${result.error}`)
        }
      } else {
        consecutiveFails = 0
      }

      stepNum++
    }

    if (stepNum > MAX_STEPS) {
      throw new Error(`Se alcanzó el límite de ${MAX_STEPS} pasos sin completar el objetivo`)
    }

    // ── 4. Generar el spec.ts final ─────────────────────────────────────────
    emit('status', { status: 'generating', message: 'Generando código del spec...' })

    const specCode = await generateSpecCode({
      instructions:  job.instructions,
      targetUrl:     job.targetUrl,
      testName:      job.testName,
      stepsExecuted: stepsExecuted.filter(s => s.success),
    })

    const durationMs = Date.now() - startedAt

    emit('status', { status: 'completed', message: 'Ejecución completada' })
    emit('result', {
      specCode,
      specFileName: _toFileName(job.testName),
      screenshots,
      stepsExecuted,
      durationMs,
    })

    return {
      success:       true,
      specCode,
      specFileName:  _toFileName(job.testName),
      screenshots,
      stepsExecuted,
      durationMs,
    }

  } catch (err) {
    emit('status', { status: 'failed', message: err.message })
    emit('log', `Error: ${err.message}`)

    return {
      success:       false,
      error:         err.message,
      screenshots,
      stepsExecuted,
      durationMs:    Date.now() - startedAt,
    }
  } finally {
    try { await context?.close() } catch {}
    try { await browser?.close() } catch {}
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function _takeScreenshot(page, executionId, stepNum) {
  const fileName = `${executionId}-${String(stepNum).padStart(3, '0')}.png`
  const fullPath = join(SCREENSHOT_DIR, fileName)
  try {
    await page.screenshot({ path: fullPath, fullPage: false })
    return `/screenshots/${fileName}`
  } catch {
    return null
  }
}

function _toFileName(testName) {
  return testName
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) + '.spec.ts'
}
