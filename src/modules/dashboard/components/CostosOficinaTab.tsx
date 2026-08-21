'use client'

/**
 * Tab "Costos oficina" del dashboard.
 *
 * Muestra, por mes:
 *  a) El personal administrativo con su sueldo vigente (CRUD vía modal).
 *  b) El costo por obra: costo directo del mes (operarios + contratistas,
 *     calculado con la MISMA fórmula que el tab Histórico — ver
 *     costos-mensuales.ts) + oficina asignada directo a la obra + prorrateo
 *     de la parte "general" proporcional al costo directo + % de overhead.
 *
 * Visible solo con el permiso `tarja.costos_oficina` (gate en el parent y
 * en el backend). Reusa las queryKeys de datos que ya cachea el dashboard
 * (['horas','all'], ['tarifas','all'], etc.) para no re-fetchear.
 */

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api/client'
import { useObras, useObrasArchivadas } from '@/modules/tarja/hooks/useObras'
import { usePersonal } from '@/modules/tarja/hooks/usePersonal'
import { useCategorias } from '@/modules/tarja/hooks/useCategorias'
import { useHsExtrasAll } from '@/modules/tarja/hooks/useHsExtras'
import { MESES } from '@/lib/utils/dates'
import { calcularCostosMensualesPorObra } from '@/lib/utils/costos-mensuales'
import { Chip } from '@/components/ui/Chip'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import {
  useOficinaPersonas, useOficinaResumen, sueldoVigente,
} from '../hooks/useOficina'
import { OficinaPersonalModal } from './OficinaPersonalModal'
import { OficinaAumentoModal } from './OficinaAumentoModal'
import type { Hora, Tarifa, Certificacion, TarjaHsExtra } from '@/types/domain.types'

// Montos exactos (sin redondear al millar como fmtMonto): los importes de
// oficina son sueldos prorrateados y pueden ser chicos; redondearlos al
// millar en la tabla haría que las columnas no cierren contra el total.
function fmtPesos(n: number): string {
  return '$' + Math.round(n).toLocaleString('es-AR')
}

function mesActualStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function shiftMes(mes: string, delta: number): string {
  const [y, m] = mes.split('-').map(Number)
  const d = new Date(y!, (m! - 1) + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function labelMes(mes: string): string {
  const [y, m] = mes.split('-').map(Number)
  return `${MESES[m! - 1] ?? mes} ${y}`
}

type ModalState = { tipo: 'nueva' } | { tipo: 'editar'; personaId: number } | { tipo: 'aumento' } | null

export function CostosOficinaTab() {
  const [mes, setMes] = useState(mesActualStr)
  const [mostrarInactivos, setMostrarInactivos] = useState(false)
  const [modal, setModal] = useState<ModalState>(null)

  // ── Datos de oficina ──
  const {
    data: personas = [],
    isLoading: loadingPersonas,
    isError: errorPersonas,
  } = useOficinaPersonas()
  const {
    data: resumen,
    isLoading: loadingResumen,
    isError: errorResumen,
  } = useOficinaResumen(mes)

  // ── Datos de tarja (mismas queryKeys que ResumenHistoricoPage → cache) ──
  const { data: obras = [], isLoading: loadingObras } = useObras()
  const { data: obrasArchivadas = [] } = useObrasArchivadas()
  const { data: personal = [] } = usePersonal()
  const { data: categorias = [] } = useCategorias()
  const { data: todasHoras = [], isLoading: loadingHoras } = useQuery({
    queryKey: ['horas', 'all'],
    queryFn: () => apiGet<Hora[]>('/api/horas/all'),
  })
  const { data: todasTarifas = [], isLoading: loadingTarifas } = useQuery({
    queryKey: ['tarifas', 'all'],
    queryFn: () => apiGet<Tarifa[]>('/api/tarifas/all'),
  })
  const { data: todasCerts = [], isLoading: loadingCerts } = useQuery({
    queryKey: ['certs', 'all'],
    queryFn: () => apiGet<Certificacion[]>('/api/contratistas/cert/all'),
  })
  const { data: todasCatObra = [] } = useQuery({
    queryKey: ['cat-obra', 'all'],
    queryFn: () => apiGet<Array<{ obra_cod: string; leg: string; cat_id: number; desde: string }>>('/api/cat-obra/all'),
  })
  const { data: todasHsExtras = [], isLoading: loadingHsExtras } = useHsExtrasAll() as {
    data: TarjaHsExtra[]
    isLoading: boolean
  }

  // Activas + archivadas: el mes puede incluir semanas de obras ya archivadas.
  const obrasCombinadas = useMemo(() => [...obras, ...obrasArchivadas], [obras, obrasArchivadas])
  const obrasByCod = useMemo(() => new Map(obrasCombinadas.map(o => [o.cod, o])), [obrasCombinadas])

  // ── Costo directo del mes por obra (fórmula canónica, ver §4/§5.11) ──
  const costosDirectos = useMemo(
    () => calcularCostosMensualesPorObra({
      obras:      obrasCombinadas,
      horas:      todasHoras,
      hsExtras:   todasHsExtras,
      personal,
      categorias,
      tarifas:    todasTarifas,
      catObra:    todasCatObra,
      certs:      todasCerts,
    }, mes),
    [obrasCombinadas, todasHoras, todasHsExtras, personal, categorias, todasTarifas, todasCatObra, todasCerts, mes],
  )

  // ── Filas de la tabla: directo + oficina directa + prorrateo general ──
  const tabla = useMemo(() => {
    const oficinaPorObra = new Map((resumen?.porObra ?? []).map(r => [r.obra_cod, r.monto]))
    const general   = resumen?.general ?? 0
    const logistica = resumen?.logistica ?? 0

    const cods = [...new Set([...costosDirectos.keys(), ...oficinaPorObra.keys()])]
    const sumDirectos = [...costosDirectos.values()]
      .reduce((s, c) => s + c.costoOperarios + c.costoContratistas, 0)

    const filas = cods.map(cod => {
      const dir = costosDirectos.get(cod)
      const costoDirecto   = (dir?.costoOperarios ?? 0) + (dir?.costoContratistas ?? 0)
      const oficinaDirecta = oficinaPorObra.get(cod) ?? 0
      // General se prorratea proporcional al costo directo del mes. Si no
      // hubo costos directos (Σ=0) no se prorratea: va como línea aparte.
      const prorrateo = sumDirectos > 0 ? general * costoDirecto / sumDirectos : 0
      const oficinaTotal = oficinaDirecta + prorrateo
      return {
        cod,
        nombre:            obrasByCod.get(cod)?.nom ?? cod,
        archivada:         obrasByCod.get(cod)?.archivada ?? false,
        costoOperarios:    dir?.costoOperarios ?? 0,
        costoContratistas: dir?.costoContratistas ?? 0,
        costoDirecto,
        oficinaDirecta,
        prorrateo,
        totalConEstructura: costoDirecto + oficinaTotal,
        // % overhead = oficina total de la obra / costo directo.
        overheadPct: costoDirecto > 0 ? (oficinaTotal / costoDirecto) * 100 : null,
      }
    }).sort((a, b) => b.totalConEstructura - a.totalConEstructura)

    const tot = filas.reduce((acc, f) => ({
      costoDirecto:       acc.costoDirecto + f.costoDirecto,
      oficinaDirecta:     acc.oficinaDirecta + f.oficinaDirecta,
      prorrateo:          acc.prorrateo + f.prorrateo,
      totalConEstructura: acc.totalConEstructura + f.totalConEstructura,
    }), { costoDirecto: 0, oficinaDirecta: 0, prorrateo: 0, totalConEstructura: 0 })

    return {
      filas,
      tot,
      general,
      logistica,
      generalSinProrratear: sumDirectos === 0 && general > 0,
      overheadTotalPct: tot.costoDirecto > 0
        ? ((tot.oficinaDirecta + tot.prorrateo) / tot.costoDirecto) * 100
        : null,
    }
  }, [resumen, costosDirectos, obrasByCod])

  // ── Personas visibles ──
  const personasVisibles = useMemo(
    () => mostrarInactivos ? personas : personas.filter(p => p.activo),
    [personas, mostrarInactivos],
  )
  const nInactivas = personas.filter(p => !p.activo).length

  const personaEnEdicion = modal?.tipo === 'editar'
    ? personas.find(p => p.id === modal.personaId) ?? null
    : null

  // ── Loading global (mismo criterio que el resto del dashboard: esperar
  // los agregados para no renderizar totales a medias) ──
  const loadingAny = loadingPersonas || loadingResumen || loadingObras
    || loadingHoras || loadingTarifas || loadingCerts || loadingHsExtras
  if (loadingAny) {
    return (
      <div className="p-8 flex items-center gap-3 text-gris-dark">
        <span className="w-5 h-5 border-2 border-naranja border-t-transparent rounded-full animate-spin" />
        Cargando costos de oficina...
      </div>
    )
  }

  if (errorPersonas || errorResumen) {
    return (
      <div className="bg-white rounded-card shadow-card p-6 border-l-[5px] border-rojo">
        <p className="text-sm font-bold text-rojo">No se pudieron cargar los costos de oficina.</p>
        <p className="text-xs text-gris-dark mt-1">
          Puede ser un problema de conexión o de permisos. Probá recargar la página.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">

      {/* ══ Header: título + selector de mes + chips ══ */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-[1.4rem] tracking-wider text-azul">
            🏢 COSTOS DE OFICINA
          </h2>
          <p className="text-xs text-gris-dark mt-1">
            Estructura administrativa del mes y su distribución entre obras.
          </p>
          {/* Selector de mes */}
          <div className="flex items-center gap-1 mt-2">
            <button
              onClick={() => setMes(m => shiftMes(m, -1))}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-gris text-gris-dark hover:bg-gris-mid font-bold transition-colors"
              aria-label="Mes anterior"
            >
              ←
            </button>
            <span className="font-bold text-sm text-azul min-w-[150px] text-center capitalize">
              {labelMes(mes)}
            </span>
            <button
              onClick={() => setMes(m => shiftMes(m, 1))}
              disabled={mes >= mesActualStr()}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-gris text-gris-dark hover:bg-gris-mid font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Mes siguiente"
            >
              →
            </button>
            {mes !== mesActualStr() && (
              <button
                onClick={() => setMes(mesActualStr())}
                className="text-xs font-bold px-2 py-1 rounded-md bg-gris text-gris-dark hover:bg-naranja-light hover:text-naranja-dark transition-colors ml-1"
              >
                Hoy
              </button>
            )}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Chip value={personas.filter(p => p.activo).length} label="Personas" />
          <Chip value={fmtPesos(resumen?.totalOficina ?? 0)} label="Oficina del mes" variant="orange" />
        </div>
      </div>

      {/* ══ a) Personal de oficina ══ */}
      <div className="bg-white rounded-card shadow-card p-3 sm:p-4">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <h3 className="text-sm font-bold text-azul uppercase tracking-wider">
            👥 Personal de oficina
          </h3>
          <div className="flex items-center gap-3 flex-wrap">
            {nInactivas > 0 && (
              <label className="flex items-center gap-1.5 text-xs font-semibold text-gris-dark cursor-pointer">
                <input
                  type="checkbox"
                  className="accent-azul"
                  checked={mostrarInactivos}
                  onChange={e => setMostrarInactivos(e.target.checked)}
                />
                Mostrar inactivos ({nInactivas})
              </label>
            )}
            <Button size="sm" variant="secondary" onClick={() => setModal({ tipo: 'aumento' })}>
              📈 Aumento
            </Button>
            <Button size="sm" variant="primary" onClick={() => setModal({ tipo: 'nueva' })}>
              ＋ Agregar persona
            </Button>
          </div>
        </div>

        {personasVisibles.length === 0 ? (
          <p className="text-sm text-gris-dark text-center py-6">
            {personas.length === 0
              ? 'Todavía no hay personal de oficina cargado. Agregá la primera persona para empezar a distribuir la estructura.'
              : 'No hay personas activas. Tildá "Mostrar inactivos" para ver el resto.'}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {personasVisibles.map(p => {
              const vigente = sueldoVigente(p.sueldos)
              return (
                <button
                  key={p.id}
                  onClick={() => setModal({ tipo: 'editar', personaId: p.id })}
                  className={`text-left border border-gris-mid rounded-xl p-3 transition-colors hover:bg-naranja-light hover:border-naranja ${
                    p.activo ? 'bg-gris/30' : 'bg-gris/30 opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm text-azul truncate">{p.nombre}</span>
                    {!p.activo && <Badge variant="inactivo" />}
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-1.5">
                    <span className="font-mono text-sm font-bold text-verde">
                      {vigente ? `${fmtPesos(vigente.costo_mensual)}/mes` : 'Sin sueldo'}
                    </span>
                    <span className="text-[11px] font-bold text-gris-dark">✎ Editar</span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ══ b) Costo por obra del mes ══ */}
      <div className="bg-white rounded-card shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[860px]">
            <thead>
              <tr>
                <th className="bg-azul text-white text-[11px] font-bold px-3 py-2.5 text-left uppercase tracking-wide">
                  Obra
                </th>
                <th className="bg-azul text-white text-[11px] font-bold px-3 py-2.5 text-right uppercase tracking-wide">
                  Costo directo
                </th>
                <th className="bg-azul text-white text-[11px] font-bold px-3 py-2.5 text-right uppercase tracking-wide">
                  Oficina directa
                </th>
                <th className="bg-azul text-white text-[11px] font-bold px-3 py-2.5 text-right uppercase tracking-wide">
                  Prorrateo gral.
                </th>
                <th className="bg-azul text-naranja text-[11px] font-bold px-3 py-2.5 text-right uppercase tracking-wide">
                  Total c/ estructura
                </th>
                <th className="bg-azul text-white text-[11px] font-bold px-3 py-2.5 text-right uppercase tracking-wide">
                  % Overhead
                </th>
              </tr>
            </thead>
            <tbody>
              {tabla.filas.length === 0 && !tabla.generalSinProrratear && tabla.logistica === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-gris-dark text-sm">
                    Sin actividad ni costos de oficina en {labelMes(mes)}.
                  </td>
                </tr>
              ) : (
                <>
                  {tabla.filas.map(f => (
                    <tr key={f.cod} className="border-b border-gris last:border-0 hover:bg-gris/40 transition-colors">
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm">{f.nombre}</span>
                          <span className="font-mono text-[11px] text-gris-dark">{f.cod}</span>
                          {f.archivada && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gris text-gris-dark">
                              Archivada
                            </span>
                          )}
                        </div>
                      </td>
                      <td
                        className="px-3 py-2.5 text-right font-mono font-bold text-sm text-verde"
                        title={`Operarios: ${fmtPesos(f.costoOperarios)} · Contratistas: ${fmtPesos(f.costoContratistas)}`}
                      >
                        {fmtPesos(f.costoDirecto)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-sm text-carbon">
                        {f.oficinaDirecta > 0 ? fmtPesos(f.oficinaDirecta) : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-sm text-gris-dark">
                        {f.prorrateo > 0 ? fmtPesos(f.prorrateo) : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-sm text-naranja">
                        {fmtPesos(f.totalConEstructura)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-sm">
                        {f.overheadPct != null ? (
                          <span className={f.overheadPct > 25 ? 'text-rojo' : 'text-carbon'}>
                            {f.overheadPct.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}

                  {/* General sin prorratear (mes sin costos directos) */}
                  {tabla.generalSinProrratear && (
                    <tr className="border-b border-gris bg-amarillo-light/40">
                      <td className="px-3 py-2.5 text-sm font-bold text-carbon">
                        🏢 Estructura general sin prorratear
                        <span className="block text-[11px] font-normal text-gris-dark">
                          No hay costos directos este mes para repartirla.
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-sm text-gris-dark">—</td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-sm text-carbon">
                        {fmtPesos(tabla.general)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-sm text-gris-dark">—</td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-sm text-naranja">
                        {fmtPesos(tabla.general)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-sm text-gris-dark">—</td>
                    </tr>
                  )}

                  {/* Logística: recibe su parte directa, no participa del prorrateo */}
                  {tabla.logistica > 0 && (
                    <tr className="border-b border-gris bg-azul-light/30">
                      <td className="px-3 py-2.5 text-sm font-bold text-azul">
                        🚚 Logística
                        <span className="block text-[11px] font-normal text-gris-dark">
                          Asignación directa — no participa del prorrateo.
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-sm text-gris-dark">—</td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-sm text-carbon">
                        {fmtPesos(tabla.logistica)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-sm text-gris-dark">—</td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-sm text-naranja">
                        {fmtPesos(tabla.logistica)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-sm text-gris-dark">—</td>
                    </tr>
                  )}

                  {/* Fila TOTAL */}
                  <tr>
                    <td className="bg-azul text-white font-display text-base tracking-wide px-3 py-2.5">
                      TOTAL {labelMes(mes).toUpperCase()}
                    </td>
                    <td className="bg-azul text-[#7DD9A2] font-mono font-bold text-sm text-right px-3 py-2.5">
                      {fmtPesos(tabla.tot.costoDirecto)}
                    </td>
                    <td className="bg-azul text-white font-mono font-bold text-sm text-right px-3 py-2.5">
                      {fmtPesos(tabla.tot.oficinaDirecta + (tabla.generalSinProrratear ? tabla.general : 0) + tabla.logistica)}
                    </td>
                    <td className="bg-azul text-white font-mono font-bold text-sm text-right px-3 py-2.5">
                      {fmtPesos(tabla.tot.prorrateo)}
                    </td>
                    <td className="bg-azul text-naranja font-mono font-bold text-base text-right px-3 py-2.5">
                      {fmtPesos(
                        tabla.tot.totalConEstructura
                        + (tabla.generalSinProrratear ? tabla.general : 0)
                        + tabla.logistica
                      )}
                    </td>
                    <td className="bg-azul text-white font-mono font-bold text-sm text-right px-3 py-2.5">
                      {tabla.overheadTotalPct != null
                        ? `${tabla.overheadTotalPct.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`
                        : '—'}
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-gris-dark px-3 py-2 border-t border-gris">
          Los meses se cortan por semana de tarja (viernes): una semana entra
          entera en el mes de su viernes de inicio. Incluye obras archivadas —
          para cuadrar contra el tab Histórico, filtrarlo en &quot;todas&quot;.
        </p>
      </div>

      {/* ══ Modales ══ */}
      {/* Guard: en modo editar solo abrimos si la persona sigue existiendo
          en cache (si no, caería al modal de alta por persona=null). */}
      <OficinaPersonalModal
        open={modal?.tipo === 'nueva' || personaEnEdicion !== null}
        onClose={() => setModal(null)}
        persona={personaEnEdicion}
      />
      <OficinaAumentoModal
        open={modal?.tipo === 'aumento'}
        onClose={() => setModal(null)}
        personas={personas}
      />
    </div>
  )
}
