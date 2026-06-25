/**
 * Visual Analyzer
 *
 * Análisis de aspectos visuales:
 *   - Touch targets demasiado pequeños (WCAG 2.5.5: 44x44 px mínimo)
 *   - Tamaño de texto (< 12px es problemático)
 *   - Espaciado entre elementos clickeables (overlapping)
 *   - Densidad de información en mobile
 *
 * En mobile la regla AAA pide 44px, AA pide 24px (más permisivo).
 */

export async function runVisualAnalysis(page, deviceCategory = 'desktop') {
  return await page.evaluate((deviceCategory) => {
    const issues = []

    const isMobile = deviceCategory === 'phone' || deviceCategory === 'tablet'
    const MIN_TOUCH_SIZE = isMobile ? 44 : 24    // px

    // ── 1. Touch targets ────────────────────────────────────────────────
    const clickables = document.querySelectorAll('a, button, input[type="checkbox"], input[type="radio"], input[type="submit"], [role="button"], [role="link"], [onclick]')
    const tooSmall = []

    for (const el of clickables) {
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) continue   // No visible
      if (rect.width < MIN_TOUCH_SIZE || rect.height < MIN_TOUCH_SIZE) {
        // Excluir links dentro de párrafos (inline links son OK)
        const parent = el.parentElement
        if (parent && parent.tagName === 'P' && el.tagName === 'A') continue

        tooSmall.push({
          tag: el.tagName.toLowerCase(),
          text: (el.textContent || el.value || '').trim().slice(0, 30),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          selector: _selectorOf(el),
        })
      }
    }

    if (tooSmall.length > 0) {
      // Crear un issue agrupado por las primeras N
      for (const t of tooSmall.slice(0, 10)) {
        issues.push({
          ruleId:          'touch-target-too-small',
          source:          'visual',
          ruleDescription:`Touch target muy pequeño: ${t.width}×${t.height}px (mínimo ${MIN_TOUCH_SIZE}px)${t.text ? ` — "${t.text}"` : ''}`,
          selector:        t.selector,
          details:         { width: t.width, height: t.height, minSize: MIN_TOUCH_SIZE },
        })
      }
    }

    // ── 2. Tamaño de texto ──────────────────────────────────────────────
    const textNodes = []
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          if (!node.textContent.trim()) return NodeFilter.FILTER_REJECT
          const parent = node.parentElement
          if (!parent) return NodeFilter.FILTER_REJECT
          if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(parent.tagName)) return NodeFilter.FILTER_REJECT
          return NodeFilter.FILTER_ACCEPT
        },
      },
    )

    let node
    let smallTextSamples = []
    while ((node = walker.nextNode())) {
      const el = node.parentElement
      const fontSize = parseFloat(window.getComputedStyle(el).fontSize)
      if (fontSize < 12) {
        const text = node.textContent.trim().slice(0, 50)
        if (text && smallTextSamples.length < 5) {
          smallTextSamples.push({ fontSize, text, selector: _selectorOf(el) })
        }
      }
    }

    for (const s of smallTextSamples) {
      issues.push({
        ruleId:          'text-too-small',
        source:          'visual',
        ruleDescription:`Texto muy pequeño (${s.fontSize}px): "${s.text}"`,
        selector:        s.selector,
        details:         { fontSize: s.fontSize },
      })
    }

    // ── 3. Espaciado entre elementos clickeables ────────────────────────
    // Buscar pares de botones/links muy cercanos (riesgo de mis-clicks)
    const clickableArray = Array.from(clickables).filter(el => {
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0
    })

    let overlappingCount = 0
    for (let i = 0; i < Math.min(clickableArray.length, 100); i++) {
      const r1 = clickableArray[i].getBoundingClientRect()
      for (let j = i + 1; j < Math.min(clickableArray.length, 100); j++) {
        const r2 = clickableArray[j].getBoundingClientRect()
        // Calcular distancia entre los más cercanos
        const dx = Math.max(0, Math.max(r1.x, r2.x) - Math.min(r1.x + r1.width, r2.x + r2.width))
        const dy = Math.max(0, Math.max(r1.y, r2.y) - Math.min(r1.y + r1.height, r2.y + r2.height))
        if (dx < 4 && dy < 4 && (dx !== 0 || dy !== 0)) {
          overlappingCount++
        }
      }
    }

    if (overlappingCount > 5) {
      issues.push({
        ruleId:          'targets-too-close',
        source:          'visual',
        ruleDescription:`${overlappingCount} pares de elementos clickeables están demasiado cercanos (mínimo 4px de separación)`,
      })
    }

    return {
      issues,
      summary: {
        clickableCount:        clickableArray.length,
        smallTouchTargetCount: tooSmall.length,
        smallTextCount:        smallTextSamples.length,
      },
    }

    function _selectorOf(el) {
      if (el.id) return `#${el.id}`
      const tag = el.tagName.toLowerCase()
      const cls = (el.className && typeof el.className === 'string')
        ? '.' + el.className.split(' ').filter(Boolean).slice(0, 2).join('.')
        : ''
      return tag + cls
    }
  }, deviceCategory)
}
