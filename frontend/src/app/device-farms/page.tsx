'use client'

import { useEffect, useState }  from 'react'
import { useRouter }            from 'next/navigation'
import { useAuth }              from '@/hooks/useAuth'
import { api, logout }          from '@/lib/api'

interface Farm {
  id:        string
  name:      string
  devices:   Array<{ deviceId: string; name: string; brand: string; viewport: any }>
  createdAt: string
  updatedAt: string
}

export default function DeviceFarmsPage() {
  const router = useRouter()
  const { user, loading } = useAuth(true)
  const [farms, setFarms] = useState<Farm[]>([])
  const [loadingList, setLoadingList] = useState(true)

  useEffect(() => {
    if (!user) return
    if (user.plan !== 'teammate') {
      router.push('/pricing')
      return
    }
    loadFarms()
  }, [user])

  async function loadFarms() {
    try {
      const r = await api.get('/api/device-farms')
      setFarms(r.data || [])
    } catch {} finally {
      setLoadingList(false)
    }
  }

  async function deleteFarm(id: string, name: string) {
    if (!confirm(`¿Eliminar la farm "${name}"?`)) return
    try {
      await api.delete(`/api/device-farms/${id}`)
      loadFarms()
    } catch (err: any) {
      alert(err.message)
    }
  }

  if (loading || loadingList) return <Loading/>
  if (!user || user.plan !== 'teammate') return null

  return (
    <div style={{ minHeight:'100vh', background:'#08080f', color:'#c4c4d8', fontFamily:'Inter,system-ui,sans-serif' }}>
      <Nav user={user}/>

      <div style={{ maxWidth:'1100px', margin:'0 auto', padding:'2rem 1.5rem' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.5rem', flexWrap:'wrap', gap:'1rem' }}>
          <div>
            <h1 style={{ fontSize:'1.625rem', fontWeight:700, color:'#f0f0fc', marginBottom:'.25rem' }}>
              🏭 Device Farms
            </h1>
            <p style={{ color:'#7070a0', fontSize:'.9375rem' }}>
              Configura grupos de hasta 10 dispositivos para correr tus suites en paralelo
            </p>
          </div>
          <button onClick={() => router.push('/device-farms/new')} style={btnPrimaryStyle}>
            + Nueva farm
          </button>
        </div>

        {farms.length === 0 ? (
          <div style={{
            padding:'4rem 2rem', textAlign:'center', background:'#0e0e1a',
            border:'1px dashed rgba(255,255,255,.1)', borderRadius:'14px',
          }}>
            <div style={{ fontSize:'3rem', marginBottom:'.75rem' }}>🏭</div>
            <h3 style={{ fontSize:'1.125rem', color:'#f0f0fc', marginBottom:'.5rem' }}>
              Crea tu primera Device Farm
            </h3>
            <p style={{ color:'#7070a0', fontSize:'.9375rem', marginBottom:'1.5rem' }}>
              Como AWS Device Farm o BrowserStack — elige hasta 10 dispositivos<br/>
              y ejecuta tus suites contra todos en paralelo.
            </p>
            <button onClick={() => router.push('/device-farms/new')} style={btnPrimaryStyle}>
              + Crear primera farm
            </button>
          </div>
        ) : (
          <div style={{ display:'grid', gap:'.75rem' }}>
            {farms.map(farm => (
              <div key={farm.id} style={{
                background:'#0e0e1a', border:'1px solid rgba(255,255,255,.07)',
                borderRadius:'12px', padding:'1.125rem 1.25rem',
              }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'.75rem', gap:'1rem' }}>
                  <div style={{ flex:1, cursor:'pointer' }}
                    onClick={() => router.push(`/device-farms/${farm.id}`)}>
                    <h3 style={{ fontSize:'1rem', fontWeight:600, color:'#f0f0fc', marginBottom:'.25rem' }}>
                      {farm.name}
                    </h3>
                    <div style={{ fontSize:'.75rem', color:'#7070a0' }}>
                      {farm.devices.length} dispositivo{farm.devices.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:'.375rem' }}>
                    <button onClick={() => router.push(`/device-farms/${farm.id}`)} style={btnSmallStyle}>
                      Editar
                    </button>
                    <button onClick={() => deleteFarm(farm.id, farm.name)}
                      style={{ ...btnSmallStyle, color:'#f87171', borderColor:'rgba(239,68,68,.2)' }}>
                      Eliminar
                    </button>
                  </div>
                </div>

                {/* Chips de devices */}
                <div style={{ display:'flex', flexWrap:'wrap', gap:'.375rem' }}>
                  {farm.devices.map((d, i) => (
                    <span key={i} style={chipStyle}>
                      {brandEmoji(d.brand)} {d.name}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function brandEmoji(brand: string) {
  const map: Record<string,string> = {
    apple: '🍎', samsung: '📱', google: '🔵',
    motorola: 'Ⓜ️', lg: '◽', amazon: '🔥',
    blackberry: '⚫', nokia: '⬛', desktop: '🖥️', other: '📱',
  }
  return map[brand] || '📱'
}

function Nav({ user }: any) {
  return (
    <nav style={{
      display:'flex', justifyContent:'space-between', alignItems:'center',
      padding:'1rem 2rem', borderBottom:'1px solid rgba(255,255,255,.07)', background:'#0e0e1a',
    }}>
      <a href="/suites" style={{ color:'#c4a8ff', textDecoration:'none', fontSize:'.875rem' }}>← Suites</a>
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

function Loading() {
  return <div style={{ minHeight:'100vh', background:'#08080f', display:'flex', alignItems:'center', justifyContent:'center', color:'#7070a0' }}>Cargando...</div>
}

const btnPrimaryStyle: React.CSSProperties = {
  background:'#7c5cbf', color:'#fff', border:'none', borderRadius:'8px',
  padding:'.5rem 1rem', fontSize:'.875rem', fontWeight:600, cursor:'pointer',
  fontFamily:'inherit', boxShadow:'0 4px 20px rgba(124,92,191,.4)',
}
const btnSmallStyle: React.CSSProperties = {
  background:'transparent', border:'1px solid rgba(255,255,255,.12)',
  color:'#c4c4d8', borderRadius:'6px', padding:'.3125rem .625rem',
  fontSize:'.75rem', cursor:'pointer', fontFamily:'inherit',
}
const chipStyle: React.CSSProperties = {
  display:'inline-flex', alignItems:'center', gap:'.25rem',
  background:'#141422', border:'1px solid rgba(255,255,255,.07)',
  borderRadius:'6px', padding:'.25rem .5rem',
  fontSize:'.7rem', color:'#c4c4d8',
}
