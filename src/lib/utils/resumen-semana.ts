import { getSemDays, toISO, getViernes } from './dates'
import { totalHsLeg, costoLegConCatObra } from './costos'
import type { CatObraEntry } from './costos'
import type {
  Obra, Personal, Categoria, Tarifa, Hora, Certificacion,
  TarjaHsExtra, Prestamo,
} from '@/types/domain.types'

// Re-export para callers que importan desde resumen-semana.
export type { CatObraEntry } from './costos'

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
