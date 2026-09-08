/**
 * Lectura de números tipeados por una persona en Argentina, donde el separador
 * decimal es la COMA.
 *
 * POR QUÉ EXISTE: `parseFloat('8,5')` devuelve **8**. Se come el decimal en
 * silencio y sin error, así que una tarja cargada como "8,5" se guardaba como
 * 8 horas. Toda lectura de un input numérico escrito a mano tiene que pasar
 * por acá.
 *
 * El input tampoco puede ser `type="number"`: con una coma el browser marca
 * `validity.badInput` y `value` llega VACÍO, así que ni siquiera se puede leer
 * lo que la persona escribió. Los campos que usan esto van `type="text"` con
 * `inputMode="decimal"` (que en el celular abre igual el teclado numérico).
 */

/**
 * "8,5" | "8.5" | "1.234,56" → number. `null` si no es un número.
 *
 * Regla de separadores: si vienen los dos, **el último manda** como decimal y
 * el otro son miles ("1.234,56" y "1,234.56" dan los dos 1234.56). Si viene uno
 * solo, es el decimal — que es lo que tipea alguien en un teclado numérico
 * ("8.5" y "8,5" son la misma media hora).
 */
export function parseNumeroAR(texto: string | null | undefined): number | null {
  const s = (texto ?? '').trim()
  if (s === '') return null

  const ultimaComa  = s.lastIndexOf(',')
  const ultimoPunto = s.lastIndexOf('.')

  let limpio: string
  if (ultimaComa >= 0 && ultimoPunto >= 0) {
    // Los dos: el que va más a la derecha es el decimal, el otro son miles.
    const [decimal, miles] = ultimaComa > ultimoPunto ? [',', '.'] : ['.', ',']
    limpio = s.split(miles).join('').replace(decimal, '.')
  } else {
    limpio = s.replace(',', '.')
  }

  // Sin espacios ni símbolos, pero sin tolerar basura: "8 hs" no es 8.
  if (!/^[+-]?\d*\.?\d*$/.test(limpio) || !/\d/.test(limpio)) return null

  const n = Number(limpio)
  return Number.isFinite(n) ? n : null
}

/**
 * Igual que `parseNumeroAR` pero para cantidades que no pueden ser negativas
 * (horas, litros, unidades). Devuelve `null` también si el número es negativo.
 */
export function parseCantidadAR(texto: string | null | undefined): number | null {
  const n = parseNumeroAR(texto)
  return n === null || n < 0 ? null : n
}
