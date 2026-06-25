'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter }                   from 'next/navigation'
import { useAuth }                     from '@/hooks/useAuth'
import { api, logout }                 from '@/lib/api'
import { DeviceSelector }              from '@/components/DeviceSelector'
import { DeviceFrame, ScreenImage }    from '@/components/DeviceFrame'

interface Step {
  stepNum:    number
  action:     string
  selector?:  string
  value?:     string
  success:    boolean
  error?:     string
  screenshot?:string
  reasoning?: string
}

interface SelectedDevice {
  id: string
  name: string
  category: string
  brand: string
  frameStyle: string
  viewport: { width: number; height: number }
  defaultBrowserType: string
}

const DEFAULT_DEVICE: SelectedDevice = {
  id:         'desktop-chrome',
  name:       'Desktop Chrome',
  category:   'desktop',
  brand:      'desktop',
  frameStyle: 'desktop',
  viewport:   { width: 1280, height: 720 },
  defaultBrowserType: 'chromium',
}

export default function WorkspacePage() {
  const router = useRouter()
  const { user, loading } = useAuth(true)

  // Form
  const [testName,     setTestName]     = useState('')
  const [targetUrl,    setTargetUrl]    = useState('')
  const [instructions, setInstructions] = useState('')
  const [device,       setDevice]       = useState<SelectedDevice>(DEFAULT_DEVICE)

  // Execution state
  const [executionId, setExecutionId] = useState<string | null>(null)
  const [status,      setStatus]      = useState<string>('idle')
  const [statusMsg,   setStatusMsg]   = useState<string>('')
  const [steps,       setSteps]       = useState<Step[]>([])
  const [logs,        setLogs]        = useState<string[]>([])
  const [specCode,    setSpecCode]    = useState<string>('')
  const [error,       setError]       = useState<string>('')

  // Último screenshot para mostrar dentro del frame
  const latestScreenshot = steps.length > 0
    ? [...steps].reverse().find(s => s.screenshot)?.screenshot
    : null

  const stepsEndRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    stepsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [steps.length])

  async function startExecution() {
    if (!testName.trim() || !targetUrl.trim() || !instructions.trim()) {
      setError('Todos los campos son requeridos')
      return
    }
    setError('')
    setSteps([])
    setLogs([])
    setSpecCode('')
    setStatus('starting')
    setStatusMsg('Encolando...')

    try {
      const res = await api.post('/api/executions', {
        testName, targetUrl, instructions,
        deviceId: device.id,
      })
      const id = res.data.executionId
      setExecutionId(id)
      _consumeStream(id, localStorage.getItem('token')!)
    } catch (err: any) {
      setError(err.message || 'Error iniciando ejecución')
      setStatus('idle')
    }
  }

  async function _consumeStream(id: string, token: string) {
    try {
      const res = await fetch(`/api/executions/${id}/stream`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!res.ok || !res.body) throw new Error('No se pudo abrir el stream')

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        const chunks = buffer.split('\n\n')
        buffer = chunks.pop() || ''

        for (const chunk of chunks) {
          const lines = chunk.split('\n')
          let event = 'message'
          let data  = ''
          for (const line of lines) {
            if (line.startsWith('event: ')) event = line.slice(7).trim()
            else if (line.startsWith('data: ')) data += line.slice(6)
          }
          if (data) _handleEvent(event, data)
        }
      }
    } catch (err: any) {
      setError(`Stream perdido: ${err.message}`)
    }
  }

  function _handleEvent(event: string, data: string) {
    let payload: any
    try { payload = JSON.parse(data) } catch { return }

    switch (event) {
      case 'status':
        setStatus(payload.status)
        setStatusMsg(payload.message || '')
        break
      case 'step':
        setSteps(prev => [...prev, payload])
        break
      case 'log':
        setLogs(prev => [...prev.slice(-20), typeof payload === 'string' ? payload : JSON.stringify(payload)])
        break
      case 'result':
        setSpecCode(payload.specCode || '')
        setStatus('completed')
        setStatusMsg('Ejecución completada')
        break
      case 'final':
        if (payload.specCode) setSpecCode(payload.specCode)
        if (payload.error) setError(payload.error)
        setStatus(payload.status)
        break
      case 'error':
        setError(payload.message || 'Error desconocido')
        setStatus('failed')
        break
    }
  }

  function reset() {
    setExecutionId(null)
    setStatus('idle')
    setStatusMsg('')
    setSteps([])
    setLogs([])
    setSpecCode('')
    setError('')
  }

  if (loading) return <Loading/>
  if (!user)   return null

  const isRunning = ['starting', 'navigating', 'planning', 'executing', 'generating'].includes(status)
  const isDone    = status === 'completed' || status === 'failed'

  // Calcular escala para el frame (max 380px de ancho)
  const MAX_FRAME_WIDTH = 360
  const scale = device.category === 'desktop'
    ? Math.min(1, MAX_FRAME_WIDTH * 1.4 / device.viewport.width)
    : Math.min(1, MAX_FRAME_WIDTH / device.viewport.width)

  return (
    <div style={{ minHeight:'100vh', background:'#08080f', fontFamily:'Inter,system-ui,sans-serif', color:'#c4c4d8' }}>
      {/* Nav */}
      <nav style={{
        display:'flex', justifyContent:'space-between', alignItems:'center',
        padding:'1rem 2rem', borderBottom:'1px solid rgba(255,255,255,.07)', background:'#0e0e1a',
      }}>
        <a href="/dashboard" style={{ color:'#c4a8ff', textDecoration:'none', fontSize:'.875rem' }}>
          ← Dashboard
        </a>
        <div style={{ display:'flex', alignItems:'center', gap:'1rem' }}>
          <span style={{ fontSize:'.8125rem', color:'#7070a0' }}>
            {user.email} · <strong style={{ color:'#c4a8ff' }}>{user.plan}</strong>
          </span>
          <button onClick={logout} style={btnGhostStyle}>Salir</button>
        </div>
      </nav>

      <div style={{ maxWidth:'1400px', margin:'0 auto', padding:'2rem 1.5rem' }}>
        <h1 style={{ fontSize:'1.75rem', fontWeight:700, color:'#f0f0fc', marginBottom:'.25rem' }}>
          🎯 E2E Testing con IA
        </h1>
        <p style={{ color:'#7070a0', fontSize:'.9375rem', marginBottom:'2rem' }}>
          Describe el flujo en español. Achilltest lo convierte a Playwright TypeScript automáticamente.
        </p>

        <div style={{
          display:'grid',
          gridTemplateColumns:'380px 1fr 420px',
          gap:'1.5rem',
        }} className="ws-grid">

          {/* ── COLUMNA 1: FORM ── */}
          <div>
            <div style={cardStyle}>
              <h3 style={cardTitle}>Configuración</h3>

              <Field label="Nombre del test">
                <input value={testName} onChange={e => setTestName(e.target.value)}
                  disabled={isRunning} placeholder="Login con credenciales válidas"
                  style={inputStyle}/>
              </Field>

              <Field label="URL a testear">
                <input value={targetUrl} onChange={e => setTargetUrl(e.target.value)}
                  disabled={isRunning} placeholder="https://tuapp.com/login"
                  style={inputStyle}/>
              </Field>

              <Field label="Dispositivo">
                <DeviceSelector
                  value={device.id}
                  onChange={(_, d) => setDevice(d as SelectedDevice)}
                  disabled={isRunning}
                />
              </Field>

              <Field label="Instrucciones (en español)">
                <textarea value={instructions} onChange={e => setInstructions(e.target.value)}
                  disabled={isRunning} rows={6}
                  placeholder="1. Ingresar usuario@empresa.com en el campo email&#10;2. Ingresar password en el campo contraseña&#10;3. Hacer click en Iniciar sesión&#10;4. Verificar que llegamos al dashboard"
                  style={{ ...inputStyle, resize:'vertical', fontFamily:'inherit', lineHeight:1.5 }}/>
              </Field>

              {error && <div style={errorBoxStyle}>{error}</div>}

              <div style={{ display:'flex', gap:'.5rem', marginTop:'1rem' }}>
                {!isRunning && !isDone && (
                  <button onClick={startExecution} style={btnPrimaryStyle}>
                    🚀 Generar y ejecutar
                  </button>
                )}
                {isRunning && (
                  <button disabled style={{ ...btnPrimaryStyle, opacity:.6, cursor:'not-allowed' }}>
                    {statusMsg || 'Ejecutando...'}
                  </button>
                )}
                {isDone && (
                  <button onClick={reset} style={btnPrimaryStyle}>Nuevo test</button>
                )}
              </div>

              {status !== 'idle' && (
                <div style={{ marginTop:'1.5rem' }}>
                  <StatusBadge status={status} message={statusMsg}/>
                </div>
              )}
            </div>

            {user.plan === 'trial' && (
              <div style={{ ...cardStyle, marginTop:'1rem' }}>
                <h3 style={cardTitle}>Tu plan</h3>
                <p style={{ fontSize:'.875rem', color:'#c4c4d8', marginBottom:'.25rem' }}>
                  <strong style={{ color:'#c4a8ff' }}>Trial (5 días)</strong>
                </p>
                <p style={{ fontSize:'.75rem', color:'#7070a0', marginBottom:'.75rem' }}>
                  Specs usados: {user.specsUsedTrial || 0} / 10
                </p>
                <button onClick={() => router.push('/pricing')} style={btnUpgradeStyle}>
                  Actualizar a Starter →
                </button>
              </div>
            )}
          </div>

          {/* ── COLUMNA 2: PASOS ── */}
          <div style={cardStyle}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem' }}>
              <h3 style={{ ...cardTitle, margin:0 }}>
                {status === 'idle' ? 'Pasos de ejecución' : `Ejecución #${executionId?.slice(0, 8)}`}
              </h3>
              {steps.length > 0 && (
                <span style={{ fontSize:'.75rem', color:'#7070a0' }}>
                  {steps.length} paso{steps.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            {status === 'idle' && (
              <div style={{
                padding:'3rem 1rem', textAlign:'center', color:'#5a5a7a',
                fontSize:'.875rem', border:'1px dashed rgba(255,255,255,.1)',
                borderRadius:'10px',
              }}>
                <div style={{ fontSize:'2rem', marginBottom:'.5rem' }}>🎬</div>
                Aquí verás los pasos en vivo<br/>
                a medida que Achilltest los ejecuta
              </div>
            )}

            <div style={{ display:'flex', flexDirection:'column', gap:'.75rem', maxHeight:'600px', overflowY:'auto' }}>
              {steps.map((step, i) => <StepCard key={i} step={step}/>)}
              <div ref={stepsEndRef}/>
            </div>

            {specCode && (
              <div style={{ marginTop:'1.5rem' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'.5rem' }}>
                  <h4 style={{ fontSize:'.875rem', fontWeight:600, color:'#f0f0fc', margin:0 }}>
                    ✓ Spec generado
                  </h4>
                  <button onClick={() => navigator.clipboard.writeText(specCode)} style={btnCopyStyle}>
                    Copiar
                  </button>
                </div>
                <pre style={{
                  background:'#08080f', border:'1px solid rgba(255,255,255,.07)',
                  borderRadius:'8px', padding:'1rem', fontSize:'.75rem',
                  color:'#c3e88d', overflow:'auto', maxHeight:'400px',
                  fontFamily:'JetBrains Mono,monospace', lineHeight:1.6,
                }}>
                  {specCode}
                </pre>
              </div>
            )}
          </div>

          {/* ── COLUMNA 3: VISOR CON FRAME DEL DISPOSITIVO ── */}
          <div style={{ ...cardStyle, display:'flex', flexDirection:'column', alignItems:'center' }}>
            <div style={{
              display:'flex', justifyContent:'space-between', alignItems:'center',
              width:'100%', marginBottom:'1rem',
            }}>
              <h3 style={{ ...cardTitle, margin:0 }}>Visor</h3>
              <span style={{
                fontSize:'.6875rem', color:'#7070a0',
                fontFamily:'monospace',
              }}>
                {device.viewport.width}×{device.viewport.height}
              </span>
            </div>

            <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', width:'100%' }}>
              <DeviceFrame
                frameStyle={device.frameStyle}
                viewportWidth={device.viewport.width}
                viewportHeight={device.viewport.height}
                brand={device.brand}
                deviceName={device.name}
                scale={scale}
              >
                {latestScreenshot ? (
                  <ScreenImage src={latestScreenshot} alt="Live"/>
                ) : (
                  <div style={{
                    width:'100%', height:'100%',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    flexDirection:'column', gap:'.5rem',
                    background:'#1a1a2a',
                  }}>
                    <div style={{ fontSize:'2rem', opacity:.3 }}>📱</div>
                    <div style={{ fontSize:'.7rem', color:'#5a5a7a', textAlign:'center', padding:'0 1rem' }}>
                      {device.name}
                    </div>
                  </div>
                )}
              </DeviceFrame>
            </div>

            <div style={{
              marginTop:'1rem', width:'100%',
              padding:'.625rem', textAlign:'center',
              background:'rgba(255,255,255,.02)', borderRadius:'8px',
              fontSize:'.7rem', color:'#7070a0',
            }}>
              {device.name} · {device.defaultBrowserType}
            </div>
          </div>
        </div>

        {logs.length > 0 && (
          <details style={{ marginTop:'1rem' }}>
            <summary style={{ fontSize:'.75rem', color:'#7070a0', cursor:'pointer' }}>
              Ver logs ({logs.length})
            </summary>
            <div style={{
              marginTop:'.5rem', padding:'.75rem', background:'#08080f',
              borderRadius:'6px', fontSize:'.7rem', fontFamily:'monospace',
              color:'#7070a0', maxHeight:'200px', overflowY:'auto',
            }}>
              {logs.map((l, i) => <div key={i}>{l}</div>)}
            </div>
          </details>
        )}
      </div>

      <style jsx>{`
        @media (max-width: 1200px) {
          :global(.ws-grid) {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  )
}

// ── COMPONENTES ────────────────────────────────────────────────────────

function StepCard({ step }: { step: Step }) {
  return (
    <div style={{
      display:'flex', gap:'.75rem', padding:'.75rem',
      background:'#141422',
      border:`1px solid ${step.success === false ? 'rgba(239,68,68,.3)' : 'rgba(255,255,255,.07)'}`,
      borderRadius:'10px',
    }}>
      <div style={{
        flexShrink:0, width:'28px', height:'28px', borderRadius:'50%',
        background: step.success === false ? 'rgba(239,68,68,.15)' : 'rgba(34,197,94,.15)',
        color:      step.success === false ? '#f87171' : '#22c55e',
        display:'flex', alignItems:'center', justifyContent:'center',
        fontSize:'.875rem', fontWeight:700,
      }}>
        {step.success === false ? '✗' : step.stepNum || '✓'}
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:'.875rem', color:'#f0f0fc', fontWeight:500 }}>
          {step.action} {step.selector && <code style={{ background:'rgba(255,255,255,.05)', padding:'1px 6px', borderRadius:4, fontSize:'.75rem', color:'#c4a8ff' }}>{step.selector}</code>}
          {step.value && <span style={{ color:'#7070a0', fontSize:'.8125rem' }}> = "{step.value}"</span>}
        </div>
        {step.error && <div style={{ fontSize:'.75rem', color:'#f87171', marginTop:'.25rem' }}>{step.error}</div>}
        {step.reasoning && <div style={{ fontSize:'.75rem', color:'#7070a0', marginTop:'.25rem', fontStyle:'italic' }}>{step.reasoning}</div>}
      </div>
    </div>
  )
}

function StatusBadge({ status, message }: { status: string; message: string }) {
  const colors: Record<string, [string, string]> = {
    starting:   ['rgba(124,92,191,.15)', '#c4a8ff'],
    navigating: ['rgba(124,92,191,.15)', '#c4a8ff'],
    planning:   ['rgba(245,158,11,.12)', '#f59e0b'],
    executing:  ['rgba(38,181,170,.12)', '#26b5aa'],
    generating: ['rgba(245,158,11,.12)', '#f59e0b'],
    completed:  ['rgba(34,197,94,.12)',  '#22c55e'],
    failed:     ['rgba(239,68,68,.12)',  '#f87171'],
  }
  const [bg, color] = colors[status] || ['rgba(255,255,255,.05)', '#7070a0']
  return (
    <div style={{
      display:'flex', alignItems:'center', gap:'.5rem',
      padding:'.5rem .75rem', background:bg,
      border:`1px solid ${color}33`, borderRadius:'8px', fontSize:'.8125rem',
    }}>
      <div style={{
        width:'8px', height:'8px', borderRadius:'50%', background:color,
        animation: ['completed', 'failed'].includes(status) ? 'none' : 'pulse 1.5s infinite',
      }}/>
      <span style={{ color, fontWeight:500, textTransform:'capitalize' }}>{status}</span>
      {message && <span style={{ color:'#7070a0' }}>· {message}</span>}
      <style>{`@keyframes pulse { 50% { opacity:.4 } }`}</style>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom:'.875rem' }}>
      <label style={{ display:'block', fontSize:'.75rem', color:'#7070a0', marginBottom:'.375rem', fontWeight:500 }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function Loading() {
  return <div style={{ minHeight:'100vh', background:'#08080f', display:'flex', alignItems:'center', justifyContent:'center', color:'#7070a0' }}>Cargando...</div>
}

const cardStyle: React.CSSProperties = {
  background:'#0e0e1a', border:'1px solid rgba(255,255,255,.07)',
  borderRadius:'14px', padding:'1.5rem',
}
const cardTitle: React.CSSProperties = {
  fontSize:'.9375rem', fontWeight:600, color:'#f0f0fc', marginBottom:'1rem',
}
const inputStyle: React.CSSProperties = {
  width:'100%', background:'#141422', border:'1px solid rgba(255,255,255,.1)',
  borderRadius:'8px', padding:'.5rem .75rem', color:'#f0f0fc',
  fontSize:'.875rem', outline:'none', fontFamily:'inherit',
}
const btnPrimaryStyle: React.CSSProperties = {
  background:'#7c5cbf', color:'#fff', border:'none', borderRadius:'10px',
  padding:'.75rem', fontSize:'.9375rem', fontWeight:600, cursor:'pointer',
  fontFamily:'inherit', width:'100%', boxShadow:'0 4px 20px rgba(124,92,191,.4)',
}
const btnUpgradeStyle: React.CSSProperties = {
  background:'#f59e0b', color:'#000', border:'none', borderRadius:'8px',
  padding:'.5rem .875rem', fontSize:'.8125rem', fontWeight:600,
  cursor:'pointer', fontFamily:'inherit', width:'100%',
}
const btnGhostStyle: React.CSSProperties = {
  background:'transparent', border:'1px solid rgba(255,255,255,.1)',
  color:'#7070a0', borderRadius:'8px', padding:'.375rem .875rem',
  fontSize:'.75rem', cursor:'pointer', fontFamily:'inherit',
}
const btnCopyStyle: React.CSSProperties = {
  background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.07)',
  color:'#c4c4d8', borderRadius:'6px', padding:'.25rem .625rem',
  fontSize:'.75rem', cursor:'pointer', fontFamily:'inherit',
}
const errorBoxStyle: React.CSSProperties = {
  background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.25)',
  borderRadius:'8px', padding:'.625rem .75rem', fontSize:'.8125rem',
  color:'#f87171', marginTop:'.5rem',
}
