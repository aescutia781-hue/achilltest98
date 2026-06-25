'use client'
import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

export default function RegisterPage() {
  const router       = useRouter()
  const params       = useSearchParams()
  const planFromURL  = params.get('plan') || 'starter'

  const [form,     setForm]     = useState({ name: '', email: '', password: '' })
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  const PLAN_LABELS: Record<string, string> = {
    starter:  'Starter — $78.99/mes',
    teammate: 'Teammate — $128.99/mes',
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) {
      setError('Completa todos los campos')
      return
    }
    if (form.password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres')
      return
    }

    setLoading(true); setError('')

    try {
      const res = await fetch('/api/auth/register', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ...form, plan: 'trial' }),
      })
      const data = await res.json()

      if (!res.ok || !data.success) {
        setError(data.error || 'Error al registrarse')
        return
      }

      // Guardar token
      localStorage.setItem('token', data.data.token)

      // Si eligió un plan → ir a pricing para pagar
      if (planFromURL && planFromURL !== 'trial') {
        router.push(`/pricing?plan=${planFromURL}&new=true`)
      } else {
        router.push('/onboarding')
      }
    } catch {
      setError('Error de conexión. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight:'100vh', background:'#08080f',
      display:'flex', alignItems:'center', justifyContent:'center',
      padding:'1.5rem', fontFamily:'Inter,system-ui,sans-serif',
    }}>
      <div style={{ width:'100%', maxWidth:'420px' }}>

        {/* Logo */}
        <div style={{ textAlign:'center', marginBottom:'2rem' }}>
          <a href="/" style={{ display:'inline-block' }}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 612 792" style={{ height:'52px', width:'auto' }}>
              <defs><style>{`.rh{fill:#fff}`}</style></defs>
              <g><path className="rh" d="M104.9,465.6l-29,64.4h12.2l6.4-14.9h32.2l6.4,14.9h12.6l-29.1-64.4h-11.8ZM98.6,505.7l12.1-28.2,12.1,28.2h-24.2Z"/><rect className="rh" x="268.4" y="480.8" width="11.4" height="49.1"/><rect className="rh" x="294.9" y="461.7" width="11.4" height="68.2"/><rect className="rh" x="321.5" y="461.7" width="11.4" height="68.2"/></g>
              <g><path className="rh" d="M233.9,338.5l53.8-124.8,47.1,103.6c1.2-.2,2.4-.4,3.7-.4s.9,0,1.3,0l13.1-15.9c-.3-1.3-.4-2.6-.4-4,0-6.1,3-11.6,7.6-15l-56.1-119.1h-13.7l-103.4,220.5,38.9-30.6c.3-6,3.4-11.2,8-14.4Z"/></g>
            </svg>
          </a>
          <p style={{ color:'#7070a0', fontSize:'.875rem', marginTop:'.5rem' }}>
            Crea tu cuenta gratuita
          </p>
        </div>

        {/* Card */}
        <div style={{
          background:'#0e0e1a', border:'1px solid rgba(255,255,255,.07)',
          borderRadius:'16px', padding:'2rem',
        }}>
          {/* Plan seleccionado */}
          {planFromURL && planFromURL !== 'trial' && (
            <div style={{
              background:'rgba(124,92,191,.1)', border:'1px solid rgba(124,92,191,.25)',
              borderRadius:'10px', padding:'.875rem 1rem',
              marginBottom:'1.5rem', fontSize:'.875rem',
            }}>
              <span style={{ color:'#7070a0' }}>Plan seleccionado: </span>
              <strong style={{ color:'#c4a8ff' }}>{PLAN_LABELS[planFromURL] || planFromURL}</strong>
              <br/>
              <span style={{ color:'#5a5a7a', fontSize:'.8125rem' }}>
                5 días gratis · Pago después del trial
              </span>
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
            <div>
              <label style={{ display:'block', fontSize:'.8125rem', color:'#7070a0', marginBottom:'.5rem' }}>
                Nombre completo
              </label>
              <input
                type="text" placeholder="Ángel García" value={form.name} autoFocus
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ display:'block', fontSize:'.8125rem', color:'#7070a0', marginBottom:'.5rem' }}>
                Correo electrónico
              </label>
              <input
                type="email" placeholder="angel@empresa.com" value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ display:'block', fontSize:'.8125rem', color:'#7070a0', marginBottom:'.5rem' }}>
                Contraseña
              </label>
              <input
                type="password" placeholder="Mínimo 8 caracteres" value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                style={inputStyle}
              />
            </div>

            {error && (
              <div style={{
                background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.25)',
                borderRadius:'8px', padding:'.75rem', fontSize:'.875rem', color:'#f87171',
              }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} style={btnPrimaryStyle(loading)}>
              {loading ? 'Creando cuenta...' : 'Crear cuenta gratis →'}
            </button>
          </form>

          <p style={{ textAlign:'center', marginTop:'1.25rem', fontSize:'.8125rem', color:'#5a5a7a' }}>
            ¿Ya tienes cuenta?{' '}
            <Link href="/login" style={{ color:'#c4a8ff', textDecoration:'none' }}>Iniciar sesión</Link>
          </p>
        </div>

        <p style={{
          textAlign:'center', marginTop:'1.5rem',
          fontSize:'.75rem', color:'#3a3a52', lineHeight:'1.6',
        }}>
          Al crear tu cuenta aceptas los{' '}
          <a href="/terms" style={{ color:'#5a5a7a' }}>Términos de servicio</a>
          {' '}y la{' '}
          <a href="/privacy" style={{ color:'#5a5a7a' }}>Política de privacidad</a>
        </p>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width:'100%', background:'#141422', border:'1px solid rgba(255,255,255,.1)',
  borderRadius:'8px', padding:'.625rem .875rem', color:'#f0f0fc',
  fontSize:'.9375rem', outline:'none', fontFamily:'inherit',
  transition:'border-color .2s',
}

const btnPrimaryStyle = (loading: boolean): React.CSSProperties => ({
  background: loading ? '#4a3a7a' : '#7c5cbf',
  color:'#fff', border:'none', borderRadius:'10px', padding:'.875rem',
  fontSize:'1rem', fontWeight:600, cursor: loading ? 'not-allowed' : 'pointer',
  fontFamily:'inherit', transition:'background .2s', marginTop:'.25rem',
  boxShadow: loading ? 'none' : '0 4px 20px rgba(124,92,191,.4)',
})
