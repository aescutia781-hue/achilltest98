/**
 * Escaneo de DOM — extrae elementos interactivos de una página
 * usando Playwright. Devuelve un mapa compacto que la IA puede usar
 * para decidir el siguiente paso.
 */

/**
 * Extrae los elementos interactivos visibles en la página actual.
 * Limita la cantidad para no saturar el contexto de la IA.
 */
export async function scanPageDom(page, { maxElements = 50 } = {}) {
  // Esperar a que la página esté estable
  try {
    await page.waitForLoadState('domcontentloaded', { timeout: 5000 })
  } catch {}

  const url   = page.url()
  const title = await page.title().catch(() => '')

  // Extraer elementos interactivos del DOM
  const elements = await page.evaluate((max) => {
    const SELECTORS = [
      'button',
      'a[href]',
      'input:not([type="hidden"])',
      'select',
      'textarea',
      '[role="button"]',
      '[role="link"]',
      '[role="checkbox"]',
      '[role="radio"]',
      '[role="menuitem"]',
      '[role="tab"]',
      '[onclick]',
      '[contenteditable="true"]',
      'label[for]',
    ]

    function isVisible(el) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) return false
      const s = window.getComputedStyle(el)
      if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false
      // Visible en viewport o cerca
      return r.top < (window.innerHeight + 1500) && r.bottom > -500
    }

    function safe(s, n = 100) {
      if (!s) return ''
      return s.toString().trim().slice(0, n).replace(/\s+/g, ' ')
    }

    function buildSelector(el) {
      // Prioridad: id > data-testid > role+name > aria-label > tag+text > xpath simple
      if (el.id && !el.id.match(/^[0-9]/) && !el.id.includes(' '))
        return `#${CSS.escape(el.id)}`
      if (el.dataset?.testid)   return `[data-testid="${el.dataset.testid}"]`
      if (el.dataset?.test)     return `[data-test="${el.dataset.test}"]`

      const role = el.getAttribute('role') || el.tagName.toLowerCase()
      const name = el.getAttribute('aria-label') || el.innerText?.trim().slice(0, 40)
      if (name) return `${role}:"${name}"`

      // Fallback a tag + atributos comunes
      const tag = el.tagName.toLowerCase()
      if (el.type)    return `${tag}[type="${el.type}"]`
      if (el.name)    return `${tag}[name="${el.name}"]`
      return tag
    }

    const seen = new Set()
    const items = []

    for (const sel of SELECTORS) {
      const nodes = document.querySelectorAll(sel)
      for (const el of nodes) {
        if (items.length >= max) break
        if (!isVisible(el)) continue
        if (seen.has(el)) continue
        seen.add(el)

        const tag  = el.tagName.toLowerCase()
        const text = safe(el.innerText || el.value || el.placeholder)
        const role = el.getAttribute('role')
        const type = el.type
        const name = el.getAttribute('name')
        const href = el.getAttribute('href')
        const ariaLabel = el.getAttribute('aria-label')
        const placeholder = el.placeholder
        const id   = el.id
        const testid = el.dataset?.testid

        items.push({
          tag,
          text,
          role,
          type,
          name,
          href: href ? safe(href, 80) : undefined,
          ariaLabel: safe(ariaLabel),
          placeholder: safe(placeholder),
          id,
          testid,
          selector: buildSelector(el),
        })
      }
    }
    return items
  }, maxElements)

  return { url, title, elements }
}

/**
 * Convierte el escaneo de DOM a texto compacto para enviar a la IA.
 */
export function formatDomForAI({ url, title, elements }) {
  const lines = [
    `URL: ${url}`,
    `Título: ${title}`,
    `Elementos interactivos visibles:`,
    '',
  ]

  elements.forEach((e, i) => {
    const parts = [`[${i}] <${e.tag}>`]
    if (e.text)         parts.push(`text="${e.text}"`)
    if (e.ariaLabel)    parts.push(`aria="${e.ariaLabel}"`)
    if (e.placeholder)  parts.push(`placeholder="${e.placeholder}"`)
    if (e.type)         parts.push(`type=${e.type}`)
    if (e.name)         parts.push(`name=${e.name}`)
    if (e.href)         parts.push(`href=${e.href}`)
    if (e.id)           parts.push(`id=${e.id}`)
    if (e.testid)       parts.push(`testid=${e.testid}`)
    lines.push(parts.join('  '))
  })

  return lines.join('\n')
}
