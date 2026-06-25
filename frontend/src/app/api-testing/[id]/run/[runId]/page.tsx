'use client'

import { useEffect, useState }    from 'react'
import { useRouter, useParams }   from 'next/navigation'
import { useAuth }                from '@/hooks/useAuth'
import { api, logout }            from '@/lib/api'

interface RunData {
  run: {
    id:           string
    status:       string
    totalTests:   number
    passed:       number
    failed:       number
    skipped:      number
    durationMs:   number | null
    startedAt:    string
    completedAt:  string | null
  }
  results: TestResult[]
}

interface TestResult {
  id:                string
  testCaseId:        string
  testName:          string
  category:          string
  endpoint:          string
  status:            string
  durationMs:        number | null
  actualMethod:      string | null
  actualUrl:         string | null
  actualBody:        any
  actualStatus:      number | null
  actualResponse:    any
  validationResults: any[]
  errorMessage:      string | null
}

export default function ApiRunPage() {
  const router = useRouter()
  const params = useParams()
  const collectionId = params.id as string
  const runId = params.runId as string
  const { user, loading } = useAuth(true)

  const [data, setData]               = useState<RunData | null>(null)
  const [loadingData, setLoadingData] = useState(true)
  const [selectedResult, setSelectedResult] = useState<TestResult | null>(null)
  const [logs, setLogs]               = useState<string[]>([])

  useEffect(() => {
    if (!user) return
    loadData()
    openStream()
  }, [user, runId])

  async function loadData() {
    try {
      const r = await api.get(`/api/api-testing/runs/${runId}`)
      setData(r.data)
    } catch {}
    finally { setLoadingData(false) }
  }

  async function openStream() {
    const token = localStorage.getItem('token')
    if (!token) return
    try {
      const res = await fetch(`/api/api-testing/runs/${runId}/stream`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok || !res.body) return
      const reader = res.body.getReader()
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
          let dataStr = ''
          for (const line of lines) {
            if (line.startsWith('event: ')) event = line.slice(7).trim()
            else if (line.startsWith('data: ')) dataStr += line.slice(6)
          }
          if (dataStr) handleEvent(event, dataStr)
        }
      }
    } catch {}
  }

  function handleEvent(event: string, dataStr: string) {
    let payload: any
    try { payload = JSON.parse(dataStr) } catch { return }

    switch (event) {
      case 'status':
        setLogs(prev => [...prev.slice(-30), payload.message || event])
        break
      case 'test_started':
        setLogs(prev => [...prev.slice(-30), `▶ ${payload.name}`])
        break
      case 'test_finished':
        // Actualizar el resultado individual
        setData(prev => {
          if (!prev) return prev
          const newResults = prev.results.map(r =>
            r.testCaseId === payload.testCaseId
              ? { ...r, status: payload.status, durationMs: payload.durationMs,
                  actualStatus: payload.actualStatus, errorMessage: payload.errorMessage }
              : r
          )
          return { ...prev, results: newResults }
        })
        setLogs(prev => [...prev.slice(-30),
          `${payload.status === 'passed' ? '✓' : '✗'} ${payload.name} (${payload.durationMs}ms)`])
        break
      case 'progress':
        setData(prev => prev ? {
          ...prev,
          run: { ...prev.run, passed: payload.passed, failed: payload.failed, skipped: payload.skipped },
        } : prev)
        break
      case 'completed':
        setData(prev => prev ? {
          ...prev,
          run: { ...prev.run, status: payload.status, passed: payload.passed, failed: payload.failed,
                 durationMs: payload.durationMs },
        } : prev)
        loadData()   // Refrescar para tener todos los detalles
        break
    }
  }

  if (loading || loadingData) return <Loading/>
  if (!user) return null
  if (!data) return <Loading text="Run no encontrado"/>

  const { run, results } = data
  const isRunning = run.status === 'running' || run.status === 'pending'
  const completed = run.passed + run.failed + run.skipped
  const progress = run.totalTests > 0 ? (completed / run.totalTests) * 100 : 0
  const passRate = run.totalTests > 0 ? Math.round((run.passed / run.totalTests) * 100) : 0

  return (
    <div style={{ minHeight:'100vh', background:'#08080f', color:'#c4c4d8', fontFamily:'Inter,system-ui,sans-serif' }}>
      <Nav user={user}/>

      <div style={{ maxWidth:'1400px', margin:'0 auto', padding:'2rem 1.5rem' }}>
        <a href={`/api-testing/${collectionId}`} style={{ color:'#7070a0', fontSize:'.8125rem', textDecoration:'none' }}>
          ← Volver a la colección
        </a>

        <div style={{ marginTop:'.5rem', marginBottom:'1.5rem' }}>
          <h1 style={{ fontSize:'1.5rem', fontWeight:700, color:'#f0f0fc', marginBottom:'.25rem' }}>
            Run #{run.id.slice(0, 8)}
          </h1>
          <div style={{ display:'flex', gap:'.75rem', alignItems:'center', flexWrap:'wrap' }}>
            <RunStatusBadge status={run.status}/>
            <span style={{ fontSize:'.8125rem', color:'#7070a0' }}>
              {new Date(run.startedAt).toLocaleString('es-MX')}
            </span>
            {run.durationMs && (
              <span style={{ fontSize:'.8125rem', color:'#7070a0' }}>
                · {(run.durationMs / 1000).toFixed(1)}s
              </span>
            )}
          </div>
        </div>

        {/* Métricas */}
        <div style={{
          display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(120px, 1fr))',
          gap:'.625rem', marginBottom:'1.5rem',
        }}>
          <MetricCard label="Total"   value={run.totalTests}/>
          <MetricCard label="Passed"  value={run.passed}  color="#22c55e"/>
          <MetricCard label="Failed"  value={run.failed}  color="#f87171"/>
          <MetricCard label="Skipped" value={run.skipped}/>
          <MetricCard label="Pass rate" value={`${passRate}%`}
            color={passRate >= 90 ? '#22c55e' : passRate >= 70 ? '#f59e0b' : '#f87171'}/>
        </div>

        {/* Progress bar */}
        {isRunning && (
          <div style={{
            background:'#0e0e1a', border:'1px solid rgba(255,255,255,.07)',
            borderRadius:'10px', padding:'.75rem 1rem', marginBottom:'1.5rem',
          }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'.5rem' }}>
              <span style={{ fontSize:'.8125rem', color:'#c4c4d8', fontWeight:500 }}>
                Ejecutando {completed} de {run.totalTests}
              </span>
              <span style={{ fontSize:'.75rem', color:'#7070a0' }}>{Math.round(progress)}%</span>
            </div>
            <div style={{ height:6, background:'#141422', borderRadius:3, overflow:'hidden' }}>
              <div style={{
                height:'100%', width:`${progress}%`,
                background:'linear-gradient(90deg, #7c5cbf, #c4a8ff)',
                transition:'width .3s',
              }}/>
            </div>
          </div>
        )}

        <div style={{ display:'grid', gridTemplateColumns: selectedResult ? '1fr 1fr' : '1fr', gap:'1rem' }}>
          {/* Lista de resultados */}
          <div style={{
            background:'#0e0e1a', border:'1px solid rgba(255,255,255,.07)',
            borderRadius:'14px', padding:'1.25rem',
          }}>
            <h3 style={{ fontSize:'.9375rem', fontWeight:600, color:'#f0f0fc', marginBottom:'1rem' }}>
              Tests ({results.length})
            </h3>
            <div style={{ display:'flex', flexDirection:'column', gap:'.375rem', maxHeight:'600px', overflowY:'auto' }}>
              {results.map(r => (
                <div key={r.id} onClick={() => setSelectedResult(r)} style={{
                  background: selectedResult?.id === r.id ? 'rgba(124,92,191,.15)' : '#141422',
                  border:`1px solid ${selectedResult?.id === r.id ? 'rgba(124,92,191,.3)' : 'rgba(255,255,255,.04)'}`,
                  borderRadius:'8px', padding:'.5rem .75rem', cursor:'pointer',
                  display:'flex', justifyContent:'space-between', alignItems:'center',
                }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'.5rem', flex:1, minWidth:0 }}>
                    <StatusIcon status={r.status}/>
                    <span style={{ fontSize:'.75rem', color:'#f0f0fc', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {r.testName}
                    </span>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:'.375rem', fontSize:'.65rem', color:'#7070a0' }}>
                    {r.actualStatus && <span>{r.actualStatus}</span>}
                    {r.durationMs && <span>{r.durationMs}ms</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Detalle */}
          {selectedResult && (
            <div style={{
              background:'#0e0e1a', border:'1px solid rgba(255,255,255,.07)',
              borderRadius:'14px', padding:'1.25rem', position:'sticky', top:'1rem',
              maxHeight:'calc(100vh - 2rem)', overflowY:'auto',
            }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'.75rem' }}>
                <div>
                  <h3 style={{ fontSize:'.9375rem', fontWeight:600, color:'#f0f0fc' }}>
                    {selectedResult.testName}
                  </h3>
                  <div style={{ fontSize:'.7rem', color:'#7070a0', fontFamily:'monospace', marginTop:'.25rem' }}>
                    {selectedResult.endpoint}
                  </div>
                </div>
                <button onClick={() => setSelectedResult(null)} style={{
                  background:'transparent', border:'none', color:'#7070a0',
                  cursor:'pointer', fontSize:'.875rem',
                }}>✕</button>
              </div>

              {selectedResult.errorMessage && (
                <div style={{
                  background:'rgba(239,68,68,.08)', border:'1px solid rgba(239,68,68,.2)',
                  borderRadius:'8px', padding:'.5rem .75rem', marginBottom:'.75rem',
                  fontSize:'.75rem', color:'#fca5a5', fontFamily:'monospace',
                }}>{selectedResult.errorMessage}</div>
              )}

              {selectedResult.actualUrl && (
                <DetailSection label="Request URL">
                  <code style={codeStyle}>{selectedResult.actualMethod} {selectedResult.actualUrl}</code>
                </DetailSection>
              )}

              {selectedResult.actualBody !== null && selectedResult.actualBody !== undefined && (
                <DetailSection label="Request Body">
                  <pre style={preStyle}>{JSON.stringify(selectedResult.actualBody, null, 2)}</pre>
                </DetailSection>
              )}

              {selectedResult.actualStatus !== null && (
                <DetailSection label="Response Status">
                  <code style={{ ...codeStyle, color: selectedResult.actualStatus >= 200 && selectedResult.actualStatus < 300 ? '#22c55e' : '#f87171' }}>
                    {selectedResult.actualStatus}
                  </code>
                </DetailSection>
              )}

              {selectedResult.actualResponse && (
                <DetailSection label="Response Body">
                  <pre style={preStyle}>{typeof selectedResult.actualResponse === 'string' ? selectedResult.actualResponse : JSON.stringify(selectedResult.actualResponse, null, 2)}</pre>
                </DetailSection>
              )}

              {selectedResult.validationResults?.length > 0 && (
                <DetailSection label="Validaciones">
                  <div style={{ display:'flex', flexDirection:'column', gap:'.25rem' }}>
                    {selectedResult.validationResults.map((v, i) => (
                      <div key={i} style={{
                        background:'#141422', borderRadius:'6px', padding:'.375rem .625rem',
                        fontSize:'.7rem', display:'flex', justifyContent:'space-between', gap:'.5rem',
                      }}>
                        <span style={{ color:'#c4c4d8' }}>
                          {v.passed ? '✓' : '✗'} {v.type}
                        </span>
                        <span style={{ color:v.passed ? '#22c55e' : '#f87171', fontSize:'.65rem' }}>
                          {v.passed ? 'OK' : v.message || (v.errors && v.errors[0]?.message) || 'failed'}
                        </span>
                      </div>
                    ))}
                  </div>
                </DetailSection>
              )}
            </div>
          )}
        </div>

        {logs.length > 0 && (
          <details style={{
            background:'#0e0e1a', border:'1px solid rgba(255,255,255,.07)',
            borderRadius:'10px', padding:'.75rem 1rem', marginTop:'1rem',
          }}>
            <summary style={{ fontSize:'.8125rem', color:'#7070a0', cursor:'pointer', fontWeight:500 }}>
              Logs ({logs.length})
            </summary>
            <div style={{
              marginTop:'.5rem', padding:'.625rem', background:'#08080f', borderRadius:'6px',
              fontSize:'.7rem', fontFamily:'monospace', color:'#7070a0',
              maxHeight:'250px', overflowY:'auto',
            }}>
              {logs.map((l, i) => <div key={i}>{l}</div>)}
            </div>
          </details>
        )}
      </div>
    </div>
  )
}

// ── COMPONENTES ──

function DetailSection({ label, children }: any) {
  return (
    <div style={{ marginBottom:'.875rem' }}>
      <div style={{
        fontSize:'.65rem', color:'#7070a0', marginBottom:'.25rem',
        textTransform:'uppercase', letterSpacing:'.05em', fontWeight:600,
      }}>{label}</div>
      {children}
    </div>
  )
}

function MetricCard({ label, value, color = '#f0f0fc' }: any) {
  return (
    <div style={{
      background:'#0e0e1a', border:'1px solid rgba(255,255,255,.07)',
      borderRadius:'10px', padding:'.75rem 1rem', textAlign:'center',
    }}>
      <div style={{ fontSize:'1.375rem', fontWeight:700, color, lineHeight:1 }}>{value}</div>
      <div style={{ fontSize:'.7rem', color:'#7070a0', marginTop:'.25rem', textTransform:'uppercase', letterSpacing:'.05em', fontWeight:600 }}>
        {label}
      </div>
    </div>
  )
}

function StatusIcon({ status }: { status: string }) {
  const colors: Record<string, { bg: string; ico: string; c: string }> = {
    passed:  { bg:'rgba(34,197,94,.15)',  ico:'✓', c:'#22c55e' },
    failed:  { bg:'rgba(239,68,68,.15)',  ico:'✗', c:'#f87171' },
    running: { bg:'rgba(38,181,170,.12)', ico:'⏳', c:'#26b5aa' },
    pending: { bg:'rgba(255,255,255,.03)', ico:'○', c:'#5a5a7a' },
    skipped: { bg:'rgba(255,255,255,.04)', ico:'⊘', c:'#7070a0' },
  }
  const s = colors[status] || colors.pending
  return (
    <span style={{
      background:s.bg, color:s.c, width:18, height:18, borderRadius:4,
      display:'inline-flex', alignItems:'center', justifyContent:'center',
      fontSize:'.7rem', fontWeight:700, flexShrink:0,
    }}>{s.ico}</span>
  )
}

function RunStatusBadge({ status }: { status: string }) {
  const colors: Record<string, [string, string]> = {
    pending:   ['#7070a0', 'rgba(255,255,255,.05)'],
    running:   ['#26b5aa', 'rgba(38,181,170,.12)'],
    completed: ['#22c55e', 'rgba(34,197,94,.12)'],
    failed:    ['#f87171', 'rgba(239,68,68,.12)'],
  }
  const [c, bg] = colors[status] || colors.pending
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:'.375rem',
      background:bg, color:c, padding:'.25rem .625rem', borderRadius:6,
      fontSize:'.7rem', fontWeight:600, textTransform:'uppercase', letterSpacing:'.04em',
    }}>
      <div style={{ width:6, height:6, borderRadius:'50%', background:c }}/>
      {status}
    </span>
  )
}

function Nav({ user }: any) {
  return (
    <nav style={{
      display:'flex', justifyContent:'space-between', alignItems:'center',
      padding:'1rem 2rem', borderBottom:'1px solid rgba(255,255,255,.07)', background:'#0e0e1a',
    }}>
      <a href="/api-testing" style={{ color:'#c4a8ff', textDecoration:'none', fontSize:'.875rem' }}>← API Testing</a>
      <div style={{ display:'flex', gap:'1rem', alignItems:'center' }}>
        <span style={{ fontSize:'.8125rem', color:'#7070a0' }}>
          {user.email} · <strong style={{ color:'#c4a8ff' }}>{user.plan}</strong>
        </span>
        <button onClick={logout} style={{
          background:'transparent', border:'1px solid rgba(255,255,255,.1)',
          color:'#7070a0', borderRadius:'8px', padding:'.375rem .875rem',
          fontSize:'.75rem', cursor:'pointer',
        }}>Salir</button>
      </div>
    </nav>
  )
}

function Loading({ text }: { text?: string } = {}) {
  return <div style={{ minHeight:'100vh', background:'#08080f', display:'flex', alignItems:'center', justifyContent:'center', color:'#7070a0' }}>{text || 'Cargando...'}</div>
}

const codeStyle: React.CSSProperties = {
  background:'#08080f', padding:'.375rem .625rem', borderRadius:'6px',
  fontSize:'.7rem', color:'#c4a8ff', fontFamily:'monospace',
  display:'block', wordBreak:'break-all',
}
const preStyle: React.CSSProperties = {
  background:'#08080f', padding:'.5rem .625rem', borderRadius:'6px',
  fontSize:'.65rem', color:'#c4c4d8', fontFamily:'monospace',
  overflow:'auto', maxHeight:'250px', margin:0,
}
