'use client'

import { useEffect, useState }   from 'react'
import { useRouter, useParams }  from 'next/navigation'
import { useAuth }               from '@/hooks/useAuth'
import { api, logout }           from '@/lib/api'
import { JiraIcon }              from '@/components/JiraConnectButton'

interface Project {
  id: string
  jiraProjectKey: string
  name: string
  description: string | null
  avatarUrl: string | null
  projectType: string
  isSelected: boolean
}

interface ZephyrCase {
  id: string
  zephyrKey: string
  name: string
  objective: string | null
  status: string | null
  priority: string | null
  folder: string | null
  labels: string[]
  linkedSpecId: string | null
  lastSyncedAt: string
}

export default function JiraProjectDetailPage() {
  const router = useRouter()
  const params = useParams()
  const projectId = params.id as string
  const { user, loading } = useAuth(true)

  const [project, setProject] = useState<Project | null>(null)
  const [cases, setCases] = useState<ZephyrCase[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user) return
    if (user.plan !== 'teammate') { router.push('/pricing'); return }
    loadAll()
  }, [user, projectId])

  async function loadAll() {
    try {
      const [projects, casesR] = await Promise.all([
        api.get('/api/jira/projects'),
        api.get(`/api/jira/projects/${projectId}/zephyr-cases`).catch(() => ({ data: [] })),
      ])
      const p = (projects.data || []).find((x: Project) => x.id === projectId)
      setProject(p || null)
      setCases(casesR.data || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoadingData(false)
    }
  }

  async function syncZephyr() {
    setSyncing(true); setError('')
    try {
      const r = await api.post(`/api/jira/projects/${projectId}/sync-zephyr`, {})
      alert(`✓ Sincronizado: ${r.data.inserted} nuevos, ${r.data.updated} actualizados`)
      loadAll()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSyncing(false)
    }
  }

  if (loading || loadingData) return <Loading/>
  if (!user) return null
  if (!project) return <Loading text="Project no encontrado"/>

  const filtered = cases.filter(c =>
    !search ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.zephyrKey.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div style={{ minHeight: '100vh', background: '#08080f', color: '#c4c4d8', fontFamily: 'Inter,system-ui,sans-serif' }}>
      <Nav user={user}/>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '2rem 1.5rem' }}>
        <a href="/jira" style={{ color: '#7070a0', fontSize: '.8125rem', textDecoration: 'none' }}>
          ← Volver a Jira
        </a>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '.75rem', marginBottom: '1.5rem' }}>
          {project.avatarUrl ? (
            <img src={project.avatarUrl} alt="" style={{ width: 48, height: 48, borderRadius: 8 }}/>
          ) : (
            <div style={{
              width: 48, height: 48, borderRadius: 8,
              background: '#0052cc', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1rem', fontWeight: 700,
            }}>{project.jiraProjectKey.slice(0, 3)}</div>
          )}
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: '1.375rem', fontWeight: 700, color: '#f0f0fc' }}>
              {project.name}
            </h1>
            <div style={{ display: 'flex', gap: '.375rem', alignItems: 'center', marginTop: '.125rem' }}>
              <span style={{
                background: 'rgba(255,255,255,.05)', color: '#a3e635',
                padding: '.125rem .375rem', borderRadius: 4,
                fontSize: '.7rem', fontFamily: 'JetBrains Mono, monospace',
              }}>{project.jiraProjectKey}</span>
              <span style={{ fontSize: '.7rem', color: '#7070a0' }}>{project.projectType}</span>
            </div>
          </div>
          <button onClick={syncZephyr} disabled={syncing} style={{
            background: '#0052cc', color: '#fff', border: 'none', borderRadius: 8,
            padding: '.5rem .875rem', fontSize: '.8125rem', fontWeight: 600,
            cursor: 'pointer', opacity: syncing ? .6 : 1,
            fontFamily: 'inherit',
            display: 'inline-flex', alignItems: 'center', gap: '.5rem',
          }}>
            🧪 {syncing ? 'Sincronizando...' : 'Sync Zephyr cases'}
          </button>
        </div>

        {error && (
          <div style={{
            background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)',
            borderRadius: 8, padding: '.625rem .75rem', fontSize: '.8125rem',
            color: '#f87171', marginBottom: '1rem',
          }}>{error}</div>
        )}

        {/* Stats */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '.625rem', marginBottom: '1.5rem',
        }}>
          <StatCard label="Total cases" value={cases.length}/>
          <StatCard label="Linkeados" value={cases.filter(c => c.linkedSpecId).length}/>
          <StatCard label="Sin link" value={cases.filter(c => !c.linkedSpecId).length}/>
          <StatCard label="Folders" value={new Set(cases.map(c => c.folder).filter(Boolean)).size}/>
        </div>

        {/* Search */}
        {cases.length > 0 && (
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o key..."
            style={{
              width: '100%', background: '#141422',
              border: '1px solid rgba(255,255,255,.1)', borderRadius: 8,
              padding: '.5rem .75rem', color: '#f0f0fc',
              fontSize: '.875rem', outline: 'none', fontFamily: 'inherit',
              marginBottom: '1rem',
            }}
          />
        )}

        {/* Cases list */}
        <h2 style={{ fontSize: '1.0625rem', fontWeight: 600, color: '#f0f0fc', marginBottom: '.5rem' }}>
          🧪 Test Cases ({filtered.length}{cases.length !== filtered.length ? ` de ${cases.length}` : ''})
        </h2>

        {cases.length === 0 ? (
          <div style={{
            padding: '2rem', textAlign: 'center',
            background: '#0e0e1a', border: '1px dashed rgba(255,255,255,.1)',
            borderRadius: 12,
          }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '.5rem' }}>🧪</div>
            <p style={{ color: '#7070a0', fontSize: '.875rem', marginBottom: '1rem' }}>
              Sin test cases sincronizados. Click en "Sync Zephyr cases" para traerlos.
            </p>
            <div style={{
              fontSize: '.75rem', color: '#7070a0', maxWidth: 400, margin: '0 auto',
              padding: '.625rem .875rem', background: '#141422', borderRadius: 8,
            }}>
              💡 Necesitas tener el token de Zephyr Scale configurado en la página de Jira.
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '.5rem' }}>
            {filtered.map(c => <ZephyrCaseRow key={c.id} testCase={c}/>)}
          </div>
        )}
      </div>
    </div>
  )
}

function ZephyrCaseRow({ testCase }: { testCase: ZephyrCase }) {
  const statusColors: Record<string, string> = {
    'Approved':   '#22c55e',
    'Draft':      '#fbbf24',
    'Deprecated': '#f87171',
  }
  const priorityColors: Record<string, string> = {
    'High':   '#f87171',
    'Normal': '#7070a0',
    'Low':    '#22c55e',
  }
  const statusColor = statusColors[testCase.status || ''] || '#7070a0'
  const priorityColor = priorityColors[testCase.priority || ''] || '#7070a0'

  return (
    <div style={{
      background: '#0e0e1a',
      border: `1px solid ${testCase.linkedSpecId ? 'rgba(34,197,94,.2)' : 'rgba(255,255,255,.07)'}`,
      borderRadius: 10, padding: '.75rem 1rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.625rem' }}>
        <span style={{
          background: 'rgba(0,82,204,.15)', color: '#4d8fff',
          padding: '.125rem .375rem', borderRadius: 4,
          fontSize: '.7rem', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600,
        }}>{testCase.zephyrKey}</span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: '.875rem', color: '#f0f0fc', fontWeight: 500,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{testCase.name}</div>
          {testCase.objective && (
            <div style={{
              fontSize: '.7rem', color: '#7070a0', marginTop: '.125rem',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              maxWidth: 600,
            }}>{testCase.objective}</div>
          )}
        </div>

        {testCase.linkedSpecId && (
          <span style={{
            background: 'rgba(34,197,94,.15)', color: '#22c55e',
            padding: '.125rem .375rem', borderRadius: 4,
            fontSize: '.6rem', fontWeight: 600,
          }}>🔗 Linked</span>
        )}

        {testCase.status && (
          <span style={{
            background: `${statusColor}15`, color: statusColor,
            padding: '.125rem .375rem', borderRadius: 4,
            fontSize: '.6rem', fontWeight: 600,
          }}>{testCase.status}</span>
        )}

        {testCase.priority && (
          <span style={{
            background: `${priorityColor}15`, color: priorityColor,
            padding: '.125rem .375rem', borderRadius: 4,
            fontSize: '.6rem', fontWeight: 600,
          }}>{testCase.priority}</span>
        )}
      </div>

      {(testCase.folder || (testCase.labels?.length > 0)) && (
        <div style={{ display: 'flex', gap: '.375rem', marginTop: '.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {testCase.folder && (
            <span style={{ fontSize: '.65rem', color: '#7070a0' }}>📂 {testCase.folder}</span>
          )}
          {testCase.labels?.slice(0, 5).map((label: string) => (
            <span key={label} style={{
              background: 'rgba(196,168,255,.1)', color: '#c4a8ff',
              padding: '.0625rem .25rem', borderRadius: 3, fontSize: '.6rem',
            }}>#{label}</span>
          ))}
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value }: any) {
  return (
    <div style={{
      background: '#0e0e1a', border: '1px solid rgba(255,255,255,.07)',
      borderRadius: 10, padding: '.75rem', textAlign: 'center',
    }}>
      <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f0f0fc', lineHeight: 1 }}>{value}</div>
      <div style={{
        fontSize: '.625rem', color: '#7070a0', marginTop: '.25rem',
        textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600,
      }}>{label}</div>
    </div>
  )
}

function Nav({ user }: any) {
  return (
    <nav style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '1rem 2rem', borderBottom: '1px solid rgba(255,255,255,.07)', background: '#0e0e1a',
    }}>
      <a href="/jira" style={{ color: '#c4a8ff', textDecoration: 'none', fontSize: '.875rem' }}>← Jira</a>
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
