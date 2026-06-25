'use client'

import { useMemo } from 'react'

interface DataPoint {
  id:           string
  score:        number
  totalIssues:  number
  criticalCount: number
  highCount:    number
  createdAt:    string
}

interface Props {
  series:    DataPoint[]
  height?:   number
  onPointClick?: (point: DataPoint) => void
}

export default function WcagTrendChart({ series, height = 220, onPointClick }: Props) {
  if (series.length === 0) {
    return (
      <div style={{
        padding: '2rem', textAlign: 'center',
        background: '#0e0e1a',
        border: '1px dashed rgba(255,255,255,.07)',
        borderRadius: 10,
        color: '#7070a0', fontSize: '.875rem',
      }}>
        Aún no hay datos suficientes para mostrar tendencias.
        <br/>Ejecuta varios análisis para ver la evolución.
      </div>
    )
  }

  const { width, padding } = { width: 800, padding: 40 }
  const innerW = width - padding * 2
  const innerH = height - padding * 1.5

  const data = useMemo(() => {
    return series.map((p, i) => ({
      ...p,
      x: padding + (i / Math.max(series.length - 1, 1)) * innerW,
      y: padding + ((100 - p.score) / 100) * innerH,
    }))
  }, [series])

  const pathD = data.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  const areaD = `${pathD} L ${data[data.length-1].x} ${padding + innerH} L ${data[0].x} ${padding + innerH} Z`

  const first = series[0]
  const last  = series[series.length - 1]
  const delta = series.length > 1 ? last.score - first.score : 0

  return (
    <div style={{
      background: '#0e0e1a', border: '1px solid rgba(255,255,255,.07)',
      borderRadius: 12, padding: '1.25rem',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        marginBottom: '1rem', flexWrap: 'wrap', gap: '.5rem',
      }}>
        <div>
          <h3 style={{
            fontSize: '.9375rem', fontWeight: 600, color: '#f0f0fc',
            marginBottom: '.125rem',
          }}>
            Evolución del score
          </h3>
          <div style={{ fontSize: '.75rem', color: '#7070a0' }}>
            {series.length} análisis · {_formatDate(first.createdAt)} → {_formatDate(last.createdAt)}
          </div>
        </div>
        {series.length > 1 && (
          <div style={{
            background: delta >= 0 ? 'rgba(34,197,94,.12)' : 'rgba(239,68,68,.12)',
            color: delta >= 0 ? '#22c55e' : '#f87171',
            padding: '.375rem .75rem', borderRadius: 8,
            fontSize: '.8125rem', fontWeight: 600,
          }}>
            {delta >= 0 ? '↑' : '↓'} {delta >= 0 ? '+' : ''}{delta} puntos
          </div>
        )}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: '100%', height: 'auto', display: 'block' }}
      >
        <defs>
          <linearGradient id="trendArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#7c5cbf" stopOpacity={0.4}/>
            <stop offset="100%" stopColor="#7c5cbf" stopOpacity={0.0}/>
          </linearGradient>
        </defs>

        {/* Reference lines */}
        {[0, 25, 50, 75, 100].map(v => {
          const y = padding + ((100 - v) / 100) * innerH
          return (
            <g key={v}>
              <line
                x1={padding} y1={y} x2={width - padding} y2={y}
                stroke="rgba(255,255,255,.05)" strokeDasharray="3 3"
              />
              <text
                x={padding - 6} y={y + 3}
                fontSize="10" fill="#5a5a7a" textAnchor="end"
                fontFamily="JetBrains Mono, monospace"
              >{v}</text>
            </g>
          )
        })}

        {/* Pass threshold (75) */}
        <line
          x1={padding} y1={padding + (25/100)*innerH}
          x2={width - padding} y2={padding + (25/100)*innerH}
          stroke="#22c55e" strokeOpacity={0.3} strokeDasharray="2 4"
        />

        {/* Area */}
        <path d={areaD} fill="url(#trendArea)"/>

        {/* Line */}
        <path
          d={pathD}
          fill="none"
          stroke="#7c5cbf"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Points */}
        {data.map((p, i) => {
          const color = p.score >= 75 ? '#22c55e' : p.score >= 50 ? '#f59e0b' : '#ef4444'
          return (
            <g
              key={p.id}
              onClick={() => onPointClick?.(p)}
              style={{ cursor: onPointClick ? 'pointer' : 'default' }}
            >
              <circle
                cx={p.x} cy={p.y}
                r={5}
                fill="#0e0e1a"
                stroke={color}
                strokeWidth={2.5}
              />
              {/* Tooltip on hover via title */}
              <title>{`${_formatDate(p.createdAt)}: ${p.score}/100 · ${p.totalIssues} issues`}</title>
            </g>
          )
        })}
      </svg>

      <div style={{
        display: 'flex', justifyContent: 'space-between',
        marginTop: '.5rem', fontSize: '.65rem', color: '#5a5a7a',
        fontFamily: 'JetBrains Mono, monospace',
      }}>
        <span>{_formatDate(first.createdAt)}</span>
        <span>{_formatDate(last.createdAt)}</span>
      </div>
    </div>
  )
}

function _formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })
  } catch {
    return iso
  }
}
