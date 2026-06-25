'use client'

/**
 * DeviceSelector — Dropdown que muestra todos los dispositivos disponibles
 * agrupados por categoría (Phone, Tablet, Foldable, Desktop)
 * con búsqueda en tiempo real.
 */

import { useEffect, useState, useRef } from 'react'
import { api } from '@/lib/api'

interface Device {
  id:        string
  name:      string
  category:  string
  brand:     string
  frameStyle:string
  viewport:  { width: number; height: number }
  defaultBrowserType: string
}

interface DeviceSelectorProps {
  value:    string                            // device id
  onChange: (deviceId: string, device: Device) => void
  disabled?: boolean
}

const CATEGORY_LABELS: Record<string, string> = {
  phone:    '📱 Phones',
  tablet:   '📋 Tablets',
  foldable: '📲 Foldables',
  desktop:  '💻 Desktop',
}

const BRAND_EMOJI: Record<string, string> = {
  apple:      '🍎',
  samsung:    '📱',
  google:     '🔵',
  motorola:   'Ⓜ️',
  lg:         '◽',
  amazon:     '🔥',
  blackberry: '⚫',
  nokia:      '⬛',
  desktop:    '🖥️',
  other:      '📱',
}

export function DeviceSelector({ value, onChange, disabled }: DeviceSelectorProps) {
  const [devices,  setDevices]  = useState<Device[]>([])
  const [loading,  setLoading]  = useState(true)
  const [open,     setOpen]     = useState(false)
  const [search,   setSearch]   = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Cargar catálogo desde el backend
  useEffect(() => {
    api.get('/api/devices')
      .then(r => setDevices(r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Cerrar dropdown al hacer click afuera
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const selected = devices.find(d => d.id === value)

  // Filtrar por búsqueda
  const filtered = search.trim()
    ? devices.filter(d => d.name.toLowerCase().includes(search.toLowerCase()))
    : devices

  // Agrupar por categoría
  const grouped: Record<string, Device[]> = {}
  for (const d of filtered) {
    if (!grouped[d.category]) grouped[d.category] = []
    grouped[d.category].push(d)
  }

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled || loading}
        style={{
          width:'100%', textAlign:'left',
          background:'#141422',
          border:'1px solid rgba(255,255,255,.1)',
          borderRadius:'8px',
          padding:'.625rem .875rem',
          color:'#f0f0fc',
          fontSize:'.875rem',
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontFamily:'inherit',
          display:'flex', alignItems:'center', justifyContent:'space-between',
          gap:'.5rem',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <span style={{ display:'flex', alignItems:'center', gap:'.5rem', minWidth:0, flex:1 }}>
          <span>{BRAND_EMOJI[selected?.brand || 'other']}</span>
          <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {loading
              ? 'Cargando dispositivos...'
              : selected?.name || 'Seleccionar dispositivo'}
          </span>
          {selected && (
            <span style={{ color:'#7070a0', fontSize:'.75rem', fontFamily:'monospace' }}>
              {selected.viewport.width}×{selected.viewport.height}
            </span>
          )}
        </span>
        <span style={{ color:'#7070a0', fontSize:'.75rem', flexShrink:0 }}>
          {open ? '▴' : '▾'}
        </span>
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position:'absolute', top:'calc(100% + 4px)', left:0, right:0,
          background:'#0e0e1a',
          border:'1px solid rgba(255,255,255,.1)',
          borderRadius:'10px',
          boxShadow:'0 8px 30px rgba(0,0,0,.6)',
          zIndex:50,
          maxHeight:'420px',
          display:'flex', flexDirection:'column',
        }}>
          {/* Búsqueda */}
          <div style={{ padding:'.625rem', borderBottom:'1px solid rgba(255,255,255,.05)' }}>
            <input
              type="text" autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar dispositivo..."
              style={{
                width:'100%', background:'#141422',
                border:'1px solid rgba(255,255,255,.08)',
                borderRadius:'6px', padding:'.4rem .625rem',
                color:'#f0f0fc', fontSize:'.8125rem', outline:'none',
                fontFamily:'inherit',
              }}
            />
          </div>

          {/* Lista */}
          <div style={{ overflowY:'auto', flex:1, padding:'.5rem 0' }}>
            {Object.keys(grouped).length === 0 ? (
              <div style={{ padding:'1rem', textAlign:'center', color:'#7070a0', fontSize:'.8125rem' }}>
                Sin resultados
              </div>
            ) : (
              Object.entries(grouped).map(([cat, list]) => (
                <div key={cat}>
                  <div style={{
                    padding:'.4rem .875rem',
                    fontSize:'.6875rem', fontWeight:600,
                    color:'#7070a0', textTransform:'uppercase',
                    letterSpacing:'.08em',
                    background:'rgba(255,255,255,.02)',
                  }}>
                    {CATEGORY_LABELS[cat] || cat} <span style={{ color:'#5a5a7a', fontWeight:400 }}>({list.length})</span>
                  </div>
                  {list.map(d => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => {
                        onChange(d.id, d)
                        setOpen(false)
                        setSearch('')
                      }}
                      style={{
                        width:'100%', textAlign:'left',
                        background: d.id === value ? 'rgba(124,92,191,.12)' : 'transparent',
                        border:'none',
                        padding:'.5rem .875rem',
                        color: d.id === value ? '#c4a8ff' : '#c4c4d8',
                        fontSize:'.875rem', cursor:'pointer',
                        fontFamily:'inherit',
                        display:'flex', alignItems:'center', gap:'.625rem',
                      }}
                      onMouseEnter={e => {
                        if (d.id !== value) e.currentTarget.style.background = 'rgba(255,255,255,.04)'
                      }}
                      onMouseLeave={e => {
                        if (d.id !== value) e.currentTarget.style.background = 'transparent'
                      }}
                    >
                      <span>{BRAND_EMOJI[d.brand] || '📱'}</span>
                      <span style={{ flex:1 }}>{d.name}</span>
                      <span style={{
                        fontSize:'.7rem', color:'#5a5a7a',
                        fontFamily:'monospace',
                      }}>
                        {d.viewport.width}×{d.viewport.height}
                      </span>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding:'.5rem .875rem',
            borderTop:'1px solid rgba(255,255,255,.05)',
            fontSize:'.7rem', color:'#5a5a7a',
            display:'flex', justifyContent:'space-between',
          }}>
            <span>{devices.length} dispositivos</span>
            <span>Powered by Playwright</span>
          </div>
        </div>
      )}
    </div>
  )
}
