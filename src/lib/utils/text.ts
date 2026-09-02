/**
 * Utilidades de normalización de texto para búsquedas.
 *
 * Objetivo: que buscar materiales (y cualquier otra lista) sea tolerante a
 * acentos y al orden en que se escriben los términos. Buscar "fierro 8" o
 * "8 fierro" o "fíerro 8" debe matchear "Fierro del 8mm".
 */

/**
 * Normaliza un string para comparación: minúsculas, sin acentos/diacríticos,
 * y colapsando espacios múltiples. NO usar para mostrar al usuario, solo para
 * matchear/comparar.
 */
export function normalizeText(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')                       // separa letra + diacrítico
    .replace(/[\u0300-\u036f]/g, '')        // saca los diacríticos (acentos, diéresis, etc.)
    .toLowerCase()
    .replace(/\s+/g, ' ')             // colapsa espacios
    .trim()
}

/**
 * Matching tolerante para búsquedas: divide el query en tokens (palabras) y
 * exige que TODOS aparezcan en el texto, sin importar el orden ni los acentos.
 *
 * - `matchesSearch('Tornillo Fischer 8mm', 'fischer torni')`  → true
 * - `matchesSearch('Tornillo Fischer 8mm', '8 físcher')`      → true
 * - `matchesSearch('Tornillo Fischer 8mm', 'clavo')`          → false
 *
 * Query vacío matchea todo (devuelve true).
 */
export function matchesSearch(haystack: string | null | undefined, query: string): boolean {
  const tokens = normalizeText(query).split(' ').filter(Boolean)
  if (tokens.length === 0) return true
  const target = normalizeText(haystack)
  return tokens.every(t => target.includes(t))
}

/**
 * Qué proporción de los tokens del query aparece en el texto (0 a 1).
 *
 * `matchesSearch` es todo-o-nada, y esa es exactamente la forma en que la
 * búsqueda del catálogo le falla al usuario: alcanza con que agregue UN dato
 * que el catálogo no tiene para que la lista quede vacía y se vaya al texto
 * libre. Casos reales del pedido de Hipódromo del 2026-09-02:
 *
 *   "arena m3"                     → "Arena gruesa" no dice "m3"      → 0 resultados
 *   "puerta placa oblak 0.80x2.05" → el catálogo no sabe de marcas    → 0 resultados
 *
 * En los dos casos el material estaba cargado. Con el score, "arena m3"
 * puntúa 0.5 contra "Arena gruesa" y la fila aparece igual.
 *
 * No reemplaza a `matchesSearch`: la coincidencia exacta sigue primero y esto
 * es el segundo intento (ver `Combobox`).
 */
export function searchScore(haystack: string | null | undefined, query: string): number {
  const tokens = normalizeText(query).split(' ').filter(Boolean)
  if (tokens.length === 0) return 1
  const target = normalizeText(haystack)
  const hits = tokens.filter(t => target.includes(t)).length
  return hits / tokens.length
}
