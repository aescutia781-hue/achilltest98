'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

interface Usage {
  used:  number
  limit: number
  pct:   number
}

interface Metrics {
  plan: string
  usage: {
    executions:     Usage
    suiteRuns:      Usage
    deviceFarmRuns: Usage
  }
  concurrency: {
    activeJobs: number
    limit:      number
  }
}

export function UsageMetrics() {
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const r = await api.get('/api/metrics/user')
        if (!cancelled) setMetrics(r.data)
      } catch {}
      finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    const interval = setInterval(load, 30000)   // Refresh cada 30s
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  if (loading || !metrics) return null

  const isTeammate = metrics.plan === 'teammate'

  return (
    <div style={{
      background:'#0e0e1a', border:'1px solid rgba(255,255,255,.07)',
      borderRadius:'14px', padding:'1.25rem',
    }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem' }}>
        <h3 style={{ fontSize:'.9375rem', fontWeight:600, color:'#f0f0fc' }}>
          📊 Uso este mes
        </h3>
        <span style={{ fontSize:'.7rem', color:'#7070a0' }}>
          Plan: <strong style={{ color:'#c4a8ff' }}>{metrics.plan}</strong>
        </span>
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
        <MetricBar
          label="Ejecuciones individuales"
          used={metrics.usage.executions.used}
          limit={metrics.usage.executions.limit}
          pct={metrics.usage.executions.pct}
        />
        <MetricBar
          label="Suite runs"
          used={metrics.usage.suiteRuns.used}
          limit={metrics.usage.suiteRuns.limit}
          pct={metrics.usage.suiteRuns.pct}
        />
        {isTeammate && (
          <MetricBar
            label="Device Farm runs"
            used={metrics.usage.deviceFarmRuns.used}
            limit={metrics.usage.deviceFarmRuns.limit}
            pct={metrics.usage.deviceFarmRuns.pct}
          />
        )}
      </div>

      {metrics.concurrency.activeJobs > 0 && (
        <div style={{
          marginTop:'1rem', padding:'.625rem .75rem',
          background:'rgba(38,181,170,.08)', borderRadius:'8px',
          border:'1px solid rgba(38,181,170,.15)',
          display:'flex', justifyContent:'space-between', alignItems:'center',
        }}>
          <span style={{ fontSize:'.75rem', color:'#7070a0' }}>
            Jobs corriendo ahora
          </span>
          <span style={{ fontSize:'.8125rem', fontWeight:600, color:'#26b5aa' }}>
            {metrics.concurrency.activeJobs} / {metrics.concurrency.limit}
          </span>
        </div>
      )}
    </div>
  )
}

function MetricBar({ label, used, limit, pct }: { label: string; used: number; limit: number; pct: number }) {
  const color = pct >= 90 ? '#f87171'
              : pct >= 70 ? '#f59e0b'
              :              '#7c5cbf'

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'.25rem' }}>
        <span style={{ fontSize:'.75rem', color:'#c4c4d8' }}>{label}</span>
        <span style={{ fontSize:'.75rem', color:'#7070a0', fontFamily:'monospace' }}>
          {used} / {limit}
        </span>
      </div>
      <div style={{
        height:6, background:'#141422', borderRadius:3, overflow:'hidden',
      }}>
        <div style={{
          height:'100%', width: `${Math.min(100, pct)}%`,
          background: color,
          transition:'width .3s',
        }}/>
      </div>
    </div>
  )
}
