'use client'

import { useEffect, useState }  from 'react'
import { useRouter }            from 'next/navigation'
import { useAuth }              from '@/hooks/useAuth'
import { api, logout }          from '@/lib/api'
import AllureRunCard            from '@/components/AllureRunCard'

interface Project {
  id:           string
  name:         string
  description:  string | null
  tags:         string[]
  uploadEnabled:boolean
  lastRunId:    string | null
  lastRunAt:    string | null
  lastPassRate: string | null
  totalRuns:    number
  createdAt:    string
  updatedAt:    string
}

interface Run {
  id:           string
  projectId:    string
  projectName?: string
  name:         string | null
  source:       string
  status:       string
  totalTests:   number
  passed:       number
  failed:       number
  broken:       number
  skipped:      number
  passRate:     string | null
  durationMs:   number | null
  branch:       string | null
  environment:  string | null
  buildNumber:  string | null
  reportUrl:    string | null
  shareEnabled: boolean
  createdAt:    string
}

type View = 'runs' | 'projects'

export default function AllurePage() {
  const router = useRouter()
  const { user, loading } = useAuth(true)
  const [view, setView] = useState<View>('runs')
  const [projects, setProjects] = useState<Project[]>([])
  const [runs, setRuns]         = useState<Run[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [showNewProject, setShowNewProject] = useState(false)

  useEffect(() => {
    if (!user) return
    if (user.plan !== 'teammate') { router.push('/pricing'); return }
    loadAll()
  }, [user])

  // Auto-refresh runs en progreso
  useEffect(() => {
    if (!runs.some(r => r.status === 'pending' || r.status === 'processing')) return
    const t = setInterval(() => loadRuns(), 3000)
    return () => clearInterval(t)
  }, [runs])

  async function loadAll() {
    await Promise.all([loadProjects(), loadRuns()])
    setLoadingData(false)
  }

  async function loadProjects() {
    try {
      const r = await api.get('/api/allure/projects')
      setProjects(r.data || [])
    } catch {}
  }

  async function loadRuns() {
    try {
      const r = await api.get('/api/allure/runs?limit=50')
      setRuns(r.data || [])
    } catch {}
  }

  async function deleteProject(id: string, name: string) {
    if (!confirm(`¿Eliminar el project "${name}" y todos sus runs?`)) return
    try {
      await api.delete(`/api/allure/projects/${id}`)
      loadAll()
    } catch (err: any) {
      alert(err.message)
    }
  }

  if (loading || loadingData) return <Loading/>
  if (!user || user.plan !== 'teammate') return null

  return (
    <div style={{ minHeight: '100vh', background: '#08080f', color: '#c4c4d8', fontFamily: 'Inter,system-ui,sans-serif' }}>
      <Nav user={user}/>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '2rem 1.5rem' }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem',
        }}>
          <div>
            <h1 style={{
              fontSize: '1.625rem', fontWeight: 700, color: '#f0f0fc',
              marginBottom: '.25rem',
            }}>
              📊 Reportes Allure
            </h1>
            <p style={{ color: '#7070a0', fontSize: '.9375rem' }}>
              Reportes profesionales con histórico, trends y detección de tests flaky
            </p>
          </div>
          <div style={{ display: 'flex', gap: '.5rem' }}>
            <button onClick={() => router.push('/allure/upload')} style={btnSecondaryStyle}>
              ⬆️ Subir results
            </button>
            <button onClick={() => setShowNewProject(true)} style={btnPrimaryStyle}>
              + Nuevo project
            </button>
          </div>
        </div>

        {/* Toggle */}
        <div style={{
          display: 'inline-flex', gap: '.25rem', marginBottom: '1.5rem',
          background: '#0e0e1a', padding: '.25rem', borderRadius: 10,
          border: '1px solid rgba(255,255,255,.05)',
        }}>
          <ToggleBtn current={view} value="runs"
            label={`📊 Runs recientes (${runs.length})`}
            onClick={() => setView('runs')}/>
          <ToggleBtn current={view} value="projects"
            label={`📁 Projects (${projects.length})`}
            onClick={() => setView('projects')}/>
        </div>

        {view === 'runs' && (
          <RunsView runs={runs} projects={projects}
            router={router}
            onUpload={() => router.push('/allure/upload')}
            onNewProject={() => setShowNewProject(true)}/>
        )}

        {view === 'projects' && (
          <ProjectsView projects={projects} router={router}
            onDelete={deleteProject}
            onNew={() => setShowNewProject(true)}/>
        )}
      </div>

      {showNewProject && (
        <NewProjectModal
          onClose={() => setShowNewProject(false)}
          onSaved={(id) => {
            setShowNewProject(false)
            loadProjects()
            router.push(`/allure/projects/${id}`)
          }}
        />
      )}
    </div>
  )
}

// ── Runs view ────────────────────────────────────────────────────────────────

function RunsView({ runs, projects, router, onUpload, onNewProject }: any) {
  if (runs.length === 0) {
    return (
      <div style={{
        padding: '3rem 2rem', textAlign: 'center',
        background: '#0e0e1a', border: '1px dashed rgba(255,255,255,.1)',
        borderRadius: 14,
      }}>
        <div style={{ fontSize: '3rem', marginBottom: '.75rem' }}>📊</div>
        <h3 style={{ fontSize: '1.125rem', color: '#f0f0fc', marginBottom: '.5rem' }}>
          Tu primer reporte Allure
        </h3>
        <p style={{ color: '#7070a0', fontSize: '.9375rem', marginBottom: '1.5rem' }}>
          {projects.length === 0
            ? 'Primero crea un project para agrupar tus reportes.'
            : 'Genera un reporte desde un Suite Run o sube allure-results desde tu CI/CD.'}
        </p>
        <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          {projects.length === 0 ? (
            <button onClick={onNewProject} style={btnPrimaryStyle}>+ Crear primer project</button>
          ) : (
            <>
              <button onClick={() => router.push('/suites')} style={btnSecondaryStyle}>
                📦 Ver mis Suite Runs
              </button>
              <button onClick={onUpload} style={btnPrimaryStyle}>
                ⬆️ Subir allure-results
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: '.625rem' }}>
      {runs.map((r: Run) => (
        <AllureRunCard
          key={r.id} run={r}
          showProject={true}
          projectName={r.projectName}
          onClick={() => router.push(`/allure/runs/${r.id}`)}
        />
      ))}
    </div>
  )
}

// ── Projects view ────────────────────────────────────────────────────────────

function ProjectsView({ projects, router, onDelete, onNew }: any) {
  if (projects.length === 0) {
    return (
      <div style={{
        padding: '3rem 2rem', textAlign: 'center',
        background: '#0e0e1a', border: '1px dashed rgba(255,255,255,.1)',
        borderRadius: 14,
      }}>
        <div style={{ fontSize: '3rem', marginBottom: '.75rem' }}>📁</div>
        <h3 style={{ fontSize: '1.125rem', color: '#f0f0fc', marginBottom: '.5rem' }}>
          Crea tu primer project
        </h3>
        <p style={{ color: '#7070a0', fontSize: '.9375rem', marginBottom: '1.5rem' }}>
          Un project agrupa runs relacionados (mismo entorno, mismo equipo).
          <br/>El histórico, trends y flaky tests se calculan por project.
        </p>
        <button onClick={onNew} style={btnPrimaryStyle}>
          + Crear project
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: '.625rem' }}>
      {projects.map((p: Project) => {
        const passRate = p.lastPassRate ? parseFloat(p.lastPassRate) : null
        const color = passRate === null ? '#7070a0'
                     : passRate >= 90 ? '#22c55e'
                     : passRate >= 70 ? '#f59e0b'
                     : '#ef4444'
        return (
          <div key={p.id}
            onClick={() => router.push(`/allure/projects/${p.id}`)}
            style={{
              background: '#0e0e1a', border: '1px solid rgba(255,255,255,.07)',
              borderRadius: 12, padding: '1.125rem 1.25rem',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '1rem',
              transition: 'border-color .15s',
            }}
            onMouseEnter={(e: any) => e.currentTarget.style.borderColor = 'rgba(124,92,191,.3)'}
            onMouseLeave={(e: any) => e.currentTarget.style.borderColor = 'rgba(255,255,255,.07)'}
          >
            {/* Pass rate badge */}
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              background: passRate !== null ? `${color}22` : 'transparent',
              border: passRate !== null ? `2px solid ${color}44` : '2px dashed rgba(255,255,255,.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              {passRate !== null ? (
                <div style={{ textAlign: 'center', color }}>
                  <div style={{ fontSize: '.875rem', fontWeight: 700 }}>{Math.round(passRate)}%</div>
                  <div style={{ fontSize: '.55rem', textTransform: 'uppercase' }}>Pass</div>
                </div>
              ) : (
                <div style={{ color: '#7070a0', fontSize: '.625rem', textAlign: 'center' }}>
                  Sin<br/>runs
                </div>
              )}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: '.9375rem', fontWeight: 600, color: '#f0f0fc',
                marginBottom: '.25rem',
              }}>{p.name}</div>
              {p.description && (
                <div style={{
                  fontSize: '.75rem', color: '#7070a0', marginBottom: '.25rem',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{p.description}</div>
              )}
              <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', fontSize: '.7rem' }}>
                <span style={chipStyle}>{p.totalRuns} runs</span>
                {p.uploadEnabled && <span style={{ ...chipStyle, color: '#c4a8ff' }}>🔑 Upload activo</span>}
                {p.lastRunAt && (
                  <span style={{ color: '#7070a0' }}>
                    Último: {new Date(p.lastRunAt).toLocaleDateString('es-MX')}
                  </span>
                )}
              </div>
            </div>

            <button
              onClick={(e: any) => { e.stopPropagation(); onDelete(p.id, p.name) }}
              style={{
                background: 'transparent', border: '1px solid rgba(239,68,68,.2)',
                color: '#f87171', borderRadius: 6,
                padding: '.3125rem .625rem', fontSize: '.7rem',
                cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
              }}
            >Eliminar</button>
          </div>
        )
      })}
    </div>
  )
}

// ── Modal nuevo project ──────────────────────────────────────────────────────

function NewProjectModal({ onClose, onSaved }: any) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setError('')
    if (!name.trim()) { setError('Nombre requerido'); return }
    setSaving(true)
    try {
      const r = await api.post('/api/allure/projects', {
        name: name.trim(),
        description: description.trim() || null,
      })
      onSaved(r.data.id)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100, padding: '1rem',
    }} onClick={onClose}>
      <div style={{
        background: '#0e0e1a', border: '1px solid rgba(255,255,255,.1)',
        borderRadius: 14, padding: '1.5rem',
        width: '100%', maxWidth: 480,
      }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#f0f0fc', marginBottom: '.5rem' }}>
          📁 Nuevo project
        </h3>
        <p style={{ fontSize: '.8125rem', color: '#7070a0', marginBottom: '1rem' }}>
          Agrupa runs relacionados para tener histórico y trends consolidados.
        </p>

        <Field label="Nombre">
          <input value={name} onChange={e => setName(e.target.value)}
            placeholder="Ej. E2E - Producción" style={inputStyle} autoFocus/>
        </Field>
        <Field label="Descripción (opcional)">
          <input value={description} onChange={e => setDescription(e.target.value)}
            placeholder="Para qué equipo / entorno" style={inputStyle}/>
        </Field>

        {error && (
          <div style={{
            background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)',
            borderRadius: 8, padding: '.5rem .75rem', fontSize: '.75rem',
            color: '#f87171', marginBottom: '.75rem',
          }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: '.5rem' }}>
          <button onClick={onClose} style={btnGhostStyle}>Cancelar</button>
          <button onClick={save} disabled={saving} style={{ ...btnPrimaryStyle, flex: 1, opacity: saving ? .6 : 1 }}>
            {saving ? 'Creando...' : 'Crear project'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Componentes auxiliares ──

function ToggleBtn({ current, value, label, onClick }: any) {
  const active = current === value
  return (
    <button onClick={onClick} style={{
      background: active ? 'rgba(38,181,170,.18)' : 'transparent',
      border: 'none', cursor: 'pointer',
      padding: '.5rem 1rem',
      fontSize: '.8125rem', fontWeight: active ? 600 : 500,
      color: active ? '#26b5aa' : '#7070a0',
      borderRadius: 8, fontFamily: 'inherit',
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
      <a href="/dashboard" style={{ color: '#c4a8ff', textDecoration: 'none', fontSize: '.875rem' }}>← Dashboard</a>
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

const inputStyle: React.CSSProperties = {
  width: '100%', background: '#141422',
  border: '1px solid rgba(255,255,255,.1)', borderRadius: 8,
  padding: '.5rem .75rem', color: '#f0f0fc',
  fontSize: '.875rem', outline: 'none', fontFamily: 'inherit',
}
const btnPrimaryStyle: React.CSSProperties = {
  background: '#26b5aa', color: '#fff', border: 'none', borderRadius: 8,
  padding: '.5rem 1rem', fontSize: '.875rem', fontWeight: 600, cursor: 'pointer',
  fontFamily: 'inherit', boxShadow: '0 4px 20px rgba(38,181,170,.4)',
}
const btnSecondaryStyle: React.CSSProperties = {
  background: 'transparent', color: '#c4c4d8',
  border: '1px solid rgba(255,255,255,.12)', borderRadius: 8,
  padding: '.5rem 1rem', fontSize: '.875rem', fontWeight: 500, cursor: 'pointer',
  fontFamily: 'inherit',
}
const btnGhostStyle: React.CSSProperties = {
  background: 'transparent', border: '1px solid rgba(255,255,255,.1)',
  color: '#7070a0', borderRadius: 8,
  padding: '.5rem 1rem', fontSize: '.8125rem', cursor: 'pointer',
  fontFamily: 'inherit',
}
const chipStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,.04)', color: '#7070a0',
  padding: '.125rem .5rem', borderRadius: 4,
  fontSize: '.65rem', fontWeight: 600,
}
