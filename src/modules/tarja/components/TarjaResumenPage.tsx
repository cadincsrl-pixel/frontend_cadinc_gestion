'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useObras } from '@/modules/tarja/hooks/useObras'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { usePerfilesMap } from '@/lib/hooks/usePerfilesMap'
import { ModalNuevaObra } from './ModalNuevaObra'
import { AlertaSinCobertura } from './AlertaSinCobertura'
import { AlertaInactivosConCobertura } from './AlertaInactivosConCobertura'
import { ModalExcelObras } from './ModalExcelObras'
import { ModalRecibos } from './ModalRecibos'
import { useQuery } from '@tanstack/react-query'
import { useResumenObras } from '@/modules/tarja/hooks/useHoras'
import { useActividadPersonal, legsActivosDe } from '@/modules/tarja/hooks/useActividadPersonal'
import { apiGet } from '@/lib/api/client'
import { exportarCSVResumenObras } from '@/lib/utils/excel'
import { useToast } from '@/components/ui/Toast'
import { useUIStore } from '@/store/ui.store'
import { usePermisos } from '@/hooks/usePermisos'
import { useSessionStore } from '@/store/session.store'
import { getViernes, getSemDays, toISO } from '@/lib/utils/dates'
import type { Categoria, Certificacion, Cierre, Contratista, Hora, Personal, Tarifa } from '@/types/domain.types'

// Orden de obras: persistido en localStorage para que el usuario mantenga
// su elección entre visitas/sesiones.
type SortKey = 'nombre' | 'hsSemana' | 'trabSemana' | 'ultimaActividad'
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'nombre',          label: 'Nombre (A→Z)' },
  { key: 'hsSemana',        label: 'Horas esta semana' },
  { key: 'trabSemana',      label: 'Trab. esta semana' },
  { key: 'ultimaActividad', label: 'Última actividad' },
]
const SORT_STORAGE_KEY = 'tarja:obras:sort'

export function TarjaResumenPage() {
  const router = useRouter()
  const toast = useToast()
  const { puedeAdministrarObras, verPii } = usePermisos('tarja')
  // Vista restringida (scope='asignadas' y no es admin): solo ve obras asignadas
  // y la semana actual; sin export, sin cierre semanal, sin tarifas.
  const scopeAsignadas = useSessionStore(s =>
    s.profile?.rol !== 'admin' && s.profile?.obras_scope === 'asignadas'
  )
  const { data: obras = [], isLoading } = useObras('tarja')
  const perfiles = usePerfilesMap()
  const [modalObra, setModalObra] = useState(false)
  const [modalExcelObras, setModalExcelObras] = useState(false)
  const [modalRecibos, setModalRecibos] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>(() => {
    if (typeof window === 'undefined') return 'nombre'
    const saved = window.localStorage.getItem(SORT_STORAGE_KEY)
    return saved && SORT_OPTIONS.some(o => o.key === saved) ? (saved as SortKey) : 'nombre'
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(SORT_STORAGE_KEY, sortKey)
  }, [sortKey])
  const setTopbarAccion = useUIStore(s => s.setTopbarAccion)

  // Semana actual (vie→jue), calculada una sola vez al montar; si la semana
  // cambia con la página abierta el usuario recarga igual al volver.
  const semanaKey = useMemo(() => toISO(getViernes(new Date())), [])
  const juevesKey = useMemo(() => toISO(getSemDays(getViernes(new Date()))[6]!), [])
  // Horas de ESTA semana (todas las obras): stats, alerta de cobertura y
  // recuento de trabajadores. Las históricas ya no se bajan enteras (19k
  // filas): el resumen por obra y la actividad por legajo los calcula la base.
  const { data: horasSemana = [] } = useQuery({
    queryKey: ['horas', 'semana', semanaKey, juevesKey],
    queryFn: () => apiGet<Hora[]>(`/api/horas/all?desde=${semanaKey}&hasta=${juevesKey}`),
  })
  const { data: resumenObras = [] } = useResumenObras(semanaKey)
  const { data: actividad = [] } = useActividadPersonal()
  const legsActivos = useMemo(() => legsActivosDe(actividad), [actividad])
  const { data: todoPersonal = [] } = useQuery({
    queryKey: ['personal'],
    queryFn: () => apiGet<Personal[]>('/api/personal'),
  })
  const { data: categorias = [] } = useQuery({
    queryKey: ['categorias'],
    queryFn: () => apiGet<Categoria[]>('/api/categorias'),
  })
  const { data: todasTarifas = [] } = useQuery({
    queryKey: ['tarifas', 'all'],
    queryFn: () => apiGet<Tarifa[]>('/api/tarifas/all'),
  })
  const { data: todosCierres = [] } = useQuery({
    queryKey: ['cierres', 'all'],
    queryFn: () => apiGet<Cierre[]>('/api/cierres/all'),
  })
  const { data: todasCerts = [] } = useQuery({
    queryKey: ['certs', 'all'],
    queryFn: () => apiGet<Certificacion[]>('/api/contratistas/cert/all'),
  })
  const { data: contratistas = [] } = useQuery({
    queryKey: ['contratistas'],
    queryFn: () => apiGet<Contratista[]>('/api/contratistas'),
  })

  // Días de la semana actual (vie→jue) como set de ISO. Calculado una sola
  // vez al montar; si la semana cambia mientras la página está abierta el
  // usuario va a recargar igual al volver al lunes siguiente.
  const semDays = useMemo(() => {
    return new Set(getSemDays(getViernes(new Date())).map(toISO))
  }, [])

  // Stats por obra (RPC obras_actividad). Toda obra tiene entrada, con ceros
  // si todavía no cargó horas.
  const statsMap = useMemo(() => {
    const porObra = new Map(resumenObras.map(r => [r.obra_cod, r]))
    const map: Record<string, {
      hsSemana: number
      trabajadoresSemana: number
      ultimaActividad: string | null
      ultimaCargaPor: string | null
    }> = {}
    obras.forEach(o => {
      const r = porObra.get(o.cod)
      map[o.cod] = {
        hsSemana:           Number(r?.hs_semana ?? 0),
        trabajadoresSemana: r?.trabajadores_semana ?? 0,
        ultimaActividad:    r?.ultima_actividad ?? null,
        ultimaCargaPor:     r?.ultima_carga_por ?? null,
      }
    })
    return map
  }, [obras, resumenObras])

  const obrasFiltradas = useMemo(() => {
    if (!busqueda.trim()) return obras
    const q = busqueda.toLowerCase().trim()
    return obras.filter(o =>
      o.nom.toLowerCase().includes(q) ||
      o.cod.toLowerCase().includes(q) ||
      (o.dir ?? '').toLowerCase().includes(q) ||
      (o.resp ?? '').toLowerCase().includes(q) ||
      (o.cc ?? '').toLowerCase().includes(q)
    )
  }, [obras, busqueda])

  // Orden derivado del filtro. Para `ultimaActividad`, las obras sin actividad
  // van al final (no se mezclan con las recién tocadas).
  const obrasOrdenadas = useMemo(() => {
    const arr = [...obrasFiltradas]
    arr.sort((a, b) => {
      switch (sortKey) {
        case 'nombre':
          return a.nom.localeCompare(b.nom, 'es')
        case 'hsSemana':
          return (statsMap[b.cod]?.hsSemana ?? 0) - (statsMap[a.cod]?.hsSemana ?? 0)
        case 'trabSemana':
          return (statsMap[b.cod]?.trabajadoresSemana ?? 0) - (statsMap[a.cod]?.trabajadoresSemana ?? 0)
        case 'ultimaActividad': {
          const aF = statsMap[a.cod]?.ultimaActividad ?? ''
          const bF = statsMap[b.cod]?.ultimaActividad ?? ''
          if (!aF && !bF) return 0
          if (!aF) return 1
          if (!bF) return -1
          return bF.localeCompare(aF)
        }
      }
    })
    return arr
  }, [obrasFiltradas, sortKey, statsMap])

  useEffect(() => {
    // Capataz (solo_carga_horas) no tiene acciones globales: ni Excel, ni
    // Recibos, ni CSV. No registramos el callback para que el Topbar no
    // muestre los botones aunque por algún motivo intente leerlo.
    if (scopeAsignadas) {
      setTopbarAccion(null)
      return
    }

    setTopbarAccion((accion: string) => {
      if (accion === 'excel') setModalExcelObras(true)
      if (accion === 'recibos') setModalRecibos(true)
      if (accion === 'csv') {
        if (!obrasFiltradas.length) {
          toast('No hay obras para exportar', 'warn')
          return
        }
        exportarCSVResumenObras(obrasFiltradas, resumenObras)
        toast('⬇ CSV exportado', 'ok')
      }
    })

    return () => setTopbarAccion(null)
  }, [obrasFiltradas, setTopbarAccion, toast, resumenObras, scopeAsignadas])

  function fmtFecha(fecha: string | null): string {
    if (!fecha) return 'Sin actividad'
    const d = new Date(fecha + 'T12:00:00')
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`
  }

  if (isLoading) {
    return (
      <div className="p-8 flex items-center gap-3 text-gris-dark">
        <span className="w-5 h-5 border-2 border-naranja border-t-transparent rounded-full animate-spin" />
        Cargando obras...
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4">

      {/* Alertas de Personal — solo para users con ver_pii.
          1. Sin cobertura trabajando esta semana (rojo, riesgo legal).
          2. Inactivos con cobertura activa (naranja, sangrado financiero). */}
      {verPii && (
        <>
          <AlertaSinCobertura personal={todoPersonal} horas={horasSemana} />
          <AlertaInactivosConCobertura personal={todoPersonal} legsConHoras={legsActivos} />
        </>
      )}

      {/* Header */}
      <div className="bg-white rounded-card shadow-card p-4 flex flex-col gap-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-display text-[2rem] tracking-wider text-azul leading-none">
              OBRAS ACTIVAS
            </h1>
            <p className="text-sm text-gris-dark mt-1">
              {obras.length} obra{obras.length !== 1 ? 's' : ''} en curso
            </p>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setModalObra(true)}
            disabled={!puedeAdministrarObras || scopeAsignadas}
            title={!puedeAdministrarObras ? 'Sin permiso para administrar obras' : scopeAsignadas ? 'Solo disponible con acceso a todas las obras' : undefined}
          >
            ＋ Nueva obra
          </Button>
        </div>

        {/* Barra de búsqueda + ordenar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gris-dark text-sm">🔍</span>
            <input
              type="text"
              autoComplete="off"
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre, código, dirección, responsable o centro de costo..."
              className="
                w-full pl-9 pr-3 py-2.5 border-[1.5px] border-gris-mid rounded-lg
                text-sm outline-none transition-colors bg-white
                focus:border-naranja focus:shadow-[0_0_0_3px_rgba(232,98,26,.12)]
                placeholder:text-gris-dark/50
              "
            />
            {busqueda && (
              <button
                onClick={() => setBusqueda('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gris-dark hover:text-carbon text-sm"
              >
                ✕
              </button>
            )}
          </div>
          <select
            value={sortKey}
            onChange={e => setSortKey(e.target.value as SortKey)}
            title="Ordenar obras"
            className="
              px-3 py-2.5 border-[1.5px] border-gris-mid rounded-lg
              text-sm font-semibold text-carbon bg-white cursor-pointer
              outline-none transition-colors
              focus:border-naranja focus:shadow-[0_0_0_3px_rgba(232,98,26,.12)]
            "
          >
            {SORT_OPTIONS.map(opt => (
              <option key={opt.key} value={opt.key}>↕ {opt.label}</option>
            ))}
          </select>
        </div>

        {/* Resultado de búsqueda */}
        {busqueda && (
          <p className="text-xs text-gris-dark">
            {obrasFiltradas.length} resultado{obrasFiltradas.length !== 1 ? 's' : ''} para "{busqueda}"
          </p>
        )}
      </div>

      {/* Stats generales — ocultas para capataz (no necesita agregados) */}
      {!scopeAsignadas && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white rounded-card shadow-card p-3 text-center">
            <div className="font-mono text-2xl font-bold text-azul">{obras.length}</div>
            <div className="text-[11px] text-gris-dark font-bold uppercase tracking-wide">Obras activas</div>
          </div>
          <div className="bg-white rounded-card shadow-card p-3 text-center">
            <div className="font-mono text-2xl font-bold text-naranja">
              {new Set(horasSemana.filter(h => semDays.has(h.fecha)).map(h => h.leg)).size}
            </div>
            <div className="text-[11px] text-gris-dark font-bold uppercase tracking-wide">Trab. esta semana</div>
          </div>
          <div className="bg-white rounded-card shadow-card p-3 text-center">
            <div className="font-mono text-2xl font-bold text-verde">
              {horasSemana
                .filter(h => semDays.has(h.fecha))
                .reduce((s, h) => s + h.horas, 0)
                .toLocaleString('es-AR')}
            </div>
            <div className="text-[11px] text-gris-dark font-bold uppercase tracking-wide">Horas esta semana</div>
          </div>
          <div className="bg-white rounded-card shadow-card p-3 text-center">
            <div className="font-mono text-2xl font-bold text-[#7A5500]">{todoPersonal.length}</div>
            <div className="text-[11px] text-gris-dark font-bold uppercase tracking-wide">Personal total</div>
          </div>
        </div>
      )}

      {/* Lista de obras */}
      {obrasFiltradas.length === 0 ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-gris-dark">
          {busqueda
            ? `No se encontraron obras para "${busqueda}".`
            : 'No hay obras activas. Creá la primera.'
          }
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {obrasOrdenadas.map(obra => {
            const stats = statsMap[obra.cod]
            return (
              <button
                key={obra.cod}
                onClick={() => router.push(`/tarja/${encodeURIComponent(obra.cod)}`)}
                className="
                  bg-white rounded-card shadow-card hover:shadow-card-lg hover:-translate-y-0.5
                  transition-all text-left p-4 border-l-[5px] border-naranja group
                "
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  {/* Info principal */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className="font-mono text-xs text-gris-dark bg-gris px-2 py-0.5 rounded font-bold">
                        {obra.cod}
                      </span>
                      <Badge variant="activo" label="Activa" />
                      {obra.cc && (
                        <span className="text-[10px] font-bold text-gris-dark bg-gris px-2 py-0.5 rounded uppercase tracking-wide">
                          CC: {obra.cc}
                        </span>
                      )}
                    </div>
                    <h2 className="font-bold text-azul text-lg leading-tight group-hover:text-naranja transition-colors">
                      {obra.nom}
                    </h2>
                    {obra.dir && (
                      <p className="text-sm text-gris-dark mt-0.5 flex items-center gap-1">
                        <span className="text-xs">📍</span> {obra.dir}
                      </p>
                    )}
                    {obra.obs && (
                      <p className="text-xs text-gris-dark mt-1 line-clamp-1 italic">
                        {obra.obs}
                      </p>
                    )}
                  </div>

                  {/* Stats de la obra — para capataz: solo el responsable */}
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    {obra.resp && (
                      <span className="text-xs bg-azul-light text-azul-mid font-semibold px-2.5 py-1 rounded-lg">
                        👷 {obra.resp}
                      </span>
                    )}
                    {!scopeAsignadas && (
                      <>
                        <div className="flex items-center gap-3 text-right">
                          <div>
                            <div className="font-mono text-sm font-bold text-verde">
                              {stats?.hsSemana ? stats.hsSemana.toLocaleString('es-AR') + ' hs' : '0 hs'}
                            </div>
                            <div className="text-[10px] text-gris-dark">Horas esta semana</div>
                          </div>
                          <div>
                            <div className="font-mono text-sm font-bold text-naranja">
                              {stats?.trabajadoresSemana ?? 0}
                            </div>
                            <div className="text-[10px] text-gris-dark">Trab. esta semana</div>
                          </div>
                        </div>
                        <div className="text-[10px] text-gris-dark font-mono">
                          Última actividad: {fmtFecha(stats?.ultimaActividad ?? null)}
                        </div>
                        {(obra.created_by || stats?.ultimaCargaPor) && (
                          <div className="flex items-center gap-2 flex-wrap justify-end">
                            {obra.created_by && (
                              <span className="text-[9px] text-gris-dark" title="Creador de la obra">
                                ✦ <span className="font-bold text-azul">{perfiles.get(obra.created_by) ?? '…'}</span>
                              </span>
                            )}
                            {stats?.ultimaCargaPor && stats.ultimaCargaPor !== obra.created_by && (
                              <span className="text-[9px] text-gris-dark" title="Última carga de horas">
                                ✎ <span className="font-bold text-naranja">{perfiles.get(stats.ultimaCargaPor) ?? '…'}</span>
                              </span>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      <ModalNuevaObra
        open={modalObra}
        onClose={() => setModalObra(false)}
      />

      <ModalExcelObras
        open={modalExcelObras}
        onClose={() => setModalExcelObras(false)}
        obras={obras}
        personal={todoPersonal}
        categorias={categorias}
        tarifas={todasTarifas}
        cierres={todosCierres}
        certificaciones={todasCerts}
        contratistas={contratistas}
      />

      <ModalRecibos
        open={modalRecibos}
        onClose={() => setModalRecibos(false)}
        obras={obras}
        personal={todoPersonal}
        categorias={categorias}
        tarifas={todasTarifas}
        cierres={todosCierres}
        certificaciones={todasCerts}
        contratistas={contratistas}
      />
    </div>
  )
}