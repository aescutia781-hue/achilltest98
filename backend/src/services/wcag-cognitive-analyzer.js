/**
 * Cognitive Analyzer
 *
 * Análisis de carga cognitiva:
 *   - Paredes de texto sin estructura (párrafos enormes)
 *   - Palabras técnicas/complejas en exceso
 *   - Tiempo de lectura estimado
 *   - Densidad de información
 *
 * Útil para sitios gubernamentales, educativos, médicos donde el usuario
 * puede tener discapacidad cognitiva, ser adulto mayor o no nativo.
 */

const MAX_PARAGRAPH_WORDS = 100   // > 100 palabras = pared de texto
const COMPLEX_WORD_THRESHOLD = 4  // > 4 sílabas = palabra compleja

export async function runCognitiveAnalysis(page) {
  return await page.evaluate(({ MAX_PARAGRAPH_WORDS, COMPLEX_WORD_THRESHOLD }) => {
    const issues = []

    // ── 1. Paredes de texto ──────────────────────────────────────────────
    const paragraphs = Array.from(document.querySelectorAll('p, div, article, section'))
      .filter(el => el.children.length === 0 || _isMainlyText(el))
      .map(el => ({
        text: (el.textContent || '').trim(),
        selector: _selectorOf(el),
      }))
      .filter(p => p.text.length > 50)

    const wordsInElement = (text) => text.split(/\s+/).filter(Boolean).length

    let wallsOfText = 0
    for (const p of paragraphs) {
      const words = wordsInElement(p.text)
      if (words > MAX_PARAGRAPH_WORDS) {
        wallsOfText++
        if (wallsOfText <= 3) {
          issues.push({
            ruleId:          'wall-of-text',
            source:          'cognitive',
            ruleDescription:`Bloque de texto muy largo (${words} palabras) — dificulta la lectura`,
            selector:        p.selector,
            details:         { wordCount: words },
          })
        }
      }
    }

    // ── 2. Palabras complejas ────────────────────────────────────────────
    const allText = paragraphs.map(p => p.text).join(' ').slice(0, 10000)
    const allWords = allText.toLowerCase().split(/\s+/).filter(w => w.length > 2 && /^[a-zñáéíóúü]+$/i.test(w))

    let complexWords = 0
    for (const word of allWords) {
      if (_countSyllablesSpanish(word) > COMPLEX_WORD_THRESHOLD) complexWords++
    }

    const complexRatio = allWords.length > 0 ? complexWords / allWords.length : 0
    if (complexRatio > 0.15 && allWords.length > 100) {   // > 15% palabras complejas
      issues.push({
        ruleId:          'complex-language',
        source:          'cognitive',
        ruleDescription:`Lenguaje complejo: ${Math.round(complexRatio * 100)}% de palabras con 5+ sílabas. Considera simplificar para audiencias más amplias.`,
        details:         { complexRatio, totalWords: allWords.length },
      })
    }

    // ── 3. Tiempo de lectura estimado ────────────────────────────────────
    const totalWords = wordsInElement(allText)
    const readingMinutes = Math.round(totalWords / 200)   // promedio 200 wpm

    // ── 4. Ratio link / texto ────────────────────────────────────────────
    // Muchos links sueltos en medio del texto distraen
    const linksInBody = document.querySelectorAll('main a, article a, p a, section a').length
    const linkDensity = totalWords > 0 ? linksInBody / (totalWords / 100) : 0   // links per 100 words

    return {
      issues,
      summary: {
        totalWords,
        readingMinutes,
        wallsOfText,
        complexRatio:    Math.round(complexRatio * 100) / 100,
        linksPerHundredWords: Math.round(linkDensity * 100) / 100,
        paragraphCount:  paragraphs.length,
      },
    }

    // ── Helpers ──────────────────────────────────────────────────────────
    function _isMainlyText(el) {
      const text = (el.textContent || '').trim().length
      if (!text) return false
      // Si tiene muchos hijos, no es un párrafo de texto puro
      return el.children.length <= 5
    }

    function _selectorOf(el) {
      if (el.id) return `#${el.id}`
      return el.tagName.toLowerCase()
    }

    function _countSyllablesSpanish(word) {
      // Aproximación de sílabas en español:
      // Cuenta grupos de vocales como sílabas (no perfecto pero útil)
      const matches = word.toLowerCase().match(/[aeiouáéíóúü]+/g)
      return matches ? matches.length : 1
    }
  }, { MAX_PARAGRAPH_WORDS, COMPLEX_WORD_THRESHOLD })
}
