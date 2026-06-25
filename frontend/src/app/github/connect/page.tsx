'use client'

import { useEffect, useState }       from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth }                   from '@/hooks/useAuth'
import GithubConnectButton,
       { GithubIcon }                from '@/components/GithubConnectButton'

export default function GithubConnectPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnTo = searchParams?.get('returnTo') || '/dashboard'
  const errorParam = searchParams?.get('error')

  const { user, loading } = useAuth(true)

  if (loading) return <Loading/>
  if (!user) return null

  return (
    <div style={{
      minHeight: '100vh', background: '#08080f', color: '#c4c4d8',
      fontFamily: 'Inter,system-ui,sans-serif',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1rem',
    }}>
      <div style={{
        background: '#0e0e1a',
        border: '1px solid rgba(255,255,255,.07)',
        borderRadius: 16, padding: '2.5rem 2rem',
        width: '100%', maxWidth: 520,
        textAlign: 'center',
      }}>
        <div style={{ marginBottom: '1rem' }}>
          <GithubIcon size={56}/>
        </div>
        <h1 style={{
          fontSize: '1.375rem', fontWeight: 700, color: '#f0f0fc',
          marginBottom: '.5rem',
        }}>
          Conecta tu cuenta de GitHub
        </h1>
        <p style={{
          color: '#7070a0', fontSize: '.875rem',
          marginBottom: '1.5rem', maxWidth: 400, margin: '0 auto 1.5rem',
        }}>
          Vas a ser redirigido a GitHub para autorizar a Achilltest. Solicitamos los siguientes
          permisos:
        </p>

        <div style={{
          textAlign: 'left', maxWidth: 400, margin: '0 auto 1.5rem',
          background: '#141422', borderRadius: 10, padding: '1rem',
          border: '1px solid rgba(255,255,255,.04)',
        }}>
          <PermissionRow icon="📦" title="repo"
            desc="Crear y modificar tus repos (incluye privados que tú elijas)"/>
          <PermissionRow icon="📧" title="user:email"
            desc="Leer tu email primario para mostrarlo en tu perfil"/>
        </div>

        <div style={{
          background: 'rgba(124,92,191,.06)',
          border: '1px solid rgba(124,92,191,.15)',
          borderRadius: 8, padding: '.75rem .875rem',
          fontSize: '.7rem', color: '#7070a0',
          marginBottom: '1.5rem', textAlign: 'left',
          maxWidth: 400, margin: '0 auto 1.5rem',
        }}>
          🔒 Tu access token se almacena cifrado con AES-256-GCM. Achilltest nunca expone tu token
          en la UI ni en logs. Puedes revocar el acceso en cualquier momento desde GitHub Settings.
        </div>

        {errorParam && (
          <div style={{
            background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)',
            borderRadius: 8, padding: '.625rem 1rem', fontSize: '.8125rem',
            color: '#f87171', marginBottom: '1rem',
          }}>
            ✗ {decodeURIComponent(errorParam)}
          </div>
        )}

        <GithubConnectButton returnTo={returnTo}/>

        <div style={{ marginTop: '1.25rem' }}>
          <button onClick={() => router.push(returnTo)} style={{
            background: 'transparent', border: 'none',
            color: '#7070a0', fontSize: '.75rem', cursor: 'pointer',
            textDecoration: 'underline', fontFamily: 'inherit',
          }}>
            Cancelar y volver
          </button>
        </div>
      </div>
    </div>
  )
}

function PermissionRow({ icon, title, desc }: any) {
  return (
    <div style={{ display: 'flex', gap: '.5rem', marginBottom: '.5rem' }}>
      <span style={{ fontSize: '1.125rem' }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <code style={{
          fontFamily: 'JetBrains Mono, monospace', fontSize: '.75rem',
          color: '#a3e635', background: '#08080f',
          padding: '.0625rem .25rem', borderRadius: 3,
        }}>{title}</code>
        <div style={{ fontSize: '.7rem', color: '#7070a0', marginTop: '.125rem' }}>
          {desc}
        </div>
      </div>
    </div>
  )
}

function Loading() {
  return <div style={{ minHeight: '100vh', background: '#08080f', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7070a0' }}>Cargando...</div>
}
