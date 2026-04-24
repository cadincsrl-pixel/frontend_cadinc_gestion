import type { Hora, Personal, Categoria, Tarifa, TarjaHsExtra } from '@/types/domain.types'
import { toISO, getViernes } from './dates'

// Horas extras de un trabajador para una obra × semana (0 si no hay registro)
export function getHsExtrasLeg(
  hsExtras: TarjaHsExtra[],
  obraCod: string,
  leg: string,
  semKey: string
): number {
  const row = hsExtras.find(x => x.obra_cod === obraCod && x.leg === leg && x.sem_key === semKey)
  return row?.hs ?? 0
}

// Tarifa vigente para una categoría en una obra en una fecha dada
export function getTarifaEnFecha(
  tarifas: Tarifa[],
  obraCod: string,
  catId: number,
  dateStr: string
): number | null {
  const hist = tarifas
    .filter(t => t.obra_cod === obraCod && t.cat_id === catId)
    .sort((a, b) => a.desde.localeCompare(b.desde))

  if (!hist.length) return null

  // Buscar la más reciente cuya vigencia sea <= dateStr
  let vigente: Tarifa | null = null
  for (const t of hist) {
    if (t.desde <= dateStr) vigente = t
  }

  // Si ninguna cubre esa fecha, usar la más antigua (retroactivo)
  return vigente ? vigente.vh : hist[0]!.vh
}

// Valor hora de un trabajador en una obra en una fecha
// catIdOverride: si se pasa, usa esa categoría en lugar de buscarla en personal (para respetar overrides de cat_obra)
export function getVHenFecha(
  personal: Personal[],
  categorias: Categoria[],
  tarifas: Tarifa[],
  obraCod: string,
  leg: string,
  dateStr: string,
  catIdOverride?: number
): number {
  let catId: number

  if (catIdOverride !== undefined) {
    catId = catIdOverride
  } else {
    const p = personal.find(x => x.leg === leg)
    if (!p) return 0

    // Categoría vigente en esa fecha según historial global
    const hist = [...(p.personal_cat_historial ?? [])]
      .sort((a, b) => a.desde.localeCompare(b.desde))

    catId = p.cat_id
    for (const h of hist) {
      if (h.desde <= dateStr) catId = h.cat_id
    }
  }

  // Tarifa de obra primero, fallback a global
  const tarifaObra = getTarifaEnFecha(tarifas, obraCod, catId, dateStr)
  if (tarifaObra !== null) return tarifaObra

  const cat = categorias.find(c => c.id === catId)
  return cat?.vh ?? 0
}

// Total de horas de un trabajador en una lista de días.
// Si se pasa hsExtras, incluye las hs extras de la semana correspondiente.
// sem_key = viernes de la semana (convención del proyecto, §5.3 CLAUDE.md).
export function totalHsLeg(
  horas: Hora[],
  obraCod: string,
  leg: string,
  fechas: string[],
  hsExtras?: TarjaHsExtra[]
): number {
  const normales = fechas.reduce((sum, fecha) => {
    const h = horas.find(x => x.obra_cod === obraCod && x.leg === leg && x.fecha === fecha)
    return sum + (h?.horas ?? 0)
  }, 0)
  if (!hsExtras || hsExtras.length === 0 || fechas.length === 0) return normales
  // Calcular sem_key desde el primer día (viernes de la semana).
  const semKey = toISO(getViernes(new Date(fechas[0]! + 'T00:00:00')))
  return normales + getHsExtrasLeg(hsExtras, obraCod, leg, semKey)
}

// Costo total de un trabajador en una semana.
// catIdOverride: categoría efectiva (ej: override de cat_obra para esta semana/obra).
// hsExtras (opcional): si viene, suma `hs * VH_efectivo` al costo.
export function costoLeg(
  horas: Hora[],
  personal: Personal[],
  categorias: Categoria[],
  tarifas: Tarifa[],
  obraCod: string,
  leg: string,
  dias: Date[],
  catIdOverride?: number,
  hsExtras?: TarjaHsExtra[]
): number {
  const semStartStr = toISO(dias[0]!)
  const hoyStr = toISO(new Date())
  const esSemActual = semStartStr === toISO(getViernes(new Date()))
  const fechaRef = esSemActual ? hoyStr : semStartStr

  const vh = getVHenFecha(personal, categorias, tarifas, obraCod, leg, fechaRef, catIdOverride)
  const hs = fechas_reduce(horas, obraCod, leg, dias.map(toISO))
  const costoBase = hs * vh

  if (!hsExtras || hsExtras.length === 0) return costoBase
  const semKey = toISO(getViernes(dias[0]!))
  const extras = getHsExtrasLeg(hsExtras, obraCod, leg, semKey)
  return costoBase + extras * vh
}

// Helper local para sumar horas normales sin acoplarse a la firma extendida de totalHsLeg.
function fechas_reduce(horas: Hora[], obraCod: string, leg: string, fechas: string[]): number {
  return fechas.reduce((sum, fecha) => {
    const h = horas.find(x => x.obra_cod === obraCod && x.leg === leg && x.fecha === fecha)
    return sum + (h?.horas ?? 0)
  }, 0)
}

// Totales de una semana completa para una obra.
// hsExtras (opcional): si viene, suma al total (hs) y al costo total.
export function calcularTotalesSemana(
  horas: Hora[],
  personal: Personal[],
  categorias: Categoria[],
  tarifas: Tarifa[],
  obraCod: string,
  dias: Date[],
  hsExtras?: TarjaHsExtra[]
): { totalHs: number; totalCosto: number } {
  let totalHs = 0
  let totalCosto = 0

  for (const p of personal) {
    totalHs    += totalHsLeg(horas, obraCod, p.leg, dias.map(toISO), hsExtras)
    totalCosto += costoLeg(horas, personal, categorias, tarifas, obraCod, p.leg, dias, undefined, hsExtras)
  }

  return { totalHs, totalCosto }
}

export function fmtMonto(n: number): string {
  return '$' + (Math.round(n / 1000) * 1000).toLocaleString('es-AR')
}

export function fmtHs(n: number): string {
  const rounded = Math.round(n * 100) / 100
  return rounded > 0 ? `${rounded}hs` : '0hs'
}

// ── Cat-obra overrides ────────────────────────────────────────
// Shape de una entrada de cat_obra (override de categoría por obra+leg con fecha efectiva).
export type CatObraEntry = {
  obra_cod: string
  leg:      string
  cat_id:   number
  desde:    string
}

// Categoría efectiva de un trabajador en una obra a una fecha dada.
// Precedencia: cat_obra (más reciente con desde <= fechaRef) > personal_cat_historial
// > personal.cat_id. Si no hay ninguna aplicable, usa la más antigua de cat_obra
// como fallback retroactivo.
export function getCatIdEfectivo(
  catObra: CatObraEntry[],
  personal: Personal[],
  obraCod: string,
  leg: string,
  fechaRef: string,
): number | null {
  const catObraHist = catObra.filter(co => co.obra_cod === obraCod && co.leg === leg)
  if (catObraHist.length > 0) {
    let best: { cat_id: number; desde: string } | null = null
    for (const h of catObraHist) {
      if (h.desde <= fechaRef) {
        if (!best || h.desde >= best.desde) best = h
      }
    }
    if (best) return best.cat_id
    // Sin entrada aplicable (todas son posteriores a fechaRef): usar la más antigua
    // como cat retroactiva (el trabajador ya tiene override en esa obra pero aún no vigente).
    return catObraHist.reduce((a, b) => a.desde <= b.desde ? a : b).cat_id
  }
  const p = personal.find(x => x.leg === leg)
  if (!p) return null
  const hist = [...(p.personal_cat_historial ?? [])]
    .sort((a, b) => a.desde.localeCompare(b.desde))
  let catId = p.cat_id
  for (const h of hist) {
    if (h.desde <= fechaRef) catId = h.cat_id
  }
  return catId
}

// Valor hora efectivo de un trabajador en una obra a una fecha dada,
// respetando cat_obra overrides y tarifas retroactivas.
// - Busca la tarifa de obra+catEfectiva más reciente con desde <= fechaRef.
// - Si todas las tarifas son futuras → usa la más antigua (retroactivo).
// - Si no hay tarifa de obra → usa precio global de la categoría.
// - Si no hay categoría efectiva → 0.
export function getVHConCatObra(
  catObra: CatObraEntry[],
  personal: Personal[],
  categorias: Categoria[],
  tarifas: Tarifa[],
  obraCod: string,
  leg: string,
  fechaRef: string,
): number {
  const catId = getCatIdEfectivo(catObra, personal, obraCod, leg, fechaRef)
  if (!catId) return 0
  const tarifaObraAll = tarifas
    .filter(t => t.obra_cod === obraCod && t.cat_id === catId)
    .sort((a, b) => a.desde.localeCompare(b.desde))
  let vh: number | null = null
  if (tarifaObraAll.length > 0) {
    for (const t of tarifaObraAll) {
      if (t.desde <= fechaRef) vh = t.vh
      else break
    }
    if (vh === null) vh = tarifaObraAll[0]!.vh
  } else {
    vh = categorias.find(c => c.id === catId)?.vh ?? 0
  }
  return vh ?? 0
}

// Costo de un trabajador en una obra para una semana, respetando cat_obra
// overrides y sumando hs extras (si vienen). Si la semana a calcular es la
// actual y hoy no cubre el viernes, usa hoy como fechaRef para tomar VH vigente.
export function costoLegConCatObra(
  horas: Hora[],
  hsExtras: TarjaHsExtra[],
  personal: Personal[],
  categorias: Categoria[],
  tarifas: Tarifa[],
  catObra: CatObraEntry[],
  obraCod: string,
  leg: string,
  days: Date[],
): number {
  const semStartStr = toISO(days[0]!)
  const hoyStr = toISO(new Date())
  const esSemActual = semStartStr === toISO(getViernes(new Date()))
  const fechaRef = esSemActual ? hoyStr : semStartStr

  const vh = getVHConCatObra(catObra, personal, categorias, tarifas, obraCod, leg, fechaRef)
  if (vh === 0) return 0

  const hs = totalHsLeg(horas, obraCod, leg, days.map(toISO))
  const semKey = toISO(getViernes(days[0]!))
  const extras = hsExtras.find(
    e => e.obra_cod === obraCod && e.leg === leg && e.sem_key === semKey,
  )?.hs ?? 0
  return (hs + extras) * vh
}