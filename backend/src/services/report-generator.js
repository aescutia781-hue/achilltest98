/**
 * Report Generator
 *
 * Genera dos tipos de reportes a partir de un suite_run completado:
 *
 * 1. Playwright HTML Report (estilo nativo)
 *    - Página HTML estática con grid de specs × devices
 *    - Detalle de cada spec con screenshots
 *    - Servida desde /reports/playwright/{runId}/index.html
 *
 * 2. Allure-style Report (con gráficas, tendencias)
 *    - Dashboard con métricas: pass rate, duración, distribución
 *    - Detalle por test con timeline
 *    - Servida desde /reports/allure/{runId}/index.html
 *    - Descargable como ZIP
 *
 * Ambos son HTML estático con CSS embebido (cero dependencias externas
 * que el cliente tenga que instalar).
 */

import { eq, inArray }              from 'drizzle-orm'
import { mkdirSync, writeFileSync } from 'fs'
import { join, dirname }            from 'path'
import { createWriteStream }        from 'fs'
import archiver                     from 'archiver'

import { getDb, schema }            from '../db/client.js'

const REPORTS_DIR = process.env.REPORTS_DIR || '/tmp/achilltest-reports'

try { mkdirSync(REPORTS_DIR, { recursive: true }) } catch {}

// ── PLAYWRIGHT REPORT ────────────────────────────────────────────────────────

export async function generatePlaywrightReport(suiteRunId) {
  const data = await _loadRunData(suiteRunId)

  const dir = join(REPORTS_DIR, 'playwright', suiteRunId)
  mkdirSync(dir, { recursive: true })

  const html = _renderPlaywrightHtml(data)
  writeFileSync(join(dir, 'index.html'), html, 'utf-8')

  console.log(`[Reports] Playwright report: ${dir}/index.html`)
  return `/reports/playwright/${suiteRunId}/index.html`
}

// ── ALLURE REPORT ────────────────────────────────────────────────────────────

export async function generateAllureReport(suiteRunId) {
  const data = await _loadRunData(suiteRunId)

  const dir = join(REPORTS_DIR, 'allure', suiteRunId)
  mkdirSync(dir, { recursive: true })

  const html = _renderAllureHtml(data)
  writeFileSync(join(dir, 'index.html'), html, 'utf-8')

  // Generar ZIP descargable
  const zipPath = join(REPORTS_DIR, 'allure', suiteRunId, 'allure-report.zip')
  await _createZip(dir, zipPath)

  console.log(`[Reports] Allure report: ${dir}/index.html`)
  return {
    reportUrl: `/reports/allure/${suiteRunId}/index.html`,
    zipUrl:    `/reports/allure/${suiteRunId}/allure-report.zip`,
  }
}

// ── CARGA DE DATOS ───────────────────────────────────────────────────────────

async function _loadRunData(suiteRunId) {
  const db = getDb()

  const [suiteRun] = await db.select().from(schema.suiteRuns)
    .where(eq(schema.suiteRuns.id, suiteRunId)).limit(1)
  if (!suiteRun) throw new Error('Suite run no encontrado')

  const [suite] = await db.select().from(schema.testSuites)
    .where(eq(schema.testSuites.id, suiteRun.suiteId)).limit(1)

  // Cargar suite_specs con su execution original (para tener el nombre del test)
  const suiteSpecs = await db.select().from(schema.testSuiteSpecs)
    .where(eq(schema.testSuiteSpecs.suiteId, suiteRun.suiteId))

  const execIds = suiteSpecs.map(s => s.executionId)
  const originalExecs = execIds.length > 0
    ? await db.select().from(schema.executions).where(inArray(schema.executions.id, execIds))
    : []

  // Cargar resultados
  const results = await db.select().from(schema.suiteRunResults)
    .where(eq(schema.suiteRunResults.suiteRunId, suiteRunId))

  // Cargar device farm si existe
  let deviceFarm = null
  if (suiteRun.deviceFarmId) {
    const [farm] = await db.select().from(schema.deviceFarms)
      .where(eq(schema.deviceFarms.id, suiteRun.deviceFarmId)).limit(1)
    deviceFarm = farm
  }

  // Construir matriz: specs[].devices[].result
  const specMap = new Map()
  for (const ss of suiteSpecs) {
    const exec = originalExecs.find(e => e.id === ss.executionId)
    specMap.set(ss.id, {
      suiteSpecId: ss.id,
      name:        exec?.testName || 'Spec sin nombre',
      targetUrl:   exec?.targetUrl || '',
      results:     [],
    })
  }

  // Inyectar resultados en sus respectivos specs
  for (const r of results) {
    const spec = specMap.get(r.suiteSpecId)
    if (spec) spec.results.push(r)
  }

  // Lista única de devices
  const deviceIds = [...new Set(results.map(r => r.deviceId))]

  return {
    suite,
    suiteRun,
    deviceFarm,
    specs:      Array.from(specMap.values()),
    deviceIds,
    results,
  }
}

// ── RENDERER PLAYWRIGHT ──────────────────────────────────────────────────────

function _renderPlaywrightHtml({ suite, suiteRun, specs, deviceIds, deviceFarm }) {
  const passRate = suiteRun.totalJobs > 0
    ? Math.round((suiteRun.passed / suiteRun.totalJobs) * 100)
    : 0

  const durationSec = suiteRun.durationMs ? (suiteRun.durationMs / 1000).toFixed(1) : '—'

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Playwright Report — ${_esc(suite?.name || 'Suite')}</title>
<style>
* { margin:0; padding:0; box-sizing:border-box }
body { font-family: -apple-system, system-ui, sans-serif; background:#fafafa; color:#1a1a1a }
.header { background:#2c3e50; color:#fff; padding:1.5rem 2rem }
.header h1 { font-size:1.5rem; font-weight:600 }
.header .subtitle { color:#bdc3c7; font-size:.875rem; margin-top:.25rem }
.summary { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:1rem; padding:1.5rem 2rem; background:#fff; border-bottom:1px solid #e5e5e5 }
.metric { text-align:center }
.metric-value { font-size:2rem; font-weight:700; line-height:1 }
.metric-label { font-size:.75rem; color:#666; text-transform:uppercase; letter-spacing:.05em; margin-top:.375rem }
.metric.passed .metric-value { color:#27ae60 }
.metric.failed .metric-value { color:#e74c3c }
.metric.pending .metric-value { color:#95a5a6 }
.content { padding:2rem; max-width:1400px; margin:0 auto }
table { width:100%; border-collapse:collapse; background:#fff; border:1px solid #e5e5e5; border-radius:8px; overflow:hidden }
th, td { padding:.875rem 1rem; text-align:left; border-bottom:1px solid #e5e5e5; font-size:.875rem }
th { background:#f5f5f5; font-weight:600; color:#555; font-size:.75rem; text-transform:uppercase; letter-spacing:.05em }
.cell-status { text-align:center; width:90px }
.badge { display:inline-block; padding:.25rem .625rem; border-radius:4px; font-size:.75rem; font-weight:600 }
.badge.passed { background:#d4f4dd; color:#27ae60 }
.badge.failed { background:#fadbd8; color:#e74c3c }
.badge.pending { background:#ecf0f1; color:#95a5a6 }
.section-title { font-size:1.125rem; font-weight:600; margin:2rem 0 1rem }
.spec-card { background:#fff; border:1px solid #e5e5e5; border-radius:8px; padding:1.25rem; margin-bottom:1rem }
.spec-card h3 { font-size:1rem; margin-bottom:.5rem }
.spec-card .url { font-size:.75rem; color:#3498db; font-family: 'SF Mono', monospace; margin-bottom:1rem }
.spec-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:.5rem }
.spec-cell { padding:.625rem; border-radius:6px; font-size:.8125rem }
.spec-cell.passed { background:#d4f4dd; border-left:3px solid #27ae60 }
.spec-cell.failed { background:#fadbd8; border-left:3px solid #e74c3c }
.spec-cell.pending { background:#ecf0f1; border-left:3px solid #95a5a6 }
.spec-cell .device { font-weight:600; margin-bottom:.25rem }
.spec-cell .duration { font-size:.7rem; color:#666 }
.error { color:#e74c3c; font-size:.75rem; margin-top:.25rem; font-family: monospace; overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
footer { text-align:center; padding:2rem; color:#999; font-size:.75rem }
</style>
</head>
<body>
<div class="header">
  <h1>${_esc(suite?.name || 'Test Suite')}</h1>
  <div class="subtitle">
    ${suite?.description ? _esc(suite.description) + ' · ' : ''}
    Run ${new Date(suiteRun.startedAt).toLocaleString('es-MX')}
    ${deviceFarm ? ' · Device Farm: ' + _esc(deviceFarm.name) : ''}
  </div>
</div>

<div class="summary">
  <div class="metric"><div class="metric-value">${suiteRun.totalSpecs}</div><div class="metric-label">Specs</div></div>
  <div class="metric"><div class="metric-value">${suiteRun.totalDevices}</div><div class="metric-label">Devices</div></div>
  <div class="metric"><div class="metric-value">${suiteRun.totalJobs}</div><div class="metric-label">Total runs</div></div>
  <div class="metric passed"><div class="metric-value">${suiteRun.passed}</div><div class="metric-label">Passed</div></div>
  <div class="metric failed"><div class="metric-value">${suiteRun.failed}</div><div class="metric-label">Failed</div></div>
  <div class="metric"><div class="metric-value">${passRate}%</div><div class="metric-label">Pass rate</div></div>
  <div class="metric"><div class="metric-value">${durationSec}s</div><div class="metric-label">Duration</div></div>
</div>

<div class="content">
  <h2 class="section-title">Specs detallados</h2>
  ${specs.map(spec => `
    <div class="spec-card">
      <h3>${_esc(spec.name)}</h3>
      <div class="url">${_esc(spec.targetUrl)}</div>
      <div class="spec-grid">
        ${spec.results.map(r => `
          <div class="spec-cell ${r.status}">
            <div class="device">${_esc(r.deviceId)}</div>
            <div class="duration">${r.durationMs ? (r.durationMs/1000).toFixed(1) + 's' : '—'}</div>
            <span class="badge ${r.status}">${r.status}</span>
            ${r.errorMessage ? `<div class="error" title="${_esc(r.errorMessage)}">${_esc(r.errorMessage)}</div>` : ''}
          </div>
        `).join('')}
      </div>
    </div>
  `).join('')}
</div>

<footer>Generated by Achilltest · ${new Date().toLocaleString('es-MX')}</footer>
</body>
</html>`
}

// ── RENDERER ALLURE ──────────────────────────────────────────────────────────

function _renderAllureHtml({ suite, suiteRun, specs, deviceIds, deviceFarm }) {
  const passRate = suiteRun.totalJobs > 0
    ? Math.round((suiteRun.passed / suiteRun.totalJobs) * 100)
    : 0
  const failRate = suiteRun.totalJobs > 0
    ? Math.round((suiteRun.failed / suiteRun.totalJobs) * 100)
    : 0

  // Calcular distribución por device
  const deviceStats = deviceIds.map(did => {
    const deviceResults = specs.flatMap(s => s.results.filter(r => r.deviceId === did))
    const passed = deviceResults.filter(r => r.status === 'passed').length
    const failed = deviceResults.filter(r => r.status === 'failed').length
    const total  = deviceResults.length
    return { deviceId: did, passed, failed, total, passRate: total > 0 ? Math.round(passed/total*100) : 0 }
  })

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Allure Report — ${_esc(suite?.name || 'Suite')}</title>
<style>
* { margin:0; padding:0; box-sizing:border-box }
body { font-family: -apple-system, system-ui, sans-serif; background:#f7f7f7; color:#1a1a1a }
.header { background:#FF6B35; color:#fff; padding:1.5rem 2rem; display:flex; align-items:center; gap:1rem }
.header .logo { font-size:1.75rem }
.header .title { flex:1 }
.header h1 { font-size:1.5rem }
.header .subtitle { font-size:.8125rem; color:rgba(255,255,255,.85); margin-top:.25rem }
.tabs { background:#fff; border-bottom:1px solid #e5e5e5; padding:0 2rem; display:flex; gap:2rem }
.tab { padding:1rem 0; font-size:.875rem; font-weight:500; color:#666; cursor:pointer; border-bottom:2px solid transparent }
.tab.active { color:#FF6B35; border-bottom-color:#FF6B35 }
.content { padding:2rem; max-width:1400px; margin:0 auto }
.dashboard { display:grid; grid-template-columns:2fr 1fr; gap:1.5rem; margin-bottom:2rem }
.card { background:#fff; border-radius:10px; padding:1.5rem; box-shadow:0 1px 3px rgba(0,0,0,.05) }
.card h2 { font-size:1rem; font-weight:600; margin-bottom:1rem; color:#333 }
.pie { width:200px; height:200px; margin:0 auto; position:relative }
.pie-svg { transform:rotate(-90deg) }
.pie-label { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); text-align:center }
.pie-label .pct { font-size:2.5rem; font-weight:700; color:#27ae60; line-height:1 }
.pie-label .lbl { font-size:.75rem; color:#666; margin-top:.25rem }
.legend { display:flex; justify-content:center; gap:1rem; margin-top:1rem; font-size:.8125rem }
.legend-item { display:flex; align-items:center; gap:.375rem }
.legend-dot { width:10px; height:10px; border-radius:50%; }
.stats { display:grid; grid-template-columns:repeat(2,1fr); gap:.75rem }
.stat-box { background:#f9f9f9; border-radius:8px; padding:.875rem; text-align:center }
.stat-box .num { font-size:1.5rem; font-weight:700; line-height:1 }
.stat-box .num.passed { color:#27ae60 }
.stat-box .num.failed { color:#e74c3c }
.stat-box .lbl { font-size:.75rem; color:#666; margin-top:.25rem; text-transform:uppercase; letter-spacing:.05em }
.bar-chart { padding:.5rem 0 }
.bar-row { display:flex; align-items:center; gap:.75rem; margin-bottom:.625rem }
.bar-label { width:140px; font-size:.8125rem; color:#333; text-align:right }
.bar-track { flex:1; background:#f0f0f0; border-radius:4px; height:24px; position:relative; overflow:hidden }
.bar-fill { height:100%; background:linear-gradient(90deg, #27ae60, #2ecc71); display:flex; align-items:center; padding:0 .5rem; color:#fff; font-size:.7rem; font-weight:600 }
.bar-fill.partial { background:linear-gradient(90deg, #e67e22, #f39c12) }
.bar-fill.poor    { background:linear-gradient(90deg, #c0392b, #e74c3c) }
.bar-meta { font-size:.7rem; color:#666; width:70px }
table { width:100%; border-collapse:collapse }
th, td { padding:.75rem; text-align:left; border-bottom:1px solid #e5e5e5; font-size:.875rem }
th { background:#fafafa; font-weight:600; color:#666; font-size:.75rem; text-transform:uppercase; letter-spacing:.04em }
.test-row.passed { border-left:3px solid #27ae60 }
.test-row.failed { border-left:3px solid #e74c3c }
.test-name { font-weight:500 }
.test-device { font-size:.75rem; color:#666; font-family: monospace }
.badge { display:inline-block; padding:.25rem .625rem; border-radius:4px; font-size:.7rem; font-weight:600 }
.badge.passed { background:#d4f4dd; color:#27ae60 }
.badge.failed { background:#fadbd8; color:#e74c3c }
.badge.pending { background:#ecf0f1; color:#95a5a6 }
footer { text-align:center; padding:2rem; color:#999; font-size:.75rem }
</style>
</head>
<body>

<div class="header">
  <div class="logo">📊</div>
  <div class="title">
    <h1>${_esc(suite?.name || 'Test Suite')}</h1>
    <div class="subtitle">
      ${new Date(suiteRun.startedAt).toLocaleString('es-MX')}
      ${deviceFarm ? ' · Device Farm: ' + _esc(deviceFarm.name) : ''}
    </div>
  </div>
</div>

<div class="tabs">
  <div class="tab active">Overview</div>
  <div class="tab">Tests</div>
  <div class="tab">Devices</div>
</div>

<div class="content">

  <!-- Dashboard principal -->
  <div class="dashboard">
    <div class="card">
      <h2>Test execution summary</h2>
      <div class="pie">
        ${_pieChart(suiteRun.passed, suiteRun.failed, suiteRun.totalJobs - suiteRun.passed - suiteRun.failed)}
        <div class="pie-label">
          <div class="pct">${passRate}%</div>
          <div class="lbl">Pass rate</div>
        </div>
      </div>
      <div class="legend">
        <div class="legend-item"><div class="legend-dot" style="background:#27ae60"></div>Passed (${suiteRun.passed})</div>
        <div class="legend-item"><div class="legend-dot" style="background:#e74c3c"></div>Failed (${suiteRun.failed})</div>
        ${suiteRun.skipped > 0 ? `<div class="legend-item"><div class="legend-dot" style="background:#95a5a6"></div>Skipped (${suiteRun.skipped})</div>` : ''}
      </div>
    </div>

    <div class="card">
      <h2>Statistics</h2>
      <div class="stats">
        <div class="stat-box"><div class="num">${suiteRun.totalSpecs}</div><div class="lbl">Specs</div></div>
        <div class="stat-box"><div class="num">${suiteRun.totalDevices}</div><div class="lbl">Devices</div></div>
        <div class="stat-box"><div class="num">${suiteRun.totalJobs}</div><div class="lbl">Total runs</div></div>
        <div class="stat-box"><div class="num passed">${suiteRun.passed}</div><div class="lbl">Passed</div></div>
        <div class="stat-box"><div class="num failed">${suiteRun.failed}</div><div class="lbl">Failed</div></div>
        <div class="stat-box"><div class="num">${suiteRun.durationMs ? (suiteRun.durationMs/1000).toFixed(1) + 's' : '—'}</div><div class="lbl">Duration</div></div>
      </div>
    </div>
  </div>

  <!-- Stats por device -->
  <div class="card" style="margin-bottom:1.5rem">
    <h2>Por dispositivo</h2>
    <div class="bar-chart">
      ${deviceStats.map(d => {
        const cls = d.passRate >= 90 ? '' : d.passRate >= 70 ? 'partial' : 'poor'
        return `
        <div class="bar-row">
          <div class="bar-label">${_esc(d.deviceId)}</div>
          <div class="bar-track">
            <div class="bar-fill ${cls}" style="width:${d.passRate}%">${d.passRate}%</div>
          </div>
          <div class="bar-meta">${d.passed}/${d.total}</div>
        </div>
        `
      }).join('')}
    </div>
  </div>

  <!-- Tests individuales -->
  <div class="card">
    <h2>All test runs</h2>
    <table>
      <thead>
        <tr>
          <th>Test</th>
          <th>Device</th>
          <th style="width:90px">Status</th>
          <th style="width:90px;text-align:right">Duration</th>
        </tr>
      </thead>
      <tbody>
        ${specs.flatMap(spec => spec.results.map(r => `
          <tr class="test-row ${r.status}">
            <td class="test-name">${_esc(spec.name)}</td>
            <td class="test-device">${_esc(r.deviceId)}</td>
            <td><span class="badge ${r.status}">${r.status}</span></td>
            <td style="text-align:right;font-family:monospace;font-size:.75rem">${r.durationMs ? (r.durationMs/1000).toFixed(1) + 's' : '—'}</td>
          </tr>
        `)).join('')}
      </tbody>
    </table>
  </div>

</div>

<footer>Generated by Achilltest · Allure-style report · ${new Date().toLocaleString('es-MX')}</footer>
</body>
</html>`
}

// ── HELPERS ──────────────────────────────────────────────────────────────────

function _esc(s) {
  if (s === null || s === undefined) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function _pieChart(passed, failed, pending) {
  const total = passed + failed + pending || 1
  const r = 80, cx = 100, cy = 100, c = 2 * Math.PI * r

  const passedFrac  = passed  / total
  const failedFrac  = failed  / total
  const pendingFrac = pending / total

  const segments = []
  let offset = 0

  if (passed > 0) {
    segments.push(`<circle r="${r}" cx="${cx}" cy="${cy}" fill="transparent" stroke="#27ae60" stroke-width="30" stroke-dasharray="${(passedFrac * c).toFixed(1)} ${c}" stroke-dashoffset="${(-offset).toFixed(1)}"/>`)
    offset += passedFrac * c
  }
  if (failed > 0) {
    segments.push(`<circle r="${r}" cx="${cx}" cy="${cy}" fill="transparent" stroke="#e74c3c" stroke-width="30" stroke-dasharray="${(failedFrac * c).toFixed(1)} ${c}" stroke-dashoffset="${(-offset).toFixed(1)}"/>`)
    offset += failedFrac * c
  }
  if (pending > 0) {
    segments.push(`<circle r="${r}" cx="${cx}" cy="${cy}" fill="transparent" stroke="#95a5a6" stroke-width="30" stroke-dasharray="${(pendingFrac * c).toFixed(1)} ${c}" stroke-dashoffset="${(-offset).toFixed(1)}"/>`)
  }

  return `<svg class="pie-svg" viewBox="0 0 200 200" width="200" height="200">${segments.join('')}</svg>`
}

async function _createZip(sourceDir, outputPath) {
  return new Promise((resolve, reject) => {
    const output  = createWriteStream(outputPath)
    const archive = archiver('zip', { zlib: { level: 9 } })

    output.on('close', resolve)
    archive.on('error', reject)
    archive.pipe(output)
    archive.directory(sourceDir, false, (entry) => {
      // No incluir el propio zip dentro del zip
      if (entry.name.endsWith('.zip')) return false
      return entry
    })
    archive.finalize()
  })
}
