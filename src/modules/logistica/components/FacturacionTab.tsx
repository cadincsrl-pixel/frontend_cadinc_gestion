'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import {
  useEmpresas, useCreateEmpresa, useUpdateEmpresa, useDeleteEmpresa,
  useTarifasEmpresa, useUpsertTarifaEmpresa, useDeleteTarifaEmpresa,
  useCobros, useCreateCobro, useMarcarCobrado, useDeleteCobro,
  useTramos, useCanteras,
} from '../hooks/useLogistica'
import { Modal }  from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Badge }  from '@/components/ui/Badge'
import { useToast } from '@/components/ui/Toast'
import { useForm as useRHF } from 'react-hook-form'
import { usePermisos } from '@/hooks/usePermisos'
import type { EmpresaTransportista, TarifaEmpresaCantera, Tramo, Cobro } from '@/types/domain.types'

function fmtM(n: number) {
  return '$' + n.toLocaleString('es-AR', { maximumFractionDigits: 0 })
}
function fmtTon(n: number) {
  return n.toLocaleString('es-AR', { maximumFractionDigits: 2 }) + ' tn'
}
function fmtFecha(s: string) {
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

// ─── Sección empresas ─────────────────────────────────────────────────────────

function EmpresasSection({
  onSelectEmpresa,
  empresaSeleccionada,
}: {
  onSelectEmpresa: (e: EmpresaTransportista | null) => void
  empresaSeleccionada: EmpresaTransportista | null
}) {
  const toast = useToast()
  const { puedeCrear, puedeEditar, puedeEliminar } = usePermisos('logistica')
  const { data: empresas = [] } = useEmpresas()
  const { mutate: create, isPending: creating } = useCreateEmpresa()
  const { mutate: update, isPending: updating } = useUpdateEmpresa()
  const { mutate: remove } = useDeleteEmpresa()

  const [modalNueva, setModalNueva] = useState(false)
  const [editando,   setEditando]   = useState<EmpresaTransportista | null>(null)
  const formNueva = useForm<any>()
  const formEdit  = useForm<any>()

  function handleCreate(data: any) {
    create(data, {
      onSuccess: () => { toast('✓ Empresa agregada', 'ok'); setModalNueva(false); formNueva.reset() },
      onError:   () => toast('Error al agregar', 'err'),
    })
  }

  function handleUpdate(data: any) {
    if (!editando) return
    update({ id: editando.id, dto: data }, {
      onSuccess: () => { toast('✓ Empresa actualizada', 'ok'); setEditando(null) },
      onError:   () => toast('Error al actualizar', 'err'),
    })
  }

  function openEdit(e: EmpresaTransportista) {
    formEdit.reset({ nombre: e.nombre, cuit: e.cuit ?? '', tel: e.tel ?? '', email: e.email ?? '', obs: e.obs ?? '', estado: e.estado })
    setEditando(e)
  }

  const EmpresaForm = ({ form }: { form: any }) => (
    <div className="flex flex-col gap-3">
      <Input label="Nombre / Razón social" placeholder="Empresa S.A." {...form.register('nombre')} />
      <div className="grid grid-cols-2 gap-3">
        <Input label="CUIT" placeholder="20-12345678-9" {...form.register('cuit')} />
        <Input label="Teléfono" placeholder="299-XXX-XXXX" {...form.register('tel')} />
      </div>
      <Input label="Email" placeholder="contacto@empresa.com" {...form.register('email')} />
      <Input label="Observaciones" placeholder="Notas..." {...form.register('obs')} />
    </div>
  )

  return (
    <>
      <div className="bg-white rounded-card shadow-card">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gris">
          <div>
            <h2 className="font-bold text-azul text-base">Empresas transportistas</h2>
            <p className="text-xs text-gris-dark mt-0.5">Tus clientes — hacé clic en una para ver su tarifa por cantera</p>
          </div>
          {puedeCrear && (
            <Button variant="primary" size="sm" onClick={() => setModalNueva(true)}>＋ Nueva empresa</Button>
          )}
        </div>
        <div className="divide-y divide-gris">
          {empresas.length === 0 && (
            <p className="text-center py-8 text-sm text-gris-dark">No hay empresas registradas.</p>
          )}
          {empresas.map(e => (
            <div
              key={e.id}
              onClick={() => onSelectEmpresa(empresaSeleccionada?.id === e.id ? null : e)}
              className={`flex items-center justify-between px-5 py-3 cursor-pointer transition-colors ${
                empresaSeleccionada?.id === e.id ? 'bg-azul-light' : 'hover:bg-gris/40'
              }`}
            >
              <div>
                <div className="font-bold text-sm text-carbon">{e.nombre}</div>
                <div className="text-xs text-gris-dark">{e.cuit || '—'}{e.tel ? ` · ${e.tel}` : ''}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                  e.estado === 'activa' ? 'bg-verde-light text-verde' : 'bg-gris text-gris-dark'
                }`}>{e.estado}</span>
                {puedeEditar && (
                  <button onClick={ev => { ev.stopPropagation(); openEdit(e) }}
                    className="text-xs px-2 py-1 rounded hover:bg-gris transition-colors">✏️</button>
                )}
                {puedeEliminar && (
                  <button onClick={ev => { ev.stopPropagation(); if (confirm(`¿Eliminar ${e.nombre}?`)) remove(e.id, { onSuccess: () => toast('✓ Eliminada', 'ok') }) }}
                    className="text-xs px-2 py-1 rounded hover:bg-rojo-light text-gris-dark hover:text-rojo transition-colors">✕</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <Modal open={modalNueva} onClose={() => setModalNueva(false)} title="🏢 NUEVA EMPRESA"
        footer={<><Button variant="secondary" onClick={() => setModalNueva(false)}>Cancelar</Button><Button variant="primary" loading={creating} onClick={formNueva.handleSubmit(handleCreate)}>✓ Guardar</Button></>}>
        <EmpresaForm form={formNueva} />
      </Modal>
      <Modal open={!!editando} onClose={() => setEditando(null)} title="✏️ EDITAR EMPRESA"
        footer={<><Button variant="secondary" onClick={() => setEditando(null)}>Cancelar</Button><Button variant="primary" loading={updating} onClick={formEdit.handleSubmit(handleUpdate)}>✓ Guardar</Button></>}>
        <EmpresaForm form={formEdit} />
      </Modal>
    </>
  )
}

// ─── Tarifas de una empresa ───────────────────────────────────────────────────

function fmtDate(s: string) {
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

function TarifasEmpresaSection({ empresa }: { empresa: EmpresaTransportista }) {
  const toast = useToast()
  const { puedeCrear, puedeEliminar } = usePermisos('logistica')
  const { data: todasTarifas = [] } = useTarifasEmpresa()
  const { data: canteras     = [] } = useCanteras()
  const { mutate: crear, isPending: saving } = useUpsertTarifaEmpresa()
  const { mutate: remove } = useDeleteTarifaEmpresa()

  const tarifas = todasTarifas.filter(t => t.empresa_id === empresa.id)

  // Agrupar por cantera_id, ordenadas por vigente_desde desc (la primera es la vigente)
  const porCantera = canteras
    .map(c => ({
      cantera: c,
      historial: tarifas
        .filter(t => t.cantera_id === c.id)
        .sort((a, b) => b.vigente_desde.localeCompare(a.vigente_desde)),
    }))
    .filter(g => g.historial.length > 0)

  const [modal, setModal] = useState(false)
  const [expandida, setExpandida] = useState<number | null>(null)
  const form = useForm<any>({ defaultValues: { vigente_desde: new Date().toISOString().slice(0, 10) } })

  function handleSubmit(data: any) {
    crear({
      empresa_id:    empresa.id,
      cantera_id:    Number(data.cantera_id),
      valor_ton:     Number(data.valor_ton),
      vigente_desde: data.vigente_desde,
      obs:           data.obs ?? '',
    }, {
      onSuccess: () => { toast('✓ Tarifa guardada', 'ok'); setModal(false); form.reset({ vigente_desde: new Date().toISOString().slice(0, 10) }) },
      onError:   () => toast('Error al guardar', 'err'),
    })
  }

  const canteraOptions = [
    { value: '', label: 'Seleccionar cantera…' },
    ...canteras.map(c => ({ value: c.id, label: c.nombre + (c.localidad ? ` — ${c.localidad}` : '') })),
  ]

  return (
    <>
      <div className="bg-white rounded-card shadow-card">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gris">
          <div>
            <h2 className="font-bold text-azul text-base">Tarifas — {empresa.nombre}</h2>
            <p className="text-xs text-gris-dark mt-0.5">Historial de $/ton por cantera · cada entrega usa la tarifa vigente en su fecha de descarga</p>
          </div>
          {puedeCrear && (
            <Button variant="primary" size="sm" onClick={() => setModal(true)}>＋ Nueva tarifa</Button>
          )}
        </div>

        {porCantera.length === 0 ? (
          <p className="text-center py-6 text-sm text-gris-dark">Sin tarifas. Agregá una con el botón de arriba.</p>
        ) : (
          <div className="divide-y divide-gris">
            {porCantera.map(({ cantera, historial }) => {
              const vigente  = historial[0]
              const pasadas  = historial.slice(1)
              const expanded = expandida === cantera.id

              return (
                <div key={cantera.id} className="px-5 py-3">
                  {/* Fila vigente */}
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <span className="font-bold text-sm text-carbon">{cantera.nombre}</span>
                      {cantera.localidad && <span className="text-xs text-gris-dark ml-2">{cantera.localidad}</span>}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="font-mono font-bold text-verde">
                          ${Number(vigente.valor_ton).toLocaleString('es-AR', { minimumFractionDigits: 2 })}/ton
                        </div>
                        <div className="text-[11px] text-gris-dark">desde {fmtDate(vigente.vigente_desde)}</div>
                      </div>
                      {pasadas.length > 0 && (
                        <button
                          onClick={() => setExpandida(expanded ? null : cantera.id)}
                          className="text-xs text-azul-mid hover:underline"
                        >
                          {expanded ? '▲ ocultar' : `▼ ${pasadas.length} anterior${pasadas.length > 1 ? 'es' : ''}`}
                        </button>
                      )}
                      {puedeEliminar && (
                        <button
                          onClick={() => { if (confirm(`¿Eliminar tarifa de ${cantera.nombre}?`)) remove(vigente.id, { onSuccess: () => toast('✓ Eliminada', 'ok') }) }}
                          className="text-xs px-2 py-1 rounded hover:bg-rojo-light text-gris-dark hover:text-rojo transition-colors"
                        >✕</button>
                      )}
                    </div>
                  </div>

                  {/* Historial expandido */}
                  {expanded && pasadas.length > 0 && (
                    <div className="mt-2 pl-3 border-l-2 border-gris flex flex-col gap-1">
                      {pasadas.map(t => (
                        <div key={t.id} className="flex items-center justify-between text-xs text-gris-dark py-0.5">
                          <span>desde {fmtDate(t.vigente_desde)}</span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono">${Number(t.valor_ton).toLocaleString('es-AR', { minimumFractionDigits: 2 })}/ton</span>
                            {puedeEliminar && (
                              <button onClick={() => { if (confirm('¿Eliminar?')) remove(t.id, { onSuccess: () => toast('✓ Eliminada', 'ok') }) }}
                                className="hover:text-rojo">✕</button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="💲 NUEVA TARIFA"
        footer={<><Button variant="secondary" onClick={() => setModal(false)}>Cancelar</Button><Button variant="primary" loading={saving} onClick={form.handleSubmit(handleSubmit)}>✓ Guardar</Button></>}>
        <div className="flex flex-col gap-4">
          <Select label="Cantera" options={canteraOptions} {...form.register('cantera_id')} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="$/ton" type="number" step="0.01" placeholder="0.00" {...form.register('valor_ton')} />
            <Input label="Vigente desde" type="date" {...form.register('vigente_desde')} />
          </div>
          <Input label="Observaciones" placeholder="Notas..." {...form.register('obs')} />
        </div>
      </Modal>
    </>
  )
}

// ─── Facturación: saldo corriente por empresa ─────────────────────────────────

function FacturacionSection() {
  const toast = useToast()
  const { data: empresas     = [] } = useEmpresas()
  const { data: tramos       = [] } = useTramos()
  const { data: todasTarifas = [] } = useTarifasEmpresa()
  const { data: canteras     = [] } = useCanteras()
  const { data: cobros       = [] } = useCobros()
  const { mutate: createCobro, isPending: creando } = useCreateCobro()
  const { mutate: marcarCobrado } = useMarcarCobrado()
  const { mutate: deleteCobro   } = useDeleteCobro()

  const [modalCobro,   setModalCobro]   = useState(false)
  const [empresaCobro, setEmpresaCobro] = useState<EmpresaTransportista | null>(null)
  const [selectedIds,  setSelectedIds]  = useState<Set<number>>(new Set())
  const form = useForm<any>()

  const tramosPendientes = (tramos as Tramo[]).filter(
    t => t.tipo === 'cargado' && t.estado === 'completado' && !t.cobro_id
  )

  function tarifaParaFecha(empresaId: number, canteraId: number | null, fecha: string | null): number {
    if (!canteraId || !fecha) return 0
    const candidates = (todasTarifas as TarifaEmpresaCantera[])
      .filter(t => t.empresa_id === empresaId && t.cantera_id === canteraId && t.vigente_desde <= fecha)
      .sort((a, b) => b.vigente_desde.localeCompare(a.vigente_desde))
    return candidates[0]?.valor_ton ?? 0
  }

  function calcDesglose(tramosArr: Tramo[], empresaId: number) {
    return tramosArr.map(t => {
      const ton     = t.toneladas_descarga ?? t.toneladas_carga ?? 0
      const fecha   = t.fecha_descarga ?? t.fecha_carga
      const tarifa  = tarifaParaFecha(empresaId, t.cantera_id, fecha)
      const cantera = canteras.find(c => c.id === t.cantera_id)
      return { t, ton, tarifa, subtotal: ton * tarifa, fecha, cantera }
    })
  }

  function resumenEmpresa(empresa: EmpresaTransportista) {
    const mis_tramos  = tramosPendientes.filter(t => t.empresa_id === empresa.id)
    const desglose    = calcDesglose(mis_tramos, empresa.id)
    const ton_totales = desglose.reduce((s, d) => s + d.ton, 0)
    const total       = desglose.reduce((s, d) => s + d.subtotal, 0)
    return { mis_tramos, desglose, ton_totales, total }
  }

  function abrirCobrar(empresa: EmpresaTransportista) {
    setEmpresaCobro(empresa)
    const mis_tramos = tramosPendientes.filter(t => t.empresa_id === empresa.id)
    setSelectedIds(new Set(mis_tramos.map(t => t.id)))
    const fechas = mis_tramos.map(t => t.fecha_descarga ?? t.fecha_carga).filter(Boolean) as string[]
    const desde  = fechas.length ? fechas.reduce((a, b) => a < b ? a : b) : ''
    const hasta  = fechas.length ? fechas.reduce((a, b) => a > b ? a : b) : ''
    form.reset({ fecha: new Date().toISOString().slice(0, 10), obs: '' })
    setModalCobro(true)
  }

  function toggleTramo(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleCobrar(data: any) {
    if (!empresaCobro) return
    const modalTramos = tramosPendientes.filter(t => t.empresa_id === empresaCobro.id && selectedIds.has(t.id))
    if (modalTramos.length === 0) { toast('Seleccioná al menos un remito', 'err'); return }
    const desglose    = calcDesglose(modalTramos, empresaCobro.id)
    const ton_totales = desglose.reduce((s, d) => s + d.ton, 0)
    const total       = desglose.reduce((s, d) => s + d.subtotal, 0)
    createCobro({
      empresa_id:        empresaCobro.id,
      fecha_desde:       data.fecha,
      fecha_hasta:       data.fecha,
      toneladas_totales: ton_totales,
      total,
      obs:               data.obs,
      tramo_ids:         modalTramos.map(t => t.id),
    }, {
      onSuccess: () => { toast('✓ Cobro registrado', 'ok'); setModalCobro(false); setEmpresaCobro(null) },
      onError:   () => toast('Error al registrar', 'err'),
    })
  }

  const empresasActivas = (empresas as EmpresaTransportista[]).filter(e => e.estado === 'activa')

  // Datos para el modal
  const modalTodosTramos = empresaCobro
    ? tramosPendientes.filter(t => t.empresa_id === empresaCobro.id)
    : []
  const modalDesglose = empresaCobro ? calcDesglose(modalTodosTramos, empresaCobro.id) : []
  const selDesglose   = modalDesglose.filter(d => selectedIds.has(d.t.id))
  const selTon        = selDesglose.reduce((s, d) => s + d.ton, 0)
  const selTotal      = selDesglose.reduce((s, d) => s + d.subtotal, 0)

  return (
    <>
      {/* Saldo corriente */}
      <div>
        <h2 className="text-xs font-bold text-gris-dark uppercase tracking-wider mb-3">Saldo corriente por empresa</h2>
        <div className="flex flex-col gap-3">
          {empresasActivas.map(empresa => {
            const { mis_tramos, desglose, ton_totales, total } = resumenEmpresa(empresa)
            const sinMovimientos = mis_tramos.length === 0
            return (
              <div key={empresa.id} className="bg-white rounded-card shadow-card p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-azul">{empresa.nombre}</div>
                    {sinMovimientos ? (
                      <p className="text-xs text-gris-mid mt-1 italic">Sin remitos pendientes de cobrar</p>
                    ) : (
                      <div className="text-xs text-gris-dark mt-1 space-y-0.5">
                        <div>
                          {mis_tramos.length} remito{mis_tramos.length !== 1 ? 's' : ''} ·{' '}
                          <span className="font-semibold text-carbon">{fmtTon(ton_totales)} entregadas</span>
                        </div>
                        {Object.entries(
                          desglose.reduce<Record<string, { ton: number; tarifa: number; subtotal: number }>>((acc, d) => {
                            const nombre = d.cantera?.nombre ?? `Cantera ${d.t.cantera_id ?? '?'}`
                            if (!acc[nombre]) acc[nombre] = { ton: 0, tarifa: d.tarifa, subtotal: 0 }
                            acc[nombre].ton      += d.ton
                            acc[nombre].subtotal += d.subtotal
                            acc[nombre].tarifa    = d.tarifa
                            return acc
                          }, {})
                        ).map(([nombre, v]) => (
                          <div key={nombre} className="text-gris-mid">
                            {nombre}: {fmtTon(v.ton)} × ${v.tarifa}/tn = {fmtM(v.subtotal)}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {!sinMovimientos && (
                    <div className="text-right shrink-0">
                      <div className="font-mono font-bold text-xl text-verde">{fmtM(total)}</div>
                      <div className="text-[11px] text-gris-dark">a cobrar</div>
                    </div>
                  )}
                </div>
                {!sinMovimientos && (
                  <div className="mt-3 pt-3 border-t border-gris">
                    <Button variant="primary" size="sm" onClick={() => abrirCobrar(empresa)}>
                      💰 Registrar cobro
                    </Button>
                  </div>
                )}
              </div>
            )
          })}
          {empresasActivas.length === 0 && (
            <div className="bg-white rounded-card shadow-card p-6 text-center text-sm text-gris-dark">
              No hay empresas activas. Agregalas en la sección de arriba.
            </div>
          )}
        </div>
      </div>

      {/* Historial cobros */}
      {cobros.length > 0 && (
        <div>
          <h2 className="text-xs font-bold text-gris-dark uppercase tracking-wider mb-2">Historial de cobros</h2>
          <div className="flex flex-col gap-3">
            {(cobros as Cobro[]).map(c => (
              <div key={c.id} className={`bg-white rounded-card shadow-card p-4 border-l-4 ${c.estado === 'cobrado' ? 'border-verde' : 'border-naranja'}`}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={c.estado === 'cobrado' ? 'activo' : 'pendiente'} label={c.estado === 'cobrado' ? 'Cobrado' : 'Pendiente'} />
                    </div>
                    <div className="font-bold text-azul">{c.empresas_transportistas?.nombre ?? '—'}</div>
                    <div className="text-xs text-gris-dark mt-1">
                      {fmtFecha(c.fecha_desde)} → {fmtFecha(c.fecha_hasta)} &nbsp;·&nbsp;
                      {fmtTon(c.toneladas_totales)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-bold text-lg text-verde">{fmtM(c.total)}</div>
                    <div className="text-xs text-gris-dark">Total</div>
                  </div>
                </div>
                <div className="flex gap-2 mt-3 flex-wrap">
                  {c.estado === 'pendiente' && (
                    <Button variant="primary" size="sm" onClick={() => marcarCobrado(c.id, { onSuccess: () => toast('✓ Marcado como cobrado', 'ok') })}>
                      ✓ Marcar cobrado
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => { if (confirm('¿Eliminar cobro?')) deleteCobro(c.id, { onSuccess: () => toast('✓ Eliminado', 'ok') }) }}>
                    🗑 Eliminar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal cobrar */}
      <Modal open={modalCobro} onClose={() => setModalCobro(false)} title="💰 REGISTRAR COBRO" width="max-w-lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalCobro(false)}>Cancelar</Button>
            <Button variant="primary" loading={creando} onClick={form.handleSubmit(handleCobrar)}>
              ✓ Guardar cobro
            </Button>
          </>
        }>
        {empresaCobro && (
          <div className="flex flex-col gap-4">
            <div className="bg-azul-light rounded-xl px-4 py-3">
              <div className="font-bold text-azul">{empresaCobro.nombre}</div>
              <div className="text-xs text-azul-mid mt-0.5">Seleccioná los remitos a incluir en este cobro</div>
            </div>

            {/* Lista de remitos con checkboxes */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-gris-dark uppercase tracking-wider">
                  Remitos pendientes
                </span>
                <div className="flex gap-3 text-xs">
                  <button className="text-azul hover:underline"
                    onClick={() => setSelectedIds(new Set(modalTodosTramos.map(t => t.id)))}>
                    Todos
                  </button>
                  <button className="text-azul hover:underline"
                    onClick={() => setSelectedIds(new Set())}>
                    Ninguno
                  </button>
                </div>
              </div>
              <div className="bg-gris rounded-xl divide-y divide-gris-mid max-h-60 overflow-y-auto">
                {modalDesglose.length === 0 && (
                  <p className="text-center py-4 text-sm text-gris-dark">Sin remitos pendientes</p>
                )}
                {modalDesglose.map(d => {
                  const checked  = selectedIds.has(d.t.id)
                  const remito   = d.t.remito_descarga ?? d.t.remito_carga ?? `Tramo #${d.t.id}`
                  const fechaStr = d.fecha ? fmtFecha(d.fecha) : '—'
                  return (
                    <label key={d.t.id}
                      className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${checked ? 'bg-azul-light/60' : 'hover:bg-gris-mid/30'}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleTramo(d.t.id)}
                        className="accent-azul shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-carbon">{remito}</div>
                        <div className="text-[11px] text-gris-dark">
                          {fechaStr} · {d.cantera?.nombre ?? '—'} · {fmtTon(d.ton)}
                          {d.tarifa > 0 && <> · ${d.tarifa}/tn</>}
                        </div>
                      </div>
                      <div className={`text-xs font-mono font-bold shrink-0 ${checked ? 'text-verde' : 'text-gris-dark line-through'}`}>
                        {fmtM(d.subtotal)}
                      </div>
                    </label>
                  )
                })}
              </div>
              <div className="flex justify-between items-center mt-2 px-1">
                <span className="text-xs text-gris-dark">
                  {selectedIds.size} seleccionado{selectedIds.size !== 1 ? 's' : ''} · {fmtTon(selTon)}
                </span>
                <span className="font-mono font-bold text-verde">{fmtM(selTotal)}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input label="Fecha de cobro" type="date" {...form.register('fecha')} />
              <Input label="Observaciones" placeholder="Nº factura, referencia..." {...form.register('obs')} />
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}

// ─── Estado de remitos por empresa y período ──────────────────────────────────

function RemitosSection() {
  const { data: empresas     = [] } = useEmpresas()
  const { data: tramos       = [] } = useTramos()
  const { data: todasTarifas = [] } = useTarifasEmpresa()
  const { data: canteras     = [] } = useCanteras()

  const [empresaId,  setEmpresaId]  = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')

  function tarifaParaFecha(empresaId: number, canteraId: number | null, fecha: string | null): number {
    if (!canteraId || !fecha) return 0
    const candidates = (todasTarifas as TarifaEmpresaCantera[])
      .filter(t => t.empresa_id === empresaId && t.cantera_id === canteraId && t.vigente_desde <= fecha)
      .sort((a, b) => b.vigente_desde.localeCompare(a.vigente_desde))
    return candidates[0]?.valor_ton ?? 0
  }

  function enrichTramo(t: Tramo) {
    const empId   = t.empresa_id ?? 0
    const ton     = t.toneladas_descarga ?? t.toneladas_carga ?? 0
    const fecha   = t.fecha_descarga ?? t.fecha_carga
    const tarifa  = tarifaParaFecha(empId, t.cantera_id, fecha ?? null)
    const cantera = canteras.find(c => c.id === t.cantera_id)
    const empresa = (empresas as EmpresaTransportista[]).find(e => e.id === empId)
    const remito  = t.remito_descarga ?? t.remito_carga
    return { t, ton, tarifa, subtotal: ton * tarifa, fecha, cantera, empresa, remito }
  }

  const tramosBase = (tramos as Tramo[]).filter(t =>
    t.tipo === 'cargado' && t.estado === 'completado' &&
    (!empresaId || t.empresa_id === Number(empresaId)) &&
    (!fechaDesde || (t.fecha_descarga ?? t.fecha_carga ?? '') >= fechaDesde) &&
    (!fechaHasta || (t.fecha_descarga ?? t.fecha_carga ?? '') <= fechaHasta)
  )

  const adeudados = tramosBase.filter(t => !t.cobro_id).map(enrichTramo)
  const cobrados  = tramosBase.filter(t => !!t.cobro_id).map(enrichTramo)

  const totalAdeudado = adeudados.reduce((s, d) => s + d.subtotal, 0)
  const totalCobrado  = cobrados.reduce((s, d) => s + d.subtotal, 0)

  const empresaOptions = [
    { value: '', label: 'Todas las empresas' },
    ...(empresas as EmpresaTransportista[]).map(e => ({ value: String(e.id), label: e.nombre })),
  ]

  function FilaRemito({ d }: { d: ReturnType<typeof enrichTramo> }) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-xs border-b border-gris last:border-0">
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-carbon">{d.remito ?? `Tramo #${d.t.id}`}</div>
          <div className="text-gris-dark">
            {d.fecha ? fmtFecha(d.fecha) : '—'}
            {!empresaId && d.empresa && <> · {d.empresa.nombre}</>}
            {d.cantera && <> · {d.cantera.nombre}</>}
            {' · '}{fmtTon(d.ton)}
            {d.tarifa > 0 && <> · ${d.tarifa}/tn</>}
          </div>
        </div>
        <div className="font-mono font-bold shrink-0">{fmtM(d.subtotal)}</div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-card shadow-card">
      <div className="px-5 py-4 border-b border-gris">
        <h2 className="font-bold text-azul text-base">Estado de remitos</h2>
        <p className="text-xs text-gris-dark mt-0.5">Adeudados y cobrados por empresa y período</p>
      </div>

      {/* Filtros */}
      <div className="px-5 py-3 flex flex-wrap gap-3 border-b border-gris items-end">
        <div className="flex-1 min-w-44">
          <label className="block text-xs font-semibold text-gris-dark mb-1">Empresa</label>
          <select
            value={empresaId}
            onChange={e => setEmpresaId(e.target.value)}
            className="w-full border border-gris rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-azul"
          >
            {empresaOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gris-dark mb-1">Desde</label>
          <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)}
            className="border border-gris rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-azul" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gris-dark mb-1">Hasta</label>
          <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)}
            className="border border-gris rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-azul" />
        </div>
        {(empresaId || fechaDesde || fechaHasta) && (
          <button
            onClick={() => { setEmpresaId(''); setFechaDesde(''); setFechaHasta('') }}
            className="text-xs text-gris-dark hover:text-rojo self-end pb-2">
            ✕ Limpiar
          </button>
        )}
      </div>

      {/* Columnas adeudado / cobrado */}
      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gris">
        {/* Adeudados */}
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-bold text-naranja uppercase tracking-wider">
              Adeudados ({adeudados.length})
            </div>
            <div className="font-mono font-bold text-naranja">{fmtM(totalAdeudado)}</div>
          </div>
          <div className="bg-gris rounded-xl overflow-hidden">
            {adeudados.length === 0
              ? <p className="text-xs text-gris-dark text-center py-4 italic">Sin remitos adeudados</p>
              : adeudados.map(d => <FilaRemito key={d.t.id} d={d} />)
            }
          </div>
        </div>

        {/* Cobrados */}
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-bold text-verde uppercase tracking-wider">
              Cobrados ({cobrados.length})
            </div>
            <div className="font-mono font-bold text-verde">{fmtM(totalCobrado)}</div>
          </div>
          <div className="bg-gris rounded-xl overflow-hidden">
            {cobrados.length === 0
              ? <p className="text-xs text-gris-dark text-center py-4 italic">Sin remitos cobrados</p>
              : cobrados.map(d => <FilaRemito key={d.t.id} d={d} />)
            }
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Tab principal ─────────────────────────────────────────────────────────────

export function FacturacionTab() {
  const [empresaSeleccionada, setEmpresaSeleccionada] = useState<EmpresaTransportista | null>(null)

  return (
    <div className="flex flex-col gap-6">
      <EmpresasSection
        onSelectEmpresa={setEmpresaSeleccionada}
        empresaSeleccionada={empresaSeleccionada}
      />
      {empresaSeleccionada && (
        <TarifasEmpresaSection empresa={empresaSeleccionada} />
      )}
      <FacturacionSection />
      <RemitosSection />
    </div>
  )
}
