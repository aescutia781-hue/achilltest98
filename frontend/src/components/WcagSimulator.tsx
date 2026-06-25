'use client'

interface Simulation {
  url:   string
  label: string
}

interface Props {
  original?:    string
  simulations?: Record<string, Simulation>
}

export default function WcagSimulator({ original, simulations }: Props) {
  if (!simulations || Object.keys(simulations).length === 0) return null

  const items: Array<{ key: string; url: string; label: string; description: string }> = []

  if (original) {
    items.push({
      key: 'original',
      url: original,
      label: 'Visión normal',
      description: 'Cómo se ve tu sitio para la mayoría de usuarios',
    })
  }

  const descriptions: Record<string, string> = {
    protanopia:    'No distingue rojos (1% de los hombres)',
    deuteranopia:  'No distingue verdes (6% de los hombres)',
    tritanopia:    'No distingue azules (<0.01% de la población)',
    achromatopsia: 'Solo ve escala de grises',
    low_vision:    'Visión borrosa o reducida',
  }

  for (const [key, sim] of Object.entries(simulations)) {
    items.push({
      key,
      url: sim.url,
      label: sim.label,
      description: descriptions[key] || '',
    })
  }

  return (
    <div>
      <div style={{
        background: 'rgba(124,92,191,.06)',
        border: '1px solid rgba(124,92,191,.15)',
        borderRadius: 10, padding: '.875rem 1rem', marginBottom: '1rem',
      }}>
        <div style={{ fontSize: '.8125rem', color: '#c4a8ff', fontWeight: 600, marginBottom: '.25rem' }}>
          👁️ Cómo se ve tu sitio para distintos usuarios
        </div>
        <div style={{ fontSize: '.75rem', color: '#7070a0' }}>
          Más del 8% de los hombres tiene algún tipo de daltonismo. Si tu sitio usa
          color para transmitir información (rojo = error, verde = éxito), revisa que
          estos usuarios también lo entiendan.
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '.875rem',
      }}>
        {items.map(item => (
          <div key={item.key} style={{
            background: '#0e0e1a', border: '1px solid rgba(255,255,255,.07)',
            borderRadius: 10, overflow: 'hidden',
          }}>
            <div style={{
              position: 'relative',
              width: '100%', aspectRatio: '16/10',
              background: '#08080f',
              overflow: 'hidden',
            }}>
              <img
                src={item.url}
                alt={item.label}
                loading="lazy"
                style={{
                  width: '100%', height: '100%',
                  objectFit: 'cover', objectPosition: 'top',
                  display: 'block',
                }}
              />
            </div>
            <div style={{ padding: '.625rem .75rem' }}>
              <div style={{
                fontSize: '.8125rem', fontWeight: 600, color: '#f0f0fc',
                marginBottom: '.125rem',
              }}>
                {item.label}
              </div>
              <div style={{ fontSize: '.7rem', color: '#7070a0' }}>
                {item.description}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
