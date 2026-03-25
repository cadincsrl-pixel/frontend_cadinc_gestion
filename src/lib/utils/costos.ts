import type { Hora, Personal, Categoria, Tarifa } from '@/types/domain.types'
import { toISO, getViernes } from './dates'

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
export function getVHenFecha(
  personal: Personal[],
  categorias: Categoria[],
  tarifas: Tarifa[],
  obraCod: string,
  leg: string,
  dateStr: string
): number {
  const p = personal.find(x => x.leg === leg)
  if (!p) return 0

  // Categoría vigente en esa fecha
  const hist = [...(p.personal_cat_historial ?? [])]
    .sort((a, b) => a.desde.localeCompare(b.desde))

  let catId = p.cat_id
  for (const h of hist) {
    if (h.desde <= dateStr) catId = h.cat_id
  }

  // Tarifa de obra primero, fallback a global
  const tarifaObra = getTarifaEnFecha(tarifas, obraCod, catId, dateStr)
  if (tarifaObra !== null) return tarifaObra

  const cat = categorias.find(c => c.id === catId)
  return cat?.vh ?? 0
}

// Total de horas de un trabajador en una lista de días
export function totalHsLeg(
  horas: Hora[],
  obraCod: string,
  leg: string,
  fechas: string[]
): number {
  return fechas.reduce((sum, fecha) => {
    const h = horas.find(x => x.obra_cod === obraCod && x.leg === leg && x.fecha === fecha)
    return sum + (h?.horas ?? 0)
  }, 0)
}

// Costo total de un trabajador en una semana
export function costoLeg(
  horas: Hora[],
  personal: Personal[],
  categorias: Categoria[],
  tarifas: Tarifa[],
  obraCod: string,
  leg: string,
  dias: Date[]
): number {
  const semStartStr = toISO(dias[0]!)
  const hoyStr = toISO(new Date())
  const esSemActual = semStartStr === toISO(getViernes(new Date()))
  const fechaRef = esSemActual ? hoyStr : semStartStr

  const vh = getVHenFecha(personal, categorias, tarifas, obraCod, leg, fechaRef)
  const hs = totalHsLeg(horas, obraCod, leg, dias.map(toISO))
  return hs * vh
}

// Totales de una semana completa para una obra
export function calcularTotalesSemana(
  horas: Hora[],
  personal: Personal[],
  categorias: Categoria[],
  tarifas: Tarifa[],
  obraCod: string,
  dias: Date[]
): { totalHs: number; totalCosto: number } {
  let totalHs = 0
  let totalCosto = 0

  for (const p of personal) {
    totalHs    += totalHsLeg(horas, obraCod, p.leg, dias.map(toISO))
    totalCosto += costoLeg(horas, personal, categorias, tarifas, obraCod, p.leg, dias)
  }

  return { totalHs, totalCosto }
}

export function fmtMonto(n: number): string {
  return '$' + (Math.round(n / 1000) * 1000).toLocaleString('es-AR')
}

export function fmtHs(n: number): string {
  return n > 0 ? `${n}hs` : '0hs'
}