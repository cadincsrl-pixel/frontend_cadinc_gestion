'use client'

import { useState } from 'react'
import { useForm, useWatch, type FieldPath } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import type { TipoLiquidacion } from '@/types/sueldos.types'
import { useConvenios, useCrearLiquidacion } from '../../hooks/useSueldos'
import { TIPO_LIQ_LABEL, hoyAR, mesAPeriodo } from '../../utils/sueldos.utils'
import { errorDeCampoSueldos, mensajeErrorSueldos } from '../../utils/sueldos.errores'
import { Aviso, Campo, inputCls } from '../Comun'

const TIPOS = ['quincena', 'mensual', 'sac', 'vacaciones', 'final', 'ajuste'] as const

const schema = z.object({
  convenio_id: z.string().min(1, 'Elegí el convenio'),
  tipo:        z.enum(TIPOS),
  mes:         z.string().regex(/^\d{4}-\d{2}$/, 'Elegí el mes'),
  quincena:    z.enum(['', '1', '2']),
  fecha_pago:  z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, 'Fecha inválida'),
  obs:         z.string().max(1000, 'Hasta 1000 caracteres'),
}).superRefine((d, ctx) => {
  if (d.tipo === 'quincena' && !d.quincena) ctx.addIssue({ code: 'custom', path: ['quincena'], message: 'Elegí la 1ª o la 2ª quincena' })
})
type FormData = z.infer<typeof schema>

const AYUDA_TIPO: Record<TipoLiquidacion, string> = {
  quincena:   'Obreros por hora (UOCRA): se liquida cada quincena. «Generar recibos» sugiere las horas de la tarja.',
  mensual:    'Mensualizados (UECARA, Camioneros): sueldo del mes.',
  sac:        'Aguinaldo: 50 % de la mejor remuneración del semestre (se sugiere de los recibos cerrados). Se paga en junio y diciembre.',
  vacaciones: 'Vacaciones anuales: días por antigüedad (14/21/28/35) × valor día. Elegí a quiénes al generar.',
  final:      'Egreso: SAC proporcional + vacaciones no gozadas + lo que se cargue a mano (indemnización). El legajo necesita la fecha de egreso.',
  ajuste:     'Correcciones o pagos sueltos: solo lo que se cargue a mano; corren los aportes y contribuciones.',
}

/** «Nueva liquidación»: convenio, tipo, mes, quincena y fecha de pago. */
export function ModalNuevaLiquidacion({ onClose, onCreada }: { onClose: () => void; onCreada: (id: number) => void }) {
  const toast = useToast()
  const { data: convenios = [] } = useConvenios()
  const crear = useCrearLiquidacion()
  const [errorServer, setErrorServer] = useState<string | null>(null)

  const hoy = hoyAR()
  const dia = Number(hoy.slice(8, 10))
  const { register, control, handleSubmit, setError, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { convenio_id: '', tipo: 'quincena', mes: hoy.slice(0, 7), quincena: dia <= 15 ? '1' : '2', fecha_pago: '', obs: '' },
  })
  const convenioId = useWatch({ control, name: 'convenio_id' })
  const tipo = useWatch({ control, name: 'tipo' })
  const convenio = convenios.find(c => String(c.id) === convenioId)

  // Quincena solo para convenios quincenales; mensual solo para mensuales.
  const tiposPermitidos = TIPOS.filter(t =>
    !convenio ? true : t === 'quincena' ? convenio.periodicidad === 'quincenal' : t === 'mensual' ? convenio.periodicidad === 'mensual' : true)

  function cambiarConvenio(v: string) {
    setValue('convenio_id', v, { shouldValidate: true })
    const c = convenios.find(x => String(x.id) === v)
    if (c) setValue('tipo', c.periodicidad === 'quincenal' ? 'quincena' : 'mensual')
  }

  async function enviar(d: FormData) {
    setErrorServer(null)
    try {
      const l = await crear.mutateAsync({
        convenio_id: Number(d.convenio_id),
        tipo: d.tipo,
        periodo: mesAPeriodo(d.mes),
        quincena: d.tipo === 'quincena' ? (Number(d.quincena) as 1 | 2) : null,
        fecha_pago: d.fecha_pago || null,
        ...(d.obs.trim() ? { obs: d.obs.trim() } : {}),
      })
      toast(`✓ ${l.codigo} creada: ahora generá los recibos`, 'ok')
      onCreada(l.id)
    } catch (e) {
      const ce = errorDeCampoSueldos(e)
      const mapa: Record<string, FieldPath<FormData>> = { periodo: 'mes', quincena: 'quincena', convenio_id: 'convenio_id', tipo: 'tipo', fecha_pago: 'fecha_pago' }
      if (ce && mapa[ce.campo]) setError(mapa[ce.campo]!, { message: ce.mensaje })
      setErrorServer(mensajeErrorSueldos(e))
    }
  }

  return (
    <Modal open onClose={crear.isPending ? () => {} : onClose} title="Nueva liquidación" width="max-w-lg"
      footer={<>
        <Button variant="ghost" size="sm" onClick={onClose} disabled={crear.isPending}>Cancelar</Button>
        <Button size="sm" loading={crear.isPending} onClick={handleSubmit(enviar)}>Crear</Button>
      </>}>
      <div className="flex flex-col gap-3">
        <Campo label="Convenio" error={errors.convenio_id?.message}>
          <select className={inputCls} value={convenioId} onChange={e => cambiarConvenio(e.target.value)}>
            <option value="">— Elegí —</option>
            {convenios.filter(c => c.activo).map(c => (
              <option key={c.id} value={c.id}>{c.nombre} ({c.periodicidad === 'quincenal' ? 'quincenal' : 'mensual'})</option>
            ))}
          </select>
        </Campo>
        <Campo label="Tipo" error={errors.tipo?.message}>
          <select className={inputCls} {...register('tipo')}>
            {tiposPermitidos.map(t => <option key={t} value={t}>{TIPO_LIQ_LABEL[t]}</option>)}
          </select>
        </Campo>
        <p className="text-[11px] text-gris-dark -mt-1">{AYUDA_TIPO[tipo]}</p>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Mes" error={errors.mes?.message}>
            <input type="month" className={inputCls} {...register('mes')} />
          </Campo>
          {tipo === 'quincena' ? (
            <Campo label="Quincena" error={errors.quincena?.message}>
              <select className={inputCls} {...register('quincena')}>
                <option value="">— Elegí —</option>
                <option value="1">1ª (del 1 al 15)</option>
                <option value="2">2ª (del 16 a fin de mes)</option>
              </select>
            </Campo>
          ) : <div />}
          <Campo label="Fecha de pago" hint="opcional" error={errors.fecha_pago?.message}>
            <input type="date" className={inputCls} {...register('fecha_pago')} />
          </Campo>
        </div>
        <Campo label="Observaciones" error={errors.obs?.message}>
          <textarea rows={2} className={inputCls} {...register('obs')} />
        </Campo>
        {errorServer && <Aviso tono="rojo">{errorServer}</Aviso>}
      </div>
    </Modal>
  )
}
