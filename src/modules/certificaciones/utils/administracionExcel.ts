// Excel de la cuenta por administración. A diferencia del PDF (que es para el
// cliente y esconde los porcentajes), este es de trabajo: lleva costo, % y
// facturable de cada pata, semana por semana y mes por mes.
import ExcelJS from 'exceljs'
import { toISO } from '@/lib/utils/dates'
import { EMPRESA } from '@/lib/config/empresa'
import type { Obra, CuentaClienteCobro } from '@/types/domain.types'
import type { SemanaAdmin, MesMateriales } from '../components/cuenta-corriente/useAdministracionCuenta'

const FMT_MONEDA = '"$"#,##0;[Red]"-$"#,##0;"—"'
const C_AZUL   = 'FF1F3A66'
const C_BLANCO = 'FFFFFFFF'

export interface AdministracionExcelArgs {
  obra:    Obra
  semanas: SemanaAdmin[]
  meses:   MesMateriales[]
  tot:     { mo: number; cont: number; mat: number; total: number; cobrado: number; saldo: number }
  cobros:  CuentaClienteCobro[]
}

export async function exportarAdministracionExcel({ obra, semanas, meses, tot, cobros }: AdministracionExcelArgs): Promise<void> {
  const wb = new ExcelJS.Workbook()
  wb.creator = EMPRESA.nombre

  const ws = wb.addWorksheet('Administración')
  ws.columns = [
    { width: 16 }, { width: 15 }, { width: 8 }, { width: 15 },
    { width: 15 }, { width: 8 }, { width: 15 },
  ]

  const titulo = ws.addRow([`${obra.nom} (${obra.cod}) — cuenta por administración al ${toISO(new Date())}`])
  titulo.font = { bold: true, size: 13, color: { argb: C_AZUL } }
  ws.addRow([])

  const resumen: [string, number][] = [
    ['Mano de obra', tot.mo], ['Contratistas', tot.cont], ['Materiales', tot.mat],
    ['Total', tot.total], ['Pagos recibidos', tot.cobrado], ['SALDO', tot.saldo],
  ]
  for (const [etiqueta, monto] of resumen) {
    const r = ws.addRow([etiqueta, monto])
    r.getCell(2).numFmt = FMT_MONEDA
    if (etiqueta === 'Total' || etiqueta === 'SALDO') r.font = { bold: true }
  }
  ws.addRow([])

  const head = (fila: ExcelJS.Row) => {
    fila.font = { bold: true, color: { argb: C_BLANCO } }
    fila.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_AZUL } } })
  }

  head(ws.addRow(['Semana', 'Mano de obra', '%', 'Facturable', 'Contratistas', '%', 'Facturable']))
  for (const s of [...semanas].sort((a, b) => a.semKey.localeCompare(b.semKey))) {
    const r = ws.addRow([s.semKey, s.moCosto, s.moPct / 100, s.moFacturable, s.contCosto, s.contPct / 100, s.contFacturable])
    ;[2, 4, 5, 7].forEach(i => { r.getCell(i).numFmt = FMT_MONEDA })
    ;[3, 6].forEach(i => { r.getCell(i).numFmt = '0.0%' })
  }
  ws.addRow([])

  head(ws.addRow(['Mes', 'Materiales', '%', 'Facturable']))
  for (const m of [...meses].sort((a, b) => a.mes.localeCompare(b.mes))) {
    const pct = m.costo ? m.facturable / m.costo - 1 : 0
    const r = ws.addRow([m.mes, m.costo, pct, m.facturable])
    ;[2, 4].forEach(i => { r.getCell(i).numFmt = FMT_MONEDA })
    r.getCell(3).numFmt = '0.0%'
  }
  ws.addRow([])

  head(ws.addRow(['Fecha de pago', 'Medio', 'Monto']))
  for (const c of cobros) {
    const r = ws.addRow([c.fecha, c.medio ?? '—', Number(c.monto ?? 0)])
    r.getCell(3).numFmt = FMT_MONEDA
  }

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Administracion_${obra.cod.replace(/[^\w-]+/g, '_')}_${toISO(new Date())}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}
