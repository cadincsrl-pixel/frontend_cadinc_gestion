// Constantes y formatos del módulo Facturación.
//
// Módulo independiente (como Pagos): no importa nada de pagos ni de
// certificaciones. Las tablas de ARCA (condición IVA, tipos de documento,
// alícuotas) son fijas y están espejadas acá para el PDF y los labels; el
// SELECT de condición IVA igual sale de /condiciones-iva, que además dice cuál
// admite factura A.

import type {
  VentasAlicuotaId, VentasDocTipo, VentasEstado, VentasFactura, VentasProducto,
} from '@/types/domain.types'

export const PRODUCTOS: { key: VentasProducto; label: string; hint: string }[] = [
  { key: 'AVANCE DE OBRA', label: 'Avance de obra', hint: 'Obra: lleva centro de costo. Concepto ARCA 3 (productos y servicios).' },
  { key: 'TRANSPORTE',     label: 'Transporte',     hint: 'Logística: sin centro de costo. Concepto ARCA 2 (servicios).' },
]

/** Las que ofrece la UI en fase 1. 21 % por defecto. */
export const ALICUOTAS_UI: { id: VentasAlicuotaId; label: string }[] = [
  { id: 5, label: '21 %' },
  { id: 4, label: '10,5 %' },
  { id: 3, label: '0 %' },
]

export const ALICUOTA_LABEL: Record<number, string> = {
  3: '0 %', 4: '10,5 %', 5: '21 %', 6: '27 %', 8: '5 %', 9: '2,5 %',
}

export const DOC_TIPOS: { id: VentasDocTipo; label: string; corto: string }[] = [
  { id: 80, label: 'CUIT',            corto: 'C.U.I.T.' },
  { id: 86, label: 'CUIL',            corto: 'C.U.I.L.' },
  { id: 96, label: 'DNI',             corto: 'D.N.I.' },
  { id: 99, label: 'Sin identificar', corto: 'Doc.' },
]

/** Tabla fija de ARCA (FEParamGetCondicionIvaReceptor). Factura A: 1, 6, 13, 16 con CUIT. */
export const CONDICIONES_IVA: Record<number, string> = {
  1:  'IVA Responsable Inscripto',
  4:  'IVA Sujeto Exento',
  5:  'Consumidor Final',
  6:  'Responsable Monotributo',
  7:  'Sujeto No Categorizado',
  8:  'Proveedor del Exterior',
  9:  'Cliente del Exterior',
  10: 'IVA Liberado – Ley 19.640',
  13: 'Monotributista Social',
  15: 'IVA No Alcanzado',
  16: 'Monotributo Trabajador Independiente Promovido',
}
export const CONDICIONES_ADMITEN_A = new Set([1, 6, 13, 16])
/** FEParamGetCondicionIvaReceptor('B') en homologación (23/09/2026). Ninguna está en las dos. */
export const CONDICIONES_ADMITEN_B = new Set([4, 5, 7, 8, 9, 10, 15])

/** ¿Se le puede hacer factura A? Mismo criterio que `_ventas_validar_receptor`. */
export function admiteFacturaA(docTipo: number, condicionIvaId: number): boolean {
  return docTipo === 80 && CONDICIONES_ADMITEN_A.has(condicionIvaId)
}

export type LetraVenta = 'A' | 'B'

/**
 * La letra la decide el cliente, no el usuario. Espejo de
 * `_ventas_validar_receptor` (20260924d) y de `letraDe` del backend:
 *   A → CUIT y condición 1, 6, 13 o 16;
 *   B → condición 4, 5, 7, 8, 9, 10 o 15, con cualquier documento;
 *   null → ninguna (RI o monotributo SIN CUIT): hay que corregir el cliente.
 */
export function letraDeCliente(docTipo: number, condicionIvaId: number): LetraVenta | null {
  if (admiteFacturaA(docTipo, condicionIvaId)) return 'A'
  if (CONDICIONES_ADMITEN_B.has(condicionIvaId)) return 'B'
  return null
}

export function letraDeTipo(cbteTipo: number): LetraVenta | null {
  if ([1, 3, 201, 203].includes(cbteTipo)) return 'A'
  if ([6, 8].includes(cbteTipo)) return 'B'
  return null
}

/** Factura o NC de esa letra: A → 1 / 3, B → 6 / 8. */
export function tipoPara(letra: LetraVenta, nc: boolean): 1 | 3 | 6 | 8 {
  if (letra === 'A') return nc ? 3 : 1
  return nc ? 8 : 6
}

export const esTipoNc = (cbteTipo: number | null | undefined) => cbteTipo === 3 || cbteTipo === 8 || cbteTipo === 203

/**
 * Desde este total el consumidor final se identifica (RG ARCA 5700/2025,
 * "igual o superior a $ 10.000.000"; en homologación ARCA rechaza con la
 * observación 10015 justo en ese número). Espejo de `_ventas_tope_cf()` y
 * de TOPE_CF_IDENTIFICACION del backend.
 */
export const TOPE_CF_IDENTIFICACION = 10_000_000

/** Comprobante B, receptor sin identificar (99) y total ≥ tope. */
export function requiereIdentificacion(letra: LetraVenta | null, docTipo: number, total: number): boolean {
  return letra === 'B' && docTipo === 99 && Math.round(total * 100) >= TOPE_CF_IDENTIFICACION * 100
}

/**
 * Provincias como las escribe Finnegans (sin tildes: el default de la base es
 * 'Tucuman'). Si una factura o un cliente trae otra forma, el select la agrega.
 */
export const PROVINCIAS = [
  'Buenos Aires', 'Capital Federal', 'Catamarca', 'Chaco', 'Chubut', 'Cordoba', 'Corrientes', 'Entre Rios',
  'Formosa', 'Jujuy', 'La Pampa', 'La Rioja', 'Mendoza', 'Misiones', 'Neuquen', 'Rio Negro', 'Salta',
  'San Juan', 'San Luis', 'Santa Cruz', 'Santa Fe', 'Santiago del Estero', 'Tierra del Fuego', 'Tucuman',
]
export const PROVINCIA_DEFAULT = 'Tucuman'
export const CONDICION_PAGO_DEFAULT = 'Cc Clientes'
export const UNIDAD_DEFAULT = 'Unidades'

export interface EstadoMeta {
  key:   VentasEstado
  label: string
  badge: string
  hint:  string
}

export const ESTADOS: EstadoMeta[] = [
  { key: 'borrador',          label: 'Borrador',          badge: 'bg-gris text-gris-dark',
    hint: 'Todavía no se mandó a ARCA: se puede editar, borrar o emitir.' },
  { key: 'emitiendo',         label: 'Emitiendo',         badge: 'bg-azul-light text-azul',
    hint: 'Se está mandando a ARCA en este momento.' },
  { key: 'autorizada',        label: 'Autorizada',        badge: 'bg-verde-light text-verde',
    hint: 'ARCA le dio número y CAE. Ya no se modifica: se anula con nota de crédito.' },
  { key: 'rechazada',         label: 'Rechazada',         badge: 'bg-naranja-light text-naranja-dark',
    hint: 'ARCA la rechazó. Volvela a borrador, corregila y emitila de nuevo.' },
  { key: 'error_reconciliar', label: 'Sin confirmar',     badge: 'bg-rojo text-white',
    hint: 'ARCA no respondió y no se sabe si la autorizó. Hay que verificarla en ARCA antes de seguir facturando.' },
  { key: 'descartada',        label: 'Descartada',        badge: 'bg-gris text-gris-mid line-through',
    hint: 'Se descartó sin emitir.' },
]
export const ESTADO_META = Object.fromEntries(ESTADOS.map(e => [e.key, e])) as Record<VentasEstado, EstadoMeta>

export const TIPOS_CBTE: { key: 1 | 3 | 6 | 8; label: string; corto: string }[] = [
  { key: 1, label: 'Factura A',          corto: 'FA' },
  { key: 3, label: 'Nota de crédito A',  corto: 'NCA' },
  { key: 6, label: 'Factura B',          corto: 'FB' },
  { key: 8, label: 'Nota de crédito B',  corto: 'NCB' },
]

/**
 * Lo que muestra el chip «Descripción» de la bandeja de Finnegans: el primer
 * renglón (truncado) y, si hay más, "+N". El botón copia TODAS completas.
 */
export function muestraDescripcion(descs: string[], max = 60): string {
  const primera = (descs[0] ?? '').replace(/\s+/g, ' ').trim()
  if (!primera) return ''
  const corta = primera.length > max ? `${primera.slice(0, max - 1).trimEnd()}…` : primera
  return descs.length > 1 ? `${corta} +${descs.length - 1}` : corta
}

/** "FA", "NCB"… para el tipo; "F" si no se conoce. */
export function cortoTipo(t: number | null | undefined): string {
  return TIPOS_CBTE.find(x => x.key === t)?.corto ?? 'F'
}

/** "Factura B", "Nota de crédito A"… */
export function nombreTipo(t: number | null | undefined): string {
  return TIPOS_CBTE.find(x => x.key === t)?.label ?? 'Comprobante'
}

// ── Formatos ──────────────────────────────────────────────────────────

/** $ 1.234,56 (es-AR, siempre 2 decimales). */
export function fmtM(n: number | string | null | undefined): string {
  const v = Number(n ?? 0)
  return '$ ' + v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** 1.234,56 sin símbolo (tablas del PDF). */
export function fmtN(n: number | string | null | undefined, dec = 2): string {
  return Number(n ?? 0).toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

/** Cantidad: sin ceros de más ("3", "2,5", "0,3525"). */
export function fmtCant(n: number | string | null | undefined): string {
  return Number(n ?? 0).toLocaleString('es-AR', { maximumFractionDigits: 4 })
}

/** Precio unitario: hasta 3 decimales, mínimo 2. */
export function fmtPrecio(n: number | string | null | undefined): string {
  return Number(n ?? 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })
}

/** YYYY-MM-DD (o timestamp) → DD/MM/YYYY. */
export function fmtFecha(s: string | null | undefined): string {
  if (!s) return ''
  const [y, m, d] = s.slice(0, 10).split('-')
  return y && m && d ? `${d}/${m}/${y}` : ''
}

export function fmtFechaHora(s: string | null | undefined): string {
  if (!s) return ''
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return fmtFecha(s)
  return d.toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

/** 33717191949 → 33-71719194-9. Lo que no tenga 11 dígitos sale como vino. */
export function fmtCuit(c: string | null | undefined): string {
  const d = (c ?? '').replace(/\D/g, '')
  return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : (c ?? '')
}

/** Documento del receptor para mostrar: CUIT con guiones, el resto tal cual. */
export function fmtDoc(tipo: number, nro: string): string {
  const t = DOC_TIPOS.find(x => x.id === tipo)
  if (tipo === 99) return 'Sin identificar'
  return `${t?.label ?? 'Doc'} ${tipo === 80 || tipo === 86 ? fmtCuit(nro) : nro}`
}

/**
 * Dígito verificador de CUIT/CUIL. Mismo algoritmo que `cuitValido` del
 * backend: el backend valida igual (400 CUIT_INVALIDO), esto es para avisar
 * antes de mandar.
 */
export function cuitValido(c: string): boolean {
  const d = c.replace(/\D/g, '')
  if (d.length !== 11) return false
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
  const suma = pesos.reduce((s, p, i) => s + p * Number(d[i]), 0)
  let dv = 11 - (suma % 11)
  if (dv === 11) dv = 0
  if (dv === 10) return false
  return dv === Number(d[10])
}

/** "FA 00003-00000012" o, sin número todavía, "FA borrador #12". */
export function numeroTxt(f: Pick<VentasFactura, 'cbte_tipo' | 'numero_fmt' | 'numero_intentado_fmt' | 'id' | 'estado'>): string {
  const corto = TIPOS_CBTE.find(t => t.key === f.cbte_tipo)?.corto ?? `Cbte ${f.cbte_tipo}`
  if (f.numero_fmt) return `${corto} ${f.numero_fmt}`
  if (f.numero_intentado_fmt && (f.estado === 'emitiendo' || f.estado === 'error_reconciliar')) {
    return `${corto} ${f.numero_intentado_fmt}?`
  }
  return `${corto} · borrador #${f.id}`
}

/** Hoy en Argentina, YYYY-MM-DD (no depende del huso del navegador). */
export function hoyAR(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

export function primerDiaDelMes(iso: string): string {
  return iso.slice(0, 8) + '01'
}

/** Número como lo tipea Finnegans: sin separador de miles, coma decimal ("4703,70"). */
export function numeroParaCopiar(n: number | string | null | undefined): string {
  return Number(n ?? 0).toFixed(2).replace('.', ',')
}

/**
 * Mensajes de ARCA (Errors / Observaciones / el `{ error }` del incierto)
 * como texto. La forma exacta la arma el backend; esto no se cae con ninguna.
 */
export function mensajesArca(v: unknown): string[] {
  if (!v) return []
  const arr = Array.isArray(v) ? v : [v]
  return arr.map(x => {
    if (typeof x === 'string') return x
    if (x && typeof x === 'object') {
      const o = x as Record<string, unknown>
      const code = o.code ?? o.Code
      const msg = o.msg ?? o.Msg ?? o.error ?? o.message
      if (code !== undefined || msg !== undefined) return [code, msg].filter(v2 => v2 !== undefined && v2 !== null).join(' — ')
      try { return JSON.stringify(x) } catch { return String(x) }
    }
    return String(x)
  }).filter(Boolean)
}

/** Qué quedó después de preguntarle a ARCA por un número intentado (/reconciliar). */
export function resultadoReconciliacion(
  f: Pick<VentasFactura, 'estado' | 'numero_fmt'>,
): { tono: 'ok' | 'warn' | 'err'; texto: string } {
  if (f.estado === 'autorizada') {
    return { tono: 'ok', texto: `✓ ARCA la tenía autorizada${f.numero_fmt ? `: N° ${f.numero_fmt}` : ''}.` }
  }
  if (f.estado === 'borrador') {
    return { tono: 'warn', texto: 'ARCA no la tenía: volvió a borrador. Podés emitirla de nuevo.' }
  }
  return { tono: 'err', texto: 'ARCA todavía no confirma nada. Probá de nuevo en un rato: el sistema también la verifica solo.' }
}
