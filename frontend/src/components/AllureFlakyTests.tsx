'use client'

interface FlakyTest {
  id:           string
  testFullName: string
  testName:     string | null
  runsAnalyzed: number
  passCount:    number
  failCount:    number
  brokenCount:  number
  flakyScore:   string
  lastStatus:   string | null
  lastSeenAt:   string
}

interface Props {
  flakyTests: FlakyTest[]
}

export default function AllureFlakyTests({ flakyTests }: Props) {
  if (flakyTests.length === 0) {
    return (
      <div style={{
        padding: '2rem 1.5rem', textAlign: 'center',
        background: 'rgba(34,197,94,.08)',
        border: '1px solid rgba(34,197,94,.2)',
        borderRadius: 10,
      }}>
        <div style={{ fontSize: '2rem', marginBottom: '.25rem' }}>✨</div>
        <h3 style={{ color: '#22c55e', fontSize: '1rem', marginBottom: '.25rem' }}>
          Sin tests flaky detectados
        </h3>
        <p style={{ color: '#7070a0', fontSize: '.8125rem' }}>
          Tus tests son consistentes en los últimos runs.
        </p>
      </div>
    )
  }

  return (
    <div>
      <div style={{
        background: 'rgba(249,115,22,.06)',
        border: '1px solid rgba(249,115,22,.15)',
        borderRadius: 10, padding: '.75rem 1rem', marginBottom: '1rem',
      }}>
        <div style={{ fontSize: '.8125rem', color: '#fb923c', fontWeight: 600, marginBottom: '.25rem' }}>
          ⚠️ Tests intermitentes detectados
        </div>
        <div style={{ fontSize: '.75rem', color: '#7070a0' }}>
          Estos tests pasan a veces y fallan a veces sin cambios obvios. Suelen indicar problemas
          de timing, race conditions, o dependencias externas inestables.
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
        {flakyTests.map(t => {
          const score = parseFloat(t.flakyScore)
          const severity = score >= 0.4 ? 'critical' : score >= 0.25 ? 'high' : score >= 0.15 ? 'medium' : 'low'
          const colors: Record<string, string> = {
            critical: '#ef4444', high: '#f97316', medium: '#f59e0b', low: '#84cc16',
          }
          const passRate = t.runsAnalyzed > 0 ? Math.round((t.passCount / t.runsAnalyzed) * 100) : 0

          return (
            <div key={t.id} style={{
              background: '#0e0e1a', border: '1px solid rgba(255,255,255,.07)',
              borderRadius: 10, padding: '.875rem 1rem',
            }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                gap: '.75rem', marginBottom: '.625rem',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: '.875rem', fontWeight: 600, color: '#f0f0fc',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {t.testName || t.testFullName}
                  </div>
                  <div style={{
                    fontSize: '.7rem', color: '#7070a0',
                    fontFamily: 'JetBrains Mono, monospace', marginTop: '.125rem',
                  }}>
                    {t.testFullName}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{
                    fontSize: '1.125rem', fontWeight: 700,
                    color: colors[severity],
                  }}>
                    {(score * 100).toFixed(0)}%
                  </div>
                  <div style={{ fontSize: '.625rem', color: '#7070a0', textTransform: 'uppercase' }}>
                    Flakiness
                  </div>
                </div>
              </div>

              {/* Barra visual con cada run */}
              <div style={{ display: 'flex', gap: 2, marginBottom: '.375rem', height: 8 }}>
                {Array.from({ length: t.runsAnalyzed }).map((_, i) => {
                  // Simulación visual: distribuir pass/fail proporcionalmente
                  // (los runs reales se cargarían si quisiéramos más detalle)
                  const isPass = i < t.passCount
                  const isBroken = i >= t.passCount + t.failCount
                  return (
                    <div key={i} style={{
                      flex: 1,
                      background: isPass ? '#22c55e' : isBroken ? '#f97316' : '#ef4444',
                      borderRadius: 1,
                    }}/>
                  )
                })}
              </div>

              <div style={{
                display: 'flex', justifyContent: 'space-between',
                fontSize: '.7rem', color: '#7070a0',
              }}>
                <span>
                  <span style={{ color: '#22c55e' }}>{t.passCount}✓</span>
                  {t.failCount > 0 && <span> · <span style={{ color: '#f87171' }}>{t.failCount}✗</span></span>}
                  {t.brokenCount > 0 && <span> · <span style={{ color: '#f97316' }}>{t.brokenCount}⚠</span></span>}
                  {' '}de {t.runsAnalyzed} runs · {passRate}% pass rate
                </span>
                <span style={{ fontSize: '.65rem' }}>
                  Último: <span style={{ color: t.lastStatus === 'passed' ? '#22c55e' : '#f87171' }}>{t.lastStatus}</span>
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
