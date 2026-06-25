'use client'

import { useEffect, useState }    from 'react'
import { useRouter, useParams }   from 'next/navigation'
import { useAuth }                from '@/hooks/useAuth'
import { api, logout }            from '@/lib/api'

interface Collection {
  id:              string
  name:            string
  description:     string | null
  contractType:    string
  baseUrl:         string | null
  totalEndpoints:  number
  totalTests:      number
  authConfig:      any
  encryptionConfig:any
  otpConfig:       any
  cases:           TestCase[]
  secrets:         Secret[]
  recentRuns:      Run[]
}

interface TestCase {
  id:             string
  endpoint:       string
  testName:       string
  category:       string
  generatedBy:    string
  requestMethod:  string
  requestPath:    string
  requestBody:    any
  expectedStatus: number
  enabled:        boolean
}

interface Secret {
  id:          string
  secretType:  string
  label:       string
  displayHint: string
}

interface Run {
  id:           string
  status:       string
  totalTests:   number
  passed:       number
  failed:       number
  durationMs:   number
  createdAt:    string
}

type Tab = 'tests' | 'auth' | 'encryption' | 'otp' | 'secrets' | 'runs'

export default function ApiCollectionDetailPage() {
  const router = useRouter()
  const params = useParams()
  const collectionId = params.id as string
  const { user, loading } = useAuth(true)

  const [collection, setCollection]   = useState<Collection | null>(null)
  const [loadingData, setLoadingData] = useState(true)
  const [tab, setTab]                 = useState<Tab>('tests')
  const [running, setRunning]         = useState(false)
  const [error, setError]             = useState('')

  // Auto-refresh mientras se generan tests (totalTests=0)
  useEffect(() => {
    if (!user) return
    if (user.plan !== 'teammate') { router.push('/pricing'); return }
    loadCollection()
  }, [user, collectionId])

  useEffect(() => {
    // Si no hay tests aún, polling cada 2s
    if (collection && collection.cases.length === 0) {
      const t = setTimeout(loadCollection, 2000)
      return () => clearTimeout(t)
    }
  }, [collection])

  async function loadCollection() {
    try {
      const r = await api.get(`/api/api-testing/collections/${collectionId}`)
      setCollection(r.data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoadingData(false)
    }
  }

  async function regenerate() {
    if (!confirm('¿Regenerar todos los tests? Los actuales serán reemplazados.')) return
    try {
      await api.post(`/api/api-testing/collections/${collectionId}/regenerate`, {})
      setCollection(c => c ? { ...c, cases: [] } : c)
      setTimeout(loadCollection, 2000)
    } catch (err: any) {
      setError(err.message)
    }
  }

  async function runCollection() {
    setError(''); setRunning(true)
    try {
      const r = await api.post(`/api/api-testing/collections/${collectionId}/run`, {})
      router.push(`/api-testing/${collectionId}/run/${r.data.runId}`)
    } catch (err: any) {
      setError(err.message)
      setRunning(false)
    }
  }

  if (loading || loadingData) return <Loading/>
  if (!user) return null
  if (!collection) return <Loading text="Colección no encontrada"/>

  const generating = collection.cases.length === 0

  return (
    <div style={{ minHeight:'100vh', background:'#08080f', color:'#c4c4d8', fontFamily:'Inter,system-ui,sans-serif' }}>
      <Nav user={user}/>

      <div style={{ maxWidth:'1200px', margin:'0 auto', padding:'2rem 1.5rem' }}>
        <a href="/api-testing" style={{ color:'#7070a0', fontSize:'.8125rem', textDecoration:'none' }}>
          ← Todas las colecciones
        </a>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginTop:'.5rem', marginBottom:'1.5rem', gap:'1rem', flexWrap:'wrap' }}>
          <div>
            <h1 style={{ fontSize:'1.625rem', fontWeight:700, color:'#f0f0fc', marginBottom:'.25rem' }}>
              {collection.name}
            </h1>
            <div style={{ display:'flex', gap:'1rem', fontSize:'.8125rem', color:'#7070a0', flexWrap:'wrap' }}>
              <span><strong>{collection.totalEndpoints}</strong> endpoints</span>
              <span><strong>{collection.totalTests}</strong> tests</span>
              {collection.baseUrl && (
                <span style={{ fontFamily:'monospace', color:'#c4a8ff' }}>🌐 {collection.baseUrl}</span>
              )}
            </div>
          </div>
          <div style={{ display:'flex', gap:'.5rem', flexWrap:'wrap' }}>
            <button onClick={regenerate} disabled={generating} style={btnSecondaryStyle}>
              🔄 Regenerar
            </button>
            <button onClick={runCollection} disabled={generating || running} style={{
              ...btnPrimaryStyle, opacity: (generating || running) ? .6 : 1,
              cursor: (generating || running) ? 'not-allowed' : 'pointer',
            }}>
              {running ? 'Iniciando...' : `▶ Ejecutar (${collection.totalTests})`}
            </button>
          </div>
        </div>

        {generating && (
          <div style={{
            background:'rgba(38,181,170,.08)', border:'1px solid rgba(38,181,170,.2)',
            borderRadius:'10px', padding:'.75rem 1rem', marginBottom:'1.5rem',
            display:'flex', alignItems:'center', gap:'.625rem',
          }}>
            <div style={{
              width:14, height:14, border:'2px solid rgba(38,181,170,.3)',
              borderTopColor:'#26b5aa', borderRadius:'50%',
              animation:'spin 1s linear infinite',
            }}/>
            <span style={{ fontSize:'.8125rem', color:'#26b5aa' }}>
              Generando tests automáticamente...
            </span>
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          </div>
        )}

        {error && (
          <div style={{
            background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.25)',
            borderRadius:'8px', padding:'.625rem .75rem', fontSize:'.8125rem',
            color:'#f87171', marginBottom:'1rem',
          }}>{error}</div>
        )}

        {/* Tabs */}
        <div style={{ display:'flex', gap:'.25rem', borderBottom:'1px solid rgba(255,255,255,.07)', marginBottom:'1.5rem', overflowX:'auto' }}>
          <TabBtn current={tab} value="tests"      label={`🧪 Tests (${collection.cases.length})`}    onClick={() => setTab('tests')}/>
          <TabBtn current={tab} value="auth"       label="🔐 Auth"        onClick={() => setTab('auth')}/>
          <TabBtn current={tab} value="encryption" label="🔒 Encryption"  onClick={() => setTab('encryption')}/>
          <TabBtn current={tab} value="otp"        label="📱 OTP/2FA"     onClick={() => setTab('otp')}/>
          <TabBtn current={tab} value="secrets"    label={`🗝️ Secrets (${collection.secrets.length})`} onClick={() => setTab('secrets')}/>
          <TabBtn current={tab} value="runs"       label="📊 Runs"        onClick={() => setTab('runs')}/>
        </div>

        {tab === 'tests'      && <TestsTab cases={collection.cases}/>}
        {tab === 'auth'       && <AuthTab collection={collection} onSaved={loadCollection}/>}
        {tab === 'encryption' && <EncryptionTab collection={collection} onSaved={loadCollection}/>}
        {tab === 'otp'        && <OtpTab collection={collection} onSaved={loadCollection}/>}
        {tab === 'secrets'    && <SecretsTab collection={collection} onSaved={loadCollection}/>}
        {tab === 'runs'       && <RunsTab runs={collection.recentRuns} collectionId={collectionId}/>}
      </div>
    </div>
  )
}

// ── TAB: Tests ──────────────────────────────────────────────────────────────

function TestsTab({ cases }: { cases: TestCase[] }) {
  if (cases.length === 0) {
    return (
      <div style={{ ...emptyStyle }}>
        <div style={{ fontSize:'2rem', marginBottom:'.5rem' }}>⏳</div>
        Esperando a que se generen los tests...
      </div>
    )
  }

  // Agrupar por endpoint
  const byEndpoint: Record<string, TestCase[]> = {}
  for (const c of cases) {
    if (!byEndpoint[c.endpoint]) byEndpoint[c.endpoint] = []
    byEndpoint[c.endpoint].push(c)
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'.75rem' }}>
      {Object.entries(byEndpoint).map(([endpoint, list]) => (
        <details key={endpoint} style={{
          background:'#0e0e1a', border:'1px solid rgba(255,255,255,.07)',
          borderRadius:'10px', padding:'.75rem 1rem',
        }}>
          <summary style={{ cursor:'pointer', listStyle:'none', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div style={{ display:'flex', gap:'.5rem', alignItems:'center' }}>
              <MethodBadge method={endpoint.split(' ')[0]}/>
              <code style={{ fontSize:'.8125rem', color:'#c4c4d8', fontFamily:'monospace' }}>
                {endpoint.split(' ')[1]}
              </code>
            </div>
            <span style={{ fontSize:'.7rem', color:'#7070a0' }}>
              {list.length} test{list.length !== 1 ? 's' : ''}
            </span>
          </summary>
          <div style={{ marginTop:'.75rem', display:'flex', flexDirection:'column', gap:'.375rem' }}>
            {list.map(tc => <TestCaseRow key={tc.id} tc={tc}/>)}
          </div>
        </details>
      ))}
    </div>
  )
}

function TestCaseRow({ tc }: { tc: TestCase }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div style={{
      background:'#141422', border:'1px solid rgba(255,255,255,.04)',
      borderRadius:'8px', padding:'.625rem .75rem',
    }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', cursor:'pointer' }}
        onClick={() => setExpanded(!expanded)}>
        <div style={{ display:'flex', alignItems:'center', gap:'.5rem', flex:1, minWidth:0 }}>
          <CategoryBadge category={tc.category}/>
          <span style={{ fontSize:'.8125rem', color:'#f0f0fc', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {tc.testName}
          </span>
        </div>
        <div style={{ display:'flex', gap:'.375rem', alignItems:'center', fontSize:'.7rem', color:'#7070a0' }}>
          <span>→ {tc.expectedStatus}</span>
          {tc.generatedBy === 'ai' && <span style={{ color:'#c4a8ff' }}>🤖 IA</span>}
        </div>
      </div>
      {expanded && tc.requestBody && (
        <pre style={{
          marginTop:'.5rem', background:'#08080f', padding:'.5rem .625rem',
          borderRadius:'6px', fontSize:'.6875rem', color:'#7070a0',
          overflow:'auto', maxHeight:'200px',
        }}>{JSON.stringify(tc.requestBody, null, 2)}</pre>
      )}
    </div>
  )
}

// ── TAB: Auth ───────────────────────────────────────────────────────────────

function AuthTab({ collection, onSaved }: { collection: Collection; onSaved: () => void }) {
  const [config, setConfig] = useState(collection.authConfig || { type: 'none' })
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      await api.put(`/api/api-testing/collections/${collection.id}`, { authConfig: config })
      onSaved()
    } catch (err: any) {
      alert(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={cardStyle}>
      <h3 style={{ fontSize:'1rem', fontWeight:600, color:'#f0f0fc', marginBottom:'1rem' }}>
        Tipo de autenticación
      </h3>

      <Field label="Tipo">
        <select value={config.type || 'none'} onChange={e => setConfig({ ...config, type: e.target.value })}
          style={inputStyle}>
          <option value="none">Sin autenticación</option>
          <option value="bearer_static">Bearer Token estático</option>
          <option value="bearer_login">Bearer Token con login flow</option>
          <option value="bearer_login_otp">Bearer + OTP/2FA</option>
          <option value="api_key">API Key (header)</option>
          <option value="basic">Basic Auth</option>
          <option value="oauth2_client">OAuth 2.0 Client Credentials</option>
          <option value="hmac">HMAC Signature por request</option>
        </select>
      </Field>

      {config.type === 'bearer_static' && (
        <Hint>
          Configura el token en la pestaña <strong>Secrets</strong> con tipo <code>bearer_token</code>.
        </Hint>
      )}

      {(config.type === 'bearer_login' || config.type === 'bearer_login_otp') && (
        <>
          <Field label="URL de login (path o URL completa)">
            <input value={config.loginUrl || ''} onChange={e => setConfig({ ...config, loginUrl: e.target.value })}
              placeholder="/auth/login" style={inputStyle}/>
          </Field>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'.625rem' }}>
            <Field label="Nombre del campo username">
              <input value={config.usernameField || 'username'} onChange={e => setConfig({ ...config, usernameField: e.target.value })}
                placeholder="username" style={inputStyle}/>
            </Field>
            <Field label="Nombre del campo password">
              <input value={config.passwordField || 'password'} onChange={e => setConfig({ ...config, passwordField: e.target.value })}
                placeholder="password" style={inputStyle}/>
            </Field>
          </div>
          <Field label="JSONPath del token en la respuesta">
            <input value={config.tokenField || 'token'} onChange={e => setConfig({ ...config, tokenField: e.target.value })}
              placeholder="data.access_token" style={inputStyle}/>
          </Field>
          <Field label="Header donde se inyecta el token">
            <input value={config.tokenHeader || 'Authorization'} onChange={e => setConfig({ ...config, tokenHeader: e.target.value })}
              placeholder="Authorization" style={inputStyle}/>
          </Field>
          <Field label="Prefijo del token">
            <input value={config.tokenPrefix !== undefined ? config.tokenPrefix : 'Bearer '}
              onChange={e => setConfig({ ...config, tokenPrefix: e.target.value })}
              placeholder="Bearer " style={inputStyle}/>
          </Field>
          <Hint>
            Configura <code>username</code> y <code>password</code> en la pestaña <strong>Secrets</strong>.
          </Hint>
          {config.type === 'bearer_login_otp' && (
            <Hint>También configura el OTP en la pestaña <strong>OTP/2FA</strong>.</Hint>
          )}
        </>
      )}

      {config.type === 'api_key' && (
        <>
          <Field label="Nombre del header">
            <input value={config.headerName || 'X-API-Key'} onChange={e => setConfig({ ...config, headerName: e.target.value })}
              placeholder="X-API-Key" style={inputStyle}/>
          </Field>
          <Hint>Configura la API key en <strong>Secrets</strong> con tipo <code>api_key</code>.</Hint>
        </>
      )}

      {config.type === 'basic' && (
        <>
          <Field label="Username">
            <input value={config.username || ''} onChange={e => setConfig({ ...config, username: e.target.value })}
              placeholder="admin" style={inputStyle}/>
          </Field>
          <Hint>Configura el <code>password</code> en <strong>Secrets</strong>.</Hint>
        </>
      )}

      {config.type === 'oauth2_client' && (
        <>
          <Field label="URL de token">
            <input value={config.tokenUrl || ''} onChange={e => setConfig({ ...config, tokenUrl: e.target.value })}
              placeholder="/oauth/token" style={inputStyle}/>
          </Field>
          <Field label="Client ID">
            <input value={config.clientId || ''} onChange={e => setConfig({ ...config, clientId: e.target.value })}
              placeholder="my_app_client" style={inputStyle}/>
          </Field>
          <Field label="Scope (opcional)">
            <input value={config.scope || ''} onChange={e => setConfig({ ...config, scope: e.target.value })}
              placeholder="read write" style={inputStyle}/>
          </Field>
          <Hint>Configura el <code>oauth_client_secret</code> en <strong>Secrets</strong>.</Hint>
        </>
      )}

      {config.type === 'hmac' && (
        <>
          <Field label="Header de firma">
            <input value={config.hmacHeader || 'X-Signature'} onChange={e => setConfig({ ...config, hmacHeader: e.target.value })}
              placeholder="X-Signature" style={inputStyle}/>
          </Field>
          <Hint>Configura el <code>hmac_secret</code> en <strong>Secrets</strong>.</Hint>
        </>
      )}

      <button onClick={save} disabled={saving} style={{ ...btnPrimaryStyle, marginTop:'1rem' }}>
        {saving ? 'Guardando...' : '💾 Guardar configuración'}
      </button>
    </div>
  )
}

// ── TAB: Encryption ─────────────────────────────────────────────────────────

function EncryptionTab({ collection, onSaved }: { collection: Collection; onSaved: () => void }) {
  const [config, setConfig] = useState(collection.encryptionConfig || { enabled: false })
  const [saving, setSaving] = useState(false)
  const [fields, setFields] = useState((config.fields || []).join(', '))

  async function save() {
    setSaving(true)
    try {
      const finalConfig = {
        ...config,
        fields: config.mode === 'fields'
          ? fields.split(',').map((s: string) => s.trim()).filter(Boolean)
          : undefined,
      }
      await api.put(`/api/api-testing/collections/${collection.id}`, { encryptionConfig: finalConfig })
      onSaved()
    } catch (err: any) {
      alert(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={cardStyle}>
      <h3 style={{ fontSize:'1rem', fontWeight:600, color:'#f0f0fc', marginBottom:'.5rem' }}>
        Encriptación de payloads
      </h3>
      <p style={{ fontSize:'.8125rem', color:'#7070a0', marginBottom:'1rem' }}>
        Si tu API encripta los bodies con AES o JWE, configúralo aquí.
      </p>

      <div style={{
        display:'flex', alignItems:'center', gap:'.625rem', marginBottom:'1rem',
        padding:'.625rem .75rem', background:'#141422', borderRadius:'8px',
      }}>
        <input type="checkbox" checked={config.enabled || false}
          onChange={e => setConfig({ ...config, enabled: e.target.checked })}
          style={{ width:18, height:18, cursor:'pointer' }}/>
        <span style={{ fontSize:'.875rem', color:'#f0f0fc' }}>Activar encriptación</span>
      </div>

      {config.enabled && (
        <>
          <Field label="Algoritmo">
            <select value={config.algorithm || 'aes-256-gcm'}
              onChange={e => setConfig({ ...config, algorithm: e.target.value })}
              style={inputStyle}>
              <option value="aes-256-gcm">AES-256-GCM (recomendado)</option>
              <option value="aes-256-cbc">AES-256-CBC (banca legacy)</option>
              <option value="jwe">JWE (RFC 7516)</option>
              <option value="hmac">HMAC firma (no encripta, solo firma)</option>
            </select>
          </Field>

          {config.algorithm !== 'hmac' && (
            <>
              <Field label="Modo">
                <select value={config.mode || 'body'}
                  onChange={e => setConfig({ ...config, mode: e.target.value })}
                  style={inputStyle}>
                  <option value="body">Body completo encriptado</option>
                  <option value="fields">Solo campos específicos</option>
                </select>
              </Field>

              {config.mode === 'body' && (
                <Field label="Campo wrapper">
                  <input value={config.wrapperField || 'data'}
                    onChange={e => setConfig({ ...config, wrapperField: e.target.value })}
                    placeholder='data' style={inputStyle}/>
                </Field>
              )}

              {config.mode === 'fields' && (
                <Field label="Campos a encriptar (separados por coma, soporta paths como user.cardNumber)">
                  <input value={fields} onChange={e => setFields(e.target.value)}
                    placeholder="cardNumber, cvv, user.ssn" style={inputStyle}/>
                </Field>
              )}
            </>
          )}

          <Field label="¿Firmar también con HMAC?">
            <input value={config.hmacHeader || ''}
              onChange={e => setConfig({ ...config, hmacHeader: e.target.value })}
              placeholder="X-Signature (deja vacío si no aplica)" style={inputStyle}/>
          </Field>

          <Hint>
            Configura la clave <code>encryption_key</code> en <strong>Secrets</strong>.
            Si usas HMAC adicional, también el <code>hmac_secret</code>.
          </Hint>
        </>
      )}

      <button onClick={save} disabled={saving} style={{ ...btnPrimaryStyle, marginTop:'1rem' }}>
        {saving ? 'Guardando...' : '💾 Guardar configuración'}
      </button>
    </div>
  )
}

// ── TAB: OTP ────────────────────────────────────────────────────────────────

function OtpTab({ collection, onSaved }: { collection: Collection; onSaved: () => void }) {
  const [config, setConfig] = useState(collection.otpConfig || { enabled: false })
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      await api.put(`/api/api-testing/collections/${collection.id}`, { otpConfig: config })
      onSaved()
    } catch (err: any) {
      alert(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={cardStyle}>
      <h3 style={{ fontSize:'1rem', fontWeight:600, color:'#f0f0fc', marginBottom:'.5rem' }}>
        Configuración OTP / 2FA
      </h3>
      <p style={{ fontSize:'.8125rem', color:'#7070a0', marginBottom:'1rem' }}>
        Solo aplica si tu auth es <code>Bearer + OTP</code>.
      </p>

      <div style={{
        display:'flex', alignItems:'center', gap:'.625rem', marginBottom:'1rem',
        padding:'.625rem .75rem', background:'#141422', borderRadius:'8px',
      }}>
        <input type="checkbox" checked={config.enabled || false}
          onChange={e => setConfig({ ...config, enabled: e.target.checked })}
          style={{ width:18, height:18, cursor:'pointer' }}/>
        <span style={{ fontSize:'.875rem', color:'#f0f0fc' }}>Mi API usa OTP/2FA</span>
      </div>

      {config.enabled && (
        <>
          <Field label="¿Cómo obtener el OTP?">
            <select value={config.type || 'mock'} onChange={e => setConfig({ ...config, type: e.target.value })}
              style={inputStyle}>
              <option value="mock">Mock fijo (entornos de testing)</option>
              <option value="totp">TOTP (Google Authenticator/Authy)</option>
              <option value="webhook">Webhook (URL que devuelve el OTP)</option>
            </select>
          </Field>

          {config.type === 'mock' && (
            <Field label="OTP fijo">
              <input value={config.mockValue || '123456'}
                onChange={e => setConfig({ ...config, mockValue: e.target.value })}
                placeholder="123456" style={inputStyle}/>
            </Field>
          )}

          {config.type === 'totp' && (
            <Hint>
              Configura <code>otp_secret</code> en <strong>Secrets</strong>
              (el secret en formato base32 de tu app autenticadora).
            </Hint>
          )}

          {config.type === 'webhook' && (
            <Field label="URL del webhook (GET que devuelve el OTP)">
              <input value={config.webhookUrl || ''}
                onChange={e => setConfig({ ...config, webhookUrl: e.target.value })}
                placeholder="https://mi-staging.com/sms/last-otp" style={inputStyle}/>
            </Field>
          )}

          <h4 style={{ fontSize:'.8125rem', fontWeight:600, color:'#c4a8ff', marginTop:'1.5rem', marginBottom:'.5rem' }}>
            Endpoint de verificación
          </h4>
          <Field label="URL del endpoint que verifica el OTP">
            <input value={config.verifyUrl || ''} onChange={e => setConfig({ ...config, verifyUrl: e.target.value })}
              placeholder="/auth/verify-otp" style={inputStyle}/>
          </Field>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'.625rem' }}>
            <Field label="Nombre del campo challenge">
              <input value={config.challengeField || 'challengeId'}
                onChange={e => setConfig({ ...config, challengeField: e.target.value })}
                style={inputStyle}/>
            </Field>
            <Field label="Nombre del campo OTP">
              <input value={config.otpField || 'otp'}
                onChange={e => setConfig({ ...config, otpField: e.target.value })}
                style={inputStyle}/>
            </Field>
          </div>
          <Field label="JSONPath del challengeId en la respuesta del login">
            <input value={config.challengeSource || 'challengeId'}
              onChange={e => setConfig({ ...config, challengeSource: e.target.value })}
              placeholder="data.challengeId" style={inputStyle}/>
          </Field>
        </>
      )}

      <button onClick={save} disabled={saving} style={{ ...btnPrimaryStyle, marginTop:'1rem' }}>
        {saving ? 'Guardando...' : '💾 Guardar configuración'}
      </button>
    </div>
  )
}

// ── TAB: Secrets ────────────────────────────────────────────────────────────

function SecretsTab({ collection, onSaved }: { collection: Collection; onSaved: () => void }) {
  const [showAdd, setShowAdd] = useState(false)
  const [secretType, setSecretType] = useState('encryption_key')
  const [label, setLabel] = useState('default')
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function add() {
    setError(''); setSaving(true)
    try {
      await api.post(`/api/api-testing/collections/${collection.id}/secrets`, {
        secretType, label, value,
      })
      setShowAdd(false); setValue('')
      onSaved()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteSecret(id: string, type: string) {
    if (!confirm(`¿Eliminar este secreto (${type})?`)) return
    try {
      await api.delete(`/api/api-testing/collections/${collection.id}/secrets/${id}`)
      onSaved()
    } catch (err: any) {
      alert(err.message)
    }
  }

  return (
    <div>
      <div style={{
        background:'rgba(245,158,11,.06)', border:'1px solid rgba(245,158,11,.15)',
        borderRadius:'10px', padding:'.75rem 1rem', marginBottom:'1rem',
      }}>
        <div style={{ fontSize:'.75rem', color:'#f59e0b', fontWeight:600, marginBottom:'.25rem' }}>
          🛡️ Seguridad de los secretos
        </div>
        <div style={{ fontSize:'.75rem', color:'#7070a0', lineHeight:1.5 }}>
          Los secretos se encriptan con AES-256-GCM usando una master key del servidor.
          Una vez guardados, NO se pueden ver de nuevo (write-only). Para cambiar uno, vuélvelo a ingresar.
        </div>
      </div>

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem' }}>
        <h3 style={{ fontSize:'1rem', fontWeight:600, color:'#f0f0fc' }}>
          Secretos ({collection.secrets.length})
        </h3>
        <button onClick={() => setShowAdd(true)} style={btnPrimaryStyle}>+ Agregar secret</button>
      </div>

      {collection.secrets.length === 0 ? (
        <div style={emptyStyle}>No hay secretos configurados.</div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:'.5rem' }}>
          {collection.secrets.map(s => (
            <div key={s.id} style={{
              background:'#0e0e1a', border:'1px solid rgba(255,255,255,.07)',
              borderRadius:'10px', padding:'.75rem 1rem',
              display:'flex', justifyContent:'space-between', alignItems:'center',
            }}>
              <div>
                <div style={{ fontSize:'.8125rem', color:'#f0f0fc', fontWeight:500 }}>
                  {s.secretType} <span style={{ color:'#7070a0' }}>· {s.label}</span>
                </div>
                <code style={{ fontSize:'.75rem', color:'#5a5a7a', fontFamily:'monospace' }}>
                  {s.displayHint}
                </code>
              </div>
              <button onClick={() => deleteSecret(s.id, s.secretType)} style={{
                background:'transparent', border:'1px solid rgba(239,68,68,.2)',
                color:'#f87171', borderRadius:'6px', padding:'.25rem .625rem',
                fontSize:'.7rem', cursor:'pointer',
              }}>Eliminar</button>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <div style={{
          position:'fixed', inset:0, background:'rgba(0,0,0,.7)',
          display:'flex', alignItems:'center', justifyContent:'center',
          zIndex:100, padding:'1rem',
        }} onClick={() => setShowAdd(false)}>
          <div style={{
            background:'#0e0e1a', border:'1px solid rgba(255,255,255,.1)',
            borderRadius:'14px', padding:'1.5rem', width:'100%', maxWidth:'480px',
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize:'1.125rem', fontWeight:700, color:'#f0f0fc', marginBottom:'1rem' }}>
              Agregar secreto
            </h3>
            <Field label="Tipo">
              <select value={secretType} onChange={e => setSecretType(e.target.value)} style={inputStyle}>
                <option value="encryption_key">encryption_key</option>
                <option value="hmac_secret">hmac_secret</option>
                <option value="otp_secret">otp_secret</option>
                <option value="bearer_token">bearer_token</option>
                <option value="api_key">api_key</option>
                <option value="password">password</option>
                <option value="username">username</option>
                <option value="oauth_client_id">oauth_client_id</option>
                <option value="oauth_client_secret">oauth_client_secret</option>
              </select>
            </Field>
            <Field label="Label (identificador, default si solo hay uno)">
              <input value={label} onChange={e => setLabel(e.target.value)} style={inputStyle}/>
            </Field>
            <Field label="Valor (write-only, no se podrá ver de nuevo)">
              <input type="password" value={value} onChange={e => setValue(e.target.value)}
                placeholder="Valor en texto plano" style={inputStyle} autoFocus/>
            </Field>
            {error && (
              <div style={{
                background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.25)',
                borderRadius:'8px', padding:'.5rem .75rem', fontSize:'.75rem',
                color:'#f87171', marginBottom:'.75rem',
              }}>{error}</div>
            )}
            <div style={{ display:'flex', gap:'.5rem' }}>
              <button onClick={() => setShowAdd(false)} style={btnGhostStyle}>Cancelar</button>
              <button onClick={add} disabled={saving || !value} style={{
                ...btnPrimaryStyle, flex:1,
                opacity:(saving || !value) ? .6 : 1,
              }}>
                {saving ? 'Guardando...' : '🔐 Guardar encriptado'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── TAB: Runs ───────────────────────────────────────────────────────────────

function RunsTab({ runs, collectionId }: { runs: Run[]; collectionId: string }) {
  const router = useRouter()
  if (runs.length === 0) {
    return <div style={emptyStyle}>Aún no has ejecutado esta colección.</div>
  }
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'.5rem' }}>
      {runs.map(r => (
        <div key={r.id} onClick={() => router.push(`/api-testing/${collectionId}/run/${r.id}`)}
          style={{
            background:'#0e0e1a', border:'1px solid rgba(255,255,255,.07)',
            borderRadius:'10px', padding:'.75rem 1rem', cursor:'pointer',
            display:'flex', justifyContent:'space-between', alignItems:'center',
          }}>
          <div>
            <div style={{ fontSize:'.8125rem', color:'#f0f0fc', marginBottom:'.125rem' }}>
              Run de {new Date(r.createdAt).toLocaleString('es-MX')}
            </div>
            <div style={{ fontSize:'.7rem', color:'#7070a0' }}>
              {r.totalTests} tests · {r.durationMs ? `${(r.durationMs/1000).toFixed(1)}s` : 'corriendo'}
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:'.75rem' }}>
            <span style={{ color:'#22c55e', fontSize:'.8125rem', fontWeight:600 }}>{r.passed}✓</span>
            <span style={{ color:'#f87171', fontSize:'.8125rem', fontWeight:600 }}>{r.failed}✗</span>
            <span style={{ color:'#7070a0', fontSize:'1.125rem' }}>→</span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── COMPONENTES AUXILIARES ──────────────────────────────────────────────────

function TabBtn({ current, value, label, onClick }: any) {
  const active = current === value
  return (
    <button onClick={onClick} style={{
      background:'transparent', border:'none', cursor:'pointer',
      padding:'.625rem 1rem', fontFamily:'inherit', fontSize:'.8125rem',
      color: active ? '#c4a8ff' : '#7070a0',
      borderBottom: `2px solid ${active ? '#7c5cbf' : 'transparent'}`,
      whiteSpace:'nowrap', fontWeight: active ? 600 : 400,
      marginBottom:-1,
    }}>{label}</button>
  )
}

function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    GET: '#26b5aa', POST: '#7c5cbf', PUT: '#f59e0b',
    DELETE: '#f87171', PATCH: '#c4a8ff',
  }
  const c = colors[method] || '#7070a0'
  return (
    <span style={{
      background: `${c}22`, color: c, padding:'.125rem .5rem',
      borderRadius:4, fontSize:'.6875rem', fontWeight:700,
      fontFamily:'monospace', minWidth:48, textAlign:'center',
    }}>{method}</span>
  )
}

function CategoryBadge({ category }: { category: string }) {
  const colors: Record<string, [string,string]> = {
    happy_path: ['#22c55e', 'rgba(34,197,94,.12)'],
    negative:   ['#f59e0b', 'rgba(245,158,11,.12)'],
    edge:       ['#c4a8ff', 'rgba(196,168,255,.12)'],
    security:   ['#f87171', 'rgba(239,68,68,.12)'],
  }
  const [c, bg] = colors[category] || ['#7070a0', 'rgba(255,255,255,.05)']
  return (
    <span style={{
      background:bg, color:c, padding:'.125rem .375rem',
      borderRadius:4, fontSize:'.65rem', fontWeight:600,
      textTransform:'uppercase', letterSpacing:'.04em',
      minWidth:65, textAlign:'center',
    }}>{category.replace('_', ' ')}</span>
  )
}

function Field({ label, children }: any) {
  return (
    <div style={{ marginBottom:'.75rem' }}>
      <label style={{ display:'block', fontSize:'.7rem', color:'#7070a0', marginBottom:'.25rem', fontWeight:500 }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function Hint({ children }: any) {
  return (
    <div style={{
      background:'rgba(124,92,191,.06)', border:'1px solid rgba(124,92,191,.15)',
      borderRadius:'8px', padding:'.5rem .75rem', fontSize:'.75rem',
      color:'#c4a8ff', marginBottom:'.75rem',
    }}>💡 {children}</div>
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

function Loading({ text }: { text?: string } = {}) {
  return <div style={{ minHeight:'100vh', background:'#08080f', display:'flex', alignItems:'center', justifyContent:'center', color:'#7070a0' }}>{text || 'Cargando...'}</div>
}

// ── Estilos ──
const cardStyle: React.CSSProperties = {
  background:'#0e0e1a', border:'1px solid rgba(255,255,255,.07)',
  borderRadius:'14px', padding:'1.5rem',
}
const inputStyle: React.CSSProperties = {
  width:'100%', background:'#141422', border:'1px solid rgba(255,255,255,.1)',
  borderRadius:'8px', padding:'.5rem .75rem', color:'#f0f0fc',
  fontSize:'.8125rem', outline:'none', fontFamily:'inherit',
}
const btnPrimaryStyle: React.CSSProperties = {
  background:'#7c5cbf', color:'#fff', border:'none', borderRadius:'8px',
  padding:'.5rem 1rem', fontSize:'.8125rem', fontWeight:600, cursor:'pointer',
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
  color:'#7070a0', borderRadius:'8px', padding:'.5rem .875rem',
  fontSize:'.8125rem', cursor:'pointer', fontFamily:'inherit',
}
const emptyStyle: React.CSSProperties = {
  padding:'3rem 2rem', textAlign:'center', color:'#5a5a7a', fontSize:'.875rem',
  background:'#0e0e1a', border:'1px dashed rgba(255,255,255,.07)', borderRadius:'10px',
}
