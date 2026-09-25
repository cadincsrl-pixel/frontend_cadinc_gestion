// Formatos y etiquetas del módulo Contabilidad.
//
// Módulo propio: no importa utils de Ventas ni de Compras (son módulos
// independientes). Los montos se muestran es-AR con dos decimales y
// tabular-nums; las sumas se hacen en centavos enteros para que 0,1 + 0,2 dé
// 0,30 y el «cuadra / no cuadra» no dependa del redondeo de coma flotante.

import type {
  CtbAsientoEstado, CtbAsientoTipo, CtbAuxiliarTipo, CtbBloqueoCerrar, CtbBloqueoReabrir, CtbNaturaleza, CtbRubro,
  TesoreriaTipo, CtbFuente, CtbPendienteEstado, CtbCircuito, CtbIvaEstado,
} from '@/types/contabilidad.types'

const TZ = 'America/Argentina/Buenos_Aires'

/** "$ 1.234,56". */
export function fmtM(n: number | string | null | undefined): string {
  const v = Number(n ?? 0)
  return '$ ' + v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** "1.234,56" sin símbolo (columnas Debe / Haber). Cero → "". */
export function fmtN(n: number | string | null | undefined, cero = ''): string {
  const v = Number(n ?? 0)
  if (!v) return cero
  return v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** "2026-07-31" → "31/07/2026". */
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
    timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

/** Hoy en hora argentina, ISO "AAAA-MM-DD". */
export function hoyAR(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

/** Primer y último día del mes de `iso` (default: hoy AR). */
export function mesDe(iso: string): { desde: string; hasta: string } {
  const [y, m] = iso.split('-').map(Number) as [number, number]
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const mm = String(m).padStart(2, '0')
  return { desde: `${y}-${mm}-01`, hasta: `${y}-${mm}-${String(ultimo).padStart(2, '0')}` }
}

export function mesActual(): { desde: string; hasta: string } {
  return mesDe(hoyAR())
}

/**
 * "1.234,56" → 1234.56. Acepta también "1234.56" y "1234,5". Vacío o basura → 0.
 * Si hay coma, la coma es el decimal y los puntos son miles.
 */
export function parseImporteAR(s: string | number | null | undefined): number {
  if (s === null || s === undefined) return 0
  if (typeof s === 'number') return Number.isFinite(s) ? s : 0
  const t = s.trim().replace(/\s|\$/g, '')
  if (!t) return 0
  const limpio = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t
  const v = Number(limpio)
  return Number.isFinite(v) ? v : 0
}

/** Centavos enteros de un monto. */
export function aCentavos(n: number | string | null | undefined): number {
  return Math.round(parseImporteAR(n as string | number | null | undefined) * 100)
}

/** Suma en centavos y devuelve pesos con 2 decimales exactos. */
export function sumaCentavos(valores: Array<number | string | null | undefined>): number {
  return valores.reduce<number>((s, v) => s + aCentavos(v), 0) / 100
}

/** Redondeo a centavos. */
export const r2 = (v: number) => Math.round(v * 100) / 100

/** "1.234,56 D" / "1.234,56 A" / "0,00". */
export function saldoDA(saldo: number | null | undefined): string {
  const v = r2(Number(saldo ?? 0))
  if (Math.abs(v) < 0.005) return '0,00'
  const abs = Math.abs(v).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${abs} ${v > 0 ? 'D' : 'A'}`
}

export const RUBROS: { key: CtbRubro; label: string }[] = [
  { key: 'activo',  label: 'Activo' },
  { key: 'pasivo',  label: 'Pasivo' },
  { key: 'pn',      label: 'Patrimonio neto' },
  { key: 'ingreso', label: 'Ingresos' },
  { key: 'egreso',  label: 'Egresos' },
  // Solo títulos (20260927): agrupa ingresos y egresos, como la 4000000 de Finnegans.
  { key: 'resultado', label: 'Resultado (título)' },
]

/** Los rubros que puede tener una hija según el de su madre. */
export function rubrosHija(rubroMadre: CtbRubro | null | undefined): CtbRubro[] | null {
  return rubroMadre === 'resultado' ? ['resultado', 'ingreso', 'egreso'] : null
}

export function rubroLabel(r: CtbRubro | null | undefined): string {
  return RUBROS.find(x => x.key === r)?.label ?? String(r ?? '')
}

export function naturalezaLabel(n: CtbNaturaleza | null | undefined): string {
  return n === 'deudora' ? 'Deudora' : n === 'acreedora' ? 'Acreedora' : ''
}

export const AUXILIARES: { key: CtbAuxiliarTipo; label: string }[] = [
  { key: 'none',      label: 'Sin auxiliar' },
  { key: 'cliente',   label: 'Cliente' },
  { key: 'proveedor', label: 'Proveedor' },
  { key: 'tesoreria', label: 'Cuenta de tesorería' },
]

export function auxiliarLabel(a: CtbAuxiliarTipo | null | undefined): string {
  return AUXILIARES.find(x => x.key === a)?.label ?? ''
}

export const TIPOS_ASIENTO: { key: CtbAsientoTipo; label: string }[] = [
  { key: 'manual',     label: 'Manual' },
  { key: 'ajuste',     label: 'Ajuste' },
  { key: 'apertura',   label: 'Apertura' },
  { key: 'automatico', label: 'Automático' },
  { key: 'cierre',     label: 'Cierre' },
]

/** Los que se cargan a mano (el resto lo genera el sistema). */
export const TIPOS_ASIENTO_MANUAL = TIPOS_ASIENTO.filter(t => t.key === 'manual' || t.key === 'ajuste' || t.key === 'apertura')

export function tipoAsientoLabel(t: CtbAsientoTipo | null | undefined): string {
  return TIPOS_ASIENTO.find(x => x.key === t)?.label ?? String(t ?? '')
}

export const ESTADO_ASIENTO: Record<CtbAsientoEstado, { label: string; clase: string }> = {
  borrador:   { label: 'Borrador',   clase: 'bg-amarillo-light text-[#7A5000]' },
  confirmado: { label: 'Confirmado', clase: 'bg-verde-light text-verde' },
  anulado:    { label: 'Anulado',    clase: 'bg-gris text-gris-dark' },
}

export const TESORERIA_TIPOS: { key: TesoreriaTipo; label: string }[] = [
  { key: 'banco',   label: 'Banco' },
  { key: 'caja',    label: 'Caja' },
  { key: 'valores', label: 'Valores' },
  { key: 'tarjeta',   label: 'Tarjeta de crédito' },
  { key: 'billetera', label: 'Billetera (Mercado Pago)' },
]

/** Banco y billetera llevan CBU/CVU y alias; tarjeta, caja y valores no. */
export function tesoreriaConCbu(t: TesoreriaTipo): boolean {
  return t === 'banco' || t === 'billetera'
}

/**
 * La cuenta contable que se le puede vincular: la tarjeta es una deuda
 * («Tarjeta de crédito a pagar», Pasivo); el resto, plata propia (Activo).
 */
export function rubrosTesoreria(t: TesoreriaTipo): CtbRubro[] {
  return t === 'tarjeta' ? ['pasivo'] : ['activo']
}

export function tesoreriaTipoLabel(t: TesoreriaTipo): string {
  return TESORERIA_TIPOS.find(x => x.key === t)?.label ?? t
}

/** "N° 12" o "s/n (período abierto)". */
export function numeroAsiento(numero: number | null | undefined, conExplicacion = false): string {
  if (numero) return `N° ${numero}`
  return conExplicacion ? 's/n (período abierto)' : 's/n'
}

/** "Julio 2026". */
export function nombreMes(desdeIso: string): string {
  const [y, m] = desdeIso.split('-').map(Number) as [number, number]
  const s = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function bloqueoCerrarTxt(b: CtbBloqueoCerrar | null, cantBorradores = 0): string | null {
  switch (b) {
    case null: return null
    case 'PERIODO_YA_CERRADO':       return 'El período ya está cerrado'
    case 'PERIODO_ANTERIOR_ABIERTO': return 'Hay un período anterior abierto: los períodos se cierran en orden'
    case 'HAY_BORRADORES':           return `Tiene ${cantBorradores || 'algún'} asiento${cantBorradores === 1 ? '' : 's'} en borrador: confirmalos o borralos antes de cerrar`
    case 'EJERCICIO_CERRADO':        return 'El ejercicio está cerrado'
  }
}

export function bloqueoReabrirTxt(b: CtbBloqueoReabrir | null): string | null {
  switch (b) {
    case null: return null
    case 'PERIODO_NO_CERRADO':         return 'El período no está cerrado'
    case 'PERIODO_POSTERIOR_CERRADO':  return 'Hay un período posterior cerrado: solo se reabre el último cerrado'
    case 'EJERCICIO_CERRADO':          return 'El ejercicio está cerrado'
  }
}

// ── Asientos automáticos (fase 3, 20260927) ───────────────────────────

export const FUENTES_CTB: { key: CtbFuente; label: string; corto: string }[] = [
  { key: 'ventas_facturas',              label: 'Facturas de venta',          corto: 'Venta' },
  { key: 'ventas_comprobantes_externos', label: 'Comprobantes externos',      corto: 'Externo' },
  { key: 'ventas_cobros',                label: 'Cobros',                     corto: 'Cobro' },
  { key: 'pagos_facturas',               label: 'Facturas de compra',         corto: 'Compra' },
  { key: 'pagos_ordenes',                label: 'Órdenes de pago',            corto: 'Pago' },
  { key: 'tesoreria_movimientos',        label: 'Movimientos de fondos',      corto: 'Fondos' },
]

// ── Circuitos (tanda 4): como en Bejerman, Ventas / Cobros / Compras / Pagos ──

export const CIRCUITOS_CTB: { key: CtbCircuito; label: string; fuentes: CtbFuente[] }[] = [
  { key: 'ventas',  label: 'Ventas',  fuentes: ['ventas_facturas', 'ventas_comprobantes_externos'] },
  { key: 'cobros',  label: 'Cobros',  fuentes: ['ventas_cobros'] },
  { key: 'compras', label: 'Compras', fuentes: ['pagos_facturas'] },
  { key: 'pagos',   label: 'Pagos',   fuentes: ['pagos_ordenes'] },
  // Tanda 5 (20260928m): comisiones, impuesto al cheque, VEP, transferencias…
  { key: 'fondos',  label: 'Fondos',  fuentes: ['tesoreria_movimientos'] },
]

const TODOS_CIRCUITOS: CtbCircuito[] = CIRCUITOS_CTB.map(c => c.key)

/**
 * Los circuitos que existían antes de Fondos (tanda 4). Quien guardó los
 * cuatro tildados quería «todos»: si no se migra, Fondos le queda destildado
 * para siempre sin que lo haya elegido.
 */
const CIRCUITOS_TANDA4: CtbCircuito[] = ['ventas', 'cobros', 'compras', 'pagos']

/** Las fuentes de los circuitos tildados. Con todos → undefined (= todo, sin filtro). */
export function fuentesDeCircuitos(c: CtbCircuito[]): CtbFuente[] | undefined {
  const set = new Set(c)
  if (TODOS_CIRCUITOS.every(k => set.has(k))) return undefined
  return CIRCUITOS_CTB.filter(x => set.has(x.key)).flatMap(x => x.fuentes)
}

export function circuitoLabel(c: string): string {
  return CIRCUITOS_CTB.find(x => x.key === c)?.label ?? (c === 'otros' ? 'Otros automáticos' : c)
}

/** «Ventas y Compras», «Ventas, Cobros y Pagos». */
export function nombrarCircuitos(c: CtbCircuito[]): string {
  const n = CIRCUITOS_CTB.filter(x => c.includes(x.key)).map(x => x.label)
  if (n.length <= 1) return n[0] ?? ''
  return `${n.slice(0, -1).join(', ')} y ${n[n.length - 1]}`
}

export const MEMORIA_CIRCUITOS = 'cadinc.contabilidad.automaticos.circuitos'

/**
 * Lo guardado en localStorage. Inválido o vacío → todos. Los cuatro de la
 * tanda 4 (sin Fondos) también → todos. Pura: el acceso a localStorage va en el componente.
 */
export function leerCircuitosGuardados(raw: string | null): CtbCircuito[] {
  if (!raw) return [...TODOS_CIRCUITOS]
  try {
    const v: unknown = JSON.parse(raw)
    if (!Array.isArray(v)) return [...TODOS_CIRCUITOS]
    const ok = TODOS_CIRCUITOS.filter(k => v.includes(k))
    if (ok.length === 0) return [...TODOS_CIRCUITOS]
    // Migración: exactamente los cuatro viejos (sin «fondos») = «todos».
    const set = new Set(ok)
    if (ok.length === CIRCUITOS_TANDA4.length && CIRCUITOS_TANDA4.every(k => set.has(k))) return [...TODOS_CIRCUITOS]
    return ok
  } catch {
    return [...TODOS_CIRCUITOS]
  }
}

export function fuenteLabel(f: string): string {
  return FUENTES_CTB.find(x => x.key === f)?.label ?? f
}

export const ESTADOS_PENDIENTE: { key: CtbPendienteEstado; label: string; hint: string; clase: string }[] = [
  { key: 'sin_contabilizar', label: 'Sin contabilizar', hint: 'Se puede contabilizar: falta correr «Contabilizar hasta…»', clase: 'bg-azul-light text-azul' },
  { key: 'pendiente',        label: 'Pendiente',        hint: 'No se puede contabilizar todavía: mirá el motivo', clase: 'bg-naranja-light text-naranja-dark' },
  { key: 'desactualizado',   label: 'Desactualizado',   hint: 'El origen o un mapeo cambió después de contabilizarlo', clase: 'bg-amarillo-light text-[#7A5000]' },
  { key: 'a_revertir',       label: 'A revertir',       hint: 'El origen se anuló (o dejó de ser contabilizable) y su asiento sigue vigente', clase: 'bg-rojo-light text-rojo' },
]

export function estadoPendiente(e: string) {
  return ESTADOS_PENDIENTE.find(x => x.key === e) ?? { key: e, label: e, hint: '', clase: 'bg-gris text-gris-dark' }
}

/** Nombre corto de cada clave de mapeo (la pantalla de mapeos trae el suyo; este es el respaldo). */
export const ETIQUETA_CLAVE_MAPEO: Record<string, string> = {
  'compras.concepto':     'Compras por concepto',
  'compras.sin_imputar':  'Compras a clasificar (sin imputar)',
  'compras.iva_cf':       'IVA crédito fiscal',
  'compras.tributo':      'Percepciones y tributos de compras',
  'compras.proveedores':  'Proveedores',
  'ventas.producto':      'Ventas por producto',
  'ventas.externo':       'Ventas de comprobantes externos',
  'ventas.cliente':       'Ventas por cliente',
  'ventas.iva_df':        'IVA débito fiscal',
  'ventas.tributo':       'Tributos de ventas',
  'ventas.deudores':      'Deudores por ventas',
  'cobros.medio':         'Medios de cobro',
  'cobros.retencion':     'Retenciones sufridas',
  'pagos.puente':         'Pagos sin cuenta de origen (puente)',
  'pagos.cheque_propio':  'Cheques propios emitidos',
  'pagos.cheque_tercero': 'Cheques de terceros entregados',
  'general.redondeo':     'Diferencias de redondeo',
  // Tanda 5 (20260928m/n).
  'fondos.concepto':      'Movimientos de fondos por concepto',
  'iva.ddjj':             'IVA: posición mensual',
  'bienes.gasto':         'Bienes de uso: gasto de amortización',
}

const IVA_DDJJ_SUB: Record<string, string> = {
  a_pagar:              'IVA a pagar',
  saldo_a_favor:        'Saldo a favor técnico',
  libre_disponibilidad: 'Saldo de libre disponibilidad (si falta, usa el técnico)',
}

/** «5» → «IVA 21 %»; «» → «todas». Para las subclaves de alícuota. */
const ALICUOTA_TXT: Record<string, string> = { '3': '0 %', '4': '10,5 %', '5': '21 %', '6': '27 %', '8': '5 %', '9': '2,5 %' }

export function etiquetaSubclave(clave: string | null | undefined, sub: string | null | undefined): string {
  if (!sub) return clave && /iva_|externo|tributo|retencion/.test(clave) ? 'general' : ''
  if (clave?.endsWith('iva_cf') || clave?.endsWith('iva_df')) return ALICUOTA_TXT[sub] ? `alícuota ${ALICUOTA_TXT[sub]}` : sub
  if (clave === 'ventas.externo' && (sub === '60' || sub === '61')) return `CVLP (${sub})`
  if (clave === 'iva.ddjj') return IVA_DDJJ_SUB[sub] ?? sub
  return sub.replace('|', ' · ')
}

// ── Asiento mensual de IVA (tanda 5, 20260928o) ──

export const ESTADOS_IVA: Record<CtbIvaEstado, { label: string; corto: string; hint: string; clase: string }> = {
  sin_generar:     { label: 'Sin generar',     corto: 'Sin generar', hint: 'Todavía no se generó el asiento de IVA del mes', clase: 'bg-azul-light text-azul' },
  al_dia:          { label: 'Al día',          corto: 'Al día',      hint: 'El asiento de IVA coincide con lo contabilizado en el mes', clase: 'bg-verde-light text-verde' },
  desactualizado:  { label: 'Desactualizado',  corto: 'Desact.',     hint: 'Se contabilizó algo después de generar el asiento de IVA: hay que regenerarlo', clase: 'bg-amarillo-light text-[#7A5000]' },
  sin_movimientos: { label: 'Sin IVA',         corto: 'Sin IVA',     hint: 'El mes no tiene débito, crédito ni pagos a cuenta de IVA', clase: 'bg-gris text-gris-dark' },
}

export function estadoIva(e: string | null | undefined) {
  return ESTADOS_IVA[e as CtbIvaEstado] ?? { label: String(e ?? ''), corto: String(e ?? ''), hint: '', clase: 'bg-gris text-gris-dark' }
}

export const ROL_IVA: Record<'debito' | 'credito' | 'pagos_a_cuenta', string> = {
  debito:         'Débito fiscal',
  credito:        'Crédito fiscal',
  pagos_a_cuenta: 'Percepciones y retenciones',
}

/** Último día del mes anterior al de `iso` (default del «Amortizar hasta»). */
export function finMesAnterior(iso: string): string {
  const [y, m] = iso.split('-').map(Number) as [number, number]
  const d = new Date(Date.UTC(y, m - 1, 0))
  return d.toISOString().slice(0, 10)
}
