import * as XLSX from 'xlsx'
import type { Obra, Certificacion, Contratista, Categoria, Personal, Hora, Tarifa, Prestamo, TarjaHsExtra } from '@/types/domain.types'
import { getSemDays, toISO, getSemLabel, getViernesCobro, getViernes, DIAS } from './dates'
import { totalHsLeg, getHsExtrasLeg, getVHConCatObra, getVHGlobalEnFecha } from './costos'
import { calcularResumenSemana } from './resumen-semana'

// ══════════════════════════════════════════════════
// EXPORT TARJA — planilla por obra y semana
// ══════════════════════════════════════════════════
// Si sinHoras=true, deja celdas vacías (plantilla para cargar en Excel y
// después importar). Si false (default), exporta con las horas actuales.
export function exportarTarjaExcel(
  obraCod: string,
  obraNom: string,
  semActual: Date,
  personal: Personal[],
  categorias: Categoria[],
  horas: Hora[],
  tarifas: Tarifa[],
  opts: { sinHoras?: boolean; prestamos?: Prestamo[] } = {},
) {
  const { sinHoras = false, prestamos = [] } = opts
  const wb = XLSX.utils.book_new()
  const days = getSemDays(semActual)
  const semKey = toISO(getViernes(semActual))

  const fechaRow = ['', '', '', ...days.map(d => toISO(d)), '']
  const headerRow = [
    'Legajo', 'Apellido y Nombre', 'Categoría',
    ...days.map((d, i) => `${DIAS[i]} ${d.getDate()}/${d.getMonth() + 1}`),
    'TOTAL HORAS',
  ]

  const dataRows = personal.map(p => {
    const cat = categorias.find(c => c.id === p.cat_id)
    const hsDia = days.map(d => {
      if (sinHoras) return ''
      const h = horas.find(x => x.obra_cod === obraCod && x.leg === p.leg && x.fecha === toISO(d))
      return h?.horas ?? ''
    })
    const totHs = hsDia.reduce<number>((s, h) => s + (Number(h) || 0), 0)
    return [p.leg, p.nom, cat?.nom ?? '—', ...hsDia, totHs || '']
  })

  const titulo = sinHoras
    ? `TARJA — PLANTILLA — ${obraNom} (${obraCod}) — ${getSemLabel(semActual)}`
    : `TARJA — ${obraNom} (${obraCod}) — ${getSemLabel(semActual)}`
  const instruccion = sinHoras
    ? 'PLANTILLA: completá las horas por día en cada celda. No modificar columnas A, B, C ni la fila 3 (fechas). Guardar y luego usar "Importar" en la aplicación.'
    : 'Completá las horas por día. No modificar columnas A, B, C ni la fila 3 (fechas).'

  const rows = [
    [titulo],
    [instruccion],
    fechaRow,
    headerRow,
    ...dataRows,
  ]

  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [
    { wch: 8 }, { wch: 28 }, { wch: 22 },
    ...days.map(() => ({ wch: 9 })),
    { wch: 13 },
  ]
  XLSX.utils.book_append_sheet(wb, ws, 'Tarja')

  const refRows = [
    ['REFERENCIA — no modificar esta hoja'],
    [],
    ['Categoría', 'Valor hora ($)'],
    ...categorias.map(c => [c.nom, c.vh]),
  ]
  const ws2 = XLSX.utils.aoa_to_sheet(refRows)
  ws2['!cols'] = [{ wch: 26 }, { wch: 14 }]
  XLSX.utils.book_append_sheet(wb, ws2, 'Referencia')

  // Hoja "Préstamos": solo movs de la semana del export. Se omite cuando es
  // plantilla (sinHoras) porque la plantilla se reimporta y no debe arrastrar
  // info administrativa.
  if (!sinHoras) {
    const prestamosSemana = prestamos
      .filter(p => p.sem_key === semKey)
      .map(p => {
        const nom = personal.find(per => per.leg === p.leg)?.nom ?? '—'
        const tipo = p.tipo === 'otorgado' ? 'Otorgado' : 'Descontado'
        const fecha = p.created_at ? p.created_at.slice(0, 10) : ''
        return [p.leg, nom, tipo, p.monto, p.concepto ?? '', fecha]
      })

    const prestamosRows: (string | number)[][] = [
      [`PRÉSTAMOS — ${obraNom} (${obraCod}) — ${getSemLabel(semActual)}`],
      [],
      ['Legajo', 'Apellido y Nombre', 'Tipo', 'Monto', 'Concepto', 'Fecha'],
      ...(prestamosSemana.length
        ? prestamosSemana
        : [['—', 'Sin movimientos de préstamos en esta semana', '', '', '', '']]),
    ]
    const ws3 = XLSX.utils.aoa_to_sheet(prestamosRows)
    ws3['!cols'] = [
      { wch: 8 }, { wch: 28 }, { wch: 12 }, { wch: 12 }, { wch: 30 }, { wch: 12 },
    ]
    XLSX.utils.book_append_sheet(wb, ws3, 'Préstamos')
  }

  const prefijo = sinHoras ? 'Tarja_Plantilla' : 'Tarja'
  XLSX.writeFile(wb, `${prefijo}_${obraCod}_${toISO(semActual)}.xlsx`)
}

// ══════════════════════════════════════════════════
// IMPORT TARJA — desde planilla Excel
// ══════════════════════════════════════════════════
export function importarTarjaExcel(
  file: File,
  obraCod: string,
  personal: Personal[],
  onResult: (horas: Array<{ leg: string; fecha: string; horas: number }>) => void,
  onError: (msg: string) => void
) {
  const reader = new FileReader()
  reader.onload = e => {
    try {
      const wb = XLSX.read(e.target!.result, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]!]!
      const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' })

      if (rows.length < 5) { onError('El archivo no tiene el formato correcto'); return }

      const fechaRow = rows[2] as string[]
      const dataRows = (rows.slice(4) as any[][]).filter(r => r[0] || r[1])

      const fechaCols: Array<{ col: number; fecha: string }> = []
      for (let c = 3; c < fechaRow.length - 1; c++) {
        const f = String(fechaRow[c] ?? '').trim()
        if (f && /^\d{4}-\d{2}-\d{2}$/.test(f)) fechaCols.push({ col: c, fecha: f })
      }

      if (!fechaCols.length) { onError('No se encontraron fechas válidas en la fila 3'); return }

      const resultado: Array<{ leg: string; fecha: string; horas: number }> = []
      dataRows.forEach(row => {
        const leg = String(row[0] ?? '').trim()
        if (!leg || !personal.some(p => p.leg === leg)) return
        fechaCols.forEach(({ col, fecha }) => {
          const val = parseFloat(String(row[col] ?? ''))
          if (!isNaN(val) && val >= 0 && val <= 24) resultado.push({ leg, fecha, horas: val })
        })
      })

      if (!resultado.length) { onError('No se encontraron datos válidos en el archivo'); return }
      onResult(resultado)
    } catch {
      onError('Error al leer el archivo Excel')
    }
  }
  reader.readAsArrayBuffer(file)
}

// ══════════════════════════════════════════════════
// CSV TARJA
// ══════════════════════════════════════════════════
export function exportarCSVTarja(
  obraCod: string,
  obraNom: string,
  semActual: Date,
  personal: Personal[],
  categorias: Categoria[],
  horas: Hora[],
  tarifas: Tarifa[]
) {
  const days = getSemDays(semActual)

  let csv = `TARJA - ${obraNom} - ${getSemLabel(semActual)}\n`
  csv += `Legajo,Nombre,Categoría,Valor Hora,${days.map((d, i) => DIAS[i] + ' ' + d.getDate()).join(',')},Total Hs,Costo\n`

  personal.forEach(p => {
    const cat = categorias.find(c => c.id === p.cat_id)
    const vh = tarifas
      .filter(t => t.obra_cod === obraCod && t.cat_id === p.cat_id && t.desde <= toISO(semActual))
      .sort((a, b) => b.desde.localeCompare(a.desde))[0]?.vh ?? getVHGlobalEnFecha(cat, toISO(semActual))

    let totalHs = 0, totalCosto = 0
    const hsDia = days.map(d => {
      const h = horas.find(x => x.obra_cod === obraCod && x.leg === p.leg && x.fecha === toISO(d))
      const val = h?.horas ?? 0
      totalHs += val
      totalCosto += val * vh
      return val || ''
    })

    csv += `${p.leg},"${p.nom}","${cat?.nom ?? '—'}",${vh},${hsDia.join(',')},${totalHs || ''},${Math.round(totalCosto / 1000) * 1000}\n`
  })

  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Tarja_${obraCod}_${toISO(semActual)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function exportarCSVResumenObras(
  obras: Obra[],
  horas: Hora[]
) {
  let csv = 'Codigo,Obra,Centro de Costo,Direccion,Responsable,Trabajadores,Horas Totales,Ultima Actividad\n'

  obras.forEach((obra) => {
    const horasObra = horas.filter((hora) => hora.obra_cod === obra.cod)
    const trabajadores = new Set(horasObra.map((hora) => hora.leg)).size
    const totalHs = horasObra.reduce((sum, hora) => sum + hora.horas, 0)
    const ultimaActividad = horasObra.length
      ? horasObra.reduce((max, hora) => (hora.fecha > max ? hora.fecha : max), horasObra[0]!.fecha)
      : ''

    csv += [
      obra.cod,
      `"${obra.nom}"`,
      `"${obra.cc ?? ''}"`,
      `"${obra.dir ?? ''}"`,
      `"${obra.resp ?? ''}"`,
      trabajadores,
      totalHs,
      ultimaActividad,
    ].join(',') + '\n'
  })

  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'Tarja_Resumen_Obras.csv'
  a.click()
  URL.revokeObjectURL(url)
}

// ══════════════════════════════════════════════════
// EXPORT HORAS POR TRABAJADOR
// ══════════════════════════════════════════════════
export function exportarHorasTrabajador(
  semActual: Date,
  filas: Array<{
    leg: string
    nom: string
    dni: string | null
    catNom: string
    obraCod: string
    obraNom: string
    horasPorDia: Record<string, number>
    hsExtras?: number
    totalHs: number
    totalCosto: number
  }>
) {
  const days = getSemDays(semActual)
  const semLabel = getSemLabel(semActual)

  const header = [
    'Legajo', 'Apellido y Nombre', 'DNI', 'Categoría', 'Obra',
    ...days.map((d, i) => `${DIAS[i]} ${d.getDate()}/${d.getMonth() + 1}`),
    'Hs Extras', 'Total Horas', 'Costo ($)',
  ]

  const rows = filas.map(f => [
    f.leg,
    f.nom,
    f.dni ?? '',
    f.catNom,
    `${f.obraCod} — ${f.obraNom}`,
    ...days.map(d => f.horasPorDia[toISO(d)] ?? 0),
    f.hsExtras ?? 0,
    f.totalHs,
    Math.round(f.totalCosto / 1000) * 1000,
  ])

  // Fila totales
  const totExtras = filas.reduce((s, f) => s + (f.hsExtras ?? 0), 0)
  const totHs = filas.reduce((s, f) => s + f.totalHs, 0)
  const totCosto = filas.reduce((s, f) => s + f.totalCosto, 0)
  const totalsRow = [
    'TOTAL', '', '', '', '',
    ...days.map(d => filas.reduce((s, f) => s + (f.horasPorDia[toISO(d)] ?? 0), 0)),
    totExtras,
    totHs,
    Math.round(totCosto / 1000) * 1000,
  ]

  const ws = XLSX.utils.aoa_to_sheet([header, ...rows, totalsRow])

  // Anchos de columna
  ws['!cols'] = [
    { wch: 8 }, { wch: 30 }, { wch: 12 }, { wch: 18 }, { wch: 35 },
    ...days.map(() => ({ wch: 8 })),
    { wch: 10 }, { wch: 12 }, { wch: 14 },
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Horas x Trabajador')
  XLSX.writeFile(wb, `HorasTrabajador_${toISO(semActual)}.xlsx`)
}

// ══════════════════════════════════════════════════
// RECIBOS PDF — via ventana de impresión
// ══════════════════════════════════════════════════
export function generarRecibos(
  semKey: string,
  empresa: string,
  obrasSelec: Obra[],
  personal: Personal[],
  categorias: Categoria[],
  horas: Hora[],
  tarifas: Tarifa[],
  certificaciones: Certificacion[],
  contratistas: Contratista[],
  catObra: Array<{ obra_cod: string; leg: string; cat_id: number; desde: string }> = [],
  prestamos: Prestamo[] = [],
  legsSelec: string[] | null = null,   // null = todos
  hsExtras: TarjaHsExtra[] = [],
  incluirPortada: boolean = true,
) {
  const s = new Date(semKey + 'T12:00:00')
  const days = getSemDays(s)
  const pago = getViernesCobro(s)
  const periodo = getSemLabel(s)
  const pagoStr = `${pago.getDate()}/${pago.getMonth() + 1}/${pago.getFullYear()}`

  // Wrapper que cierra sobre la data + semKey (fecha de referencia).
  const getVHLocal = (obraCod: string, leg: string) =>
    getVHConCatObra(catObra, personal, categorias, tarifas, obraCod, leg, semKey)


  function fmtM(n: number) { return '$' + (Math.round(n / 1000) * 1000).toLocaleString('es-AR') }
  function fmtH(n: number) { return n + 'hs' }

  // ── Trabajadores ──
  const trabMap: Record<string, {
    p: Personal
    obras: Array<{ obra: Obra; hs: number; costo: number; catNom: string; hsExtra: number; vh: number; costoExtra: number }>
    totalHs: number
    totalCosto: number
    totalHsExtra: number
    totalCostoExtra: number
  }> = {}

  obrasSelec.forEach(o => {
    // Legs con horas o con hs extras en esta obra × semana
    const legsHoras = new Set(
      horas
        .filter(h => h.obra_cod === o.cod && h.fecha >= toISO(days[0]!) && h.fecha <= toISO(days[6]!))
        .map(h => h.leg)
    )
    hsExtras
      .filter(x => x.obra_cod === o.cod && x.sem_key === semKey && x.hs > 0)
      .forEach(x => legsHoras.add(x.leg))
    const legs = [...legsHoras].filter(leg => legsSelec === null || legsSelec.includes(leg))
    legs.forEach(leg => {
      const p = personal.find(x => x.leg === leg)
      if (!p) return
      const hsDias = totalHsLeg(horas, o.cod, leg, days.map(toISO))
      const hsExtra = getHsExtrasLeg(hsExtras, o.cod, leg, semKey)
      const vh = getVHLocal(o.cod, leg)
      // Redondeo consistente: costo base y extra redondeados por separado a miles
      // para mantener el patrón del proyecto (fmtM siempre redondea a miles)
      const costoBase = Math.round(hsDias * vh / 1000) * 1000
      const costoExtra = Math.round(hsExtra * vh / 1000) * 1000
      if (hsDias === 0 && hsExtra === 0) return
      const cat = categorias.find(c => c.id === p.cat_id)
      if (!trabMap[leg]) trabMap[leg] = { p, obras: [], totalHs: 0, totalCosto: 0, totalHsExtra: 0, totalCostoExtra: 0 }
      trabMap[leg]!.obras.push({
        obra: o,
        hs: hsDias,
        costo: costoBase,
        catNom: cat?.nom ?? '—',
        hsExtra,
        vh,
        costoExtra,
      })
      trabMap[leg]!.totalHs += hsDias + hsExtra
      trabMap[leg]!.totalCosto += costoBase + costoExtra
      trabMap[leg]!.totalHsExtra += hsExtra
      trabMap[leg]!.totalCostoExtra += costoExtra
    })
  })

  const trabajadores = Object.values(trabMap).sort((a, b) => a.p.nom.localeCompare(b.p.nom))

  // ── Contratistas ──
  const contratMap: Record<number, {
    contrat: Contratista
    obras: Array<{ obra: Obra; monto: number; desc: string }>
    totalCosto: number
  }> = {}

  obrasSelec.forEach(o => {
    certificaciones
      .filter(c => c.obra_cod === o.cod && c.sem_key === semKey && c.monto > 0)
      .forEach(cert => {
        const contrat = contratistas.find(c => c.id === cert.contrat_id)
        if (!contrat) return
        if (!contratMap[cert.contrat_id]) {
          contratMap[cert.contrat_id] = { contrat, obras: [], totalCosto: 0 }
        }
        contratMap[cert.contrat_id]!.obras.push({ obra: o, monto: cert.monto, desc: cert.desc ?? '' })
        contratMap[cert.contrat_id]!.totalCosto += cert.monto
      })
  })

  const contratData = Object.values(contratMap).sort((a, b) => a.contrat.nom.localeCompare(b.contrat.nom))

  if (!trabajadores.length && !contratData.length) return null

  // ── HTML operarios ──
  let recibosHTML = ''
  trabajadores.forEach((t, idx) => {
    const pb = idx > 0 && idx % 4 === 0 ? 'page-break-before:always;' : ''
    // Las hs extras se suman al total de horas y costo de la obra (NO se listan
    // como línea separada). Para el operario es "trabajo en la obra X", sin
    // distinción de regulares vs extras — coincide con el criterio contable.
    const obrasRows = t.obras.map(ob => `
      <tr>
        <td style="padding:4px 8px;font-size:10px;border-bottom:1px solid #eee">${ob.obra.cod}</td>
        <td style="padding:4px 8px;font-size:10px;border-bottom:1px solid #eee">${ob.obra.nom}</td>
        <td style="padding:4px 8px;font-size:10px;border-bottom:1px solid #eee;color:#555">${ob.catNom}</td>
        <td style="padding:4px 8px;font-size:10px;text-align:center;border-bottom:1px solid #eee;font-family:monospace">${fmtH(ob.hs + ob.hsExtra)}</td>
        <td style="padding:4px 8px;font-size:10px;text-align:right;border-bottom:1px solid #eee;font-family:monospace">${fmtM(ob.costo + ob.costoExtra)}</td>
      </tr>`).join('')

    const hsExtrasRows = ''  // se removió el desglose; hs extras ya van sumadas arriba

    // Préstamo/descuento de esta semana para este trabajador
    const prestamo = prestamos.find(p => p.leg === t.p.leg && p.sem_key === semKey)
    const totalNeto = prestamo
      ? prestamo.tipo === 'otorgado'
        ? t.totalCosto + prestamo.monto
        : t.totalCosto - prestamo.monto
      : t.totalCosto

    const prestamoRow = prestamo ? `
      <div style="padding:5px 14px;border-top:1px dashed #d0d0d0;display:flex;justify-content:space-between;align-items:center;background:#FAFAFA">
        <div style="font-size:9px;color:#8A8980">
          Jornales: <span style="font-family:monospace;color:#1C1C1E;font-weight:700">${fmtM(t.totalCosto)}</span>
        </div>
        <div style="font-size:9px;font-weight:700;${prestamo.tipo === 'otorgado' ? 'color:#E8621A' : 'color:#C0392B'}">
          ${prestamo.tipo === 'otorgado' ? '+ Préstamo: ' : '− Descuento: '}
          <span style="font-family:monospace">${fmtM(prestamo.monto)}</span>
          ${prestamo.concepto ? `<span style="font-weight:400;color:#8A8980"> (${prestamo.concepto})</span>` : ''}
        </div>
      </div>` : ''

    recibosHTML += `
    <div class="recibo" style="${pb}border:1.5px solid #1D3F6E;border-radius:8px;font-family:Arial,sans-serif">
      <div style="background:#0F2744;color:white;padding:8px 14px;display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase">${empresa}</div>
          <div style="font-size:9px;opacity:.7;margin-top:1px">RECIBO DE HABERES</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:9px;opacity:.7">PERÍODO</div>
          <div style="font-size:10px;font-weight:700">${periodo}</div>
        </div>
      </div>
      <div style="background:#FDF0E8;padding:7px 14px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #E8D0BC">
        <div>
          <div style="font-size:12px;font-weight:700;color:#0F2744">${t.p.nom}</div>
          <div style="font-size:9px;color:#8A8980">Leg. ${t.p.leg} &nbsp;·&nbsp; DNI ${t.p.dni ?? '—'}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:9px;color:#8A8980">FECHA DE PAGO</div>
          <div style="font-size:10px;font-weight:700;color:#E8621A">${pagoStr}</div>
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="background:#F0EFEB">
          <th style="padding:4px 8px;font-size:9px;text-align:left;color:#8A8980;font-weight:700;text-transform:uppercase;letter-spacing:.5px">Código</th>
          <th style="padding:4px 8px;font-size:9px;text-align:left;color:#8A8980;font-weight:700;text-transform:uppercase;letter-spacing:.5px">Obra</th>
          <th style="padding:4px 8px;font-size:9px;text-align:left;color:#8A8980;font-weight:700;text-transform:uppercase;letter-spacing:.5px">Categoría</th>
          <th style="padding:4px 8px;font-size:9px;text-align:center;color:#8A8980;font-weight:700;text-transform:uppercase;letter-spacing:.5px">Horas</th>
          <th style="padding:4px 8px;font-size:9px;text-align:right;color:#8A8980;font-weight:700;text-transform:uppercase;letter-spacing:.5px">Importe</th>
        </tr></thead>
        <tbody>${obrasRows}</tbody>
      </table>
      ${hsExtrasRows}
      ${prestamoRow}
      <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 14px;background:#F0EFEB;border-top:2px solid #0F2744">
        <div style="font-size:9px;color:#8A8980">Total horas: <b style="color:#1C1C1E;font-family:monospace">${fmtH(t.totalHs)}</b></div>
        <div style="text-align:center;flex:1">
          <div style="border-bottom:1px solid #C0C0C0;width:120px;margin:0 auto 2px"></div>
          <div style="font-size:8px;color:#8A8980">Firma trabajador</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:9px;color:#8A8980;text-transform:uppercase;letter-spacing:.5px">TOTAL A COBRAR</div>
          <div style="font-size:15px;font-weight:700;color:#1A6B3C;font-family:monospace">${fmtM(totalNeto)}</div>
        </div>
      </div>
    </div>`
  })

  // ── HTML contratistas ──
  let contratHTML = ''
  contratData.forEach((cd, idx) => {
    const pb = (trabajadores.length > 0 || idx > 0) && (trabajadores.length + idx) % 4 === 0 ? 'page-break-before:always;' : ''
    const filas = cd.obras.map(ob => `
      <tr>
        <td style="padding:5px 8px;font-size:10px;border-bottom:1px solid #eee">
          <span style="font-family:monospace;font-size:9px;background:#eee;padding:1px 5px;border-radius:3px">${ob.obra.cod}</span>
          &nbsp;${ob.obra.nom}
        </td>
        <td style="padding:5px 8px;font-size:10px;border-bottom:1px solid #eee;color:#555">${ob.desc || '—'}</td>
        <td style="padding:5px 8px;font-size:10px;border-bottom:1px solid #eee;text-align:right;font-family:monospace;font-weight:700">${fmtM(ob.monto)}</td>
      </tr>`).join('')

    contratHTML += `
    <div class="recibo" style="${pb}border:1.5px solid #2C1654;border-radius:8px;font-family:Arial,sans-serif">
      <div style="background:#2C1654;color:white;padding:8px 14px;display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase">${empresa}</div>
          <div style="font-size:9px;opacity:.7">CERTIFICACIÓN DE CONTRATISTA</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:9px;opacity:.7">PERÍODO</div>
          <div style="font-size:10px;font-weight:700">${periodo}</div>
        </div>
      </div>
      <div style="background:#F5F0FF;padding:7px 14px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #D4B8F0">
        <div>
          <div style="font-size:12px;font-weight:700;color:#2C1654">${cd.contrat.nom}</div>
          <div style="font-size:9px;color:#8A8980">${cd.contrat.especialidad ?? 'Contratista'}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:9px;color:#8A8980">FECHA DE PAGO</div>
          <div style="font-size:10px;font-weight:700;color:#9B59B6">${pagoStr}</div>
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="background:#F0EFEB">
          <th style="padding:4px 8px;font-size:9px;text-align:left;color:#8A8980;font-weight:700;text-transform:uppercase;letter-spacing:.5px">Obra</th>
          <th style="padding:4px 8px;font-size:9px;text-align:left;color:#8A8980;font-weight:700;text-transform:uppercase;letter-spacing:.5px">Descripción</th>
          <th style="padding:4px 8px;font-size:9px;text-align:right;color:#8A8980;font-weight:700;text-transform:uppercase;letter-spacing:.5px">Monto ($)</th>
        </tr></thead>
        <tbody>${filas}</tbody>
      </table>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 14px;background:#F0EFEB;border-top:2px solid #2C1654">
        <div style="font-size:9px;color:#8A8980">${cd.obras.length} obra${cd.obras.length !== 1 ? 's' : ''} certificada${cd.obras.length !== 1 ? 's' : ''}</div>
        <div style="text-align:center;flex:1">
          <div style="border-bottom:1px solid #C0C0C0;width:120px;margin:0 auto 2px"></div>
          <div style="font-size:8px;color:#8A8980">Firma contratista</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:9px;color:#8A8980;text-transform:uppercase;letter-spacing:.5px">TOTAL A COBRAR</div>
          <div style="font-size:15px;font-weight:700;color:#5A2D82;font-family:monospace">${fmtM(cd.totalCosto)}</div>
        </div>
      </div>
    </div>`
  })

  const totalOp = trabajadores.reduce((s, t) => s + t.totalCosto, 0)
  const totalContrat = contratData.reduce((s, c) => s + c.totalCosto, 0)

  // ── Portada resumen (primera página) ──
  let portadaHTML = ''
  if (incluirPortada && (trabajadores.length > 0 || contratData.length > 0)) {
    const resumen = calcularResumenSemana({
      obras: obrasSelec,
      semana: s,
      horas,
      hsExtras,
      personal,
      categorias,
      tarifas,
      certificaciones,
      catObra,
      prestamos,
    })

    const cardHTML = resumen.cards.map(c => {
      const esDep = c.obra.es_deposito
      const bg = esDep ? '#FDEEDA' : '#F8F6F2'
      // Border-left grueso + chip "DEPÓSITO" textual para distinguir en B&N.
      const borderLeft = esDep ? '4px solid #C96A2A' : '1px solid #D9D6CF'
      const border = esDep ? '#E8C5A0' : '#D9D6CF'
      const depChip = esDep
        ? `<span style="font-family:monospace;font-size:9px;background:#C96A2A;color:#fff;padding:1px 6px;border-radius:3px;font-weight:700;letter-spacing:.3px">DEPÓSITO</span>`
        : ''
      const ccChip = c.obra.cc
        ? `<span style="font-family:monospace;font-size:9px;background:#E8EDF5;color:#1D3F6E;padding:1px 6px;border-radius:3px;font-weight:700;letter-spacing:.3px">CC ${c.obra.cc}</span>`
        : ''
      const respLine = (c.obra.dir || c.obra.resp)
        ? `<div style="font-size:10px;color:#8A8980;margin-top:6px">${c.obra.resp ? '👷 ' + c.obra.resp : ''}${c.obra.dir && c.obra.resp ? ' · ' : ''}${c.obra.dir ? '📍 ' + c.obra.dir : ''}</div>`
        : ''
      return `
        <div style="background:${bg};border:1px solid ${border};border-left:${borderLeft};border-radius:8px;padding:8px 10px;break-inside:avoid">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-wrap:wrap">
            ${depChip}
            ${ccChip}
            <span style="font-weight:700;font-size:11px;color:#1D3F6E;letter-spacing:.3px">${c.obra.nom}</span>
          </div>
          <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">
            <div style="text-align:left">
              <div style="font-family:monospace;font-size:11px;font-weight:700;color:#1C1C1E">${c.legs}</div>
              <div style="font-size:8px;color:#8A8980;text-transform:uppercase;letter-spacing:.3px">Operarios</div>
            </div>
            <div style="text-align:left">
              <div style="font-family:monospace;font-size:11px;font-weight:700;color:#1C1C1E">${fmtH(c.hs)}</div>
              <div style="font-size:8px;color:#8A8980;text-transform:uppercase;letter-spacing:.3px">Horas sem.</div>
            </div>
            ${c.costo > 0 ? `<div style="text-align:left">
              <div style="font-family:monospace;font-size:11px;font-weight:700;color:#1A6B3C">${fmtM(c.costo)}</div>
              <div style="font-size:8px;color:#8A8980;text-transform:uppercase;letter-spacing:.3px">Costo op.</div>
            </div>` : ''}
            ${c.contrat > 0 ? `<div style="text-align:left">
              <div style="font-family:monospace;font-size:11px;font-weight:700;color:#5A2D82">${fmtM(c.contrat)}</div>
              <div style="font-size:8px;color:#8A8980;text-transform:uppercase;letter-spacing:.3px">Contrat.</div>
            </div>` : ''}
            <div style="margin-left:auto;text-align:right">
              <div style="font-family:monospace;font-size:13px;font-weight:700;color:#E8621A">${fmtM(c.costo + c.contrat)}</div>
              <div style="font-size:8px;color:#8A8980;text-transform:uppercase;letter-spacing:.3px">total semana</div>
            </div>
          </div>
          ${respLine}
        </div>`
    }).join('')

    const chip = (label: string, value: string, variant?: 'green' | 'orange' | 'red') => {
      const colors = variant === 'green'
        ? { bg: '#DEEDE6', fg: '#1A6B3C' }
        : variant === 'orange'
        ? { bg: '#FDE6D6', fg: '#E8621A' }
        : variant === 'red'
        ? { bg: '#FCE4E4', fg: '#C0392B' }
        : { bg: '#F0EFEB', fg: '#1C1C1E' }
      return `
        <div style="background:${colors.bg};border-radius:8px;padding:6px 12px;text-align:center;min-width:70px">
          <div style="font-family:monospace;font-size:14px;font-weight:700;color:${colors.fg};letter-spacing:-.3px">${value}</div>
          <div style="font-size:8px;color:#8A8980;text-transform:uppercase;letter-spacing:.5px;margin-top:1px">${label}</div>
        </div>`
    }

    const chipsPrestamos = [
      resumen.totalPrestamosOtorgados > 0
        ? chip('Préstamos (+)', fmtM(resumen.totalPrestamosOtorgados), 'orange')
        : '',
      resumen.totalPrestamosDescuentos > 0
        ? chip('Descuentos (−)', fmtM(resumen.totalPrestamosDescuentos), 'red')
        : '',
    ].join('')

    portadaHTML = `
      <div style="page-break-after:always;font-family:Arial,sans-serif;background:#fff;border:1.5px solid #D9D6CF;border-left:4px solid #E8621A;border-radius:10px;padding:14px 16px;margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;margin-bottom:12px">
          <div>
            <div style="font-size:18px;font-weight:800;color:#1D3F6E;letter-spacing:1.5px">📊 RESUMEN GENERAL</div>
            <div style="font-size:11px;color:#8A8980;margin-top:3px">
              ${empresa} · ${periodo} · Pago: <b style="color:#E8621A">${pagoStr}</b>
            </div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${chip('Obras', String(resumen.cards.length))}
            ${chip('Personal', String(resumen.totalPersonal))}
            ${chip('Horas', fmtH(resumen.totalHs))}
            ${chip('Operarios', fmtM(resumen.totalCostoOp), 'green')}
            ${resumen.totalCostoContrat > 0 ? chip('Contratistas', fmtM(resumen.totalCostoContrat)) : ''}
            ${chipsPrestamos}
            ${chip('Total semana', fmtM(resumen.totalSemana), 'orange')}
          </div>
        </div>
        ${resumen.cards.length === 0
          ? '<div style="color:#8A8980;text-align:center;padding:20px;font-size:11px">Sin actividad esta semana.</div>'
          : `<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px">${cardHTML}</div>`
        }
        <div style="margin-top:10px;padding-top:8px;border-top:1px dashed #D9D6CF;font-size:9px;color:#8A8980;text-align:right">
          ${trabajadores.length} recibo${trabajadores.length !== 1 ? 's' : ''} de operario${trabajadores.length !== 1 ? 's' : ''}${contratData.length ? ' · ' + contratData.length + ' certificación' + (contratData.length !== 1 ? 'es' : '') + ' de contratista' : ''}
        </div>
      </div>`
  }

  const win = window.open('', '_blank', 'width=900,height=700')
  if (!win) return null

  win.document.write(`<!DOCTYPE html><html><head>
    <meta charset="UTF-8">
    <title>Recibos — ${periodo}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{background:#f5f5f3;font-family:Arial,sans-serif;padding-top:68px}
      @page{size:A4;margin:10mm}
      @media print{body{background:#fff;padding-top:0!important}.no-print{display:none!important}}
      /* Cada recibo (operario o contratista) ocupa una altura fija para
         que al imprimir 4 por página queden todos del mismo tamaño y
         puedan cortarse parejos con guillotina/tijera. Si el contenido
         excediera (caso raro: muchísimas obras), se trunca con
         overflow:hidden — preferimos uniformidad sobre completitud. */
      .recibo{height:65mm;overflow:hidden;page-break-inside:avoid;break-inside:avoid;margin-bottom:2mm;display:flex;flex-direction:column}
      .recibo > table{flex:1 1 auto;min-height:0}
      .topbar{position:fixed;top:0;left:0;right:0;z-index:999;background:#0F2744;color:#fff;display:flex;align-items:center;justify-content:space-between;padding:10px 20px;gap:12px;box-shadow:0 2px 8px rgba(0,0,0,.25)}
      .topbar-info{font-size:11px;opacity:.8;line-height:1.5}
      .topbar-info b{color:#fff;font-size:12px;opacity:1}
      .topbar-btns{display:flex;gap:8px;flex-shrink:0}
      .btn-print{background:#E8621A;color:#fff;border:none;padding:9px 22px;border-radius:7px;font-size:13px;font-weight:700;cursor:pointer;letter-spacing:.5px}
      .btn-print:hover{background:#d4561a}
      .btn-close{background:rgba(255,255,255,.12);color:#fff;border:1px solid rgba(255,255,255,.25);padding:9px 16px;border-radius:7px;font-size:13px;font-weight:600;cursor:pointer}
      .btn-close:hover{background:rgba(255,255,255,.22)}
      .page-grid{display:grid;grid-template-columns:1fr;gap:10px;max-width:860px;margin:0 auto;padding:14px}
    </style>
  </head><body>
    <div class="topbar no-print">
      <div class="topbar-info">
        <b>🏗 ${empresa} — Recibos de Haberes</b><br>
        Período: ${periodo} &nbsp;·&nbsp; Pago: ${pagoStr} &nbsp;·&nbsp;
        ${trabajadores.length} operario${trabajadores.length !== 1 ? 's' : ''}
        ${contratData.length ? ' · ' + contratData.length + ' contratista' + (contratData.length !== 1 ? 's' : '') : ''}
        &nbsp;·&nbsp; Op: ${fmtM(totalOp)}
        ${contratData.length ? ' · Cont: ' + fmtM(totalContrat) : ''}
        &nbsp;·&nbsp; <b>TOTAL: ${fmtM(totalOp + totalContrat)}</b>
      </div>
      <div class="topbar-btns">
        <button class="btn-print" onclick="window.print()">🖨 Imprimir / PDF</button>
        <button class="btn-close" onclick="window.close()">✕ Cerrar</button>
      </div>
    </div>
    <div class="page-grid">${portadaHTML}${recibosHTML}${contratHTML}</div>
  </body></html>`)
  win.document.close()

  return { trabajadores: trabajadores.length, contratistas: contratData.length, totalOp, totalContrat }
}