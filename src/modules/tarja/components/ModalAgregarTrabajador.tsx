'use client'

import { useState } from 'react'
import { Modal }    from '@/components/ui/Modal'
import { Combobox } from '@/components/ui/Combobox'
import { Button }   from '@/components/ui/Button'
import { usePersonal } from '@/modules/tarja/hooks/usePersonal'
import { useAgregarASemana } from '@/modules/tarja/hooks/useAsignaciones'
import { useToast } from '@/components/ui/Toast'
import { getSemLabel } from '@/lib/utils/dates'
import type { Personal } from '@/types/domain.types'

interface Props {
  open: boolean
  onClose: () => void
  obraCod: string
  semActual: Date
  personalSemana: Personal[]
}

export function ModalAgregarTrabajador({ open, onClose, obraCod, semActual, personalSemana }: Props) {
  const toast = useToast()
  const [legSel, setLegSel] = useState('')

  const { data: todoElPersonal = [] } = usePersonal()
  const { mutate: agregar, isPending } = useAgregarASemana()

  // Mostrar los que NO están en esta semana
  const disponibles = todoElPersonal.filter(
    p => !personalSemana.some(po => po.leg === p.leg)
  )

  function handleConfirm() {
    if (!legSel) {
      toast('Seleccioná un trabajador', 'warn')
      return
    }
    agregar(
      { obraCod, leg: legSel, semActual },
      {
        onSuccess: () => {
          toast('✓ Trabajador agregado a esta semana', 'ok')
          setLegSel('')
          onClose()
        },
        onError: (err) => {
          toast(err.message ?? 'Error al agregar', 'err')
        },
      }
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="👷 AGREGAR A ESTA SEMANA"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button variant="primary" loading={isPending} onClick={handleConfirm}>
            ✓ Agregar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="bg-azul-light text-azul text-xs font-bold px-3 py-2 rounded-lg">
          Semana: {getSemLabel(semActual)}
        </div>
        <Combobox
          label="Seleccioná trabajador"
          placeholder="Buscar por nombre o legajo..."
          value={legSel}
          onChange={setLegSel}
          options={disponibles.map(p => ({
            value: p.leg,
            label: p.nom,
            sub: `Leg. ${p.leg}`,
          }))}
        />
        {disponibles.length === 0 && (
          <p className="text-sm text-gris-dark bg-gris rounded-lg p-3">
            Todos los trabajadores ya están en esta semana.
          </p>
        )}
        <p className="text-xs text-gris-dark">
          ¿No está en la lista? Agregalo en Gestión de Personal.
        </p>
      </div>
    </Modal>
  )
}