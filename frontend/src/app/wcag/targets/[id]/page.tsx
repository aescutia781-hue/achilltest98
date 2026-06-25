'use client'

import { useEffect, useState }  from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth }              from '@/hooks/useAuth'
import { api, logout }          from '@/lib/api'
import WcagScoreCard            from '@/components/WcagScoreCard'
import WcagTrendChart           from '@/components/WcagTrendChart'

interface Target {
  id:              string
  name:            string
  url:             string
  defaultLevel:    string
  defaultDevice:   string | null
  lastScore:       number | null
  lastAnalysisId:  string | null
  lastAnalyzedAt:  string | null
  recentAnalyses:  any[]
}

interface TrendData {
  target: Target
  series: any[]
}

export default function WcagTargetDetail() {
  const router = useRouter()
  const params = useParams()
  const targetId = params.id as string
  const { user, loading } = useAuth(true)

  const [target, setTarget] = useState<Target | null>(null)
  const [trend, setTrend]   = useState<TrendData | null>(null)
  const [loadingData, setLoadingData] = useState(true)
  const [reanalyzing, setReanalyzing] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user) return
    if (user.plan !== 'teammate') { router.push('/pricing'); return }
    loadAll()
  }, [user])

  async function loadAll() {
    try {
      const [tRes, trendRes] = await Promise.all([
        api.get(`/api/wcag/targets/${targetId}`),
        api.get(`/api/wcag/targets/${targetId}/trend?days=90`),
      ])
      setTarget(tRes.data)
      setTrend(trendRes.data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoadingData(false)
    }
  }

  async function reanalyze() {
    if (!target) return
    setReanalyzing(true)
    try {
      const r = await api.post('/api/wcag/analyses', {
        targetId,
        url:    target.url,
        level:  target.defaultLevel,
        deviceId: target.defaultDevice,
      })
      router.push(`/wcag/${r.data.id}`)
    } catch (err: any) {
      setError(err.message)
      setReanalyzing(false)
    }
  }

  if (loading || loadingData) return <Loading/>
  if (!user) return null
  if (!target) return <Loading text="Target no encontrado"/>

  const series = trend?.series || []
  const lastAnalysis = series[series.length - 1]
  const firstAnalysis = series[0]

  return (
    <div style={{ minHeight: '100vh', background: '#08080f', color: '#c4c4d8', fontFamily: 'Inter,system-ui,sans-serif' }}>
      <Nav user={user}/>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '2rem 1.5rem' }}>
        <a href="/wcag" style={{ color: '#7070a0', fontSize: '.8125rem', textDecoration: 'none' }}>
          ← Todos los targets
        </a>

        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          marginTop: '.5rem', marginBottom: '1.5rem',
          flexWrap: 'wrap', gap: '1rem',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{
              fontSize: '1.5rem', fontWeight: 700, color: '#f0f0fc',
              marginBottom: '.25rem',
            }}>
              🎯 {target.name}
            </h1>
            <div style={{
              fontSize: '.8125rem', color: '#c4a8ff',
              fontFamily: 'JetBrains Mono, monospace',
              wordBreak: 'break-all', marginBottom: '.5rem',
            }}>
              {target.url}
            </div>
            <div style={{ display: 'flex', gap: '.5rem', fontSize: '.7rem' }}>
              <span style={chipStyle}>Nivel {target.defaultLevel}</span>
              {target.defaultDevice && <span style={chipStyle}>{target.defaultDevice}</span>}
              {target.lastAnalyzedAt && (
                <span style={chipStyle}>
                  Último: {new Date(target.lastAnalyzedAt).toLocaleDateString('es-MX')}
                </span>
              )}
            </div>
          </div>
          <button onClick={reanalyze} disabled={reanalyzing} style={{
            ...btnPrimaryStyle,
            opacity: reanalyzing ? .6 : 1,
            cursor: reanalyzing ? 'not-allowed' : 'pointer',
          }}>
            {reanalyzing ? 'Iniciando...' : '▶ Re-analizar ahora'}
          </button>
        </div>

        {error && (
          <div style={{
            background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)',
            borderRadius: 8, padding: '.625rem .75rem', fontSize: '.8125rem',
            color: '#f87171', marginBottom: '1rem',
          }}>{error}</div>
        )}

        {/* Score actual + comparación */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: target.lastScore !== null ? '280px 1fr' : '1fr',
          gap: '1rem', marginBottom: '1.5rem',
        }}>
          {target.lastScore !== null && (
            <div style={{
              background: '#0e0e1a', border: '1px solid rgba(255,255,255,.07)',
              borderRadius: 14, padding: '1.5rem',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center',
            }}>
              <div style={{ fontSize: '.7rem', color: '#7070a0', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '.5rem' }}>
                Score actual
              </div>
              <WcagScoreCard score={target.lastScore} size="md"/>
              {series.length >= 2 && (
                <div style={{
                  marginTop: '.75rem',
                  fontSize: '.8125rem',
                  color: (lastAnalysis.score - firstAnalysis.score) >= 0 ? '#22c55e' : '#f87171',
                  fontWeight: 600,
                }}>
                  {(lastAnalysis.score - firstAnalysis.score) >= 0 ? '↑ +' : '↓ '}
                  {Math.abs(lastAnalysis.score - firstAnalysis.score)} vs hace {series.length} análisis
                </div>
              )}
            </div>
          )}

          {/* Trend chart */}
          <div>
            {series.length > 0 ? (
              <WcagTrendChart
                series={series}
                onPointClick={(p: any) => router.push(`/wcag/${p.id}`)}
              />
            ) : (
              <div style={{
                background: '#0e0e1a', border: '1px dashed rgba(255,255,255,.1)',
                borderRadius: 14, padding: '3rem 2rem', textAlign: 'center',
                color: '#7070a0', fontSize: '.875rem',
              }}>
                Aún no hay análisis para este target.
                <br/>Ejecuta el primero para empezar a ver tendencias.
              </div>
            )}
          </div>
        </div>

        {/* Lista de análisis recientes */}
        <div>
          <h3 style={{
            fontSize: '1rem', fontWeight: 600, color: '#f0f0fc',
            marginBottom: '.75rem',
          }}>
            📊 Histórico de análisis ({target.recentAnalyses?.length || 0})
          </h3>
          {(!target.recentAnalyses || target.recentAnalyses.length === 0) ? (
            <div style={{
              padding: '2rem', textAlign: 'center', color: '#7070a0',
              fontSize: '.875rem', background: '#0e0e1a',
              border: '1px dashed rgba(255,255,255,.07)', borderRadius: 10,
            }}>
              No hay análisis aún. Ejecuta el primero arriba.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '.625rem' }}>
              {target.recentAnalyses.map((a: any) => (
                <div key={a.id}
                  onClick={() => router.push(`/wcag/${a.id}`)}
                  style={{
                    background: '#0e0e1a', border: '1px solid rgba(255,255,255,.07)',
                    borderRadius: 10, padding: '.75rem 1rem',
                    display: 'flex', alignItems: 'center', gap: '1rem',
                    cursor: 'pointer', transition: 'border-color .15s',
                  }}
                  onMouseEnter={(e: any) => e.currentTarget.style.borderColor = 'rgba(124,92,191,.3)'}
                  onMouseLeave={(e: any) => e.currentTarget.style.borderColor = 'rgba(255,255,255,.07)'}
                >
                  {a.status === 'completed' && a.score !== null ? (
                    <WcagScoreCard score={a.score} size="sm" showLabel={false}/>
                  ) : (
                    <div style={{
                      width: 80, height: 80, borderRadius: '50%',
                      background: '#141422', border: '2px solid rgba(255,255,255,.05)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#7070a0', fontSize: '.7rem',
                    }}>{a.status}</div>
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '.8125rem', color: '#f0f0fc', fontWeight: 500, marginBottom: '.25rem' }}>
                      {a.name || `Análisis ${a.level}`}
                    </div>
                    <div style={{ fontSize: '.7rem', color: '#7070a0' }}>
                      {new Date(a.createdAt).toLocaleString('es-MX')}
                      {a.totalIssues !== undefined && ` · ${a.totalIssues} issues`}
                      {a.durationMs && ` · ${(a.durationMs/1000).toFixed(1)}s`}
                    </div>
                  </div>
                  <span style={{ color: '#7070a0', fontSize: '1.125rem' }}>→</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Nav({ user }: any) {
  return (
    <nav style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '1rem 2rem', borderBottom: '1px solid rgba(255,255,255,.07)', background: '#0e0e1a',
    }}>
      <a href="/wcag" style={{ color: '#c4a8ff', textDecoration: 'none', fontSize: '.875rem' }}>← WCAG</a>
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <span style={{ fontSize: '.8125rem', color: '#7070a0' }}>
          {user.email} · <strong style={{ color: '#c4a8ff' }}>{user.plan}</strong>
        </span>
        <button onClick={logout} style={{
          background: 'transparent', border: '1px solid rgba(255,255,255,.1)',
          color: '#7070a0', borderRadius: 8,
          padding: '.375rem .875rem', fontSize: '.75rem', cursor: 'pointer',
        }}>Salir</button>
      </div>
    </nav>
  )
}

function Loading({ text }: { text?: string } = {}) {
  return <div style={{ minHeight: '100vh', background: '#08080f', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7070a0' }}>{text || 'Cargando...'}</div>
}

const chipStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,.04)', color: '#7070a0',
  padding: '.125rem .5rem', borderRadius: 4,
  fontSize: '.65rem', fontWeight: 600,
}
const btnPrimaryStyle: React.CSSProperties = {
  background: '#7c5cbf', color: '#fff', border: 'none', borderRadius: 8,
  padding: '.5rem 1rem', fontSize: '.875rem', fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit',
  boxShadow: '0 4px 20px rgba(124,92,191,.4)',
}
