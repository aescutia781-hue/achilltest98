'use client'

import { useState }  from 'react'
import { useRouter } from 'next/navigation'
import { api }       from '@/lib/api'

export default function ForgotPasswordPage() {
  const router = useRouter()
  const [email, setEmail]     = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent]       = useState(false)
  const [error, setError]     = useState('')

  async function submit() {
    setError('')
    if (!email.trim()) { setError('Email requerido'); return }
    setSending(true)
    try {
      const r = await api.post('/api/auth/forgot-password', { email: email.trim() })
      // El backend SIEMPRE responde 200 (anti-enumeration)
      setSent(true)
    } catch (err: any) {
      setError(err.message || 'Algo salió mal. Intenta de nuevo.')
    } finally {
      setSending(false)
    }
  }

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
        borderRadius: 14, padding: '2rem',
        width: '100%', maxWidth: 420,
      }}>
        {!sent ? (
          <>
            <h1 style={{
              fontSize: '1.5rem', fontWeight: 700, color: '#f0f0fc',
              marginBottom: '.5rem', textAlign: 'center',
            }}>
              🔑 Recupera tu contraseña
            </h1>
            <p style={{
              color: '#7070a0', fontSize: '.875rem',
              marginBottom: '1.5rem', textAlign: 'center', lineHeight: 1.55,
            }}>
              Te enviaremos un link a tu email para que crees una nueva contraseña.
            </p>

            <label style={labelStyle}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="tu@email.com"
              autoFocus
              style={inputStyle}
            />

            {error && (
              <div style={{
                background: 'rgba(239,68,68,.1)',
                border: '1px solid rgba(239,68,68,.25)',
                borderRadius: 8, padding: '.5rem .75rem',
                fontSize: '.8125rem', color: '#f87171',
                marginTop: '.75rem',
              }}>{error}</div>
            )}

            <button onClick={submit} disabled={sending} style={{
              ...btnPrimaryStyle, width: '100%',
              opacity: sending ? .6 : 1,
              marginTop: '1.25rem',
            }}>
              {sending ? 'Enviando...' : 'Enviar link de recuperación'}
            </button>

            <div style={{
              marginTop: '1.5rem', textAlign: 'center', fontSize: '.8125rem', color: '#7070a0',
            }}>
              ¿Recordaste tu contraseña?{' '}
              <button onClick={() => router.push('/login')} style={linkBtnStyle}>
                Volver a login
              </button>
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '.75rem' }}>📬</div>
            <h1 style={{
              fontSize: '1.25rem', fontWeight: 700, color: '#22c55e',
              marginBottom: '.5rem',
            }}>
              Revisa tu email
            </h1>
            <p style={{ color: '#c4c4d8', fontSize: '.9375rem', lineHeight: 1.6, marginBottom: '1rem' }}>
              Si <strong>{email}</strong> está registrado, recibirás un link de recuperación en los próximos minutos.
            </p>
            <p style={{ color: '#7070a0', fontSize: '.75rem', marginBottom: '1.5rem' }}>
              Revisa también tu carpeta de spam. El link expira en 1 hora.
            </p>
            <button onClick={() => router.push('/login')} style={btnPrimaryStyle}>
              Volver a login
            </button>
          </div>
        )}
      </div>
    </div>
  )
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
const linkBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  color: '#c4a8ff', fontSize: '.8125rem', fontWeight: 500,
  textDecoration: 'underline', fontFamily: 'inherit', padding: 0,
}
