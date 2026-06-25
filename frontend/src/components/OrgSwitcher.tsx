'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter }                   from 'next/navigation'
import { api }                         from '@/lib/api'

interface Org {
  id:         string
  name:       string
  slug:       string
  avatarUrl:  string | null
  plan:       string
  isPersonal: boolean
  role:       'owner' | 'manager' | 'qa'
  isCurrent:  boolean
}

export default function OrgSwitcher() {
  const router = useRouter()
  const [orgs, setOrgs] = useState<Org[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => { load() }, [])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  async function load() {
    try {
      const r = await api.get('/api/organizations')
      setOrgs(r.data || [])
    } catch {}
    setLoading(false)
  }

  async function switchTo(id: string) {
    if (orgs.find(o => o.id === id)?.isCurrent) {
      setOpen(false); return
    }
    try {
      await api.post('/api/organizations/switch', { organizationId: id })
      // Hard reload para refrescar todo el contexto
      location.reload()
    } catch (err: any) {
      alert(err.message)
    }
  }

  if (loading) {
    return <div style={{ width: 180, height: 36 }}/>
  }

  const current = orgs.find(o => o.isCurrent) || orgs[0]
  if (!current) return null

  const initial = current.name.charAt(0).toUpperCase()

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(!open)} style={{
        background: '#141422',
        border: '1px solid rgba(255,255,255,.08)',
        borderRadius: 10,
        padding: '.4375rem .75rem',
        cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', gap: '.5rem',
        color: '#f0f0fc', fontFamily: 'inherit', fontSize: '.8125rem',
        maxWidth: 220, minWidth: 160,
      }}>
        <Avatar text={initial} url={current.avatarUrl} small/>
        <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
          <div style={{
            fontWeight: 600, fontSize: '.8125rem', lineHeight: 1.1,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{current.name}</div>
          <div style={{
            fontSize: '.65rem', color: '#7070a0',
            display: 'flex', gap: '.25rem',
          }}>
            <span>{current.role}</span>
            {current.isPersonal && <span style={{ color: '#c4a8ff' }}>· personal</span>}
          </div>
        </div>
        <span style={{ color: '#7070a0', fontSize: '.625rem' }}>▼</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 4,
          background: '#0e0e1a',
          border: '1px solid rgba(255,255,255,.1)',
          borderRadius: 12,
          padding: '.375rem',
          minWidth: 260,
          boxShadow: '0 8px 30px rgba(0,0,0,.5)',
          zIndex: 50,
        }}>
          <div style={{
            padding: '.375rem .625rem',
            fontSize: '.625rem', color: '#7070a0',
            textTransform: 'uppercase', letterSpacing: '.05em',
            fontWeight: 600,
          }}>
            Workspaces
          </div>

          {orgs.map(o => (
            <button
              key={o.id}
              onClick={() => switchTo(o.id)}
              style={{
                width: '100%',
                background: o.isCurrent ? 'rgba(38,181,170,.1)' : 'transparent',
                border: 'none', borderRadius: 8,
                padding: '.5rem .625rem',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '.5rem',
                fontFamily: 'inherit', textAlign: 'left',
                color: '#f0f0fc',
              }}
              onMouseEnter={(e: any) => {
                if (!o.isCurrent) e.currentTarget.style.background = 'rgba(255,255,255,.04)'
              }}
              onMouseLeave={(e: any) => {
                if (!o.isCurrent) e.currentTarget.style.background = 'transparent'
              }}
            >
              <Avatar text={o.name.charAt(0).toUpperCase()} url={o.avatarUrl} small/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: '.8125rem', fontWeight: 500,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{o.name}</div>
                <div style={{ fontSize: '.65rem', color: '#7070a0' }}>
                  {o.role}{o.isPersonal ? ' · personal' : ''} · {o.plan}
                </div>
              </div>
              {o.isCurrent && <span style={{ color: '#26b5aa', fontSize: '.8125rem' }}>✓</span>}
            </button>
          ))}

          <div style={{
            height: 1, background: 'rgba(255,255,255,.07)',
            margin: '.25rem 0',
          }}/>

          <button onClick={() => { setOpen(false); router.push('/organizations/new') }} style={{
            width: '100%',
            background: 'transparent', border: 'none', borderRadius: 8,
            padding: '.5rem .625rem',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '.5rem',
            fontFamily: 'inherit', textAlign: 'left',
            color: '#26b5aa', fontSize: '.8125rem', fontWeight: 500,
          }}
            onMouseEnter={(e: any) => e.currentTarget.style.background = 'rgba(38,181,170,.06)'}
            onMouseLeave={(e: any) => e.currentTarget.style.background = 'transparent'}
          >
            <span style={{ fontSize: '.875rem' }}>+</span>
            <span>Crear nueva organización</span>
          </button>

          {current && !current.isPersonal && (
            <button onClick={() => { setOpen(false); router.push(`/organizations/${current.id}`) }} style={{
              width: '100%',
              background: 'transparent', border: 'none', borderRadius: 8,
              padding: '.5rem .625rem',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '.5rem',
              fontFamily: 'inherit', textAlign: 'left',
              color: '#7070a0', fontSize: '.75rem',
            }}
              onMouseEnter={(e: any) => e.currentTarget.style.background = 'rgba(255,255,255,.04)'}
              onMouseLeave={(e: any) => e.currentTarget.style.background = 'transparent'}
            >
              <span>⚙</span>
              <span>Gestionar "{current.name}"</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function Avatar({ text, url, small }: { text: string; url?: string | null; small?: boolean }) {
  const size = small ? 26 : 36
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
      fontSize: small ? '.75rem' : '.875rem', fontWeight: 700,
      flexShrink: 0,
    }}>{text}</div>
  )
}
