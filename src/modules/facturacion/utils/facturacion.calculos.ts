/**
 * Totales de una factura de venta, espejo EXACTO de `ventas_guardar_borrador`
 * (20260924c) y de `reglas.ts` del backend:
 *
 *   importe_neto del renglón = round(cantidad × precio_unit, 2)
 *   IVA por alícuota         = round(Σ bases del grupo × tasa, 2)   ← NO renglón por renglón
 *   total                    = neto + IVA
 *
 * El server recalcula siempre y lo que manda el cliente como total se ignora:
 * esto es para mostrar en vivo el MISMO número que va a quedar en ARCA. Si
 * difiriera en un centavo, la persona vería un total y el PDF otro.
 *
 * Se calcula en enteros (BigInt) y no en float: 3 × 1234,567 en float da
 * 3703.7009999999996 y un redondeo ingenuo puede caer del lado equivocado.
 * Cantidad lleva hasta 4 decimales (numeric(14,4)) y precio hasta 3
 * (numeric(16,3)); el producto queda escalado en 10^7 y se redondea a
 * centavos «mitad hacia arriba», que para valores ≥ 0 es lo mismo que el
 * `round()` de numeric en Postgres (mitad lejos del cero).
 */

/** Tasa de cada Id de alícuota de ARCA, en milésimas (21 % = 210). */
export const TASA_MILESIMAS: Record<number, number> = {
  3: 0,     // 0 %
  4: 105,   // 10,5 %
  5: 210,   // 21 %
  6: 270,   // 27 %
  8: 50,    // 5 %
  9: 25,    // 2,5 %
}

export interface RenglonCalculable {
  cantidad:    string | number
  precio_unit: string | number
  alicuota_id: string | number
}

export interface AlicuotaCalculada {
  alicuota_id: number
  /** Tasa como fracción (0.21). */
  tasa:        number
  base_imp:    number
  importe:     number
}

export interface TotalesFactura {
  /** importe_neto de cada renglón, en el mismo orden. NaN-safe: renglón inválido = 0. */
  netos:     number[]
  alicuotas: AlicuotaCalculada[]
  neto:      number
  iva:       number
  total:     number
}

/**
 * "1234.567" | 1234.567 → entero escalado en 10^decimales. Trunca lo que
 * sobre (el input ya limita los decimales). null si no es un número ≥ 0.
 */
export function aEscalado(v: string | number, decimales: number): bigint | null {
  const s = (typeof v === 'number' ? (Number.isFinite(v) ? numeroSinExponente(v) : '') : v).trim()
  if (!/^\d*(\.\d*)?$/.test(s) || s === '' || s === '.') return null
  const [ent = '', dec = ''] = s.split('.')
  const frac = (dec + '0'.repeat(decimales)).slice(0, decimales)
  return BigInt((ent || '0') + frac)
}

function numeroSinExponente(n: number): string {
  if (n < 0) return ''
  // toFixed(10) evita el "1e-7"; los ceros de más no cambian el valor.
  return n.toFixed(10)
}

// Sin literales `0n`: el tsconfig apunta a ES2017.
const B0 = BigInt(0)
const B2 = BigInt(2)
const B1000 = BigInt(1000)
const B100000 = BigInt(100000)

/** División entera redondeando la mitad hacia arriba (a ≥ 0, b > 0). */
function divRedondeo(a: bigint, b: bigint): bigint {
  return (a * B2 + b) / (b * B2)
}

const aNumero = (centavos: bigint) => Number(centavos) / 100

/** importe_neto de un renglón, en centavos. */
export function netoRenglonCentavos(r: Pick<RenglonCalculable, 'cantidad' | 'precio_unit'>): bigint {
  const cant = aEscalado(r.cantidad, 4)
  const precio = aEscalado(r.precio_unit, 3)
  if (cant === null || precio === null) return B0
  // cant × 10^4 · precio × 10^3 = importe × 10^7 → a centavos (10^2): ÷ 10^5
  return divRedondeo(cant * precio, B100000)
}

export function netoRenglon(r: Pick<RenglonCalculable, 'cantidad' | 'precio_unit'>): number {
  return aNumero(netoRenglonCentavos(r))
}

export function calcularTotales(renglones: RenglonCalculable[]): TotalesFactura {
  const netosC = renglones.map(netoRenglonCentavos)
  const porAlicuota = new Map<number, bigint>()
  renglones.forEach((r, i) => {
    const id = Number(r.alicuota_id)
    if (!(id in TASA_MILESIMAS)) return
    porAlicuota.set(id, (porAlicuota.get(id) ?? B0) + netosC[i]!)
  })

  const alicuotas: AlicuotaCalculada[] = [...porAlicuota.entries()]
    .sort(([a], [b]) => a - b)
    .map(([id, base]) => {
      const mil = TASA_MILESIMAS[id]!
      return {
        alicuota_id: id,
        tasa:        mil / 1000,
        base_imp:    aNumero(base),
        importe:     aNumero(divRedondeo(base * BigInt(mil), B1000)),
      }
    })

  const netoC = netosC.reduce((s, n) => s + n, B0)
  const ivaC = [...porAlicuota.entries()]
    .reduce((s, [id, base]) => s + divRedondeo(base * BigInt(TASA_MILESIMAS[id]!), B1000), B0)

  return {
    netos:     netosC.map(aNumero),
    alicuotas,
    neto:      aNumero(netoC),
    iva:       aNumero(ivaC),
    total:     aNumero(netoC + ivaC),
  }
}

/** Subtotal con IVA de UN renglón, solo para mostrar (el IVA real va por alícuota). */
export function conIvaRenglon(importeNeto: number, alicuotaId: number): number {
  const mil = TASA_MILESIMAS[alicuotaId] ?? 0
  const c = BigInt(Math.round(importeNeto * 100))
  return aNumero(c + divRedondeo(c * BigInt(mil), B1000))
}

/**
 * Precio unitario con IVA de un renglón, solo para mostrar en la B (donde el
 * IVA no se discrimina por renglón): round(precio_neto × (1 + tasa), 2). El
 * precio neto tiene hasta 3 decimales; se calcula en enteros.
 */
export function precioConIva(precioUnit: number | string, alicuotaId: number): number {
  const p = aEscalado(typeof precioUnit === 'number' ? precioUnit : String(precioUnit), 3)   // × 10^3
  if (p === null) return 0
  const mil = BigInt(TASA_MILESIMAS[alicuotaId] ?? 0)
  // p × (1000 + mil) está en 10^6 → a centavos: ÷ 10^4
  return aNumero(divRedondeo(p * (B1000 + mil), BigInt(10000)))
}
