'use client'

import { useState } from 'react'
import { useForm, useWatch, type FieldPath } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import { useCondicionesIva } from '../hooks/useFacturacion'
import { useCrearClienteVenta, useEditarClienteVenta } from '../hooks/useClientesFacturacion'
import { CONDICIONES_IVA, DOC_TIPOS, PROVINCIAS, admiteFacturaA, cuitValido } from '../utils/facturacion.utils'
import { errorDeCampoFacturacion, mensajeErrorFacturacion } from '../utils/facturacion.errores'
import type { VentasCliente, VentasClienteInput, VentasDocTipo } from '@/types/domain.types'
import { Aviso } from './FichaFactura'

/**
 * Alta / edición de un cliente de Facturación.
 *
 * El CUIT se valida acá con el dígito verificador para avisar ANTES de mandar;
 * el backend valida igual (400 CUIT_INVALIDO) y rebota duplicados
 * (409 CLIENTE_DUPLICADO). La condición IVA decide la letra: si no admite A,
 * se avisa, porque en fase 1 solo se emite A.
 */

const schema = z.object({
  razon_social:     z.string().refine(v => v.trim().length >= 2, 'Poné la razón social'),
  doc_tipo:         z.enum(['80', '86', '96', '99']),
  doc_nro:          z.string(),
  condicion_iva_id: z.string().min(1, 'Elegí la condición IVA'),
  domicilio:        z.string(),
  provincia:        z.string(),
  email:            z.string().refine(v => v.trim() === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()), 'Email inválido'),
  obs:              z.string(),
}).superRefine((d, ctx) => {
  const nro = d.doc_nro.replace(/\D/g, '')
  if (d.doc_tipo === '80' || d.doc_tipo === '86') {
    if (nro.length !== 11) ctx.addIssue({ code: 'custom', path: ['doc_nro'], message: '11 dígitos' })
    else if (!cuitValido(nro)) ctx.addIssue({ code: 'custom', path: ['doc_nro'], message: 'El dígito verificador no da: revisá el número' })
  } else if (d.doc_tipo === '96') {
    if (nro.length < 7 || nro.length > 8) ctx.addIssue({ code: 'custom', path: ['doc_nro'], message: 'DNI de 7 u 8 dígitos' })
  }
})

type FormData = z.infer<typeof schema>

const CAMPOS_CLIENTE = ['razon_social', 'doc_tipo', 'doc_nro', 'condicion_iva_id', 'domicilio', 'provincia', 'email', 'obs']

interface Props {
  cliente?: VentasCliente
  onClose:  () => void
}

export function ModalCliente({ cliente, onClose }: Props) {
  const toast = useToast()
  const condiciones = useCondicionesIva()
  const crear = useCrearClienteVenta()
  const editar = useEditarClienteVenta()
  const [errorServer, setErrorServer] = useState<string | null>(null)

  const { register, control, handleSubmit, setError, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      razon_social:     cliente?.razon_social ?? '',
      doc_tipo:         String(cliente?.doc_tipo ?? 80) as FormData['doc_tipo'],
      doc_nro:          cliente?.doc_nro ?? '',
      condicion_iva_id: cliente ? String(cliente.condicion_iva_id) : '1',
      domicilio:        cliente?.domicilio ?? '',
      provincia:        cliente?.provincia ?? '',
      email:            cliente?.email ?? '',
      obs:              cliente?.obs ?? '',
    },
  })

  const docTipo = useWatch({ control, name: 'doc_tipo' })
  const condId  = useWatch({ control, name: 'condicion_iva_id' })
  const provincia = useWatch({ control, name: 'provincia' })

  const opcionesCond = (condiciones.data ?? Object.entries(CONDICIONES_IVA).map(([id, descripcion]) => ({ id: Number(id), descripcion, admite_a: false })))
    .map(c => ({ value: String(c.id), label: c.descripcion }))
  const condSel = condiciones.data?.find(c => String(c.id) === condId)
  const admiteA = docTipo === '80' && (condSel ? condSel.admite_a : admiteFacturaA(80, Number(condId)))

  const guardando = crear.isPending || editar.isPending

  async function guardar(d: FormData) {
    setErrorServer(null)
    const body: VentasClienteInput = {
      razon_social:     d.razon_social.trim(),
      doc_tipo:         Number(d.doc_tipo) as VentasDocTipo,
      doc_nro:          d.doc_tipo === '99' ? (d.doc_nro.replace(/\D/g, '') || '0') : d.doc_nro.replace(/\D/g, ''),
      condicion_iva_id: Number(d.condicion_iva_id),
      domicilio:        d.domicilio.trim(),
      provincia:        d.provincia.trim(),
      email:            d.email.trim(),
      obs:              d.obs.trim(),
    }
    try {
      if (cliente) await editar.mutateAsync({ id: cliente.id, ...body })
      else await crear.mutateAsync(body)
      toast(cliente ? '✓ Cliente actualizado' : '✓ Cliente creado', 'ok')
      onClose()
    } catch (e) {
      const ce = errorDeCampoFacturacion(e)
      if (ce && CAMPOS_CLIENTE.includes(ce.campo)) {
        setError(ce.campo as FieldPath<FormData>, { message: ce.mensaje })
        return
      }
      setErrorServer(mensajeErrorFacturacion(e))
    }
  }

  const provincias = [{ value: '', label: '—' }, ...(provincia && !PROVINCIAS.includes(provincia) ? [provincia] : []).map(p => ({ value: p, label: p })),
    ...PROVINCIAS.map(p => ({ value: p, label: p }))]

  return (
    <Modal
      open
      onClose={guardando ? () => {} : onClose}
      width="max-w-2xl"
      title={cliente ? `Editar ${cliente.razon_social}` : 'Nuevo cliente'}
      footer={
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={guardando}>Cancelar</Button>
          <Button size="sm" loading={guardando} onClick={handleSubmit(guardar)}>{cliente ? 'Guardar' : 'Crear cliente'}</Button>
        </div>
      }
    >
      <form className="flex flex-col gap-3" onSubmit={e => e.preventDefault()}>
        <Input label="Razón social" {...register('razon_social')} error={errors.razon_social?.message} autoFocus />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Select label="Documento" {...register('doc_tipo')}
            options={DOC_TIPOS.map(d => ({ value: String(d.id), label: d.label }))} />
          <div className="sm:col-span-2">
            <Input label={docTipo === '80' ? 'CUIT' : docTipo === '86' ? 'CUIL' : docTipo === '96' ? 'DNI' : 'Número (opcional)'}
              {...register('doc_nro')} inputMode="numeric" placeholder={docTipo === '80' ? '30-12345678-9' : ''}
              error={errors.doc_nro?.message} hint="Con o sin guiones" />
          </div>
        </div>
        <Select label="Condición frente al IVA" {...register('condicion_iva_id')} options={opcionesCond}
          error={errors.condicion_iva_id?.message} />
        {!admiteA && (
          <Aviso tono="amarillo">
            Con {docTipo !== '80' ? 'este documento' : 'esta condición IVA'} no se le puede hacer factura A, que es lo único que se emite por ahora.
            La A es para Responsable Inscripto o Monotributo, con CUIT.
          </Aviso>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <Input label="Domicilio" {...register('domicilio')} placeholder="Calle, número, localidad" />
          </div>
          <Select label="Provincia" {...register('provincia')} options={provincias} />
        </div>
        <Input label="Email" type="email" {...register('email')} error={errors.email?.message} />
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">Observaciones</label>
          <textarea {...register('obs')} rows={2}
            className="w-full px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm bg-white outline-none focus:border-naranja" />
        </div>
        {errorServer && <Aviso tono="rojo">{errorServer}</Aviso>}
      </form>
    </Modal>
  )
}
