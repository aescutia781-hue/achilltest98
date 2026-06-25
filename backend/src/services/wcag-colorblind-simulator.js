/**
 * Color Blindness Simulator
 *
 * Aplica CSS filters a la página para simular cómo la ven:
 *   - Protanopia    (no ve rojo, 1% hombres)
 *   - Deuteranopia  (no ve verde, 1% hombres)
 *   - Tritanopia    (no ve azul, 0.001% pob.)
 *   - Achromatopsia (escala de grises, 0.003% pob.)
 *   - Low Vision    (visión borrosa)
 *
 * Captura screenshots de cada variante para que el usuario las compare
 * en el reporte.
 */

import { join } from 'path'

// SVG filters de simulación (basados en matrices científicas de Brettel et al)
const SIMULATIONS = {
  protanopia: `
    <svg xmlns="http://www.w3.org/2000/svg">
      <filter id="achilltest-sim">
        <feColorMatrix type="matrix" values="
          0.567 0.433 0     0 0
          0.558 0.442 0     0 0
          0     0.242 0.758 0 0
          0     0     0     1 0
        "/>
      </filter>
    </svg>
  `,
  deuteranopia: `
    <svg xmlns="http://www.w3.org/2000/svg">
      <filter id="achilltest-sim">
        <feColorMatrix type="matrix" values="
          0.625 0.375 0     0 0
          0.7   0.3   0     0 0
          0     0.3   0.7   0 0
          0     0     0     1 0
        "/>
      </filter>
    </svg>
  `,
  tritanopia: `
    <svg xmlns="http://www.w3.org/2000/svg">
      <filter id="achilltest-sim">
        <feColorMatrix type="matrix" values="
          0.95  0.05  0     0 0
          0     0.433 0.567 0 0
          0     0.475 0.525 0 0
          0     0     0     1 0
        "/>
      </filter>
    </svg>
  `,
  achromatopsia: `
    <svg xmlns="http://www.w3.org/2000/svg">
      <filter id="achilltest-sim">
        <feColorMatrix type="matrix" values="
          0.299 0.587 0.114 0 0
          0.299 0.587 0.114 0 0
          0.299 0.587 0.114 0 0
          0     0     0     1 0
        "/>
      </filter>
    </svg>
  `,
}

const SIMULATION_LABELS = {
  protanopia:    'Protanopia (no distingue rojos)',
  deuteranopia:  'Deuteranopia (no distingue verdes)',
  tritanopia:    'Tritanopia (no distingue azules)',
  achromatopsia: 'Achromatopsia (escala de grises)',
  low_vision:    'Visión reducida (blur)',
}

/**
 * Captura screenshots con cada simulación aplicada.
 *
 * @param {import('playwright').Page} page
 * @param {string} outputDir          Directorio donde guardar los PNGs
 * @param {string} analysisId         ID para nombrar los archivos
 * @returns {Promise<{ original, simulations: { protanopia, deuteranopia, ... } }>}
 */
export async function captureSimulations(page, outputDir, analysisId) {
  const results = {}

  // ── Screenshot original ─────────────────────────────────────────────────
  const originalPath = join(outputDir, `${analysisId}-original.png`)
  await page.screenshot({ path: originalPath, fullPage: false })
  results.original = `/screenshots/${analysisId}-original.png`

  // ── Para cada simulación de daltonismo ──────────────────────────────────
  for (const [name, svgFilter] of Object.entries(SIMULATIONS)) {
    try {
      // Inyectar el SVG filter en la página
      await page.evaluate(([svg, filterId]) => {
        // Limpiar filter previo
        document.getElementById('__achilltest_filter')?.remove()

        const container = document.createElement('div')
        container.id = '__achilltest_filter'
        container.style.cssText = 'position:fixed;left:-99999px;width:0;height:0;overflow:hidden;'
        container.innerHTML = svg
        document.body.appendChild(container)

        // Aplicar filter al body
        document.documentElement.style.filter = `url("#achilltest-sim")`
      }, [svgFilter, 'achilltest-sim'])

      // Capturar screenshot
      const path = join(outputDir, `${analysisId}-${name}.png`)
      await page.screenshot({ path, fullPage: false })
      results[name] = {
        url:   `/screenshots/${analysisId}-${name}.png`,
        label: SIMULATION_LABELS[name],
      }
    } catch (err) {
      console.warn(`[ColorblindSim] Failed for ${name}:`, err.message)
    }
  }

  // ── Simulación de visión reducida (blur via CSS) ────────────────────────
  try {
    await page.evaluate(() => {
      document.getElementById('__achilltest_filter')?.remove()
      document.documentElement.style.filter = 'blur(2px) contrast(0.8)'
    })
    const path = join(outputDir, `${analysisId}-low_vision.png`)
    await page.screenshot({ path, fullPage: false })
    results.low_vision = {
      url:   `/screenshots/${analysisId}-low_vision.png`,
      label: SIMULATION_LABELS.low_vision,
    }
  } catch (err) {
    console.warn(`[ColorblindSim] Failed for low_vision:`, err.message)
  }

  // ── Limpiar filters ──────────────────────────────────────────────────────
  await page.evaluate(() => {
    document.getElementById('__achilltest_filter')?.remove()
    document.documentElement.style.filter = ''
  })

  return results
}
