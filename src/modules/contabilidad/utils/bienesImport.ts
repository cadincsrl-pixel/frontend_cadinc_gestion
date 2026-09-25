// Lector del inventario de bienes de uso (xlsx o csv) para
// `POST /api/contabilidad/bienes/importar` (tanda 5, 20260928p).
//
// A diferencia del plan de cuentas, acá el navegador SÍ normaliza: el Excel
// del contador no tiene un formato fijo (P-B5), así que se reconocen los
// encabezados por alias (sin tildes, en cualquier orden) y se leen fechas,
// importes y vida útil. Se manda una fila por bien con las claves de
// `CLAVE_ENVIO` (el primer alias de cada columna en la spec, así el
// normalizador del backend las reconoce igual) y los valores ya leídos; lo que
// no se pudo leer viaja tal cual, para que el backend lo marque como error en
// la vista previa en vez de perderlo en silencio.
//
// Qué se ignora: filas vacías, títulos y subtotales («TOTAL RODADOS»). Una
// fila sin fecha y sin valor de origen no es un bien.
//
// Todo es puro y testeable (src/__tests__/contabilidad-tanda5.test.ts) salvo
// `leerArchivoBienes`, que solo elige el lector por extensión.

import * as XLSX from 'xlsx'

export type CeldaBien = string | number | null

/** Columnas canónicas. Las `control_*` se leen y se comparan, no se guardan. */
export type ColumnaBien =
  | 'descripcion' | 'cuenta' | 'fecha_alta' | 'valor_origen' | 'vida_util' | 'valor_residual'
  | 'amort_acum_inicial' | 'cuenta_amort' | 'cuenta_gasto' | 'identificador' | 'obra' | 'obs'
  | 'control_neto' | 'control_amort_ejercicio'

/** La clave con la que viaja cada columna al backend. */
export const CLAVE_ENVIO: Record<ColumnaBien, string> = {
  descripcion:             'descripcion',
  cuenta:                  'cuenta',
  fecha_alta:              'fecha alta',
  valor_origen:            'valor origen',
  vida_util:               'vida util',
  valor_residual:          'valor residual',
  amort_acum_inicial:      'amort acumulada',
  cuenta_amort:            'cuenta amortizacion acumulada',
  cuenta_gasto:            'cuenta gasto',
  identificador:           'identificador',
  obra:                    'obra',
  obs:                     'observaciones',
  control_neto:            'neto',
  control_amort_ejercicio: 'amortizacion del ejercicio',
}

export const ETIQUETA_COLUMNA: Record<ColumnaBien, string> = {
  descripcion:             'Descripción',
  cuenta:                  'Cuenta / rubro',
  fecha_alta:              'Fecha de alta',
  valor_origen:            'Valor de origen',
  vida_util:               'Vida útil',
  valor_residual:          'Valor residual',
  amort_acum_inicial:      'Amort. acumulada inicial',
  cuenta_amort:            'Cuenta amort. acumulada',
  cuenta_gasto:            'Cuenta de gasto',
  identificador:           'Identificador',
  obra:                    'Obra',
  obs:                     'Observaciones',
  control_neto:            'Neto (control)',
  control_amort_ejercicio: 'Amort. del ejercicio (control)',
}

export const COLUMNAS_OBLIGATORIAS: ColumnaBien[] = ['descripcion', 'cuenta', 'fecha_alta', 'valor_origen']

/** Alias exactos (ya normalizados con `normEnc`). El orden no importa: son exactos. */
const ALIAS: Record<ColumnaBien, string[]> = {
  descripcion:             ['descripcion', 'detalle', 'bien', 'concepto', 'descripcion del bien'],
  cuenta:                  ['cuenta', 'rubro', 'codigo cuenta', 'cuenta contable', 'codigo de cuenta'],
  fecha_alta:              ['fecha alta', 'fecha de alta', 'fecha compra', 'fecha de compra', 'alta', 'fecha'],
  valor_origen:            ['valor origen', 'valor de origen', 'v o', 'vo', 'costo', 'importe', 'valor original'],
  vida_util:               ['vida util', 'anos', 'vida util anos', 'vida util en anos', 'meses', 'vida util meses', 'vida util en meses', 'tasa', 'tasa anual'],
  valor_residual:          ['valor residual', 'residual', 'valor de recupero'],
  amort_acum_inicial:      ['amort acumulada', 'amortizacion acumulada', 'acumulada', 'amort acum inicio', 'amort acum', 'amortizaciones acumuladas'],
  cuenta_amort:            ['cuenta amortizacion acumulada', 'cuenta amort acumulada', 'cuenta amortizaciones acumuladas'],
  cuenta_gasto:            ['cuenta gasto', 'cuenta de gasto', 'cuenta amortizacion'],
  identificador:           ['patente', 'dominio', 'serie', 'n serie', 'nro serie', 'numero de serie', 'n de serie', 'identificador'],
  obra:                    ['obra', 'centro de costo', 'centro costo'],
  obs:                     ['observaciones', 'obs', 'observacion'],
  control_neto:            ['valor residual contable', 'neto', 'valor neto', 'valor neto contable'],
  control_amort_ejercicio: ['amortizacion del ejercicio', 'amort del ejercicio', 'amort ejercicio', 'amortizacion ejercicio'],
}

const INDICE_ALIAS: Map<string, ColumnaBien> = new Map(
  (Object.entries(ALIAS) as [ColumnaBien, string[]][]).flatMap(([col, as]) => as.map(a => [a, col] as const)),
)

/** Sin tildes, minúsculas, todo lo que no es letra o número pasa a un espacio. */
export function normEnc(v: unknown): string {
  return String(v ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export type UnidadVida = 'anios' | 'meses' | 'tasa'

export interface ColumnaDetectada {
  columna: ColumnaBien
  /** Solo para la vida útil: en qué viene expresada. */
  unidad?: UnidadVida
}

/** Qué columna es un encabezado. null = no se reconoce (se ignora). */
export function columnaDe(encabezado: unknown): ColumnaDetectada | null {
  const raw = String(encabezado ?? '')
  const n = normEnc(raw)
  if (!n && !raw.includes('%')) return null
  if (raw.includes('%') && (n === '' || n.includes('tasa') || n.includes('amort'))) return { columna: 'vida_util', unidad: 'tasa' }
  const exacta = INDICE_ALIAS.get(n)
  if (exacta) return exacta === 'vida_util' ? { columna: exacta, unidad: unidadVida(n) } : { columna: exacta }
  // Encabezados largos: «Amortización acumulada al 30/06/2026», «Vida útil (años)».
  if (n.startsWith('cuenta amort') && n.includes('acum')) return { columna: 'cuenta_amort' }
  if (n.startsWith('cuenta') && (n.includes('gasto') || n.includes('amortizacion'))) return { columna: 'cuenta_gasto' }
  if (n.startsWith('amortizacion acumulada') || n.startsWith('amort acum') || n.startsWith('amortizaciones acumuladas')) return { columna: 'amort_acum_inicial' }
  if (n.startsWith('amortizacion del ejercicio') || n.startsWith('amort del ejercicio')) return { columna: 'control_amort_ejercicio' }
  if (n.startsWith('vida util')) return { columna: 'vida_util', unidad: unidadVida(n) }
  if (n.startsWith('tasa')) return { columna: 'vida_util', unidad: 'tasa' }
  if (n.startsWith('valor de origen') || n.startsWith('valor origen')) return { columna: 'valor_origen' }
  if (n.startsWith('fecha de alta') || n.startsWith('fecha alta') || n.startsWith('fecha de compra')) return { columna: 'fecha_alta' }
  return null
}

function unidadVida(n: string): UnidadVida {
  if (n.includes('mes')) return 'meses'
  if (n.includes('tasa')) return 'tasa'
  return 'anios'
}

// ── Valores ─────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0')

function fechaValida(y: number, m: number, d: number): string | null {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1) return null
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate()
  if (d > ultimo) return null
  return `${y}-${pad(m)}-${pad(d)}`
}

/** Serial de Excel (sistema 1900, con el bug del 29/02/1900) → ISO. */
export function fechaDeSerial(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 80000) return null
  const ms = Math.round((Math.floor(serial) - 25569) * 86400 * 1000)
  const d = new Date(ms)
  return fechaValida(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
}

function anioLargo(y: number, texto: string): number {
  if (texto.length > 2) return y
  return y < 50 ? 2000 + y : 1900 + y
}

/**
 * dd/mm/aaaa (también con - o .), aaaa-mm-dd, serial de Excel, «mm/aaaa» →
 * día 1. null = no se entiende.
 */
export function parseFechaBien(v: CeldaBien | undefined): string | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return fechaDeSerial(v)
  const t = v.trim()
  if (!t) return null
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T].*)?$/)
  if (m) return fechaValida(Number(m[1]), Number(m[2]), Number(m[3]))
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/)
  if (m) return fechaValida(anioLargo(Number(m[3]), m[3]!), Number(m[2]), Number(m[1]))
  m = t.match(/^(\d{1,2})[/.-](\d{4})$/)
  if (m) return fechaValida(Number(m[2]), Number(m[1]), 1)
  if (/^\d+(\.\d+)?$/.test(t)) return fechaDeSerial(Number(t))
  return null
}

/**
 * «$ 1.234.567,89», «1234567.89», «1.234.567», «(1.500,00)», número. Con
 * punto y coma, el último separador es el decimal. Solo comas: una sola con
 * hasta 2 decimales es el decimal. Solo puntos: varios son miles; uno solo con
 * exactamente 3 dígitos detrás también (formato argentino). null = no se entiende.
 */
export function parseImporteBien(v: CeldaBien | undefined): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  let t = v.trim().replace(/\s|\$|ARS|US\$|USD/gi, '')
  if (!t) return null
  let negativo = false
  if (/^\(.*\)$/.test(t)) { negativo = true; t = t.slice(1, -1) }
  if (t.startsWith('-')) { negativo = true; t = t.slice(1) }
  if (!/^[\d.,]+$/.test(t)) return null
  const ultPunto = t.lastIndexOf('.')
  const ultComa = t.lastIndexOf(',')
  let limpio: string
  if (ultPunto >= 0 && ultComa >= 0) {
    limpio = ultComa > ultPunto ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '')
  } else if (ultComa >= 0) {
    const partes = t.split(',')
    limpio = partes.length === 2 && partes[1]!.length <= 2 ? t.replace(',', '.') : t.replace(/,/g, '')
  } else if (ultPunto >= 0) {
    const partes = t.split('.')
    limpio = partes.length > 2 || partes[1]!.length === 3 ? t.replace(/\./g, '') : t
  } else {
    limpio = t
  }
  const n = Number(limpio)
  if (!Number.isFinite(n)) return null
  return Math.round((negativo ? -n : n) * 100) / 100
}

/**
 * Vida útil en AÑOS. `unidad` sale del encabezado; una celda «20%» es una
 * tasa aunque la columna diga «vida útil». Tasa: 20 (o 0,20) → 5 años.
 */
export function parseVidaUtil(v: CeldaBien | undefined, unidad: UnidadVida = 'anios'): number | null {
  if (v === null || v === undefined) return null
  const esPct = typeof v === 'string' && v.includes('%')
  const n = parseImporteBien(typeof v === 'string' ? v.replace('%', '').replace(/a[nñ]os?|meses?/gi, '') : v)
  if (n === null || !(n > 0)) return null
  const u: UnidadVida = esPct ? 'tasa' : unidad
  let anios: number
  if (u === 'meses') anios = n / 12
  else if (u === 'tasa') anios = 100 / (n <= 1 ? n * 100 : n)
  else anios = n
  return Math.round(anios * 100) / 100
}

// ── Armado de las filas ─────────────────────────────────────────────────

export interface FilaBienLeida {
  /** Número de fila en el archivo (1-based, como lo ve Excel). */
  filaArchivo: number
  /** Lo que se manda: claves de `CLAVE_ENVIO`, valores ya normalizados. */
  datos:       Record<string, CeldaBien>
  /** Lo que no se pudo leer en el navegador (el backend lo va a marcar). */
  problemas:   string[]
}

export interface ResultadoBienes {
  filas:       FilaBienLeida[]
  /** Encabezado del archivo → columna reconocida (null = ignorada). */
  columnas:    { encabezado: string; columna: ColumnaBien | null; unidad?: UnidadVida }[]
  faltantes:   ColumnaBien[]
  /** Filas vacías, títulos y subtotales que se saltearon. */
  ignoradas:   number
  error:       string | null
}

const SIN_VIDA = new Set(['', '0', 'no', 'na', 'n a', 'no amortiza', 'no se amortiza', 'sin amortizacion'])

function vacia(fila: unknown[]): boolean {
  return fila.every(c => String(c ?? '').trim() === '')
}

function esSubtotal(desc: CeldaBien | undefined): boolean {
  const n = normEnc(desc)
  return n === 'total' || n === 'totales' || n.startsWith('total ') || n.startsWith('subtotal')
}

function texto(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

/** De la matriz del archivo (filas × celdas) a las filas para el backend. */
export function armarBienes(matriz: unknown[][]): ResultadoBienes {
  const vacio: ResultadoBienes = { filas: [], columnas: [], faltantes: [...COLUMNAS_OBLIGATORIAS], ignoradas: 0, error: null }
  // El encabezado: en las primeras 20 filas, la que reconoce más columnas (al menos 2).
  let iEnc = -1
  let mejor = 1
  matriz.slice(0, 20).forEach((f, i) => {
    const cols = new Set(f.map(c => columnaDe(c)?.columna).filter(Boolean))
    if (cols.size > mejor) { mejor = cols.size; iEnc = i }
  })
  if (iEnc < 0) {
    return { ...vacio, error: 'No se encontró la fila de encabezados: tiene que haber columnas como «Descripción», «Cuenta» o «Rubro», «Fecha de alta» y «Valor de origen».' }
  }
  const enc = matriz[iEnc] ?? []
  const detectadas = enc.map(c => ({ encabezado: String(c ?? '').trim(), det: columnaDe(c) }))
  // Si una columna aparece dos veces, vale la primera.
  const usadas = new Set<ColumnaBien>()
  const columnas: ResultadoBienes['columnas'] = detectadas.map(({ encabezado, det }) => {
    if (!det || usadas.has(det.columna)) return { encabezado, columna: null }
    usadas.add(det.columna)
    return { encabezado, columna: det.columna, ...(det.unidad ? { unidad: det.unidad } : {}) }
  })
  const faltantes = COLUMNAS_OBLIGATORIAS.filter(c => !usadas.has(c))

  const filas: FilaBienLeida[] = []
  let ignoradas = 0
  for (let i = iEnc + 1; i < matriz.length; i++) {
    const f = matriz[i] ?? []
    if (vacia(f)) { ignoradas++; continue }
    const crudo = new Map<ColumnaBien, unknown>()
    columnas.forEach((c, j) => { if (c.columna) crudo.set(c.columna, f[j]) })
    const celda = (c: ColumnaBien): CeldaBien => {
      const v = crudo.get(c)
      if (v === null || v === undefined) return null
      if (typeof v === 'number') return v
      return texto(v)
    }
    const fechaRaw = celda('fecha_alta')
    const voRaw = celda('valor_origen')
    const desc = celda('descripcion')
    if ((fechaRaw === null && voRaw === null) || esSubtotal(desc)) { ignoradas++; continue }

    const problemas: string[] = []
    const datos: Record<string, CeldaBien> = {}
    const poner = (c: ColumnaBien, v: CeldaBien) => { if (usadas.has(c)) datos[CLAVE_ENVIO[c]] = v }

    for (const c of ['descripcion', 'cuenta', 'identificador', 'obra', 'obs', 'cuenta_amort', 'cuenta_gasto'] as ColumnaBien[]) {
      const v = celda(c)
      poner(c, v === null ? null : typeof v === 'number' ? String(v) : v)
    }

    const fecha = parseFechaBien(fechaRaw)
    if (fechaRaw !== null && !fecha) problemas.push(`Fecha de alta ilegible: «${String(fechaRaw)}»`)
    poner('fecha_alta', fecha ?? fechaRaw)

    for (const c of ['valor_origen', 'valor_residual', 'amort_acum_inicial', 'control_neto', 'control_amort_ejercicio'] as ColumnaBien[]) {
      const raw = celda(c)
      const n = parseImporteBien(raw)
      if (raw !== null && n === null) problemas.push(`${ETIQUETA_COLUMNA[c]} ilegible: «${String(raw)}»`)
      poner(c, n ?? raw)
    }

    const vidaRaw = celda('vida_util')
    const unidad = columnas.find(c => c.columna === 'vida_util')?.unidad ?? 'anios'
    const vida = parseVidaUtil(vidaRaw, unidad)
    // «0», «-», «no», «N/A»: no se amortiza (terrenos). Viaja null, no como error.
    const sinVida = vidaRaw !== null && SIN_VIDA.has(normEnc(vidaRaw))
    if (vidaRaw !== null && vida === null && !sinVida) problemas.push(`Vida útil ilegible: «${String(vidaRaw)}»`)
    poner('vida_util', vida ?? (sinVida ? null : vidaRaw))

    // Control local: VO − acumulada ≈ neto (±1).
    const vo = typeof datos[CLAVE_ENVIO.valor_origen] === 'number' ? datos[CLAVE_ENVIO.valor_origen] as number : null
    const acum = typeof datos[CLAVE_ENVIO.amort_acum_inicial] === 'number' ? datos[CLAVE_ENVIO.amort_acum_inicial] as number : 0
    const neto = typeof datos[CLAVE_ENVIO.control_neto] === 'number' ? datos[CLAVE_ENVIO.control_neto] as number : null
    if (vo !== null && neto !== null && Math.abs(vo - acum - neto) > 1) {
      problemas.push(`El neto del archivo (${neto}) no coincide con valor de origen − acumulada (${Math.round((vo - acum) * 100) / 100})`)
    }

    filas.push({ filaArchivo: i + 1, datos, problemas })
  }

  if (filas.length === 0) return { filas, columnas, faltantes, ignoradas, error: 'El archivo no tiene bienes debajo del encabezado (una fila sin fecha y sin valor de origen no es un bien).' }
  return { filas, columnas, faltantes, ignoradas, error: null }
}

/** Parte una línea de CSV respetando comillas dobles. */
function partirLinea(linea: string, sep: string): string[] {
  const out: string[] = []
  let cur = ''
  let enComillas = false
  for (let i = 0; i < linea.length; i++) {
    const ch = linea[i]!
    if (enComillas) {
      if (ch === '"' && linea[i + 1] === '"') { cur += '"'; i++ }
      else if (ch === '"') enComillas = false
      else cur += ch
    } else if (ch === '"') enComillas = true
    else if (ch === sep) { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out
}

export function leerCsvBienes(textoCsv: string): ResultadoBienes {
  const lineas = textoCsv.replace(/^﻿/, '').split(/\r?\n/)
  // El separador: el que más aparece en las primeras líneas con contenido.
  const muestra = lineas.filter(l => l.trim()).slice(0, 10).join('\n')
  const sep = [';', '\t', ','].map(s => ({ s, n: muestra.split(s).length })).sort((a, b) => b.n - a.n)[0]!.s
  return armarBienes(lineas.map(l => partirLinea(l, sep)))
}

export function leerXlsxBienes(buf: ArrayBuffer): ResultadoBienes {
  const wb = XLSX.read(buf, { type: 'array' })
  const hoja = wb.SheetNames[0]
  if (!hoja) return { filas: [], columnas: [], faltantes: [...COLUMNAS_OBLIGATORIAS], ignoradas: 0, error: 'El archivo no tiene hojas.' }
  // raw: las fechas llegan como serial y los importes como número (sin el
  // formato de la celda, que cambia según la configuración regional).
  const matriz = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[hoja]!, { header: 1, raw: true, defval: null, blankrows: false })
  return armarBienes(matriz)
}

/** Elige el lector por la extensión. */
export async function leerArchivoBienes(file: File): Promise<ResultadoBienes> {
  const nombre = file.name.toLowerCase()
  if (nombre.endsWith('.csv') || nombre.endsWith('.txt')) return leerCsvBienes(await file.text())
  return leerXlsxBienes(await file.arrayBuffer())
}
