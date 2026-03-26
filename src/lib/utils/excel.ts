import * as XLSX from 'xlsx'
import type { Obra, Cierre, Certificacion, Contratista, Categoria, Personal, Hora, Tarifa } from '@/types/domain.types'
import { getSemDays, toISO, getSemLabel, getViernesCobro, getViernes, DIAS } from './dates'
import { totalHsLeg, costoLeg } from './costos'

// ══════════════════════════════════════════════════
// EXPORT TARJA — planilla por obra y semana
// ══════════════════════════════════════════════════
export function exportarTarjaExcel(
  obraCod: string,
  obraNom: string,
  semActual: Date,
  personal: Personal[],
  categorias: Categoria[],
  horas: Hora[],
  tarifas: Tarifa[]
) {
  const wb   = XLSX.utils.book_new()
  const days = getSemDays(semActual)

  const fechaRow  = ['', '', '', ...days.map(d => toISO(d)), '']
  const headerRow = [
    'Legajo', 'Apellido y Nombre', 'Categoría',
    ...days.map((d, i) => `${DIAS[i]} ${d.getDate()}/${d.getMonth() + 1}`),
    'TOTAL HORAS',
  ]

  const dataRows = personal.map(p => {
    const cat   = categorias.find(c => c.id === p.cat_id)
    const hsDia = days.map(d => {
      const h = horas.find(x => x.obra_cod === obraCod && x.leg === p.leg && x.fecha === toISO(d))
      return h?.horas ?? ''
    })
    const totHs = hsDia.reduce<number>((s, h) => s + (Number(h) || 0), 0)
    return [p.leg, p.nom, cat?.nom ?? '—', ...hsDia, totHs || '']
  })

  const rows = [
    [`TARJA — ${obraNom} (${obraCod}) — ${getSemLabel(semActual)}`],
    ['Completá las horas por día. No modificar columnas A, B, C ni la fila 3 (fechas).'],
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

  XLSX.writeFile(wb, `Tarja_${obraCod}_${toISO(semActual)}.xlsx`)
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
      const wb   = XLSX.read(e.target!.result, { type: 'array' })
      const ws   = wb.Sheets[wb.SheetNames[0]!]!
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
    const vh  = tarifas
      .filter(t => t.obra_cod === obraCod && t.cat_id === p.cat_id && t.desde <= toISO(semActual))
      .sort((a, b) => b.desde.localeCompare(a.desde))[0]?.vh ?? cat?.vh ?? 0

    let totalHs = 0, totalCosto = 0
    const hsDia = days.map(d => {
      const h   = horas.find(x => x.obra_cod === obraCod && x.leg === p.leg && x.fecha === toISO(d))
      const val = h?.horas ?? 0
      totalHs   += val
      totalCosto += val * vh
      return val || ''
    })

    csv += `${p.leg},"${p.nom}","${cat?.nom ?? '—'}",${vh},${hsDia.join(',')},${totalHs || ''},${Math.round(totalCosto)}\n`
  })

  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
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
// EXCEL OBRAS — resumen completo
// ══════════════════════════════════════════════════
export function exportarExcelObras(
  obras: Obra[],
  personal: Personal[],
  categorias: Categoria[],
  horas: Hora[],
  tarifas: Tarifa[],
  cierres: Cierre[],
  certificaciones: Certificacion[],
  contratistas: Contratista[],
  semFiltro: string = ''
) {
  const wb  = XLSX.utils.book_new()
  const hoy = new Date()

  function semOk(sk: string) { return !semFiltro || sk === semFiltro }

  function getSemanasObra(obraCod: string): string[] {
    const seen = new Set<string>()
    horas
      .filter(h => h.obra_cod === obraCod)
      .forEach(h => seen.add(toISO(getViernes(new Date(h.fecha + 'T12:00:00')))))
    certificaciones
      .filter(c => c.obra_cod === obraCod)
      .forEach(c => seen.add(c.sem_key))
    return [...seen].filter(semOk).sort()
  }

  function fmtDate(d: Date): string {
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`
  }

  function fmtM(n: number): string {
    return '$' + Math.round(n).toLocaleString('es-AR')
  }

  // ── HOJA 1: Resumen ──
  const resumenRows: any[][] = [
    ['RESUMEN DE OBRAS — TarjaObra'],
    [`Generado: ${fmtDate(hoy)}${semFiltro ? ' · Semana: ' + getSemLabel(new Date(semFiltro + 'T12:00:00')) : ''}`],
    [],
    ['Código', 'Obra', 'Centro de Costo', 'Dirección', 'Responsable',
     'Operarios asig.', 'Horas totales', 'Costo operarios ($)',
     'Contratistas', 'Costo contratistas ($)', 'COSTO TOTAL ($)',
     'Sem. cerradas', 'Sem. pendientes'],
  ]

  let totHsGlobal = 0, totCostoGlobal = 0, totCertifGlobal = 0

  obras.forEach(o => {
    const legs    = [...new Set(horas.filter(h => h.obra_cod === o.cod).map(h => h.leg))]
    const semanas = getSemanasObra(o.cod)
    let totalHs = 0, totalCosto = 0

    semanas.forEach(sk => {
      const days = getSemDays(new Date(sk + 'T12:00:00'))
      legs.forEach(leg => {
        totalHs    += totalHsLeg(horas, o.cod, leg, days.map(toISO))
        totalCosto += costoLeg(horas, personal, categorias, tarifas, o.cod, leg, days)
      })
    })

    const certObra    = certificaciones.filter(c => c.obra_cod === o.cod && semOk(c.sem_key))
    const totalCertif = certObra.reduce((s, c) => s + c.monto, 0)
    const nContrat    = [...new Set(certObra.map(c => c.contrat_id))].length
    const cierresObra = cierres.filter(c => c.obra_cod === o.cod && semOk(c.sem_key))
    const cerradas    = cierresObra.filter(c => c.estado === 'cerrado').length
    const pendientes  = cierresObra.filter(c => c.estado === 'pendiente').length

    totHsGlobal     += totalHs
    totCostoGlobal  += totalCosto
    totCertifGlobal += totalCertif

    resumenRows.push([
      o.cod, o.nom, o.cc ?? '', o.dir ?? '', o.resp ?? '',
      legs.length, totalHs, Math.round(totalCosto),
      nContrat, Math.round(totalCertif), Math.round(totalCosto + totalCertif),
      cerradas, pendientes,
    ])
  })

  resumenRows.push([])
  resumenRows.push([
    '', 'TOTAL GENERAL', '', '', '',
    '', totHsGlobal, Math.round(totCostoGlobal),
    '', Math.round(totCertifGlobal), Math.round(totCostoGlobal + totCertifGlobal),
    '', '',
  ])

  const ws1 = XLSX.utils.aoa_to_sheet(resumenRows)
  ws1['!cols'] = [
    { wch: 10 }, { wch: 26 }, { wch: 20 }, { wch: 14 }, { wch: 12 },
    { wch: 10 }, { wch: 12 }, { wch: 18 }, { wch: 12 }, { wch: 20 },
    { wch: 14 }, { wch: 13 }, { wch: 14 },
  ]
  XLSX.utils.book_append_sheet(wb, ws1, 'Resumen Obras')

  // ── HOJA 2: Detalle Semanal ──
  const detRows: any[][] = [
    ['DETALLE SEMANAL POR OBRA'],
    [],
    ['Tipo', 'Obra', 'Código', 'Centro de Costo', 'Período (Vie→Jue)',
     'Cobro (Viernes)', 'Nombre / Contratista', 'Categoría / Especialidad',
     'Horas', 'Monto ($)', 'Estado'],
  ]

  obras.forEach(o => {
    const legs    = [...new Set(horas.filter(h => h.obra_cod === o.cod).map(h => h.leg))]
    const semanas = getSemanasObra(o.cod)

    semanas.sort().forEach(sk => {
      const s         = new Date(sk + 'T12:00:00')
      const days      = getSemDays(s)
      const pago      = getViernesCobro(s)
      const estado    = cierres.find(c => c.obra_cod === o.cod && c.sem_key === sk)?.estado ?? 'pendiente'
      const estadoTxt = estado === 'cerrado' ? 'Cerrado' : 'Pendiente'
      const periodo   = getSemLabel(s)
      const cobro     = fmtDate(pago)

      legs.forEach(leg => {
        const p     = personal.find(x => x.leg === leg)
        if (!p) return
        const hs    = totalHsLeg(horas, o.cod, leg, days.map(toISO))
        const costo = costoLeg(horas, personal, categorias, tarifas, o.cod, leg, days)
        if (hs === 0) return
        const cat = categorias.find(c => c.id === p.cat_id)
        detRows.push([
          '👷 Operario', o.nom, o.cod, o.cc ?? '',
          periodo, cobro, p.nom, cat?.nom ?? '—',
          hs, Math.round(costo), estadoTxt,
        ])
      })

      certificaciones
        .filter(c => c.obra_cod === o.cod && c.sem_key === sk && c.monto > 0)
        .forEach(cert => {
          const contrat = contratistas.find(c => c.id === cert.contrat_id)
          detRows.push([
            '🔧 Contratista', o.nom, o.cod, o.cc ?? '',
            periodo, cobro,
            contrat?.nom ?? '—', contrat?.especialidad ?? '—',
            '—', Math.round(cert.monto), estadoTxt,
          ])
        })
    })
    detRows.push([])
  })

  const ws2 = XLSX.utils.aoa_to_sheet(detRows)
  ws2['!cols'] = [
    { wch: 18 }, { wch: 26 }, { wch: 10 }, { wch: 20 },
    { wch: 20 }, { wch: 16 }, { wch: 24 }, { wch: 20 },
    { wch: 8 }, { wch: 14 }, { wch: 12 },
  ]
  XLSX.utils.book_append_sheet(wb, ws2, 'Detalle Semanal')

  // ── HOJA 3: Certificaciones ──
  const certRows: any[][] = [
    ['CERTIFICACIONES DE CONTRATISTAS'],
    [],
    ['Obra', 'Código', 'Período (Vie→Jue)', 'Cobro (Viernes)',
     'Contratista', 'Especialidad', 'Descripción / avance', 'Monto ($)', 'Estado'],
  ]

  obras.forEach(o => {
    certificaciones
      .filter(c => c.obra_cod === o.cod && semOk(c.sem_key) && c.monto > 0)
      .sort((a, b) => a.sem_key.localeCompare(b.sem_key))
      .forEach(cert => {
        const s       = new Date(cert.sem_key + 'T12:00:00')
        const pago    = getViernesCobro(s)
        const estado  = cierres.find(c => c.obra_cod === o.cod && c.sem_key === cert.sem_key)?.estado ?? 'pendiente'
        const contrat = contratistas.find(c => c.id === cert.contrat_id)
        certRows.push([
          o.nom, o.cod, getSemLabel(s), fmtDate(pago),
          contrat?.nom ?? '—', contrat?.especialidad ?? '—',
          cert.desc ?? '', Math.round(cert.monto),
          estado === 'cerrado' ? 'Cerrado' : 'Pendiente',
        ])
      })
  })

  const ws3 = XLSX.utils.aoa_to_sheet(certRows)
  ws3['!cols'] = [
    { wch: 26 }, { wch: 10 }, { wch: 20 }, { wch: 16 },
    { wch: 24 }, { wch: 16 }, { wch: 30 }, { wch: 12 }, { wch: 12 },
  ]
  XLSX.utils.book_append_sheet(wb, ws3, 'Contratistas')

  // ── HOJA 4: Personal ──
  const persRows: any[][] = [
    ['NÓMINA DE PERSONAL'],
    [],
    ['Legajo', 'Nombre', 'DNI', 'Categoría actual', 'Valor hora ($)',
     'Teléfono', 'Dirección', 'Observaciones', 'Historial categorías'],
  ]

  personal.forEach(p => {
    const cat     = categorias.find(c => c.id === p.cat_id)
    const histStr = (p.personal_cat_historial ?? [])
      .sort((a, b) => a.desde.localeCompare(b.desde))
      .map(h => `${categorias.find(c => c.id === h.cat_id)?.nom ?? h.cat_id} desde ${h.desde}`)
      .join(' | ')
    persRows.push([
      p.leg, p.nom, p.dni ?? '', cat?.nom ?? '—', cat?.vh ?? 0,
      p.tel ?? '', p.dir ?? '', p.obs ?? '', histStr,
    ])
  })

  const ws4 = XLSX.utils.aoa_to_sheet(persRows)
  ws4['!cols'] = [
    { wch: 8 }, { wch: 26 }, { wch: 14 }, { wch: 22 }, { wch: 12 },
    { wch: 16 }, { wch: 22 }, { wch: 20 }, { wch: 40 },
  ]
  XLSX.utils.book_append_sheet(wb, ws4, 'Personal')

  const sufijo      = semFiltro ? `_sem-${semFiltro}` : ''
  const prefijoObra = obras.length === 1 ? `_${obras[0]!.cod}` : ''
  XLSX.writeFile(wb, `TarjaObras${prefijoObra}${sufijo}_${toISO(hoy)}.xlsx`)
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
  contratistas: Contratista[]
) {
  const s       = new Date(semKey + 'T12:00:00')
  const days    = getSemDays(s)
  const pago    = getViernesCobro(s)
  const periodo = getSemLabel(s)
  const pagoStr = `${pago.getDate()}/${pago.getMonth() + 1}/${pago.getFullYear()}`

  function fmtM(n: number) { return '$' + Math.round(n).toLocaleString('es-AR') }
  function fmtH(n: number) { return n + 'hs' }

  // ── Trabajadores ──
  const trabMap: Record<string, {
    p: Personal
    obras: Array<{ obra: Obra; hs: number; costo: number; catNom: string }>
    totalHs: number
    totalCosto: number
  }> = {}

  obrasSelec.forEach(o => {
    const legs = [...new Set(
      horas
        .filter(h => h.obra_cod === o.cod && h.fecha >= toISO(days[0]!) && h.fecha <= toISO(days[6]!))
        .map(h => h.leg)
    )]
    legs.forEach(leg => {
      const p     = personal.find(x => x.leg === leg)
      if (!p) return
      const hs    = totalHsLeg(horas, o.cod, leg, days.map(toISO))
      const costo = costoLeg(horas, personal, categorias, tarifas, o.cod, leg, days)
      if (hs === 0) return
      const cat = categorias.find(c => c.id === p.cat_id)
      if (!trabMap[leg]) trabMap[leg] = { p, obras: [], totalHs: 0, totalCosto: 0 }
      trabMap[leg]!.obras.push({ obra: o, hs, costo, catNom: cat?.nom ?? '—' })
      trabMap[leg]!.totalHs    += hs
      trabMap[leg]!.totalCosto += costo
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
    const pb        = idx > 0 && idx % 5 === 0 ? 'page-break-before:always;' : ''
    const obrasRows = t.obras.map(ob => `
      <tr>
        <td style="padding:4px 8px;font-size:10px;border-bottom:1px solid #eee">${ob.obra.cod}</td>
        <td style="padding:4px 8px;font-size:10px;border-bottom:1px solid #eee">${ob.obra.nom}</td>
        <td style="padding:4px 8px;font-size:10px;border-bottom:1px solid #eee;color:#555">${ob.catNom}</td>
        <td style="padding:4px 8px;font-size:10px;text-align:center;border-bottom:1px solid #eee;font-family:monospace">${fmtH(ob.hs)}</td>
        <td style="padding:4px 8px;font-size:10px;text-align:right;border-bottom:1px solid #eee;font-family:monospace">${fmtM(ob.costo)}</td>
      </tr>`).join('')

    recibosHTML += `
    <div style="${pb}margin-bottom:6px;border:1.5px solid #1D3F6E;border-radius:8px;overflow:hidden;font-family:Arial,sans-serif">
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
      <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 14px;background:#F0EFEB;border-top:2px solid #0F2744">
        <div style="font-size:9px;color:#8A8980">Total horas: <b style="color:#1C1C1E;font-family:monospace">${fmtH(t.totalHs)}</b></div>
        <div style="text-align:center;flex:1">
          <div style="border-bottom:1px solid #C0C0C0;width:120px;margin:0 auto 2px"></div>
          <div style="font-size:8px;color:#8A8980">Firma trabajador</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:9px;color:#8A8980;text-transform:uppercase;letter-spacing:.5px">TOTAL A COBRAR</div>
          <div style="font-size:15px;font-weight:700;color:#1A6B3C;font-family:monospace">${fmtM(t.totalCosto)}</div>
        </div>
      </div>
    </div>`
  })

  // ── HTML contratistas ──
  let contratHTML = ''
  contratData.forEach((cd, idx) => {
    const pb    = (trabajadores.length > 0 || idx > 0) && (trabajadores.length + idx) % 5 === 0 ? 'page-break-before:always;' : ''
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
    <div style="${pb}margin-bottom:6px;border:1.5px solid #2C1654;border-radius:8px;overflow:hidden;font-family:Arial,sans-serif">
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

  const totalOp      = trabajadores.reduce((s, t) => s + t.totalCosto, 0)
  const totalContrat = contratData.reduce((s, c) => s + c.totalCosto, 0)

  const win = window.open('', '_blank', 'width=900,height=700')
  if (!win) return null

  win.document.write(`<!DOCTYPE html><html><head>
    <meta charset="UTF-8">
    <title>Recibos — ${periodo}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{background:#f5f5f3;font-family:Arial,sans-serif;padding-top:68px}
      @page{size:A4;margin:10mm}
      @media print{body{background:#fff;padding-top:0}.no-print{display:none}}
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
    <div class="page-grid">${recibosHTML}${contratHTML}</div>
  </body></html>`)
  win.document.close()

  return { trabajadores: trabajadores.length, contratistas: contratData.length, totalOp, totalContrat }
}