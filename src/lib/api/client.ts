import { createClient } from '@/lib/supabase/client'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

// ── Auth token management ─────────────────────────────────────────────
// Problema que resuelve: `supabase.auth.getSession()` lee el session del
// storage local SIN revalidar contra el server. Si la pestaña estuvo cerrada
// por días, el access_token en localStorage puede estar vencido y getSession()
// te lo devuelve igual → el backend responde 401.
//
// Dos capas:
//   1. Refresh proactivo: si el token está por vencer (< 60s), llamamos a
//      refreshSession() antes del fetch. Evita la mayoría de 401.
//   2. Interceptor reactivo: si de todos modos llega un 401 (race, refresh
//      previo falló silencioso), reintentamos una vez con refresh forzado.
//      Si el refresh también falla, redirigimos a /login.
//
// createBrowserClient ya tiene autoRefreshToken:true por default (refresh
// periódico en background). Esto complementa esos casos edge.

async function getAccessToken(): Promise<string | null> {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null

  const nowSec     = Math.floor(Date.now() / 1000)
  const expiresAt  = session.expires_at ?? 0
  const segundosRestantes = expiresAt - nowSec

  // Refresh proactivo si el token expira en <60s o ya expiró.
  if (segundosRestantes < 60) {
    const { data, error } = await supabase.auth.refreshSession()
    if (error || !data.session) return null
    return data.session.access_token
  }
  return session.access_token
}

async function getAuthHeader(): Promise<HeadersInit> {
  const token = await getAccessToken()
  if (!token) return { 'Content-Type': 'application/json' }
  return {
    Authorization:  `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

// Retorna un token nuevo tras refresh forzado, o null si falla definitivamente.
// En el segundo caso redirige a /login?sessionExpired=1 para que el form
// de login muestre un mensaje ("tu sesión expiró, volvé a iniciar").
async function handleUnauthorized(): Promise<string | null> {
  const supabase = createClient()
  const { data, error } = await supabase.auth.refreshSession()
  if (error || !data.session) {
    if (typeof window !== 'undefined') {
      window.location.assign('/login?sessionExpired=1')
    }
    return null
  }
  return data.session.access_token
}

async function authFetch(
  method: string,
  path:   string,
  body?:  unknown,
): Promise<Response> {
  const headers = await getAuthHeader()
  const init: RequestInit = {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }

  let res = await fetch(`${API_URL}${path}`, init)

  // Interceptor 401: un reintento con token refresheado.
  if (res.status === 401) {
    const newToken = await handleUnauthorized()
    if (newToken) {
      res = await fetch(`${API_URL}${path}`, {
        ...init,
        headers: {
          Authorization:  `Bearer ${newToken}`,
          'Content-Type': 'application/json',
        },
      })
    }
  }
  return res
}

class HttpError extends Error {
  status: number
  body?:  unknown
  constructor(message: string, status: number, body?: unknown) {
    super(message)
    this.name   = 'HttpError'
    this.status = status
    this.body   = body
  }
}

async function parseError(res: Response, method: string, path: string): Promise<HttpError> {
  // 401 definitivo (tras retry fallido) → mensaje amigable al usuario.
  if (res.status === 401) {
    return new HttpError('Sesión expirada. Volvé a iniciar sesión.', 401)
  }

  let body: unknown
  let message = `${method} ${path} → ${res.status}`
  try {
    body = await res.json()
    const b = body as { error?: string; message?: string }
    message = b.error || b.message || message
  } catch {
    /* body vacío o no-JSON */
  }
  return new HttpError(message, res.status, body)
}

// ── Métodos públicos ──────────────────────────────────────────────────

export async function apiGet<T>(path: string): Promise<T> {
  const res = await authFetch('GET', path)
  if (!res.ok) throw await parseError(res, 'GET', path)
  return res.json() as Promise<T>
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await authFetch('POST', path, body)
  if (!res.ok) throw await parseError(res, 'POST', path)
  return res.json() as Promise<T>
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const res = await authFetch('PUT', path, body)
  if (!res.ok) throw await parseError(res, 'PUT', path)
  return res.json() as Promise<T>
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await authFetch('PATCH', path, body)
  if (!res.ok) throw await parseError(res, 'PATCH', path)
  return res.json() as Promise<T>
}

export async function apiDelete<T>(path: string): Promise<T> {
  const res = await authFetch('DELETE', path)
  if (!res.ok) throw await parseError(res, 'DELETE', path)
  return res.json() as Promise<T>
}
