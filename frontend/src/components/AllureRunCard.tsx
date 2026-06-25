'use client'

interface Run {
  id:           string
  name:         string | null
  source:       string
  status:       string
  totalTests:   number
  passed:       number
  failed:       number
  broken:       number
  skipped:      number
  passRate:     string | null
  durationMs:   number | null
  branch:       string | null
  environment:  string | null
  buildNumber:  string | null
  shareEnabled?: boolean
  reportUrl?:   string | null
  createdAt:    string
}

interface Props {
  run:        Run
  showProject?: boolean
  projectName?: string
  onClick?:    () => void
}

export default function AllureRunCard({ run, showProject, projectName, onClick }: Props) {
  const passRate = parseFloat(run.passRate || '0')
  const passColor = passRate >= 90 ? '#22c55e' : passRate >= 70 ? '#f59e0b' : '#ef4444'
  const isComplete = run.status === 'completed'

  return (
    <div
      onClick={onClick}
      style={{
        background: '#0e0e1a',
        border: '1px solid rgba(255,255,255,.07)',
        borderRadius: 12, padding: '1rem 1.25rem',
        display: 'flex', gap: '1rem', alignItems: 'center',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'border-color .15s',
      }}
      onMouseEnter={onClick ? (e: any) => e.currentTarget.style.borderColor = 'rgba(124,92,191,.3)' : undefined}
      onMouseLeave={onClick ? (e: any) => e.currentTarget.style.borderColor = 'rgba(255,255,255,.07)' : undefined}
    >
      {/* Pass rate ring */}
      <div style={{ flexShrink: 0, position: 'relative', width: 64, height: 64 }}>
        {isComplete ? (
          <>
            <svg width={64} height={64} style={{ transform: 'rotate(-90deg)' }}>
              <circle cx={32} cy={32} r={26} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth={5}/>
              <circle cx={32} cy={32} r={26} fill="none" stroke={passColor} strokeWidth={5}
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 26}`}
                strokeDashoffset={`${2 * Math.PI * 26 * (1 - passRate / 100)}`}
                style={{ transition: 'stroke-dashoffset .8s' }}/>
            </svg>
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '.875rem', fontWeight: 700, color: passColor,
            }}>{Math.round(passRate)}%</div>
          </>
        ) : (
          <StatusIcon status={run.status}/>
        )}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: '.9375rem', color: '#f0f0fc', fontWeight: 600,
          marginBottom: '.25rem',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {showProject && projectName ? <span style={{ color: '#7070a0' }}>{projectName} · </span> : null}
          {run.name || `${run.source} run`}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.375rem', fontSize: '.7rem', marginBottom: '.375rem' }}>
          <SourceBadge source={run.source}/>
          {run.environment && <span style={chipStyle}>🌍 {run.environment}</span>}
          {run.branch && <span style={chipStyle}>🌿 {run.branch}</span>}
          {run.buildNumber && <span style={chipStyle}>#{run.buildNumber}</span>}
          {run.shareEnabled && <span style={{ ...chipStyle, color: '#c4a8ff' }}>🔗 Compartido</span>}
        </div>

        {isComplete && (
          <div style={{
            display: 'flex', gap: '.625rem', fontSize: '.7rem', color: '#7070a0',
            flexWrap: 'wrap',
          }}>
            <span style={{ color: '#22c55e' }}>✓ {run.passed}</span>
            {run.failed > 0 && <span style={{ color: '#f87171' }}>✗ {run.failed}</span>}
            {run.broken > 0 && <span style={{ color: '#f97316' }}>⚠ {run.broken}</span>}
            {run.skipped > 0 && <span style={{ color: '#7070a0' }}>⊘ {run.skipped}</span>}
            <span>{run.totalTests} tests</span>
            {run.durationMs && <span>{(run.durationMs / 1000).toFixed(1)}s</span>}
            <span>· {_formatRelative(run.createdAt)}</span>
          </div>
        )}

        {!isComplete && (
          <div style={{ fontSize: '.7rem', color: '#7070a0' }}>
            {_formatRelative(run.createdAt)}
          </div>
        )}
      </div>

      {onClick && <span style={{ color: '#7070a0', fontSize: '1.125rem' }}>→</span>}
    </div>
  )
}

function StatusIcon({ status }: { status: string }) {
  const meta: Record<string, { bg: string; color: string; icon: string }> = {
    pending:    { bg: 'rgba(255,255,255,.05)',  color: '#7070a0', icon: '○' },
    processing: { bg: 'rgba(38,181,170,.12)',   color: '#26b5aa', icon: '⏳' },
    failed:     { bg: 'rgba(239,68,68,.12)',    color: '#f87171', icon: '✗' },
  }
  const m = meta[status] || meta.pending
  return (
    <div style={{
      width: 64, height: 64, borderRadius: '50%',
      background: m.bg, border: `2px solid ${m.color}33`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '1.5rem', color: m.color,
    }}>{m.icon}</div>
  )
}

function SourceBadge({ source }: { source: string }) {
  const labels: Record<string, { label: string; color: string; bg: string }> = {
    suite_run: { label: '📦 Suite Run', color: '#26b5aa', bg: 'rgba(38,181,170,.12)' },
    upload:    { label: '⬆️ Upload',    color: '#c4a8ff', bg: 'rgba(196,168,255,.12)' },
    manual:    { label: '✋ Manual',    color: '#7070a0', bg: 'rgba(255,255,255,.04)' },
    ci:        { label: '🤖 CI/CD',    color: '#84cc16', bg: 'rgba(132,204,22,.12)' },
  }
  const m = labels[source] || { label: source, color: '#7070a0', bg: 'rgba(255,255,255,.04)' }
  return (
    <span style={{
      background: m.bg, color: m.color,
      padding: '.125rem .5rem', borderRadius: 4,
      fontSize: '.65rem', fontWeight: 600,
    }}>{m.label}</span>
  )
}

function _formatRelative(iso: string): string {
  const d = new Date(iso)
  const diffSec = (Date.now() - d.getTime()) / 1000
  if (diffSec < 60) return 'hace un momento'
  if (diffSec < 3600) return `hace ${Math.floor(diffSec / 60)} min`
  if (diffSec < 86400) return `hace ${Math.floor(diffSec / 3600)} h`
  if (diffSec < 2592000) return `hace ${Math.floor(diffSec / 86400)} d`
  return d.toLocaleDateString('es-MX')
}

const chipStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,.04)', color: '#7070a0',
  padding: '.125rem .5rem', borderRadius: 4,
  fontSize: '.65rem', fontWeight: 600,
}
