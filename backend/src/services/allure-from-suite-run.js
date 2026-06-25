/**
 * Allure Results from Suite Run
 *
 * Convierte un Suite Run de Achilltest (estructura propia) en una carpeta
 * `allure-results/` estándar que el Allure CLI pueda procesar.
 *
 * Mapea:
 *   suite_run_results → *-result.json
 *   screenshots/videos → *-attachment.png/webm
 *   suite metadata → executor.json + environment.properties
 */

import { mkdir, writeFile, readFile, copyFile } from 'fs/promises'
import { existsSync }                            from 'fs'
import { join, basename, dirname }               from 'path'
import { randomUUID }                            from 'crypto'
import { eq, inArray }                           from 'drizzle-orm'

import { getDb, schema }   from '../db/client.js'
import { WORK_DIR }        from './allure-report-builder.js'

/**
 * Genera una carpeta allure-results a partir de un suite_run.
 *
 * @param {string} suiteRunId
 * @returns {string} Path a la carpeta allure-results generada
 */
export async function buildAllureResultsFromSuiteRun(suiteRunId) {
  const db = getDb()

  // Cargar suite run + suite + results
  const [suiteRun] = await db.select().from(schema.suiteRuns)
    .where(eq(schema.suiteRuns.id, suiteRunId)).limit(1)
  if (!suiteRun) throw new Error('Suite run no encontrado')

  const [suite] = await db.select().from(schema.testSuites)
    .where(eq(schema.testSuites.id, suiteRun.suiteId)).limit(1)

  const results = await db.select().from(schema.suiteRunResults)
    .where(eq(schema.suiteRunResults.suiteRunId, suiteRunId))

  // Hidratar specs y executions
  const specIds = [...new Set(results.map(r => r.suiteSpecId))]
  const execIds = results.map(r => r.executionId).filter(Boolean)

  const suiteSpecs = specIds.length
    ? await db.select().from(schema.testSuiteSpecs).where(inArray(schema.testSuiteSpecs.id, specIds))
    : []

  // Cargar specs de verdad (los testSpecs reales)
  const realSpecIds = suiteSpecs.map(ss => ss.specId).filter(Boolean)
  const testSpecs = realSpecIds.length
    ? await db.select().from(schema.testSpecs).where(inArray(schema.testSpecs.id, realSpecIds))
    : []

  const executions = execIds.length
    ? await db.select().from(schema.executions).where(inArray(schema.executions.id, execIds))
    : []

  // Mapas para lookup
  const suiteSpecMap = Object.fromEntries(suiteSpecs.map(s => [s.id, s]))
  const testSpecMap  = Object.fromEntries(testSpecs.map(s => [s.id, s]))
  const execMap      = Object.fromEntries(executions.map(e => [e.id, e]))

  // ── Crear directorio de trabajo ──────────────────────────────────────────
  const workDir = join(WORK_DIR, `suiterun-${suiteRunId}-${Date.now()}`)
  await mkdir(workDir, { recursive: true })

  // ── 1. Generar un *-result.json por cada result ──────────────────────────
  for (const result of results) {
    const suiteSpec  = suiteSpecMap[result.suiteSpecId]
    const realSpec   = suiteSpec ? testSpecMap[suiteSpec.specId] : null
    const execution  = result.executionId ? execMap[result.executionId] : null

    const specName   = realSpec?.name || suiteSpec?.name || 'Unknown spec'
    const deviceId   = result.deviceId || 'unknown'

    const fullName   = `${suite?.name || 'Suite'}.${specName}.${deviceId}`
    const startTime  = result.startedAt ? new Date(result.startedAt).getTime() : Date.now()
    const stopTime   = result.completedAt ? new Date(result.completedAt).getTime() : startTime

    // Mapeo status: Achilltest → Allure
    const status = result.status === 'passed'  ? 'passed'
                 : result.status === 'failed'  ? 'failed'
                 : result.status === 'skipped' ? 'skipped'
                 : 'broken'

    const allureResult = {
      uuid:        result.id,
      historyId:   _hashString(fullName),
      testCaseId:  _hashString(specName),
      name:        specName,
      fullName,
      status,
      stage:       'finished',
      start:       startTime,
      stop:        stopTime,

      labels: [
        { name: 'suite',      value: suite?.name || 'Default Suite' },
        { name: 'subSuite',   value: deviceId },
        { name: 'feature',    value: realSpec?.tags?.[0] || 'General' },
        { name: 'host',       value: 'achilltest' },
        { name: 'framework',  value: 'playwright' },
        { name: 'language',   value: 'typescript' },
        { name: 'severity',   value: _inferSeverity(realSpec, status) },
      ],

      parameters: [
        { name: 'device', value: deviceId },
        ...(execution?.engine ? [{ name: 'engine', value: execution.engine }] : []),
      ],

      // Si falló, agregar detalles
      statusDetails: status === 'failed' || status === 'broken' ? {
        message: result.errorMessage?.slice(0, 500) || 'Failed',
        trace:   result.errorMessage || '',
      } : undefined,

      // Attachments si los hay
      attachments: [],
    }

    // ── Screenshot adjunto si existe ──────────────────────────────────────
    if (result.screenshotUrl) {
      const screenshotPath = _localPathFromUrl(result.screenshotUrl)
      if (screenshotPath && existsSync(screenshotPath)) {
        const attachId = randomUUID()
        const ext      = screenshotPath.split('.').pop() || 'png'
        const attachName = `${attachId}-attachment.${ext}`
        try {
          await copyFile(screenshotPath, join(workDir, attachName))
          allureResult.attachments.push({
            name:   'Screenshot',
            source: attachName,
            type:   ext === 'png' ? 'image/png' : `image/${ext}`,
          })
        } catch {}
      }
    }

    // ── Video si existe en el execution ────────────────────────────────────
    if (execution?.videoUrl) {
      const videoPath = _localPathFromUrl(execution.videoUrl)
      if (videoPath && existsSync(videoPath)) {
        const attachId = randomUUID()
        const attachName = `${attachId}-attachment.webm`
        try {
          await copyFile(videoPath, join(workDir, attachName))
          allureResult.attachments.push({
            name:   'Video',
            source: attachName,
            type:   'video/webm',
          })
        } catch {}
      }
    }

    // ── Steps si el execution tiene un log estructurado ───────────────────
    if (execution?.log?.steps && Array.isArray(execution.log.steps)) {
      allureResult.steps = execution.log.steps.map(s => ({
        name:   s.name || s.title || 'Step',
        status: s.status === 'failed' ? 'failed' : 'passed',
        stage:  'finished',
        start:  s.start || startTime,
        stop:   s.stop  || stopTime,
      }))
    }

    await writeFile(
      join(workDir, `${allureResult.uuid}-result.json`),
      JSON.stringify(allureResult, null, 2),
    )
  }

  // ── 2. Environment.properties ───────────────────────────────────────────
  const envProps = [
    `Suite=${suite?.name || 'Unknown'}`,
    `Run.Started=${suiteRun.startedAt || ''}`,
    `Run.Completed=${suiteRun.completedAt || ''}`,
    `Total.Tests=${results.length}`,
    `Passed=${results.filter(r => r.status === 'passed').length}`,
    `Failed=${results.filter(r => r.status === 'failed').length}`,
  ].join('\n')
  await writeFile(join(workDir, 'environment.properties'), envProps, 'utf-8')

  // ── 3. Categories (defectos comunes que Allure agrupa) ──────────────────
  const categories = [
    {
      name: 'Tests con timeout',
      messageRegex: '.*[Tt]imeout.*',
      matchedStatuses: ['failed', 'broken'],
    },
    {
      name: 'Selector no encontrado',
      messageRegex: '.*locator.*not.*found.*|.*selector.*not.*resolve.*',
      matchedStatuses: ['failed', 'broken'],
    },
    {
      name: 'Errores de red',
      messageRegex: '.*ECONNREFUSED.*|.*ENOTFOUND.*|.*network.*',
      matchedStatuses: ['failed', 'broken'],
    },
    {
      name: 'Tests skipped intencionalmente',
      matchedStatuses: ['skipped'],
    },
  ]
  await writeFile(join(workDir, 'categories.json'), JSON.stringify(categories, null, 2))

  return workDir
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function _hashString(s) {
  // Hash determinístico simple (no crypto, solo para Allure historyId)
  let hash = 0
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash) + s.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash).toString(16)
}

function _inferSeverity(spec, status) {
  // Si el spec tiene tags como "critical", "smoke", úsalos
  const tags = spec?.tags || []
  if (tags.includes('critical') || tags.includes('blocker')) return 'critical'
  if (tags.includes('smoke'))    return 'blocker'
  if (tags.includes('minor'))    return 'minor'
  if (tags.includes('trivial'))  return 'trivial'
  return status === 'failed' ? 'normal' : 'normal'
}

function _localPathFromUrl(url) {
  // Las URLs son /screenshots/xxx.png o /reports/xxx
  // Convertir a path local
  const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR || '/tmp/achilltest-screenshots'
  const REPORTS_DIR    = process.env.REPORTS_DIR    || '/tmp/achilltest-reports'

  if (url.startsWith('/screenshots/')) {
    return join(SCREENSHOT_DIR, url.slice('/screenshots/'.length))
  }
  if (url.startsWith('/reports/')) {
    return join(REPORTS_DIR, url.slice('/reports/'.length))
  }
  return null
}
