'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { Pagination } from '@/components/ui/Pagination'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import { useExternos, useMarcarExternos, type ExternosFiltro } from '../../hooks/useCobranzas'
import { fmtCuit, fmtFecha, fmtM, hoyAR } from '../../utils/facturacion.utils'
import { TIPOS_EXTERNO, aCent, esTipoCredito } from '../../utils/cobranzas.utils'
import { mensajeErrorFacturacion } from '../../utils/facturacion.errores'
import type { VentasExterno, VentasExternoAccion } from '@/types/domain.types'
import { ClienteCombobox, EstadoCobroBadge, ErrorCarga, Vacio } from './Comun'
import { ModalExterno } from './ModalExterno'
import { ModalImportarArca } from './ModalImportarArca'

const PAGE_SIZE = 100

/**
 * Saldos iniciales: comprobantes emitidos fuera del sistema (Finnegans, portal
 * de ARCA) que siguen abiertos. Es además el libro de ventas jul–sep 2026.
 *
 * Lo importado de ARCA nace «a revisar» (saldo = total, porque el Excel no
 * trae cobranzas). El dueño o el contador marcan en lote cuáles ya están
 * cobradas (fecha y motivo), cuáles siguen impagas, o las vuelven a revisar.
 */
export function SaldosInicialesTab() {
  const toast = useToast()
  const { puedeVer, puedeCrear, puedeEditar } = usePermisos('facturacion')
  const [filtro, setFiltro] = useState<ExternosFiltro>({ saldo: 'abiertos' })
  const [page, setPage] = useState(1)
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [editar, setEditar] = useState<VentasExterno | null>(null)
  const [nuevo, setNuevo] = useState(false)
  const [importar, setImportar] = useState(false)
  const [accion, setAccion] = useState<VentasExternoAccion | null>(null)

  const lista = useExternos(filtro, page, PAGE_SIZE, puedeVer)
  const filas = useMemo(() => lista.data?.rows ?? [], [lista.data])
  const total = lista.data?.total ?? 0

  function patch(p: Partial<ExternosFiltro>) {
    setFiltro(f => ({ ...f, ...p }))
    setPage(1)
    setSel(new Set())
  }

  const todasSel = filas.length > 0 && filas.every(f => sel.has(f.id))
  const seleccionadas = filas.filter(f => sel.has(f.id))
  const sumaSel = seleccionadas.reduce((s, f) => s + aCent(f.saldo_inicial) * (esTipoCredito(f.cbte_tipo) ? -1 : 1), 0) / 100

  if (!puedeVer) return <Vacio>No tenés permiso para ver los saldos iniciales.</Vacio>

  const sinPermisoMarcar = !puedeEditar ? 'No tenés permiso para editar saldos iniciales' : sel.size === 0 ? 'Elegí comprobantes de la lista' : null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 flex-wrap items-center">
        <Button size="sm" onClick={() => setImportar(true)} disabled={!puedeCrear}
          title={puedeCrear ? 'Subir el Excel de «Mis Comprobantes — Emitidos» de ARCA' : 'No tenés permiso para cargar saldos iniciales'}>
          ⬆ Importar desde ARCA
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setNuevo(true)} disabled={!puedeCrear}
          title={puedeCrear ? 'Cargar a mano una factura de Finnegans que sigue impaga' : 'No tenés permiso para cargar saldos iniciales'}>
          + Cargar comprobante
        </Button>
      </div>

      <div className="bg-white rounded-card shadow-card p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
        <div className="lg:col-span-2">
          <ClienteCombobox value={filtro.cliente_id ? String(filtro.cliente_id) : ''} todos="Todos los clientes" incluirInactivos
            onChange={v => patch({ cliente_id: v ? Number(v) : undefined })} />
        </div>
        <Select label="Saldo" value={filtro.saldo ?? ''} onChange={e => patch({ saldo: (e.target.value || undefined) as ExternosFiltro['saldo'] })}
          options={[{ value: 'abiertos', label: 'Con saldo' }, { value: '', label: 'Todos (libro de ventas)' }]} />
        <Select label="Tipo" value={filtro.cbte_tipo ? String(filtro.cbte_tipo) : ''} onChange={e => patch({ cbte_tipo: e.target.value ? Number(e.target.value) : undefined })}
          options={[{ value: '', label: 'Todos' }, ...TIPOS_EXTERNO.map(t => ({ value: String(t.key), label: t.corto }))]} />
        <Input label="Desde" type="date" value={filtro.desde ?? ''} onChange={e => patch({ desde: e.target.value || undefined })} />
        <Input label="Hasta" type="date" value={filtro.hasta ?? ''} onChange={e => patch({ hasta: e.target.value || undefined })} />
        <div className="sm:col-span-2 lg:col-span-5">
          <Input placeholder="Buscar: número, cliente, CUIT, observación…" value={filtro.q ?? ''} onChange={e => patch({ q: e.target.value })} />
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={!!filtro.a_revisar} onChange={e => patch({ a_revisar: e.target.checked || undefined })} />
          Solo «a revisar»
        </label>
      </div>

      {/* Acciones masivas */}
      <div className={`flex gap-2 flex-wrap items-center px-3 py-2 rounded-card border ${sel.size ? 'bg-azul-light/40 border-azul/30' : 'bg-white border-gris-mid'}`}>
        <span className="text-sm mr-auto">
          {sel.size ? <><b>{sel.size}</b> seleccionado{sel.size === 1 ? '' : 's'} · saldo {fmtM(sumaSel)}</> : <span className="text-gris-dark">Seleccioná comprobantes para marcarlos en lote.</span>}
        </span>
        <Button size="sm" onClick={() => setAccion('cobrada')} disabled={!!sinPermisoMarcar} title={sinPermisoMarcar ?? 'Dejar el saldo en 0: ya se cobraron antes de arrancar con el sistema'}>
          ✓ Marcar cobradas
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setAccion('impaga')} disabled={!!sinPermisoMarcar} title={sinPermisoMarcar ?? 'Confirmar que se deben enteras'}>
          Marcar impagas
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setAccion('revisar')} disabled={!!sinPermisoMarcar} title={sinPermisoMarcar ?? 'Volver a «a revisar»'}>
          Volver a revisar
        </Button>
        {sel.size > 0 && <Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>Limpiar</Button>}
      </div>

      {lista.isLoading && !lista.data ? (
        <Vacio>Cargando comprobantes…</Vacio>
      ) : lista.error ? (
        <ErrorCarga mensaje={mensajeErrorFacturacion(lista.error)} onReintentar={() => lista.refetch()} />
      ) : filas.length === 0 ? (
        <Vacio>{filtro.a_revisar ? 'No queda nada «a revisar».' : 'No hay comprobantes con estos filtros. Importá el Excel de ARCA o cargalos a mano.'}</Vacio>
      ) : (
        <div className="bg-white rounded-card shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[1100px]">
              <thead>
                <tr>
                  <th className="bg-gris px-2 py-2 w-8">
                    <input type="checkbox" checked={todasSel} aria-label="Seleccionar todos"
                      onChange={() => setSel(todasSel ? new Set() : new Set(filas.map(f => f.id)))} />
                  </th>
                  {['Tipo', 'Número', 'Cliente', 'Fecha', 'Vence', 'Total', 'Saldo inicial', 'Saldo hoy', 'Estado', 'Origen'].map((h, i) => (
                    <th key={h} className={`bg-gris text-gris-dark text-[10px] font-bold px-2 py-2 uppercase tracking-wide whitespace-nowrap ${i >= 5 && i <= 7 ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filas.map(f => {
                  const nc = esTipoCredito(f.cbte_tipo)
                  const abrir = () => setEditar(f)
                  return (
                    <tr key={f.id} className={`border-t border-gris hover:bg-azul-light/30 ${sel.has(f.id) ? 'bg-azul-light/40' : ''}`}>
                      <td className="px-2 py-1.5">
                        <input type="checkbox" checked={sel.has(f.id)} aria-label={`Seleccionar ${f.comprobante}`}
                          onChange={() => setSel(s => { const n = new Set(s); if (n.has(f.id)) n.delete(f.id); else n.add(f.id); return n })} />
                      </td>
                      <td className="px-2 py-1.5 text-xs font-bold whitespace-nowrap cursor-pointer" onClick={abrir} title={f.tipo_nombre}>{f.tipo_abrev}</td>
                      <td className="px-2 py-1.5 font-mono text-xs whitespace-nowrap cursor-pointer" onClick={abrir}>{f.numero_fmt}</td>
                      <td className="px-2 py-1.5 text-sm cursor-pointer" onClick={abrir}>
                        <div className="font-semibold leading-tight">{f.cliente_razon_social}</div>
                        <div className="text-[11px] text-gris-dark font-mono">{fmtCuit(f.cliente_doc_nro)}</div>
                      </td>
                      <td className="px-2 py-1.5 text-xs whitespace-nowrap">{fmtFecha(f.fecha)}</td>
                      <td className="px-2 py-1.5 text-xs whitespace-nowrap">{nc ? '—' : fmtFecha(f.vence_el)}</td>
                      <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums whitespace-nowrap">{nc ? '−' : ''}{fmtM(f.total)}</td>
                      <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums whitespace-nowrap">{nc ? '−' : ''}{fmtM(f.saldo_inicial)}</td>
                      <td className="px-2 py-1.5 text-right font-mono text-sm tabular-nums whitespace-nowrap font-bold">{nc ? '−' : ''}{fmtM(f.saldo)}</td>
                      <td className="px-2 py-1.5">
                        <EstadoCobroBadge estado={!nc && Number(f.dias_vencido) > 0 && Number(f.saldo) > 0 ? 'vencida' : f.estado} revisar={f.saldo_a_revisar} />
                        {f.saldo_cobrado_el && <div className="text-[10px] text-gris-dark">cobrada {fmtFecha(f.saldo_cobrado_el)}</div>}
                        {f.saldo_motivo && !f.saldo_a_revisar && <div className="text-[10px] text-gris-dark truncate max-w-[180px]" title={f.saldo_motivo}>{f.saldo_motivo}</div>}
                      </td>
                      <td className="px-2 py-1.5 text-xs text-gris-dark">{f.origen === 'portal' ? 'ARCA' : f.origen === 'finnegans' ? 'Finnegans' : 'Otro'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {total > PAGE_SIZE && <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={p => { setPage(p); setSel(new Set()) }} />}
      {filas.length > 0 && <p className="text-[11px] text-gris-dark px-1">{total.toLocaleString('es-AR')} comprobante{total === 1 ? '' : 's'} · las NC restan.</p>}

      {nuevo && <ModalExterno onClose={() => setNuevo(false)} />}
      {editar && <ModalExterno externo={editar} onClose={() => setEditar(null)} />}
      {importar && <ModalImportarArca onClose={() => setImportar(false)} />}
      {accion && (
        <ModalMarcar accion={accion} seleccionadas={seleccionadas} onClose={() => setAccion(null)}
          onHecho={n => { toast(`✓ ${n} comprobante${n === 1 ? '' : 's'} actualizado${n === 1 ? '' : 's'}`, 'ok'); setSel(new Set()); setAccion(null) }} />
      )}
    </div>
  )
}

const TITULO_ACCION: Record<VentasExternoAccion, string> = {
  cobrada: 'Marcar como cobradas',
  impaga:  'Marcar como impagas',
  revisar: 'Volver a revisar',
}

function ModalMarcar({ accion, seleccionadas, onClose, onHecho }: {
  accion: VentasExternoAccion; seleccionadas: VentasExterno[]; onClose: () => void; onHecho: (n: number) => void
}) {
  const marcar = useMarcarExternos()
  const [fecha, setFecha] = useState(hoyAR())
  const [motivo, setMotivo] = useState(accion === 'cobrada' ? 'saldo inicial' : '')
  const [error, setError] = useState<string | null>(null)
  const conImp = seleccionadas.filter(s => s.cantidad_imputaciones > 0)

  async function ok() {
    setError(null)
    try {
      const r = await marcar.mutateAsync({
        ids: seleccionadas.map(s => s.id), accion,
        ...(motivo.trim() ? { motivo: motivo.trim() } : {}),
        ...(accion === 'cobrada' ? { fecha } : {}),
      })
      onHecho(r.actualizados ?? seleccionadas.length)
    } catch (e) { setError(mensajeErrorFacturacion(e)) }
  }

  return (
    <Modal open onClose={marcar.isPending ? () => {} : onClose} title={TITULO_ACCION[accion]} width="max-w-md"
      footer={<>
        <Button variant="ghost" size="sm" onClick={onClose} disabled={marcar.isPending}>Cancelar</Button>
        <Button size="sm" onClick={ok} loading={marcar.isPending} disabled={accion === 'cobrada' && !fecha}>Confirmar ({seleccionadas.length})</Button>
      </>}>
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-gris-dark">
          {accion === 'cobrada' && <>El saldo de los {seleccionadas.length} comprobantes queda en <b>$ 0</b>: se cobraron antes de arrancar con el sistema. Siguen en el libro de ventas.</>}
          {accion === 'impaga' && <>Se confirma que los {seleccionadas.length} comprobantes se deben <b>enteros</b> (saldo = total) y dejan de estar «a revisar».</>}
          {accion === 'revisar' && <>Los {seleccionadas.length} comprobantes vuelven a «a revisar», sin tocar el saldo.</>}
        </p>
        {accion === 'cobrada' && <Input label="Fecha de cobro" type="date" max={hoyAR()} value={fecha} onChange={e => setFecha(e.target.value)} />}
        {accion !== 'revisar' && <Input label="Motivo" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ej.: saldo inicial, confirmado por el contador" />}
        {conImp.length > 0 && accion === 'cobrada' && (
          <div className="text-xs text-rojo">
            {conImp.length} tiene{conImp.length === 1 ? '' : 'n'} cobros aplicados ({conImp.map(s => s.comprobante).join(', ')}): el saldo no puede quedar por debajo de lo aplicado y la base lo va a rechazar. Sacalos de la selección.
          </div>
        )}
        {error && <div className="text-xs text-rojo font-semibold">{error}</div>}
      </div>
    </Modal>
  )
}
