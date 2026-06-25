'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter }            from 'next/navigation'
import { api }                  from '@/lib/api'
import { GithubIcon }           from './GithubConnectButton'

interface Props {
  sourceType:  'suite' | 'workspace'
  sourceId:    string
  sourceName:  string
  onClose:     () => void
}

interface ConnectionInfo {
  githubUsername: string
  avatarUrl: string
  isActive: boolean
}

interface ExistingRepo {
  id:        string
  fullName:  string
  htmlUrl:   string
  sourceType: string | null
  sourceId:  string | null
}

type Mode = 'new' | 'existing'

export default function GithubPushModal({ sourceType, sourceId, sourceName, onClose }: Props) {
  const router = useRouter()

  const [connection, setConnection] = useState<ConnectionInfo | null>(null)
  const [orgs, setOrgs] = useState<any[]>([])
  const [existingRepos, setExistingRepos] = useState<ExistingRepo[]>([])
  const [loadingConn, setLoadingConn] = useState(true)

  const [mode, setMode] = useState<Mode>('new')

  // New repo form
  const defaultName = _slugify(sourceName)
  const [repoName, setRepoName] = useState(defaultName)
  const [description, setDescription] = useState(`Tests de "${sourceName}" - Generado por Achilltest`)
  const [isPrivate, setIsPrivate] = useState(true)
  const [owner, setOwner] = useState('')   // user o org login
  const [includeWorkflow, setIncludeWorkflow] = useState(true)

  // Existing repo
  const [selectedExistingId, setSelectedExistingId] = useState('')

  // Commit
  const [commitMessage, setCommitMessage] = useState(`chore: sync tests from Achilltest`)

  // Estado del push
  const [pushing, setPushing]       = useState(false)
  const [pushId, setPushId]         = useState<string | null>(null)
  const [pushProgress, setPushProgress] = useState<{ phase: string; message: string } | null>(null)
  const [pushResult, setPushResult] = useState<any>(null)
  const [error, setError] = useState('')

  const sseAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    loadInitial()
    return () => sseAbortRef.current?.abort()
  }, [])

  async function loadInitial() {
    try {
      const r = await api.get('/api/github/connection')
      setConnection(r.data)
      if (r.data) {
        setOwner(r.data.githubUsername)
        // Cargar repos en paralelo (silencioso si falla)
        Promise.all([
          api.get('/api/github/repos').then(r => setExistingRepos(r.data || [])).catch(() => {}),
          api.get('/api/github/list-user-orgs').then(r => setOrgs(r.data || [])).catch(() => {}),
        ])
      }
    } catch {} finally {
      setLoadingConn(false)
    }
  }

  async function submit() {
    setError('')
    setPushing(true)
    setPushProgress({ phase: 'starting', message: 'Iniciando...' })

    try {
      const body: any = {
        commitMessage: commitMessage.trim() || `chore: sync from Achilltest`,
        includeWorkflow,
      }

      if (mode === 'existing') {
        if (!selectedExistingId) { throw new Error('Selecciona un repo') }
        body.useExistingRepo = selectedExistingId
      } else {
        if (!repoName.trim()) { throw new Error('Nombre del repo requerido') }
        if (!/^[a-zA-Z0-9._-]+$/.test(repoName)) {
          throw new Error('Nombre solo admite letras, números, ., -, _')
        }
        body.repoName = repoName.trim()
        body.description = description.trim()
        body.isPrivate = isPrivate
        if (owner && owner !== connection?.githubUsername) {
          body.org = owner
        }
      }

      // Endpoint para suite o workspace
      const endpoint = sourceType === 'suite'
        ? `/api/github/suites/${sourceId}/push`
        : null

      if (!endpoint) {
        // workspace push: usa /repos + /repos/:id/push manualmente
        throw new Error('Workspace push aún no implementado en este flujo')
      }

      const r = await api.post(endpoint, body)
      setPushId(r.data.pushId)
      openStream(r.data.pushId)

    } catch (err: any) {
      setError(err.message)
      setPushing(false)
      setPushProgress(null)
    }
  }

  async function openStream(id: string) {
    sseAbortRef.current?.abort()
    const ctrl = new AbortController()
    sseAbortRef.current = ctrl

    const token = localStorage.getItem('token')
    if (!token) return

    try {
      const res = await fetch(`/api/github/pushes/${id}/stream`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: ctrl.signal,
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
          let event = 'message'; let data = ''
          for (const line of lines) {
            if (line.startsWith('event: ')) event = line.slice(7).trim()
            else if (line.startsWith('data: ')) data += line.slice(6)
          }
          if (data) handleEvent(event, data, id)
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') console.warn(err)
    }
  }

  async function handleEvent(event: string, dataStr: string, pushId: string) {
    let payload: any
    try { payload = JSON.parse(dataStr) } catch { return }
    switch (event) {
      case 'status':
        setPushProgress({ phase: payload.phase, message: payload.message })
        break
      case 'progress':
        setPushProgress(p => ({
          phase: p?.phase || 'blobs',
          message: `Subiendo archivos... ${payload.completed}/${payload.total}`,
        }))
        break
      case 'completed':
        setPushResult(payload)
        setPushing(false)
        setPushProgress(null)
        break
      case 'error':
        setError(payload.message)
        setPushing(false)
        setPushProgress(null)
        break
    }
  }

  if (loadingConn) return (
    <ModalShell onClose={onClose}>
      <div style={{ padding: '2rem', textAlign: 'center', color: '#7070a0' }}>Cargando...</div>
    </ModalShell>
  )

  // ── No hay conexión ───────────────────────────────────────────────────────
  if (!connection) {
    return (
      <ModalShell onClose={onClose}>
        <div style={{ padding: '1.5rem', textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '.5rem' }}>🔗</div>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#f0f0fc', marginBottom: '.5rem' }}>
            Conecta GitHub primero
          </h3>
          <p style={{ color: '#7070a0', fontSize: '.875rem', marginBottom: '1.5rem' }}>
            Para crear repos desde Achilltest, primero necesitas conectar tu cuenta de GitHub.
          </p>
          <button
            onClick={() => router.push('/github/connect?returnTo=' + encodeURIComponent(window.location.pathname))}
            style={{
              background: '#24292e', color: '#fff', border: 'none',
              padding: '.625rem 1rem', borderRadius: 8,
              fontSize: '.875rem', fontWeight: 600, cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <span style={{ display: 'inline-flex', gap: '.5rem', alignItems: 'center' }}>
              <GithubIcon size={16}/>
              Conectar con GitHub
            </span>
          </button>
        </div>
      </ModalShell>
    )
  }

  // ── Result state ──────────────────────────────────────────────────────────
  if (pushResult) {
    return (
      <ModalShell onClose={onClose}>
        <div style={{ padding: '1.5rem', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '.5rem' }}>🎉</div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#22c55e', marginBottom: '.5rem' }}>
            ¡Push exitoso!
          </h3>
          <p style={{ color: '#7070a0', fontSize: '.875rem', marginBottom: '1.25rem' }}>
            {pushResult.filesCount} archivos en commit{' '}
            <code style={{ color: '#a3e635', fontSize: '.75rem' }}>{pushResult.commitSha?.slice(0, 7)}</code>
          </p>
          <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'center' }}>
            <a href={pushResult.commitUrl} target="_blank" rel="noopener" style={{
              background: '#24292e', color: '#fff', textDecoration: 'none',
              padding: '.5rem 1rem', borderRadius: 8, fontSize: '.8125rem', fontWeight: 600,
              display: 'inline-flex', gap: '.375rem', alignItems: 'center',
            }}>
              <GithubIcon size={14}/> Ver commit en GitHub
            </a>
            <button onClick={onClose} style={{
              background: 'transparent', color: '#c4c4d8',
              border: '1px solid rgba(255,255,255,.12)', borderRadius: 8,
              padding: '.5rem 1rem', fontSize: '.8125rem', fontWeight: 500,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>Cerrar</button>
          </div>
        </div>
      </ModalShell>
    )
  }

  // ── Push in progress ──────────────────────────────────────────────────────
  if (pushing) {
    const phases = [
      { key: 'starting',  label: 'Iniciando' },
      { key: 'auth',      label: 'Autenticando' },
      { key: 'fetching',  label: 'Leyendo branch' },
      { key: 'blobs',     label: 'Subiendo archivos' },
      { key: 'tree',      label: 'Construyendo árbol' },
      { key: 'commit',    label: 'Creando commit' },
      { key: 'pushing',   label: 'Actualizando branch' },
    ]
    const currentIdx = phases.findIndex(p => p.key === pushProgress?.phase)
    const pct = currentIdx >= 0 ? ((currentIdx + 1) / phases.length) * 100 : 5

    return (
      <ModalShell onClose={() => {}}>
        <div style={{ padding: '2rem 1.5rem', textAlign: 'center' }}>
          <div style={{
            width: 56, height: 56, margin: '0 auto 1rem',
            border: '4px solid rgba(36,41,46,.3)',
            borderTopColor: '#24292e',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }}/>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

          <h3 style={{ fontSize: '1rem', color: '#f0f0fc', marginBottom: '.25rem' }}>
            {pushProgress?.message || 'Pusheando...'}
          </h3>
          <div style={{ fontSize: '.8125rem', color: '#7070a0', marginBottom: '1.25rem' }}>
            Esto suele tardar 5-15 segundos
          </div>

          <div style={{ maxWidth: 400, margin: '0 auto' }}>
            <div style={{ height: 5, background: '#141422', borderRadius: 3, overflow: 'hidden', marginBottom: '.875rem' }}>
              <div style={{
                height: '100%', width: `${pct}%`,
                background: 'linear-gradient(90deg, #24292e, #84cc16)',
                transition: 'width .5s',
              }}/>
            </div>
            <div style={{ display: 'flex', gap: '.25rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              {phases.map((p, i) => {
                const isDone = i < currentIdx
                const isCurrent = i === currentIdx
                return (
                  <span key={p.key} style={{
                    fontSize: '.65rem',
                    padding: '.1875rem .4375rem', borderRadius: 4,
                    background: isCurrent ? 'rgba(36,41,46,.6)' : isDone ? 'rgba(34,197,94,.1)' : 'rgba(255,255,255,.03)',
                    color: isCurrent ? '#f0f0fc' : isDone ? '#22c55e' : '#5a5a7a',
                    fontWeight: isCurrent ? 600 : 500,
                  }}>
                    {isDone ? '✓' : isCurrent ? '⋯' : '○'} {p.label}
                  </span>
                )
              })}
            </div>
          </div>
        </div>
      </ModalShell>
    )
  }

  // ── Form state ────────────────────────────────────────────────────────────
  const reposWithSource = existingRepos.filter(r =>
    r.sourceType === sourceType && r.sourceId === sourceId
  )
  const otherRepos = existingRepos.filter(r => !(r.sourceType === sourceType && r.sourceId === sourceId))

  return (
    <ModalShell onClose={onClose}>
      <div style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.5rem' }}>
          <GithubIcon size={20}/>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#f0f0fc' }}>
            Push a GitHub
          </h3>
        </div>
        <div style={{
          display: 'flex', gap: '.375rem', alignItems: 'center',
          fontSize: '.75rem', color: '#7070a0', marginBottom: '1.25rem',
        }}>
          Conectado como
          <img src={connection.avatarUrl} alt="" style={{ width: 18, height: 18, borderRadius: '50%' }}/>
          <strong style={{ color: '#c4a8ff' }}>{connection.githubUsername}</strong>
        </div>

        {/* Toggle */}
        <div style={{
          display: 'flex', gap: '.25rem',
          background: '#141422', padding: '.25rem', borderRadius: 8,
          marginBottom: '1rem',
        }}>
          <ToggleBtn current={mode} value="new" label="✨ Crear nuevo repo" onClick={() => setMode('new')}/>
          {existingRepos.length > 0 && (
            <ToggleBtn current={mode} value="existing" label={`📦 Repo conectado (${existingRepos.length})`}
              onClick={() => setMode('existing')}/>
          )}
        </div>

        {mode === 'new' && (
          <>
            <Field label="Owner (cuenta o organización)">
              <select value={owner} onChange={e => setOwner(e.target.value)} style={inputStyle}>
                <option value={connection.githubUsername}>
                  👤 {connection.githubUsername} (personal)
                </option>
                {orgs.map(o => (
                  <option key={o.id} value={o.login}>🏢 {o.login} (organización)</option>
                ))}
              </select>
            </Field>

            <Field label="Nombre del repo">
              <input value={repoName} onChange={e => setRepoName(e.target.value)}
                placeholder="mis-tests" style={inputStyle} autoFocus/>
              <div style={{ fontSize: '.7rem', color: '#7070a0', marginTop: '.25rem' }}>
                Se creará como <code style={inlineCodeStyle}>{owner}/{repoName || '...'}</code>
              </div>
            </Field>

            <Field label="Descripción (opcional)">
              <input value={description} onChange={e => setDescription(e.target.value)}
                style={inputStyle}/>
            </Field>

            <div style={{ display: 'flex', gap: '.5rem', marginBottom: '.75rem' }}>
              <RadioCard
                checked={isPrivate}
                onClick={() => setIsPrivate(true)}
                icon="🔒"
                title="Privado"
                desc="Solo tú y colaboradores"
              />
              <RadioCard
                checked={!isPrivate}
                onClick={() => setIsPrivate(false)}
                icon="🌐"
                title="Público"
                desc="Visible para todos"
              />
            </div>

            <ToggleOption
              checked={includeWorkflow}
              onChange={setIncludeWorkflow}
              label="Incluir GitHub Actions workflow"
              desc="Corre los tests automáticamente en cada push/PR"
            />
          </>
        )}

        {mode === 'existing' && (
          <>
            {reposWithSource.length > 0 && (
              <>
                <div style={subLabelStyle}>🎯 Vinculados a esta source</div>
                <div style={{ display: 'grid', gap: '.375rem', marginBottom: '.875rem' }}>
                  {reposWithSource.map(r => (
                    <RepoOption key={r.id} repo={r}
                      selected={selectedExistingId === r.id}
                      onClick={() => setSelectedExistingId(r.id)}/>
                  ))}
                </div>
              </>
            )}
            {otherRepos.length > 0 && (
              <>
                <div style={subLabelStyle}>Otros repos conectados</div>
                <div style={{ display: 'grid', gap: '.375rem', marginBottom: '.875rem', maxHeight: 240, overflowY: 'auto' }}>
                  {otherRepos.map(r => (
                    <RepoOption key={r.id} repo={r}
                      selected={selectedExistingId === r.id}
                      onClick={() => setSelectedExistingId(r.id)}/>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        <Field label="Mensaje del commit">
          <input value={commitMessage} onChange={e => setCommitMessage(e.target.value)}
            placeholder="chore: sync tests from Achilltest" style={inputStyle}/>
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
          <button onClick={submit} style={{
            ...btnPrimaryStyle, flex: 1,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '.5rem',
          }}>
            <GithubIcon size={14}/>
            {mode === 'new' ? 'Crear repo y pushear' : 'Pushear al repo'}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

// ── Sub-componentes ──

function ModalShell({ children, onClose }: any) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100, padding: '1rem',
    }} onClick={onClose}>
      <div style={{
        background: '#0e0e1a', border: '1px solid rgba(255,255,255,.1)',
        borderRadius: 14,
        width: '100%', maxWidth: 520,
        maxHeight: '90vh', overflowY: 'auto',
      }} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

function ToggleBtn({ current, value, label, onClick }: any) {
  const active = current === value
  return (
    <button onClick={onClick} style={{
      flex: 1,
      background: active ? 'rgba(36,41,46,.6)' : 'transparent',
      border: 'none', cursor: 'pointer',
      padding: '.4375rem',
      fontSize: '.75rem', fontWeight: active ? 600 : 500,
      color: active ? '#f0f0fc' : '#7070a0',
      borderRadius: 6, fontFamily: 'inherit',
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

function RadioCard({ checked, onClick, icon, title, desc }: any) {
  return (
    <button onClick={onClick} style={{
      flex: 1,
      background: checked ? 'rgba(36,41,46,.5)' : '#141422',
      border: `1px solid ${checked ? '#7070a0' : 'rgba(255,255,255,.07)'}`,
      borderRadius: 8, padding: '.625rem .75rem',
      cursor: 'pointer', fontFamily: 'inherit',
      textAlign: 'left',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.375rem', marginBottom: '.125rem' }}>
        <span>{icon}</span>
        <span style={{ fontSize: '.8125rem', fontWeight: 600, color: '#f0f0fc' }}>{title}</span>
      </div>
      <div style={{ fontSize: '.7rem', color: '#7070a0' }}>{desc}</div>
    </button>
  )
}

function ToggleOption({ checked, onChange, label, desc }: any) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: '.5rem',
      padding: '.5rem .75rem', marginBottom: '.75rem',
      background: '#141422', borderRadius: 8,
      border: `1px solid ${checked ? 'rgba(132,204,22,.25)' : 'rgba(255,255,255,.04)'}`,
      cursor: 'pointer',
    }} onClick={() => onChange(!checked)}>
      <input type="checkbox" checked={checked} onChange={() => onChange(!checked)}
        style={{ marginTop: 2, cursor: 'pointer' }}/>
      <div>
        <div style={{ fontSize: '.8125rem', color: '#f0f0fc', fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: '.7rem', color: '#7070a0', marginTop: '.125rem' }}>{desc}</div>
      </div>
    </div>
  )
}

function RepoOption({ repo, selected, onClick }: { repo: ExistingRepo; selected: boolean; onClick: () => void }) {
  return (
    <div onClick={onClick} style={{
      padding: '.625rem .75rem',
      background: selected ? 'rgba(36,41,46,.6)' : '#141422',
      border: `1px solid ${selected ? '#7070a0' : 'rgba(255,255,255,.05)'}`,
      borderRadius: 8, cursor: 'pointer',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '.5rem',
        fontFamily: 'JetBrains Mono, monospace', fontSize: '.8125rem',
      }}>
        <GithubIcon size={14}/>
        <span style={{ color: '#f0f0fc' }}>{repo.fullName}</span>
      </div>
      {selected && <span style={{ color: '#22c55e' }}>✓</span>}
    </div>
  )
}

// ── Helpers ──

function _slugify(s: string): string {
  return String(s)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80) || 'achilltest-tests'
}

const inputStyle: React.CSSProperties = {
  width: '100%', background: '#141422',
  border: '1px solid rgba(255,255,255,.1)', borderRadius: 8,
  padding: '.5rem .75rem', color: '#f0f0fc',
  fontSize: '.875rem', outline: 'none', fontFamily: 'inherit',
}
const inlineCodeStyle: React.CSSProperties = {
  background: '#08080f', padding: '.0625rem .25rem', borderRadius: 3,
  fontFamily: 'JetBrains Mono, monospace', fontSize: '.65rem',
  color: '#a3e635',
}
const subLabelStyle: React.CSSProperties = {
  fontSize: '.7rem', color: '#7070a0', fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: '.04em',
  marginBottom: '.375rem', marginTop: '.5rem',
}
const btnPrimaryStyle: React.CSSProperties = {
  background: '#24292e', color: '#fff', border: 'none', borderRadius: 8,
  padding: '.625rem 1rem', fontSize: '.875rem', fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit',
}
const btnGhostStyle: React.CSSProperties = {
  background: 'transparent', border: '1px solid rgba(255,255,255,.1)',
  color: '#7070a0', borderRadius: 8,
  padding: '.625rem 1rem', fontSize: '.8125rem',
  cursor: 'pointer', fontFamily: 'inherit',
}
