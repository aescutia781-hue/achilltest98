'use client'

import { useEffect, useState }  from 'react'
import { useRouter }            from 'next/navigation'
import { useAuth }              from '@/hooks/useAuth'
import { api, logout }          from '@/lib/api'
import WcagScoreCard, { gradeFor } from '@/components/WcagScoreCard'

interface Analysis {
  id:            string
  targetId:      string | null
  url:           string
  name:          string | null
  level:         string
  deviceId:      string | null
  status:        string
  score:         number | null
  totalIssues:   number
  criticalCount: number
  highCount:     number
  durationMs:    number | null
  createdAt:     string
  completedAt:   string | null
}

interface Target {
  id:              string
  name:            string
  url:             string
  defaultLevel:    string
  lastScore:       number | null
  lastAnalysisId:  string | null
  lastAnalyzedAt:  string | null
}

type View = 'analyses' | 'targets'

export default function WcagPage() {
  const router = useRouter()
  const { user, loading } = useAuth(true)
  const [view, setView] = useState<View>('analyses')
  const [analyses, setAnalyses] = useState<Analysis[]>([])
  const [targets, setTargets]   = useState<Target[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [showNewTarget, setShowNewTarget] = useState(false)

  useEffect(() => {
    if (!user) return
    if (user.plan !== 'teammate') {
      router.push('/pricing'); return
    }
    loadAll()
  }, [user])

  // Auto-refresh para ver runs en progreso
  useEffect(() => {
    const t = setInterval(() => {
      if (analyses.some(a => a.status === 'pending' || a.status === 'running')) {
        loadAnalyses()
      }
    }, 3000)
    return () => clearInterval(t)
  }, [analyses])

  async function loadAll() {
    await Promise.all([loadAnalyses(), loadTargets()])
    setLoadingData(false)
  }

  async function loadAnalyses() {
    try {
      const r = await api.get('/api/wcag/analyses?limit=50')
      setAnalyses(r.data || [])
    } catch {}
  }

  async function loadTargets() {
    try {
      const r = await api.get('/api/wcag/targets')
      setTargets(r.data || [])
    } catch {}
  }

  async function deleteAnalysis(id: string, url: string) {
    if (!confirm(`¿Eliminar el análisis de ${url}?`)) return
    try {
      await api.delete(`/api/wcag/analyses/${id}`)
      loadAnalyses()
    } catch (err: any) {
      alert(err.message)
    }
  }

  async function deleteTarget(id: string, name: string) {
    if (!confirm(`¿Eliminar el target "${name}"? Sus análisis quedarán como ad-hoc.`)) return
    try {
      await api.delete(`/api/wcag/targets/${id}`)
      loadTargets()
    } catch (err: any) {
      alert(err.message)
    }
  }

  if (loading || loadingData) return <Loading/>
  if (!user || user.plan !== 'teammate') return null

  return (
    <div style={{ minHeight:'100vh', background:'#08080f', color:'#c4c4d8', fontFamily:'Inter,system-ui,sans-serif' }}>
      <Nav user={user}/>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '2rem 1.5rem' }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem',
        }}>
          <div>
            <h1 style={{
              fontSize: '1.625rem', fontWeight: 700, color: '#f0f0fc',
              marginBottom: '.25rem',
            }}>
              ♿ Accesibilidad WCAG
            </h1>
            <p style={{ color: '#7070a0', fontSize: '.9375rem' }}>
              Detecta problemas de accesibilidad y mejora la experiencia para todos
            </p>
          </div>
          <div style={{ display: 'flex', gap: '.5rem' }}>
            <button onClick={() => setShowNewTarget(true)} style={btnSecondaryStyle}>
              + Nuevo target
            </button>
            <button onClick={() => router.push('/wcag/new')} style={btnPrimaryStyle}>
              + Nuevo análisis
            </button>
          </div>
        </div>

        {/* Toggle */}
        <div style={{
          display: 'inline-flex', gap: '.25rem', marginBottom: '1.5rem',
          background: '#0e0e1a', padding: '.25rem', borderRadius: 10,
          border: '1px solid rgba(255,255,255,.05)',
        }}>
          <ToggleBtn current={view} value="analyses"
            label={`📊 Análisis recientes (${analyses.length})`}
            onClick={() => setView('analyses')}/>
          <ToggleBtn current={view} value="targets"
            label={`🎯 Sitios trackeados (${targets.length})`}
            onClick={() => setView('targets')}/>
        </div>

        {view === 'analyses' && (
          <AnalysesView analyses={analyses} onDelete={deleteAnalysis} onCreate={() => router.push('/wcag/new')}/>
        )}

        {view === 'targets' && (
          <TargetsView targets={targets} onDelete={deleteTarget} onCreate={() => setShowNewTarget(true)} router={router}/>
        )}
      </div>

      {showNewTarget && (
        <NewTargetModal onClose={() => setShowNewTarget(false)} onSaved={() => { setShowNewTarget(false); loadTargets() }}/>
      )}
    </div>
  )
}

// ── Vista: análisis ─────────────────────────────────────────────────────────

function AnalysesView({ analyses, onDelete, onCreate }: any) {
  const router = useRouter()
  if (analyses.length === 0) {
    return (
      <EmptyState
        icon="♿"
        title="Tu primer análisis WCAG"
        desc={<>Ingresa una URL y Achilltest detectará problemas de accesibilidad<br/>
          en menos de 30 segundos.</>}
        cta="Iniciar análisis"
        onCta={onCreate}
      />
    )
  }
  return (
    <div style={{ display: 'grid', gap: '.75rem' }}>
      {analyses.map(a => (
        <div key={a.id} style={cardStyle}
          onClick={() => router.push(`/wcag/${a.id}`)}
          onMouseEnter={(e: any) => e.currentTarget.style.borderColor = 'rgba(124,92,191,.3)'}
          onMouseLeave={(e: any) => e.currentTarget.style.borderColor = 'rgba(255,255,255,.07)'}
        >
          <div style={{
            display: 'flex', gap: '1rem', alignItems: 'center', padding: '1rem 1.25rem',
          }}>
            {/* Score */}
            <div style={{ flexShrink: 0 }}>
              {a.status === 'completed' && a.score !== null ? (
                <WcagScoreCard score={a.score} size="sm" showLabel={false}/>
              ) : (
                <StatusBadge status={a.status}/>
              )}
            </div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ marginBottom: '.25rem' }}>
                <span style={{
                  fontSize: '.9375rem', fontWeight: 600, color: '#f0f0fc',
                }}>{a.name || a.url}</span>
              </div>
              <div style={{
                fontSize: '.75rem', color: '#7070a0',
                fontFamily: 'JetBrains Mono, monospace',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                marginBottom: '.375rem',
              }}>
                {a.url}
              </div>
              <div style={{
                display: 'flex', gap: '.5rem', fontSize: '.7rem',
                color: '#7070a0', flexWrap: 'wrap',
              }}>
                <span style={chipStyle}>WCAG {a.level}</span>
                {a.deviceId && <span style={chipStyle}>{a.deviceId}</span>}
                {a.status === 'completed' && (
                  <>
                    {a.criticalCount > 0 && (
                      <span style={{ ...chipStyle, color: '#f87171', background: 'rgba(239,68,68,.12)' }}>
                        🔴 {a.criticalCount}
                      </span>
                    )}
                    {a.highCount > 0 && (
                      <span style={{ ...chipStyle, color: '#fb923c', background: 'rgba(249,115,22,.12)' }}>
                        🟠 {a.highCount}
                      </span>
                    )}
                    <span style={chipStyle}>{a.totalIssues} issues</span>
                  </>
                )}
                <span>{_formatRelative(a.createdAt)}</span>
              </div>
            </div>

            <button
              onClick={(e: any) => { e.stopPropagation(); onDelete(a.id, a.url) }}
              style={{
                background: 'transparent', border: '1px solid rgba(239,68,68,.2)',
                color: '#f87171', borderRadius: 6,
                padding: '.3125rem .625rem', fontSize: '.7rem',
                cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
              }}
            >Eliminar</button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Vista: targets ──────────────────────────────────────────────────────────

function TargetsView({ targets, onDelete, onCreate, router }: any) {
  if (targets.length === 0) {
    return (
      <EmptyState
        icon="🎯"
        title="Crea tu primer target"
        desc={<>Un target es un sitio que quieres analizar periódicamente.<br/>
          Achilltest guardará el histórico y te avisará de regresiones.</>}
        cta="Crear target"
        onCta={onCreate}
      />
    )
  }
  return (
    <div style={{ display: 'grid', gap: '.75rem' }}>
      {targets.map((t: Target) => (
        <div key={t.id} style={cardStyle}
          onClick={() => router.push(`/wcag/targets/${t.id}`)}
          onMouseEnter={(e: any) => e.currentTarget.style.borderColor = 'rgba(124,92,191,.3)'}
          onMouseLeave={(e: any) => e.currentTarget.style.borderColor = 'rgba(255,255,255,.07)'}
        >
          <div style={{
            display: 'flex', gap: '1rem', alignItems: 'center', padding: '1rem 1.25rem',
          }}>
            <div style={{ flexShrink: 0 }}>
              {t.lastScore !== null ? (
                <WcagScoreCard score={t.lastScore} size="sm" showLabel={false}/>
              ) : (
                <div style={{
                  width: 80, height: 80, borderRadius: '50%',
                  background: '#141422', border: '2px dashed rgba(255,255,255,.1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#7070a0', fontSize: '.7rem',
                }}>Sin analizar</div>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: '.9375rem', fontWeight: 600, color: '#f0f0fc',
                marginBottom: '.25rem',
              }}>{t.name}</div>
              <div style={{
                fontSize: '.75rem', color: '#7070a0',
                fontFamily: 'JetBrains Mono, monospace',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                marginBottom: '.375rem',
              }}>{t.url}</div>
              <div style={{ display: 'flex', gap: '.5rem', fontSize: '.7rem' }}>
                <span style={chipStyle}>Nivel {t.defaultLevel}</span>
                {t.lastAnalyzedAt && (
                  <span style={{ color: '#7070a0' }}>
                    Último: {_formatRelative(t.lastAnalyzedAt)}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={(e: any) => { e.stopPropagation(); onDelete(t.id, t.name) }}
              style={{
                background: 'transparent', border: '1px solid rgba(239,68,68,.2)',
                color: '#f87171', borderRadius: 6,
                padding: '.3125rem .625rem', fontSize: '.7rem',
                cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
              }}
            >Eliminar</button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Modal nuevo target ──────────────────────────────────────────────────────

function NewTargetModal({ onClose, onSaved }: any) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [level, setLevel] = useState('AA')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setError('')
    if (!name.trim()) { setError('Nombre requerido'); return }
    if (!url.trim()) { setError('URL requerida'); return }
    setSaving(true)
    try {
      await api.post('/api/wcag/targets', {
        name: name.trim(),
        url: url.trim(),
        defaultLevel: level,
      })
      onSaved()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100, padding: '1rem',
    }} onClick={onClose}>
      <div style={{
        background: '#0e0e1a', border: '1px solid rgba(255,255,255,.1)',
        borderRadius: 14, padding: '1.5rem',
        width: '100%', maxWidth: 460,
      }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#f0f0fc', marginBottom: '1rem' }}>
          🎯 Nuevo target
        </h3>
        <p style={{ fontSize: '.8125rem', color: '#7070a0', marginBottom: '1rem' }}>
          Crea un target para trackear un sitio a lo largo del tiempo.
        </p>

        <Field label="Nombre">
          <input value={name} onChange={e => setName(e.target.value)}
            placeholder="Mi sitio de producción" style={inputStyle} autoFocus/>
        </Field>
        <Field label="URL">
          <input value={url} onChange={e => setUrl(e.target.value)}
            placeholder="https://misitio.com" style={inputStyle}/>
        </Field>
        <Field label="Nivel WCAG por defecto">
          <select value={level} onChange={e => setLevel(e.target.value)} style={inputStyle}>
            <option value="A">A — Mínimo</option>
            <option value="AA">AA — Estándar (recomendado)</option>
            <option value="AAA">AAA — Máximo (requiere Advance+)</option>
          </select>
        </Field>

        {error && (
          <div style={{
            background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)',
            borderRadius: 8, padding: '.5rem .75rem', fontSize: '.75rem',
            color: '#f87171', marginBottom: '.75rem',
          }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: '.5rem' }}>
          <button onClick={onClose} style={btnGhostStyle}>Cancelar</button>
          <button onClick={save} disabled={saving} style={{ ...btnPrimaryStyle, flex: 1, opacity: saving ? .6 : 1 }}>
            {saving ? 'Guardando...' : 'Crear target'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Componentes auxiliares ──────────────────────────────────────────────────

function ToggleBtn({ current, value, label, onClick }: any) {
  const active = current === value
  return (
    <button onClick={onClick} style={{
      background: active ? 'rgba(124,92,191,.18)' : 'transparent',
      border: 'none', cursor: 'pointer',
      padding: '.5rem 1rem',
      fontSize: '.8125rem', fontWeight: active ? 600 : 500,
      color: active ? '#c4a8ff' : '#7070a0',
      borderRadius: 8, fontFamily: 'inherit',
    }}>
      {label}
    </button>
  )
}

function StatusBadge({ status }: { status: string }) {
  const meta: Record<string, { bg: string; color: string; label: string; icon: string }> = {
    pending: { bg: 'rgba(255,255,255,.05)', color: '#7070a0', label: 'Pendiente', icon: '○' },
    running: { bg: 'rgba(38,181,170,.12)',  color: '#26b5aa', label: 'En curso',   icon: '⏳' },
    failed:  { bg: 'rgba(239,68,68,.12)',   color: '#f87171', label: 'Falló',     icon: '✗' },
  }
  const m = meta[status] || meta.pending
  return (
    <div style={{
      width: 80, height: 80, borderRadius: '50%',
      background: m.bg, border: `2px solid ${m.color}33`,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      color: m.color,
    }}>
      <div style={{ fontSize: '1.25rem' }}>{m.icon}</div>
      <div style={{ fontSize: '.625rem', marginTop: '.125rem' }}>{m.label}</div>
    </div>
  )
}

function EmptyState({ icon, title, desc, cta, onCta }: any) {
  return (
    <div style={{
      padding: '4rem 2rem', textAlign: 'center',
      background: '#0e0e1a', border: '1px dashed rgba(255,255,255,.1)',
      borderRadius: 14,
    }}>
      <div style={{ fontSize: '3rem', marginBottom: '.75rem' }}>{icon}</div>
      <h3 style={{ fontSize: '1.125rem', color: '#f0f0fc', marginBottom: '.5rem' }}>{title}</h3>
      <p style={{ color: '#7070a0', fontSize: '.9375rem', marginBottom: '1.5rem' }}>{desc}</p>
      <button onClick={onCta} style={btnPrimaryStyle}>{cta}</button>
    </div>
  )
}

function Field({ label, children }: any) {
  return (
    <div style={{ marginBottom: '.75rem' }}>
      <label style={{
        display: 'block', fontSize: '.7rem', color: '#7070a0',
        marginBottom: '.25rem', fontWeight: 500,
      }}>{label}</label>
      {children}
    </div>
  )
}

function Nav({ user }: any) {
  return (
    <nav style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '1rem 2rem',
      borderBottom: '1px solid rgba(255,255,255,.07)',
      background: '#0e0e1a',
    }}>
      <a href="/dashboard" style={{ color: '#c4a8ff', textDecoration: 'none', fontSize: '.875rem' }}>
        ← Dashboard
      </a>
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

function Loading() {
  return <div style={{
    minHeight: '100vh', background: '#08080f',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#7070a0',
  }}>Cargando...</div>
}

function _formatRelative(iso: string): string {
  const d = new Date(iso)
  const diffSec = (Date.now() - d.getTime()) / 1000
  if (diffSec < 60) return 'hace un momento'
  if (diffSec < 3600) return `hace ${Math.floor(diffSec / 60)} min`
  if (diffSec < 86400) return `hace ${Math.floor(diffSec / 3600)} h`
  if (diffSec < 2592000) return `hace ${Math.floor(diffSec / 86400)} d`
  return d.toLocaleDateString('es-MX')
}

const cardStyle: React.CSSProperties = {
  background: '#0e0e1a', border: '1px solid rgba(255,255,255,.07)',
  borderRadius: 12, cursor: 'pointer', transition: 'border-color .15s',
}
const inputStyle: React.CSSProperties = {
  width: '100%', background: '#141422',
  border: '1px solid rgba(255,255,255,.1)', borderRadius: 8,
  padding: '.5rem .75rem', color: '#f0f0fc',
  fontSize: '.875rem', outline: 'none', fontFamily: 'inherit',
}
const btnPrimaryStyle: React.CSSProperties = {
  background: '#7c5cbf', color: '#fff', border: 'none', borderRadius: 8,
  padding: '.5rem 1rem', fontSize: '.875rem', fontWeight: 600, cursor: 'pointer',
  fontFamily: 'inherit', boxShadow: '0 4px 20px rgba(124,92,191,.4)',
}
const btnSecondaryStyle: React.CSSProperties = {
  background: 'transparent', color: '#c4c4d8',
  border: '1px solid rgba(255,255,255,.12)', borderRadius: 8,
  padding: '.5rem 1rem', fontSize: '.875rem', fontWeight: 500, cursor: 'pointer',
  fontFamily: 'inherit',
}
const btnGhostStyle: React.CSSProperties = {
  background: 'transparent', border: '1px solid rgba(255,255,255,.1)',
  color: '#7070a0', borderRadius: 8,
  padding: '.5rem 1rem', fontSize: '.8125rem', cursor: 'pointer',
  fontFamily: 'inherit',
}
const chipStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,.04)', color: '#7070a0',
  padding: '.125rem .5rem', borderRadius: 4,
  fontSize: '.65rem', fontWeight: 600,
}
