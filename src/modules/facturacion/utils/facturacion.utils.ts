// Constantes y formatos del módulo Facturación.
//
// Módulo independiente (como Pagos): no importa nada de pagos ni de
// certificaciones. Las tablas de ARCA (condición IVA, tipos de documento,
// alícuotas) son fijas y están espejadas acá para el PDF y los labels; el
// SELECT de condición IVA igual sale de /condiciones-iva, que además dice cuál
// admite factura A.

import type {
  VentasAlicuotaId, VentasDocTipo, VentasEstado, VentasFactura,
} from '@/types/domain.types'
import type { ProductoVenta } from '@/types/config.types'

/**
 * Productos de venta de RESPALDO: la semilla de `ventas_productos`
 * (20260929b), con los mismos ids. El catálogo real sale de
 * GET /api/facturacion/productos (`useProductosVenta`); esto se usa solo si
 * el backend todavía no tiene el endpoint (404) o no responde.
 */
export const PRODUCTOS: ProductoVenta[] = [
  { id: 1, nombre: 'AVANCE DE OBRA', descripcion: 'Certificados de avance de obra. La obra es obligatoria (es el centro de costo).',
    concepto_arca: 3, pide_obra: true, pide_periodo: false, activo: true, orden: 10, facturas: 0, mapeado: true },
  { id: 2, nombre: 'TRANSPORTE', descripcion: 'Fletes de logística. La obra es opcional.',
    concepto_arca: 2, pide_obra: false, pide_periodo: false, activo: true, orden: 20, facturas: 0, mapeado: true },
]

/** Conceptos de ARCA (FEParamGetTiposConcepto). */
export const CONCEPTO_ARCA_LABEL: Record<1 | 2 | 3, string> = {
  1: 'Productos',
  2: 'Servicios',
  3: 'Productos y servicios',
}

/**
 * El nombre del producto para mostrar: los que están todo en mayúsculas (la
 * semilla: «AVANCE DE OBRA») salen en oración («Avance de obra»); lo demás,
 * tal cual lo escribieron.
 */
export function etiquetaProducto(nombre: string | null | undefined): string {
  const n = (nombre ?? '').trim()
  if (!n) return '—'
  if (n !== n.toUpperCase() || n === n.toLowerCase()) return n
  const bajo = n.toLocaleLowerCase('es-AR')
  return bajo.charAt(0).toLocaleUpperCase('es-AR') + bajo.slice(1)
}

/** Ayuda del selector: descripción + concepto ARCA + qué pide. */
export function hintProducto(p: Pick<ProductoVenta, 'descripcion' | 'concepto_arca' | 'pide_obra' | 'pide_periodo'>): string {
  return [
    p.descripcion.trim(),
    `Concepto ARCA ${p.concepto_arca} (${CONCEPTO_ARCA_LABEL[p.concepto_arca].toLowerCase()}).`,
    p.pide_obra ? 'Pide obra.' : 'Obra opcional.',
    p.pide_periodo ? 'Pide el período facturado.' : '',
  ].filter(Boolean).join(' ')
}

/** Primer y último día del mes de una fecha YYYY-MM-DD (default del período facturado). */
export function mesDeFecha(iso: string): { desde: string; hasta: string } {
  const [y, m] = iso.split('-').map(Number) as [number, number]
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const mm = String(m).padStart(2, '0')
  return { desde: `${y}-${mm}-01`, hasta: `${y}-${mm}-${String(ultimo).padStart(2, '0')}` }
}

/**
 * La obra de la factura, «COD — Nombre»: es su centro de costo (23/09). Con el
 * nombre de hoy de la obra; si no tiene obra, la foto que guardó la base
 * (`centro_costo`: en las viejas de homologación, el `cc` de antes). null =
 * sin obra (transporte).
 */
export function obraDeFactura(f: Pick<VentasFactura, 'obra_cod' | 'obra_nom' | 'centro_costo'>): string | null {
  if (f.obra_cod) return f.obra_nom ? `${f.obra_cod} — ${f.obra_nom}` : f.obra_cod
  return f.centro_costo?.trim() || null
}

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

// CONDICIONES_IVA, PROVINCIAS y cuitValido viven en `@/lib/utils/arca` (compartidos con Compras).
export { CONDICIONES_IVA, PROVINCIAS, cuitValido } from '@/lib/utils/arca'
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

/** Factura o NC de esa letra: A → 1 / 3, B → 6 / 8; con `fce`, la FCE MiPyME A → 201 / 203. */
export function tipoPara(letra: LetraVenta, nc: boolean, fce = false): 1 | 3 | 6 | 8 | 201 | 203 {
  if (letra === 'A') return fce ? (nc ? 203 : 201) : (nc ? 3 : 1)
  return nc ? 8 : 6
}

export const esTipoNc = (cbteTipo: number | null | undefined) => cbteTipo === 3 || cbteTipo === 8 || cbteTipo === 203
export const esTipoFce = (cbteTipo: number | null | undefined) => cbteTipo === 201 || cbteTipo === 203

/**
 * Monto mínimo de la Factura de Crédito Electrónica MiPyME: $ 5.549.862.
 * Fuente: Registro de FCE MiPyMEs de ARCA, vigente desde el 14/04/2026
 * (consultado el 23/09/2026). Espejo de `_ventas_monto_minimo_fce()`
 * (20260924e) y de MONTO_MINIMO_FCE del backend (reglas.ts). El monto de
 * cada receptor lo dice WSFECRED.
 */
export const MONTO_MINIMO_FCE = 5_549_862

export const TRANSMISIONES_FCE: { id: 'SCA' | 'ADC'; label: string }[] = [
  { id: 'SCA', label: 'Sistema de Circulación Abierta (SCA)' },
  { id: 'ADC', label: 'Agente de Depósito Colectivo (ADC)' },
]
export const TRANSMISION_LABEL: Record<string, string> = {
  SCA: 'Sistema de Circulacion Abierta',
  ADC: 'Agente de Deposito Colectivo',
}

/**
 * ¿Le corresponde FCE? Espejo de `correspondeFce` del backend: obligado y
 * total ≥ su monto (o el mínimo general) → true; no obligado o por debajo →
 * false; sin dato de WSFECRED → null (no se bloquea: el usuario elige).
 */
export function correspondeFce(
  info: { obligado: boolean | null; monto_desde: number | null } | null | undefined,
  total: number,
): boolean | null {
  if (!info || info.obligado === null) return null
  if (!info.obligado) return false
  const piso = info.monto_desde ?? MONTO_MINIMO_FCE
  return Math.round(total * 100) >= Math.round(piso * 100)
}

/** CBU 22 dígitos con sus verificadores (mismo algoritmo que `cbuValido` del backend). */
export function cbuValido(cbu: string): boolean {
  const d = cbu.replace(/\D/g, '')
  if (!/^\d{22}$/.test(d)) return false
  const w1 = [7, 1, 3, 9, 7, 1, 3]
  const w2 = [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3]
  let s = 0
  for (let i = 0; i < 7; i++) s += Number(d[i]) * w1[i]!
  if ((10 - (s % 10)) % 10 !== Number(d[7])) return false
  s = 0
  for (let i = 0; i < 13; i++) s += Number(d[8 + i]) * w2[i]!
  return (10 - (s % 10)) % 10 === Number(d[21])
}

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

export const TIPOS_CBTE: { key: 1 | 3 | 6 | 8 | 201 | 203; label: string; corto: string }[] = [
  { key: 1,   label: 'Factura A',                  corto: 'FA' },
  { key: 3,   label: 'Nota de crédito A',          corto: 'NCA' },
  { key: 6,   label: 'Factura B',                  corto: 'FB' },
  { key: 8,   label: 'Nota de crédito B',          corto: 'NCB' },
  { key: 201, label: 'Factura de Crédito MiPyME A', corto: 'FCE A' },
  { key: 203, label: 'NC de Crédito MiPyME A',      corto: 'NC FCE A' },
]

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

/**
 * La descripción de un renglón para imprimir. Respeta los enters que tipeó el
 * usuario, pero junta los que dejan una palabra huérfana ("…correspondiente
 * a\nla\nobra"): un salto SIMPLE se vuelve espacio si la línea siguiente
 * arranca en minúscula. Se mantienen los saltos dobles (párrafos, colapsados
 * a uno en blanco) y las líneas que empiezan con mayúscula, número o viñeta.
 */
export function normalizarDescripcion(texto: string): string {
  const lineas = texto.replace(/\r\n?/g, '\n').split('\n').map(l => l.replace(/[ \t]+$/g, ''))
  const out: string[] = []
  for (const l of lineas) {
    const t = l.trim()
    const prev = out.length ? out[out.length - 1]! : null
    if (!t) {
      if (prev !== null && prev !== '') out.push('')
      continue
    }
    const vineta = /^[-•*·–—>]/.test(t)
    const minuscula = /^[a-zñáéíóúü(]/.test(t)
    if (prev && !vineta && minuscula) out[out.length - 1] = `${prev} ${t}`
    else out.push(t)
  }
  while (out.length && out[out.length - 1] === '') out.pop()
  return out.join('\n')
}
