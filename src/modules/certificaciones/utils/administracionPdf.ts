// PDF de la cuenta por administración, para llevarle al cliente.
//
// Decisión del user (08/09): el cliente ve SOLO los montos finales — el %
// pactado ya está adentro de cada número y no se imprime. El desglose con
// costo y porcentaje queda en la pantalla, que es para uso interno.
// Mismo stack que el resto de los PDF de cuenta (pdfmake).

import pdfMake from 'pdfmake/build/pdfmake'
import pdfFonts from 'pdfmake/build/vfs_fonts'
import type { TDocumentDefinitions, Content } from 'pdfmake/interfaces'
import { EMPRESA } from '@/lib/config/empresa'
import { getSemLabel } from '@/lib/utils/dates'
import type { Obra, CuentaClienteCobro } from '@/types/domain.types'
import type { SemanaAdmin, MesMateriales } from '../components/cuenta-corriente/useAdministracionCuenta'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(pdfMake as any).vfs = (pdfFonts as any)?.vfs ?? (pdfFonts as any)?.pdfMake?.vfs ?? pdfFonts

const AZUL = '#1A365D'
const NARANJA = '#E8621A'

const fmtM = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')
const fmtFecha = (s: string | null | undefined) => {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
const fmtMesLargo = (mes: string) => {
  const [a, m] = mes.split('-')
  return `${MESES[Number(m) - 1] ?? m} ${a}`
}

export interface AdministracionPdfArgs {
  obra:    Obra
  semanas: SemanaAdmin[]
  meses:   MesMateriales[]
  tot:     { mo: number; cont: number; mat: number; total: number; cobrado: number; saldo: number }
  cobros:  CuentaClienteCobro[]
}

export function descargarAdministracionPdf({ obra, semanas, meses, tot, cobros }: AdministracionPdfArgs): void {
  const hoy = new Date()
  const fechaHoy = hoy.toLocaleDateString('es-AR')

  const filasSemanas = [...semanas].sort((a, b) => a.semKey.localeCompare(b.semKey)).map(s => [
    { text: getSemLabel(new Date(s.semKey + 'T12:00:00')), fontSize: 8 },
    { text: s.moFacturable ? fmtM(s.moFacturable) : '—', alignment: 'right' as const, fontSize: 8 },
    { text: s.contFacturable ? fmtM(s.contFacturable) : '—', alignment: 'right' as const, fontSize: 8 },
    { text: fmtM(s.moFacturable + s.contFacturable), alignment: 'right' as const, fontSize: 8, bold: true },
  ])

  const filasMeses = [...meses].sort((a, b) => a.mes.localeCompare(b.mes)).map(m => [
    { text: fmtMesLargo(m.mes), fontSize: 8 },
    { text: fmtM(m.facturable), alignment: 'right' as const, fontSize: 8, bold: true },
  ])

  const filasCobros = cobros.map(c => [
    { text: fmtFecha(c.fecha), fontSize: 8 },
    { text: c.medio ?? '—', fontSize: 8 },
    { text: fmtM(Number(c.monto ?? 0)), alignment: 'right' as const, fontSize: 8 },
  ])

  const contenido: Content[] = [
    { text: EMPRESA.nombre, color: NARANJA, bold: true, fontSize: 16 },
    { text: 'CUENTA CORRIENTE — OBRA POR ADMINISTRACIÓN', color: AZUL, bold: true, fontSize: 11, margin: [0, 2, 0, 0] },
    { text: `${obra.nom} (${obra.cod}) · al ${fechaHoy}`, fontSize: 9, color: '#555', margin: [0, 2, 0, 12] },

    { text: 'RESUMEN', color: AZUL, bold: true, fontSize: 10, margin: [0, 0, 0, 4] },
    {
      table: {
        widths: ['*', 'auto'],
        body: [
          [{ text: 'Mano de obra', fontSize: 9 }, { text: fmtM(tot.mo), alignment: 'right', fontSize: 9 }],
          [{ text: 'Contratistas', fontSize: 9 }, { text: fmtM(tot.cont), alignment: 'right', fontSize: 9 }],
          [{ text: 'Materiales', fontSize: 9 },   { text: fmtM(tot.mat), alignment: 'right', fontSize: 9 }],
          [{ text: 'Total', fontSize: 9, bold: true }, { text: fmtM(tot.total), alignment: 'right', fontSize: 9, bold: true }],
          [{ text: 'Pagos recibidos', fontSize: 9 }, { text: fmtM(tot.cobrado), alignment: 'right', fontSize: 9 }],
          [{ text: 'SALDO', fontSize: 9, bold: true, color: NARANJA }, { text: fmtM(tot.saldo), alignment: 'right', fontSize: 9, bold: true, color: NARANJA }],
        ],
      },
      layout: 'lightHorizontalLines',
      margin: [0, 0, 0, 14],
    },
  ]

  if (filasSemanas.length) {
    contenido.push(
      { text: 'MANO DE OBRA Y CONTRATISTAS, POR SEMANA', color: AZUL, bold: true, fontSize: 10, margin: [0, 0, 0, 4] },
      {
        table: {
          headerRows: 1,
          widths: ['*', 'auto', 'auto', 'auto'],
          body: [
            ['Semana', 'Mano de obra', 'Contratistas', 'Subtotal'].map(t => ({ text: t, bold: true, fontSize: 8, color: '#fff', fillColor: AZUL })),
            ...filasSemanas,
          ],
        },
        layout: 'lightHorizontalLines',
        margin: [0, 0, 0, 14],
      },
    )
  }

  if (filasMeses.length) {
    contenido.push(
      { text: 'MATERIALES, POR MES', color: AZUL, bold: true, fontSize: 10, margin: [0, 0, 0, 4] },
      {
        table: {
          headerRows: 1,
          widths: ['*', 'auto'],
          body: [
            ['Mes', 'Importe'].map(t => ({ text: t, bold: true, fontSize: 8, color: '#fff', fillColor: AZUL })),
            ...filasMeses,
          ],
        },
        layout: 'lightHorizontalLines',
        margin: [0, 0, 0, 14],
      },
    )
  }

  if (filasCobros.length) {
    contenido.push(
      { text: 'PAGOS RECIBIDOS', color: AZUL, bold: true, fontSize: 10, margin: [0, 0, 0, 4] },
      {
        table: {
          headerRows: 1,
          widths: ['auto', '*', 'auto'],
          body: [
            ['Fecha', 'Medio', 'Monto'].map(t => ({ text: t, bold: true, fontSize: 8, color: '#fff', fillColor: AZUL })),
            ...filasCobros,
          ],
        },
        layout: 'lightHorizontalLines',
      },
    )
  }

  const doc: TDocumentDefinitions = {
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 50],
    footer: (page, total) => ({
      text: `${EMPRESA.nombre} · ${obra.nom} · página ${page} de ${total}`,
      alignment: 'center', fontSize: 7, color: '#999', margin: [0, 10, 0, 0],
    }),
    content: contenido,
  }

  pdfMake.createPdf(doc).download(`Administracion_${obra.cod.replace(/[^\w-]+/g, '_')}_${hoy.toISOString().slice(0, 10)}.pdf`)
}
