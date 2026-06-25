'use client'

import { useEffect, useState }  from 'react'
import { useRouter }            from 'next/navigation'
import { useAuth }              from '@/hooks/useAuth'
import { api, logout }          from '@/lib/api'

interface Usage {
  repairCount:    number
  tokensUsed:     number
  tokensCostUsd:  string
  limit:          number | null
  remaining:      number | null
}

interface Session {
  id:               string
  status:           string
  diagnosis:        string | null
  confidenceScore:  string | null
  specId:           string | null
  executionId:      string | null
  modelUsed:        string | null
  durationMs:       number | null
  tokensInput:      number
  tokensOutput:     number
  createdAt:        string
  appliedAt:        string | null
}

export default function RepairHistoryPage() {
  const router = useRouter()
  const { user, loading } = useAuth(true)
  const [usage, setUsage]       = useState<Usage | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [error, setError]       = useState('')

  useEffect(() => {
    if (!user) return
    if (user.plan === 'trial') { router.push('/pricing'); return }
    loadAll()
  }, [user])

  async function loadAll() {
    try {
      const [u, s] = await Promise.all([
        api.get('/api/repair/usage'),
        api.get('/api/repair/sessions?limit=50'),
      ])
      setUsage(u.data)
      setSessions(s.data || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoadingData(false)
    }
  }

  if (loading || loadingData) return <Loading/>
  if (!user) return null

  const usagePct = usage?.limit
    ? Math.min(100, ((usage.repairCount || 0) / usage.limit) * 100)
    : 0
  const usageColor = usagePct >= 90 ? '#f87171' : usagePct >= 70 ? '#fbbf24' : '#22c55e'

  return (
    <div style={{ minHeight: '100vh', background: '#08080f', color: '#c4c4d8', fontFamily: 'Inter,system-ui,sans-serif' }}>
      <Nav user={user}/>

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '2rem 1.5rem' }}>
        <a href="/dashboard" style={{ color: '#7070a0', fontSize: '.8125rem', textDecoration: 'none' }}>
          ← Dashboard
        </a>

        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginTop: '.5rem', marginBottom: '.25rem' }}>
          <span style={{ fontSize: '1.5rem' }}>🔧</span>
          <h1 style={{ fontSize: '1.625rem', fontWeight: 700, color: '#f0f0fc' }}>
            Repair Agent
          </h1>
        </div>
        <p style={{ color: '#7070a0', fontSize: '.9375rem', marginBottom: '1.5rem' }}>
          Auto-reparación con IA de selectores rotos y asserts obsoletos.
        </p>

        {error && (
          <div style={{
            background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)',
            borderRadius: 8, padding: '.625rem .75rem', fontSize: '.8125rem',
            color: '#f87171', marginBottom: '1rem',
          }}>{error}</div>
        )}

        {/* Usage card */}
        {usage && (
          <div style={{
            background: '#0e0e1a', border: '1px solid rgba(255,255,255,.07)',
            borderRadius: 12, padding: '1.25rem', marginBottom: '1.5rem',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '.75rem' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#f0f0fc' }}>
                📊 Cuota mensual
              </h2>
              <span style={{ fontSize: '.7rem', color: '#7070a0' }}>
                Plan {user.plan}
              </span>
            </div>

            <div style={{
              display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
              marginBottom: '.625rem',
            }}>
              <div>
                <span style={{ fontSize: '2rem', fontWeight: 700, color: '#f0f0fc' }}>
                  {usage.repairCount}
                </span>
                <span style={{ fontSize: '1rem', color: '#7070a0' }}>
                  {' / '}{usage.limit ?? '∞'}
                </span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '.75rem', color: '#7070a0' }}>Costo del mes</div>
                <div style={{ fontSize: '.9375rem', color: '#c4c4d8', fontWeight: 600 }}>
                  ${parseFloat(usage.tokensCostUsd || '0').toFixed(3)} USD
                  <span style={{ color: '#7070a0', fontSize: '.7rem', marginLeft: '.25rem' }}>
                    (~${(parseFloat(usage.tokensCostUsd || '0') * 17.46).toFixed(2)} MXN)
                  </span>
                </div>
              </div>
            </div>

            {usage.limit && (
              <div style={{
                height: 6, background: '#141422',
                borderRadius: 3, overflow: 'hidden', marginBottom: '.5rem',
              }}>
                <div style={{
                  height: '100%', width: `${usagePct}%`,
                  background: usageColor,
                  transition: 'width .3s',
                }}/>
              </div>
            )}

            <div style={{ fontSize: '.7rem', color: '#7070a0' }}>
              {usage.limit
                ? `Te quedan ${usage.remaining} repairs este mes. Se reinicia el día 1.`
                : 'Sin límite mensual'}
            </div>

            <div style={{
              marginTop: '.75rem',
              paddingTop: '.75rem',
              borderTop: '1px solid rgba(255,255,255,.04)',
              display: 'flex', alignItems: 'center', gap: '.375rem',
              fontSize: '.65rem', color: '#7070a0',
            }}>
              <span style={{
                background: 'rgba(34,197,94,.12)', color: '#22c55e',
                padding: '.0625rem .25rem', borderRadius: 3, fontWeight: 600,
              }}>⚡ Haiku</span>
              <span>→</span>
              <span style={{
                background: 'rgba(38,181,170,.12)', color: '#26b5aa',
                padding: '.0625rem .25rem', borderRadius: 3, fontWeight: 600,
              }}>🧠 Sonnet</span>
              <span style={{ marginLeft: '.25rem' }}>
                Estrategia escalonada · 21% más barato que Sonnet directo
              </span>
            </div>
          </div>
        )}

        {/* Sessions history */}
        <h2 style={{ fontSize: '1.0625rem', fontWeight: 600, color: '#f0f0fc', marginBottom: '.75rem' }}>
          📜 Historial de reparaciones ({sessions.length})
        </h2>

        {sessions.length === 0 ? (
          <div style={{
            padding: '2.5rem', textAlign: 'center',
            background: '#0e0e1a', border: '1px dashed rgba(255,255,255,.1)',
            borderRadius: 12,
          }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '.5rem' }}>🔧</div>
            <p style={{ color: '#7070a0', fontSize: '.875rem', marginBottom: '1rem' }}>
              Aún no has reparado ningún spec. Cuando un test falle, busca el botón
              "Reparar con IA" en el detalle del spec.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '.5rem' }}>
            {sessions.map(s => <SessionCard key={s.id} session={s}/>)}
          </div>
        )}
      </div>
    </div>
  )
}

function SessionCard({ session }: { session: Session }) {
  const statusMeta: Record<string, { color: string; icon: string; label: string }> = {
    pending:            { color: '#7070a0', icon: '○', label: 'Pendiente' },
    analyzing_snapshot: { color: '#26b5aa', icon: '⏳', label: 'Analizando snapshot' },
    re_executing:       { color: '#26b5aa', icon: '⏳', label: 'Re-ejecutando' },
    generating_repair:  { color: '#c4a8ff', icon: '🧠', label: 'Pensando' },
    awaiting_approval:  { color: '#fbbf24', icon: '⏸', label: 'Pendiente aprobación' },
    applied:            { color: '#22c55e', icon: '✓', label: 'Aplicado' },
    rejected:           { color: '#7070a0', icon: '✋', label: 'Rechazado' },
    failed:             { color: '#f87171', icon: '✗', label: 'Sin fix posible' },
  }
  const m = statusMeta[session.status] || statusMeta.pending
  const confidence = session.confidenceScore ? parseFloat(session.confidenceScore) : null

  return (
    <div style={{
      background: '#0e0e1a', border: '1px solid rgba(255,255,255,.07)',
      borderRadius: 10, padding: '.75rem 1rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.625rem', marginBottom: '.375rem' }}>
        <span style={{
          background: `${m.color}20`, color: m.color,
          width: 24, height: 24, borderRadius: '50%',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '.8125rem', fontWeight: 700, flexShrink: 0,
        }}>{m.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: '.875rem', color: '#f0f0fc',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {session.diagnosis || 'Sin diagnóstico'}
          </div>
          <div style={{ display: 'flex', gap: '.375rem', fontSize: '.65rem', color: '#7070a0', marginTop: '.125rem', flexWrap: 'wrap' }}>
            <span style={{ color: m.color, fontWeight: 600 }}>{m.label}</span>
            {confidence !== null && (
              <>
                <span>·</span>
                <span>Confianza {(confidence * 100).toFixed(0)}%</span>
              </>
            )}
            {session.modelUsed && (
              <>
                <span>·</span>
                <ModelBadge model={session.modelUsed}/>
              </>
            )}
            {session.durationMs && (<><span>·</span><span>{(session.durationMs / 1000).toFixed(1)}s</span></>)}
            <span>·</span>
            <span>{new Date(session.createdAt).toLocaleString('es-MX')}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function ModelBadge({ model }: { model: string }) {
  // El modelUsed puede ser:
  //   "claude-haiku-4-5"            → solo Haiku resolvió (rápido y barato)
  //   "claude-haiku-4-5 → claude-sonnet-4-6" → escaló (necesitó Sonnet)
  //   "claude-sonnet-4-6"           → solo Sonnet (forzado)
  const escalated = model.includes('→')

  if (escalated) {
    return (
      <span style={{
        background: 'rgba(196,168,255,.12)',
        color: '#c4a8ff',
        padding: '.0625rem .375rem',
        borderRadius: 3,
        fontSize: '.6rem',
        fontWeight: 600,
      }} title={model}>
        🪜 Haiku→Sonnet
      </span>
    )
  }

  if (model.includes('haiku')) {
    return (
      <span style={{
        background: 'rgba(34,197,94,.12)',
        color: '#22c55e',
        padding: '.0625rem .375rem',
        borderRadius: 3,
        fontSize: '.6rem',
        fontWeight: 600,
      }} title={model}>
        ⚡ Haiku
      </span>
    )
  }

  if (model.includes('sonnet')) {
    return (
      <span style={{
        background: 'rgba(38,181,170,.12)',
        color: '#26b5aa',
        padding: '.0625rem .375rem',
        borderRadius: 3,
        fontSize: '.6rem',
        fontWeight: 600,
      }} title={model}>
        🧠 Sonnet
      </span>
    )
  }

  return <span style={{ color: '#7070a0' }}>{model}</span>
}

function Nav({ user }: any) {
  return (
    <nav style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '1rem 2rem', borderBottom: '1px solid rgba(255,255,255,.07)', background: '#0e0e1a',
    }}>
      <a href="/dashboard" style={{ color: '#c4a8ff', textDecoration: 'none', fontSize: '.875rem' }}>← Dashboard</a>
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
  return <div style={{ minHeight: '100vh', background: '#08080f', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7070a0' }}>Cargando...</div>
}
