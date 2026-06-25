'use client'

import { useState } from 'react'
import { api }      from '@/lib/api'

interface Props {
  returnTo?: string
  variant?:  'default' | 'compact' | 'pill'
  text?:     string
}

export default function GithubConnectButton({ returnTo, variant = 'default', text }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function connect() {
    setLoading(true); setError('')
    try {
      const params = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''
      const r = await api.get(`/api/github/oauth/init${params}`)
      if (r.data?.authorizeUrl) {
        window.location.href = r.data.authorizeUrl
      } else {
        throw new Error('No se recibió URL de authorize')
      }
    } catch (err: any) {
      setError(err.message)
      setLoading(false)
    }
  }

  const baseStyle: React.CSSProperties = {
    background: '#24292e',
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
    default: { padding: '.625rem 1rem', borderRadius: 8, fontSize: '.875rem' },
    compact: { padding: '.375rem .75rem', borderRadius: 6, fontSize: '.75rem' },
    pill:    { padding: '.4375rem .875rem', borderRadius: 20, fontSize: '.8125rem' },
  }

  return (
    <>
      <button
        onClick={connect}
        disabled={loading}
        style={{ ...baseStyle, ...sizeStyles[variant] }}
        onMouseEnter={(e: any) => { if (!loading) e.currentTarget.style.background = '#3a3f44' }}
        onMouseLeave={(e: any) => { e.currentTarget.style.background = '#24292e' }}
      >
        <GithubIcon size={variant === 'compact' ? 14 : 16}/>
        {loading ? 'Redirigiendo...' : (text || 'Conectar con GitHub')}
      </button>
      {error && (
        <div style={{
          marginTop: '.5rem', fontSize: '.75rem', color: '#f87171',
          background: 'rgba(239,68,68,.1)', padding: '.375rem .625rem',
          borderRadius: 6, border: '1px solid rgba(239,68,68,.2)',
        }}>
          {error}
        </div>
      )}
    </>
  )
}

export function GithubIcon({ size = 16, color = 'currentColor' }: any) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill={color}>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
    </svg>
  )
}
