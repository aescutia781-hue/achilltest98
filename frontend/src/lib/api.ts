/**
 * Cliente HTTP para Achilltest
 * Agrega el token JWT automáticamente a todas las peticiones.
 */

const BASE = ''  // Next.js proxea /api/* al backend

function getToken() {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('token')
}

async function request(path: string, options: RequestInit = {}) {
  const token = getToken()

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${BASE}${path}`, { ...options, headers })

  // Token expirado → limpiar y redirigir al login
  if (res.status === 401) {
    localStorage.removeItem('token')
    window.location.href = '/login'
    throw new Error('Sesión expirada')
  }

  const data = await res.json()

  if (!res.ok) {
    throw new Error(data.error || `Error ${res.status}`)
  }

  return data
}

export const api = {
  get:    (path: string)                          => request(path),
  post:   (path: string, body: any)               => request(path, { method: 'POST',   body: JSON.stringify(body) }),
  put:    (path: string, body: any)               => request(path, { method: 'PUT',    body: JSON.stringify(body) }),
  delete: (path: string)                          => request(path, { method: 'DELETE' }),
  patch:  (path: string, body: any)               => request(path, { method: 'PATCH',  body: JSON.stringify(body) }),
}

// ── Auth helpers ──────────────────────────────────────────────────────────────

export function isAuthenticated() {
  return !!getToken()
}

export function logout() {
  localStorage.removeItem('token')
  window.location.href = '/login'
}

export async function getCurrentUser() {
  try {
    const data = await api.get('/api/auth/me')
    return data.data
  } catch {
    return null
  }
}
