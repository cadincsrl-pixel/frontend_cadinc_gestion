'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import { useBajaCuentaFce, useCrearCuentaFce, useCuentasFce, useEditarCuentaFce } from '../hooks/useClientesFacturacion'
import { cbuValido } from '../utils/facturacion.utils'
import { errorDeCampoFacturacion, mensajeErrorFacturacion } from '../utils/facturacion.errores'
import type { VentasCuentaBancaria } from '@/types/domain.types'
import { Aviso } from './FichaFactura'

/**
 * Cuentas bancarias de CADINC que se informan en la Factura de Crédito
 * MiPyME (CBU = opcional 2101, alias = 2102). Una es la de por defecto; un
 * cliente puede tener la suya (Clientes › Editar). La factura guarda una
 * foto al guardarse: editar una cuenta no cambia lo ya emitido.
 */
export function CuentasFce() {
  const toast = useToast()
  const { puedeEditar } = usePermisos('facturacion')
  const [inactivas, setInactivas] = useState(false)
  const [editando, setEditando] = useState<{ open: boolean; cuenta?: VentasCuentaBancaria }>({ open: false })
  const lista = useCuentasFce(inactivas)
  const baja = useBajaCuentaFce()
  const editar = useEditarCuentaFce()
  const tip = puedeEditar ? undefined : 'No tenés permiso para editar las cuentas'

  async function accion(fn: () => Promise<unknown>, ok: string) {
    try { await fn(); toast(ok, 'ok') } catch (e) { toast(mensajeErrorFacturacion(e), 'err') }
  }

  return (
    <div className="bg-white rounded-card shadow-card p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <div className="text-sm font-bold">Cuentas para FCE</div>
          <div className="text-[11px] text-gris-dark">El CBU y el alias que van en la Factura de Crédito MiPyME.</div>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-gris-dark cursor-pointer select-none">
            <input type="checkbox" className="accent-naranja" checked={inactivas} onChange={e => setInactivas(e.target.checked)} />
            Dadas de baja
          </label>
          <Button size="sm" variant="secondary" disabled={!puedeEditar} title={tip ?? 'Cargar otra cuenta'}
            onClick={() => setEditando({ open: true })}>+ Cuenta</Button>
        </div>
      </div>
      {lista.error && <Aviso tono="rojo">{mensajeErrorFacturacion(lista.error)}</Aviso>}
      <div className="divide-y divide-gris">
        {(lista.data ?? []).map(c => (
          <div key={c.id} className={`py-2 flex items-start justify-between gap-2 flex-wrap ${c.activo ? '' : 'opacity-60'}`}>
            <div className="text-sm">
              <span className="font-semibold">{c.banco}</span>
              {c.es_default && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-naranja-light text-naranja-dark font-bold">por defecto</span>}
              {!c.activo && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-gris text-gris-dark font-bold">dada de baja</span>}
              <div className="text-xs font-mono text-gris-dark">CBU {c.cbu}{c.alias ? ` · Alias ${c.alias}` : ''}</div>
              {c.clientes.length > 0 && (
                <div className="text-[11px] text-gris-dark">La prefieren: {c.clientes.map(x => x.razon_social).join(', ')}</div>
              )}
            </div>
            <div className="flex gap-1 flex-wrap">
              <Button variant="ghost" size="sm" disabled={!puedeEditar} title={tip ?? 'Editar'} onClick={() => setEditando({ open: true, cuenta: c })}>✏️ Editar</Button>
              {!c.es_default && c.activo && (
                <Button variant="ghost" size="sm" disabled={!puedeEditar} title={tip ?? 'Usarla cuando el cliente no tiene una propia'}
                  loading={editar.isPending && editar.variables?.id === c.id}
                  onClick={() => accion(() => editar.mutateAsync({ id: c.id, es_default: true }), `✓ ${c.banco} es la cuenta por defecto`)}>
                  Marcar por defecto
                </Button>
              )}
              <Button variant="ghost" size="sm" disabled={!puedeEditar || c.es_default}
                title={tip ?? (c.es_default ? 'La cuenta por defecto no se da de baja: marcá otra primero' : c.activo ? 'Dar de baja' : 'Reactivar')}
                loading={baja.isPending && baja.variables?.id === c.id}
                onClick={() => accion(() => baja.mutateAsync({ id: c.id, activo: !c.activo }), c.activo ? 'Cuenta dada de baja' : '✓ Cuenta reactivada')}>
                {c.activo ? 'Dar de baja' : 'Reactivar'}
              </Button>
            </div>
          </div>
        ))}
        {lista.data && lista.data.length === 0 && (
          <div className="py-3 text-sm text-gris-dark italic">No hay cuentas cargadas: sin una, no se puede emitir FCE.</div>
        )}
      </div>
      {editando.open && <ModalCuenta cuenta={editando.cuenta} onClose={() => setEditando({ open: false })} />}
    </div>
  )
}

const schema = z.object({
  banco: z.string().refine(v => v.trim().length >= 2, 'Poné el banco'),
  cbu:   z.string().refine(v => cbuValido(v), 'CBU inválido: 22 dígitos con sus verificadores'),
  alias: z.string().refine(v => v.trim() === '' || /^[A-Za-z0-9.-]{6,20}$/.test(v.trim()), 'De 6 a 20: letras, números, punto o guion'),
  obs:   z.string(),
})
type FormData = z.infer<typeof schema>

function ModalCuenta({ cuenta, onClose }: { cuenta?: VentasCuentaBancaria; onClose: () => void }) {
  const toast = useToast()
  const crear = useCrearCuentaFce()
  const editar = useEditarCuentaFce()
  const [errorServer, setErrorServer] = useState<string | null>(null)
  const { register, handleSubmit, setError, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { banco: cuenta?.banco ?? '', cbu: cuenta?.cbu ?? '', alias: cuenta?.alias ?? '', obs: cuenta?.obs ?? '' },
  })
  const guardando = crear.isPending || editar.isPending

  async function guardar(d: FormData) {
    setErrorServer(null)
    const body = { banco: d.banco.trim(), cbu: d.cbu.replace(/\D/g, ''), alias: d.alias.trim(), obs: d.obs.trim() }
    try {
      if (cuenta) await editar.mutateAsync({ id: cuenta.id, ...body })
      else await crear.mutateAsync(body)
      toast(cuenta ? '✓ Cuenta actualizada' : '✓ Cuenta cargada', 'ok')
      onClose()
    } catch (e) {
      const ce = errorDeCampoFacturacion(e)
      if (ce && ['banco', 'cbu', 'alias', 'obs'].includes(ce.campo)) {
        setError(ce.campo as keyof FormData, { message: ce.mensaje })
        return
      }
      setErrorServer(mensajeErrorFacturacion(e))
    }
  }

  return (
    <Modal open onClose={guardando ? () => {} : onClose} width="max-w-lg"
      title={cuenta ? `Editar cuenta ${cuenta.banco}` : 'Nueva cuenta para FCE'}
      footer={
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={guardando}>Cancelar</Button>
          <Button size="sm" loading={guardando} onClick={handleSubmit(guardar)}>{cuenta ? 'Guardar' : 'Cargar cuenta'}</Button>
        </div>
      }>
      <form className="flex flex-col gap-3" onSubmit={e => e.preventDefault()}>
        <Input label="Banco" {...register('banco')} error={errors.banco?.message} placeholder="Banco Galicia" autoFocus />
        <Input label="CBU" {...register('cbu')} error={errors.cbu?.message} inputMode="numeric" placeholder="22 dígitos" />
        <Input label="Alias (opcional)" {...register('alias')} error={errors.alias?.message} placeholder="CADINC.GALICIA" />
        <Input label="Nota (opcional)" {...register('obs')} />
        {cuenta && <Aviso tono="gris">Las facturas ya guardadas conservan el CBU que tenían: el cambio vale para las nuevas.</Aviso>}
        {errorServer && <Aviso tono="rojo">{errorServer}</Aviso>}
      </form>
    </Modal>
  )
}
