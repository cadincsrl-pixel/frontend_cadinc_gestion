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
  const { data: empresas        = [] } = useEmpresas()
  const { data: tramos          = [] } = useTramos()
  const { data: todasTarifas    = [] } = useTarifasEmpresa()
  const { data: cobros          = [] } = useCobros()
  const { mutate: createCobro, isPending: creando } = useCreateCobro()
  const { mutate: marcarCobrado } = useMarcarCobrado()
  const { mutate: deleteCobro   } = useDeleteCobro()

  const [modalCobro,  setModalCobro]  = useState(false)
  const [empresaCobro, setEmpresaCobro] = useState<EmpresaTransportista | null>(null)
  const form = useForm<any>()

  // Tramos cargados completados sin cobrar
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

  function resumenEmpresa(empresa: EmpresaTransportista) {
    const mis_tramos = tramosPendientes.filter(t => t.empresa_id === empresa.id)
    const desglose = mis_tramos.map(t => {
      const ton    = t.toneladas_descarga ?? t.toneladas_carga ?? 0
      const fecha  = t.fecha_descarga ?? t.fecha_carga
      const tarifa = tarifaParaFecha(empresa.id, t.cantera_id, fecha)
      return { t, ton, tarifa, subtotal: ton * tarifa }
    })
    const ton_totales = desglose.reduce((s, d) => s + d.ton, 0)
    const total       = desglose.reduce((s, d) => s + d.subtotal, 0)
    return { mis_tramos, desglose, ton_totales, total }
  }

  function abrirCobrar(empresa: EmpresaTransportista) {
    setEmpresaCobro(empresa)
    form.reset({ desde: '', hasta: '', obs: '' })
    setModalCobro(true)
  }

  function handleCobrar(data: any) {
    if (!empresaCobro) return
    const { mis_tramos, ton_totales, total } = resumenEmpresa(empresaCobro)
    createCobro({
      empresa_id:        empresaCobro.id,
      fecha_desde:       data.desde,
      fecha_hasta:       data.hasta,
      toneladas_totales: ton_totales,
      total,
      obs:               data.obs,
      tramo_ids:         mis_tramos.map(t => t.id),
    }, {
      onSuccess: () => { toast('✓ Cobro registrado', 'ok'); setModalCobro(false); setEmpresaCobro(null) },
      onError:   () => toast('Error al registrar', 'err'),
    })
  }

  const preview = empresaCobro ? resumenEmpresa(empresaCobro) : null

  const empresasActivas = (empresas as EmpresaTransportista[]).filter(e => e.estado === 'activa')

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
                      <p className="text-xs text-gris-mid mt-1 italic">Sin tramos pendientes de cobrar</p>
                    ) : (
                      <div className="text-xs text-gris-dark mt-1 space-y-0.5">
                        <div>
                          {mis_tramos.length} tramo{mis_tramos.length !== 1 ? 's' : ''} ·{' '}
                          <span className="font-semibold text-carbon">{fmtTon(ton_totales)} entregadas</span>
                        </div>
                        {/* Desglose por cantera */}
                        {Object.entries(
                          desglose.reduce<Record<string, { ton: number; tarifa: number; subtotal: number }>>((acc, d) => {
                            const nombre = (d.t as any).cantera_nombre ?? `Cantera ${d.t.cantera_id ?? '?'}`
                            if (!acc[nombre]) acc[nombre] = { ton: 0, tarifa: d.tarifa, subtotal: 0 }
                            acc[nombre].ton      += d.ton
                            acc[nombre].subtotal += d.subtotal
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
              No hay empresas activas. Agregalas en la pestaña de arriba.
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
        footer={<><Button variant="secondary" onClick={() => setModalCobro(false)}>Cancelar</Button><Button variant="primary" loading={creando} onClick={form.handleSubmit(handleCobrar)}>✓ Guardar cobro</Button></>}>
        {empresaCobro && preview && (
          <div className="flex flex-col gap-4">
            <div className="bg-azul-light rounded-xl px-4 py-3">
              <div className="font-bold text-azul">{empresaCobro.nombre}</div>
              <div className="text-xs text-azul-mid mt-0.5">
                {preview.mis_tramos.length} tramos · {fmtTon(preview.ton_totales)} · {fmtM(preview.total)}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Período desde" type="date" {...form.register('desde')} />
              <Input label="Período hasta"  type="date" {...form.register('hasta')} />
            </div>
            {/* Desglose */}
            <div className="bg-gris rounded-xl p-3 text-sm space-y-1">
              {preview.desglose.map((d, i) => (
                <div key={i} className="flex justify-between text-xs">
                  <span className="text-gris-dark">
                    Tramo #{d.t.id} · {fmtTon(d.ton)} × ${d.tarifa}/tn
                  </span>
                  <span className="font-mono font-bold">{fmtM(d.subtotal)}</span>
                </div>
              ))}
              <div className="flex justify-between font-bold border-t border-gris-mid pt-1 mt-1">
                <span>TOTAL</span>
                <span className="font-mono text-verde">{fmtM(preview.total)}</span>
              </div>
            </div>
            <Input label="Observaciones" placeholder="Nº remito, referencia..." {...form.register('obs')} />
          </div>
        )}
      </Modal>
    </>
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
    </div>
  )
}
