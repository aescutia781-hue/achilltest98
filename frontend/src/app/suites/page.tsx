'use client'

import { useEffect, useState }  from 'react'
import { useRouter }            from 'next/navigation'
import { useAuth }              from '@/hooks/useAuth'
import { api, logout }          from '@/lib/api'

interface Suite {
  id:          string
  name:        string
  description: string | null
  specCount:   number
  lastRun:     any | null
  createdAt:   string
  updatedAt:   string
}

export default function SuitesPage() {
  const router = useRouter()
  const { user, loading } = useAuth(true)

  const [suites,        setSuites]        = useState<Suite[]>([])
  const [loadingList,   setLoadingList]   = useState(true)
  const [creating,      setCreating]      = useState(false)
  const [showCreate,    setShowCreate]    = useState(false)
  const [newName,       setNewName]       = useState('')
  const [newDesc,       setNewDesc]       = useState('')
  const [error,         setError]         = useState('')

  useEffect(() => {
    if (!user) return
    loadSuites()
  }, [user])

  async function loadSuites() {
    try {
      const r = await api.get('/api/suites')
      setSuites(r.data || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoadingList(false)
    }
  }

  async function createSuite() {
    if (!newName.trim()) { setError('Nombre requerido'); return }
    setCreating(true); setError('')
    try {
      const r = await api.post('/api/suites', { name: newName, description: newDesc })
      setShowCreate(false)
      setNewName(''); setNewDesc('')
      router.push(`/suites/${r.data.id}`)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setCreating(false)
    }
  }

  if (loading) return <Loading/>
  if (!user)   return null

  const isTeammate = user.plan === 'teammate'

  return (
    <div style={{ minHeight:'100vh', background:'#08080f', color:'#c4c4d8', fontFamily:'Inter,system-ui,sans-serif' }}>
      <Nav user={user}/>

      <div style={{ maxWidth:'1100px', margin:'0 auto', padding:'2rem 1.5rem' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.5rem', flexWrap:'wrap', gap:'1rem' }}>
          <div>
            <h1 style={{ fontSize:'1.625rem', fontWeight:700, color:'#f0f0fc', marginBottom:'.25rem' }}>
              📦 Test Suites
            </h1>
            <p style={{ color:'#7070a0', fontSize:'.9375rem' }}>
              Agrupa specs y ejecútalos juntos {isTeammate && '· con Device Farm de hasta 10 dispositivos'}
            </p>
          </div>
          <div style={{ display:'flex', gap:'.5rem' }}>
            {isTeammate && (
              <button onClick={() => router.push('/device-farms')} style={btnSecondaryStyle}>
                🏭 Device Farms
              </button>
            )}
            <button onClick={() => setShowCreate(true)} style={btnPrimaryStyle}>
              + Nueva suite
            </button>
          </div>
        </div>

        {/* Modal crear */}
        {showCreate && (
          <div style={modalOverlayStyle} onClick={() => setShowCreate(false)}>
            <div style={modalStyle} onClick={e => e.stopPropagation()}>
              <h2 style={{ fontSize:'1.125rem', fontWeight:700, color:'#f0f0fc', marginBottom:'1rem' }}>
                Nueva Test Suite
              </h2>
              <Field label="Nombre">
                <input value={newName} onChange={e => setNewName(e.target.value)} autoFocus
                  placeholder="Ej. Smoke tests producción" style={inputStyle}/>
              </Field>
              <Field label="Descripción (opcional)">
                <textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} rows={3}
                  placeholder="Casos críticos que validamos antes de cada deploy"
                  style={{ ...inputStyle, resize:'vertical', fontFamily:'inherit' }}/>
              </Field>
              {error && <div style={errorBoxStyle}>{error}</div>}
              <div style={{ display:'flex', gap:'.5rem', marginTop:'1rem' }}>
                <button onClick={() => setShowCreate(false)} style={btnGhostStyle}>Cancelar</button>
                <button onClick={createSuite} disabled={creating} style={{ ...btnPrimaryStyle, flex:1 }}>
                  {creating ? 'Creando...' : 'Crear suite'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Lista */}
        {loadingList ? (
          <div style={{ textAlign:'center', padding:'3rem', color:'#7070a0' }}>Cargando...</div>
        ) : suites.length === 0 ? (
          <div style={{
            padding:'4rem 2rem', textAlign:'center', background:'#0e0e1a',
            border:'1px dashed rgba(255,255,255,.1)', borderRadius:'14px',
          }}>
            <div style={{ fontSize:'3rem', marginBottom:'.75rem' }}>📦</div>
            <h3 style={{ fontSize:'1.125rem', color:'#f0f0fc', marginBottom:'.5rem' }}>
              Crea tu primera suite
            </h3>
            <p style={{ color:'#7070a0', fontSize:'.9375rem', marginBottom:'1.5rem' }}>
              Agrupa specs relacionados (login, checkout, perfil) y ejecútalos con un solo click.
            </p>
            <button onClick={() => setShowCreate(true)} style={btnPrimaryStyle}>
              + Crear suite
            </button>
          </div>
        ) : (
          <div style={{ display:'grid', gap:'.75rem' }}>
            {suites.map(suite => (
              <div key={suite.id}
                onClick={() => router.push(`/suites/${suite.id}`)}
                style={{
                  background:'#0e0e1a', border:'1px solid rgba(255,255,255,.07)',
                  borderRadius:'12px', padding:'1.125rem 1.25rem', cursor:'pointer',
                  transition:'border-color .15s, background .15s',
                  display:'flex', alignItems:'center', gap:'1rem',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(124,92,191,.3)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,.07)' }}
              >
                <div style={{ flex:1, minWidth:0 }}>
                  <h3 style={{ fontSize:'1rem', fontWeight:600, color:'#f0f0fc', marginBottom:'.25rem' }}>
                    {suite.name}
                  </h3>
                  {suite.description && (
                    <p style={{ fontSize:'.8125rem', color:'#7070a0', marginBottom:'.5rem' }}>
                      {suite.description}
                    </p>
                  )}
                  <div style={{ display:'flex', gap:'1rem', fontSize:'.75rem', color:'#5a5a7a' }}>
                    <span>📄 {suite.specCount} spec{suite.specCount !== 1 ? 's' : ''}</span>
                    {suite.lastRun && (
                      <>
                        <span>·</span>
                        <span>Último run: {formatDate(suite.lastRun.createdAt)}</span>
                        <span>·</span>
                        <RunStatusBadge run={suite.lastRun}/>
                      </>
                    )}
                  </div>
                </div>
                <div style={{ color:'#7070a0', fontSize:'1.25rem' }}>→</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function RunStatusBadge({ run }: any) {
  const colors: Record<string, [string, string]> = {
    completed: ['#22c55e', 'rgba(34,197,94,.12)'],
    failed:    ['#f87171', 'rgba(239,68,68,.12)'],
    running:   ['#26b5aa', 'rgba(38,181,170,.12)'],
    pending:   ['#7070a0', 'rgba(255,255,255,.05)'],
  }
  const [c, bg] = colors[run.status] || colors.pending
  return (
    <span style={{
      background:bg, color:c, padding:'1px 8px', borderRadius:4,
      fontWeight:600, fontSize:'.7rem',
    }}>
      {run.passed}✓ {run.failed}✗
    </span>
  )
}

function formatDate(iso: string) {
  const d = new Date(iso); const now = Date.now(); const diff = (now - d.getTime()) / 1000
  if (diff < 60)    return 'hace un momento'
  if (diff < 3600)  return `hace ${Math.floor(diff/60)} min`
  if (diff < 86400) return `hace ${Math.floor(diff/3600)}h`
  return d.toLocaleDateString('es-MX', { day:'numeric', month:'short' })
}

function Nav({ user }: any) {
  return (
    <nav style={{
      display:'flex', justifyContent:'space-between', alignItems:'center',
      padding:'1rem 2rem', borderBottom:'1px solid rgba(255,255,255,.07)', background:'#0e0e1a',
    }}>
      <a href="/dashboard" style={{ color:'#c4a8ff', textDecoration:'none', fontSize:'.875rem' }}>
        ← Dashboard
      </a>
      <div style={{ display:'flex', gap:'1rem', alignItems:'center' }}>
        <span style={{ fontSize:'.8125rem', color:'#7070a0' }}>
          {user.email} · <strong style={{ color:'#c4a8ff' }}>{user.plan}</strong>
        </span>
        <button onClick={logout} style={btnGhostStyle}>Salir</button>
      </div>
    </nav>
  )
}

function Field({ label, children }: any) {
  return (
    <div style={{ marginBottom:'.875rem' }}>
      <label style={{ display:'block', fontSize:'.75rem', color:'#7070a0', marginBottom:'.375rem', fontWeight:500 }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function Loading() {
  return <div style={{ minHeight:'100vh', background:'#08080f', display:'flex', alignItems:'center', justifyContent:'center', color:'#7070a0' }}>Cargando...</div>
}

// ── Styles ──
const inputStyle: React.CSSProperties = {
  width:'100%', background:'#141422', border:'1px solid rgba(255,255,255,.1)',
  borderRadius:'8px', padding:'.5rem .75rem', color:'#f0f0fc',
  fontSize:'.875rem', outline:'none', fontFamily:'inherit',
}
const btnPrimaryStyle: React.CSSProperties = {
  background:'#7c5cbf', color:'#fff', border:'none', borderRadius:'8px',
  padding:'.5rem 1rem', fontSize:'.875rem', fontWeight:600, cursor:'pointer',
  fontFamily:'inherit', boxShadow:'0 4px 20px rgba(124,92,191,.4)',
}
const btnSecondaryStyle: React.CSSProperties = {
  background:'transparent', color:'#c4c4d8',
  border:'1px solid rgba(255,255,255,.12)', borderRadius:'8px',
  padding:'.5rem 1rem', fontSize:'.875rem', fontWeight:500, cursor:'pointer',
  fontFamily:'inherit',
}
const btnGhostStyle: React.CSSProperties = {
  background:'transparent', border:'1px solid rgba(255,255,255,.1)',
  color:'#7070a0', borderRadius:'8px', padding:'.375rem .875rem',
  fontSize:'.75rem', cursor:'pointer', fontFamily:'inherit',
}
const modalOverlayStyle: React.CSSProperties = {
  position:'fixed', inset:0, background:'rgba(0,0,0,.7)',
  display:'flex', alignItems:'center', justifyContent:'center',
  zIndex:100, padding:'1rem',
}
const modalStyle: React.CSSProperties = {
  background:'#0e0e1a', border:'1px solid rgba(255,255,255,.1)',
  borderRadius:'14px', padding:'1.5rem', width:'100%', maxWidth:'440px',
}
const errorBoxStyle: React.CSSProperties = {
  background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.25)',
  borderRadius:'8px', padding:'.625rem .75rem', fontSize:'.8125rem',
  color:'#f87171', marginTop:'.5rem',
}
