'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useParams }        from 'next/navigation'
import { useAuth }                     from '@/hooks/useAuth'
import { api, logout }                 from '@/lib/api'

interface RunData {
  run: {
    id:               string
    suiteId:          string
    status:           string
    totalSpecs:       number
    totalDevices:     number
    totalJobs:        number
    passed:           number
    failed:           number
    skipped:          number
    durationMs:       number | null
    startedAt:        string
    completedAt:      string | null
    playwrightReportUrl: string | null
    allureReportUrl:     string | null
    allureZipUrl:        string | null
  }
  specs:    Array<{ suiteSpecId: string; testName: string; targetUrl: string }>
  deviceIds: string[]
  deviceFarm: { id: string; name: string; devices: any[] } | null
  results:  Array<{
    suiteSpecId:   string
    deviceId:      string
    status:        string
    durationMs:    number | null
    errorMessage:  string | null
    screenshotUrl: string | null
  }>
}

export default function SuiteRunDetailPage() {
  const router = useRouter()
  const params = useParams()
  const suiteId = params.id    as string
  const runId   = params.runId as string
  const { user, loading } = useAuth(true)

  const [data,    setData]    = useState<RunData | null>(null)
  const [loadingData, setLoadingData] = useState(true)
  const [error,   setError]   = useState('')
  const [logs,    setLogs]    = useState<string[]>([])
  const [reportsReady, setReportsReady] = useState(false)
  const [selectedCell, setSelectedCell] = useState<{ specId: string; deviceId: string } | null>(null)
  const [showAllureProModal, setShowAllureProModal] = useState(false)

  useEffect(() => {
    if (!user) return
    loadData()
    openStream()
  }, [user, runId])

  async function loadData() {
    try {
      const r = await api.get(`/api/suites/${suiteId}/runs/${runId}`)
      setData(r.data)
      // Si ya hay reportes generados, marcarlos como listos
      if (r.data?.run?.playwrightReportUrl) setReportsReady(true)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoadingData(false)
    }
  }

  async function openStream() {
    const token = localStorage.getItem('token')
    if (!token) return

    try {
      const res = await fetch(`/api/suites/${suiteId}/runs/${runId}/stream`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok || !res.body) return

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
          let dataStr = ''
          for (const line of lines) {
            if (line.startsWith('event: ')) event = line.slice(7).trim()
            else if (line.startsWith('data: ')) dataStr += line.slice(6)
          }
          if (dataStr) handleEvent(event, dataStr)
        }
      }
    } catch (err: any) {
      setLogs(prev => [...prev, `[stream] ${err.message}`])
    }
  }

  function handleEvent(event: string, dataStr: string) {
    let payload: any
    try { payload = JSON.parse(dataStr) } catch { return }

    switch (event) {
      case 'status':
        setLogs(prev => [...prev.slice(-50), payload.message || 'Status update'])
        break
      case 'result_update':
        // Actualizar la celda específica en data
        setData(prev => {
          if (!prev) return prev
          const newResults = prev.results.map(r =>
            r.suiteSpecId === payload.suiteSpecId && r.deviceId === payload.deviceId
              ? { ...r, status: payload.status, durationMs: payload.durationMs,
                  errorMessage: payload.errorMessage, screenshotUrl: payload.screenshotUrl }
              : r
          )
          return { ...prev, results: newResults }
        })
        break
      case 'progress':
        setData(prev => {
          if (!prev) return prev
          return { ...prev, run: { ...prev.run, passed: payload.passed, failed: payload.failed, skipped: payload.skipped } }
        })
        break
      case 'completed':
        setData(prev => {
          if (!prev) return prev
          return { ...prev, run: { ...prev.run, status: payload.status,
            passed: payload.passed, failed: payload.failed, skipped: payload.skipped,
            durationMs: payload.durationMs } }
        })
        setLogs(prev => [...prev, '✓ Run completado, generando reportes...'])
        break
      case 'reports_ready':
        setReportsReady(true)
        setData(prev => prev ? { ...prev, run: {
          ...prev.run,
          playwrightReportUrl: payload.playwrightReportUrl,
          allureReportUrl:     payload.allureReportUrl,
          allureZipUrl:        payload.allureZipUrl,
        } } : prev)
        setLogs(prev => [...prev, '✓ Reportes listos'])
        break
      case 'final':
        if (payload.playwrightReportUrl) setReportsReady(true)
        loadData()
        break
    }
  }

  if (loading || loadingData) return <Loading/>
  if (!user) return null
  if (!data) return <Loading text={error || 'Run no encontrado'}/>

  const { run, specs, deviceIds, deviceFarm, results } = data

  // Construir matriz para el grid
  const resultMap: Record<string, any> = {}
  for (const r of results) {
    resultMap[`${r.suiteSpecId}::${r.deviceId}`] = r
  }

  const cellResult = (specId: string, deviceId: string) =>
    resultMap[`${specId}::${deviceId}`] || { status: 'pending' }

  const selected = selectedCell ? cellResult(selectedCell.specId, selectedCell.deviceId) : null
  const selectedSpec = selectedCell ? specs.find(s => s.suiteSpecId === selectedCell.specId) : null

  const passRate = run.totalJobs > 0 ? Math.round((run.passed / run.totalJobs) * 100) : 0
  const isRunning = run.status === 'running' || run.status === 'pending'

  // Nombre amigable de device
  const deviceName = (deviceId: string) => {
    if (deviceFarm) {
      const d = deviceFarm.devices.find((d: any) => d.deviceId === deviceId)
      return d?.name || deviceId
    }
    return deviceId
  }

  return (
    <div style={{ minHeight:'100vh', background:'#08080f', color:'#c4c4d8', fontFamily:'Inter,system-ui,sans-serif' }}>
      <Nav user={user}/>

      <div style={{ maxWidth:'1400px', margin:'0 auto', padding:'2rem 1.5rem' }}>
        {/* Header */}
        <div style={{ marginBottom:'1.5rem' }}>
          <a href={`/suites/${suiteId}`} style={{ color:'#7070a0', fontSize:'.8125rem', textDecoration:'none' }}>
            ← Volver a la suite
          </a>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginTop:'.5rem', gap:'1rem', flexWrap:'wrap' }}>
            <div>
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
                {deviceFarm && (
                  <span style={{ fontSize:'.8125rem', color:'#c4a8ff' }}>
                    🏭 {deviceFarm.name}
                  </span>
                )}
              </div>
            </div>

            {/* Botones de reportes */}
            {reportsReady && (
              <div style={{ display:'flex', gap:'.5rem', flexWrap: 'wrap' }}>
                {run.playwrightReportUrl && (
                  <a href={run.playwrightReportUrl} target="_blank" rel="noopener" style={btnReportStyle}>
                    📊 Playwright Report
                  </a>
                )}
                {run.allureReportUrl && (
                  <a href={run.allureReportUrl} target="_blank" rel="noopener" style={btnReportStyle}>
                    📈 Allure Report
                  </a>
                )}
                {run.allureZipUrl && (
                  <a href={run.allureZipUrl} download style={btnReportStyle}>
                    ⬇ ZIP
                  </a>
                )}
                {/* Generar en módulo Allure Pro (con histórico) */}
                <button
                  onClick={() => setShowAllureProModal(true)}
                  style={{ ...btnReportStyle, background: 'rgba(38,181,170,.15)', borderColor: 'rgba(38,181,170,.3)', color: '#26b5aa', cursor: 'pointer' }}
                >
                  ✨ Allure Pro (con histórico)
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Métricas */}
        <div style={{
          display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(120px, 1fr))',
          gap:'.625rem', marginBottom:'1.5rem',
        }}>
          <MetricCard label="Specs"   value={run.totalSpecs}/>
          <MetricCard label="Devices" value={run.totalDevices}/>
          <MetricCard label="Total"   value={run.totalJobs}/>
          <MetricCard label="Passed"  value={run.passed}  color="#22c55e"/>
          <MetricCard label="Failed"  value={run.failed}  color="#f87171"/>
          <MetricCard label="Pass rate" value={`${passRate}%`} color={passRate >= 90 ? '#22c55e' : passRate >= 70 ? '#f59e0b' : '#f87171'}/>
        </div>

        {/* Progress bar si está corriendo */}
        {isRunning && (
          <div style={{
            background:'#0e0e1a', border:'1px solid rgba(255,255,255,.07)',
            borderRadius:'10px', padding:'.75rem 1rem', marginBottom:'1.5rem',
          }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'.5rem' }}>
              <span style={{ fontSize:'.8125rem', color:'#c4c4d8', fontWeight:500 }}>
                Ejecutando... {run.passed + run.failed + run.skipped} de {run.totalJobs}
              </span>
              <span style={{ fontSize:'.75rem', color:'#7070a0' }}>
                {Math.round(((run.passed + run.failed + run.skipped) / run.totalJobs) * 100)}%
              </span>
            </div>
            <div style={{ height:6, background:'#141422', borderRadius:3, overflow:'hidden' }}>
              <div style={{
                height:'100%', width: `${((run.passed + run.failed + run.skipped) / run.totalJobs) * 100}%`,
                background: 'linear-gradient(90deg, #7c5cbf, #c4a8ff)',
                transition: 'width .3s',
              }}/>
            </div>
          </div>
        )}

        {/* Grid de resultados */}
        <div style={{
          background:'#0e0e1a', border:'1px solid rgba(255,255,255,.07)',
          borderRadius:'14px', padding:'1.25rem', marginBottom:'1.5rem',
          overflowX:'auto',
        }}>
          <h3 style={{ fontSize:'.9375rem', fontWeight:600, color:'#f0f0fc', marginBottom:'1rem' }}>
            Matriz de resultados ({specs.length} × {deviceIds.length})
          </h3>

          <table style={{ width:'100%', borderCollapse:'separate', borderSpacing:0, minWidth: Math.max(600, 200 + deviceIds.length * 130) }}>
            <thead>
              <tr>
                <th style={thStyle}>Spec</th>
                {deviceIds.map(did => (
                  <th key={did} style={{ ...thStyle, textAlign:'center', minWidth:120 }}>
                    <div style={{ fontSize:'.75rem', color:'#c4c4d8', fontWeight:500 }}>
                      {deviceName(did)}
                    </div>
                    <div style={{ fontSize:'.6875rem', color:'#5a5a7a', fontFamily:'monospace' }}>
                      {did}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {specs.map(spec => (
                <tr key={spec.suiteSpecId}>
                  <td style={tdSpecStyle}>
                    <div style={{ fontSize:'.875rem', color:'#f0f0fc', fontWeight:500 }}>
                      {spec.testName}
                    </div>
                    <div style={{ fontSize:'.7rem', color:'#7070a0', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:240 }}>
                      {spec.targetUrl}
                    </div>
                  </td>
                  {deviceIds.map(did => {
                    const result = cellResult(spec.suiteSpecId, did)
                    const isSelected = selectedCell?.specId === spec.suiteSpecId && selectedCell?.deviceId === did
                    return (
                      <td key={did} style={{
                        ...tdCellStyle,
                        background: isSelected ? 'rgba(124,92,191,.15)' : undefined,
                        cursor: 'pointer',
                      }}
                      onClick={() => setSelectedCell({ specId: spec.suiteSpecId, deviceId: did })}
                      >
                        <ResultCell result={result}/>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Detalle de celda seleccionada */}
        {selected && selectedSpec && (
          <div style={{
            background:'#0e0e1a', border:'1px solid rgba(255,255,255,.07)',
            borderRadius:'14px', padding:'1.25rem', marginBottom:'1.5rem',
          }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem' }}>
              <div>
                <h3 style={{ fontSize:'.9375rem', fontWeight:600, color:'#f0f0fc' }}>
                  {selectedSpec.testName}
                </h3>
                <div style={{ fontSize:'.75rem', color:'#7070a0', marginTop:'.125rem' }}>
                  Dispositivo: <span style={{ color:'#c4a8ff' }}>{deviceName(selectedCell!.deviceId)}</span>
                  {selected.durationMs && <> · {(selected.durationMs/1000).toFixed(1)}s</>}
                </div>
              </div>
              <button onClick={() => setSelectedCell(null)} style={iconBtnStyle}>✕</button>
            </div>

            <ResultStatusBadge status={selected.status}/>

            {selected.errorMessage && (
              <div style={{
                marginTop:'.875rem',
                background:'rgba(239,68,68,.08)', border:'1px solid rgba(239,68,68,.2)',
                borderRadius:'8px', padding:'.75rem',
              }}>
                <div style={{ fontSize:'.7rem', color:'#f87171', fontWeight:600, marginBottom:'.25rem', textTransform:'uppercase', letterSpacing:'.05em' }}>
                  Error
                </div>
                <code style={{ fontSize:'.75rem', color:'#fca5a5', fontFamily:'JetBrains Mono, monospace', wordBreak:'break-word' }}>
                  {selected.errorMessage}
                </code>
              </div>
            )}

            {selected.screenshotUrl && (
              <div style={{ marginTop:'.875rem' }}>
                <div style={{ fontSize:'.7rem', color:'#7070a0', marginBottom:'.5rem', fontWeight:600, textTransform:'uppercase', letterSpacing:'.05em' }}>
                  Último screenshot
                </div>
                <img src={selected.screenshotUrl} alt="Screenshot"
                  style={{ maxWidth:'100%', maxHeight:'400px', borderRadius:'8px', border:'1px solid rgba(255,255,255,.07)' }}/>
              </div>
            )}
          </div>
        )}

        {/* Logs */}
        {logs.length > 0 && (
          <details style={{
            background:'#0e0e1a', border:'1px solid rgba(255,255,255,.07)',
            borderRadius:'10px', padding:'.75rem 1rem',
          }}>
            <summary style={{ fontSize:'.8125rem', color:'#7070a0', cursor:'pointer', fontWeight:500 }}>
              Logs ({logs.length})
            </summary>
            <div style={{
              marginTop:'.5rem', padding:'.625rem', background:'#08080f',
              borderRadius:'6px', fontSize:'.7rem', fontFamily:'monospace',
              color:'#7070a0', maxHeight:'200px', overflowY:'auto',
            }}>
              {logs.map((l, i) => <div key={i}>{l}</div>)}
            </div>
          </details>
        )}
      </div>

      {showAllureProModal && (
        <AllureProModal
          suiteRunId={params.runId as string}
          onClose={() => setShowAllureProModal(false)}
        />
      )}
    </div>
  )
}

// ── ALLURE PRO MODAL ──

function AllureProModal({ suiteRunId, onClose }: { suiteRunId: string; onClose: () => void }) {
  const router = useRouter()
  const [projects, setProjects] = useState<any[]>([])
  const [loadingProjects, setLoadingProjects] = useState(true)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [newProjectName, setNewProjectName] = useState('')
  const [mode, setMode] = useState<'existing' | 'new'>('existing')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/api/allure/projects').then(r => {
      const list = r.data || []
      setProjects(list)
      if (list.length > 0) {
        setSelectedProjectId(list[0].id)
      } else {
        setMode('new')
      }
      setLoadingProjects(false)
    }).catch(() => setLoadingProjects(false))
  }, [])

  async function submit() {
    setError('')
    setSubmitting(true)
    try {
      let projectId = selectedProjectId
      if (mode === 'new') {
        if (!newProjectName.trim()) {
          setError('Nombre del project requerido')
          setSubmitting(false)
          return
        }
        const r = await api.post('/api/allure/projects', { name: newProjectName.trim() })
        projectId = r.data.id
      }
      if (!projectId) {
        setError('Selecciona un project')
        setSubmitting(false)
        return
      }
      const r = await api.post('/api/allure/runs/from-suite', { suiteRunId, projectId })
      router.push(`/allure/runs/${r.data.id}`)
    } catch (err: any) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100, padding: '1rem',
    }} onClick={onClose}>
      <div style={{
        background: '#0e0e1a', border: '1px solid rgba(38,181,170,.3)',
        borderRadius: 14, padding: '1.5rem',
        width: '100%', maxWidth: 480,
      }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#f0f0fc', marginBottom: '.5rem' }}>
          ✨ Generar en Allure Pro
        </h3>
        <p style={{ fontSize: '.8125rem', color: '#7070a0', marginBottom: '1rem' }}>
          A diferencia del Allure embebido, Allure Pro mantiene histórico, detecta tests flaky,
          y permite compartir links públicos del reporte.
        </p>

        {loadingProjects ? (
          <div style={{ padding: '1.5rem', textAlign: 'center', color: '#7070a0' }}>Cargando projects...</div>
        ) : (
          <>
            {/* Mode selector */}
            {projects.length > 0 && (
              <div style={{ display: 'flex', gap: '.25rem', marginBottom: '1rem', background: '#141422', padding: '.25rem', borderRadius: 8 }}>
                <button onClick={() => setMode('existing')} style={{
                  flex: 1, background: mode === 'existing' ? 'rgba(38,181,170,.18)' : 'transparent',
                  border: 'none', borderRadius: 6, padding: '.4375rem',
                  color: mode === 'existing' ? '#26b5aa' : '#7070a0',
                  fontWeight: mode === 'existing' ? 600 : 500,
                  fontSize: '.75rem', cursor: 'pointer', fontFamily: 'inherit',
                }}>Project existente</button>
                <button onClick={() => setMode('new')} style={{
                  flex: 1, background: mode === 'new' ? 'rgba(38,181,170,.18)' : 'transparent',
                  border: 'none', borderRadius: 6, padding: '.4375rem',
                  color: mode === 'new' ? '#26b5aa' : '#7070a0',
                  fontWeight: mode === 'new' ? 600 : 500,
                  fontSize: '.75rem', cursor: 'pointer', fontFamily: 'inherit',
                }}>Crear nuevo</button>
              </div>
            )}

            {mode === 'existing' && projects.length > 0 ? (
              <div style={{ display: 'grid', gap: '.375rem', marginBottom: '1rem', maxHeight: 240, overflowY: 'auto' }}>
                {projects.map(p => (
                  <label key={p.id} style={{
                    display: 'flex', gap: '.5rem', alignItems: 'center',
                    padding: '.5rem .75rem',
                    background: selectedProjectId === p.id ? 'rgba(38,181,170,.1)' : '#141422',
                    border: `1px solid ${selectedProjectId === p.id ? '#26b5aa' : 'rgba(255,255,255,.05)'}`,
                    borderRadius: 8, cursor: 'pointer',
                  }}>
                    <input type="radio" name="proj" checked={selectedProjectId === p.id}
                      onChange={() => setSelectedProjectId(p.id)}/>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '.875rem', color: '#f0f0fc', fontWeight: 500 }}>{p.name}</div>
                      <div style={{ fontSize: '.7rem', color: '#7070a0' }}>{p.totalRuns} runs</div>
                    </div>
                  </label>
                ))}
              </div>
            ) : (
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '.7rem', color: '#7070a0', marginBottom: '.25rem', fontWeight: 500 }}>
                  Nombre del nuevo project
                </label>
                <input
                  value={newProjectName}
                  onChange={e => setNewProjectName(e.target.value)}
                  placeholder="Ej. E2E - Producción"
                  style={{
                    width: '100%', background: '#141422',
                    border: '1px solid rgba(255,255,255,.1)', borderRadius: 8,
                    padding: '.5rem .75rem', color: '#f0f0fc',
                    fontSize: '.875rem', outline: 'none', fontFamily: 'inherit',
                  }}
                  autoFocus
                />
              </div>
            )}

            {error && (
              <div style={{
                background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)',
                borderRadius: 8, padding: '.5rem .75rem', fontSize: '.75rem',
                color: '#f87171', marginBottom: '.75rem',
              }}>{error}</div>
            )}

            <div style={{ display: 'flex', gap: '.5rem' }}>
              <button onClick={onClose} style={{
                background: 'transparent', border: '1px solid rgba(255,255,255,.1)',
                color: '#7070a0', borderRadius: 8,
                padding: '.5rem 1rem', fontSize: '.8125rem', cursor: 'pointer', fontFamily: 'inherit',
              }}>Cancelar</button>
              <button onClick={submit} disabled={submitting} style={{
                flex: 1,
                background: '#26b5aa', color: '#fff', border: 'none', borderRadius: 8,
                padding: '.5rem 1rem', fontSize: '.875rem', fontWeight: 600,
                cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                opacity: submitting ? .6 : 1,
                boxShadow: '0 4px 20px rgba(38,181,170,.4)',
              }}>
                {submitting ? 'Generando...' : '✨ Generar reporte'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── COMPONENTES ──

function ResultCell({ result }: any) {
  const status = result.status
  const colors: Record<string, { bg: string; icon: string; color: string }> = {
    passed:  { bg: 'rgba(34,197,94,.15)',  icon: '✓', color: '#22c55e' },
    failed:  { bg: 'rgba(239,68,68,.15)',  icon: '✗', color: '#f87171' },
    running: { bg: 'rgba(38,181,170,.12)', icon: '⏳', color: '#26b5aa' },
    pending: { bg: 'rgba(255,255,255,.03)', icon: '○', color: '#5a5a7a' },
    skipped: { bg: 'rgba(255,255,255,.04)', icon: '⊘', color: '#7070a0' },
  }
  const s = colors[status] || colors.pending

  return (
    <div style={{
      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
      background:s.bg, borderRadius:'8px', padding:'.625rem .5rem',
      minHeight:60, transition:'background .15s',
    }}>
      <div style={{
        fontSize:'1.125rem', fontWeight:700, color:s.color,
        animation: status === 'running' ? 'pulse 1.5s infinite' : 'none',
      }}>
        {s.icon}
      </div>
      {result.durationMs && (
        <div style={{ fontSize:'.65rem', color:'#7070a0', marginTop:'.125rem' }}>
          {(result.durationMs / 1000).toFixed(1)}s
        </div>
      )}
      <style>{`@keyframes pulse { 50% { opacity: .4 } }`}</style>
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

function RunStatusBadge({ status }: any) {
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
      fontSize:'.75rem', fontWeight:600, textTransform:'uppercase', letterSpacing:'.04em',
    }}>
      <div style={{
        width:6, height:6, borderRadius:'50%', background:c,
        animation: status === 'running' ? 'pulse 1.5s infinite' : 'none',
      }}/>
      {status}
    </span>
  )
}

function ResultStatusBadge({ status }: any) {
  const labels: Record<string, string> = {
    passed: '✓ Passed', failed: '✗ Failed', running: '⏳ Running', pending: '○ Pending', skipped: '⊘ Skipped',
  }
  const colors: Record<string, [string, string]> = {
    passed:  ['#22c55e', 'rgba(34,197,94,.15)'],
    failed:  ['#f87171', 'rgba(239,68,68,.15)'],
    running: ['#26b5aa', 'rgba(38,181,170,.12)'],
    pending: ['#7070a0', 'rgba(255,255,255,.05)'],
    skipped: ['#7070a0', 'rgba(255,255,255,.04)'],
  }
  const [c, bg] = colors[status] || colors.pending
  return (
    <span style={{
      display:'inline-block', background:bg, color:c,
      padding:'.375rem .75rem', borderRadius:6, fontSize:'.8125rem', fontWeight:600,
    }}>
      {labels[status] || status}
    </span>
  )
}

function Nav({ user }: any) {
  return (
    <nav style={{
      display:'flex', justifyContent:'space-between', alignItems:'center',
      padding:'1rem 2rem', borderBottom:'1px solid rgba(255,255,255,.07)', background:'#0e0e1a',
    }}>
      <a href="/dashboard" style={{ color:'#c4a8ff', textDecoration:'none', fontSize:'.875rem' }}>← Dashboard</a>
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
  return <div style={{
    minHeight:'100vh', background:'#08080f',
    display:'flex', alignItems:'center', justifyContent:'center',
    color:'#7070a0',
  }}>{text || 'Cargando...'}</div>
}

// ── Styles ──
const thStyle: React.CSSProperties = {
  padding:'.625rem .75rem', textAlign:'left',
  borderBottom:'1px solid rgba(255,255,255,.07)',
  fontSize:'.7rem', fontWeight:600, color:'#7070a0',
  textTransform:'uppercase', letterSpacing:'.04em',
  background:'#0a0a14',
}
const tdSpecStyle: React.CSSProperties = {
  padding:'.625rem .75rem',
  borderBottom:'1px solid rgba(255,255,255,.04)',
  verticalAlign:'middle',
}
const tdCellStyle: React.CSSProperties = {
  padding:'.375rem',
  borderBottom:'1px solid rgba(255,255,255,.04)',
  verticalAlign:'middle',
}
const btnReportStyle: React.CSSProperties = {
  background:'#141422', color:'#c4c4d8',
  border:'1px solid rgba(255,255,255,.1)', borderRadius:'8px',
  padding:'.5rem .875rem', fontSize:'.8125rem', fontWeight:500,
  textDecoration:'none', cursor:'pointer', fontFamily:'inherit',
  display:'inline-flex', alignItems:'center', gap:'.375rem',
}
const iconBtnStyle: React.CSSProperties = {
  background:'transparent', border:'none', color:'#7070a0',
  cursor:'pointer', fontSize:'.875rem', padding:'.25rem .5rem',
}
