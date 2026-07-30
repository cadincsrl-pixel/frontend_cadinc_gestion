'use client'

import { useState, useMemo, type ReactNode } from 'react'
import {
  useGastosResumen, useGastosPorCamion, useGastosPorChofer, useGastosPorCategoria,
  useTramos, useCobros, useTarifasEmpresa, useCamiones, useChoferes, useLiquidaciones,
  useRutas, useEstadias,
} from '../hooks/useLogistica'
import { calcularPerformance } from '@/lib/utils/performance'
import { useRelevosLiquidados } from '../hooks/useTramoRelevo'
import { Button } from '@/components/ui/Button'
import { InfoPopover } from '@/components/ui/InfoPopover'
import { Input }  from '@/components/ui/Input'
import type { Camion, Chofer, Tramo, Liquidacion, Estadia } from '@/types/domain.types'
import { toISO } from '@/lib/utils/dates'

const fmt$ = (n: number | string) => `$ ${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtInt = (n: number | string) => Number(n).toLocaleString('es-AR')

function isoHoy() { return toISO(new Date()) }
function isoSumDias(base: Date, dias: number) {
  const d = new Date(base); d.setDate(d.getDate() + dias)
  return d.toISOString().slice(0, 10)
}
function primerDiaMes(base: Date) { const d = new Date(base); d.setDate(1); return d.toISOString().slice(0, 10) }
function ultimoDiaMes(base: Date) { const d = new Date(base.getFullYear(), base.getMonth() + 1, 0); return d.toISOString().slice(0, 10) }
function primerDiaAnio(base: Date){ return `${base.getFullYear()}-01-01` }

export function GastosReportes() {
  // Default: mes actual
  const today = new Date()
  const [desde, setDesde] = useState(primerDiaMes(today))
  const [hasta, setHasta] = useState(isoHoy())

  function preset(kind: 'mes_actual' | 'mes_anterior' | 'ult_30' | 'anio') {
    const t = new Date()
    if (kind === 'mes_actual') {
      setDesde(primerDiaMes(t)); setHasta(isoHoy())
    } else if (kind === 'mes_anterior') {
      const mesAnt = new Date(t.getFullYear(), t.getMonth() - 1, 15)
      setDesde(primerDiaMes(mesAnt)); setHasta(ultimoDiaMes(mesAnt))
    } else if (kind === 'ult_30') {
      setDesde(isoSumDias(t, -30)); setHasta(isoHoy())
    } else if (kind === 'anio') {
      setDesde(primerDiaAnio(t)); setHasta(isoHoy())
    }
  }

  const enabled = !!desde && !!hasta
  const { data: resumen,     isLoading: lr } = useGastosResumen(desde, hasta, enabled)
  const { data: porCamion,   isLoading: lc } = useGastosPorCamion(desde, hasta, enabled)
  const { data: porChofer,   isLoading: lch } = useGastosPorChofer(desde, hasta, enabled)
  const { data: porCat,      isLoading: lca } = useGastosPorCategoria(desde, hasta, enabled)

  // ── Cruce con facturación ───────────────────────────────────────
  // Traemos tramos+cobros+tarifas+catálogos y cruzamos cliente-side.
  // No hay endpoint dedicado; reusamos lo existente.
  const { data: tramos   = [] }  = useTramos()
  const { data: cobros   = [] }  = useCobros()
  const { data: tarifas  = [] }  = useTarifasEmpresa()
  const { data: camiones = [] }  = useCamiones()
  const { data: choferes = [] }  = useChoferes()
  const { data: liquidaciones = [] } = useLiquidaciones()
  const { data: rutas         = [] } = useRutas()
  // Patas de relevo liquidadas → la MO del relevista se imputa al camión real.
  const { data: tramoChoferes = [] } = useRelevosLiquidados()
  // Estadías: días de espera pagados al chofer. Cuentan como mano de obra
  // (decisión del dueño el 2026-07-29).
  const { data: estadias      = [] } = useEstadias()

  // ── Sólo flota propia ───────────────────────────────────────────
  // CADINC le lleva la facturación a fleteros que no son de la empresa: cobra el
  // flete y le paga al fletero, pero el camión no es suyo y el gasoil, las
  // cubiertas y el service los pone él. Mezclarlos promedia dos negocios
  // distintos: los 4 viajes de Roque entraban con margen del 100% porque su
  // camión no tiene gastos ni él tiene liquidación. Decisión del dueño el
  // 2026-07-29: fuera del reporte de flota.
  // Los gastos ya vienen filtrados del backend; acá se filtra la otra mitad
  // (ingresos y mano de obra), que se calcula en el navegador.
  const tercerosIds = useMemo(() => ({
    camiones: new Set((camiones as Camion[]).filter(c => c.es_propio === false).map(c => c.id)),
    choferes: new Set((choferes as Chofer[]).filter(c => c.es_propio === false).map(c => c.id)),
  }), [camiones, choferes])

  const esDeTerceros = (camionId: number | null | undefined, choferId: number | null | undefined) =>
    (camionId != null && tercerosIds.camiones.has(camionId))
    || (choferId != null && tercerosIds.choferes.has(choferId))

  const tramosPropios = useMemo(
    () => (tramos as Tramo[]).filter(t => !esDeTerceros(t.camion_id, t.chofer_id)),
    [tramos, tercerosIds],
  )
  const liquidacionesPropias = useMemo(
    () => (liquidaciones as Liquidacion[]).filter(l => !tercerosIds.choferes.has(l.chofer_id)),
    [liquidaciones, tercerosIds],
  )
  const estadiasPropias = useMemo(
    () => (estadias as Estadia[]).filter(e => !tercerosIds.choferes.has(e.chofer_id)),
    [estadias, tercerosIds],
  )

  // Qué quedó afuera, para poder decirlo en pantalla: un número que baja sin
  // explicación es peor que el número mal.
  const excluido = useMemo(() => {
    const enRango = (tramos as Tramo[]).filter(t =>
      t.tipo === 'cargado' && t.estado === 'completado'
      && t.fecha_descarga && t.fecha_descarga >= desde && t.fecha_descarga <= hasta
      && esDeTerceros(t.camion_id, t.chofer_id))
    const nombres = [...new Set(enRango.map(t => choferes.find((c: Chofer) => c.id === t.chofer_id)?.nombre).filter(Boolean))]
    return { viajes: enRango.length, nombres: nombres as string[] }
  }, [tramos, desde, hasta, tercerosIds, choferes])

  const performance = useMemo(
    // `camiones` al final: el ingreso teórico resuelve chasis/batea con la misma
    // escalera de tarifas que el modal de facturación.
    () => calcularPerformance(tramosPropios, cobros, tarifas, desde, hasta, liquidacionesPropias, choferes, rutas, tramoChoferes, estadiasPropias, camiones as Camion[]),
    [tramosPropios, cobros, tarifas, desde, hasta, liquidacionesPropias, choferes, rutas, tramoChoferes, estadiasPropias, camiones],
  )

  // Mapas para mergear gastos por entidad con performance.
  const gastosCamion = useMemo(() => {
    const m = new Map<number, number>()
    for (const r of porCamion ?? []) m.set(r.camion_id, r.total)
    return m
  }, [porCamion])
  const gastosChofer = useMemo(() => {
    const m = new Map<number, number>()
    for (const r of porChofer ?? []) m.set(r.chofer_id, r.total)
    return m
  }, [porChofer])

  // Patente / nombre por id para mostrar en las filas.
  const camionPatente = useMemo(() => {
    const m = new Map<number, string>()
    for (const c of camiones as Camion[]) m.set(c.id, c.patente)
    return m
  }, [camiones])
  const choferNombre = useMemo(() => {
    const m = new Map<number, string>()
    for (const c of choferes as Chofer[]) m.set(c.id, c.nombre)
    return m
  }, [choferes])

  // KPIs cruzados: facturación, margen, % margen.
  const facturacionPeriodo = performance.totales.ingresos
  const gastosPeriodo      = resumen?.total ?? 0
  const costoMOPeriodo     = performance.totales.costo_mo
  const margenBruto        = facturacionPeriodo - gastosPeriodo
  const margenReal         = margenBruto - costoMOPeriodo
  const pctMargen          = facturacionPeriodo > 0 ? (margenBruto / facturacionPeriodo) * 100 : null
  const pctMargenReal      = facturacionPeriodo > 0 ? (margenReal  / facturacionPeriodo) * 100 : null

  return (
    <div className="flex flex-col gap-4">

      {/* Filtro de rango + presets */}
      <div className="bg-white rounded-card shadow-card p-3 flex flex-wrap items-end gap-2">
        <Input label="Desde" type="date" value={desde} onChange={e => setDesde(e.target.value)} />
        <Input label="Hasta" type="date" value={hasta} onChange={e => setHasta(e.target.value)} />
        <div className="flex gap-1.5 flex-wrap">
          <Button variant="secondary" size="sm" onClick={() => preset('mes_actual')}>Mes actual</Button>
          <Button variant="secondary" size="sm" onClick={() => preset('mes_anterior')}>Mes anterior</Button>
          <Button variant="secondary" size="sm" onClick={() => preset('ult_30')}>Últimos 30 días</Button>
          <Button variant="secondary" size="sm" onClick={() => preset('anio')}>Año en curso</Button>
        </div>
      </div>

      {/* Qué quedó afuera. Sin esto, un margen que sube no se puede explicar. */}
      {excluido.viajes > 0 && (
        <div className="bg-sky-50 border border-sky-200 rounded-card px-3 py-2 text-xs text-sky-900">
          ℹ Este reporte muestra <b>sólo la flota propia</b>. Quedaron afuera {excluido.viajes} viaje
          {excluido.viajes !== 1 ? 's' : ''} de fleteros
          {excluido.nombres.length > 0 && <> ({excluido.nombres.join(', ')})</>}: se les factura el
          viaje pero el camión no es de CADINC y los gastos los ponen ellos, así que mezclarlos
          promedia dos negocios distintos. Para marcar un camión o un chofer como de tercero, hay un
          tilde en su ficha.
        </div>
      )}

      {/* KPIs cruzados (facturación vs gastos) */}
      {lr ? (
        <div className="bg-white rounded-card shadow-card p-6 text-center text-gris-dark">Cargando resumen…</div>
      ) : resumen && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi
              label="Facturación del período"
              value={fmt$(facturacionPeriodo)}
              accent="verde"
              info={
                <InfoPopover
                  titulo="Facturación del período"
                  incluye={[
                    'Viajes descargados dentro del período, de la flota propia',
                    'Facturas emitidas aunque todavía no se cobraron',
                    'Viajes sin facturar, valuados a la tarifa vigente (la misma escalera que usa facturación)',
                  ]}
                  noIncluye={[
                    'Fleteros de terceros',
                    'Viajes descargados fuera del período, aunque se hayan cargado adentro',
                  ]}
                  iva="Con IVA incluido: las tarifas se guardan con el 21% adentro."
                  ojo="No es plata cobrada — mirá el desglose de abajo."
                />
              }
              sub={
                <div className="mt-1.5 flex flex-col gap-0.5 text-[10px] font-mono text-gris-dark leading-tight">
                  <span className="text-verde">✔ {fmt$(performance.totales.ingresos_cobrado)} cobrado</span>
                  <span className="text-naranja-dark">⏳ {fmt$(performance.totales.ingresos_por_cobrar)} por cobrar</span>
                  <span>◌ {fmt$(performance.totales.ingresos_sin_facturar)} sin facturar</span>
                </div>
              }
            />
            <Kpi
              label="Gastos del período"
              value={fmt$(gastosPeriodo)}
              accent="azul"
              info={
                <InfoPopover
                  titulo="Gastos del período"
                  incluye={[
                    'Gastos aprobados y pagados, por la fecha del gasto',
                    'Los que pagó un chofer de su bolsillo (reintegrables), desde el día del gasto',
                  ]}
                  noIncluye={[
                    'Pendientes de aprobación (van en el aviso amarillo)',
                    'Rechazados y eliminados',
                    'Sueldos de choferes — están en Mano de obra',
                  ]}
                  iva="Total pagado del comprobante: con IVA cuando hay factura."
                />
              }
            />
            <Kpi
              label={
                <span className="inline-flex items-center gap-1.5 flex-wrap">
                  Costo mano de obra
                  {/* Las estadías cuentan acá desde el 29/07. Se muestran aparte
                      porque son el único componente que no sale de un viaje: son
                      días de espera, y sin el chip el número sube sin explicación. */}
                  {performance.totales.costo_estadias > 0 && (
                    <span
                      title={`Incluye ${fmt$(performance.totales.costo_estadias)} de estadías: días de espera para cargar o descargar que se le pagan al chofer por su tiempo.`}
                      className="text-[9px] font-bold bg-sky-100 text-sky-800 px-1.5 py-0.5 rounded-full uppercase tracking-wide"
                    >
                      + estadías
                    </span>
                  )}
                  {performance.totales.tiene_parcial && (
                    <span
                      title={`Incluye ${fmt$(performance.totales.costo_mo_parcial)} estimados (días con tramos sin liquidación cerrada). Migra a "cerrado" cuando se cierre la liquidación del chofer.`}
                      className="text-[9px] font-bold bg-naranja-light text-naranja-dark px-1.5 py-0.5 rounded-full uppercase tracking-wide"
                    >
                      + parcial
                    </span>
                  )}
                </span>
              }
              value={fmt$(costoMOPeriodo)}
              accent="azul"
              info={
                <InfoPopover
                  titulo="Costo mano de obra"
                  incluye={[
                    'El sueldo prorrateado a los días de este período (no al mes en que cerró la liquidación)',
                    'Los km de los viajes que caen en el período',
                    'Estadías (días de espera), por sus fechas',
                    'Una estimación del trabajo aún sin liquidar (chip naranja)',
                  ]}
                  noIncluye={[
                    'Adelantos — son anticipos del mismo sueldo, no un costo aparte',
                    'Reintegros de gastos — ya están en Gastos del período',
                    'Cargas sociales o aguinaldo: el sistema no los registra',
                  ]}
                  iva="Sin IVA: es costo laboral."
                  ojo="La suma por camión puede diferir de este total cuando un chofer no tiene viajes en el período ni camión asignado en su ficha."
                />
              }
              sub={
                <div className="mt-1.5 flex flex-col gap-0.5 text-[10px] font-mono text-gris-dark leading-tight">
                  <span>👤 {fmt$(performance.totales.costo_mo_basico)} básico</span>
                  <span>🛣 {fmt$(performance.totales.costo_mo_km)} km</span>
                  {performance.totales.costo_estadias > 0 && (
                    <span>⏱ {fmt$(performance.totales.costo_estadias)} estadías</span>
                  )}
                </div>
              }
            />
            <Kpi
              label="% Margen real"
              value={pctMargenReal == null ? '—' : `${pctMargenReal.toFixed(1)}%`}
              accent={pctMargenReal != null && pctMargenReal >= 0 ? 'verde' : 'naranja'}
              info={
                <InfoPopover
                  titulo="% Margen real"
                  incluye={['Margen real ÷ Facturación del período']}
                  iva="La facturación lleva IVA y la mano de obra no: es un porcentaje de caja operativa, no un margen contable."
                  ojo="No comparable con el simulador de Rentabilidad, que trabaja todo neto de IVA."
                />
              }
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi
              label="Margen bruto"
              value={fmt$(margenBruto)}
              accent={margenBruto >= 0 ? 'verde' : 'naranja'}
              info={
                <InfoPopover
                  titulo="Margen bruto"
                  incluye={['Facturación del período − Gastos del período']}
                  noIncluye={['La mano de obra de los choferes — se resta recién en el Margen real']}
                  iva="Los dos lados llevan IVA adentro: es plata que entra contra plata que sale, no margen contable."
                />
              }
            />
            <Kpi
              label="Margen real (− mano de obra)"
              value={fmt$(margenReal)}
              accent={margenReal >= 0 ? 'verde' : 'naranja'}
              info={
                <InfoPopover
                  titulo="Margen real"
                  incluye={['Margen bruto − Costo de mano de obra']}
                  iva="Mezcla: facturación y gastos con IVA, mano de obra sin. Leelo como caja operativa."
                  ojo="No comparable con el simulador de Rentabilidad, que trabaja todo neto de IVA."
                />
              }
            />
            <Kpi
              label="Toneladas movidas"
              value={`${fmtInt(Math.round(performance.totales.toneladas))} t`}
              info={
                <InfoPopover
                  titulo="Toneladas movidas"
                  incluye={['Las toneladas de DESCARGA de los mismos viajes que la facturación (lo que paga el cliente)']}
                  noIncluye={['Las de fleteros de terceros', 'La merma entre carga y descarga — no se muestra en ningún lado']}
                />
              }
            />
            <Kpi
              label="Reintegros pendientes"
              value={fmt$(resumen.reintegros_pendientes)}
              accent="naranja"
              info={
                <InfoPopover
                  titulo="Reintegros pendientes"
                  incluye={['Gastos que un chofer pagó de su bolsillo, ya aprobados y todavía sin liquidar, con fecha en el período']}
                  noIncluye={['Reintegros de fechas anteriores al período — al liquidar se pagan igual']}
                  ojo="Es plata YA gastada que se le debe al chofer. También está dentro de Gastos del período: es un subconjunto marcado, no un monto aparte."
                />
              }
            />
          </div>

          {resumen.pendientes_aprobacion > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-card p-3 text-sm text-amber-900">
              ⚠ Hay {fmt$(resumen.pendientes_aprobacion)} en gastos <b>pendientes de aprobación</b> dentro del rango.
            </div>
          )}

          {/* Breakdown del resumen */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <DistribCard title="Por estado"       rows={resumen.por_estado}      total={resumen.total} />
            <DistribCard title="Por quién pagó"   rows={resumen.por_pagado_por}  total={resumen.total} />
            <DistribCard title="Por método de pago" rows={resumen.por_metodo_pago} total={resumen.total} />
          </div>
        </>
      )}

      {/* Por categoría */}
      <Section title="Gastos por categoría">
        {lca ? <span className="text-gris-dark text-sm">Cargando…</span>
          : (porCat?.length ?? 0) === 0 ? <span className="text-gris-dark text-sm">Sin datos en el rango.</span>
          : (
            <table className="w-full text-sm">
              <thead className="bg-gris-light text-xs text-gris-dark uppercase">
                <tr>
                  <th className="text-left px-3 py-2">Categoría</th>
                  <th className="text-right px-3 py-2">Cant.</th>
                  <th className="text-right px-3 py-2">Total</th>
                  <th className="text-left px-3 py-2 w-1/3">% del total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gris">
                {porCat!.map(r => (
                  <tr key={r.categoria_id}>
                    <td className="px-3 py-2">{r.nombre}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtInt(r.count)}</td>
                    <td className="px-3 py-2 text-right font-mono font-bold">{fmt$(r.total)}</td>
                    <td className="px-3 py-2">
                      <Bar pct={r.pct} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        <p className="text-[11px] text-gris-dark mt-2 leading-snug">
          ℹ La <b>mano de obra</b> no es una categoría de gasto — es un costo derivado de las
          liquidaciones del chofer. Aparece en la columna <b>Mano obra</b> de «Performance por
          camión/chofer», imputada al camión real de cada viaje (no se lista acá entre las
          categorías de gastos).
        </p>
      </Section>

      {/* Por camión */}
      <Section title="Gastos por camión">
        {lc ? <span className="text-gris-dark text-sm">Cargando…</span>
          : (porCamion?.length ?? 0) === 0 ? <span className="text-gris-dark text-sm">Sin datos en el rango.</span>
          : (
            <table className="w-full text-sm">
              <thead className="bg-gris-light text-xs text-gris-dark uppercase">
                <tr>
                  <th className="text-left px-3 py-2">Camión</th>
                  <th className="text-right px-3 py-2">Cant.</th>
                  <th className="text-right px-3 py-2">Total</th>
                  <th className="text-left px-3 py-2">Top categorías</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gris">
                {porCamion!.map(r => (
                  <tr key={r.camion_id}>
                    <td className="px-3 py-2 font-mono font-bold">{r.patente}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtInt(r.count)}</td>
                    <td className="px-3 py-2 text-right font-mono font-bold">{fmt$(r.total)}</td>
                    <td className="px-3 py-2"><TopCategorias data={r.por_categoria} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </Section>

      {/* Por chofer */}
      <Section title="Gastos por chofer">
        {lch ? <span className="text-gris-dark text-sm">Cargando…</span>
          : (porChofer?.length ?? 0) === 0 ? <span className="text-gris-dark text-sm">Sin datos en el rango.</span>
          : (
            <table className="w-full text-sm">
              <thead className="bg-gris-light text-xs text-gris-dark uppercase">
                <tr>
                  <th className="text-left px-3 py-2">Chofer</th>
                  <th className="text-right px-3 py-2">Cant.</th>
                  <th className="text-right px-3 py-2">Total</th>
                  <th className="text-right px-3 py-2">Reintegros pend.</th>
                  <th className="text-left px-3 py-2">Top categorías</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gris">
                {porChofer!.map(r => (
                  <tr key={r.chofer_id}>
                    <td className="px-3 py-2">{r.nombre}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtInt(r.count)}</td>
                    <td className="px-3 py-2 text-right font-mono font-bold">{fmt$(r.total)}</td>
                    <td className="px-3 py-2 text-right font-mono text-naranja-dark">
                      {r.reintegros_pendientes > 0 ? fmt$(r.reintegros_pendientes) : '—'}
                    </td>
                    <td className="px-3 py-2"><TopCategorias data={r.por_categoria} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </Section>

      {/* Performance por camión: cruce de tramos + cobros + gastos */}
      <Section title="Performance por camión (facturación vs gastos)">
        {performance.por_camion.length === 0 ? (
          <span className="text-gris-dark text-sm">
            Sin viajes cargados completados en el rango.
          </span>
        ) : (
          <PerformanceTable
            filas={performance.por_camion}
            label="Camión"
            getNombre={id => camionPatente.get(id) ?? `#${id}`}
            gastosPor={gastosCamion}
            mono
          />
        )}
      </Section>

      {/* Performance por chofer */}
      <Section title="Performance por chofer (facturación vs gastos)">
        {performance.por_chofer.length === 0 ? (
          <span className="text-gris-dark text-sm">
            Sin viajes cargados completados en el rango.
          </span>
        ) : (
          <PerformanceTable
            filas={performance.por_chofer}
            label="Chofer"
            getNombre={id => choferNombre.get(id) ?? `#${id}`}
            gastosPor={gastosChofer}
          />
        )}
      </Section>
    </div>
  )
}

// Tabla compartida para Performance por camión y por chofer. Calcula el
// margen mergeando ingresos (cruce de tramos+cobros+tarifas) con gastos
// (que vienen del endpoint /reportes/por-camion|chofer).
function PerformanceTable({ filas, label, getNombre, gastosPor, mono }: {
  filas:     Array<{ entidad_id: number; viajes: number; toneladas: number; ingresos: number; costo_mo: number; costo_mo_basico: number; costo_mo_km: number; costo_estadias: number; sin_tarifa: number; sin_cobrar: number }>
  label:     string
  getNombre: (id: number) => string
  gastosPor: Map<number, number>
  mono?:     boolean
}) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-gris-light text-xs text-gris-dark uppercase">
        <tr>
          <th className="text-left px-3 py-2">{label}</th>
          <th className="text-right px-3 py-2">Viajes</th>
          <th className="text-right px-3 py-2">Tons</th>
          <th className="text-right px-3 py-2">
            <span className="inline-flex items-center gap-1">Ingresos
              <InfoPopover
                titulo="Ingresos (por fila)"
                incluye={['Mismo criterio que el KPI Facturación, agregado por el camión/chofer REAL de cada viaje']}
                iva="Con IVA incluido."
                ojo="El chip amarillo marca viajes valuados a tarifa (sin facturar); el rojo, viajes sin tarifa cargada que suman $0."
              />
            </span>
          </th>
          <th className="text-right px-3 py-2">
            <span className="inline-flex items-center gap-1">Gastos
              <InfoPopover
                titulo="Gastos (por fila)"
                incluye={['Gastos aprobados y pagados con este camión (o chofer) asignado']}
                noIncluye={['Gastos sin camión/chofer asignado — están en el KPI general pero no en ninguna fila']}
                iva="Total pagado del comprobante."
                ojo="Un gasto con camión Y chofer aparece en las dos tablas: no sumes las tablas entre sí."
              />
            </span>
          </th>
          <th className="text-right px-3 py-2">
            <span className="inline-flex items-center gap-1">Mano obra
              <InfoPopover
                titulo="Mano de obra (por fila)"
                incluye={[
                  'Sueldo + km + estadías prorrateados a este período',
                  'Imputado al camión REAL de cada viaje, repartido por km — no a la preasignación de la ficha',
                ]}
                iva="Sin IVA: es costo laboral."
              />
            </span>
          </th>
          <th className="text-right px-3 py-2">Margen</th>
          <th className="text-right px-3 py-2">$/tn</th>
          <th className="text-left px-3 py-2">Notas</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gris">
        {filas.map(f => {
          const gasto  = gastosPor.get(f.entidad_id) ?? 0
          const margen = f.ingresos - gasto - f.costo_mo
          const dxTn   = f.toneladas > 0 ? margen / f.toneladas : null
          return (
            <tr key={f.entidad_id}>
              <td className={`px-3 py-2 ${mono ? 'font-mono font-bold' : 'font-semibold'}`}>{getNombre(f.entidad_id)}</td>
              <td className="px-3 py-2 text-right font-mono">{fmtInt(f.viajes)}</td>
              <td className="px-3 py-2 text-right font-mono">{fmtInt(Math.round(f.toneladas))} t</td>
              <td className="px-3 py-2 text-right font-mono">{fmt$(f.ingresos)}</td>
              <td className="px-3 py-2 text-right font-mono">{fmt$(gasto)}</td>
              <td
                className={`px-3 py-2 text-right font-mono ${f.costo_mo > 0 ? 'text-azul-mid' : 'text-gris-mid'}`}
                title={f.costo_mo > 0
                  ? `Básico ${fmt$(f.costo_mo_basico)} · Km ${fmt$(f.costo_mo_km)}${f.costo_estadias > 0 ? ` · Estadías ${fmt$(f.costo_estadias)}` : ''}`
                  : undefined}
              >
                {f.costo_mo > 0 ? fmt$(f.costo_mo) : '—'}
              </td>
              <td className={`px-3 py-2 text-right font-mono font-bold ${margen >= 0 ? 'text-verde' : 'text-rojo'}`}>
                {fmt$(margen)}
              </td>
              <td className={`px-3 py-2 text-right font-mono ${dxTn == null ? 'text-gris-mid' : ''}`}>
                {dxTn == null ? '—' : fmt$(dxTn)}
              </td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap gap-1">
                  {f.sin_cobrar > 0 && (
                    <span title="Tramos sin cobro registrado (ingreso teórico)" className="text-[10px] bg-amarillo-light text-[#7A5500] px-1.5 py-0.5 rounded font-bold">
                      📦 {f.sin_cobrar} sin cobrar
                    </span>
                  )}
                  {f.sin_tarifa > 0 && (
                    <span title="Tramos sin tarifa cargada — ingreso = 0. Cargar la tarifa empresa-punto de carga correspondiente." className="text-[10px] bg-rojo-light text-rojo px-1.5 py-0.5 rounded font-bold">
                      ⚠ {f.sin_tarifa} sin tarifa
                    </span>
                  )}
                </div>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ── Subcomponentes ──────────────────────────────────────────────

function Kpi({ label, value, accent, info, sub }: {
  label: ReactNode; value: string; accent?: 'azul' | 'naranja' | 'verde'
  /** ⓘ con la definición del número: qué suma, qué no, IVA. */
  info?: ReactNode
  /** Sub-cifras debajo del valor (ej: desglose cobrado/por cobrar). */
  sub?: ReactNode
}) {
  const accentCls = accent === 'azul'    ? 'border-azul-light text-azul-mid'
                  : accent === 'naranja' ? 'border-naranja-light text-naranja-dark'
                  : accent === 'verde'   ? 'border-verde-light text-verde'
                  : 'border-gris-mid text-carbon'
  return (
    <div className={`bg-white rounded-card shadow-card p-3 border-l-[4px] ${accentCls}`}>
      <div className="text-[11px] font-bold text-gris-dark uppercase tracking-wider flex items-start justify-between gap-1.5">
        <span>{label}</span>
        {info}
      </div>
      <div className="font-mono font-bold text-base sm:text-xl mt-1 break-words">{value}</div>
      {sub}
    </div>
  )
}

function DistribCard({ title, rows, total }: {
  title: string
  rows: Record<string, { total: number; count: number }>
  total: number
}) {
  const entries = useMemo(() => Object.entries(rows).sort(([,a],[,b]) => b.total - a.total), [rows])
  return (
    <div className="bg-white rounded-card shadow-card p-3">
      <div className="text-[11px] font-bold text-gris-dark uppercase tracking-wider mb-2">{title}</div>
      {entries.length === 0 ? (
        <div className="text-sm text-gris-mid italic">Sin datos</div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {entries.map(([k, v]) => {
            const pct = total > 0 ? (v.total / total) * 100 : 0
            return (
              <div key={k} className="flex items-center gap-2 text-xs">
                <span className="w-24 truncate">{k}</span>
                <Bar pct={pct} />
                <span className="font-mono font-bold text-right w-24">{fmt$(v.total)}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Bar({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct))
  return (
    <div className="flex items-center gap-2 flex-1">
      <div className="flex-1 h-2 bg-gris rounded-full overflow-hidden">
        <div className="h-full bg-azul" style={{ width: `${clamped}%` }} />
      </div>
      <span className="text-xs text-gris-dark font-mono w-12 text-right">{clamped.toFixed(1)}%</span>
    </div>
  )
}

function TopCategorias({ data }: { data: Record<string, number> }) {
  const top = Object.entries(data).sort(([,a],[,b]) => b - a).slice(0, 3)
  if (top.length === 0) return <span className="text-gris-mid italic text-xs">—</span>
  return (
    <div className="flex gap-1.5 flex-wrap">
      {top.map(([cat, monto]) => (
        <span key={cat} className="text-[10px] bg-gris-light text-gris-dark px-1.5 py-0.5 rounded-full font-mono">
          {cat}: {fmt$(monto)}
        </span>
      ))}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-card shadow-card overflow-hidden">
      <div className="px-3 py-2 border-b border-gris bg-gris-light">
        <h3 className="text-sm font-bold text-carbon">{title}</h3>
      </div>
      <div className="p-3 overflow-x-auto">{children}</div>
    </div>
  )
}
