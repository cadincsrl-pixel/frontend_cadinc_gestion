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
/**
 * Un legajo es operario de obra salvo que su ficha real viva en otro padrón
 * (oficina, choferes, contratistas). Esos legajos NO se borran porque tienen
 * historia — horas, categorías, ropa — pero no cuentan como personal de obra.
 *
 * Va aparte de `esActivo()` a propósito: "no es un operario" y "este operario
 * dejó de trabajar" son hechos distintos. Mezclarlos fue lo que hizo que
 * darles de baja los mudara a la alerta de cobertura en vez de silenciarlos
 * (migración `20260908w`).
 */
export function esOperario(p: Pick<Personal, 'padron_externo'>): boolean {
  return !p.padron_externo
}

/** Dónde vive la ficha real, para el chip de la pantalla. */
export const PADRON_EXTERNO_LABEL: Record<NonNullable<Personal['padron_externo']>, string> = {
  oficina:     'Costos de oficina',
  chofer:      'Choferes de logística',
  contratista: 'Contratistas',
}

export function esActivo(
  p: Pick<Personal, 'leg' | 'modalidad' | 'activo_override'>,
  legsConHoras: ReadonlySet<string>,
): boolean {
  if (p.activo_override === true) return true
  if (p.activo_override === false) return false
  if (p.modalidad === 'mes') return true
  return legsConHoras.has(p.leg)
}

// ── Reglas de campos del legajo ─────────────────────────────────────────────
// Espejo exacto del backend (cadincsrl/src/modules/personal/personal.schema.ts).
// Si cambia una regla, cambia en los dos repos.

/** Legajo: 3 dígitos con padding ("099", "112"); 4 cuando pasen de 999. */
export const LEGAJO_RE = /^\d{3,4}$/

/** Deja solo dígitos: "36.890.735" → "36890735". Vacío si no hay ninguno. */
export function normalizarDni(s: string | null | undefined): string {
  return (s ?? '').replace(/\D/g, '')
}

/** DNI argentino: 7 u 8 dígitos (se admiten puntos y espacios). Vacío = no cargado (solo legajos viejos). */
export function dniValido(dni: string | null | undefined): boolean {
  const crudo = (dni ?? '').trim()
  return crudo === '' || /^\d{7,8}$/.test(normalizarDni(crudo))
}

/** Deja solo dígitos: "381-555-1234" → "3815551234". */
export function normalizarTelefono(s: string | null | undefined): string {
  return (s ?? '').replace(/\D/g, '')
}

/**
 * Celular argentino sin 0 ni 15: 10 dígitos (se admiten guiones, espacios y
 * paréntesis). Se toleran 8 a 13 por fijos viejos. Vacío = sin cargar. Texto
 * sin dígitos ("sin teléfono") NO vale: se rechaza, no se vacía en silencio.
 */
export function telefonoValido(tel: string | null | undefined): boolean {
  const crudo = (tel ?? '').trim()
  return crudo === '' || /^\d{8,13}$/.test(normalizarTelefono(crudo))
}

/** Recorta y deja un solo espacio entre palabras. */
export function normalizarNombre(s: string | null | undefined): string {
  return (s ?? '').trim().replace(/\s+/g, ' ')
}

/** Apellido y nombre: al menos dos palabras, solo letras (con acentos), punto, coma, apóstrofo o guion. */
export function nombreValido(nombreNormalizado: string): boolean {
  const palabras = nombreNormalizado.split(/[\s,]+/).filter(Boolean)
  return palabras.length >= 2 && palabras.every(p => /^[\p{L}][\p{L}.'’-]*$/u.test(p))
}

export function normalizarTalle(s: string | null | undefined): string {
  return (s ?? '').trim().toUpperCase()
}

/** Talle: número de dos dígitos entre 30 y 60 o XS…XXXL. */
export function talleValido(talleNormalizado: string): boolean {
  if (talleNormalizado === '') return true
  if (/^\d{2}$/.test(talleNormalizado)) {
    const n = Number(talleNormalizado)
    return n >= 30 && n <= 60
  }
  return /^(XS|S|M|L|XL|XXL|XXXL)$/.test(talleNormalizado)
}

/** Mensajes de las reglas, iguales a los del backend. */
export const MSG_PERSONAL = {
  legajo:     'El legajo son 3 dígitos, ej. 112',
  nombre:     'Apellido y nombre: al menos dos palabras y solo letras',
  dni:        'DNI inválido: 7 u 8 dígitos',
  dniFalta:   'El DNI es obligatorio',
  telefono:   'Teléfono inválido: 10 dígitos sin 0 ni 15, ej. 3815551234',
  talle:      'Talle inválido: número (ej. 44) o S, M, L, XL',
  nacimiento: 'Revisá el año de nacimiento',
} as const

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
  if (e?.status === 400 && msg.startsWith('DNI_OBLIGATORIO:')) return { campo: 'dni', mensaje: msg.replace(/^DNI_OBLIGATORIO:\s*/, '') }
  if (e?.status === 409) {
    if (msg.startsWith('DNI_DUPLICADO:'))    return { campo: 'dni', mensaje: msg.replace(/^DNI_DUPLICADO:\s*/, '') }
    if (msg.startsWith('LEGAJO_DUPLICADO:')) return { campo: 'leg', mensaje: msg.replace(/^LEGAJO_DUPLICADO:\s*/, '') }
  }
  return null
}
