// Jurisdicciones (20260929f): helpers puros del catálogo compartido de Compras
// (tributos de la factura) y Ventas (retenciones sufridas), y la traducción de
// los errores de /api/catalogos.

import type { ComboboxOption } from '@/components/ui/Combobox'
import type { Jurisdiccion, TipoJurisdiccion } from '@/types/config.types'

export const TIPO_JURISDICCION_LABEL: Record<TipoJurisdiccion, string> = {
  nacional:   'Nacional',
  provincial: 'Provincia',
  municipal:  'Municipio',
}

/** Valor del Combobox para un texto viejo que no resolvió a ninguna jurisdicción. */
export const PREFIJO_SIN_NORMALIZAR = '⚠ '

/**
 * Opciones del selector: provincias primero, después los municipios agrupados
 * por provincia. La provincia NO va en `sub` (el filtro corre sobre label +
 * sub + search: «tucuman» traería todos sus municipios). Los alias van en
 * `search`. Las dadas de baja no se ofrecen, salvo la que ya está elegida.
 */
export function opcionesJurisdiccion(lista: readonly Jurisdiccion[], elegidaId?: number | null): ComboboxOption[] {
  const visibles = lista.filter(j => j.activo || j.id === elegidaId)
  const orden = (j: Jurisdiccion) => (j.tipo === 'nacional' ? 0 : j.tipo === 'provincial' ? 1 : 2)
  return [...visibles]
    .sort((a, b) => orden(a) - orden(b)
      || (a.provincia_nombre ?? '').localeCompare(b.provincia_nombre ?? '', 'es')
      || a.nombre.localeCompare(b.nombre, 'es'))
    .map(j => ({
      value:  String(j.id),
      label:  j.activo ? j.nombre : `${j.nombre} (dada de baja)`,
      group:  j.tipo === 'nacional' ? 'Nacional'
        : j.tipo === 'provincial' ? 'Provincias'
          : `Municipios${j.provincia_nombre ? ` · ${j.provincia_nombre}` : ''}`,
      search: j.alias,
    }))
}

/** Texto para mostrar una jurisdicción guardada: el nombre del catálogo o el texto viejo. */
export function nombreJurisdiccion(lista: readonly Jurisdiccion[], id: number | null | undefined, texto?: string | null): string {
  if (id != null) {
    const j = lista.find(x => x.id === id)
    if (j) return j.nombre
  }
  return (texto ?? '').trim()
}

/** Alias tipeados separados por coma → lista limpia, sin repetidos. */
export function parsearAlias(txt: string): string[] {
  const out: string[] = []
  for (const a of txt.split(',').map(s => s.trim().replace(/\s+/g, ' ')).filter(Boolean)) {
    if (!out.some(x => x.toLowerCase() === a.toLowerCase())) out.push(a)
  }
  return out
}

// ── Errores ─────────────────────────────────────────────────────────────────

interface Cuerpo { error?: string; detail?: unknown; campo?: string | null }

function leer(e: unknown): Cuerpo {
  if (!(e instanceof Error)) return {}
  const body = (e as { body?: unknown }).body
  if (body && typeof body === 'object' && typeof (body as Record<string, unknown>).error === 'string') {
    const b = body as Record<string, unknown>
    const d = b.detail && typeof b.detail === 'object' ? b.detail as Record<string, unknown> : null
    const campo = typeof b.campo === 'string' ? b.campo : typeof d?.campo === 'string' ? d.campo : null
    return { error: b.error as string, detail: b.detail, campo }
  }
  return { error: e.message }
}

const dato = (d: unknown, k: string): unknown =>
  d && typeof d === 'object' && k in d ? (d as Record<string, unknown>)[k] : undefined

const CAMPO_LABEL: Record<string, string> = {
  nombre: 'el nombre', alias: 'un alias', codigo_comarb: 'el código COMARB', codigo_arca: 'el código de ARCA',
}

const MENSAJES: Record<string, (d: unknown) => string> = {
  SIN_PERMISO:              () => 'Para editar las jurisdicciones hace falta el permiso «Configurar» de Compras o de Ventas.',
  JURISDICCION_INVALIDA:    d => {
    const c = dato(d, 'campo')
    if (c === 'provincia_id') return 'Un municipio tiene que colgar de una provincia.'
    if (c === 'tipo' && dato(d, 'motivo') === 'tiene_municipios') return 'Tiene municipios cargados: no puede dejar de ser provincia.'
    const m = dato(d, 'mensaje')
    return `Revisá ${CAMPO_LABEL[String(c)] ?? 'los datos'}${typeof m === 'string' ? ` (${m})` : ''}.`
  },
  JURISDICCION_DUPLICADA:   d => `Ya hay una jurisdicción con ${CAMPO_LABEL[String(dato(d, 'campo'))] ?? 'ese nombre'} igual (sin contar mayúsculas ni tildes).`,
  JURISDICCION_NO_EXISTE:   () => 'Esa jurisdicción no existe (¿la borraron?). Refrescá la pantalla.',
  JURISDICCION_POR_DEFECTO: d => dato(d, 'donde') === 'ventas_retencion_tipos'
    ? 'Es la jurisdicción por defecto de un tipo de retención: cambiásela en Ventas › Configuración antes de darla de baja.'
    : 'Es la jurisdicción por defecto de los tributos de compra: elegí otra en Compras › Configuración antes de darla de baja.',
  DB_ERROR:                 () => 'Error de la base de datos. Probá de nuevo; si sigue, avisá.',
}

export function mensajeErrorJurisdiccion(e: unknown): string {
  const { error, detail } = leer(e)
  if (!error) return 'No se pudo completar la operación.'
  return MENSAJES[error]?.(detail) ?? error
}

/** El campo del formulario al que apunta el error, si hay uno. */
export function campoErrorJurisdiccion(e: unknown): string | null {
  return leer(e).campo ?? null
}
