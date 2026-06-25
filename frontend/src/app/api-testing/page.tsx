'use client'

import { useEffect, useState }  from 'react'
import { useRouter }            from 'next/navigation'
import { useAuth }              from '@/hooks/useAuth'
import { api, logout }          from '@/lib/api'

interface Collection {
  id:             string
  name:           string
  description:    string | null
  contractType:   string
  baseUrl:        string | null
  totalEndpoints: number
  totalTests:     number
  createdAt:      string
  updatedAt:      string
}

export default function ApiTestingPage() {
  const router = useRouter()
  const { user, loading } = useAuth(true)
  const [collections, setCollections] = useState<Collection[]>([])
  const [loadingList, setLoadingList] = useState(true)

  useEffect(() => {
    if (!user) return
    if (user.plan !== 'teammate') {
      router.push('/pricing')
      return
    }
    loadCollections()
  }, [user])

  async function loadCollections() {
    try {
      const r = await api.get('/api/api-testing/collections')
      setCollections(r.data || [])
    } catch {}
    finally { setLoadingList(false) }
  }

  async function deleteCollection(id: string, name: string) {
    if (!confirm(`¿Eliminar "${name}" y todos sus tests?`)) return
    try {
      await api.delete(`/api/api-testing/collections/${id}`)
      loadCollections()
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
              🔌 API Testing
            </h1>
            <p style={{ color:'#7070a0', fontSize:'.9375rem' }}>
              Importa OpenAPI/Postman y Achilltest genera tests automáticos con OTP, encriptación y más
            </p>
          </div>
          <button onClick={() => router.push('/api-testing/new')} style={btnPrimaryStyle}>
            + Importar contrato
          </button>
        </div>

        {collections.length === 0 ? (
          <div style={{
            padding:'4rem 2rem', textAlign:'center', background:'#0e0e1a',
            border:'1px dashed rgba(255,255,255,.1)', borderRadius:'14px',
          }}>
            <div style={{ fontSize:'3rem', marginBottom:'.75rem' }}>🔌</div>
            <h3 style={{ fontSize:'1.125rem', color:'#f0f0fc', marginBottom:'.5rem' }}>
              Importa tu primer contrato
            </h3>
            <p style={{ color:'#7070a0', fontSize:'.9375rem', marginBottom:'1.5rem' }}>
              Sube un OpenAPI o Postman Collection. Achilltest genera<br/>
              automáticamente tests para cada endpoint en segundos.
            </p>
            <button onClick={() => router.push('/api-testing/new')} style={btnPrimaryStyle}>
              + Importar contrato
            </button>
          </div>
        ) : (
          <div style={{ display:'grid', gap:'.75rem' }}>
            {collections.map(c => (
              <div key={c.id} style={{
                background:'#0e0e1a', border:'1px solid rgba(255,255,255,.07)',
                borderRadius:'12px', padding:'1.125rem 1.25rem',
                display:'flex', justifyContent:'space-between', alignItems:'center', gap:'1rem',
              }}>
                <div style={{ flex:1, cursor:'pointer', minWidth:0 }}
                  onClick={() => router.push(`/api-testing/${c.id}`)}>
                  <div style={{ display:'flex', alignItems:'center', gap:'.5rem', marginBottom:'.25rem' }}>
                    <h3 style={{ fontSize:'1rem', fontWeight:600, color:'#f0f0fc' }}>{c.name}</h3>
                    <span style={chipStyle}>{c.contractType === 'openapi' ? 'OpenAPI' : 'Postman'}</span>
                  </div>
                  {c.description && (
                    <div style={{ fontSize:'.8125rem', color:'#7070a0', marginBottom:'.25rem' }}>{c.description}</div>
                  )}
                  <div style={{ fontSize:'.75rem', color:'#5a5a7a', display:'flex', gap:'1rem' }}>
                    <span>📍 {c.totalEndpoints} endpoints</span>
                    <span>🧪 {c.totalTests} tests</span>
                    {c.baseUrl && (
                      <span style={{ fontFamily:'monospace', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:280 }}>
                        🌐 {c.baseUrl}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display:'flex', gap:'.375rem' }}>
                  <button onClick={() => router.push(`/api-testing/${c.id}`)} style={btnSmallStyle}>
                    Ver
                  </button>
                  <button onClick={() => deleteCollection(c.id, c.name)}
                    style={{ ...btnSmallStyle, color:'#f87171', borderColor:'rgba(239,68,68,.2)' }}>
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Nav({ user }: any) {
  return (
    <nav style={{
      display:'flex', justifyContent:'space-between', alignItems:'center',
      padding:'1rem 2rem', borderBottom:'1px solid rgba(255,255,255,.07)', background:'#0e0e1a',
    }}>
      <a href="/dashboard" style={{ color:'#c4a8ff', textDecoration:'none', fontSize:'.875rem' }}>← Dashboard</a>
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
  background:'rgba(124,92,191,.15)', color:'#c4a8ff',
  padding:'.125rem .5rem', borderRadius:4, fontSize:'.6875rem',
  fontWeight:600, textTransform:'uppercase', letterSpacing:'.05em',
}
