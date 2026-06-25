'use client'

import { useEffect, useState }      from 'react'
import { useRouter, useParams }     from 'next/navigation'
import { useAuth }                  from '@/hooks/useAuth'
import { api, logout }              from '@/lib/api'
import GithubPushModal              from '@/components/GithubPushModal'

interface Suite {
  id:          string
  name:        string
  description: string | null
  specs:       Spec[]
  recentRuns:  any[]
}

interface Spec {
  suiteSpecId: string
  executionId: string
  testName:    string
  targetUrl:   string
  hasSpecCode: boolean
  order:       number
}

interface DeviceFarm {
  id:      string
  name:    string
  devices: any[]
}

interface Execution {
  id:        string
  testName:  string
  targetUrl: string
  status:    string
}

export default function SuiteDetailPage() {
  const router = useRouter()
  const params = useParams()
  const suiteId = params.id as string
  const { user, loading } = useAuth(true)

  const [suite,         setSuite]         = useState<Suite | null>(null)
  const [loadingSuite,  setLoadingSuite]  = useState(true)
  const [showAddSpec,   setShowAddSpec]   = useState(false)
  const [availableExecs, setAvailableExecs] = useState<Execution[]>([])
  const [farms,         setFarms]         = useState<DeviceFarm[]>([])
  const [selectedFarm,  setSelectedFarm]  = useState<string>('none')
  const [running,       setRunning]       = useState(false)
  const [error,         setError]         = useState('')
  const [showGithubModal, setShowGithubModal] = useState(false)

  const isTeammate = user?.plan === 'teammate'

  useEffect(() => {
    if (!user) return
    loadSuite()
    if (isTeammate) loadFarms()
  }, [user, suiteId])

  async function loadSuite() {
    try {
      const r = await api.get(`/api/suites/${suiteId}`)
      setSuite(r.data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoadingSuite(false)
    }
  }

  async function loadFarms() {
    try {
      const r = await api.get('/api/device-farms')
      setFarms(r.data || [])
    } catch {}
  }

  async function openAddSpec() {
    try {
      const r = await api.get('/api/executions?limit=50')
      // Filtrar: solo completados que no estén ya en la suite
      const existingIds = new Set(suite?.specs.map(s => s.executionId) || [])
      const list = (r.data || [])
        .filter((e: any) => e.status === 'completed')
        .filter((e: any) => !existingIds.has(e.id))
      setAvailableExecs(list)
      setShowAddSpec(true)
    } catch (err: any) {
      setError(err.message)
    }
  }

  async function addSpec(executionId: string) {
    try {
      await api.post(`/api/suites/${suiteId}/specs`, { executionId })
      setShowAddSpec(false)
      loadSuite()
    } catch (err: any) {
      setError(err.message)
    }
  }

  async function removeSpec(suiteSpecId: string) {
    if (!confirm('¿Quitar este spec de la suite?')) return
    try {
      await api.delete(`/api/suites/${suiteId}/specs/${suiteSpecId}`)
      loadSuite()
    } catch (err: any) {
      setError(err.message)
    }
  }

  async function runSuite() {
    if (!suite?.specs.length) {
      setError('Agrega al menos 1 spec a la suite antes de ejecutarla')
      return
    }
    setRunning(true); setError('')
    try {
      const r = await api.post(`/api/suites/${suiteId}/run`, {
        deviceFarmId: selectedFarm === 'none' ? null : selectedFarm,
      })
      router.push(`/suites/${suiteId}/runs/${r.data.suiteRunId}`)
    } catch (err: any) {
      setError(err.message)
      setRunning(false)
    }
  }

  async function deleteSuite() {
    if (!confirm(`¿Eliminar la suite "${suite?.name}"? Esto NO borra los specs originales.`)) return
    try {
      await api.delete(`/api/suites/${suiteId}`)
      router.push('/suites')
    } catch (err: any) {
      setError(err.message)
    }
  }

  if (loading || loadingSuite) return <Loading/>
  if (!user)  return null
  if (!suite) return <Loading text="Suite no encontrada"/>

  const selectedFarmObj = farms.find(f => f.id === selectedFarm)
  const totalJobs = suite.specs.length * (selectedFarmObj?.devices.length || 1)

  return (
    <div style={{ minHeight:'100vh', background:'#08080f', color:'#c4c4d8', fontFamily:'Inter,system-ui,sans-serif' }}>
      <Nav user={user}/>

      <div style={{ maxWidth:'1100px', margin:'0 auto', padding:'2rem 1.5rem' }}>
        {/* Header */}
        <div style={{ marginBottom:'2rem' }}>
          <a href="/suites" style={{ color:'#7070a0', fontSize:'.8125rem', textDecoration:'none' }}>
            ← Todas las suites
          </a>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginTop:'.5rem', gap:'1rem', flexWrap:'wrap' }}>
            <div>
              <h1 style={{ fontSize:'1.625rem', fontWeight:700, color:'#f0f0fc', marginBottom:'.25rem' }}>
                {suite.name}
              </h1>
              {suite.description && (
                <p style={{ color:'#7070a0', fontSize:'.9375rem' }}>{suite.description}</p>
              )}
            </div>
            <div style={{ display:'flex', gap:'.5rem', flexWrap:'wrap' }}>
              <button onClick={() => setShowGithubModal(true)} style={{
                background: '#24292e', color: '#fff', border: 'none',
                borderRadius: 8, padding: '.5rem 1rem',
                fontSize: '.8125rem', fontWeight: 600, cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'inline-flex', alignItems: 'center', gap: '.5rem',
              }}>
                <svg width={14} height={14} viewBox="0 0 16 16" fill="#fff">
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
                </svg>
                Push to GitHub
              </button>
              <button onClick={deleteSuite} style={{ ...btnGhostStyle, color:'#f87171', borderColor:'rgba(239,68,68,.2)' }}>
                Eliminar suite
              </button>
            </div>
          </div>
        </div>

        {error && <div style={errorBoxStyle}>{error}</div>}

        <div style={{ display:'grid', gridTemplateColumns:'1fr 320px', gap:'1.5rem' }} className="suite-grid">
          {/* ── COLUMNA 1: Specs ── */}
          <div>
            <div style={cardStyle}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem' }}>
                <h3 style={{ fontSize:'.9375rem', fontWeight:600, color:'#f0f0fc' }}>
                  Specs en la suite ({suite.specs.length})
                </h3>
                <button onClick={openAddSpec} style={btnSecondaryStyle}>+ Agregar spec</button>
              </div>

              {suite.specs.length === 0 ? (
                <div style={{
                  padding:'2rem', textAlign:'center',
                  border:'1px dashed rgba(255,255,255,.1)', borderRadius:'10px',
                }}>
                  <div style={{ fontSize:'2rem', marginBottom:'.5rem' }}>📄</div>
                  <p style={{ color:'#7070a0', fontSize:'.875rem', marginBottom:'1rem' }}>
                    Esta suite está vacía. Agrega specs de tus ejecuciones anteriores.
                  </p>
                  <button onClick={openAddSpec} style={btnPrimaryStyle}>
                    + Agregar primer spec
                  </button>
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:'.5rem' }}>
                  {suite.specs.map((spec, i) => (
                    <div key={spec.suiteSpecId} style={specRowStyle}>
                      <div style={{
                        width:24, height:24, borderRadius:'50%',
                        background:'rgba(124,92,191,.15)', color:'#c4a8ff',
                        display:'flex', alignItems:'center', justifyContent:'center',
                        fontSize:'.75rem', fontWeight:700, flexShrink:0,
                      }}>{i+1}</div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:'.875rem', color:'#f0f0fc', fontWeight:500 }}>
                          {spec.testName}
                        </div>
                        <div style={{ fontSize:'.75rem', color:'#7070a0', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {spec.targetUrl}
                        </div>
                      </div>
                      <button onClick={() => removeSpec(spec.suiteSpecId)} style={iconBtnStyle}>✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Runs recientes */}
            {suite.recentRuns?.length > 0 && (
              <div style={{ ...cardStyle, marginTop:'1rem' }}>
                <h3 style={{ fontSize:'.9375rem', fontWeight:600, color:'#f0f0fc', marginBottom:'1rem' }}>
                  Runs recientes
                </h3>
                <div style={{ display:'flex', flexDirection:'column', gap:'.5rem' }}>
                  {suite.recentRuns.map(run => (
                    <div key={run.id}
                      onClick={() => router.push(`/suites/${suiteId}/runs/${run.id}`)}
                      style={{
                        ...specRowStyle, cursor:'pointer',
                      }}
                    >
                      <RunStatusDot status={run.status}/>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:'.8125rem', color:'#c4c4d8' }}>
                          {formatDate(run.createdAt)}
                        </div>
                        <div style={{ fontSize:'.7rem', color:'#5a5a7a' }}>
                          {run.totalSpecs} specs × {run.totalDevices} devices = {run.totalJobs} runs
                        </div>
                      </div>
                      <span style={{
                        fontSize:'.75rem', fontWeight:600, color: run.failed > 0 ? '#f87171' : '#22c55e',
                      }}>
                        {run.passed}✓ {run.failed}✗
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── COLUMNA 2: Ejecutar ── */}
          <div>
            <div style={cardStyle}>
              <h3 style={{ fontSize:'.9375rem', fontWeight:600, color:'#f0f0fc', marginBottom:'1rem' }}>
                Ejecutar suite
              </h3>

              {/* Device Farm selector (solo Teammate) */}
              {isTeammate ? (
                <Field label="Device Farm (opcional)">
                  <select
                    value={selectedFarm}
                    onChange={e => setSelectedFarm(e.target.value)}
                    style={{ ...inputStyle, cursor:'pointer' }}
                  >
                    <option value="none">Solo Desktop Chrome (1 device)</option>
                    {farms.map(f => (
                      <option key={f.id} value={f.id}>
                        🏭 {f.name} ({f.devices.length} devices)
                      </option>
                    ))}
                  </select>
                </Field>
              ) : (
                <div style={{
                  background:'rgba(245,158,11,.08)', border:'1px solid rgba(245,158,11,.2)',
                  borderRadius:'8px', padding:'.625rem .75rem', marginBottom:'1rem',
                }}>
                  <div style={{ fontSize:'.8125rem', color:'#f59e0b', fontWeight:600, marginBottom:'.25rem' }}>
                    🏭 Device Farm
                  </div>
                  <div style={{ fontSize:'.75rem', color:'#7070a0', marginBottom:'.5rem' }}>
                    Ejecuta contra hasta 10 dispositivos en paralelo. Exclusivo del plan Teammate.
                  </div>
                  <button onClick={() => router.push('/pricing')} style={{
                    background:'#f59e0b', color:'#000', border:'none',
                    borderRadius:'6px', padding:'.375rem .75rem',
                    fontSize:'.75rem', fontWeight:600, cursor:'pointer', width:'100%',
                  }}>
                    Actualizar a Teammate →
                  </button>
                </div>
              )}

              {/* Resumen */}
              <div style={{
                background:'#141422', border:'1px solid rgba(255,255,255,.05)',
                borderRadius:'8px', padding:'.75rem', marginBottom:'1rem',
              }}>
                <div style={{ fontSize:'.75rem', color:'#7070a0', marginBottom:'.5rem', textTransform:'uppercase', letterSpacing:'.05em', fontWeight:600 }}>
                  Resumen
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:'.8125rem', marginBottom:'.25rem' }}>
                  <span style={{ color:'#7070a0' }}>Specs</span>
                  <span style={{ color:'#f0f0fc', fontWeight:600 }}>{suite.specs.length}</span>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:'.8125rem', marginBottom:'.25rem' }}>
                  <span style={{ color:'#7070a0' }}>Devices</span>
                  <span style={{ color:'#f0f0fc', fontWeight:600 }}>{selectedFarmObj?.devices.length || 1}</span>
                </div>
                <div style={{
                  display:'flex', justifyContent:'space-between', fontSize:'.875rem',
                  paddingTop:'.5rem', borderTop:'1px solid rgba(255,255,255,.05)',
                  marginTop:'.5rem',
                }}>
                  <span style={{ color:'#c4a8ff', fontWeight:600 }}>Total runs</span>
                  <span style={{ color:'#c4a8ff', fontWeight:700, fontSize:'1rem' }}>{totalJobs}</span>
                </div>
              </div>

              <button
                onClick={runSuite}
                disabled={running || suite.specs.length === 0}
                style={{
                  ...btnPrimaryStyle,
                  width:'100%', padding:'.75rem',
                  opacity: (running || suite.specs.length === 0) ? 0.6 : 1,
                  cursor: (running || suite.specs.length === 0) ? 'not-allowed' : 'pointer',
                }}
              >
                {running ? 'Encolando...' : `▶ Ejecutar (${totalJobs} run${totalJobs !== 1 ? 's' : ''})`}
              </button>
            </div>
          </div>
        </div>

        {/* Modal Add Spec */}
        {showAddSpec && (
          <div style={modalOverlayStyle} onClick={() => setShowAddSpec(false)}>
            <div style={{ ...modalStyle, maxWidth:560 }} onClick={e => e.stopPropagation()}>
              <h2 style={{ fontSize:'1.125rem', fontWeight:700, color:'#f0f0fc', marginBottom:'1rem' }}>
                Agregar spec
              </h2>
              <p style={{ color:'#7070a0', fontSize:'.8125rem', marginBottom:'1rem' }}>
                Selecciona una ejecución completada para agregarla a la suite.
              </p>
              {availableExecs.length === 0 ? (
                <div style={{
                  padding:'2rem', textAlign:'center', color:'#7070a0', fontSize:'.875rem',
                  border:'1px dashed rgba(255,255,255,.1)', borderRadius:'8px',
                }}>
                  No hay ejecuciones disponibles.
                  <br/><br/>
                  <a href="/workspace" style={{ color:'#c4a8ff', textDecoration:'none' }}>
                    + Crear un nuevo spec primero
                  </a>
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:'.375rem', maxHeight:'400px', overflowY:'auto' }}>
                  {availableExecs.map(e => (
                    <button key={e.id} onClick={() => addSpec(e.id)} style={{
                      textAlign:'left', background:'#141422', border:'1px solid rgba(255,255,255,.07)',
                      borderRadius:'8px', padding:'.625rem .75rem', cursor:'pointer',
                      color:'#c4c4d8', fontFamily:'inherit', transition:'border-color .15s',
                    }}
                    onMouseEnter={ev => { ev.currentTarget.style.borderColor = 'rgba(124,92,191,.4)' }}
                    onMouseLeave={ev => { ev.currentTarget.style.borderColor = 'rgba(255,255,255,.07)' }}
                    >
                      <div style={{ fontSize:'.875rem', color:'#f0f0fc', fontWeight:500 }}>{e.testName}</div>
                      <div style={{ fontSize:'.7rem', color:'#7070a0', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {e.targetUrl}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              <div style={{ marginTop:'1rem' }}>
                <button onClick={() => setShowAddSpec(false)} style={btnGhostStyle}>Cerrar</button>
              </div>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        @media (max-width: 900px) {
          :global(.suite-grid) {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      {showGithubModal && (
        <GithubPushModal
          sourceType="suite"
          sourceId={suite.id}
          sourceName={suite.name}
          onClose={() => setShowGithubModal(false)}
        />
      )}
    </div>
  )
}

// ── COMPONENTES ──

function RunStatusDot({ status }: any) {
  const c = status === 'completed' ? '#22c55e'
          : status === 'failed'    ? '#f87171'
          : status === 'running'   ? '#26b5aa'
          : '#7070a0'
  return <div style={{ width:8, height:8, borderRadius:'50%', background:c, flexShrink:0 }}/>
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

function Loading({ text }: { text?: string } = {}) {
  return <div style={{ minHeight:'100vh', background:'#08080f', display:'flex', alignItems:'center', justifyContent:'center', color:'#7070a0' }}>{text || 'Cargando...'}</div>
}

function formatDate(iso: string) {
  const d = new Date(iso); const now = Date.now(); const diff = (now - d.getTime()) / 1000
  if (diff < 60)    return 'hace un momento'
  if (diff < 3600)  return `hace ${Math.floor(diff/60)} min`
  if (diff < 86400) return `hace ${Math.floor(diff/3600)}h`
  return d.toLocaleDateString('es-MX', { day:'numeric', month:'short' })
}

// ── Styles ──
const cardStyle: React.CSSProperties = {
  background:'#0e0e1a', border:'1px solid rgba(255,255,255,.07)',
  borderRadius:'14px', padding:'1.25rem',
}
const specRowStyle: React.CSSProperties = {
  display:'flex', alignItems:'center', gap:'.625rem',
  padding:'.625rem .75rem', background:'#141422',
  border:'1px solid rgba(255,255,255,.04)', borderRadius:'8px',
}
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
  padding:'.375rem .875rem', fontSize:'.8125rem', fontWeight:500,
  cursor:'pointer', fontFamily:'inherit',
}
const btnGhostStyle: React.CSSProperties = {
  background:'transparent', border:'1px solid rgba(255,255,255,.1)',
  color:'#7070a0', borderRadius:'8px', padding:'.375rem .875rem',
  fontSize:'.75rem', cursor:'pointer', fontFamily:'inherit',
}
const iconBtnStyle: React.CSSProperties = {
  background:'transparent', border:'none', color:'#7070a0',
  cursor:'pointer', fontSize:'.875rem', padding:'.25rem .5rem',
  borderRadius:'4px',
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
  color:'#f87171', marginBottom:'1rem',
}
