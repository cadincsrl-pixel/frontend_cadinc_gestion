// Lo puro del formulario de pago, compartido por «Registrar pago» (un
// proveedor) y «Pagar en lote» (una OP por proveedor, 20260929t). Si una regla
// cambia acá, cambia en los dos modales a la vez: ése es el punto.

import { aRaw } from '@/components/ui/InputMonto'
import { FORMAS_PAGO_OP, repartirPagoEntreFacturas, topePagable } from './pagos.utils'
import type { PagosAdjuntoPendiente, PagosChequeNuevo, PagosFactura, PagosFormaPagoOP, PagosLineaOrdenInput } from '@/types/domain.types'

/**
 * Lo tipeado → número. Usa el MISMO parser que `InputMonto` (2026-09-21), así
 * el punto del teclado numérico y la coma dan lo mismo en todo el sistema.
 * Antes acá el punto era separador de MILES: tipear "24994.52" daba
 * $2.499.452, cien veces de más y sin aviso.
 */
export const n = (s: string) => {
  const v = Number(aRaw(String(s), 2))
  return Number.isFinite(v) ? v : 0
}
export const r2 = (v: number) => Math.round(v * 100) / 100
/** Entero de un input de texto; 0 si está vacío o es basura. */
export const nEntero = (s: string) => {
  const v = parseInt(String(s), 10)
  return Number.isFinite(v) ? v : 0
}

// ── Forma de pago ─────────────────────────────────────────────────────

export const FORMA_POR_DEFECTO: PagosFormaPagoOP = 'transferencia'

/**
 * Con qué forma arranca el modal (2026-09-21).
 *
 * Pedido del dueño: «cuando cargo un pago no está por defecto el formulario
 * según la solicitud de pago, está medio confuso». Tenía razón — arrancaba
 * fijo en «Transferencia» aunque la factura dijera otra cosa, así que la
 * forma prevista que se eligió al cargarla no servía para nada al pagar y
 * había que volver a elegirla de memoria.
 *
 * Se usa la prevista SÓLO si todas las facturas de la OP coinciden. Una OP
 * puede cubrir varias facturas, y si preveían formas distintas adivinar sería
 * peor que no adivinar: queda el default y lo elige la persona.
 *
 * `cta_cte` no está en FORMAS_PAGO_OP a propósito (quedar en cuenta corriente
 * no es un pago), así que cae al default. Es justamente la factura que llega
 * al momento de pagarse y todavía no sabe con qué se va a pagar.
 *
 * `porDefecto`: en el lote, la forma común de arriba (20260929t).
 */
export function formaSegunLoPrevisto(facturas: PagosFactura[], porDefecto: PagosFormaPagoOP = FORMA_POR_DEFECTO): PagosFormaPagoOP {
  if (facturas.length === 0) return porDefecto
  const previstas = new Set(facturas.map(f => f.forma_pago_prevista))
  if (previstas.size !== 1) return porDefecto
  const unica = [...previstas][0]
  return FORMAS_PAGO_OP.some(f => f.key === unica) ? (unica as PagosFormaPagoOP) : porDefecto
}

// ── Facturas de la OP ─────────────────────────────────────────────────

export interface FilaFactura {
  factura: PagosFactura
  /** Lo que se paga con plata. */
  monto: string
}

/** Precargar con el saldo pagable de cada factura: es lo que se paga el 90 % de las veces. */
export function filasIniciales(facturas: PagosFactura[]): FilaFactura[] {
  return facturas.map(f => ({ factura: f, monto: String(topePagable(f)) }))
}

/** Las filas donde la plata se pasa de lo pagable (saldo − NC reservada). Ya no frena: el exceso va a cuenta (`normalizarPago`). */
export function filasQueSePasan(filas: FilaFactura[]): FilaFactura[] {
  return filas.filter(f => n(f.monto) - topePagable(f.factura) > 0.005)
}

export function totalDeFilas(filas: FilaFactura[], aCuenta: string): number {
  return r2(filas.reduce((s, f) => s + n(f.monto), 0) + n(aCuenta))
}

/**
 * Los CHEQUES mandan y el total los sigue (2026-09-21): se reparte lo que
 * suman los cheques entre las facturas, LO MÁS VIEJO PRIMERO (así se imputa
 * un pago), con el tope de `saldo_pagable` de cada una. Lo que sobra va a
 * «A cuenta»: plata entregada de más, que queda a favor.
 */
export function repartirTotalEnFilas(total: number, filas: FilaFactura[]): { filas: FilaFactura[]; aCuenta: string } {
  const { porFactura, aCuenta } = repartirPagoEntreFacturas(total, filas.map(f => ({
    id: f.factura.id,
    vence_el: f.factura.vence_el,
    tope: topePagable(f.factura),
  })))
  return {
    filas: filas.map(x => ({ ...x, monto: String(porFactura.get(x.factura.id) ?? 0) })),
    aCuenta: aCuenta > 0.005 ? String(aCuenta) : '',
  }
}

/**
 * Pagar de más no se prohíbe, se avisa (2026-09-26, dueño: «puedo transferir
 * de más si quiero»). Lo que una fila pone por encima de lo pagable de su
 * factura no se rechaza: pasa a «A cuenta», que es lo que es — plata que
 * queda a favor con el proveedor. El total no cambia.
 */
export function normalizarPago(filas: FilaFactura[], aCuenta: string): { filas: FilaFactura[]; aCuenta: number } {
  let deMas = 0
  const normalizadas = filas.map(f => {
    const exceso = r2(n(f.monto) - topePagable(f.factura))
    if (exceso <= 0.005) return f
    deMas = r2(deMas + exceso)
    return { ...f, monto: String(topePagable(f.factura)) }
  })
  return { filas: normalizadas, aCuenta: r2(n(aCuenta) + deMas) }
}

/** Qué pasa con el pago: cuánto queda a favor del proveedor y cuánto se sigue debiendo de estas facturas. */
export function resultadoDelPago(filas: FilaFactura[], aCuenta: string): { aFavor: number; quedaDebiendo: number } {
  const norm = normalizarPago(filas, aCuenta)
  const quedaDebiendo = r2(norm.filas.reduce((s, f) => s + Math.max(0, topePagable(f.factura) - n(f.monto)), 0))
  return { aFavor: norm.aCuenta, quedaDebiendo }
}

/** Las líneas de la OP: las facturas con plata y, si hay, lo que va a cuenta (incluido lo pagado de más en una fila). */
export function lineasDeOrden(filas: FilaFactura[], aCuenta: string): PagosLineaOrdenInput[] {
  const norm = normalizarPago(filas, aCuenta)
  const lineas: PagosLineaOrdenInput[] = []
  for (const f of norm.filas) {
    if (n(f.monto) > 0) lineas.push({ tipo: 'factura', factura_id: f.factura.id, monto: n(f.monto) })
  }
  if (norm.aCuenta > 0.005) lineas.push({ tipo: 'a_cuenta', factura_id: null, monto: norm.aCuenta })
  return lineas
}

// ── Doble firma ───────────────────────────────────────────────────

/**
 * La doble firma (§5.18), vista desde la pantalla: no pagás lo que cargaste
 * ni lo que aprobaste. El admin la saltea. El backend es el que manda.
 */
export function bloqueoPorFirma(facturas: Pick<PagosFactura, 'tipo_comprobante' | 'numero' | 'created_by' | 'aprobada_por'>[], userId: string | null, esAdmin: boolean): string | null {
  if (esAdmin || !userId) return null
  const cargadas = facturas.filter(f => f.created_by === userId)
  if (cargadas.length > 0) {
    return `Cargaste vos ${cargadas.length === 1 ? 'la factura' : 'las facturas'} ${cargadas.map(f => `${f.tipo_comprobante} ${f.numero ?? 's/n'}`).join(', ')}: la tiene que pagar otra persona.`
  }
  const aprobadas = facturas.filter(f => f.aprobada_por === userId)
  if (aprobadas.length > 0) {
    return `Aprobaste vos ${aprobadas.length === 1 ? 'la factura' : 'las facturas'} ${aprobadas.map(f => `${f.tipo_comprobante} ${f.numero ?? 's/n'}`).join(', ')}: la tiene que pagar otra persona.`
  }
  return null
}

// ── Cheques ───────────────────────────────────────────────────────────

/** Campos del cheque que puede completar la foto. */
export type CampoCheque = 'numero' | 'banco' | 'fecha_cobro' | 'monto' | 'librador'

/** Un cheque del formulario. `monto` es texto porque se tipea. */
export interface ChequeFila {
  /** Identidad estable de la fila: la lectura de la foto es async y el índice puede correrse. */
  uid:         number
  numero:      string
  banco:       string
  fecha_cobro: string
  monto:       string
  es_propio:   boolean
  librador:    string
  // ── Comprobante del cheque (foto o PDF, 20260925; es EL comprobante del pago, 20260929w) ──
  /** Ya subido a `ordenes/pendientes/`: viaja como `foto_path` y queda adjunto a la OP (tipo `cheque`). */
  foto:        PagosAdjuntoPendiente | null
  /** Miniatura local (object URL); null si es PDF. */
  fotoUrl:     string | null
  leyendo:     boolean
  /** Lo que completó la foto y la persona todavía no tocó. */
  leidos:      CampoCheque[]
  avisosFoto:  string[]
  /** El librador que se leyó, para sugerirlo aunque el cheque esté como propio. */
  libradorLeido: string
}

let uidCheque = 0
export const chequeVacio = (fecha_cobro: string, monto: string): ChequeFila => ({
  uid: ++uidCheque, numero: '', banco: '', fecha_cobro, monto, es_propio: true, librador: '',
  foto: null, fotoUrl: null, leyendo: false, leidos: [], avisosFoto: [], libradorLeido: '',
})

/**
 * Cómo están los cheques contra lo que sale de plata. Mismas reglas que
 * `validarCheques` del backend y `_pagos_emitir_orden`: número, fecha de cobro
 * no anterior al pago, importe, librador si es de un tercero, y Σ = total
 * EXACTO (se compara en centavos para no arrastrar el error del punto
 * flotante). Mientras se lee una foto no se registra: su `foto_path` todavía
 * no está.
 */
export function estadoCheques(cheques: ChequeFila[], totalPlata: number, fecha: string) {
  const totalCheques = r2(cheques.reduce((s, c) => s + n(c.monto), 0))
  const difCheques = r2(totalPlata - totalCheques)
  const incompletos = cheques.filter(c =>
    !c.numero.trim() || !c.fecha_cobro || n(c.monto) <= 0 ||
    c.fecha_cobro < fecha || (!c.es_propio && !c.librador.trim()))
  const leyendo = cheques.some(c => c.leyendo)
  return { totalCheques, difCheques, incompletos, leyendo }
}

/** Cómo se nombra un cheque en un aviso: por su número, o por su fila si todavía no lo tiene. */
export function nombreCheque(forma: PagosFormaPagoOP, c: Pick<ChequeFila, 'numero'>, i: number): string {
  const que = forma === 'echeq' ? 'e-cheq' : 'cheque'
  return c.numero.trim() ? `${que} N° ${c.numero.trim()}` : `${que} de la fila ${i + 1}`
}

/**
 * Los e-cheqs que todavía no tienen su comprobante (20260929w): con e-cheq el
 * archivo de CADA uno es el comprobante del pago y no hay uno aparte. Con
 * cheque físico es opcional: siempre vacío. Mientras se sube, la fila todavía
 * no tiene `foto` pero tampoco falta nada: no cuenta. Espejo de
 * `comprobanteFaltante` del backend (`ECHEQ_SIN_ARCHIVO`).
 */
export function chequesSinComprobante(forma: PagosFormaPagoOP, cheques: ChequeFila[]): { cheque: ChequeFila; i: number }[] {
  if (forma !== 'echeq') return []
  return cheques.map((cheque, i) => ({ cheque, i })).filter(x => !x.cheque.foto && !x.cheque.leyendo)
}

/** «Falta el comprobante del e-cheq N° 123» (o de varios, con sus números). */
export function motivoChequesSinComprobante(forma: PagosFormaPagoOP, faltan: { cheque: ChequeFila; i: number }[]): string | null {
  if (faltan.length === 0) return null
  if (faltan.length === 1) return `Falta el comprobante del ${nombreCheque(forma, faltan[0]!.cheque, faltan[0]!.i)}`
  const nombres = faltan.map(x => x.cheque.numero.trim() ? `N° ${x.cheque.numero.trim()}` : `fila ${x.i + 1}`)
  return `Falta el comprobante de los e-cheqs ${nombres.join(', ')}`
}

/**
 * Por qué no se pueden registrar los cheques, o null si están bien. El mismo
 * texto en el tooltip del modal suelto y en cada bloque del lote.
 */
export function problemaCheques(cheques: ChequeFila[], totalPlata: number, fecha: string, forma: PagosFormaPagoOP): string | null {
  const e = estadoCheques(cheques, totalPlata, fecha)
  if (cheques.length === 0) return 'Cargá al menos un cheque'
  if (e.incompletos.length > 0) {
    if (e.incompletos.some(c => c.fecha_cobro && c.fecha_cobro < fecha)) return 'Hay un cheque que se cobra antes de la fecha del pago'
    if (e.incompletos.some(c => !c.es_propio && !c.librador.trim())) return 'Un cheque de tercero necesita el librador'
    return 'Cada cheque necesita número, fecha de cobro e importe (y el librador si es de un tercero)'
  }
  if (Math.abs(e.difCheques) >= 0.005) return 'Los cheques no suman lo que sale de plata'
  if (e.leyendo) return 'Esperá a que termine de leer el comprobante del cheque'
  return motivoChequesSinComprobante(forma, chequesSinComprobante(forma, cheques))
}

/** Los cheques como los recibe el backend; `fecha_cobro` de la orden la deriva él. */
export function chequesParaEnviar(cheques: ChequeFila[]): PagosChequeNuevo[] {
  return cheques.map(c => ({
    numero: c.numero.trim(), banco: c.banco.trim(), fecha_cobro: c.fecha_cobro,
    monto: n(c.monto), es_propio: c.es_propio,
    librador: c.es_propio ? '' : c.librador.trim(), obs: '',
    foto_path: c.foto?.storage_path ?? null,
  }))
}

/**
 * Los bloques del lote que rebotaron, según el detalle del error: `indices`
 * (ARCHIVO_EN_VARIOS_BLOQUES: el mismo archivo en dos proveedores, se pintan
 * todos), `indice` (RPC / service) o `campo = 'ordenes.N…'` (schema).
 */
export function bloquesDelError(d: Record<string, unknown> | null): number[] {
  if (!d) return []
  if (Array.isArray(d.indices)) return d.indices.filter((i): i is number => typeof i === 'number')
  if (typeof d.indice === 'number') return [d.indice]
  const m = typeof d.campo === 'string' ? /^ordenes\.(\d+)/.exec(d.campo) : null
  return m ? [Number(m[1])] : []
}
