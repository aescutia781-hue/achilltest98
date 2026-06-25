'use client'

import { useEffect, useState }  from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth }              from '@/hooks/useAuth'
import { api }                  from '@/lib/api'

interface InviteInfo {
  organization: {
    id:         string
    name:       string
    slug:       string
    description: string | null
    avatarUrl:  string | null
    plan:       string
  }
  role:        'qa' | 'manager'
  memberCount: number
  expiresAt:   string | null
}

export default function JoinPage() {
  const router = useRouter()
  const params = useParams()
  const token = params.token as string

  const { user, loading: loadingAuth } = useAuth(false)  // No requiere auth (lo manejamos abajo)

  const [info, setInfo] = useState<InviteInfo | null>(null)
  const [loadingInfo, setLoadingInfo] = useState(true)
  const [error, setError] = useState('')
  const [accepting, setAccepting] = useState(false)

  useEffect(() => {
    lookupInvite()
  }, [token])

  async function lookupInvite() {
    try {
      const r = await api.get(`/api/organizations/invites/${token}`)
      setInfo(r.data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoadingInfo(false)
    }
  }

  async function accept() {
    if (!user) {
      // Guardar el token y redirigir a login
      sessionStorage.setItem('pending_invite_token', token)
      router.push(`/login?returnTo=${encodeURIComponent('/join/' + token)}`)
      return
    }
    setAccepting(true)
    try {
      const r = await api.post(`/api/organizations/invites/${token}/accept`, {})
      // Auto-redirigir al dashboard de la nueva org
      router.push('/dashboard')
      setTimeout(() => location.reload(), 100)
    } catch (err: any) {
      setError(err.message)
      setAccepting(false)
    }
  }

  if (loadingAuth || loadingInfo) {
    return <CenteredBox><div style={{ color: '#7070a0' }}>Cargando invitación...</div></CenteredBox>
  }

  if (error) {
    return (
      <CenteredBox>
        <div style={{ fontSize: '3rem', marginBottom: '.5rem' }}>🚫</div>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f87171', marginBottom: '.5rem' }}>
          Invitación no válida
        </h1>
        <p style={{ color: '#7070a0', fontSize: '.875rem', marginBottom: '1.5rem' }}>
          {error}
        </p>
        <button onClick={() => router.push('/dashboard')} style={btnPrimaryStyle}>
          Ir al dashboard
        </button>
      </CenteredBox>
    )
  }

  if (!info) return null

  const initial = info.organization.name.charAt(0).toUpperCase()
  const roleLabels: Record<string, string> = {
    qa:      'QA - acceso a tests, ejecuciones, reportes',
    manager: 'Manager - admin técnico (no billing)',
  }

  return (
    <CenteredBox>
      <div style={{
        width: 72, height: 72, borderRadius: '50%', margin: '0 auto 1rem',
        background: info.organization.avatarUrl
          ? `url(${info.organization.avatarUrl})`
          : 'linear-gradient(135deg, #7c5cbf, #26b5aa)',
        backgroundSize: 'cover',
        color: '#fff', fontSize: '1.875rem', fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {!info.organization.avatarUrl && initial}
      </div>

      <h1 style={{ fontSize: '1.375rem', fontWeight: 700, color: '#f0f0fc', marginBottom: '.5rem' }}>
        Te invitan a unirte a
      </h1>
      <h2 style={{ fontSize: '1.625rem', fontWeight: 800, color: '#c4a8ff', marginBottom: '.25rem' }}>
        {info.organization.name}
      </h2>

      {info.organization.description && (
        <p style={{ color: '#7070a0', fontSize: '.875rem', marginBottom: '1rem' }}>
          {info.organization.description}
        </p>
      )}

      <div style={{
        background: '#141422', borderRadius: 10, padding: '1rem',
        marginBottom: '1.5rem', textAlign: 'left',
      }}>
        <Row label="Rol al unirte"  value={roleLabels[info.role] || info.role}/>
        <Row label="Miembros actuales" value={`${info.memberCount} ${info.memberCount === 1 ? 'miembro' : 'miembros'}`}/>
        <Row label="Plan"           value={info.organization.plan}/>
        {info.expiresAt && (
          <Row label="Expira" value={new Date(info.expiresAt).toLocaleString('es-MX')}/>
        )}
      </div>

      {!user ? (
        <>
          <div style={{
            background: 'rgba(38,181,170,.06)',
            border: '1px solid rgba(38,181,170,.15)',
            borderRadius: 8, padding: '.625rem .75rem',
            fontSize: '.75rem', color: '#7070a0', marginBottom: '1rem',
          }}>
            Necesitas iniciar sesión o crear una cuenta para aceptar esta invitación.
          </div>
          <div style={{ display: 'flex', gap: '.5rem' }}>
            <button onClick={() => {
              sessionStorage.setItem('pending_invite_token', token)
              router.push(`/login?returnTo=${encodeURIComponent('/join/' + token)}`)
            }} style={{ ...btnPrimaryStyle, flex: 1 }}>
              Iniciar sesión
            </button>
            <button onClick={() => {
              sessionStorage.setItem('pending_invite_token', token)
              router.push(`/register?returnTo=${encodeURIComponent('/join/' + token)}`)
            }} style={{ ...btnSecondaryStyle, flex: 1 }}>
              Registrarme
            </button>
          </div>
        </>
      ) : (
        <button onClick={accept} disabled={accepting} style={{
          ...btnPrimaryStyle, width: '100%',
          opacity: accepting ? .6 : 1,
        }}>
          {accepting ? 'Uniéndote...' : '✓ Aceptar invitación'}
        </button>
      )}
    </CenteredBox>
  )
}

function CenteredBox({ children }: any) {
  return (
    <div style={{
      minHeight: '100vh', background: '#08080f',
      color: '#c4c4d8', fontFamily: 'Inter,system-ui,sans-serif',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1rem',
    }}>
      <div style={{
        background: '#0e0e1a',
        border: '1px solid rgba(255,255,255,.07)',
        borderRadius: 14, padding: '2rem 1.75rem',
        width: '100%', maxWidth: 460,
        textAlign: 'center',
      }}>
        {children}
      </div>
    </div>
  )
}

function Row({ label, value }: any) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '.3125rem 0',
      borderBottom: '1px solid rgba(255,255,255,.04)',
      fontSize: '.8125rem',
    }}>
      <span style={{ color: '#7070a0' }}>{label}</span>
      <span style={{ color: '#f0f0fc', fontWeight: 500 }}>{value}</span>
    </div>
  )
}

const btnPrimaryStyle: React.CSSProperties = {
  background: '#26b5aa', color: '#fff', border: 'none', borderRadius: 8,
  padding: '.625rem 1rem', fontSize: '.9375rem', fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit',
  boxShadow: '0 4px 20px rgba(38,181,170,.3)',
}
const btnSecondaryStyle: React.CSSProperties = {
  background: 'transparent', color: '#c4c4d8',
  border: '1px solid rgba(255,255,255,.12)', borderRadius: 8,
  padding: '.625rem 1rem', fontSize: '.9375rem', fontWeight: 500,
  cursor: 'pointer', fontFamily: 'inherit',
}
