'use client'

import { useEffect, useState, useRef } from 'react'
import { api }                         from '@/lib/api'

interface Props {
  specId?:      string
  executionId?: string
  suiteRunId?:  string
  specName?:    string
  onClose:      () => void
  onApplied?:   (result: any) => void
}

interface DiffLine {
  kind:    'context' | 'added' | 'removed'
  oldLine: number | null
  newLine: number | null
  text:    string
}

interface Change {
  type:   'selector' | 'assert' | 'wait' | 'other'
  line:   number
  old:    string
  new:    string
  reason: string
}

interface Session {
  id:               string
  status:           string
  diagnosis:        string | null
  confidenceScore:  string | null
  originalCode:     string | null
  proposedCode:     string | null
  changes:          Change[]
  diff?:            DiffLine[]
  diffStats?:       { added: number; removed: number; total: number }
  modelUsed:        string | null
  durationMs:       number | null
  tokensInput:      number
  tokensOutput:     number
  errorMessage:     string | null
  investigationMode: string | null
}

type Phase = 'idle' | 'starting' | 'tracking' | 'ready' | 'applying' | 'applied' | 'rejected' | 'failed'

export default function RepairModal({ specId, executionId, suiteRunId, specName, onClose, onApplied }: Props) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [session, setSession] = useState<Session | null>(null)
  const [error, setError] = useState('')
  const [showRaw, setShowRaw] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')
  const [estimate, setEstimate] = useState<any>(null)
  const [loadingEstimate, setLoadingEstimate] = useState(true)
  const pollRef = useRef<number | null>(null)

  useEffect(() => {
    loadEstimate()
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  async function loadEstimate() {
    try {
      const r = await api.post('/api/repair/estimate', { specId, executionId })
      setEstimate(r.data)
    } catch (err: any) {
      console.warn('No se pudo estimar costo:', err.message)
    } finally {
      setLoadingEstimate(false)
    }
  }

  async function startRepair(forceReExecute = false) {
    setError('')
    setPhase('starting')
    try {
      const r = await api.post('/api/repair', {
        specId, executionId, suiteRunId, forceReExecute,
      })
      setSession(r.data)
      // Si quedó en awaiting_approval o failed, ya tenemos resultado
      if (r.data.status === 'awaiting_approval' || r.data.status === 'failed') {
        await loadDetail(r.data.id)
      } else {
        // poll para los estados intermedios (no debería pasar normalmente)
        startPolling(r.data.id)
      }
    } catch (err: any) {
      setError(err.message)
      setPhase('failed')
    }
  }

  function startPolling(sessionId: string) {
    setPhase('tracking')
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = window.setInterval(async () => {
      try {
        const r = await api.get(`/api/repair/sessions/${sessionId}`)
        setSession(r.data)
        if (r.data.status === 'awaiting_approval' || r.data.status === 'failed' || r.data.status === 'applied') {
          if (pollRef.current) clearInterval(pollRef.current)
          await loadDetail(sessionId)
        }
      } catch {}
    }, 1500)
  }

  async function loadDetail(sessionId: string) {
    try {
      const r = await api.get(`/api/repair/sessions/${sessionId}`)
      setSession(r.data)
      if (r.data.status === 'awaiting_approval') setPhase('ready')
      else if (r.data.status === 'applied')       setPhase('applied')
      else if (r.data.status === 'rejected')      setPhase('rejected')
      else if (r.data.status === 'failed')        setPhase('failed')
    } catch (err: any) {
      setError(err.message)
    }
  }

  async function apply() {
    if (!session) return
    setPhase('applying')
    try {
      const r = await api.post(`/api/repair/sessions/${session.id}/apply`, {})
      setPhase('applied')
      onApplied?.(r.data)
    } catch (err: any) {
      setError(err.message)
      setPhase('ready')
    }
  }

  async function reject() {
    if (!session) return
    try {
      await api.post(`/api/repair/sessions/${session.id}/reject`, {
        reason: rejectionReason.trim() || null,
      })
      setPhase('rejected')
    } catch (err: any) {
      setError(err.message)
    }
  }

  async function retryWithReExecute() {
    setSession(null)
    setError('')
    await startRepair(true)
  }

  // ── Estado inicial: pedir permiso para iniciar ──
  if (phase === 'idle') {
    return (
      <Modal onClose={onClose}>
        <div style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.5rem' }}>
            <span style={{ fontSize: '1.5rem' }}>🔧</span>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#f0f0fc' }}>
              Reparar con IA
            </h3>
          </div>
          {specName && (
            <div style={{ fontSize: '.8125rem', color: '#7070a0', marginBottom: '1rem' }}>
              Spec: <strong style={{ color: '#c4a8ff' }}>{specName}</strong>
            </div>
          )}

          <div style={{
            background: 'rgba(124,92,191,.06)',
            border: '1px solid rgba(124,92,191,.15)',
            borderRadius: 10, padding: '1rem',
            fontSize: '.8125rem', color: '#c4c4d8',
            marginBottom: '1rem',
            lineHeight: 1.5,
          }}>
            El agente analiza el DOM actual del sitio, identifica qué cambió y propone
            cambios mínimos al código (selectores rotos, asserts obsoletos). Tú revisas
            el diff y decides si aplicar.
          </div>

          {/* Estimación de costo + cuota */}
          {!loadingEstimate && estimate && (
            <div style={{
              background: '#141422',
              border: '1px solid rgba(255,255,255,.06)',
              borderRadius: 10, padding: '.875rem 1rem',
              marginBottom: '1.25rem',
            }}>
              <div style={{
                fontSize: '.65rem', fontWeight: 600, color: '#26b5aa',
                textTransform: 'uppercase', letterSpacing: '.05em',
                marginBottom: '.5rem',
              }}>
                💰 Estrategia escalonada Haiku → Sonnet
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem', marginBottom: '.625rem' }}>
                <CostRow
                  label="✓ Si Haiku resuelve"
                  costUsd={estimate.bestCase.costUsd}
                  costMxn={estimate.bestCase.costUsd * 17.46}
                  color="#22c55e"
                />
                <CostRow
                  label="⚡ Si escala a Sonnet"
                  costUsd={estimate.worstCase.costUsd}
                  costMxn={estimate.worstCase.costUsd * 17.46}
                  color="#fbbf24"
                />
              </div>

              {/* Cuota */}
              {estimate.usage.limit !== null && (
                <div style={{
                  paddingTop: '.625rem',
                  borderTop: '1px solid rgba(255,255,255,.04)',
                  display: 'flex', justifyContent: 'space-between',
                  fontSize: '.7rem',
                }}>
                  <span style={{ color: '#7070a0' }}>Cuota mensual</span>
                  <span style={{ color: '#c4c4d8', fontWeight: 600 }}>
                    {estimate.usage.current}/{estimate.usage.limit}
                    {' '}({estimate.usage.remaining} restantes)
                  </span>
                </div>
              )}
            </div>
          )}

          {loadingEstimate && (
            <div style={{
              padding: '.875rem 1rem', marginBottom: '1rem',
              fontSize: '.75rem', color: '#7070a0', textAlign: 'center',
              background: '#141422', borderRadius: 10,
            }}>
              Calculando estimación...
            </div>
          )}

          {error && <ErrorBox text={error}/>}

          <div style={{ display: 'flex', gap: '.5rem' }}>
            <button onClick={onClose} style={btnGhostStyle}>Cancelar</button>
            <button onClick={() => startRepair(false)} style={{
              ...btnPrimaryStyle, flex: 1,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '.5rem',
            }}>
              🔧 Iniciar reparación
            </button>
          </div>
        </div>
      </Modal>
    )
  }

  // ── Loading / tracking ──
  if (phase === 'starting' || phase === 'tracking') {
    const phases = [
      { key: 'analyzing_snapshot', label: 'Analizando DOM capturado' },
      { key: 're_executing',       label: 'Re-ejecutando para inspeccionar página' },
      { key: 'generating_repair',  label: 'Pidiendo a Claude que diagnostique' },
    ]
    const currentIdx = phases.findIndex(p => p.key === session?.status)

    return (
      <Modal onClose={() => {}}>
        <div style={{ padding: '2rem 1.5rem', textAlign: 'center' }}>
          <div style={{
            width: 56, height: 56, margin: '0 auto 1rem',
            border: '4px solid rgba(124,92,191,.2)',
            borderTopColor: '#c4a8ff',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }}/>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

          <h3 style={{ fontSize: '1rem', color: '#f0f0fc', marginBottom: '.25rem' }}>
            🔧 Reparando spec...
          </h3>
          <div style={{ fontSize: '.8125rem', color: '#7070a0', marginBottom: '1.5rem' }}>
            Esto suele tardar 10-20 segundos
          </div>

          <div style={{ maxWidth: 380, margin: '0 auto', display: 'grid', gap: '.375rem' }}>
            {phases.map((p, i) => {
              const isDone = i < currentIdx
              const isCurrent = i === currentIdx
              return (
                <div key={p.key} style={{
                  display: 'flex', alignItems: 'center', gap: '.5rem',
                  padding: '.4375rem .75rem', borderRadius: 6,
                  background: isCurrent ? 'rgba(124,92,191,.1)' : isDone ? 'rgba(34,197,94,.06)' : '#141422',
                  fontSize: '.75rem',
                  color: isCurrent ? '#c4a8ff' : isDone ? '#22c55e' : '#7070a0',
                }}>
                  <span>{isDone ? '✓' : isCurrent ? '⋯' : '○'}</span>
                  <span>{p.label}</span>
                </div>
              )
            })}
          </div>
        </div>
      </Modal>
    )
  }

  // ── Failed (sin fix posible) ──
  if (phase === 'failed' || (session && session.status === 'failed')) {
    return (
      <Modal onClose={onClose}>
        <div style={{ padding: '1.5rem', textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '.5rem' }}>🤔</div>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#f0f0fc', marginBottom: '.5rem' }}>
            No pude reparar este spec automáticamente
          </h3>

          <div style={{
            background: 'rgba(251,191,36,.06)',
            border: '1px solid rgba(251,191,36,.2)',
            borderRadius: 10, padding: '1rem',
            fontSize: '.8125rem', color: '#c4c4d8',
            marginBottom: '1.25rem', textAlign: 'left',
            lineHeight: 1.5,
          }}>
            {session?.diagnosis || session?.errorMessage || error || 'Sin diagnóstico disponible'}
          </div>

          {session?.investigationMode === 'snapshot' && (
            <div style={{ marginBottom: '.75rem' }}>
              <button onClick={retryWithReExecute} style={{
                ...btnSecondaryStyle, width: '100%',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '.5rem',
              }}>
                🔄 Reintentar abriendo el browser (más preciso)
              </button>
              <div style={{ fontSize: '.7rem', color: '#7070a0', marginTop: '.375rem' }}>
                El primer intento usó el DOM guardado. Re-ejecutar abre el sitio real y captura el estado en vivo.
              </div>
            </div>
          )}

          <button onClick={onClose} style={btnGhostStyle}>Cerrar</button>
        </div>
      </Modal>
    )
  }

  // ── Applied (success) ──
  if (phase === 'applied' || (session && session.status === 'applied')) {
    return (
      <Modal onClose={onClose}>
        <div style={{ padding: '1.5rem', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '.5rem' }}>🎉</div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#22c55e', marginBottom: '.5rem' }}>
            ¡Spec reparado!
          </h3>
          <p style={{ color: '#7070a0', fontSize: '.875rem', marginBottom: '1.25rem' }}>
            Los cambios se aplicaron. Puedes volver a ejecutar el test para verificar.
          </p>
          <button onClick={onClose} style={{ ...btnPrimaryStyle, width: '100%' }}>
            Listo
          </button>
        </div>
      </Modal>
    )
  }

  // ── Rejected ──
  if (phase === 'rejected') {
    return (
      <Modal onClose={onClose}>
        <div style={{ padding: '1.5rem', textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '.5rem' }}>✋</div>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#f0f0fc', marginBottom: '.5rem' }}>
            Sugerencia rechazada
          </h3>
          <p style={{ color: '#7070a0', fontSize: '.875rem', marginBottom: '1rem' }}>
            No se aplicó ningún cambio al spec.
          </p>
          <button onClick={onClose} style={{ ...btnPrimaryStyle, width: '100%' }}>Cerrar</button>
        </div>
      </Modal>
    )
  }

  // ── Ready: mostrar diagnóstico + diff + acciones ──
  if (!session) return null
  const confidence = session.confidenceScore ? parseFloat(session.confidenceScore) : null

  return (
    <Modal onClose={onClose} wide>
      <div style={{ padding: '1.5rem', maxHeight: '90vh', overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.75rem' }}>
          <span style={{ fontSize: '1.25rem' }}>🔧</span>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#f0f0fc' }}>
            Propuesta de reparación
          </h3>
          {confidence !== null && <ConfidenceBadge value={confidence}/>}
        </div>

        {/* Diagnosis */}
        {session.diagnosis && (
          <div style={{
            background: 'rgba(124,92,191,.06)',
            border: '1px solid rgba(124,92,191,.2)',
            borderRadius: 10, padding: '.875rem 1rem',
            fontSize: '.875rem', color: '#c4c4d8',
            marginBottom: '1rem', lineHeight: 1.5,
          }}>
            <div style={{
              fontSize: '.65rem', fontWeight: 600, color: '#c4a8ff',
              textTransform: 'uppercase', letterSpacing: '.05em',
              marginBottom: '.375rem',
            }}>
              📋 Diagnóstico
            </div>
            {session.diagnosis}
          </div>
        )}

        {/* Changes list */}
        {session.changes && session.changes.length > 0 && (
          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{
              fontSize: '.65rem', fontWeight: 600, color: '#7070a0',
              textTransform: 'uppercase', letterSpacing: '.05em',
              marginBottom: '.5rem',
            }}>
              🔄 Cambios propuestos ({session.changes.length})
            </div>
            <div style={{ display: 'grid', gap: '.375rem' }}>
              {session.changes.map((c, i) => <ChangeRow key={i} change={c}/>)}
            </div>
          </div>
        )}

        {/* Diff toggle */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.5rem' }}>
          <div style={{
            fontSize: '.65rem', fontWeight: 600, color: '#7070a0',
            textTransform: 'uppercase', letterSpacing: '.05em',
          }}>
            📝 Diff completo ({session.diffStats?.added || 0}+ {session.diffStats?.removed || 0}−)
          </div>
          <button onClick={() => setShowRaw(!showRaw)} style={{
            background: 'transparent', border: 'none',
            color: '#7070a0', fontSize: '.7rem', cursor: 'pointer', fontFamily: 'inherit',
            textDecoration: 'underline',
          }}>
            {showRaw ? 'Ver diff' : 'Ver código completo'}
          </button>
        </div>

        {showRaw ? (
          <div style={{
            background: '#08080f', border: '1px solid rgba(255,255,255,.05)',
            borderRadius: 8, padding: '.75rem',
            fontFamily: 'JetBrains Mono, monospace', fontSize: '.7rem',
            color: '#c4c4d8', maxHeight: 400, overflow: 'auto',
            whiteSpace: 'pre',
          }}>
            {session.proposedCode}
          </div>
        ) : (
          <DiffView diff={session.diff || []}/>
        )}

        {/* Tokens info */}
        <div style={{
          marginTop: '.875rem',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          gap: '.5rem', flexWrap: 'wrap',
          fontSize: '.65rem', color: '#7070a0',
          padding: '.4375rem .625rem',
          background: '#141422', borderRadius: 6,
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '.375rem' }}>
            {session.modelUsed?.includes('→') ? '🪜' : session.modelUsed?.includes('haiku') ? '⚡' : '🧠'}
            <span>{session.modelUsed}</span>
          </span>
          <span>{session.tokensInput?.toLocaleString()}in / {session.tokensOutput?.toLocaleString()}out</span>
          <span>{session.durationMs ? `${(session.durationMs/1000).toFixed(1)}s` : ''}</span>
        </div>

        {error && (
          <div style={{ marginTop: '.75rem' }}>
            <ErrorBox text={error}/>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: '.5rem', marginTop: '1.25rem' }}>
          {!rejecting ? (
            <>
              <button onClick={() => setRejecting(true)} style={btnGhostStyle}>
                Rechazar
              </button>
              <button onClick={apply} style={{
                ...btnPrimaryStyle, flex: 1,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '.5rem',
              }}>
                ✓ Aplicar al spec
              </button>
            </>
          ) : (
            <div style={{ flex: 1 }}>
              <input
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Razón del rechazo (opcional)"
                style={{
                  width: '100%', background: '#141422',
                  border: '1px solid rgba(255,255,255,.1)', borderRadius: 8,
                  padding: '.5rem .75rem', color: '#f0f0fc',
                  fontSize: '.8125rem', outline: 'none', fontFamily: 'inherit',
                  marginBottom: '.5rem',
                }}
                autoFocus
              />
              <div style={{ display: 'flex', gap: '.5rem' }}>
                <button onClick={() => setRejecting(false)} style={btnGhostStyle}>Cancelar</button>
                <button onClick={reject} style={{
                  ...btnPrimaryStyle, flex: 1, background: '#f87171',
                }}>
                  Confirmar rechazo
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

// ── Sub-componentes ─────────────────────────────────────────────────────────

function DiffView({ diff }: { diff: DiffLine[] }) {
  return (
    <div style={{
      background: '#08080f', border: '1px solid rgba(255,255,255,.05)',
      borderRadius: 8, fontFamily: 'JetBrains Mono, monospace', fontSize: '.7rem',
      maxHeight: 400, overflow: 'auto',
    }}>
      {diff.map((line, i) => {
        const bg = line.kind === 'added'   ? 'rgba(34,197,94,.08)'
                 : line.kind === 'removed' ? 'rgba(239,68,68,.08)'
                 : 'transparent'
        const prefix = line.kind === 'added' ? '+' : line.kind === 'removed' ? '-' : ' '
        const prefixColor = line.kind === 'added' ? '#22c55e' : line.kind === 'removed' ? '#f87171' : '#5a5a7a'
        return (
          <div key={i} style={{
            display: 'flex', gap: '.5rem',
            padding: '.125rem .5rem',
            background: bg,
            borderLeft: `3px solid ${line.kind === 'context' ? 'transparent' : prefixColor}`,
          }}>
            <span style={{ color: '#5a5a7a', width: 30, textAlign: 'right', flexShrink: 0 }}>
              {line.newLine ?? line.oldLine ?? ''}
            </span>
            <span style={{ color: prefixColor, width: 12, flexShrink: 0 }}>{prefix}</span>
            <span style={{ color: line.kind === 'context' ? '#7070a0' : '#c4c4d8', whiteSpace: 'pre' }}>
              {line.text}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function ChangeRow({ change }: { change: Change }) {
  const typeMeta: Record<string, { color: string; icon: string }> = {
    selector: { color: '#26b5aa', icon: '🎯' },
    assert:   { color: '#fbbf24', icon: '✓' },
    wait:     { color: '#c4a8ff', icon: '⏱' },
    other:    { color: '#7070a0', icon: '•' },
  }
  const m = typeMeta[change.type] || typeMeta.other

  return (
    <div style={{
      background: '#0e0e1a', border: '1px solid rgba(255,255,255,.05)',
      borderRadius: 8, padding: '.5rem .75rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.375rem', marginBottom: '.25rem' }}>
        <span style={{ fontSize: '.875rem' }}>{m.icon}</span>
        <span style={{
          fontSize: '.65rem', fontWeight: 600,
          color: m.color, textTransform: 'uppercase',
        }}>{change.type}</span>
        {change.line && (
          <span style={{ fontSize: '.65rem', color: '#7070a0' }}>· Línea {change.line}</span>
        )}
      </div>
      <div style={{ fontSize: '.75rem', color: '#c4c4d8', marginBottom: '.25rem' }}>
        {change.reason}
      </div>
      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '.65rem' }}>
        <div style={{ color: '#f87171', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          − {change.old}
        </div>
        <div style={{ color: '#22c55e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          + {change.new}
        </div>
      </div>
    </div>
  )
}

function ConfidenceBadge({ value }: { value: number }) {
  const color = value >= 0.85 ? '#22c55e'
             : value >= 0.65 ? '#fbbf24'
             : '#f87171'
  const label = value >= 0.85 ? 'Alta confianza'
              : value >= 0.65 ? 'Media confianza'
              : 'Baja confianza'
  return (
    <span style={{
      background: `${color}15`, color,
      padding: '.125rem .5rem', borderRadius: 12,
      fontSize: '.65rem', fontWeight: 600,
    }}>
      {label} · {(value * 100).toFixed(0)}%
    </span>
  )
}

function Modal({ children, onClose, wide }: any) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100, padding: '1rem',
    }} onClick={onClose}>
      <div style={{
        background: '#0e0e1a', border: '1px solid rgba(255,255,255,.1)',
        borderRadius: 14, width: '100%', maxWidth: wide ? 720 : 480,
        maxHeight: '90vh', overflow: 'hidden',
      }} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

function ErrorBox({ text }: { text: string }) {
  return (
    <div style={{
      background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)',
      borderRadius: 8, padding: '.5rem .75rem', fontSize: '.75rem',
      color: '#f87171', marginBottom: '.75rem',
    }}>{text}</div>
  )
}

const btnPrimaryStyle: React.CSSProperties = {
  background: '#c4a8ff', color: '#0e0e1a', border: 'none', borderRadius: 8,
  padding: '.5rem 1rem', fontSize: '.875rem', fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit',
}
const btnSecondaryStyle: React.CSSProperties = {
  background: '#26b5aa', color: '#fff', border: 'none', borderRadius: 8,
  padding: '.5rem 1rem', fontSize: '.875rem', fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit',
}
const btnGhostStyle: React.CSSProperties = {
  background: 'transparent', border: '1px solid rgba(255,255,255,.1)',
  color: '#7070a0', borderRadius: 8,
  padding: '.5rem 1rem', fontSize: '.8125rem',
  cursor: 'pointer', fontFamily: 'inherit',
}

function CostRow({ label, costUsd, costMxn, color }: { label: string; costUsd: number; costMxn: number; color: string }) {
  return (
    <div style={{
      background: '#0e0e1a',
      borderRadius: 6,
      padding: '.5rem .625rem',
      borderLeft: `3px solid ${color}`,
    }}>
      <div style={{ fontSize: '.65rem', color: '#7070a0', marginBottom: '.125rem', fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '.375rem' }}>
        <span style={{ fontSize: '.875rem', fontWeight: 700, color }}>
          ${costUsd.toFixed(3)}
        </span>
        <span style={{ fontSize: '.6rem', color: '#7070a0' }}>USD</span>
        <span style={{ fontSize: '.6rem', color: '#5a5a7a' }}>
          (~${costMxn.toFixed(2)} MXN)
        </span>
      </div>
    </div>
  )
}
