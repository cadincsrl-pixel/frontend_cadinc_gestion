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
