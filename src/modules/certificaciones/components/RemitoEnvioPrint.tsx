'use client'

import { EMPRESA } from '@/lib/config/empresa'
import type { RemitoEnvio } from '@/types/domain.types'

function fmtF(s: string) { const [y,m,d] = s.split('-'); return `${d}/${m}/${y}` }
function fmtM(n: number) { return '$' + n.toLocaleString('es-AR', { maximumFractionDigits: 0 }) }

interface Props {
  remito: RemitoEnvio
  obraNom?: string
}

export function RemitoEnvioPrint({ remito, obraNom }: Props) {
  const total = remito.items.reduce((s, it) => s + (it.precio_unit ?? 0) * it.cantidad, 0)

  return (
    <div className="print-only" style={{ fontFamily: 'Arial, sans-serif', fontSize: '12px', color: '#000', padding: '20px' }}>
      {/* Se imprime 2 veces: original + duplicado */}
      {[0, 1].map(copia => (
        <div key={copia} style={{ pageBreakAfter: copia === 0 ? 'always' : 'auto', marginBottom: '20px' }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #E8621A', paddingBottom: '10px', marginBottom: '15px' }}>
            <div>
              <img src={EMPRESA.logoUrl} alt={EMPRESA.nombre} style={{ height: '50px', marginBottom: '5px' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#1A365D' }}>{EMPRESA.nombre}</div>
              <div style={{ fontSize: '10px', color: '#666' }}>Remito de envío de materiales</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#E8621A' }}>{remito.numero}</div>
              <div style={{ fontSize: '11px', color: '#666' }}>Fecha: {fmtF(remito.fecha)}</div>
              <div style={{ fontSize: '10px', color: '#999', marginTop: '4px' }}>{copia === 0 ? 'ORIGINAL' : 'DUPLICADO'}</div>
            </div>
          </div>

          {/* Datos */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '15px', fontSize: '11px' }}>
            <div><strong>Obra destino:</strong> {remito.obra_cod} {obraNom ? `— ${obraNom}` : ''}</div>
            <div><strong>Origen:</strong> {remito.origen === 'deposito' ? 'Depósito CADINC' : remito.origen}</div>
            {remito.obs && <div style={{ gridColumn: '1 / -1' }}><strong>Obs:</strong> {remito.obs}</div>}
          </div>

          {/* Tabla */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '15px' }}>
            <thead>
              <tr style={{ backgroundColor: '#1A365D', color: '#fff' }}>
                <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: '10px' }}>#</th>
                <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: '10px' }}>MATERIAL</th>
                <th style={{ padding: '6px 8px', textAlign: 'center', fontSize: '10px' }}>CANT.</th>
                <th style={{ padding: '6px 8px', textAlign: 'center', fontSize: '10px' }}>UNIDAD</th>
                <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: '10px' }}>ORIGEN</th>
                <th style={{ padding: '6px 8px', textAlign: 'right', fontSize: '10px' }}>P. UNIT.</th>
                <th style={{ padding: '6px 8px', textAlign: 'right', fontSize: '10px' }}>TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {remito.items.map((it, i) => (
                <tr key={it.id} style={{ borderBottom: '1px solid #ddd' }}>
                  <td style={{ padding: '5px 8px', fontSize: '10px', color: '#666' }}>{i + 1}</td>
                  <td style={{ padding: '5px 8px', fontSize: '11px', fontWeight: 500 }}>{it.descripcion}</td>
                  <td style={{ padding: '5px 8px', textAlign: 'center', fontWeight: 'bold' }}>{it.cantidad}</td>
                  <td style={{ padding: '5px 8px', textAlign: 'center', fontSize: '10px' }}>{it.unidad}</td>
                  <td style={{ padding: '5px 8px', fontSize: '10px' }}>{it.proveedor || (it.origen === 'deposito' ? 'Depósito' : it.origen)}</td>
                  <td style={{ padding: '5px 8px', textAlign: 'right', fontSize: '10px' }}>{it.precio_unit ? fmtM(it.precio_unit) : '—'}</td>
                  <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 'bold', fontSize: '11px' }}>{it.precio_unit ? fmtM(it.precio_unit * it.cantidad) : '—'}</td>
                </tr>
              ))}
            </tbody>
            {total > 0 && (
              <tfoot>
                <tr style={{ borderTop: '2px solid #1A365D' }}>
                  <td colSpan={6} style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 'bold', fontSize: '11px' }}>TOTAL</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 'bold', fontSize: '13px', color: '#E8621A' }}>{fmtM(total)}</td>
                </tr>
              </tfoot>
            )}
          </table>

          {/* Firmas */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px', marginTop: '60px' }}>
            <div style={{ textAlign: 'center', borderTop: '1px solid #000', paddingTop: '5px', fontSize: '10px' }}>
              ENTREGÓ — Firma y aclaración
            </div>
            <div style={{ textAlign: 'center', borderTop: '1px solid #000', paddingTop: '5px', fontSize: '10px' }}>
              RECIBIÓ — Firma y aclaración
            </div>
          </div>
        </div>
      ))}

      <style>{`
        @media screen { .print-only { display: none; } }
        @media print {
          .print-only { display: block !important; }
          body > *:not(.print-only) { display: none !important; }
          @page { margin: 15mm; }
        }
      `}</style>
    </div>
  )
}

// Hasta acá entra el triplicado en UNA hoja A4 (medido: header + datos +
// firmas dejan ~250px por copia; a ~13px el renglón entran ~19, y las
// descripciones largas envuelven a 2 líneas — 15 deja margen). Por encima, el
// remito pasa a una copia por hoja con la tabla fluyendo entre páginas.
const MAX_RENGLONES_COMPACTO = 15

/**
 * HTML del remito, extraído puro para poder testearlo sin navegador.
 *
 * Dos modos:
 * - COMPACTO (hasta MAX_RENGLONES_COMPACTO renglones): original + duplicado +
 *   triplicado apilados en una sola hoja A4. Es el formato de siempre.
 * - LARGO: cada copia arranca en su propia hoja y la tabla se parte entre
 *   páginas (el <thead> se repite solo en cada página — comportamiento nativo
 *   de imprimir tablas). Las firmas van al final de la tabla de cada copia.
 *
 * Por qué existe el modo largo: antes el compacto se usaba SIEMPRE, y cada
 * copia tenía min-height fijo + page-break-inside:avoid. Un bloque que no
 * puede partirse y no entra en la página se RECORTA en silencio: con más de
 * ~20 artículos el remito salía incompleto y nadie lo notaba hasta contar los
 * renglones contra el sistema (reportado el 2026-07-30).
 */
export function htmlRemito(remito: RemitoEnvio, obraNom?: string): string {
  const total = remito.items.reduce((s, it) => s + (it.precio_unit ?? 0) * it.cantidad, 0)
  const compacto = remito.items.length <= MAX_RENGLONES_COMPACTO

  // El modo largo usa cuerpos un punto más grandes: ya no hay que hacer entrar
  // tres copias en una hoja, y el remito se lee en el galpón, no en un monitor.
  const fz = compacto
    ? { texto: '8px', chico: '7px', titulo: '13px', total: '9px' }
    : { texto: '10px', chico: '9px', titulo: '15px', total: '11px' }

  const itemsHtml = remito.items.map((it, i) => `
    <tr style="border-bottom:1px solid #ddd">
      <td style="padding:2px 4px;font-size:${fz.texto};color:#666">${i + 1}</td>
      <td style="padding:2px 4px;font-size:${fz.texto}">${it.descripcion}</td>
      <td style="padding:2px 4px;text-align:center;font-weight:bold;font-size:${fz.texto}">${it.cantidad}</td>
      <td style="padding:2px 4px;text-align:center;font-size:${fz.chico}">${it.unidad}</td>
      <td style="padding:2px 4px;font-size:${fz.chico}">${it.proveedor || (it.origen === 'deposito' ? 'Depósito' : it.origen)}</td>
      <td style="padding:2px 4px;text-align:right;font-size:${fz.texto};font-weight:bold">${it.precio_unit ? fmtM(it.precio_unit * it.cantidad) : '—'}</td>
    </tr>
  `).join('')

  // Compacto: min-height de un tercio de hoja + prohibido partir (entra seguro
  // porque el modo sólo corre con pocos renglones). Largo: SIN min-height y SIN
  // page-break-inside:avoid — es exactamente lo que recortaba la tabla — y cada
  // copia empieza en hoja nueva.
  const estiloCopia = (esUltima: boolean) => compacto
    ? 'border:1px solid #ccc;padding:8px;min-height:calc(33.33vh - 14px);box-sizing:border-box;display:flex;flex-direction:column;page-break-inside:avoid'
    : `border:1px solid #ccc;padding:12px;box-sizing:border-box${esUltima ? '' : ';page-break-after:always'}`

  const copiaHtml = (tipo: string, esUltima: boolean) => `
    <div style="${estiloCopia(esUltima)}">
      <!-- Header -->
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1.5px solid #E8621A;padding-bottom:4px;margin-bottom:6px">
        <div>
          <span style="font-size:12px;font-weight:bold;color:#1A365D">${EMPRESA.nombre}</span>
          <span style="font-size:${fz.chico};color:#666;margin-left:6px">Remito de envío</span>
        </div>
        <div style="text-align:right">
          <span style="font-size:${fz.titulo};font-weight:bold;color:#E8621A">${remito.numero}</span>
          <span style="font-size:${fz.texto};color:#666;margin-left:8px">${fmtF(remito.fecha)}</span>
          <span style="font-size:${fz.chico};color:#999;margin-left:6px;border:1px solid #ccc;padding:1px 4px;border-radius:2px">${tipo}</span>
        </div>
      </div>
      <!-- Datos -->
      <div style="display:flex;gap:15px;margin-bottom:5px;font-size:${fz.texto}">
        <div><strong>Obra:</strong> ${remito.obra_cod}${obraNom ? ` — ${obraNom}` : ''}</div>
        <div><strong>Origen:</strong> ${remito.origen === 'deposito' ? 'Depósito CADINC' : remito.origen}</div>
        ${remito.obs ? `<div><strong>Obs:</strong> ${remito.obs}</div>` : ''}
      </div>
      <!-- Tabla -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:4px">
        <thead><tr style="background:#1A365D;color:#fff">
          <th style="padding:2px 4px;text-align:left;font-size:${fz.chico}">#</th>
          <th style="padding:2px 4px;text-align:left;font-size:${fz.chico}">MATERIAL</th>
          <th style="padding:2px 4px;text-align:center;font-size:${fz.chico}">CANT.</th>
          <th style="padding:2px 4px;text-align:center;font-size:${fz.chico}">UNID.</th>
          <th style="padding:2px 4px;text-align:left;font-size:${fz.chico}">ORIGEN</th>
          <th style="padding:2px 4px;text-align:right;font-size:${fz.chico}">TOTAL</th>
        </tr></thead>
        <tbody>${itemsHtml}</tbody>
        ${total > 0 ? `<tfoot><tr style="border-top:1.5px solid #1A365D">
          <td colspan="5" style="padding:2px 4px;text-align:right;font-weight:bold;font-size:${fz.texto}">TOTAL</td>
          <td style="padding:2px 4px;text-align:right;font-weight:bold;font-size:${fz.total};color:#E8621A">${fmtM(total)}</td>
        </tr></tfoot>` : ''}
      </table>
      <!-- Firmas: en flujo normal (no absolute) — bajan con el contenido en vez
           de pisarlo. En compacto margin-top:auto las manda al pie del tercio;
           en largo van pegadas al final de la tabla, sin separarse solas de
           ella en un salto de página. -->
      <div style="display:flex;gap:20px;${compacto ? 'margin-top:auto' : 'margin-top:24px'};padding-top:10px;page-break-inside:avoid">
        <div style="flex:1;text-align:center;border-top:1px solid #000;padding-top:2px;font-size:${fz.chico}">ENTREGÓ</div>
        <div style="flex:1;text-align:center;border-top:1px solid #000;padding-top:2px;font-size:${fz.chico}">RECIBIÓ</div>
        <div style="flex:1;text-align:center;border-top:1px solid #000;padding-top:2px;font-size:${fz.chico}">TRANSPORTE</div>
      </div>
    </div>
  `

  // body como flex sólo en compacto: display:flex en el body rompe los saltos
  // de página de los hijos en Chrome, y el modo largo depende de esos saltos.
  const estiloBody = compacto ? 'display:flex;flex-direction:column;gap:4px' : ''

  return `
    <html><head><title>Remito ${remito.numero}</title>
    <style>
      @page { margin: 8mm; size: A4; }
      body { font-family: Arial, sans-serif; color: #000; margin: 0; padding: 0; }
    </style>
    </head><body style="${estiloBody}">
    ${copiaHtml('ORIGINAL', false)}
    ${copiaHtml('DUPLICADO', false)}
    ${copiaHtml('TRIPLICADO', true)}
    </body></html>
  `
}

/**
 * Abre la ventana de impresión del remito. Hasta 15 renglones: triplicado en
 * una hoja. Más: una copia por hoja, con la tabla partida entre páginas.
 */
export function imprimirRemito(remito: RemitoEnvio, obraNom?: string) {
  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(htmlRemito(remito, obraNom))
  win.document.close()
  win.print()
}
