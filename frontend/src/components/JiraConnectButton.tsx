'use client'

import { useState } from 'react'
import { api }      from '@/lib/api'

interface Props {
  returnTo?: string
  variant?:  'primary' | 'compact'
}

export default function JiraConnectButton({ returnTo, variant = 'primary' }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function connectOAuth() {
    setLoading(true); setError('')
    try {
      const params = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''
      const r = await api.get(`/api/jira/oauth/init${params}`)
      if (r.data?.authorizeUrl) {
        window.location.href = r.data.authorizeUrl
      } else {
        throw new Error('No se recibió URL de authorize')
      }
    } catch (err: any) {
      setError(err.message); setLoading(false)
    }
  }

  const baseStyle: React.CSSProperties = {
    background: '#0052cc',
    color: '#fff',
    border: 'none',
    cursor: loading ? 'wait' : 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '.5rem',
    fontFamily: 'inherit',
    fontWeight: 600,
    transition: 'background .15s',
    opacity: loading ? .7 : 1,
  }
  const sizeStyles: Record<string, React.CSSProperties> = {
    primary: { padding: '.625rem 1rem', borderRadius: 8, fontSize: '.875rem' },
    compact: { padding: '.375rem .75rem', borderRadius: 6, fontSize: '.75rem' },
  }

  return (
    <>
      <button
        onClick={connectOAuth}
        disabled={loading}
        style={{ ...baseStyle, ...sizeStyles[variant] }}
        onMouseEnter={(e: any) => { if (!loading) e.currentTarget.style.background = '#0747a6' }}
        onMouseLeave={(e: any) => e.currentTarget.style.background = '#0052cc'}
      >
        <JiraIcon size={variant === 'compact' ? 14 : 16}/>
        {loading ? 'Redirigiendo...' : 'Conectar con Jira'}
      </button>
      {error && (
        <div style={{
          marginTop: '.5rem', fontSize: '.75rem', color: '#f87171',
          background: 'rgba(239,68,68,.1)', padding: '.375rem .625rem',
          borderRadius: 6, border: '1px solid rgba(239,68,68,.2)',
        }}>{error}</div>
      )}
    </>
  )
}

export function JiraIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="currentColor">
      <path d="M30.471 15.067L17.039 1.594 15.717.272a1.005 1.005 0 0 0-1.422 0L1.55 13.022a.946.946 0 0 0 .003 1.338l.668.669 12.069 12.075a.95.95 0 0 0 1.338-.003l13.184-13.197a.943.943 0 0 0 .003-1.335zM15.997 19.4l-3.405-3.405 3.405-3.408 3.408 3.405zM7.31 16l-3.41-3.408L7.31 9.184l3.408 3.408zm17.376 0l-3.408-3.408 3.408-3.408 3.408 3.408zM15.997 24.687l-3.408-3.405 3.408-3.408 3.408 3.408z"/>
    </svg>
  )
}
