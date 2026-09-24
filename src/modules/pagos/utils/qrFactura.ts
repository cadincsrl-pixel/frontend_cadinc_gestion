/**
 * El QR de ARCA de una factura, leído EN EL NAVEGADOR (20260924u).
 *
 * Decisión: el backend no rasteriza PDFs. Para sacar el QR de un PDF hay que
 * dibujar la página, y en Node eso pide un canvas nativo (binarios por
 * plataforma que en Render son un riesgo de build y de memoria). El navegador
 * ya tiene canvas: pdfjs dibuja la primera página, jsQR la barre y al backend
 * viaja sólo el texto del QR, que allá se valida (`parsearQrArca`).
 *
 * pdfjs corre SIN web worker (se importa el módulo del worker, que se
 * registra en `globalThis.pdfjsWorker`, y pdfjs lo usa en el mismo hilo). Es
 * una sola página por factura: no justifica configurar la URL del worker en
 * el bundler.
 *
 * Nunca lanza: si no encuentra el QR (foto borrosa, PDF sin QR, HEIC)
 * devuelve null y la lectura sigue con la IA.
 *
 * Por qué varias escalas: en la prueba con las facturas reales (24/09) el QR
 * de Cencosud sólo apareció achicando la página al 35–50 %; jsQR a veces se
 * pierde con módulos muy grandes o con ruido de impresión.
 */

const ESCALAS = [1, 0.5, 0.35] as const
/** ~200 dpi sobre una página A4 (595 pt de ancho). */
const ESCALA_PDF = 2.8
/** Lado máximo al que se lleva una foto antes de barrerla. */
const LADO_MAX_FOTO = 2400

type Decodificador = (data: Uint8ClampedArray, w: number, h: number, opts?: { inversionAttempts?: 'dontInvert' | 'onlyInvert' | 'attemptBoth' | 'invertFirst' }) => { data: string } | null

async function cargarJsQR(): Promise<Decodificador> {
  const m = await import('jsqr')
  return (m.default ?? m) as unknown as Decodificador
}

function barrer(jsQR: Decodificador, canvas: HTMLCanvasElement): string | null {
  for (const f of ESCALAS) {
    const w = Math.max(1, Math.round(canvas.width * f))
    const h = Math.max(1, Math.round(canvas.height * f))
    let fuente = canvas
    if (f !== 1) {
      fuente = document.createElement('canvas')
      fuente.width = w
      fuente.height = h
      const cx = fuente.getContext('2d')
      if (!cx) continue
      cx.drawImage(canvas, 0, 0, w, h)
    }
    const ctx = fuente.getContext('2d', { willReadFrequently: true })
    if (!ctx) continue
    const img = ctx.getImageData(0, 0, w, h)
    const r = jsQR(img.data, w, h, { inversionAttempts: 'attemptBoth' })
    if (r?.data) return r.data
  }
  return null
}

async function canvasDePdf(file: File, pagina: number): Promise<HTMLCanvasElement | null> {
  const pdfjs = await import('pdfjs-dist')
  // Registra el worker en el mismo hilo (globalThis.pdfjsWorker).
  await import('pdfjs-dist/build/pdf.worker.min.mjs')
  const tarea = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  const doc = await tarea.promise
  try {
    if (pagina > doc.numPages) return null
    const page = await doc.getPage(pagina)
    const viewport = page.getViewport({ scale: ESCALA_PDF })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvas, canvasContext: ctx, viewport }).promise
    return canvas
  } finally {
    void tarea.destroy()
  }
}

async function canvasDeImagen(file: File): Promise<HTMLCanvasElement | null> {
  const bmp = await createImageBitmap(file)
  const f = Math.min(1, LADO_MAX_FOTO / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * f)
  canvas.height = Math.round(bmp.height * f)
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  bmp.close()
  return canvas
}

/** El texto del QR (la URL de ARCA), o null. Mira las dos primeras páginas del PDF. */
export async function leerQrDelArchivo(file: File): Promise<string | null> {
  try {
    const jsQR = await cargarJsQR()
    if (file.type === 'application/pdf') {
      for (const pagina of [1, 2]) {
        const c = await canvasDePdf(file, pagina)
        if (!c) break
        const q = barrer(jsQR, c)
        if (q) return q
      }
      return null
    }
    if (/^image\/(jpeg|png|webp|gif)$/.test(file.type)) {
      const c = await canvasDeImagen(file)
      return c ? barrer(jsQR, c) : null
    }
    return null
  } catch {
    return null
  }
}
