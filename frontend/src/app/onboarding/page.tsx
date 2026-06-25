'use client'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../hooks/useAuth'

export default function OnboardingPage() {
  const router = useRouter()
  const { user, loading } = useAuth(true)

  if (loading) return null

  return (
    <div style={{
      minHeight:'100vh', background:'#08080f',
      display:'flex', alignItems:'center', justifyContent:'center',
      fontFamily:'Inter,system-ui,sans-serif', padding:'1.5rem',
    }}>
      <div style={{ maxWidth:'560px', width:'100%', textAlign:'center' }}>

        {/* Logo */}
        <div style={{ marginBottom:'2rem' }}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 612 792" style={{ height:'60px', width:'auto' }}>
            <defs><style>{`.oh{fill:#fff}`}</style></defs>
            <g><path className="oh" d="M104.9,465.6l-29,64.4h12.2l6.4-14.9h32.2l6.4,14.9h12.6l-29.1-64.4h-11.8ZM98.6,505.7l12.1-28.2,12.1,28.2h-24.2Z"/><rect className="oh" x="268.4" y="480.8" width="11.4" height="49.1"/><rect className="oh" x="294.9" y="461.7" width="11.4" height="68.2"/><rect className="oh" x="321.5" y="461.7" width="11.4" height="68.2"/></g>
            <g><path className="oh" d="M233.9,338.5l53.8-124.8,47.1,103.6c1.2-.2,2.4-.4,3.7-.4s.9,0,1.3,0l13.1-15.9c-.3-1.3-.4-2.6-.4-4,0-6.1,3-11.6,7.6-15l-56.1-119.1h-13.7l-103.4,220.5,38.9-30.6c.3-6,3.4-11.2,8-14.4Z"/></g>
          </svg>
        </div>

        <h1 style={{
          fontSize:'clamp(1.75rem,5vw,2.5rem)', fontWeight:700,
          color:'#f0f0fc', letterSpacing:'-.025em', marginBottom:'.875rem',
        }}>
          ¡Bienvenido, {user?.name?.split(' ')[0] || 'QA'}! 🎉
        </h1>
        <p style={{ color:'#7070a0', fontSize:'1.0625rem', lineHeight:1.65, marginBottom:'2.5rem' }}>
          Tu cuenta está lista. Tienes <strong style={{ color:'#f59e0b' }}>5 días gratis</strong> para
          explorar Achilltest. ¿Quieres empezar con el trial o elegir un plan ahora?
        </p>

        <div style={{ display:'flex', flexDirection:'column', gap:'1rem', maxWidth:'340px', margin:'0 auto' }}>
          <button
            onClick={() => router.push('/workspace')}
            style={{
              background:'#7c5cbf', color:'#fff', border:'none',
              borderRadius:'10px', padding:'1rem', fontSize:'1rem',
              fontWeight:600, cursor:'pointer', fontFamily:'inherit',
              boxShadow:'0 4px 20px rgba(124,92,191,.4)',
            }}
          >
            Empezar trial gratis →
          </button>
          <button
            onClick={() => router.push('/pricing')}
            style={{
              background:'transparent', color:'#c4c4d8',
              border:'1px solid rgba(255,255,255,.12)',
              borderRadius:'10px', padding:'1rem', fontSize:'1rem',
              fontWeight:500, cursor:'pointer', fontFamily:'inherit',
            }}
          >
            Ver planes de pago
          </button>
        </div>

        <div style={{
          marginTop:'2rem', padding:'1rem',
          background:'#0e0e1a', border:'1px solid rgba(255,255,255,.07)',
          borderRadius:'12px',
        }}>
          <p style={{ fontSize:'.8125rem', color:'#5a5a7a', lineHeight:1.6 }}>
            Con el trial gratuito tienes acceso a <strong style={{ color:'#c4c4d8' }}>10 specs de Playwright</strong>.
            Sin tarjeta de crédito. Sin compromisos.
          </p>
        </div>
      </div>
    </div>
  )
}
