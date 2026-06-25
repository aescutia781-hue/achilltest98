'use client'

import { useEffect, useState }       from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth }                   from '@/hooks/useAuth'
import { api, logout }               from '@/lib/api'
import JiraConnectButton,
       { JiraIcon }                  from '@/components/JiraConnectButton'

interface Connection {
  id: string
  authType: 'oauth' | 'api_token'
  deploymentType: 'cloud' | 'server'
  siteUrl: string
  siteName: string
  atlassianUserName: string
  atlassianUserEmail: string
  avatarUrl: string
  scopes: string[]
  hasZephyr: boolean
  connectedAt: string
  lastUsedAt: string
}

interface Project {
  id: string
  jiraProjectKey: string
  name: string
  description: string | null
  avatarUrl: string | null
  projectType: string
  isArchived: boolean
  isSelected: boolean
  lastSyncedAt: string | null
}

export default function JiraPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading } = useAuth(true)

  const [connection, setConnection] = useState<Connection | null>(null)
  const [projects, setProjects]     = useState<Project[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [error, setError]           = useState('')
  const [syncing, setSyncing]       = useState(false)
  const [zephyrModal, setZephyrModal] = useState(false)
  const [apiTokenModal, setApiTokenModal] = useState(false)

  const justConnected = searchParams?.get('jira') === 'connected'
  const oauthError    = searchParams?.get('error')

  useEffect(() => {
    if (!user) return
    if (user.plan !== 'teammate') { router.push('/pricing'); return }
    loadAll()
  }, [user])

  async function loadAll() {
    try {
      const [c, p] = await Promise.all([
        api.get('/api/jira/connection'),
        api.get('/api/jira/projects').catch(() => ({ data: [] })),
      ])
      setConnection(c.data)
      setProjects(p.data || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoadingData(false)
    }
  }

  async function disconnect() {
    if (!confirm('¿Desconectar Jira? Perderás la sync de projects y test cases. Esta acción no afecta a Jira/Zephyr en sí.')) return
    try {
      await api.delete('/api/jira/connection')
      loadAll()
    } catch (err: any) { alert(err.message) }
  }

  async function syncProjects() {
    setSyncing(true)
    try {
      const r = await api.post('/api/jira/sync-projects', {})
      alert(`✓ Sincronizado: ${r.data.inserted} nuevos, ${r.data.updated} actualizados, ${r.data.total} total`)
      loadAll()
    } catch (err: any) { alert(err.message) }
    finally { setSyncing(false) }
  }

  async function toggleSelect(p: Project) {
    try {
      await api.put(`/api/jira/projects/${p.id}/select`, { isSelected: !p.isSelected })
      loadAll()
    } catch (err: any) { alert(err.message) }
  }

  if (loading || loadingData) return <Loading/>
  if (!user || user.plan !== 'teammate') return null

  return (
    <div style={{ minHeight: '100vh', background: '#08080f', color: '#c4c4d8', fontFamily: 'Inter,system-ui,sans-serif' }}>
      <Nav user={user}/>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '2rem 1.5rem' }}>
        <a href="/dashboard" style={{ color: '#7070a0', fontSize: '.8125rem', textDecoration: 'none' }}>
          ← Dashboard
        </a>

        <div style={{ display: 'flex', alignItems: 'center', gap: '.625rem', marginTop: '.5rem', marginBottom: '.25rem' }}>
          <JiraIcon size={26}/>
          <h1 style={{ fontSize: '1.625rem', fontWeight: 700, color: '#f0f0fc' }}>Jira + Zephyr Scale</h1>
        </div>
        <p style={{ color: '#7070a0', fontSize: '.9375rem', marginBottom: '1.5rem' }}>
          Sincroniza test cases de Zephyr, reporta executions, y crea bugs desde Achilltest.
        </p>

        {justConnected && connection && (
          <div style={{
            background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.25)',
            borderRadius: 10, padding: '.75rem 1rem', marginBottom: '1rem',
            fontSize: '.8125rem', color: '#22c55e',
          }}>
            ✓ Jira conectado exitosamente como <strong>{connection.atlassianUserName}</strong>
          </div>
        )}

        {oauthError && (
          <div style={errorBoxStyle}>✗ Falló la conexión: {oauthError}</div>
        )}
        {error && <div style={errorBoxStyle}>{error}</div>}

        {/* Connection */}
        {connection ? (
          <ConnectedCard
            connection={connection}
            onDisconnect={disconnect}
            onConfigZephyr={() => setZephyrModal(true)}
          />
        ) : (
          <NotConnectedCard onApiToken={() => setApiTokenModal(true)}/>
        )}

        {/* Projects */}
        {connection && (
          <div style={{ marginTop: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.75rem' }}>
              <h2 style={{ fontSize: '1.0625rem', fontWeight: 600, color: '#f0f0fc' }}>
                📁 Projects ({projects.length})
              </h2>
              <button onClick={syncProjects} disabled={syncing} style={btnSecondaryStyle}>
                {syncing ? 'Sincronizando...' : '🔄 Sync projects'}
              </button>
            </div>

            {projects.length === 0 ? (
              <div style={{
                padding: '2rem', textAlign: 'center',
                background: '#0e0e1a', border: '1px dashed rgba(255,255,255,.1)',
                borderRadius: 12,
              }}>
                <div style={{ fontSize: '2rem', marginBottom: '.5rem' }}>📂</div>
                <p style={{ color: '#7070a0', fontSize: '.875rem', marginBottom: '1rem' }}>
                  Sin projects sincronizados. Click en "Sync projects" para traerlos desde Jira.
                </p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '.5rem' }}>
                {projects.map(p => (
                  <ProjectCard key={p.id} project={p}
                    onToggleSelect={() => toggleSelect(p)}
                    onOpen={() => router.push(`/jira/projects/${p.id}`)}/>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {zephyrModal && (
        <ZephyrTokenModal onClose={() => setZephyrModal(false)} onSaved={() => { setZephyrModal(false); loadAll() }}/>
      )}
      {apiTokenModal && (
        <ApiTokenModal onClose={() => setApiTokenModal(false)} onSaved={() => { setApiTokenModal(false); loadAll() }}/>
      )}
    </div>
  )
}

// ── Connected Card ─────────────────────────────────────────────────────────

function ConnectedCard({ connection, onDisconnect, onConfigZephyr }: any) {
  return (
    <div style={{
      background: '#0e0e1a',
      border: '1px solid rgba(0,82,204,.25)',
      borderRadius: 12, padding: '1.25rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
        {connection.avatarUrl ? (
          <img src={connection.avatarUrl} alt="" style={{ width: 56, height: 56, borderRadius: '50%', border: '2px solid rgba(255,255,255,.1)' }}/>
        ) : (
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: '#0052cc', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.25rem', fontWeight: 700,
          }}>{connection.atlassianUserName?.charAt(0) || 'J'}</div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.25rem', flexWrap: 'wrap' }}>
            <JiraIcon size={14}/>
            <span style={{ fontSize: '1rem', fontWeight: 700, color: '#f0f0fc' }}>
              {connection.atlassianUserName}
            </span>
            <span style={{
              background: 'rgba(34,197,94,.15)', color: '#22c55e',
              padding: '.125rem .5rem', borderRadius: 12,
              fontSize: '.625rem', fontWeight: 600,
            }}>● Conectado</span>
            <span style={{
              background: connection.authType === 'oauth' ? 'rgba(0,82,204,.15)' : 'rgba(196,168,255,.15)',
              color: connection.authType === 'oauth' ? '#4d8fff' : '#c4a8ff',
              padding: '.125rem .5rem', borderRadius: 12,
              fontSize: '.625rem', fontWeight: 600,
            }}>{connection.authType === 'oauth' ? '🔐 OAuth' : '🔑 API Token'}</span>
          </div>
          {connection.atlassianUserEmail && (
            <div style={{ fontSize: '.75rem', color: '#7070a0' }}>{connection.atlassianUserEmail}</div>
          )}
          <div style={{ fontSize: '.7rem', color: '#7070a0', marginTop: '.125rem' }}>
            <a href={connection.siteUrl} target="_blank" rel="noopener" style={{ color: '#c4a8ff', textDecoration: 'none' }}>
              {connection.siteUrl} ↗
            </a>
          </div>
        </div>
        <button onClick={onDisconnect} style={{
          background: 'transparent', color: '#f87171',
          border: '1px solid rgba(239,68,68,.25)',
          borderRadius: 8, padding: '.5rem .875rem',
          fontSize: '.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
        }}>Desconectar</button>
      </div>

      {/* Zephyr status */}
      <div style={{
        background: connection.hasZephyr ? 'rgba(34,197,94,.06)' : 'rgba(196,168,255,.06)',
        border: `1px solid ${connection.hasZephyr ? 'rgba(34,197,94,.15)' : 'rgba(196,168,255,.15)'}`,
        borderRadius: 10, padding: '.75rem 1rem',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: '.5rem',
      }}>
        <div>
          <div style={{ fontSize: '.8125rem', color: '#f0f0fc', fontWeight: 600 }}>
            🧪 Zephyr Scale: {connection.hasZephyr ? 'Configurado' : 'No configurado'}
          </div>
          <div style={{ fontSize: '.7rem', color: '#7070a0', marginTop: '.125rem' }}>
            {connection.hasZephyr
              ? 'Puedes sincronizar test cases y reportar executions a Zephyr.'
              : 'Configura tu token de Zephyr Scale para activar la integración completa.'}
          </div>
        </div>
        <button onClick={onConfigZephyr} style={btnSecondaryStyle}>
          {connection.hasZephyr ? '⚙ Reconfigurar' : '+ Configurar Zephyr'}
        </button>
      </div>
    </div>
  )
}

// ── Not Connected Card ─────────────────────────────────────────────────────

function NotConnectedCard({ onApiToken }: any) {
  return (
    <div style={{
      background: '#0e0e1a',
      border: '1px solid rgba(255,255,255,.07)',
      borderRadius: 12, padding: '2rem',
      textAlign: 'center',
    }}>
      <div style={{ marginBottom: '.5rem' }}><JiraIcon size={48}/></div>
      <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#f0f0fc', marginBottom: '.5rem' }}>
        Conecta tu cuenta de Jira
      </h2>
      <p style={{ color: '#7070a0', fontSize: '.875rem', marginBottom: '1.5rem', maxWidth: 480, margin: '0 auto 1.5rem' }}>
        Soportamos Atlassian Cloud (OAuth) y Jira Server/Data Center (API Token).
      </p>
      <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
        <JiraConnectButton/>
        <button onClick={onApiToken} style={{
          background: 'transparent', color: '#c4c4d8',
          border: '1px solid rgba(255,255,255,.15)',
          borderRadius: 8, padding: '.625rem 1rem',
          fontSize: '.875rem', fontWeight: 500, cursor: 'pointer',
          fontFamily: 'inherit',
        }}>
          🔑 Usar API Token (Server / Data Center)
        </button>
      </div>
      <div style={{
        marginTop: '1.5rem', fontSize: '.7rem', color: '#7070a0',
        maxWidth: 480, margin: '1.5rem auto 0',
      }}>
        🔒 Tokens cifrados con AES-256-GCM. Nunca expuestos en la UI.
      </div>
    </div>
  )
}

// ── Project Card ──────────────────────────────────────────────────────────

function ProjectCard({ project, onToggleSelect, onOpen }: any) {
  return (
    <div style={{
      background: '#0e0e1a',
      border: `1px solid ${project.isSelected ? 'rgba(0,82,204,.3)' : 'rgba(255,255,255,.07)'}`,
      borderRadius: 10, padding: '.75rem 1rem',
      display: 'flex', alignItems: 'center', gap: '.875rem',
    }}>
      {project.avatarUrl ? (
        <img src={project.avatarUrl} alt="" style={{ width: 36, height: 36, borderRadius: 6 }}/>
      ) : (
        <div style={{
          width: 36, height: 36, borderRadius: 6,
          background: '#0052cc', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '.75rem', fontWeight: 700,
        }}>{project.jiraProjectKey?.slice(0, 3)}</div>
      )}
      <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={onOpen}>
        <div style={{ fontSize: '.875rem', fontWeight: 600, color: '#f0f0fc' }}>
          {project.name} <span style={{
            background: 'rgba(255,255,255,.05)', color: '#7070a0',
            padding: '.125rem .375rem', borderRadius: 4,
            fontSize: '.625rem', fontFamily: 'JetBrains Mono, monospace', marginLeft: '.375rem',
          }}>{project.jiraProjectKey}</span>
        </div>
        {project.description && (
          <div style={{
            fontSize: '.7rem', color: '#7070a0', marginTop: '.125rem',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            maxWidth: 500,
          }}>{project.description}</div>
        )}
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: '.375rem', cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={project.isSelected}
          onChange={onToggleSelect}
          style={{ cursor: 'pointer' }}
        />
        <span style={{ fontSize: '.7rem', color: project.isSelected ? '#4d8fff' : '#7070a0' }}>
          {project.isSelected ? 'Activo' : 'Activar'}
        </span>
      </label>
    </div>
  )
}

// ── Modals ────────────────────────────────────────────────────────────────

function ZephyrTokenModal({ onClose, onSaved }: any) {
  const [zephyrToken, setZephyrToken] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (!zephyrToken.trim()) return setError('Token requerido')
    setSaving(true); setError('')
    try {
      await api.post('/api/jira/connection/zephyr-token', { zephyrToken: zephyrToken.trim() })
      onSaved()
    } catch (err: any) {
      setError(err.message); setSaving(false)
    }
  }

  return (
    <Modal onClose={onClose}>
      <h3 style={modalTitleStyle}>🧪 Configurar Zephyr Scale</h3>
      <p style={{ fontSize: '.8125rem', color: '#7070a0', marginBottom: '1rem' }}>
        Zephyr Scale tiene su propio API token, separado del de Jira.
      </p>

      <div style={{
        background: 'rgba(0,82,204,.06)', border: '1px solid rgba(0,82,204,.15)',
        borderRadius: 8, padding: '.75rem .875rem', fontSize: '.7rem',
        color: '#7070a0', marginBottom: '1rem',
      }}>
        <div style={{ marginBottom: '.375rem', fontWeight: 600, color: '#4d8fff' }}>
          ¿Cómo obtener el token?
        </div>
        En Jira: <strong>Apps → Zephyr Scale → API Access Tokens → Create Token</strong>
      </div>

      <Field label="Zephyr API Token">
        <input
          type="password"
          value={zephyrToken}
          onChange={(e) => setZephyrToken(e.target.value)}
          placeholder="eyJ..."
          style={inputStyle}
          autoFocus
        />
      </Field>

      {error && <div style={errorBoxStyle}>{error}</div>}

      <div style={{ display: 'flex', gap: '.5rem' }}>
        <button onClick={onClose} style={btnGhostStyle}>Cancelar</button>
        <button onClick={save} disabled={saving} style={{ ...btnPrimaryStyle, flex: 1, opacity: saving ? .6 : 1 }}>
          {saving ? 'Validando...' : 'Guardar'}
        </button>
      </div>
    </Modal>
  )
}

function ApiTokenModal({ onClose, onSaved }: any) {
  const [siteUrl, setSiteUrl]       = useState('')
  const [email, setEmail]           = useState('')
  const [apiToken, setApiToken]     = useState('')
  const [deploymentType, setDeploymentType] = useState<'cloud' | 'server'>('cloud')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (!siteUrl.trim() || !email.trim() || !apiToken.trim()) {
      return setError('Todos los campos son requeridos')
    }
    setSaving(true); setError('')
    try {
      await api.post('/api/jira/connection/api-token', {
        siteUrl, email, apiToken, deploymentType,
      })
      onSaved()
    } catch (err: any) {
      setError(err.message); setSaving(false)
    }
  }

  return (
    <Modal onClose={onClose}>
      <h3 style={modalTitleStyle}>🔑 Conectar con API Token</h3>
      <p style={{ fontSize: '.8125rem', color: '#7070a0', marginBottom: '1rem' }}>
        Mejor para Jira Server/Data Center (on-prem) o si prefieres no usar OAuth.
      </p>

      <div style={{
        background: 'rgba(196,168,255,.06)', border: '1px solid rgba(196,168,255,.15)',
        borderRadius: 8, padding: '.75rem .875rem', fontSize: '.7rem',
        color: '#7070a0', marginBottom: '1rem',
      }}>
        <div style={{ marginBottom: '.375rem', fontWeight: 600, color: '#c4a8ff' }}>
          ¿Cómo obtener el token?
        </div>
        Cloud: <strong>id.atlassian.com → Security → API tokens</strong>
        <br/>Server: <strong>Profile → Personal Access Tokens</strong>
      </div>

      <Field label="Site URL">
        <input value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)}
          placeholder="https://acme.atlassian.net" style={inputStyle} autoFocus/>
      </Field>

      <Field label="Email (de tu cuenta Atlassian)">
        <input value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="tu-email@empresa.com" style={inputStyle}/>
      </Field>

      <Field label="API Token">
        <input type="password" value={apiToken} onChange={(e) => setApiToken(e.target.value)}
          placeholder="ATATT..." style={inputStyle}/>
      </Field>

      <Field label="Tipo de deployment">
        <select value={deploymentType} onChange={(e) => setDeploymentType(e.target.value as any)} style={inputStyle}>
          <option value="cloud">Cloud (atlassian.net)</option>
          <option value="server">Server / Data Center (on-prem)</option>
        </select>
      </Field>

      {error && <div style={errorBoxStyle}>{error}</div>}

      <div style={{ display: 'flex', gap: '.5rem' }}>
        <button onClick={onClose} style={btnGhostStyle}>Cancelar</button>
        <button onClick={save} disabled={saving} style={{ ...btnPrimaryStyle, flex: 1, opacity: saving ? .6 : 1 }}>
          {saving ? 'Validando...' : 'Conectar'}
        </button>
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
        borderRadius: 14, padding: '1.5rem',
        width: '100%', maxWidth: 480,
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
  background: '#0052cc', color: '#fff', border: 'none', borderRadius: 8,
  padding: '.5rem 1rem', fontSize: '.8125rem', fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit',
}
const btnSecondaryStyle: React.CSSProperties = {
  background: 'transparent', color: '#c4c4d8',
  border: '1px solid rgba(255,255,255,.12)', borderRadius: 8,
  padding: '.4375rem .875rem', fontSize: '.75rem', fontWeight: 500, cursor: 'pointer',
  fontFamily: 'inherit',
}
const btnGhostStyle: React.CSSProperties = {
  background: 'transparent', border: '1px solid rgba(255,255,255,.1)',
  color: '#7070a0', borderRadius: 8,
  padding: '.5rem 1rem', fontSize: '.8125rem', cursor: 'pointer', fontFamily: 'inherit',
}
const modalTitleStyle: React.CSSProperties = {
  fontSize: '1.125rem', fontWeight: 700, color: '#f0f0fc',
  marginBottom: '.5rem',
}
const errorBoxStyle: React.CSSProperties = {
  background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)',
  borderRadius: 8, padding: '.5rem .75rem', fontSize: '.75rem',
  color: '#f87171', marginBottom: '.75rem',
}
