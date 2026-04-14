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
  neto:         number
  tramos:       Tramo[]
  adelantos:    Adelanto[]
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
    [],
    ['TOTAL NETO ($)', d.neto],
  ]

  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [{ wch: 26 }, { wch: 22 }, { wch: 18 }, { wch: 10 }, { wch: 12 }, { wch: 16 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Liquidación')
  XLSX.writeFile(wb, `liquidacion_${d.nombreChofer.replace(/\s+/g, '_')}_${d.desde}.xlsx`)
}

// ── PDF (window.print) ─────────────────────────────────
export function exportLiquidacionPDF(d: LiqExportData) {
  const tramosRows = d.tramos.map(t => {
    const cantera  = d.canteras.find(c => c.id === t.cantera_id)
    const deposito = d.depositos.find(x => x.id === t.deposito_id)
    const fecha    = t.fecha_carga ?? t.fecha_vacio ?? ''
    const km       = kmTramo(t, d.rutas)
    return `<tr>
      <td>${fecha ? fmtF(fecha) : '—'}</td>
      <td>${cantera?.nombre ?? '—'}</td>
      <td>${deposito?.nombre ?? '—'}</td>
      <td class="r">${km || '—'}</td>
      <td class="r">${t.toneladas_carga ?? '—'}</td>
      <td>${t.remito_carga ?? '—'}</td>
    </tr>`
  }).join('')

  const adelantosSection = d.adelantos.length > 0 ? `
    <h2>ADELANTOS DESCONTADOS</h2>
    <table>
      <thead><tr><th>Fecha</th><th>Descripción</th><th class="r">Monto</th></tr></thead>
      <tbody>
        ${d.adelantos.map(a => `<tr>
          <td>${fmtF(a.fecha)}</td>
          <td>${a.descripcion || 'Adelanto'}</td>
          <td class="r">${fmtM(a.monto)}</td>
        </tr>`).join('')}
      </tbody>
    </table>` : ''

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Liquidación ${d.nombreChofer}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 11px; margin: 20px 28px; color: #111; }
    h1 { font-size: 16px; margin: 0 0 2px; }
    h2 { font-size: 11px; font-weight: bold; margin: 14px 0 5px; border-bottom: 1.5px solid #1a3a5c; padding-bottom: 2px; text-transform: uppercase; letter-spacing: .05em; color: #1a3a5c; }
    .meta { font-size: 11px; color: #555; margin-bottom: 14px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
    th { background: #1a3a5c; color: #fff; text-align: left; padding: 4px 7px; font-size: 10px; font-weight: bold; }
    td { padding: 3px 7px; border-bottom: 1px solid #eee; }
    .r { text-align: right; }
    .resumen { width: 280px; margin-left: auto; margin-top: 6px; }
    .row { display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px solid #f0f0f0; font-size: 11px; }
    .row.total { font-weight: bold; font-size: 13px; border-top: 1.5px solid #111; border-bottom: none; margin-top: 4px; padding-top: 6px; }
    .lbl { color: #555; }
    .neg { color: #b00; }
    .pos { color: #1a7a4a; }
    @media print { @page { margin: 15mm; } }
  </style>
</head>
<body>
  <h1>LIQUIDACIÓN — ${d.nombreChofer.toUpperCase()}</h1>
  <div class="meta">
    Período: ${fmtF(d.desde)} al ${fmtF(d.hasta)} &nbsp;·&nbsp;
    ${d.dias} días &nbsp;·&nbsp;
    Estado: <b>${d.estado ?? 'En curso'}</b>
  </div>

  <h2>Tramos realizados (${d.tramos.length})</h2>
  <table>
    <thead><tr><th>Fecha</th><th>Cantera</th><th>Depósito</th><th class="r">Km</th><th class="r">Toneladas</th><th>Remito</th></tr></thead>
    <tbody>${tramosRows || '<tr><td colspan="6" style="color:#999;font-style:italic">Sin tramos registrados</td></tr>'}</tbody>
  </table>

  ${adelantosSection}

  <h2>Resumen</h2>
  <div class="resumen">
    <div class="row"><span class="lbl">Días trabajados</span><span>${d.dias} días</span></div>
    <div class="row"><span class="lbl">Básico/día</span><span>${fmtM(d.basico_dia)}</span></div>
    <div class="row"><span class="lbl">Subtotal básico</span><span>${fmtM(d.subtotal_bas)}</span></div>
    ${d.km_totales > 0 ? `
    <div class="row"><span class="lbl">Km recorridos</span><span>${d.km_totales.toLocaleString('es-AR')} km</span></div>
    <div class="row"><span class="lbl">Subtotal km</span><span>${fmtM(d.subtotal_km)}</span></div>
    ` : ''}
    ${d.descuentos > 0 ? `
    <div class="row"><span class="lbl">Adelantos descontados</span><span class="neg">− ${fmtM(d.descuentos)}</span></div>
    ` : ''}
    <div class="row total"><span>TOTAL NETO</span><span class="pos">${fmtM(d.neto)}</span></div>
  </div>
  <script>window.onload = function() { window.print() }</script>
</body>
</html>`

  const win = window.open('', '_blank')
  if (win) { win.document.write(html); win.document.close() }
}
