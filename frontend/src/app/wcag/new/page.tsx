'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth }              from '@/hooks/useAuth'
import { api, logout }          from '@/lib/api'

interface Target {
  id:   string
  name: string
  url:  string
  defaultLevel: string
}

export default function NewWcagAnalysisPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const targetIdParam = searchParams?.get('targetId') || null
  const { user, loading } = useAuth(true)

  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [level, setLevel] = useState<'A' | 'AA' | 'AAA'>('AA')
  const [device, setDevice] = useState('desktop')
  const [generateSimulations, setGenerateSimulations] = useState(true)
  const [useAi, setUseAi] = useState(true)
  const [generatePdf, setGeneratePdf] = useState(true)

  const [targets, setTargets] = useState<Target[]>([])
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(targetIdParam)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user) return
    if (user.plan !== 'teammate') { router.push('/pricing'); return }
    loadTargets()
  }, [user])

  useEffect(() => {
    // Si viene un targetId en la URL, prellenar
    if (selectedTargetId && targets.length > 0) {
      const t = targets.find(t => t.id === selectedTargetId)
      if (t) {
        setUrl(t.url)
        setName(t.name)
        setLevel(t.defaultLevel as any)
      }
    }
  }, [selectedTargetId, targets])

  async function loadTargets() {
    try {
      const r = await api.get('/api/wcag/targets')
      setTargets(r.data || [])
    } catch {}
  }

  async function submit() {
    setError('')
    if (!url.trim()) { setError('URL requerida'); return }
    if (!_isValidUrl(url)) { setError('URL inválida'); return }

    setSubmitting(true)
    try {
      const r = await api.post('/api/wcag/analyses', {
        targetId:  selectedTargetId || undefined,
        url:       url.trim(),
        name:      name.trim() || undefined,
        level,
        deviceId:  device,
        config: {
          skipSimulations: !generateSimulations,
          useAi,
          generatePdf,
        },
      })
      router.push(`/wcag/${r.data.id}`)
    } catch (err: any) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  if (loading) return <Loading/>
  if (!user) return null

  return (
    <div style={{ minHeight: '100vh', background: '#08080f', color: '#c4c4d8', fontFamily: 'Inter,system-ui,sans-serif' }}>
      <Nav user={user}/>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '2rem 1.5rem' }}>
        <a href="/wcag" style={{ color: '#7070a0', fontSize: '.8125rem', textDecoration: 'none' }}>
          ← Volver a WCAG
        </a>
        <h1 style={{
          fontSize: '1.625rem', fontWeight: 700, color: '#f0f0fc',
          marginTop: '.5rem', marginBottom: '.25rem',
        }}>
          ♿ Nuevo análisis de accesibilidad
        </h1>
        <p style={{ color: '#7070a0', fontSize: '.9375rem', marginBottom: '1.5rem' }}>
          Analiza una URL contra ~95 reglas WCAG + análisis estructural, de teclado y visual
        </p>

        <div style={cardStyle}>
          {/* Target opcional */}
          {targets.length > 0 && (
            <Section title="Target (opcional)">
              <Field label="¿Asociar este análisis a un target trackeado?">
                <select
                  value={selectedTargetId || ''}
                  onChange={e => setSelectedTargetId(e.target.value || null)}
                  style={inputStyle}
                >
                  <option value="">Sin target — Análisis único</option>
                  {targets.map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.url})</option>
                  ))}
                </select>
              </Field>
              {selectedTargetId && (
                <Hint>
                  ℹ️ Al asociar a un target, este análisis contará para el histórico y la gráfica de evolución.
                </Hint>
              )}
            </Section>
          )}

          {/* URL */}
          <Section title="URL a analizar">
            <Field label="Dirección web">
              <input
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://misitio.com/checkout"
                style={inputStyle}
                autoFocus={!selectedTargetId}
              />
            </Field>
            <Field label="Nombre del análisis (opcional)">
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Ej. Página de checkout - Q1 2026"
                style={inputStyle}
              />
            </Field>
          </Section>

          {/* Nivel WCAG */}
          <Section title="Nivel de conformidad">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '.625rem' }}>
              <LevelOption
                selected={level === 'A'}
                onClick={() => setLevel('A')}
                title="A"
                desc="Mínimo"
                detail="Reglas básicas (~25)"
              />
              <LevelOption
                selected={level === 'AA'}
                onClick={() => setLevel('AA')}
                title="AA"
                desc="Recomendado"
                detail="Estándar legal (~50)"
                highlight
              />
              <LevelOption
                selected={level === 'AAA'}
                onClick={() => setLevel('AAA')}
                title="AAA"
                desc="Máximo"
                detail="Requiere Advance+"
                locked
              />
            </div>
            {level === 'AAA' && user.plan === 'teammate' && (
              <div style={{
                marginTop: '.5rem',
                background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)',
                borderRadius: 8, padding: '.5rem .75rem', fontSize: '.75rem',
                color: '#f87171',
              }}>
                ⚠ Nivel AAA requiere plan Advance. El análisis fallará con tu plan actual.
              </div>
            )}
          </Section>

          {/* Device */}
          <Section title="Tipo de dispositivo">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '.625rem' }}>
              <DeviceOption
                selected={device === 'desktop'}
                onClick={() => setDevice('desktop')}
                icon="🖥️" label="Desktop" detail="1280×800"
              />
              <DeviceOption
                selected={device === 'iphone-15'}
                onClick={() => setDevice('iphone-15')}
                icon="📱" label="iPhone" detail="Mobile"
              />
              <DeviceOption
                selected={device === 'ipad-pro'}
                onClick={() => setDevice('ipad-pro')}
                icon="📱" label="iPad" detail="Tablet"
              />
            </div>
          </Section>

          {/* Opciones */}
          <Section title="Opciones avanzadas">
            <ToggleOption
              checked={generateSimulations}
              onChange={setGenerateSimulations}
              label="Generar simulaciones de daltonismo"
              desc="Captura screenshots con filtros de protanopia, deuteranopia, tritanopia y visión reducida"
            />
            <ToggleOption
              checked={useAi}
              onChange={setUseAi}
              label="Usar IA para traducir errores técnicos"
              desc="Convierte mensajes técnicos en explicaciones claras en español (un poco más lento)"
            />
            <ToggleOption
              checked={generatePdf}
              onChange={setGeneratePdf}
              label="Generar reporte PDF"
              desc="Útil para compartir con stakeholders no técnicos"
            />
          </Section>

          {/* Resumen y submit */}
          <div style={{
            background: 'rgba(124,92,191,.06)',
            border: '1px solid rgba(124,92,191,.15)',
            borderRadius: 8, padding: '.75rem 1rem', marginBottom: '1rem',
          }}>
            <div style={{ fontSize: '.75rem', color: '#c4a8ff', fontWeight: 600, marginBottom: '.25rem' }}>
              📊 Lo que se va a analizar
            </div>
            <div style={{ fontSize: '.75rem', color: '#7070a0', lineHeight: 1.5 }}>
              ✓ ~95 reglas axe-core (WCAG {level})<br/>
              ✓ Estructura HTML (headings, landmarks, skip links)<br/>
              ✓ Navegación con teclado (tab order, focus visible, trampas)<br/>
              ✓ Diseño visual (touch targets, tamaño de texto)<br/>
              ✓ Carga cognitiva (paredes de texto, complejidad)
              {generateSimulations && <><br/>✓ 5 simulaciones visuales de daltonismo</>}
              {useAi && <><br/>✓ Traducción IA a lenguaje humano</>}
              {generatePdf && <><br/>✓ Reporte PDF descargable</>}
            </div>
            <div style={{ marginTop: '.5rem', fontSize: '.7rem', color: '#5a5a7a' }}>
              Tiempo estimado: ~15-30 segundos
            </div>
          </div>

          {error && (
            <div style={{
              background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)',
              borderRadius: 8, padding: '.625rem .75rem', fontSize: '.8125rem',
              color: '#f87171', marginBottom: '1rem',
            }}>{error}</div>
          )}

          <div style={{ display: 'flex', gap: '.5rem' }}>
            <button onClick={() => router.push('/wcag')} style={btnGhostStyle}>
              Cancelar
            </button>
            <button onClick={submit} disabled={submitting || !url.trim()} style={{
              ...btnPrimaryStyle, flex: 1,
              opacity: (submitting || !url.trim()) ? .6 : 1,
              cursor: (submitting || !url.trim()) ? 'not-allowed' : 'pointer',
            }}>
              {submitting ? 'Iniciando análisis...' : '🔍 Iniciar análisis'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Componentes ──

function Section({ title, children }: any) {
  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <div style={{
        fontSize: '.75rem', fontWeight: 600, color: '#7070a0',
        textTransform: 'uppercase', letterSpacing: '.05em',
        marginBottom: '.625rem',
      }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function Field({ label, children }: any) {
  return (
    <div style={{ marginBottom: '.75rem' }}>
      <label style={{
        display: 'block', fontSize: '.75rem', color: '#7070a0',
        marginBottom: '.25rem', fontWeight: 500,
      }}>{label}</label>
      {children}
    </div>
  )
}

function LevelOption({ selected, onClick, title, desc, detail, highlight, locked }: any) {
  return (
    <button onClick={onClick} style={{
      textAlign: 'center', padding: '.875rem',
      background: selected ? 'rgba(124,92,191,.18)' : '#141422',
      border: `1px solid ${selected ? '#7c5cbf' : highlight ? 'rgba(124,92,191,.3)' : 'rgba(255,255,255,.07)'}`,
      borderRadius: 10, cursor: 'pointer',
      fontFamily: 'inherit', position: 'relative',
    }}>
      {highlight && !selected && (
        <span style={{
          position: 'absolute', top: -8, right: 8,
          background: '#7c5cbf', color: '#fff',
          fontSize: '.6rem', fontWeight: 700,
          padding: '.125rem .375rem', borderRadius: 4,
        }}>POPULAR</span>
      )}
      <div style={{ fontSize: '1.25rem', fontWeight: 700, color: selected ? '#c4a8ff' : '#f0f0fc' }}>{title}</div>
      <div style={{ fontSize: '.75rem', color: selected ? '#c4a8ff' : '#c4c4d8', fontWeight: 500 }}>{desc}</div>
      <div style={{ fontSize: '.65rem', color: '#7070a0', marginTop: '.25rem' }}>
        {locked ? '🔒 ' : ''}{detail}
      </div>
    </button>
  )
}

function DeviceOption({ selected, onClick, icon, label, detail }: any) {
  return (
    <button onClick={onClick} style={{
      textAlign: 'center', padding: '.75rem',
      background: selected ? 'rgba(124,92,191,.18)' : '#141422',
      border: `1px solid ${selected ? '#7c5cbf' : 'rgba(255,255,255,.07)'}`,
      borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
    }}>
      <div style={{ fontSize: '1.5rem' }}>{icon}</div>
      <div style={{ fontSize: '.8125rem', color: selected ? '#c4a8ff' : '#f0f0fc', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: '.65rem', color: '#7070a0' }}>{detail}</div>
    </button>
  )
}

function ToggleOption({ checked, onChange, label, desc }: any) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: '.625rem',
      padding: '.625rem .75rem', marginBottom: '.5rem',
      background: '#141422', borderRadius: 8,
      border: `1px solid ${checked ? 'rgba(124,92,191,.2)' : 'rgba(255,255,255,.04)'}`,
      cursor: 'pointer',
    }} onClick={() => onChange(!checked)}>
      <input type="checkbox" checked={checked} onChange={() => onChange(!checked)}
        style={{ width: 16, height: 16, cursor: 'pointer', marginTop: 2, flexShrink: 0 }}/>
      <div>
        <div style={{ fontSize: '.8125rem', color: '#f0f0fc', fontWeight: 500, marginBottom: '.125rem' }}>
          {label}
        </div>
        <div style={{ fontSize: '.7rem', color: '#7070a0' }}>{desc}</div>
      </div>
    </div>
  )
}

function Hint({ children }: any) {
  return (
    <div style={{
      background: 'rgba(124,92,191,.06)', border: '1px solid rgba(124,92,191,.15)',
      borderRadius: 8, padding: '.5rem .75rem', fontSize: '.75rem',
      color: '#c4a8ff', marginTop: '.5rem',
    }}>{children}</div>
  )
}

function Nav({ user }: any) {
  return (
    <nav style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '1rem 2rem', borderBottom: '1px solid rgba(255,255,255,.07)', background: '#0e0e1a',
    }}>
      <a href="/wcag" style={{ color: '#c4a8ff', textDecoration: 'none', fontSize: '.875rem' }}>← WCAG</a>
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

function _isValidUrl(u: string): boolean {
  try {
    const url = new URL(u)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch { return false }
}

const cardStyle: React.CSSProperties = {
  background: '#0e0e1a', border: '1px solid rgba(255,255,255,.07)',
  borderRadius: 14, padding: '1.5rem',
}
const inputStyle: React.CSSProperties = {
  width: '100%', background: '#141422',
  border: '1px solid rgba(255,255,255,.1)', borderRadius: 8,
  padding: '.5rem .75rem', color: '#f0f0fc',
  fontSize: '.875rem', outline: 'none', fontFamily: 'inherit',
}
const btnPrimaryStyle: React.CSSProperties = {
  background: '#7c5cbf', color: '#fff', border: 'none', borderRadius: 8,
  padding: '.625rem 1rem', fontSize: '.875rem', fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit',
  boxShadow: '0 4px 20px rgba(124,92,191,.4)',
}
const btnGhostStyle: React.CSSProperties = {
  background: 'transparent', border: '1px solid rgba(255,255,255,.1)',
  color: '#7070a0', borderRadius: 8,
  padding: '.625rem 1rem', fontSize: '.8125rem',
  cursor: 'pointer', fontFamily: 'inherit',
}
