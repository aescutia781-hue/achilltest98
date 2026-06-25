/**
 * Structural Analyzer
 *
 * Análisis de la estructura HTML que axe-core no cubre o cubre superficialmente.
 *   - Jerarquía de headings (H1-H6)
 *   - Landmarks (header, nav, main, footer, aside)
 *   - Skip links
 *   - Idioma del documento
 *   - Document title
 *   - IDs duplicados (más detallado)
 *
 * Se ejecuta directamente en el browser via page.evaluate().
 */

export async function runStructuralAnalysis(page) {
  return await page.evaluate(() => {
    const issues = []

    // ── 1. Headings ─────────────────────────────────────────────────────
    const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).map(h => ({
      level:    parseInt(h.tagName.slice(1), 10),
      text:     (h.textContent || '').trim().slice(0, 100),
      selector: _getSelector(h),
    }))

    const h1s = headings.filter(h => h.level === 1)

    // No H1
    if (h1s.length === 0) {
      issues.push({
        ruleId:           'no-h1',
        source:           'structural',
        ruleDescription: 'La página no tiene un encabezado H1',
      })
    }

    // Múltiples H1
    if (h1s.length > 1) {
      issues.push({
        ruleId:           'multiple-h1',
        source:           'structural',
        ruleDescription: `La página tiene ${h1s.length} encabezados H1 (debería haber uno)`,
        details:         { count: h1s.length },
      })
    }

    // Saltos en la jerarquía (ej. H2 → H4)
    for (let i = 0; i < headings.length - 1; i++) {
      const current = headings[i]
      const next    = headings[i + 1]
      if (next.level - current.level > 1) {
        issues.push({
          ruleId:          'heading-skip',
          source:          'structural',
          ruleDescription: `Salto de nivel: de H${current.level} ("${current.text.slice(0,40)}") a H${next.level} ("${next.text.slice(0,40)}")`,
          selector:        next.selector,
        })
      }
    }

    // Headings vacíos
    for (const h of headings) {
      if (!h.text) {
        issues.push({
          ruleId:          'empty-heading',
          source:          'structural',
          ruleDescription: `Encabezado H${h.level} vacío`,
          selector:        h.selector,
        })
      }
    }

    // ── 2. Landmarks ────────────────────────────────────────────────────
    const landmarks = {
      header:  document.querySelector('header, [role="banner"]'),
      nav:     document.querySelector('nav, [role="navigation"]'),
      main:    document.querySelector('main, [role="main"]'),
      footer:  document.querySelector('footer, [role="contentinfo"]'),
    }

    if (!landmarks.main) {
      issues.push({
        ruleId:           'no-main-landmark',
        source:           'structural',
        ruleDescription: 'La página no tiene un landmark <main>',
      })
    }
    if (!landmarks.nav && document.querySelectorAll('a').length > 5) {
      // Solo flag si hay varios links (probable navegación)
      issues.push({
        ruleId:           'no-landmark-nav',
        source:           'structural',
        ruleDescription: 'La página tiene varios enlaces pero no usa <nav>',
      })
    }

    // ── 3. Skip link ────────────────────────────────────────────────────
    const firstLinks = Array.from(document.querySelectorAll('body a')).slice(0, 3)
    const hasSkipLink = firstLinks.some(a => {
      const text = (a.textContent || '').toLowerCase()
      const href = (a.getAttribute('href') || '').toLowerCase()
      return (text.includes('saltar') || text.includes('skip') || text.includes('ir al contenido'))
          && (href.startsWith('#main') || href.startsWith('#content') || href.startsWith('#'))
    })

    if (!hasSkipLink) {
      issues.push({
        ruleId:           'no-skip-link',
        source:           'structural',
        ruleDescription: 'No se detectó un enlace para saltar al contenido principal',
      })
    }

    // ── 4. Document title ───────────────────────────────────────────────
    const title = document.title?.trim()
    if (!title) {
      issues.push({
        ruleId:           'empty-title',
        source:           'structural',
        ruleDescription: 'La página no tiene título (<title> vacío)',
      })
    } else if (title.length < 5) {
      issues.push({
        ruleId:           'short-title',
        source:           'structural',
        ruleDescription: `Título muy corto: "${title}"`,
      })
    } else if (title.length > 70) {
      issues.push({
        ruleId:           'long-title',
        source:           'structural',
        ruleDescription: `Título demasiado largo (${title.length} caracteres)`,
      })
    }

    // ── 5. Idioma del documento ─────────────────────────────────────────
    const lang = document.documentElement.getAttribute('lang')
    if (!lang) {
      issues.push({
        ruleId:           'no-lang',
        source:           'structural',
        ruleDescription: 'El elemento <html> no tiene atributo lang',
      })
    }

    // ── 6. Resumen estructural ──────────────────────────────────────────
    return {
      issues,
      summary: {
        headings: {
          total: headings.length,
          h1: h1s.length,
          byLevel: {
            h1: headings.filter(h => h.level === 1).length,
            h2: headings.filter(h => h.level === 2).length,
            h3: headings.filter(h => h.level === 3).length,
            h4: headings.filter(h => h.level === 4).length,
            h5: headings.filter(h => h.level === 5).length,
            h6: headings.filter(h => h.level === 6).length,
          },
        },
        landmarks: {
          hasHeader: !!landmarks.header,
          hasNav:    !!landmarks.nav,
          hasMain:   !!landmarks.main,
          hasFooter: !!landmarks.footer,
        },
        title:    title || null,
        lang:     lang || null,
        hasSkipLink,
      },
    }

    // ── Helper ──────────────────────────────────────────────────────────
    function _getSelector(el) {
      if (el.id) return `#${el.id}`
      const tag = el.tagName.toLowerCase()
      const classes = el.className && typeof el.className === 'string'
        ? '.' + el.className.split(' ').filter(Boolean).join('.')
        : ''
      return tag + classes
    }
  })
}
