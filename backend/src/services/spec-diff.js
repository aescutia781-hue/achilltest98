/**
 * Spec Diff Helper
 *
 * Genera un diff línea-por-línea para mostrar al user en la UI.
 * Es un algoritmo simple tipo Myers (LCS) — suficiente para specs
 * cortos (típicamente 20-100 líneas).
 *
 * Output formato:
 *   [
 *     { kind: 'context',  oldLine: 1,  newLine: 1,  text: 'import...' },
 *     { kind: 'context',  oldLine: 2,  newLine: 2,  text: 'test(...' },
 *     { kind: 'removed',  oldLine: 3,  newLine: null, text: "await page.click('#old')" },
 *     { kind: 'added',    oldLine: null, newLine: 3, text: "await page.click('[data-testid=\"new\"]')" },
 *   ]
 */

/**
 * Genera líneas de diff entre original y proposed.
 *
 * @param {string} original
 * @param {string} proposed
 * @returns {Array<{ kind, oldLine, newLine, text }>}
 */
export function computeDiff(original, proposed) {
  const a = (original || '').split('\n')
  const b = (proposed || '').split('\n')

  // LCS table (m+1 × n+1)
  const m = a.length
  const n = b.length
  const lcs = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        lcs[i][j] = lcs[i - 1][j - 1] + 1
      } else {
        lcs[i][j] = Math.max(lcs[i - 1][j], lcs[i][j - 1])
      }
    }
  }

  // Backtrack para construir el diff
  const out = []
  let i = m, j = n
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      out.unshift({ kind: 'context', oldLine: i, newLine: j, text: a[i - 1] })
      i--; j--
    } else if (lcs[i - 1][j] >= lcs[i][j - 1]) {
      out.unshift({ kind: 'removed', oldLine: i, newLine: null, text: a[i - 1] })
      i--
    } else {
      out.unshift({ kind: 'added', oldLine: null, newLine: j, text: b[j - 1] })
      j--
    }
  }
  while (i > 0) {
    out.unshift({ kind: 'removed', oldLine: i, newLine: null, text: a[i - 1] })
    i--
  }
  while (j > 0) {
    out.unshift({ kind: 'added', oldLine: null, newLine: j, text: b[j - 1] })
    j--
  }

  return out
}

/**
 * Stats simples del diff: cuántas líneas added/removed.
 */
export function diffStats(diffLines) {
  let added = 0, removed = 0
  for (const line of diffLines) {
    if (line.kind === 'added')   added++
    if (line.kind === 'removed') removed++
  }
  return { added, removed, total: added + removed }
}
