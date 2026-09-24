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
// El CSV se parte a mano (`;`, `,` o tab, el que aparezca en el encabezado)
// en vez de dejárselo a la librería: la línea de comentario de arriba confunde
// su detección de separador.

import * as XLSX from 'xlsx'
import type { CeldaPlan } from '../hooks/useContabilidad'

export interface ResultadoPlan {
  filas:       Record<string, CeldaPlan>[]
  encabezados: string[]
  /** Por qué no se pudo leer (sin encabezado, archivo vacío…). */
  error:       string | null
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
    return { filas: [], encabezados: [], error: 'No se encontró la fila de encabezados: tiene que haber una columna «codigo» (y «nombre», «rubro», «imputable», «auxiliar»).' }
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
  if (filas.length === 0) return { filas, encabezados, error: 'El archivo no tiene cuentas debajo del encabezado.' }
  return { filas, encabezados, error: null }
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
  if (!hoja) return { filas: [], encabezados: [], error: 'El archivo no tiene hojas.' }
  const matriz = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[hoja]!, { header: 1, raw: false, defval: null, blankrows: false })
  return armar(matriz)
}

/** Elige el lector por la extensión. */
export async function leerArchivoPlan(file: File): Promise<ResultadoPlan> {
  const nombre = file.name.toLowerCase()
  if (nombre.endsWith('.csv') || nombre.endsWith('.txt')) return leerCsvPlan(await file.text())
  return leerXlsxPlan(await file.arrayBuffer())
}
