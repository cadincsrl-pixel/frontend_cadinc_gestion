'use client'

import { useEffect, useState } from 'react'
import { EMPRESA } from '@/lib/config/empresa'
import type { RemitoEnvio, SolicitudCompra } from '@/types/domain.types'

// ── Preferencia "solo lo que se envía" (2026-08-18) ─────────────────────────
// El remito trae por defecto el estado del pedido completo (pedido/enviado/
// falta) y el historial de envíos. Para entregas donde eso sobra —o donde el
// papel no tiene que revelar el pedido entero— este flag imprime únicamente
// los renglones de ESTE envío. Persistido: la elección se mantiene entre
// visitas, como el orden de obras de la tarja.
//
// Técnicamente "solo envío" = no pasarle `estadoPedido` a htmlRemito. El hook
// existe para que los tres puntos de impresión (borrador, post-generación y
// reimpresión) compartan la misma preferencia en vez de tres checkboxes sueltos.
const SOLO_ENVIO_KEY = 'remito:solo-envio'

export function useSoloEnvio(): [boolean, (v: boolean) => void] {
  const [soloEnvio, setSoloEnvio] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(SOLO_ENVIO_KEY) === '1'
  })
  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(SOLO_ENVIO_KEY, soloEnvio ? '1' : '0')
  }, [soloEnvio])
  return [soloEnvio, setSoloEnvio]
}

export function SoloEnvioCheck({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-2 text-[11px] text-gris-dark cursor-pointer">
      <input
        type="checkbox"
        checked={value}
        onChange={e => onChange(e.target.checked)}
        className="accent-verde w-4 h-4 mt-0.5 shrink-0"
      />
      <span>
        Imprimir <b>solo lo que se envía</b>
        <span className="text-gris-mid"> — sin la tabla del pedido completo ni el historial de envíos anteriores.</span>
      </span>
    </label>
  )
}

// ── Estado del pedido original (pedido / enviado / falta) ───────────────────
// Pedido del dueño (2026-08-05): el remito impreso tiene que mostrar el pedido
// completo de la obra, lo que va en este envío y lo que falta mandar — así el
// capataz sabe qué esperar sin llamar al depósito.

export interface EstadoPedidoItem {
  descripcion: string
  unidad:      string
  pedida:      number   // cantidad efectiva (si se compró menos, la comprada)
  enviada:     number   // acumulado enviado
  falta:       number   // max(0, pedida − enviada)
  rechazado:   boolean
  // Fecha del último envío que incluyó este renglón (null si nunca se envió).
  ultimoEnvio: string | null
}

export interface EnvioHecho {
  numero:  string
  fecha:   string
  esEste:  boolean      // el remito que se está imprimiendo
  detalle: string       // "Cemento x50: 20 un · Hierro del 8: 15 barras"
}

export interface EstadoPedido {
  etiqueta: string      // "Pedido #45 · 28/07/2026"
  items:    EstadoPedidoItem[]
  // Historial de envíos parciales del pedido, en orden cronológico. Opcional:
  // si no hay datos de otros remitos, la tabla de estado sale igual.
  envios?:  EnvioHecho[]
}

// Historial de envíos ANTERIORES del pedido: un renglón por remito con fecha
// y detalle. El remito actual se excluye — su contenido ya es la tabla
// principal del papel y repetirlo abajo era ruido (pedido de Franco
// 2026-08-06). `remitosDeLaSolicitud` puede o no incluirlo — se filtra por
// número igual.
export function armarEnvios(remito: RemitoEnvio, remitosDeLaSolicitud: RemitoEnvio[]): EnvioHecho[] {
  return remitosDeLaSolicitud
    .filter(r => r.numero !== remito.numero)
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.numero.localeCompare(b.numero))
    .map(r => ({
      numero:  r.numero,
      fecha:   r.fecha,
      esEste:  false,
      detalle: r.items.map(it => `${it.descripcion}: ${it.cantidad} ${it.unidad}`).join(' · '),
    }))
}

/**
 * Arma la tabla de estado del pedido para imprimir en el remito.
 *
 * `sumarEsteRemito`: al IMPRIMIR RECIÉN CREADO el remito, el cache de
 * solicitudes todavía tiene el acumulado viejo (el backend ya lo actualizó,
 * pero el refetch no llegó) → hay que sumarle lo de este remito. En las
 * REIMPRESIONES el cache ya lo incluye → false, y la tabla sale con el estado
 * de HOY (que para reclamar faltantes es lo que sirve).
 */
export function armarEstadoPedido(
  solicitud: Pick<SolicitudCompra, 'id' | 'fecha' | 'items'>,
  remito: RemitoEnvio,
  opts: { sumarEsteRemito: boolean },
  // Remitos previos del pedido (opcional): con ellos se calcula la fecha del
  // último envío de cada renglón. El remito actual cuenta siempre.
  remitosPrevios: RemitoEnvio[] = [],
): EstadoPedido {
  const enEsteRemito = new Map<number, number>()
  for (const ri of remito.items) {
    if (ri.item_id != null) {
      enEsteRemito.set(ri.item_id, (enEsteRemito.get(ri.item_id) ?? 0) + Number(ri.cantidad))
    }
  }

  // Último envío por ítem: la fecha más nueva entre todos los remitos del
  // pedido que incluyeron ese renglón (dedup por número contra el actual).
  const ultimoEnvioPorItem = new Map<number, string>()
  for (const r of [remito, ...remitosPrevios.filter(r => r.numero !== remito.numero)]) {
    for (const ri of r.items) {
      if (ri.item_id == null) continue
      const prev = ultimoEnvioPorItem.get(ri.item_id)
      if (!prev || r.fecha > prev) ultimoEnvioPorItem.set(ri.item_id, r.fecha)
    }
  }

  const items: EstadoPedidoItem[] = solicitud.items.map(it => {
    const pedida    = Number(it.cantidad_comprada ?? it.cantidad)
    const rechazado = it.estado === 'rechazado'
    let enviada = Number(it.cantidad_enviada ?? 0)
    if (opts.sumarEsteRemito && it.id != null) enviada += enEsteRemito.get(it.id) ?? 0
    // Ítems marcados 'enviado' de antes de los envíos parciales (jul 2026)
    // pueden no tener acumulado cargado: enviado completo es la verdad.
    if (it.estado === 'enviado' && enviada < pedida) enviada = pedida
    if (enviada > pedida) enviada = pedida
    return {
      descripcion: it.descripcion,
      unidad:      it.unidad,
      pedida,
      enviada,
      falta:       rechazado ? 0 : Math.max(0, pedida - enviada),
      rechazado,
      // Fallback a fecha_envio del ítem (envíos completos viejos sin remito
      // rastreable en la lista).
      ultimoEnvio: (it.id != null ? ultimoEnvioPorItem.get(it.id) : null) ?? it.fecha_envio ?? null,
    }
  })

  return { etiqueta: `Pedido #${solicitud.id} · ${fmtF(solicitud.fecha)}`, items }
}

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
export function htmlRemito(
  remito: RemitoEnvio,
  obraNom?: string,
  estadoPedido?: EstadoPedido,
  opts?: { borrador?: boolean },
): string {
  // SIN precios: el remito lo leen los operarios en la obra y no tienen por
  // qué ver cuánto costó cada cosa (pedido de Franco 2026-08-06). Los precios
  // viven en el sistema, no en el papel.
  // BORRADOR (2026-08-07): vista previa ANTES de generar el remito definitivo
  // — una sola copia, sin número, con banner "SIN VALIDEZ". No toca nada del
  // sistema: es para revisar el papel antes de confirmar (imprimían el
  // definitivo y recién ahí veían los errores de carga).
  const borrador = opts?.borrador === true
  // La tabla de estado del pedido también ocupa renglones: cuenta para decidir
  // si el triplicado entra en una hoja (+2 por título y encabezado).
  const renglones = remito.items.length
    + (estadoPedido ? estadoPedido.items.length + 2 : 0)
    + (estadoPedido?.envios?.length ? estadoPedido.envios.length + 1 : 0)
  const compacto = !borrador && renglones <= MAX_RENGLONES_COMPACTO

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
    </tr>
  `).join('')

  // Estado del pedido original: pedido / enviado / falta por ítem. El capataz
  // ve en el papel qué le mandaron y qué tiene que seguir esperando.
  const estadoHtml = !estadoPedido ? '' : `
      <div style="margin-top:6px">
        <div style="font-size:${fz.chico};font-weight:bold;color:#1A365D;border-bottom:1px solid #1A365D;padding-bottom:1px;margin-bottom:2px">
          ESTADO DEL PEDIDO ORIGINAL — ${estadoPedido.etiqueta}
        </div>
        <table style="width:100%;border-collapse:collapse">
          <thead><tr style="background:#eef1f6;color:#1A365D">
            <th style="padding:1px 4px;text-align:left;font-size:${fz.chico}">MATERIAL</th>
            <th style="padding:1px 4px;text-align:center;font-size:${fz.chico}">PEDIDO</th>
            <th style="padding:1px 4px;text-align:center;font-size:${fz.chico}">ENVIADO</th>
            <th style="padding:1px 4px;text-align:center;font-size:${fz.chico}">FALTA</th>
            <th style="padding:1px 4px;text-align:center;font-size:${fz.chico}">ÚLT. ENVÍO</th>
          </tr></thead>
          <tbody>
            ${estadoPedido.items.map(it => `
            <tr style="border-bottom:1px solid #eee${it.rechazado ? ';color:#999' : ''}">
              <td style="padding:1px 4px;font-size:${fz.chico}">${it.descripcion}</td>
              <td style="padding:1px 4px;text-align:center;font-size:${fz.chico}">${it.pedida} ${it.unidad}</td>
              <td style="padding:1px 4px;text-align:center;font-size:${fz.chico}">${it.rechazado ? '—' : it.enviada}</td>
              <td style="padding:1px 4px;text-align:center;font-size:${fz.chico};font-weight:bold">
                ${it.rechazado ? 'rechazado' : it.falta > 0 ? `<span style="color:#E8621A">${it.falta}</span>` : '✓'}
              </td>
              <td style="padding:1px 4px;text-align:center;font-size:${fz.chico}">${it.ultimoEnvio ? fmtF(it.ultimoEnvio) : '—'}</td>
            </tr>`).join('')}
          </tbody>
        </table>
        ${estadoPedido.envios?.length ? `
        <div style="font-size:${fz.chico};font-weight:bold;color:#1A365D;margin-top:3px">ENVÍOS ANTERIORES</div>
        ${estadoPedido.envios.map(e => `
        <div style="font-size:${fz.chico};padding:1px 4px;border-bottom:1px solid #eee">
          ${e.numero} · ${fmtF(e.fecha)} — ${e.detalle}
        </div>`).join('')}
        ` : ''}
      </div>
  `

  // Compacto: min-height de un tercio de hoja + prohibido partir (entra seguro
  // porque el modo sólo corre con pocos renglones). Largo: SIN min-height y SIN
  // page-break-inside:avoid — es exactamente lo que recortaba la tabla — y cada
  // copia empieza en hoja nueva.
  const estiloCopia = (esUltima: boolean) => compacto
    ? 'border:1px solid #ccc;padding:8px;min-height:calc(33.33vh - 14px);box-sizing:border-box;display:flex;flex-direction:column;page-break-inside:avoid'
    : `border:1px solid #ccc;padding:12px;box-sizing:border-box${esUltima ? '' : ';page-break-after:always'}`

  const bannerBorrador = borrador ? `
      <div style="border:2px dashed #E8621A;color:#E8621A;font-weight:bold;text-align:center;padding:5px;margin-bottom:8px;font-size:13px;letter-spacing:1px">
        BORRADOR — SIN VALIDEZ · Verificá cantidades y materiales; el remito definitivo se genera desde el sistema
      </div>` : ''

  const copiaHtml = (tipo: string, esUltima: boolean) => `
    <div style="${estiloCopia(esUltima)}">
      ${bannerBorrador}
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
        </tr></thead>
        <tbody>${itemsHtml}</tbody>
      </table>
      ${estadoHtml}
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
    ${borrador
      ? copiaHtml('BORRADOR', true)
      : copiaHtml('ORIGINAL', false) + copiaHtml('DUPLICADO', false) + copiaHtml('TRIPLICADO', true)}
    </body></html>
  `
}

/**
 * Abre la ventana de impresión del remito. Hasta 15 renglones: triplicado en
 * una hoja. Más: una copia por hoja, con la tabla partida entre páginas.
 */
export function imprimirRemito(remito: RemitoEnvio, obraNom?: string, estadoPedido?: EstadoPedido, opts?: { borrador?: boolean }) {
  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(htmlRemito(remito, obraNom, estadoPedido, opts))
  win.document.close()
  win.print()
}
