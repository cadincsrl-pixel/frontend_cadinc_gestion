// Tablas fijas de ARCA y helpers de CUIT que usan Ventas (facturación) y
// Compras (pagos). Viven acá para que los dos módulos no se importen entre sí:
// `facturacion.utils.ts` las re-exporta con el mismo nombre (2026-09-24).

/** Tabla fija de ARCA (FEParamGetCondicionIvaReceptor). Factura A: 1, 6, 13, 16 con CUIT. */
export const CONDICIONES_IVA: Record<number, string> = {
  1:  'IVA Responsable Inscripto',
  4:  'IVA Sujeto Exento',
  5:  'Consumidor Final',
  6:  'Responsable Monotributo',
  7:  'Sujeto No Categorizado',
  8:  'Proveedor del Exterior',
  9:  'Cliente del Exterior',
  10: 'IVA Liberado – Ley 19.640',
  13: 'Monotributista Social',
  15: 'IVA No Alcanzado',
  16: 'Monotributo Trabajador Independiente Promovido',
}

/**
 * Provincias como las escribe Finnegans (sin tildes: el default de la base es
 * 'Tucuman'). Si una factura o un cliente trae otra forma, el select la agrega.
 */
export const PROVINCIAS = [
  'Buenos Aires', 'Capital Federal', 'Catamarca', 'Chaco', 'Chubut', 'Cordoba', 'Corrientes', 'Entre Rios',
  'Formosa', 'Jujuy', 'La Pampa', 'La Rioja', 'Mendoza', 'Misiones', 'Neuquen', 'Rio Negro', 'Salta',
  'San Juan', 'San Luis', 'Santa Cruz', 'Santa Fe', 'Santiago del Estero', 'Tierra del Fuego', 'Tucuman',
]

/**
 * Dígito verificador de CUIT/CUIL. Mismo algoritmo que `cuitValido` del
 * backend: el backend valida igual (400 CUIT_INVALIDO), esto es para avisar
 * antes de mandar.
 */
export function cuitValido(c: string): boolean {
  const d = c.replace(/\D/g, '')
  if (d.length !== 11) return false
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
  const suma = pesos.reduce((s, p, i) => s + p * Number(d[i]), 0)
  let dv = 11 - (suma % 11)
  if (dv === 11) dv = 0
  if (dv === 10) return false
  return dv === Number(d[10])
}
