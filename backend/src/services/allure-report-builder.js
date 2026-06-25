/**
 * Allure Report Builder
 *
 * Toma una carpeta `allure-results/` y genera el reporte HTML estándar
 * usando `allure-commandline`. Mantiene el history para trends.
 *
 * Estructura esperada de allure-results:
 *   - *-result.json         Cada test ejecutado
 *   - *-container.json      Setup/teardown
 *   - *-attachment.{png,...} Screenshots, videos, traces
 *   - executor.json         (opcional) Info del ejecutor
 *   - environment.properties (opcional) Variables de entorno
 *   - categories.json       (opcional) Categorías de defectos
 *
 * Estructura del reporte generado:
 *   - index.html            Single-page app
 *   - data/                 Datos del reporte
 *   - history/              Para trends (se preserva entre runs)
 *
 * Usamos JRE 17+ en el worker container — sin Java, usamos el fallback
 * de allure-js-commons que genera un reporte más básico pero funcional.
 */

import { spawn }                                from 'child_process'
import { mkdir, rm, cp, readdir, stat, readFile, writeFile, access } from 'fs/promises'
import { existsSync, createWriteStream }        from 'fs'
import { join, dirname }                        from 'path'
import { createReadStream }                     from 'fs'
import { pipeline }                             from 'stream/promises'
import archiver                                 from 'archiver'

const REPORTS_DIR = process.env.REPORTS_DIR || '/tmp/achilltest-reports'
const WORK_DIR    = process.env.ALLURE_WORK_DIR || '/tmp/achilltest-allure-work'

// Path al allure CLI dentro del container worker
const ALLURE_BIN = process.env.ALLURE_BIN || 'allure'

/**
 * Genera un reporte Allure a partir de una carpeta de results.
 *
 * @param {object} opts
 * @param {string} opts.resultsDir   Carpeta con los allure-results raw
 * @param {string} opts.projectId    ID del proyecto (para output path)
 * @param {string} opts.runId        ID del run (para output path)
 * @param {string} [opts.previousHistoryDir]  Carpeta history/ del run anterior
 *                                            (para trends acumulados)
 * @param {object} [opts.executor]   Metadata del ejecutor (CI, branch, etc)
 *
 * @returns {{ reportDir, reportUrl, resultsZipUrl, statistics }}
 */
export async function buildAllureReport({ resultsDir, projectId, runId, previousHistoryDir, executor }) {
  const outputBase = join(REPORTS_DIR, 'allure', projectId, runId)
  const reportDir  = join(outputBase, 'report')
  const resultsCopy = join(outputBase, 'results')

  // Crear estructura de directorios
  await mkdir(reportDir,   { recursive: true })
  await mkdir(resultsCopy, { recursive: true })

  // ── 1. Copiar results al directorio del run (para preservarlos) ─────────
  await _copyDir(resultsDir, resultsCopy)

  // ── 2. Si hay history previo, inyectarlo en los results ─────────────────
  // Allure busca history/ DENTRO de los allure-results
  if (previousHistoryDir && existsSync(previousHistoryDir)) {
    const targetHistory = join(resultsCopy, 'history')
    await _copyDir(previousHistoryDir, targetHistory).catch(() => {})
  }

  // ── 3. Inyectar metadata del ejecutor si se proveyó ────────────────────
  if (executor) {
    const executorJson = {
      name:      executor.name || 'Achilltest',
      type:      executor.type || 'achilltest',
      url:       executor.url || null,
      buildName: executor.buildName || null,
      buildOrder: executor.buildOrder || null,
      reportName: executor.reportName || 'Test Report',
      reportUrl:  executor.reportUrl || null,
    }
    await writeFile(
      join(resultsCopy, 'executor.json'),
      JSON.stringify(executorJson, null, 2),
    )
  }

  // ── 4. Generar el reporte con allure-commandline ───────────────────────
  const allureAvailable = await _isAllureAvailable()

  if (allureAvailable) {
    await _runAllureCli(resultsCopy, reportDir)
  } else {
    console.warn('[AllureBuilder] allure CLI no disponible, usando fallback JS')
    await _generateFallbackReport(resultsCopy, reportDir)
  }

  // ── 5. Calcular estadísticas del reporte ──────────────────────────────
  const stats = await _extractStatistics(reportDir, resultsCopy)

  // ── 6. Crear ZIP de los allure-results para descarga ──────────────────
  const zipPath = join(outputBase, 'allure-results.zip')
  await _zipDirectory(resultsCopy, zipPath)

  // ── 7. Calcular tamaño del reporte ─────────────────────────────────────
  const sizeKb = await _getDirSizeKb(reportDir)

  return {
    reportDir,
    historyDir: join(reportDir, 'history'),
    reportUrl:  `/reports/allure/${projectId}/${runId}/report/index.html`,
    resultsZipUrl: `/reports/allure/${projectId}/${runId}/allure-results.zip`,
    statistics: stats,
    reportSizeKb: sizeKb,
  }
}

// ── Allure CLI ──────────────────────────────────────────────────────────────

async function _isAllureAvailable() {
  return new Promise((resolve) => {
    const proc = spawn(ALLURE_BIN, ['--version'], { stdio: 'pipe' })
    proc.on('error', () => resolve(false))
    proc.on('close', (code) => resolve(code === 0))
    setTimeout(() => { proc.kill(); resolve(false) }, 5000)
  })
}

function _runAllureCli(resultsDir, reportDir) {
  return new Promise((resolve, reject) => {
    // `allure generate <results> -o <report> --clean`
    const proc = spawn(ALLURE_BIN, [
      'generate', resultsDir,
      '-o', reportDir,
      '--clean',
      '--single-file', 'false',
    ], { stdio: 'pipe' })

    let stderr = ''
    proc.stderr.on('data', d => { stderr += d.toString() })

    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`allure generate failed (code ${code}): ${stderr.slice(0, 500)}`))
    })

    // Timeout de 60 segundos
    setTimeout(() => {
      try { proc.kill('SIGTERM') } catch {}
      reject(new Error('allure generate timeout (60s)'))
    }, 60000)
  })
}

// ── Fallback: reporte HTML mínimo en JS puro ────────────────────────────────

async function _generateFallbackReport(resultsDir, reportDir) {
  // Lee los *-result.json y genera un index.html simple
  const files = await readdir(resultsDir)
  const results = []
  for (const f of files) {
    if (!f.endsWith('-result.json')) continue
    try {
      const content = await readFile(join(resultsDir, f), 'utf-8')
      const r = JSON.parse(content)
      results.push(r)
    } catch {}
  }

  const stats = {
    total:   results.length,
    passed:  results.filter(r => r.status === 'passed').length,
    failed:  results.filter(r => r.status === 'failed').length,
    broken:  results.filter(r => r.status === 'broken').length,
    skipped: results.filter(r => r.status === 'skipped').length,
  }

  const html = _renderFallbackHtml(results, stats)
  await writeFile(join(reportDir, 'index.html'), html, 'utf-8')

  // Generar history para próximos runs
  await mkdir(join(reportDir, 'history'), { recursive: true })
  await writeFile(
    join(reportDir, 'history', 'history.json'),
    JSON.stringify(results.map(r => ({
      uid: r.uuid,
      fullName: r.fullName,
      status: r.status,
      time: r.stop,
    })))
  )
}

function _renderFallbackHtml(results, stats) {
  const passRate = stats.total > 0 ? Math.round((stats.passed / stats.total) * 100) : 0
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Reporte Allure (fallback)</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0 }
body { font-family: -apple-system, sans-serif; background:#f7f7fa; color:#1a1a2e; padding: 2rem }
.warning { background:#fef3c7; border:1px solid #fbbf24; padding:1rem; border-radius:8px; margin-bottom:1.5rem; color:#92400e; font-size:.875rem }
h1 { color:#2c3e50; margin-bottom:1rem }
.stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:.75rem; margin-bottom:2rem }
.stat-card { background:#fff; border:1px solid #e5e5ed; border-radius:10px; padding:1rem; text-align:center }
.stat-card .num { font-size:2rem; font-weight:700 }
.stat-card .lbl { font-size:.7rem; color:#666; text-transform:uppercase; letter-spacing:.05em; margin-top:.25rem; font-weight:600 }
.passed { color:#22c55e } .failed { color:#ef4444 } .broken { color:#f59e0b } .skipped { color:#6b7280 }
.test-list { background:#fff; border:1px solid #e5e5ed; border-radius:10px; overflow:hidden }
.test { padding:.75rem 1rem; border-bottom:1px solid #f0f0f5; display:flex; gap:.75rem; align-items:center }
.test:last-child { border-bottom:none }
.status-pill { padding:.125rem .5rem; border-radius:4px; font-size:.65rem; font-weight:700; text-transform:uppercase }
.status-passed { background:#dcfce7; color:#15803d } .status-failed { background:#fee2e2; color:#dc2626 }
.status-broken { background:#fed7aa; color:#c2410c } .status-skipped { background:#e5e7eb; color:#374151 }
.test-name { font-size:.875rem; flex:1 }
.test-duration { font-size:.75rem; color:#666 }
</style>
</head>
<body>
  <div class="warning">
    ⚠️ Reporte simplificado — el CLI de Allure no está disponible. Para el reporte completo, instala allure-commandline en el worker.
  </div>
  <h1>Reporte de tests</h1>
  <div class="stats">
    <div class="stat-card"><div class="num">${stats.total}</div><div class="lbl">Total</div></div>
    <div class="stat-card"><div class="num passed">${stats.passed}</div><div class="lbl">Passed</div></div>
    <div class="stat-card"><div class="num failed">${stats.failed}</div><div class="lbl">Failed</div></div>
    <div class="stat-card"><div class="num broken">${stats.broken}</div><div class="lbl">Broken</div></div>
    <div class="stat-card"><div class="num skipped">${stats.skipped}</div><div class="lbl">Skipped</div></div>
    <div class="stat-card"><div class="num">${passRate}%</div><div class="lbl">Pass Rate</div></div>
  </div>
  <div class="test-list">
    ${results.map(r => `
      <div class="test">
        <span class="status-pill status-${r.status}">${r.status}</span>
        <span class="test-name">${_esc(r.name || r.fullName || 'Unknown')}</span>
        ${r.stop && r.start ? `<span class="test-duration">${Math.round((r.stop - r.start) / 1000)}s</span>` : ''}
      </div>
    `).join('')}
  </div>
</body>
</html>`
}

function _esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ── Extracción de estadísticas ──────────────────────────────────────────────

async function _extractStatistics(reportDir, resultsDir) {
  // Allure genera widgets/summary.json con stats compactas
  const summaryPath = join(reportDir, 'widgets', 'summary.json')

  if (existsSync(summaryPath)) {
    try {
      const content = await readFile(summaryPath, 'utf-8')
      const summary = JSON.parse(content)
      const stat = summary.statistic || {}
      return {
        total:    (stat.passed || 0) + (stat.failed || 0) + (stat.broken || 0) + (stat.skipped || 0) + (stat.unknown || 0),
        passed:   stat.passed   || 0,
        failed:   stat.failed   || 0,
        broken:   stat.broken   || 0,
        skipped:  stat.skipped  || 0,
        unknown:  stat.unknown  || 0,
        durationMs: summary.time?.duration || 0,
        severityStats: await _extractSeverityStats(reportDir),
      }
    } catch (err) {
      console.warn('[AllureBuilder] No se pudo leer summary.json:', err.message)
    }
  }

  // Fallback: leer los *-result.json directamente
  return await _statsFromRawResults(resultsDir)
}

async function _extractSeverityStats(reportDir) {
  const path = join(reportDir, 'widgets', 'severity.json')
  if (!existsSync(path)) return {}
  try {
    const content = await readFile(path, 'utf-8')
    const data = JSON.parse(content)
    // El widget puede tener formato { items: [...] }
    const items = data.items || data
    const stats = {}
    for (const item of items) {
      if (item.severity && item.statistic) {
        stats[item.severity] = item.statistic
      }
    }
    return stats
  } catch { return {} }
}

async function _statsFromRawResults(resultsDir) {
  const files = await readdir(resultsDir).catch(() => [])
  const stats = { total: 0, passed: 0, failed: 0, broken: 0, skipped: 0, unknown: 0, durationMs: 0, severityStats: {} }
  let minStart = Infinity
  let maxStop = 0

  for (const f of files) {
    if (!f.endsWith('-result.json')) continue
    try {
      const content = await readFile(join(resultsDir, f), 'utf-8')
      const r = JSON.parse(content)
      stats.total++
      if (r.status === 'passed')       stats.passed++
      else if (r.status === 'failed')  stats.failed++
      else if (r.status === 'broken')  stats.broken++
      else if (r.status === 'skipped') stats.skipped++
      else                              stats.unknown++

      if (r.start && r.start < minStart) minStart = r.start
      if (r.stop && r.stop > maxStop)    maxStop = r.stop
    } catch {}
  }

  if (maxStop > minStart) stats.durationMs = maxStop - minStart
  return stats
}

// ── Tests snapshot para flaky detection ────────────────────────────────────

/**
 * Genera un snapshot de tests del run (fullName → status) para guardar en DB
 * y permitir detección de flaky tests entre runs.
 */
export async function buildTestsSnapshot(resultsDir) {
  const files = await readdir(resultsDir).catch(() => [])
  const snapshot = {}

  for (const f of files) {
    if (!f.endsWith('-result.json')) continue
    try {
      const content = await readFile(join(resultsDir, f), 'utf-8')
      const r = JSON.parse(content)
      const key = r.fullName || r.name || r.uuid
      if (!key) continue
      snapshot[key] = {
        name:     r.name,
        status:   r.status,
        duration: r.stop && r.start ? r.stop - r.start : 0,
      }
    } catch {}
  }

  return snapshot
}

// ── Utilidades ──────────────────────────────────────────────────────────────

async function _copyDir(src, dst) {
  await mkdir(dst, { recursive: true })
  const entries = await readdir(src, { withFileTypes: true })
  for (const entry of entries) {
    const s = join(src, entry.name)
    const d = join(dst, entry.name)
    if (entry.isDirectory()) {
      await _copyDir(s, d)
    } else {
      await cp(s, d).catch(() => {})
    }
  }
}

async function _getDirSizeKb(dir) {
  let total = 0
  async function walk(p) {
    const entries = await readdir(p, { withFileTypes: true }).catch(() => [])
    for (const e of entries) {
      const fp = join(p, e.name)
      if (e.isDirectory()) await walk(fp)
      else {
        const s = await stat(fp).catch(() => null)
        if (s) total += s.size
      }
    }
  }
  await walk(dir)
  return Math.round(total / 1024)
}

function _zipDirectory(srcDir, outPath) {
  return new Promise((resolve, reject) => {
    const output  = createWriteStream(outPath)
    const archive = archiver('zip', { zlib: { level: 6 } })
    output.on('close', () => resolve())
    archive.on('error', reject)
    archive.pipe(output)
    archive.directory(srcDir, false)
    archive.finalize()
  })
}

/**
 * Limpia un directorio de trabajo temporal.
 */
export async function cleanupWorkDir(dir) {
  if (!dir || !dir.startsWith('/tmp/')) return   // Safety
  await rm(dir, { recursive: true, force: true }).catch(() => {})
}

export { WORK_DIR, REPORTS_DIR }
