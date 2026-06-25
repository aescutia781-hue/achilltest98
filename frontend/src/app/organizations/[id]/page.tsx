'use client'

import { useEffect, useState }  from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth }              from '@/hooks/useAuth'
import { api, logout }          from '@/lib/api'

interface OrgDetail {
  id:              string
  name:            string
  slug:            string
  description:     string | null
  avatarUrl:       string | null
  plan:            string
  isPersonal:      boolean
  ownerId:         string
  members:         Member[]
  memberCount:     number
  currentUserRole: 'owner' | 'manager' | 'qa'
  limits:          { maxMembers: number }
  createdAt:       string
}

interface Member {
  id:           string
  userId:       string
  user:         { id: string; email: string; name: string }
  role:         'owner' | 'manager' | 'qa'
  joinedAt:     string
  lastActiveAt: string | null
}

type Tab = 'members' | 'invites' | 'settings'

export default function OrganizationDetailPage() {
  const router = useRouter()
  const params = useParams()
  const orgId  = params.id as string
  const { user, loading } = useAuth(true)

  const [org, setOrg]           = useState<OrgDetail | null>(null)
  const [loadingData, setLoadingData] = useState(true)
  const [tab, setTab]           = useState<Tab>('members')
  const [error, setError]       = useState('')

  useEffect(() => {
    if (!user) return
    load()
  }, [user, orgId])

  async function load() {
    try {
      const r = await api.get(`/api/organizations/${orgId}`)
      setOrg(r.data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoadingData(false)
    }
  }

  if (loading || loadingData) return <Loading/>
  if (!user) return null
  if (!org) return <Loading text="Organización no encontrada"/>

  const canManage = org.currentUserRole === 'owner' || org.currentUserRole === 'manager'
  const isOwner   = org.currentUserRole === 'owner'

  return (
    <div style={{ minHeight: '100vh', background: '#08080f', color: '#c4c4d8', fontFamily: 'Inter,system-ui,sans-serif' }}>
      <Nav user={user}/>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '2rem 1.5rem' }}>
        <a href="/dashboard" style={{ color: '#7070a0', fontSize: '.8125rem', textDecoration: 'none' }}>
          ← Dashboard
        </a>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '1rem',
          marginTop: '.5rem', marginBottom: '1.5rem',
        }}>
          <Avatar text={org.name.charAt(0).toUpperCase()} url={org.avatarUrl}/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{
              fontSize: '1.5rem', fontWeight: 700, color: '#f0f0fc',
              marginBottom: '.25rem',
            }}>
              {org.name}
            </h1>
            <div style={{ display: 'flex', gap: '.375rem', flexWrap: 'wrap' }}>
              <Chip color="#c4a8ff">Plan {org.plan}</Chip>
              {org.isPersonal && <Chip color="#26b5aa">🏠 Personal workspace</Chip>}
              <Chip>{org.memberCount} miembro{org.memberCount !== 1 ? 's' : ''}</Chip>
              <Chip color={
                org.currentUserRole === 'owner' ? '#fbbf24' :
                org.currentUserRole === 'manager' ? '#26b5aa' : '#7070a0'
              }>
                Tú: {org.currentUserRole}
              </Chip>
            </div>
            {org.description && (
              <p style={{ color: '#7070a0', fontSize: '.875rem', marginTop: '.5rem' }}>
                {org.description}
              </p>
            )}
          </div>
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
          <TabBtn current={tab} value="members" label={`👥 Miembros (${org.memberCount})`} onClick={() => setTab('members')}/>
          {!org.isPersonal && canManage && (
            <TabBtn current={tab} value="invites" label="🔗 Invitaciones" onClick={() => setTab('invites')}/>
          )}
          {canManage && (
            <TabBtn current={tab} value="settings" label="⚙️ Settings" onClick={() => setTab('settings')}/>
          )}
        </div>

        {tab === 'members' && (
          <MembersTab org={org} canManage={canManage} isOwner={isOwner} onChanged={load}/>
        )}
        {tab === 'invites' && canManage && (
          <InvitesTab org={org} onChanged={load}/>
        )}
        {tab === 'settings' && canManage && (
          <SettingsTab org={org} isOwner={isOwner} onChanged={load}/>
        )}
      </div>
    </div>
  )
}

// ── Members Tab ─────────────────────────────────────────────────────────────

function MembersTab({ org, canManage, isOwner, onChanged }: any) {
  const [updating, setUpdating] = useState('')

  async function changeRole(userId: string, newRole: string) {
    setUpdating(userId)
    try {
      await api.put(`/api/organizations/${org.id}/members/${userId}`, { role: newRole })
      onChanged()
    } catch (err: any) {
      alert(err.message)
    } finally {
      setUpdating('')
    }
  }

  async function removeMember(userId: string, name: string) {
    if (!confirm(`¿Quitar a ${name} de la organización?`)) return
    setUpdating(userId)
    try {
      await api.delete(`/api/organizations/${org.id}/members/${userId}`)
      onChanged()
    } catch (err: any) {
      alert(err.message)
    } finally {
      setUpdating('')
    }
  }

  async function transferOwnership(toUserId: string, toName: string) {
    if (!confirm(`¿Transferir ownership a ${toName}? Tú pasarás a ser manager.`)) return
    setUpdating(toUserId)
    try {
      await api.post(`/api/organizations/${org.id}/transfer-ownership`, { newOwnerId: toUserId })
      onChanged()
    } catch (err: any) {
      alert(err.message)
    } finally {
      setUpdating('')
    }
  }

  return (
    <div style={{ display: 'grid', gap: '.5rem' }}>
      {org.members.map((m: Member) => (
        <div key={m.id} style={{
          background: '#0e0e1a',
          border: '1px solid rgba(255,255,255,.07)',
          borderRadius: 10, padding: '.75rem 1rem',
          display: 'flex', alignItems: 'center', gap: '.75rem',
        }}>
          <Avatar small text={(m.user?.name || m.user?.email || '?').charAt(0).toUpperCase()}/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: '.875rem', color: '#f0f0fc', fontWeight: 600,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {m.user?.name || m.user?.email || 'Usuario'}
            </div>
            <div style={{ fontSize: '.7rem', color: '#7070a0' }}>
              {m.user?.email} · Se unió {new Date(m.joinedAt).toLocaleDateString('es-MX')}
            </div>
          </div>

          {canManage && m.role !== 'owner' && isOwner && !org.isPersonal ? (
            <select
              value={m.role}
              disabled={updating === m.userId}
              onChange={(e) => changeRole(m.userId, e.target.value)}
              style={{
                background: '#141422',
                border: '1px solid rgba(255,255,255,.1)',
                borderRadius: 6, padding: '.3125rem .5rem',
                color: '#f0f0fc', fontSize: '.75rem',
                fontFamily: 'inherit', cursor: 'pointer',
              }}
            >
              <option value="qa">QA</option>
              <option value="manager">Manager</option>
            </select>
          ) : (
            <RoleBadge role={m.role}/>
          )}

          {canManage && m.role !== 'owner' && !org.isPersonal && (
            <button
              onClick={() => removeMember(m.userId, m.user?.name || m.user?.email)}
              disabled={updating === m.userId}
              style={{
                background: 'transparent',
                border: '1px solid rgba(239,68,68,.2)',
                color: '#f87171',
                borderRadius: 6, padding: '.3125rem .5rem',
                fontSize: '.7rem', cursor: 'pointer', fontFamily: 'inherit',
              }}
            >Quitar</button>
          )}

          {isOwner && m.role !== 'owner' && !org.isPersonal && (
            <button
              onClick={() => transferOwnership(m.userId, m.user?.name || m.user?.email)}
              disabled={updating === m.userId}
              title="Transferir ownership"
              style={{
                background: 'transparent',
                border: '1px solid rgba(251,191,36,.25)',
                color: '#fbbf24',
                borderRadius: 6, padding: '.3125rem .5rem',
                fontSize: '.7rem', cursor: 'pointer', fontFamily: 'inherit',
              }}
            >👑 Transferir</button>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Invites Tab ─────────────────────────────────────────────────────────────

function InvitesTab({ org, onChanged }: any) {
  const [invites, setInvites] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const r = await api.get(`/api/organizations/${org.id}/invites`)
      setInvites(r.data || [])
    } catch {}
    setLoading(false)
  }

  async function revoke(id: string) {
    if (!confirm('¿Revocar este invite? El link dejará de funcionar.')) return
    try {
      await api.delete(`/api/organizations/${org.id}/invites/${id}`)
      load()
    } catch (err: any) {
      alert(err.message)
    }
  }

  if (loading) return <div style={{ padding: '1rem', color: '#7070a0' }}>Cargando...</div>

  return (
    <div>
      <div style={{
        background: 'rgba(38,181,170,.06)',
        border: '1px solid rgba(38,181,170,.15)',
        borderRadius: 10, padding: '.75rem 1rem', marginBottom: '1rem',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <div style={{ fontSize: '.8125rem', color: '#26b5aa', fontWeight: 600 }}>
            🔗 Invitaciones por link compartible
          </div>
          <div style={{ fontSize: '.7rem', color: '#7070a0', marginTop: '.125rem' }}>
            Crea un link y compártelo por WhatsApp, Slack, email o donde quieras
          </div>
        </div>
        <button onClick={() => setShowCreate(true)} style={btnPrimaryStyle}>
          + Nuevo invite
        </button>
      </div>

      {invites.length === 0 ? (
        <div style={{
          padding: '2rem', textAlign: 'center',
          background: '#0e0e1a', border: '1px dashed rgba(255,255,255,.1)',
          borderRadius: 10, color: '#7070a0', fontSize: '.875rem',
        }}>
          Sin invites activos. Crea uno para invitar a tu equipo.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '.5rem' }}>
          {invites.map(i => <InviteCard key={i.id} invite={i} onRevoke={() => revoke(i.id)}/>)}
        </div>
      )}

      {showCreate && (
        <CreateInviteModal
          orgId={org.id}
          maxMembers={org.limits.maxMembers}
          currentCount={org.memberCount}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load() }}
        />
      )}
    </div>
  )
}

function InviteCard({ invite, onRevoke }: any) {
  const [copied, setCopied] = useState(false)

  function copy() {
    navigator.clipboard.writeText(invite.shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div style={{
      background: invite.isAlive ? '#0e0e1a' : 'rgba(239,68,68,.04)',
      border: `1px solid ${invite.isAlive ? 'rgba(255,255,255,.07)' : 'rgba(239,68,68,.2)'}`,
      borderRadius: 10, padding: '.75rem 1rem',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.5rem' }}>
        <div style={{ display: 'flex', gap: '.375rem', flexWrap: 'wrap' }}>
          <RoleBadge role={invite.role}/>
          {invite.isAlive ? (
            <Chip color="#22c55e">● Activo</Chip>
          ) : (
            <Chip color="#f87171">● Inactivo</Chip>
          )}
          {invite.maxUses && (
            <Chip>{invite.usesCount}/{invite.maxUses} usos</Chip>
          )}
          {!invite.maxUses && (
            <Chip>{invite.usesCount} usos</Chip>
          )}
          {invite.expiresAt && (
            <Chip>Expira {new Date(invite.expiresAt).toLocaleDateString('es-MX')}</Chip>
          )}
        </div>
        <button onClick={onRevoke} disabled={invite.isRevoked} style={{
          background: 'transparent', border: '1px solid rgba(239,68,68,.2)',
          color: '#f87171', borderRadius: 6, padding: '.25rem .5rem',
          fontSize: '.7rem', cursor: invite.isRevoked ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit', opacity: invite.isRevoked ? .5 : 1,
        }}>
          {invite.isRevoked ? 'Revocado' : 'Revocar'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: '.375rem' }}>
        <input
          value={invite.shareUrl}
          readOnly
          onClick={(e: any) => e.target.select()}
          style={{
            flex: 1, background: '#141422',
            border: '1px solid rgba(255,255,255,.05)', borderRadius: 6,
            padding: '.375rem .625rem', color: '#a3e635',
            fontSize: '.7rem', outline: 'none',
            fontFamily: 'JetBrains Mono, monospace',
          }}
        />
        <button onClick={copy} style={{
          background: copied ? 'rgba(34,197,94,.2)' : 'rgba(38,181,170,.15)',
          border: 'none', borderRadius: 6,
          padding: '.375rem .625rem',
          color: copied ? '#22c55e' : '#26b5aa',
          cursor: 'pointer', fontSize: '.7rem', fontWeight: 600,
          fontFamily: 'inherit',
        }}>{copied ? '✓ Copiado' : '📋 Copiar'}</button>
      </div>
    </div>
  )
}

function CreateInviteModal({ orgId, maxMembers, currentCount, onClose, onCreated }: any) {
  const [role, setRole] = useState('qa')
  const [maxUses, setMaxUses] = useState('')
  const [expiresInDays, setExpiresInDays] = useState('7')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<any>(null)
  const [copied, setCopied] = useState(false)

  async function submit() {
    setError(''); setSaving(true)
    try {
      const r = await api.post(`/api/organizations/${orgId}/invites`, {
        role,
        maxUses:       maxUses ? parseInt(maxUses) : null,
        expiresInDays: expiresInDays === 'never' ? null : parseInt(expiresInDays),
      })
      setCreated(r.data)
    } catch (err: any) {
      setError(err.message); setSaving(false)
    }
  }

  function copyLink() {
    if (!created) return
    navigator.clipboard.writeText(created.shareUrl)
    setCopied(true); setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div style={modalOverlayStyle} onClick={onClose}>
      <div style={modalCardStyle} onClick={(e) => e.stopPropagation()}>
        {!created ? (
          <>
            <h3 style={modalTitleStyle}>🔗 Crear invite link</h3>
            <p style={{ fontSize: '.8125rem', color: '#7070a0', marginBottom: '1rem' }}>
              Cualquiera con este link podrá unirse a la org como el rol que elijas.
            </p>

            <div style={{
              background: 'rgba(38,181,170,.06)',
              border: '1px solid rgba(38,181,170,.15)',
              borderRadius: 8, padding: '.5rem .75rem', fontSize: '.7rem',
              color: '#7070a0', marginBottom: '1rem',
            }}>
              Miembros actuales: <strong style={{ color: '#26b5aa' }}>{currentCount} / {maxMembers === Infinity ? '∞' : maxMembers}</strong>
            </div>

            <Field label="Rol al unirse">
              <select value={role} onChange={(e) => setRole(e.target.value)} style={selectStyle}>
                <option value="qa">QA (acceso a tests, no admin)</option>
                <option value="manager">Manager (admin técnico, no billing)</option>
              </select>
            </Field>

            <Field label="Máximo de usos (opcional)">
              <input type="number" min="1" value={maxUses} onChange={(e) => setMaxUses(e.target.value)}
                placeholder="Sin límite" style={inputStyle}/>
            </Field>

            <Field label="Expiración">
              <select value={expiresInDays} onChange={(e) => setExpiresInDays(e.target.value)} style={selectStyle}>
                <option value="never">Nunca</option>
                <option value="1">1 día</option>
                <option value="7">7 días</option>
                <option value="30">30 días</option>
                <option value="90">90 días</option>
              </select>
            </Field>

            {error && <div style={errorBoxStyle}>{error}</div>}

            <div style={{ display: 'flex', gap: '.5rem' }}>
              <button onClick={onClose} style={btnGhostStyle}>Cancelar</button>
              <button onClick={submit} disabled={saving} style={{
                ...btnPrimaryStyle, flex: 1,
                opacity: saving ? .6 : 1,
              }}>
                {saving ? 'Creando...' : 'Crear invite'}
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 style={{ ...modalTitleStyle, color: '#22c55e' }}>✓ Invite creado</h3>
            <p style={{ fontSize: '.8125rem', color: '#7070a0', marginBottom: '1rem' }}>
              Compárte este link con quien quieras invitar.
            </p>

            <Field label="Link compartible">
              <div style={{ display: 'flex', gap: '.375rem' }}>
                <input
                  value={created.shareUrl}
                  readOnly
                  onClick={(e: any) => e.target.select()}
                  style={{
                    flex: 1, background: '#141422',
                    border: '1px solid rgba(38,181,170,.25)', borderRadius: 8,
                    padding: '.5rem .75rem', color: '#a3e635',
                    fontSize: '.75rem', outline: 'none',
                    fontFamily: 'JetBrains Mono, monospace',
                  }}
                />
                <button onClick={copyLink} style={{
                  background: copied ? 'rgba(34,197,94,.2)' : '#26b5aa',
                  color: copied ? '#22c55e' : '#fff',
                  border: 'none', borderRadius: 8,
                  padding: '.5rem .75rem',
                  cursor: 'pointer', fontSize: '.75rem', fontWeight: 600,
                  fontFamily: 'inherit',
                }}>{copied ? '✓ Copiado' : '📋 Copiar'}</button>
              </div>
            </Field>

            <button onClick={onCreated} style={{ ...btnPrimaryStyle, width: '100%' }}>
              Listo
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Settings Tab ────────────────────────────────────────────────────────────

function SettingsTab({ org, isOwner, onChanged }: any) {
  const router = useRouter()
  const [name, setName] = useState(org.name)
  const [description, setDescription] = useState(org.description || '')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      await api.put(`/api/organizations/${org.id}`, { name, description })
      onChanged()
      alert('Guardado')
    } catch (err: any) {
      alert(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteOrg() {
    if (!confirm(`¿Eliminar PERMANENTEMENTE la organización "${org.name}"?\n\nSe perderán todos los datos: suites, runs, reportes, conexiones GitHub, etc. Esta acción NO se puede deshacer.`)) return
    if (!confirm(`Confirma escribiendo otra vez. ¿Eliminar "${org.name}"?`)) return
    try {
      await api.delete(`/api/organizations/${org.id}`)
      router.push('/dashboard')
      setTimeout(() => location.reload(), 100)
    } catch (err: any) {
      alert(err.message)
    }
  }

  async function leaveOrg() {
    if (!confirm(`¿Salirte de "${org.name}"? Perderás acceso a los datos de esta org.`)) return
    try {
      await api.post(`/api/organizations/${org.id}/leave`, {})
      router.push('/dashboard')
      setTimeout(() => location.reload(), 100)
    } catch (err: any) {
      alert(err.message)
    }
  }

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div style={cardStyle}>
        <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#f0f0fc', marginBottom: '1rem' }}>
          Información general
        </h3>

        <Field label="Nombre">
          <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle}/>
        </Field>

        <Field label="Descripción">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)}
            rows={3} style={{ ...inputStyle, resize: 'vertical', minHeight: 80 }}/>
        </Field>

        <button onClick={save} disabled={saving} style={{
          ...btnPrimaryStyle, opacity: saving ? .6 : 1,
        }}>
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>

      {/* Danger zone */}
      <div style={{
        ...cardStyle,
        borderColor: 'rgba(239,68,68,.2)',
        background: 'rgba(239,68,68,.04)',
      }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#f87171', marginBottom: '.5rem' }}>
          ⚠️ Zona peligrosa
        </h3>

        {!org.isPersonal && !isOwner && (
          <div style={{
            padding: '.75rem 1rem',
            background: 'rgba(239,68,68,.04)',
            borderRadius: 8, marginBottom: '.75rem',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div>
              <div style={{ fontSize: '.875rem', color: '#f0f0fc' }}>Salirme de esta organización</div>
              <div style={{ fontSize: '.7rem', color: '#7070a0' }}>Perderás acceso a todos los recursos.</div>
            </div>
            <button onClick={leaveOrg} style={{
              background: 'transparent', color: '#f87171',
              border: '1px solid rgba(239,68,68,.3)', borderRadius: 8,
              padding: '.5rem .875rem', fontSize: '.75rem', fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>Salirme</button>
          </div>
        )}

        {isOwner && !org.isPersonal && (
          <div style={{
            padding: '.75rem 1rem',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div>
              <div style={{ fontSize: '.875rem', color: '#f0f0fc' }}>Eliminar organización</div>
              <div style={{ fontSize: '.7rem', color: '#7070a0' }}>Borra TODO permanentemente.</div>
            </div>
            <button onClick={deleteOrg} style={{
              background: 'transparent', color: '#f87171',
              border: '1px solid rgba(239,68,68,.4)', borderRadius: 8,
              padding: '.5rem .875rem', fontSize: '.75rem', fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>Eliminar org</button>
          </div>
        )}

        {org.isPersonal && (
          <div style={{ padding: '.75rem 1rem', fontSize: '.75rem', color: '#7070a0' }}>
            Los workspaces personales no se pueden eliminar — van con tu cuenta.
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sub-componentes ──

function Avatar({ text, url, small }: any) {
  const size = small ? 28 : 48
  if (url) {
    return <img src={url} alt="" style={{
      width: size, height: size, borderRadius: '50%',
      objectFit: 'cover', flexShrink: 0,
    }}/>
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: 'linear-gradient(135deg, #7c5cbf, #26b5aa)',
      color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: small ? '.8125rem' : '1.125rem', fontWeight: 700,
      flexShrink: 0,
    }}>{text}</div>
  )
}

function Chip({ children, color = '#7070a0' }: any) {
  return (
    <span style={{
      background: `${color}15`, color, padding: '.125rem .5rem',
      borderRadius: 4, fontSize: '.65rem', fontWeight: 600,
    }}>{children}</span>
  )
}

function RoleBadge({ role }: any) {
  const meta: Record<string, { bg: string; color: string; label: string; icon: string }> = {
    owner:   { bg: 'rgba(251,191,36,.15)', color: '#fbbf24', label: 'Owner',   icon: '👑' },
    manager: { bg: 'rgba(38,181,170,.15)', color: '#26b5aa', label: 'Manager', icon: '🛠' },
    qa:      { bg: 'rgba(196,168,255,.15)', color: '#c4a8ff', label: 'QA',      icon: '🧪' },
  }
  const m = meta[role] || meta.qa
  return (
    <span style={{
      background: m.bg, color: m.color,
      padding: '.1875rem .5rem', borderRadius: 6,
      fontSize: '.7rem', fontWeight: 600,
    }}>{m.icon} {m.label}</span>
  )
}

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

function Loading({ text }: { text?: string } = {}) {
  return <div style={{ minHeight: '100vh', background: '#08080f', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7070a0' }}>{text || 'Cargando...'}</div>
}

const cardStyle: React.CSSProperties = {
  background: '#0e0e1a', border: '1px solid rgba(255,255,255,.07)',
  borderRadius: 12, padding: '1.25rem',
}
const inputStyle: React.CSSProperties = {
  width: '100%', background: '#141422',
  border: '1px solid rgba(255,255,255,.1)', borderRadius: 8,
  padding: '.5rem .75rem', color: '#f0f0fc',
  fontSize: '.875rem', outline: 'none', fontFamily: 'inherit',
}
const selectStyle: React.CSSProperties = { ...inputStyle }
const btnPrimaryStyle: React.CSSProperties = {
  background: '#26b5aa', color: '#fff', border: 'none', borderRadius: 8,
  padding: '.5rem 1rem', fontSize: '.875rem', fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit',
}
const btnGhostStyle: React.CSSProperties = {
  background: 'transparent', border: '1px solid rgba(255,255,255,.1)',
  color: '#7070a0', borderRadius: 8,
  padding: '.5rem 1rem', fontSize: '.8125rem',
  cursor: 'pointer', fontFamily: 'inherit',
}
const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 100, padding: '1rem',
}
const modalCardStyle: React.CSSProperties = {
  background: '#0e0e1a', border: '1px solid rgba(255,255,255,.1)',
  borderRadius: 14, padding: '1.5rem',
  width: '100%', maxWidth: 480,
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
