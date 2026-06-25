'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, useParams }   from 'next/navigation'
import { useAuth }                from '@/hooks/useAuth'
import { api, logout }            from '@/lib/api'

interface RunDetail {
  id:           string
  projectId:    string
  name:         string | null
  source:       string
  sourceRef:    string | null
  status:       string
  errorMessage: string | null
  totalTests:   number
  passed:       number
  failed:       number
  broken:       number
  skipped:      number
  unknown:      number
  passRate:     string | null
  durationMs:   number | null
  severityStats: Record<string, any>
  reportUrl:    string | null
  resultsZipUrl:string | null
  reportSizeKb: number | null
  shareToken:   string | null
  shareEnabled: boolean
  shareExpiresAt: string | null
  buildNumber:  string | null
  branch:       string | null
  commitSha:    string | null
  environment:  string | null
  createdAt:    string
  startedAt:    string | null
  completedAt:  string | null
  project:      { id: string; name: string } | null
  comparison:   { newFailures: any[]; newPasses: any[]; stillFailing: any[] } | null
}

export default function AllureRunDetail() {
  const router = useRouter()
  const params = useParams()
  const runId = params.id as string
  const { user, loading } = useAuth(true)

  const [run, setRun] = useState<RunDetail | null>(null)
  const [loadingData, setLoadingData] = useState(true)
  const [progress, setProgress] = useState<{ phase: string; message: string } | null>(null)
  const [error, setError] = useState('')
  const [showShareModal, setShowShareModal] = useState(false)
  const sseAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!user) return
    loadRun()
    return () => { sseAbortRef.current?.abort() }
  }, [user, runId])

  async function loadRun() {
    try {
      const r = await api.get(`/api/allure/runs/${runId}`)
      setRun(r.data)
      if (r.data.status === 'pending' || r.data.status === 'processing') {
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
      const res = await fetch(`/api/allure/runs/${runId}/stream`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: ctrl.signal,
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
          let event = 'message'; let data = ''
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
      case 'status':    setProgress({ phase: payload.phase, message: payload.message }); break
      case 'completed': setProgress(null); loadRun(); break
      case 'error':     setError(`Procesamiento falló: ${payload.message}`); loadRun(); break
    }
  }

  async function deleteRun() {
    if (!confirm('¿Eliminar este run y su reporte?')) return
    try {
      await api.delete(`/api/allure/runs/${runId}`)
      router.push(`/allure/projects/${run?.projectId}`)
    } catch (err: any) {
      alert(err.message)
    }
  }

  if (loading || loadingData) return <Loading/>
  if (!user) return null
  if (!run) return <Loading text="Run no encontrado"/>

  const isRunning = run.status === 'pending' || run.status === 'processing'
  const isFailed  = run.status === 'failed'
  const isComplete = run.status === 'completed'
  const isAdvancePlus = user.plan && user.plan !== 'teammate' && user.plan !== 'starter'

  return (
    <div style={{ minHeight: '100vh', background: '#08080f', color: '#c4c4d8', fontFamily: 'Inter,system-ui,sans-serif' }}>
      <Nav user={user}/>

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '1.5rem' }}>
        <a href={run.project ? `/allure/projects/${run.project.id}` : '/allure'}
          style={{ color: '#7070a0', fontSize: '.8125rem', textDecoration: 'none' }}>
          ← {run.project ? run.project.name : 'Allure'}
        </a>

        {/* Header */}
        <div style={{ marginTop: '.5rem', marginBottom: '1.25rem' }}>
          <h1 style={{ fontSize: '1.375rem', fontWeight: 700, color: '#f0f0fc', marginBottom: '.375rem' }}>
            {run.name || 'Allure Run'}
          </h1>
          <div style={{ display: 'flex', gap: '.375rem', flexWrap: 'wrap', fontSize: '.7rem' }}>
            <SourceBadge source={run.source}/>
            {run.environment && <span style={chipStyle}>🌍 {run.environment}</span>}
            {run.branch && <span style={chipStyle}>🌿 {run.branch}</span>}
            {run.commitSha && <span style={chipStyle}>📌 {run.commitSha.slice(0, 8)}</span>}
            {run.buildNumber && <span style={chipStyle}>#{run.buildNumber}</span>}
            <span style={chipStyle}>{new Date(run.createdAt).toLocaleString('es-MX')}</span>
            {run.durationMs && <span style={chipStyle}>{(run.durationMs / 1000).toFixed(1)}s</span>}
          </div>
        </div>

        {error && (
          <div style={{
            background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)',
            borderRadius: 8, padding: '.625rem .75rem', fontSize: '.8125rem',
            color: '#f87171', marginBottom: '1rem',
          }}>{error}</div>
        )}

        {/* Running state */}
        {isRunning && <RunningState progress={progress}/>}

        {/* Failed state */}
        {isFailed && (
          <div style={{
            background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.25)',
            borderRadius: 12, padding: '1.5rem', marginBottom: '1rem',
          }}>
            <h3 style={{ color: '#f87171', fontSize: '1rem', marginBottom: '.5rem' }}>
              ❌ Procesamiento fallido
            </h3>
            <div style={{ fontSize: '.875rem', color: '#fca5a5', fontFamily: 'JetBrains Mono, monospace' }}>
              {run.errorMessage || 'Error desconocido'}
            </div>
          </div>
        )}

        {/* Completed: layout con iframe + sidebar */}
        {isComplete && run.reportUrl && (
          <div style={{
            display: 'grid', gap: '1rem',
            gridTemplateColumns: '1fr 320px',
          }}
          className="allure-grid"
          >
            <style>{`
              @media (max-width: 1024px) {
                .allure-grid { grid-template-columns: 1fr !important; }
              }
            `}</style>

            {/* Iframe del reporte */}
            <div style={{
              background: '#fff', border: '1px solid rgba(255,255,255,.07)',
              borderRadius: 12, overflow: 'hidden',
              height: 'calc(100vh - 240px)', minHeight: 600,
            }}>
              <iframe
                src={run.reportUrl}
                style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                title="Allure Report"
              />
            </div>

            {/* Sidebar */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
              <StatsCard run={run}/>
              {run.comparison && <ComparisonCard comparison={run.comparison}/>}
              <ActionsCard
                run={run}
                isAdvancePlus={isAdvancePlus}
                onShare={() => setShowShareModal(true)}
                onDelete={deleteRun}
              />
            </div>
          </div>
        )}
      </div>

      {showShareModal && (
        <ShareModal
          run={run}
          isAdvancePlus={isAdvancePlus}
          onClose={() => setShowShareModal(false)}
          onChanged={() => { setShowShareModal(false); loadRun() }}
        />
      )}
    </div>
  )
}

// ── Running state con progreso SSE ──────────────────────────────────────────

function RunningState({ progress }: { progress: { phase: string; message: string } | null }) {
  const phases = [
    { key: 'starting',    label: 'Iniciando' },
    { key: 'history',     label: 'Cargando histórico' },
    { key: 'snapshot',    label: 'Procesando tests' },
    { key: 'generating',  label: 'Generando reporte' },
    { key: 'flaky',       label: 'Analizando flaky' },
  ]
  const currentIdx = phases.findIndex(p => p.key === progress?.phase)
  const pct = currentIdx >= 0 ? ((currentIdx + 1) / phases.length) * 100 : 5

  return (
    <div style={{
      background: '#0e0e1a', border: '1px solid rgba(255,255,255,.07)',
      borderRadius: 14, padding: '2.5rem 2rem', textAlign: 'center',
    }}>
      <div style={{
        width: 56, height: 56, margin: '0 auto 1rem',
        border: '4px solid rgba(38,181,170,.2)',
        borderTopColor: '#26b5aa',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
      }}/>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      <h3 style={{ fontSize: '1rem', color: '#f0f0fc', marginBottom: '.25rem' }}>
        {progress?.message || 'Generando reporte...'}
      </h3>
      <div style={{ fontSize: '.75rem', color: '#7070a0', marginBottom: '1.25rem' }}>
        Esto suele tardar 10-30 segundos
      </div>

      <div style={{ maxWidth: 500, margin: '0 auto' }}>
        <div style={{ height: 5, background: '#141422', borderRadius: 3, overflow: 'hidden', marginBottom: '.875rem' }}>
          <div style={{
            height: '100%', width: `${pct}%`,
            background: 'linear-gradient(90deg, #26b5aa, #a3e635)',
            transition: 'width .5s ease',
          }}/>
        </div>
        <div style={{ display: 'flex', gap: '.25rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          {phases.map((p, i) => {
            const isDone = i < currentIdx
            const isCurrent = i === currentIdx
            return (
              <span key={p.key} style={{
                fontSize: '.7rem',
                padding: '.25rem .5rem', borderRadius: 4,
                background: isCurrent ? 'rgba(38,181,170,.2)' : isDone ? 'rgba(34,197,94,.1)' : 'rgba(255,255,255,.03)',
                color: isCurrent ? '#26b5aa' : isDone ? '#22c55e' : '#5a5a7a',
                fontWeight: isCurrent ? 600 : 500,
              }}>
                {isDone ? '✓' : isCurrent ? '⋯' : '○'} {p.label}
              </span>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Sidebar cards ───────────────────────────────────────────────────────────

function StatsCard({ run }: { run: RunDetail }) {
  const passRate = parseFloat(run.passRate || '0')
  const passColor = passRate >= 90 ? '#22c55e' : passRate >= 70 ? '#f59e0b' : '#ef4444'

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '.75rem' }}>
        <div style={{ position: 'relative', width: 96, height: 96 }}>
          <svg width={96} height={96} style={{ transform: 'rotate(-90deg)' }}>
            <circle cx={48} cy={48} r={40} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth={8}/>
            <circle cx={48} cy={48} r={40} fill="none" stroke={passColor} strokeWidth={8}
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 40}`}
              strokeDashoffset={`${2 * Math.PI * 40 * (1 - passRate / 100)}`}
              style={{ transition: 'stroke-dashoffset 1s' }}/>
          </svg>
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{ fontSize: '1.375rem', fontWeight: 700, color: passColor, lineHeight: 1 }}>
              {passRate.toFixed(1)}%
            </div>
            <div style={{ fontSize: '.625rem', color: '#7070a0', marginTop: '.125rem' }}>
              Pass rate
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '.375rem' }}>
        <MiniStat value={run.passed} label="Pass" color="#22c55e"/>
        <MiniStat value={run.failed} label="Fail" color="#ef4444"/>
        <MiniStat value={run.broken} label="Broken" color="#f97316"/>
        <MiniStat value={run.skipped} label="Skip" color="#7070a0"/>
        <MiniStat value={run.unknown} label="Unknown" color="#a78bfa"/>
        <MiniStat value={run.totalTests} label="Total" color="#26b5aa"/>
      </div>
    </div>
  )
}

function MiniStat({ value, label, color }: any) {
  return (
    <div style={{
      background: '#141422', borderRadius: 6,
      padding: '.4375rem', textAlign: 'center',
    }}>
      <div style={{ fontSize: '1rem', fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: '.625rem', color: '#7070a0', marginTop: '.125rem', textTransform: 'uppercase' }}>{label}</div>
    </div>
  )
}

function ComparisonCard({ comparison }: { comparison: any }) {
  const total = comparison.newFailures.length + comparison.newPasses.length + comparison.stillFailing.length
  if (total === 0) {
    return (
      <div style={cardStyle}>
        <h3 style={cardSubtitleStyle}>📊 vs run anterior</h3>
        <div style={{ fontSize: '.75rem', color: '#7070a0' }}>
          Sin cambios significativos detectados
        </div>
      </div>
    )
  }
  return (
    <div style={cardStyle}>
      <h3 style={cardSubtitleStyle}>📊 vs run anterior</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
        {comparison.newFailures.length > 0 && (
          <CompRow color="#f87171" icon="↓" label={`${comparison.newFailures.length} nuevos fallos`} items={comparison.newFailures.slice(0, 3).map((f: any) => f.name)}/>
        )}
        {comparison.newPasses.length > 0 && (
          <CompRow color="#22c55e" icon="↑" label={`${comparison.newPasses.length} tests recuperados`} items={comparison.newPasses.slice(0, 3).map((p: any) => p.name)}/>
        )}
        {comparison.stillFailing.length > 0 && (
          <CompRow color="#7070a0" icon="≈" label={`${comparison.stillFailing.length} siguen fallando`} items={[]}/>
        )}
      </div>
    </div>
  )
}

function CompRow({ color, icon, label, items }: any) {
  return (
    <div>
      <div style={{ fontSize: '.75rem', color, fontWeight: 600, marginBottom: '.125rem' }}>
        {icon} {label}
      </div>
      {items.length > 0 && (
        <div style={{ fontSize: '.65rem', color: '#7070a0', paddingLeft: '1rem' }}>
          {items.map((name: string, i: number) => (
            <div key={i} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              · {name}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ActionsCard({ run, isAdvancePlus, onShare, onDelete }: any) {
  return (
    <div style={cardStyle}>
      <h3 style={cardSubtitleStyle}>Acciones</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '.375rem' }}>
        {run.reportUrl && (
          <a href={run.reportUrl} target="_blank" style={actionBtnStyle}>
            🔗 Abrir reporte en nueva pestaña
          </a>
        )}
        {run.resultsZipUrl && (
          <a href={run.resultsZipUrl} download style={actionBtnStyle}>
            ⬇️ Descargar allure-results.zip
          </a>
        )}
        <button onClick={onShare} style={{
          ...actionBtnStyle,
          background: run.shareEnabled ? 'rgba(196,168,255,.15)' : 'transparent',
          color: run.shareEnabled ? '#c4a8ff' : '#c4c4d8',
        }}>
          {run.shareEnabled ? '🔗 Gestionar share link' : '🔗 Crear share link público'}
          {!isAdvancePlus && ' 🔒'}
        </button>
        <button onClick={onDelete} style={{
          ...actionBtnStyle,
          color: '#f87171', borderColor: 'rgba(239,68,68,.2)',
        }}>
          🗑️ Eliminar run
        </button>
      </div>

      {run.reportSizeKb && (
        <div style={{ marginTop: '.75rem', fontSize: '.65rem', color: '#5a5a7a', textAlign: 'center' }}>
          Reporte: {run.reportSizeKb > 1024 ? `${(run.reportSizeKb / 1024).toFixed(1)} MB` : `${run.reportSizeKb} KB`}
        </div>
      )}
    </div>
  )
}

// ── Share modal ─────────────────────────────────────────────────────────────

function ShareModal({ run, isAdvancePlus, onClose, onChanged }: any) {
  const [expiresInDays, setExpiresInDays] = useState('0')   // 0 = sin expiración
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function enable() {
    setError(''); setSaving(true)
    try {
      await api.post(`/api/allure/runs/${run.id}/share`, {
        expiresInDays: expiresInDays === '0' ? null : parseInt(expiresInDays),
      })
      onChanged()
    } catch (err: any) {
      setError(err.message); setSaving(false)
    }
  }

  async function disable() {
    if (!confirm('¿Desactivar el share link público?')) return
    setSaving(true)
    try {
      await api.delete(`/api/allure/runs/${run.id}/share`)
      onChanged()
    } catch (err: any) {
      setError(err.message); setSaving(false)
    }
  }

  const shareUrl = run.shareEnabled && run.shareToken
    ? `${window.location.origin}/api/allure/public/${run.shareToken}`
    : null

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100, padding: '1rem',
    }} onClick={onClose}>
      <div style={{
        background: '#0e0e1a', border: '1px solid rgba(255,255,255,.1)',
        borderRadius: 14, padding: '1.5rem',
        width: '100%', maxWidth: 520,
      }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#f0f0fc', marginBottom: '.5rem' }}>
          🔗 Share link público
        </h3>
        <p style={{ fontSize: '.8125rem', color: '#7070a0', marginBottom: '1rem' }}>
          Comparte el reporte con stakeholders sin que necesiten cuenta en Achilltest.
        </p>

        {!isAdvancePlus ? (
          <div style={{
            background: 'rgba(249,115,22,.08)',
            border: '1px solid rgba(249,115,22,.25)',
            borderRadius: 10, padding: '1rem', textAlign: 'center',
          }}>
            <div style={{ fontSize: '1.5rem', marginBottom: '.375rem' }}>🔒</div>
            <h4 style={{ color: '#fb923c', fontSize: '.9375rem', marginBottom: '.25rem' }}>
              Requiere plan Advance
            </h4>
            <p style={{ fontSize: '.75rem', color: '#7070a0' }}>
              Los share links públicos están disponibles en el plan Advance.
            </p>
          </div>
        ) : run.shareEnabled && shareUrl ? (
          <div>
            <Field label="URL pública">
              <input
                value={shareUrl}
                readOnly
                onClick={(e: any) => e.target.select()}
                style={{
                  width: '100%', background: '#141422',
                  border: '1px solid rgba(196,168,255,.25)', borderRadius: 8,
                  padding: '.5rem .75rem', color: '#c4a8ff',
                  fontSize: '.75rem', outline: 'none',
                  fontFamily: 'JetBrains Mono, monospace',
                }}
              />
            </Field>
            {run.shareExpiresAt && (
              <div style={{
                background: 'rgba(245,158,11,.08)',
                border: '1px solid rgba(245,158,11,.2)',
                borderRadius: 8, padding: '.5rem .75rem', fontSize: '.75rem',
                color: '#f59e0b', marginBottom: '1rem',
              }}>
                ⏰ Expira el {new Date(run.shareExpiresAt).toLocaleString('es-MX')}
              </div>
            )}

            <button onClick={() => {
              navigator.clipboard.writeText(shareUrl)
              alert('Link copiado al portapapeles')
            }} style={{ ...btnSecondaryStyle, width: '100%', marginBottom: '.5rem' }}>
              📋 Copiar link
            </button>
            <button onClick={disable} disabled={saving} style={{
              width: '100%',
              background: 'transparent', border: '1px solid rgba(239,68,68,.3)',
              color: '#f87171', borderRadius: 8,
              padding: '.5rem 1rem', fontSize: '.8125rem', fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
              opacity: saving ? .6 : 1,
            }}>
              🚫 Desactivar share link
            </button>
          </div>
        ) : (
          <div>
            <Field label="Expiración">
              <select value={expiresInDays} onChange={e => setExpiresInDays(e.target.value)} style={selectStyle}>
                <option value="0">Sin expiración</option>
                <option value="1">1 día</option>
                <option value="7">7 días</option>
                <option value="30">30 días</option>
                <option value="90">90 días</option>
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
              <button onClick={enable} disabled={saving} style={{ ...btnPrimaryStyle, flex: 1, opacity: saving ? .6 : 1 }}>
                {saving ? 'Activando...' : '🔗 Activar share link'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Helpers ──

function SourceBadge({ source }: { source: string }) {
  const labels: Record<string, { label: string; color: string; bg: string }> = {
    suite_run: { label: '📦 Suite Run', color: '#26b5aa', bg: 'rgba(38,181,170,.12)' },
    upload:    { label: '⬆️ Upload',    color: '#c4a8ff', bg: 'rgba(196,168,255,.12)' },
    manual:    { label: '✋ Manual',    color: '#7070a0', bg: 'rgba(255,255,255,.04)' },
    ci:        { label: '🤖 CI/CD',    color: '#84cc16', bg: 'rgba(132,204,22,.12)' },
  }
  const m = labels[source] || { label: source, color: '#7070a0', bg: 'rgba(255,255,255,.04)' }
  return (
    <span style={{
      background: m.bg, color: m.color,
      padding: '.125rem .5rem', borderRadius: 4,
      fontSize: '.65rem', fontWeight: 600,
    }}>{m.label}</span>
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
      padding: '1rem 2rem', borderBottom: '1px solid rgba(255,255,255,.07)', background: '#0e0e1a',
    }}>
      <a href="/allure" style={{ color: '#c4a8ff', textDecoration: 'none', fontSize: '.875rem' }}>← Allure</a>
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

const cardStyle: React.CSSProperties = {
  background: '#0e0e1a', border: '1px solid rgba(255,255,255,.07)',
  borderRadius: 12, padding: '1rem',
}
const cardSubtitleStyle: React.CSSProperties = {
  fontSize: '.75rem', fontWeight: 600, color: '#7070a0',
  textTransform: 'uppercase', letterSpacing: '.05em',
  marginBottom: '.625rem',
}
const chipStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,.04)', color: '#7070a0',
  padding: '.125rem .5rem', borderRadius: 4,
  fontSize: '.65rem', fontWeight: 600,
}
const actionBtnStyle: React.CSSProperties = {
  background: 'transparent', border: '1px solid rgba(255,255,255,.1)',
  color: '#c4c4d8', borderRadius: 8,
  padding: '.5rem .75rem', fontSize: '.75rem',
  cursor: 'pointer', fontFamily: 'inherit',
  textDecoration: 'none', display: 'block', textAlign: 'left',
}
const btnPrimaryStyle: React.CSSProperties = {
  background: '#26b5aa', color: '#fff', border: 'none', borderRadius: 8,
  padding: '.5rem 1rem', fontSize: '.875rem', fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit',
}
const btnSecondaryStyle: React.CSSProperties = {
  background: 'transparent', color: '#c4c4d8',
  border: '1px solid rgba(255,255,255,.12)', borderRadius: 8,
  padding: '.5rem 1rem', fontSize: '.8125rem', fontWeight: 500,
  cursor: 'pointer', fontFamily: 'inherit',
}
const btnGhostStyle: React.CSSProperties = {
  background: 'transparent', border: '1px solid rgba(255,255,255,.1)',
  color: '#7070a0', borderRadius: 8,
  padding: '.5rem 1rem', fontSize: '.8125rem', cursor: 'pointer', fontFamily: 'inherit',
}
const selectStyle: React.CSSProperties = {
  width: '100%', background: '#141422',
  border: '1px solid rgba(255,255,255,.1)', borderRadius: 8,
  padding: '.5rem .75rem', color: '#f0f0fc',
  fontSize: '.875rem', outline: 'none', fontFamily: 'inherit',
}
