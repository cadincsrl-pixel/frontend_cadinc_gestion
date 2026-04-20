'use client'

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
              <img src="/logo-cadinc.png" alt="CADINC" style={{ height: '50px', marginBottom: '5px' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#1A365D' }}>CADINC SRL</div>
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

/** Abre ventana de impresión con el remito */
export function imprimirRemito(remito: RemitoEnvio, obraNom?: string) {
  const total = remito.items.reduce((s, it) => s + (it.precio_unit ?? 0) * it.cantidad, 0)
  const fmtF = (s: string) => { const [y,m,d] = s.split('-'); return `${d}/${m}/${y}` }
  const fmtM = (n: number) => '$' + n.toLocaleString('es-AR', { maximumFractionDigits: 0 })

  const itemsHtml = remito.items.map((it, i) => `
    <tr style="border-bottom:1px solid #ddd">
      <td style="padding:5px 8px;font-size:10px;color:#666">${i + 1}</td>
      <td style="padding:5px 8px;font-size:11px;font-weight:500">${it.descripcion}</td>
      <td style="padding:5px 8px;text-align:center;font-weight:bold">${it.cantidad}</td>
      <td style="padding:5px 8px;text-align:center;font-size:10px">${it.unidad}</td>
      <td style="padding:5px 8px;font-size:10px">${it.proveedor || (it.origen === 'deposito' ? 'Depósito' : it.origen)}</td>
      <td style="padding:5px 8px;text-align:right;font-size:10px">${it.precio_unit ? fmtM(it.precio_unit) : '—'}</td>
      <td style="padding:5px 8px;text-align:right;font-weight:bold;font-size:11px">${it.precio_unit ? fmtM(it.precio_unit * it.cantidad) : '—'}</td>
    </tr>
  `).join('')

  const copiaHtml = (tipo: string) => `
    <div style="margin-bottom:20px;${tipo === 'ORIGINAL' ? 'page-break-after:always' : ''}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #E8621A;padding-bottom:10px;margin-bottom:15px">
        <div>
          <div style="font-size:18px;font-weight:bold;color:#1A365D">CADINC SRL</div>
          <div style="font-size:10px;color:#666">Remito de envío de materiales</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:20px;font-weight:bold;color:#E8621A">${remito.numero}</div>
          <div style="font-size:11px;color:#666">Fecha: ${fmtF(remito.fecha)}</div>
          <div style="font-size:10px;color:#999;margin-top:4px">${tipo}</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:15px;font-size:11px">
        <div><strong>Obra destino:</strong> ${remito.obra_cod}${obraNom ? ` — ${obraNom}` : ''}</div>
        <div><strong>Origen:</strong> ${remito.origen === 'deposito' ? 'Depósito CADINC' : remito.origen}</div>
        ${remito.obs ? `<div style="grid-column:1/-1"><strong>Obs:</strong> ${remito.obs}</div>` : ''}
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:15px">
        <thead><tr style="background:#1A365D;color:#fff">
          <th style="padding:6px 8px;text-align:left;font-size:10px">#</th>
          <th style="padding:6px 8px;text-align:left;font-size:10px">MATERIAL</th>
          <th style="padding:6px 8px;text-align:center;font-size:10px">CANT.</th>
          <th style="padding:6px 8px;text-align:center;font-size:10px">UNIDAD</th>
          <th style="padding:6px 8px;text-align:left;font-size:10px">ORIGEN</th>
          <th style="padding:6px 8px;text-align:right;font-size:10px">P. UNIT.</th>
          <th style="padding:6px 8px;text-align:right;font-size:10px">TOTAL</th>
        </tr></thead>
        <tbody>${itemsHtml}</tbody>
        ${total > 0 ? `<tfoot><tr style="border-top:2px solid #1A365D">
          <td colspan="6" style="padding:6px 8px;text-align:right;font-weight:bold;font-size:11px">TOTAL</td>
          <td style="padding:6px 8px;text-align:right;font-weight:bold;font-size:13px;color:#E8621A">${fmtM(total)}</td>
        </tr></tfoot>` : ''}
      </table>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:60px">
        <div style="text-align:center;border-top:1px solid #000;padding-top:5px;font-size:10px">ENTREGÓ — Firma y aclaración</div>
        <div style="text-align:center;border-top:1px solid #000;padding-top:5px;font-size:10px">RECIBIÓ — Firma y aclaración</div>
      </div>
    </div>
  `

  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(`
    <html><head><title>Remito ${remito.numero}</title>
    <style>@page{margin:15mm}body{font-family:Arial,sans-serif;font-size:12px;color:#000;margin:0;padding:20px}</style>
    </head><body>
    ${copiaHtml('ORIGINAL')}
    ${copiaHtml('DUPLICADO')}
    </body></html>
  `)
  win.document.close()
  win.print()
}
