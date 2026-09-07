import { hoyArgentinaISO } from './dates'

/**
 * Estado de cierre de una semana de tarja. Misma regla que el backend
 * (`cadincsrl/src/lib/semanas.ts`, decisión del user 2026-09-06): sin fila en
 * `cierres`, una semana cuyo jueves ya pasó está CERRADA; una fila
 * 'pendiente' la reabre; 'cerrado' la cierra aunque sea la actual.
 */
export function juevesDeSemana(semKey: string): string {
  const d = new Date(semKey + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + 6)
  return d.toISOString().slice(0, 10)
}

export function semanaCerrada(
  estado: 'cerrado' | 'pendiente' | string | null | undefined,
  semKey: string,
  hoyISO: string = hoyArgentinaISO(),
): boolean {
  if (estado === 'cerrado') return true
  if (estado === 'pendiente') return false
  return hoyISO > juevesDeSemana(semKey)
}

/** true si el error de la API es el 409 de semana cerrada. */
export function esErrorSemanaCerrada(err: unknown): boolean {
  const e = err as { status?: number; body?: { error?: string } } | null
  return e?.status === 409 && (e.body?.error ?? '').startsWith('SEMANA_CERRADA')
}

/** Texto del 409 AFECTA_SEMANAS_CERRADAS (o null si el error es otro). */
export function motivoAfectaCerradas(err: unknown): string | null {
  const e = err as { status?: number; body?: { error?: string } } | null
  const msg = e?.body?.error ?? ''
  if (e?.status !== 409 || !msg.startsWith('AFECTA_SEMANAS_CERRADAS')) return null
  return msg.replace(/^AFECTA_SEMANAS_CERRADAS:\s*/, '')
}
