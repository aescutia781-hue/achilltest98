'use client'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { logout } from '@/lib/api'
import { UsageMetrics } from '@/components/UsageMetrics'
import OrgSwitcher from '@/components/OrgSwitcher'

export default function DashboardPage() {
  const router = useRouter()
  const params = useSearchParams()
  const { user, loading } = useAuth(true)
  const [showSuccess, setShowSuccess] = useState(false)

  useEffect(() => {
    if (params.get('payment') === 'success') {
      setShowSuccess(true)
      setTimeout(() => setShowSuccess(false), 6000)
    }
  }, [params])

  if (loading) return <Loading/>
  if (!user)   return null

  const isTeammate = user.plan === 'teammate'
  const planLabels: Record<string, string> = {
    trial: 'Trial (5 días)', starter: 'Starter', teammate: 'Teammate',
  }

  const trialDaysLeft = user.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(user.trialEndsAt).getTime() - Date.now()) / 86400000))
    : 0

  return (
    <div style={{ minHeight:'100vh', background:'#08080f', fontFamily:'Inter,system-ui,sans-serif', color:'#c4c4d8' }}>
      <nav style={{
        display:'flex', justifyContent:'space-between', alignItems:'center',
        padding:'1rem 2rem', borderBottom:'1px solid rgba(255,255,255,.07)', background:'#0e0e1a',
      }}>
        <a href="/" style={{ textDecoration:'none', color:'#f0f0fc', fontSize:'1.125rem', fontWeight:700 }}>
          Achilltest
        </a>
        <div style={{ display:'flex', alignItems:'center', gap:'.75rem' }}>
          <OrgSwitcher/>
          <span style={{ fontSize:'.875rem', color:'#7070a0' }}>{user.email}</span>
          <button onClick={logout} style={{
            background:'transparent', border:'1px solid rgba(255,255,255,.1)',
            color:'#7070a0', borderRadius:'8px', padding:'.375rem .875rem',
            fontSize:'.8125rem', cursor:'pointer',
          }}>Salir</button>
        </div>
      </nav>

      <div style={{ maxWidth:'1100px', margin:'0 auto', padding:'2rem 1.5rem' }}>
        {showSuccess && (
          <div style={{
            background:'rgba(34,197,94,.1)', border:'1px solid rgba(34,197,94,.25)',
            borderRadius:'12px', padding:'1rem 1.25rem', marginBottom:'1.5rem',
            display:'flex', alignItems:'center', gap:'.75rem',
          }}>
            <span style={{ fontSize:'1.25rem' }}>🎉</span>
            <p style={{ color:'#22c55e', fontWeight:600 }}>
              ¡Pago exitoso! Bienvenido a Achilltest {planLabels[user.plan]}
            </p>
          </div>
        )}

        {user.plan === 'trial' && (
          <div style={{
            background:'rgba(245,158,11,.08)', border:'1px solid rgba(245,158,11,.2)',
            borderRadius:'12px', padding:'1rem 1.25rem', marginBottom:'1.5rem',
            display:'flex', justifyContent:'space-between', alignItems:'center',
            flexWrap:'wrap', gap:'1rem',
          }}>
            <div>
              <p style={{ color:'#f59e0b', fontWeight:600 }}>
                Trial activo — {trialDaysLeft} día{trialDaysLeft !== 1 ? 's' : ''} restante{trialDaysLeft !== 1 ? 's' : ''}
              </p>
              <p style={{ color:'#7070a0', fontSize:'.875rem' }}>
                Acceso limitado a 10 specs. Actualiza para desbloquear todo.
              </p>
            </div>
            <button onClick={() => router.push('/pricing')} style={{
              background:'#f59e0b', color:'#000', border:'none',
              borderRadius:'8px', padding:'.5rem 1.25rem',
              fontWeight:600, fontSize:'.875rem', cursor:'pointer',
            }}>Actualizar plan →</button>
          </div>
        )}

        <div style={{ marginBottom:'2rem' }}>
          <h1 style={{ fontSize:'1.625rem', fontWeight:700, color:'#f0f0fc', marginBottom:'.25rem' }}>
            Hola, {user.name?.split(' ')[0] || 'QA'} 👋
          </h1>
          <p style={{ color:'#7070a0', fontSize:'.9375rem' }}>
            Plan: <span style={{ color:'#c4a8ff', fontWeight:500 }}>{planLabels[user.plan]}</span>
          </p>
        </div>

        <div style={{
          display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))',
          gap:'1rem', marginBottom:'2rem',
        }}>
          <ActionCard icon="🎯" title="Nuevo test E2E"
            desc="Genera un spec con IA desde instrucciones en español"
            onClick={() => router.push('/workspace')}/>
          <ActionCard icon="📋" title="Historial"
            desc="Todas tus ejecuciones anteriores"
            onClick={() => router.push('/executions')}/>
          <ActionCard icon="📦" title="Test Suites"
            desc="Agrupa specs y ejecútalos juntos"
            onClick={() => router.push('/suites')}/>
          {isTeammate && (
            <ActionCard icon="🏭" title="Device Farms"
              desc="Hasta 10 dispositivos por farm — exclusivo Teammate"
              highlight
              onClick={() => router.push('/device-farms')}/>
          )}
          <ActionCard icon="🔌" title="API Testing"
            desc={isTeammate ? 'Importa Postman u OpenAPI' : 'Requiere plan Teammate'}
            locked={!isTeammate}
            onClick={() => isTeammate ? router.push('/api-testing') : router.push('/pricing')}/>
          <ActionCard icon="♿" title="Accesibilidad WCAG"
            desc={isTeammate ? 'Analiza cualquier URL' : 'Requiere plan Teammate'}
            locked={!isTeammate}
            onClick={() => isTeammate ? router.push('/wcag') : router.push('/pricing')}/>
          <ActionCard icon="📊" title="Reportes Allure"
            desc={isTeammate ? 'Histórico, trends y flaky tests' : 'Requiere plan Teammate'}
            locked={!isTeammate}
            onClick={() => isTeammate ? router.push('/allure') : router.push('/pricing')}/>
          <ActionCard icon="🐙" title="GitHub"
            desc={isTeammate ? 'Versiona tus tests y crea repos' : 'Requiere plan Teammate'}
            locked={!isTeammate}
            onClick={() => isTeammate ? router.push('/github') : router.push('/pricing')}/>
          <ActionCard icon="📋" title="Jira + Zephyr"
            desc={isTeammate ? 'Bugs, test cases y executions' : 'Requiere plan Teammate'}
            locked={!isTeammate}
            onClick={() => isTeammate ? router.push('/jira') : router.push('/pricing')}/>
          <ActionCard icon="🔧" title="Repair Agent"
            desc={user.plan !== 'trial' ? 'Auto-reparar specs rotos con IA' : 'Requiere plan Starter+'}
            locked={user.plan === 'trial'}
            onClick={() => user.plan !== 'trial' ? router.push('/repair') : router.push('/pricing')}/>
        </div>

        {/* Métricas de uso */}
        <div style={{ marginBottom:'2rem' }}>
          <UsageMetrics/>
        </div>

        <div style={{
          background:'linear-gradient(135deg, rgba(124,92,191,.15), rgba(38,181,170,.1))',
          border:'1px solid rgba(124,92,191,.2)',
          borderRadius:'14px', padding:'1.75rem',
          display:'flex', justifyContent:'space-between', alignItems:'center',
          flexWrap:'wrap', gap:'1rem',
        }}>
          <div>
            <h2 style={{ fontSize:'1.125rem', fontWeight:700, color:'#f0f0fc', marginBottom:'.375rem' }}>
              ¿Listo para crear tu primer test?
            </h2>
            <p style={{ fontSize:'.875rem', color:'#7070a0' }}>
              Describe lo que quieres probar en español. Achilltest hace el resto.
            </p>
          </div>
          <button onClick={() => router.push('/workspace')} style={{
            background:'#7c5cbf', color:'#fff', border:'none',
            borderRadius:'10px', padding:'.75rem 1.5rem',
            fontSize:'.9375rem', fontWeight:600, cursor:'pointer',
            boxShadow:'0 4px 20px rgba(124,92,191,.4)',
          }}>Empezar →</button>
        </div>
      </div>
    </div>
  )
}

function ActionCard({ icon, title, desc, onClick, locked = false, highlight = false }: any) {
  return (
    <div onClick={onClick} style={{
      background:'#0e0e1a',
      border: highlight ? '1px solid rgba(124,92,191,.4)' : '1px solid rgba(255,255,255,.07)',
      borderRadius:'14px', padding:'1.375rem',
      cursor:'pointer', opacity: locked ? 0.55 : 1,
      transition:'transform .15s, border-color .15s',
      ...(highlight && { background: 'linear-gradient(135deg, #0e0e1a, rgba(124,92,191,.08))' }),
    }}>
      <div style={{ fontSize:'1.5rem', marginBottom:'.625rem' }}>{icon}</div>
      <div style={{ fontSize:'.9375rem', fontWeight:600, color:'#f0f0fc', marginBottom:'.25rem' }}>
        {title} {locked && <span style={{ fontSize:'.75rem', color:'#7070a0', marginLeft:'.25rem' }}>🔒</span>}
        {highlight && <span style={{ fontSize:'.625rem', color:'#c4a8ff', marginLeft:'.5rem', fontWeight:700, letterSpacing:'.05em' }}>PRO</span>}
      </div>
      <div style={{ fontSize:'.8125rem', color:'#7070a0' }}>{desc}</div>
    </div>
  )
}

function Loading() {
  return <div style={{ minHeight:'100vh', background:'#08080f', display:'flex', alignItems:'center', justifyContent:'center', color:'#7070a0' }}>Cargando...</div>
}
