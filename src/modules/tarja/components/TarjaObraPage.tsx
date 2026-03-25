'use client'

import { useState } from 'react'
import { useObra } from '@/modules/tarja/hooks/useObras'
import { usePersonalObra } from '@/modules/tarja/hooks/useAsignaciones'
import { useCategorias } from '@/modules/tarja/hooks/useCategorias'
import { useUpsertHorasLote, useLimpiarSemana } from '@/modules/tarja/hooks/useHoras'
import { useTarjaStore } from '@/modules/tarja/store/tarja.store'
import { getSemDays, toISO } from '@/lib/utils/dates'
import { TarjaTable } from './TarjaTable'
import { ModalAgregarTrabajador } from './ModalAgregarTrabajador'
import { Chip } from '@/components/ui/Chip'
import { useToast } from '@/components/ui/Toast'
import { CierresSection } from './CierresSection'
import { ToolbarTarja } from './ToolbarTarja'
import { ModalEditarObra } from './ModalEditarObra'
import { Button } from '@/components/ui/Button'

interface Props {
  obraCod: string
}

export function TarjaObraPage({ obraCod }: Props) {
  const toast = useToast()
  const [modalTrab, setModalTrab] = useState(false)
  const [modalEditarObra, setModalEditarObra] = useState(false)

  const { data: obra, isLoading: loadingObra } = useObra(obraCod)
  const { data: personal = [], isLoading: loadingPersonal } = usePersonalObra(obraCod)
  const { data: categorias = [] } = useCategorias()
  const { semActual } = useTarjaStore()
  const { mutate: upsertLote } = useUpsertHorasLote()
  const { mutate: limpiarSemana } = useLimpiarSemana()

  const days = getSemDays(semActual)
  const desde = toISO(days[0]!)
  const hasta = toISO(days[6]!)

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

  function handleLimpiar(legs: string[]) {
    limpiarSemana(
      { obraCod, desde, hasta },
      {
        onSuccess: () => toast('✓ Semana limpiada', 'ok'),
        onError: () => toast('Error al limpiar', 'err'),
      }
    )
  }

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

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4">

      {/* Header */}
      <div className="bg-white rounded-card shadow-card p-4 flex items-start justify-between flex-wrap gap-3 border-l-[5px] border-naranja">
        <div>
          <h1 className="font-display text-[1.6rem] tracking-wider text-azul leading-none">
            {obra.nom}
          </h1>
          <p className="text-sm text-gris-dark mt-1">
            {[obra.cod, obra.dir, obra.resp].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex gap-2 flex-wrap">
            <Chip value={personal.length} label="Trabajadores" />
            <Chip value="—" label="Hs semana" />
            <Chip value="$—" label="Costo" variant="green" />
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setModalEditarObra(true)}
          >
            ✏️ Editar obra
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <ToolbarTarja
        personal={personal}
        obraCod={obraCod}
        onAgregarTrabajador={() => setModalTrab(true)}
        onAutoFill={handleAutoFill}
        onLimpiar={handleLimpiar}
        onExcel={() => { }}
      />

      {/* Tabla */}
      <TarjaTable
        obraCod={obraCod}
        personal={personal}
        categorias={categorias}
      />

      {/* Modal agregar trabajador */}
      <ModalAgregarTrabajador
        open={modalTrab}
        onClose={() => setModalTrab(false)}
        obraCod={obraCod}
      />

      {/* Cierres */}
      <CierresSection obraCod={obraCod} />

      <ModalEditarObra
        open={modalEditarObra}
        onClose={() => setModalEditarObra(false)}
        obra={obra}
      />


    </div>
  )
}