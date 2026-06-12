'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import { toISO } from '@/lib/utils/dates'
import {
  useCuentaCorrienteAridos, useCobrosAridos, useCreateCobroArido, useDeleteCobroArido,
  useCuentaCorrienteCanteras, usePagosCantera, useCreatePagoCantera, useDeletePagoCantera,
} from '../hooks/useAridos'
import type { CuentaCorrienteArido, CobroArido, CuentaCorrienteCantera, PagoCantera } from '../types'

interface CobroForm {
  fecha: string
  monto: string
  medio: 'efectivo' | 'transferencia' | 'cheque' | 'otro'
  obs:   string
}

const MEDIO_LABEL: Record<string, string> = {
  efectivo: 'Efectivo', transferencia: 'Transferencia', cheque: 'Cheque', otro: 'Otro',
}

function fmtDate(s: string) {
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

function fmtM(n: number) {
  return '$' + n.toLocaleString('es-AR', { maximumFractionDigits: 0 })
}

export function CuentaCorrienteTab() {
  // Toggle: cuentas con CLIENTES (nos deben) vs con CANTERAS (les debemos)
  const [vista, setVista] = useState<'clientes' | 'canteras'>('clientes')

  return (
    <>
      <div className="flex gap-2 bg-white rounded-card shadow-card p-1.5 w-fit">
        {([['clientes', '🧑‍💼 Clientes (nos deben)'], ['canteras', '⛰ Canteras (les debemos)']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setVista(key)}
            className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${vista === key ? 'bg-azul text-white shadow-sm' : 'text-gris-dark hover:bg-gris'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {vista === 'clientes' ? <CtaCteClientes /> : <CtaCteCanteras />}
    </>
  )
}

function CtaCteClientes() {
  const { puedeCrear } = usePermisos('aridos')
  const { data: cuentas = [], isLoading } = useCuentaCorrienteAridos()

  const [expandido, setExpandido]   = useState<number | null>(null)
  const [cobroDe, setCobroDe]       = useState<CuentaCorrienteArido | null>(null)
  const [soloConSaldo, setSoloConSaldo] = useState(true)

  const filas = cuentas.filter(c =>
    !soloConSaldo || c.vendido !== 0 || c.cobrado !== 0
  )
  const totalSaldo = filas.reduce((s, c) => s + c.saldo, 0)

  if (isLoading) {
    return <div className="bg-white rounded-card shadow-card p-8 text-center text-gris-dark text-sm">Cargando cuenta corriente...</div>
  }

  return (
    <>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <label className="flex items-center gap-2 text-xs text-gris-dark cursor-pointer">
          <input type="checkbox" checked={soloConSaldo} onChange={e => setSoloConSaldo(e.target.checked)} className="accent-azul" />
          Solo clientes con movimientos
        </label>
        <div className="text-sm font-bold text-carbon">
          Saldo total a cobrar: <span className={`font-mono ${totalSaldo > 0 ? 'text-rojo' : 'text-verde'}`}>{fmtM(totalSaldo)}</span>
        </div>
      </div>

      {filas.length === 0 ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-gris-dark text-sm italic">
          Sin movimientos todavía. Las ventas cargan la cuenta; los cobros la descargan.
        </div>
      ) : (
        <div className="bg-white rounded-card shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[680px]">
              <thead>
                <tr>
                  {['Cliente', 'Vendido', 'Cobrado', 'Saldo', ''].map((h, i) => (
                    <th key={i} className={`bg-azul text-white text-xs font-bold px-4 py-3 uppercase tracking-wide ${i === 0 ? 'text-left' : i === 4 ? '' : 'text-right'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filas.map(c => (
                  <CuentaRow
                    key={c.id}
                    cuenta={c}
                    expandido={expandido === c.id}
                    onToggle={() => setExpandido(expandido === c.id ? null : c.id)}
                    onCobrar={() => setCobroDe(c)}
                    puedeCrear={puedeCrear}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <RegistrarCobroModal cliente={cobroDe} onClose={() => setCobroDe(null)} />
    </>
  )
}

// ─────────────── Cuenta corriente con canteras (proveedores) ───────────────
function CtaCteCanteras() {
  const { puedeCrear } = usePermisos('aridos')
  const { data: cuentas = [], isLoading } = useCuentaCorrienteCanteras()

  const [expandido, setExpandido] = useState<number | null>(null)
  const [pagoDe, setPagoDe] = useState<CuentaCorrienteCantera | null>(null)
  const [soloConMov, setSoloConMov] = useState(true)

  const filas = cuentas.filter(c => !soloConMov || c.retiros > 0 || c.pagado !== 0)
  const totalSaldo = filas.reduce((s, c) => s + c.saldo, 0)
  const totalSinCosto = filas.reduce((s, c) => s + c.retiros_sin_costo, 0)

  if (isLoading) {
    return <div className="bg-white rounded-card shadow-card p-8 text-center text-gris-dark text-sm">Cargando cuenta corriente...</div>
  }

  return (
    <>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <label className="flex items-center gap-2 text-xs text-gris-dark cursor-pointer">
          <input type="checkbox" checked={soloConMov} onChange={e => setSoloConMov(e.target.checked)} className="accent-azul" />
          Solo canteras con movimientos
        </label>
        <div className="text-sm font-bold text-carbon">
          Deuda total con canteras: <span className={`font-mono ${totalSaldo > 0 ? 'text-rojo' : 'text-verde'}`}>{fmtM(totalSaldo)}</span>
        </div>
      </div>

      {totalSinCosto > 0 && (
        <div className="bg-amarillo-light border border-[#7A5500]/30 rounded-card px-3 py-2 text-xs text-[#7A5500] font-semibold">
          ⚠ Hay {totalSinCosto} retiro{totalSinCosto !== 1 ? 's' : ''} sin costo de cantera cargado — la deuda real puede ser mayor. Editá esos movimientos en Ventas/Acopios y completá &quot;Costo cantera&quot;.
        </div>
      )}

      {filas.length === 0 ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-gris-dark text-sm italic">
          Sin retiros de cantera todavía. Cada venta directa de cantera o acopio con &quot;Costo cantera&quot; cargado suma deuda acá.
        </div>
      ) : (
        <div className="bg-white rounded-card shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[720px]">
              <thead>
                <tr>
                  {['Cantera', 'Retiros', 'Retirado ($)', 'Pagado', 'Saldo', ''].map((h, i) => (
                    <th key={i} className={`bg-azul text-white text-xs font-bold px-4 py-3 uppercase tracking-wide ${i === 0 ? 'text-left' : i === 5 ? '' : 'text-right'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filas.map(c => (
                  <CanteraRow
                    key={c.id}
                    cuenta={c}
                    expandido={expandido === c.id}
                    onToggle={() => setExpandido(expandido === c.id ? null : c.id)}
                    onPagar={() => setPagoDe(c)}
                    puedeCrear={puedeCrear}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <RegistrarPagoCanteraModal cantera={pagoDe} onClose={() => setPagoDe(null)} />
    </>
  )
}

function CanteraRow({ cuenta, expandido, onToggle, onPagar, puedeCrear }: {
  cuenta: CuentaCorrienteCantera
  expandido: boolean
  onToggle: () => void
  onPagar: () => void
  puedeCrear: boolean
}) {
  return (
    <>
      <tr className="border-b border-gris last:border-0 hover:bg-gris/40 transition-colors cursor-pointer" onClick={onToggle}>
        <td className="px-4 py-3">
          <span className="font-bold text-sm text-carbon">{expandido ? '▾' : '▸'} {cuenta.nombre}</span>
          {cuenta.retiros_sin_costo > 0 && (
            <span className="text-[10px] font-bold text-[#7A5500] bg-amarillo-light px-1.5 py-0.5 rounded ml-2" title="Retiros sin costo cargado — la deuda puede ser mayor">
              ⚠ {cuenta.retiros_sin_costo} sin costo
            </span>
          )}
        </td>
        <td className="px-4 py-3 text-right font-mono text-sm text-gris-dark">{cuenta.retiros}</td>
        <td className="px-4 py-3 text-right font-mono text-sm text-carbon">{fmtM(cuenta.retirado)}</td>
        <td className="px-4 py-3 text-right font-mono text-sm text-verde">{fmtM(cuenta.pagado)}</td>
        <td className={`px-4 py-3 text-right font-mono font-bold ${cuenta.saldo > 0 ? 'text-rojo' : cuenta.saldo < 0 ? 'text-azul-mid' : 'text-gris-dark'}`}>
          {fmtM(cuenta.saldo)}
        </td>
        <td className="px-4 py-3 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
          <Button variant="primary" size="sm" disabled={!puedeCrear} onClick={onPagar}>💸 Registrar pago</Button>
        </td>
      </tr>
      {expandido && (
        <tr className="border-b border-gris last:border-0 bg-gris/20">
          <td colSpan={6} className="px-6 py-3">
            <PagosDeLaCantera canteraId={cuenta.id} />
          </td>
        </tr>
      )}
    </>
  )
}

function PagosDeLaCantera({ canteraId }: { canteraId: number }) {
  const toast = useToast()
  const { puedeEliminar } = usePermisos('aridos')
  const { data: pagos = [], isLoading } = usePagosCantera(canteraId)
  const { mutate: borrar } = useDeletePagoCantera()

  if (isLoading) return <p className="text-xs text-gris-dark">Cargando pagos...</p>
  if (pagos.length === 0) return <p className="text-xs text-gris-dark italic">Sin pagos registrados a esta cantera.</p>

  return (
    <div className="flex flex-col gap-1">
      <p className="text-[10px] font-bold uppercase tracking-wide text-gris-dark mb-1">Pagos realizados</p>
      {pagos.map((p: PagoCantera) => (
        <div key={p.id} className="flex items-center justify-between text-xs bg-white rounded px-3 py-1.5">
          <span className="text-carbon">
            {fmtDate(p.fecha)} · <b>{MEDIO_LABEL[p.medio] ?? p.medio}</b>
            {p.obs && <span className="text-gris-dark"> · {p.obs}</span>}
          </span>
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-verde">{fmtM(Number(p.monto))}</span>
            {puedeEliminar && (
              <button
                onClick={() => { if (confirm(`¿Eliminar el pago de ${fmtM(Number(p.monto))} del ${fmtDate(p.fecha)}?`)) borrar(p.id, { onSuccess: () => toast('✓ Pago eliminado', 'ok') }) }}
                className="hover:text-rojo text-gris-dark"
              >✕</button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function RegistrarPagoCanteraModal({ cantera, onClose }: { cantera: CuentaCorrienteCantera | null; onClose: () => void }) {
  const toast = useToast()
  const { mutate: crear, isPending } = useCreatePagoCantera()
  const { register, handleSubmit, reset, formState: { errors } } = useForm<CobroForm>({
    defaultValues: { fecha: toISO(new Date()), monto: '', medio: 'transferencia', obs: '' },
  })

  function onSubmit(data: CobroForm) {
    if (!cantera) return
    crear({
      cantera_id: cantera.id,
      fecha:      data.fecha,
      monto:      Number(data.monto),
      medio:      data.medio,
      obs:        data.obs.trim() || undefined,
    }, {
      onSuccess: () => {
        toast('✓ Pago registrado', 'ok')
        reset({ fecha: toISO(new Date()), monto: '', medio: 'transferencia', obs: '' })
        onClose()
      },
      onError: (err: unknown) => {
        const m = (err as { message?: string })?.message
        toast(m || 'Error al registrar el pago', 'err')
      },
    })
  }

  return (
    <Modal
      open={!!cantera}
      onClose={onClose}
      title={`💸 REGISTRAR PAGO — ${cantera?.nombre ?? ''}`}
      width="max-w-md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={isPending} onClick={handleSubmit(onSubmit)}>✓ Registrar</Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {cantera && (
          <div className="bg-gris/30 rounded-card px-3 py-2 text-xs text-gris-dark">
            Saldo actual: <b className={`font-mono ${cantera.saldo > 0 ? 'text-rojo' : 'text-verde'}`}>{fmtM(cantera.saldo)}</b>
            <span className="mx-1">·</span> Retirado {fmtM(cantera.retirado)} · Pagado {fmtM(cantera.pagado)}
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Fecha" type="date" {...register('fecha', { required: true })} />
          <Input label="Monto ($)" type="number" step="0.01" placeholder="0.00" error={errors.monto?.message}
            {...register('monto', { required: 'Requerido', validate: v => Number(v) > 0 || 'Debe ser mayor a 0' })} />
        </div>
        <Select label="Medio de pago" options={[
          { value: 'transferencia', label: 'Transferencia' },
          { value: 'efectivo',      label: 'Efectivo' },
          { value: 'cheque',        label: 'Cheque' },
          { value: 'otro',          label: 'Otro' },
        ]} {...register('medio')} />
        <Input label="Observaciones" placeholder="N° de operación, factura, etc." {...register('obs')} />
      </div>
    </Modal>
  )
}

function CuentaRow({ cuenta, expandido, onToggle, onCobrar, puedeCrear }: {
  cuenta: CuentaCorrienteArido
  expandido: boolean
  onToggle: () => void
  onCobrar: () => void
  puedeCrear: boolean
}) {
  return (
    <>
      <tr className="border-b border-gris last:border-0 hover:bg-gris/40 transition-colors cursor-pointer" onClick={onToggle}>
        <td className="px-4 py-3">
          <span className="font-bold text-sm text-carbon">{expandido ? '▾' : '▸'} {cuenta.nombre}</span>
          {cuenta.cuit && <span className="text-xs text-gris-dark font-mono ml-2">{cuenta.cuit}</span>}
        </td>
        <td className="px-4 py-3 text-right font-mono text-sm text-carbon">{fmtM(cuenta.vendido)}</td>
        <td className="px-4 py-3 text-right font-mono text-sm text-verde">{fmtM(cuenta.cobrado)}</td>
        <td className={`px-4 py-3 text-right font-mono font-bold ${cuenta.saldo > 0 ? 'text-rojo' : cuenta.saldo < 0 ? 'text-azul-mid' : 'text-gris-dark'}`}>
          {fmtM(cuenta.saldo)}
        </td>
        <td className="px-4 py-3 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
          <Button variant="primary" size="sm" disabled={!puedeCrear} onClick={onCobrar}>💰 Registrar cobro</Button>
        </td>
      </tr>
      {expandido && (
        <tr className="border-b border-gris last:border-0 bg-gris/20">
          <td colSpan={5} className="px-6 py-3">
            <CobrosDelCliente clienteId={cuenta.id} />
          </td>
        </tr>
      )}
    </>
  )
}

function CobrosDelCliente({ clienteId }: { clienteId: number }) {
  const toast = useToast()
  const { puedeEliminar } = usePermisos('aridos')
  const { data: cobros = [], isLoading } = useCobrosAridos(clienteId)
  const { mutate: borrar } = useDeleteCobroArido()

  if (isLoading) return <p className="text-xs text-gris-dark">Cargando cobros...</p>
  if (cobros.length === 0) return <p className="text-xs text-gris-dark italic">Sin cobros registrados para este cliente.</p>

  return (
    <div className="flex flex-col gap-1">
      <p className="text-[10px] font-bold uppercase tracking-wide text-gris-dark mb-1">Cobros registrados</p>
      {cobros.map((c: CobroArido) => (
        <div key={c.id} className="flex items-center justify-between text-xs bg-white rounded px-3 py-1.5">
          <span className="text-carbon">
            {fmtDate(c.fecha)} · <b>{MEDIO_LABEL[c.medio] ?? c.medio}</b>
            {c.obs && <span className="text-gris-dark"> · {c.obs}</span>}
          </span>
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-verde">{fmtM(Number(c.monto))}</span>
            {puedeEliminar && (
              <button
                onClick={() => { if (confirm(`¿Eliminar el cobro de ${fmtM(Number(c.monto))} del ${fmtDate(c.fecha)}?`)) borrar(c.id, { onSuccess: () => toast('✓ Cobro eliminado', 'ok') }) }}
                className="hover:text-rojo text-gris-dark"
              >✕</button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function RegistrarCobroModal({ cliente, onClose }: { cliente: CuentaCorrienteArido | null; onClose: () => void }) {
  const toast = useToast()
  const { mutate: crear, isPending } = useCreateCobroArido()
  const { register, handleSubmit, reset, formState: { errors } } = useForm<CobroForm>({
    defaultValues: { fecha: toISO(new Date()), monto: '', medio: 'transferencia', obs: '' },
  })

  function onSubmit(data: CobroForm) {
    if (!cliente) return
    crear({
      cliente_id: cliente.id,
      fecha:      data.fecha,
      monto:      Number(data.monto),
      medio:      data.medio,
      obs:        data.obs.trim() || undefined,
    }, {
      onSuccess: () => {
        toast('✓ Cobro registrado', 'ok')
        reset({ fecha: toISO(new Date()), monto: '', medio: 'transferencia', obs: '' })
        onClose()
      },
      onError: (err: unknown) => {
        const m = (err as { message?: string })?.message
        toast(m || 'Error al registrar el cobro', 'err')
      },
    })
  }

  return (
    <Modal
      open={!!cliente}
      onClose={onClose}
      title={`💰 REGISTRAR COBRO — ${cliente?.nombre ?? ''}`}
      width="max-w-md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={isPending} onClick={handleSubmit(onSubmit)}>✓ Registrar</Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {cliente && (
          <div className="bg-gris/30 rounded-card px-3 py-2 text-xs text-gris-dark">
            Saldo actual: <b className={`font-mono ${cliente.saldo > 0 ? 'text-rojo' : 'text-verde'}`}>{fmtM(cliente.saldo)}</b>
            <span className="mx-1">·</span> Vendido {fmtM(cliente.vendido)} · Cobrado {fmtM(cliente.cobrado)}
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Fecha" type="date" {...register('fecha', { required: true })} />
          <Input label="Monto ($)" type="number" step="0.01" placeholder="0.00" error={errors.monto?.message}
            {...register('monto', { required: 'Requerido', validate: v => Number(v) > 0 || 'Debe ser mayor a 0' })} />
        </div>
        <Select label="Medio de pago" options={[
          { value: 'transferencia', label: 'Transferencia' },
          { value: 'efectivo',      label: 'Efectivo' },
          { value: 'cheque',        label: 'Cheque' },
          { value: 'otro',          label: 'Otro' },
        ]} {...register('medio')} />
        <Input label="Observaciones" placeholder="N° de operación, banco, etc." {...register('obs')} />
      </div>
    </Modal>
  )
}
