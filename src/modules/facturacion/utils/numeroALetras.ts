/**
 * El «Son:» de la factura: el importe en letras, como lo imprime Finnegans.
 *
 *   2736959.50 → "Dos Millones Setecientos Treinta y Seis Mil Novecientos
 *                 Cincuenta y Nueve Con 50/100"
 *
 * Cada palabra con mayúscula salvo la «y» de las decenas. Apócope donde el
 * castellano la pide: "Un Millón", "Veintiún Mil", "Treinta y Un Mil"; al
 * final del número va entero ("Veintiuno", "Uno"). Los centavos siempre con
 * dos dígitos.
 */

const UNIDADES = [
  '', 'Uno', 'Dos', 'Tres', 'Cuatro', 'Cinco', 'Seis', 'Siete', 'Ocho', 'Nueve',
  'Diez', 'Once', 'Doce', 'Trece', 'Catorce', 'Quince', 'Dieciséis', 'Diecisiete', 'Dieciocho', 'Diecinueve',
  'Veinte', 'Veintiuno', 'Veintidós', 'Veintitrés', 'Veinticuatro', 'Veinticinco', 'Veintiséis',
  'Veintisiete', 'Veintiocho', 'Veintinueve',
]
const DECENAS = ['', '', '', 'Treinta', 'Cuarenta', 'Cincuenta', 'Sesenta', 'Setenta', 'Ochenta', 'Noventa']
const CENTENAS = [
  '', 'Ciento', 'Doscientos', 'Trescientos', 'Cuatrocientos', 'Quinientos',
  'Seiscientos', 'Setecientos', 'Ochocientos', 'Novecientos',
]

/** 0..99. `apocope` = va delante de Mil / Millones ("Un", "Veintiún"). */
function decenas(n: number, apocope: boolean): string {
  if (n < 30) {
    if (apocope && n === 1) return 'Un'
    if (apocope && n === 21) return 'Veintiún'
    return UNIDADES[n]!
  }
  const d = Math.floor(n / 10)
  const u = n % 10
  if (u === 0) return DECENAS[d]!
  return `${DECENAS[d]} y ${apocope && u === 1 ? 'Un' : UNIDADES[u]}`
}

/** 0..999 */
function centenas(n: number, apocope: boolean): string {
  if (n === 100) return 'Cien'
  const c = Math.floor(n / 100)
  const resto = n % 100
  return [CENTENAS[c], resto ? decenas(resto, apocope) : ''].filter(Boolean).join(' ')
}

/** 0..999.999 */
function miles(n: number, apocope: boolean): string {
  const m = Math.floor(n / 1000)
  const resto = n % 1000
  const partes: string[] = []
  if (m === 1) partes.push('Mil')
  else if (m > 1) partes.push(`${centenas(m, true)} Mil`)
  if (resto) partes.push(centenas(resto, apocope))
  return partes.join(' ')
}

/** Parte entera en letras. 0 → "Cero". Soporta hasta 999.999.999.999. */
export function enteroALetras(n: number): string {
  const entero = Math.floor(Math.abs(n))
  if (entero === 0) return 'Cero'
  const millones = Math.floor(entero / 1_000_000)
  const resto = entero % 1_000_000
  const partes: string[] = []
  if (millones === 1) partes.push('Un Millón')
  else if (millones > 1) partes.push(`${miles(millones, true)} Millones`)
  if (resto) partes.push(miles(resto, false))
  return partes.join(' ')
}

/** Importe completo: "… Con 50/100". Redondea a centavos. */
export function importeALetras(importe: number): string {
  const centavosTot = Math.round(Math.abs(importe) * 100)
  const entero = Math.floor(centavosTot / 100)
  const cent = centavosTot % 100
  return `${enteroALetras(entero)} Con ${String(cent).padStart(2, '0')}/100`
}
