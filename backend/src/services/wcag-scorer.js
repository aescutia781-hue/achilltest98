/**
 * WCAG Scorer
 *
 * Calcula el score final 0-100 y scores por categoría.
 *
 * Fórmula:
 *   Empieza en 100, descuenta puntos por cada issue según severity:
 *     critical: -8
 *     high:     -4
 *     medium:   -2
 *     low:      -0.5
 *
 *   Bonificación: +1 punto por cada regla pasada (capped a 10 puntos).
 *
 *   Score mínimo: 0, máximo 100.
 *
 * Scores por categoría: igual pero solo issues de esa categoría.
 *
 * El score es solo una guía. El reporte detallado importa más, pero
 * tener un número simple ayuda a tracking y motivación.
 */

const PENALTIES = {
  critical: 8,
  high:     4,
  medium:   2,
  low:      0.5,
}

const CATEGORIES = ['contrast', 'semantic', 'aria', 'keyboard', 'forms', 'media',
                    'language', 'links', 'visual', 'cognitive', 'mobile', 'other']

/**
 * Calcula el score general y los scores por categoría.
 *
 * @param {Array} issues       Lista de issues con .severity y .category
 * @param {number} passedRules Reglas que pasaron (axe.passes.length)
 *
 * @returns {{ score, byCategory, byseverity }}
 */
export function calculateScores(issues, passedRules = 0) {
  // Score general
  let penalty = 0
  for (const issue of issues) {
    penalty += PENALTIES[issue.severity] || 1
  }

  const bonus = Math.min(10, passedRules * 0.1)
  const score = Math.max(0, Math.min(100, Math.round(100 - penalty + bonus)))

  // Score por categoría
  const byCategory = {}
  for (const cat of CATEGORIES) {
    const catIssues = issues.filter(i => i.category === cat)
    const catPenalty = catIssues.reduce((sum, i) => sum + (PENALTIES[i.severity] || 1), 0)
    // Si no hay issues en esta cat, score es 100
    byCategory[cat] = Math.max(0, Math.min(100, Math.round(100 - catPenalty)))
  }

  // Counts por severity
  const bySeverity = {
    critical: issues.filter(i => i.severity === 'critical').length,
    high:     issues.filter(i => i.severity === 'high').length,
    medium:   issues.filter(i => i.severity === 'medium').length,
    low:      issues.filter(i => i.severity === 'low').length,
  }

  return { score, byCategory, bySeverity }
}

/**
 * Determina la "calificación" del score (A+/A/B/C/D/F estilo).
 */
export function scoreGrade(score) {
  if (score >= 95) return { grade: 'A+', label: 'Excelente',     color: '#22c55e' }
  if (score >= 85) return { grade: 'A',  label: 'Muy bueno',     color: '#22c55e' }
  if (score >= 75) return { grade: 'B',  label: 'Bueno',         color: '#84cc16' }
  if (score >= 65) return { grade: 'C',  label: 'Aceptable',     color: '#f59e0b' }
  if (score >= 50) return { grade: 'D',  label: 'Necesita trabajo', color: '#f97316' }
  return                  { grade: 'F',  label: 'Crítico',       color: '#ef4444' }
}
