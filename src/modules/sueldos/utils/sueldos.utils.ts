// Formatos y etiquetas del módulo Sueldos.
//
// Módulo propio: no importa utils de otros módulos. Montos es-AR con dos
// decimales; fechas DD/MM/AAAA; períodos «sep 2026 · 1ª quincena».

import type {
  AvisoCalculo, AvisoLiquidacion, BaseConcepto, Calculo, Condicion, Destino, EstadoLiquidacion, EstadoRecibo, Faltante,
  GrupoContribucion, Liquidacion, TipoConcepto, TipoLiquidacion, Unidad,
} from '@/types/sueldos.types'

const TZ = 'America/Argentina/Buenos_Aires'

/** "$ 1.234,56". */
export function fmtM(n: number | string | null | undefined): string {
  const v = Number(n ?? 0)
  return '$ ' + (Number.isFinite(v) ? v : 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** "1.234,56" (sin símbolo). */
export function fmtN(n: number | string | null | undefined, decimales = 2): string {
  const v = Number(n ?? 0)
  return (Number.isFinite(v) ? v : 0).toLocaleString('es-AR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })
}

/** Cantidad sin ceros de más: 88 → "88", 7,5 → "7,5". */
export function fmtCant(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === '') return ''
  const v = Number(n)
  if (!Number.isFinite(v)) return ''
  return v.toLocaleString('es-AR', { maximumFractionDigits: 4 })
}

/** "12,5 %". */
export function fmtPct(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === '') return ''
  return `${fmtCant(n)} %`
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
  return d.toLocaleString('es-AR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** Hoy en hora argentina, "AAAA-MM-DD". */
export function hoyAR(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

/** "2026-09" (para <input type="month">) → "2026-09-01". */
export function mesAPeriodo(mes: string): string {
  return /^\d{4}-\d{2}$/.test(mes) ? `${mes}-01` : mes
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** "2026-09-01" → "septiembre 2026". */
export function fmtMes(periodo: string | null | undefined): string {
  if (!periodo) return ''
  const [y, m] = periodo.split('-').map(Number)
  if (!y || !m) return periodo
  return `${MESES[m - 1]} ${y}`
}

export const TIPO_LIQ_LABEL: Record<TipoLiquidacion, string> = {
  quincena:   'Quincena',
  mensual:    'Mensual',
  sac:        'SAC (aguinaldo)',
  vacaciones: 'Vacaciones',
  final:      'Liquidación final',
  ajuste:     'Ajuste',
}

/** "Quincena · 1ª de septiembre 2026". */
export function fmtPeriodoLiq(l: Pick<Liquidacion, 'tipo' | 'periodo' | 'quincena'>): string {
  const mes = fmtMes(l.periodo)
  if (l.tipo === 'quincena') return `${l.quincena === 2 ? '2ª' : '1ª'} quincena de ${mes}`
  return `${TIPO_LIQ_LABEL[l.tipo]} · ${mes}`
}

export const ESTADO_LIQ: Record<EstadoLiquidacion, { label: string; clase: string }> = {
  borrador: { label: 'Borrador', clase: 'bg-amarillo-light text-[#7A5000]' },
  cerrada:  { label: 'Cerrada',  clase: 'bg-verde-light text-verde' },
  anulada:  { label: 'Anulada',  clase: 'bg-gris text-gris-dark line-through' },
}

export const ESTADO_RECIBO: Record<EstadoRecibo, { label: string; clase: string }> = {
  borrador: { label: 'Borrador', clase: 'bg-amarillo-light text-[#7A5000]' },
  cerrado:  { label: 'Cerrado',  clase: 'bg-verde-light text-verde' },
  anulado:  { label: 'Anulado',  clase: 'bg-gris text-gris-dark' },
}

export const TIPO_CONCEPTO_LABEL: Record<TipoConcepto, string> = {
  remunerativo:    'Remunerativo',
  no_remunerativo: 'No remunerativo',
  descuento:       'Descuento',
  contribucion:    'Contribución patronal',
}

export const CALCULO_LABEL: Record<Calculo, string> = {
  manual:            'Manual (se carga el importe)',
  cantidad_x_escala: 'Cantidad × escala',
  porcentaje:        'Porcentaje',
  monto_fijo:        'Monto fijo',
  por_unidad:        'Por unidad',
}

export const BASE_LABEL: Record<BaseConcepto, string> = {
  basico:           'Básico',
  remunerativo:     'Total remunerativo',
  bruto_rem_no_rem: 'Remunerativo + no remunerativo',
  sereno_zona_a:    'Sueldo del Sereno zona A',
}

export const CONDICION_LABEL: Record<Condicion, string> = {
  siempre:                   'Siempre',
  afiliado:                  'Solo afiliados',
  no_afiliado:               'Solo no afiliados',
  antiguedad_menor_1:        'Antigüedad menor a 1 año',
  antiguedad_mayor_igual_1:  'Antigüedad de 1 año o más',
  rifl:                      'Solo RIFL',
  no_rifl:                   'Solo no RIFL',
}

export const DESTINO_LABEL: Record<Destino, string> = {
  f931:       'F.931 (ARCA)',
  sindicato:  'Sindicato',
  fondo_cese: 'Fondo de cese',
  prestamo:   'Préstamo',
  otros:      'Otros',
}

export const GRUPO_LABEL: Record<GrupoContribucion, string> = {
  sindical:         'Sindical',
  seguridad_social: 'Seguridad social',
  obra_social:      'Obra social',
  inssjp:           'INSSJP (PAMI)',
  art:              'ART',
  camaras:          'Cámaras / IERIC',
  otros:            'Otras',
}

export const UNIDAD_LABEL: Record<Unidad, string> = {
  horas: 'hs', dias: 'días', km: 'km', '%': '%', $: '$', anios: 'años', unidades: 'u.',
}

export const FALTANTE_LABEL: Record<Faltante, string> = {
  cuil:          'CUIL',
  fecha_ingreso: 'Fecha de ingreso',
  categoria:     'Categoría',
  obra_social:   'Obra social',
  cbu:           'CBU',
}

export const MODALIDADES: { value: string; label: string }[] = [
  { value: 'tiempo_indeterminado', label: 'Tiempo indeterminado' },
  { value: 'plazo_fijo',           label: 'Plazo fijo' },
  { value: 'eventual',             label: 'Eventual' },
  { value: 'temporada',            label: 'Temporada' },
  { value: 'periodo_prueba',       label: 'Período de prueba' },
  { value: 'tiempo_parcial',       label: 'Tiempo parcial' },
]

export const ESTADOS_CIVILES = ['', 'soltero', 'casado', 'union_convivencial', 'divorciado', 'viudo'] as const
export const ESTADO_CIVIL_LABEL: Record<string, string> = {
  '': '—', soltero: 'Soltero/a', casado: 'Casado/a', union_convivencial: 'Unión convivencial', divorciado: 'Divorciado/a', viudo: 'Viudo/a',
}

/** "20123456786" → "20-12345678-6". Los enmascarados ("***1234") se devuelven tal cual. */
export function fmtCuil(c: string | null | undefined): string {
  if (!c) return ''
  const d = c.replace(/\D/g, '')
  if (c.includes('*') || d.length !== 11) return c
  return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`
}

export function esEnmascarado(v: string | null | undefined): boolean {
  return !!v && v.includes('*')
}

/** Dígito verificador del CUIL/CUIT (módulo 11). */
export function cuilValido(c: string): boolean {
  const d = c.replace(/\D/g, '')
  if (d.length !== 11) return false
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
  const suma = pesos.reduce((s, p, i) => s + p * Number(d[i]), 0)
  let dv = 11 - (suma % 11)
  if (dv === 11) dv = 0
  if (dv === 10) dv = 9
  return dv === Number(d[10])
}

/** CBU: 22 dígitos con los dos verificadores. */
export function cbuValido(c: string): boolean {
  const d = c.replace(/\D/g, '')
  if (d.length !== 22) return false
  const bloque1 = d.slice(0, 8)
  const bloque2 = d.slice(8)
  const p1 = [7, 1, 3, 9, 7, 1, 3]
  const s1 = p1.reduce((s, p, i) => s + p * Number(bloque1[i]), 0)
  const dv1 = (10 - (s1 % 10)) % 10
  if (dv1 !== Number(bloque1[7])) return false
  const p2 = [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3]
  const s2 = p2.reduce((s, p, i) => s + p * Number(bloque2[i]), 0)
  const dv2 = (10 - (s2 % 10)) % 10
  return dv2 === Number(bloque2[13])
}

/** Aviso del motor en castellano (§8 del contrato). */
export function mensajeAviso(a: AvisoCalculo): string {
  const d = a.detalle ?? {}
  const lista = (k: string) => Array.isArray(d[k]) ? (d[k] as unknown[]).map(String).join(', ') : ''
  switch (a.codigo) {
    case 'CONCEPTO_SIN_VALOR':    return `Estos conceptos no tienen valor cargado y no se aplicaron: ${lista('conceptos')}. Cargalos en Convenios.`
    case 'VALOR_A_CONFIRMAR':     return `Valores a confirmar: ${lista('conceptos')}.`
    case 'ESCALA_A_CONFIRMAR':    return `La escala de ${String(d.categoria ?? 'la categoría')} está marcada a confirmar${d.valor != null ? ` (${fmtM(Number(d.valor))})` : ''}.`
    case 'SIN_FECHA_INGRESO':     return 'El legajo no tiene fecha de ingreso: antigüedad 0 (y fondo de cese 12 %).'
    case 'NETO_NEGATIVO':         return `El neto da negativo (${fmtM(Number(d.neto ?? 0))}). Revisá préstamos y descuentos.`
    case 'SIN_CODIGO_ARCA':       return `Conceptos sin código ARCA (el LSD los necesita): ${lista('conceptos')}.`
    case 'HORAS_MES_POR_DEFECTO': return `Sin parámetro de horas del mes: se usó ${String(d.horas_mes ?? 200)} para el valor hora de las extras.`
    case 'SIN_HISTORIAL':         return 'No hay recibos cerrados en el semestre: cargá el SAC a mano.'
    case 'LEGAJO_EGRESADO':       return `El legajo tiene fecha de egreso${d.fecha_egreso ? ` (${fmtFecha(String(d.fecha_egreso))})` : ''} anterior al período.`
    default:                      return a.codigo
  }
}

/** Avisos «graves» (en rojo) vs informativos (amarillo). */
export function avisoGrave(codigo: string): boolean {
  return codigo === 'NETO_NEGATIVO' || codigo === 'CONCEPTO_SIN_VALOR' || codigo === 'LEGAJO_EGRESADO'
}

/** Número a partir de un texto de formulario ("" → null). Acepta coma decimal. */
export function numONull(s: string | null | undefined): number | null {
  if (s === null || s === undefined) return null
  const t = String(s).trim().replace(/\s/g, '')
  if (!t) return null
  const norm = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t
  const v = Number(norm)
  return Number.isFinite(v) ? v : null
}

/** Suma en centavos para que el total no dependa del redondeo de coma flotante. */
export function sumar(nums: (number | null | undefined)[]): number {
  return nums.reduce<number>((s, n) => s + Math.round(Number(n ?? 0) * 100), 0) / 100
}

/** Descarga un texto como archivo (CSV/TXT). `latin1` = windows-1252 simple (el LSD). */
export function descargarTexto(contenido: string, nombre: string, opts: { mime?: string; bom?: boolean; latin1?: boolean } = {}): void {
  let parte: BlobPart
  if (opts.latin1) {
    const bytes = new Uint8Array(contenido.length)
    for (let i = 0; i < contenido.length; i++) {
      const c = contenido.charCodeAt(i)
      bytes[i] = c < 256 ? c : 63 // '?'
    }
    parte = bytes
  } else {
    parte = opts.bom && !contenido.startsWith('﻿') ? '﻿' + contenido : contenido
  }
  const blob = new Blob([parte], { type: opts.mime ?? 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Aviso del motor en pocas palabras (cuando solo viene el código). */
export const AVISO_CORTO: Record<string, string> = {
  CONCEPTO_SIN_VALOR:    'conceptos sin valor',
  VALOR_A_CONFIRMAR:     'valores a confirmar',
  ESCALA_A_CONFIRMAR:    'escala a confirmar',
  SIN_FECHA_INGRESO:     'sin fecha de ingreso',
  NETO_NEGATIVO:         'neto negativo',
  SIN_CODIGO_ARCA:       'conceptos sin código ARCA',
  HORAS_MES_POR_DEFECTO: 'horas del mes por defecto (200)',
  SIN_HISTORIAL:         'sin historial para el SAC',
  LEGAJO_EGRESADO:       'legajo egresado',
}

/** Mensaje de un aviso del cierre (por qué no se generó el asiento). */
export function mensajeAvisoLiq(a: AvisoLiquidacion): string {
  const d = a.detalle ?? {}
  switch (a.codigo) {
    case 'SIN_MAPEO': {
      const sub = d.subclave ? `/${String(d.subclave)}` : ''
      return `Falta mapear ${String(d.clave ?? '')}${sub} en Contabilidad › Mapeos: el asiento no se generó.`
    }
    case 'PERIODO_CERRADO':   return `El período contable está cerrado${d.fecha ? ` (${fmtFecha(String(d.fecha))})` : ''}: el asiento no se generó.`
    case 'FECHA_SIN_PERIODO': return 'No hay período contable abierto para la fecha del asiento (Contabilidad › Períodos).'
    case 'DESCUADRE_ORIGEN':  return `Los importes no cuadran${d.diferencia != null ? ` (diferencia ${fmtM(Number(d.diferencia))})` : ''}: revisá los recibos.`
    case 'SIN_IMPORTES':      return 'La liquidación no tiene importes: no hay asiento que generar.'
    case 'ERROR_ASIENTO':     return `Error al generar el asiento${d.mensaje ? `: ${String(d.mensaje)}` : ''}.`
    case 'PRESTAMO_SIN_LEGAJO_TARJA': return `${d.nombre ? `${String(d.nombre)}: ` : ''}el legajo no está vinculado a Personal, así que el préstamo descontado no se pudo marcar en Tarja › Préstamos. Registralo a mano.`
    case 'ASIENTO_EN_OTRO_PERIODO':   return `El asiento se registró el ${fmtFecha(String(d.fecha ?? ''))} en vez del ${fmtFecha(String(d.fecha_original ?? ''))} (el período original estaba cerrado).`
    default:                  return a.codigo
  }
}

