'use client'

import { useState } from 'react'

interface Issue {
  id:                  string
  ruleId:              string
  source:              string
  category:            string | null
  severity:            'critical' | 'high' | 'medium' | 'low'
  wcagCriterion:       string | null
  wcagLevel:           string | null
  affectedUsers:       string[]
  selector:            string | null
  htmlSnippet:         string | null
  ruleDescription:     string
  humanTitle:          string | null
  humanDescription:    string | null
  humanImpact:         string | null
  humanFixSuggestion:  string | null
  fixCodeSnippet:      string | null
  status:              string
}

interface Props {
  issues:        Issue[]
  filterCategory?: string | null
  onStatusChange?: (issueId: string, newStatus: 'resolved' | 'ignored' | 'open') => Promise<void>
}

const USER_GROUPS: Record<string, { label: string; icon: string }> = {
  blind:       { label: 'Ciegas (lector pantalla)', icon: '👁️‍🗨️' },
  low_vision:  { label: 'Baja visión',              icon: '👓' },
  color_blind: { label: 'Daltonismo',               icon: '🎨' },
  motor:       { label: 'Mov. limitada',            icon: '✋' },
  cognitive:   { label: 'Cognitiva',                icon: '🧠' },
  deaf:        { label: 'Sordas',                   icon: '🦻' },
  keyboard:    { label: 'Solo teclado',             icon: '⌨️' },
  mobile:      { label: 'Móvil',                    icon: '📱' },
  elderly:     { label: 'Adultos mayores',          icon: '👵' },
  situational: { label: 'Situacional',              icon: '☀️' },
}

const SEVERITY_META: Record<string, { label: string; color: string; bg: string; emoji: string }> = {
  critical: { label: 'Críticos', color: '#ef4444', bg: 'rgba(239,68,68,.12)',  emoji: '🔴' },
  high:     { label: 'Altos',    color: '#f97316', bg: 'rgba(249,115,22,.12)', emoji: '🟠' },
  medium:   { label: 'Medios',   color: '#f59e0b', bg: 'rgba(245,158,11,.12)', emoji: '🟡' },
  low:      { label: 'Bajos',    color: '#84cc16', bg: 'rgba(132,204,22,.12)', emoji: '🟢' },
}

export default function WcagIssuesList({ issues, filterCategory, onStatusChange }: Props) {
  const filtered = filterCategory
    ? issues.filter(i => i.category === filterCategory)
    : issues

  const grouped: Record<string, Issue[]> = {
    critical: [],
    high:     [],
    medium:   [],
    low:      [],
  }
  for (const i of filtered) {
    if (i.status === 'open' || i.status === undefined) {
      grouped[i.severity]?.push(i)
    }
  }

  // Mostrar también resueltos/ignorados al final
  const resolved = filtered.filter(i => i.status === 'resolved')
  const ignored  = filtered.filter(i => i.status === 'ignored')

  if (filtered.length === 0) {
    return (
      <div style={{
        padding: '3rem 2rem', textAlign: 'center',
        background: 'rgba(34,197,94,.08)',
        border: '1px solid rgba(34,197,94,.2)',
        borderRadius: '12px',
      }}>
        <div style={{ fontSize: '3rem', marginBottom: '.5rem' }}>🎉</div>
        <h3 style={{ color: '#22c55e', fontSize: '1.125rem', marginBottom: '.25rem' }}>
          ¡Sin problemas detectados!
        </h3>
        <p style={{ color: '#7070a0', fontSize: '.875rem' }}>
          {filterCategory ? `Esta categoría no tiene issues.` : 'Tu sitio cumple con todas las reglas analizadas.'}
        </p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {(['critical', 'high', 'medium', 'low'] as const).map(sev => {
        const list = grouped[sev]
        if (list.length === 0) return null
        return <SeverityGroup key={sev} severity={sev} issues={list} onStatusChange={onStatusChange}/>
      })}

      {resolved.length > 0 && (
        <details style={collapsedGroupStyle}>
          <summary style={{ cursor: 'pointer', padding: '.875rem 1rem', fontSize: '.8125rem', color: '#22c55e', fontWeight: 600 }}>
            ✓ Resueltos ({resolved.length})
          </summary>
          {resolved.map(i => <IssueCard key={i.id} issue={i} onStatusChange={onStatusChange}/>)}
        </details>
      )}

      {ignored.length > 0 && (
        <details style={collapsedGroupStyle}>
          <summary style={{ cursor: 'pointer', padding: '.875rem 1rem', fontSize: '.8125rem', color: '#7070a0', fontWeight: 600 }}>
            ⊘ Ignorados ({ignored.length})
          </summary>
          {ignored.map(i => <IssueCard key={i.id} issue={i} onStatusChange={onStatusChange}/>)}
        </details>
      )}
    </div>
  )
}

function SeverityGroup({ severity, issues, onStatusChange }: any) {
  const meta = SEVERITY_META[severity]
  const [open, setOpen] = useState(true)

  return (
    <div style={{
      background: '#0e0e1a', border: '1px solid rgba(255,255,255,.07)',
      borderRadius: '12px', overflow: 'hidden',
    }}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          padding: '.875rem 1.125rem', cursor: 'pointer',
          background: meta.bg, borderBottom: open ? `1px solid rgba(255,255,255,.07)` : 'none',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
          <span style={{ fontSize: '1rem' }}>{meta.emoji}</span>
          <span style={{ fontSize: '.9375rem', fontWeight: 600, color: meta.color }}>
            {meta.label}
          </span>
          <span style={{
            background: 'rgba(0,0,0,.25)', color: meta.color,
            padding: '.125rem .5rem', borderRadius: '12px',
            fontSize: '.7rem', fontWeight: 700,
          }}>{issues.length}</span>
        </div>
        <span style={{ color: meta.color, fontSize: '.875rem', fontWeight: 600 }}>
          {open ? '−' : '+'}
        </span>
      </div>

      {open && (
        <div>
          {issues.map((i: Issue) => (
            <IssueCard key={i.id} issue={i} onStatusChange={onStatusChange}/>
          ))}
        </div>
      )}
    </div>
  )
}

function IssueCard({ issue, onStatusChange }: { issue: Issue; onStatusChange?: any }) {
  const [expanded, setExpanded] = useState(false)
  const [updating, setUpdating] = useState(false)
  const meta = SEVERITY_META[issue.severity]

  async function changeStatus(newStatus: 'resolved' | 'ignored' | 'open') {
    if (!onStatusChange) return
    setUpdating(true)
    try { await onStatusChange(issue.id, newStatus) }
    finally { setUpdating(false) }
  }

  return (
    <div style={{
      padding: '1rem 1.125rem',
      borderBottom: '1px solid rgba(255,255,255,.04)',
      opacity: issue.status === 'ignored' ? .5 : 1,
    }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{ cursor: 'pointer', display: 'flex', gap: '.625rem', alignItems: 'flex-start' }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: '.9375rem', fontWeight: 600, color: '#f0f0fc',
            marginBottom: '.25rem',
          }}>
            {issue.humanTitle || issue.ruleDescription || issue.ruleId}
          </div>
          <div style={{
            display: 'flex', gap: '.375rem', flexWrap: 'wrap',
            fontSize: '.6875rem',
          }}>
            {issue.wcagCriterion && (
              <span style={chipStyle}>
                WCAG {issue.wcagCriterion} {issue.wcagLevel || ''}
              </span>
            )}
            {issue.category && (
              <span style={chipStyle}>{issue.category}</span>
            )}
            {issue.source && (
              <span style={{ ...chipStyle, color: '#c4a8ff' }}>{issue.source}</span>
            )}
          </div>
        </div>
        <span style={{
          color: meta.color, fontSize: '.875rem', fontWeight: 600,
          transition: 'transform .15s',
          transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
        }}>⌄</span>
      </div>

      {expanded && (
        <div style={{
          marginTop: '.75rem', paddingTop: '.75rem',
          borderTop: '1px solid rgba(255,255,255,.04)',
        }}>
          {issue.humanDescription && (
            <DetailRow label="Problema">{issue.humanDescription}</DetailRow>
          )}
          {issue.humanImpact && (
            <DetailRow label="Impacto">{issue.humanImpact}</DetailRow>
          )}
          {issue.humanFixSuggestion && (
            <DetailRow label="💡 Cómo arreglarlo">
              {issue.humanFixSuggestion}
            </DetailRow>
          )}
          {issue.fixCodeSnippet && (
            <DetailRow label="Ejemplo de código">
              <pre style={codeBlockStyle}>{issue.fixCodeSnippet}</pre>
            </DetailRow>
          )}
          {issue.selector && (
            <DetailRow label="Dónde está">
              <code style={selectorStyle}>{issue.selector}</code>
            </DetailRow>
          )}
          {issue.htmlSnippet && (
            <DetailRow label="HTML afectado">
              <pre style={codeBlockStyle}>{issue.htmlSnippet}</pre>
            </DetailRow>
          )}
          {issue.affectedUsers?.length > 0 && (
            <DetailRow label="Afecta a">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.25rem' }}>
                {issue.affectedUsers.map(uid => {
                  const g = USER_GROUPS[uid]
                  if (!g) return null
                  return (
                    <span key={uid} style={userPillStyle}>
                      {g.icon} {g.label}
                    </span>
                  )
                })}
              </div>
            </DetailRow>
          )}

          {onStatusChange && (
            <div style={{ display: 'flex', gap: '.375rem', marginTop: '.875rem' }}>
              {issue.status === 'open' && (
                <>
                  <button
                    onClick={() => changeStatus('resolved')}
                    disabled={updating}
                    style={actionBtnStyle('#22c55e')}
                  >
                    ✓ Marcar resuelto
                  </button>
                  <button
                    onClick={() => changeStatus('ignored')}
                    disabled={updating}
                    style={actionBtnStyle('#7070a0')}
                  >
                    ⊘ Ignorar
                  </button>
                </>
              )}
              {issue.status !== 'open' && (
                <button
                  onClick={() => changeStatus('open')}
                  disabled={updating}
                  style={actionBtnStyle('#c4a8ff')}
                >
                  ↺ Reabrir
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function DetailRow({ label, children }: any) {
  return (
    <div style={{ marginBottom: '.625rem' }}>
      <div style={{
        fontSize: '.6875rem', color: '#7070a0', fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '.04em',
        marginBottom: '.25rem',
      }}>
        {label}
      </div>
      <div style={{ fontSize: '.8125rem', color: '#c4c4d8', lineHeight: 1.5 }}>
        {children}
      </div>
    </div>
  )
}

const chipStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,.05)', color: '#7070a0',
  padding: '.125rem .375rem', borderRadius: 4,
  fontSize: '.65rem', fontWeight: 600,
}
const userPillStyle: React.CSSProperties = {
  background: 'rgba(196,168,255,.1)', color: '#c4a8ff',
  padding: '.1875rem .5rem', borderRadius: 12,
  fontSize: '.6875rem',
}
const codeBlockStyle: React.CSSProperties = {
  background: '#08080f', padding: '.5rem .625rem', borderRadius: 6,
  fontSize: '.6875rem', color: '#a3e635',
  fontFamily: 'JetBrains Mono, monospace',
  overflow: 'auto', maxHeight: 200, margin: 0,
  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
}
const selectorStyle: React.CSSProperties = {
  background: '#141422', padding: '.125rem .375rem', borderRadius: 4,
  fontSize: '.7rem', color: '#c4a8ff',
  fontFamily: 'JetBrains Mono, monospace',
}
const collapsedGroupStyle: React.CSSProperties = {
  background: '#0e0e1a', border: '1px solid rgba(255,255,255,.05)',
  borderRadius: 10,
}
function actionBtnStyle(color: string): React.CSSProperties {
  return {
    background: 'transparent', border: `1px solid ${color}33`,
    color, borderRadius: 6,
    padding: '.3125rem .625rem', fontSize: '.7rem', fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit',
  }
}
