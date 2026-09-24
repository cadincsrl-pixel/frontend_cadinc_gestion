// Lector del archivo del plan de cuentas (xlsx o csv) para
// `POST /api/contabilidad/cuentas/importar`.
//
// El lector NO decide nada: arma una fila por renglón con las columnas tal
// cual vienen (el backend mapea los encabezados — «Código», «codigo», «cod»,
// «Denominación», «Tipo»… — y normaliza rubro e imputable). Lo único que hace
// acá:
//   - saltea las líneas que empiezan con «#» (comentarios del seed provisorio);
//   - busca la fila de encabezados en las primeras 20 (la que tiene una
//     columna de código);
//   - lee las celdas como TEXTO: un código «1.10» leído como número sería 1.1,
//     otra cuenta.
//
// Formato Finnegans (lo exporta el contador, 20260928): se reconoce por las
// columnas `cuenta_madre` y `capitulo`. Las filas se mandan TAL CUAL: la
// conversión que vale es la del backend (`plan-import.ts`), que además valida
// la madre fila por fila. La de acá es su espejo, para mostrar antes de la
// vista previa qué se detectó (cuántas cuentas, cuántas deshabilitadas, un
// ejemplo de conversión).
//
// El CSV se parte a mano (`;`, `,` o tab, el que aparezca en el encabezado)
// en vez de dejárselo a la librería: la línea de comentario de arriba confunde
// su detección de separador.

import * as XLSX from 'xlsx'
import type { CeldaPlan } from '../hooks/useContabilidad'

export type FormatoPlan = 'estandar' | 'finnegans'

export interface ResultadoPlan {
  filas:       Record<string, CeldaPlan>[]
  encabezados: string[]
  /** Por qué no se pudo leer (sin encabezado, archivo vacío…). */
  error:       string | null
  formato:     FormatoPlan
}

// ── Formato Finnegans (espejo de cadincsrl/src/modules/contabilidad/plan-import.ts) ──

/** Se reconoce por las columnas `cuenta_madre` y `capitulo`. */
export function esFormatoFinnegans(encabezados: string[]): boolean {
  const n = new Set(encabezados.map(h => norm(h).replace(/[^a-z0-9]+/g, ' ').trim()))
  return n.has('cuenta madre') && n.has('capitulo')
}

const SEGMENTOS: Array<[number, number]> = [[0, 1], [1, 2], [2, 3], [3, 5], [5, 7]]

/**
 * 7 dígitos de Finnegans → código con puntos (segmentos 1-1-1-2-2):
 * 1110101 → 1.1.1.01.01; 1110100 con nivel 4 → 1.1.1.01. Con nivel exige
 * ceros después; sin nivel corta en el último segmento distinto de cero.
 * Inválido → null.
 */
export function codigoFinnegans(v: CeldaPlan | undefined, nivel?: number | null): string | null {
  if (v == null) return null
  const s = String(v).trim().replace(/\s+/g, '').replace(/\.0+$/, '')
  if (!/^[1-9]\d{6}$/.test(s)) return null
  const segs = SEGMENTOS.map(([a, b]) => s.slice(a, b))
  let n = 0
  if (nivel != null) {
    if (!Number.isInteger(nivel) || nivel < 1 || nivel > 5) return null
    n = nivel
  } else {
    segs.forEach((g, i) => { if (Number(g) !== 0) n = i + 1 })
  }
  if (segs.slice(0, n).some(g => Number(g) === 0)) return null
  if (segs.slice(n).some(g => Number(g) !== 0)) return null
  return segs.slice(0, n).join('.')
}

/** Capítulo + saldo normal → rubro (RESULTADOS: ACREEDOR ingreso, DEUDOR egreso, vacío resultado). */
export function rubroFinnegans(capitulo: CeldaPlan | undefined, saldoNormal: CeldaPlan | undefined): string | null {
  const c = norm(capitulo)
  if (c === '') return null
  if (c === 'activo') return 'activo'
  if (c === 'pasivo') return 'pasivo'
  if (c === 'patrimonio neto' || c === 'patrimonio') return 'pn'
  if (c === 'resultados' || c === 'resultado') {
    const sn = norm(saldoNormal)
    return sn === '' ? 'resultado' : sn === 'acreedor' ? 'ingreso' : sn === 'deudor' ? 'egreso' : sn
  }
  return c
}

export interface FilaFinnegans {
  codigoOriginal: string | null
  codigo:         string | null
  rubro:          string | null
  habilitada:     boolean
  /** La madre convertida no es la madre del código, o el código no se convierte. */
  error:          'CODIGO_FINNEGANS_INVALIDO' | 'MADRE_NO_COINCIDE' | null
}

function celda(fila: Record<string, CeldaPlan>, ...alias: string[]): CeldaPlan {
  for (const [k, v] of Object.entries(fila)) {
    if (alias.includes(norm(k).replace(/[^a-z0-9]+/g, ' ').trim())) return v
  }
  return null
}

export function convertirFilaFinnegans(fila: Record<string, CeldaPlan>): FilaFinnegans {
  const cod = celda(fila, 'codigo', 'cod')
  const codigoOriginal = cod == null ? null : String(cod).trim()
  const nivelTxt = celda(fila, 'nivel')
  const codigo = codigoFinnegans(cod, nivelTxt == null ? null : Number(nivelTxt))
  const hab = norm(celda(fila, 'habilitada'))
  const base = {
    codigoOriginal, codigo, rubro: rubroFinnegans(celda(fila, 'capitulo'), celda(fila, 'saldo normal')),
    habilitada: !['no', 'n', 'false', '0'].includes(hab),
  }
  if (codigo == null) return { ...base, error: 'CODIGO_FINNEGANS_INVALIDO' }
  const esperada = codigo.includes('.') ? codigo.replace(/\.[0-9]+$/, '') : null
  const madreRaw = celda(fila, 'cuenta madre')
  const madreTxt = madreRaw == null ? '' : String(madreRaw).trim()
  const madre = madreTxt === '' || /^0+$/.test(madreTxt) ? null : (codigoFinnegans(madreTxt, codigo.split('.').length - 1) ?? '')
  return { ...base, error: madre !== esperada ? 'MADRE_NO_COINCIDE' : null }
}

/** Lo que se muestra antes de la vista previa. */
export function resumenFinnegans(filas: Record<string, CeldaPlan>[]) {
  const conv = filas.map(convertirFilaFinnegans)
  const ej = conv.find(c => c.codigo && c.codigo.split('.').length === 5) ?? conv.find(c => c.codigo) ?? null
  return {
    total:          conv.length,
    deshabilitadas: conv.filter(c => !c.habilitada).length,
    conError:       conv.filter(c => c.error).length,
    ejemplo:        ej ? { original: ej.codigoOriginal ?? '', convertido: ej.codigo ?? '' } : null,
  }
}

const ALIAS_CODIGO = ['codigo', 'cod', 'cuenta']

function norm(v: unknown): string {
  return String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

function esComentario(fila: unknown[]): boolean {
  const primera = fila.find(c => String(c ?? '').trim() !== '')
  return String(primera ?? '').trim().startsWith('#')
}

function esVacia(fila: unknown[]): boolean {
  return fila.every(c => String(c ?? '').trim() === '')
}

function armar(matriz: unknown[][]): ResultadoPlan {
  const utiles = matriz.filter(f => !esVacia(f) && !esComentario(f))
  const iEnc = utiles.slice(0, 20).findIndex(f => f.some(c => ALIAS_CODIGO.includes(norm(c))))
  if (iEnc < 0) {
    return { filas: [], encabezados: [], error: 'No se encontró la fila de encabezados: tiene que haber una columna «codigo» (y «nombre», «rubro», «imputable», «auxiliar»).', formato: 'estandar' }
  }
  const encabezados = (utiles[iEnc] ?? []).map(c => String(c ?? '').trim())
  const filas = utiles.slice(iEnc + 1).map(f => {
    const o: Record<string, CeldaPlan> = {}
    encabezados.forEach((h, i) => {
      if (!h) return
      const v = f[i]
      o[h] = v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim()
    })
    return o
  })
  const formato: FormatoPlan = esFormatoFinnegans(encabezados) ? 'finnegans' : 'estandar'
  if (filas.length === 0) return { filas, encabezados, error: 'El archivo no tiene cuentas debajo del encabezado.', formato }
  return { filas, encabezados, error: null, formato }
}

/** Parte una línea de CSV respetando comillas dobles. */
function partirLinea(linea: string, sep: string): string[] {
  const out: string[] = []
  let cur = ''
  let enComillas = false
  for (let i = 0; i < linea.length; i++) {
    const ch = linea[i]!
    if (enComillas) {
      if (ch === '"' && linea[i + 1] === '"') { cur += '"'; i++ }
      else if (ch === '"') enComillas = false
      else cur += ch
    } else if (ch === '"') enComillas = true
    else if (ch === sep) { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out
}

export function leerCsvPlan(texto: string): ResultadoPlan {
  const lineas = texto.replace(/^﻿/, '').split(/\r?\n/)
  const encabezado = lineas.find(l => l.trim() && !l.trim().startsWith('#')) ?? ''
  const sep = [';', '\t', ','].map(s => ({ s, n: encabezado.split(s).length })).sort((a, b) => b.n - a.n)[0]!.s
  return armar(lineas.map(l => partirLinea(l, sep)))
}

export function leerXlsxPlan(buf: ArrayBuffer): ResultadoPlan {
  const wb = XLSX.read(buf, { type: 'array' })
  const hoja = wb.SheetNames[0]
  if (!hoja) return { filas: [], encabezados: [], error: 'El archivo no tiene hojas.', formato: 'estandar' }
  const matriz = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[hoja]!, { header: 1, raw: false, defval: null, blankrows: false })
  return armar(matriz)
}

/** Elige el lector por la extensión. */
export async function leerArchivoPlan(file: File): Promise<ResultadoPlan> {
  const nombre = file.name.toLowerCase()
  if (nombre.endsWith('.csv') || nombre.endsWith('.txt')) return leerCsvPlan(await file.text())
  return leerXlsxPlan(await file.arrayBuffer())
}
