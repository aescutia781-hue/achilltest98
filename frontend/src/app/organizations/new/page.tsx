'use client'

import { useState }      from 'react'
import { useRouter }     from 'next/navigation'
import { useAuth }       from '@/hooks/useAuth'
import { api, logout }   from '@/lib/api'

export default function NewOrganizationPage() {
  const router = useRouter()
  const { user, loading } = useAuth(true)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    setError('')
    if (!name.trim()) { setError('Nombre requerido'); return }
    setSaving(true)
    try {
      const r = await api.post('/api/organizations', {
        name:        name.trim(),
        description: description.trim() || null,
      })
      // El backend ya hace switch automático
      router.push(`/organizations/${r.data.id}`)
      setTimeout(() => location.reload(), 100)
    } catch (err: any) {
      setError(err.message); setSaving(false)
    }
  }

  if (loading) return <Loading/>
  if (!user) return null

  return (
    <div style={{ minHeight: '100vh', background: '#08080f', color: '#c4c4d8', fontFamily: 'Inter,system-ui,sans-serif' }}>
      <nav style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '1rem 2rem', borderBottom: '1px solid rgba(255,255,255,.07)', background: '#0e0e1a',
      }}>
        <a href="/dashboard" style={{ color: '#c4a8ff', textDecoration: 'none', fontSize: '.875rem' }}>← Dashboard</a>
        <button onClick={logout} style={{
          background: 'transparent', border: '1px solid rgba(255,255,255,.1)',
          color: '#7070a0', borderRadius: 8,
          padding: '.375rem .875rem', fontSize: '.75rem', cursor: 'pointer',
        }}>Salir</button>
      </nav>

      <div style={{ maxWidth: 540, margin: '0 auto', padding: '2.5rem 1.5rem' }}>
        <h1 style={{ fontSize: '1.625rem', fontWeight: 700, color: '#f0f0fc', marginBottom: '.5rem' }}>
          🏢 Nueva organización
        </h1>
        <p style={{ color: '#7070a0', fontSize: '.9375rem', marginBottom: '2rem' }}>
          Crea un workspace compartido para tu equipo de QA. Podrás invitar miembros,
          asignar roles, y compartir suites, runs e integraciones.
        </p>

        <div style={{
          background: '#0e0e1a', border: '1px solid rgba(255,255,255,.07)',
          borderRadius: 12, padding: '1.5rem',
        }}>
          <label style={{
            display: 'block', fontSize: '.75rem', color: '#7070a0',
            marginBottom: '.375rem', fontWeight: 500,
          }}>Nombre de la organización *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus
            placeholder="Ej. Acme Corp - QA Team"
            style={inputStyle}/>

          <label style={{
            display: 'block', fontSize: '.75rem', color: '#7070a0',
            marginBottom: '.375rem', marginTop: '1rem', fontWeight: 500,
          }}>Descripción (opcional)</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="Equipo de QA para el producto X"
            rows={3} style={{ ...inputStyle, resize: 'vertical' }}/>

          {error && (
            <div style={{
              background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)',
              borderRadius: 8, padding: '.5rem .75rem', fontSize: '.75rem',
              color: '#f87171', marginTop: '1rem',
            }}>{error}</div>
          )}

          <div style={{ display: 'flex', gap: '.5rem', marginTop: '1.5rem' }}>
            <button onClick={() => router.back()} style={btnGhostStyle}>Cancelar</button>
            <button onClick={submit} disabled={saving} style={{
              ...btnPrimaryStyle, flex: 1, opacity: saving ? .6 : 1,
            }}>
              {saving ? 'Creando...' : 'Crear organización'}
            </button>
          </div>
        </div>

        <div style={{
          marginTop: '1.25rem', fontSize: '.75rem', color: '#7070a0',
          padding: '.875rem 1rem',
          background: 'rgba(38,181,170,.06)',
          border: '1px solid rgba(38,181,170,.15)',
          borderRadius: 8,
        }}>
          💡 Al crear la org, te conviertes automáticamente en Owner. Podrás
          invitar miembros con un link compartible desde la pestaña "Invitaciones".
        </div>
      </div>
    </div>
  )
}

function Loading() {
  return <div style={{ minHeight: '100vh', background: '#08080f', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7070a0' }}>Cargando...</div>
}

const inputStyle: React.CSSProperties = {
  width: '100%', background: '#141422',
  border: '1px solid rgba(255,255,255,.1)', borderRadius: 8,
  padding: '.5rem .75rem', color: '#f0f0fc',
  fontSize: '.875rem', outline: 'none', fontFamily: 'inherit',
}
const btnPrimaryStyle: React.CSSProperties = {
  background: '#26b5aa', color: '#fff', border: 'none', borderRadius: 8,
  padding: '.625rem 1rem', fontSize: '.875rem', fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit',
  boxShadow: '0 4px 20px rgba(38,181,170,.3)',
}
const btnGhostStyle: React.CSSProperties = {
  background: 'transparent', border: '1px solid rgba(255,255,255,.1)',
  color: '#7070a0', borderRadius: 8,
  padding: '.625rem 1rem', fontSize: '.8125rem', cursor: 'pointer', fontFamily: 'inherit',
}
