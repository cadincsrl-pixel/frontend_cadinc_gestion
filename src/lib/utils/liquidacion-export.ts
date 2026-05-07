import * as XLSX from 'xlsx'
import type { Tramo, Adelanto, Ruta } from '@/types/domain.types'

function fmtM(n: number) {
  return '$' + n.toLocaleString('es-AR', { maximumFractionDigits: 0 })
}
function fmtF(s: string) {
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}
function kmTramo(t: Tramo, rutas: Ruta[]): number {
  if (!t.cantera_id || !t.deposito_id) return 0
  const r = rutas.find(r =>
    (r.cantera_id === t.cantera_id && r.deposito_id === t.deposito_id) ||
    (r.cantera_id === t.deposito_id && r.deposito_id === t.cantera_id)
  )
  return r?.km_ida_vuelta ?? 0
}

export interface LiqExportGasto {
  fecha:       string
  categoria:   string
  proveedor:   string | null
  descripcion: string | null
  monto:       number
}

export interface LiqExportData {
  nombreChofer: string
  desde:        string
  hasta:        string
  dias:         number
  basico_dia:   number
  subtotal_bas: number
  km_totales:   number
  subtotal_km:  number
  descuentos:   number
  // Reintegros = gastos del chofer que la empresa le devuelve.
  reintegros?:  number
  neto:         number
  tramos:       Tramo[]
  adelantos:    Adelanto[]
  // Gastos pagados por el chofer en el período (reintegros).
  gastos?:      LiqExportGasto[]
  canteras:     { id: number; nombre: string }[]
  depositos:    { id: number; nombre: string }[]
  rutas:        Ruta[]
  estado?:      string
}

// ── Excel ──────────────────────────────────────────────
export function exportLiquidacionExcel(d: LiqExportData) {
  const filaTramos = d.tramos.map(t => {
    const cantera  = d.canteras.find(c => c.id === t.cantera_id)
    const deposito = d.depositos.find(x => x.id === t.deposito_id)
    const fecha    = t.fecha_carga ?? t.fecha_vacio ?? ''
    return [
      fecha ? fmtF(fecha) : '—',
      cantera?.nombre  ?? '—',
      deposito?.nombre ?? '—',
      kmTramo(t, d.rutas) || '',
      t.toneladas_carga ?? '',
      t.remito_carga    ?? '',
    ]
  })

  const filaAdelantos = d.adelantos.map(a => [
    fmtF(a.fecha), a.descripcion || 'Adelanto', a.monto,
  ])

  const rows: any[][] = [
    [`LIQUIDACIÓN — ${d.nombreChofer}`],
    [`Período: ${fmtF(d.desde)} al ${fmtF(d.hasta)}`],
    [`Estado: ${d.estado ?? 'En curso'}`],
    [],
    ['── TRAMOS ──'],
    ['Fecha', 'Cantera', 'Depósito', 'Km', 'Toneladas', 'Remito'],
    ...filaTramos,
    [],
    ['── RESUMEN ──'],
    ['Días trabajados', d.dias],
    ['Básico/día ($)', d.basico_dia],
    ['Subtotal básico ($)', d.subtotal_bas],
    ...(d.km_totales > 0 ? [
      ['Km recorridos', d.km_totales],
      ['Subtotal km ($)', d.subtotal_km],
    ] : []),
    ['Total haberes ($)', d.subtotal_bas + d.subtotal_km],
    ...(filaAdelantos.length > 0 ? [
      [],
      ['── ADELANTOS ──'],
      ['Fecha', 'Descripción', 'Monto ($)'],
      ...filaAdelantos,
      ['Total adelantos ($)', '', d.descuentos],
    ] : []),
    ...(d.gastos && d.gastos.length > 0 ? [
      [],
      ['── GASTOS DEL CHOFER (reintegros) ──'],
      ['Fecha', 'Categoría', 'Proveedor', 'Descripción', 'Monto ($)'],
      ...d.gastos.map(g => [
        fmtF(g.fecha),
        g.categoria,
        g.proveedor ?? '—',
        g.descripcion ?? '—',
        g.monto,
      ]),
      ['Total reintegros ($)', '', '', '', d.reintegros ?? 0],
    ] : []),
    [],
    ['TOTAL NETO ($)', d.neto],
  ]

  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [{ wch: 26 }, { wch: 22 }, { wch: 18 }, { wch: 10 }, { wch: 12 }, { wch: 16 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Liquidación')
  XLSX.writeFile(wb, `liquidacion_${d.nombreChofer.replace(/\s+/g, '_')}_${d.desde}.xlsx`)
}
