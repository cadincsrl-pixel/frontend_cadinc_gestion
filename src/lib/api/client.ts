import { createClient } from '@/lib/supabase/client'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

async function getAuthHeader(): Promise<HeadersInit> {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return {}
  return {
    Authorization: `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  }
}

async function parseError(res: Response, method: string, path: string): Promise<Error> {
  try {
    const body = await res.json()
    return new Error(body.error || `${method} ${path} → ${res.status}`)
  } catch {
    return new Error(`${method} ${path} → ${res.status}`)
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const headers = await getAuthHeader()
  const res = await fetch(`${API_URL}${path}`, { headers })
  if (!res.ok) throw await parseError(res, 'GET', path)
  return res.json() as Promise<T>
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const headers = await getAuthHeader()
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  if (!res.ok) throw await parseError(res, 'POST', path)
  return res.json() as Promise<T>
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const headers = await getAuthHeader()
  const res = await fetch(`${API_URL}${path}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  })
  if (!res.ok) throw await parseError(res, 'PUT', path)
  return res.json() as Promise<T>
}


export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const headers = await getAuthHeader()
  const res = await fetch(`${API_URL}${path}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  })
  if (!res.ok) throw await parseError(res, 'PATCH', path)
  return res.json() as Promise<T>
}

export async function apiDelete<T>(path: string): Promise<T> {
  const headers = await getAuthHeader()
  const res = await fetch(`${API_URL}${path}`, {
    method: 'DELETE',
    headers,
  })
  if (!res.ok) throw await parseError(res, 'DELETE', path)
  return res.json() as Promise<T>
}