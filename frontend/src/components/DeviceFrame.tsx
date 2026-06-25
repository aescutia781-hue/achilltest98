'use client'

/**
 * DeviceFrame — Envuelve el visor con el marco realista del dispositivo.
 *
 * Soporta los frame styles:
 *   - iphone-dynamic-island   → iPhone 14 Pro, 15, 15 Pro, etc
 *   - iphone-notch            → iPhone X, 11, 12, 13, 14, 15 Plus
 *   - iphone-classic          → iPhone 6/7/8, SE (con botón home)
 *   - android-modern          → Galaxy S24, Pixel 7 (punch-hole)
 *   - android-classic         → Galaxy S5, Nexus, etc
 *   - ipad-modern             → iPad Pro 11, gen 11
 *   - ipad-classic            → iPad gen 5-7 (botón home)
 *   - tablet-android          → Galaxy Tab, Nexus 7/10
 *   - foldable-fold           → Galaxy Z Fold
 *   - foldable-flip           → Galaxy Z Flip
 *   - desktop                 → Marco de browser tipo navegador
 *   - generic                 → Marco simple
 */

import React from 'react'

interface DeviceFrameProps {
  frameStyle: string
  viewportWidth:  number
  viewportHeight: number
  brand?: string
  deviceName?: string
  children?: React.ReactNode
  scale?: number   // 1 = tamaño real, 0.5 = mitad
}

export function DeviceFrame({
  frameStyle,
  viewportWidth,
  viewportHeight,
  brand = 'generic',
  deviceName = '',
  children,
  scale = 1,
}: DeviceFrameProps) {
  // Calcular el tamaño escalado del viewport interno
  const w = Math.round(viewportWidth  * scale)
  const h = Math.round(viewportHeight * scale)

  switch (frameStyle) {
    case 'iphone-dynamic-island':  return <IphoneDynamicIsland w={w} h={h}>{children}</IphoneDynamicIsland>
    case 'iphone-notch':           return <IphoneNotch         w={w} h={h}>{children}</IphoneNotch>
    case 'iphone-classic':         return <IphoneClassic       w={w} h={h}>{children}</IphoneClassic>
    case 'android-modern':         return <AndroidModern       w={w} h={h} brand={brand}>{children}</AndroidModern>
    case 'android-classic':        return <AndroidClassic      w={w} h={h} brand={brand}>{children}</AndroidClassic>
    case 'ipad-modern':            return <IpadModern          w={w} h={h}>{children}</IpadModern>
    case 'ipad-classic':           return <IpadClassic         w={w} h={h}>{children}</IpadClassic>
    case 'tablet-android':         return <TabletAndroid       w={w} h={h}>{children}</TabletAndroid>
    case 'foldable-fold':          return <FoldableFold        w={w} h={h}>{children}</FoldableFold>
    case 'foldable-flip':          return <FoldableFlip        w={w} h={h}>{children}</FoldableFlip>
    case 'desktop':                return <DesktopBrowser      w={w} h={h} deviceName={deviceName}>{children}</DesktopBrowser>
    default:                       return <GenericFrame        w={w} h={h}>{children}</GenericFrame>
  }
}

// ── COMUNES ───────────────────────────────────────────────────────────────────

const screenStyle = (radius = 0): React.CSSProperties => ({
  background: '#000',
  borderRadius: radius,
  overflow: 'hidden',
  position: 'relative',
})

const imageStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  objectPosition: 'top',
  display: 'block',
}

function Screen({ children, radius = 0 }: { children: React.ReactNode; radius?: number }) {
  return <div style={screenStyle(radius)}>{children}</div>
}

// ── iPHONE DYNAMIC ISLAND (14 Pro+, 15+) ─────────────────────────────────────

function IphoneDynamicIsland({ w, h, children }: any) {
  const bezel = 12         // grosor del marco metálico
  const frameW = w + bezel * 2
  const frameH = h + bezel * 2
  return (
    <div style={{
      width: frameW, height: frameH,
      background: 'linear-gradient(135deg, #2a2a2c 0%, #1c1c1e 100%)',
      borderRadius: 48,
      padding: bezel,
      boxShadow: '0 0 0 2px #444, 0 20px 60px rgba(0,0,0,.5)',
      position: 'relative',
    }}>
      <div style={{
        ...screenStyle(36),
        width: w, height: h,
      }}>
        {/* Dynamic Island */}
        <div style={{
          position: 'absolute',
          top: 8, left: '50%', transform: 'translateX(-50%)',
          width: Math.max(95, w * 0.24),
          height: 28,
          background: '#000',
          borderRadius: 14,
          zIndex: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 10px',
        }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#222' }}/>
          <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#333' }}/>
        </div>
        {children}
      </div>
    </div>
  )
}

// ── iPHONE NOTCH (X, 11, 12, 13, 14, 15 Plus) ───────────────────────────────

function IphoneNotch({ w, h, children }: any) {
  const bezel = 12
  const frameW = w + bezel * 2
  const frameH = h + bezel * 2
  return (
    <div style={{
      width: frameW, height: frameH,
      background: 'linear-gradient(135deg, #2a2a2c 0%, #1c1c1e 100%)',
      borderRadius: 46,
      padding: bezel,
      boxShadow: '0 0 0 2px #444, 0 20px 60px rgba(0,0,0,.5)',
      position: 'relative',
    }}>
      <div style={{ ...screenStyle(34), width: w, height: h }}>
        {/* Notch */}
        <div style={{
          position: 'absolute',
          top: 0, left: '50%', transform: 'translateX(-50%)',
          width: w * 0.42, height: 22,
          background: '#000',
          borderBottomLeftRadius: 14, borderBottomRightRadius: 14,
          zIndex: 10,
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          paddingBottom: 4,
        }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#1a1a1a' }}/>
        </div>
        {children}
      </div>
    </div>
  )
}

// ── iPHONE CLASSIC (6/7/8/SE — con botón home) ──────────────────────────────

function IphoneClassic({ w, h, children }: any) {
  const sideBezel = 6
  const topBezel = 56     // espacio para speaker y cámara
  const bottomBezel = 56  // espacio para botón home
  const frameW = w + sideBezel * 2
  const frameH = h + topBezel + bottomBezel
  return (
    <div style={{
      width: frameW, height: frameH,
      background: 'linear-gradient(135deg, #d8d8da 0%, #b8b8ba 100%)',
      borderRadius: 38,
      boxShadow: '0 0 0 1px #888, inset 0 0 0 1px rgba(255,255,255,.2), 0 20px 60px rgba(0,0,0,.4)',
      position: 'relative',
      padding: `${topBezel}px ${sideBezel}px ${bottomBezel}px`,
    }}>
      {/* Speaker */}
      <div style={{
        position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)',
        width: 50, height: 5, background: '#222', borderRadius: 3,
      }}/>
      {/* Camera */}
      <div style={{
        position: 'absolute', top: 18, left: '50%', transform: 'translateX(-50%) translateX(-50px)',
        width: 8, height: 8, borderRadius: '50%', background: '#333',
      }}/>
      <div style={{ ...screenStyle(0), width: w, height: h }}>
        {children}
      </div>
      {/* Botón home */}
      <div style={{
        position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)',
        width: 38, height: 38, borderRadius: '50%',
        background: 'linear-gradient(135deg, #fff 0%, #c0c0c0 100%)',
        border: '1px solid #888',
        boxShadow: 'inset 0 0 6px rgba(0,0,0,.1)',
      }}/>
    </div>
  )
}

// ── ANDROID MODERNO (Galaxy S24, Pixel 7) ────────────────────────────────────

function AndroidModern({ w, h, brand, children }: any) {
  const bezel = 10
  const frameW = w + bezel * 2
  const frameH = h + bezel * 2
  const isGalaxy = brand === 'samsung'
  return (
    <div style={{
      width: frameW, height: frameH,
      background: isGalaxy
        ? 'linear-gradient(135deg, #5a5a5e 0%, #2c2c2e 100%)'
        : 'linear-gradient(135deg, #3a3a3c 0%, #1a1a1c 100%)',
      borderRadius: 36,
      padding: bezel,
      boxShadow: '0 0 0 2px #333, 0 20px 60px rgba(0,0,0,.5)',
      position: 'relative',
    }}>
      <div style={{ ...screenStyle(28), width: w, height: h }}>
        {/* Punch-hole (cámara) */}
        <div style={{
          position: 'absolute',
          top: 10, left: '50%', transform: 'translateX(-50%)',
          width: 12, height: 12, borderRadius: '50%',
          background: '#000', border: '1px solid #1a1a1a',
          zIndex: 10,
        }}/>
        {children}
      </div>
    </div>
  )
}

// ── ANDROID CLÁSICO (Galaxy S5, Nexus) ───────────────────────────────────────

function AndroidClassic({ w, h, brand, children }: any) {
  const sideBezel = 6
  const topBezel = 38
  const bottomBezel = 50
  const frameW = w + sideBezel * 2
  const frameH = h + topBezel + bottomBezel
  return (
    <div style={{
      width: frameW, height: frameH,
      background: 'linear-gradient(135deg, #2a2a2c 0%, #1a1a1c 100%)',
      borderRadius: 24,
      boxShadow: '0 0 0 2px #444, 0 20px 60px rgba(0,0,0,.5)',
      padding: `${topBezel}px ${sideBezel}px ${bottomBezel}px`,
      position: 'relative',
    }}>
      {/* Speaker top */}
      <div style={{
        position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)',
        width: 40, height: 4, background: '#0a0a0a', borderRadius: 2,
      }}/>
      <div style={{ ...screenStyle(0), width: w, height: h }}>
        {children}
      </div>
      {/* Botones nav abajo */}
      <div style={{
        position: 'absolute', bottom: 18, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: 30, alignItems: 'center',
      }}>
        <div style={{ width: 10, height: 10, border: '1.5px solid #666', transform: 'rotate(45deg)' }}/>
        <div style={{ width: 12, height: 12, border: '1.5px solid #666', borderRadius: 2 }}/>
        <div style={{ width: 10, height: 10, border: '1.5px solid #666', borderRadius: '50%' }}/>
      </div>
    </div>
  )
}

// ── iPAD MODERNO (Pro 11, gen 11) ────────────────────────────────────────────

function IpadModern({ w, h, children }: any) {
  const bezel = 18
  const frameW = w + bezel * 2
  const frameH = h + bezel * 2
  return (
    <div style={{
      width: frameW, height: frameH,
      background: 'linear-gradient(135deg, #2a2a2c 0%, #1c1c1e 100%)',
      borderRadius: 32,
      padding: bezel,
      boxShadow: '0 0 0 2px #555, 0 24px 70px rgba(0,0,0,.5)',
    }}>
      <div style={{ ...screenStyle(16), width: w, height: h, position: 'relative' }}>
        {/* Camera */}
        <div style={{
          position: 'absolute', top: 6, left: '50%', transform: 'translateX(-50%)',
          width: 6, height: 6, borderRadius: '50%', background: '#222',
        }}/>
        {children}
      </div>
    </div>
  )
}

// ── iPAD CLÁSICO (con botón home) ────────────────────────────────────────────

function IpadClassic({ w, h, children }: any) {
  const sideBezel = 16
  const topBezel = 50
  const bottomBezel = 60
  const frameW = w + sideBezel * 2
  const frameH = h + topBezel + bottomBezel
  return (
    <div style={{
      width: frameW, height: frameH,
      background: 'linear-gradient(135deg, #e0e0e2 0%, #c0c0c2 100%)',
      borderRadius: 26,
      boxShadow: '0 0 0 1px #888, 0 24px 70px rgba(0,0,0,.4)',
      padding: `${topBezel}px ${sideBezel}px ${bottomBezel}px`,
      position: 'relative',
    }}>
      {/* Camera */}
      <div style={{
        position: 'absolute', top: 22, left: '50%', transform: 'translateX(-50%)',
        width: 8, height: 8, borderRadius: '50%', background: '#333',
      }}/>
      <div style={{ ...screenStyle(0), width: w, height: h }}>
        {children}
      </div>
      {/* Botón home */}
      <div style={{
        position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
        width: 36, height: 36, borderRadius: '50%',
        background: 'linear-gradient(135deg, #fff 0%, #c0c0c0 100%)',
        border: '1px solid #888',
      }}/>
    </div>
  )
}

// ── TABLET ANDROID (Galaxy Tab, Nexus 7/10) ──────────────────────────────────

function TabletAndroid({ w, h, children }: any) {
  const bezel = 20
  const frameW = w + bezel * 2
  const frameH = h + bezel * 2
  return (
    <div style={{
      width: frameW, height: frameH,
      background: 'linear-gradient(135deg, #2a2a2c 0%, #1c1c1e 100%)',
      borderRadius: 22,
      padding: bezel,
      boxShadow: '0 0 0 2px #444, 0 24px 70px rgba(0,0,0,.5)',
      position: 'relative',
    }}>
      <div style={{ ...screenStyle(8), width: w, height: h, position: 'relative' }}>
        {/* Camera */}
        <div style={{
          position: 'absolute', top: 6, left: '50%', transform: 'translateX(-50%)',
          width: 5, height: 5, borderRadius: '50%', background: '#1a1a1a',
        }}/>
        {children}
      </div>
    </div>
  )
}

// ── FOLDABLE FOLD (Galaxy Z Fold) ────────────────────────────────────────────

function FoldableFold({ w, h, children }: any) {
  const bezel = 8
  const frameW = w + bezel * 2
  const frameH = h + bezel * 2
  return (
    <div style={{
      width: frameW, height: frameH,
      background: 'linear-gradient(135deg, #3a3a3c 0%, #1a1a1c 100%)',
      borderRadius: 18,
      padding: bezel,
      boxShadow: '0 0 0 2px #444, 0 24px 70px rgba(0,0,0,.5)',
      position: 'relative',
    }}>
      <div style={{ ...screenStyle(12), width: w, height: h, position: 'relative' }}>
        {children}
        {/* Línea central simulando el doblez */}
        <div style={{
          position: 'absolute', top: 0, bottom: 0, left: '50%',
          width: 1, background: 'linear-gradient(to bottom, transparent, rgba(255,255,255,.05), transparent)',
          pointerEvents: 'none',
        }}/>
      </div>
    </div>
  )
}

// ── FOLDABLE FLIP (Galaxy Z Flip) ────────────────────────────────────────────

function FoldableFlip({ w, h, children }: any) {
  const bezel = 8
  const frameW = w + bezel * 2
  const frameH = h + bezel * 2
  return (
    <div style={{
      width: frameW, height: frameH,
      background: 'linear-gradient(135deg, #3a3a3c 0%, #1a1a1c 100%)',
      borderRadius: 28,
      padding: bezel,
      boxShadow: '0 0 0 2px #444, 0 24px 70px rgba(0,0,0,.5)',
      position: 'relative',
    }}>
      <div style={{ ...screenStyle(20), width: w, height: h, position: 'relative' }}>
        {/* Punch hole superior */}
        <div style={{
          position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
          width: 10, height: 10, borderRadius: '50%', background: '#000', zIndex: 10,
        }}/>
        {children}
        {/* Línea de doblez horizontal */}
        <div style={{
          position: 'absolute', left: 0, right: 0, top: '50%',
          height: 1, background: 'linear-gradient(to right, transparent, rgba(255,255,255,.05), transparent)',
          pointerEvents: 'none',
        }}/>
      </div>
    </div>
  )
}

// ── DESKTOP BROWSER ──────────────────────────────────────────────────────────

function DesktopBrowser({ w, h, deviceName, children }: any) {
  const barHeight = 32
  return (
    <div style={{
      width: w,
      background: '#1c1c1e',
      borderRadius: 8,
      overflow: 'hidden',
      boxShadow: '0 12px 40px rgba(0,0,0,.4), 0 0 0 1px rgba(255,255,255,.05)',
    }}>
      {/* Barra del navegador */}
      <div style={{
        height: barHeight,
        background: '#2a2a2c',
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px',
        gap: 8,
        borderBottom: '1px solid #1a1a1c',
      }}>
        <div style={{ width: 11, height: 11, borderRadius: '50%', background: '#ff5f57' }}/>
        <div style={{ width: 11, height: 11, borderRadius: '50%', background: '#febc2e' }}/>
        <div style={{ width: 11, height: 11, borderRadius: '50%', background: '#28c840' }}/>
        <div style={{
          flex: 1, margin: '0 8px', height: 18, borderRadius: 4,
          background: '#0e0e1a', fontSize: 10, color: '#7070a0',
          display: 'flex', alignItems: 'center', padding: '0 8px',
        }}>
          🔒 {deviceName?.toLowerCase()?.includes('safari') ? 'Safari' :
              deviceName?.toLowerCase()?.includes('firefox') ? 'Firefox' :
              deviceName?.toLowerCase()?.includes('edge') ? 'Edge' : 'Chrome'}
        </div>
      </div>
      <div style={{ width: w, height: h, background: '#000', overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  )
}

// ── FRAME GENÉRICO ───────────────────────────────────────────────────────────

function GenericFrame({ w, h, children }: any) {
  const bezel = 10
  return (
    <div style={{
      width: w + bezel * 2, height: h + bezel * 2,
      background: '#2a2a2c',
      borderRadius: 18,
      padding: bezel,
      boxShadow: '0 16px 40px rgba(0,0,0,.4)',
    }}>
      <div style={{ ...screenStyle(8), width: w, height: h }}>
        {children}
      </div>
    </div>
  )
}

// ── HELPER: image dentro del frame ───────────────────────────────────────────

export function ScreenImage({ src, alt }: { src: string; alt?: string }) {
  return <img src={src} alt={alt || ''} style={imageStyle}/>
}
