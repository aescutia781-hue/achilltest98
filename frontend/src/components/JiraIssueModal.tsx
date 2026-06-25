'use client'

import { useEffect, useState }  from 'react'
import { api }                  from '@/lib/api'
import { JiraIcon }             from './JiraConnectButton'

interface Props {
  specId?:      string
  executionId?: string
  suiteRunId?:  string
  defaultSummary?: string
  defaultDescription?: string
  onClose:      () => void
  onCreated?:   (issue: any) => void
}

interface Project {
  id: string
  jiraProjectKey: string
  name: string
  isSelected: boolean
}

export default function JiraIssueModal({
  specId, executionId, suiteRunId,
  defaultSummary = '', defaultDescription = '',
  onClose, onCreated,
}: Props) {
  const [connection, setConnection] = useState<any>(null)
  const [projects, setProjects]     = useState<Project[]>([])
  const [loadingInit, setLoadingInit] = useState(true)

  const [jiraProjectId, setJiraProjectId] = useState('')
  const [summary, setSummary]             = useState(defaultSummary)
  const [description, setDescription]     = useState(defaultDescription)
  const [issueType, setIssueType]         = useState('Bug')
  const [priority, setPriority]           = useState('')

  const [creating, setCreating] = useState(false)
  const [error, setError]       = useState('')
  const [created, setCreated]   = useState<any>(null)

  useEffect(() => { loadInit() }, [])

  async function loadInit() {
    try {
      const [c, p] = await Promise.all([
        api.get('/api/jira/connection'),
        api.get('/api/jira/projects').catch(() => ({ data: [] })),
      ])
      setConnection(c.data)
      const selectedProjects = (p.data || []).filter((x: Project) => x.isSelected)
      const list = selectedProjects.length > 0 ? selectedProjects : (p.data || [])
      setProjects(list)
      if (list.length > 0) setJiraProjectId(list[0].id)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoadingInit(false)
    }
  }

  async function submit() {
    setError('')
    if (!jiraProjectId) { setError('Selecciona un project'); return }
    if (!summary.trim()) { setError('Summary requerido'); return }
    setCreating(true)
    try {
      const r = await api.post('/api/jira/issues', {
        jiraProjectId,
        summary:    summary.trim(),
        description: description.trim() || undefined,
        issueType,
        priority:   priority || undefined,
        specId,
        executionId,
        suiteRunId,
      })
      setCreated(r.data)
      onCreated?.(r.data)
    } catch (err: any) {
      setError(err.message)
      setCreating(false)
    }
  }

  if (loadingInit) {
    return <Modal onClose={onClose}>
      <div style={{ padding: '2rem', textAlign: 'center', color: '#7070a0' }}>Cargando...</div>
    </Modal>
  }

  // Sin conexión Jira
  if (!connection) {
    return (
      <Modal onClose={onClose}>
        <div style={{ padding: '1.5rem', textAlign: 'center' }}>
          <div style={{ marginBottom: '.75rem' }}><JiraIcon size={48}/></div>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#f0f0fc', marginBottom: '.5rem' }}>
            Conecta Jira primero
          </h3>
          <p style={{ color: '#7070a0', fontSize: '.875rem', marginBottom: '1.25rem' }}>
            Para crear bugs en Jira, primero conecta tu cuenta desde la página de Jira.
          </p>
          <button onClick={() => location.href = '/jira'} style={btnPrimaryStyle}>
            Ir a configurar Jira
          </button>
        </div>
      </Modal>
    )
  }

  // Sin projects sincronizados
  if (projects.length === 0) {
    return (
      <Modal onClose={onClose}>
        <div style={{ padding: '1.5rem', textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '.5rem' }}>📂</div>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#f0f0fc', marginBottom: '.5rem' }}>
            Sin projects sincronizados
          </h3>
          <p style={{ color: '#7070a0', fontSize: '.875rem', marginBottom: '1.25rem' }}>
            Ve a /jira y sincroniza tus projects antes de crear bugs.
          </p>
          <button onClick={() => location.href = '/jira'} style={btnPrimaryStyle}>
            Ir a Jira
          </button>
        </div>
      </Modal>
    )
  }

  // Resultado exitoso
  if (created) {
    return (
      <Modal onClose={onClose}>
        <div style={{ padding: '1.5rem', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '.5rem' }}>🎉</div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#22c55e', marginBottom: '.5rem' }}>
            ¡Bug creado en Jira!
          </h3>
          <p style={{ color: '#7070a0', fontSize: '.875rem', marginBottom: '1rem' }}>
            <code style={{ color: '#4d8fff', fontFamily: 'JetBrains Mono, monospace' }}>{created.jiraIssueKey}</code>
            {' · '}{created.summary}
          </p>
          <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'center' }}>
            <a href={created.htmlUrl} target="_blank" rel="noopener" style={{
              background: '#0052cc', color: '#fff', textDecoration: 'none',
              padding: '.5rem 1rem', borderRadius: 8,
              fontSize: '.8125rem', fontWeight: 600,
              display: 'inline-flex', gap: '.375rem', alignItems: 'center',
            }}>
              <JiraIcon size={14}/> Abrir en Jira
            </a>
            <button onClick={onClose} style={btnGhostStyle}>Cerrar</button>
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal onClose={onClose}>
      <div style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.5rem' }}>
          <JiraIcon size={20}/>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#f0f0fc' }}>
            Crear bug en Jira
          </h3>
        </div>

        <div style={{
          display: 'flex', gap: '.375rem', alignItems: 'center',
          fontSize: '.75rem', color: '#7070a0', marginBottom: '1.25rem',
        }}>
          Conectado a
          <a href={connection.siteUrl} target="_blank" rel="noopener" style={{ color: '#4d8fff', textDecoration: 'none' }}>
            {connection.siteUrl}
          </a>
        </div>

        <Field label="Project">
          <select value={jiraProjectId} onChange={(e) => setJiraProjectId(e.target.value)} style={inputStyle}>
            {projects.map(p => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.jiraProjectKey})
              </option>
            ))}
          </select>
        </Field>

        <Field label="Tipo de issue">
          <select value={issueType} onChange={(e) => setIssueType(e.target.value)} style={inputStyle}>
            <option value="Bug">🐞 Bug</option>
            <option value="Task">📋 Task</option>
            <option value="Story">📘 Story</option>
          </select>
        </Field>

        <Field label="Summary *">
          <input value={summary} onChange={(e) => setSummary(e.target.value)}
            placeholder="Test falla al hacer login con email válido"
            style={inputStyle} autoFocus/>
        </Field>

        <Field label="Description (opcional)">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="Pasos para reproducir, expected vs actual, screenshots..."
            rows={5} style={{ ...inputStyle, resize: 'vertical', minHeight: 100 }}/>
        </Field>

        <Field label="Priority (opcional)">
          <select value={priority} onChange={(e) => setPriority(e.target.value)} style={inputStyle}>
            <option value="">Sin prioridad específica</option>
            <option value="Highest">🔥 Highest</option>
            <option value="High">⬆ High</option>
            <option value="Medium">— Medium</option>
            <option value="Low">⬇ Low</option>
            <option value="Lowest">❄ Lowest</option>
          </select>
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
          <button onClick={submit} disabled={creating} style={{
            ...btnPrimaryStyle, flex: 1,
            opacity: creating ? .6 : 1,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '.5rem',
          }}>
            <JiraIcon size={14}/>
            {creating ? 'Creando...' : 'Crear bug'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function Modal({ children, onClose }: any) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100, padding: '1rem',
    }} onClick={onClose}>
      <div style={{
        background: '#0e0e1a', border: '1px solid rgba(255,255,255,.1)',
        borderRadius: 14, width: '100%', maxWidth: 520,
        maxHeight: '90vh', overflowY: 'auto',
      }} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
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

const inputStyle: React.CSSProperties = {
  width: '100%', background: '#141422',
  border: '1px solid rgba(255,255,255,.1)', borderRadius: 8,
  padding: '.5rem .75rem', color: '#f0f0fc',
  fontSize: '.875rem', outline: 'none', fontFamily: 'inherit',
}
const btnPrimaryStyle: React.CSSProperties = {
  background: '#0052cc', color: '#fff', border: 'none', borderRadius: 8,
  padding: '.5rem 1rem', fontSize: '.8125rem', fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit',
}
const btnGhostStyle: React.CSSProperties = {
  background: 'transparent', border: '1px solid rgba(255,255,255,.1)',
  color: '#7070a0', borderRadius: 8,
  padding: '.5rem 1rem', fontSize: '.8125rem',
  cursor: 'pointer', fontFamily: 'inherit',
}
