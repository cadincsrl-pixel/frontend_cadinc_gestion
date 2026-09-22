/**
 * El paquete para el contador (2026-09-21).
 *
 * Pedido del dueño: «exportar paquete de facturas y comprobantes para que el
 * contador pueda cargar en el otro sistema contable». El contador carga A MANO
 * mirando los papeles, así que lo que necesita son los ARCHIVOS ordenados, no
 * un layout de importación.
 *
 * Cómo queda armado el ZIP:
 *
 *   2026-09/
 *     A-0011-00000194_NORTE_DISTRIBUCIONES.pdf      ← la factura
 *     A-0011-00000194_NORTE_DISTRIBUCIONES__OP-0008_comprobante.pdf
 *   CONTENIDO.txt
 *
 * Las carpetas son por MES DE EMISIÓN de la factura, que es como el contador
 * arma sus períodos. El comprobante del pago va PEGADO a su factura y con el
 * mismo prefijo, no en una carpeta aparte: así quedan uno al lado del otro al
 * ordenar por nombre, que es la única forma de encontrarlos mirando.
 *
 * `CONTENIDO.txt` es la lista de lo que hay adentro —no una planilla de
 * importación—: sirve para saber qué falta sin abrir 80 PDFs.
 *
 * El backend manda el MANIFIESTO con URLs firmadas a 15 minutos; el ZIP se
 * arma acá. Bajar los archivos de a uno desde el navegador evita que el server
 * se coma un mes entero de PDFs en memoria.
 */
import JSZip from 'jszip'
import { EMPRESA } from '@/lib/config/empresa'
import { comprobanteTxt, fmtM } from './pagos.utils'
import type { PagosPaquete, PagosPaqueteArchivo, PagosPaqueteFactura } from '@/types/domain.types'

/** Nombre de archivo utilizable en Windows, Mac y Linux. */
function limpiar(s: string): string {
  return (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // sin tildes: no todos los unzip las respetan
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_').replace(/^_|_$/g, '')
    .slice(0, 80)
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

/** El prefijo que comparten la factura y los comprobantes de su pago. */
export function prefijoDe(f: PagosPaqueteFactura): string {
  const num = (f.numero ?? 's-n').replace(/\s+/g, '')
  return limpiar(`${f.tipo_comprobante}-${num}_${f.proveedor_nom}`)
}

export function nombreEnZip(f: PagosPaqueteFactura, a: PagosPaqueteArchivo, usados: Set<string>): string {
  const carpeta = (f.fecha ?? '').slice(0, 7) || 'sin-fecha'
  const sufijo = a.origen === 'pago'
    ? `__OP-${String(a.op_numero ?? 0).padStart(4, '0')}_${limpiar(a.tipo)}`
    : a.tipo === 'factura' ? '' : `_${limpiar(a.tipo)}`
  const base = `${carpeta}/${prefijoDe(f)}${sufijo}`
  const ext = extDe(a.nombre_archivo, a.mime_type)

  // Dos remitos en la misma factura, o dos comprobantes en la misma OP: se
  // numeran en vez de pisarse.
  let nombre = `${base}.${ext}`
  let i = 2
  while (usados.has(nombre)) nombre = `${base}_${i++}.${ext}`
  usados.add(nombre)
  return nombre
}

export interface ResultadoPaquete {
  archivos:  number
  fallados:  number
  sinPapeles: number
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
  const fallados: string[] = []
  let archivos = 0
  let sinPapeles = 0

  const todos = paquete.facturas.flatMap(f => f.archivos.map(a => ({ f, a })))
  const total = todos.length
  let hechos = 0

  for (const f of paquete.facturas) {
    const comp = comprobanteTxt(f.tipo_comprobante, f.numero)
    if (f.archivos.length === 0) {
      sinPapeles++
      lineas.push(`  ⚠ ${comp} · ${f.proveedor_nom} · ${fmtM(Number(f.total))} — SIN NINGÚN ARCHIVO`)
      continue
    }
    lineas.push(`  ${comp} · ${f.proveedor_nom} · ${fmtM(Number(f.total))}`)
    for (const a of f.archivos) {
      const nombre = nombreEnZip(f, a, usados)
      try {
        if (!a.url) throw new Error('sin URL firmada')
        const r = await fetch(a.url)
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        zip.file(nombre, await r.blob())
        archivos++
        lineas.push(`      ${nombre}`)
      } catch {
        fallados.push(`${nombre} (${a.nombre_archivo})`)
        lineas.push(`      ⚠ NO SE PUDO BAJAR: ${a.nombre_archivo}`)
      }
      onProgreso?.(++hechos, total)
    }
  }

  const cab = [
    `${EMPRESA.nombre} — Facturas de proveedor y comprobantes de pago`,
    `Generado: ${new Date(paquete.generado_en).toLocaleString('es-AR')}`,
    `Filtro aplicado: ${descripcionFiltro}`,
    '',
    `Facturas: ${paquete.facturas.length}   ·   Archivos: ${archivos}`,
    sinPapeles > 0 ? `Facturas sin ningún archivo adjunto: ${sinPapeles}` : '',
    fallados.length > 0 ? `Archivos que no se pudieron bajar: ${fallados.length}` : '',
    '',
    'Las carpetas son por mes de emisión de la factura. El comprobante del pago',
    'lleva el mismo prefijo que su factura y termina en __OP-XXXX, así quedan',
    'juntos al ordenar por nombre.',
    '',
    '─'.repeat(72),
    '',
  ].filter(l => l !== undefined).join('\n')

  zip.file('CONTENIDO.txt', cab + lineas.join('\n') + '\n')

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Pagos_paquete_contador_${paquete.generado_en.slice(0, 10)}.zip`
  a.click()
  URL.revokeObjectURL(url)

  return { archivos, fallados: fallados.length, sinPapeles }
}
