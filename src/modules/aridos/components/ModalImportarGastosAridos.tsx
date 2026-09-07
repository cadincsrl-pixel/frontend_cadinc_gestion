'use client'

import { useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import { HttpError } from '@/lib/api/client'
import { useCategoriasGasto, useImportarGastos } from '../hooks/useAridos'
import type {
  CategoriaGastoArido,
  FilaImportacion,
  ResultadoImportacion,
} from '../types'

interface Unidad { id: number; nombre: string; patente: string }

interface Props {
  open:     boolean
  onClose:  () => void
  unidades: Unidad[]
}

type TipoCombustible = 'gasoil' | 'nafta'
type ResultadoFila = ResultadoImportacion['resultados'][number]

/** Fila del Excel ya interpretada, con el motivo por el que no se puede enviar. */
interface Fila {
  fecha:            string
  categoria_id:     number | null
  categoria_texto:  string
  categoria_codigo: string
  monto:            number
  unidad_id:        number | null
  unidad_texto:     string
  proveedor:        string
  metodo_pago:      string
  comprobante_nro:  string
  descripcion:      string
  obs:              string
  litros:           number | null
  odometro:         number | null
  tipo_combustible: TipoCombustible
  tanque_lleno:     boolean
  obs_combustible:  string
  error:            string | null
}

// Sin "Chofer" ni "Pagó": en áridos el chofer cobra por día trabajado y no se
// le reintegran gastos, así que no hay a quién devolverle la plata.
const COLS = [
  'Fecha', 'Categoría', 'Monto', 'Camión',
  'Proveedor', 'Método pago', 'Nº Comprobante', 'Descripción', 'Observaciones',
  'Litros', 'Odómetro', 'Tipo combustible', 'Tanque lleno', 'Obs combustible',
]
const COMBUSTIBLE_START = 9

const HEADER_NOTES: Record<string, string> = {
  'Fecha':            'Formato: DD/MM/AAAA o AAAA-MM-DD. También acepta números seriales de Excel.',
  'Categoría':        'Elegí del dropdown (combustible, taller, seguro, etc.).',
  'Monto':            'Total del comprobante en pesos, IVA incluido. Acepta decimales (1.234,56 o 1234.56).',
  'Camión':           'Nombre o patente de la unidad. Elegí del dropdown. VACÍO = gasto del área (no de un camión): seguro de la oficina, VTV administrativa, etc. Es válido.',
  'Proveedor':        'Ej: YPF Ruta 6, Gomería López.',
  'Método pago':      'Opcional. Elegí del dropdown: efectivo, transferencia, tarjeta, cheque, cta_cte, otro.',
  'Nº Comprobante':   'Número del comprobante físico. Ej: 000123-04.',
  'Descripción':      'Descripción breve. Ej: Carga 150L salida a cantera.',
  'Observaciones':    'Notas adicionales del gasto (opcional).',
  'Litros':           '⛽ OBLIGATORIO si la categoría es combustible. Dejalo vacío en cualquier otro gasto. Acepta decimales (150,500).',
  'Odómetro':         '⛽ Opcional pero recomendado: sin él no hay control de consumo. Km totales del camión al momento de cargar.',
  'Tipo combustible': '⛽ Opcional. Default: gasoil. Valores: gasoil, nafta.',
  'Tanque lleno':     '⛽ Opcional. "sí" si llenaste el tanque, "no" si fue carga parcial. Default: sí.',
  'Obs combustible':  '⛽ Notas específicas de la carga (opcional). Ej: Surtidor 3.',
}

const METODOS_VALIDOS = ['efectivo', 'transferencia', 'tarjeta', 'cheque', 'cta_cte', 'otro'] as const
const TIPOS_COMBUSTIBLE: readonly TipoCombustible[] = ['gasoil', 'nafta']

// El underscore de cta_cte no lo escribe nadie a mano.
const ALIAS_METODO: Record<string, string> = {
  'cta cte':          'cta_cte',
  'cta. cte.':        'cta_cte',
  'cuenta corriente': 'cta_cte',
}

// Tope del endpoint (`aridos-gastos.service.ts`: DEMASIADAS_FILAS).
const MAX_FILAS = 500

const MOTIVOS: Record<string, string> = {
  FECHA_INVALIDA:      'Fecha inválida',
  MONTO_INVALIDO:      'Monto inválido (tiene que ser mayor a 0)',
  CATEGORIA_INVALIDA:  'La categoría no existe',
  CATEGORIA_BLOQUEADA: 'La categoría está dada de baja',
  FECHA_FUTURA:        'Fecha futura: esta categoría no se carga adelantada',
  CARGA_REQUERIDA:     'Es combustible y no tiene litros',
  CARGA_NO_PERMITIDA:  'Tiene litros pero no es un gasto de combustible',
  LITROS_INVALIDOS:    'Litros inválidos (tienen que ser mayores a 0)',
  UNIDAD_INVALIDA:     'El camión no existe',
  SIN_FILAS:           'El archivo no tiene filas para importar',
  DEMASIADAS_FILAS:    `El archivo supera las ${MAX_FILAS} filas por importación`,
  DB_ERROR:            'Error de la base de datos',
}

const AVISOS: Record<string, string> = {
  ODOMETRO_RETROCEDE:      'el odómetro es menor que el de la carga anterior',
  ODOMETRO_ESTANCADO:      'el odómetro no se movió desde la carga anterior',
  CONSUMO_IMPROBABLE_BAJO: 'consumo muy bajo para los km recorridos',
  CONSUMO_IMPROBABLE_ALTO: 'consumo muy alto para los km recorridos',
}

function norm(s: string): string {
  return s.trim().toLowerCase()
}

/** "sí/si/x/true/1" → true; "no/false/0" → false; vacío o basura → null. */
function parseSiNo(v: unknown): boolean | null {
  if (v == null || v === '') return null
  const s = String(v).trim().toLowerCase()
  if (['si', 'sí', 'x', 'true', '1', 'yes'].includes(s)) return true
  if (['no', 'false', '0'].includes(s))                  return false
  return null
}

// Locale-aware: si hay coma, la coma es el decimal y los puntos son miles;
// si NO hay coma, el punto ya es el separador decimal (no se borra).
function parseNum(v: unknown): number | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  let s = String(v).trim()
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  s = s.replace(/[^\d.-]/g, '')
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function parseFecha(v: unknown): string | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v)
    if (!d) return null
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  const s = String(v).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`
  return null
}

/** Las patentes se escriben con y sin guiones/espacios según quién las tipee. */
function soloAlnum(s: string): string {
  return norm(s).replace(/[^a-z0-9]/g, '')
}

interface MatchUnidad { unidad: Unidad | null; error: string | null }

// El dueño llama a las unidades por nombre ("Trompudo"), el taller por patente.
// Exacto primero; el substring solo resuelve si deja UN candidato — con dos
// ("Ford 1722" y "Ford 1722 Volquete") adivinar sería peor que preguntar.
function matchUnidad(texto: string, unidades: Unidad[]): MatchUnidad {
  if (!texto) return { unidad: null, error: null }
  const objetivo = norm(texto)
  const exacta = unidades.find(u =>
    norm(u.nombre) === objetivo || soloAlnum(u.patente) === soloAlnum(texto),
  )
  if (exacta) return { unidad: exacta, error: null }
  const candidatos = unidades.filter(u => norm(u.nombre).includes(objetivo))
  if (candidatos.length === 1) return { unidad: candidatos[0]!, error: null }
  if (candidatos.length > 1) {
    return { unidad: null, error: `Camión "${texto}" ambiguo (${candidatos.length} coincidencias)` }
  }
  return { unidad: null, error: `Camión "${texto}" no encontrado` }
}

/** Lo que la fila manda al backend, o null si local ya sabe que no entra. */
function aFilaImportacion(f: Fila): FilaImportacion | null {
  if (f.error || f.categoria_id == null) return null
  const esCombustible = f.categoria_codigo === 'combustible'
  return {
    fecha:           f.fecha,
    categoria_id:    f.categoria_id,
    unidad_id:       f.unidad_id,
    monto:           f.monto,
    descripcion:     f.descripcion || null,
    proveedor:       f.proveedor || null,
    metodo_pago:     f.metodo_pago || null,
    comprobante_nro: f.comprobante_nro || null,
    obs:             f.obs || null,
    carga: esCombustible && f.litros != null
      ? {
          litros:           f.litros,
          odometro_km:      f.odometro,
          tipo_combustible: f.tipo_combustible,
          tanque_lleno:     f.tanque_lleno,
          obs:              f.obs_combustible || null,
        }
      : null,
  }
}

function textoDeCodigo(r: ResultadoFila): string {
  const base = MOTIVOS[r.code ?? ''] ?? r.code ?? 'Error'
  return typeof r.detail === 'string' ? `${base}: ${r.detail}` : base
}

function mensajeDeError(err: unknown): string {
  if (err instanceof HttpError) return MOTIVOS[err.message] ?? err.message
  return err instanceof Error ? err.message : 'Error desconocido'
}

// exceljs expone `dataValidations` en runtime pero no lo declara en sus .d.ts.
interface HojaConValidaciones {
  dataValidations: {
    add(rango: string, regla: {
      type: 'list'
      allowBlank: boolean
      formulae: string[]
      showErrorMessage: boolean
      errorStyle: string
      errorTitle: string
      error: string
    }): void
  }
}

// Plantilla con dropdowns nativos: se usa exceljs (no xlsx) porque la
// community edition de xlsx no escribe data validations.
async function descargarPlantilla(args: { unidades: Unidad[]; categorias: CategoriaGastoArido[] }) {
  // Code-split: exceljs (~700KB) solo se baja cuando el user pide la plantilla.
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()

  const unidadesOrd   = args.unidades.slice().sort((a, b) => a.nombre.localeCompare(b.nombre))
  const categoriasOrd = args.categorias.filter(c => c.activo).sort((a, b) => a.orden - b.orden)
  const sino = ['sí', 'no']
  const codCombustible = categoriasOrd.find(c => c.codigo === 'combustible')?.codigo ?? 'combustible'
  const otraCat = categoriasOrd.find(c => c.codigo !== 'combustible')?.codigo ?? 'taller'

  // ── Hoja "📖 Cómo usar" ──
  const wsHelp = wb.addWorksheet('📖 Cómo usar')
  wsHelp.getColumn(1).width = 22
  wsHelp.getColumn(2).width = 92
  const titulo = wsHelp.addRow(['Plantilla de gastos de Áridos'])
  titulo.font = { bold: true, size: 16, color: { argb: 'FF1B4F8C' } }
  wsHelp.addRow([])
  wsHelp.addRow(['Cómo llenarla',  '1) Una fila por gasto en la hoja "Gastos".  2) Usá los dropdowns donde estén.  3) Guardá y subí el archivo desde "Importar gastos".'])
  wsHelp.addRow(['Combustible',    'Si la Categoría es "combustible", LITROS es obligatorio. El Odómetro es opcional, pero sin él no se puede controlar el consumo del camión.'])
  wsHelp.addRow(['Otros gastos',   'Para taller, seguro, VTV, etc. dejá VACÍAS las 5 columnas de combustible. Si ponés litros en un gasto que no es combustible, la fila se rechaza.'])
  wsHelp.addRow(['Camión vacío',   'Dejar el Camión vacío es válido: significa "gasto del área", no de una unidad. Ojo que un gasto sin camión no entra en el resultado de ningún camión.'])
  wsHelp.addRow(['Sin chofer',     'No hay columna de chofer: en áridos el chofer cobra por día trabajado y no se le reintegran gastos.'])
  wsHelp.addRow(['Reimportar',     'Podés corregir dos filas y volver a subir el archivo ENTERO: lo que ya estaba cargado sale como "duplicado" y no se repite.'])
  wsHelp.addRow(['Cuidado',        'Dos gastos con la misma Fecha + Categoría + Monto + Camión se toman como el mismo. Si de verdad son dos, diferenciá el monto o cargalos en una sola fila sumada.'])
  wsHelp.addRow(['Comprobantes',   'La plantilla NO sube la foto/PDF del comprobante. Se adjunta después desde la pantalla de gastos, uno por uno.'])
  wsHelp.addRow(['Límite',         `${MAX_FILAS} filas por archivo. Si el mes trae más, partilo en dos.`])
  wsHelp.addRow(['Filas vacías',   'Las filas totalmente vacías se ignoran. No hace falta borrarlas.'])
  wsHelp.addRow([])
  const tabHdr = wsHelp.addRow(['Columna', 'Descripción'])
  tabHdr.font = { bold: true }
  tabHdr.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } } })
  for (const c of COLS) wsHelp.addRow([c, HEADER_NOTES[c] ?? ''])

  // ── Hoja "Gastos" — la que el user llena ──
  const wsGastos = wb.addWorksheet('Gastos')
  wsGastos.addRow(COLS)

  const headerRow = wsGastos.getRow(1)
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  headerRow.alignment = { vertical: 'middle', horizontal: 'left' }
  headerRow.height = 22
  COLS.forEach((nombre, i) => {
    const cell = headerRow.getCell(i + 1)
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: i < COMBUSTIBLE_START ? 'FF1B4F8C' : 'FF2E7D32' },
    }
    const note = HEADER_NOTES[nombre]
    if (note) cell.note = { texts: [{ text: note }] }
  })

  wsGastos.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }]

  // Demos: carga de combustible completa, gasto de camión sin combustible y
  // gasto del área (sin camión), que es el caso que más confunde.
  wsGastos.addRow([
    '22/04/2026', codCombustible, 185000,
    unidadesOrd[0]?.nombre ?? 'Trompudo',
    'YPF Ruta 6', 'efectivo', '000123-04', 'Carga 150L', 'Salida a cantera',
    150, 185420, 'gasoil', 'sí', 'Surtidor 3',
  ])
  wsGastos.addRow([
    '23/04/2026', otraCat, 48000,
    unidadesOrd[1]?.nombre ?? unidadesOrd[0]?.nombre ?? 'Ford 1722 Volquete',
    'Taller Martínez', 'transferencia', 'A-0001-12', 'Cambio de aceite', '',
    '', '', '', '', '',
  ])
  wsGastos.addRow([
    '24/04/2026', otraCat, 32000,
    '',
    'Seguros del Sur', 'transferencia', 'B-0002-33', 'Gasto del área (sin camión)', '',
    '', '', '', '', '',
  ])

  // Widths con getColumn: asignar `columns = [...]` después de addRow
  // reescribe los headers y descarta los datos en exceljs.
  COLS.forEach((_, i) => {
    wsGastos.getColumn(i + 1).width = i === 4 || i === 7 ? 28 : 16
  })

  const rangoListas = (col: 'A' | 'B' | 'C' | 'D' | 'E' | 'F', n: number) =>
    `Listas!$${col}$2:$${col}$${1 + Math.max(n, 1)}`

  const LAST_ROW = 1000
  const dvBag = (wsGastos as unknown as HojaConValidaciones).dataValidations
  const dv = (col: string, listRange: string, allowBlank = true) => {
    dvBag.add(`${col}2:${col}${LAST_ROW}`, {
      type: 'list',
      allowBlank,
      formulae: [listRange],
      showErrorMessage: true,
      errorStyle: 'warning',
      errorTitle: 'Valor no válido',
      error: 'Elegí un valor de la lista (o escribí uno que matchee).',
    })
  }
  dv('B', rangoListas('C', categoriasOrd.length), false)   // Categoría
  dv('D', rangoListas('A', unidadesOrd.length))            // Camión
  dv('F', rangoListas('D', METODOS_VALIDOS.length))        // Método pago
  dv('L', rangoListas('E', TIPOS_COMBUSTIBLE.length))      // Tipo combustible
  dv('M', rangoListas('F', sino.length))                   // Tanque lleno

  // ── Hoja "Listas" — fuente de los dropdowns ──
  const wsListas = wb.addWorksheet('Listas')
  const listasHdr = wsListas.addRow([
    'Camiones', 'Patente (referencia)', 'Categorías', 'Métodos pago', 'Tipo combustible', 'Tanque lleno',
  ])
  listasHdr.font = { bold: true }
  listasHdr.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } } })

  const maxListaRows = Math.max(
    unidadesOrd.length, categoriasOrd.length,
    METODOS_VALIDOS.length, TIPOS_COMBUSTIBLE.length, sino.length,
  )
  for (let i = 0; i < maxListaRows; i++) {
    wsListas.addRow([
      unidadesOrd[i]?.nombre   ?? '',
      unidadesOrd[i]?.patente  ?? '',
      categoriasOrd[i]?.codigo ?? '',
      METODOS_VALIDOS[i]       ?? '',
      TIPOS_COMBUSTIBLE[i]     ?? '',
      sino[i]                  ?? '',
    ])
  }
  for (let c = 1; c <= 6; c++) wsListas.getColumn(c).width = 22

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'Plantilla_Gastos_Aridos.xlsx'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function ModalImportarGastosAridos({ open, onClose, unidades }: Props) {
  const toast = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const { puedeCrear } = usePermisos('aridos')
  const { data: categorias = [], isLoading: cargandoCategorias, isError: fallaronCategorias } = useCategoriasGasto()
  // Dos instancias del mismo hook para que la validación y la importación real
  // tengan su propio isPending y no se pisen los spinners.
  const validacion  = useImportarGastos()
  const importacion = useImportarGastos()

  const [filas,       setFilas]       = useState<Fila[] | null>(null)
  const [resumen,     setResumen]     = useState<ResultadoImportacion | null>(null)
  const [errorGlobal, setErrorGlobal] = useState<string | null>(null)

  // Índice original de cada fila enviada: el `n` que devuelve el backend es
  // 1-based sobre ESTE array, no sobre el Excel (las filas con error local no
  // se mandan, así que los números no coinciden).
  const enviables = useMemo(() => {
    const out: Array<{ indice: number; fila: FilaImportacion }> = []
    filas?.forEach((f, i) => {
      const dto = aFilaImportacion(f)
      if (dto) out.push({ indice: i, fila: dto })
    })
    return out
  }, [filas])

  const estados = useMemo(() => {
    const m = new Map<number, ResultadoFila>()
    if (!resumen) return m
    for (const r of resumen.resultados) {
      const ref = enviables[r.n - 1]
      if (ref) m.set(ref.indice, r)
    }
    return m
  }, [resumen, enviables])

  function parsear(file: File) {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target!.result, { type: 'array', cellDates: false })
        // La plantilla tiene 3 hojas ("📖 Cómo usar" primero). Buscamos "Gastos"
        // por nombre; si el user renombró la hoja, la primera que tenga "Fecha".
        const nombreHoja =
          wb.SheetNames.find(n => norm(n) === 'gastos') ??
          wb.SheetNames.find(n => {
            const sh = wb.Sheets[n]
            if (!sh) return false
            const r = XLSX.utils.sheet_to_json<unknown[]>(sh, { header: 1, defval: '' })
            return r.slice(0, 5).some(row => row.some(c => norm(String(c)) === 'fecha'))
          }) ??
          wb.SheetNames[0]
        if (!nombreHoja) { toast('No se encontraron hojas en el archivo', 'err'); return }
        const ws = wb.Sheets[nombreHoja]
        if (!ws) { toast('No se pudo leer la hoja del archivo', 'err'); return }
        const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })

        const headerIdx = rows.findIndex(r => r.some(c => norm(String(c)) === 'fecha'))
        if (headerIdx === -1) {
          toast('No se encontró la columna "Fecha". Usá la plantilla.', 'err')
          return
        }

        const headers = rows[headerIdx]!.map(c => norm(String(c)))
        const col = (...alias: string[]) => {
          for (const a of alias) {
            const i = headers.indexOf(norm(a))
            if (i >= 0) return i
          }
          return -1
        }

        const iFecha    = col('fecha')
        const iCat      = col('categoría', 'categoria')
        const iMonto    = col('monto')
        const iCamion   = col('camión', 'camion', 'unidad')
        const iProv     = col('proveedor')
        const iMetodo   = col('método pago', 'metodo pago')
        const iNroComp  = col('nº comprobante', 'n° comprobante', 'comprobante')
        const iDesc     = col('descripción', 'descripcion')
        const iObs      = col('observaciones')
        const iLitros   = col('litros')
        const iOdo      = col('odómetro', 'odometro')
        const iTipoComb = col('tipo combustible')
        const iTanque   = col('tanque lleno')
        const iObsComb  = col('obs combustible')

        const txt = (r: unknown[], i: number) => (i >= 0 ? String(r[i] ?? '').trim() : '')

        // Una fila se considera vacía (y se omite en silencio) si los 3 campos
        // críticos están vacíos. No alcanza con `r.some(...)`: Excel deja
        // celdas residuales con formato que harían aparecer filas fantasma.
        const dataRows = rows.slice(headerIdx + 1).filter(r =>
          txt(r, iFecha) !== '' || txt(r, iCat) !== '' || txt(r, iMonto) !== '',
        )

        const parsed: Fila[] = dataRows.map(r => {
          const fecha = parseFecha(iFecha >= 0 ? r[iFecha] : '')

          const catTexto = txt(r, iCat)
          const catObj = categorias.find(c =>
            norm(c.codigo) === norm(catTexto) || norm(c.nombre) === norm(catTexto),
          )
          const esCombustible = catObj?.codigo === 'combustible'

          const monto = parseNum(iMonto >= 0 ? r[iMonto] : '') ?? 0

          const unidadTexto = txt(r, iCamion)
          const { unidad, error: errorUnidad } = matchUnidad(unidadTexto, unidades)

          const metodoRaw = norm(txt(r, iMetodo))
          const metodo = ALIAS_METODO[metodoRaw] ?? metodoRaw

          const litros   = iLitros >= 0 ? parseNum(r[iLitros]) : null
          const odoRaw   = iOdo    >= 0 ? parseNum(r[iOdo])    : null
          // El odómetro va como entero (el backend lo exige); los km con
          // decimales no significan nada en una carga de combustible.
          const odometro = odoRaw == null ? null : Math.round(odoRaw)

          const tipoCombText = norm(txt(r, iTipoComb))
          const tipoCombValido = TIPOS_COMBUSTIBLE.includes(tipoCombText as TipoCombustible)
          const tipoCombustible: TipoCombustible = tipoCombValido
            ? (tipoCombText as TipoCombustible)
            : 'gasoil'

          const tanqueRaw    = txt(r, iTanque)
          const tanqueParsed = parseSiNo(tanqueRaw)

          let error: string | null = null
          if (!fecha)                       error = 'Fecha inválida (usar DD/MM/AAAA o AAAA-MM-DD)'
          else if (!catTexto)               error = 'Categoría vacía'
          else if (!catObj)                 error = `Categoría "${catTexto}" no encontrada`
          else if (!catObj.activo)          error = `Categoría "${catTexto}" dada de baja`
          else if (!(monto > 0))            error = 'Monto inválido (mayor a 0)'
          else if (errorUnidad)             error = errorUnidad
          else if (metodo && !METODOS_VALIDOS.includes(metodo as typeof METODOS_VALIDOS[number])) {
            error = `Método pago "${metodoRaw}" inválido`
          }
          else if (esCombustible && (litros == null || litros <= 0)) error = 'Combustible requiere Litros (>0)'
          // Litros fuera de combustible: el backend lo rechaza (CARGA_NO_PERMITIDA)
          // y descartarlos en silencio le comería datos al que cargó el Excel.
          else if (!esCombustible && litros != null && litros !== 0) {
            error = 'Litros solo van en gastos de combustible'
          }
          else if (odometro != null && odometro < 0)                 error = 'Odómetro inválido'
          else if (tipoCombText && !tipoCombValido) {
            error = `Tipo combustible "${tipoCombText}" inválido (${TIPOS_COMBUSTIBLE.join('|')})`
          }
          else if (tanqueRaw !== '' && tanqueParsed === null) {
            error = `Tanque lleno "${tanqueRaw}" inválido (sí|no)`
          }

          return {
            fecha:            fecha ?? '',
            categoria_id:     catObj?.id ?? null,
            categoria_texto:  catTexto,
            categoria_codigo: catObj?.codigo ?? '',
            monto:            Number.isFinite(monto) ? monto : 0,
            unidad_id:        unidad?.id ?? null,
            unidad_texto:     unidadTexto,
            proveedor:        txt(r, iProv),
            metodo_pago:      metodo,
            comprobante_nro:  txt(r, iNroComp),
            descripcion:      txt(r, iDesc),
            obs:              txt(r, iObs),
            litros:           esCombustible ? litros : null,
            odometro:         esCombustible ? odometro : null,
            tipo_combustible: tipoCombustible,
            tanque_lleno:     tanqueParsed ?? true,
            obs_combustible:  esCombustible ? txt(r, iObsComb) : '',
            error,
          }
        })

        setFilas(parsed)
        setResumen(null)
        setErrorGlobal(null)
        void validar(parsed)
      } catch (err) {
        console.error('[import-gastos-aridos] parse error', err)
        toast('Error al leer el archivo', 'err')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  // Dry run: las mismas validaciones del alta real, sin escribir nada.
  async function validar(parsed: Fila[]) {
    const aEnviar: FilaImportacion[] = []
    for (const f of parsed) {
      const dto = aFilaImportacion(f)
      if (dto) aEnviar.push(dto)
    }
    if (!aEnviar.length) return
    if (aEnviar.length > MAX_FILAS) {
      setErrorGlobal(
        `El archivo trae ${aEnviar.length} filas para importar y el máximo es ${MAX_FILAS} por vez. ` +
        'Partilo en dos archivos (por ejemplo, media quincena cada uno) y subilos uno tras otro.',
      )
      return
    }
    try {
      const res = await validacion.mutateAsync({ filas: aEnviar, dry_run: true })
      setResumen(res)
    } catch (err) {
      console.error('[import-gastos-aridos] dry run', err)
      setErrorGlobal(mensajeDeError(err))
    }
  }

  async function handleImportar() {
    if (!enviables.length) return
    try {
      const res = await importacion.mutateAsync({
        filas: enviables.map(e => e.fila),
        dry_run: false,
      })
      setResumen(res)
      setErrorGlobal(null)
      toast(
        res.creados > 0
          ? `${res.creados} gasto${res.creados !== 1 ? 's' : ''} importado${res.creados !== 1 ? 's' : ''}`
          : 'No se importó ninguna fila',
        res.creados > 0 ? 'ok' : 'warn',
      )
    } catch (err) {
      console.error('[import-gastos-aridos] importar', err)
      setErrorGlobal(mensajeDeError(err))
      toast('No se pudo importar', 'err')
    }
  }

  function handleClose() {
    setFilas(null)
    setResumen(null)
    setErrorGlobal(null)
    validacion.reset()
    importacion.reset()
    onClose()
  }

  const conErrorLocal = filas?.filter(f => f.error).length ?? 0
  const finalizado    = resumen != null && !resumen.dry_run
  const totalErrores  = (resumen?.errores ?? 0) + conErrorLocal
  const montoAImportar = enviables.reduce((s, e) => {
    const est = estados.get(e.indice)
    return est && est.estado !== 'ok' ? s : s + e.fila.monto
  }, 0)
  const conAvisos = resumen?.resultados.filter(r => (r.warnings?.length ?? 0) > 0).length ?? 0

  const tituloBoton = !puedeCrear
    ? 'Sin permiso para crear gastos de áridos'
    : (resumen?.creados ?? 0) === 0
      ? 'No hay filas nuevas para importar'
      : undefined

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="📥 IMPORTAR GASTOS DE ÁRIDOS"
      width="max-w-4xl"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>
            {finalizado ? 'Cerrar' : 'Cancelar'}
          </Button>
          {resumen && !finalizado && (
            <Button
              variant="primary"
              loading={importacion.isPending}
              disabled={!puedeCrear || resumen.creados === 0}
              title={tituloBoton}
              onClick={handleImportar}
            >
              ✓ Importar {resumen.creados} fila{resumen.creados !== 1 ? 's' : ''}
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">

        {errorGlobal && (
          <div className="rounded-xl bg-rojo-light border border-rojo/30 p-3 text-sm text-rojo font-semibold">
            {errorGlobal}
          </div>
        )}

        {finalizado && resumen && (
          <div className={`rounded-xl p-4 ${resumen.creados === 0 ? 'bg-rojo-light border border-rojo/30' : 'bg-verde-light border border-verde/30'}`}>
            <div className={`font-bold text-lg text-center ${resumen.creados === 0 ? 'text-rojo' : 'text-verde'}`}>
              {resumen.creados === 0 ? '✕ No entró ninguna fila' : '✓ Importación completada'}
            </div>
            <div className="text-sm text-carbon mt-1 text-center">
              {resumen.creados} gasto{resumen.creados !== 1 ? 's' : ''} creado{resumen.creados !== 1 ? 's' : ''}
              {resumen.duplicados > 0 && <> · <span className="text-amarillo font-bold">{resumen.duplicados} ya estaban cargados</span></>}
              {resumen.errores   > 0 && <> · <span className="text-rojo font-bold">{resumen.errores} con error</span></>}
            </div>
            {conAvisos > 0 && (
              <p className="text-xs text-carbon mt-2 text-center">
                ⚠ {conAvisos} carga{conAvisos !== 1 ? 's' : ''} con avisos de odómetro/consumo. Entraron igual; revisalas en la lista de gastos.
              </p>
            )}
            {resumen.errores > 0 && (
              <p className="text-xs text-gris-dark mt-2 text-center">
                Corregí esas filas en el Excel y volvé a subir el archivo entero: las que ya entraron salen como duplicadas y no se repiten.
              </p>
            )}
          </div>
        )}

        {!finalizado && (
          <>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => inputRef.current?.click()}
                disabled={cargandoCategorias || fallaronCategorias}
                className="flex items-center gap-2 px-4 py-2.5 bg-azul text-white rounded-lg font-bold text-sm hover:bg-azul/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                📂 Seleccionar archivo Excel
              </button>
              <button
                onClick={() => descargarPlantilla({ unidades, categorias })
                  .catch(err => { console.error('[plantilla-aridos] error', err); toast('Error al generar plantilla', 'err') })
                }
                disabled={cargandoCategorias || fallaronCategorias}
                className="flex items-center gap-2 px-4 py-2.5 bg-gris text-gris-dark rounded-lg font-bold text-sm hover:bg-gris-mid transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                📋 Descargar plantilla
              </button>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) parsear(f); e.target.value = '' }}
              />
            </div>

            {cargandoCategorias && (
              <p className="text-xs text-gris-dark">Cargando categorías de gasto…</p>
            )}

            {fallaronCategorias && (
              <div className="rounded-xl bg-rojo-light border border-rojo/30 p-3 text-sm text-rojo font-semibold">
                No se pudieron cargar las categorías de gasto. Sin ellas no se puede leer el Excel: recargá la página y volvé a intentar.
              </div>
            )}

            <p className="text-xs text-gris-dark">
              Columnas esperadas: <span className="font-mono">{COLS.join(', ')}</span>.
              <br />
              <b>Camión</b>: nombre o patente de la unidad. Dejarlo <b>vacío es válido</b>: es un gasto del área, no de un camión.
              {' '}Método pago (opcional): <span className="font-mono">{METODOS_VALIDOS.join(' | ')}</span>.
              <br />
              <b>Combustible</b>: <span className="font-mono">Litros</span> obligatorio, <span className="font-mono">Odómetro</span> recomendado.
              {' '}<span className="font-mono">Tipo combustible</span> opcional (default <span className="font-mono">gasoil</span>; valores: <span className="font-mono">{TIPOS_COMBUSTIBLE.join(' | ')}</span>).
              {' '}<span className="font-mono">Tanque lleno</span> opcional (<span className="font-mono">sí | no</span>, default sí).
              {' '}En el resto de los gastos, esas columnas van vacías.
              <br />
              Máximo {MAX_FILAS} filas por archivo. El comprobante (foto/PDF) se adjunta después, gasto por gasto.
            </p>
          </>
        )}

        {filas && filas.length === 0 && (
          <div className="rounded-xl border border-gris-mid bg-gris/30 p-6 text-center text-sm text-gris-dark">
            El archivo no tiene filas cargadas.
          </div>
        )}

        {filas && filas.length > 0 && (
          <>
            <div className="flex gap-2 flex-wrap items-center">
              {validacion.isPending && (
                <span className="text-xs font-bold px-3 py-1.5 rounded-lg bg-azul-light text-azul">
                  Validando {enviables.length} fila{enviables.length !== 1 ? 's' : ''}…
                </span>
              )}
              {resumen && resumen.creados > 0 && (
                <span className="text-xs font-bold px-3 py-1.5 rounded-lg bg-verde-light text-verde">
                  ✓ {resumen.creados} {finalizado ? 'importada' : 'lista'}{resumen.creados !== 1 ? 's' : ''}
                  {!finalizado && <> · $ {montoAImportar.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</>}
                </span>
              )}
              {(resumen?.duplicados ?? 0) > 0 && (
                <span className="text-xs font-bold px-3 py-1.5 rounded-lg bg-amarillo-light text-carbon">
                  ↺ {resumen!.duplicados} ya cargada{resumen!.duplicados !== 1 ? 's' : ''} (se saltean)
                </span>
              )}
              {totalErrores > 0 && (
                <span className="text-xs font-bold px-3 py-1.5 rounded-lg bg-rojo-light text-rojo">
                  ✕ {totalErrores} con error (no {totalErrores !== 1 ? 'entran' : 'entra'})
                </span>
              )}
            </div>

            <div className="overflow-auto max-h-96 border border-gris-mid rounded-xl">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-azul text-white sticky top-0">
                    <th className="px-2 py-2 text-left font-bold">#</th>
                    <th className="px-2 py-2 text-left font-bold">Fecha</th>
                    <th className="px-2 py-2 text-left font-bold">Categoría</th>
                    <th className="px-2 py-2 text-right font-bold">Monto</th>
                    <th className="px-2 py-2 text-left font-bold">Camión</th>
                    <th className="px-2 py-2 text-right font-bold">Litros</th>
                    <th className="px-2 py-2 text-right font-bold">Odóm.</th>
                    <th className="px-2 py-2 text-left font-bold">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f, i) => {
                    const est = estados.get(i)
                    const esError = !!f.error || est?.estado === 'error'
                    const esDup   = est?.estado === 'duplicado'
                    const esOk    = est?.estado === 'ok'
                    const unidad  = unidades.find(u => u.id === f.unidad_id)
                    const combSinCamion = f.categoria_codigo === 'combustible' && f.unidad_id == null
                    const fondo = esError ? 'bg-rojo-light/40'
                      : esDup ? 'bg-amarillo-light'
                      : esOk  ? 'bg-verde-light/40'
                      : i % 2 === 0 ? 'bg-white' : 'bg-gris/30'
                    return (
                      <tr key={i} className={`border-b border-gris last:border-0 ${fondo}`}>
                        <td className="px-2 py-1.5 text-gris-dark">{i + 1}</td>
                        <td className="px-2 py-1.5 font-mono">{f.fecha || '—'}</td>
                        <td className="px-2 py-1.5">
                          {f.categoria_id
                            ? <span className="font-semibold">{categorias.find(c => c.id === f.categoria_id)?.nombre ?? f.categoria_texto}</span>
                            : <span className="text-rojo">{f.categoria_texto || '—'}</span>}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono">
                          $ {f.monto.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-2 py-1.5">
                          {unidad
                            ? <span title={unidad.patente}>{unidad.nombre}</span>
                            : f.unidad_texto
                              ? <span className="text-rojo">{f.unidad_texto}</span>
                              : combSinCamion
                                ? <span className="text-amarillo italic" title="Carga de combustible sin camión: entra, pero no suma al resultado de ninguna unidad">— del área</span>
                                : <span className="text-gris-dark italic" title="Gasto del área, no de un camión">— del área</span>}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono">
                          {f.litros != null ? `${f.litros.toLocaleString('es-AR')} L` : <span className="text-gris-mid">—</span>}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono">
                          {f.odometro != null ? `${f.odometro.toLocaleString('es-AR')} km` : <span className="text-gris-mid">—</span>}
                        </td>
                        <td className="px-2 py-1.5">
                          {f.error ? (
                            <span className="text-rojo font-semibold">✕ {f.error}</span>
                          ) : est?.estado === 'error' ? (
                            <span className="text-rojo font-semibold">✕ {textoDeCodigo(est)}</span>
                          ) : est?.estado === 'duplicado' ? (
                            <span className="text-carbon font-semibold">↺ Ya estaba cargado</span>
                          ) : est?.estado === 'ok' ? (
                            <span className="text-verde font-semibold">
                              ✓ {finalizado ? 'Importado' : 'Lista'}
                              {(est.warnings?.length ?? 0) > 0 && (
                                <span
                                  className="text-amarillo ml-1"
                                  title={est.warnings!.map(w => AVISOS[w.code] ?? w.code).join(' · ')}
                                >
                                  ⚠
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="text-gris-dark">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
