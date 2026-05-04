'use client'

import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { Modal }  from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { useCreateGasto, type GastoCategoria } from '../hooks/useLogistica'

interface Chofer { id: number; nombre: string; camion_id?: number | null }
interface Camion { id: number; patente: string }

interface Props {
  open:        boolean
  onClose:     () => void
  categorias:  GastoCategoria[]
  choferes:    Chofer[]
  camiones:    Camion[]
}

interface Fila {
  fecha:            string              // YYYY-MM-DD
  categoria_id:     number | null
  categoria_texto:  string
  monto:            number
  camion_id:        number | null
  camion_texto:     string
  chofer_id:        number | null
  chofer_texto:     string
  proveedor:        string
  metodo_pago:      string
  pagado_por:       string
  comprobante_nro:  string
  descripcion:      string
  // Combustible (sólo si categoría = combustible).
  litros:           number | null
  odometro:         number | null
  tipo_combustible: TipoCombustible
  tanque_lleno:     boolean
  error:            string | null
}

type TipoCombustible = 'gasoil' | 'nafta' | 'nafta_super' | 'adblue'

const COLS = [
  'Fecha', 'Categoría', 'Monto', 'Chofer', 'Camión',
  'Proveedor', 'Método pago', 'Pagó', 'Nº Comprobante', 'Descripción',
  'Litros', 'Odómetro', 'Tipo combustible', 'Tanque lleno',
]

const METODOS_VALIDOS = ['efectivo', 'transferencia', 'tarjeta', 'cheque', 'cta_cte', 'otro'] as const
const PAGADORES_VALIDOS = ['empresa', 'chofer'] as const
const TIPOS_COMBUSTIBLE: readonly TipoCombustible[] = ['gasoil', 'nafta', 'nafta_super', 'adblue']

// Parsea "sí/si/x/true/1" → true; "no/false/0" → false; vacío → null (default true).
function parseSiNo(v: any): boolean | null {
  if (v == null || v === '') return null
  const s = String(v).trim().toLowerCase()
  if (['si', 'sí', 'x', 'true', '1', 'yes'].includes(s)) return true
  if (['no', 'false', '0'].includes(s))                  return false
  return null
}

// Parsea un número aceptando "1.234,56" o "1234.56" o "1234".
function parseNum(v: any): number | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v).replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '')
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

// Genera la plantilla con dropdowns nativos de Excel referenciando una hoja
// "Listas" oculta-friendly. Se usa exceljs (no xlsx) porque la community
// edition de xlsx no escribe data validations.
async function descargarPlantillaConValidacion(args: {
  choferes:   Chofer[]
  camiones:   Camion[]
  categorias: GastoCategoria[]
}) {
  // Code-split: exceljs (~700KB) sólo se baja cuando el user pide la plantilla.
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()

  // ── Hoja "Listas" — fuente de los dropdowns ──
  const wsListas = wb.addWorksheet('Listas')
  wsListas.addRow(['Choferes', 'Camiones', 'Categorías', 'Métodos pago', 'Pagó', 'Tipo combustible', 'Tanque lleno'])
  wsListas.getRow(1).font = { bold: true }

  const choferesOrd   = args.choferes.slice().sort((a, b) => a.nombre.localeCompare(b.nombre))
  const camionesOrd   = args.camiones.slice().sort((a, b) => a.patente.localeCompare(b.patente))
  const categoriasOrd = args.categorias.filter(c => c.activo).sort((a, b) => a.orden - b.orden)
  const sino = ['sí', 'no']

  const maxRows = Math.max(
    choferesOrd.length, camionesOrd.length, categoriasOrd.length,
    METODOS_VALIDOS.length, PAGADORES_VALIDOS.length,
    TIPOS_COMBUSTIBLE.length, sino.length,
  )
  for (let i = 0; i < maxRows; i++) {
    wsListas.addRow([
      choferesOrd[i]?.nombre   ?? '',
      camionesOrd[i]?.patente  ?? '',
      categoriasOrd[i]?.codigo ?? '',
      METODOS_VALIDOS[i]       ?? '',
      PAGADORES_VALIDOS[i]     ?? '',
      TIPOS_COMBUSTIBLE[i]     ?? '',
      sino[i]                  ?? '',
    ])
  }
  wsListas.columns.forEach(c => { c.width = 22 })

  // ── Hoja "Gastos" — la que el user llena ──
  const wsGastos = wb.addWorksheet('Gastos')
  wsGastos.addRow(COLS)
  wsGastos.getRow(1).font = { bold: true }

  // Filas demo (mismo contenido que antes).
  wsGastos.addRow(['22/04/2026', 'combustible',   15000, choferesOrd[0]?.nombre  ?? 'López, Juan', camionesOrd[0]?.patente ?? 'AE-123-XY', 'YPF Ruta 6',         'efectivo',      'chofer',  '000123-04', 'Carga 150L',   150, 185420, 'gasoil', 'sí'])
  wsGastos.addRow(['22/04/2026', 'peaje',           800, choferesOrd[0]?.nombre  ?? 'López, Juan', camionesOrd[0]?.patente ?? 'AE-123-XY', 'Autop. Panamericana','efectivo',      'chofer',  '',          '',             '', '',     '',       ''])
  wsGastos.addRow(['22/04/2026', 'mantenimiento', 48000, '',                                       camionesOrd[1]?.patente ?? 'AE-456-ZZ', 'Taller Martínez',    'transferencia', 'empresa', 'A-0001-12', 'Cambio aceite','', '',     '',       ''])

  wsGastos.columns = COLS.map((_, i) => ({ width: i === 5 || i === 9 ? 28 : 16 }))

  // Helper para construir el rango de la hoja Listas (filas 2..N).
  const rangoListas = (col: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G', n: number) =>
    `Listas!$${col}$2:$${col}$${1 + Math.max(n, 1)}`

  // Aplica data validation a las filas 2..LAST_ROW de cada columna.
  // 1000 filas es suficiente para imports masivos; aumentar si hace falta.
  // Cast a any: exceljs expone `dataValidations` en runtime pero los .d.ts
  // del paquete no lo declaran (líneas 987 del index.d.ts está comentado).
  const LAST_ROW = 1000
  const dvBag = (wsGastos as any).dataValidations
  const dv = (col: string, listRange: string, allowBlank = true) => {
    dvBag.add(`${col}2:${col}${LAST_ROW}`, {
      type:      'list',
      allowBlank,
      formulae:  [listRange],
      showErrorMessage: true,
      errorStyle: 'warning',
      errorTitle: 'Valor no válido',
      error:     'Elegí un valor de la lista (o escribí uno que matchee).',
    })
  }

  dv('B', rangoListas('C', categoriasOrd.length), false)        // Categoría
  dv('D', rangoListas('A', choferesOrd.length))                 // Chofer
  dv('E', rangoListas('B', camionesOrd.length))                 // Camión
  dv('G', rangoListas('D', METODOS_VALIDOS.length))             // Método pago
  dv('H', rangoListas('E', PAGADORES_VALIDOS.length))           // Pagó
  dv('M', rangoListas('F', TIPOS_COMBUSTIBLE.length))           // Tipo combustible
  dv('N', rangoListas('G', sino.length))                        // Tanque lleno

  // Descarga vía Blob (no usamos writeFile que es solo para Node).
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'Plantilla_Gastos.xlsx'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function parseFecha(v: any): string | null {
  if (v == null || v === '') return null
  // Número serial de Excel
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v)
    if (!d) return null
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  const s = String(v).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) {
    const d = m[1]!.padStart(2, '0')
    const mo = m[2]!.padStart(2, '0')
    return `${m[3]}-${mo}-${d}`
  }
  return null
}

function norm(s: string): string {
  return s.trim().toLowerCase()
}

export function ModalImportarGastos({ open, onClose, categorias, choferes, camiones }: Props) {
  const toast = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const { mutateAsync: crear } = useCreateGasto()

  const [filas,     setFilas]     = useState<Fila[] | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [resultado, setResultado] = useState<{ creados: number; errores: number } | null>(null)

  function parsear(file: File) {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const wb   = XLSX.read(e.target!.result, { type: 'array', cellDates: false })
        const ws   = wb.Sheets[wb.SheetNames[0]!]!
        const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' }) as any[][]

        // Localizar fila de encabezados (buscar "Fecha" en la primera col que lo tenga).
        const headerIdx = rows.findIndex(r =>
          r.some(c => norm(String(c)) === 'fecha'),
        )
        if (headerIdx === -1) {
          toast('No se encontró la columna "Fecha". Usá la plantilla.', 'err')
          return
        }

        const headers = rows[headerIdx]!.map((c: any) => norm(String(c)))
        const col = (name: string) => headers.indexOf(norm(name))

        const iFecha   = col('fecha')
        const iCat     = col('categoría') >= 0 ? col('categoría') : col('categoria')
        const iMonto   = col('monto')
        const iChofer  = col('chofer')
        const iCamion  = col('camión') >= 0 ? col('camión') : col('camion')
        const iProv    = col('proveedor')
        const iMetodo  = col('método pago') >= 0 ? col('método pago') : col('metodo pago')
        const iPago    = col('pagó') >= 0 ? col('pagó') : col('pago')
        const iNroComp = col('nº comprobante') >= 0 ? col('nº comprobante') : col('n° comprobante') >= 0 ? col('n° comprobante') : col('comprobante')
        const iDesc    = col('descripción') >= 0 ? col('descripción') : col('descripcion')
        const iLitros  = col('litros')
        const iOdo     = col('odómetro') >= 0 ? col('odómetro') : col('odometro')
        const iTipoComb = col('tipo combustible')
        const iTanque  = col('tanque lleno')

        const dataRows = rows.slice(headerIdx + 1).filter(r =>
          // Fila no vacía: algún campo tiene valor
          r.some((c: any) => String(c ?? '').trim() !== ''),
        )

        const parsed: Fila[] = dataRows.map(r => {
          const fechaRaw = iFecha >= 0 ? r[iFecha] : ''
          const fecha    = parseFecha(fechaRaw)

          const catTexto = iCat    >= 0 ? String(r[iCat]   ?? '').trim() : ''
          const catObj   = categorias.find(c =>
            norm(c.codigo) === norm(catTexto) || norm(c.nombre) === norm(catTexto),
          )

          const montoRaw = iMonto  >= 0 ? r[iMonto] : ''
          const monto    = typeof montoRaw === 'number' ? montoRaw : Number(String(montoRaw).replace(/[^\d.-]/g, ''))

          const choferTexto = iChofer >= 0 ? String(r[iChofer] ?? '').trim() : ''
          const choferObj   = choferTexto
            ? choferes.find(c => norm(c.nombre) === norm(choferTexto) || norm(c.nombre).includes(norm(choferTexto)))
            : null

          const camionTexto = iCamion >= 0 ? String(r[iCamion] ?? '').trim() : ''
          const camionObj   = camionTexto
            ? camiones.find(c => norm(c.patente) === norm(camionTexto) || norm(c.patente).replace(/[^a-z0-9]/gi, '') === norm(camionTexto).replace(/[^a-z0-9]/gi, ''))
            : null

          const metodo = iMetodo >= 0 ? norm(String(r[iMetodo] ?? '')) : 'efectivo'
          const pago   = iPago   >= 0 ? norm(String(r[iPago]   ?? '')) : 'empresa'

          // Combustible — sólo lee/valida si la categoría matchea.
          const esCombustible = catObj?.codigo === 'combustible'
          const litros   = iLitros >= 0 ? parseNum(r[iLitros]) : null
          const odometro = iOdo    >= 0 ? parseNum(r[iOdo])    : null
          const tipoCombText = iTipoComb >= 0 ? norm(String(r[iTipoComb] ?? '')) : ''
          const tipoCombustible: TipoCombustible = TIPOS_COMBUSTIBLE.includes(tipoCombText as TipoCombustible)
            ? tipoCombText as TipoCombustible
            : 'gasoil'
          const tanqueParsed = iTanque >= 0 ? parseSiNo(r[iTanque]) : null
          const tanqueLleno = tanqueParsed ?? true

          let error: string | null = null
          if (!fecha)                 error = 'Fecha inválida (usar DD/MM/AAAA o AAAA-MM-DD)'
          else if (!catTexto)         error = 'Categoría vacía'
          else if (!catObj)           error = `Categoría "${catTexto}" no encontrada`
          else if (!monto || monto <= 0) error = 'Monto inválido'
          else if (!choferObj && !camionObj) error = 'Debe indicar al menos chofer o camión'
          else if (choferTexto && !choferObj) error = `Chofer "${choferTexto}" no encontrado`
          else if (camionTexto && !camionObj) error = `Camión "${camionTexto}" no encontrado`
          else if (!METODOS_VALIDOS.includes(metodo as any))   error = `Método pago "${metodo}" inválido`
          else if (!PAGADORES_VALIDOS.includes(pago as any))   error = `Pagó "${pago}" inválido (empresa|chofer)`
          // Reglas específicas de combustible:
          else if (esCombustible && !camionObj)               error = 'Combustible requiere camión'
          else if (esCombustible && (litros == null || litros <= 0))     error = 'Combustible requiere Litros (>0)'
          else if (esCombustible && (odometro == null || odometro <= 0)) error = 'Combustible requiere Odómetro (>0)'
          else if (iTipoComb >= 0 && tipoCombText && !TIPOS_COMBUSTIBLE.includes(tipoCombText as TipoCombustible)) {
            error = `Tipo combustible "${tipoCombText}" inválido (${TIPOS_COMBUSTIBLE.join('|')})`
          }
          else if (iTanque >= 0 && String(r[iTanque] ?? '').trim() !== '' && tanqueParsed === null) {
            error = `Tanque lleno "${r[iTanque]}" inválido (sí|no)`
          }

          return {
            fecha:            fecha ?? '',
            categoria_id:     catObj?.id ?? null,
            categoria_texto:  catTexto,
            monto:            Number.isFinite(monto) ? monto : 0,
            camion_id:        camionObj?.id ?? null,
            camion_texto:     camionTexto,
            chofer_id:        choferObj?.id ?? null,
            chofer_texto:     choferTexto,
            proveedor:        iProv    >= 0 ? String(r[iProv]    ?? '').trim() : '',
            metodo_pago:      metodo || 'efectivo',
            pagado_por:       pago   || 'empresa',
            comprobante_nro:  iNroComp >= 0 ? String(r[iNroComp] ?? '').trim() : '',
            descripcion:      iDesc    >= 0 ? String(r[iDesc]    ?? '').trim() : '',
            litros:           esCombustible ? litros   : null,
            odometro:         esCombustible ? odometro : null,
            tipo_combustible: tipoCombustible,
            tanque_lleno:     tanqueLleno,
            error,
          }
        })

        setFilas(parsed)
        setResultado(null)
      } catch (err) {
        console.error('[import-gastos] parse error', err)
        toast('Error al leer el archivo', 'err')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  async function handleGuardar() {
    if (!filas) return
    const validas = filas.filter(f => !f.error)
    if (!validas.length) { toast('No hay filas válidas para importar', 'err'); return }

    setGuardando(true)
    let creados = 0, errores = 0
    for (const f of validas) {
      try {
        // Construye carga_combustible solo cuando aplique (backend valida
        // la combinación categoría=combustible ↔ presencia de carga).
        const cat = categorias.find(c => c.id === f.categoria_id)
        const esCombustible = cat?.codigo === 'combustible'
        const cargaCombustible = esCombustible
          ? {
              litros:           f.litros!,
              odometro_km:      f.odometro,
              tipo_combustible: f.tipo_combustible,
              tanque_lleno:     f.tanque_lleno,
              obs:              '',
            }
          : null

        await crear({
          categoria_id:    f.categoria_id!,
          fecha:           f.fecha,
          monto:           f.monto,
          camion_id:       f.camion_id,
          chofer_id:       f.chofer_id,
          proveedor:       f.proveedor || null,
          metodo_pago:     f.metodo_pago as any,
          pagado_por:      f.pagado_por as any,
          comprobante_nro: f.comprobante_nro,
          descripcion:     f.descripcion,
          obs:             '',
          carga_combustible: cargaCombustible,
        } as any)
        creados++
      } catch (err) {
        console.error('[import-gastos] fila fallida', f, err)
        errores++
      }
    }
    setGuardando(false)
    setResultado({ creados, errores })
  }

  function handleClose() {
    setFilas(null)
    setResultado(null)
    onClose()
  }

  const validas   = filas?.filter(f => !f.error).length ?? 0
  const conError  = filas?.filter(f => !!f.error).length ?? 0
  const totalMontoValidas = filas?.filter(f => !f.error).reduce((s, f) => s + f.monto, 0) ?? 0

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="📥 IMPORTAR GASTOS"
      width="max-w-4xl"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>Cancelar</Button>
          {!resultado && filas && validas > 0 && (
            <Button variant="primary" loading={guardando} onClick={handleGuardar}>
              ✓ Importar {validas} fila{validas !== 1 ? 's' : ''}
            </Button>
          )}
          {resultado && <Button variant="primary" onClick={handleClose}>Cerrar</Button>}
        </>
      }
    >
      <div className="flex flex-col gap-4">

        {resultado && (
          <div className="bg-verde-light border border-verde/30 rounded-xl p-4 text-center">
            <div className="text-verde font-bold text-lg">✓ Importación completada</div>
            <div className="text-sm text-carbon mt-1">
              {resultado.creados} gasto{resultado.creados !== 1 ? 's' : ''} creado{resultado.creados !== 1 ? 's' : ''}
              {resultado.errores > 0 && <> · <span className="text-rojo font-bold">{resultado.errores} fallidos</span></>}
            </div>
            <p className="text-xs text-gris-dark mt-2">
              Si sos admin, los gastos quedan aprobados automáticamente. Si no,
              entran en estado <b>pendiente</b> y otro usuario debe aprobarlos.
            </p>
          </div>
        )}

        {!resultado && (
          <>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => inputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2.5 bg-azul text-white rounded-lg font-bold text-sm hover:bg-azul/90 transition-colors"
              >
                📂 Seleccionar archivo Excel
              </button>
              <button
                onClick={() => descargarPlantillaConValidacion({ choferes, camiones, categorias })
                  .catch(err => { console.error('[plantilla] error', err); toast('Error al generar plantilla', 'err') })
                }
                className="flex items-center gap-2 px-4 py-2.5 bg-gris text-gris-dark rounded-lg font-bold text-sm hover:bg-gris-mid transition-colors"
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

            <p className="text-xs text-gris-dark">
              Columnas esperadas: <span className="font-mono">{COLS.join(', ')}</span>.
              <br />
              Categoría: usar código (<span className="font-mono">combustible</span>, <span className="font-mono">peaje</span>, etc.) o nombre de la lista.
              Método: <span className="font-mono">efectivo | transferencia | tarjeta | cheque | cta_cte | otro</span>.
              Pagó: <span className="font-mono">empresa | chofer</span>.
              Debe haber al menos chofer o camión por fila.
              <br />
              <b>Combustible</b>: <span className="font-mono">Litros</span> y <span className="font-mono">Odómetro</span> obligatorios + <span className="font-mono">Camión</span>.
              {' '}<span className="font-mono">Tipo combustible</span> opcional (default <span className="font-mono">gasoil</span>;
              valores: <span className="font-mono">{TIPOS_COMBUSTIBLE.join('|')}</span>).
              {' '}<span className="font-mono">Tanque lleno</span> opcional (<span className="font-mono">sí|no</span>, default sí).
            </p>
          </>
        )}

        {filas && !resultado && (
          <>
            <div className="flex gap-2 flex-wrap items-center">
              {validas > 0 && (
                <span className="text-xs font-bold px-3 py-1.5 rounded-lg bg-verde-light text-verde">
                  ✓ {validas} válida{validas !== 1 ? 's' : ''} · $ {totalMontoValidas.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </span>
              )}
              {conError > 0 && (
                <span className="text-xs font-bold px-3 py-1.5 rounded-lg bg-rojo-light text-rojo">
                  ✕ {conError} con error (se omiten)
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
                    <th className="px-2 py-2 text-left font-bold">Chofer</th>
                    <th className="px-2 py-2 text-left font-bold">Camión</th>
                    <th className="px-2 py-2 text-right font-bold">Litros</th>
                    <th className="px-2 py-2 text-right font-bold">Odóm.</th>
                    <th className="px-2 py-2 text-left font-bold">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f, i) => (
                    <tr key={i} className={`border-b border-gris last:border-0 ${f.error ? 'bg-rojo-light/40' : i % 2 === 0 ? 'bg-white' : 'bg-gris/30'}`}>
                      <td className="px-2 py-1.5 text-gris-dark">{i + 1}</td>
                      <td className="px-2 py-1.5 font-mono">{f.fecha || '—'}</td>
                      <td className="px-2 py-1.5">
                        {f.categoria_id
                          ? <span className="font-semibold">{categorias.find(c => c.id === f.categoria_id)?.nombre ?? f.categoria_texto}</span>
                          : <span className="text-rojo">{f.categoria_texto || '—'}</span>}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono">$ {f.monto.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                      <td className="px-2 py-1.5">
                        {f.chofer_id
                          ? choferes.find(c => c.id === f.chofer_id)?.nombre
                          : <span className={f.chofer_texto ? 'text-rojo' : 'text-gris-mid italic'}>{f.chofer_texto || '—'}</span>}
                      </td>
                      <td className="px-2 py-1.5">
                        {f.camion_id
                          ? camiones.find(c => c.id === f.camion_id)?.patente
                          : <span className={f.camion_texto ? 'text-rojo' : 'text-gris-mid italic'}>{f.camion_texto || '—'}</span>}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono">
                        {f.litros != null ? `${f.litros.toLocaleString('es-AR')} L` : <span className="text-gris-mid">—</span>}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono">
                        {f.odometro != null ? `${f.odometro.toLocaleString('es-AR')} km` : <span className="text-gris-mid">—</span>}
                      </td>
                      <td className="px-2 py-1.5">
                        {f.error
                          ? <span className="text-rojo font-semibold">✕ {f.error}</span>
                          : <span className="text-verde font-semibold">✓</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
