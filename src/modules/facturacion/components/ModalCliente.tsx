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
import { usePermisos } from '@/hooks/usePermisos'
import { useCondicionesIva } from '../hooks/useFacturacion'
import {
  useConsultarPadron, useCrearClienteVenta, useCuentasFce, useEditarClienteVenta, useRefrescarFceCliente,
} from '../hooks/useClientesFacturacion'
import {
  CONDICIONES_IVA, DOC_TIPOS, MONTO_MINIMO_FCE, PROVINCIAS, TOPE_CF_IDENTIFICACION, cuitValido, fmtFecha, fmtM, letraDeCliente,
} from '../utils/facturacion.utils'
import { errorDeCampoFacturacion, mensajeErrorFacturacion } from '../utils/facturacion.errores'
import type { VentasCliente, VentasClienteInput, VentasDocTipo, VentasPadronResultado } from '@/types/domain.types'
import { Aviso } from './FichaFactura'

/**
 * Alta / edición de un cliente de Facturación.
 *
 * El CUIT se valida acá con el dígito verificador para avisar ANTES de mandar;
 * el backend valida igual (400 CUIT_INVALIDO) y rebota duplicados
 * (409 CLIENTE_DUPLICADO). El documento y la condición IVA deciden la letra
 * (`letraDeCliente`): A = CUIT y RI/monotributo; B = exento, consumidor
 * final, etc. con DNI, CUIT o «sin identificar» (99). Un RI o monotributista
 * sin CUIT no admite ninguna y no se deja guardar (400 CLIENTE_SIN_LETRA).
 *
 * «Buscar en ARCA» (fase 7) trae razón social, domicilio, provincia y la
 * condición IVA del padrón (GET /clientes/padron/:cuit, no guarda nada) y los
 * precarga: siguen siendo editables, y cada campo dice «de ARCA» mientras
 * conserve el valor que vino. La condición IVA es una DEDUCCIÓN del backend
 * a partir de los impuestos inscriptos: si es dudosa, se avisa.
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
  cuenta_fce_id:    z.string(),
}).superRefine((d, ctx) => {
  const nro = d.doc_nro.replace(/\D/g, '')
  if (d.doc_tipo === '80' || d.doc_tipo === '86') {
    if (nro.length !== 11) ctx.addIssue({ code: 'custom', path: ['doc_nro'], message: '11 dígitos' })
    else if (!cuitValido(nro)) ctx.addIssue({ code: 'custom', path: ['doc_nro'], message: 'El dígito verificador no da: revisá el número' })
  } else if (d.doc_tipo === '96') {
    if (nro.length < 7 || nro.length > 8) ctx.addIssue({ code: 'custom', path: ['doc_nro'], message: 'DNI de 7 u 8 dígitos' })
  }
  if (d.condicion_iva_id && !letraDeCliente(Number(d.doc_tipo), Number(d.condicion_iva_id))) {
    ctx.addIssue({ code: 'custom', path: ['condicion_iva_id'], message: 'Con esta condición hace falta CUIT (solo puede recibir factura A)' })
  }
})

type FormData = z.infer<typeof schema>

const CAMPOS_CLIENTE = ['razon_social', 'doc_tipo', 'doc_nro', 'condicion_iva_id', 'domicilio', 'provincia', 'email', 'obs', 'cuenta_fce_id']

interface Props {
  cliente?: VentasCliente
  onClose:  () => void
}

export function ModalCliente({ cliente, onClose }: Props) {
  const toast = useToast()
  const condiciones = useCondicionesIva()
  const crear = useCrearClienteVenta()
  const editar = useEditarClienteVenta()
  const cuentas = useCuentasFce()
  const refrescarFce = useRefrescarFceCliente()
  const consultarPadron = useConsultarPadron()
  const { puedeCrear } = usePermisos('facturacion')
  const [errorServer, setErrorServer] = useState<string | null>(null)
  const [padron, setPadron] = useState<VentasPadronResultado | null>(null)
  const [errorPadron, setErrorPadron] = useState<string | null>(null)

  const { register, control, handleSubmit, setError, setValue, getValues, formState: { errors } } = useForm<FormData>({
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
      cuenta_fce_id:    cliente?.cuenta_fce_id ? String(cliente.cuenta_fce_id) : '',
    },
  })

  const docTipo = useWatch({ control, name: 'doc_tipo' })
  const condId  = useWatch({ control, name: 'condicion_iva_id' })
  const provincia = useWatch({ control, name: 'provincia' })
  const docNro    = useWatch({ control, name: 'doc_nro' })
  const razon     = useWatch({ control, name: 'razon_social' })
  const domicilio = useWatch({ control, name: 'domicilio' })

  const cuitParaArca = docNro.replace(/\D/g, '')
  const puedeBuscarArca = (docTipo === '80' || docTipo === '86') && cuitParaArca.length === 11 && cuitValido(cuitParaArca)
  /** ¿El campo conserva lo que trajo ARCA? (si el usuario lo cambia, deja de decirlo). */
  const deArca = {
    razon_social:     !!padron && razon === padron.precarga.razon_social,
    domicilio:        !!padron && !!padron.precarga.domicilio && domicilio === padron.precarga.domicilio,
    provincia:        !!padron && !!padron.precarga.provincia && provincia === padron.precarga.provincia,
    condicion_iva_id: !!padron && condId === String(padron.precarga.condicion_iva_id),
  }

  async function buscarEnArca() {
    setErrorPadron(null)
    try {
      const r = await consultarPadron.mutateAsync(cuitParaArca)
      setPadron(r)
      const opts = { shouldValidate: true, shouldDirty: true }
      if (r.precarga.razon_social) setValue('razon_social', r.precarga.razon_social, opts)
      if (r.precarga.domicilio) setValue('domicilio', r.precarga.domicilio, opts)
      if (r.precarga.provincia) setValue('provincia', r.precarga.provincia, opts)
      // La condición solo si deja al cliente con letra (siempre, con CUIT).
      if (letraDeCliente(Number(getValues('doc_tipo')), r.precarga.condicion_iva_id)) {
        setValue('condicion_iva_id', String(r.precarga.condicion_iva_id), opts)
      }
    } catch (e) {
      setPadron(null)
      setErrorPadron(mensajeErrorFacturacion(e))
    }
  }

  // Todas las condiciones de ARCA (11); la letra de cada una sale de letraDeCliente, igual que en la base.
  const opcionesCond = (condiciones.data ?? Object.entries(CONDICIONES_IVA).map(([id, descripcion]) => ({ id: Number(id), descripcion })))
    .map(c => {
      const l = letraDeCliente(80, c.id)
      return { value: String(c.id), label: `${c.descripcion}${l ? ` — factura ${l}` : ''}` }
    })
  const letra = condId ? letraDeCliente(Number(docTipo), Number(condId)) : null

  /** Atajo: el «Consumidor Final» genérico, sin identificar (doc 99, condición 5). */
  function consumidorFinalGenerico() {
    setValue('doc_tipo', '99', { shouldValidate: true })
    setValue('doc_nro', '', { shouldValidate: true })
    setValue('condicion_iva_id', '5', { shouldValidate: true })
  }

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
      cuenta_fce_id:    d.cuenta_fce_id ? Number(d.cuenta_fce_id) : null,
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
        <Input label={deArca.razon_social ? 'Razón social · de ARCA' : 'Razón social'} {...register('razon_social')} error={errors.razon_social?.message} autoFocus />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Select label="Documento" {...register('doc_tipo')}
            options={DOC_TIPOS.map(d => ({ value: String(d.id), label: d.label }))} />
          <div className="sm:col-span-2">
            <Input label={docTipo === '80' ? 'CUIT' : docTipo === '86' ? 'CUIL' : docTipo === '96' ? 'DNI' : 'Número (opcional)'}
              {...register('doc_nro')} inputMode="numeric" placeholder={docTipo === '80' ? '30-12345678-9' : docTipo === '99' ? 'Va con 0' : ''}
              readOnly={docTipo === '99'}
              error={errors.doc_nro?.message} hint={docTipo === '99' ? 'Consumidor final sin identificar: ARCA lo recibe con documento 0' : 'Con o sin guiones'} />
            {(docTipo === '80' || docTipo === '86') && (
              <Button type="button" variant="secondary" size="sm" className="mt-1.5"
                loading={consultarPadron.isPending} onClick={buscarEnArca}
                disabled={!puedeCrear || !puedeBuscarArca}
                title={!puedeCrear ? 'No tenés permiso para cargar clientes'
                  : !puedeBuscarArca ? 'Cargá un CUIT válido de 11 dígitos'
                  : 'Trae razón social, domicilio, provincia y condición IVA del padrón de ARCA'}>
                Buscar en ARCA
              </Button>
            )}
          </div>
        </div>
        {errorPadron && <Aviso tono="rojo">{errorPadron}</Aviso>}
        {padron && (
          <Aviso tono={padron.padron.condicion_iva_dudosa ? 'amarillo' : 'gris'}>
            <b>Datos de ARCA</b> ({padron.padron.tipo_persona === 'FISICA' ? 'persona física' : padron.padron.tipo_persona === 'JURIDICA' ? 'persona jurídica' : padron.padron.tipo_persona || 'sin tipo'}
            {padron.padron.estado_clave && padron.padron.estado_clave !== 'ACTIVO' ? `, clave ${padron.padron.estado_clave}` : ''}):
            {' '}se precargaron los campos marcados «de ARCA»; podés corregirlos.
            {' '}Condición IVA sugerida: <b>{CONDICIONES_IVA[padron.padron.condicion_iva_id] ?? padron.padron.condicion_iva_id}</b> — {padron.padron.condicion_iva_motivo}
            {padron.padron.condicion_iva_dudosa && <> <b>Revisala antes de guardar.</b></>}
            {!padron.precarga.domicilio && <> ARCA no trajo domicilio fiscal.</>}
            {padron.padron.actividades[0] && <span className="block mt-1">Actividad principal: {padron.padron.actividades[0].descripcion}</span>}
          </Aviso>
        )}
        {!padron && cliente?.padron_consultado_at && (
          <span className="text-[11px] text-gris-dark -mt-1">Domicilio traído del padrón de ARCA el {fmtFecha(cliente.padron_consultado_at)}.</span>
        )}
        <Select label={deArca.condicion_iva_id ? 'Condición frente al IVA · sugerida por ARCA' : 'Condición frente al IVA'} {...register('condicion_iva_id')} options={opcionesCond}
          error={errors.condicion_iva_id?.message} />
        {!cliente && docTipo !== '99' && (
          <button type="button" onClick={consumidorFinalGenerico} className="self-start text-[11px] text-azul hover:underline">
            Cargar como «Consumidor Final» sin identificar
          </button>
        )}
        {letra && (
          <Aviso tono="gris">
            A este cliente le corresponde <b>factura {letra}</b>
            {letra === 'B' && docTipo === '99' && <> — sin identificar sirve hasta {fmtM(TOPE_CF_IDENTIFICACION - 0.01)}: desde {fmtM(TOPE_CF_IDENTIFICACION)} ARCA exige DNI o CUIT (RG 5700)</>}.
          </Aviso>
        )}
        {condId && !letra && (
          <Aviso tono="rojo">
            Un Responsable Inscripto o Monotributista solo puede recibir factura A, y la A exige CUIT. Cargale el CUIT o corregí la condición IVA.
          </Aviso>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <Input label={deArca.domicilio ? 'Domicilio · de ARCA' : 'Domicilio'} {...register('domicilio')} placeholder="Calle, número, localidad" />
          </div>
          <Select label={deArca.provincia ? 'Provincia · de ARCA' : 'Provincia'} {...register('provincia')} options={provincias} />
        </div>
        <Input label="Email" type="email" {...register('email')} error={errors.email?.message} />
        {letra === 'A' && (
          <div className="border border-gris-mid rounded-lg p-3 flex flex-col gap-2">
            <span className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">Factura de Crédito MiPyME (FCE)</span>
            <Select label="Cuenta de CADINC que va en su FCE" {...register('cuenta_fce_id')}
              options={[
                { value: '', label: `La de por defecto${(cuentas.data ?? []).find(c => c.es_default) ? ` (${(cuentas.data ?? []).find(c => c.es_default)!.banco})` : ''}` },
                ...(cuentas.data ?? []).map(c => ({ value: String(c.id), label: `${c.banco} · ${c.cbu}${c.alias ? ` · ${c.alias}` : ''}` })),
              ]}
              error={errors.cuenta_fce_id?.message} />
            <span className="text-[11px] text-gris-dark -mt-1">Algunos clientes piden cobrar en su banco (Banco Macro pide la cuenta de Macro).</span>
            {cliente && (
              <div className="flex items-center gap-2 flex-wrap text-[11px] text-gris-dark">
                <span>
                  {cliente.fce_obligado === true && <>Según ARCA está <b>obligado</b> a recibir FCE desde {fmtM(cliente.fce_monto_desde ?? MONTO_MINIMO_FCE)}.</>}
                  {cliente.fce_obligado === false && <>Según ARCA <b>no</b> está obligado a recibir FCE.</>}
                  {cliente.fce_obligado == null && <>Todavía no se le preguntó a ARCA si recibe FCE.</>}
                  {cliente.fce_consultado_at && <> Consultado el {fmtFecha(cliente.fce_consultado_at)}.</>}
                </span>
                <Button type="button" variant="ghost" size="sm" loading={refrescarFce.isPending}
                  onClick={async () => {
                    try {
                      const r = await refrescarFce.mutateAsync(cliente.id)
                      toast(r.error ? `ARCA no respondió: ${r.error.slice(0, 120)}` : r.obligado ? `✓ Obligado desde ${fmtM(r.monto_desde ?? MONTO_MINIMO_FCE)}` : '✓ No está obligado a recibir FCE', r.error ? 'err' : 'ok')
                    } catch (e) { toast(mensajeErrorFacturacion(e), 'err') }
                  }}>
                  Consultar a ARCA
                </Button>
              </div>
            )}
          </div>
        )}
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
