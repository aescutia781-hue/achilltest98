'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { api } from '@/lib/api'

type State = 'verifying' | 'success' | 'error'

export default function VerifyEmailPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams?.get('token')

  const [state, setState] = useState<State>('verifying')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) {
      setState('error')
      setError('Falta el token en el link. Asegúrate de copiar la URL completa.')
      return
    }
    verify()
  }, [token])

  async function verify() {
    try {
      await api.post('/api/auth/verify-email', { token })
      setState('success')
    } catch (err: any) {
      setError(err.message || 'No se pudo verificar el email')
      setState('error')
    }
  }

  return (
    <CenteredBox>
      {state === 'verifying' && (
        <>
          <div style={{
            width: 56, height: 56, margin: '0 auto 1rem',
            border: '4px solid rgba(124,92,191,.2)',
            borderTopColor: '#7c5cbf',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }}/>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          <h1 style={titleStyle}>Verificando tu email...</h1>
          <p style={subtitleStyle}>Esto solo toma un momento.</p>
        </>
      )}

      {state === 'success' && (
        <>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✓</div>
          <h1 style={{ ...titleStyle, color: '#22c55e' }}>¡Email verificado!</h1>
          <p style={subtitleStyle}>
            Tu email está confirmado. Ahora puedes usar todas las funciones de Achilltest.
          </p>
          <button onClick={() => router.push('/dashboard')} style={btnPrimaryStyle}>
            Ir al dashboard →
          </button>
        </>
      )}

      {state === 'error' && (
        <>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✗</div>
          <h1 style={{ ...titleStyle, color: '#f87171' }}>No se pudo verificar</h1>
          <p style={subtitleStyle}>{error}</p>
          <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => router.push('/dashboard')} style={btnGhostStyle}>
              Ir al dashboard
            </button>
            <button onClick={() => router.push('/login')} style={btnPrimaryStyle}>
              Iniciar sesión
            </button>
          </div>
          <p style={{ fontSize: '.75rem', color: '#7070a0', marginTop: '1.5rem' }}>
            Desde el dashboard puedes solicitar un nuevo link de verificación.
          </p>
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
        borderRadius: 14, padding: '2.5rem 2rem',
        width: '100%', maxWidth: 460,
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
const btnPrimaryStyle: React.CSSProperties = {
  background: '#7c5cbf', color: '#fff', border: 'none', borderRadius: 10,
  padding: '.75rem 1.5rem', fontSize: '.9375rem', fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit',
  boxShadow: '0 4px 20px rgba(124,92,191,.3)',
}
const btnGhostStyle: React.CSSProperties = {
  background: 'transparent', border: '1px solid rgba(255,255,255,.12)',
  color: '#c4c4d8', borderRadius: 10,
  padding: '.75rem 1.25rem', fontSize: '.875rem', fontWeight: 500,
  cursor: 'pointer', fontFamily: 'inherit',
}
