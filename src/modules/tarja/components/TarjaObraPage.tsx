'use client'

import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useObra } from '@/modules/tarja/hooks/useObras'
import { useObras } from '@/modules/tarja/hooks/useObras'
import { usePersonalSemana } from '@/modules/tarja/hooks/useAsignaciones'
import { useCategorias } from '@/modules/tarja/hooks/useCategorias'
import { useHorasSemana, useUpsertHorasLote, useLimpiarSemana } from '@/modules/tarja/hooks/useHoras'
import { useTarifasObra } from '@/modules/tarja/hooks/useTarifas'
import { useContratistas } from '@/modules/tarja/hooks/useContratistas'
import { useTarjaStore } from '@/modules/tarja/store/tarja.store'
import { getSemDays, toISO } from '@/lib/utils/dates'
import { calcularTotalesSemana, fmtMonto, fmtHs } from '@/lib/utils/costos'
import { exportarCSVTarja } from '@/lib/utils/excel'
import { apiGet } from '@/lib/api/client'
import { WeekNavigator } from './WeekNavigator'
import { TarjaTable } from './TarjaTable'
import { AuditInfo } from '@/components/ui/AuditInfo'
import { ToolbarTarja } from './ToolbarTarja'
import { ModalAgregarTrabajador } from './ModalAgregarTrabajador'
import { ModalEditarObra } from './ModalEditarObra'
import { ModalExcelObras } from './ModalExcelObras'
import { ModalRecibos } from './ModalRecibos'
import { CierresSection } from './CierresSection'
import { TarifasPanel } from './TarifasPanel'
import { ContratistasPanel } from './ContratistasPanel'
import { Chip } from '@/components/ui/Chip'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import type { Hora, Tarifa, Cierre, Certificacion } from '@/types/domain.types'
import { useEffect } from 'react'
import { useUIStore } from '@/store/ui.store'
import { usePermisos } from '@/hooks/usePermisos'
import { useSearchParams } from 'next/navigation'

interface Props {
  obraCod: string
}

export function TarjaObraPage({ obraCod }: Props) {
  const toast = useToast()
  const { puedeEditar } = usePermisos('tarja')
  const [modalTrab, setModalTrab] = useState(false)
  const [modalEditarObra, setModalEditarObra] = useState(false)
  const [modalExcelObras, setModalExcelObras] = useState(false)
  const [modalRecibos, setModalRecibos] = useState(false)

  // ── Datos de la obra ──
  const { data: obra, isLoading: loadingObra } = useObra(obraCod)
  const { data: obras = [] } = useObras()
  const { data: categorias = [] } = useCategorias()
  const { data: tarifas = [] } = useTarifasObra(obraCod)
  const { data: contratistas = [] } = useContratistas()
  const { semActual, setSemActual } = useTarjaStore()
  const searchParams = useSearchParams()

  useEffect(() => {
    const semParam = searchParams.get('sem')
    if (semParam && /^\d{4}-\d{2}-\d{2}$/.test(semParam)) {
      setSemActual(new Date(semParam + 'T12:00:00'))
    }
  }, [searchParams, setSemActual])


  const days = getSemDays(semActual)
  const desde = toISO(days[0]!)
  const hasta = toISO(days[6]!)
  const { data: personal = [] } = usePersonalSemana(obraCod, desde, hasta)

  const { data: horasData = [] } = useHorasSemana(obraCod, desde, hasta)
  const { mutate: upsertLote } = useUpsertHorasLote()
  const { mutate: limpiarSemana } = useLimpiarSemana()

  // ── Datos globales para modales Excel/Recibos ──
  const { data: todasHoras = [] } = useQuery({
    queryKey: ['horas', 'all'],
    queryFn: () => apiGet<Hora[]>('/api/horas/all'),
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

  const setObraActiva = useUIStore(s => s.setObraActiva)
  const setTopbarAccion = useUIStore(s => s.setTopbarAccion)

  useEffect(() => {
    if (obra) setObraActiva({ obraCod: obra.cod, obraNom: obra.nom })
    return () => setObraActiva(null)
  }, [obra, setObraActiva])

  useEffect(() => {
    setTopbarAccion((accion: string) => {
      if (accion === 'excel') setModalExcelObras(true)
      if (accion === 'recibos') setModalRecibos(true)
      if (accion === 'csv') handleCSV()
    })
    return () => setTopbarAccion(null)
  }, [obra, personal, horasData, tarifas])

  // ── Totales semana ──
  const { totalHs, totalCosto } = calcularTotalesSemana(
    horasData, personal, categorias, tarifas, obraCod, days
  )

  const [undoState, setUndoState] = useState<{ count: number; fn: (() => void) | null }>({ count: 0, fn: null })

  const handleUndoStateChange = useCallback((count: number, fn: () => void) => {
    setUndoState({ count, fn })
  }, [])

  // ── Handlers ──
  function handleAutoFill(hs: number, legs: string[]) {
    const horas = legs.flatMap(leg =>
      days.map(d => ({ fecha: toISO(d), leg, horas: hs }))
    )
    upsertLote(
      { obra_cod: obraCod, horas },
      {
        onSuccess: () =>
          toast(`✓ ${hs}hs cargadas para ${legs.length} trabajador${legs.length !== 1 ? 'es' : ''}`, 'ok'),
        onError: () => toast('Error al cargar horas', 'err'),
      }
    )
  }

  function handleLimpiar(_legs: string[]) {
    if (!confirm('¿Limpiar todas las horas de esta semana?')) return
    limpiarSemana(
      { obraCod, desde, hasta },
      {
        onSuccess: () => toast('✓ Semana limpiada', 'ok'),
        onError: () => toast('Error al limpiar', 'err'),
      }
    )
  }

  function handleCSV() {
    if (!obra) return
    if (!personal.length) { toast('No hay trabajadores asignados', 'warn'); return }
    exportarCSVTarja(obraCod, obra.nom, semActual, personal, categorias, horasData, tarifas)
    toast('⬇ CSV exportado', 'ok')
  }

  // ── Loading / Error ──
  if (loadingObra) {
    return (
      <div className="p-8 flex items-center gap-3 text-gris-dark">
        <span className="w-5 h-5 border-2 border-naranja border-t-transparent rounded-full animate-spin" />
        Cargando obra...
      </div>
    )
  }

  if (!obra) {
    return (
      <div className="p-8">
        <div className="bg-rojo-light text-rojo rounded-card p-4 font-semibold">
          No se encontró la obra "{obraCod}"
        </div>
      </div>
    )
  }

  const archivada = !!obra.archivada

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4">

      {/* ── Banner obra archivada ── */}
      {archivada && (
        <div className="bg-gris border border-gris-mid rounded-card px-4 py-2 flex items-center gap-3 text-sm text-gris-dark">
          <span className="text-base">📦</span>
          <span>
            <strong>Obra archivada</strong>
            {obra.fecha_archivo && ` · ${obra.fecha_archivo}`}
            {' — '}solo lectura
          </span>
        </div>
      )}

      {/* ── Header ── */}
      <div className={`bg-white rounded-card shadow-card p-4 flex items-start justify-between flex-wrap gap-3 border-l-[5px] ${archivada ? 'border-gris-mid' : 'border-naranja'}`}>
        <div>
          <h1 className="font-display text-[1.6rem] tracking-wider text-azul leading-none">
            {obra.nom}
          </h1>
          <p className="text-sm text-gris-dark mt-1">
            {[obra.cod, obra.dir, obra.resp].filter(Boolean).join(' · ')}
          </p>
          <AuditInfo
            createdBy={obra.created_by}
            updatedBy={obra.updated_by}
            createdAt={obra.created_at}
            updatedAt={obra.updated_at}
          />
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Chips */}
          <div className="flex gap-2 flex-wrap">
            <Chip value={personal.length} label="Trabajadores" />
            <Chip value={fmtHs(totalHs)} label="Hs semana" />
            <Chip value={totalCosto > 0 ? fmtMonto(totalCosto) : '$0'} label="Costo semana" variant="green" />
            <Chip value={desde} label="Período" variant="orange" />
          </div>
          {/* Acciones — solo en obras activas */}
          {puedeEditar && !archivada && (
            <div className="flex items-center gap-1 flex-wrap">
              <Button variant="ghost" size="sm" onClick={() => setModalEditarObra(true)}>
                ✏️ Editar
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ── Toolbar — solo en obras activas ── */}
      {!archivada && (
        <ToolbarTarja
          personal={personal}
          categorias={categorias}
          horasData={horasData}
          tarifas={tarifas}
          obra={obra}
          obraCod={obraCod}
          onAgregarTrabajador={() => setModalTrab(true)}
          onAutoFill={handleAutoFill}
          onLimpiar={handleLimpiar}
          undoCount={undoState.count}
          onUndo={undoState.fn ?? undefined}
        />
      )}

      {/* ── Tabla de tarja ── */}
      <TarjaTable
        obraCod={obraCod}
        personal={personal}
        categorias={categorias}
        tarifas={tarifas}
        onUndoStateChange={handleUndoStateChange}
        readonly={archivada}
      />

      {/* ── Tarifas ── */}
      <TarifasPanel obraCod={obraCod} readonly={archivada} />

      {/* ── Contratistas ── */}
      <ContratistasPanel obraCod={obraCod} readonly={archivada} />

      {/* ── Cierres — solo en obras activas ── */}
      {!archivada && <CierresSection obraCod={obraCod} />}

      {/* ── Modales ── */}
      <ModalAgregarTrabajador
        open={modalTrab}
        onClose={() => setModalTrab(false)}
        obraCod={obraCod}
        semActual={semActual}
        personalSemana={personal}
      />
      <ModalEditarObra
        open={modalEditarObra}
        onClose={() => setModalEditarObra(false)}
        obra={obra}
      />
      <ModalExcelObras
        open={modalExcelObras}
        onClose={() => setModalExcelObras(false)}
        obras={obras}
        personal={personal}
        categorias={categorias}
        horas={todasHoras}
        tarifas={todasTarifas}
        cierres={todosCierres}
        certificaciones={todasCerts}
        contratistas={contratistas}
        obraActual={obraCod}
      />
      <ModalRecibos
        open={modalRecibos}
        onClose={() => setModalRecibos(false)}
        obras={obras}
        personal={personal}
        categorias={categorias}
        horas={todasHoras}
        tarifas={todasTarifas}
        cierres={todosCierres}
        certificaciones={todasCerts}
        contratistas={contratistas}
        obraActual={obraCod}
        semActual={semActual}
      />

    </div>
  )
}