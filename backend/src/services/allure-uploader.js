/**
 * Allure Uploader
 *
 * Recibe ZIPs de `allure-results/` desde CI/CD externos (GitHub Actions,
 * GitLab CI, Jenkins, etc.) y los procesa.
 *
 * Flujo:
 *   1. Recibe el ZIP en /api/allure/projects/:id/upload
 *   2. Valida que contenga *-result.json
 *   3. Extrae a una carpeta de trabajo
 *   4. Llama al pipeline de generación de reporte
 *
 * Auth: usa el upload_token del project (NO el JWT del usuario)
 *       para que los CI/CD puedan tener un secret específico, rotable.
 */

import { mkdir, writeFile, readdir, unlink } from 'fs/promises'
import { createWriteStream, existsSync }      from 'fs'
import { pipeline }                          from 'stream/promises'
import { join }                              from 'path'
import { randomBytes }                       from 'crypto'

import { WORK_DIR }    from './allure-report-builder.js'

// Uso unzipper si está disponible; si no, intento usar `unzip` del sistema
// Para evitar deps extra, usamos `adm-zip` que es muy ligero y sin nativos
let AdmZip
try {
  AdmZip = (await import('adm-zip')).default
} catch {
  // Fallback: extracción mínima manual
  AdmZip = null
}

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024   // 100 MB
const ALLOWED_EXTS = ['.json', '.png', '.jpg', '.jpeg', '.webp', '.webm', '.mp4', '.txt', '.properties', '.csv', '.log', '.html']

/**
 * Guarda el ZIP a disco y lo extrae a una carpeta de trabajo.
 *
 * @param {ReadableStream} stream   Body del request (multipart o raw)
 * @param {string} runId            ID del allure_run (para el path temporal)
 *
 * @returns {{ workDir, resultCount, totalBytes }}
 */
export async function extractUploadToWorkDir(stream, runId) {
  // Asegurar work dir base
  await mkdir(WORK_DIR, { recursive: true })

  const workDir = join(WORK_DIR, `upload-${runId}-${Date.now()}`)
  await mkdir(workDir, { recursive: true })

  // Guardar el ZIP temporalmente
  const zipPath = join(workDir, '_upload.zip')

  let totalBytes = 0
  const ws = createWriteStream(zipPath)

  // Capturar bytes mientras escribe
  let aborted = false
  for await (const chunk of stream) {
    totalBytes += chunk.length
    if (totalBytes > MAX_UPLOAD_BYTES) {
      aborted = true
      ws.destroy()
      throw new Error(`Upload excede el máximo permitido (${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB)`)
    }
    if (!ws.write(chunk)) {
      await new Promise(resolve => ws.once('drain', resolve))
    }
  }
  await new Promise((resolve, reject) => {
    ws.end(err => err ? reject(err) : resolve())
  })

  if (totalBytes === 0) throw new Error('Upload vacío')

  // ── Extraer el ZIP ──────────────────────────────────────────────────────
  let resultCount = 0
  if (AdmZip) {
    const zip = new AdmZip(zipPath)
    const entries = zip.getEntries()

    for (const entry of entries) {
      if (entry.isDirectory) continue
      // Validar extensión y nombre
      const name = entry.entryName.split('/').pop()
      if (!name) continue
      const ext = ('.' + (name.split('.').pop() || '')).toLowerCase()
      if (!ALLOWED_EXTS.includes(ext)) continue
      // Path traversal protection
      if (name.includes('..') || name.startsWith('/')) continue

      const outputPath = join(workDir, name)
      try {
        zip.extractEntryTo(entry, workDir, false, true)
        if (name.endsWith('-result.json')) resultCount++
      } catch (err) {
        console.warn(`[Uploader] No se pudo extraer ${name}:`, err.message)
      }
    }
  } else {
    // Fallback: usar `unzip` del sistema
    const { spawn } = await import('child_process')
    await new Promise((resolve, reject) => {
      const proc = spawn('unzip', ['-o', '-j', zipPath, '-d', workDir], { stdio: 'pipe' })
      proc.on('close', (code) => code === 0 ? resolve() : reject(new Error(`unzip falló (code ${code})`)))
      proc.on('error', reject)
    })

    // Contar manualmente los results
    const files = await readdir(workDir)
    resultCount = files.filter(f => f.endsWith('-result.json')).length
  }

  // Borrar el ZIP raw que ya extrajimos
  await unlink(zipPath).catch(() => {})

  // Validar que tenemos al menos un result
  if (resultCount === 0) {
    throw new Error('El ZIP no contiene archivos *-result.json válidos. ¿Es realmente una carpeta allure-results?')
  }

  return { workDir, resultCount, totalBytes }
}

/**
 * Genera un upload token criptográficamente seguro para un project.
 */
export function generateUploadToken() {
  return 'at_' + randomBytes(32).toString('hex')
}

/**
 * Genera un share token para reportes públicos.
 */
export function generateShareToken() {
  return 'sh_' + randomBytes(24).toString('hex')
}

/**
 * Verifica si un upload token coincide con el del project, en tiempo constante.
 */
export function verifyUploadToken(provided, stored) {
  if (!provided || !stored) return false
  if (provided.length !== stored.length) return false
  let diff = 0
  for (let i = 0; i < provided.length; i++) {
    diff |= provided.charCodeAt(i) ^ stored.charCodeAt(i)
  }
  return diff === 0
}
