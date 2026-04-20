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

/** Abre ventana de impresión con el remito — triplicado en 1 página */
export function imprimirRemito(remito: RemitoEnvio, obraNom?: string) {
  const total = remito.items.reduce((s, it) => s + (it.precio_unit ?? 0) * it.cantidad, 0)
  const fmtF = (s: string) => { const [y,m,d] = s.split('-'); return `${d}/${m}/${y}` }
  const fmtM = (n: number) => '$' + n.toLocaleString('es-AR', { maximumFractionDigits: 0 })

  const itemsHtml = remito.items.map((it, i) => `
    <tr style="border-bottom:1px solid #ddd">
      <td style="padding:2px 4px;font-size:8px;color:#666">${i + 1}</td>
      <td style="padding:2px 4px;font-size:8px">${it.descripcion}</td>
      <td style="padding:2px 4px;text-align:center;font-weight:bold;font-size:8px">${it.cantidad}</td>
      <td style="padding:2px 4px;text-align:center;font-size:7px">${it.unidad}</td>
      <td style="padding:2px 4px;font-size:7px">${it.proveedor || (it.origen === 'deposito' ? 'Depósito' : it.origen)}</td>
      <td style="padding:2px 4px;text-align:right;font-size:8px;font-weight:bold">${it.precio_unit ? fmtM(it.precio_unit * it.cantidad) : '—'}</td>
    </tr>
  `).join('')

  const copiaHtml = (tipo: string) => `
    <div style="border:1px solid #ccc;padding:8px;height:calc(33.33vh - 14px);box-sizing:border-box;overflow:hidden;position:relative">
      <!-- Header -->
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1.5px solid #E8621A;padding-bottom:4px;margin-bottom:6px">
        <div>
          <span style="font-size:12px;font-weight:bold;color:#1A365D">CADINC SRL</span>
          <span style="font-size:7px;color:#666;margin-left:6px">Remito de envío</span>
        </div>
        <div style="text-align:right">
          <span style="font-size:13px;font-weight:bold;color:#E8621A">${remito.numero}</span>
          <span style="font-size:8px;color:#666;margin-left:8px">${fmtF(remito.fecha)}</span>
          <span style="font-size:7px;color:#999;margin-left:6px;border:1px solid #ccc;padding:1px 4px;border-radius:2px">${tipo}</span>
        </div>
      </div>
      <!-- Datos -->
      <div style="display:flex;gap:15px;margin-bottom:5px;font-size:8px">
        <div><strong>Obra:</strong> ${remito.obra_cod}${obraNom ? ` — ${obraNom}` : ''}</div>
        <div><strong>Origen:</strong> ${remito.origen === 'deposito' ? 'Depósito CADINC' : remito.origen}</div>
        ${remito.obs ? `<div><strong>Obs:</strong> ${remito.obs}</div>` : ''}
      </div>
      <!-- Tabla -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:4px">
        <thead><tr style="background:#1A365D;color:#fff">
          <th style="padding:2px 4px;text-align:left;font-size:7px">#</th>
          <th style="padding:2px 4px;text-align:left;font-size:7px">MATERIAL</th>
          <th style="padding:2px 4px;text-align:center;font-size:7px">CANT.</th>
          <th style="padding:2px 4px;text-align:center;font-size:7px">UNID.</th>
          <th style="padding:2px 4px;text-align:left;font-size:7px">ORIGEN</th>
          <th style="padding:2px 4px;text-align:right;font-size:7px">TOTAL</th>
        </tr></thead>
        <tbody>${itemsHtml}</tbody>
        ${total > 0 ? `<tfoot><tr style="border-top:1.5px solid #1A365D">
          <td colspan="5" style="padding:2px 4px;text-align:right;font-weight:bold;font-size:8px">TOTAL</td>
          <td style="padding:2px 4px;text-align:right;font-weight:bold;font-size:9px;color:#E8621A">${fmtM(total)}</td>
        </tr></tfoot>` : ''}
      </table>
      <!-- Firmas -->
      <div style="display:flex;gap:20px;position:absolute;bottom:8px;left:8px;right:8px">
        <div style="flex:1;text-align:center;border-top:1px solid #000;padding-top:2px;font-size:7px">ENTREGÓ</div>
        <div style="flex:1;text-align:center;border-top:1px solid #000;padding-top:2px;font-size:7px">RECIBIÓ</div>
        <div style="flex:1;text-align:center;border-top:1px solid #000;padding-top:2px;font-size:7px">TRANSPORTE</div>
      </div>
    </div>
  `

  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(`
    <html><head><title>Remito ${remito.numero}</title>
    <style>
      @page { margin: 8mm; size: A4; }
      body { font-family: Arial, sans-serif; color: #000; margin: 0; padding: 0; }
    </style>
    </head><body style="display:flex;flex-direction:column;height:100vh;gap:4px">
    ${copiaHtml('ORIGINAL')}
    ${copiaHtml('DUPLICADO')}
    ${copiaHtml('TRIPLICADO')}
    </body></html>
  `)
  win.document.close()
  win.print()
}
