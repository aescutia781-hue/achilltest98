'use client'

import { useEffect, useState } from 'react'
import { useRouter }           from 'next/navigation'
import { useAuth }             from '@/hooks/useAuth'
import { api, logout }         from '@/lib/api'
import RepairModal             from '@/components/RepairModal'

interface Execution {
  id:          string
  testName:    string
  targetUrl:   string
  status:      string
  durationMs:  number | null
  createdAt:   string
  completedAt: string | null
}

export default function ExecutionsPage() {
  const router = useRouter()
  const { user, loading } = useAuth(true)
  const [executions, setExecutions] = useState<Execution[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [repairTarget, setRepairTarget] = useState<Execution | null>(null)

  useEffect(() => {
    if (!user) return
    api.get('/api/executions?limit=50')
      .then(r => setExecutions(r.data || []))
      .catch(() => {})
      .finally(() => setLoadingList(false))
  }, [user])

  if (loading) return <Loading/>
  if (!user)   return null

  return (
    <div style={{ minHeight:'100vh', background:'#08080f', fontFamily:'Inter,system-ui,sans-serif', color:'#c4c4d8' }}>
      <nav style={{
        display:'flex', justifyContent:'space-between', alignItems:'center',
        padding:'1rem 2rem', borderBottom:'1px solid rgba(255,255,255,.07)', background:'#0e0e1a',
      }}>
        <a href="/dashboard" style={{ color:'#c4a8ff', textDecoration:'none', fontSize:'.875rem' }}>
          ← Dashboard
        </a>
        <button onClick={logout} style={{
          background:'transparent', border:'1px solid rgba(255,255,255,.1)',
          color:'#7070a0', borderRadius:'8px', padding:'.375rem .875rem',
          fontSize:'.75rem', cursor:'pointer',
        }}>Salir</button>
      </nav>

      <div style={{ maxWidth:'1100px', margin:'0 auto', padding:'2rem 1.5rem' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'2rem' }}>
          <h1 style={{ fontSize:'1.5rem', fontWeight:700, color:'#f0f0fc' }}>
            Historial de ejecuciones
          </h1>
          <button
            onClick={() => router.push('/workspace')}
            style={{
              background:'#7c5cbf', color:'#fff', border:'none',
              borderRadius:'10px', padding:'.625rem 1.25rem',
              fontSize:'.875rem', fontWeight:600, cursor:'pointer',
              boxShadow:'0 4px 20px rgba(124,92,191,.4)',
            }}
          >
            + Nuevo test
          </button>
        </div>

        {loadingList ? (
          <div style={{ textAlign:'center', padding:'3rem', color:'#7070a0' }}>Cargando...</div>
        ) : executions.length === 0 ? (
          <div style={{
            padding:'4rem 2rem', textAlign:'center',
            background:'#0e0e1a', border:'1px dashed rgba(255,255,255,.1)',
            borderRadius:'14px',
          }}>
            <div style={{ fontSize:'3rem', marginBottom:'.75rem' }}>🎯</div>
            <h3 style={{ fontSize:'1.125rem', color:'#f0f0fc', marginBottom:'.5rem' }}>
              No tienes ejecuciones todavía
            </h3>
            <p style={{ color:'#7070a0', fontSize:'.9375rem', marginBottom:'1.5rem' }}>
              Crea tu primer test E2E con IA en menos de 3 minutos.
            </p>
            <button
              onClick={() => router.push('/workspace')}
              style={{
                background:'#7c5cbf', color:'#fff', border:'none',
                borderRadius:'10px', padding:'.75rem 1.5rem',
                fontSize:'.9375rem', fontWeight:600, cursor:'pointer',
              }}
            >
              Crear mi primer test →
            </button>
          </div>
        ) : (
          <div style={{
            background:'#0e0e1a', border:'1px solid rgba(255,255,255,.07)',
            borderRadius:'14px', overflow:'hidden',
          }}>
            {executions.map((ex, i) => (
              <div
                key={ex.id}
                onClick={() => router.push(`/workspace?execution=${ex.id}`)}
                style={{
                  padding:'1rem 1.25rem',
                  borderBottom: i < executions.length - 1 ? '1px solid rgba(255,255,255,.05)' : 'none',
                  cursor:'pointer', transition:'background .15s',
                  display:'flex', alignItems:'center', justifyContent:'space-between', gap:'1rem',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#141422'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'.625rem', marginBottom:'.25rem' }}>
                    <StatusDot status={ex.status}/>
                    <span style={{ fontSize:'.9375rem', fontWeight:600, color:'#f0f0fc' }}>
                      {ex.testName}
                    </span>
                  </div>
                  <div style={{ fontSize:'.75rem', color:'#7070a0', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {ex.targetUrl}
                  </div>
                </div>
                <div style={{ textAlign:'right', flexShrink:0, display: 'flex', gap: '.5rem', alignItems: 'center' }}>
                  {ex.status === 'failed' && user?.plan !== 'trial' && (
                    <button
                      onClick={(e: any) => { e.stopPropagation(); setRepairTarget(ex) }}
                      style={{
                        background: 'rgba(196,168,255,.12)',
                        color: '#c4a8ff',
                        border: '1px solid rgba(196,168,255,.25)',
                        borderRadius: 6,
                        padding: '.3125rem .625rem',
                        fontSize: '.7rem', fontWeight: 600,
                        cursor: 'pointer', fontFamily: 'inherit',
                        display: 'inline-flex', alignItems: 'center', gap: '.25rem',
                      }}
                    >🔧 Reparar</button>
                  )}
                  <div>
                    <div style={{ fontSize:'.8125rem', color:'#c4c4d8' }}>
                      {formatDate(ex.createdAt)}
                    </div>
                    {ex.durationMs && (
                      <div style={{ fontSize:'.75rem', color:'#7070a0' }}>
                        {(ex.durationMs / 1000).toFixed(1)}s
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {repairTarget && (
        <RepairModal
          executionId={repairTarget.id}
          specName={repairTarget.testName}
          onClose={() => setRepairTarget(null)}
          onApplied={() => { setRepairTarget(null); /* refrescar lista */ }}
        />
      )}
    </div>
  )
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending:   '#7070a0',
    running:   '#26b5aa',
    completed: '#22c55e',
    failed:    '#f87171',
    cancelled: '#7070a0',
  }
  const color = colors[status] || '#7070a0'
  return (
    <span style={{
      display:'inline-block', width:'8px', height:'8px', borderRadius:'50%',
      background:color,
      animation: status === 'running' ? 'pulse 1.5s infinite' : 'none',
    }}/>
  )
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('es-MX', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })
}

function Loading() {
  return <div style={{ minHeight:'100vh', background:'#08080f', display:'flex', alignItems:'center', justifyContent:'center', color:'#7070a0' }}>Cargando...</div>
}
