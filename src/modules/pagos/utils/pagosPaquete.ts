/**
 * El paquete para el contador (2026-09-21).
 *
 * Pedido del dueño: «exportar paquete de facturas y comprobantes para que el
 * contador pueda cargar en el otro sistema contable», y la corrección que
 * cambia el eje entero: **«que sea sobre lo PAGADO»**.
 *
 * Por eso manda la ORDEN DE PAGO y no la factura. El contador no trabaja por
 * mes de emisión: concilia lo que salió del banco en el período. Una factura
 * de agosto pagada en septiembre entra en septiembre, y filtrando por emisión
 * no aparecía.
 *
 * Cómo queda el ZIP:
 *
 *   2026-09/
 *     OP-0008_NORTE_DISTRIBUCIONES/
 *       pago__comprobante_pago.pdf
 *       factura__A-0011-00000194.jpg
 *   CONTENIDO.txt
 *
 * Una carpeta por OP porque así es como se carga a mano: cada OP es UN
 * movimiento del banco, y adentro está el comprobante con el que salió y las
 * facturas que cubrió. Abrir la carpeta es tener el asiento entero. La carpeta
 * de arriba es el mes de PAGO, que es el período del contador.
 *
 * `CONTENIDO.txt` es la lista de lo que hay adentro —no una planilla de
 * importación—: sirve para saber qué falta sin abrir 80 PDFs.
 */
import JSZip from 'jszip'
import { EMPRESA } from '@/lib/config/empresa'
import { comprobanteTxt, fmtM, fmtFecha, formaPagoLabel } from './pagos.utils'
import type { PagosPaquete, PagosPaqueteArchivo, PagosPaqueteFactura, PagosPaqueteOrden } from '@/types/domain.types'

/** Nombre de archivo utilizable en Windows, Mac y Linux. */
function limpiar(s: string): string {
  return (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // sin tildes: no todos los unzip las respetan
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_').replace(/^_|_$/g, '')
    .slice(0, 60)
}

function extDe(nombre: string, mime: string): string {
  const m = nombre.match(/\.([A-Za-z0-9]{1,5})$/)
  if (m) return m[1]!.toLowerCase()
  const porMime: Record<string, string> = {
    'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png',
    'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif',
  }
  return porMime[mime] ?? 'bin'
}

/** `2026-09/OP-0008_NORTE_DISTRIBUCIONES` — mes de PAGO, y una carpeta por orden. */
export function carpetaDeOrden(o: PagosPaqueteOrden): string {
  const mes = (o.fecha ?? '').slice(0, 7) || 'sin-fecha'
  return `${mes}/${o.numero_fmt}_${limpiar(o.proveedor_nom)}`
}

/**
 * El nombre adentro de la carpeta de la OP. Arranca con `pago__` o
 * `factura__` para que el comprobante quede SIEMPRE primero al ordenar
 * alfabéticamente: es el que dice cuánto salió.
 */
export function nombreEnZip(
  o: PagosPaqueteOrden, a: PagosPaqueteArchivo, usados: Set<string>, f?: PagosPaqueteFactura,
): string {
  const etiqueta = a.origen === 'pago'
    ? `pago__${limpiar(a.tipo)}`
    : `factura__${limpiar(`${f?.tipo_comprobante ?? ''}-${(f?.numero ?? 's-n').replace(/\s+/g, '')}`)}${a.tipo === 'factura' ? '' : `_${limpiar(a.tipo)}`}`
  const base = `${carpetaDeOrden(o)}/${etiqueta}`
  const ext = extDe(a.nombre_archivo, a.mime_type)

  // Dos remitos de la misma factura, o dos comprobantes de la misma OP: se
  // numeran en vez de pisarse.
  let nombre = `${base}.${ext}`
  let i = 2
  while (usados.has(nombre)) nombre = `${base}_${i++}.${ext}`
  usados.add(nombre)
  return nombre
}

export interface ResultadoPaquete {
  archivos:      number
  fallados:      number
  ordenes:       number
  sinComprobante: number
  facturasSinPapel: number
}

/**
 * Baja todo y arma el ZIP. `onProgreso` recibe (hechos, total) para la barra.
 *
 * Un archivo que no baja NO tira abajo el paquete: se anota en CONTENIDO.txt y
 * el resto se entrega igual. Que falle una foto no puede dejar al contador sin
 * las otras 79.
 */
export async function armarPaqueteContador(
  paquete: PagosPaquete,
  descripcionFiltro: string,
  onProgreso?: (hechos: number, total: number) => void,
): Promise<ResultadoPaquete> {
  const zip = new JSZip()
  const usados = new Set<string>()
  const lineas: string[] = []
  let archivos = 0
  let fallados = 0
  let sinComprobante = 0
  let facturasSinPapel = 0

  const total = paquete.ordenes.reduce(
    (s, o) => s + o.archivos.length + o.facturas.reduce((t, f) => t + f.archivos.length, 0), 0)
  let hechos = 0

  const bajar = async (nombre: string, a: PagosPaqueteArchivo, sangria: string) => {
    try {
      if (!a.url) throw new Error('sin URL firmada')
      const r = await fetch(a.url)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      zip.file(nombre, await r.blob())
      archivos++
      lineas.push(`${sangria}${nombre.split('/').pop()}`)
    } catch {
      fallados++
      lineas.push(`${sangria}⚠ NO SE PUDO BAJAR: ${a.nombre_archivo}`)
    }
    onProgreso?.(++hechos, total)
  }

  for (const o of paquete.ordenes) {
    const anulada = o.estado === 'anulada'
    lineas.push('')
    lineas.push(`${carpetaDeOrden(o)}/`)
    lineas.push(`    ${fmtFecha(o.fecha)} · ${o.proveedor_nom} · ${formaPagoLabel(o.forma_pago)}`
      + ` · ${fmtM(Number(o.monto_pagado))}${anulada ? '   ⚠ ANULADA' : ''}`)

    if (o.archivos.length === 0) {
      sinComprobante++
      lineas.push('    ⚠ SIN COMPROBANTE DEL PAGO')
    }
    for (const a of o.archivos) await bajar(nombreEnZip(o, a, usados), a, '    ')

    for (const f of o.facturas) {
      const comp = comprobanteTxt(f.tipo_comprobante ?? 'A', f.numero)
      // «Aplicado» y no el total: en un pago parcial esta OP cubrió una parte,
      // y el contador tiene que ver cuánto entró acá.
      const parcial = f.total != null && Math.abs(Number(f.aplicado) - Number(f.total)) > 0.005
      lineas.push(`    ${comp} · ${fmtM(Number(f.aplicado))}`
        + (parcial ? ` (parcial, la factura es de ${fmtM(Number(f.total))})` : ''))
      if (f.archivos.length === 0) {
        facturasSinPapel++
        lineas.push('        ⚠ FACTURA SIN NINGÚN ARCHIVO')
      }
      for (const a of f.archivos) await bajar(nombreEnZip(o, a, usados, f), a, '        ')
    }
  }

  const cab = [
    `${EMPRESA.nombre} — Comprobantes de pago y facturas`,
    `Generado: ${new Date(paquete.generado_en).toLocaleString('es-AR')}`,
    `Filtro aplicado: ${descripcionFiltro}`,
    '',
    `Órdenes de pago: ${paquete.ordenes.length}   ·   Archivos: ${archivos}`,
    sinComprobante > 0 ? `⚠ Órdenes sin comprobante del pago: ${sinComprobante}` : '',
    facturasSinPapel > 0 ? `⚠ Facturas sin ningún archivo: ${facturasSinPapel}` : '',
    fallados > 0 ? `⚠ Archivos que no se pudieron bajar: ${fallados}` : '',
    '',
    'Una carpeta por orden de pago: cada una es UN movimiento del banco, y',
    'adentro está el comprobante con el que salió y las facturas que cubrió.',
    'La carpeta de arriba es el MES DE PAGO, no el de emisión de la factura.',
    '',
    '─'.repeat(72),
  ].filter(l => l !== '').join('\n')

  zip.file('CONTENIDO.txt', cab + '\n' + lineas.join('\n') + '\n')

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Pagos_paquete_contador_${paquete.generado_en.slice(0, 10)}.zip`
  a.click()
  URL.revokeObjectURL(url)

  return { archivos, fallados, ordenes: paquete.ordenes.length, sinComprobante, facturasSinPapel }
}
