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

export async function apiGet<T>(path: string): Promise<T> {
  const headers = await getAuthHeader()
  const res = await fetch(`${API_URL}${path}`, { headers })
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`)
  return res.json() as Promise<T>
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const headers = await getAuthHeader()
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}`)
  return res.json() as Promise<T>
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const headers = await getAuthHeader()
  const res = await fetch(`${API_URL}${path}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`PUT ${path} → ${res.status}`)
  return res.json() as Promise<T>
}


export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const headers = await getAuthHeader()
  const res = await fetch(`${API_URL}${path}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`PATCH ${path} → ${res.status}`)
  return res.json() as Promise<T>
}

export async function apiDelete<T>(path: string): Promise<T> {
  const headers = await getAuthHeader()
  const res = await fetch(`${API_URL}${path}`, {
    method: 'DELETE',
    headers,
  })
  if (!res.ok) throw new Error(`DELETE ${path} → ${res.status}`)
  return res.json() as Promise<T>
}