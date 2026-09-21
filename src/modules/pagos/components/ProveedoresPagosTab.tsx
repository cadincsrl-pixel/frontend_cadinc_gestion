'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Pagination } from '@/components/ui/Pagination'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import {
  useProveedoresPagos, useProveedorPagos, useEditarProveedorPagos, useDatosPagoProveedor,
  useBajaProveedorPagos, useReactivarProveedorPagos, fetchProveedoresExport,
  type PagosProveedoresFiltro,
} from '../hooks/useProveedoresPagos'
import { comprobanteTxt, fmtFecha, fmtM } from '../utils/pagos.utils'
import { mensajeAvisoPagos, mensajeErrorPagos } from '../utils/pagos.errores'
import { exportarProveedoresPagos } from '../utils/pagosExport'
import { AltaRapidaProveedor } from './AltaRapidaProveedor'

const PAGE_SIZE = 50

/**
 * El padrón propio del módulo.
 *
 * Es deliberadamente OTRO padrón que el de Compras: acá viven los datos para
 * pagarle a alguien (CUIT con verificador, CBU, alias, plazo), y el CBU es
 * dato sensible — sin `ver_pii` el backend ya lo manda enmascarado y la
 * pantalla muestra lo que recibe, sin decidir nada.
 */
export function ProveedoresPagosTab() {
  const toast = useToast()
  const { puedeVer, puedeCrear, puedeEditar, registrarPagos, esAdmin } = usePermisos('pagos')

  const [filtro, setFiltro] = useState<PagosProveedoresFiltro>({})
  const [page, setPage] = useState(1)
  const [texto, setTexto] = useState('')
  const [alta, setAlta] = useState(false)
  const [fichaId, setFichaId] = useState<number | null>(null)
  const [exportando, setExportando] = useState(false)

  const lista = useProveedoresPagos(filtro, page, PAGE_SIZE, puedeVer)
  const items = lista.data?.items ?? []
  const total = lista.data?.total ?? 0

  function patch(p: Partial<PagosProveedoresFiltro>) { setFiltro(f => ({ ...f, ...p })); setPage(1) }

  async function exportar() {
    setExportando(true)
    try {
      await exportarProveedoresPagos(await fetchProveedoresExport())
      toast('✓ Excel generado', 'ok')
    } catch (e) { toast(mensajeErrorPagos(e), 'err') } finally { setExportando(false) }
  }

  if (!puedeVer) {
    return <div className="bg-white rounded-card shadow-card p-8 text-center text-sm text-gris-dark">
      No tenés permiso para ver el padrón.
    </div>
  }

  return (
    <div className="flex flex-col gap-4">

      <div className="bg-white rounded-card shadow-card p-3 flex gap-2 flex-wrap items-end">
        <form className="flex gap-1 flex-1 min-w-[200px]"
              onSubmit={e => { e.preventDefault(); patch({ q: texto.trim() || undefined }) }}>
          <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Buscar por razón social o CUIT…"
                 className="flex-1 min-w-0 px-2.5 py-2 border-[1.5px] border-gris-mid rounded text-xs bg-white outline-none focus:border-naranja" />
          <Button type="submit" variant="secondary" size="sm">Buscar</Button>
        </form>
        <div className="flex gap-3 flex-wrap text-xs pb-2">
          <Tilde label="Sin CUIT"          on={!!filtro.sin_cuit}       set={v => patch({ sin_cuit: v || undefined })} />
          <Tilde label="Sin datos de pago" on={!!filtro.sin_datos_pago} set={v => patch({ sin_datos_pago: v || undefined })} />
          <Tilde label="Incluir dados de baja" on={!!filtro.inactivos}  set={v => patch({ inactivos: v || undefined })} />
        </div>
        <Button size="sm" onClick={() => setAlta(true)} disabled={!puedeCrear}
                title={puedeCrear ? 'Agregar un proveedor al padrón' : 'No tenés permiso para dar de alta proveedores'}>
          + Nuevo proveedor
        </Button>
        <Button variant="secondary" size="sm" onClick={exportar} loading={exportando}>📊 Excel</Button>
      </div>

      <div className="bg-white rounded-card shadow-card overflow-hidden">
        <div className="px-4 py-2 text-[11px] text-gris-dark border-b border-gris">
          Padrón del módulo Pagos. Es distinto del de Compras a propósito: acá van los datos para pagarle al proveedor.
        </div>

        {lista.isLoading && !lista.data ? (
          <div className="p-8 text-center text-sm text-gris-dark">Cargando…</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-sm text-gris-dark italic">No hay proveedores con estos filtros.</div>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full border-collapse min-w-[860px]">
                <thead>
                  <tr>
                    {['Razón social', 'CUIT', 'Cuenta', 'Plazo', 'Facturas', 'Saldo', ''].map((h, i) => (
                      <th key={h + i} className={`bg-gris text-gris-dark text-[10px] font-bold px-3 py-2 uppercase tracking-wide whitespace-nowrap ${i >= 3 && i <= 5 ? 'text-right' : 'text-left'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map(p => (
                    <tr key={p.id} className={`border-t border-gris hover:bg-azul-light/30 cursor-pointer ${p.activo ? '' : 'opacity-60'}`}
                        onClick={() => setFichaId(p.id)}>
                      <td className="px-3 py-2 text-sm">
                        <span className="font-semibold">{p.razon_social}</span>
                        {!p.activo && <span className="ml-1 text-[10px] px-1.5 rounded bg-gris text-gris-dark font-bold uppercase">baja</span>}
                        {p.banco && <span className="block text-[11px] text-gris-dark">{p.banco}</span>}
                      </td>
                      <td className="px-3 py-2 text-xs font-mono">
                        {p.cuit ?? <span className="text-naranja-dark">sin CUIT</span>}
                      </td>
                      <td className="px-3 py-2 text-xs font-mono">
                        {p.cbu ?? p.alias_cbu ?? <span className="text-naranja-dark font-sans">sin datos de pago</span>}
                      </td>
                      <td className="px-3 py-2 text-right text-xs">{p.plazo_pago_dias} d</td>
                      <td className="px-3 py-2 text-right text-xs">{p.facturas}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs tabular-nums font-bold">
                        {p.saldo > 0 ? fmtM(p.saldo) : <span className="text-gris-mid">—</span>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button type="button" className="text-xs px-2 py-1 rounded text-azul hover:bg-azul-light font-semibold" onClick={() => setFichaId(p.id)}>Ver</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="md:hidden divide-y divide-gris">
              {items.map(p => (
                <button key={p.id} type="button" onClick={() => setFichaId(p.id)} className={`w-full text-left p-3 ${p.activo ? '' : 'opacity-60'}`}>
                  <div className="flex justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-sm truncate">{p.razon_social}</div>
                      <div className="text-[11px] text-gris-dark font-mono">{p.cuit ?? 'sin CUIT'}</div>
                      <div className="text-[11px] text-gris-dark font-mono">{p.cbu ?? p.alias_cbu ?? 'sin datos de pago'}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold tabular-nums text-sm">{p.saldo > 0 ? fmtM(p.saldo) : '—'}</div>
                      <div className="text-[10px] text-gris-dark">{p.facturas} factura{p.facturas === 1 ? '' : 's'}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {total > PAGE_SIZE && <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />}

      {alta && <AltaRapidaProveedor onClose={() => setAlta(false)} onCreado={() => setAlta(false)} />}

      {fichaId !== null && (
        <FichaProveedor
          id={fichaId}
          onClose={() => setFichaId(null)}
          puedeEditar={!!puedeEditar}
          soloDatosPago={!puedeEditar && !!(registrarPagos || esAdmin)}
          toast={toast}
        />
      )}
    </div>
  )
}

function FichaProveedor({ id, onClose, puedeEditar, soloDatosPago, toast }: {
  id: number; onClose: () => void; puedeEditar: boolean; soloDatosPago: boolean
  toast: (m: string, t?: 'ok' | 'err' | 'warn') => void
}) {
  const { data: p, isLoading } = useProveedorPagos(id)
  const editar    = useEditarProveedorPagos()
  const datosPago = useDatosPagoProveedor()
  const baja      = useBajaProveedorPagos()
  const reactivar = useReactivarProveedorPagos()

  const [editando, setEditando] = useState(false)
  const [form, setForm] = useState({ razon_social: '', cuit: '', alias_cbu: '', cbu: '', banco: '', plazo_pago_dias: '30', contacto: '', telefono: '', email: '' })
  const [pidiendoBaja, setPidiendoBaja] = useState(false)
  const [motivo, setMotivo] = useState('')

  function abrirEdicion() {
    if (!p) return
    setForm({
      razon_social: p.razon_social, cuit: p.cuit ?? '', alias_cbu: p.alias_cbu ?? '', cbu: p.cbu ?? '',
      banco: p.banco ?? '', plazo_pago_dias: String(p.plazo_pago_dias ?? 30),
      contacto: p.contacto ?? '', telefono: p.telefono ?? '', email: p.email ?? '',
    })
    setEditando(true)
  }

  async function guardar() {
    if (!p) return
    try {
      // El contador solo puede tocar los datos de pago: es otra ruta, con su
      // propio permiso. Elegir la correcta acá evita un 403 confuso.
      const r = soloDatosPago
        ? await datosPago.mutateAsync({
            id: p.id, cbu: form.cbu.trim() || null, alias_cbu: form.alias_cbu.trim() || null,
            banco: form.banco.trim(), plazo_pago_dias: Number(form.plazo_pago_dias) || 30,
            contacto: form.contacto.trim(), telefono: form.telefono.trim(), email: form.email.trim(),
          })
        : await editar.mutateAsync({
            id: p.id, razon_social: form.razon_social.trim(), cuit: form.cuit.trim() || null,
            cbu: form.cbu.trim() || null, alias_cbu: form.alias_cbu.trim() || null,
            banco: form.banco.trim(), plazo_pago_dias: Number(form.plazo_pago_dias) || 30,
            contacto: form.contacto.trim(), telefono: form.telefono.trim(), email: form.email.trim(),
          })
      toast('✓ Proveedor actualizado', 'ok')
      for (const a of r.avisos) toast(mensajeAvisoPagos(a), 'warn')
      setEditando(false)
    } catch (e) { toast(mensajeErrorPagos(e), 'err') }
  }

  if (isLoading || !p) {
    return <Modal open onClose={onClose} title="Proveedor" width="max-w-2xl">
      <div className="p-8 text-center text-sm text-gris-dark">Cargando…</div>
    </Modal>
  }

  return (
    <Modal
      open onClose={onClose} width="max-w-2xl" title={p.razon_social}
      footer={
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>Cerrar</Button>
          {p.activo ? (
            <>
              <Button variant="danger" size="sm" onClick={() => setPidiendoBaja(true)} disabled={!puedeEditar}
                title={puedeEditar ? 'Dar de baja (no se puede si tiene saldo)' : 'No tenés permiso'}>Dar de baja</Button>
              {!editando && (
                <Button size="sm" onClick={abrirEdicion} disabled={!puedeEditar && !soloDatosPago}
                  title={puedeEditar ? 'Editar la ficha' : soloDatosPago ? 'Podés editar solo los datos de pago' : 'No tenés permiso'}>
                  ✏️ {soloDatosPago ? 'Datos de pago' : 'Editar'}
                </Button>
              )}
              {editando && (
                <Button size="sm" onClick={guardar} loading={editar.isPending || datosPago.isPending}>Guardar</Button>
              )}
            </>
          ) : (
            <Button size="sm" onClick={async () => {
              try { await reactivar.mutateAsync(p.id); toast('✓ Proveedor reactivado', 'ok') }
              catch (e) { toast(mensajeErrorPagos(e), 'err') }
            }} loading={reactivar.isPending} disabled={!puedeEditar}>Reactivar</Button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        {!p.activo && (
          <div className="bg-gris border border-gris-mid rounded p-2 text-xs text-gris-dark">
            <b>Dado de baja:</b> {p.baja_motivo}{p.baja_por_nombre && <> — {p.baja_por_nombre}, {fmtFecha(p.baja_at)}</>}
          </div>
        )}

        {editando ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {!soloDatosPago && (
              <>
                <Campo label="Razón social"><input value={form.razon_social} onChange={e => setForm(f => ({ ...f, razon_social: e.target.value }))} className={inputCls} /></Campo>
                <Campo label="CUIT"><input value={form.cuit} onChange={e => setForm(f => ({ ...f, cuit: e.target.value }))} className={inputCls} /></Campo>
              </>
            )}
            <Campo label="CBU"><input value={form.cbu} onChange={e => setForm(f => ({ ...f, cbu: e.target.value }))} className={`${inputCls} font-mono`} /></Campo>
            <Campo label="Alias"><input value={form.alias_cbu} onChange={e => setForm(f => ({ ...f, alias_cbu: e.target.value }))} className={inputCls} /></Campo>
            <Campo label="Banco"><input value={form.banco} onChange={e => setForm(f => ({ ...f, banco: e.target.value }))} className={inputCls} /></Campo>
            <Campo label="Plazo de pago (días)"><input inputMode="numeric" value={form.plazo_pago_dias} onChange={e => setForm(f => ({ ...f, plazo_pago_dias: e.target.value }))} className={inputCls} /></Campo>
            <Campo label="Contacto"><input value={form.contacto} onChange={e => setForm(f => ({ ...f, contacto: e.target.value }))} className={inputCls} /></Campo>
            <Campo label="Teléfono"><input value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} className={inputCls} /></Campo>
            <Campo label="Email"><input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className={inputCls} /></Campo>
            {!soloDatosPago && (
              <div className="sm:col-span-2 text-[11px] text-naranja-dark">
                Cambiar el CBU o el alias le quita la aprobación a las facturas aprobadas sin pagar de este proveedor: hay que volver a aprobarlas.
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Dato label="CUIT" valor={p.cuit ?? '—'} />
              <Dato label="CBU" valor={p.cbu ?? '—'} />
              <Dato label="Alias" valor={p.alias_cbu ?? '—'} />
              <Dato label="Banco" valor={p.banco || '—'} />
              <Dato label="Plazo de pago" valor={`${p.plazo_pago_dias} días`} />
              <Dato label="Saldo" valor={fmtM(p.saldo)} fuerte />
              <Dato label="Listo para pagar" valor={fmtM(p.saldo_aprobado)} />
              <Dato label="Último pago" valor={fmtFecha(p.ultimo_pago)} />
            </div>
            {(p.contacto || p.telefono || p.email) && (
              <div className="text-xs text-gris-dark">
                {[p.contacto, p.telefono, p.email].filter(Boolean).join(' · ')}
              </div>
            )}
            {p.datos_pago_actualizados_at && (
              <div className="text-[11px] text-gris-dark">
                Datos de pago actualizados el {fmtFecha(p.datos_pago_actualizados_at)}
                {p.datos_pago_actualizados_por_nombre && <> por {p.datos_pago_actualizados_por_nombre}</>}.
              </div>
            )}
          </>
        )}

        {p.facturas_abiertas.length > 0 && (
          <div className="border-t border-gris pt-2">
            <div className="text-[11px] font-bold text-gris-dark uppercase tracking-wide mb-1">Facturas abiertas</div>
            <table className="w-full text-xs">
              <tbody>
                {p.facturas_abiertas.map(f => (
                  <tr key={f.id} className="border-b border-gris last:border-0">
                    <td className="py-1">
                      {comprobanteTxt(f.tipo_comprobante, f.numero)}
                      <span className="block text-[10px] text-gris-dark">{f.descripcion}</span>
                    </td>
                    <td className={`py-1 text-right text-[11px] ${f.vencida ? 'text-rojo font-bold' : 'text-gris-dark'}`}>{fmtFecha(f.vence_el)}</td>
                    <td className="py-1 text-right font-mono tabular-nums">{fmtM(f.saldo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {p.historial_datos_pago.length > 0 && (
          <div className="border-t border-gris pt-2">
            <div className="text-[11px] font-bold text-gris-dark uppercase tracking-wide mb-1">Cambios de CBU / alias</div>
            <ul className="text-[11px] text-gris-dark flex flex-col gap-0.5">
              {p.historial_datos_pago.map(h => (
                <li key={h.id}>{fmtFecha(h.created_at)} · {h.user_nombre ?? '—'} · {h.detalle}</li>
              ))}
            </ul>
          </div>
        )}

        {pidiendoBaja && (
          <div className="border-t border-gris pt-3">
            <label className="block text-xs font-semibold text-gris-dark mb-1">Motivo de la baja</label>
            <input value={motivo} onChange={e => setMotivo(e.target.value)} autoFocus className={inputCls} />
            <div className="flex gap-2 justify-end mt-2">
              <Button variant="ghost" size="sm" onClick={() => { setPidiendoBaja(false); setMotivo('') }}>Cancelar</Button>
              <Button variant="danger" size="sm" loading={baja.isPending} disabled={motivo.trim().length < 3}
                onClick={async () => {
                  try { await baja.mutateAsync({ id: p.id, motivo: motivo.trim() }); toast('✓ Proveedor dado de baja', 'ok'); onClose() }
                  catch (e) { toast(mensajeErrorPagos(e), 'err') }
                }}>Confirmar baja</Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

const inputCls = 'w-full px-2.5 py-2 border-[1.5px] border-gris-mid rounded text-sm bg-white outline-none focus:border-naranja'

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs font-semibold text-gris-dark mb-1">{label}</label>{children}</div>
}
function Dato({ label, valor, fuerte }: { label: string; valor: string; fuerte?: boolean }) {
  return (
    <div>
      <div className="text-[10px] font-bold text-gris-dark uppercase tracking-wide">{label}</div>
      <div className={fuerte ? 'font-mono font-bold tabular-nums' : 'font-mono text-xs'}>{valor}</div>
    </div>
  )
}
function Tilde({ label, on, set }: { label: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-1.5 cursor-pointer select-none text-gris-dark">
      <input type="checkbox" className="accent-naranja" checked={on} onChange={e => set(e.target.checked)} />
      {label}
    </label>
  )
}
