'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { usePersonal } from '@/modules/tarja/hooks/usePersonal'
import { usePersonalObra, useAsignarPersonal } from '@/modules/tarja/hooks/useAsignaciones'
import { useToast } from '@/components/ui/Toast'

interface Props {
  open: boolean
  onClose: () => void
  obraCod: string
}

export function ModalAgregarTrabajador({ open, onClose, obraCod }: Props) {
  const toast = useToast()
  const [legSel, setLegSel] = useState('')

  const { data: todoElPersonal = [] } = usePersonal()
  const { data: personalObra = [] } = usePersonalObra(obraCod)
  const { mutate: asignar, isPending } = useAsignarPersonal()

  // Solo mostrar trabajadores que NO están ya asignados
  const disponibles = todoElPersonal.filter(
    p => !personalObra.some(po => po.leg === p.leg)
  )

  function handleConfirm() {
    if (!legSel) {
      toast('Seleccioná un trabajador', 'warn')
      return
    }
    asignar(
      { obra_cod: obraCod, leg: legSel },
      {
        onSuccess: () => {
          toast('✓ Trabajador asignado', 'ok')
          setLegSel('')
          onClose()
        },
        onError: (err) => {
          toast(err.message ?? 'Error al asignar', 'err')
        },
      }
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="👷 AGREGAR A OBRA"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            loading={isPending}
            onClick={handleConfirm}
          >
            ✓ Asignar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Select
          label="Seleccioná trabajador"
          placeholder="Elegí"
          value={legSel}
          onChange={e => setLegSel(e.target.value)}
          options={disponibles.map(p => ({
            value: p.leg,
            label: `${p.leg} — ${p.nom}`,
          }))}
        />
        {disponibles.length === 0 && (
          <p className="text-sm text-gris-dark bg-gris rounded-lg p-3">
            Todos los trabajadores ya están asignados a esta obra.
          </p>
        )}
        <p className="text-xs text-gris-dark">
          ¿No está en la lista? Agregalo en Gestión de Personal.
        </p>
      </div>
    </Modal>
  )
}