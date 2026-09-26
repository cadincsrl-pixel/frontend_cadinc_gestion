'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Combobox } from '@/components/ui/Combobox'
import { Modal } from '@/components/ui/Modal'
import { Pagination } from '@/components/ui/Pagination'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import {
  useProveedoresPagos, useProveedorPagos, useEditarProveedorPagos, useDatosPagoProveedor, useGuardarContactosProveedor,
  useBajaProveedorPagos, useReactivarProveedorPagos, fetchProveedoresExport,
  useActualizarProveedorDesdeArca, useActualizarTodosDesdeArca, useRecalcularVencimientos,
  type PagosProveedoresFiltro, type RecalcVencimientosRes,
} from '../hooks/useProveedoresPagos'
import { FORMAS_PREVISTAS, comprobanteTxt, fmtFecha, fmtM } from '../utils/pagos.utils'
import { mensajeAvisoPagos, mensajeErrorPagos } from '../utils/pagos.errores'
import { VENCIMIENTO_MODOS, cantidadDe, condicionIvaTxt, tipoPersonaTxt, type VencimientoModo } from '../utils/pagos.utils'
import { CamposArcaProveedor, datosArcaDesde, datosArcaParaGuardar, datosArcaVacios, type DatosArcaForm } from './CamposArcaProveedor'
import type { PagosActualizarDesdeArcaRes, PagosActualizarTodosArcaRes, PagosFormaPrevista, PagosProveedor } from '@/types/domain.types'
import { exportarProveedoresPagos } from '../utils/pagosExport'
import { AltaRapidaProveedor } from './AltaRapidaProveedor'
import { useConceptosPagos } from '../hooks/useConceptosPagos'
import { useCatalogoObrasPagos, useCuentasOrigen } from '../hooks/usePagos'
import { ContactosEditor, contactosDesde, contactosParaGuardar, validarContactos } from '@/components/contactos/ContactosEditor'
import { ETIQUETA_ROL, type ContactoInput } from '@/types/contactos'

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
  const [arcaTodos, setArcaTodos] = useState(false)

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
          <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Buscar por razón social, CUIT o código (PRV-0001)…"
                 className="flex-1 min-w-0 px-2.5 py-2 border-[1.5px] border-gris-mid rounded text-xs bg-white outline-none focus:border-naranja" />
          <Button type="submit" variant="secondary" size="sm">Buscar</Button>
        </form>
        <div className="flex gap-3 flex-wrap text-xs pb-2">
          <Tilde label="Sin CUIT"          on={!!filtro.sin_cuit}       set={v => patch({ sin_cuit: v || undefined })} />
          <Tilde label="Sin CBU ni alias" on={!!filtro.sin_datos_pago} set={v => patch({ sin_datos_pago: v || undefined })} />
          <Tilde label="Incluir dados de baja" on={!!filtro.inactivos}  set={v => patch({ inactivos: v || undefined })} />
        </div>
        <Button size="sm" onClick={() => setAlta(true)} disabled={!puedeCrear}
                title={puedeCrear ? 'Agregar un proveedor al padrón' : 'No tenés permiso para dar de alta proveedores'}>
          + Nuevo proveedor
        </Button>
        <Button variant="secondary" size="sm" onClick={exportar} loading={exportando}>📊 Excel</Button>
        <Button variant="secondary" size="sm" onClick={() => setArcaTodos(true)} disabled={!puedeEditar}
                title={puedeEditar
                  ? 'Trae de ARCA domicilio, provincia y condición IVA de todos los proveedores activos con CUIT (no toca la razón social)'
                  : 'No tenés permiso para editar proveedores'}>
          Actualizar todos desde ARCA
        </Button>
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
                    {['Código', 'Razón social', 'CUIT', 'Condición', 'Cuenta', 'Plazo', 'Facturas', 'Saldo', ''].map((h, i) => (
                      <th key={h + i} className={`bg-gris text-gris-dark text-[10px] font-bold px-3 py-2 uppercase tracking-wide whitespace-nowrap ${i >= 5 && i <= 7 ? 'text-right' : 'text-left'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map(p => (
                    <tr key={p.id} className={`border-t border-gris hover:bg-azul-light/30 cursor-pointer ${p.activo ? '' : 'opacity-60'}`}
                        onClick={() => setFichaId(p.id)}>
                      <td className="px-3 py-2 text-xs font-mono whitespace-nowrap text-gris-dark">{p.codigo ?? '—'}</td>
                      <td className="px-3 py-2 text-sm">
                        <span className="font-semibold">{p.razon_social}</span>
                        {!p.activo && <span className="ml-1 text-[10px] px-1.5 rounded bg-gris text-gris-dark font-bold uppercase">baja</span>}
                        {p.banco && <span className="block text-[11px] text-gris-dark">{p.banco}</span>}
                      </td>
                      <td className="px-3 py-2 text-xs font-mono">
                        {p.cuit ?? <span className="text-naranja-dark">sin CUIT</span>}
                      </td>
                      <td className="px-3 py-2 text-[11px] text-gris-dark max-w-[160px]"
                          title={p.padron_consultado_at ? `Consultado en ARCA el ${fmtFecha(p.padron_consultado_at)}` : undefined}>
                        {condicionIvaTxt(p.condicion_iva_id) ?? <span className="text-gris-mid">—</span>}
                      </td>
                      <td className="px-3 py-2 text-xs font-mono">
                        {/* Gris, no naranja: el CBU es opcional. Sólo hace falta
                            para transferir; los cheques se emiten con el CUIT. */}
                        {p.cbu ?? p.alias_cbu ?? <span className="text-gris-mid font-sans">—</span>}
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
                      <div className="text-[11px] text-gris-dark font-mono">{p.codigo ? `${p.codigo} · ` : ''}{p.cuit ?? 'sin CUIT'}</div>
                      {p.condicion_iva_id != null && <div className="text-[11px] text-gris-dark">{condicionIvaTxt(p.condicion_iva_id)}</div>}
                      <div className="text-[11px] text-gris-dark font-mono">{p.cbu ?? p.alias_cbu ?? '—'}</div>
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

      {arcaTodos && <ModalActualizarTodosArca onClose={() => setArcaTodos(false)} />}

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
  const guardarContactos = useGuardarContactosProveedor()
  const desdeArca = useActualizarProveedorDesdeArca()
  const recalc = useRecalcularVencimientos()
  const [recalcRes, setRecalcRes] = useState<RecalcVencimientosRes | null>(null)
  const [arcaTodo, setArcaTodo] = useState(false)
  const [arcaRes, setArcaRes] = useState<PagosActualizarDesdeArcaRes | null>(null)
  const [datosArca, setDatosArca] = useState<DatosArcaForm>(datosArcaVacios)
  // Contactos (20260925e): varios por proveedor (vendedor, administración…).
  // Los edita quien edita la ficha; el contador (solo datos de pago) los ve.
  const [contactos, setContactos] = useState<ContactoInput[]>([])
  const [errorContactos, setErrorContactos] = useState<{ i: number; mensaje: string } | null>(null)

  const [editando, setEditando] = useState(false)
  // Cuentas propias para «Cuenta que le debita el banco» (débito automático, 20261009a).
  const cuentasOrigen = useCuentasOrigen()
  const [form, setForm] = useState({ razon_social: '', cuit: '', alias_cbu: '', cbu: '', banco: '', plazo_pago_dias: '30', vencimiento_modo: 'dias' as VencimientoModo, cierre_dia: '', forma_pago_habitual: '' as PagosFormaPrevista | '', debito_cuenta_id: '', concepto_habitual_id: '', obra_habitual_cod: '', icl_computa_pago_a_cuenta: false })
  const [pidiendoBaja, setPidiendoBaja] = useState(false)
  const [motivo, setMotivo] = useState('')

  // Concepto y centro de costo habituales (20260930p). Se ofrecen los activos
  // más el que ya tenga (aunque se haya dado de baja o archivado), para no
  // mostrar el select vacío.
  const conceptos = useConceptosPagos(true)
  const obras = useCatalogoObrasPagos()
  const conceptoOpts = useMemo(
    () => (conceptos.data ?? []).filter(c => c.activo || String(c.id) === form.concepto_habitual_id),
    [conceptos.data, form.concepto_habitual_id],
  )
  const obraOpts = useMemo(
    () => (obras.data ?? [])
      .filter(o => !o.archivada || o.cod === form.obra_habitual_cod)
      .map(o => ({
        value: o.cod, label: o.nom, sub: o.cod + (o.archivada ? ' · archivada' : ''),
        group: o.es_interna || o.es_deposito ? 'Estructura CADINC' : 'Obras',
        search: [o.nom, o.cod, o.cc ?? ''],
      })),
    [obras.data, form.obra_habitual_cod],
  )
  const conceptoHabitualTxt = p?.concepto_habitual_id != null
    ? (conceptos.data ?? []).find(c => c.id === p.concepto_habitual_id)?.nombre ?? `Concepto #${p.concepto_habitual_id}`
    : null
  const obraHabitualTxt = p?.obra_habitual_cod
    ? (obras.data ?? []).find(o => o.cod === p.obra_habitual_cod)?.nom ?? p.obra_habitual_cod
    : null

  function abrirEdicion() {
    if (!p) return
    setForm({
      razon_social: p.razon_social, cuit: p.cuit ?? '', alias_cbu: p.alias_cbu ?? '', cbu: p.cbu ?? '',
      banco: p.banco ?? '', plazo_pago_dias: String(p.plazo_pago_dias ?? 30),
      vencimiento_modo: p.vencimiento_modo ?? 'dias', cierre_dia: p.cierre_dia != null ? String(p.cierre_dia) : '',
      forma_pago_habitual: p.forma_pago_habitual ?? '',
      debito_cuenta_id: p.debito_cuenta_id != null ? String(p.debito_cuenta_id) : '',
      concepto_habitual_id: p.concepto_habitual_id != null ? String(p.concepto_habitual_id) : '',
      obra_habitual_cod: p.obra_habitual_cod ?? '',
      icl_computa_pago_a_cuenta: !!p.icl_computa_pago_a_cuenta,
    })
    setContactos(contactosDesde(p.contactos, p.email))
    setErrorContactos(null)
    setDatosArca(datosArcaDesde(p))
    setEditando(true)
  }

  async function guardar() {
    if (!p) return
    if (!soloDatosPago) {
      const errC = validarContactos(contactos)
      setErrorContactos(errC)
      if (errC) return
    }
    try {
      // El contador solo puede tocar los datos de pago: es otra ruta, con su
      // propio permiso. Elegir la correcta acá evita un 403 confuso.
      const r = soloDatosPago
        ? await datosPago.mutateAsync({
            id: p.id, cbu: form.cbu.trim() || null, alias_cbu: form.alias_cbu.trim() || null,
            banco: form.banco.trim(), plazo_pago_dias: Number(form.plazo_pago_dias) || 30,
            forma_pago_habitual: form.forma_pago_habitual || null,
            debito_cuenta_id: form.forma_pago_habitual === 'debito_automatico' && form.debito_cuenta_id ? Number(form.debito_cuenta_id) : null,
          })
        : await editar.mutateAsync({
            id: p.id, razon_social: form.razon_social.trim(), cuit: form.cuit.trim() || null,
            cbu: form.cbu.trim() || null, alias_cbu: form.alias_cbu.trim() || null,
            banco: form.banco.trim(), plazo_pago_dias: Number(form.plazo_pago_dias) || 30,
            vencimiento_modo: form.vencimiento_modo,
            forma_pago_habitual: form.forma_pago_habitual || null,
            debito_cuenta_id: form.forma_pago_habitual === 'debito_automatico' && form.debito_cuenta_id ? Number(form.debito_cuenta_id) : null,
            concepto_habitual_id: form.concepto_habitual_id ? Number(form.concepto_habitual_id) : null,
            obra_habitual_cod: form.obra_habitual_cod || null,
            icl_computa_pago_a_cuenta: form.icl_computa_pago_a_cuenta,
            // Con cierre mensual, vacío = el último día del mes (el caso Silva).
            cierre_dia: form.vencimiento_modo === 'cierre_mensual' ? (Number(form.cierre_dia) || null) : null,
            ...datosArcaParaGuardar(datosArca),
          })
      // Los avisos del PATCH primero (p. ej. «le quitó la aprobación» por cambio de CBU):
      // no se pueden perder aunque después fallen los contactos.
      for (const a of r.avisos) toast(mensajeAvisoPagos(a), 'warn')
      if (!soloDatosPago) {
        try {
          await guardarContactos.mutateAsync({ id: p.id, contactos: contactosParaGuardar(contactos) })
        } catch (e) {
          // La ficha ya quedó guardada: se avisa y la edición queda abierta para reintentar.
          toast(`La ficha se guardó, pero los contactos no: ${mensajeErrorPagos(e)}`, 'err')
          return
        }
      }
      toast('✓ Proveedor actualizado', 'ok')
      setEditando(false)
      // Cambió cómo vence: las facturas ya cargadas no se tocan solas; se
      // muestra qué cambiaría para que lo apliquen si corresponde.
      const cambioVence = !soloDatosPago && (form.vencimiento_modo !== (p.vencimiento_modo ?? 'dias')
        || (Number(form.plazo_pago_dias) || 30) !== (p.plazo_pago_dias ?? 30)
        || (form.vencimiento_modo === 'cierre_mensual' ? (Number(form.cierre_dia) || null) : null) !== (p.cierre_dia ?? null))
      if (cambioVence) void verRecalculo()
    } catch (e) { toast(mensajeErrorPagos(e), 'err') }
  }

  async function verRecalculo() {
    if (!p) return
    try { setRecalcRes(await recalc.mutateAsync({ id: p.id, aplicar: false })) }
    catch (e) { toast(mensajeErrorPagos(e), 'err') }
  }
  async function aplicarRecalculo() {
    if (!p) return
    try {
      const r = await recalc.mutateAsync({ id: p.id, aplicar: true })
      toast(`✓ ${r.cambian} vencimiento${r.cambian === 1 ? '' : 's'} recalculado${r.cambian === 1 ? '' : 's'}`, 'ok')
      setRecalcRes(null)
    } catch (e) { toast(mensajeErrorPagos(e), 'err') }
  }

  if (isLoading || !p) {
    return <Modal open onClose={onClose} title="Proveedor" width="max-w-2xl">
      <div className="p-8 text-center text-sm text-gris-dark">Cargando…</div>
    </Modal>
  }

  return (
    <Modal
      open onClose={onClose} width="max-w-2xl" title={p.codigo ? `${p.codigo} · ${p.razon_social}` : p.razon_social}
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
                <Button size="sm" onClick={guardar} loading={editar.isPending || datosPago.isPending || guardarContactos.isPending}>Guardar</Button>
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
                <div className="sm:col-span-2">
                  {/* Editando no se pisa una razón social que ya existe: para
                      eso está «Actualizar desde ARCA» con el tilde. */}
                  <CamposArcaProveedor cuit={form.cuit} razonSocial={form.razon_social}
                    onRazonSocial={v => setForm(f => (f.razon_social.trim() ? f : { ...f, razon_social: v }))}
                    value={datosArca} onChange={setDatosArca} inputCls={inputCls} />
                </div>
              </>
            )}
            <Campo label="CBU"><input value={form.cbu} onChange={e => setForm(f => ({ ...f, cbu: e.target.value }))} className={`${inputCls} font-mono`} /></Campo>
            <Campo label="Alias"><input value={form.alias_cbu} onChange={e => setForm(f => ({ ...f, alias_cbu: e.target.value }))} className={inputCls} /></Campo>
            <Campo label="Banco"><input value={form.banco} onChange={e => setForm(f => ({ ...f, banco: e.target.value }))} className={inputCls} /></Campo>
            {!soloDatosPago && (
              <Campo label="Cómo vence">
                <select value={form.vencimiento_modo} className={inputCls}
                  onChange={e => setForm(f => ({ ...f, vencimiento_modo: e.target.value as VencimientoModo }))}>
                  {VENCIMIENTO_MODOS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
                </select>
              </Campo>
            )}
            {form.vencimiento_modo !== 'fin_mes_siguiente' && (
              <Campo label={form.vencimiento_modo === 'cierre_mensual' ? 'Días desde el cierre' : 'Plazo de pago (días)'}>
                <input inputMode="numeric" value={form.plazo_pago_dias} onChange={e => setForm(f => ({ ...f, plazo_pago_dias: e.target.value }))} className={inputCls} />
              </Campo>
            )}
            {!soloDatosPago && form.vencimiento_modo === 'cierre_mensual' && (
              <Campo label="Cierra el día (vacío = el último)">
                <input inputMode="numeric" placeholder="último" value={form.cierre_dia}
                  onChange={e => setForm(f => ({ ...f, cierre_dia: e.target.value.replace(/\D/g, '').slice(0, 2) }))}
                  className={inputCls} />
              </Campo>
            )}
            <Campo label="Cómo se le paga (sus facturas nacen así)">
              <select value={form.forma_pago_habitual} className={inputCls}
                onChange={e => setForm(f => ({ ...f, forma_pago_habitual: e.target.value as PagosFormaPrevista | '' }))}>
                <option value="">Transferencia (sin preferencia)</option>
                {FORMAS_PREVISTAS.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
              </select>
            </Campo>
            {form.forma_pago_habitual === 'debito_automatico' && (
              <Campo label="Cuenta que le debita el banco">
                <select value={form.debito_cuenta_id} className={inputCls}
                  onChange={e => setForm(f => ({ ...f, debito_cuenta_id: e.target.value }))}>
                  <option value="">Ninguna: se paga a mano</option>
                  {(cuentasOrigen.data ?? []).filter(c => c.tipo === 'banco' || c.tipo === 'billetera' || c.tipo === 'tarjeta').map(c => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
              </Campo>
            )}
            {form.forma_pago_habitual === 'debito_automatico' && (
              <div className="sm:col-span-2 text-[11px] text-gris-dark">
                {form.debito_cuenta_id
                  ? 'Sus facturas se pagan solas al imputarlas: se aprueban y sale una orden de débito automático desde esa cuenta, con la fecha de la factura. Sus notas de crédito se descuentan de la factura siguiente.'
                  : 'Sin cuenta, sus facturas se pagan a mano como cualquier otra.'}
              </div>
            )}
            {(form.forma_pago_habitual === 'echeq' || form.forma_pago_habitual === 'cheque') && (
              <div className="sm:col-span-2 text-[11px] text-gris-dark">
                Cada factura nueva sale con un {form.forma_pago_habitual === 'echeq' ? 'e-cheq' : 'cheque'} al vencimiento
                ({form.vencimiento_modo === 'fin_mes_siguiente' ? 'último día del mes siguiente' : `${form.vencimiento_modo === 'cierre_mensual' ? 'cierre' : 'fecha de la factura'} + ${Number(form.plazo_pago_dias) || 30} días`}). Se puede cambiar en cada una.
              </div>
            )}
            {!soloDatosPago && (
              <>
                <Campo label="Concepto habitual">
                  <select value={form.concepto_habitual_id} className={inputCls}
                    disabled={conceptos.isLoading}
                    onChange={e => setForm(f => ({ ...f, concepto_habitual_id: e.target.value }))}>
                    <option value="">{conceptos.isLoading ? 'Cargando conceptos…' : 'Sin concepto habitual'}</option>
                    {conceptoOpts.map(c => <option key={c.id} value={c.id}>{c.nombre}{c.activo ? '' : ' (dado de baja)'}</option>)}
                  </select>
                </Campo>
                <Campo label="Centro de costo habitual">
                  <div className="flex gap-1 items-center">
                    <div className="flex-1 min-w-0">
                      <Combobox placeholder={obras.isLoading ? 'Cargando obras…' : 'Sin obra habitual'} options={obraOpts}
                        value={form.obra_habitual_cod}
                        onChange={v => setForm(f => ({ ...f, obra_habitual_cod: v }))} />
                    </div>
                    {form.obra_habitual_cod && (
                      <button type="button" className="text-rojo hover:bg-rojo-light px-2 py-1.5 rounded text-xs"
                        aria-label="Quitar la obra habitual" title="Quitar la obra habitual"
                        onClick={() => setForm(f => ({ ...f, obra_habitual_cod: '' }))}>✕</button>
                    )}
                  </div>
                </Campo>
                <div className="sm:col-span-2 text-[11px] text-gris-dark">
                  {form.concepto_habitual_id && form.obra_habitual_cod
                    ? 'Sus facturas nuevas se precargan con este concepto y el 100 % a esta obra, y las que se importan de ARCA entran ya imputadas (salvo que tengan tributos a revisar). Se puede cambiar en cada una.'
                    : form.concepto_habitual_id || form.obra_habitual_cod
                      ? 'Se precarga al cargar sus facturas a mano. Para que las importadas de ARCA entren ya imputadas hacen falta los dos.'
                      : 'Con concepto y centro de costo habituales, sus facturas nacen imputadas.'}
                </div>
                <label className="sm:col-span-2 flex items-start gap-2 text-xs cursor-pointer">
                  <input type="checkbox" className="mt-0.5" checked={form.icl_computa_pago_a_cuenta}
                    onChange={e => setForm(f => ({ ...f, icl_computa_pago_a_cuenta: e.target.checked }))} />
                  <span>
                    <b>Gasoil para camiones: el 45 % del ICL es pago a cuenta de IVA</b>
                    <span className="block text-[11px] text-gris-dark">
                      Ley 23.966 (transporte de carga). En sus facturas, el 45 % de cada «ICL/ITC» va a «ITC computable» y descuenta del IVA a pagar;
                      el 55 % restante y el IDC siguen siendo costo. No cambia la imputación a las obras.
                    </span>
                  </span>
                </label>
              </>
            )}
            {!soloDatosPago && form.vencimiento_modo === 'cierre_mensual' && (
              <div className="sm:col-span-2 text-[11px] text-gris-dark">
                Todo lo comprado en el mes vence junto: cierra {form.cierre_dia ? `el ${form.cierre_dia}` : 'el último día del mes'}, se corre al último día hábil y vence {Number(form.plazo_pago_dias) || 30} días después.
              </div>
            )}
            <div className="sm:col-span-2">
              {soloDatosPago
                ? <ListaContactos contactos={p.contactos} nota="Los contactos los edita quien puede editar la ficha." />
                : <ContactosEditor value={contactos} onChange={v => { setContactos(v); setErrorContactos(null) }} error={errorContactos} />}
            </div>
            {!soloDatosPago && (
              <div className="sm:col-span-2 text-[11px] text-naranja-dark">
                Cambiar el CBU o el alias le quita la aprobación a las facturas aprobadas sin pagar de este proveedor: hay que volver a aprobarlas.
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Dato label="Código" valor={p.codigo ?? '—'} />
              <Dato label="CUIT" valor={p.cuit ?? '—'} />
              <Dato label="CBU" valor={p.cbu ?? '—'} />
              <Dato label="Alias" valor={p.alias_cbu ?? '—'} />
              <Dato label="Banco" valor={p.banco || '—'} />
              <Dato label="Cómo vence" valor={
                p.vencimiento_modo === 'fin_mes_siguiente'
                  ? 'Fin del mes siguiente'
                  : p.vencimiento_modo === 'cierre_mensual'
                    ? `Cierre ${p.cierre_dia ? 'el ' + p.cierre_dia : 'fin de mes'} + ${p.plazo_pago_dias} días`
                    : `${p.plazo_pago_dias} días de cada factura`} />
              <Dato label="Cómo se le paga" valor={FORMAS_PREVISTAS.find(x => x.key === p.forma_pago_habitual)?.label ?? 'Transferencia'} />
              {p.forma_pago_habitual === 'debito_automatico' && (
                <Dato label="Débito desde" valor={p.debito_cuenta_id
                  ? `${(cuentasOrigen.data ?? []).find(c => c.id === p.debito_cuenta_id)?.nombre ?? 'cuenta #' + p.debito_cuenta_id} · se paga solo al imputar`
                  : 'sin cuenta: se paga a mano'} />
              )}
              <Dato label="Concepto habitual" valor={conceptoHabitualTxt ?? '—'} />
              <Dato label="Centro de costo habitual" valor={obraHabitualTxt ?? '—'} />
              {p.icl_computa_pago_a_cuenta && <Dato label="ICL de gasoil" valor="45 % pago a cuenta de IVA" />}
              <Dato label="Saldo" valor={fmtM(p.saldo)} fuerte />
              <Dato label="Listo para pagar" valor={fmtM(p.saldo_aprobado)} />
              <Dato label="Último pago" valor={fmtFecha(p.ultimo_pago)} />
              {Number(p.nc_disponible ?? 0) > 0 && <Dato label="NC sin aplicar" valor={fmtM(p.nc_disponible)} />}
              {p.saldo_neto != null && Number(p.saldo_neto) !== Number(p.saldo) && (
                <Dato label="Neto (− a cuenta − NC)" valor={fmtM(p.saldo_neto)} fuerte />
              )}
            </div>
            <DatosFiscales p={p} />
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="secondary" size="sm" loading={desdeArca.isPending}
                disabled={!puedeEditar || !p.cuit || !p.activo}
                title={!puedeEditar ? 'No tenés permiso para editar proveedores'
                  : !p.cuit ? 'El proveedor no tiene CUIT: cargáselo primero'
                  : !p.activo ? 'Está dado de baja: reactivalo primero'
                  : 'Trae domicilio, provincia, condición IVA y actividad del padrón de ARCA y los guarda en la ficha'}
                onClick={async () => {
                  setArcaRes(null)
                  try {
                    const r = await desdeArca.mutateAsync({ id: p.id, todo: arcaTodo })
                    setArcaRes(r)
                    const aplicados = r.diferencias.filter(d => d.aplicado).length
                    toast(aplicados ? `✓ ${aplicados} dato${aplicados === 1 ? '' : 's'} actualizado${aplicados === 1 ? '' : 's'} desde ARCA` : '✓ Consultado: ARCA dice lo mismo que la ficha', 'ok')
                  } catch (e) { toast(mensajeErrorPagos(e), 'err') }
                }}>
                Actualizar desde ARCA
              </Button>
              <label className="flex items-center gap-1.5 text-xs text-gris-dark cursor-pointer select-none"
                title="Sin el tilde, la razón social de la ficha no se toca">
                <input type="checkbox" className="accent-naranja" checked={arcaTodo} onChange={e => setArcaTodo(e.target.checked)}
                  disabled={!puedeEditar} />
                También la razón social
              </label>
              <Button variant="secondary" size="sm" loading={recalc.isPending && !recalcRes}
                disabled={!puedeEditar}
                title={puedeEditar ? 'Muestra qué vencimiento tendrían sus facturas impagas con «Cómo vence» y deja aplicarlo' : 'No tenés permiso para editar proveedores'}
                onClick={verRecalculo}>
                Recalcular vencimientos
              </Button>
            </div>
            {arcaRes && <DiferenciasArca res={arcaRes} />}
            {recalcRes && (
              <div className="border border-gris-mid rounded p-2 text-xs flex flex-col gap-2">
                {recalcRes.cambian === 0 ? (
                  <div className="text-gris-dark">Todas sus facturas impagas ya vencen según «Cómo vence». No hay nada que cambiar.</div>
                ) : (
                  <>
                    <div><b>{recalcRes.cambian}</b> factura{recalcRes.cambian === 1 ? '' : 's'} impaga{recalcRes.cambian === 1 ? '' : 's'} cambia{recalcRes.cambian === 1 ? '' : 'n'} de vencimiento con la regla actual:</div>
                    <div className="max-h-48 overflow-y-auto">
                      <table className="w-full">
                        <thead><tr className="text-gris-dark text-left"><th className="font-semibold">Factura</th><th className="font-semibold">Fecha</th><th className="font-semibold">Vence hoy</th><th className="font-semibold">Pasa a vencer</th></tr></thead>
                        <tbody>
                          {recalcRes.facturas.map(f => (
                            <tr key={f.id}><td className="font-mono">{f.numero}</td><td>{fmtFecha(f.fecha)}</td><td>{f.antes ? fmtFecha(f.antes) : 'sin vencimiento'}</td><td className="font-semibold">{fmtFecha(f.despues)}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" size="sm" onClick={() => setRecalcRes(null)}>{recalcRes.cambian === 0 ? 'Cerrar' : 'No cambiar'}</Button>
                  {recalcRes.cambian > 0 && (
                    <Button size="sm" loading={recalc.isPending} disabled={!puedeEditar} onClick={aplicarRecalculo}>Aplicar a {recalcRes.cambian}</Button>
                  )}
                </div>
              </div>
            )}
            <ListaContactos contactos={p.contactos} />
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
                      {f.nc_txt && <span className="block text-[10px] text-[#5A2D82]">{f.nc_txt}</span>}
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

/** Contactos de solo lectura; «✉ avisos» marca los que reciben el aviso de pago. */
function ListaContactos({ contactos, nota }: { contactos?: import('@/types/contactos').Contacto[]; nota?: string }) {
  if (!contactos?.length) {
    return <div className="text-xs text-gris-dark italic">Sin contactos cargados.{nota ? ` ${nota}` : ''}</div>
  }
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-[11px] font-bold text-gris-dark uppercase tracking-wide">Contactos</div>
      {contactos.map(k => (
        <div key={k.id} className="text-xs flex gap-1.5 flex-wrap items-center">
          <b>{k.nombre || ETIQUETA_ROL[k.rol]}</b>
          {k.nombre && <span className="text-gris-dark">({ETIQUETA_ROL[k.rol]})</span>}
          {k.email && <span className="font-mono">{k.email}</span>}
          {k.telefono && <span className="text-gris-dark">{k.telefono}</span>}
          {k.recibe_avisos && k.email && <span className="text-[10px] px-1 rounded bg-verde-light text-verde font-bold">✉ avisos</span>}
        </div>
      ))}
      {nota && <div className="text-[11px] text-gris-dark">{nota}</div>}
    </div>
  )
}

/** Domicilio, condición IVA y actividad: lo que vino de ARCA o se cargó a mano. */
function DatosFiscales({ p }: { p: PagosProveedor }) {
  const domicilio = [p.domicilio, p.provincia].filter(Boolean).join(', ')
  return (
    <div className="border-t border-gris pt-2 flex flex-col gap-1">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Dato label="Condición frente al IVA" valor={condicionIvaTxt(p.condicion_iva_id) ?? 'Sin especificar'} />
        <Dato label="Domicilio" valor={domicilio || '—'} />
        {p.tipo_persona && <Dato label="Tipo" valor={tipoPersonaTxt(p.tipo_persona) ?? p.tipo_persona} />}
        {p.actividad_principal && <Dato label="Actividad principal" valor={p.actividad_principal} />}
      </div>
      <div className="text-[11px] text-gris-dark">
        {p.padron_consultado_at
          ? <>Consultado en ARCA el {fmtFecha(p.padron_consultado_at)}.</>
          : <>Nunca se consultó en ARCA.</>}
      </div>
    </div>
  )
}

const CAMPO_ARCA: Record<string, string> = {
  razon_social: 'Razón social', domicilio: 'Domicilio', provincia: 'Provincia',
  condicion_iva_id: 'Condición IVA', tipo_persona: 'Tipo de persona', actividad_principal: 'Actividad',
}

function valorArca(campo: string, v: unknown): string {
  if (v == null || v === '') return '—'
  if (campo === 'condicion_iva_id') return condicionIvaTxt(Number(v)) ?? String(v)
  return String(v)
}

/** Qué cambió la última consulta: lo aplicado y lo que ARCA dice distinto pero no se tocó. */
function DiferenciasArca({ res }: { res: PagosActualizarDesdeArcaRes }) {
  if (res.diferencias.length === 0) {
    return <div className="text-[11px] text-verde">ARCA dice lo mismo que la ficha.</div>
  }
  return (
    <ul className="text-[11px] text-gris-dark flex flex-col gap-0.5 rounded border border-gris-mid bg-gris/40 p-2">
      {res.diferencias.map(d => (
        <li key={d.campo}>
          <b>{CAMPO_ARCA[d.campo] ?? d.campo}:</b> {valorArca(d.campo, d.actual)} → {valorArca(d.campo, d.arca)}
          {d.aplicado ? <span className="text-verde font-semibold"> (actualizado)</span> : <span> (no se cambió: tildá «También la razón social» o editalo a mano)</span>}
        </li>
      ))}
    </ul>
  )
}

/**
 * «Actualizar todos desde ARCA»: la confirmación va en el propio modal (nunca
 * confirm() del navegador) y después muestra el resumen. Va de a un proveedor
 * por vez porque ARCA limita: puede tardar un rato.
 */
function ModalActualizarTodosArca({ onClose }: { onClose: () => void }) {
  const todos = useActualizarTodosDesdeArca()
  const [res, setRes] = useState<PagosActualizarTodosArcaRes | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function correr() {
    setError(null)
    try { setRes(await todos.mutateAsync()) }
    catch (e) { setError(mensajeErrorPagos(e)) }
  }

  return (
    <Modal
      open onClose={todos.isPending ? () => {} : onClose} width="max-w-lg" title="Actualizar todos desde ARCA"
      footer={
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={todos.isPending}>{res ? 'Cerrar' : 'Cancelar'}</Button>
          {!res && <Button size="sm" onClick={correr} loading={todos.isPending}>Sí, actualizar</Button>}
        </div>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        {!res && (
          <div className="text-xs text-gris-dark">
            Se consulta el padrón de ARCA para <b>cada proveedor activo con CUIT</b> y se guardan su domicilio,
            provincia, condición frente al IVA y actividad. <b>La razón social no se toca.</b> Va de a uno
            (ARCA no deja consultar muchos juntos), así que puede tardar unos minutos: no cierres esta ventana.
          </div>
        )}
        {todos.isPending && <div className="text-xs text-azul animate-pulse">Consultando a ARCA…</div>}
        {error && <div className="rounded border border-rojo/40 bg-rojo-light p-2 text-xs text-rojo">{error}</div>}
        {res && (
          <>
            <div className="grid grid-cols-3 gap-2">
              <Dato label="Actualizados" valor={String(cantidadDe(res.actualizados))} fuerte />
              <Dato label="Sin CUIT" valor={String(cantidadDe(res.sin_cuit))} />
              <Dato label="Con error" valor={String(res.errores.length)} />
            </div>
            {res.errores.length > 0 && (
              <div>
                <div className="text-[11px] font-bold text-gris-dark uppercase tracking-wide mb-1">No se pudieron actualizar</div>
                <ul className="text-xs flex flex-col gap-0.5 max-h-60 overflow-y-auto">
                  {res.errores.map(e => (
                    <li key={e.proveedor_id}>
                      <b>{e.razon_social}</b>: <span className="text-gris-dark">{mensajeErrorPagos(new Error(e.error))}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}
