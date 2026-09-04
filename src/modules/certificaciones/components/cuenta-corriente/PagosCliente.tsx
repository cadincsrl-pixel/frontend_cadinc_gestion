'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { InputMonto } from '@/components/ui/InputMonto'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import { toISO } from '@/lib/utils/dates'
import { abrirAdjuntoFirmado } from '@/lib/utils/abrir-adjunto'
import {
  useCobrosCliente, useCrearCobroCliente, useEditarCobroCliente, useEliminarCobroCliente,
  uploadComprobanteCobro, fetchCobroComprobanteUrl,
} from '../../hooks/useCuentaCliente'
import { fetchCuentaRenglonesTodos, useCuentaResumen, CUENTA_CORRIENTE_KEY } from '../../hooks/useCuentaCorriente'
import type { CuentaClienteCobro, MedioCobro } from '@/types/domain.types'
import { fmtM, fmtFecha, totalizar } from './cuentaCorriente.utils'

/**
 * Pagos del cliente de una obra: saldo, lista de pagos y el modal para
 * registrar o editar uno. El saldo sale de la cuenta COMPLETA de la obra
 * (sin los filtros de la pantalla): deuda = a cobrar + cobrado, − Σ pagos.
 *
 * Imputables a un pago = renglones "A cobrar" con precio y con el ítem de la
 * solicitud en estado final (misma whitelist que la RPC).
 */

const ESTADOS_ITEM_FINAL = ['comprado', 'de_deposito', 'retirado', 'enviado']

interface Props {
  obraCod:       string
  obraNom:       string
  puedeCrear:    boolean
  puedeEditar:   boolean
  puedeEliminar: boolean
}

export function PagosCliente({ obraCod, obraNom, puedeCrear, puedeEditar, puedeEliminar }: Props) {
  const toast = useToast()
  const { data: cobros = [] } = useCobrosCliente(obraCod)
  const { data: resumenObra } = useCuentaResumen({ obra_cod: obraCod }, 'obra')
  const { mutate: crearCobro,  isPending: creando }  = useCrearCobroCliente()
  const { mutate: editarCobro, isPending: editando } = useEditarCobroCliente()
  const { mutate: eliminarCobro } = useEliminarCobroCliente()

  const [modal, setModal] = useState(false)
  const [editandoCobro, setEditandoCobro] = useState<CuentaClienteCobro | null>(null)
  const [form, setForm] = useState<{ fecha: string; monto: string; medio: MedioCobro; obs: string }>({ fecha: toISO(new Date()), monto: '', medio: 'efectivo', obs: '' })
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [archivo, setArchivo] = useState<File | null>(null)
  const [subiendo, setSubiendo] = useState(false)

  // Renglones a cobrar de la obra (para tildar al registrar) y los ya
  // cobrados (para contar cuántos cubre cada pago).
  const { data: aCobrar = [] } = useQuery({
    queryKey: [...CUENTA_CORRIENTE_KEY, 'imputables', obraCod],
    queryFn:  () => fetchCuentaRenglonesTodos({ obra_cod: obraCod, estados: ['a_cobrar'] }),
    enabled:  modal && !editandoCobro,
  })
  const { data: cobrados = [] } = useQuery({
    queryKey: [...CUENTA_CORRIENTE_KEY, 'cobrados', obraCod],
    queryFn:  () => fetchCuentaRenglonesTodos({ obra_cod: obraCod, estados: ['cobrado'] }),
    enabled:  cobros.length > 0,
  })
  const imputables = useMemo(
    () => aCobrar.filter(r => Number(r.precio_unit) > 0 && ESTADOS_ITEM_FINAL.includes(r.item_estado)),
    [aCobrar],
  )
  const itemsPorCobro = useMemo(() => {
    const m = new Map<number, number>()
    for (const r of cobrados) if (r.cobro_id != null) m.set(r.cobro_id, (m.get(r.cobro_id) ?? 0) + 1)
    return m
  }, [cobrados])

  const tot = useMemo(() => totalizar(resumenObra?.grupos ?? []), [resumenObra])
  const deuda   = tot.porEstado.a_cobrar.total + tot.porEstado.cobrado.total
  const pagado  = cobros.reduce((s, c) => s + Number(c.monto ?? 0), 0)
  const saldo   = deuda - pagado
  const sinPrecio = tot.porEstado.a_cobrar.sin_precio
  const esLlaveEnMano = deuda === 0 && cobros.length === 0 && tot.porEstado.gasto_cadinc.renglones > 0

  function abrirNuevo() {
    setEditandoCobro(null)
    setForm({ fecha: toISO(new Date()), monto: '', medio: 'efectivo', obs: '' })
    setSel(new Set()); setArchivo(null); setModal(true)
  }
  function abrirEditar(c: CuentaClienteCobro) {
    setEditandoCobro(c)
    setForm({ fecha: c.fecha, monto: String(c.monto), medio: c.medio, obs: c.obs ?? '' })
    setSel(new Set()); setArchivo(null); setModal(true)
  }

  // Tildar autocompleta el monto con la suma (editable después).
  function aplicarSeleccion(next: Set<number>) {
    setSel(next)
    const suma = imputables.filter(r => next.has(r.id)).reduce((s, r) => s + Number(r.precio_total ?? 0), 0)
    if (suma > 0) setForm(f => ({ ...f, monto: String(Math.round(suma * 100) / 100) }))
  }
  function toggleItem(id: number) {
    const next = new Set(sel)
    if (next.has(id)) next.delete(id); else next.add(id)
    aplicarSeleccion(next)
  }

  async function guardar() {
    const monto = Number(form.monto)
    if (!form.fecha) { toast('Elegí la fecha del pago', 'err'); return }
    if (!Number.isFinite(monto) || monto <= 0) { toast('El monto debe ser mayor a 0', 'err'); return }
    const cbs = {
      onSuccess: () => { toast('✓ Pago guardado', 'ok'); setModal(false) },
      onError: (err: unknown) => {
        const code = (err as { body?: { error?: string } })?.body?.error
        if (code === 'MONTO_INSUFICIENTE')         toast('El monto no cubre los items tildados. Subí el monto o destildá items.', 'err')
        else if (code === 'ITEM_INVALIDO')         toast('Algún item ya no es imputable (lo pagó otro cobro, es gasto de CADINC o cambió). Recargá la página.', 'err')
        else if (code === 'COMPROBANTE_DUPLICADO') toast('Ese comprobante ya está cargado en otro pago', 'err')
        else if (code === 'MONTO_MENOR_IMPUTADO')  toast('El monto no puede ser menor a lo imputado a items. Eliminá el pago y registralo de nuevo si hace falta.', 'err')
        else toast('Error al guardar el pago', 'err')
      },
    }
    if (editandoCobro) {
      editarCobro({ id: editandoCobro.id, fecha: form.fecha, monto, medio: form.medio, obs: form.obs || null }, cbs)
      return
    }
    try {
      let comprobante_path: string | null = null
      if (archivo) { setSubiendo(true); comprobante_path = await uploadComprobanteCobro(archivo) }
      crearCobro({
        obra_cod: obraCod, fecha: form.fecha, monto, medio: form.medio, obs: form.obs || null,
        item_ids: [...sel],
        ...(comprobante_path ? { comprobante_path } : {}),
      }, cbs)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error al subir el comprobante', 'err')
    } finally {
      setSubiendo(false)
    }
  }

  function eliminar(c: CuentaClienteCobro) {
    const n = itemsPorCobro.get(c.id) ?? 0
    const extra = n > 0 ? ` Los ${n} item${n !== 1 ? 's' : ''} imputados vuelven a "a cobrar".` : ''
    if (!confirm(`¿Eliminar el pago de ${fmtM(Number(c.monto))} del ${fmtFecha(c.fecha)}?${extra}`)) return
    eliminarCobro(c.id, {
      onSuccess: () => toast('✓ Pago eliminado', 'ok'),
      onError:   () => toast('Error al eliminar', 'err'),
    })
  }

  async function verComprobante(id: number) {
    await abrirAdjuntoFirmado(() => fetchCobroComprobanteUrl(id), () => toast('No se pudo abrir el comprobante', 'err'))
  }

  const guardando = creando || editando || subiendo
  const sumaSel = imputables.filter(r => sel.has(r.id)).reduce((s, r) => s + Number(r.precio_total ?? 0), 0)

  return (
    <div className="bg-white rounded-card shadow-card p-4">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
        <div>
          <h3 className="text-xs font-bold text-gris-dark uppercase tracking-wider">Pagos del cliente</h3>
          {esLlaveEnMano ? (
            <div className="text-[11px] text-gris-dark">Obra llave en mano: no hay nada para cobrarle al cliente.</div>
          ) : (
            <div className="text-sm mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5">
              <span>Deuda <b className="font-mono">{fmtM(deuda)}</b></span>
              <span>Pagado <b className="font-mono text-verde">{fmtM(pagado)}</b></span>
              <span>
                Saldo <b className={`font-mono ${saldo > 0 ? 'text-naranja-dark' : 'text-verde'}`}>{fmtM(saldo)}</b>
                <span className="text-[11px] text-gris-dark ml-1">
                  {sinPrecio > 0 ? `⚠ provisorio, faltan ${sinPrecio} sin precio` : saldo > 0 ? 'pendiente de cobro' : saldo < 0 ? 'a favor del cliente' : 'saldado'}
                </span>
              </span>
            </div>
          )}
        </div>
        {puedeCrear && !esLlaveEnMano && (
          <Button variant="primary" size="sm" onClick={abrirNuevo}>💲 Registrar pago</Button>
        )}
      </div>
      {cobros.length === 0 ? (
        !esLlaveEnMano && <p className="text-xs text-gris-mid italic">Sin pagos registrados para esta obra.</p>
      ) : (
        <div className="divide-y divide-gris">
          {cobros.map(c => {
            const n = itemsPorCobro.get(c.id) ?? 0
            return (
              <div key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                <span className="font-mono text-xs text-gris-dark w-[72px] shrink-0">{fmtFecha(c.fecha)}</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-azul-light text-azul capitalize shrink-0">{c.medio}</span>
                {n > 0
                  ? <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-verde-light text-verde shrink-0" title="Renglones que este pago cubre">{n} item{n !== 1 ? 's' : ''}</span>
                  : <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gris text-gris-dark shrink-0" title="Pago sin items imputados">a cuenta</span>}
                <span className="basis-full order-last sm:basis-auto sm:order-none sm:flex-1 text-gris-dark truncate min-w-0">{c.obs}</span>
                {c.comprobante_url && (
                  <button onClick={() => verComprobante(c.id)} title="Ver comprobante"
                    className="text-sm p-2 min-w-[36px] min-h-[36px] flex items-center justify-center rounded hover:bg-azul-light text-gris-dark hover:text-azul transition-colors shrink-0">📎</button>
                )}
                <span className="font-mono font-bold text-verde shrink-0">{fmtM(Number(c.monto))}</span>
                {puedeEditar && (
                  <button onClick={() => abrirEditar(c)} title="Editar pago"
                    className="text-sm p-2 min-w-[36px] min-h-[36px] flex items-center justify-center rounded hover:bg-gris transition-colors text-gris-dark shrink-0">✏️</button>
                )}
                {puedeEliminar && (
                  <button onClick={() => eliminar(c)} title="Eliminar pago"
                    className="text-sm p-2 min-w-[36px] min-h-[36px] flex items-center justify-center rounded hover:bg-rojo-light text-gris-dark hover:text-rojo transition-colors shrink-0">✕</button>
                )}
              </div>
            )
          })}
        </div>
      )}

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={editandoCobro ? '✏️ EDITAR PAGO' : '💲 REGISTRAR PAGO DEL CLIENTE'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModal(false)}>Cancelar</Button>
            <Button variant="primary" loading={guardando} onClick={guardar}>✓ Guardar</Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="text-xs text-gris-dark">Obra: <span className="font-bold text-carbon">{obraNom}</span></div>

          {!editandoCobro && imputables.length > 0 && (
            <div>
              <div className="text-xs font-bold text-gris-dark uppercase tracking-wider mb-1.5 flex items-center justify-between">
                <span>¿Qué materiales paga? <span className="normal-case font-normal text-gris-mid">(opcional — sin tildar queda a cuenta)</span></span>
                <button type="button" className="text-[11px] text-azul hover:underline font-bold"
                  onClick={() => aplicarSeleccion(sel.size === imputables.length ? new Set() : new Set(imputables.map(r => r.id)))}>
                  {sel.size === imputables.length ? 'Destildar todos' : `Tildar todos (${imputables.length})`}
                </button>
              </div>
              <div className="bg-gris rounded-xl p-2 max-h-48 overflow-y-auto flex flex-col gap-0.5">
                {imputables.map(r => (
                  <label key={r.id} className="flex items-center gap-2 cursor-pointer text-sm py-1 px-1 border-b border-gris-mid last:border-0">
                    <input type="checkbox" checked={sel.has(r.id)} onChange={() => toggleItem(r.id)} className="accent-verde shrink-0" />
                    <span className="flex-1 min-w-0 truncate">
                      <span className="font-mono text-[11px] text-gris-dark">{fmtFecha(r.fecha_resolucion)}</span> · {r.descripcion}
                    </span>
                    <b className="font-mono text-xs shrink-0">{fmtM(Number(r.precio_total ?? 0))}</b>
                  </label>
                ))}
              </div>
              {sel.size > 0 && (
                <div className="text-[11px] text-gris-dark mt-1 text-right">{sel.size} item{sel.size !== 1 ? 's' : ''} · suma {fmtM(sumaSel)}</div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Fecha" type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
            <InputMonto label="Monto ($)" placeholder="0" value={form.monto} onChange={raw => setForm(f => ({ ...f, monto: raw }))} />
          </div>
          <Select
            label="Medio de pago" value={form.medio}
            onChange={e => setForm(f => ({ ...f, medio: e.target.value as MedioCobro }))}
            options={[
              { value: 'efectivo', label: 'Efectivo' }, { value: 'transferencia', label: 'Transferencia' },
              { value: 'cheque', label: 'Cheque' }, { value: 'otro', label: 'Otro' },
            ]}
          />
          <Input label="Nota (opcional)" placeholder="Referencia, nro de operación..." value={form.obs} onChange={e => setForm(f => ({ ...f, obs: e.target.value }))} />

          {!editandoCobro && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-gris-dark uppercase tracking-wider">Comprobante (opcional)</label>
              <input
                type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={e => setArchivo(e.target.files?.[0] ?? null)}
                className="text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-azul-light file:text-azul file:font-bold hover:file:bg-azul hover:file:text-white file:cursor-pointer"
              />
              {archivo && (
                <div className="flex items-center gap-2 text-xs text-gris-dark mt-1">
                  <span>📎 {archivo.name} · {(archivo.size / 1024).toFixed(0)} KB</span>
                  <button type="button" onClick={() => setArchivo(null)} className="text-rojo hover:underline">Quitar</button>
                </div>
              )}
              <p className="text-[11px] text-gris-mid italic">Foto o PDF de la transferencia / recibo. Máx 10 MB.</p>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
