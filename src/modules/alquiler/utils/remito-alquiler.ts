// Utilidades de impresión y texto plano para el remito de alquiler de maquinaria.
//
// Dos funciones puras (NO componentes):
// - `imprimirRemitoAlquiler`: abre ventana de impresión A4 (ORIGINAL + DUPLICADO).
//   Calcado del estilo de `imprimirRemito` en certificaciones.
// - `textoRemitoAlquiler`: versión texto plano para WhatsApp / copiar / .txt.

import { EMPRESA } from '@/lib/config/empresa'
import { MAQUINA_TIPO_LABEL, type MaquinaTipo, type RemitoAlquiler } from '../types'
import { fmtHoras } from './horas'

// dd/mm/yyyy desde 'YYYY-MM-DD' por split de strings (NO new Date: corrimiento TZ).
function fmtFecha(s: string | null | undefined): string {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  if (!y || !m || !d) return '—'
  return `${d}/${m}/${y}`
}

// 'HH:MM:SS' → 'HH:MM'. null/vacío → '—'.
function fmtHora(t: string | null | undefined): string {
  if (!t) return '—'
  const [h, m] = t.split(':')
  if (h == null || m == null) return '—'
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`
}

// Tipo legible: usa el label del enum; si no matchea, devuelve el crudo.
function tipoLegible(tipo: string | null | undefined): string {
  if (!tipo) return '—'
  const label = MAQUINA_TIPO_LABEL[tipo as MaquinaTipo]
  return label ?? tipo
}

// Escapa para insertar texto del usuario en el HTML de impresión.
function esc(s: string | null | undefined): string {
  if (!s) return ''
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Abre ventana de impresión con el remito — 2 copias (ORIGINAL + DUPLICADO) en una A4. */
export function imprimirRemitoAlquiler(remito: RemitoAlquiler) {
  const maquinaLinea = [
    esc(remito.maquina_nombre) || '—',
    `(${esc(tipoLegible(remito.maquina_tipo))})`,
    remito.maquina_identificacion ? `· ${esc(remito.maquina_identificacion)}` : '',
  ]
    .filter(Boolean)
    .join(' ')

  const filaTurno = (label: string, ent: string | null, sal: string | null) => `
    <tr style="border-bottom:1px solid #ddd">
      <td style="padding:5px 8px;font-size:11px;font-weight:600">${label}</td>
      <td style="padding:5px 8px;text-align:center;font-size:11px;font-weight:bold">${fmtHora(ent)}</td>
      <td style="padding:5px 8px;text-align:center;font-size:11px;font-weight:bold">${fmtHora(sal)}</td>
    </tr>
  `

  const copiaHtml = (tipo: string) => `
    <div style="border:1px solid #ccc;padding:14px;box-sizing:border-box;page-break-after:${tipo === 'ORIGINAL' ? 'always' : 'auto'};margin-bottom:14px">
      <!-- Header -->
      <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #E8621A;padding-bottom:10px;margin-bottom:14px">
        <div>
          <img src="${EMPRESA.logoUrl}" alt="${esc(EMPRESA.nombre)}" style="height:48px;margin-bottom:5px" onerror="this.style.display='none'" />
          <div style="font-size:18px;font-weight:bold;color:#1A365D">${esc(EMPRESA.nombre)}</div>
          <div style="font-size:10px;color:#666">Remito de alquiler de maquinaria</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:22px;font-weight:bold;color:#E8621A">${esc(remito.numero)}</div>
          <div style="font-size:11px;color:#666">Emitido: ${fmtFecha(remito.fecha_emision)}</div>
          <div style="font-size:9px;color:#999;margin-top:4px;border:1px solid #ccc;padding:1px 5px;border-radius:2px;display:inline-block">${tipo}</div>
        </div>
      </div>

      <!-- Datos -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;font-size:12px">
        <div><strong>Cliente:</strong> ${esc(remito.cliente) || '—'}</div>
        <div><strong>Obra:</strong> ${esc(remito.obra_nombre) || '—'}</div>
        <div><strong>Ubicación:</strong> ${esc(remito.ubicacion) || '—'}</div>
        <div><strong>Fecha de trabajo:</strong> ${fmtFecha(remito.fecha_trabajo)}</div>
        <div style="grid-column:1 / -1"><strong>Máquina:</strong> ${maquinaLinea}</div>
      </div>

      <!-- Horarios -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:14px">
        <thead>
          <tr style="background:#1A365D;color:#fff">
            <th style="padding:6px 8px;text-align:left;font-size:10px">TURNO</th>
            <th style="padding:6px 8px;text-align:center;font-size:10px">ENTRADA</th>
            <th style="padding:6px 8px;text-align:center;font-size:10px">SALIDA</th>
          </tr>
        </thead>
        <tbody>
          ${filaTurno('Mañana', remito.manana_entrada, remito.manana_salida)}
          ${filaTurno('Tarde', remito.tarde_entrada, remito.tarde_salida)}
        </tbody>
        <tfoot>
          <tr style="border-top:2px solid #1A365D">
            <td colspan="2" style="padding:6px 8px;text-align:right;font-weight:bold;font-size:11px">TOTAL</td>
            <td style="padding:6px 8px;text-align:center;font-weight:bold;font-size:13px;color:#E8621A">${fmtHoras(remito.horas)} hs</td>
          </tr>
        </tfoot>
      </table>

      <!-- Detalle -->
      <div style="font-size:11px;margin-bottom:50px">
        <strong>Detalle de trabajos:</strong> ${esc(remito.detalle) || '—'}
      </div>

      <!-- Firmas -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:40px">
        <div style="text-align:center;border-top:1px solid #000;padding-top:5px;font-size:10px">
          CONFORME CLIENTE — Firma y aclaración
        </div>
        <div style="text-align:center;border-top:1px solid #000;padding-top:5px;font-size:10px">
          POR ${esc(EMPRESA.nombre)} — Firma
        </div>
      </div>
    </div>
  `

  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(`
    <html><head><title>Remito ${esc(remito.numero)}</title>
    <style>
      @page { margin: 12mm; size: A4; }
      body { font-family: Arial, sans-serif; color: #000; margin: 0; padding: 0; }
    </style>
    </head><body>
    ${copiaHtml('ORIGINAL')}
    ${copiaHtml('DUPLICADO')}
    </body></html>
  `)
  win.document.close()
  win.print()
}

/** Versión texto plano del remito para WhatsApp / copiar / .txt. */
export function textoRemitoAlquiler(remito: RemitoAlquiler): string {
  const obraLinea = remito.ubicacion
    ? `${remito.obra_nombre ?? '—'} (${remito.ubicacion})`
    : (remito.obra_nombre ?? '—')

  const maquinaLinea = [
    `${remito.maquina_nombre ?? '—'} (${tipoLegible(remito.maquina_tipo)})`,
    remito.maquina_identificacion ? ` · ${remito.maquina_identificacion}` : '',
  ].join('')

  const lineas: string[] = [
    `Remito ${remito.numero} — ${EMPRESA.nombre}`,
    `Fecha de trabajo: ${fmtFecha(remito.fecha_trabajo)}`,
    `Cliente: ${remito.cliente ?? '—'}`,
    `Obra: ${obraLinea}`,
    `Máquina: ${maquinaLinea}`,
    '',
  ]

  // Turnos: se omite la línea si el turno está vacío (ambos extremos null).
  if (remito.manana_entrada || remito.manana_salida) {
    lineas.push(`Mañana: ${fmtHora(remito.manana_entrada)} a ${fmtHora(remito.manana_salida)}`)
  }
  if (remito.tarde_entrada || remito.tarde_salida) {
    lineas.push(`Tarde: ${fmtHora(remito.tarde_entrada)} a ${fmtHora(remito.tarde_salida)}`)
  }
  lineas.push(`Total: ${fmtHoras(remito.horas)} hs`)

  if (remito.detalle) {
    lineas.push('', `Detalle: ${remito.detalle}`)
  }

  return lineas.join('\n')
}
