/**
 * WCAG Report Generator
 *
 * Genera 3 formatos de reporte:
 *
 *   1. HTML interactivo  — dashboard con métricas, gráficas, screenshots
 *   2. JSON estructurado — para CI/CD, integración con otras herramientas
 *   3. PDF               — renderizado del HTML via Playwright print-to-PDF
 *
 * Todos se guardan en REPORTS_DIR/wcag/{analysisId}/ y se sirven como
 * archivos estáticos vía /reports/wcag/{analysisId}/...
 */

import { mkdirSync, writeFileSync, existsSync }  from 'fs'
import { join }                                   from 'path'

import { scoreGrade }                            from './wcag-scorer.js'
import { AFFECTED_USER_GROUPS, CATEGORIES }      from '../config/wcag-rules.js'

const REPORTS_DIR = process.env.REPORTS_DIR || '/tmp/achilltest-reports'

/**
 * Genera todos los reportes para un análisis.
 *
 * @param {object} analysis  Registro de wcag_analyses
 * @param {Array}  issues    Lista de wcag_issues con traducciones humanas
 * @param {object} [opts]
 * @param {import('playwright').Browser} [opts.browser]  Para generar PDF
 *
 * @returns {{ html, json, pdf }} Paths relativos servidos como /reports/...
 */
export async function generateWcagReports(analysis, issues, opts = {}) {
  const dir = join(REPORTS_DIR, 'wcag', analysis.id)
  mkdirSync(dir, { recursive: true })

  // ── 1. JSON ─────────────────────────────────────────────────────────────
  const jsonData = {
    analysisId: analysis.id,
    url:        analysis.url,
    level:      analysis.level,
    deviceId:   analysis.deviceId,
    timestamp:  analysis.startedAt,
    duration_ms:analysis.durationMs,
    score:      analysis.score,
    grade:      scoreGrade(analysis.score || 0),
    summary: {
      total:     analysis.totalIssues,
      critical:  analysis.criticalCount,
      high:      analysis.highCount,
      medium:    analysis.mediumCount,
      low:       analysis.lowCount,
      passed:    analysis.passedRules,
    },
    categoryScores: analysis.categoryScores,
    issues: issues.map(i => ({
      ruleId:        i.ruleId,
      severity:      i.severity,
      category:      i.category,
      wcagCriterion: i.wcagCriterion,
      wcagLevel:     i.wcagLevel,
      title:         i.humanTitle,
      description:   i.humanDescription,
      impact:        i.humanImpact,
      fixSuggestion: i.humanFixSuggestion,
      fixCode:       i.fixCodeSnippet,
      selector:      i.selector,
      htmlSnippet:   i.htmlSnippet,
      affectedUsers: i.affectedUsers,
    })),
  }
  const jsonPath = join(dir, 'report.json')
  writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2))

  // ── 2. HTML interactivo ─────────────────────────────────────────────────
  const html = _renderHtmlReport(analysis, issues, jsonData)
  const htmlPath = join(dir, 'report.html')
  writeFileSync(htmlPath, html, 'utf-8')

  // ── 3. PDF (renderizado vía Playwright si nos pasaron browser) ──────────
  let pdfUrl = null
  if (opts.browser) {
    try {
      const ctx  = await opts.browser.newContext()
      const page = await ctx.newPage()
      await page.goto('file://' + htmlPath, { waitUntil: 'domcontentloaded' })
      const pdfPath = join(dir, 'report.pdf')
      await page.pdf({
        path:       pdfPath,
        format:     'A4',
        printBackground: true,
        margin:     { top: '12mm', right: '12mm', bottom: '12mm', left: '12mm' },
      })
      await ctx.close()
      pdfUrl = `/reports/wcag/${analysis.id}/report.pdf`
    } catch (err) {
      console.warn('[WcagReport] PDF generation failed:', err.message)
    }
  }

  return {
    html: `/reports/wcag/${analysis.id}/report.html`,
    json: `/reports/wcag/${analysis.id}/report.json`,
    pdf:  pdfUrl,
  }
}

// ── HTML rendering ──────────────────────────────────────────────────────────

function _renderHtmlReport(analysis, issues, jsonData) {
  const grade = scoreGrade(analysis.score || 0)
  const issuesBySeverity = {
    critical: issues.filter(i => i.severity === 'critical'),
    high:     issues.filter(i => i.severity === 'high'),
    medium:   issues.filter(i => i.severity === 'medium'),
    low:      issues.filter(i => i.severity === 'low'),
  }

  // Issues agrupados por categoría
  const byCategory = {}
  for (const i of issues) {
    if (!byCategory[i.category]) byCategory[i.category] = []
    byCategory[i.category].push(i)
  }

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Reporte WCAG — ${_esc(analysis.url)}</title>
<style>
* { margin:0; padding:0; box-sizing:border-box }
body { font-family: -apple-system, system-ui, sans-serif; background:#f7f7fa; color:#1a1a2e; line-height:1.5 }

/* Header */
.header { background: linear-gradient(135deg, #2c3e50 0%, #34495e 100%); color:#fff; padding:2rem 2.5rem }
.header h1 { font-size:1.625rem; margin-bottom:.25rem }
.header .url { font-family: monospace; font-size:.875rem; color:#bdc3c7; word-break:break-all }
.header .meta { display:flex; gap:1.5rem; margin-top:.875rem; font-size:.8125rem; color:#bdc3c7; flex-wrap:wrap }

/* Score card */
.score-section { display:grid; grid-template-columns:340px 1fr; gap:1.5rem; padding:2rem 2.5rem; background:#fff; border-bottom:1px solid #e5e5ed }
.score-card { background:linear-gradient(135deg, #fff, #f7f7fa); border:1px solid #e5e5ed; border-radius:14px; padding:1.75rem; text-align:center }
.score-big { font-size:4.5rem; font-weight:800; line-height:1; color:${grade.color}; margin-bottom:.25rem }
.score-grade { font-size:1.875rem; font-weight:700; color:${grade.color}; margin-bottom:.375rem }
.score-label { color:#666; font-size:.875rem }

.summary-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(120px, 1fr)); gap:.75rem }
.summary-card { background:#fff; border:1px solid #e5e5ed; border-radius:10px; padding:1rem; text-align:center }
.summary-card .num { font-size:1.625rem; font-weight:700; line-height:1 }
.summary-card .lbl { font-size:.7rem; color:#666; text-transform:uppercase; letter-spacing:.05em; margin-top:.25rem; font-weight:600 }
.summary-card.critical { border-left:3px solid #ef4444 } .summary-card.critical .num { color:#ef4444 }
.summary-card.high     { border-left:3px solid #f97316 } .summary-card.high .num     { color:#f97316 }
.summary-card.medium   { border-left:3px solid #f59e0b } .summary-card.medium .num   { color:#f59e0b }
.summary-card.low      { border-left:3px solid #84cc16 } .summary-card.low .num      { color:#84cc16 }
.summary-card.passed   { border-left:3px solid #22c55e } .summary-card.passed .num   { color:#22c55e }

/* Categorías */
.section { padding:2rem 2.5rem }
.section-title { font-size:1.125rem; font-weight:700; margin-bottom:1rem; color:#2c3e50 }

.category-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:.625rem }
.cat-card { background:#fff; border:1px solid #e5e5ed; border-radius:10px; padding:.875rem 1rem }
.cat-card .row { display:flex; justify-content:space-between; align-items:center; margin-bottom:.375rem }
.cat-card .name { font-size:.8125rem; color:#555; font-weight:500 }
.cat-card .pct { font-size:.875rem; font-weight:700 }
.cat-bar { height:5px; background:#f0f0f5; border-radius:3px; overflow:hidden }
.cat-bar-fill { height:100%; border-radius:3px }

/* Issues */
.issue-group { background:#fff; border:1px solid #e5e5ed; border-radius:12px; margin-bottom:1rem; overflow:hidden }
.issue-group-header { padding:.875rem 1rem; background:#fafafc; border-bottom:1px solid #e5e5ed; display:flex; justify-content:space-between; align-items:center; cursor:pointer; user-select:none }
.issue-group-title { font-size:.9375rem; font-weight:600; color:#2c3e50 }
.issue-group-count { font-size:.75rem; color:#666; font-weight:600; background:#fff; padding:.25rem .625rem; border-radius:12px }

.issue { padding:1rem 1.25rem; border-bottom:1px solid #f0f0f5 }
.issue:last-child { border-bottom:none }
.issue-header { display:flex; gap:.625rem; align-items:flex-start; margin-bottom:.5rem }
.severity-pill { padding:.125rem .5rem; border-radius:4px; font-size:.65rem; font-weight:700; text-transform:uppercase; letter-spacing:.05em; flex-shrink:0 }
.severity-pill.critical { background:#fee2e2; color:#dc2626 }
.severity-pill.high     { background:#ffedd5; color:#ea580c }
.severity-pill.medium   { background:#fef3c7; color:#d97706 }
.severity-pill.low      { background:#ecfccb; color:#65a30d }

.issue-title { font-size:.9375rem; font-weight:600; color:#1a1a2e; flex:1 }
.issue-wcag { font-size:.7rem; color:#888; font-family: monospace; padding:.125rem .375rem; background:#f0f0f5; border-radius:3px }

.issue-content { margin-left:0; font-size:.8125rem; color:#444; line-height:1.6 }
.issue-content > div { margin-bottom:.625rem }
.issue-label { font-size:.7rem; color:#888; font-weight:700; text-transform:uppercase; letter-spacing:.05em; margin-bottom:.125rem }

.code { font-family: 'SF Mono', monospace; font-size:.7rem; background:#1a1a2e; color:#a3e635; padding:.625rem .875rem; border-radius:6px; overflow-x:auto; white-space:pre-wrap; word-break:break-word }
.selector-code { font-family: 'SF Mono', monospace; font-size:.7rem; background:#f0f0f5; color:#6b21a8; padding:.125rem .375rem; border-radius:3px }

.affected-users { display:flex; flex-wrap:wrap; gap:.25rem; margin-top:.375rem }
.user-pill { font-size:.65rem; padding:.125rem .5rem; background:#f0f0f5; color:#444; border-radius:10px }

/* Sims */
.sims-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:.75rem; margin-top:1rem }
.sim-card { background:#fff; border:1px solid #e5e5ed; border-radius:10px; overflow:hidden }
.sim-card img { width:100%; height:auto; display:block; max-height:200px; object-fit:cover; object-position:top }
.sim-card .label { padding:.5rem .75rem; font-size:.75rem; color:#444; font-weight:500 }

footer { text-align:center; padding:1.5rem; color:#888; font-size:.75rem }

/* Mobile */
@media (max-width: 720px) {
  .header, .section, .score-section { padding:1.25rem 1rem }
  .score-section { grid-template-columns: 1fr }
}
</style>
</head>
<body>

<!-- Header -->
<div class="header">
  <h1>Reporte de Accesibilidad WCAG</h1>
  <div class="url">${_esc(analysis.url)}</div>
  <div class="meta">
    <span>📅 ${new Date(analysis.startedAt).toLocaleString('es-MX')}</span>
    <span>📐 Nivel ${_esc(analysis.level)}</span>
    ${analysis.deviceId ? `<span>📱 ${_esc(analysis.deviceId)}</span>` : ''}
    <span>⏱️ ${analysis.durationMs ? Math.round(analysis.durationMs/1000) + 's' : ''}</span>
  </div>
</div>

<!-- Score + Summary -->
<div class="score-section">
  <div class="score-card">
    <div class="score-big">${analysis.score || 0}</div>
    <div class="score-grade">${grade.grade}</div>
    <div class="score-label">${grade.label}</div>
  </div>

  <div>
    <h3 style="margin-bottom:.875rem; color:#2c3e50; font-size:.9375rem">Resumen del análisis</h3>
    <div class="summary-grid">
      <div class="summary-card critical"><div class="num">${analysis.criticalCount || 0}</div><div class="lbl">Crítico</div></div>
      <div class="summary-card high"><div class="num">${analysis.highCount || 0}</div><div class="lbl">Alto</div></div>
      <div class="summary-card medium"><div class="num">${analysis.mediumCount || 0}</div><div class="lbl">Medio</div></div>
      <div class="summary-card low"><div class="num">${analysis.lowCount || 0}</div><div class="lbl">Bajo</div></div>
      <div class="summary-card passed"><div class="num">${analysis.passedRules || 0}</div><div class="lbl">Pasadas</div></div>
    </div>
  </div>
</div>

${analysis.categoryScores && Object.keys(analysis.categoryScores).length > 0 ? `
<div class="section" style="background:#fafafc">
  <h2 class="section-title">📊 Score por categoría</h2>
  <div class="category-grid">
    ${Object.entries(analysis.categoryScores).filter(([, v]) => byCategory[''+_findCat(analysis.categoryScores, v)] !== undefined || true).map(([cat, score]) => {
      const c = CATEGORIES[cat] || CATEGORIES.other
      const color = score >= 85 ? '#22c55e' : score >= 70 ? '#f59e0b' : '#ef4444'
      const issuesInCat = byCategory[cat]?.length || 0
      return `
        <div class="cat-card">
          <div class="row">
            <span class="name">${c.icon} ${c.label}</span>
            <span class="pct" style="color:${color}">${score}</span>
          </div>
          <div class="cat-bar"><div class="cat-bar-fill" style="width:${score}%; background:${color}"></div></div>
          <div style="font-size:.65rem; color:#888; margin-top:.375rem">${issuesInCat} issue${issuesInCat !== 1 ? 's' : ''}</div>
        </div>
      `
    }).join('')}
  </div>
</div>` : ''}

<!-- Issues -->
<div class="section">
  <h2 class="section-title">🐛 Issues detectados (${issues.length})</h2>

  ${['critical', 'high', 'medium', 'low'].map(sev => {
    const list = issuesBySeverity[sev]
    if (list.length === 0) return ''
    const sevLabels = { critical: '🔴 Críticos', high: '🟠 Altos', medium: '🟡 Medios', low: '🟢 Bajos' }
    return `
      <div class="issue-group">
        <div class="issue-group-header">
          <div class="issue-group-title">${sevLabels[sev]}</div>
          <div class="issue-group-count">${list.length}</div>
        </div>
        ${list.map(i => _renderIssue(i, sev)).join('')}
      </div>
    `
  }).join('')}

  ${issues.length === 0 ? `
    <div style="background:#fff; border:1px solid #e5e5ed; border-radius:12px; padding:3rem 2rem; text-align:center">
      <div style="font-size:3rem; margin-bottom:.5rem">🎉</div>
      <h3 style="color:#22c55e; font-size:1.25rem; margin-bottom:.5rem">¡Ningún issue detectado!</h3>
      <p style="color:#666">Tu sitio cumple con todas las reglas WCAG ${analysis.level} analizadas.</p>
    </div>
  ` : ''}
</div>

${analysis.simulations && Object.keys(analysis.simulations.simulations || {}).length > 0 ? `
<div class="section" style="background:#fafafc">
  <h2 class="section-title">🎨 Simulaciones de visión</h2>
  <p style="font-size:.8125rem; color:#666; margin-bottom:1rem">Así se ve tu página para personas con distintas condiciones visuales:</p>
  <div class="sims-grid">
    ${Object.entries(analysis.simulations.simulations).map(([k, v]) => `
      <div class="sim-card">
        <img src="${v.url}" alt="${v.label}" loading="lazy"/>
        <div class="label">${v.label}</div>
      </div>
    `).join('')}
  </div>
</div>` : ''}

<footer>
  Generado por <strong>Achilltest</strong> · ${new Date().toLocaleString('es-MX')}
</footer>

<script>
// Hacer los grupos colapsables
document.querySelectorAll('.issue-group-header').forEach(h => {
  h.addEventListener('click', () => {
    const group = h.parentElement
    const issues = group.querySelectorAll('.issue')
    const isHidden = issues[0]?.style.display === 'none'
    for (const i of issues) i.style.display = isHidden ? 'block' : 'none'
  })
})
</script>
</body>
</html>`
}

function _renderIssue(issue, severity) {
  const usersHtml = (issue.affectedUsers || []).map(uid => {
    const g = AFFECTED_USER_GROUPS[uid]
    return g ? `<span class="user-pill">${g.icon} ${g.label}</span>` : ''
  }).join('')

  return `
    <div class="issue">
      <div class="issue-header">
        <span class="severity-pill ${severity}">${severity}</span>
        <div class="issue-title">${_esc(issue.humanTitle || issue.ruleDescription || issue.ruleId)}</div>
        ${issue.wcagCriterion ? `<span class="issue-wcag">${_esc(issue.wcagCriterion)} ${issue.wcagLevel || ''}</span>` : ''}
      </div>
      <div class="issue-content">
        ${issue.humanDescription ? `<div><div class="issue-label">Problema</div>${_esc(issue.humanDescription)}</div>` : ''}
        ${issue.humanImpact      ? `<div><div class="issue-label">Impacto</div>${_esc(issue.humanImpact)}</div>` : ''}
        ${issue.humanFixSuggestion ? `<div><div class="issue-label">💡 Cómo arreglarlo</div>${_esc(issue.humanFixSuggestion)}</div>` : ''}
        ${issue.fixCodeSnippet     ? `<div><div class="issue-label">Ejemplo de código</div><div class="code">${_esc(issue.fixCodeSnippet)}</div></div>` : ''}
        ${issue.selector           ? `<div><div class="issue-label">Dónde</div><span class="selector-code">${_esc(issue.selector)}</span></div>` : ''}
        ${issue.htmlSnippet        ? `<div><div class="issue-label">HTML afectado</div><div class="code">${_esc(issue.htmlSnippet)}</div></div>` : ''}
        ${usersHtml ? `<div class="affected-users">${usersHtml}</div>` : ''}
      </div>
    </div>
  `
}

function _esc(s) {
  if (s === null || s === undefined) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function _findCat(_, __) { return '' }
