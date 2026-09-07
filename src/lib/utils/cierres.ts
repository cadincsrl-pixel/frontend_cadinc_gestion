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

/**
 * Mensaje para el usuario cuando falla un guardado de tarja: el motivo real
 * del backend (semana cerrada, fecha fuera de rango, permiso, sesión) y, si
 * no hay uno reconocible, el genérico con el código que vino.
 */
export function motivoErrorGuardado(err: unknown, generico: string): string {
  const e = err as { status?: number; body?: { error?: string; detail?: string }; message?: string } | null
  const codigo = e?.body?.error ?? ''
  if (codigo === 'FECHA_FUERA_DE_RANGO') return e?.body?.detail ?? 'Como capataz solo podés cargar horas del día actual.'
  if (codigo.startsWith('SEMANA_CERRADA')) return 'La semana está cerrada: reabrila en Cierres para poder editarla.'
  if (codigo.startsWith('AFECTA_SEMANAS_CERRADAS')) return codigo.replace(/^AFECTA_SEMANAS_CERRADAS:\s*/, '')
  if (e?.status === 403) return 'No tenés permiso para hacer esto.'
  if (e?.status === 401) return 'Se venció la sesión: volvé a iniciar sesión.'
  if (e?.status == null) return `${generico} (sin conexión con el servidor)`
  if (e.status >= 500) return `${generico} (error del servidor)`
  return codigo ? `${generico} (${codigo})` : generico
}
