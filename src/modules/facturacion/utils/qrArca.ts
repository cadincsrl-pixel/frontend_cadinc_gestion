/**
 * El QR de ARCA para comprobantes electrónicos (RG 4291).
 *
 *   https://www.afip.gob.ar/fe/qr/?p=<base64 del JSON>
 *
 * El JSON va con las claves en el orden de la especificación. `importe` y
 * `ctz` son números (no strings), `codAut` es el CAE como número y
 * `tipoCodAut` es 'E' (CAE). Si el orden o los tipos no coinciden, el QR
 * igual abre la página de ARCA pero la validación dice «comprobante no
 * encontrado».
 */

export const URL_QR_ARCA = 'https://www.afip.gob.ar/fe/qr/?p='

export interface DatosQrArca {
  /** YYYY-MM-DD */
  fecha:      string
  /** CUIT del EMISOR (CADINC), 11 dígitos. */
  cuit:       string | number
  ptoVta:     number
  tipoCmp:    number
  nroCmp:     number
  importe:    number
  moneda?:    string
  ctz?:       number
  tipoDocRec: number
  nroDocRec:  string | number
  /** El CAE, 14 dígitos. */
  codAut:     string | number
}

const soloDigitos = (v: string | number) => Number(String(v).replace(/\D/g, ''))

/** El JSON exacto que va adentro del QR (útil para testear). */
export function jsonQrArca(d: DatosQrArca): string {
  return JSON.stringify({
    ver:        1,
    fecha:      d.fecha.slice(0, 10),
    cuit:       soloDigitos(d.cuit),
    ptoVta:     d.ptoVta,
    tipoCmp:    d.tipoCmp,
    nroCmp:     d.nroCmp,
    importe:    Math.round(Number(d.importe) * 100) / 100,
    moneda:     d.moneda ?? 'PES',
    ctz:        d.ctz ?? 1,
    tipoDocRec: d.tipoDocRec,
    // Consumidor final sin identificar (99): ARCA lo guarda con DocNro 0.
    nroDocRec:  d.tipoDocRec === 99 ? 0 : soloDigitos(d.nroDocRec),
    tipoCodAut: 'E',
    codAut:     soloDigitos(d.codAut),
  })
}

/** El JSON es ASCII puro (números y claves), así que `btoa` alcanza. */
export function urlQrArca(d: DatosQrArca): string {
  return URL_QR_ARCA + btoa(jsonQrArca(d))
}
