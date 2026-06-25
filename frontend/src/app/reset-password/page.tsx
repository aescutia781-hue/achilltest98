'use client'

import { useEffect, useState }       from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { api }                       from '@/lib/api'

type State = 'validating' | 'ready' | 'submitting' | 'success' | 'invalid'

export default function ResetPasswordPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams?.get('token') || ''

  const [state, setState] = useState<State>('validating')
  const [tokenError, setTokenError] = useState('')

  const [newPassword, setNewPassword]   = useState('')
  const [confirm, setConfirm]           = useState('')
  const [error, setError]               = useState('')

  useEffect(() => {
    if (!token) {
      setTokenError('Falta el token en el link')
      setState('invalid')
      return
    }
    // Validar token (peek = sin consumirlo)
    api.get(`/api/auth/peek-token?token=${encodeURIComponent(token)}`)
      .then(r => {
        if (r.data?.valid && r.data?.type === 'password_reset') {
          setState('ready')
        } else {
          setTokenError(r.data?.error || 'Este link no es válido o expiró.')
          setState('invalid')
        }
      })
      .catch(err => {
        setTokenError(err.message || 'No se pudo validar el link')
        setState('invalid')
      })
  }, [token])

  async function submit() {
    setError('')

    if (newPassword.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres')
      return
    }
    if (newPassword !== confirm) {
      setError('Las contraseñas no coinciden')
      return
    }

    setState('submitting')
    try {
      await api.post('/api/auth/reset-password', { token, newPassword })
      setState('success')
    } catch (err: any) {
      setError(err.message || 'No se pudo cambiar la contraseña')
      setState('ready')
    }
  }

  return (
    <CenteredBox>
      {state === 'validating' && (
        <>
          <div style={{
            width: 40, height: 40, margin: '0 auto 1rem',
            border: '3px solid rgba(124,92,191,.2)',
            borderTopColor: '#7c5cbf',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }}/>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          <p style={{ color: '#7070a0', fontSize: '.875rem' }}>Validando link...</p>
        </>
      )}

      {state === 'invalid' && (
        <>
          <div style={{ fontSize: '2.5rem', marginBottom: '.75rem' }}>⚠️</div>
          <h1 style={{ ...titleStyle, color: '#f87171' }}>Link inválido</h1>
          <p style={subtitleStyle}>{tokenError}</p>
          <button onClick={() => router.push('/forgot-password')} style={btnPrimaryStyle}>
            Solicitar nuevo link
          </button>
        </>
      )}

      {(state === 'ready' || state === 'submitting') && (
        <>
          <h1 style={titleStyle}>🔐 Nueva contraseña</h1>
          <p style={subtitleStyle}>
            Elige una contraseña de al menos 8 caracteres.
          </p>

          <div style={{ textAlign: 'left' }}>
            <label style={labelStyle}>Nueva contraseña</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Al menos 8 caracteres"
              style={inputStyle}
              autoFocus
            />

            <label style={{ ...labelStyle, marginTop: '.75rem' }}>Confirma la contraseña</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="La misma contraseña"
              style={inputStyle}
            />
          </div>

          {error && (
            <div style={{
              background: 'rgba(239,68,68,.1)',
              border: '1px solid rgba(239,68,68,.25)',
              borderRadius: 8, padding: '.5rem .75rem',
              fontSize: '.8125rem', color: '#f87171',
              marginTop: '.75rem', textAlign: 'left',
            }}>{error}</div>
          )}

          <button
            onClick={submit}
            disabled={state === 'submitting'}
            style={{
              ...btnPrimaryStyle, width: '100%',
              opacity: state === 'submitting' ? .6 : 1,
              marginTop: '1.25rem',
            }}
          >
            {state === 'submitting' ? 'Guardando...' : 'Cambiar contraseña'}
          </button>
        </>
      )}

      {state === 'success' && (
        <>
          <div style={{ fontSize: '3rem', marginBottom: '.75rem' }}>✓</div>
          <h1 style={{ ...titleStyle, color: '#22c55e' }}>¡Listo!</h1>
          <p style={subtitleStyle}>
            Tu contraseña se actualizó. Ya puedes iniciar sesión.
          </p>
          <button onClick={() => router.push('/login')} style={btnPrimaryStyle}>
            Iniciar sesión →
          </button>
        </>
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
        borderRadius: 14, padding: '2.25rem 1.75rem',
        width: '100%', maxWidth: 420,
        textAlign: 'center',
      }}>
        {children}
      </div>
    </div>
  )
}

const titleStyle: React.CSSProperties = {
  fontSize: '1.375rem', fontWeight: 700, color: '#f0f0fc',
  marginBottom: '.5rem',
}
const subtitleStyle: React.CSSProperties = {
  color: '#7070a0', fontSize: '.9375rem',
  marginBottom: '1.5rem', lineHeight: 1.6,
}
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '.75rem', color: '#7070a0',
  marginBottom: '.375rem', fontWeight: 500,
}
const inputStyle: React.CSSProperties = {
  width: '100%', background: '#141422',
  border: '1px solid rgba(255,255,255,.1)', borderRadius: 8,
  padding: '.625rem .875rem', color: '#f0f0fc',
  fontSize: '.9375rem', outline: 'none', fontFamily: 'inherit',
}
const btnPrimaryStyle: React.CSSProperties = {
  background: '#7c5cbf', color: '#fff', border: 'none', borderRadius: 10,
  padding: '.75rem 1.5rem', fontSize: '.9375rem', fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit',
  boxShadow: '0 4px 20px rgba(124,92,191,.3)',
}
