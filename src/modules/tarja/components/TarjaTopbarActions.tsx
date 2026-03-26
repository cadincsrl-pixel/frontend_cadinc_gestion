'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useObras } from '@/modules/tarja/hooks/useObras'
import { usePersonal } from '@/modules/tarja/hooks/usePersonal'
import { useCategorias } from '@/modules/tarja/hooks/useCategorias'
import { useContratistas } from '@/modules/tarja/hooks/useContratistas'
import { apiGet } from '@/lib/api/client'
import { exportarCSVResumenObras } from '@/lib/utils/excel'
import { useToast } from '@/components/ui/Toast'
import { useUIStore } from '@/store/ui.store'
import type { Certificacion, Cierre, Contratista, Obra, Tarifa, Hora } from '@/types/domain.types'
import { ModalExcelObras } from './ModalExcelObras'
import { ModalRecibos } from './ModalRecibos'

interface TarjaTopbarActionsProps {
  obrasOverride?: Obra[]
}

export function TarjaTopbarActions({ obrasOverride }: TarjaTopbarActionsProps) {
  const toast = useToast()
  const setTopbarAccion = useUIStore(s => s.setTopbarAccion)
  const [modalExcelObras, setModalExcelObras] = useState(false)
  const [modalRecibos, setModalRecibos] = useState(false)

  const { data: obrasData = [] } = useObras()
  const { data: personal = [] } = usePersonal()
  const { data: categorias = [] } = useCategorias()
  const { data: contratistas = [] } = useContratistas()

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

  const obras = obrasOverride ?? obrasData

  useEffect(() => {
    setTopbarAccion((accion: string) => {
      if (accion === 'excel') setModalExcelObras(true)
      if (accion === 'recibos') setModalRecibos(true)
      if (accion === 'csv') {
        if (!obras.length) {
          toast('No hay obras para exportar', 'warn')
          return
        }
        exportarCSVResumenObras(obras, todasHoras)
        toast('⬇ CSV exportado', 'ok')
      }
    })

    return () => setTopbarAccion(null)
  }, [obras, setTopbarAccion, toast, todasHoras])

  return (
    <>
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
        contratistas={contratistas as Contratista[]}
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
        contratistas={contratistas as Contratista[]}
      />
    </>
  )
}