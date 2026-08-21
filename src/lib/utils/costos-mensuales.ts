import type { Hora, Personal, Categoria, Tarifa, TarjaHsExtra, Certificacion } from '@/types/domain.types'
import { getSemDays, getViernes, toISO } from './dates'
import { costoLegConCatObra, type CatObraEntry } from './costos'

/**
 * Costo directo MENSUAL por obra = suma de los costos SEMANALES tal como los
 * calcula el tab Histórico del dashboard (ResumenHistoricoPage):
 *
 * - Una semana pertenece al mes si su `sem_key` (el viernes de la semana,
 *   convención §5.3) cae dentro del mes. Los meses "se cortan por semana de
 *   tarja": una semana que arranca el vie 31/07 es TODA de julio aunque
 *   termine en agosto.
 * - Por semana y por leg se usa la fórmula canónica `costoLegConCatObra`
 *   (§5.11: respeta overrides de cat_obra + tarifas retroactivas) y se
 *   redondea per-leg al millar — igual que el footer de TarjaTable y el
 *   histórico. Así el total del mes cuadra EXACTO contra el tab Histórico
 *   filtrado a esas mismas semanas.
 * - Contratistas: certificaciones con `sem_key` dentro del mes, sin redondeo
 *   (los montos entran como se cargaron).
 *
 * Función pura (sin hooks ni fetch) para poder testearla aislada.
 */

export interface CostosMensualesParams {
  obras:      Array<{ cod: string }>
  horas:      Hora[]
  hsExtras:   TarjaHsExtra[]
  personal:   Personal[]
  categorias: Categoria[]
  tarifas:    Tarifa[]
  catObra:    CatObraEntry[]
  certs:      Certificacion[]
}

export interface CostoDirectoObra {
  costoOperarios:    number
  costoContratistas: number
}

/** `mes` en formato YYYY-MM. Devuelve solo obras con algún costo en el mes. */
export function calcularCostosMensualesPorObra(
  params: CostosMensualesParams,
  mes: string,
): Map<string, CostoDirectoObra> {
  const { obras, horas, hsExtras, personal, categorias, tarifas, catObra, certs } = params
  const out = new Map<string, CostoDirectoObra>()

  const esDelMes = (semKey: string) => semKey.slice(0, 7) === mes

  for (const o of obras) {
    // ── Semanas del mes con actividad en la obra ──
    // (horas normales, hs extras o certificaciones — misma unión que el
    // histórico, por si una obra solo tuvo extras o solo contratistas)
    const semKeys = new Set<string>()
    for (const h of horas) {
      if (h.obra_cod !== o.cod) continue
      const sk = toISO(getViernes(new Date(h.fecha + 'T12:00:00')))
      if (esDelMes(sk)) semKeys.add(sk)
    }
    for (const e of hsExtras) {
      if (e.obra_cod === o.cod && esDelMes(e.sem_key)) semKeys.add(e.sem_key)
    }

    // ── Operarios: costo per-leg redondeado al millar, por semana ──
    let costoOperarios = 0
    semKeys.forEach(sk => {
      const days = getSemDays(new Date(sk + 'T12:00:00'))
      const desdeISO = toISO(days[0]!)
      const hastaISO = toISO(days[6]!)
      const horasSem  = horas.filter(h => h.obra_cod === o.cod && h.fecha >= desdeISO && h.fecha <= hastaISO)
      const extrasSem = hsExtras.filter(e => e.obra_cod === o.cod && e.sem_key === sk)
      const legsConActividad = [...new Set([
        ...horasSem.map(h => h.leg),
        ...extrasSem.map(e => e.leg),
      ])]
      for (const leg of legsConActividad) {
        costoOperarios += Math.round(
          costoLegConCatObra(horas, hsExtras, personal, categorias, tarifas, catObra, o.cod, leg, days) / 1000
        ) * 1000
      }
    })

    // ── Contratistas: certs con sem_key en el mes ──
    let costoContratistas = 0
    for (const c of certs) {
      if (c.obra_cod === o.cod && esDelMes(c.sem_key)) costoContratistas += c.monto
    }

    if (costoOperarios !== 0 || costoContratistas !== 0) {
      out.set(o.cod, { costoOperarios, costoContratistas })
    }
  }

  return out
}
