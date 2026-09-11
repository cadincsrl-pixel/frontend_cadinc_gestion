'use client'

import { motivoErrorGuardado } from '@/lib/utils/cierres'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTarjaStore } from '../store/tarja.store'
import { useHorasSemana, useUpsertHora, useUpsertHorasLote } from '../hooks/useHoras'
import { useHsExtras, useUpsertHsExtra } from '../hooks/useHsExtras'
import { useQuitarDeSemana } from '../hooks/useAsignaciones'
import { useCatObraSemana, useSetCatObra } from '../hooks/useCatObra'
import { useObras } from '../hooks/useObras'
import { usePerfilesMap } from '@/lib/hooks/usePerfilesMap'
import { usePermisos } from '@/hooks/usePermisos'
import { useSessionStore } from '@/store/session.store'
import { getSemDays, getViernes, toISO, esFinde, esJueves, esHoy, DIAS, hoyArgentinaISO } from '@/lib/utils/dates'
import { costoLegConCatObra, getVHConCatObra, getCatIdEfectivo, getTarifaEnFecha, fmtMonto, getHsExtrasLeg, redondearHs } from '@/lib/utils/costos'
import { parseCantidadAR } from '@/lib/utils/numeros'
import { useToast } from '@/components/ui/Toast'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api/client'
import type { Personal, Categoria, Hora, Tarifa } from '@/types/domain.types'

// Umbral para el aviso de "valor alto" al cargar hs extras. Por encima de esto se
// pide confirmación (no hay tope duro; antes el máximo bloqueaba en 200).
const ALERTA_HS_EXTRA = 200

interface Props {
  obraCod: string
  personal: Personal[]
  categorias: Categoria[]
  tarifas: Tarifa[]
  onUndoStateChange?: (count: number, fn: () => void) => void
  readonly?: boolean
}

interface UndoEntry {
  leg: string
  fecha: string
  antes: number
  /** obra:semana en la que se hizo el cambio: no se deshace en otra. */
  ctx: string
}

function getHoraClass(h: number): string {
  if (h === 0) return 'border-gris-mid bg-white text-gris-mid'
  if (h >= 8) return 'border-verde/40 bg-verde-light text-verde'
  return 'border-[#E0A800] bg-[#FFF3CD] text-[#7A5000]'
}
export function TarjaTable({ obraCod, personal, categorias, tarifas, onUndoStateChange, readonly = false }: Props) {
  const { semActual } = useTarjaStore()
  const toast = useToast()
  const { puedeEditar, puedeEliminar, verCostos, verPii, esCapataz } = usePermisos('tarja')
  // Vista restringida (scope='asignadas' y no es admin): el user solo carga
  // horas; ni cambia categoría, ni ve hs extras, ni costos.
  const scopeAsignadas = useSessionStore(s =>
    s.profile?.rol !== 'admin' && s.profile?.obras_scope === 'asignadas'
  )
  // `readonly` = obra archivada o semana cerrada: ni categoría ni quitar.
  const puedeCambiarCategoria = puedeEditar && !scopeAsignadas && !readonly
  const verHsExtras = !scopeAsignadas
  // Quitar de la semana = DELETE /horas/:obra/semana → tarja.eliminacion + ver_pii.
  // Se deshabilita (no se oculta): el backend valida igual.
  const puedeQuitar = puedeEliminar && verPii && !readonly
  const motivoNoQuitar = readonly ? 'Semana cerrada u obra archivada'
    : !puedeEliminar ? 'Sin permiso para quitar trabajadores'
    : !verPii ? 'Requiere el permiso ver_pii en tarja'
    : null
  const days = getSemDays(semActual)
  // Fecha de hoy en horario Argentina (YYYY-MM-DD). Para capataces el único
  // día editable es éste — el resto queda read-only aunque sea de la semana
  // actual. La validación dura está en el backend (horas.routes.ts).
  // `tick` fuerza recomputarla cuando la pestaña vuelve a foco: un capataz
  // que deja la tarja abierta de un día para otro veía "hoy" viejo y celdas
  // editables que el backend después rechaza (incidente 2026-08-21/24).
  const [, setTick] = useState(0)
  useEffect(() => {
    const refrescar = () => setTick(t => t + 1)
    document.addEventListener('visibilitychange', refrescar)
    window.addEventListener('focus', refrescar)
    return () => {
      document.removeEventListener('visibilitychange', refrescar)
      window.removeEventListener('focus', refrescar)
    }
  }, [])
  // Hora Argentina, no el reloj del dispositivo (mismo criterio que el backend).
  const hoyISO = hoyArgentinaISO()
  const desde = toISO(days[0]!)
  const hasta = toISO(days[6]!)

  const { data: horasData = [], isLoading } = useHorasSemana(obraCod, desde, hasta)
  const { data: hsExtrasData = [] } = useHsExtras(obraCod, desde, hasta)
  const { mutate: upsertHora } = useUpsertHora()
  const { mutate: upsertHoraLote } = useUpsertHorasLote()
  const { mutateAsync: upsertHsExtra } = useUpsertHsExtra()
  const { mutate: quitarDeSemana } = useQuitarDeSemana()
  const perfiles = usePerfilesMap()
  // Para mostrar el NOMBRE de la obra (no el código) en el aviso de conflicto.
  const { data: obras = [] } = useObras('tarja')

  // sem_key para esta semana = viernes (días[0] es viernes por getSemDays(semActual))
  const semKey = desde

  // Detalle de conflicto abierto por click/tap (leg|fecha). El title del
  // <td> sigue sirviendo al hover; en touch no hay hover.
  const [conflictoAbierto, setConflictoAbierto] = useState<string | null>(null)
  useEffect(() => {
    if (!conflictoAbierto) return
    const cerrar = () => setConflictoAbierto(null)
    document.addEventListener('click', cerrar)
    return () => document.removeEventListener('click', cerrar)
  }, [conflictoAbierto])

  // ── Undo ──
  const undoStack = useRef<UndoEntry[]>([])
  const [undoCount, setUndoCount] = useState(0)

  // ── Categorías por obra+semana ──
  const { data: catObraData = [] } = useCatObraSemana(obraCod, desde)
  const { mutate: setCatObra } = useSetCatObra()

  // Fecha de referencia: hoy si es la semana en curso, el viernes si es
  // histórica. Es la MISMA que usa el costo (fechaRefCosto, más abajo), para
  // que etiqueta y plata no puedan contradecirse.
  const fechaRefCat = semKey === toISO(getViernes(new Date())) ? toISO(new Date()) : desde

  // Categoría efectiva EN ESTA SEMANA: cat_obra > personal_cat_historial >
  // personal.cat_id. Antes caía directo a `p.cat_id`, o sea la categoría de
  // HOY, y al mirar una semana vieja el select decía la categoría nueva
  // mientras la columna de costo de la misma fila usaba la vieja. Caso real:
  // Sosa (leg. 066) pasó a Oficial Albañil desde el 2026-09-04; en agosto el
  // cartel decía "Oficial Albañil" y la plata salía a $4.200 (Medio Oficial).
  function getCatEfectiva(p: Personal): Categoria | undefined {
    const catId = getCatIdEfectivo(catObraData, personal, obraCod, p.leg, fechaRefCat) ?? p.cat_id
    return categorias.find(c => c.id === catId)
  }

  function handleCatChange(leg: string, catId: number) {
    setCatObra(
      { obra_cod: obraCod, leg, cat_id: catId, desde },
      {
        onSuccess: () => toast('✓ Categoría actualizada', 'ok'),
        onError: (err) => toast(motivoErrorGuardado(err, 'No se pudo cambiar la categoría'), 'err'),
      }
    )
  }

  const horasMap = horasData.reduce<Record<string, Record<string, number>>>(
    (acc, h: Hora) => {
      if (!acc[h.leg]) acc[h.leg] = {}
      acc[h.leg]![h.fecha] = h.horas
      return acc
    },
    {}
  )

  const getH = (leg: string, fecha: string): number =>
    horasMap[leg]?.[fecha] ?? 0

  // Detectar trabajadores en múltiples obras esta semana
  const { data: horasSemana = [] } = useQuery({
    queryKey: ['horas', 'semana', desde, hasta],
    queryFn: () => apiGet<Hora[]>(`/api/horas/all?desde=${desde}&hasta=${hasta}`),
  })

  // Conflictos del MISMO día: para cada (leg, fecha) que tiene horas > 0
  // en más de una obra distinta, guardamos el detalle. Las celdas con
  // conflicto se marcan visualmente y muestran tooltip con las otras
  // obras y horas. Trabajar en obra A los lunes y obra B los martes NO
  // es conflicto — sólo lo es cuando coinciden en el mismo día.
  const conflictoDia = useMemo(() => {
    // Map<leg, Map<fecha, Array<{ obra_cod, horas }>>>
    const map = new Map<string, Map<string, Array<{ obra_cod: string; horas: number }>>>()
    horasSemana.forEach(h => {
      if (!h.horas || h.horas <= 0) return
      if (!map.has(h.leg)) map.set(h.leg, new Map())
      const fechaMap = map.get(h.leg)!
      if (!fechaMap.has(h.fecha)) fechaMap.set(h.fecha, [])
      fechaMap.get(h.fecha)!.push({ obra_cod: h.obra_cod, horas: h.horas })
    })
    // Filtrar: dejar solo entradas (leg, fecha) con >1 obra distinta.
    const out = new Map<string, Map<string, Array<{ obra_cod: string; horas: number }>>>()
    for (const [leg, fechaMap] of map.entries()) {
      const fechasConflicto = new Map<string, Array<{ obra_cod: string; horas: number }>>()
      for (const [fecha, items] of fechaMap.entries()) {
        const obrasUnicas = new Set(items.map(i => i.obra_cod))
        if (obrasUnicas.size > 1) fechasConflicto.set(fecha, items)
      }
      if (fechasConflicto.size > 0) out.set(leg, fechasConflicto)
    }
    return out
  }, [horasSemana])

  // Set de legs con AL MENOS un día de conflicto (para el badge ↔ del
  // nombre). Reemplaza el `multiObra` viejo que detectaba por semana
  // (ruidoso: marcaba operarios que sí trabajan en varias obras pero
  // en distintos días, lo cual no es problema).
  const multiObra = useMemo(() => new Set(conflictoDia.keys()), [conflictoDia])

  // cod → nombre de obra, para el aviso de conflicto (el usuario quiere ver el
  // nombre de la obra, no el código ni el centro de costo).
  const obraNombre = useMemo(() => {
    const m = new Map<string, string>()
    for (const o of obras) m.set(o.cod, o.nom)
    return m
  }, [obras])

  // El valor hora usa la misma referencia que la categoría (definida arriba
  // como fechaRefCat), igual que costoLegConCatObra.
  const fechaRefCosto = fechaRefCat

  // Totales con la fórmula canónica (§5.11): cat_obra + historial de
  // categorías + tarifa vigente, redondeo al millar por legajo. Antes usaba
  // costoLeg/getVHenFecha con `catObraMap ?? p.cat_id` y el chip "Costo
  // semana" de la página podía no coincidir con este footer.
  const { totalHs, totalCosto } = (() => {
    let hs = 0, costo = 0
    for (const p of personal) {
      const hsDias = days.reduce((s, d) => s + (horasMap[p.leg]?.[toISO(d)] ?? 0), 0)
      const hsExtra = getHsExtrasLeg(hsExtrasData, obraCod, p.leg, semKey)
      hs = redondearHs(hs + hsDias + hsExtra)
      costo += Math.round(costoLegConCatObra(horasData, hsExtrasData, personal, categorias, tarifas, catObraData, obraCod, p.leg, days) / 1000) * 1000
    }
    return { totalHs: hs, totalCosto: costo }
  })()

  const handleChange = useCallback(
    (leg: string, fecha: string, val: string, antes: number) => {
      // El separador puede venir con coma: parseFloat('8,5') daría 8 y
      // guardaría media hora de menos sin avisar (ver lib/utils/numeros).
      const horas = val.trim() === '' ? 0 : parseCantidadAR(val)
      if (horas === null) return
      // Sin cambio real → sin PUT. Antes, tocar una celda y salir sin tipear
      // (gesto común en celular) mandaba horas=0 igual, y como el upsert
      // individual BORRA la fila cuando llega 0, un trabajador cuya única
      // fila de la semana era ese placeholder desaparecía de la tarja.
      if (antes === horas) return
      undoStack.current.push({ leg, fecha, antes, ctx: `${obraCod}:${semKey}` })
      if (undoStack.current.length > 50) undoStack.current.shift()
      setUndoCount(undoStack.current.length)
      // Poner en 0 la ÚNICA fila del trabajador en la semana lo haría
      // desaparecer (el upsert individual borra la fila en 0). En ese caso
      // va por /lote, que upsertea el 0 CONSERVANDO la fila-ancla.
      if (horas === 0 && horasData.filter(h => h.leg === leg).length <= 1) {
        upsertHoraLote(
          { obra_cod: obraCod, horas: [{ fecha, leg, horas: 0 }] },
          {
            onError: (err: unknown) => {
              const i = days.findIndex(d => toISO(d) === fecha)
              const el = document.querySelector<HTMLInputElement>(
                `input[data-tarja-leg="${leg}"][data-tarja-day="${i}"]`
              )
              if (el) el.value = antes ? String(antes) : ''
              if (undoStack.current.length > 0) {
                undoStack.current.pop()
                setUndoCount(undoStack.current.length)
              }
              toast(motivoErrorGuardado(err, '⚠ La hora NO se guardó — revisá la conexión y volvé a cargarla'), 'err')
            },
          },
        )
        return
      }
      upsertHora(
        { obra_cod: obraCod, fecha, leg, horas },
        {
          onError: (err: unknown) => {
            // La celda es un input no-controlado: sin esto, ante un guardado
            // fallido (red de obra, sesión vencida, 403 de capataz) quedaba
            // MOSTRANDO el valor tipeado como si hubiera entrado — el usuario
            // se iba convencido y al recargar "se borraban" las horas
            // (incidente Candela 2026-08-21/24). Revertimos al valor real y
            // mostramos el motivo específico si el backend lo dio.
            const i = days.findIndex(d => toISO(d) === fecha)
            const el = document.querySelector<HTMLInputElement>(
              `input[data-tarja-leg="${leg}"][data-tarja-day="${i}"]`
            )
            if (el) el.value = antes ? String(antes) : ''
            // Sacamos el undo que empujamos arriba: el cambio nunca entró.
            if (antes !== horas && undoStack.current.length > 0) {
              undoStack.current.pop()
              setUndoCount(undoStack.current.length)
            }
            toast(motivoErrorGuardado(err, '⚠ La hora NO se guardó — revisá la conexión y volvé a cargarla'), 'err')
          },
        }
      )
    },
    [obraCod, upsertHora, upsertHoraLote, horasData, toast, days, semKey]
  )

  const handleExtraChange = useCallback(
    (leg: string, val: string, antes: number, el?: HTMLInputElement) => {
      const raw = val.trim()
      const hs = raw === '' ? 0 : parseCantidadAR(raw)
      // Basura tipeada: se revierte el campo. Es no controlado, así que si no
      // lo tocamos queda mostrando algo distinto de lo guardado.
      if (hs === null) {
        if (el) el.value = antes ? String(antes) : ''
        return
      }
      // Evitar mutación si el valor no cambió — un Tab-walk por la grilla
      // sin tocar nada no debería generar mutations innecesarias al backend.
      if (hs === antes) return
      // Sin tope duro, pero avisamos al cargar un valor inusualmente alto.
      if (hs > ALERTA_HS_EXTRA &&
          !confirm(`¿Cargar ${hs} hs extras? Es un valor muy alto — confirmá que no es un error.`)) {
        if (el) el.value = String(antes || '')  // revertir el campo (no controlado)
        return
      }
      // Optimistic update + toast de error via el hook
      upsertHsExtra({ obra_cod: obraCod, leg, sem_key: semKey, hs }).catch(() => {
        // el toast ya se dispara desde el hook
      })
    },
    [obraCod, semKey, upsertHsExtra],
  )

  const handleUndo = useCallback(() => {
    const entry = undoStack.current.pop()
    if (!entry) return
    if (entry.ctx !== `${obraCod}:${semKey}`) {
      // El historial era de otra semana u obra: descartarlo, no tocar esta.
      undoStack.current = []
      setUndoCount(0)
      toast('El historial de deshacer era de otra semana y se descartó', 'warn')
      return
    }
    setUndoCount(undoStack.current.length)
    const cb = {
      onSuccess: () => toast('↩ Deshecho', 'ok'),
      onError: (err: unknown) => toast(motivoErrorGuardado(err, 'No se pudo deshacer'), 'err'),
    }
    // Misma guarda que handleChange: volver a 0 la única fila del trabajador
    // lo haría desaparecer de la grilla (el upsert individual borra la fila
    // en 0); va por /lote, que conserva la fila-ancla.
    if (entry.antes === 0 && horasData.filter(h => h.leg === entry.leg).length <= 1) {
      upsertHoraLote({ obra_cod: obraCod, horas: [{ fecha: entry.fecha, leg: entry.leg, horas: 0 }] }, cb)
      return
    }
    upsertHora({ obra_cod: obraCod, fecha: entry.fecha, leg: entry.leg, horas: entry.antes }, cb)
  }, [obraCod, semKey, upsertHora, upsertHoraLote, horasData, toast])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        if (undoStack.current.length > 0) {
          e.preventDefault()
          handleUndo()
        }
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [handleUndo])

  useEffect(() => {
    onUndoStateChange?.(undoCount, handleUndo)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undoCount])

  function handleQuitar(p: Personal) {
    if (!confirm(`¿Quitar a ${p.nom} de esta semana? Se borrarán sus horas cargadas.`)) return
    quitarDeSemana(
      { obraCod, leg: p.leg, desde, hasta },
      {
        onSuccess: () => toast(`✓ ${p.nom} quitado de esta semana`, 'ok'),
        onError: (err) => toast(motivoErrorGuardado(err, 'No se pudo quitar al trabajador'), 'err'),
      }
    )
  }

  if (isLoading) {
    return (
      <div className="bg-white rounded-card shadow-card p-8 flex items-center justify-center gap-3 text-gris-dark">
        <span className="w-5 h-5 border-2 border-naranja border-t-transparent rounded-full animate-spin" />
        Cargando horas...
      </div>
    )
  }

  if (personal.length === 0) {
    return (
      <div className="bg-white rounded-card shadow-card p-8 text-center text-gris-dark">
        <p className="font-semibold text-azul mb-1">No hay trabajadores en esta semana</p>
        {scopeAsignadas ? (
          <p className="text-sm">Pedile al administrativo que asigne personal a esta obra.</p>
        ) : (
          <p className="text-sm">Agregá trabajadores o copiá la semana anterior.</p>
        )}
      </div>
    )
  }

  return (
    <div id="tarja-table-top" className="bg-white rounded-card shadow-card overflow-hidden">

      <div className="overflow-x-auto">
        <table className="border-collapse w-full min-w-[750px]">
          <thead>
            <tr>
              <th className="bg-azul text-white text-xs font-bold px-3 py-2.5 text-left uppercase tracking-wide whitespace-nowrap w-8" />
              <th className="bg-azul text-white text-xs font-bold px-3 py-2.5 text-left uppercase tracking-wide whitespace-nowrap">
                Leg.
              </th>
              <th className="bg-azul text-white text-xs font-bold px-3 py-2.5 text-left uppercase tracking-wide whitespace-nowrap min-w-[170px]">
                Trabajador
              </th>
              <th className="bg-azul text-white text-xs font-bold px-3 py-2.5 text-left uppercase tracking-wide whitespace-nowrap min-w-[160px]">
                Categoría
              </th>
              {days.map((d, i) => (
                <th
                  key={i}
                  className={`
                    text-white text-xs font-bold px-2 py-2.5 text-center uppercase
                    tracking-wide min-w-[70px] font-mono
                    ${esHoy(d) ? 'bg-verde' : ''}
                    ${esJueves(d) ? 'bg-[#8B3510]' : ''}
                    ${esFinde(d) ? 'bg-[#5A2008]' : ''}
                    ${!esHoy(d) && !esJueves(d) && !esFinde(d) ? 'bg-naranja' : ''}
                  `}
                >
                  {DIAS[i]}<br />
                  <span className="text-[10px] opacity-80">
                    {d.getDate()}/{d.getMonth() + 1}
                  </span>
                </th>
              ))}
              {verHsExtras && (
                <th className="bg-[#8B3510] text-white text-xs font-bold px-2 py-2.5 text-center uppercase tracking-wide min-w-[72px]">
                  Extras
                </th>
              )}
              <th className="bg-verde text-white text-xs font-bold px-2 py-2.5 text-center uppercase tracking-wide min-w-[80px]">
                Total
              </th>
              {verCostos && (
                <th className="bg-[#0F4A28] text-white text-xs font-bold px-3 py-2.5 text-right uppercase tracking-wide min-w-[130px]">
                  Costo · $/h
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {personal.map((p) => {
              const catEfectiva = getCatEfectiva(p)
              const catId = catEfectiva?.id ?? p.cat_id
              const hsDiasLeg = days.reduce((s, d) => s + getH(p.leg, toISO(d)), 0)
              const hsExtraLeg = getHsExtrasLeg(hsExtrasData, obraCod, p.leg, semKey)
              const totalLeg = redondearHs(hsDiasLeg + hsExtraLeg)
              const fechaRef = toISO(days[0]!)
              const vh = getVHConCatObra(catObraData, personal, categorias, tarifas, obraCod, p.leg, fechaRefCosto)
              const costo = costoLegConCatObra(horasData, hsExtrasData, personal, categorias, tarifas, catObraData, obraCod, p.leg, days)

              // Última hora editada de este trabajador en la semana
              const lastHora = horasData
                .filter((h: Hora) => h.leg === p.leg && h.updated_by)
                .sort((a: Hora, b: Hora) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''))
                [0] as Hora | undefined

              return (
                <tr
                  key={p.leg}
                  className="border-b border-gris last:border-0 hover:bg-gris/40 transition-colors"
                >
                  <td className="px-1 py-1.5 text-center">
                    <button
                      onClick={() => handleQuitar(p)}
                      disabled={!puedeQuitar}
                      title={motivoNoQuitar ?? `Quitar ${p.nom} de esta semana`}
                      className="w-6 h-6 rounded flex items-center justify-center text-gris-dark hover:bg-rojo-light hover:text-rojo transition-colors text-xs disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      ✕
                    </button>
                  </td>
                  <td className="font-mono text-xs text-gris-dark px-3 py-1.5 font-semibold whitespace-nowrap">
                    {p.leg}
                  </td>
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-sm">{p.nom}</span>
                      {multiObra.has(p.leg) && (
                        <span
                          className="text-[10px] font-bold bg-[#E0A800] text-white px-1.5 py-0.5 rounded"
                          title="Este trabajador tiene horas en otra obra el mismo día — ver celdas marcadas con ⚠"
                        >
                          ↔
                        </span>
                      )}
                    </div>
                    {lastHora?.updated_by && (
                      <div className="text-[9px] text-gris-dark leading-tight mt-0.5">
                        ✎ {perfiles.get(lastHora.updated_by) ?? '…'}
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    <select
                      value={catId}
                      disabled={!puedeCambiarCategoria}
                      onChange={puedeCambiarCategoria ? (e) => handleCatChange(p.leg, Number(e.target.value)) : undefined}
                      className={`
                        w-full px-2 py-1 rounded border-[1.5px]
                        text-xs font-bold bg-white text-carbon outline-none
                        transition-colors
                        ${getTarifaEnFecha(tarifas, obraCod, catId, fechaRef) !== null
                          ? 'border-naranja text-naranja'
                          : 'border-gris-mid'
                        }
                        ${puedeCambiarCategoria
                          ? 'cursor-pointer hover:border-naranja focus:border-naranja focus:shadow-[0_0_0_3px_rgba(232,98,26,.15)]'
                          : 'cursor-not-allowed opacity-60'
                        }
                      `}
                    >
                      {categorias.map(cat => (
                        <option key={cat.id} value={cat.id}>
                          {verCostos ? `${cat.nom} — $${cat.vh.toLocaleString('es-AR')}/h` : cat.nom}
                        </option>
                      ))}
                    </select>
                    {getTarifaEnFecha(tarifas, obraCod, catId, fechaRef) !== null && (
                      <div className="text-[10px] font-bold text-naranja mt-0.5 flex items-center gap-0.5">
                        <span>★</span>
                        <span>${vh.toLocaleString('es-AR')}/h</span>
                      </div>
                    )}
                  </td>
                  {days.map((d, i) => {
                    const fecha = toISO(d)
                    const h = getH(p.leg, fecha)
                    // ¿Este (leg, fecha) tiene horas en otra obra el mismo día?
                    const itemsDelDia = conflictoDia.get(p.leg)?.get(fecha)
                    const otrasObrasMismoDia = itemsDelDia
                      ? itemsDelDia
                          .filter(it => it.obra_cod !== obraCod)
                          .map(it => `${obraNombre.get(it.obra_cod) ?? it.obra_cod}: ${it.horas}hs`)
                      : []
                    const enConflicto = otrasObrasMismoDia.length > 0
                    // Capataces solo pueden tocar la celda de hoy. El resto
                    // de los días queda read-only. Backend revalida.
                    const bloqueadoPorCapataz = esCapataz && fecha !== hoyISO
                    const celdaEditable = puedeEditar && !readonly && !bloqueadoPorCapataz
                    const tooltipBloqueo = bloqueadoPorCapataz
                      ? 'Solo podés cargar horas del día actual.'
                      : undefined
                    return (
                      <td
                        key={i}
                        className={`relative px-1.5 py-1.5 text-center ${enConflicto ? 'bg-rojo-light/60' : ''} ${bloqueadoPorCapataz ? 'bg-gris/30' : ''}`}
                        title={tooltipBloqueo ?? (enConflicto ? `⚠ También tiene horas este día en — ${otrasObrasMismoDia.join(' · ')}` : undefined)}
                      >
                        {enConflicto && (
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); setConflictoAbierto(prev => prev === `${p.leg}|${fecha}` ? null : `${p.leg}|${fecha}`) }}
                            className="absolute top-0 right-0.5 text-[10px] leading-none text-rojo font-bold"
                            aria-label="Ver en qué otra obra tiene horas este día"
                          >⚠</button>
                        )}
                        {conflictoAbierto === `${p.leg}|${fecha}` && (
                          <div
                            className="absolute z-20 left-0 top-full mt-0.5 min-w-[180px] max-w-[260px] bg-white border border-rojo/40 rounded-lg shadow-card p-2 text-left text-[11px] text-carbon"
                            onClick={e => e.stopPropagation()}
                          >
                            <div className="font-bold text-rojo mb-1">También tiene horas este día en:</div>
                            {otrasObrasMismoDia.map(o => <div key={o}>{o}</div>)}
                            <button type="button" className="mt-1 text-[10px] font-bold text-gris-dark hover:text-carbon" onClick={() => setConflictoAbierto(null)}>Cerrar</button>
                          </div>
                        )}
                        <input
                          // type="text" y no "number": con una coma el browser
                          // marca badInput y `value` llega VACÍO, así que no se
                          // puede ni leer lo que la persona escribió. inputMode
                          // igual abre el teclado numérico en el celular.
                          type="text"
                          key={`${p.leg}-${fecha}-${h}`}
                          defaultValue={h || ''}
                          readOnly={!celdaEditable}
                          data-tarja-leg={p.leg}
                          data-tarja-day={i}
                          // Evitar cambios por accidente cuando el usuario
                          // hace scroll con la rueda del mouse sobre la celda.
                          inputMode="decimal"
                          onWheel={e => (e.currentTarget as HTMLInputElement).blur()}
                          onBlur={celdaEditable ? e => {
                            // Acepta coma o punto. Lo que no sea un número se
                            // revierte: el input no es controlado, así que si
                            // quedara el texto tipeado la celda mostraría algo
                            // distinto de lo guardado.
                            const crudo = e.target.value.trim()
                            if (crudo !== '' && parseCantidadAR(crudo) === null) {
                              e.target.value = h ? String(h) : ''
                              toast('Poné un número de horas: 8 o 8,5', 'warn')
                              return
                            }
                            handleChange(p.leg, fecha, crudo, h)
                          } : undefined}
                          onKeyDown={celdaEditable ? e => {
                            const el = e.target as HTMLInputElement
                            // El guardado lo hace SIEMPRE el onBlur: mover el foco
                            // ya lo dispara. Llamar a handleChange acá además
                            // mandaba dos PUT (y dos entradas de deshacer) por celda.
                            if (e.key === 'Enter') {
                              const next = document.querySelector<HTMLInputElement>(
                                `input[data-tarja-leg="${p.leg}"][data-tarja-day="${i + 1}"]`
                              )
                              if (next) next.focus()
                              else el.blur()
                              return
                            }
                            // Navegación con flechas. ↑/↓ saltan a la misma columna
                            // del trabajador anterior/siguiente; ←/→ saltan al día
                            // anterior/siguiente del mismo trabajador. Antes de
                            // mover el foco, commiteamos el valor (igual que onBlur).
                            const arrows: Record<string, [string, number] | undefined> = {
                              ArrowUp:    ['leg-prev', i],
                              ArrowDown:  ['leg-next', i],
                              ArrowLeft:  ['same-leg', i - 1],
                              ArrowRight: ['same-leg', i + 1],
                            }
                            const move = arrows[e.key]
                            if (!move) return
                            // Inputs de horas son números cortos (1-3 chars);
                            // ←/→ siempre saltan de celda en vez de mover el caret.
                            e.preventDefault()
                            const [direction, targetDay] = move
                            let selector: string
                            if (direction === 'same-leg') {
                              selector = `input[data-tarja-leg="${p.leg}"][data-tarja-day="${targetDay}"]`
                            } else {
                              // Buscar todos los inputs por leg y elegir el anterior/siguiente.
                              const allLegs = Array.from(document.querySelectorAll<HTMLInputElement>(
                                `input[data-tarja-day="${i}"]`
                              ))
                              const here = allLegs.findIndex(x => x.dataset.tarjaLeg === p.leg)
                              const targetIdx = direction === 'leg-prev' ? here - 1 : here + 1
                              const target = allLegs[targetIdx]
                              if (target) { target.focus(); target.select() }
                              return
                            }
                            const target = document.querySelector<HTMLInputElement>(selector)
                            if (target) { target.focus(); target.select() }
                          } : undefined}
                          className={`
                              w-14 h-8 border-[1.5px] rounded-md
                              text-center font-mono text-sm font-bold
                              outline-none transition-colors
                              ${celdaEditable
                                ? 'focus:border-naranja focus:shadow-[0_0_0_3px_rgba(232,98,26,.15)]'
                                : 'cursor-not-allowed opacity-60'
                              }
                              [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none
                              [&::-webkit-inner-spin-button]:appearance-none
                              ${enConflicto ? 'border-rojo' : getHoraClass(h)}
                            `}
                        />
                      </td>
                    )
                  })}
                  {verHsExtras && (
                    <td className="px-1.5 py-1.5 text-center">
                      <input
                        type="text"
                        inputMode="decimal"
                        key={`extra-${p.leg}-${semKey}-${hsExtraLeg}`}
                        defaultValue={hsExtraLeg || ''}
                        readOnly={!puedeEditar || readonly}
                        data-tarja-extra-leg={p.leg}
                        title="Horas extras de la semana"
                        // Evitar cambios accidentales con la rueda del mouse.
                        onWheel={e => (e.currentTarget as HTMLInputElement).blur()}
                        onBlur={puedeEditar && !readonly
                          ? e => handleExtraChange(p.leg, e.target.value, hsExtraLeg, e.target)
                          : undefined}
                        onKeyDown={puedeEditar && !readonly ? e => {
                          // Navegación como en horas comunes: Enter / ↓ van a la
                          // celda de hs extras del trabajador siguiente, ↑ al
                          // anterior. Movemos el foco y el onBlur del campo actual
                          // guarda UNA sola vez (no llamamos al handler acá, para
                          // no duplicar el aviso de valor alto).
                          if (e.key !== 'Enter' && e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
                          e.preventDefault()
                          const all = Array.from(document.querySelectorAll<HTMLInputElement>(
                            'input[data-tarja-extra-leg]',
                          ))
                          const here = all.findIndex(x => x.dataset.tarjaExtraLeg === p.leg)
                          const target = all[here + (e.key === 'ArrowUp' ? -1 : 1)]
                          if (target) { target.focus(); target.select() }
                          else (e.target as HTMLInputElement).blur()
                        } : undefined}
                        className={`
                            w-14 h-8 border-[1.5px] rounded-md
                            text-center font-mono text-sm font-bold
                            outline-none transition-colors
                            ${puedeEditar && !readonly
                              ? 'focus:border-[#8B3510] focus:shadow-[0_0_0_3px_rgba(139,53,16,.15)]'
                              : 'cursor-not-allowed opacity-60'
                            }
                            [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none
                            [&::-webkit-inner-spin-button]:appearance-none
                            ${hsExtraLeg > 0
                              ? 'border-[#8B3510] bg-[#FFF3CD] text-[#7A3510]'
                              : 'border-gris-mid bg-white text-gris-mid'}
                          `}
                      />
                    </td>
                  )}
                  <td className="text-center bg-verde-light font-mono text-sm font-bold text-verde px-2 py-1.5 whitespace-nowrap">
                    {totalLeg > 0 ? totalLeg : '—'}
                  </td>
                  {verCostos && (
                    <td className="text-right bg-azul-light px-3 py-1.5 whitespace-nowrap">
                      <div className="font-mono text-sm font-bold text-azul-mid">
                        {costo > 0 ? fmtMonto(costo) : '—'}
                      </div>
                      <div className="text-[10px] text-gris-dark font-mono">
                        ${vh.toLocaleString('es-AR')}/h
                      </div>
                    </td>
                  )}
                </tr>
              )
            })}

            {/* Fila totales */}
            <tr className="border-t-[3px] border-naranja">
              <td colSpan={4} className="bg-azul text-white font-display text-lg tracking-wide px-3 py-2.5">
                TOTAL SEMANA
              </td>
              {days.map((d, i) => {
                const totalDia = personal.reduce((s, p) => s + getH(p.leg, toISO(d)), 0)
                return (
                  <td key={i} className="bg-azul text-white font-mono text-sm font-bold text-center px-2 py-2.5">
                    {totalDia > 0 ? totalDia : '—'}
                  </td>
                )
              })}
              {verHsExtras && (
                <td className="bg-azul text-[#E8B478] font-mono text-sm font-bold text-center px-2 py-2.5">
                  {(() => {
                    const totExtras = personal.reduce((s, p) => s + getHsExtrasLeg(hsExtrasData, obraCod, p.leg, semKey), 0)
                    return totExtras > 0 ? totExtras : '—'
                  })()}
                </td>
              )}
              <td className="bg-azul text-[#7DD9A2] font-mono text-sm font-bold text-center px-2 py-2.5">
                {totalHs > 0 ? totalHs : '—'}
              </td>
              {verCostos && (
                <td className="bg-azul text-naranja font-mono text-sm font-bold text-right px-3 py-2.5">
                  {totalCosto > 0 ? fmtMonto(totalCosto) : '—'}
                </td>
              )}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
