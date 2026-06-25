'use client'

import { useEffect, useState }  from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth }              from '@/hooks/useAuth'
import { api, logout }          from '@/lib/api'
import AllureRunCard            from '@/components/AllureRunCard'
import AllureTrendChart         from '@/components/AllureTrendChart'
import AllureFlakyTests         from '@/components/AllureFlakyTests'

interface Project {
  id:              string
  name:            string
  description:     string | null
  tags:            string[]
  uploadEnabled:   boolean
  uploadToken:     string | null  // viene parcial del backend
  uploadUrl:       string
  lastRunId:       string | null
  lastRunAt:       string | null
  lastPassRate:    string | null
  totalRuns:       number
  recentRuns:      any[]
  createdAt:       string
  updatedAt:       string
}

type Tab = 'runs' | 'trend' | 'flaky' | 'settings'

export default function AllureProjectDetail() {
  const router = useRouter()
  const params = useParams()
  const projectId = params.id as string
  const { user, loading } = useAuth(true)

  const [project, setProject] = useState<Project | null>(null)
  const [trend, setTrend]     = useState<any>(null)
  const [flaky, setFlaky]     = useState<any[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [tab, setTab] = useState<Tab>('runs')
  const [error, setError] = useState('')
  const [tokenModal, setTokenModal] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    if (user.plan !== 'teammate') { router.push('/pricing'); return }
    loadAll()
  }, [user])

  async function loadAll() {
    try {
      const [pRes, tRes, fRes] = await Promise.all([
        api.get(`/api/allure/projects/${projectId}`),
        api.get(`/api/allure/projects/${projectId}/trend?days=90`),
        api.get(`/api/allure/projects/${projectId}/flaky`),
      ])
      setProject(pRes.data)
      setTrend(tRes.data)
      setFlaky(fRes.data || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoadingData(false)
    }
  }

  async function rotateToken() {
    if (!confirm('¿Generar un nuevo upload token? El token anterior dejará de funcionar.')) return
    try {
      const r = await api.post(`/api/allure/projects/${projectId}/rotate-token`, {})
      setTokenModal(r.data.uploadToken)
      loadAll()
    } catch (err: any) {
      alert(err.message)
    }
  }

  async function toggleUpload(enabled: boolean) {
    try {
      await api.put(`/api/allure/projects/${projectId}`, { uploadEnabled: enabled })
      loadAll()
    } catch (err: any) {
      alert(err.message)
    }
  }

  async function deleteProject() {
    if (!confirm(`¿Eliminar "${project?.name}" y todos sus runs? Esta acción no se puede deshacer.`)) return
    try {
      await api.delete(`/api/allure/projects/${projectId}`)
      router.push('/allure')
    } catch (err: any) {
      alert(err.message)
    }
  }

  if (loading || loadingData) return <Loading/>
  if (!user) return null
  if (!project) return <Loading text="Project no encontrado"/>

  const isAdvancePlus = user.plan && user.plan !== 'teammate' && user.plan !== 'starter'

  return (
    <div style={{ minHeight: '100vh', background: '#08080f', color: '#c4c4d8', fontFamily: 'Inter,system-ui,sans-serif' }}>
      <Nav user={user}/>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '2rem 1.5rem' }}>
        <a href="/allure" style={{ color: '#7070a0', fontSize: '.8125rem', textDecoration: 'none' }}>
          ← Todos los projects
        </a>

        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          marginTop: '.5rem', marginBottom: '1.5rem',
          flexWrap: 'wrap', gap: '1rem',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{
              fontSize: '1.5rem', fontWeight: 700, color: '#f0f0fc',
              marginBottom: '.25rem',
            }}>
              📁 {project.name}
            </h1>
            {project.description && (
              <p style={{ color: '#7070a0', fontSize: '.875rem', marginBottom: '.5rem' }}>
                {project.description}
              </p>
            )}
            <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', fontSize: '.7rem' }}>
              <span style={chipStyle}>{project.totalRuns} runs</span>
              {project.lastPassRate && (
                <span style={{
                  ...chipStyle,
                  color: parseFloat(project.lastPassRate) >= 90 ? '#22c55e' : '#f59e0b',
                }}>
                  Último: {parseFloat(project.lastPassRate).toFixed(1)}%
                </span>
              )}
              {project.uploadEnabled && (
                <span style={{ ...chipStyle, color: '#c4a8ff' }}>🔑 Upload habilitado</span>
              )}
            </div>
          </div>
          <button onClick={() => router.push('/allure/upload?projectId=' + projectId)} style={btnPrimaryStyle}>
            ⬆️ Subir nuevo run
          </button>
        </div>

        {error && (
          <div style={{
            background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)',
            borderRadius: 8, padding: '.625rem .75rem', fontSize: '.8125rem',
            color: '#f87171', marginBottom: '1rem',
          }}>{error}</div>
        )}

        {/* Tabs */}
        <div style={{
          display: 'flex', gap: '.25rem',
          borderBottom: '1px solid rgba(255,255,255,.07)',
          marginBottom: '1.5rem', overflowX: 'auto',
        }}>
          <TabBtn current={tab} value="runs"     label={`📊 Runs (${project.recentRuns?.length || 0})`} onClick={() => setTab('runs')}/>
          <TabBtn current={tab} value="trend"    label="📈 Trend" onClick={() => setTab('trend')}/>
          <TabBtn current={tab} value="flaky"    label={`⚠️ Flaky (${flaky.length})`} onClick={() => setTab('flaky')}/>
          <TabBtn current={tab} value="settings" label="⚙️ Settings" onClick={() => setTab('settings')}/>
        </div>

        {/* Tab content */}
        {tab === 'runs' && (
          <RunsTab runs={project.recentRuns || []} router={router}
            onUpload={() => router.push('/allure/upload?projectId=' + projectId)}/>
        )}

        {tab === 'trend' && (
          <AllureTrendChart
            series={trend?.series || []}
            onPointClick={(p: any) => router.push(`/allure/runs/${p.id}`)}
          />
        )}

        {tab === 'flaky' && (
          <AllureFlakyTests flakyTests={flaky}/>
        )}

        {tab === 'settings' && (
          <SettingsTab
            project={project}
            isAdvancePlus={isAdvancePlus}
            onRotateToken={rotateToken}
            onToggleUpload={toggleUpload}
            onDelete={deleteProject}
          />
        )}
      </div>

      {tokenModal && (
        <TokenModal token={tokenModal} project={project} onClose={() => setTokenModal(null)}/>
      )}
    </div>
  )
}

// ── Runs tab ─────────────────────────────────────────────────────────────────

function RunsTab({ runs, router, onUpload }: any) {
  if (runs.length === 0) {
    return (
      <div style={{
        padding: '3rem 2rem', textAlign: 'center',
        background: '#0e0e1a', border: '1px dashed rgba(255,255,255,.1)',
        borderRadius: 14,
      }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '.5rem' }}>📊</div>
        <h3 style={{ fontSize: '1rem', color: '#f0f0fc', marginBottom: '.5rem' }}>
          Aún no hay runs en este project
        </h3>
        <p style={{ color: '#7070a0', fontSize: '.875rem', marginBottom: '1.25rem' }}>
          Genera un reporte desde un Suite Run o sube allure-results desde tu CI/CD.
        </p>
        <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'center' }}>
          <button onClick={() => router.push('/suites')} style={btnSecondaryStyle}>
            📦 Ver mis Suites
          </button>
          <button onClick={onUpload} style={btnPrimaryStyle}>
            ⬆️ Subir results
          </button>
        </div>
      </div>
    )
  }
  return (
    <div style={{ display: 'grid', gap: '.625rem' }}>
      {runs.map((r: any) => (
        <AllureRunCard
          key={r.id} run={r}
          onClick={() => router.push(`/allure/runs/${r.id}`)}
        />
      ))}
    </div>
  )
}

// ── Settings tab ─────────────────────────────────────────────────────────────

function SettingsTab({ project, isAdvancePlus, onRotateToken, onToggleUpload, onDelete }: any) {
  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      {/* CI/CD Integration */}
      <div style={cardStyle}>
        <h3 style={cardTitleStyle}>🔌 Integración CI/CD</h3>
        <p style={{ fontSize: '.8125rem', color: '#7070a0', marginBottom: '1rem' }}>
          Sube allure-results desde GitHub Actions, GitLab CI, Jenkins o cualquier pipeline.
        </p>

        {!isAdvancePlus && (
          <div style={{
            background: 'rgba(249,115,22,.08)',
            border: '1px solid rgba(249,115,22,.2)',
            borderRadius: 8, padding: '.75rem 1rem', marginBottom: '1rem',
          }}>
            <div style={{ fontSize: '.8125rem', color: '#fb923c', fontWeight: 600 }}>
              🔒 Requiere plan Advance
            </div>
            <div style={{ fontSize: '.75rem', color: '#7070a0', marginTop: '.125rem' }}>
              Los uploads externos desde CI/CD están disponibles en el plan Advance.
            </div>
          </div>
        )}

        <ToggleRow
          checked={project.uploadEnabled}
          onChange={(v: boolean) => onToggleUpload(v)}
          disabled={!isAdvancePlus}
          label="Habilitar uploads externos"
          desc="Permite recibir allure-results desde tu pipeline"
        />

        {project.uploadEnabled && (
          <>
            <Field label="Upload URL">
              <CopyableInput value={project.uploadUrl}/>
            </Field>
            <Field label="Upload token (parcial)">
              <CopyableInput value={project.uploadToken || ''} disabled={true}/>
              <div style={{ fontSize: '.7rem', color: '#7070a0', marginTop: '.25rem' }}>
                Por seguridad solo se muestran los primeros caracteres. Si lo perdiste, rota el token.
              </div>
            </Field>

            <button onClick={onRotateToken} style={{ ...btnSecondaryStyle, marginTop: '.5rem' }}>
              🔄 Rotar token
            </button>

            <details style={{ marginTop: '1.25rem' }}>
              <summary style={{
                cursor: 'pointer', fontSize: '.8125rem', color: '#c4a8ff',
                fontWeight: 600, padding: '.5rem 0',
              }}>
                📋 Ver ejemplos de integración
              </summary>
              <div style={{ marginTop: '.75rem' }}>
                <IntegrationExample
                  title="GitHub Actions"
                  code={`- name: Upload Allure Results
  if: always()
  run: |
    cd allure-results && zip -r ../allure-results.zip .
    curl -X POST "${project.uploadUrl}" \\
      -H "Authorization: Bearer $\{{ secrets.ACHILLTEST_TOKEN \}}" \\
      -H "X-Branch: $\{{ github.ref_name \}}" \\
      -H "X-Build-Number: $\{{ github.run_number \}}" \\
      -H "X-Commit-Sha: $\{{ github.sha \}}" \\
      -H "X-Environment: staging" \\
      --data-binary @../allure-results.zip`}
                />
                <IntegrationExample
                  title="curl básico"
                  code={`zip -r results.zip ./allure-results
curl -X POST "${project.uploadUrl}" \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  --data-binary @results.zip`}
                />
              </div>
            </details>
          </>
        )}
      </div>

      {/* Danger zone */}
      <div style={{
        ...cardStyle,
        borderColor: 'rgba(239,68,68,.2)',
        background: 'rgba(239,68,68,.04)',
      }}>
        <h3 style={{ ...cardTitleStyle, color: '#f87171' }}>⚠️ Zona peligrosa</h3>
        <p style={{ fontSize: '.8125rem', color: '#7070a0', marginBottom: '1rem' }}>
          Eliminar este project borra todos sus runs, reportes y datos históricos de forma permanente.
        </p>
        <button onClick={onDelete} style={{
          background: 'transparent', border: '1px solid rgba(239,68,68,.4)',
          color: '#f87171', borderRadius: 8,
          padding: '.5rem 1rem', fontSize: '.8125rem', fontWeight: 600,
          cursor: 'pointer', fontFamily: 'inherit',
        }}>
          🗑️ Eliminar project
        </button>
      </div>
    </div>
  )
}

function ToggleRow({ checked, onChange, disabled, label, desc }: any) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: '.625rem',
      padding: '.625rem .75rem', marginBottom: '.75rem',
      background: '#141422', borderRadius: 8,
      border: `1px solid ${checked ? 'rgba(38,181,170,.25)' : 'rgba(255,255,255,.04)'}`,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? .5 : 1,
    }} onClick={() => !disabled && onChange(!checked)}>
      <input type="checkbox" checked={checked} disabled={disabled}
        onChange={() => !disabled && onChange(!checked)}
        style={{ width: 16, height: 16, marginTop: 2, flexShrink: 0, cursor: 'inherit' }}/>
      <div>
        <div style={{ fontSize: '.8125rem', color: '#f0f0fc', fontWeight: 500, marginBottom: '.125rem' }}>{label}</div>
        <div style={{ fontSize: '.7rem', color: '#7070a0' }}>{desc}</div>
      </div>
    </div>
  )
}

function CopyableInput({ value, disabled }: { value: string; disabled?: boolean }) {
  const [copied, setCopied] = useState(false)
  return (
    <div style={{ display: 'flex', gap: '.375rem' }}>
      <input
        value={value}
        readOnly
        style={{
          flex: 1, background: '#141422',
          border: '1px solid rgba(255,255,255,.1)', borderRadius: 8,
          padding: '.5rem .75rem', color: disabled ? '#7070a0' : '#f0f0fc',
          fontSize: '.75rem', outline: 'none',
          fontFamily: 'JetBrains Mono, monospace',
        }}
        onClick={(e: any) => e.target.select()}
      />
      <button onClick={() => {
        navigator.clipboard.writeText(value)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }} style={{
        background: copied ? 'rgba(34,197,94,.2)' : 'rgba(38,181,170,.15)',
        border: 'none', borderRadius: 8,
        padding: '.5rem .75rem',
        color: copied ? '#22c55e' : '#26b5aa',
        cursor: 'pointer', fontSize: '.75rem', fontWeight: 600,
        fontFamily: 'inherit', flexShrink: 0,
      }}>{copied ? '✓ Copiado' : '📋 Copiar'}</button>
    </div>
  )
}

function IntegrationExample({ title, code }: { title: string; code: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.375rem' }}>
        <div style={{ fontSize: '.8125rem', color: '#c4a8ff', fontWeight: 600 }}>{title}</div>
        <button onClick={() => {
          navigator.clipboard.writeText(code)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }} style={{
          background: 'transparent', border: '1px solid rgba(255,255,255,.1)',
          color: copied ? '#22c55e' : '#7070a0', borderRadius: 6,
          padding: '.25rem .625rem', fontSize: '.7rem',
          cursor: 'pointer', fontFamily: 'inherit',
        }}>{copied ? '✓' : '📋 Copiar'}</button>
      </div>
      <pre style={{
        background: '#08080f', padding: '.75rem .875rem', borderRadius: 8,
        fontSize: '.7rem', color: '#a3e635',
        fontFamily: 'JetBrains Mono, monospace',
        overflow: 'auto', margin: 0,
        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        border: '1px solid rgba(255,255,255,.05)',
      }}>{code}</pre>
    </div>
  )
}

// ── Modal: token recién generado ─────────────────────────────────────────────

function TokenModal({ token, project, onClose }: any) {
  const [copied, setCopied] = useState(false)
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100, padding: '1rem',
    }} onClick={onClose}>
      <div style={{
        background: '#0e0e1a', border: '1px solid rgba(38,181,170,.3)',
        borderRadius: 14, padding: '1.5rem',
        width: '100%', maxWidth: 560,
      }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#f0f0fc', marginBottom: '.5rem' }}>
          🔑 Nuevo upload token generado
        </h3>
        <div style={{
          background: 'rgba(249,115,22,.08)',
          border: '1px solid rgba(249,115,22,.25)',
          borderRadius: 8, padding: '.75rem 1rem', marginBottom: '1rem',
        }}>
          <div style={{ fontSize: '.8125rem', color: '#fb923c', fontWeight: 600, marginBottom: '.25rem' }}>
            ⚠️ Copia este token AHORA
          </div>
          <div style={{ fontSize: '.75rem', color: '#7070a0' }}>
            Por seguridad, solo se muestra UNA vez. Si lo pierdes, tendrás que rotar el token de nuevo.
          </div>
        </div>

        <Field label="Tu nuevo token">
          <CopyableInput value={token}/>
        </Field>

        <Field label="Ejemplo de uso con curl">
          <pre style={{
            background: '#08080f', padding: '.75rem .875rem', borderRadius: 8,
            fontSize: '.7rem', color: '#a3e635',
            fontFamily: 'JetBrains Mono, monospace',
            overflow: 'auto', margin: 0,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>{`curl -X POST "${project.uploadUrl}" \\
  -H "Authorization: Bearer ${token}" \\
  --data-binary @allure-results.zip`}</pre>
        </Field>

        <button onClick={onClose} style={{ ...btnPrimaryStyle, width: '100%', marginTop: '.75rem' }}>
          Listo, copié el token
        </button>
      </div>
    </div>
  )
}

// ── Componentes auxiliares ──

function TabBtn({ current, value, label, onClick }: any) {
  const active = current === value
  return (
    <button onClick={onClick} style={{
      background: 'transparent', border: 'none', cursor: 'pointer',
      padding: '.625rem 1rem',
      fontFamily: 'inherit', fontSize: '.8125rem',
      color: active ? '#26b5aa' : '#7070a0',
      borderBottom: `2px solid ${active ? '#26b5aa' : 'transparent'}`,
      whiteSpace: 'nowrap',
      fontWeight: active ? 600 : 400, marginBottom: -1,
    }}>{label}</button>
  )
}

function Field({ label, children }: any) {
  return (
    <div style={{ marginBottom: '.75rem' }}>
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

function Loading({ text }: { text?: string } = {}) {
  return <div style={{ minHeight: '100vh', background: '#08080f', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7070a0' }}>{text || 'Cargando...'}</div>
}

const cardStyle: React.CSSProperties = {
  background: '#0e0e1a', border: '1px solid rgba(255,255,255,.07)',
  borderRadius: 12, padding: '1.25rem',
}
const cardTitleStyle: React.CSSProperties = {
  fontSize: '1rem', fontWeight: 600, color: '#f0f0fc',
  marginBottom: '.5rem',
}
const chipStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,.04)', color: '#7070a0',
  padding: '.125rem .5rem', borderRadius: 4,
  fontSize: '.65rem', fontWeight: 600,
}
const btnPrimaryStyle: React.CSSProperties = {
  background: '#26b5aa', color: '#fff', border: 'none', borderRadius: 8,
  padding: '.5rem 1rem', fontSize: '.875rem', fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit',
  boxShadow: '0 4px 20px rgba(38,181,170,.4)',
}
const btnSecondaryStyle: React.CSSProperties = {
  background: 'transparent', color: '#c4c4d8',
  border: '1px solid rgba(255,255,255,.12)', borderRadius: 8,
  padding: '.5rem 1rem', fontSize: '.875rem', fontWeight: 500, cursor: 'pointer',
  fontFamily: 'inherit',
}
