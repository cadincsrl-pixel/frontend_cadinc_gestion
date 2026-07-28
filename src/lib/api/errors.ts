// Helpers para leer los errores "codificados" del backend Hono.
//
// El backend responde `{ error: <CODIGO>, message, detail? }` y el client de
// api (parseError en client.ts) deja ese JSON crudo en `err.body`. Estas dos
// funciones evitan repetir el casteo `(err as any)?.body?.error` en cada
// onError, y toleran que el error no venga del backend (fallo de red, HTML de
// un proxy, etc.).

export function apiErrorCode(err: unknown): string | null {
  const body = (err as { body?: { error?: unknown } } | null)?.body
  return typeof body?.error === 'string' ? body.error : null
}

export function apiErrorDetail(err: unknown): Record<string, unknown> {
  const body = (err as { body?: { detail?: unknown } } | null)?.body
  const detail = body?.detail
  return detail && typeof detail === 'object' ? (detail as Record<string, unknown>) : {}
}
