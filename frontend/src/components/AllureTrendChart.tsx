'use client'

import { useMemo } from 'react'

interface DataPoint {
  id:         string
  totalTests: number
  passed:     number
  failed:     number
  broken:     number
  passRate:   string | null
  durationMs: number | null
  createdAt:  string
}

interface Props {
  series:      DataPoint[]
  onPointClick?: (point: DataPoint) => void
}

export default function AllureTrendChart({ series, onPointClick }: Props) {
  if (series.length === 0) {
    return (
      <div style={{
        padding: '2rem', textAlign: 'center',
        background: '#0e0e1a',
        border: '1px dashed rgba(255,255,255,.07)',
        borderRadius: 10,
        color: '#7070a0', fontSize: '.875rem',
      }}>
        Aún no hay runs suficientes para mostrar tendencias.
      </div>
    )
  }

  const { width, height, padding } = { width: 800, height: 240, padding: 40 }
  const innerW = width - padding * 2
  const innerH = height - padding * 1.5

  const data = useMemo(() => {
    return series.map((p, i) => {
      const rate = parseFloat(p.passRate || '0')
      return {
        ...p,
        rate,
        x: padding + (i / Math.max(series.length - 1, 1)) * innerW,
        y: padding + ((100 - rate) / 100) * innerH,
      }
    })
  }, [series])

  const pathD = data.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  const areaD = `${pathD} L ${data[data.length-1].x} ${padding + innerH} L ${data[0].x} ${padding + innerH} Z`

  const last  = series[series.length - 1]
  const first = series[0]
  const lastRate  = parseFloat(last.passRate  || '0')
  const firstRate = parseFloat(first.passRate || '0')
  const delta = series.length > 1 ? lastRate - firstRate : 0

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
            Pass rate · histórico
          </h3>
          <div style={{ fontSize: '.75rem', color: '#7070a0' }}>
            {series.length} runs · {_formatDate(first.createdAt)} → {_formatDate(last.createdAt)}
          </div>
        </div>
        {series.length > 1 && Math.abs(delta) > 0.5 && (
          <div style={{
            background: delta >= 0 ? 'rgba(34,197,94,.12)' : 'rgba(239,68,68,.12)',
            color: delta >= 0 ? '#22c55e' : '#f87171',
            padding: '.375rem .75rem', borderRadius: 8,
            fontSize: '.8125rem', fontWeight: 600,
          }}>
            {delta >= 0 ? '↑' : '↓'} {delta >= 0 ? '+' : ''}{delta.toFixed(1)}%
          </div>
        )}
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet"
        style={{ width: '100%', height: 'auto', display: 'block' }}>
        <defs>
          <linearGradient id="allureTrendArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#26b5aa" stopOpacity={0.4}/>
            <stop offset="100%" stopColor="#26b5aa" stopOpacity={0.0}/>
          </linearGradient>
        </defs>

        {[0, 25, 50, 75, 100].map(v => {
          const y = padding + ((100 - v) / 100) * innerH
          return (
            <g key={v}>
              <line x1={padding} y1={y} x2={width - padding} y2={y}
                stroke="rgba(255,255,255,.05)" strokeDasharray="3 3"/>
              <text x={padding - 6} y={y + 3} fontSize="10" fill="#5a5a7a" textAnchor="end"
                fontFamily="JetBrains Mono, monospace">{v}%</text>
            </g>
          )
        })}

        {/* Target line at 90% */}
        <line x1={padding} y1={padding + (10/100)*innerH}
          x2={width - padding} y2={padding + (10/100)*innerH}
          stroke="#22c55e" strokeOpacity={0.3} strokeDasharray="2 4"/>

        <path d={areaD} fill="url(#allureTrendArea)"/>
        <path d={pathD} fill="none" stroke="#26b5aa" strokeWidth={2.5}
          strokeLinecap="round" strokeLinejoin="round"/>

        {data.map(p => {
          const color = p.rate >= 90 ? '#22c55e' : p.rate >= 70 ? '#f59e0b' : '#ef4444'
          return (
            <g key={p.id}
              onClick={() => onPointClick?.(p)}
              style={{ cursor: onPointClick ? 'pointer' : 'default' }}>
              <circle cx={p.x} cy={p.y} r={5}
                fill="#0e0e1a" stroke={color} strokeWidth={2.5}/>
              <title>{`${_formatDate(p.createdAt)}: ${p.rate.toFixed(1)}% (${p.totalTests} tests)`}</title>
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
    return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })
  } catch { return iso }
}
