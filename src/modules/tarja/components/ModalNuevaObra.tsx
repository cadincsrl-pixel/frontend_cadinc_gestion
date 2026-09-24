'use client'

import { useState, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Combobox } from '@/components/ui/Combobox'
import { Button } from '@/components/ui/Button'
import { useCreateObra, useResponsablesDisponibles, useProximoCodigoObra } from '@/modules/tarja/hooks/useObras'
import { TIPOS_CONTRATACION, banderasDelTipo } from '../utils/tipoContratacion'
import { useToast } from '@/components/ui/Toast'

// Schema sin `cod` — el backend lo autogenera (CC-NNN, atómico vía
// sequence). El admin ya no puede tipearlo a mano: evita typos,
// duplicados y mantiene consistencia (la PK es FK en muchas tablas).
const schema = z.object({
  nom:  z.string().min(1, 'El nombre es requerido'),
  cc:   z.string().optional(),
  dir:  z.string().optional(),
  resp: z.string().optional(),
  obs:  z.string().optional(),
  // El tipo de contratación (14/09). Se guarda en las dos banderas de siempre;
  // ver src/modules/tarja/utils/tipoContratacion.ts.
  tipo_contratacion: z.enum(['presupuesto', 'administracion', 'llave_en_mano']),
})

type FormData = z.infer<typeof schema>


interface Props {
  open: boolean
  onClose: () => void
}

export function ModalNuevaObra({ open, onClose }: Props) {
  const toast = useToast()
  const { mutate: createObra, isPending } = useCreateObra()
  const { data: responsables } = useResponsablesDisponibles(open)
  // Solo trae el preview cuando el modal está abierto. Si entre el
  // preview y el submit alguien creó una obra, el cod final puede
  // ser distinto — el backend recalcula con la sequence atómica.
  const { data: proxCod } = useProximoCodigoObra(open)

  const [capatazUserId,  setCapatazUserId]  = useState<string>('')
  const [jefeObraUserId, setJefeObraUserId] = useState<string>('')

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { tipo_contratacion: 'presupuesto' },
  })

  const opcionesCapataz = useMemo(() => [
    { value: '', label: '— sin capataz asignado —' },
    ...(responsables?.capataces ?? []).map(u => ({ value: u.id, label: u.nombre })),
  ], [responsables])
  const opcionesJefe = useMemo(() => [
    { value: '', label: '— sin jefe de obra asignado —' },
    ...(responsables?.jefes_obra ?? []).map(u => ({ value: u.id, label: u.nombre })),
  ], [responsables])

  function onSubmit(data: FormData) {
    // El tipo elegido se traduce a las dos banderas de siempre. La obra nunca
    // guarda un "tipo": se deriva de ellas, asi que no hay dos verdades.
    const { tipo_contratacion, ...resto } = data
    createObra(
      {
        ...resto,
        ...banderasDelTipo(tipo_contratacion),
        capataz_user_id:   capatazUserId  || null,
        jefe_obra_user_id: jefeObraUserId || null,
      },
      {
        onSuccess: () => {
          toast('✓ Obra creada correctamente', 'ok')
          reset()
          setCapatazUserId('')
          setJefeObraUserId('')
          onClose()
        },
        onError: (err) => {
          toast(err.message ?? 'Error al crear la obra', 'err')
        },
      },
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="🏗 NUEVA OBRA"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            loading={isPending}
            onClick={handleSubmit(onSubmit)}
          >
            ✓ Agregar obra
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Código autogenerado — solo lectura. La PK es FK en muchas
            tablas, así que dejarla editable abría puerta a typos y
            duplicados. El sufijo numérico viene de la sequence
            obras_cod_seq, atómica vs concurrencia. */}
        <div className="bg-azul-light border border-azul/20 rounded-lg px-3 py-2 flex items-center gap-3">
          <div className="flex-1">
            <div className="text-[10px] font-bold text-azul-mid uppercase tracking-wider">
              Próximo código
            </div>
            <div className="font-mono font-bold text-azul text-sm">
              {proxCod?.cod ?? 'CC-???'}
            </div>
          </div>
          <span className="text-[11px] text-gris-dark italic">
            (autogenerado)
          </span>
        </div>

        {/* Sin «Centro de costo» (2026-09-23): cada obra ES su centro de costo,
            y el cliente se asigna desde Facturación › Clientes. */}
        <Input
          label="Nombre de la obra"
          placeholder="Nombre de la obra"
          error={errors.nom?.message}
          {...register('nom')}
        />

        <div className="grid grid-cols-2 gap-3">
          <Combobox
            label="Capataz (usuario del sistema)"
            placeholder="Buscar capataz..."
            options={opcionesCapataz}
            value={capatazUserId}
            onChange={setCapatazUserId}
          />
          <Combobox
            label="Jefe de obra (usuario del sistema)"
            placeholder="Buscar jefe..."
            options={opcionesJefe}
            value={jefeObraUserId}
            onChange={setJefeObraUserId}
          />
        </div>
        <p className="text-[11px] text-gris-dark -mt-2">
          Al asignar un capataz o jefe de obra con login, ese usuario va a ver
          la obra automáticamente. El jefe también la ve en Pedidos y Stock
          para pedir materiales.
        </p>

        <Input
          label="Responsable (texto libre)"
          placeholder="Para casos sin login"
          error={errors.resp?.message}
          {...register('resp')}
        />
        <Input
          label="Dirección"
          placeholder="Calle y número"
          {...register('dir')}
        />
        <Input
          label="Observaciones"
          placeholder="Notas adicionales"
          {...register('obs')}
        />
        <div>
          <Select
            label="Tipo de contratación"
            options={TIPOS_CONTRATACION}
            {...register('tipo_contratacion')}
          />
          <p className="text-[11px] text-gris-dark mt-1">
            Define qué se le cobra al cliente y qué queda como gasto de CADINC. Si
            elegís <b>por administración</b>, los porcentajes de cada pata se cargan
            después, desde la cuenta corriente de la obra. El EPP es gasto de CADINC
            en los tres casos.
          </p>
        </div>
      </div>
    </Modal>
  )
}