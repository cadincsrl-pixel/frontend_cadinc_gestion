'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { InputMonto } from '@/components/ui/InputMonto'
import { Modal } from '@/components/ui/Modal'
import { Pagination } from '@/components/ui/Pagination'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import type { ChequeRecibidoFila } from '@/types/domain.types'
import {
  useAltaChequesRecibidos, useCambiarEstadoCheques, useChequesRecibidos, useTesoreria, type AccionCheque, type ChequesRecibidosFiltro,
} from '../hooks/useContabilidad'
import { fmtFecha, fmtM } from '../utils/contabilidad.utils'
import { mensajeErrorCtb } from '../utils/contabilidad.errores'
import { Campo, Cargando, Cifra, ErrorCarga, RangoFechas, Tarjeta, Th, Vacio, inputCls } from './Comun'

const PAGE_SIZE = 50

/**
 * Cartera de cheques recibidos (20260930n): los cheques de terceros que
 * entraron por cobros de Logística (leídos de la liquidación o cargados en el
 * cobro), de Ventas (el medio cheque/e-cheq) o a mano, y qué pasó con cada
 * uno: en cartera, endosado a un proveedor (con su OP), depositado,
 * rechazado.
 *
 * Los depósitos todavía no se registran: un cheque «en cartera» con la fecha
 * de cobro pasada está marcado como «vencido» (casi seguro ya se depositó).
 */

const ESTADOS: { key: NonNullable<ChequesRecibidosFiltro['estado']>; label: string }[] = [
  { key: 'por_vencer', label: 'En cartera, por cobrar' },
  { key: 'vencidos',   label: 'En cartera, vencidos' },
  { key: 'endosado',   label: 'Endosados' },
  { key: 'depositado', label: 'Depositados' },
  { key: 'rechazado',  label: 'Rechazados (a cobrar)' },
  { key: 'recuperado', label: 'Recuperados' },
  { key: 'todos',      label: 'Todos' },
]

const CHIP: Record<ChequeRecibidoFila['estado'], { txt: string; cls: string }> = {
  en_cartera: { txt: 'En cartera', cls: 'bg-azul-light text-azul' },
  endosado:   { txt: 'Endosado',   cls: 'bg-verde-light text-verde' },
  depositado: { txt: 'Depositado', cls: 'bg-gris text-gris-dark' },
  rechazado:  { txt: 'Rechazado',  cls: 'bg-rojo-light text-rojo' },
  recuperado: { txt: 'Recuperado', cls: 'bg-gris text-gris-dark' },
}

export function ChequesRecibidosView() {
  const router = useRouter()
  const { puedeCrear, movimientosFondos } = usePermisos('contabilidad')
  const [filtro, setFiltro] = useState<ChequesRecibidosFiltro>({ estado: 'por_vencer' })
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [alta, setAlta] = useState(false)
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [accion, setAccion] = useState<AccionCheque | null>(null)

  const lista = useChequesRecibidos({ ...filtro, q }, page, PAGE_SIZE)
  const items = lista.data?.items ?? []
  const total = lista.data?.total ?? 0
  const tot = lista.data?.totales ?? {}
  const t = (k: string) => tot[k] ?? { cantidad: 0, importe: 0 }

  const patch = (p: Partial<ChequesRecibidosFiltro>) => { setFiltro(f => ({ ...f, ...p })); setPage(1); setSel(new Set()) }
  const elegidos = items.filter(c => sel.has(c.id))
  const alternar = (id: number) => setSel(s => { const x = new Set(s); if (x.has(id)) x.delete(id); else x.add(id); return x })
  const todosPagina = items.length > 0 && items.every(c => sel.has(c.id))
  // Qué acción admite la selección entera (la RPC lo vuelve a validar).
  const puede = (a: AccionCheque) => elegidos.length > 0 && elegidos.every(c =>
    a === 'depositar' ? c.estado === 'en_cartera'
    : a === 'rechazar' ? c.estado === 'depositado' || c.estado === 'endosado'
    : a === 'recuperar' ? c.estado === 'rechazado'
    : c.estado === 'depositado' || c.estado === 'rechazado' || c.estado === 'recuperado')
  const motivoAccion = (a: AccionCheque) => bloqueoAlta ?? (puede(a) ? undefined
    : a === 'depositar' ? 'Solo cheques en cartera'
    : a === 'rechazar' ? 'Solo cheques depositados o endosados'
    : a === 'recuperar' ? 'Solo cheques rechazados'
    : 'Solo cheques depositados, rechazados o recuperados')
  const bloqueoAlta = !movimientosFondos ? 'No tenés permiso (hace falta «Movimientos de fondos»)'
    : !puedeCrear ? 'No tenés permiso de Crear en Contabilidad' : null

  function origen(c: ChequeRecibidoFila) {
    if (c.origen === 'logistica_cobro' && c.cobro_id) return { txt: `Cobro #${c.cobro_id}`, href: '/logistica?tab=facturacion' }
    if (c.origen === 'ventas_cobro' && c.ventas_cobro_id) return { txt: `Cobro de Ventas #${c.ventas_cobro_id}`, href: '/facturacion?tab=cobranzas' }
    return { txt: 'Cargado a mano', href: null }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2 flex-wrap">
        <Cifra label="En cartera, por cobrar" valor={fmtM(t('por_vencer').importe)} sub={`${t('por_vencer').cantidad} cheques`} />
        <Cifra label="En cartera, vencidos" valor={fmtM(t('vencidos').importe)} tono="naranja"
          sub={`${t('vencidos').cantidad} · casi seguro depositados (el depósito todavía no se registra)`} />
        <Cifra label="Endosados" valor={fmtM(t('endosado').importe)} tono="verde" sub={`${t('endosado').cantidad} a proveedores`} />
        {t('rechazado').cantidad > 0 && (
          <Cifra label="Rechazados" valor={fmtM(t('rechazado').importe)} tono="rojo" sub={`${t('rechazado').cantidad} a cobrar de nuevo`} />
        )}
      </div>

      <Tarjeta className="p-3 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-[150px_150px_220px_1fr_auto] gap-2 items-end">
        <RangoFechas desde={filtro.desde ?? ''} hasta={filtro.hasta ?? ''} onChange={r => patch({ desde: r.desde || undefined, hasta: r.hasta || undefined })} />
        <Campo label="Estado">
          <select value={filtro.estado ?? 'todos'} onChange={e => patch({ estado: e.target.value as ChequesRecibidosFiltro['estado'] })} className={inputCls}>
            {ESTADOS.map(e => <option key={e.key} value={e.key}>{e.label}</option>)}
          </select>
        </Campo>
        <Campo label="Buscar" className="col-span-2 lg:col-span-1">
          <input value={q} onChange={e => { setQ(e.target.value); setPage(1) }} className={inputCls}
            placeholder="Número, librador, CUIT, quién lo dio, proveedor, OP-0265…" />
        </Campo>
        <div className="col-span-2 lg:col-span-1 flex justify-end">
          <Button size="sm" onClick={() => setAlta(true)} disabled={!!bloqueoAlta}
            title={bloqueoAlta ?? 'Un cheque que no entró por un cobro (o que la lectura no encontró)'}>
            + Cargar a mano
          </Button>
        </div>
      </Tarjeta>

      {elegidos.length > 0 && (
        <Tarjeta className="px-3 py-2 flex items-center gap-2 flex-wrap border-l-4 border-naranja">
          <span className="text-sm"><b>{elegidos.length}</b> elegido{elegidos.length === 1 ? '' : 's'} ·{' '}
            <b className="font-mono tabular-nums">{fmtM(elegidos.reduce((t, c) => t + Number(c.importe), 0))}</b></span>
          <span className="ml-auto" />
          <Button size="sm" variant="secondary" onClick={() => setAccion('depositar')} disabled={!!motivoAccion('depositar')} title={motivoAccion('depositar')}>🏦 Depositar…</Button>
          <Button size="sm" variant="secondary" onClick={() => setAccion('rechazar')} disabled={!!motivoAccion('rechazar')} title={motivoAccion('rechazar')}>✕ Rechazado…</Button>
          <Button size="sm" variant="secondary" onClick={() => setAccion('recuperar')} disabled={!!motivoAccion('recuperar')} title={motivoAccion('recuperar')}>✓ Recuperado…</Button>
          <Button size="sm" variant="ghost" onClick={() => setAccion('volver_a_cartera')} disabled={!!motivoAccion('volver_a_cartera')} title={motivoAccion('volver_a_cartera') ?? 'Deshace el depósito, el rechazo o el recupero'}>↩ Deshacer</Button>
          <Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>Limpiar</Button>
        </Tarjeta>
      )}

      {lista.isLoading ? <Cargando />
        : lista.isError ? <ErrorCarga mensaje={mensajeErrorCtb(lista.error)} onReintentar={() => void lista.refetch()} />
        : items.length === 0 ? <Vacio>No hay cheques con estos filtros.</Vacio>
        : (
          <Tarjeta className={`overflow-hidden ${lista.isFetching ? 'opacity-70' : ''}`}>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse min-w-[980px]">
                <thead>
                  <tr>
                    <Th>
                      <input type="checkbox" aria-label="Elegir todos los de esta página" checked={todosPagina}
                        onChange={e => setSel(e.target.checked ? new Set(items.map(c => c.id)) : new Set())} />
                    </Th>
                    <Th>Se cobra</Th><Th>Número</Th><Th>Librador</Th><Th>Banco</Th><Th derecha>Importe</Th>
                    <Th>Recibido de</Th><Th>Destino</Th><Th>Estado</Th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(c => {
                    const o = origen(c)
                    return (
                      <tr key={c.id} className={`border-t border-gris align-top ${sel.has(c.id) ? 'bg-naranja-light/40' : ''}`} title={c.obs ?? undefined}>
                        <td className="px-3 py-2">
                          <input type="checkbox" aria-label={`Elegir el cheque ${c.numero}`} checked={sel.has(c.id)} onChange={() => alternar(c.id)} />
                        </td>
                        <td className={`px-3 py-2 text-xs whitespace-nowrap ${c.vencido ? 'text-naranja-dark font-semibold' : ''}`}>
                          {fmtFecha(c.fecha_cobro)}{c.es_echeq ? <span className="block text-[10px] text-gris-dark">e-cheq</span> : null}
                        </td>
                        <td className="px-3 py-2 text-xs font-mono">{c.numero}</td>
                        <td className="px-3 py-2 text-sm max-w-[220px]">
                          <span className="block truncate" title={c.librador ?? undefined}>{c.librador ?? '—'}</span>
                          {c.librador_cuit && <span className="text-[10px] text-gris-dark font-mono">CUIT {c.librador_cuit}</span>}
                        </td>
                        <td className="px-3 py-2 text-xs">{c.banco ?? '—'}</td>
                        <td className="px-3 py-2 text-right font-mono text-sm tabular-nums font-bold">{fmtM(Number(c.importe))}</td>
                        <td className="px-3 py-2 text-xs">
                          <span className="block">{c.recibido_de ?? '—'}</span>
                          {o.href
                            ? <button type="button" onClick={() => router.push(o.href!)} className="text-[10px] text-azul hover:underline">{o.txt}{c.recibido_el ? ` · ${fmtFecha(c.recibido_el)}` : ''}</button>
                            : <span className="text-[10px] text-gris-dark">{o.txt}</span>}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {c.orden_id ? (
                            <>
                              <span className="block truncate max-w-[200px]" title={c.proveedor_nombre ?? undefined}>{c.proveedor_nombre}</span>
                              <button type="button" onClick={() => router.push(`/pagos?tab=pagos&ficha=${c.orden_id}`)}
                                className="text-[10px] text-azul hover:underline font-mono">
                                OP-{String(c.op_numero ?? '').padStart(4, '0')}{c.op_fecha ? ` · ${fmtFecha(c.op_fecha)}` : ''}
                              </button>
                            </>
                          ) : c.deposito_cuenta ? null : <span className="text-gris-dark">—</span>}
                          {c.deposito_cuenta && (
                            <span className="block text-[11px]">Depositado en <b>{c.deposito_cuenta}</b>{c.fecha_deposito ? ` · ${fmtFecha(c.fecha_deposito)}` : ''}</span>
                          )}
                          {c.rechazo_fecha && (
                            <span className="block text-[11px] text-rojo" title={c.rechazo_motivo ?? undefined}>Rechazado el {fmtFecha(c.rechazo_fecha)}: {c.rechazo_motivo}</span>
                          )}
                          {c.recupero_fecha && (
                            <span className="block text-[11px] text-verde" title={c.recupero_obs ?? undefined}>Recuperado el {fmtFecha(c.recupero_fecha)}: {c.recupero_obs}</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase whitespace-nowrap ${CHIP[c.estado].cls}`}>{CHIP[c.estado].txt}</span>
                          {c.vencido && <span className="block text-[10px] text-naranja-dark mt-0.5">vencido</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Tarjeta>
        )}

      {total > PAGE_SIZE && <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />}

      {alta && <ModalAltaCheques onClose={() => setAlta(false)} />}
      {accion && <ModalAccionCheques accion={accion} cheques={elegidos} onClose={() => setAccion(null)} onHecho={() => { setAccion(null); setSel(new Set()) }} />}
    </div>
  )
}

interface Fila { numero: string; banco: string; librador: string; fecha_cobro: string; importe: string; es_echeq: boolean }
const filaVacia = (prev?: Fila): Fila => ({
  numero: '', banco: prev?.banco ?? '', librador: prev?.librador ?? '', fecha_cobro: '', importe: '', es_echeq: prev?.es_echeq ?? false,
})

/** Alta a mano: misma puerta que los cobros (no duplica número + importe). */
function ModalAltaCheques({ onClose }: { onClose: () => void }) {
  const toast = useToast()
  const alta = useAltaChequesRecibidos()
  const [filas, setFilas] = useState<Fila[]>([filaVacia()])
  const set = (i: number, c: Partial<Fila>) => setFilas(fs => fs.map((f, j) => j === i ? { ...f, ...c } : f))
  const validas = filas.filter(f => f.numero.trim() && Number(f.importe) > 0 && f.librador.trim())

  async function guardar() {
    if (validas.length === 0) { toast('Cada cheque necesita número, importe y librador', 'err'); return }
    try {
      const r = await alta.mutateAsync(validas.map(f => ({
        numero: f.numero.trim(), banco: f.banco.trim() || null, librador: f.librador.trim(),
        fecha_cobro: f.fecha_cobro || null, importe: Number(f.importe), es_echeq: f.es_echeq,
      })))
      const partes = [
        r.nuevos ? `${r.nuevos} a la cartera` : null,
        r.ya_estaban ? `${r.ya_estaban} ya estaba${r.ya_estaban === 1 ? '' : 'n'} (${(r.ya_estaban_numeros ?? []).join(', ')})` : null,
        r.endosados ? `${r.endosados} ya endosado${r.endosados === 1 ? '' : 's'}` : null,
      ].filter(Boolean)
      toast(`✓ ${partes.join(' · ')}`, r.nuevos ? 'ok' : 'warn')
      onClose()
    } catch (e) {
      toast(mensajeErrorCtb(e), 'err')
    }
  }

  return (
    <Modal open onClose={onClose} title="Cargar cheques a mano" width="max-w-4xl"
      footer={
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={guardar} loading={alta.isPending} disabled={validas.length === 0}>
            Guardar {validas.length > 0 ? `${validas.length} cheque${validas.length === 1 ? '' : 's'}` : ''}
          </Button>
        </div>
      }>
      <div className="flex flex-col gap-2 text-sm">
        <p className="text-[11px] text-gris-dark">
          Para un cheque que no entró por un cobro. Si el que te lo dio es una empresa de Logística, conviene cargarlo en su cobro
          (queda el vínculo). Un cheque que ya está en la cartera (mismo número e importe) no se duplica.
        </p>
        {filas.map((f, i) => (
          <div key={i} className="grid grid-cols-2 md:grid-cols-[1fr_1fr_1.6fr_1fr_1fr_auto] gap-1.5 items-end border-t border-gris pt-2">
            <Campo label="Número"><input value={f.numero} onChange={e => set(i, { numero: e.target.value })} className={`${inputCls} font-mono`} /></Campo>
            <Campo label="Banco"><input value={f.banco} onChange={e => set(i, { banco: e.target.value })} className={inputCls} /></Campo>
            <Campo label="Librador"><input value={f.librador} onChange={e => set(i, { librador: e.target.value })} className={inputCls} placeholder="Quién lo firmó" /></Campo>
            <Campo label="Se cobra el"><input type="date" value={f.fecha_cobro} onChange={e => set(i, { fecha_cobro: e.target.value })} className={inputCls} /></Campo>
            <Campo label="Importe"><InputMonto value={f.importe} onChange={v => set(i, { importe: v })} className="text-right font-mono tabular-nums" /></Campo>
            <div className="flex items-center gap-2 pb-2">
              <label className="flex items-center gap-1 text-xs cursor-pointer whitespace-nowrap">
                <input type="checkbox" checked={f.es_echeq} onChange={e => set(i, { es_echeq: e.target.checked })} /> e-cheq
              </label>
              {filas.length > 1 && <button type="button" onClick={() => setFilas(fs => fs.filter((_, j) => j !== i))} className="text-rojo text-xs">✕</button>}
            </div>
          </div>
        ))}
        {/* El siguiente copia banco y librador: suelen venir de la misma chequera. */}
        <button type="button" onClick={() => setFilas(fs => [...fs, filaVacia(fs[fs.length - 1])])}
          className="self-start text-xs font-semibold text-azul hover:underline">＋ Otro cheque</button>
      </div>
    </Modal>
  )
}

const TITULO_ACCION: Record<AccionCheque, string> = {
  depositar:        'Depositar cheques',
  rechazar:         'Marcar cheques rechazados',
  recuperar:        'Marcar cheques recuperados',
  volver_a_cartera: 'Deshacer: volver a la cartera',
}

/**
 * Depositar (en lote, con la fecha de cobro de cada uno o una fija),
 * rechazado (fecha + motivo), recuperado (fecha + con qué lo pagaron) o
 * deshacer. Todavía sin asiento: eso llega con el contador (fase 4b).
 */
function ModalAccionCheques({ accion, cheques, onClose, onHecho }: {
  accion: AccionCheque; cheques: ChequeRecibidoFila[]; onClose: () => void; onHecho: () => void
}) {
  const toast = useToast()
  const cambiar = useCambiarEstadoCheques()
  const tesorerias = useTesoreria(false)
  const cuentas = (tesorerias.data ?? []).filter(t => t.tipo === 'banco' || t.tipo === 'billetera')
  const [cuenta, setCuenta] = useState<number | ''>('')
  const [usarFechaCobro, setUsarFechaCobro] = useState(true)
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10))
  const [motivo, setMotivo] = useState('')
  const total = cheques.reduce((t, c) => t + Number(c.importe), 0)
  const falta = accion === 'depositar' && !cuenta ? 'Elegí la cuenta'
    : (accion === 'rechazar' || accion === 'recuperar') && !motivo.trim() ? (accion === 'rechazar' ? 'Poné el motivo' : 'Poné con qué lo pagaron')
    : undefined

  async function confirmar() {
    if (falta) return
    try {
      const r = await cambiar.mutateAsync({
        ids: cheques.map(c => c.id), accion,
        fecha: accion === 'depositar' && usarFechaCobro ? null : accion === 'volver_a_cartera' ? null : fecha,
        tesoreria_id: accion === 'depositar' ? Number(cuenta) : null,
        motivo: accion === 'rechazar' || accion === 'recuperar' ? motivo.trim() : null,
      })
      toast(`✓ ${r.cheques} cheque${r.cheques === 1 ? '' : 's'}: ${TITULO_ACCION[accion].toLowerCase()}`, 'ok')
      onHecho()
    } catch (e) {
      toast(mensajeErrorCtb(e), 'err')
    }
  }

  return (
    <Modal open onClose={onClose} title={TITULO_ACCION[accion]} width="max-w-lg"
      footer={
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={confirmar} loading={cambiar.isPending} disabled={!!falta} title={falta}>Confirmar</Button>
        </div>
      }>
      <div className="flex flex-col gap-3 text-sm">
        <div className="text-xs text-gris-dark">
          {cheques.length} cheque{cheques.length === 1 ? '' : 's'} por <b className="font-mono tabular-nums text-carbon">{fmtM(total)}</b>
          {cheques.length <= 6 && <>: {cheques.map(c => c.numero).join(', ')}</>}
        </div>
        {accion === 'depositar' && (
          <>
            <Campo label="Se depositaron en">
              <select value={cuenta} onChange={e => setCuenta(Number(e.target.value) || '')} className={inputCls}>
                <option value="">Elegí la cuenta…</option>
                {cuentas.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
            </Campo>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="radio" checked={usarFechaCobro} onChange={() => setUsarFechaCobro(true)} />
              El día de cobro de cada cheque <span className="text-gris-dark">(lo más común con los vencidos)</span>
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="radio" checked={!usarFechaCobro} onChange={() => setUsarFechaCobro(false)} />
              Todos el día
              <input type="date" value={fecha} onChange={e => { setFecha(e.target.value); setUsarFechaCobro(false) }} className={`${inputCls} w-40`} />
            </label>
          </>
        )}
        {(accion === 'rechazar' || accion === 'recuperar') && (
          <>
            <Campo label={accion === 'rechazar' ? 'Fecha del rechazo' : 'Fecha en que lo pagaron'}>
              <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className={inputCls} />
            </Campo>
            <Campo label={accion === 'rechazar' ? 'Motivo' : 'Con qué lo pagaron'}>
              <input value={motivo} onChange={e => setMotivo(e.target.value)} className={inputCls}
                placeholder={accion === 'rechazar' ? 'Sin fondos, firma no conforme…' : 'Otro cheque N° …, transferencia del …'} />
            </Campo>
            {accion === 'rechazar' && cheques.some(c => c.estado === 'endosado') && (
              <p className="text-[11px] text-[#7A5000]">
                Un cheque endosado que rebota: al proveedor hay que darle otro. Este vuelve a figurar como deuda de quien te lo dio, hasta que lo paguen de nuevo.
              </p>
            )}
          </>
        )}
        {accion === 'volver_a_cartera' && (
          <p className="text-xs text-gris-dark">Se borra el depósito, el rechazo o el recupero y el cheque vuelve a estar en cartera (o endosado, si se había endosado).</p>
        )}
        <p className="text-[11px] text-gris-dark">Todavía no genera asiento: la contabilidad de los cheques se arma con el contador.</p>
      </div>
    </Modal>
  )
}
