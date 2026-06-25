'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, useSearchParams }  from 'next/navigation'
import { useAuth }                     from '@/hooks/useAuth'
import { api, logout }                 from '@/lib/api'

interface Project {
  id:           string
  name:         string
  description:  string | null
  uploadEnabled: boolean
}

export default function AllureUploadPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const presetProjectId = searchParams?.get('projectId') || null
  const { user, loading } = useAuth(true)

  const [projects, setProjects] = useState<Project[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(presetProjectId)
  const [step, setStep] = useState<'project' | 'instructions' | 'browser'>('project')

  // Browser upload state
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadToken, setUploadToken] = useState('')
  const [error, setError] = useState('')

  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!user) return
    if (user.plan !== 'teammate') { router.push('/pricing'); return }
    loadProjects()
  }, [user])

  useEffect(() => {
    if (selectedProjectId && projects.length > 0 && step === 'project') {
      // Si vino con projectId en URL, saltar al step de instrucciones
      setStep('instructions')
    }
  }, [selectedProjectId, projects])

  async function loadProjects() {
    try {
      const r = await api.get('/api/allure/projects')
      setProjects(r.data || [])
    } catch {}
    setLoadingData(false)
  }

  const selectedProject = projects.find(p => p.id === selectedProjectId)
  const isAdvancePlus = user?.plan && user.plan !== 'teammate' && user.plan !== 'starter'

  async function uploadFromBrowser() {
    setError('')
    if (!file) { setError('Selecciona un archivo'); return }
    if (!uploadToken.trim()) { setError('Token requerido'); return }
    if (!selectedProjectId) return

    setUploading(true)
    setUploadProgress(0)
    try {
      const xhr = new XMLHttpRequest()
      const promise = new Promise<any>((resolve, reject) => {
        xhr.open('POST', `/api/allure/projects/${selectedProjectId}/upload`)
        xhr.setRequestHeader('Authorization', `Bearer ${uploadToken.trim()}`)
        xhr.setRequestHeader('X-Run-Name', file.name.replace('.zip', ''))
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setUploadProgress(Math.round((e.loaded / e.total) * 100))
          }
        }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try { resolve(JSON.parse(xhr.responseText)) }
            catch { reject(new Error('Respuesta inválida')) }
          } else {
            try {
              const r = JSON.parse(xhr.responseText)
              reject(new Error(r.error || `HTTP ${xhr.status}`))
            } catch { reject(new Error(`HTTP ${xhr.status}`)) }
          }
        }
        xhr.onerror = () => reject(new Error('Error de red'))
        xhr.send(file)
      })
      const result = await promise
      // Redirigir al detalle del run
      router.push(`/allure/runs/${result.data.runId}`)
    } catch (err: any) {
      setError(err.message)
      setUploading(false)
    }
  }

  if (loading || loadingData) return <Loading/>
  if (!user) return null

  return (
    <div style={{ minHeight: '100vh', background: '#08080f', color: '#c4c4d8', fontFamily: 'Inter,system-ui,sans-serif' }}>
      <Nav user={user}/>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '2rem 1.5rem' }}>
        <a href="/allure" style={{ color: '#7070a0', fontSize: '.8125rem', textDecoration: 'none' }}>
          ← Volver a Allure
        </a>

        <h1 style={{
          fontSize: '1.5rem', fontWeight: 700, color: '#f0f0fc',
          marginTop: '.5rem', marginBottom: '.25rem',
        }}>
          ⬆️ Subir allure-results
        </h1>
        <p style={{ color: '#7070a0', fontSize: '.9375rem', marginBottom: '1.5rem' }}>
          Genera un reporte desde resultados externos (CI/CD u otros frameworks)
        </p>

        {!isAdvancePlus && (
          <div style={{
            background: 'rgba(249,115,22,.08)',
            border: '1px solid rgba(249,115,22,.25)',
            borderRadius: 12, padding: '1.25rem', marginBottom: '1rem',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '2.25rem', marginBottom: '.5rem' }}>🔒</div>
            <h3 style={{ color: '#fb923c', fontSize: '1.0625rem', marginBottom: '.375rem' }}>
              Uploads externos requieren plan Advance
            </h3>
            <p style={{ color: '#7070a0', fontSize: '.875rem', marginBottom: '1.25rem', maxWidth: 480, margin: '0 auto 1.25rem' }}>
              Sube allure-results directamente desde GitHub Actions, GitLab CI, Jenkins,
              o cualquier pipeline. También se aceptan uploads manuales desde el browser.
            </p>
            <button onClick={() => router.push('/pricing')} style={{
              background: '#fb923c', color: '#fff', border: 'none', borderRadius: 8,
              padding: '.625rem 1.25rem', fontSize: '.875rem', fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
              Ver plan Advance →
            </button>
          </div>
        )}

        {isAdvancePlus && (
          <>
            {/* Stepper visual */}
            <div style={{
              display: 'flex', gap: '.5rem', marginBottom: '1.5rem',
              fontSize: '.75rem',
            }}>
              <StepIndicator current={step} value="project" label="1. Project"/>
              <StepIndicator current={step} value="instructions" label="2. Instrucciones"/>
              <StepIndicator current={step} value="browser" label="3. Subir"/>
            </div>

            {/* Step 1: project */}
            {step === 'project' && (
              <div style={cardStyle}>
                <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#f0f0fc', marginBottom: '.5rem' }}>
                  Selecciona el project destino
                </h2>
                <p style={{ fontSize: '.8125rem', color: '#7070a0', marginBottom: '1rem' }}>
                  Los runs se agruparán en este project para análisis histórico y detección de flaky tests.
                </p>

                {projects.length === 0 ? (
                  <div style={{
                    textAlign: 'center', padding: '2rem',
                    background: '#141422', borderRadius: 10,
                  }}>
                    <div style={{ fontSize: '2rem', marginBottom: '.5rem' }}>📁</div>
                    <p style={{ color: '#7070a0', fontSize: '.875rem', marginBottom: '1rem' }}>
                      Aún no tienes projects. Crea uno primero.
                    </p>
                    <button onClick={() => router.push('/allure')} style={btnPrimaryStyle}>
                      Ir a crear project
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: '.5rem' }}>
                    {projects.map(p => (
                      <div key={p.id}
                        onClick={() => { setSelectedProjectId(p.id); setStep('instructions') }}
                        style={{
                          padding: '.875rem 1rem',
                          background: selectedProjectId === p.id ? 'rgba(38,181,170,.1)' : '#141422',
                          border: `1px solid ${selectedProjectId === p.id ? '#26b5aa' : 'rgba(255,255,255,.05)'}`,
                          borderRadius: 10, cursor: 'pointer',
                          transition: 'border-color .15s',
                        }}
                        onMouseEnter={(e: any) => {
                          if (selectedProjectId !== p.id) {
                            e.currentTarget.style.borderColor = 'rgba(38,181,170,.3)'
                          }
                        }}
                        onMouseLeave={(e: any) => {
                          if (selectedProjectId !== p.id) {
                            e.currentTarget.style.borderColor = 'rgba(255,255,255,.05)'
                          }
                        }}
                      >
                        <div style={{ fontSize: '.9375rem', fontWeight: 600, color: '#f0f0fc' }}>{p.name}</div>
                        {p.description && (
                          <div style={{ fontSize: '.75rem', color: '#7070a0', marginTop: '.125rem' }}>{p.description}</div>
                        )}
                        {!p.uploadEnabled && (
                          <div style={{ fontSize: '.7rem', color: '#fb923c', marginTop: '.25rem' }}>
                            ⚠️ Uploads no habilitados (se activarán al continuar)
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Step 2: instructions */}
            {step === 'instructions' && selectedProject && (
              <InstructionsStep
                project={selectedProject}
                onBack={() => setStep('project')}
                onContinueBrowser={() => setStep('browser')}
              />
            )}

            {/* Step 3: browser upload */}
            {step === 'browser' && selectedProject && (
              <div style={cardStyle}>
                <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#f0f0fc', marginBottom: '.5rem' }}>
                  Subir desde tu navegador
                </h2>
                <p style={{ fontSize: '.8125rem', color: '#7070a0', marginBottom: '1rem' }}>
                  Para uploads manuales o pruebas. Recuerda comprimir tu carpeta allure-results como ZIP.
                </p>

                <Field label="Upload token">
                  <input
                    type="password"
                    value={uploadToken}
                    onChange={e => setUploadToken(e.target.value)}
                    placeholder="at_..."
                    style={inputStyle}
                  />
                  <div style={{ fontSize: '.7rem', color: '#7070a0', marginTop: '.25rem' }}>
                    Obtén o rota el token en la pestaña Settings del project.
                  </div>
                </Field>

                <Field label="Archivo allure-results.zip">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".zip"
                    onChange={e => setFile(e.target.files?.[0] || null)}
                    style={{ display: 'none' }}
                  />
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = '#26b5aa' }}
                    onDragLeave={(e: any) => e.currentTarget.style.borderColor = 'rgba(255,255,255,.1)'}
                    onDrop={(e: any) => {
                      e.preventDefault()
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,.1)'
                      const f = e.dataTransfer.files?.[0]
                      if (f) setFile(f)
                    }}
                    style={{
                      border: '2px dashed rgba(255,255,255,.1)',
                      borderRadius: 10, padding: '2rem',
                      textAlign: 'center', cursor: 'pointer',
                      background: '#141422',
                      transition: 'border-color .15s',
                    }}
                  >
                    {file ? (
                      <>
                        <div style={{ fontSize: '2rem', marginBottom: '.375rem' }}>📦</div>
                        <div style={{ fontSize: '.9375rem', color: '#f0f0fc', fontWeight: 500 }}>{file.name}</div>
                        <div style={{ fontSize: '.75rem', color: '#7070a0', marginTop: '.25rem' }}>
                          {(file.size / 1024 / 1024).toFixed(2)} MB · click para cambiar
                        </div>
                      </>
                    ) : (
                      <>
                        <div style={{ fontSize: '2rem', marginBottom: '.375rem' }}>📁</div>
                        <div style={{ fontSize: '.9375rem', color: '#c4c4d8', fontWeight: 500 }}>
                          Arrastra tu .zip aquí o haz click
                        </div>
                        <div style={{ fontSize: '.75rem', color: '#7070a0', marginTop: '.25rem' }}>
                          Máximo 100 MB
                        </div>
                      </>
                    )}
                  </div>
                </Field>

                {uploading && (
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ fontSize: '.75rem', color: '#c4a8ff', marginBottom: '.375rem' }}>
                      Subiendo... {uploadProgress}%
                    </div>
                    <div style={{ height: 6, background: '#141422', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', width: `${uploadProgress}%`,
                        background: 'linear-gradient(90deg, #26b5aa, #a3e635)',
                        transition: 'width .3s',
                      }}/>
                    </div>
                  </div>
                )}

                {error && (
                  <div style={{
                    background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)',
                    borderRadius: 8, padding: '.625rem .75rem', fontSize: '.8125rem',
                    color: '#f87171', marginBottom: '1rem',
                  }}>{error}</div>
                )}

                <div style={{ display: 'flex', gap: '.5rem' }}>
                  <button onClick={() => setStep('instructions')} style={btnGhostStyle}>← Atrás</button>
                  <button
                    onClick={uploadFromBrowser}
                    disabled={uploading || !file || !uploadToken.trim()}
                    style={{
                      ...btnPrimaryStyle, flex: 1,
                      opacity: (uploading || !file || !uploadToken.trim()) ? .6 : 1,
                      cursor: (uploading || !file || !uploadToken.trim()) ? 'not-allowed' : 'pointer',
                    }}>
                    {uploading ? `Subiendo ${uploadProgress}%...` : '⬆️ Subir y generar reporte'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Step 2: instrucciones ───────────────────────────────────────────────────

function InstructionsStep({ project, onBack, onContinueBrowser }: any) {
  const router = useRouter()
  const uploadUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/api/allure/projects/${project.id}/upload`

  const [copied, setCopied] = useState<string | null>(null)
  function copy(name: string, text: string) {
    navigator.clipboard.writeText(text)
    setCopied(name)
    setTimeout(() => setCopied(null), 1500)
  }

  return (
    <div style={cardStyle}>
      <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#f0f0fc', marginBottom: '.5rem' }}>
        Cómo subir results
      </h2>
      <p style={{ fontSize: '.8125rem', color: '#7070a0', marginBottom: '1rem' }}>
        Project destino: <strong style={{ color: '#26b5aa' }}>{project.name}</strong>
      </p>

      <div style={{
        background: 'rgba(38,181,170,.06)',
        border: '1px solid rgba(38,181,170,.15)',
        borderRadius: 10, padding: '.875rem 1rem', marginBottom: '1.25rem',
      }}>
        <div style={{ fontSize: '.75rem', color: '#26b5aa', fontWeight: 600, marginBottom: '.375rem' }}>
          💡 ¿Cómo se hace?
        </div>
        <div style={{ fontSize: '.75rem', color: '#7070a0', lineHeight: 1.6 }}>
          1. Tu pipeline genera la carpeta <code style={inlineCodeStyle}>allure-results/</code> al correr los tests<br/>
          2. Comprimes esa carpeta en un .zip<br/>
          3. Haces POST al endpoint con tu upload token<br/>
          4. Achilltest procesa y genera el reporte automáticamente
        </div>
      </div>

      {/* Endpoint URL */}
      <Field label="Endpoint">
        <div style={{ display: 'flex', gap: '.375rem' }}>
          <input value={uploadUrl} readOnly
            onClick={(e: any) => e.target.select()}
            style={{
              flex: 1, ...inputStyle,
              fontFamily: 'JetBrains Mono, monospace', fontSize: '.75rem',
              color: '#c4a8ff',
            }}/>
          <button onClick={() => copy('url', uploadUrl)} style={{
            background: copied === 'url' ? 'rgba(34,197,94,.2)' : 'rgba(38,181,170,.15)',
            border: 'none', borderRadius: 8,
            padding: '.5rem .75rem',
            color: copied === 'url' ? '#22c55e' : '#26b5aa',
            cursor: 'pointer', fontSize: '.75rem', fontWeight: 600,
            fontFamily: 'inherit', flexShrink: 0,
          }}>{copied === 'url' ? '✓' : '📋'}</button>
        </div>
      </Field>

      {/* curl example */}
      <Field label="Comando curl">
        <div style={{ position: 'relative' }}>
          <pre style={codeBlockStyle}>{`# Comprime la carpeta
cd allure-results && zip -r ../allure-results.zip . && cd ..

# Sube al endpoint
curl -X POST "${uploadUrl}" \\
  -H "Authorization: Bearer YOUR_UPLOAD_TOKEN" \\
  -H "X-Branch: main" \\
  -H "X-Build-Number: 123" \\
  -H "X-Environment: staging" \\
  --data-binary @allure-results.zip`}</pre>
          <button onClick={() => copy('curl', `cd allure-results && zip -r ../allure-results.zip . && cd ..\n\ncurl -X POST "${uploadUrl}" \\\n  -H "Authorization: Bearer YOUR_UPLOAD_TOKEN" \\\n  -H "X-Branch: main" \\\n  -H "X-Build-Number: 123" \\\n  -H "X-Environment: staging" \\\n  --data-binary @allure-results.zip`)} style={copyBtnInCodeStyle}>
            {copied === 'curl' ? '✓' : '📋'}
          </button>
        </div>
      </Field>

      {/* GitHub Actions snippet */}
      <details>
        <summary style={{
          cursor: 'pointer', fontSize: '.8125rem', color: '#c4a8ff',
          fontWeight: 600, padding: '.5rem 0',
        }}>
          Ver ejemplo GitHub Actions
        </summary>
        <pre style={codeBlockStyle}>{`- name: Upload Allure Results
  if: always()
  run: |
    cd allure-results && zip -r ../allure-results.zip . && cd ..
    curl -X POST "${uploadUrl}" \\
      -H "Authorization: Bearer \${{ secrets.ACHILLTEST_TOKEN }}" \\
      -H "X-Branch: \${{ github.ref_name }}" \\
      -H "X-Build-Number: \${{ github.run_number }}" \\
      -H "X-Commit-Sha: \${{ github.sha }}" \\
      -H "X-Environment: staging" \\
      --data-binary @allure-results.zip`}</pre>
      </details>

      <div style={{
        marginTop: '1.5rem', paddingTop: '1.25rem',
        borderTop: '1px solid rgba(255,255,255,.05)',
      }}>
        <div style={{ fontSize: '.75rem', color: '#7070a0', marginBottom: '.5rem' }}>
          ¿No quieres tocar línea de comandos? Súbelo manual desde aquí:
        </div>
        <div style={{ display: 'flex', gap: '.5rem' }}>
          <button onClick={onBack} style={btnGhostStyle}>← Cambiar project</button>
          <button onClick={() => router.push(`/allure/projects/${project.id}`)} style={btnGhostStyle}>
            Ver project
          </button>
          <button onClick={onContinueBrowser} style={btnPrimaryStyle}>
            ⬆️ Subir desde browser →
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Helpers ──

function StepIndicator({ current, value, label }: any) {
  const isActive = current === value
  const order: Record<string, number> = { project: 0, instructions: 1, browser: 2 }
  const isPast = order[current] > order[value]

  return (
    <div style={{
      flex: 1,
      padding: '.5rem .75rem', borderRadius: 6,
      background: isActive ? 'rgba(38,181,170,.18)' : isPast ? 'rgba(34,197,94,.08)' : '#141422',
      color: isActive ? '#26b5aa' : isPast ? '#22c55e' : '#7070a0',
      fontWeight: isActive ? 600 : 500,
      textAlign: 'center', fontSize: '.75rem',
    }}>
      {isPast ? '✓ ' : ''}{label}
    </div>
  )
}

function Field({ label, children }: any) {
  return (
    <div style={{ marginBottom: '1rem' }}>
      <label style={{
        display: 'block', fontSize: '.7rem', color: '#7070a0',
        marginBottom: '.25rem', fontWeight: 500,
      }}>{label}</label>
      {children}
    </div>
  )
}

function Nav({ user }: any) {
  return (
    <nav style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '1rem 2rem', borderBottom: '1px solid rgba(255,255,255,.07)', background: '#0e0e1a',
    }}>
      <a href="/allure" style={{ color: '#c4a8ff', textDecoration: 'none', fontSize: '.875rem' }}>← Allure</a>
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <span style={{ fontSize: '.8125rem', color: '#7070a0' }}>
          {user.email} · <strong style={{ color: '#c4a8ff' }}>{user.plan}</strong>
        </span>
        <button onClick={logout} style={{
          background: 'transparent', border: '1px solid rgba(255,255,255,.1)',
          color: '#7070a0', borderRadius: 8,
          padding: '.375rem .875rem', fontSize: '.75rem', cursor: 'pointer',
        }}>Salir</button>
      </div>
    </nav>
  )
}

function Loading() {
  return <div style={{ minHeight: '100vh', background: '#08080f', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7070a0' }}>Cargando...</div>
}

const cardStyle: React.CSSProperties = {
  background: '#0e0e1a', border: '1px solid rgba(255,255,255,.07)',
  borderRadius: 14, padding: '1.5rem',
}
const inputStyle: React.CSSProperties = {
  width: '100%', background: '#141422',
  border: '1px solid rgba(255,255,255,.1)', borderRadius: 8,
  padding: '.5rem .75rem', color: '#f0f0fc',
  fontSize: '.875rem', outline: 'none', fontFamily: 'inherit',
}
const btnPrimaryStyle: React.CSSProperties = {
  background: '#26b5aa', color: '#fff', border: 'none', borderRadius: 8,
  padding: '.625rem 1rem', fontSize: '.875rem', fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit',
  boxShadow: '0 4px 20px rgba(38,181,170,.4)',
}
const btnGhostStyle: React.CSSProperties = {
  background: 'transparent', border: '1px solid rgba(255,255,255,.1)',
  color: '#7070a0', borderRadius: 8,
  padding: '.625rem 1rem', fontSize: '.8125rem',
  cursor: 'pointer', fontFamily: 'inherit',
}
const codeBlockStyle: React.CSSProperties = {
  background: '#08080f', padding: '.875rem', borderRadius: 8,
  fontSize: '.7rem', color: '#a3e635',
  fontFamily: 'JetBrains Mono, monospace',
  overflow: 'auto', margin: 0,
  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
  border: '1px solid rgba(255,255,255,.05)',
  maxHeight: 300,
}
const inlineCodeStyle: React.CSSProperties = {
  background: '#141422', padding: '.125rem .375rem', borderRadius: 4,
  fontFamily: 'JetBrains Mono, monospace', fontSize: '.7rem',
  color: '#a3e635',
}
const copyBtnInCodeStyle: React.CSSProperties = {
  position: 'absolute', top: 8, right: 8,
  background: 'rgba(38,181,170,.15)', border: 'none', borderRadius: 6,
  padding: '.25rem .5rem', color: '#26b5aa',
  cursor: 'pointer', fontSize: '.7rem', fontWeight: 600,
  fontFamily: 'inherit',
}
