/**
 * Capa única de derivación: del `ExportInput` (data cruda que ya tiene el
 * caller en cache de React Query) al `ExportData` que consumen los builders.
 *
 * Los builders NO recalculan nada — solo formatean lo que sale de acá.
 *
 * Reglas críticas que se aplican acá:
 *  - Filtros: `personalDeObra`, `prestamos` y `operarios` se acotan a los
 *    legs que efectivamente tarjaron (horas > 0 o hs_extras > 0) en la obra
 *    dentro del `filtroSem`. Fix de los problemas #1 y #2 del prompt.
 *  - VH efectivo: usa `getVHConCatObra` (cat_obra override > personal_cat_historial > personal.cat_id).
 *  - Costo por semana: `costoLegConCatObra` ya incluye `hs_extras × VH`.
 *  - Préstamos: el saldo acumulado se calcula por leg ordenando por
 *    `created_at` (luego `sem_key`) ASC: otorgados suman, descontados restan.
 */
import {
  costoLegConCatObra,
  getCatIdEfectivo,
  getVHConCatObra,
  getHsExtrasLeg,
  totalHsLeg,
} from '@/lib/utils/costos'
import { getSemDays, getViernes, getViernesCobro, toISO } from '@/lib/utils/dates'
import { fmtDiaSemana, fmtPeriodoCorto, fmtPeriodoLabel, parseISODate } from './helpers/formatters'
import type {
  ContratistaRow,
  DetalleRow,
  ExportData,
  ExportInput,
  OperarioTotal,
  PersonalRow,
  PlanillaLongRow,
  PrestamoRow,
  SemanaTotal,
} from './types'

export function collectData(input: ExportInput): ExportData {
  const {
    obra,
    personalAll,
    categorias,
    horasAll,
    tarifasAll,
    cierres,
    certificacionesAll,
    contratistas,
    catObraAll,
    hsExtrasAll,
    prestamosAll,
    filtroSem,
  } = input

  // ── 1. Aplicar filtro de semanas sobre todos los inputs ─────────
  const semOk = (sk: string) =>
    !filtroSem || (sk >= filtroSem.desde && sk <= filtroSem.hasta)

  const horas = horasAll.filter(h =>
    h.obra_cod === obra.cod && semOk(toISO(getViernes(new Date(h.fecha + 'T12:00:00')))),
  )
  const hsExtras = hsExtrasAll.filter(x =>
    x.obra_cod === obra.cod && x.hs > 0 && semOk(x.sem_key),
  )
  const certificaciones = certificacionesAll.filter(c =>
    c.obra_cod === obra.cod && c.monto > 0 && semOk(c.sem_key),
  )

  // ── 2. Legs que tarjaron en esta obra (dentro del rango) ────────
  const legsEnObra = new Set<string>([
    ...horas.map(h => h.leg),
    ...hsExtras.map(x => x.leg),
  ])

  // ── 3. Set de semanas con actividad (operarios o contratistas) ──
  const semanasSet = new Set<string>([
    ...horas.map(h => toISO(getViernes(new Date(h.fecha + 'T12:00:00')))),
    ...hsExtras.map(x => x.sem_key),
    ...certificaciones.map(c => c.sem_key),
  ])
  const semKeys = [...semanasSet].sort()

  // ── 4. Personal de obra (solo legs que tarjaron) ────────────────
  const personalDeObra: PersonalRow[] = [...legsEnObra]
    .map(leg => personalAll.find(p => p.leg === leg))
    .filter((p): p is NonNullable<typeof p> => !!p)
    .sort((a, b) => a.nom.localeCompare(b.nom))
    .map(p => {
      const cat = categorias.find(c => c.id === p.cat_id)
      // Antigüedad en obra = primera fecha de horas en esta obra (de cualquier rango,
      // no acotado al filtro — el filtro acota qué se muestra, no la antigüedad real).
      const fechasObra = horasAll
        .filter(h => h.obra_cod === obra.cod && h.leg === p.leg && h.horas > 0)
        .map(h => h.fecha)
        .sort()
      const primera = fechasObra[0]
      return {
        leg:            p.leg,
        nom:            p.nom,
        dni:            p.dni,
        catNomActual:   cat?.nom ?? '—',
        vh:             cat?.vh ?? 0,
        tel:            p.tel,
        dir:            p.dir,
        fechaNac:       p.fecha_nacimiento ?? null,
        antiguedadObra: primera ? parseISODate(primera) : null,
      }
    })

  // ── 5. Semanas: totales por semana ──────────────────────────────
  const semanas: SemanaTotal[] = semKeys.map(sk => {
    const vie = new Date(sk + 'T12:00:00')
    const days = getSemDays(vie)
    const fechasISO = days.map(toISO)

    let hsReg = 0
    let hsExt = 0
    let costoOp = 0
    for (const leg of legsEnObra) {
      const reg = fechasISO.reduce((sum, f) => {
        const h = horas.find(x => x.leg === leg && x.fecha === f)
        return sum + (h?.horas ?? 0)
      }, 0)
      const ext = getHsExtrasLeg(hsExtras, obra.cod, leg, sk)
      hsReg += reg
      hsExt += ext
      // costoLegConCatObra ya incluye extras × VH efectivo.
      costoOp += Math.round(
        costoLegConCatObra(horas, hsExtras, personalAll, categorias, tarifasAll, catObraAll, obra.cod, leg, days) / 1000,
      ) * 1000
    }

    const costoCont = certificaciones
      .filter(c => c.sem_key === sk)
      .reduce((s, c) => s + c.monto, 0)

    const estadoCierre = cierres.find(c => c.obra_cod === obra.cod && c.sem_key === sk)?.estado ?? 'pendiente'

    return {
      semKey:            sk,
      periodoCorto:      fmtPeriodoCorto(sk),
      cobro:             getViernesCobro(vie),
      estado:            estadoCierre,
      hsRegulares:       hsReg,
      hsExtras:          hsExt,
      hsTotal:           hsReg + hsExt,
      costoOperarios:    costoOp,
      costoContratistas: costoCont,
    }
  })

  // ── 6. Operarios: totales por leg (suma sobre todas sus semanas) ─
  const operarios: OperarioTotal[] = personalDeObra.map(pdo => {
    const p = personalAll.find(x => x.leg === pdo.leg)!
    let hsReg = 0
    let hsExt = 0
    let monto = 0
    let semanasConVH = 0

    for (const sk of semKeys) {
      const vie = new Date(sk + 'T12:00:00')
      const days = getSemDays(vie)
      const fechasISO = days.map(toISO)
      const reg = fechasISO.reduce((sum, f) => {
        const h = horas.find(x => x.leg === pdo.leg && x.fecha === f)
        return sum + (h?.horas ?? 0)
      }, 0)
      const ext = getHsExtrasLeg(hsExtras, obra.cod, pdo.leg, sk)
      if (reg === 0 && ext === 0) continue

      hsReg += reg
      hsExt += ext
      monto += Math.round(
        costoLegConCatObra(horas, hsExtras, personalAll, categorias, tarifasAll, catObraAll, obra.cod, pdo.leg, days) / 1000,
      ) * 1000

      const vh = getVHConCatObra(catObraAll, personalAll, categorias, tarifasAll, obra.cod, pdo.leg, sk)
      if (vh > 0) semanasConVH++
    }

    // Préstamos del leg dentro del filtro.
    const prestamosLeg = prestamosAll.filter(pr => pr.leg === pdo.leg && semOk(pr.sem_key))
    const otorgados = prestamosLeg.filter(pr => pr.tipo === 'otorgado').reduce((s, pr) => s + pr.monto, 0)
    const descuentos = prestamosLeg.filter(pr => pr.tipo === 'descontado').reduce((s, pr) => s + pr.monto, 0)

    // Categoría más reciente vigente (a la fecha de hoy).
    const hoyISO = toISO(new Date())
    const catId = getCatIdEfectivo(catObraAll, personalAll, obra.cod, pdo.leg, hoyISO) ?? p.cat_id
    const catNomActual = categorias.find(c => c.id === catId)?.nom ?? '—'

    return {
      leg:                pdo.leg,
      nom:                pdo.nom,
      dni:                pdo.dni,
      catNomActual,
      hsRegulares:        hsReg,
      hsExtras:           hsExt,
      hsTotal:            hsReg + hsExt,
      montoBruto:         monto,
      prestamosOtorgados: otorgados,
      descuentos,
      neto:               monto + otorgados - descuentos,
      sinTarifaVigente:   semanasConVH === 0,
    }
  })

  // ── 7. Detalle semanal: filas por semana, operarios → contratistas → subtotal ──
  const detalleSemanal: DetalleRow[] = []
  for (const sem of semanas) {
    const vie = new Date(sem.semKey + 'T12:00:00')
    const days = getSemDays(vie)
    const fechasISO = days.map(toISO)

    // Operarios (alfabético) con hs > 0 esta semana.
    const operariosSem = personalDeObra
      .map(pdo => {
        const reg = fechasISO.reduce((sum, f) => {
          const h = horas.find(x => x.leg === pdo.leg && x.fecha === f)
          return sum + (h?.horas ?? 0)
        }, 0)
        const ext = getHsExtrasLeg(hsExtras, obra.cod, pdo.leg, sem.semKey)
        const hs = reg + ext
        if (hs === 0) return null
        const monto = Math.round(
          costoLegConCatObra(horas, hsExtras, personalAll, categorias, tarifasAll, catObraAll, obra.cod, pdo.leg, days) / 1000,
        ) * 1000
        const catId = getCatIdEfectivo(catObraAll, personalAll, obra.cod, pdo.leg, sem.semKey)
        const catNom = catId ? (categorias.find(c => c.id === catId)?.nom ?? '—') : '—'
        return { pdo, hs, monto, catNom }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)

    for (const op of operariosSem) {
      detalleSemanal.push({
        tipo:            'operario',
        semKey:          sem.semKey,
        periodoCorto:    sem.periodoCorto,
        cobro:           sem.cobro,
        nombre:          op.pdo.nom,
        catEspecialidad: op.catNom,
        horas:           op.hs,
        monto:           op.monto,
        estado:          sem.estado,
      })
    }

    // Contratistas (alfabético) certificados esta semana.
    const contratsSem = certificaciones
      .filter(c => c.sem_key === sem.semKey)
      .map(cert => {
        const ct = contratistas.find(c => c.id === cert.contrat_id)
        return { cert, nombre: ct?.nom ?? '—', especialidad: ct?.especialidad ?? '—' }
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre))

    for (const c of contratsSem) {
      detalleSemanal.push({
        tipo:            'contratista',
        semKey:          sem.semKey,
        periodoCorto:    sem.periodoCorto,
        cobro:           sem.cobro,
        nombre:          c.nombre,
        catEspecialidad: c.especialidad,
        horas:           null,
        monto:           Math.round(c.cert.monto / 1000) * 1000,
        estado:          sem.estado,
      })
    }

    // Subtotal de la semana.
    detalleSemanal.push({
      tipo:            'subtotal',
      semKey:          sem.semKey,
      periodoCorto:    sem.periodoCorto,
      cobro:           null,
      nombre:          `Subtotal ${sem.periodoCorto}`,
      catEspecialidad: '',
      horas:           sem.hsTotal,
      monto:           sem.costoOperarios + sem.costoContratistas,
      estado:          null,
    })
  }

  // ── 8. Planillas en formato largo (una fila por día/leg con horas > 0 + filas por hs extras) ──
  const planillasLong: PlanillaLongRow[] = []
  for (const sem of semanas) {
    const vie = new Date(sem.semKey + 'T12:00:00')
    const days = getSemDays(vie)

    for (const pdo of personalDeObra) {
      const catId = getCatIdEfectivo(catObraAll, personalAll, obra.cod, pdo.leg, sem.semKey)
      const catNom = catId ? (categorias.find(c => c.id === catId)?.nom ?? '—') : '—'

      // Horas regulares por día.
      for (const d of days) {
        const f = toISO(d)
        const h = horas.find(x => x.leg === pdo.leg && x.fecha === f)
        if (!h || h.horas <= 0) continue
        planillasLong.push({
          semKey:       sem.semKey,
          periodoCorto: sem.periodoCorto,
          leg:          pdo.leg,
          nom:          pdo.nom,
          catNom,
          fecha:        new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12),
          diaSemana:    fmtDiaSemana(d),
          horas:        h.horas,
          tipo:         'Regular',
        })
      }

      // Hs extras: fila aparte con fecha = viernes de la semana (no hay día específico).
      const ext = getHsExtrasLeg(hsExtras, obra.cod, pdo.leg, sem.semKey)
      if (ext > 0) {
        planillasLong.push({
          semKey:       sem.semKey,
          periodoCorto: sem.periodoCorto,
          leg:          pdo.leg,
          nom:          pdo.nom,
          catNom,
          fecha:        new Date(vie.getFullYear(), vie.getMonth(), vie.getDate(), 12),
          diaSemana:    fmtDiaSemana(vie),
          horas:        ext,
          tipo:         'Extra',
        })
      }
    }
  }

  // ── 9. Contratistas (filas planas, sin subtotales — eso queda para el builder) ──
  const contratistasRows: ContratistaRow[] = certificaciones
    .map(cert => {
      const sem = semanas.find(s => s.semKey === cert.sem_key)!
      const ct = contratistas.find(c => c.id === cert.contrat_id)
      return {
        semKey:       cert.sem_key,
        periodoCorto: sem.periodoCorto,
        cobro:        sem.cobro,
        nombre:       ct?.nom ?? '—',
        especialidad: ct?.especialidad ?? '—',
        descripcion:  cert.desc ?? '',
        monto:        Math.round(cert.monto / 1000) * 1000,
        estado:       sem.estado,
      }
    })
    .sort((a, b) =>
      a.semKey.localeCompare(b.semKey) || a.nombre.localeCompare(b.nombre),
    )

  // ── 10. Préstamos filtrados a legsEnObra + saldo acumulado por leg ──
  const prestamosFiltrados = prestamosAll
    .filter(p => legsEnObra.has(p.leg) && semOk(p.sem_key))
    .map(p => {
      const per = personalAll.find(pe => pe.leg === p.leg)
      return {
        raw:      p,
        nombre:   per?.nom ?? '—',
        fechaObj: p.created_at ? new Date(p.created_at) : null,
      }
    })
    // Orden global: por nombre → fecha (para que dentro de un leg quede ascendente).
    .sort((a, b) =>
      a.nombre.localeCompare(b.nombre)
      || (a.fechaObj?.getTime() ?? 0) - (b.fechaObj?.getTime() ?? 0)
      || a.raw.sem_key.localeCompare(b.raw.sem_key),
    )

  const saldoPorLeg = new Map<string, number>()
  const prestamosRows: PrestamoRow[] = prestamosFiltrados.map(({ raw, nombre, fechaObj }) => {
    const delta = raw.tipo === 'otorgado' ? raw.monto : -raw.monto
    const prev = saldoPorLeg.get(raw.leg) ?? 0
    const nuevo = prev + delta
    saldoPorLeg.set(raw.leg, nuevo)
    return {
      leg:            raw.leg,
      nom:            nombre,
      tipo:           raw.tipo === 'otorgado' ? 'Otorgado' : 'Descontado',
      monto:          raw.monto,
      concepto:       raw.concepto ?? '',
      semKey:         raw.sem_key,
      fecha:          fechaObj,
      saldoAcumulado: nuevo,
    }
  })

  // ── 11. Totales globales de obra ───────────────────────────────
  const totalesObra = {
    hsRegulares:        semanas.reduce((s, sem) => s + sem.hsRegulares, 0),
    hsExtras:           semanas.reduce((s, sem) => s + sem.hsExtras, 0),
    hsTotal:            semanas.reduce((s, sem) => s + sem.hsTotal, 0),
    costoOperarios:     semanas.reduce((s, sem) => s + sem.costoOperarios, 0),
    costoContratistas:  semanas.reduce((s, sem) => s + sem.costoContratistas, 0),
    prestamosOtorgados: operarios.reduce((s, o) => s + o.prestamosOtorgados, 0),
    descuentos:         operarios.reduce((s, o) => s + o.descuentos, 0),
    neto: 0, // se completa abajo
  }
  totalesObra.neto =
    totalesObra.costoOperarios
    + totalesObra.costoContratistas
    + totalesObra.prestamosOtorgados
    - totalesObra.descuentos

  // ── 12. Meta y flags ────────────────────────────────────────────
  return {
    meta: {
      generadoEn:   new Date(),
      obraCod:      obra.cod,
      obraNom:      obra.nom,
      obraCC:       obra.cc,
      periodoLabel: fmtPeriodoLabel(filtroSem),
      esRango:      !!filtroSem && filtroSem.desde !== filtroSem.hasta,
    },
    semanas,
    operarios,
    totalesObra,
    detalleSemanal,
    planillasLong,
    contratistas: contratistasRows,
    prestamos: prestamosRows,
    personalDeObra,
    flags: {
      hayExtras:       semanas.some(s => s.hsExtras > 0),
      hayPrestamos:    prestamosRows.length > 0,
      hayContratistas: contratistasRows.length > 0,
      sinDatos:        semanas.length === 0,
    },
  }
}
