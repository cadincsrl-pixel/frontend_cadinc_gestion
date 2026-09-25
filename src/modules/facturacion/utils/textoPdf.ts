/**
 * El texto de un PDF, sacado EN EL NAVEGADOR (Cargar liquidación, 20260930k).
 *
 * Mismo criterio que el QR de la factura (`pagos/utils/qrFactura.ts`): el
 * backend no carga pdfjs, así que la página se lee acá y al backend viaja
 * sólo el texto, que allá se interpreta (`liquidacion-casilda.ts`). Si el PDF
 * es una imagen escaneada o el texto no se reconoce, el backend lee el archivo
 * del bucket con la IA.
 *
 * pdfjs devuelve pedazos de texto sueltos con su posición; `lineasDeItems`
 * los junta en renglones (misma altura) ordenados de izquierda a derecha,
 * con un espacio donde hay un hueco. Es pura para testearla.
 *
 * Nunca lanza: si algo falla devuelve '' y la lectura sigue con la IA.
 */

export interface ItemTexto {
  str: string
  /** [a, b, c, d, x, y] de pdfjs. */
  transform: number[]
  width: number
}

/** Tolerancia vertical (puntos) para que dos pedazos sean del mismo renglón. */
const TOL_Y = 2.5

/** Pedazos de texto de una página → renglones, de arriba hacia abajo. */
export function lineasDeItems(items: readonly ItemTexto[]): string[] {
  const conTexto = items
    .filter(i => i.str && i.str.trim() !== '' && Array.isArray(i.transform) && i.transform.length >= 6)
    .map(i => ({ s: i.str, x: i.transform[4] ?? 0, y: i.transform[5] ?? 0, w: i.width ?? 0 }))
  // En PDF la y crece hacia arriba: primero los de y más alta.
  conTexto.sort((a, b) => b.y - a.y || a.x - b.x)
  const renglones: Array<{ y: number; partes: typeof conTexto }> = []
  for (const it of conTexto) {
    const r = renglones.find(l => Math.abs(l.y - it.y) <= TOL_Y)
    if (r) r.partes.push(it)
    else renglones.push({ y: it.y, partes: [it] })
  }
  renglones.sort((a, b) => b.y - a.y)
  return renglones.map(r => {
    const partes = [...r.partes].sort((a, b) => a.x - b.x)
    let out = ''
    let fin = -Infinity
    for (const p of partes) {
      if (out !== '' && p.x - fin > 0.8) out += ' '
      out += p.s
      fin = p.x + p.w
    }
    return out.replace(/\s+/g, ' ').trim()
  })
}

/** Texto de todas las páginas (renglones separados por \n). '' si no se pudo. */
export async function textoDePdf(file: File, maxPaginas = 10): Promise<string> {
  try {
    const pdfjs = await import('pdfjs-dist')
    // Registra el worker en el mismo hilo (globalThis.pdfjsWorker).
    await import('pdfjs-dist/build/pdf.worker.min.mjs')
    const tarea = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
    const doc = await tarea.promise
    try {
      const lineas: string[] = []
      for (let n = 1; n <= Math.min(doc.numPages, maxPaginas); n++) {
        const page = await doc.getPage(n)
        const tc = await page.getTextContent()
        const items: ItemTexto[] = []
        for (const i of tc.items) if ('str' in i) items.push({ str: i.str, transform: i.transform, width: i.width })
        lineas.push(...lineasDeItems(items))
      }
      return lineas.join('\n')
    } finally {
      void tarea.destroy()
    }
  } catch {
    return ''
  }
}
