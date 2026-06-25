'use client'

interface Props {
  score: number
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
}

const GRADES = [
  { min: 95, grade: 'A+', label: 'Excelente',         color: '#22c55e' },
  { min: 85, grade: 'A',  label: 'Muy bueno',         color: '#22c55e' },
  { min: 75, grade: 'B',  label: 'Bueno',             color: '#84cc16' },
  { min: 65, grade: 'C',  label: 'Aceptable',         color: '#f59e0b' },
  { min: 50, grade: 'D',  label: 'Necesita trabajo',  color: '#f97316' },
  { min: 0,  grade: 'F',  label: 'Crítico',           color: '#ef4444' },
]

export function gradeFor(score: number) {
  return GRADES.find(g => score >= g.min) || GRADES[GRADES.length - 1]
}

export default function WcagScoreCard({ score, size = 'md', showLabel = true }: Props) {
  const g = gradeFor(score)
  const dims = {
    sm: { box: 80,  r: 30, sw: 6,  num: '1.375rem', grade: '.75rem',  label: '.625rem' },
    md: { box: 140, r: 56, sw: 10, num: '2.5rem',   grade: '1rem',    label: '.75rem' },
    lg: { box: 220, r: 90, sw: 14, num: '4.25rem',  grade: '1.625rem',label: '.875rem' },
  }[size]

  const circumference = 2 * Math.PI * dims.r
  const offset = circumference - (score / 100) * circumference

  return (
    <div style={{
      width: dims.box, height: dims.box, position: 'relative',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <svg width={dims.box} height={dims.box} style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}>
        {/* Background */}
        <circle
          cx={dims.box / 2}
          cy={dims.box / 2}
          r={dims.r}
          fill="none"
          stroke="rgba(255,255,255,.08)"
          strokeWidth={dims.sw}
        />
        {/* Progress */}
        <circle
          cx={dims.box / 2}
          cy={dims.box / 2}
          r={dims.r}
          fill="none"
          stroke={g.color}
          strokeWidth={dims.sw}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1s ease-out, stroke 0.3s' }}
        />
      </svg>
      <div style={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
        <div style={{
          fontSize: dims.num, fontWeight: 800, lineHeight: 1, color: g.color,
        }}>{score}</div>
        {showLabel && (
          <>
            <div style={{
              fontSize: dims.grade, fontWeight: 700, color: g.color,
              marginTop: '.125rem', lineHeight: 1,
            }}>{g.grade}</div>
            <div style={{
              fontSize: dims.label, color: '#7070a0', marginTop: '.25rem',
            }}>{g.label}</div>
          </>
        )}
      </div>
    </div>
  )
}
