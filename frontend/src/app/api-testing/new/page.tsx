'use client'

import { useState, useRef }      from 'react'
import { useRouter }             from 'next/navigation'
import { useAuth }               from '@/hooks/useAuth'
import { api, logout }           from '@/lib/api'

export default function NewApiCollectionPage() {
  const router = useRouter()
  const { user, loading } = useAuth(true)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [name,         setName]         = useState('')
  const [description,  setDescription]  = useState('')
  const [contractType, setContractType] = useState<'openapi' | 'postman'>('openapi')
  const [contractText, setContractText] = useState('')
  const [baseUrl,      setBaseUrl]      = useState('')
  const [fileName,     setFileName]     = useState('')
  const [parsing,      setParsing]      = useState(false)
  const [submitting,   setSubmitting]   = useState(false)
  const [preview,      setPreview]      = useState<any>(null)
  const [error,        setError]        = useState('')

  if (loading) return <Loading/>
  if (!user) return null
  if (user.plan !== 'teammate') {
    router.push('/pricing'); return null
  }

  async function handleFile(file: File) {
    setFileName(file.name)
    const text = await file.text()
    setContractText(text)

    // Auto-detectar tipo
    if (file.name.endsWith('.yaml') || file.name.endsWith('.yml')) {
      setContractType('openapi')
    } else {
      try {
        const json = JSON.parse(text)
        if (json.info?.schema?.includes('postman')) setContractType('postman')
        else if (json.openapi || json.swagger) setContractType('openapi')
        else if (json.item) setContractType('postman')
      } catch {}
    }

    // Auto-rellenar nombre desde el contrato si está vacío
    if (!name) {
      try {
        const json = JSON.parse(text)
        if (json.info?.title)      setName(json.info.title)
        else if (json.info?.name)  setName(json.info.name)
      } catch {}
    }
  }

  async function previewContract() {
    setError(''); setParsing(true)
    try {
      // Hacemos un dry-run llamando al endpoint sin guardar
      // Como no tenemos endpoint dedicado, parseamos básicamente del lado cliente
      const json = contractType === 'openapi'
        ? _tryParseJsonOrYaml(contractText)
        : JSON.parse(contractText)

      const endpointCount = contractType === 'openapi'
        ? _countOpenApiEndpoints(json)
        : _countPostmanEndpoints(json)

      const detectedBaseUrl = contractType === 'openapi'
        ? json.servers?.[0]?.url
        : _detectPostmanBaseUrl(json)

      setPreview({
        title: json.info?.title || json.info?.name || 'Sin título',
        endpointCount,
        detectedBaseUrl,
      })
      if (!baseUrl && detectedBaseUrl) setBaseUrl(detectedBaseUrl)
    } catch (err: any) {
      setError(`No se pudo parsear: ${err.message}`)
    } finally {
      setParsing(false)
    }
  }

  async function submit() {
    setError('')
    if (!name.trim()) { setError('Nombre requerido'); return }
    if (!contractText.trim()) { setError('Sube o pega un contrato'); return }

    setSubmitting(true)
    try {
      // Parsear el contrato antes de enviar (para OpenAPI YAML lo serializamos)
      let parsedContract
      try {
        parsedContract = contractType === 'openapi'
          ? _tryParseJsonOrYaml(contractText)
          : JSON.parse(contractText)
      } catch (err: any) {
        setError(`No se pudo parsear: ${err.message}`)
        setSubmitting(false)
        return
      }

      const r = await api.post('/api/api-testing/collections', {
        name:         name.trim(),
        description:  description.trim() || null,
        contractType,
        contract:     parsedContract,
        baseUrl:      baseUrl.trim() || undefined,
      })

      router.push(`/api-testing/${r.data.collection.id}`)
    } catch (err: any) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  return (
    <div style={{ minHeight:'100vh', background:'#08080f', color:'#c4c4d8', fontFamily:'Inter,system-ui,sans-serif' }}>
      <Nav user={user}/>

      <div style={{ maxWidth:'860px', margin:'0 auto', padding:'2rem 1.5rem' }}>
        <a href="/api-testing" style={{ color:'#7070a0', fontSize:'.8125rem', textDecoration:'none' }}>
          ← Todas las colecciones
        </a>
        <h1 style={{ fontSize:'1.625rem', fontWeight:700, color:'#f0f0fc', marginTop:'.5rem', marginBottom:'.25rem' }}>
          Importar contrato
        </h1>
        <p style={{ color:'#7070a0', fontSize:'.9375rem', marginBottom:'1.5rem' }}>
          Sube un archivo OpenAPI 3.x o una Postman Collection v2.1. Achilltest generará tests automáticamente.
        </p>

        <div style={cardStyle}>
          {/* Paso 1: Tipo */}
          <Section title="Tipo de contrato">
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'.75rem' }}>
              <ContractTypeOption
                selected={contractType === 'openapi'}
                onClick={() => setContractType('openapi')}
                title="OpenAPI 3.x"
                desc=".yaml, .yml, .json"
                icon="📘"
              />
              <ContractTypeOption
                selected={contractType === 'postman'}
                onClick={() => setContractType('postman')}
                title="Postman v2.1"
                desc="Collection exportada"
                icon="📮"
              />
            </div>
          </Section>

          {/* Paso 2: Archivo */}
          <Section title="Contrato">
            <div style={{
              border:'1px dashed rgba(255,255,255,.15)', borderRadius:'10px',
              padding:'1.25rem', textAlign:'center', marginBottom:'.75rem',
            }}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.yaml,.yml"
                style={{ display:'none' }}
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) handleFile(f)
                }}
              />
              <div style={{ fontSize:'1.5rem', marginBottom:'.5rem' }}>📄</div>
              {fileName ? (
                <div style={{ color:'#22c55e', fontSize:'.875rem', marginBottom:'.5rem' }}>
                  ✓ {fileName}
                </div>
              ) : (
                <div style={{ color:'#7070a0', fontSize:'.8125rem', marginBottom:'.75rem' }}>
                  Arrastra un archivo o haz click para seleccionar
                </div>
              )}
              <button onClick={() => fileInputRef.current?.click()} style={btnSecondaryStyle}>
                {fileName ? 'Cambiar archivo' : 'Seleccionar archivo'}
              </button>
            </div>

            <details>
              <summary style={{ color:'#7070a0', fontSize:'.8125rem', cursor:'pointer' }}>
                O pega el contrato directamente
              </summary>
              <textarea
                value={contractText}
                onChange={e => setContractText(e.target.value)}
                rows={10}
                placeholder={contractType === 'openapi' ? 'openapi: 3.0.0\ninfo:\n  title: Mi API\n...' : '{ "info": { "name": "..." }, ... }'}
                style={{
                  width:'100%', marginTop:'.5rem', background:'#141422',
                  border:'1px solid rgba(255,255,255,.1)', borderRadius:'8px',
                  padding:'.625rem', color:'#f0f0fc', fontSize:'.75rem',
                  fontFamily:'JetBrains Mono, monospace', resize:'vertical',
                }}
              />
            </details>

            {contractText && (
              <button onClick={previewContract} disabled={parsing}
                style={{ ...btnSecondaryStyle, marginTop:'.75rem' }}>
                {parsing ? 'Analizando...' : '🔍 Analizar contrato'}
              </button>
            )}

            {preview && (
              <div style={{
                marginTop:'.75rem',
                background:'rgba(34,197,94,.08)', border:'1px solid rgba(34,197,94,.25)',
                borderRadius:'8px', padding:'.75rem 1rem',
              }}>
                <div style={{ fontSize:'.8125rem', color:'#22c55e', fontWeight:600, marginBottom:'.25rem' }}>
                  ✓ Contrato válido
                </div>
                <div style={{ fontSize:'.75rem', color:'#7070a0' }}>
                  <strong>{preview.title}</strong> · {preview.endpointCount} endpoints
                  {preview.detectedBaseUrl && <> · base: <code>{preview.detectedBaseUrl}</code></>}
                </div>
              </div>
            )}
          </Section>

          {/* Paso 3: Metadatos */}
          <Section title="Información">
            <Field label="Nombre">
              <input value={name} onChange={e => setName(e.target.value)}
                placeholder="Ej. API de Pagos v2" style={inputStyle}/>
            </Field>
            <Field label="Descripción (opcional)">
              <input value={description} onChange={e => setDescription(e.target.value)}
                placeholder="Para qué sirve esta colección" style={inputStyle}/>
            </Field>
            <Field label="Base URL (opcional, sobreescribe la del contrato)">
              <input value={baseUrl} onChange={e => setBaseUrl(e.target.value)}
                placeholder="https://api.staging.miempresa.com" style={inputStyle}/>
            </Field>
          </Section>

          <div style={{
            background:'rgba(124,92,191,.06)', border:'1px solid rgba(124,92,191,.15)',
            borderRadius:'8px', padding:'.75rem 1rem', marginBottom:'1rem',
          }}>
            <div style={{ fontSize:'.75rem', color:'#c4a8ff', fontWeight:600, marginBottom:'.25rem' }}>
              💡 ¿Qué pasa después?
            </div>
            <div style={{ fontSize:'.75rem', color:'#7070a0', lineHeight:1.5 }}>
              Tu contrato se parsea y Achilltest genera ~7 tests por endpoint automáticamente:
              happy path, sin auth, body vacío, validación de tipos, IDs inexistentes, y casos contextuales.
              Después configurarás auth/OTP/encriptación si tu API los usa.
            </div>
          </div>

          {error && (
            <div style={{
              background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.25)',
              borderRadius:'8px', padding:'.625rem .75rem', fontSize:'.8125rem',
              color:'#f87171', marginBottom:'1rem',
            }}>{error}</div>
          )}

          <div style={{ display:'flex', gap:'.5rem' }}>
            <button onClick={() => router.push('/api-testing')} style={btnGhostStyle}>
              Cancelar
            </button>
            <button onClick={submit} disabled={submitting} style={{
              ...btnPrimaryStyle, flex:1,
              opacity: submitting ? .6 : 1,
              cursor: submitting ? 'not-allowed' : 'pointer',
            }}>
              {submitting ? 'Importando y generando tests...' : '📥 Importar y generar tests'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Helpers de parsing client-side ──────────────────────────────────────────

function _tryParseJsonOrYaml(text: string): any {
  text = text.trim()
  if (text.startsWith('{') || text.startsWith('[')) return JSON.parse(text)
  // YAML básico para preview (el backend re-parsea con su propio parser)
  return _miniYamlParse(text)
}

function _miniYamlParse(text: string): any {
  // Muy básico, solo para preview (info.title y servers)
  const lines = text.split('\n')
  const result: any = { info: {}, paths: {}, servers: [] }
  let inServers = false
  let inInfo = false
  let inPaths = false
  for (const raw of lines) {
    const line = raw.trim()
    if (line.startsWith('#') || line === '') continue
    if (line.startsWith('info:'))    { inInfo = true; inServers = false; inPaths = false; continue }
    if (line.startsWith('servers:')) { inInfo = false; inServers = true; inPaths = false; continue }
    if (line.startsWith('paths:'))   { inInfo = false; inServers = false; inPaths = true; continue }

    if (inInfo) {
      const m = line.match(/^(title|version|description):\s*(.+)$/)
      if (m) result.info[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
    if (inServers && line.startsWith('- url:')) {
      const m = line.match(/url:\s*(.+)$/)
      if (m) result.servers.push({ url: m[1].replace(/^["']|["']$/g, '') })
    }
    if (inPaths) {
      const m = line.match(/^(\/[^:]*?):/)
      if (m) result.paths[m[1]] = {}
    }
  }
  return result
}

function _countOpenApiEndpoints(json: any): number {
  if (!json.paths) return 0
  let n = 0
  for (const p of Object.values(json.paths) as any[]) {
    if (!p) continue
    for (const m of ['get','post','put','patch','delete','head','options']) {
      if (p[m]) n++
    }
  }
  return n
}

function _countPostmanEndpoints(json: any): number {
  let n = 0
  function walk(items: any[]) {
    for (const item of items || []) {
      if (item.item) walk(item.item)
      else if (item.request) n++
    }
  }
  walk(json.item || [])
  return n
}

function _detectPostmanBaseUrl(json: any): string | null {
  function walk(items: any[]): string | null {
    for (const item of items || []) {
      if (item.item) {
        const found = walk(item.item)
        if (found) return found
      } else if (item.request) {
        const url = typeof item.request.url === 'string' ? item.request.url : item.request.url?.raw
        if (url) {
          try {
            const u = new URL(url.replace(/\{\{[^}]+\}\}/g, 'x'))
            return `${u.protocol}//${u.host}`
          } catch {}
        }
      }
    }
    return null
  }
  return walk(json.item || [])
}

// ── Componentes ──

function ContractTypeOption({ selected, onClick, title, desc, icon }: any) {
  return (
    <button onClick={onClick} style={{
      textAlign:'left', padding:'.875rem',
      background: selected ? 'rgba(124,92,191,.15)' : '#141422',
      border: `1px solid ${selected ? '#7c5cbf' : 'rgba(255,255,255,.07)'}`,
      borderRadius:'10px', cursor:'pointer', fontFamily:'inherit',
      display:'flex', gap:'.625rem', alignItems:'center',
    }}>
      <div style={{ fontSize:'1.5rem' }}>{icon}</div>
      <div>
        <div style={{ color:'#f0f0fc', fontSize:'.875rem', fontWeight:600 }}>{title}</div>
        <div style={{ color:'#7070a0', fontSize:'.7rem' }}>{desc}</div>
      </div>
    </button>
  )
}

function Section({ title, children }: any) {
  return (
    <div style={{ marginBottom:'1.5rem' }}>
      <div style={{
        fontSize:'.75rem', fontWeight:600, color:'#7070a0',
        textTransform:'uppercase', letterSpacing:'.05em', marginBottom:'.625rem',
      }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function Field({ label, children }: any) {
  return (
    <div style={{ marginBottom:'.75rem' }}>
      <label style={{ display:'block', fontSize:'.75rem', color:'#7070a0', marginBottom:'.25rem', fontWeight:500 }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function Nav({ user }: any) {
  return (
    <nav style={{
      display:'flex', justifyContent:'space-between', alignItems:'center',
      padding:'1rem 2rem', borderBottom:'1px solid rgba(255,255,255,.07)', background:'#0e0e1a',
    }}>
      <a href="/api-testing" style={{ color:'#c4a8ff', textDecoration:'none', fontSize:'.875rem' }}>← API Testing</a>
      <div style={{ display:'flex', gap:'1rem', alignItems:'center' }}>
        <span style={{ fontSize:'.8125rem', color:'#7070a0' }}>
          {user.email} · <strong style={{ color:'#c4a8ff' }}>{user.plan}</strong>
        </span>
        <button onClick={logout} style={{
          background:'transparent', border:'1px solid rgba(255,255,255,.1)',
          color:'#7070a0', borderRadius:'8px', padding:'.375rem .875rem',
          fontSize:'.75rem', cursor:'pointer',
        }}>Salir</button>
      </div>
    </nav>
  )
}

function Loading() {
  return <div style={{ minHeight:'100vh', background:'#08080f', display:'flex', alignItems:'center', justifyContent:'center', color:'#7070a0' }}>Cargando...</div>
}

const cardStyle: React.CSSProperties = {
  background:'#0e0e1a', border:'1px solid rgba(255,255,255,.07)',
  borderRadius:'14px', padding:'1.5rem',
}
const inputStyle: React.CSSProperties = {
  width:'100%', background:'#141422', border:'1px solid rgba(255,255,255,.1)',
  borderRadius:'8px', padding:'.5rem .75rem', color:'#f0f0fc',
  fontSize:'.875rem', outline:'none', fontFamily:'inherit',
}
const btnPrimaryStyle: React.CSSProperties = {
  background:'#7c5cbf', color:'#fff', border:'none', borderRadius:'8px',
  padding:'.625rem 1rem', fontSize:'.875rem', fontWeight:600, cursor:'pointer',
  fontFamily:'inherit', boxShadow:'0 4px 20px rgba(124,92,191,.4)',
}
const btnSecondaryStyle: React.CSSProperties = {
  background:'transparent', color:'#c4c4d8',
  border:'1px solid rgba(255,255,255,.12)', borderRadius:'8px',
  padding:'.5rem .875rem', fontSize:'.8125rem', fontWeight:500, cursor:'pointer',
  fontFamily:'inherit',
}
const btnGhostStyle: React.CSSProperties = {
  background:'transparent', border:'1px solid rgba(255,255,255,.1)',
  color:'#7070a0', borderRadius:'8px', padding:'.625rem .875rem',
  fontSize:'.8125rem', cursor:'pointer', fontFamily:'inherit',
}
