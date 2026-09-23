/**
 * Completar una planilla .xlsx AJENA sin reescribirla (2026-09-23).
 *
 * Nació para las plantillas del Galicia (transferencias y e-cheqs). El banco
 * importa SU archivo: con sus nombres de hoja, sus validaciones y su hoja
 * oculta de motivos. Abrirlo con exceljs y guardarlo de nuevo lo rompe: la
 * plantilla de e-cheqs sale con un formato condicional inválido y el archivo
 * ya no abre. Por eso acá no se «abre» el Excel: se abre el ZIP, se escriben
 * las celdas de datos dentro del XML de la hoja y todo lo demás queda byte
 * por byte como lo dio el banco.
 *
 * Alcance a propósito chico: valores de texto y de número en filas que ya
 * existen o no, sin fórmulas ni estilos nuevos. El texto va como `inlineStr`
 * para no tocar `sharedStrings.xml`; cada celda conserva el estilo (`s`) que
 * tenía en la plantilla, que es el que define «texto» o «número» para el banco.
 */
import JSZip from 'jszip'

export type ValorCelda = string | number | null | undefined
/** Una fila a escribir: columna (A, B, …) → valor. Lo vacío no se escribe. */
export type FilaPlantilla = Record<string, ValorCelda>

const esc = (t: string) => t
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** "A" → 1, "J" → 10, "AA" → 27. */
function colNum(col: string): number {
  return col.split('').reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0)
}

function celdaXml(ref: string, estilo: string | null, v: string | number): string {
  const s = estilo ? ` s="${estilo}"` : ''
  if (typeof v === 'number') return `<c r="${ref}"${s}><v>${v}</v></c>`
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`
}

/**
 * Escribe `filas` en el XML de una hoja, a partir de la fila `desde` (la 2 si
 * la 1 es el encabezado). Devuelve el XML nuevo. Función pura: es lo que se
 * testea.
 */
export function llenarHojaXml(xml: string, filas: FilaPlantilla[], desde = 2): string {
  let out = xml
  filas.forEach((fila, i) => {
    const r = desde + i
    const valores = Object.entries(fila)
      .filter((e): e is [string, string | number] => e[1] !== null && e[1] !== undefined && e[1] !== '')
    if (valores.length === 0) return

    const reFila = new RegExp(`<row r="${r}"[^>]*?(?:/>|>[\\s\\S]*?</row>)`)
    const m = out.match(reFila)
    // Las celdas que ya están en la fila, con su estilo.
    const celdas = new Map<string, { xml: string; estilo: string | null }>()
    let aperturaFila = `<row r="${r}">`
    if (m) {
      const filaXml = m[0]
      aperturaFila = filaXml.match(/^<row [^>]*?>/)![0].replace(/\/>$/, '>')
      for (const c of filaXml.matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>[\s\S]*?<\/c>)/g)) {
        const estilo = c[2]?.match(/\ss="(\d+)"/)?.[1] ?? null
        celdas.set(c[1]!, { xml: c[0], estilo })
      }
    }
    for (const [col, v] of valores) {
      celdas.set(col, { xml: celdaXml(`${col}${r}`, celdas.get(col)?.estilo ?? null, v), estilo: null })
    }
    const nuevaFila = aperturaFila
      + [...celdas.entries()].sort((a, b) => colNum(a[0]) - colNum(b[0])).map(([, c]) => c.xml).join('')
      + '</row>'

    if (m) {
      out = out.replace(m[0], nuevaFila)
    } else {
      // No existía: va antes de la primera fila con número mayor, o al final.
      const siguiente = [...out.matchAll(/<row r="(\d+)"/g)].find(x => Number(x[1]) > r)
      out = siguiente
        ? out.slice(0, siguiente.index) + nuevaFila + out.slice(siguiente.index)
        : out.replace('</sheetData>', nuevaFila + '</sheetData>')
    }
  })
  return out
}

/** La ruta dentro del ZIP de la hoja que se llama `nombre`. */
async function rutaDeHoja(zip: JSZip, nombre: string): Promise<string> {
  const wb = await zip.file('xl/workbook.xml')!.async('string')
  const rels = await zip.file('xl/_rels/workbook.xml.rels')!.async('string')
  // Los atributos se leen de a uno: el orden dentro de la etiqueta no está garantizado.
  const attr = (tag: string, n: string) => tag.match(new RegExp(`\\s${n}="([^"]+)"`))?.[1]
  const hoja = (wb.match(/<sheet [^>]*>/g) ?? []).find(t => attr(t, 'name') === nombre)
  const rid = hoja && attr(hoja, 'r:id')
  if (!rid) throw new Error(`La plantilla no tiene la hoja «${nombre}»`)
  const rel = (rels.match(/<Relationship [^>]*>/g) ?? []).find(t => attr(t, 'Id') === rid)
  const target = rel && attr(rel, 'Target')
  if (!target) throw new Error(`No encontré el archivo de la hoja «${nombre}»`)
  return `xl/${target.replace(/^\/?xl\//, '')}`
}

/** Abre la plantilla, escribe las filas en la hoja `hoja` y devuelve el archivo nuevo. */
export async function llenarPlantillaXlsx(
  plantilla: ArrayBuffer | Uint8Array, hoja: string, filas: FilaPlantilla[], desde = 2,
): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(plantilla)
  const ruta = await rutaDeHoja(zip, hoja)
  const xml = await zip.file(ruta)!.async('string')
  // Sin `createFolders`: JSZip agregaría entradas de carpeta que el original no tiene.
  zip.file(ruta, llenarHojaXml(xml, filas, desde), { createFolders: false })
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}
