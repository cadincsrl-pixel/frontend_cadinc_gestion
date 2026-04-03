'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useObras } from '@/modules/tarja/hooks/useObras'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { usePerfilesMap } from '@/lib/hooks/usePerfilesMap'
import { ModalNuevaObra } from './ModalNuevaObra'
import { ModalExcelObras } from './ModalExcelObras'
import { ModalRecibos } from './ModalRecibos'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api/client'
import { exportarCSVResumenObras } from '@/lib/utils/excel'
import { useToast } from '@/components/ui/Toast'
import { useUIStore } from '@/store/ui.store'
import { usePermisos } from '@/hooks/usePermisos'
import type { Categoria, Certificacion, Cierre, Contratista, Hora, Personal, Tarifa } from '@/types/domain.types'

export function TarjaResumenPage() {
  const router = useRouter()
  const toast = useToast()
  const { puedeCrear } = usePermisos('tarja')
  const { data: obras = [], isLoading } = useObras()
  const perfiles = usePerfilesMap()
  const [modalObra, setModalObra] = useState(false)
  const [modalExcelObras, setModalExcelObras] = useState(false)
  const [modalRecibos, setModalRecibos] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const setTopbarAccion = useUIStore(s => s.setTopbarAccion)

  // Datos globales para stats — todas las horas históricas
  const { data: todasHoras = [] } = useQuery({
    queryKey: ['horas', 'all'],
    queryFn: () => apiGet<Hora[]>('/api/horas/all'),
  })
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

  // Stats por obra
  const statsMap = useMemo(() => {
    const map: Record<string, { totalHs: number; trabajadores: number; ultimaActividad: string | null }> = {}
    obras.forEach(o => {
      const horasObra = todasHoras.filter(h => h.obra_cod === o.cod)
      const legs = new Set(horasObra.map(h => h.leg))
      const totalHs = horasObra.reduce((s, h) => s + h.horas, 0)
      const ultimaFecha = horasObra.length
        ? horasObra.reduce((max, h) => h.fecha > max ? h.fecha : max, horasObra[0]!.fecha)
        : null
      map[o.cod] = { totalHs, trabajadores: legs.size, ultimaActividad: ultimaFecha }
    })
    return map
  }, [obras, todasHoras])

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

  useEffect(() => {
    setTopbarAccion((accion: string) => {
      if (accion === 'excel') setModalExcelObras(true)
      if (accion === 'recibos') setModalRecibos(true)
      if (accion === 'csv') {
        if (!obrasFiltradas.length) {
          toast('No hay obras para exportar', 'warn')
          return
        }
        exportarCSVResumenObras(obrasFiltradas, todasHoras)
        toast('⬇ CSV exportado', 'ok')
      }
    })

    return () => setTopbarAccion(null)
  }, [obrasFiltradas, setTopbarAccion, toast, todasHoras])

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
          {puedeCrear && (
            <Button variant="primary" size="sm" onClick={() => setModalObra(true)}>
              ＋ Nueva obra
            </Button>
          )}
        </div>

        {/* Barra de búsqueda */}
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gris-dark text-sm">🔍</span>
          <input
            type="text"
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

        {/* Resultado de búsqueda */}
        {busqueda && (
          <p className="text-xs text-gris-dark">
            {obrasFiltradas.length} resultado{obrasFiltradas.length !== 1 ? 's' : ''} para "{busqueda}"
          </p>
        )}
      </div>

      {/* Stats generales */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-card shadow-card p-3 text-center">
          <div className="font-mono text-2xl font-bold text-azul">{obras.length}</div>
          <div className="text-[11px] text-gris-dark font-bold uppercase tracking-wide">Obras activas</div>
        </div>
        <div className="bg-white rounded-card shadow-card p-3 text-center">
          <div className="font-mono text-2xl font-bold text-naranja">
            {new Set(todasHoras.map(h => h.leg)).size}
          </div>
          <div className="text-[11px] text-gris-dark font-bold uppercase tracking-wide">Trabajadores</div>
        </div>
        <div className="bg-white rounded-card shadow-card p-3 text-center">
          <div className="font-mono text-2xl font-bold text-verde">
            {todasHoras.reduce((s, h) => s + h.horas, 0).toLocaleString('es-AR')}
          </div>
          <div className="text-[11px] text-gris-dark font-bold uppercase tracking-wide">Horas totales</div>
        </div>
        <div className="bg-white rounded-card shadow-card p-3 text-center">
          <div className="font-mono text-2xl font-bold text-[#7A5500]">{todoPersonal.length}</div>
          <div className="text-[11px] text-gris-dark font-bold uppercase tracking-wide">Personal total</div>
        </div>
      </div>

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
          {obrasFiltradas.map(obra => {
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

                  {/* Stats de la obra */}
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    {obra.resp && (
                      <span className="text-xs bg-azul-light text-azul-mid font-semibold px-2.5 py-1 rounded-lg">
                        👷 {obra.resp}
                      </span>
                    )}
                    <div className="flex items-center gap-3 text-right">
                      <div>
                        <div className="font-mono text-sm font-bold text-verde">
                          {stats?.totalHs ? stats.totalHs.toLocaleString('es-AR') + ' hs' : '0 hs'}
                        </div>
                        <div className="text-[10px] text-gris-dark">Horas totales</div>
                      </div>
                      <div>
                        <div className="font-mono text-sm font-bold text-naranja">
                          {stats?.trabajadores ?? 0}
                        </div>
                        <div className="text-[10px] text-gris-dark">Trabajadores</div>
                      </div>
                    </div>
                    <div className="text-[10px] text-gris-dark font-mono">
                      Última actividad: {fmtFecha(stats?.ultimaActividad ?? null)}
                    </div>
                    {(obra.created_by || obra.updated_by) && (
                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        {obra.created_by && (
                          <span className="text-[9px] text-gris-dark">
                            ✦ <span className="font-bold text-azul">{perfiles.get(obra.created_by) ?? '…'}</span>
                          </span>
                        )}
                        {obra.updated_by && obra.updated_by !== obra.created_by && (
                          <span className="text-[9px] text-gris-dark">
                            ✎ <span className="font-bold text-naranja">{perfiles.get(obra.updated_by) ?? '…'}</span>
                          </span>
                        )}
                      </div>
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
        horas={todasHoras}
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
        horas={todasHoras}
        tarifas={todasTarifas}
        cierres={todosCierres}
        certificaciones={todasCerts}
        contratistas={contratistas}
      />
    </div>
  )
}