import { getSemDays, toISO, getViernes } from './dates'
import { totalHsLeg } from './costos'
import type {
  Obra, Personal, Categoria, Tarifa, Hora, Certificacion,
  TarjaHsExtra, Prestamo,
} from '@/types/domain.types'

export type CatObraEntry = {
  obra_cod: string
  leg: string
  cat_id: number
  desde: string
}

export type ResumenSemanaCard = {
  obra: Obra
  legs: number
  hs: number
  costo: number
  contrat: number
}

export type ResumenSemana = {
  cards: ResumenSemanaCard[]
  totalPersonal: number
  totalHs: number
  totalCostoOp: number
  totalCostoContrat: number
  /** +otorgados −descuentos (signed). Negativo = hay más descuentos. */
  totalPrestamosNeto: number
  totalPrestamosOtorgados: number
  totalPrestamosDescuentos: number
  countPrestamosOtorgados: number
  countPrestamosDescuentos: number
  totalSemana: number
  semKey: string
  dias: Date[]
}

export type CalcularResumenSemanaParams = {
  obras: Obra[]
  /** Cualquier fecha de la semana — se normaliza al viernes. */
  semana: Date
  horas: Hora[]
  hsExtras: TarjaHsExtra[]
  personal: Personal[]
  categorias: Categoria[]
  tarifas: Tarifa[]
  certificaciones: Certificacion[]
  catObra: CatObraEntry[]
  prestamos: Prestamo[]
}

function getCatIdEfectivo(
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

function costoLegConCatObra(
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

  const hs = totalHsLeg(horas, obraCod, leg, days.map(toISO))
  const semKey = toISO(getViernes(days[0]!))
  const extras = hsExtras.find(
    e => e.obra_cod === obraCod && e.leg === leg && e.sem_key === semKey,
  )?.hs ?? 0
  return (hs + extras) * (vh ?? 0)
}

export function calcularResumenSemana(params: CalcularResumenSemanaParams): ResumenSemana {
  const {
    obras, semana, horas, hsExtras, personal, categorias, tarifas,
    certificaciones, catObra, prestamos,
  } = params

  const viernes = getViernes(semana)
  const semKey = toISO(viernes)
  const dias = getSemDays(viernes)
  const desde = toISO(dias[0]!)
  const hasta = toISO(dias[6]!)

  let totalHs = 0
  let totalCostoOp = 0
  let totalCostoContrat = 0
  const legsUnicos = new Set<string>()

  const cards: ResumenSemanaCard[] = obras.map(o => {
    const horasObra = horas.filter(
      h => h.obra_cod === o.cod && h.fecha >= desde && h.fecha <= hasta,
    )
    const extrasObraSem = hsExtras.filter(
      e => e.obra_cod === o.cod && e.sem_key === semKey,
    )
    const legsConActividad = [...new Set([
      ...horasObra.map(h => h.leg),
      ...extrasObraSem.map(e => e.leg),
    ])]

    let oHs = 0
    let oCosto = 0
    legsConActividad.forEach(leg => {
      legsUnicos.add(leg)
      const hs = totalHsLeg(horas, o.cod, leg, dias.map(toISO), hsExtras)
      oHs += hs
      oCosto += Math.round(
        costoLegConCatObra(horas, hsExtras, personal, categorias, tarifas, catObra, o.cod, leg, dias) / 1000,
      ) * 1000
    })

    const oContrat = certificaciones
      .filter(c => c.obra_cod === o.cod && c.sem_key === semKey)
      .reduce((s, c) => s + c.monto, 0)

    totalHs += oHs
    totalCostoOp += oCosto
    totalCostoContrat += oContrat

    return { obra: o, hs: oHs, costo: oCosto, contrat: oContrat, legs: legsConActividad.length }
  }).filter(c => c.hs > 0 || c.contrat > 0)

  const prestamosSem = prestamos.filter(p => p.sem_key === semKey)
  let totalPrestamosOtorgados = 0
  let totalPrestamosDescuentos = 0
  let countPrestamosOtorgados = 0
  let countPrestamosDescuentos = 0
  for (const p of prestamosSem) {
    if (p.tipo === 'otorgado') {
      totalPrestamosOtorgados += p.monto
      countPrestamosOtorgados++
    } else {
      totalPrestamosDescuentos += p.monto
      countPrestamosDescuentos++
    }
  }
  const totalPrestamosNeto = totalPrestamosOtorgados - totalPrestamosDescuentos
  const totalSemana = totalCostoOp + totalCostoContrat + totalPrestamosNeto

  return {
    cards,
    totalPersonal: legsUnicos.size,
    totalHs,
    totalCostoOp,
    totalCostoContrat,
    totalPrestamosNeto,
    totalPrestamosOtorgados,
    totalPrestamosDescuentos,
    countPrestamosOtorgados,
    countPrestamosDescuentos,
    totalSemana,
    semKey,
    dias,
  }
}
