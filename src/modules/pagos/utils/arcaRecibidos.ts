// Parser de «Mis Comprobantes — Recibidos» de ARCA (20260927c).
//
// Es el espejo del de Emitidos (`facturacion/utils/arcaImport.ts`), del que
// reusa los lectores de celdas. Dos formatos:
//
//  - CLÁSICO: una fila por comprobante, en CSV o XLS, con fila de título
//    opcional. Fecha | Tipo («1 - Factura A»; en CSV a veces solo el código) |
//    Punto de Venta | Número Desde | Número Hasta | Cód. Autorización | Tipo
//    Doc. Emisor | Nro. Doc. Emisor | Denominación Emisor | Tipo Cambio |
//    Moneda | Imp. Neto Gravado | Imp. Neto No Gravado | Imp. Op. Exentas |
//    Otros Tributos | IVA | Imp. Total.
//  - POR ALÍCUOTA (ARCA, sep-2025): punto de venta y número pueden venir en
//    la MISMA columna («00003-00001234») y el neto y el IVA vienen por alícuota
//    («Neto Grav. IVA 21%», «IVA 21%»…).
//
// El layout exacto del formato nuevo no está publicado: las columnas se buscan
// por PATRÓN sobre el encabezado normalizado, no por posición ni por nombre
// fijo. Cuando lleguen los archivos reales de jul–sep, dejarlos como fixture.
//
// El parser NO decide nada de negocio (tipo soportado, duplicados, proveedor,
// cierre del desglose): eso lo hace `pagos_importar_recibidos` en la base y
// lo devuelve por fila. Acá solo se arma lo que viaja y se marca lo que no se
// puede mandar (sin tipo, sin número, fecha ilegible, sin total).

import * as XLSX from 'xlsx'
import {
  codigoDeTipo, docTipoDeCelda, fechaDeCelda, monedaDeCelda, normEncabezado, numeroDeCelda,
} from '@/modules/facturacion/utils/arcaImport'
import type { PagosAlicuotaId, PagosFilaRecibida } from '@/types/domain.types'

export interface FilaRecibidaArchivo extends PagosFilaRecibida {
  /** El archivo de donde salió (para la vista previa). */
  archivo:   string
  /** Fila del Excel, 1-based como la ve el usuario. */
  filaExcel: number
  /** «1 - Factura A» tal cual vino. */
  tipoTexto: string
}

export interface ErrorParseoRecibidos {
  archivo:   string
  filaExcel: number
  motivo:    string
}

export interface ResultadoParseoRecibidos {
  hoja:    string
  formato: 'clasico' | 'por_alicuota'
  filas:   FilaRecibidaArchivo[]
  errores: ErrorParseoRecibidos[]
}

type Campo =
  | 'fecha' | 'tipo' | 'pto_vta' | 'numero' | 'numero_hasta' | 'cod_autorizacion'
  | 'emisor_doc_tipo' | 'emisor_doc_nro' | 'emisor_razon_social' | 'tipo_cambio' | 'moneda'
  | 'neto_gravado' | 'no_gravado' | 'exento' | 'otros_tributos' | 'iva' | 'total'

/** Encabezados aceptados por campo, ya normalizados (sin tildes, minúsculas). */
const ENCABEZADOS: Record<Campo, string[]> = {
  fecha:               ['fecha', 'fecha de emision'],
  tipo:                ['tipo', 'tipo de comprobante'],
  pto_vta:             ['punto de venta'],
  numero:              ['numero desde', 'numero', 'numero de comprobante'],
  numero_hasta:        ['numero hasta'],
  cod_autorizacion:    ['cod. autorizacion', 'codigo de autorizacion'],
  // «Comprobantes de Compras» (el que baja el estudio) dice «Vendedor».
  emisor_doc_tipo:     ['tipo doc. emisor', 'tipo doc. vendedor'],
  emisor_doc_nro:      ['nro. doc. emisor', 'nro. doc. vendedor'],
  emisor_razon_social: ['denominacion emisor', 'denominacion vendedor'],
  tipo_cambio:         ['tipo cambio', 'tipo de cambio'],
  moneda:              ['moneda'],
  neto_gravado:        ['imp. neto gravado', 'imp. neto gravado total', 'total neto gravado', 'neto gravado'],
  no_gravado:          ['imp. neto no gravado', 'neto no gravado', 'no gravado'],
  exento:              ['imp. op. exentas', 'op. exentas', 'exento'],
  otros_tributos:      ['otros tributos', 'o otros tributos', 'imp. otros tributos'],
  iva:                 ['iva', 'total iva', 'imp. iva'],
  total:               ['imp. total', 'total', 'importe total'],
}

/** Sin estos no hay comprobante. El punto de venta puede venir pegado al número. */
const OBLIGATORIOS: Campo[] = ['fecha', 'tipo', 'numero', 'total']

/** Columnas por alícuota del formato nuevo. */
const RE_NETO_ALICUOTA = /^(imp\.?\s*)?neto\s*grav(ado|\.)?\s*(iva\s*)?(\d+(?:[.,]\d+)?)\s*%$/
const RE_IVA_ALICUOTA  = /^(imp\.?\s*)?iva\s*(\d+(?:[.,]\d+)?)\s*%$/

/** Tasa → código ARCA de alícuota. */
const ID_POR_TASA: Record<string, PagosAlicuotaId> = {
  '0': 3, '2.5': 9, '5': 8, '10.5': 4, '21': 5, '27': 6,
}

function idDeTasa(txt: string): PagosAlicuotaId | null {
  const t = String(Number(txt.replace(',', '.')))
  return ID_POR_TASA[t] ?? null
}

interface Mapa {
  campos:  Partial<Record<Campo, number>>
  /** alicuota_id → columnas de neto e IVA. */
  alicuotas: Map<PagosAlicuotaId, { neto?: number; iva?: number }>
}

/** Columnas de la fila de encabezados, o null si esa fila no es el encabezado. */
function mapearEncabezado(fila: unknown[]): Mapa | null {
  const norm = fila.map(normEncabezado)
  const campos: Partial<Record<Campo, number>> = {}
  for (const campo of Object.keys(ENCABEZADOS) as Campo[]) {
    const i = norm.findIndex(h => ENCABEZADOS[campo].includes(h))
    if (i >= 0) campos[campo] = i
  }
  if (!OBLIGATORIOS.every(c => campos[c] !== undefined)) return null
  const alicuotas = new Map<PagosAlicuotaId, { neto?: number; iva?: number }>()
  norm.forEach((h, i) => {
    const mn = h.match(RE_NETO_ALICUOTA)
    if (mn) {
      const id = idDeTasa(mn[4]!)
      if (id) alicuotas.set(id, { ...alicuotas.get(id), neto: i })
      return
    }
    const mi = h.match(RE_IVA_ALICUOTA)
    if (mi) {
      const id = idDeTasa(mi[2]!)
      if (id) alicuotas.set(id, { ...alicuotas.get(id), iva: i })
    }
  })
  return { campos, alicuotas }
}

const r2 = (n: number) => Math.round(n * 100) / 100
const abs2 = (v: number | null) => r2(Math.abs(v ?? 0))

/** «00003-00001234» → [3, 1234]. */
function partirPvNumero(v: unknown): [number, number] | null {
  const m = String(v ?? '').trim().match(/^(\d{1,5})-(\d{1,8})$/)
  return m ? [Number(m[1]), Number(m[2])] : null
}

/** Las filas de una hoja (array de arrays). Puro: testeable sin archivo. */
export function leerFilasRecibidos(filas: unknown[][], archivo: string, hoja = 'Sheet1'): ResultadoParseoRecibidos {
  const errores: ErrorParseoRecibidos[] = []
  let mapa: Mapa | null = null
  let iEnc = -1
  for (let i = 0; i < Math.min(filas.length, 10); i++) {
    const fila = filas[i] ?? []
    // El archivo equivocado se reconoce por el encabezado del comprador.
    if (fila.map(normEncabezado).some(h => h === 'denominacion comprador' || h === 'nro. doc. comprador')) {
      return {
        hoja, formato: 'clasico', filas: [],
        errores: [{ archivo, filaExcel: i + 1, motivo: 'Es el archivo de EMITIDOS, no de RECIBIDOS. En ARCA: Mis Comprobantes › Recibidos.' }],
      }
    }
    mapa = mapearEncabezado(fila)
    if (mapa) { iEnc = i; break }
  }
  if (!mapa) {
    return {
      hoja, formato: 'clasico', filas: [],
      errores: [{ archivo, filaExcel: 0, motivo: 'No encontré los encabezados de «Mis Comprobantes Recibidos» (Fecha, Tipo, Número, Total). ¿Es el archivo de comprobantes RECIBIDOS de ARCA?' }],
    }
  }
  const m = mapa
  const formato: ResultadoParseoRecibidos['formato'] = m.alicuotas.size > 0 ? 'por_alicuota' : 'clasico'
  const sinColumnaOtros = m.campos.otros_tributos === undefined
  const col = (fila: unknown[], c: Campo): unknown => (m.campos[c] === undefined ? undefined : fila[m.campos[c]!])

  const out: FilaRecibidaArchivo[] = []
  for (let i = iEnc + 1; i < filas.length; i++) {
    const fila = filas[i] ?? []
    if (fila.every(v => v === null || v === undefined || String(v).trim() === '')) continue
    const filaExcel = i + 1
    const err = (motivo: string) => errores.push({ archivo, filaExcel, motivo })

    const tipoTexto = String(col(fila, 'tipo') ?? '').trim()
    const cbte = codigoDeTipo(col(fila, 'tipo'))
    if (cbte === null) { err(`Tipo de comprobante ilegible: «${tipoTexto}»`); continue }

    // Número: columnas separadas, o «PPPPP-NNNNNNNN» en una sola si no hay punto de venta.
    let pv = numeroDeCelda(col(fila, 'pto_vta'))
    let numero: number | null
    const celdaNumero = col(fila, 'numero')
    const partido = m.campos.pto_vta === undefined ? partirPvNumero(celdaNumero) : null
    if (partido) { [pv, numero] = partido } else { numero = numeroDeCelda(celdaNumero) }
    if (pv === null || numero === null) { err('Falta el punto de venta o el número'); continue }
    // El rango (número hasta ≠ desde) viaja igual: la base lo marca RANGO_DE_NUMEROS y se ve el motivo.
    const hasta = numeroDeCelda(col(fila, 'numero_hasta'))

    const fecha = fechaDeCelda(col(fila, 'fecha'))
    if (!fecha) { err(`Fecha ilegible: «${String(col(fila, 'fecha') ?? '')}»`); continue }
    const total = numeroDeCelda(col(fila, 'total'))
    if (total === null) { err('Falta el total'); continue }

    const docNroCelda = col(fila, 'emisor_doc_nro')
    const codAut = String(col(fila, 'cod_autorizacion') ?? '').replace(/\D/g, '')
    let alicuotas: PagosFilaRecibida['alicuotas'] = null
    if (formato === 'por_alicuota') {
      alicuotas = [...m.alicuotas.entries()]
        .map(([alicuota_id, c]) => ({
          alicuota_id,
          base_imp: abs2(c.neto === undefined ? null : numeroDeCelda(fila[c.neto])),
          importe:  abs2(c.iva === undefined ? null : numeroDeCelda(fila[c.iva])),
        }))
        .filter(a => a.base_imp > 0 || a.importe > 0)
    }
    const tc = numeroDeCelda(col(fila, 'tipo_cambio'))
    // «Comprobantes de Compras» no trae la columna de otros tributos: las
    // percepciones quedan escondidas en la diferencia con el total. En A/B/M
    // esa diferencia entra como «otros tributos» (a revisar, como pidió el
    // contador) en vez de romper el cierre y sacar el comprobante del libro.
    // En C no se toca: ahí el total no se discrimina.
    const netoG = abs2(numeroDeCelda(col(fila, 'neto_gravado')))
    const noG   = abs2(numeroDeCelda(col(fila, 'no_gravado')))
    const exe   = abs2(numeroDeCelda(col(fila, 'exento')))
    const ivaF  = abs2(numeroDeCelda(col(fila, 'iva')))
    let otros   = abs2(numeroDeCelda(col(fila, 'otros_tributos')))
    if (sinColumnaOtros && !esLetraC(cbte)) {
      const dif = Math.round((abs2(total) - netoG - noG - exe - ivaF) * 100) / 100
      if (dif > 0.01) otros = dif
    }

    out.push({
      archivo, filaExcel, tipoTexto,
      fecha,
      cbte_tipo:           cbte,
      pto_vta:             pv,
      numero,
      numero_hasta:        hasta,
      cod_autorizacion:    codAut || null,
      emisor_doc_tipo:     docTipoDeCelda(col(fila, 'emisor_doc_tipo')),
      // Un CUIT como número entra entero en un double; String() no le pone notación científica.
      emisor_doc_nro:      typeof docNroCelda === 'number' ? String(Math.trunc(docNroCelda)) : String(docNroCelda ?? '').replace(/\D/g, ''),
      emisor_razon_social: String(col(fila, 'emisor_razon_social') ?? '').replace(/\s+/g, ' ').trim().slice(0, 200),
      moneda:              monedaDeCelda(col(fila, 'moneda')),
      tipo_cambio:         tc && tc > 0 ? tc : 1,
      // Algunas exportaciones traen las NC en negativo: el signo lo pone el tipo.
      neto_gravado:        netoG,
      no_gravado:          noG,
      exento:              exe,
      otros_tributos:      otros,
      iva:                 ivaF,
      total:               abs2(total),
      alicuotas,
    })
  }
  return { hoja, formato, filas: out, errores }
}

/** Facturas, ND y NC C (11, 12, 13) y recibo C (15): no discriminan IVA. */
function esLetraC(cbte: number | null): boolean {
  return cbte !== null && [11, 12, 13, 15].includes(cbte)
}

/** Separador de un CSV: `;` si la primera línea tiene más `;` que `,`. */
export function separadorCsv(texto: string): ',' | ';' {
  const primera = texto.split(/\r?\n/, 1)[0] ?? ''
  const pc = (primera.match(/;/g) ?? []).length
  const c = (primera.match(/,/g) ?? []).length
  return pc > c ? ';' : ','
}

function esCsv(archivo: string, data: Uint8Array): boolean {
  if (/\.csv$/i.test(archivo)) return true
  // Un xlsx arranca con «PK» (zip) y un xls con D0 CF 11 E0: lo demás se trata como texto.
  const zip = data[0] === 0x50 && data[1] === 0x4b
  const ole = data[0] === 0xd0 && data[1] === 0xcf
  return !zip && !ole && !/\.xlsx?$/i.test(archivo)
}

/**
 * Lee el archivo (xlsx, xls o csv) y parsea la PRIMERA hoja con los
 * encabezados de ARCA. El CSV va con `raw: true`: sin eso xlsx interpreta
 * «01/07/2026» como mes/día.
 */
export function parsearRecibidos(data: ArrayBuffer | Uint8Array, archivo: string): ResultadoParseoRecibidos {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  let wb: XLSX.WorkBook
  try {
    if (esCsv(archivo, bytes)) {
      // ARCA baja el CSV en UTF-8 (a veces con BOM) o en Latin-1: se prueba UTF-8 y, si trae reemplazos, Latin-1.
      let texto = new TextDecoder('utf-8').decode(bytes)
      if (texto.includes('�')) texto = new TextDecoder('windows-1252').decode(bytes)
      texto = texto.replace(/^﻿/, '')
      wb = XLSX.read(texto, { type: 'string', raw: true, FS: separadorCsv(texto) })
    } else {
      wb = XLSX.read(bytes, { type: 'array', cellDates: false, raw: false })
    }
  } catch {
    return { hoja: '', formato: 'clasico', filas: [], errores: [{ archivo, filaExcel: 0, motivo: 'No se pudo leer el archivo: ¿es un Excel (.xlsx / .xls) o un CSV?' }] }
  }
  let primero: ResultadoParseoRecibidos | null = null
  for (const nombre of wb.SheetNames) {
    const ws = wb.Sheets[nombre]
    if (!ws) continue
    const filas = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null })
    const r = leerFilasRecibidos(filas, archivo, nombre)
    if (r.filas.length > 0 || r.errores.some(e => e.filaExcel > 0)) return r
    primero ??= r
  }
  return primero ?? { hoja: '', formato: 'clasico', filas: [], errores: [{ archivo, filaExcel: 0, motivo: 'El archivo no tiene hojas.' }] }
}

/** Lo que viaja al backend: la fila sin los datos de pantalla. */
export function filaRecibidaParaApi(f: FilaRecibidaArchivo): PagosFilaRecibida {
  return {
    fecha: f.fecha, cbte_tipo: f.cbte_tipo, pto_vta: f.pto_vta, numero: f.numero,
    numero_hasta: f.numero_hasta ?? null, cod_autorizacion: f.cod_autorizacion ?? null,
    emisor_doc_tipo: f.emisor_doc_tipo, emisor_doc_nro: f.emisor_doc_nro, emisor_razon_social: f.emisor_razon_social,
    moneda: f.moneda, tipo_cambio: f.tipo_cambio,
    neto_gravado: f.neto_gravado, no_gravado: f.no_gravado, exento: f.exento,
    otros_tributos: f.otros_tributos, iva: f.iva, total: f.total,
    alicuotas: f.alicuotas ?? null,
  }
}

/** SHA-256 del archivo en hex (para que la base reconozca el mismo archivo subido dos veces). */
export async function hashArchivo(data: ArrayBuffer): Promise<string | null> {
  try {
    const h = await crypto.subtle.digest('SHA-256', data)
    return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('')
  } catch {
    return null
  }
}
