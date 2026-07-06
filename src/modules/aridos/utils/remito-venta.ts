// Remito de venta de áridos (RV-NNNN): texto plano para WhatsApp/copiar
// y versión imprimible (ORIGINAL + DUPLICADO). El toggle `conPrecios`
// permite emitir el remito de entrega clásico (sin valores) o el
// comprobante con importes.

import { EMPRESA } from '@/lib/config/empresa'
import { esMaterialFlete } from '../types'
import type { MovimientoArido } from '../types'

function esc(s: string | null | undefined): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function fmtFecha(s: string | null | undefined): string {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  if (!y || !m || !d) return '—'
  return `${d}/${m}/${y}`
}

function fmtM(n: number): string {
  return '$' + n.toLocaleString('es-AR', { maximumFractionDigits: 2 })
}

function fmtCant(n: number): string {
  return n.toLocaleString('es-AR', { maximumFractionDigits: 2 })
}

function origenLegible(v: MovimientoArido): string {
  if (v.origen === 'deposito') return 'Depósito propio'
  if (v.origen === 'obra') {
    return esMaterialFlete(v.aridos_materiales?.nombre) ? 'Flete punto a punto' : 'Retiro en obra del cliente'
  }
  return v.aridos_canteras?.nombre ? `Cantera ${v.aridos_canteras.nombre}` : 'Cantera'
}

// Label de la línea de dirección: para el flete es el recorrido A → B.
function direccionLabel(v: MovimientoArido): string {
  if (v.origen === 'obra') {
    return esMaterialFlete(v.aridos_materiales?.nombre) ? 'Recorrido' : 'Retiro en'
  }
  return 'Entrega en'
}

function unidadLinea(v: MovimientoArido): string | null {
  if (!v.aridos_unidades) return v.flete_obs ? `Flete: ${v.flete_obs}` : null
  const u = v.aridos_unidades
  return `${u.nombre} · ${u.patente}${u.chofer ? ` · ${u.chofer}` : ''}`
}

export function textoRemitoVenta(v: MovimientoArido, conPrecios: boolean): string {
  const unidadMedida = v.aridos_materiales?.unidad === 'viaje' ? 'viaje(s)' : 'm³'
  const lineas = [
    `Remito ${v.remito_numero ?? ''} — ${EMPRESA.nombre}`,
    `Fecha: ${fmtFecha(v.fecha)}${v.hora ? ` ${v.hora.slice(0, 5)} hs` : ''}`,
    `Cliente: ${v.aridos_clientes?.nombre ?? '—'}`,
    ``,
    `Material: ${v.aridos_materiales?.nombre ?? '—'}`,
    `Cantidad: ${fmtCant(Number(v.cantidad))} ${unidadMedida}`,
    `Origen: ${origenLegible(v)}`,
  ]
  if (v.entrega_direccion) {
    lineas.push(`${direccionLabel(v)}: ${v.entrega_direccion}${v.aridos_municipios ? ` (${v.aridos_municipios.nombre})` : ''}`)
  }
  const uni = unidadLinea(v)
  if (uni) lineas.push(`Transporte: ${uni}`)
  if (v.remito) lineas.push(`Remito papel N°: ${v.remito}`)
  if (conPrecios && v.precio_unit != null) {
    lineas.push(``, `Precio unitario: ${fmtM(Number(v.precio_unit))}`, `TOTAL: ${fmtM(Number(v.importe ?? 0))}`)
  }
  if (v.obs) lineas.push(``, `Obs: ${v.obs}`)
  return lineas.join('\n')
}

export function imprimirRemitoVenta(v: MovimientoArido, conPrecios: boolean) {
  const unidadMedida = v.aridos_materiales?.unidad === 'viaje' ? 'viaje(s)' : 'm³'
  const uni = unidadLinea(v)

  const fila = (label: string, valor: string) => `
    <tr style="border-bottom:1px solid #ddd">
      <td style="padding:6px 8px;font-size:11px;font-weight:600;width:160px">${label}</td>
      <td style="padding:6px 8px;font-size:12px">${valor}</td>
    </tr>
  `

  const copiaHtml = (tipo: string) => `
    <div style="border:1px solid #ccc;padding:14px;box-sizing:border-box;page-break-after:${tipo === 'ORIGINAL' ? 'always' : 'auto'};margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #E8621A;padding-bottom:10px;margin-bottom:14px">
        <div>
          <img src="${EMPRESA.logoUrl}" alt="${esc(EMPRESA.nombre)}" style="height:48px;margin-bottom:5px" onerror="this.style.display='none'" />
          <div style="font-size:18px;font-weight:bold;color:#1A365D">${esc(EMPRESA.nombre)}</div>
          <div style="font-size:10px;color:#666">Remito de venta de áridos</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:20px;font-weight:bold;color:#E8621A">${esc(v.remito_numero)}</div>
          <div style="font-size:9px;color:#999;margin-top:3px">${tipo}</div>
        </div>
      </div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:14px">
        ${fila('Fecha y hora', `<b>${fmtFecha(v.fecha)}${v.hora ? ` · ${esc(v.hora.slice(0, 5))} hs` : ''}</b>`)}
        ${fila('Cliente', esc(v.aridos_clientes?.nombre) || '—')}
        ${fila('Material', esc(v.aridos_materiales?.nombre) || '—')}
        ${fila('Cantidad', `<b>${fmtCant(Number(v.cantidad))} ${unidadMedida}</b>`)}
        ${fila('Origen', esc(origenLegible(v)))}
        ${v.entrega_direccion ? fila(direccionLabel(v), `${esc(v.entrega_direccion)}${v.aridos_municipios ? ` (${esc(v.aridos_municipios.nombre)})` : ''}`) : ''}
        ${uni ? fila('Transporte', esc(uni)) : ''}
        ${v.remito ? fila('Remito papel N°', esc(v.remito)) : ''}
        ${conPrecios && v.precio_unit != null ? fila('Precio unitario', fmtM(Number(v.precio_unit))) : ''}
        ${conPrecios && v.importe != null ? `
          <tr style="border-top:2px solid #1A365D">
            <td style="padding:8px;font-size:12px;font-weight:bold">TOTAL</td>
            <td style="padding:8px;font-size:15px;font-weight:bold;color:#E8621A">${fmtM(Number(v.importe))}</td>
          </tr>` : ''}
      </table>

      ${v.obs ? `<div style="font-size:11px;margin-bottom:30px"><strong>Observaciones:</strong> ${esc(v.obs)}</div>` : ''}

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:50px">
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
    <html><head><title>Remito ${esc(v.remito_numero)}</title>
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
