'use client'
import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

const PLANS = [
  {
    id:       'starter',
    name:     'Starter',
    price:    '78.99',
    desc:     'Para QA Engineers individuales',
    limit:    '1 usuario · 60 ejecuciones E2E/mes · 1 proyecto',
    features: [
      { ok: true,  text: 'E2E Testing con IA en español' },
      { ok: true,  text: 'Grabación de flujos en iframe' },
      { ok: true,  text: 'Reparación IA de specs fallidos' },
      { ok: true,  text: 'Dispositivos Desktop (Chrome, Firefox, Safari)' },
      { ok: true,  text: 'Versionado automático en GitHub' },
      { ok: true,  text: 'Reportes HTML · Historial 30 días' },
      { ok: false, text: 'API Testing' },
      { ok: false, text: 'Reportes Allure' },
      { ok: false, text: 'Jira + Zephyr' },
    ],
    featured: false,
  },
  {
    id:       'teammate',
    name:     'Teammate',
    price:    '128.99',
    desc:     'Para equipos pequeños de QA',
    limit:    '3 usuarios · 100 ejecuciones E2E/mes · 3 proyectos',
    features: [
      { ok: true,  text: 'Todo lo de Starter' },
      { ok: true,  text: 'Hasta 3 usuarios en el equipo' },
      { ok: true,  text: 'API Testing (Postman + OpenAPI)' },
      { ok: true,  text: 'Accesibilidad WCAG 2.0' },
      { ok: true,  text: 'Reportes Allure descargables', highlight: true },
      { ok: true,  text: 'Jira + Zephyr Scale integrados' },
      { ok: true,  text: 'Organizaciones y roles (Manager, QA)' },
      { ok: true,  text: 'CI/CD con GitHub Actions' },
      { ok: true,  text: 'Historial 90 días · 3 proyectos' },
    ],
    featured: true,
  },
]

export default function PricingPage() {
  const router    = useRouter()
  const params    = useSearchParams()
  const planParam = params.get('plan')
  const isNew     = params.get('new') === 'true'

  const [loading,      setLoading]      = useState<string | null>(null)
  const [error,        setError]        = useState('')
  const [currentPlan,  setCurrentPlan]  = useState<string | null>(null)

  useEffect(() => {
    // Ver si el usuario ya tiene un plan
    const token = localStorage.getItem('token')
    if (!token) return

    fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json()).then(d => {
      if (d.success) setCurrentPlan(d.data.plan)
    }).catch(() => {})
  }, [])

  async function choosePlan(planId: string) {
    const token = localStorage.getItem('token')

    // Sin sesión → ir a registrarse con el plan elegido
    if (!token) {
      router.push(`/register?plan=${planId}`)
      return
    }

    setLoading(planId); setError('')

    try {
      const res = await fetch('/api/mp/subscribe', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ planId }),
      })
      const data = await res.json()

      if (!res.ok || !data.success) {
        setError(data.error || 'Error iniciando el pago')
        return
      }

      // Redirigir al checkout de Mercado Pago
      window.location.href = data.data.initPoint
    } catch {
      setError('Error de conexión. Intenta de nuevo.')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div style={{
      minHeight:'100vh', background:'#08080f',
      fontFamily:'Inter,system-ui,sans-serif',
      padding:'2rem 1.5rem',
    }}>
      {/* Nav mínimo */}
      <div style={{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        maxWidth:'900px', margin:'0 auto 3rem',
      }}>
        <a href="/" style={{ textDecoration:'none' }}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 612 792" style={{ height:'28px', width:'auto' }}>
            <defs><style>{`.ph{fill:#fff}`}</style></defs>
            <g><path className="ph" d="M104.9,465.6l-29,64.4h12.2l6.4-14.9h32.2l6.4,14.9h12.6l-29.1-64.4h-11.8ZM98.6,505.7l12.1-28.2,12.1,28.2h-24.2Z"/><rect className="ph" x="268.4" y="480.8" width="11.4" height="49.1"/><rect className="ph" x="294.9" y="461.7" width="11.4" height="68.2"/><rect className="ph" x="321.5" y="461.7" width="11.4" height="68.2"/></g>
            <g><path className="ph" d="M233.9,338.5l53.8-124.8,47.1,103.6c1.2-.2,2.4-.4,3.7-.4s.9,0,1.3,0l13.1-15.9c-.3-1.3-.4-2.6-.4-4,0-6.1,3-11.6,7.6-15l-56.1-119.1h-13.7l-103.4,220.5,38.9-30.6c.3-6,3.4-11.2,8-14.4Z"/></g>
          </svg>
        </a>
        <a href="/workspace" style={{ color:'#7070a0', fontSize:'.875rem', textDecoration:'none' }}>
          Ir al workspace →
        </a>
      </div>

      {/* Header */}
      <div style={{ textAlign:'center', maxWidth:'480px', margin:'0 auto 3rem' }}>
        {isNew && (
          <div style={{
            display:'inline-block', background:'rgba(34,197,94,.1)',
            border:'1px solid rgba(34,197,94,.25)', borderRadius:'100px',
            padding:'.25rem .875rem', fontSize:'.8125rem', color:'#22c55e',
            marginBottom:'1rem',
          }}>
            ✓ Cuenta creada — elige tu plan
          </div>
        )}
        <h1 style={{
          fontSize:'clamp(1.875rem,5vw,2.75rem)', fontWeight:700,
          color:'#f0f0fc', letterSpacing:'-.025em', marginBottom:'.875rem',
        }}>
          Elige tu plan
        </h1>
        <p style={{ color:'#7070a0', fontSize:'1rem', lineHeight:1.6 }}>
          5 días gratis en todos los planes. Sin tarjeta de crédito. Cancela cuando quieras.
        </p>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          maxWidth:'900px', margin:'0 auto 1.5rem',
          background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.25)',
          borderRadius:'10px', padding:'.875rem 1.125rem',
          fontSize:'.875rem', color:'#f87171',
        }}>
          {error}
        </div>
      )}

      {/* Plans */}
      <div style={{
        display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))',
        gap:'1.5rem', maxWidth:'820px', margin:'0 auto 3rem',
      }}>
        {PLANS.map(plan => (
          <div key={plan.id} style={{
            background:'#0e0e1a',
            border: plan.featured
              ? '1px solid #7c5cbf'
              : '1px solid rgba(255,255,255,.07)',
            borderRadius:'16px', padding:'2rem', position:'relative',
            boxShadow: plan.featured ? '0 0 0 1px rgba(124,92,191,.3), 0 20px 60px rgba(124,92,191,.12)' : 'none',
          }}>
            {plan.featured && (
              <div style={{
                position:'absolute', top:'-13px', left:'50%', transform:'translateX(-50%)',
                background:'#7c5cbf', color:'#fff',
                fontSize:'.6875rem', fontWeight:600, letterSpacing:'.08em',
                textTransform:'uppercase', padding:'.25rem .875rem',
                borderRadius:'100px', whiteSpace:'nowrap',
              }}>
                Más popular
              </div>
            )}

            {/* Nombre y precio */}
            <div style={{ marginBottom:'1rem' }}>
              <div style={{ fontSize:'1.25rem', fontWeight:700, color:'#f0f0fc' }}>{plan.name}</div>
              <div style={{ fontSize:'.8125rem', color:'#7070a0', marginBottom:'.875rem' }}>{plan.desc}</div>
              <div style={{ display:'flex', alignItems:'flex-end', gap:'.25rem' }}>
                <span style={{ fontSize:'2.75rem', fontWeight:700, color:'#f0f0fc', letterSpacing:'-.03em', lineHeight:1 }}>
                  <sup style={{ fontSize:'1.25rem', verticalAlign:'super' }}>$</sup>
                  {plan.price.split('.')[0]}
                </span>
                <span style={{ color:'#7070a0', fontSize:'.9375rem', marginBottom:'.25rem' }}>
                  .{plan.price.split('.')[1]}/mes
                </span>
              </div>
            </div>

            <div style={{
              fontSize:'.8125rem', color:'#7070a0',
              paddingBottom:'1rem', marginBottom:'1rem',
              borderBottom:'1px solid rgba(255,255,255,.07)',
            }}>
              {plan.limit}
            </div>

            {/* Features */}
            <ul style={{ listStyle:'none', marginBottom:'1.5rem' }}>
              {plan.features.map((f, i) => (
                <li key={i} style={{
                  display:'flex', alignItems:'flex-start', gap:'.625rem',
                  fontSize:'.875rem', marginBottom:'.5rem', lineHeight:1.5,
                  color: f.ok ? '#c4c4d8' : 'rgba(112,112,160,.4)',
                }}>
                  <span style={{
                    color: f.ok ? (f.highlight ? '#26b5aa' : '#22c55e') : 'rgba(112,112,160,.4)',
                    flexShrink:0, fontWeight: f.highlight ? 700 : 400,
                  }}>
                    {f.ok ? '✓' : '✗'}
                  </span>
                  <span style={{ color: f.highlight ? '#26b5aa' : undefined, fontWeight: f.highlight ? 600 : undefined }}>
                    {f.text}
                  </span>
                </li>
              ))}
            </ul>

            {/* Botón */}
            {currentPlan === plan.id ? (
              <div style={{
                background:'rgba(34,197,94,.1)', border:'1px solid rgba(34,197,94,.25)',
                borderRadius:'10px', padding:'.875rem', textAlign:'center',
                fontSize:'.9375rem', color:'#22c55e', fontWeight:600,
              }}>
                ✓ Plan actual
              </div>
            ) : (
              <button
                onClick={() => choosePlan(plan.id)}
                disabled={loading === plan.id}
                style={{
                  width:'100%', padding:'.875rem', borderRadius:'10px',
                  border:'none', cursor: loading === plan.id ? 'not-allowed' : 'pointer',
                  fontSize:'.9375rem', fontWeight:600, fontFamily:'inherit',
                  transition:'all .2s',
                  background: plan.featured
                    ? (loading === plan.id ? '#4a3a7a' : '#7c5cbf')
                    : 'transparent',
                  color: plan.featured ? '#fff' : '#c4c4d8',
                  border_: plan.featured ? 'none' : '1px solid rgba(255,255,255,.12)',
                  boxShadow: plan.featured && loading !== plan.id
                    ? '0 4px 20px rgba(124,92,191,.4)'
                    : 'none',
                }}
              >
                {loading === plan.id
                  ? 'Redirigiendo a Mercado Pago...'
                  : `Empezar con ${plan.name}`}
              </button>
            )}

            <p style={{
              textAlign:'center', marginTop:'.75rem',
              fontSize:'.75rem', color:'#5a5a7a',
            }}>
              <strong style={{ color:'#22c55e' }}>5 días gratis</strong> · Sin tarjeta de crédito
            </p>
          </div>
        ))}
      </div>

      {/* Garantías */}
      <div style={{
        display:'flex', flexWrap:'wrap', gap:'1.5rem',
        justifyContent:'center', marginTop:'1rem',
      }}>
        {['✓ Sin tarjeta de crédito', '✓ Cancela cuando quieras', '✓ Soporte en español', '✓ Datos en América'].map(g => (
          <span key={g} style={{ fontSize:'.8125rem', color:'#5a5a7a' }}>{g}</span>
        ))}
      </div>

      {/* Próximamente */}
      <div style={{ textAlign:'center', marginTop:'3rem' }}>
        <div style={{
          display:'inline-flex', alignItems:'center', gap:'.875rem',
          background:'#0e0e1a', border:'1px solid rgba(255,255,255,.07)',
          borderRadius:'12px', padding:'.75rem 1.5rem', flexWrap:'wrap', justifyContent:'center',
        }}>
          <span style={{ fontSize:'.8125rem', color:'#7070a0' }}>Próximamente:</span>
          <span style={{ fontSize:'.8125rem', color:'#c4c4d8', fontWeight:500 }}>
            Advance · Pro · Enterprise
          </span>
          <span style={{
            fontSize:'.6875rem', fontWeight:600, padding:'.2rem .625rem',
            borderRadius:'100px', background:'rgba(124,92,191,.15)',
            color:'#c4a8ff', border:'1px solid rgba(124,92,191,.25)',
          }}>
            Mes 3+
          </span>
        </div>
      </div>
    </div>
  )
}
