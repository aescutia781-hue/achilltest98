/**
 * Catálogo de dispositivos para emulación.
 *
 * Importa TODOS los dispositivos nativos de Playwright (~75 portrait)
 * y los enriquece con metadata para el visor (categoría, marca, frame style).
 *
 * Fuente: playwright.devices (siempre actualizada con la versión instalada)
 */

import { devices as playwrightDevices } from 'playwright'

// ── Categorización ────────────────────────────────────────────────────────────

function detectCategory(name) {
  if (name.startsWith('Desktop'))                                    return 'desktop'
  if (name.includes('Z Fold') || name.includes('Z Flip'))            return 'foldable'
  if (name.includes('iPad') || name.includes('Tab') ||
      name.includes('Nexus 7') || name.includes('Nexus 10') ||
      name.includes('Kindle') || name.includes('PlayBook'))          return 'tablet'
  return 'phone'
}

function detectBrand(name) {
  if (name.startsWith('iPhone') || name.startsWith('iPad'))          return 'apple'
  if (name.startsWith('Galaxy'))                                     return 'samsung'
  if (name.startsWith('Pixel') || name.startsWith('Nexus'))          return 'google'
  if (name.toLowerCase().includes('blackberry'))                     return 'blackberry'
  if (name.startsWith('Microsoft') || name.includes('Lumia') ||
      name.startsWith('Nokia'))                                      return 'nokia'
  if (name.startsWith('Moto'))                                       return 'motorola'
  if (name.startsWith('LG'))                                         return 'lg'
  if (name.startsWith('Kindle'))                                     return 'amazon'
  if (name.startsWith('Desktop'))                                    return 'desktop'
  return 'other'
}

/**
 * El "frame style" indica qué marco de dispositivo dibujar en el visor.
 *
 * Estilos disponibles:
 *   - iphone-dynamic-island  (iPhone 14 Pro, 15, 15 Pro, etc)
 *   - iphone-notch           (iPhone X, 11, 12, 13, 14, 15 Plus, etc)
 *   - iphone-classic         (iPhone 6/7/8, SE — con botón home)
 *   - android-modern         (Galaxy S24, Pixel 7, etc — con punch-hole)
 *   - android-classic        (Galaxy S5, Nexus, etc)
 *   - ipad-modern            (iPad Pro 11, gen 11 — sin botón home)
 *   - ipad-classic           (iPad gen 5-7 — con botón home)
 *   - tablet-android         (Galaxy Tab, Nexus 7/10, Kindle)
 *   - foldable-fold          (Galaxy Z Fold)
 *   - foldable-flip          (Galaxy Z Flip)
 *   - desktop                (Desktop Chrome/Firefox/Safari/Edge)
 *   - generic                (cualquier otro)
 */
function detectFrameStyle(name) {
  // iPhones con Dynamic Island (Pro/Pro Max desde 14, todos los 15+)
  if (/iPhone (1[5-9]|2[0-9])/.test(name))                           return 'iphone-dynamic-island'
  if (name.startsWith('iPhone 14 Pro'))                              return 'iphone-dynamic-island'

  // iPhones con notch
  if (/iPhone (X|XR|11|12|13|14)/.test(name) ||
      name === 'iPhone 12 Mini' || name === 'iPhone 13 Mini')        return 'iphone-notch'

  // iPhones clásicos con botón home
  if (/iPhone (6|7|8|SE)/.test(name))                                return 'iphone-classic'

  // iPads modernos (sin botón home)
  if (/iPad Pro|iPad \(gen 11\)/.test(name))                         return 'ipad-modern'

  // iPads clásicos
  if (name.includes('iPad'))                                         return 'ipad-classic'

  // Foldables Samsung
  if (name.includes('Z Fold'))                                       return 'foldable-fold'
  if (name.includes('Z Flip'))                                       return 'foldable-flip'

  // Tablets Android
  if (name.includes('Tab') || name === 'Nexus 7' || name === 'Nexus 10' ||
      name.includes('Kindle') || name.includes('PlayBook'))          return 'tablet-android'

  // Android moderno (Galaxy S24, Pixel 7, A55)
  if (name === 'Galaxy S24' || name === 'Galaxy A55' ||
      name === 'Pixel 7' || /Pixel [4-6]/.test(name))                return 'android-modern'

  // Android clásico
  if (name.startsWith('Galaxy') || name.startsWith('Pixel') ||
      name.startsWith('Nexus') || name.startsWith('Moto') ||
      name.startsWith('LG') || name.startsWith('Microsoft') ||
      name.startsWith('Nokia'))                                      return 'android-classic'

  // Desktop
  if (name.startsWith('Desktop'))                                    return 'desktop'

  return 'generic'
}

/**
 * Genera un slug URL-friendly del nombre del dispositivo.
 * Ejemplo: "iPhone 14 Pro Max" → "iphone-14-pro-max"
 */
function toSlug(name) {
  return name.toLowerCase()
    .replace(/[\(\)]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

// ── Construir catálogo completo ───────────────────────────────────────────────

function buildCatalog() {
  const catalog = []
  for (const [name, d] of Object.entries(playwrightDevices)) {
    if (name.includes('landscape')) continue  // Solo portrait
    catalog.push({
      id:          toSlug(name),
      name,
      category:    detectCategory(name),
      brand:       detectBrand(name),
      frameStyle:  detectFrameStyle(name),
      viewport:    d.viewport,
      screen:      d.screen || d.viewport,
      userAgent:   d.userAgent,
      deviceScaleFactor: d.deviceScaleFactor,
      isMobile:    d.isMobile,
      hasTouch:    d.hasTouch,
      defaultBrowserType: d.defaultBrowserType,
    })
  }

  // Ordenar por categoría → brand → nombre
  const order = { phone: 1, tablet: 2, foldable: 3, desktop: 4 }
  catalog.sort((a, b) => {
    if (a.category !== b.category) return order[a.category] - order[b.category]
    if (a.brand !== b.brand) return a.brand.localeCompare(b.brand)
    return a.name.localeCompare(b.name)
  })

  return catalog
}

let _catalogCache = null

export function getDeviceCatalog() {
  if (!_catalogCache) _catalogCache = buildCatalog()
  return _catalogCache
}

/**
 * Obtiene un dispositivo por su id (slug) o nombre.
 */
export function getDeviceById(idOrName) {
  const catalog = getDeviceCatalog()
  return catalog.find(d => d.id === idOrName || d.name === idOrName) || null
}

/**
 * Obtiene la configuración de Playwright lista para usar en browser.newContext()
 */
export function getPlaywrightDeviceConfig(idOrName) {
  if (!idOrName) return playwrightDevices['Desktop Chrome']

  // Si es un nombre directo de Playwright, devolverlo
  if (playwrightDevices[idOrName]) return playwrightDevices[idOrName]

  // Si es un slug, buscar el nombre real
  const device = getDeviceById(idOrName)
  if (device && playwrightDevices[device.name]) {
    return playwrightDevices[device.name]
  }

  // Fallback a Desktop Chrome
  return playwrightDevices['Desktop Chrome']
}

/**
 * Lista los dispositivos por categoría, agrupados.
 */
export function getDevicesByCategory() {
  const catalog = getDeviceCatalog()
  const groups = { phone: [], tablet: [], foldable: [], desktop: [] }
  for (const d of catalog) {
    if (groups[d.category]) groups[d.category].push(d)
  }
  return groups
}
