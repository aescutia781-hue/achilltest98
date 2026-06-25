/**
 * Keyboard Analyzer
 *
 * Análisis de accesibilidad con teclado:
 *   - Elementos interactivos (button, a, input, select) que NO son accesibles con Tab
 *   - Focus visible (¿tienen :focus style?)
 *   - Tab order lógico (orden visual vs orden de tabulación)
 *   - Focus traps (modals que atrapan el focus sin salida)
 *   - Tabindex positivos (mala práctica)
 *
 * Hace prueba dinámica: simula presionar Tab N veces y analiza el orden.
 */

const MAX_TAB_PRESSES = 50

export async function runKeyboardAnalysis(page) {
  // ── 1. Inventario inicial de elementos interactivos ─────────────────────
  const inventory = await page.evaluate(() => {
    const interactive = []

    // Selector para elementos potencialmente interactivos
    const all = document.querySelectorAll(`
      a[href], button, input, select, textarea, [tabindex], [role="button"],
      [role="link"], [role="tab"], [role="checkbox"], [role="radio"],
      [role="menuitem"], [contenteditable]
    `)

    for (const el of all) {
      const rect = el.getBoundingClientRect()
      const isVisible = rect.width > 0 && rect.height > 0 &&
                        window.getComputedStyle(el).visibility !== 'hidden' &&
                        window.getComputedStyle(el).display !== 'none'

      const tabindex = el.getAttribute('tabindex')
      const isDisabled = el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true'

      if (!isVisible || isDisabled) continue

      interactive.push({
        tag:        el.tagName.toLowerCase(),
        type:       el.type || null,
        role:       el.getAttribute('role') || null,
        text:       (el.textContent || el.value || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').trim().slice(0, 50),
        href:       el.getAttribute('href') || null,
        tabindex:   tabindex !== null ? parseInt(tabindex, 10) : null,
        rect:       { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
        selector:   _selectorOf(el),
      })
    }

    return interactive

    function _selectorOf(el) {
      if (el.id) return `#${el.id}`
      const tag = el.tagName.toLowerCase()
      const cls = (el.className && typeof el.className === 'string')
        ? '.' + el.className.split(' ').filter(Boolean).slice(0, 2).join('.')
        : ''
      return tag + cls
    }
  })

  // ── 2. Simular Tab y registrar qué elemento toma focus ──────────────────
  const tabOrder = []
  const visitedSelectors = new Set()
  let prevActive = null

  for (let i = 0; i < MAX_TAB_PRESSES; i++) {
    await page.keyboard.press('Tab')

    const focused = await page.evaluate(() => {
      const el = document.activeElement
      if (!el || el === document.body) return null

      const rect = el.getBoundingClientRect()
      return {
        tag:      el.tagName.toLowerCase(),
        role:     el.getAttribute('role') || null,
        text:     (el.textContent || el.value || el.getAttribute('aria-label') || '').trim().slice(0, 50),
        selector: el.id ? `#${el.id}` : el.tagName.toLowerCase(),
        rect:     { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
        // ¿Tiene outline visible?
        outlineWidth: window.getComputedStyle(el).outlineWidth,
        outlineStyle: window.getComputedStyle(el).outlineStyle,
        outlineColor: window.getComputedStyle(el).outlineColor,
        boxShadow:    window.getComputedStyle(el).boxShadow,
      }
    })

    if (!focused) break

    const key = `${focused.selector}-${focused.text}`
    // Detección de focus trap: si volvemos a un elemento muy temprano repetidamente
    if (visitedSelectors.has(key) && tabOrder.length > visitedSelectors.size * 1.5) {
      tabOrder.push({ ...focused, possibleTrap: true })
      break
    }
    visitedSelectors.add(key)

    tabOrder.push(focused)

    // Si volvemos a body (loop completo), terminamos
    if (i > 5 && (focused.tag === 'body' || focused.tag === 'html')) break
  }

  // ── 3. Análisis de los resultados ───────────────────────────────────────
  const issues = []

  // 3a. Elementos interactivos NO encontrados en el tab order
  const inTabOrder = new Set(tabOrder.map(f => `${f.tag}-${f.text}`))
  for (const el of inventory) {
    const key = `${el.tag}-${el.text}`
    // Skip si tabindex=-1 (intencionalmente fuera del orden)
    if (el.tabindex === -1) continue
    // Skip elementos sin texto (probablemente decorativos)
    if (!el.text && !el.href) continue
    if (!inTabOrder.has(key)) {
      issues.push({
        ruleId:           'interactive-not-keyboard',
        source:           'keyboard',
        ruleDescription: `Elemento interactivo no accesible con teclado: <${el.tag}>${el.text ? ` "${el.text}"` : ''}`,
        selector:         el.selector,
      })
    }
  }

  // 3b. Focus NO visible (sin outline ni box-shadow ni cambio detectable)
  for (const focused of tabOrder) {
    const hasOutline   = focused.outlineWidth && focused.outlineWidth !== '0px' && focused.outlineStyle !== 'none'
    const hasBoxShadow = focused.boxShadow && focused.boxShadow !== 'none'
    if (!hasOutline && !hasBoxShadow) {
      issues.push({
        ruleId:           'focus-not-visible',
        source:           'keyboard',
        ruleDescription: `Elemento sin indicador de focus visible: <${focused.tag}>${focused.text ? ` "${focused.text.slice(0,30)}"` : ''}`,
        selector:         focused.selector,
      })
    }
  }

  // 3c. Tabindex positivos
  for (const el of inventory) {
    if (el.tabindex && el.tabindex > 0) {
      issues.push({
        ruleId:           'tabindex-positive',
        source:           'keyboard',
        ruleDescription: `Tabindex positivo (${el.tabindex}) — rompe el orden natural`,
        selector:         el.selector,
      })
    }
  }

  // 3d. Focus trap detectado
  if (tabOrder.length && tabOrder[tabOrder.length - 1].possibleTrap) {
    issues.push({
      ruleId:           'focus-trap',
      source:           'keyboard',
      ruleDescription: 'Posible focus trap detectado — el focus parece atrapado en un loop',
    })
  }

  // 3e. Orden tabulación incoherente (analiza si las coordenadas Y van decreciendo bruscamente)
  let backwardsCount = 0
  for (let i = 1; i < tabOrder.length; i++) {
    if (tabOrder[i].rect.y < tabOrder[i-1].rect.y - 100) {
      backwardsCount++
    }
  }
  if (backwardsCount > tabOrder.length * 0.3 && tabOrder.length > 5) {
    issues.push({
      ruleId:           'illogical-tab-order',
      source:           'keyboard',
      ruleDescription: 'El orden de tabulación parece inconsistente con el orden visual de la página',
    })
  }

  return {
    issues,
    summary: {
      interactiveCount:  inventory.length,
      tabbableCount:     tabOrder.length,
      hasFocusVisible:   !issues.some(i => i.ruleId === 'focus-not-visible'),
      hasPositiveTabindex: issues.some(i => i.ruleId === 'tabindex-positive'),
    },
    tabOrder,
  }
}

// Deuplicar resultados (con ese loop a veces el mismo elemento toma focus 2 veces seguidas)
function _selectorOf(el) {
  if (el.id) return `#${el.id}`
  return el.tagName.toLowerCase()
}
