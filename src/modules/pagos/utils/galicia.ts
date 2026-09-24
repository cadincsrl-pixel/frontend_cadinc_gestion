/**
 * Las planillas del Galicia, precargadas con las facturas a pagar (2026-09-23).
 *
 * Pedido del dueño: «para pagar con el banco Galicia, para e-cheq hay un Excel
 * y para transferencias hay otro; ¿vemos cómo sacar directamente el Excel
 * precargado con las facturas pendientes?». Decisiones suyas:
 *   · UNA fila por proveedor: sus facturas se suman en un solo movimiento.
 *   · E-cheqs «A la orden», partidos con plazos igual que al registrar un
 *     pago (arranca en 1 cheque al vencimiento de la factura).
 *   · El Excel NO registra el pago. Las facturas siguen pendientes hasta que el
 *     banco lo procese; después se registra la OP como siempre, con el
 *     comprobante. Si el banco rechaza una fila, no hay nada que deshacer.
 *
 * Todo lo de acá es puro: arma las filas y dice qué quedó afuera y por qué.
 * Los límites vienen de las hojas «Instrucciones» y de las validaciones de
 * cada plantilla; si una fila no los cumple, el banco la rebota al importar,
 * así que se frena antes.
 */
import { fechasEscalonadas, partirEnPartes } from './pagos.utils'
import type { FilaPlantilla } from './xlsxPlantilla'

/** Lo que hace falta de una factura (un subconjunto de `PagosFactura`). */
export interface FacturaAPagar {
  id:                 number
  proveedor_id:       number
  proveedor_nom:      string
  proveedor_cuit:     string | null
  proveedor_cbu:      string | null
  proveedor_alias:    string | null
  cuenta_cambio_tras_aprobar?: boolean
  tipo_comprobante:   string
  numero:             string | null
  vence_el:           string | null
  saldo:              number
  /** El plan de e-cheqs anotado al cargarla (20260923n). */
  plan_cheques?:      { cantidad: number; primer_cobro: string; cada_dias: number } | null
}

export interface GrupoProveedor {
  proveedor_id: number
  razon_social: string
  cuit:         string | null
  cbu:          string | null
  alias:        string | null
  email:        string | null
  cuentaCambio: boolean
  facturas:     FacturaAPagar[]
  total:        number
  /** El vencimiento más próximo: de ahí arranca el primer e-cheq si no hay plan. */
  primerVence:  string | null
  /** El plan anotado en la factura (el de la primera que tenga uno). */
  plan:         { cantidad: number; primer_cobro: string; cada_dias: number } | null
}

export const GALICIA = {
  transferencias: { hoja: 'Formulario', maxFilas: 30, plantilla: '/plantillas/galicia-transferencias.xlsx', extension: 'xls' },
  echeq:          { hoja: 'Plantilla para emision', maxFilas: 250, plantilla: '/plantillas/galicia-echeq.xlsx', extension: 'xlsx' },
} as const

const r2 = (n: number) => Math.round(n * 100) / 100

export function agruparPorProveedor(
  facturas: FacturaAPagar[], emails: Map<number, string | null | undefined> = new Map(),
): GrupoProveedor[] {
  const porProv = new Map<number, GrupoProveedor>()
  for (const f of facturas) {
    let g = porProv.get(f.proveedor_id)
    if (!g) {
      g = {
        proveedor_id: f.proveedor_id, razon_social: f.proveedor_nom, cuit: f.proveedor_cuit,
        cbu: f.proveedor_cbu, alias: f.proveedor_alias,
        email: emails.get(f.proveedor_id)?.trim() || null,
        cuentaCambio: false, facturas: [], total: 0, primerVence: null, plan: null,
      }
      porProv.set(f.proveedor_id, g)
    }
    g.facturas.push(f)
    g.total = r2(g.total + Number(f.saldo))
    if (f.cuenta_cambio_tras_aprobar) g.cuentaCambio = true
    if (!g.plan && f.plan_cheques) g.plan = f.plan_cheques
    if (f.vence_el && (!g.primerVence || f.vence_el < g.primerVence)) g.primerVence = f.vence_el.slice(0, 10)
  }
  return [...porProv.values()].sort((a, b) => a.razon_social.localeCompare(b.razon_social))
}

/** "0012-00402141" → "12-402141": sin los ceros de relleno, para que entre en 12 caracteres. */
function numeroCorto(numero: string | null): string {
  if (!numero) return 's/n'
  const [pv, nro] = numero.split('-')
  const sin0 = (t: string | undefined) => (t ?? '').replace(/^0+(?=\d)/, '')
  return nro ? `${sin0(pv)}-${sin0(nro)}` : sin0(pv)
}

/** La lista de facturas para leer: «A 0012-00402141, A 0012-00402150». */
function listaFacturas(g: GrupoProveedor): string {
  return g.facturas.map(f => `${f.tipo_comprobante} ${f.numero ?? 's/n'}`).join(', ')
}

const recortar = (t: string, max: number) => (t.length <= max ? t : t.slice(0, max - 1) + '…')

/** «FC 12-402141» con una factura, «3 facturas» con varias. Máximo 12 caracteres (banco). */
export function descripcionTransferencia(g: GrupoProveedor): string {
  if (g.facturas.length > 1) return `${g.facturas.length} facturas`
  const d = `FC ${numeroCorto(g.facturas[0]!.numero)}`
  return d.length <= 12 ? d : d.slice(0, 12)
}

/** CBU/CVU de 22 dígitos o alias de 6 a 20: lo que acepta la columna A del banco. */
export function destinoTransferencia(g: GrupoProveedor): string | null {
  const cbu = (g.cbu ?? '').replace(/\D/g, '')
  if (cbu.length === 22) return cbu
  const alias = (g.alias ?? '').trim()
  if (alias.length >= 6 && alias.length <= 20 && !/\s/.test(alias) && !alias.startsWith('***')) return alias
  return null
}

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export interface ResultadoFilas {
  filas:   FilaPlantilla[]
  /** Los proveedores que no entran, con el motivo en castellano. */
  afuera:  { razon_social: string; motivo: string }[]
  total:   number
}

export function filasTransferencias(grupos: GrupoProveedor[], empresa: string): ResultadoFilas {
  const filas: FilaPlantilla[] = []
  const afuera: ResultadoFilas['afuera'] = []
  let total = 0
  for (const g of grupos) {
    const destino = destinoTransferencia(g)
    if (!destino) { afuera.push({ razon_social: g.razon_social, motivo: 'no tiene CBU ni alias cargado' }); continue }
    // Es el patrón de la estafa del «cambiamos el CBU»: no se manda sin mirar.
    if (g.cuentaCambio) { afuera.push({ razon_social: g.razon_social, motivo: 'el CBU cambió después de aprobar la factura: revisalo antes' }); continue }
    if (g.total <= 0) { afuera.push({ razon_social: g.razon_social, motivo: 'no tiene saldo' }); continue }
    if (Math.trunc(g.total).toString().length > 12) { afuera.push({ razon_social: g.razon_social, motivo: 'el importe supera lo que acepta el banco' }); continue }
    filas.push({
      A: destino,
      B: g.total,
      C: 'Factura',
      D: descripcionTransferencia(g),
      E: g.email && EMAIL_OK.test(g.email) ? g.email : null,
      F: recortar(`${empresa} - Pago de ${listaFacturas(g)}`, 200),
    })
    total = r2(total + g.total)
  }
  return { filas, afuera, total }
}

/** Cómo se parte el pago de un proveedor en e-cheqs. */
export interface PlanEcheq {
  cantidad:    number
  /** Fecha de cobro del primero (ISO). */
  primerCobro: string
  /** Días entre uno y el siguiente. */
  cadaDias:    number
}

/**
 * Con qué arranca cada proveedor: el plan anotado en la factura al cargarla
 * (20260923n) o, sin plan, un e-cheq al vencimiento. Una fecha que ya pasó
 * (el plan decía «mañana» y el Excel se saca tres días después) arranca hoy:
 * el banco no emite cheques con fecha pasada.
 */
export function planPorDefecto(g: GrupoProveedor, hoy: string): PlanEcheq {
  if (g.plan) {
    return {
      cantidad: g.plan.cantidad,
      primerCobro: g.plan.primer_cobro > hoy ? g.plan.primer_cobro : hoy,
      cadaDias: g.plan.cada_dias,
    }
  }
  const vence = g.primerVence && g.primerVence > hoy ? g.primerVence : hoy
  return { cantidad: 1, primerCobro: vence, cadaDias: 30 }
}

/** Los e-cheqs de un proveedor: importe y fecha de cada uno. La suma da exacto el total. */
export function chequesDelPlan(total: number, plan: PlanEcheq): { monto: number; fecha: string }[] {
  const n = Math.max(1, Math.trunc(plan.cantidad))
  const montos = partirEnPartes(total, n)
  const fechas = fechasEscalonadas(plan.primerCobro, n, 0, plan.cadaDias)
  return montos.map((monto, i) => ({ monto, fecha: fechas[i]! }))
}

const fechaAR = (iso: string) => iso.split('-').reverse().join('/')

export function filasEcheq(
  grupos: GrupoProveedor[], planes: Map<number, PlanEcheq>, hoy: string, empresa: string,
): ResultadoFilas {
  const filas: FilaPlantilla[] = []
  const afuera: ResultadoFilas['afuera'] = []
  let total = 0
  for (const g of grupos) {
    const cuit = (g.cuit ?? '').replace(/\D/g, '')
    if (cuit.length !== 11) { afuera.push({ razon_social: g.razon_social, motivo: 'no tiene CUIT válido' }); continue }
    if (g.total <= 0) { afuera.push({ razon_social: g.razon_social, motivo: 'no tiene saldo' }); continue }
    const plan = planes.get(g.proveedor_id) ?? planPorDefecto(g, hoy)
    const cheques = chequesDelPlan(g.total, plan)
    if (cheques.some(c => c.fecha < hoy)) { afuera.push({ razon_social: g.razon_social, motivo: 'un e-cheq quedaría con fecha pasada' }); continue }
    cheques.forEach((c, i) => {
      filas.push({
        A: 'CUIT',
        B: Number(cuit),
        C: c.monto,
        D: fechaAR(c.fecha),
        E: 'Factura',
        // El banco exige las dos descripciones juntas o ninguna.
        F: recortar(`${empresa} - ${listaFacturas(g)}`, 100),
        G: cheques.length > 1 ? `E-cheq ${i + 1} de ${cheques.length}` : 'Pago de factura',
        H: g.email && EMAIL_OK.test(g.email) ? g.email : null,
        I: 'A la orden',
      })
    })
    total = r2(total + g.total)
  }
  return { filas, afuera, total }
}
