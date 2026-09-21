// Listas cerradas y formatos del módulo Pagos, en un solo lugar.
//
// Son el espejo de `pagos.schema.ts` del backend: si allá cambia una lista,
// acá también. Tenerlas separadas de los tipos evita que cada tab invente su
// propio nombre para el mismo estado.

import type {
  PagosEstadoFactura, PagosFormaPagoOP, PagosFormaPagoOPGuardada, PagosFormaPrevista,
  PagosTipoAdjFactura, PagosTipoAdjOrden, PagosTipoComprobante, PagosFactura, AnularFacturaRes,
} from '@/types/domain.types'

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

/** «Ya está pagada» al cargar: compras solo con estas dos; admin con cualquiera. */
export const FORMAS_PAGADA_AL_CARGAR_COMPRAS: PagosFormaPagoOP[] = ['tarjeta', 'efectivo']
/** Si hay plata, sin comprobante el backend rebota con `COMPROBANTE_REQUERIDO`. */
export const FORMAS_CON_COMPROBANTE_OBLIGATORIO: PagosFormaPagoOP[] = ['transferencia', 'echeq']
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
  { key: 'otro',             label: 'Otro' },
]

export const MIME_ADJUNTOS = 'image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf'
export const MAX_ADJUNTO_BYTES = 10 * 1024 * 1024

// ── Formatos ──────────────────────────────────────────────────────────

export const fmtM = (n: number | null | undefined) => '$' + Math.round(Number(n ?? 0)).toLocaleString('es-AR')

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

/** Tipo + número como se lee en el papel: «A 0001-00012345», «B s/n». */
export function comprobanteTxt(tipo: PagosTipoComprobante, numero: string | null): string {
  return `${tipo} ${numero?.trim() || 's/n'}`
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
