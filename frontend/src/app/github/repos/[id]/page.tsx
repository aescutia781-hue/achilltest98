'use client'

import { useEffect, useState }   from 'react'
import { useRouter, useParams }  from 'next/navigation'
import { useAuth }               from '@/hooks/useAuth'
import { api, logout }           from '@/lib/api'
import { GithubIcon }            from '@/components/GithubConnectButton'

export default function GithubRepoDetailPage() {
  const router = useRouter()
  const params = useParams()
  const repoId = params.id as string
  const { user, loading } = useAuth(true)

  const [repo, setRepo] = useState<any>(null)
  const [loadingData, setLoadingData] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user) return
    if (user.plan !== 'teammate') { router.push('/pricing'); return }
    loadRepo()
  }, [user, repoId])

  // Auto-refresh si hay push en curso
  useEffect(() => {
    if (!repo?.recentPushes?.some((p: any) => p.status === 'pending' || p.status === 'pushing')) return
    const t = setInterval(() => loadRepo(), 3000)
    return () => clearInterval(t)
  }, [repo])

  async function loadRepo() {
    try {
      const r = await api.get(`/api/github/repos/${repoId}`)
      setRepo(r.data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoadingData(false)
    }
  }

  async function unlinkRepo() {
    if (!confirm('¿Olvidar el vínculo con este repo?\n\nEl repo seguirá en GitHub, pero ya no podrás pushear desde Achilltest.')) return
    try {
      await api.delete(`/api/github/repos/${repoId}`)
      router.push('/github')
    } catch (err: any) {
      alert(err.message)
    }
  }

  if (loading || loadingData) return <Loading/>
  if (!user) return null
  if (!repo) return <Loading text="Repo no encontrado"/>

  return (
    <div style={{ minHeight: '100vh', background: '#08080f', color: '#c4c4d8', fontFamily: 'Inter,system-ui,sans-serif' }}>
      <Nav user={user}/>

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '2rem 1.5rem' }}>
        <a href="/github" style={{ color: '#7070a0', fontSize: '.8125rem', textDecoration: 'none' }}>
          ← Volver a GitHub
        </a>

        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          marginTop: '.5rem', marginBottom: '1.5rem',
          flexWrap: 'wrap', gap: '1rem',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.375rem' }}>
              <GithubIcon size={20}/>
              <h1 style={{
                fontSize: '1.375rem', fontWeight: 700, color: '#f0f0fc',
                fontFamily: 'JetBrains Mono, monospace',
              }}>
                {repo.fullName}
              </h1>
              <span style={{
                background: repo.visibility === 'private' ? 'rgba(255,255,255,.06)' : 'rgba(132,204,22,.12)',
                color: repo.visibility === 'private' ? '#7070a0' : '#84cc16',
                padding: '.125rem .5rem', borderRadius: 12,
                fontSize: '.65rem', fontWeight: 600,
              }}>
                {repo.visibility === 'private' ? '🔒 Private' : '🌐 Public'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', fontSize: '.7rem' }}>
              <span style={chipStyle}>🌿 {repo.defaultBranch}</span>
              {repo.sourceType && (
                <span style={{ ...chipStyle, color: '#c4a8ff' }}>
                  📂 {repo.sourceType}: {repo.sourceName || repo.sourceId}
                </span>
              )}
              <span style={chipStyle}>📦 {repo.totalPushes || 0} pushes</span>
              {repo.lastPushedAt && (
                <span style={chipStyle}>
                  📤 Último: {new Date(repo.lastPushedAt).toLocaleString('es-MX')}
                </span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '.5rem' }}>
            <a href={repo.htmlUrl} target="_blank" rel="noopener" style={{
              background: '#24292e', color: '#fff',
              padding: '.5rem .875rem', borderRadius: 8,
              fontSize: '.8125rem', fontWeight: 600,
              textDecoration: 'none', fontFamily: 'inherit',
              display: 'inline-flex', alignItems: 'center', gap: '.375rem',
            }}>
              <GithubIcon size={14}/> Abrir en GitHub
            </a>
          </div>
        </div>

        {error && (
          <div style={{
            background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)',
            borderRadius: 8, padding: '.625rem .75rem', fontSize: '.8125rem',
            color: '#f87171', marginBottom: '1rem',
          }}>{error}</div>
        )}

        {/* Stats cards */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '.625rem', marginBottom: '1.5rem',
        }}>
          <StatCard label="Total pushes" value={repo.totalPushes || 0}/>
          <StatCard label="Archivos (último)" value={repo.lastFileCount || 0}/>
          <StatCard label="Branch" value={repo.defaultBranch}/>
          <StatCard label="Conectado"
            value={new Date(repo.createdAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}/>
        </div>

        {/* Last commit info */}
        {repo.lastCommitSha && (
          <div style={{
            background: '#0e0e1a', border: '1px solid rgba(255,255,255,.07)',
            borderRadius: 12, padding: '1rem 1.25rem', marginBottom: '1.5rem',
          }}>
            <div style={{ fontSize: '.7rem', color: '#7070a0', fontWeight: 600, marginBottom: '.375rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>
              📌 Último commit
            </div>
            <div style={{ fontSize: '.875rem', color: '#f0f0fc', marginBottom: '.25rem' }}>
              {repo.lastCommitMessage}
            </div>
            <code style={{
              fontFamily: 'JetBrains Mono, monospace', fontSize: '.7rem',
              color: '#a3e635',
            }}>{repo.lastCommitSha?.slice(0, 7)}</code>
          </div>
        )}

        {/* History */}
        <h2 style={{
          fontSize: '1.0625rem', fontWeight: 600, color: '#f0f0fc',
          marginBottom: '.75rem',
        }}>
          📜 Historial de pushes ({repo.recentPushes?.length || 0})
        </h2>

        {(!repo.recentPushes || repo.recentPushes.length === 0) ? (
          <div style={{
            padding: '2rem', textAlign: 'center',
            background: '#0e0e1a', border: '1px dashed rgba(255,255,255,.1)',
            borderRadius: 10, color: '#7070a0', fontSize: '.875rem',
          }}>
            Sin pushes aún. Genera uno desde la suite vinculada.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '.5rem' }}>
            {repo.recentPushes.map((p: any) => <PushCard key={p.id} push={p} repo={repo}/>)}
          </div>
        )}

        {/* Danger zone */}
        <div style={{ marginTop: '2rem' }}>
          <h3 style={{ fontSize: '.875rem', fontWeight: 600, color: '#f87171', marginBottom: '.5rem' }}>
            ⚠️ Zona peligrosa
          </h3>
          <div style={{
            background: 'rgba(239,68,68,.04)', border: '1px solid rgba(239,68,68,.15)',
            borderRadius: 10, padding: '1rem',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            flexWrap: 'wrap', gap: '.75rem',
          }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: '.875rem', color: '#f0f0fc', fontWeight: 500, marginBottom: '.125rem' }}>
                Olvidar este repo
              </div>
              <div style={{ fontSize: '.7rem', color: '#7070a0' }}>
                Quita el vínculo de Achilltest. El repo seguirá existiendo en GitHub.
              </div>
            </div>
            <button onClick={unlinkRepo} style={{
              background: 'transparent', color: '#f87171',
              border: '1px solid rgba(239,68,68,.4)',
              borderRadius: 8, padding: '.5rem 1rem',
              fontSize: '.8125rem', fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>Olvidar repo</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function PushCard({ push, repo }: any) {
  const statusMeta: Record<string, { color: string; icon: string; label: string }> = {
    pending:   { color: '#7070a0', icon: '○',  label: 'Pendiente' },
    pushing:   { color: '#26b5aa', icon: '⏳', label: 'En curso' },
    completed: { color: '#22c55e', icon: '✓',  label: 'Completado' },
    failed:    { color: '#f87171', icon: '✗',  label: 'Falló' },
  }
  const m = statusMeta[push.status] || statusMeta.pending

  return (
    <div style={{
      background: '#0e0e1a', border: '1px solid rgba(255,255,255,.07)',
      borderRadius: 10, padding: '.75rem 1rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.625rem', marginBottom: '.25rem' }}>
        <span style={{
          background: `${m.color}20`, color: m.color,
          width: 24, height: 24, borderRadius: '50%',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '.8125rem', fontWeight: 700,
        }}>{m.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: '.8125rem', color: '#f0f0fc',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {push.commitMessage}
          </div>
          <div style={{ display: 'flex', gap: '.375rem', fontSize: '.65rem', color: '#7070a0', marginTop: '.125rem' }}>
            <span style={{ color: m.color }}>{m.label}</span>
            <span>·</span>
            <span>{push.filesCount} archivos</span>
            {push.branch && (<><span>·</span><span>🌿 {push.branch}</span></>)}
            {push.durationMs && (<><span>·</span><span>{(push.durationMs / 1000).toFixed(1)}s</span></>)}
            <span>·</span>
            <span>{_formatRelative(push.createdAt)}</span>
          </div>
        </div>
        {push.commitSha && (
          <a href={push.commitUrl || `${repo.htmlUrl}/commit/${push.commitSha}`}
            target="_blank" rel="noopener"
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '.7rem', color: '#a3e635',
              padding: '.1875rem .375rem', borderRadius: 4,
              background: '#141422', textDecoration: 'none',
            }}>{push.commitSha.slice(0, 7)} ↗</a>
        )}
      </div>
      {push.status === 'failed' && push.errorMessage && (
        <div style={{
          marginTop: '.375rem', padding: '.375rem .5rem',
          background: 'rgba(239,68,68,.05)', borderRadius: 6,
          fontSize: '.7rem', color: '#fca5a5',
          fontFamily: 'JetBrains Mono, monospace',
        }}>
          {push.errorMessage}
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value }: any) {
  return (
    <div style={{
      background: '#0e0e1a', border: '1px solid rgba(255,255,255,.07)',
      borderRadius: 10, padding: '.75rem',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f0f0fc', lineHeight: 1 }}>{value}</div>
      <div style={{
        fontSize: '.625rem', color: '#7070a0',
        marginTop: '.25rem', textTransform: 'uppercase', letterSpacing: '.05em',
        fontWeight: 600,
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
      <a href="/github" style={{ color: '#c4a8ff', textDecoration: 'none', fontSize: '.875rem' }}>← GitHub</a>
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

function _formatRelative(iso: string): string {
  const d = new Date(iso)
  const diffSec = (Date.now() - d.getTime()) / 1000
  if (diffSec < 60) return 'hace un momento'
  if (diffSec < 3600) return `hace ${Math.floor(diffSec / 60)} min`
  if (diffSec < 86400) return `hace ${Math.floor(diffSec / 3600)} h`
  if (diffSec < 2592000) return `hace ${Math.floor(diffSec / 86400)} d`
  return d.toLocaleDateString('es-MX')
}

const chipStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,.04)', color: '#7070a0',
  padding: '.125rem .5rem', borderRadius: 4,
  fontSize: '.65rem', fontWeight: 600,
}
