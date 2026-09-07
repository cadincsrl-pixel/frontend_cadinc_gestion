/**
 * Reglas del nombre de un material del catálogo. Espejo de
 * `esNombreSoloCodigo` en `cadincsrl/src/modules/stock/stock.service.ts`
 * (el backend responde 400 NOMBRE_ES_CODIGO): acá solo para avisar antes de
 * mandar. Si cambia allá, cambia acá.
 */

// Conectores y palabras que no dicen QUÉ es el material.
const PALABRAS_VACIAS = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'y', 'o', 'en', 'a', 'con', 'sin', 'para', 'por', 'x',
  'cod', 'codigo', 'cdg', 'art', 'articulo', 'ref', 'referencia', 'nro', 'num', 'numero', 'n', 'no',
  'sku', 'item', 'mod', 'modelo', 'marca',
])

function partirEnTokens(texto: string): string[] {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^\p{L}\p{Nd}]+/u)
    .filter(Boolean)
}

/**
 * true si el nombre no dice qué es el material: solo códigos, medidas o
 * conectores ("7055", "cod 7055", "SW 7005", "EZ9F34125", "3M 175"). Un
 * nombre así no se puede buscar ni cotizar; el código va como sinónimo.
 */
export function esNombreSoloCodigo(nombre: string): boolean {
  return !partirEnTokens(nombre).some(t => !PALABRAS_VACIAS.has(t) && /^\p{L}{3,}$/u.test(t))
}

export const MENSAJE_NOMBRE_ES_CODIGO =
  'Es solo un código o una medida. Poné qué es el material (ej.: "Esmalte sintético x 4lts") y dejá el código como sinónimo.'
