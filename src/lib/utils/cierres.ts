import { hoyArgentinaISO } from './dates'

/**
 * Estado de cierre de una semana de tarja. Misma regla que el backend
 * (`cadincsrl/src/lib/semanas.ts`, decisión del user 2026-09-06): sin fila en
 * `cierres`, una semana cuyo jueves ya pasó está CERRADA; una fila
 * 'pendiente' la reabre; 'cerrado' la cierra aunque sea la actual.
 *
 * MARGEN DEL VIERNES (2026-09-11): se trabaja hasta el jueves, se terminan de
 * cargar las horas el VIERNES y se paga el SÁBADO, así que el cierre
 * automático cae el sábado y no apenas pasa el jueves. Si se cambia acá hay
 * que cambiarlo también en el backend: son la misma regla escrita dos veces.
 */

/** Días de gracia después del jueves. Espejo de DIAS_DE_GRACIA del backend. */
const DIAS_DE_GRACIA = 1
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
  return hoyISO > ultimoDiaEditable(semKey)
}

/** Último día editable sin reabrir: el jueves + los días de gracia (viernes). */
export function ultimoDiaEditable(semKey: string): string {
  const d = new Date(juevesDeSemana(semKey) + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + DIAS_DE_GRACIA)
  return d.toISOString().slice(0, 10)
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
