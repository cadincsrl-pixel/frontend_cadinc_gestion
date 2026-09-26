// Listas cerradas y formatos del módulo Pagos, en un solo lugar.
//
// Son el espejo de `pagos.schema.ts` del backend: si allá cambia una lista,
// acá también. Tenerlas separadas de los tipos evita que cada tab invente su
// propio nombre para el mismo estado.

import type {
  PagosEstadoFactura, PagosFormaPagoOP, PagosFormaPagoOPGuardada, PagosFormaPrevista,
  PagosTipoAdjFactura, PagosTipoAdjOrden, PagosTipoComprobante, PagosFactura, AnularFacturaRes,
  PagosClaseComprobante, PagosAplicacionNc,
} from '@/types/domain.types'
import type { PagosFacturasFiltro } from '../hooks/usePagos'
import { CONDICIONES_IVA } from '@/lib/utils/arca'

// ── Estados de la factura ─────────────────────────────────────────────

export interface EstadoFacturaMeta {
  key:   PagosEstadoFactura
  label: string
  hint:  string
  /** Clases de la píldora en la tabla. */
  badge: string
}

export const ESTADOS_FACTURA: EstadoFacturaMeta[] = [
  { key: 'pendiente',      label: 'Pendiente',   hint: 'Cargada por compras, esperando aprobación',                          badge: 'bg-azul-light text-azul' },
  { key: 'observada',      label: 'Observada',   hint: 'Rechazada con motivo: compras la tiene que corregir',                badge: 'bg-naranja-light text-naranja-dark' },
  { key: 'aprobada',       label: 'Aprobada',    hint: 'Lista para pagar: es lo único que el contador puede pagar',          badge: 'bg-amarillo-light text-[#7A5000]' },
  { key: 'pagada_parcial', label: 'Pago parcial', hint: 'Se pagó una parte (o se acreditó una NC): todavía queda saldo',     badge: 'bg-[#EEE8FF] text-[#5A2D82]' },
  { key: 'pagada',         label: 'Pagada',      hint: 'Saldo en cero, entre plata y notas de crédito',                      badge: 'bg-verde-light text-verde' },
  { key: 'anulada',        label: 'Anulada',     hint: 'Se anuló con motivo: no es deuda ni cuenta en ningún total',         badge: 'bg-gris text-gris-dark' },
]

export const ESTADO_FACTURA_META =
  Object.fromEntries(ESTADOS_FACTURA.map(e => [e.key, e])) as Record<PagosEstadoFactura, EstadoFacturaMeta>

/**
 * Una NC usa los mismos estados que una factura pero significan otra cosa
 * (20260925): `aprobada` = tiene crédito disponible, `pagada_parcial` =
 * aplicada en parte, `pagada` = aplicada entera.
 */
export const ESTADO_NC_META: Partial<Record<PagosEstadoFactura, { label: string; hint: string }>> = {
  pendiente:      { label: 'Pendiente',        hint: 'Cargada, esperando aprobación: lo que declara acreditar queda reservado' },
  observada:      { label: 'Observada',        hint: 'Rechazada con motivo: compras la tiene que corregir' },
  aprobada:       { label: 'Crédito disponible', hint: 'Aprobada y sin aplicar: queda como crédito a favor del proveedor' },
  pagada_parcial: { label: 'Aplicada en parte', hint: 'Aprobada y aplicada a una parte: todavía queda crédito' },
  pagada:         { label: 'Aplicada',         hint: 'Todo su importe ya bajó deuda de facturas' },
  anulada:        { label: 'Anulada',          hint: 'Se anuló: la deuda volvió a las facturas' },
}

/** La etiqueta del estado según sea factura o NC. */
export function estadoLabel(estado: PagosEstadoFactura, clase?: PagosClaseComprobante | null): string {
  if (clase === 'nota_credito') return ESTADO_NC_META[estado]?.label ?? ESTADO_FACTURA_META[estado]?.label ?? estado
  return ESTADO_FACTURA_META[estado]?.label ?? estado
}
export function estadoHint(estado: PagosEstadoFactura, clase?: PagosClaseComprobante | null): string {
  if (clase === 'nota_credito') return ESTADO_NC_META[estado]?.hint ?? ''
  return ESTADO_FACTURA_META[estado]?.hint ?? ''
}

export const esNC = (f: { clase?: PagosClaseComprobante | null }) => f.clase === 'nota_credito'

/**
 * Lo máximo que se puede pagar con plata de una factura: `saldo_pagable`
 * (saldo − lo reservado por NC sin aprobar). Si la fila vino de un backend
 * viejo sin la columna, cae al saldo.
 */
export function topePagable(f: Pick<PagosFactura, 'saldo'> & { saldo_pagable?: number | null }): number {
  const v = f.saldo_pagable
  return Math.max(0, Number(v ?? f.saldo) || 0)
}

/** Un importe con el signo de su clase: la NC resta en totales y KPIs. */
export function conSigno(monto: number | null | undefined, clase?: PagosClaseComprobante | null): number {
  const v = Number(monto ?? 0) || 0
  return clase === 'nota_credito' ? -v : v
}

/** Códigos ARCA de NC → letra (y al revés, para mandar el código al backend). */
export const CBTE_NC_POR_LETRA: Record<'A' | 'B' | 'C', number> = { A: 3, B: 8, C: 13 }
export function esCodigoNC(cbte: number | null | undefined): boolean {
  return cbte != null && [3, 8, 13, 53, 203, 208, 213].includes(Number(cbte))
}

/** Los que todavía deben plata: los que cuentan para «vencida» y para la deuda. */
export const ESTADOS_ABIERTOS: PagosEstadoFactura[] = ['pendiente', 'observada', 'aprobada', 'pagada_parcial']

// ── Comprobantes y formas de pago ─────────────────────────────────────

export const TIPOS_COMPROBANTE: { key: PagosTipoComprobante; label: string }[] = [
  { key: 'A',      label: 'Factura A' },
  { key: 'B',      label: 'Factura B' },
  { key: 'C',      label: 'Factura C' },
  { key: 'recibo', label: 'Recibo' },
  { key: 'ticket', label: 'Ticket' },
  { key: 'otro',   label: 'Otro' },
]

/** Forma PREVISTA al cargar la factura (incluye `cta_cte`: quedó en cuenta corriente). */
export const FORMAS_PREVISTAS: { key: PagosFormaPrevista; label: string }[] = [
  { key: 'transferencia',     label: 'Transferencia' },
  { key: 'efectivo',          label: 'Efectivo' },
  { key: 'tarjeta',           label: 'Tarjeta' },
  { key: 'cheque',            label: 'Cheque' },
  { key: 'echeq',             label: 'E-cheq' },
  { key: 'debito_automatico', label: 'Débito automático' },
  { key: 'cta_cte',           label: 'Cuenta corriente' },
  { key: 'otro',              label: 'Otro' },
]

/** Forma REAL que elige quien paga. Sin `cta_cte`: quedar en cuenta corriente no es un pago. */
export const FORMAS_PAGO_OP: { key: PagosFormaPagoOP; label: string }[] = [
  { key: 'transferencia',     label: 'Transferencia' },
  { key: 'efectivo',          label: 'Efectivo' },
  { key: 'cheque',            label: 'Cheque' },
  { key: 'echeq',             label: 'E-cheq' },
  { key: 'tarjeta',           label: 'Tarjeta' },
  { key: 'debito_automatico', label: 'Débito automático' },
  { key: 'otro',              label: 'Otro' },
]

/** Sin plata no hay forma de pago: la OP de solo notas de crédito se muestra así. */
export const FORMA_SOLO_NC_LABEL = 'Solo nota de crédito'

export function formaPagoLabel(forma: PagosFormaPagoOPGuardada | null | undefined): string {
  if (!forma) return '—'
  if (forma === 'nota_credito') return FORMA_SOLO_NC_LABEL
  return FORMAS_PAGO_OP.find(f => f.key === forma)?.label ?? forma
}

/**
 * Cómo se nombra la plata que salió, según la forma (2026-09-23). «Salió del
 * banco» sólo es verdad para lo que pasa por el banco: el efectivo sale de la
 * caja y la tarjeta se debita después. El dueño lo marcó en una OP en efectivo.
 */
const FORMAS_BANCO = ['transferencia', 'cheque', 'echeq', 'debito_automatico'] as const
export function salidaLabel(forma: PagosFormaPagoOPGuardada | null | undefined, tiempo: 'pasado' | 'presente' = 'pasado'): string {
  const p = tiempo === 'pasado'
  if (forma && (FORMAS_BANCO as readonly string[]).includes(forma)) return p ? 'Salió del banco' : 'Sale del banco'
  if (forma === 'efectivo') return p ? 'Se pagó en efectivo' : 'Se paga en efectivo'
  if (forma === 'tarjeta') return p ? 'Se pagó con tarjeta' : 'Se paga con tarjeta'
  return p ? 'Se pagó' : 'Se paga'
}

/**
 * Con cheque o e-cheq el comprobante del pago es el archivo de CADA cheque
 * (20260929w, dueño: «el comprobante del echeq y del pago cuando es echeq o
 * cheque físico es el mismo»): no hay un comprobante aparte de toda la orden.
 */
export function comprobantePorCheque(forma: PagosFormaPagoOP): boolean {
  return forma === 'cheque' || forma === 'echeq'
}

/**
 * ¿Hace falta el comprobante APARTE de toda la orden? Sólo en transferencia.
 * En e-cheq lo que se pide es el comprobante de cada echeq (ver
 * `chequesSinComprobante` en utils/pagoForm); en cheque físico, el de cada
 * cheque es opcional. Espejo de `comprobanteFaltante` del backend.
 */
export function comprobanteObligatorio(forma: PagosFormaPagoOP): boolean {
  return forma === 'transferencia'
}

/** Por qué falta el comprobante aparte, para el tooltip y el aviso rojo. */
export function motivoComprobante(): string {
  return 'Una transferencia necesita el comprobante'
}

/**
 * Los archivos que prueban un pago ya registrado: el comprobante y, con
 * cheque/e-cheq, el de cada cheque. Espejo de `comprobantesDelAviso` del
 * backend (lo que viaja en el aviso por mail).
 */
export function comprobantesDelPago<T extends { tipo: string; borrado?: boolean }>(
  forma: PagosFormaPagoOPGuardada | null | undefined, adjuntos: readonly T[],
): T[] {
  const conCheques = forma === 'cheque' || forma === 'echeq'
  return adjuntos.filter(a => !a.borrado && (a.tipo === 'comprobante_pago' || (conCheques && a.tipo === 'cheque')))
}
/** Piden fecha de cobro (el cheque queda «en cartera» hasta ese día). */
export const FORMAS_CON_FECHA_COBRO: PagosFormaPagoOP[] = ['cheque', 'echeq']
/** La RPC copia el CBU/alias del padrón a la OP para estas formas. */
export const FORMAS_CON_CUENTA_DESTINO: PagosFormaPagoOP[] = ['transferencia', 'debito_automatico']

// ── Adjuntos ──────────────────────────────────────────────────────────

export const TIPOS_ADJ_FACTURA: { key: PagosTipoAdjFactura; label: string }[] = [
  { key: 'factura',      label: 'Factura' },
  { key: 'remito',       label: 'Remito' },
  { key: 'orden_compra', label: 'Orden de compra' },
  { key: 'otro',         label: 'Otro' },
]

export const TIPOS_ADJ_ORDEN: { key: PagosTipoAdjOrden; label: string }[] = [
  { key: 'comprobante_pago', label: 'Comprobante de pago' },
  { key: 'nota_credito',     label: 'Nota de crédito' },
  { key: 'recibo_proveedor', label: 'Recibo del proveedor' },
  { key: 'cheque',           label: 'Comprobante del cheque' },
  { key: 'otro',             label: 'Otro' },
]

/** Lo que se ofrece al subir un papel a una OP ya emitida (la foto del cheque entra al registrar el pago). */
export const TIPOS_ADJ_ORDEN_SUBIBLES: PagosTipoAdjOrden[] = ['comprobante_pago', 'recibo_proveedor', 'otro']

export function tipoAdjOrdenLabel(tipo: string): string {
  return TIPOS_ADJ_ORDEN.find(t => t.key === tipo)?.label ?? tipo
}

export const MIME_ADJUNTOS = 'image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf'
export const MAX_ADJUNTO_BYTES = 10 * 1024 * 1024

// ── Formatos ──────────────────────────────────────────────────────────

/**
 * Plata, SIEMPRE con centavos (2026-09-21).
 *
 * Redondeaba a pesos y eso escondía problemas en vez de simplificar: una
 * factura de $24.994,52 se leía "$24.995", alguien repartía 24995 y el
 * guardado se trababa avisando "Sobran $0". Y al revisar las 5 primeras
 * facturas contra el papel, esos 48 centavos habían terminado cargados como
 * total. En un módulo contable el centavo es el dato, no ruido.
 */
export const fmtM = (n: number | null | undefined) =>
  '$' + Number(n ?? 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function fmtFecha(s: string | null | undefined): string {
  if (!s) return '—'
  const [a, m, d] = s.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
export function fmtMes(s: string): string {
  const [a, m] = s.split('-')
  const nombre = MESES[Number(m) - 1]
  return nombre ? `${nombre} ${a}` : s
}

const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** «2026-09» o «2026-09-01» → «septiembre de 2026». */
export function fmtMesLargo(s: string | null | undefined): string {
  if (!s) return ''
  const [a, m] = s.split('-')
  const nombre = MESES_LARGOS[Number(m) - 1]
  return nombre ? `${nombre} de ${a}` : s
}

/** «2026-09-01» → «sep». Para el chip «IVA sep» de la lista. */
export function mesCorto(s: string | null | undefined): string {
  if (!s) return ''
  return MESES[Number(s.split('-')[1]) - 1] ?? ''
}

/**
 * Los meses (`YYYY-MM`) desde el de `desde` hasta `cantidad − 1` después.
 * El período IVA se puede correr hacia adelante, nunca antes de la fecha.
 */
export function mesesDesde(desde: string, cantidad = 13): string[] {
  const [y, m] = desde.split('-').map(Number) as [number, number]
  const out: string[] = []
  for (let i = 0; i < cantidad; i++) {
    const t = (m - 1) + i
    out.push(`${y + Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`)
  }
  return out
}

/** Tipo + número como se lee en el papel: «A 0001-00012345», «B s/n». */
export function comprobanteTxt(tipo: PagosTipoComprobante, numero: string | null, clase?: PagosClaseComprobante | null): string {
  return `${clase === 'nota_credito' ? 'NC ' : ''}${tipo} ${numero?.trim() || 's/n'}`
}

/**
 * Hoy en hora argentina (UTC-3). El backend valida `fecha ≤ hoy AR` con su
 * propio `hoyAR()`: si el default del form sale del reloj local de una
 * notebook con otra zona, el POST rebota con `FECHA_FUTURA`.
 */
/**
 * Parte `total` en `n` partes de 2 decimales. La ÚLTIMA absorbe los centavos
 * que no dividen, así que la suma da exacto: tanto el reparto por obra como
 * los cheques se validan contra una igualdad estricta en el backend y un
 * redondeo parejo los haría rebotar por $0,01.
 */
export function partirEnPartes(total: number, n: number): number[] {
  if (n <= 0 || total <= 0) return []
  const parte = Math.floor((total / n) * 100) / 100
  return Array.from({ length: n }, (_, i) =>
    i === n - 1 ? Math.round((total - parte * (n - 1)) * 100) / 100 : parte)
}

/** `iso` + `dias`, en ISO. Para escalonar cheques a 30 / 60 / 90. */
export function sumarDiasISO(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + dias)
  return d.toISOString().slice(0, 10)
}

/**
 * Plazos con los que se entregan los cheques, en días desde la fecha del pago.
 * Los dijo el dueño (2026-09-21): «0 días cuando es al día, 7 días, 15 días, y
 * cada 30 días así». `0` es un cheque al día — el backend acepta
 * `fecha_cobro = fecha` y rechaza sólo lo anterior.
 */
export const PLAZOS_CHEQUE = [0, 7, 15, 30, 45, 60, 90] as const

/**
 * ¿El texto trae algo con forma de CBU/CVU o de alias? Espejo de
 * `_pagos_pie_con_cbu` (20260929i) y de `pieConCbu` del backend: el pie del
 * aviso de pago no puede llevar la cuenta («cambió nuestro CBU, pagá acá»).
 * 22 dígitos (seguidos o de a uno con espacio/guion) o una palabra de 6–20
 * [a-z0-9.-] con una letra y un punto en el medio; los dominios web pasan.
 */
export function pieConCbu(texto: string | null | undefined): boolean {
  const t = String(texto ?? '')
  if (/(\d[ -]?){21}\d/.test(t)) return true
  return t.toLowerCase().split(/[^a-z0-9.-]+/).some(tok => {
    const w = tok.replace(/^[.-]+|[.-]+$/g, '')
    return /^[a-z0-9.-]{6,20}$/.test(w) && /[a-z]/.test(w) && /[a-z0-9]\.[a-z0-9]/.test(w)
      && !/^www\./.test(w) && !/\.(com|ar|net|org|gob|gov|edu|io|info)$/.test(w)
  })
}

/** De dónde salió la casilla del contador (GET /api/pagos/config → aviso.contador_fuente). */
export const FUENTE_CONTADOR: Record<'config' | 'env' | 'perfil', string> = {
  config: 'la cargada en Compras › Configuración',
  env: 'la del servidor (variable CONTADOR_EMAIL)',
  perfil: 'la del usuario con rol Contador',
}

/** Espejo de `esEmailValido` del backend. */
export function esEmailValido(s: string | null | undefined): boolean {
  const t = (s ?? '').trim()
  return t.length > 4 && t.length <= 254 && /^[^\s@,;]+@[^\s@,;.]+(\.[^\s@,;.]+)+$/.test(t)
}

export function plazoLabel(dias: number): string {
  return dias === 0 ? 'Al día' : `${dias} días`
}

/**
 * Fechas de cobro de `cantidad` cheques: el primero a `primerPlazo` días de
 * `fechaBase` y los siguientes cada `cadaDias`.
 *
 * Los dos plazos son parámetros y no una constante porque las dos formas de
 * pagar conviven: «0, 30 y 60» (la primera entrega es al día) y «30, 60 y 90»
 * (la primera ya es a plazo). Antes estaba fijo en 30·(i+1), así que un cheque
 * al día o a 7 días había que corregirlo a mano fila por fila.
 */
export function fechasEscalonadas(
  fechaBase: string, cantidad: number, primerPlazo: number, cadaDias: number,
): string[] {
  if (cantidad <= 0) return []
  return Array.from({ length: cantidad }, (_, i) =>
    sumarDiasISO(fechaBase, Math.max(0, primerPlazo) + Math.max(0, cadaDias) * i))
}

/**
 * Cómo se calcula el vencimiento de una factura de ese proveedor.
 *
 *  - `dias`: fecha de la factura + `plazo_pago_dias`. Cada factura arrastra
 *    su propio vencimiento. Es como venía funcionando el módulo.
 *  - `cierre_mensual`: la CUENTA CORRIENTE de verdad. Todo lo comprado en el
 *    mes cierra junto y vence junto, así que dos facturas del 2 y del 28
 *    vencen el MISMO día. Lo pidió el dueño el 2026-09-21 con el caso Silva:
 *    «cierra el último día del mes y vence a los 30 días del último día hábil».
 */
export const VENCIMIENTO_MODOS = [
  { key: 'dias',           label: 'A x días de cada factura' },
  { key: 'cierre_mensual', label: 'Cierre mensual (cuenta corriente)' },
  { key: 'fin_mes_siguiente', label: 'Fin del mes siguiente (p. ej. grupo Silva)' },
] as const
export type VencimientoModo = (typeof VENCIMIENTO_MODOS)[number]['key']

/** Los tres datos del proveedor que entran al cálculo. */
export interface PlazoProveedor {
  vencimiento_modo?: VencimientoModo | null
  /** Día del mes en que cierra la cuenta. `null` = el último día del mes. */
  cierre_dia?:       number | null
  plazo_pago_dias?:  number | null
}

/** Día de la semana en UTC: 0 domingo, 6 sábado. */
function diaSemana(iso: string): number {
  return new Date(iso + 'T12:00:00Z').getUTCDay()
}

/** Último día del mes al que pertenece `iso`. */
export function ultimoDiaDelMes(iso: string): string {
  const [a, m] = iso.split('-').map(Number)
  return new Date(Date.UTC(a!, m!, 0)).toISOString().slice(0, 10)
}

/**
 * El mismo día si es hábil; si cae sábado o domingo, retrocede al viernes.
 *
 * OJO: hábil acá es lunes a viernes y NADA MÁS. El sistema no tiene calendario
 * de feriados (lo busqué en los dos repos y en la base: no existe), así que un
 * cierre que cae en feriado no se corrige solo. El vencimiento queda editable
 * a mano en el modal justamente por esto.
 */
export function ultimoDiaHabil(iso: string): string {
  let d = iso
  for (let i = 0; i < 7 && (diaSemana(d) === 0 || diaSemana(d) === 6); i++) {
    d = sumarDiasISO(d, -1)
  }
  return d
}

/**
 * Fecha en que cierra la cuenta de una factura emitida el `fecha`.
 * Sin `cierre_dia`, cierra el último día de ese mes. Con un día fijo, cierra
 * ese día; si la factura salió después, pasa al mes siguiente.
 */
export function fechaDeCierre(fecha: string, cierreDia?: number | null): string {
  if (!cierreDia || cierreDia <= 0) return ultimoDiaDelMes(fecha)
  const [a, m, d] = fecha.split('-').map(Number)
  const dentro = d! <= cierreDia
  const mes = dentro ? m! : m! + 1
  const ultimo = Number(ultimoDiaDelMes(new Date(Date.UTC(a!, mes - 1, 1)).toISOString().slice(0, 10)).slice(8))
  const dia = Math.min(cierreDia, ultimo)          // un cierre el 31 en febrero es el 28
  return new Date(Date.UTC(a!, mes - 1, dia)).toISOString().slice(0, 10)
}

/**
 * El vencimiento que se propone al cargar la factura. Devuelve null si no
 * alcanzan los datos. Siempre es una SUGERENCIA: el campo queda editable.
 */
export function vencimientoSugerido(fecha: string, prov: PlazoProveedor | null | undefined): string | null {
  if (!fecha || !prov) return null
  // Grupo Silva (27/09/2026): las facturas de un mes se pagan hasta el último día del mes siguiente.
  if (prov.vencimiento_modo === 'fin_mes_siguiente') {
    const [a, m] = fecha.split('-').map(Number)
    return new Date(Date.UTC(a!, m! + 1, 0)).toISOString().slice(0, 10)
  }
  const dias = prov.plazo_pago_dias ?? 30
  if (prov.vencimiento_modo === 'cierre_mensual') {
    return sumarDiasISO(ultimoDiaHabil(fechaDeCierre(fecha, prov.cierre_dia)), dias)
  }
  return sumarDiasISO(fecha, dias)
}

/**
 * El número de la factura son DOS cosas, como en el papel: el punto de venta
 * y el número del comprobante, separados por un guion ("0013-00402141").
 *
 * Se cargan en dos campos a propósito (pedido del dueño, 2026-09-21). Con un
 * solo campo cada uno lo escribía distinto: en las primeras 5 facturas
 * cargadas convivían "0013-00402141", "0001100000194" y "0883700004557", tres
 * formatos para la misma cosa. `normNumeroFactura` del backend los compara
 * bien igual, pero el dato queda sucio y no se puede leer de un vistazo.
 *
 * Se guarda compuesto en `numero`, con el punto de venta a 4 dígitos y el
 * comprobante a 8, que es como lo imprime AFIP.
 */
export function componerNumero(pv: string, nro: string): string {
  const p = pv.replace(/\D/g, '').slice(0, 5)
  const n = nro.replace(/\D/g, '').slice(0, 8)
  if (!p && !n) return ''
  return `${p.padStart(4, '0')}-${n.padStart(8, '0')}`
}

/**
 * Al revés, para editar una factura ya cargada. Si no tiene guion (las viejas,
 * tipeadas de corrido) se parte igual que `normNumeroFactura`: los últimos 8
 * dígitos son el comprobante y lo de antes el punto de venta.
 */
export function partirNumero(numero: string | null | undefined): { pv: string; nro: string } {
  const t = (numero ?? '').trim()
  if (!t) return { pv: '', nro: '' }
  if (t.includes('-')) {
    const [a = '', ...resto] = t.split('-')
    return { pv: a.replace(/\D/g, ''), nro: resto.join('').replace(/\D/g, '') }
  }
  const d = t.replace(/\D/g, '')
  if (!d) return { pv: '', nro: '' }
  return { pv: d.slice(0, -8), nro: d.slice(-8) }
}

export function hoyAR(): string {
  const ahora = new Date()
  const ar = new Date(ahora.getTime() - 3 * 60 * 60 * 1000)
  return ar.toISOString().slice(0, 10)
}

// ── Respuestas ────────────────────────────────────────────────────────

/**
 * Anular una factura devuelve la fila sola, salvo que fuera «pagada al cargar»:
 * ahí devuelve `{ factura, orden }` porque anula las dos. Una sola forma de
 * leerlo, para que ningún tab se coma el caso.
 */
export function facturaAnulada(res: AnularFacturaRes): PagosFactura {
  return 'factura' in res ? res.factura : res
}

/**
 * El filtro de la bandeja, en castellano (2026-09-21).
 *
 * Va impreso arriba del resumen PDF y adentro del CONTENIDO.txt del paquete.
 * Un resumen sin esta línea es una trampa: alguien lo imprime filtrado por
 * «vencidas» y después lo lee como si fuera toda la deuda.
 */
export function describirFiltroFacturas(
  f: PagosFacturasFiltro,
  nombreProveedor?: (id: number) => string | undefined,
  nombreConcepto?: (id: number) => string | undefined,
): string {
  const p: string[] = []
  if (f.q?.trim()) p.push(`búsqueda «${f.q.trim()}»`)
  if (f.proveedor_id) p.push(nombreProveedor?.(f.proveedor_id) ?? `proveedor #${f.proveedor_id}`)
  if (f.concepto_id) p.push(`concepto ${nombreConcepto?.(f.concepto_id) ?? `#${f.concepto_id}`}`)
  if (f.estados?.length) {
    p.push(f.estados.map(e => ESTADO_FACTURA_META[e]?.label ?? e).join(' o '))
  }
  if (f.clase === 'nota_credito') p.push(f.con_credito ? 'notas de crédito con crédito disponible' : 'solo notas de crédito')
  if (f.clase === 'factura') p.push('solo facturas')
  if (f.tipo) p.push(`tipo ${f.tipo}`)
  if (f.forma_pago) {
    p.push(`a pagar con ${FORMAS_PREVISTAS.find(x => x.key === f.forma_pago)?.label ?? f.forma_pago}`)
  }
  const venc: Record<string, string> = {
    vencidas: 'vencidas', '7': 'vencen dentro de 7 días', '30': 'vencen dentro de 30 días',
  }
  if (f.vencimiento && f.vencimiento !== 'todas') p.push(venc[f.vencimiento] ?? f.vencimiento)
  if (f.obra_cod) p.push(`obra ${f.obra_cod}`)
  if (f.centro_costo) p.push(`cliente u obra ${f.centro_costo}`)
  if (f.desde && f.hasta) p.push(`emitidas del ${fmtFecha(f.desde)} al ${fmtFecha(f.hasta)}`)
  else if (f.desde) p.push(`emitidas desde el ${fmtFecha(f.desde)}`)
  else if (f.hasta) p.push(`emitidas hasta el ${fmtFecha(f.hasta)}`)
  if (f.sin_adjunto) p.push('sin comprobante adjunto')
  if (f.sin_numero) p.push('sin número')
  if (f.sin_revisar) p.push('pagadas sin revisar')
  if (f.sin_desglose) p.push('sin desglose de impuestos')
  if (f.cuenta_cambiada) p.push('con la cuenta del proveedor cambiada')
  if (f.paga_cliente === true) p.push('las paga el cliente')
  if (f.paga_cliente === false) p.push('las paga CADINC')
  if (f.pagada_al_cargar === true) p.push('cargadas ya pagadas')
  if (f.es_interna === true) p.push('de obra interna')
  if (f.periodo_iva) p.push(`informadas en el IVA de ${fmtMesLargo(f.periodo_iva)}`)
  if (f.periodo_iva_distinto) p.push('informadas en otro mes que el de la fecha')
  if (f.sin_imputar === true) p.push('importadas sin imputar')
  if (f.pago_a_reconstruir === true) p.push('de meses ya pagados (pago a reconstruir)')
  if (f.tributos_a_revisar) p.push('con otros tributos sin clasificar')
  if (f.origen_carga === 'arca_recibidos') p.push('importadas de ARCA')
  if (f.importacion_id) p.push(`de la importación #${f.importacion_id}`)
  if (f.anuladas) p.push('incluye anuladas')
  if (f.archivadas) p.push('incluye archivadas')
  return p.length === 0 ? 'todas las facturas' : p.join(' · ')
}

/**
 * Cómo se reparte un importe ya pagado entre las facturas que cubre
 * (2026-09-21).
 *
 * Reclamo del dueño: «cuando cargo varios pagos distintos en la OP tengo que
 * poner a mano arriba el "se paga", eso no sé qué sentido tiene». Cuando se
 * paga con cheques, los cheques SON el pago: están escritos y entregados, cada
 * uno con su importe. El total es una consecuencia, no un dato a tipear.
 *
 * El criterio es LO MÁS VIEJO PRIMERO, que es cómo se imputa un pago: se
 * cancela la deuda más vieja y lo que sobra sigue para la siguiente. Lo que
 * sobre después de cubrirlas todas es plata entregada de más y va «a cuenta»,
 * que es exactamente lo que es.
 *
 * `tope` por factura es lo que queda para PLATA: su `saldo_pagable` (el saldo
 * menos lo reservado por una NC todavía sin aprobar, 20260925).
 */
export interface FacturaARepartir {
  id:       number
  /** Para ordenar. null = sin vencimiento, va al final. */
  vence_el: string | null
  /** Lo máximo que admite de plata: `saldo_pagable`. */
  tope:     number
}

export function repartirPagoEntreFacturas(
  importe: number, facturas: FacturaARepartir[],
): { porFactura: Map<number, number>; aCuenta: number } {
  const r2 = (v: number) => Math.round(v * 100) / 100
  const porFactura = new Map<number, number>()
  let resto = r2(Math.max(0, importe))

  const masViejaPrimero = [...facturas].sort((a, b) =>
    (a.vence_el ?? '9999-12-31').localeCompare(b.vence_el ?? '9999-12-31') || a.id - b.id)

  for (const f of masViejaPrimero) {
    const pone = r2(Math.min(Math.max(0, f.tope), resto))
    porFactura.set(f.id, pone)
    resto = r2(resto - pone)
  }
  return { porFactura, aCuenta: resto }
}

/**
 * El reparto por obra por defecto de una NOTA DE CRÉDITO (20260925): el de las
 * facturas que acredita, prorrateado por lo que se le aplica a cada una.
 *
 * Una NC de $300 sobre una factura imputada 2/3 a LAMADRID y 1/3 a CC CADINC
 * reparte $200 y $100. Si acredita varias, se suman las partes por obra. Al
 * final se escala a `imputableNc` (total − percepciones de la NC) y la ÚLTIMA
 * obra absorbe los centavos: el backend valida la suma al centavo.
 *
 * Devuelve [] si no hay con qué prorratear (sin facturas, o ninguna imputada).
 */
export function repartoProrrateado(
  facturas: { aplicado: number; imputable: number; imputaciones: { obra_cod: string; monto: number }[] }[],
  imputableNc: number,
): { obra_cod: string; monto: number }[] {
  const r2 = (v: number) => Math.round(v * 100) / 100
  const peso = new Map<string, number>()
  for (const f of facturas) {
    const base = f.imputaciones.reduce((s, im) => s + Number(im.monto || 0), 0) || Number(f.imputable || 0)
    if (!(f.aplicado > 0) || !(base > 0)) continue
    for (const im of f.imputaciones) {
      const parte = (Number(im.monto || 0) / base) * f.aplicado
      if (parte > 0) peso.set(im.obra_cod, (peso.get(im.obra_cod) ?? 0) + parte)
    }
  }
  const total = [...peso.values()].reduce((s, v) => s + v, 0)
  if (!(total > 0) || !(imputableNc > 0)) return []
  const obras = [...peso.entries()]
  let acumulado = 0
  return obras.map(([obra_cod, p], i) => {
    if (i === obras.length - 1) return { obra_cod, monto: r2(imputableNc - acumulado) }
    const m = r2((p / total) * imputableNc)
    acumulado = r2(acumulado + m)
    return { obra_cod, monto: m }
  })
}

/**
 * La contraparte de una aplicación de NC: vista desde la NC es la factura,
 * vista desde la factura es la NC. Tolera la forma anidada (`nc`/`factura`) y
 * la plana, porque la del backend todavía no está cerrada.
 */
export function contraparteAplicacion(a: PagosAplicacionNc, desde: 'nc' | 'factura'): {
  id: number
  tipo_comprobante: PagosTipoComprobante | null
  numero: string | null
  fecha: string | null
  estado: PagosEstadoFactura | null
  total: number | null
} {
  const anidada = desde === 'nc' ? a.factura : a.nc
  return {
    id:               desde === 'nc' ? a.factura_id : a.nc_id,
    tipo_comprobante: anidada?.tipo_comprobante ?? a.tipo_comprobante ?? null,
    numero:           anidada?.numero ?? a.numero ?? null,
    fecha:            anidada?.fecha ?? a.fecha ?? null,
    estado:           anidada?.estado ?? a.estado ?? null,
    total:            anidada?.total ?? a.total ?? null,
  }
}

/** ¿La NC de esta aplicación ya bajó deuda? (aprobada y vigente). */
export function aplicacionFirme(a: PagosAplicacionNc): boolean {
  if (a.vigente === false || a.nc?.estado === 'anulada') return false
  if (a.aprobada != null) return !!a.aprobada
  return !!a.nc?.aprobada_at
}

// ── Condición frente al IVA del proveedor (20260925o) ─────────────────

export function condicionIvaTxt(id: number | null | undefined): string | null {
  if (id == null) return null
  return CONDICIONES_IVA[id] ?? `Condición ${id}`
}

/** Monotributo (6), social (13) y trabajador independiente promovido (16). */
const CONDICIONES_MONOTRIBUTO = new Set([6, 13, 16])

/**
 * ¿La letra de la factura choca con la condición del proveedor? Espejo del
 * aviso `LETRA_NO_COINCIDE_CONDICION` del backend (NO bloquea):
 *   - monotributista que factura A o B (factura C);
 *   - responsable inscripto que factura C;
 *   - exento que factura A.
 * Devuelve el texto del aviso, o null si no hay nada que decir.
 */
export function avisoLetraCondicion(
  condicionIvaId: number | null | undefined, letra: PagosTipoComprobante | string | null | undefined,
): string | null {
  if (condicionIvaId == null || !letra) return null
  const cond = condicionIvaTxt(condicionIvaId)
  if (CONDICIONES_MONOTRIBUTO.has(condicionIvaId) && (letra === 'A' || letra === 'B')) {
    return `El proveedor figura como «${cond}» y un monotributista factura C, no ${letra}. Revisá la letra o la condición del proveedor.`
  }
  if (condicionIvaId === 1 && letra === 'C') {
    return `El proveedor figura como «${cond}» y un responsable inscripto le factura A a CADINC, no C. Revisá la letra o la condición del proveedor.`
  }
  if (condicionIvaId === 4 && letra === 'A') {
    return `El proveedor figura como «${cond}» y un exento no factura A. Revisá la letra o la condición del proveedor.`
  }
  return null
}

// ── Padrón de ARCA ────────────────────────────────────────────────────

/** Persona física / jurídica, en castellano. */
export function tipoPersonaTxt(t: string | null | undefined): string | null {
  if (!t) return null
  if (t === 'FISICA') return 'Persona física'
  if (t === 'JURIDICA') return 'Persona jurídica'
  return t
}

/** La actividad principal que trae el padrón (la primera), con su código si lo tiene. */
export function actividadPrincipalDe(p: { actividades?: { codigo?: number | string; id?: number; descripcion: string }[] }): string | null {
  const a = p.actividades?.[0]
  if (!a) return null
  const cod = a.codigo ?? a.id
  return cod != null && cod !== '' ? `${cod} — ${a.descripcion}` : a.descripcion
}

/** `actualizados` / `sin_cuit` pueden venir como número o como lista. */
export function cantidadDe(v: number | unknown[] | null | undefined): number {
  if (Array.isArray(v)) return v.length
  return Number(v ?? 0)
}
