'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, useParams }   from 'next/navigation'
import { useAuth }                from '@/hooks/useAuth'
import { api, logout }            from '@/lib/api'
import WcagScoreCard              from '@/components/WcagScoreCard'
import WcagIssuesList             from '@/components/WcagIssuesList'
import WcagSimulator              from '@/components/WcagSimulator'

interface AnalysisDetail {
  id:             string
  targetId:       string | null
  url:            string
  name:           string | null
  level:          string
  deviceId:       string | null
  status:         string
  errorMessage:   string | null
  score:          number | null
  totalIssues:    number
  criticalCount:  number
  highCount:      number
  mediumCount:    number
  lowCount:       number
  passedRules:    number
  categoryScores: Record<string, number>
  structuralResults: any
  keyboardResults:   any
  visualResults:     any
  cognitiveResults:  any
  simulations:       any
  reportHtmlUrl: string | null
  reportPdfUrl:  string | null
  reportJsonUrl: string | null
  screenshotUrl: string | null
  durationMs:    number | null
  createdAt:     string
  startedAt:     string | null
  completedAt:   string | null
  issues:        any[]
}

const CATEGORIES_META: Record<string, { label: string; icon: string }> = {
  contrast:  { label: 'Contraste y color',    icon: '🎨' },
  semantic:  { label: 'Estructura semántica', icon: '📋' },
  aria:      { label: 'ARIA y roles',         icon: '🏷️' },
  keyboard:  { label: 'Teclado',              icon: '⌨️' },
  forms:     { label: 'Formularios',          icon: '📝' },
  media:     { label: 'Imágenes / media',     icon: '🖼️' },
  language:  { label: 'Idioma',               icon: '🌐' },
  links:     { label: 'Enlaces',              icon: '🔗' },
  visual:    { label: 'Diseño visual',        icon: '👁️' },
  cognitive: { label: 'Carga cognitiva',      icon: '🧠' },
  mobile:    { label: 'Móvil',                icon: '📱' },
  other:     { label: 'Otros',                icon: '⚙️' },
}

type Tab = 'issues' | 'categories' | 'simulations' | 'reports'

export default function WcagAnalysisDetail() {
  const router = useRouter()
  const params = useParams()
  const analysisId = params.id as string
  const { user, loading } = useAuth(true)

  const [analysis, setAnalysis] = useState<AnalysisDetail | null>(null)
  const [loadingData, setLoadingData] = useState(true)
  const [tab, setTab] = useState<Tab>('issues')
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ phase: string; message: string } | null>(null)
  const [error, setError] = useState('')
  const sseAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!user) return
    loadAnalysis()
    return () => {
      sseAbortRef.current?.abort()
    }
  }, [user, analysisId])

  async function loadAnalysis() {
    try {
      const r = await api.get(`/api/wcag/analyses/${analysisId}`)
      setAnalysis(r.data)
      // Si está en progreso, conectar SSE
      if (r.data.status === 'pending' || r.data.status === 'running') {
        openStream()
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoadingData(false)
    }
  }

  async function openStream() {
    sseAbortRef.current?.abort()
    const ctrl = new AbortController()
    sseAbortRef.current = ctrl

    const token = localStorage.getItem('token')
    if (!token) return

    try {
      const res = await fetch(`/api/wcag/analyses/${analysisId}/stream`, {
        headers: { Authorization: `Bearer ${token}` },
        signal:  ctrl.signal,
      })
      if (!res.ok || !res.body) return
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const chunks = buffer.split('\n\n')
        buffer = chunks.pop() || ''
        for (const chunk of chunks) {
          const lines = chunk.split('\n')
          let event = 'message'
          let data = ''
          for (const line of lines) {
            if (line.startsWith('event: ')) event = line.slice(7).trim()
            else if (line.startsWith('data: ')) data += line.slice(6)
          }
          if (data) handleEvent(event, data)
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') console.warn(err)
    }
  }

  function handleEvent(event: string, dataStr: string) {
    let payload: any
    try { payload = JSON.parse(dataStr) } catch { return }
    switch (event) {
      case 'status':
        setProgress({ phase: payload.phase, message: payload.message })
        break
      case 'completed':
        setProgress(null)
        loadAnalysis()   // Recargar todo cuando termina
        break
      case 'error':
        setError(`El análisis falló: ${payload.message}`)
        loadAnalysis()
        break
    }
  }

  async function handleIssueStatusChange(issueId: string, status: 'resolved' | 'ignored' | 'open') {
    await api.put(`/api/wcag/issues/${issueId}/status`, { status })
    // Actualizar localmente
    setAnalysis(a => a ? {
      ...a,
      issues: a.issues.map(i => i.id === issueId ? { ...i, status } : i),
    } : a)
  }

  if (loading || loadingData) return <Loading/>
  if (!user) return null
  if (!analysis) return <Loading text="Análisis no encontrado"/>

  const isRunning = analysis.status === 'pending' || analysis.status === 'running'
  const isFailed  = analysis.status === 'failed'

  return (
    <div style={{ minHeight: '100vh', background: '#08080f', color: '#c4c4d8', fontFamily: 'Inter,system-ui,sans-serif' }}>
      <Nav user={user}/>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '2rem 1.5rem' }}>
        <a href={analysis.targetId ? `/wcag/targets/${analysis.targetId}` : '/wcag'}
          style={{ color: '#7070a0', fontSize: '.8125rem', textDecoration: 'none' }}>
          {analysis.targetId ? '← Volver al target' : '← Todos los análisis'}
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
              {analysis.name || 'Análisis WCAG'}
            </h1>
            <div style={{
              fontSize: '.8125rem', color: '#c4a8ff',
              fontFamily: 'JetBrains Mono, monospace',
              wordBreak: 'break-all', marginBottom: '.5rem',
            }}>
              🌐 {analysis.url}
            </div>
            <div style={{
              display: 'flex', gap: '.5rem', flexWrap: 'wrap',
              fontSize: '.7rem',
            }}>
              <span style={chipStyle}>WCAG {analysis.level}</span>
              {analysis.deviceId && <span style={chipStyle}>{analysis.deviceId}</span>}
              {analysis.durationMs && (
                <span style={chipStyle}>{(analysis.durationMs / 1000).toFixed(1)}s</span>
              )}
              <span style={chipStyle}>{new Date(analysis.createdAt).toLocaleString('es-MX')}</span>
            </div>
          </div>
        </div>

        {/* Running state */}
        {isRunning && (
          <RunningState progress={progress}/>
        )}

        {/* Failed state */}
        {isFailed && (
          <div style={{
            background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.25)',
            borderRadius: 12, padding: '1.5rem', marginBottom: '1rem',
          }}>
            <h3 style={{ color: '#f87171', fontSize: '1rem', marginBottom: '.5rem' }}>
              ❌ El análisis falló
            </h3>
            <div style={{ fontSize: '.875rem', color: '#fca5a5', fontFamily: 'JetBrains Mono, monospace' }}>
              {analysis.errorMessage || 'Error desconocido'}
            </div>
            <button onClick={() => router.push('/wcag/new')} style={{
              ...btnPrimaryStyle, marginTop: '1rem',
            }}>
              ↻ Intentar de nuevo
            </button>
          </div>
        )}

        {error && (
          <div style={{
            background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)',
            borderRadius: 8, padding: '.625rem .75rem', fontSize: '.8125rem',
            color: '#f87171', marginBottom: '1rem',
          }}>{error}</div>
        )}

        {/* Completed state */}
        {analysis.status === 'completed' && (
          <>
            {/* Score y métricas */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
              gap: '2rem',
              marginBottom: '1.5rem',
              background: '#0e0e1a', border: '1px solid rgba(255,255,255,.07)',
              borderRadius: 14, padding: '1.5rem',
              alignItems: 'center',
            }}>
              <WcagScoreCard score={analysis.score || 0} size="lg"/>
              <div>
                <div style={{
                  fontSize: '.75rem', color: '#7070a0', fontWeight: 600,
                  textTransform: 'uppercase', letterSpacing: '.05em',
                  marginBottom: '.625rem',
                }}>
                  Resumen del análisis
                </div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(95px, 1fr))',
                  gap: '.5rem',
                }}>
                  <MetricCard label="Total" value={analysis.totalIssues}/>
                  <MetricCard label="Crítico" value={analysis.criticalCount} color="#ef4444"/>
                  <MetricCard label="Alto" value={analysis.highCount} color="#f97316"/>
                  <MetricCard label="Medio" value={analysis.mediumCount} color="#f59e0b"/>
                  <MetricCard label="Bajo" value={analysis.lowCount} color="#84cc16"/>
                  <MetricCard label="Pasadas" value={analysis.passedRules} color="#22c55e"/>
                </div>

                {analysis.screenshotUrl && (
                  <div style={{ marginTop: '1rem' }}>
                    <img
                      src={analysis.screenshotUrl}
                      alt="Screenshot del sitio"
                      style={{
                        width: '100%', maxHeight: 160, objectFit: 'cover', objectPosition: 'top',
                        borderRadius: 8, border: '1px solid rgba(255,255,255,.07)',
                      }}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Tabs */}
            <div style={{
              display: 'flex', gap: '.25rem',
              borderBottom: '1px solid rgba(255,255,255,.07)',
              marginBottom: '1.5rem',
              overflowX: 'auto',
            }}>
              <TabBtn current={tab} value="issues"      label={`🐛 Issues (${analysis.issues?.length || 0})`} onClick={() => setTab('issues')}/>
              <TabBtn current={tab} value="categories"  label="📊 Por categoría" onClick={() => setTab('categories')}/>
              {analysis.simulations?.simulations && (
                <TabBtn current={tab} value="simulations" label="👁️ Simulaciones" onClick={() => setTab('simulations')}/>
              )}
              <TabBtn current={tab} value="reports"     label="📥 Reportes" onClick={() => setTab('reports')}/>
            </div>

            {tab === 'issues' && (
              <div>
                {categoryFilter && (
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: 'rgba(124,92,191,.08)', padding: '.5rem 1rem',
                    borderRadius: 8, marginBottom: '.75rem',
                    fontSize: '.8125rem', color: '#c4a8ff',
                  }}>
                    Filtrando por: <strong>{CATEGORIES_META[categoryFilter]?.label || categoryFilter}</strong>
                    <button onClick={() => setCategoryFilter(null)} style={{
                      background: 'none', border: 'none', color: '#c4a8ff',
                      cursor: 'pointer', fontSize: '.875rem',
                    }}>✕</button>
                  </div>
                )}
                <WcagIssuesList
                  issues={analysis.issues || []}
                  filterCategory={categoryFilter}
                  onStatusChange={handleIssueStatusChange}
                />
              </div>
            )}

            {tab === 'categories' && (
              <CategoriesView
                categoryScores={analysis.categoryScores}
                issues={analysis.issues || []}
                onSelectCategory={(cat) => { setCategoryFilter(cat); setTab('issues') }}
              />
            )}

            {tab === 'simulations' && (
              <WcagSimulator
                original={analysis.screenshotUrl || undefined}
                simulations={analysis.simulations?.simulations}
              />
            )}

            {tab === 'reports' && (
              <ReportsTab analysis={analysis}/>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Estado en ejecución con SSE ──

function RunningState({ progress }: { progress: { phase: string; message: string } | null }) {
  const phases = [
    { key: 'starting',     label: 'Iniciando' },
    { key: 'launching',    label: 'Abriendo navegador' },
    { key: 'navigating',   label: 'Cargando URL' },
    { key: 'axe',          label: 'Reglas axe-core' },
    { key: 'structural',   label: 'Estructura HTML' },
    { key: 'keyboard',     label: 'Teclado' },
    { key: 'visual',       label: 'Diseño visual' },
    { key: 'cognitive',    label: 'Carga cognitiva' },
    { key: 'simulations',  label: 'Simulaciones' },
    { key: 'processing',   label: 'Procesando' },
    { key: 'translating',  label: 'Traduciendo' },
    { key: 'reports',      label: 'Generando reportes' },
  ]

  const currentIdx = phases.findIndex(p => p.key === progress?.phase)
  const progressPct = currentIdx >= 0 ? ((currentIdx + 1) / phases.length) * 100 : 5

  return (
    <div style={{
      background: '#0e0e1a', border: '1px solid rgba(255,255,255,.07)',
      borderRadius: 14, padding: '2rem', marginBottom: '1rem',
      textAlign: 'center',
    }}>
      <div style={{
        width: 64, height: 64, margin: '0 auto 1rem',
        border: '4px solid rgba(124,92,191,.2)',
        borderTopColor: '#7c5cbf',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
      }}/>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      <h3 style={{ fontSize: '1.125rem', color: '#f0f0fc', marginBottom: '.25rem' }}>
        {progress?.message || 'Analizando...'}
      </h3>
      <div style={{ fontSize: '.8125rem', color: '#7070a0', marginBottom: '1.25rem' }}>
        Esto suele tardar 15-30 segundos
      </div>

      {/* Progress bar */}
      <div style={{
        height: 6, background: '#141422', borderRadius: 3,
        overflow: 'hidden', marginBottom: '1rem',
      }}>
        <div style={{
          height: '100%',
          width: `${progressPct}%`,
          background: 'linear-gradient(90deg, #7c5cbf, #c4a8ff)',
          transition: 'width .5s ease',
        }}/>
      </div>

      {/* Phases */}
      <div style={{
        display: 'flex', gap: '.25rem',
        justifyContent: 'center', flexWrap: 'wrap',
      }}>
        {phases.map((p, i) => {
          const isDone = i < currentIdx
          const isCurrent = i === currentIdx
          return (
            <span key={p.key} style={{
              fontSize: '.6875rem',
              padding: '.25rem .5rem', borderRadius: 4,
              background: isCurrent ? 'rgba(124,92,191,.2)' : isDone ? 'rgba(34,197,94,.1)' : 'rgba(255,255,255,.03)',
              color: isCurrent ? '#c4a8ff' : isDone ? '#22c55e' : '#5a5a7a',
              fontWeight: isCurrent ? 600 : 500,
            }}>
              {isDone ? '✓' : isCurrent ? '⋯' : '○'} {p.label}
            </span>
          )
        })}
      </div>
    </div>
  )
}

// ── Categorías ──

function CategoriesView({ categoryScores, issues, onSelectCategory }: any) {
  const cats = Object.entries(categoryScores || {}) as [string, number][]
  if (cats.length === 0) {
    return <div style={emptyStyle}>No hay datos por categoría.</div>
  }

  const issueCountByCategory: Record<string, number> = {}
  for (const i of issues) {
    issueCountByCategory[i.category] = (issueCountByCategory[i.category] || 0) + 1
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
      gap: '.75rem',
    }}>
      {cats.map(([cat, score]) => {
        const meta = CATEGORIES_META[cat] || CATEGORIES_META.other
        const issueCount = issueCountByCategory[cat] || 0
        const color = score >= 85 ? '#22c55e' : score >= 70 ? '#f59e0b' : '#ef4444'
        return (
          <div
            key={cat}
            onClick={() => onSelectCategory(cat)}
            style={{
              background: '#0e0e1a', border: '1px solid rgba(255,255,255,.07)',
              borderRadius: 12, padding: '1rem',
              cursor: 'pointer', transition: 'border-color .15s',
            }}
            onMouseEnter={(e: any) => e.currentTarget.style.borderColor = 'rgba(124,92,191,.3)'}
            onMouseLeave={(e: any) => e.currentTarget.style.borderColor = 'rgba(255,255,255,.07)'}
          >
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: '.5rem',
            }}>
              <div style={{ fontSize: '.875rem', color: '#c4c4d8', fontWeight: 500 }}>
                {meta.icon} {meta.label}
              </div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color }}>
                {score}
              </div>
            </div>
            <div style={{
              height: 4, background: '#141422', borderRadius: 2,
              overflow: 'hidden',
            }}>
              <div style={{ width: `${score}%`, height: '100%', background: color }}/>
            </div>
            <div style={{ fontSize: '.7rem', color: '#7070a0', marginTop: '.5rem' }}>
              {issueCount} {issueCount === 1 ? 'issue' : 'issues'}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Reportes ──

function ReportsTab({ analysis }: { analysis: AnalysisDetail }) {
  return (
    <div style={{
      background: '#0e0e1a', border: '1px solid rgba(255,255,255,.07)',
      borderRadius: 14, padding: '1.5rem',
    }}>
      <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#f0f0fc', marginBottom: '1rem' }}>
        📥 Descargar reportes
      </h3>

      <div style={{ display: 'grid', gap: '.625rem' }}>
        {analysis.reportHtmlUrl && (
          <ReportRow
            icon="🌐"
            title="Reporte HTML interactivo"
            desc="Dashboard completo con métricas, issues, simulaciones — para abrir en el navegador"
            url={analysis.reportHtmlUrl}
            target="_blank"
          />
        )}
        {analysis.reportPdfUrl && (
          <ReportRow
            icon="📄"
            title="Reporte PDF"
            desc="Versión imprimible — ideal para compartir con stakeholders"
            url={analysis.reportPdfUrl}
            download="reporte-wcag.pdf"
          />
        )}
        {analysis.reportJsonUrl && (
          <ReportRow
            icon="🧾"
            title="Reporte JSON"
            desc="Datos estructurados — para integrar con CI/CD u otras herramientas"
            url={analysis.reportJsonUrl}
            download="reporte-wcag.json"
          />
        )}
      </div>
    </div>
  )
}

function ReportRow({ icon, title, desc, url, target, download }: any) {
  return (
    <a
      href={url}
      target={target}
      download={download}
      style={{
        display: 'flex', alignItems: 'center', gap: '.875rem',
        padding: '.875rem 1rem',
        background: '#141422',
        border: '1px solid rgba(255,255,255,.04)',
        borderRadius: 10,
        textDecoration: 'none', color: 'inherit',
        transition: 'border-color .15s',
      }}
      onMouseEnter={(e: any) => e.currentTarget.style.borderColor = 'rgba(124,92,191,.3)'}
      onMouseLeave={(e: any) => e.currentTarget.style.borderColor = 'rgba(255,255,255,.04)'}
    >
      <div style={{ fontSize: '1.75rem' }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '.9375rem', color: '#f0f0fc', fontWeight: 600, marginBottom: '.125rem' }}>
          {title}
        </div>
        <div style={{ fontSize: '.75rem', color: '#7070a0' }}>{desc}</div>
      </div>
      <span style={{ color: '#c4a8ff', fontSize: '1.125rem' }}>→</span>
    </a>
  )
}

// ── Componentes auxiliares ──

function TabBtn({ current, value, label, onClick }: any) {
  const active = current === value
  return (
    <button onClick={onClick} style={{
      background: 'transparent', border: 'none', cursor: 'pointer',
      padding: '.625rem 1rem',
      fontFamily: 'inherit', fontSize: '.8125rem',
      color: active ? '#c4a8ff' : '#7070a0',
      borderBottom: `2px solid ${active ? '#7c5cbf' : 'transparent'}`,
      whiteSpace: 'nowrap',
      fontWeight: active ? 600 : 400, marginBottom: -1,
    }}>{label}</button>
  )
}

function MetricCard({ label, value, color = '#f0f0fc' }: any) {
  return (
    <div style={{
      background: '#141422',
      border: '1px solid rgba(255,255,255,.04)',
      borderRadius: 8, padding: '.625rem',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: '1.25rem', fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: '.625rem', color: '#7070a0', marginTop: '.25rem', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>
        {label}
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
const emptyStyle: React.CSSProperties = {
  padding: '3rem 2rem', textAlign: 'center', color: '#5a5a7a', fontSize: '.875rem',
  background: '#0e0e1a', border: '1px dashed rgba(255,255,255,.07)', borderRadius: 10,
}
const btnPrimaryStyle: React.CSSProperties = {
  background: '#7c5cbf', color: '#fff', border: 'none', borderRadius: 8,
  padding: '.5rem 1rem', fontSize: '.875rem', fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit',
}
