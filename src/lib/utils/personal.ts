import type { Hora, Personal } from '@/types/domain.types'
import { getViernes, toISO } from './dates'

/** Semanas hacia atrás con horas que hacen a un jornalizado "activo". */
export const SEMANAS_ACTIVO = 3

/** Viernes de hace `semanas` semanas: desde ahí cuentan las horas para "activo". */
export function semCorteActivos(hoy: Date = new Date(), semanas: number = SEMANAS_ACTIVO): string {
  const d = new Date(hoy)
  d.setDate(d.getDate() - semanas * 7)
  return toISO(getViernes(d))
}

/** Legajos con al menos una fila de horas en una semana (viernes) >= `semCorte`. */
export function legsConHorasDesde(
  horas: ReadonlyArray<Pick<Hora, 'leg' | 'fecha'>>,
  semCorte: string,
): Set<string> {
  const out = new Set<string>()
  for (const h of horas) {
    if (toISO(getViernes(new Date(h.fecha + 'T12:00:00'))) >= semCorte) out.add(h.leg)
  }
  return out
}

/**
 * Criterio ÚNICO de "activo" (Personal, Ropa, alertas de legajo). El override
 * manual manda. Sin override, un mensualizado siempre está activo (no carga
 * horas en tarja) y un jornalizado lo está si tuvo horas en las últimas
 * SEMANAS_ACTIVO semanas.
 */
export function esActivo(
  p: Pick<Personal, 'leg' | 'modalidad' | 'activo_override'>,
  legsConHoras: ReadonlySet<string>,
): boolean {
  if (p.activo_override === true) return true
  if (p.activo_override === false) return false
  if (p.modalidad === 'mes') return true
  return legsConHoras.has(p.leg)
}

/** Deja solo dígitos: "36.890.735" → "36890735". Vacío si no hay ninguno. */
export function normalizarDni(s: string | null | undefined): string {
  return (s ?? '').replace(/\D/g, '')
}

/** DNI argentino: 7 u 8 dígitos. Vacío = no cargado (se admite). */
export function dniValido(dniNormalizado: string): boolean {
  return dniNormalizado === '' || /^\d{7,8}$/.test(dniNormalizado)
}

/** Nacimiento plausible para alguien que trabaja: entre 100 y 14 años atrás. */
export function fechaNacimientoValida(iso: string, hoyISO: string): boolean {
  const anio = Number(hoyISO.slice(0, 4))
  const resto = hoyISO.slice(4)
  return iso >= `${anio - 100}${resto}` && iso <= `${anio - 14}${resto}`
}

/**
 * Error de la API de personal que corresponde a UN campo del formulario, para
 * mostrarlo debajo del input en vez de en un toast. Cubre los 400 de
 * validación (`{ error, campo }`) y los 409 de duplicados del service.
 */
export function errorDeCampo(err: unknown): { campo: string; mensaje: string } | null {
  const e = err as { status?: number; body?: { error?: string; campo?: string } } | null
  const msg = e?.body?.error ?? ''
  if (e?.status === 400 && e.body?.campo) return { campo: e.body.campo, mensaje: msg }
  if (e?.status === 409) {
    if (msg.startsWith('DNI_DUPLICADO:'))    return { campo: 'dni', mensaje: msg.replace(/^DNI_DUPLICADO:\s*/, '') }
    if (msg.startsWith('LEGAJO_DUPLICADO:')) return { campo: 'leg', mensaje: msg.replace(/^LEGAJO_DUPLICADO:\s*/, '') }
  }
  return null
}
