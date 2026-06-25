'use client'

import { useEffect, useState }     from 'react'
import { useRouter, useParams }    from 'next/navigation'
import { useAuth }                 from '@/hooks/useAuth'
import { api, logout }             from '@/lib/api'
import { DeviceFrame }              from '@/components/DeviceFrame'

interface Device {
  id:        string
  name:      string
  category:  string
  brand:     string
  frameStyle:string
  viewport:  { width: number; height: number }
  defaultBrowserType: string
}

const MAX = 10

export default function EditDeviceFarmPage() {
  const router = useRouter()
  const params = useParams()
  const farmId = params.id as string
  const { user, loading } = useAuth(true)

  const [name,      setName]      = useState('')
  const [search,    setSearch]    = useState('')
  const [devices,   setDevices]   = useState<Device[]>([])
  const [selected,  setSelected]  = useState<string[]>([])
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')
  const [loadingPage, setLoadingPage] = useState(true)

  useEffect(() => {
    if (!user) return
    if (user.plan !== 'teammate') {
      router.push('/pricing')
      return
    }
    Promise.all([
      api.get('/api/devices'),
      api.get(`/api/device-farms/${farmId}`),
    ]).then(([dRes, fRes]) => {
      setDevices(dRes.data || [])
      setName(fRes.data?.name || '')
      setSelected((fRes.data?.devices || []).map((d: any) => d.deviceId))
    }).catch(err => setError(err.message))
      .finally(() => setLoadingPage(false))
  }, [user, farmId])

  function toggleDevice(id: string) {
    setSelected(prev => {
      if (prev.includes(id)) return prev.filter(d => d !== id)
      if (prev.length >= MAX) {
        setError(`Máximo ${MAX} dispositivos`)
        setTimeout(() => setError(''), 2000)
        return prev
      }
      return [...prev, id]
    })
  }

  async function save() {
    setError('')
    if (!name.trim()) { setError('Nombre requerido'); return }
    if (selected.length === 0) { setError('Selecciona al menos 1 dispositivo'); return }

    setSaving(true)
    try {
      await api.put(`/api/device-farms/${farmId}`, {
        name: name.trim(),
        devices: selected.map(id => ({ deviceId: id })),
      })
      router.push('/device-farms')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading || loadingPage) return <Loading/>
  if (!user || user.plan !== 'teammate') return null

  const filtered = search.trim()
    ? devices.filter(d => d.name.toLowerCase().includes(search.toLowerCase()))
    : devices

  const grouped: Record<string, Device[]> = { phone: [], tablet: [], foldable: [], desktop: [] }
  for (const d of filtered) {
    if (grouped[d.category]) grouped[d.category].push(d)
  }

  const CATEGORY_LABELS: Record<string, string> = {
    phone: '📱 Phones', tablet: '📋 Tablets', foldable: '📲 Foldables', desktop: '💻 Desktop',
  }

  const selectedDevices = selected
    .map(id => devices.find(d => d.id === id))
    .filter(Boolean) as Device[]

  return (
    <div style={{ minHeight:'100vh', background:'#08080f', color:'#c4c4d8', fontFamily:'Inter,system-ui,sans-serif' }}>
      <Nav user={user}/>

      <div style={{ maxWidth:'1400px', margin:'0 auto', padding:'2rem 1.5rem' }}>
        <div style={{ marginBottom:'1.5rem' }}>
          <a href="/device-farms" style={{ color:'#7070a0', fontSize:'.8125rem', textDecoration:'none' }}>
            ← Todas las farms
          </a>
          <h1 style={{ fontSize:'1.625rem', fontWeight:700, color:'#f0f0fc', marginTop:'.5rem', marginBottom:'.25rem' }}>
            Editar Device Farm
          </h1>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 380px', gap:'1.5rem' }} className="farm-grid">
          {/* Selector */}
          <div>
            <div style={cardStyle}>
              <Field label="Nombre de la farm">
                <input value={name} onChange={e => setName(e.target.value)} style={inputStyle}/>
              </Field>

              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', margin:'1.5rem 0 .75rem' }}>
                <h3 style={{ fontSize:'.9375rem', fontWeight:600, color:'#f0f0fc' }}>Dispositivos</h3>
                <span style={{
                  fontSize:'.75rem', fontWeight:600,
                  color: selected.length >= MAX ? '#f59e0b' : '#7070a0',
                }}>
                  {selected.length} / {MAX}
                </span>
              </div>

              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="🔍 Buscar dispositivo..."
                style={{ ...inputStyle, marginBottom:'1rem' }}/>

              {Object.entries(grouped).map(([cat, list]) => list.length > 0 && (
                <div key={cat} style={{ marginBottom:'1rem' }}>
                  <div style={{
                    fontSize:'.7rem', fontWeight:600, color:'#7070a0',
                    textTransform:'uppercase', letterSpacing:'.08em', marginBottom:'.5rem',
                  }}>
                    {CATEGORY_LABELS[cat]} ({list.length})
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(180px, 1fr))', gap:'.375rem' }}>
                    {list.map(d => {
                      const isSel = selected.includes(d.id)
                      const isDisabled = !isSel && selected.length >= MAX
                      return (
                        <button key={d.id} onClick={() => toggleDevice(d.id)} disabled={isDisabled} style={{
                          textAlign:'left',
                          background: isSel ? 'rgba(124,92,191,.18)' : '#141422',
                          border: `1px solid ${isSel ? '#7c5cbf' : 'rgba(255,255,255,.06)'}`,
                          borderRadius:'8px', padding:'.5rem .625rem',
                          cursor: isDisabled ? 'not-allowed' : 'pointer',
                          opacity: isDisabled ? .4 : 1,
                          fontFamily:'inherit',
                          display:'flex', alignItems:'center', gap:'.5rem',
                        }}>
                          <div style={{
                            width:18, height:18, borderRadius:4,
                            border: `2px solid ${isSel ? '#7c5cbf' : 'rgba(255,255,255,.15)'}`,
                            background: isSel ? '#7c5cbf' : 'transparent',
                            display:'flex', alignItems:'center', justifyContent:'center',
                            flexShrink:0,
                          }}>
                            {isSel && <span style={{ color:'#fff', fontSize:'.7rem' }}>✓</span>}
                          </div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:'.75rem', color:'#f0f0fc', fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                              {d.name}
                            </div>
                            <div style={{ fontSize:'.65rem', color:'#5a5a7a', fontFamily:'monospace' }}>
                              {d.viewport.width}×{d.viewport.height}
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div>
            <div style={cardStyle}>
              <h3 style={{ fontSize:'.9375rem', fontWeight:600, color:'#f0f0fc', marginBottom:'1rem' }}>
                Preview ({selected.length})
              </h3>

              {selected.length === 0 ? (
                <div style={{ padding:'2rem 1rem', textAlign:'center', border:'1px dashed rgba(255,255,255,.1)', borderRadius:'10px', color:'#5a5a7a', fontSize:'.8125rem' }}>
                  Selecciona al menos un dispositivo
                </div>
              ) : (
                <div style={{ display:'flex', flexWrap:'wrap', gap:'.75rem', justifyContent:'center', maxHeight:'500px', overflowY:'auto', padding:'.5rem' }}>
                  {selectedDevices.map(d => (
                    <div key={d.id} style={{ textAlign:'center', position:'relative' }}>
                      <button onClick={() => toggleDevice(d.id)} style={{
                        position:'absolute', top:-6, right:-6, zIndex:10,
                        width:20, height:20, borderRadius:'50%',
                        background:'#f87171', color:'#fff', border:'2px solid #08080f',
                        cursor:'pointer', fontSize:'.7rem', fontWeight:700,
                        display:'flex', alignItems:'center', justifyContent:'center',
                      }}>×</button>
                      <DeviceFrame
                        frameStyle={d.frameStyle}
                        viewportWidth={d.viewport.width}
                        viewportHeight={d.viewport.height}
                        brand={d.brand}
                        deviceName={d.name}
                        scale={d.category === 'desktop' ? 0.12 : 0.18}
                      >
                        <div style={{ width:'100%', height:'100%', background:'#1a1a2a', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'.6rem', color:'#5a5a7a' }}>
                          {d.name.split(' ').slice(-1)[0]}
                        </div>
                      </DeviceFrame>
                      <div style={{ fontSize:'.6rem', color:'#7070a0', marginTop:'.25rem', maxWidth:80, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {d.name}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {error && (
                <div style={{
                  background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.25)',
                  borderRadius:'8px', padding:'.5rem .75rem', fontSize:'.75rem',
                  color:'#f87171', marginTop:'.75rem',
                }}>{error}</div>
              )}

              <div style={{ marginTop:'1rem', display:'flex', gap:'.5rem' }}>
                <button onClick={() => router.push('/device-farms')} style={{
                  background:'transparent', border:'1px solid rgba(255,255,255,.1)',
                  color:'#7070a0', borderRadius:'8px', padding:'.625rem .875rem',
                  fontSize:'.8125rem', cursor:'pointer',
                }}>Cancelar</button>
                <button onClick={save} disabled={saving} style={{
                  background:'#7c5cbf', color:'#fff', border:'none', borderRadius:'8px',
                  padding:'.625rem 1rem', fontSize:'.875rem', fontWeight:600,
                  cursor: saving ? 'not-allowed' : 'pointer', flex:1,
                  opacity: saving ? .6 : 1,
                  boxShadow:'0 4px 20px rgba(124,92,191,.4)',
                }}>
                  {saving ? 'Guardando...' : '💾 Guardar cambios'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @media (max-width: 1000px) {
          :global(.farm-grid) {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  )
}

function Nav({ user }: any) {
  return (
    <nav style={{
      display:'flex', justifyContent:'space-between', alignItems:'center',
      padding:'1rem 2rem', borderBottom:'1px solid rgba(255,255,255,.07)', background:'#0e0e1a',
    }}>
      <a href="/device-farms" style={{ color:'#c4a8ff', textDecoration:'none', fontSize:'.875rem' }}>← Device Farms</a>
      <div style={{ display:'flex', gap:'1rem', alignItems:'center' }}>
        <span style={{ fontSize:'.8125rem', color:'#7070a0' }}>
          {user.email} · <strong style={{ color:'#c4a8ff' }}>{user.plan}</strong>
        </span>
        <button onClick={logout} style={{
          background:'transparent', border:'1px solid rgba(255,255,255,.1)',
          color:'#7070a0', borderRadius:'8px', padding:'.375rem .875rem',
          fontSize:'.75rem', cursor:'pointer',
        }}>Salir</button>
      </div>
    </nav>
  )
}

function Field({ label, children }: any) {
  return (
    <div>
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

const cardStyle: React.CSSProperties = {
  background:'#0e0e1a', border:'1px solid rgba(255,255,255,.07)',
  borderRadius:'14px', padding:'1.5rem',
}
const inputStyle: React.CSSProperties = {
  width:'100%', background:'#141422', border:'1px solid rgba(255,255,255,.1)',
  borderRadius:'8px', padding:'.5rem .75rem', color:'#f0f0fc',
  fontSize:'.875rem', outline:'none', fontFamily:'inherit',
}
