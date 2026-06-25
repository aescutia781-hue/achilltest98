'use client'

import { useEffect, useState }   from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth }               from '@/hooks/useAuth'
import { api, logout }           from '@/lib/api'
import GithubConnectButton,
       { GithubIcon }            from '@/components/GithubConnectButton'

export default function GithubPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading } = useAuth(true)

  const [connection, setConnection] = useState<any>(null)
  const [repos, setRepos]           = useState<any[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [error, setError] = useState('')

  // Banner de success/error tras OAuth callback
  const justConnected = searchParams?.get('github') === 'connected'
  const oauthError = searchParams?.get('error')

  useEffect(() => {
    if (!user) return
    if (user.plan !== 'teammate') { router.push('/pricing'); return }
    loadAll()
  }, [user])

  async function loadAll() {
    try {
      const [c, r] = await Promise.all([
        api.get('/api/github/connection'),
        api.get('/api/github/repos').catch(() => ({ data: [] })),
      ])
      setConnection(c.data)
      setRepos(r.data || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoadingData(false)
    }
  }

  async function disconnect() {
    if (!confirm('¿Desconectar GitHub? Los repos seguirán en GitHub pero perderán el vínculo con Achilltest. Tendrás que reconectar para pushear de nuevo.')) return
    try {
      await api.delete('/api/github/connection')
      router.push('/github')
      setTimeout(() => location.reload(), 100)
    } catch (err: any) {
      alert(err.message)
    }
  }

  async function unlinkRepo(id: string, name: string) {
    if (!confirm(`¿Olvidar el vínculo con "${name}"?\n\nEl repo seguirá en GitHub, pero ya no podrás pushear a él desde Achilltest sin reconectar.`)) return
    try {
      await api.delete(`/api/github/repos/${id}`)
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

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '2rem 1.5rem' }}>
        <a href="/dashboard" style={{ color: '#7070a0', fontSize: '.8125rem', textDecoration: 'none' }}>
          ← Dashboard
        </a>

        <div style={{
          display: 'flex', alignItems: 'center', gap: '.625rem',
          marginTop: '.5rem', marginBottom: '.25rem',
        }}>
          <GithubIcon size={24}/>
          <h1 style={{ fontSize: '1.625rem', fontWeight: 700, color: '#f0f0fc' }}>
            GitHub Integration
          </h1>
        </div>
        <p style={{ color: '#7070a0', fontSize: '.9375rem', marginBottom: '1.5rem' }}>
          Crea repos, versiona tus tests, y manténlos sincronizados desde Achilltest.
        </p>

        {justConnected && connection && (
          <div style={{
            background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.25)',
            borderRadius: 10, padding: '.75rem 1rem', marginBottom: '1rem',
            fontSize: '.8125rem', color: '#22c55e',
          }}>
            ✓ ¡GitHub conectado exitosamente como <strong>{connection.githubUsername}</strong>!
          </div>
        )}

        {oauthError && (
          <div style={{
            background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)',
            borderRadius: 10, padding: '.75rem 1rem', marginBottom: '1rem',
            fontSize: '.8125rem', color: '#f87171',
          }}>
            ✗ Falló la conexión: {oauthError}
          </div>
        )}

        {error && (
          <div style={{
            background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)',
            borderRadius: 8, padding: '.5rem .75rem', fontSize: '.75rem',
            color: '#f87171', marginBottom: '1rem',
          }}>{error}</div>
        )}

        {/* Connection card */}
        {connection ? (
          <ConnectedCard
            connection={connection}
            onDisconnect={disconnect}
          />
        ) : (
          <NotConnectedCard/>
        )}

        {/* Connected repos */}
        {connection && (
          <div style={{ marginTop: '1.5rem' }}>
            <h2 style={{
              fontSize: '1.0625rem', fontWeight: 600, color: '#f0f0fc',
              marginBottom: '.75rem',
            }}>
              📦 Repos conectados ({repos.length})
            </h2>

            {repos.length === 0 ? (
              <div style={{
                padding: '2rem', textAlign: 'center',
                background: '#0e0e1a', border: '1px dashed rgba(255,255,255,.1)',
                borderRadius: 12,
              }}>
                <div style={{ fontSize: '2rem', marginBottom: '.5rem' }}>📁</div>
                <p style={{ color: '#7070a0', fontSize: '.875rem', marginBottom: '1rem' }}>
                  Aún no has creado repos desde Achilltest. Ve a una Suite y usa el botón "Push to GitHub".
                </p>
                <button onClick={() => router.push('/suites')} style={btnSecondaryStyle}>
                  Ir a mis Suites
                </button>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '.625rem' }}>
                {repos.map(r => <RepoCard key={r.id} repo={r}
                  onView={() => router.push(`/github/repos/${r.id}`)}
                  onUnlink={() => unlinkRepo(r.id, r.fullName)}/>)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Cards ──

function ConnectedCard({ connection, onDisconnect }: any) {
  return (
    <div style={{
      background: '#0e0e1a',
      border: '1px solid rgba(34,197,94,.2)',
      borderRadius: 12, padding: '1.25rem',
      display: 'flex', alignItems: 'center', gap: '1rem',
    }}>
      <img src={connection.avatarUrl} alt={connection.githubUsername}
        style={{
          width: 56, height: 56, borderRadius: '50%',
          border: '2px solid rgba(255,255,255,.1)',
        }}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '.5rem',
          marginBottom: '.25rem',
        }}>
          <GithubIcon size={14}/>
          <span style={{ fontSize: '1rem', fontWeight: 700, color: '#f0f0fc' }}>
            {connection.githubUsername}
          </span>
          <span style={{
            background: 'rgba(34,197,94,.15)', color: '#22c55e',
            padding: '.125rem .5rem', borderRadius: 12,
            fontSize: '.625rem', fontWeight: 600,
          }}>● Conectado</span>
        </div>
        {connection.githubEmail && (
          <div style={{ fontSize: '.75rem', color: '#7070a0', marginBottom: '.125rem' }}>
            {connection.githubEmail}
          </div>
        )}
        <div style={{ fontSize: '.7rem', color: '#7070a0' }}>
          Conectado: {new Date(connection.connectedAt).toLocaleString('es-MX')}
          {connection.lastUsedAt && ` · Último uso: ${_formatRelative(connection.lastUsedAt)}`}
        </div>
        {connection.scopes?.length > 0 && (
          <div style={{ display: 'flex', gap: '.25rem', marginTop: '.375rem', flexWrap: 'wrap' }}>
            {connection.scopes.map((s: string) => (
              <span key={s} style={{
                background: 'rgba(255,255,255,.04)', color: '#7070a0',
                padding: '.125rem .375rem', borderRadius: 4,
                fontSize: '.625rem', fontFamily: 'JetBrains Mono, monospace',
              }}>{s}</span>
            ))}
          </div>
        )}
      </div>
      <button onClick={onDisconnect} style={{
        background: 'transparent', color: '#f87171',
        border: '1px solid rgba(239,68,68,.25)',
        borderRadius: 8, padding: '.5rem .875rem',
        fontSize: '.75rem', fontWeight: 600, cursor: 'pointer',
        fontFamily: 'inherit',
      }}>Desconectar</button>
    </div>
  )
}

function NotConnectedCard() {
  return (
    <div style={{
      background: '#0e0e1a',
      border: '1px solid rgba(255,255,255,.07)',
      borderRadius: 12, padding: '2rem',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: '3rem', marginBottom: '.5rem' }}>
        <GithubIcon size={48}/>
      </div>
      <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#f0f0fc', marginBottom: '.5rem' }}>
        Conecta tu cuenta de GitHub
      </h2>
      <p style={{ color: '#7070a0', fontSize: '.875rem', marginBottom: '1.25rem', maxWidth: 480, margin: '0 auto 1.25rem' }}>
        Una vez conectado, podrás crear repos, versionar tus tests, y mantener sincronizado tu código
        con un click desde cualquier Suite.
      </p>
      <GithubConnectButton/>
      <div style={{
        marginTop: '1.5rem', fontSize: '.7rem', color: '#7070a0',
        maxWidth: 460, margin: '1.5rem auto 0',
      }}>
        🔒 Achilltest solo solicita acceso a repos (no a tu código privado fuera de los repos que selecciones).
        Tu token se almacena cifrado con AES-256-GCM y nunca se expone en la UI ni se loggea.
      </div>
    </div>
  )
}

function RepoCard({ repo, onView, onUnlink }: any) {
  return (
    <div style={{
      background: '#0e0e1a', border: '1px solid rgba(255,255,255,.07)',
      borderRadius: 12, padding: '.875rem 1rem',
      display: 'flex', alignItems: 'center', gap: '1rem',
      cursor: 'pointer', transition: 'border-color .15s',
    }}
    onClick={onView}
    onMouseEnter={(e: any) => e.currentTarget.style.borderColor = 'rgba(132,204,22,.3)'}
    onMouseLeave={(e: any) => e.currentTarget.style.borderColor = 'rgba(255,255,255,.07)'}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.375rem', marginBottom: '.25rem' }}>
          <GithubIcon size={14}/>
          <span style={{
            fontSize: '.875rem', fontWeight: 600, color: '#f0f0fc',
            fontFamily: 'JetBrains Mono, monospace',
          }}>{repo.fullName}</span>
          {repo.visibility === 'private' && (
            <span style={{
              background: 'rgba(255,255,255,.06)', color: '#7070a0',
              padding: '.0625rem .375rem', borderRadius: 4,
              fontSize: '.625rem', fontWeight: 600,
            }}>🔒 Private</span>
          )}
        </div>
        <div style={{ fontSize: '.7rem', color: '#7070a0', display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
          {repo.sourceName && <span>📂 {repo.sourceName}</span>}
          <span>📦 {repo.totalPushes || 0} pushes</span>
          {repo.lastPushedAt && (
            <span>📤 Último: {_formatRelative(repo.lastPushedAt)}</span>
          )}
        </div>
      </div>

      <a href={repo.htmlUrl} target="_blank" rel="noopener"
        onClick={(e: any) => e.stopPropagation()}
        style={{
          background: 'rgba(255,255,255,.04)', color: '#c4c4d8',
          padding: '.375rem .625rem', borderRadius: 6,
          fontSize: '.7rem', fontWeight: 600,
          textDecoration: 'none', fontFamily: 'inherit',
        }}>↗</a>
      <button onClick={(e: any) => { e.stopPropagation(); onUnlink() }} style={{
        background: 'transparent', color: '#f87171',
        border: '1px solid rgba(239,68,68,.2)',
        borderRadius: 6, padding: '.3125rem .625rem',
        fontSize: '.7rem', cursor: 'pointer', fontFamily: 'inherit',
      }}>Olvidar</button>
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

function _formatRelative(iso: string): string {
  const d = new Date(iso)
  const diffSec = (Date.now() - d.getTime()) / 1000
  if (diffSec < 60) return 'hace un momento'
  if (diffSec < 3600) return `hace ${Math.floor(diffSec / 60)} min`
  if (diffSec < 86400) return `hace ${Math.floor(diffSec / 3600)} h`
  if (diffSec < 2592000) return `hace ${Math.floor(diffSec / 86400)} d`
  return d.toLocaleDateString('es-MX')
}

const btnSecondaryStyle: React.CSSProperties = {
  background: 'transparent', color: '#c4c4d8',
  border: '1px solid rgba(255,255,255,.12)', borderRadius: 8,
  padding: '.5rem 1rem', fontSize: '.875rem', fontWeight: 500, cursor: 'pointer',
  fontFamily: 'inherit',
}
