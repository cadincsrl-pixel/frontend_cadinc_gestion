/**
 * Exporta el listado de viajes (tramos) filtrado a un Excel.
 *
 * Nace del pedido del dueño (2026-07-30): "reporte de los viajes que se
 * hicieron en determinado período de los camiones que yo seleccione". El
 * armado de filas está separado del render (filasViajesExport es pura) para
 * poder testear el mapeo y los totales sin navegador.
 */
import ExcelJS from 'exceljs'
import { EMPRESA } from '@/lib/config/empresa'
import type { Tramo, Ruta, Chofer, Camion } from '@/types/domain.types'

// ── Fila plana del export ────────────────────────────────────────────────────
export interface FilaViaje {
  fecha:          string   // dd/mm/yyyy de la fecha de operación del tramo
  tipo:           'Cargado' | 'Vacío'
  estado:         'Completado' | 'En curso'
  chofer:         string
  camion:         string
  origen:         string
  destino:        string
  km:             number | null
  ton_carga:      number | null
  ton_descarga:   number | null
  empresa:        string
  remito_carga:   string
  remito_descarga: string
  liquidado:      string   // 'N° 24' o ''
  cobrado:        string   // 'N° 63' o ''
}

export interface ViajesExportArgs {
  tramos:    Tramo[]
  choferes:  Pick<Chofer, 'id' | 'nombre'>[]
  camiones:  Pick<Camion, 'id' | 'patente'>[]
  canteras:  { id: number; nombre: string }[]
  depositos: { id: number; nombre: string }[]
  empresas:  { id: number; nombre: string }[]
  rutas:     Pick<Ruta, 'cantera_id' | 'deposito_id' | 'km_ida_vuelta'>[]
}

function fmtFecha(iso: string | null | undefined): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

// Fecha de referencia del tramo: la del hecho (igual criterio que la pantalla).
function fechaOperacion(t: Tramo): string | null {
  return (t.tipo === 'cargado' ? (t.fecha_descarga ?? t.fecha_carga) : t.fecha_vacio) ?? null
}

export function filasViajesExport(args: ViajesExportArgs): FilaViaje[] {
  const nom = <T extends { id: number }>(xs: T[], id: number | null | undefined, key: keyof T): string =>
    id == null ? '' : String(xs.find(x => x.id === id)?.[key] ?? `#${id}`)

  return args.tramos.map(t => {
    const ruta = t.cantera_id && t.deposito_id
      ? args.rutas.find(r => r.cantera_id === t.cantera_id && r.deposito_id === t.deposito_id)
      : undefined
    return {
      fecha:           fmtFecha(fechaOperacion(t)),
      tipo:            t.tipo === 'cargado' ? 'Cargado' : 'Vacío',
      estado:          t.estado === 'completado' ? 'Completado' : 'En curso',
      chofer:          nom(args.choferes as { id: number; nombre: string }[], t.chofer_id, 'nombre'),
      camion:          nom(args.camiones as { id: number; patente: string }[], t.camion_id, 'patente'),
      origen:          nom(args.canteras, t.cantera_id, 'nombre'),
      destino:         nom(args.depositos, t.deposito_id, 'nombre'),
      km:              ruta?.km_ida_vuelta ?? null,
      ton_carga:       t.toneladas_carga != null ? Number(t.toneladas_carga) : null,
      ton_descarga:    t.toneladas_descarga != null ? Number(t.toneladas_descarga) : null,
      empresa:         nom(args.empresas, t.empresa_id, 'nombre'),
      remito_carga:    t.remito_carga ?? '',
      remito_descarga: t.remito_descarga ?? '',
      liquidado:       t.liquidacion_id != null ? `N° ${t.liquidacion_id}` : '',
      cobrado:         t.cobro_id != null ? `N° ${t.cobro_id}` : '',
    }
  })
}

export function totalesViajes(filas: FilaViaje[]) {
  return {
    viajes_cargados: filas.filter(f => f.tipo === 'Cargado').length,
    tramos_vacios:   filas.filter(f => f.tipo === 'Vacío').length,
    // Toneladas: descarga con fallback a carga — el mismo criterio que los
    // reportes (lo que paga el cliente es lo descargado).
    toneladas: filas.reduce((s, f) => s + (f.ton_descarga ?? f.ton_carga ?? 0), 0),
    km:        filas.reduce((s, f) => s + (f.km ?? 0), 0),
  }
}

// ── Render del workbook ──────────────────────────────────────────────────────
const C_AZUL = 'FF1F3A66'

export async function exportViajesExcel(
  args: ViajesExportArgs & { desde?: string; hasta?: string; camionesSel?: string[] },
): Promise<void> {
  const filas = filasViajesExport(args)
  const tot   = totalesViajes(filas)

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Viajes')

  // Encabezado con el contexto del filtro: sin esto, el Excel que circula por
  // WhatsApp no dice de qué período ni de qué camiones es.
  ws.addRow([`${EMPRESA.nombre} — Reporte de viajes`]).font = { bold: true, size: 14 }
  const rango = args.desde || args.hasta
    ? `Período: ${args.desde ? fmtFecha(args.desde) : '…'} → ${args.hasta ? fmtFecha(args.hasta) : 'hoy'}`
    : 'Período: todos los viajes cargados'
  ws.addRow([rango])
  ws.addRow([`Camiones: ${args.camionesSel?.length ? args.camionesSel.join(', ') : 'todos'}`])
  ws.addRow([`${tot.viajes_cargados} viajes cargados · ${tot.tramos_vacios} vacíos · ${Math.round(tot.toneladas).toLocaleString('es-AR')} t · ${Math.round(tot.km).toLocaleString('es-AR')} km`])
  ws.addRow([])

  const header = ws.addRow([
    'Fecha', 'Tipo', 'Estado', 'Chofer', 'Camión', 'Origen', 'Destino',
    'Km', 'Ton carga', 'Ton descarga', 'Empresa', 'Remito carga', 'Remito descarga',
    'Liquidación', 'Cobro',
  ])
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  header.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_AZUL } } })

  for (const f of filas) {
    ws.addRow([
      f.fecha, f.tipo, f.estado, f.chofer, f.camion, f.origen, f.destino,
      f.km ?? '', f.ton_carga ?? '', f.ton_descarga ?? '', f.empresa,
      f.remito_carga, f.remito_descarga, f.liquidado, f.cobrado,
    ])
  }

  ws.columns.forEach((col, i) => { col.width = [11, 9, 11, 26, 10, 18, 18, 7, 10, 12, 20, 13, 15, 11, 9][i] ?? 12 })

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const sufijo = args.desde && args.hasta ? `${args.desde}_a_${args.hasta}` : new Date().toISOString().slice(0, 10)
  a.download = `Viajes_${sufijo}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}
