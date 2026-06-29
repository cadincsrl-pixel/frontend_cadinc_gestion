'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import * as XLSX from 'xlsx'
import JSZip from 'jszip'
import { useForm, Controller } from 'react-hook-form'
import {
  useEmpresas, useCreateEmpresa, useUpdateEmpresa, useDeleteEmpresa,
  useTarifasEmpresa, useUpsertTarifaEmpresa, useUpdateTarifaEmpresa, useDeleteTarifaEmpresa,
  useCobros, useCreateCobro, useMarcarCobrado, useRevertirCobrado, useDeleteCobro,
  useTramos, useUpdateTramo, useCanteras, useDepositos, useChoferes, useCamiones,
} from '../hooks/useLogistica'
import { Modal }  from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Combobox } from '@/components/ui/Combobox'
import { Badge }  from '@/components/ui/Badge'
import { useToast } from '@/components/ui/Toast'
import { useForm as useRHF } from 'react-hook-form'
import { usePermisos } from '@/hooks/usePermisos'
import { CobroAdjuntosSection } from './CobroAdjuntosSection'
import type { EmpresaTransportista, TarifaEmpresaCantera, Tramo, Cobro } from '@/types/domain.types'
import { toISO } from '@/lib/utils/dates'

function fmtM(n: number) {
  return '$' + n.toLocaleString('es-AR', { maximumFractionDigits: 0 })
}

// Adivina la extensión del archivo a partir de la URL (preferido) o el MIME.
// Se usa al armar los nombres del ZIP de remitos.
function guessExt(url: string, mime: string): string {
  const m = url.match(/\.([a-zA-Z0-9]{2,5})(?:\?|$)/)
  if (m) return m[1].toLowerCase()
  if (mime.includes('jpeg')) return 'jpg'
  if (mime.includes('png'))  return 'png'
  if (mime.includes('pdf'))  return 'pdf'
  if (mime.includes('webp')) return 'webp'
  return 'bin'
}
function fmtTon(n: number) {
  return n.toLocaleString('es-AR', { maximumFractionDigits: 2 }) + ' tn'
}
function fmtFecha(s: string) {
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

// ─── Sección empresas ─────────────────────────────────────────────────────────

// Definido a nivel de módulo (no dentro de EmpresasSection) para que no se
// recree en cada render del padre — si se redefiniera, los inputs perderían
// foco al tipear (la identidad del componente cambia y React desmonta/remonta).
function EmpresaForm({ form }: { form: any }) {
  return (
    <div className="flex flex-col gap-3">
      <Input label="Nombre / Razón social" placeholder="Empresa S.A." {...form.register('nombre')} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label="CUIT" placeholder="20-12345678-9" {...form.register('cuit')} />
        <Input label="Teléfono" placeholder="299-XXX-XXXX" {...form.register('tel')} />
      </div>
      <Input label="Email" placeholder="contacto@empresa.com" {...form.register('email')} />
      <Input label="Observaciones" placeholder="Notas..." {...form.register('obs')} />
    </div>
  )
}

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

  return (
    <>
      <div className="bg-white rounded-card shadow-card">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gris">
          <div>
            <h2 className="font-bold text-azul text-base">Empresas transportistas</h2>
            <p className="text-xs text-gris-dark mt-0.5">Tus clientes — hacé clic en una para ver su tarifa por punto de carga</p>
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
                  <button onClick={ev => { ev.stopPropagation(); if (confirm(`¿Eliminar ${e.nombre}?`)) remove(e.id, { onSuccess: () => toast('✓ Eliminada', 'ok'), onError: () => toast('No se puede eliminar: la empresa tiene cobros o viajes asociados', 'err') }) }}
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

// Resuelve la tarifa $/ton de un tramo: si existe una tarifa específica para
// el depósito de descarga (empresa+cantera+depósito), gana sobre la general
// (empresa+cantera con deposito_id null). En ambos casos se toma la de
// `vigente_desde` más reciente que no supere la fecha de descarga.
function tarifaParaFecha(
  tarifas: TarifaEmpresaCantera[],
  empresaId: number,
  canteraId: number | null,
  depositoId: number | null,
  fecha: string | null,
): number {
  if (!canteraId || !fecha) return 0
  const base = tarifas.filter(t =>
    t.empresa_id === empresaId && t.cantera_id === canteraId && t.vigente_desde <= fecha
  )
  const especificas = depositoId != null ? base.filter(t => t.deposito_id === depositoId) : []
  const pool = especificas.length > 0 ? especificas : base.filter(t => t.deposito_id == null)
  const vigente = pool.sort((a, b) => b.vigente_desde.localeCompare(a.vigente_desde))[0]
  return vigente?.valor_ton ?? 0
}

function TarifasEmpresaSection({ empresa }: { empresa: EmpresaTransportista }) {
  const toast = useToast()
  const { puedeCrear, puedeEliminar } = usePermisos('logistica')
  const { data: todasTarifas = [] } = useTarifasEmpresa()
  const { data: canteras     = [] } = useCanteras()
  const { data: depositos    = [] } = useDepositos()
  const { mutate: crear, isPending: saving } = useUpsertTarifaEmpresa()
  const { mutate: actualizar, isPending: actualizando } = useUpdateTarifaEmpresa()
  const { mutate: remove } = useDeleteTarifaEmpresa()

  const tarifas = todasTarifas.filter(t => t.empresa_id === empresa.id)

  // Agrupar por cantera × depósito (null = tarifa general de la cantera),
  // historial ordenado por vigente_desde desc (la primera es la vigente).
  // La general va primero, después las específicas por depósito.
  const grupos = canteras
    .flatMap(c => {
      const deCantera = tarifas.filter(t => t.cantera_id === c.id)
      const depIds = Array.from(new Set(deCantera.map(t => t.deposito_id ?? null)))
        .sort((a, b) => (a === null ? -1 : b === null ? 1 : a - b))
      return depIds.map(depId => ({
        key:      `${c.id}|${depId ?? 'gral'}`,
        cantera:  c,
        deposito: depId === null ? null : depositos.find(d => d.id === depId) ?? null,
        depositoId: depId,
        historial: deCantera
          .filter(t => (t.deposito_id ?? null) === depId)
          .sort((a, b) => b.vigente_desde.localeCompare(a.vigente_desde)),
      }))
    })
    .filter(g => g.historial.length > 0)

  const [modal, setModal] = useState(false)
  const [expandida, setExpandida] = useState<string | null>(null)
  const [editando, setEditando] = useState<TarifaEmpresaCantera | null>(null)
  const [pisarPosteriores, setPisarPosteriores] = useState(false)
  const form = useForm<any>({ defaultValues: { vigente_desde: toISO(new Date()) } })
  const formEdit = useForm<any>()

  // Detecta tarifas con `vigente_desde` posterior a la fecha cargada
  // (excluyendo opcionalmente una propia, para el caso editar). Sirve
  // para avisar que la nueva tarifa no va a afectar tramos posteriores
  // a menos que se "pisen" (eliminen).
  function tarifasPosteriores(canteraId: number | null, depositoId: number | null, fecha: string, excluirId?: number): TarifaEmpresaCantera[] {
    if (!canteraId || !fecha) return []
    return tarifas
      .filter(t => t.cantera_id === canteraId && (t.deposito_id ?? null) === depositoId)
      .filter(t => excluirId == null || t.id !== excluirId)
      .filter(t => t.vigente_desde > fecha)
      .sort((a, b) => a.vigente_desde.localeCompare(b.vigente_desde))
  }

  const watchCantera  = form.watch('cantera_id')
  const watchDeposito = form.watch('deposito_id')
  const watchFecha    = form.watch('vigente_desde')
  const posterioresNueva = tarifasPosteriores(
    watchCantera ? Number(watchCantera) : null,
    watchDeposito ? Number(watchDeposito) : null,
    watchFecha,
  )

  const watchEditFecha = formEdit.watch('vigente_desde')
  const posterioresEdit = editando
    ? tarifasPosteriores(editando.cantera_id, editando.deposito_id ?? null, watchEditFecha, editando.id)
    : []

  function abrirEditar(t: TarifaEmpresaCantera) {
    formEdit.reset({
      valor_ton:     t.valor_ton,
      vigente_desde: t.vigente_desde,
      obs:           (t as any).obs ?? '',
    })
    setEditando(t)
  }

  function handleEditSubmit(data: any) {
    if (!editando) return
    const ids_a_pisar = pisarPosteriores ? posterioresEdit.map(t => t.id) : []
    actualizar({
      id: editando.id,
      dto: {
        valor_ton:     Number(data.valor_ton),
        vigente_desde: data.vigente_desde,
        obs:           data.obs ?? '',
      },
    }, {
      onSuccess: async () => {
        if (ids_a_pisar.length > 0) {
          await Promise.allSettled(ids_a_pisar.map(id =>
            new Promise((res, rej) => remove(id, { onSuccess: () => res(null), onError: rej })),
          ))
        }
        toast(
          ids_a_pisar.length > 0
            ? `✓ Tarifa actualizada · ${ids_a_pisar.length} posterior${ids_a_pisar.length !== 1 ? 'es' : ''} reemplazada${ids_a_pisar.length !== 1 ? 's' : ''}`
            : '✓ Tarifa actualizada',
          'ok',
        )
        setEditando(null)
        setPisarPosteriores(false)
      },
      onError:   () => toast('Error al actualizar', 'err'),
    })
  }

  function handleSubmit(data: any) {
    const ids_a_pisar = pisarPosteriores ? posterioresNueva.map(t => t.id) : []
    crear({
      empresa_id:    empresa.id,
      cantera_id:    Number(data.cantera_id),
      deposito_id:   data.deposito_id ? Number(data.deposito_id) : null,
      valor_ton:     Number(data.valor_ton),
      vigente_desde: data.vigente_desde,
      obs:           data.obs ?? '',
    }, {
      onSuccess: async () => {
        // Si pidió "pisar posteriores", eliminamos en paralelo (best-effort).
        // Si una falla, igual la nueva ya quedó creada; el user puede
        // borrar la posterior huérfana a mano.
        if (ids_a_pisar.length > 0) {
          await Promise.allSettled(ids_a_pisar.map(id =>
            new Promise((res, rej) => remove(id, { onSuccess: () => res(null), onError: rej })),
          ))
        }
        toast(
          ids_a_pisar.length > 0
            ? `✓ Tarifa guardada · ${ids_a_pisar.length} posterior${ids_a_pisar.length !== 1 ? 'es' : ''} reemplazada${ids_a_pisar.length !== 1 ? 's' : ''}`
            : '✓ Tarifa guardada',
          'ok',
        )
        setModal(false)
        setPisarPosteriores(false)
        form.reset({ vigente_desde: toISO(new Date()) })
      },
      onError:   () => toast('Error al guardar', 'err'),
    })
  }

  const canteraOptions = canteras.map(c => ({
    value: String(c.id),
    label: c.nombre + (c.localidad ? ` — ${c.localidad}` : ''),
  }))

  const depositoOptions = [
    { value: '', label: 'Todas las descargas (tarifa general)' },
    ...depositos.map(d => ({ value: String(d.id), label: d.nombre + (d.localidad ? ` — ${d.localidad}` : '') })),
  ]

  return (
    <>
      <div className="bg-white rounded-card shadow-card">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gris">
          <div>
            <h2 className="font-bold text-azul text-base">Tarifas — {empresa.nombre}</h2>
            <p className="text-xs text-gris-dark mt-0.5">Historial de $/ton por punto de carga (y depósito, si paga según destino) · cada entrega usa la tarifa vigente en su fecha de descarga</p>
          </div>
          {puedeCrear && (
            <Button variant="primary" size="sm" onClick={() => setModal(true)}>＋ Nueva tarifa</Button>
          )}
        </div>

        {grupos.length === 0 ? (
          <p className="text-center py-6 text-sm text-gris-dark">Sin tarifas. Agregá una con el botón de arriba.</p>
        ) : (
          <div className="divide-y divide-gris">
            {grupos.map(({ key, cantera, deposito, depositoId, historial }) => {
              const vigente  = historial[0]
              const pasadas  = historial.slice(1)
              const expanded = expandida === key

              return (
                <div key={key} className="px-5 py-3">
                  {/* Fila vigente */}
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <span className="font-bold text-sm text-carbon">{cantera.nombre}</span>
                      {cantera.localidad && <span className="text-xs text-gris-dark ml-2">{cantera.localidad}</span>}
                      {depositoId != null && (
                        <span className="text-xs font-bold text-azul-mid ml-2 bg-azul/5 px-1.5 py-0.5 rounded" title="Tarifa específica para descargas en este depósito">
                          → {deposito?.nombre ?? `depósito #${depositoId}`}
                        </span>
                      )}
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
                          onClick={() => setExpandida(expanded ? null : key)}
                          className="text-xs text-azul-mid hover:underline"
                        >
                          {expanded ? '▲ ocultar' : `▼ ${pasadas.length} anterior${pasadas.length > 1 ? 'es' : ''}`}
                        </button>
                      )}
                      {puedeCrear && (
                        <button
                          onClick={() => abrirEditar(vigente)}
                          title="Editar tarifa"
                          className="text-xs px-2 py-1 rounded hover:bg-gris transition-colors"
                        >✏️</button>
                      )}
                      {puedeEliminar && (
                        <button
                          onClick={() => { if (confirm(`¿Eliminar tarifa de ${cantera.nombre}${deposito ? ` → ${deposito.nombre}` : ''}?`)) remove(vigente.id, { onSuccess: () => toast('✓ Eliminada', 'ok') }) }}
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
                            {puedeCrear && (
                              <button onClick={() => abrirEditar(t)} title="Editar" className="hover:text-azul">✏️</button>
                            )}
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

      <Modal open={modal} onClose={() => { setModal(false); setPisarPosteriores(false) }} title="💲 NUEVA TARIFA"
        footer={<><Button variant="secondary" onClick={() => { setModal(false); setPisarPosteriores(false) }}>Cancelar</Button><Button variant="primary" loading={saving} onClick={form.handleSubmit(handleSubmit)}>✓ Guardar</Button></>}>
        <div className="flex flex-col gap-4">
          <Controller
            name="cantera_id"
            control={form.control}
            defaultValue=""
            render={({ field }) => (
              <Combobox label="Punto de carga" placeholder="Buscar punto de carga…"
                options={canteraOptions} value={field.value ?? ''} onChange={field.onChange} />
            )}
          />
          <div>
            <Controller
              name="deposito_id"
              control={form.control}
              defaultValue=""
              render={({ field }) => (
                <Combobox label="Depósito de descarga" placeholder="Buscar depósito…"
                  options={depositoOptions} value={field.value ?? ''} onChange={field.onChange} />
              )}
            />
            <p className="text-[11px] text-gris-dark mt-1">
              Dejá &quot;Todas las descargas&quot; salvo que este punto de carga pague distinto según el depósito de destino. La tarifa específica gana sobre la general.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="$/ton" type="number" step="0.01" placeholder="0.00" {...form.register('valor_ton')} />
            <Input label="Vigente desde" type="date" {...form.register('vigente_desde')} />
          </div>
          <Input label="Observaciones" placeholder="Notas..." {...form.register('obs')} />

          {posterioresNueva.length > 0 && (
            <div className="bg-amarillo-light border border-[#7A5500]/30 rounded-card p-3 text-xs">
              <div className="font-bold text-[#7A5500] mb-1">
                ⚠ Hay {posterioresNueva.length} tarifa{posterioresNueva.length !== 1 ? 's' : ''} posterior{posterioresNueva.length !== 1 ? 'es' : ''} cargada{posterioresNueva.length !== 1 ? 's' : ''}
              </div>
              <div className="text-gris-dark mb-2">
                {posterioresNueva.map(t => (
                  <div key={t.id} className="font-mono">
                    • desde {fmtDate(t.vigente_desde)}: $ {Number(t.valor_ton).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </div>
                ))}
              </div>
              <div className="text-gris-dark mb-2">
                Esta tarifa nueva NO va a afectar tramos del{' '}
                <b>{posterioresNueva[0] ? fmtDate(posterioresNueva[0].vigente_desde) : ''}</b> en adelante a menos que reemplaces las posteriores.
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={pisarPosteriores}
                  onChange={e => setPisarPosteriores(e.target.checked)}
                  className="accent-azul"
                />
                <span className="text-carbon">
                  Reemplazar las {posterioresNueva.length} posterior{posterioresNueva.length !== 1 ? 'es' : ''} (recomendado para actualizaciones retroactivas)
                </span>
              </label>
            </div>
          )}
        </div>
      </Modal>

      {/* Modal editar tarifa — sólo cambia valor/fecha/obs. Para cambiar el
          par empresa-cantera hay que eliminar y crear una nueva. */}
      <Modal
        open={!!editando}
        onClose={() => { setEditando(null); setPisarPosteriores(false) }}
        title="✏️ EDITAR TARIFA"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setEditando(null); setPisarPosteriores(false) }}>Cancelar</Button>
            <Button variant="primary" loading={actualizando} onClick={formEdit.handleSubmit(handleEditSubmit)}>✓ Guardar</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {editando && (
            <div className="bg-gris/30 rounded-card p-3 text-xs">
              <span className="font-bold">{empresa.nombre}</span>
              <span className="text-gris-dark mx-1">·</span>
              <span className="font-bold">{canteras.find(c => c.id === editando.cantera_id)?.nombre ?? '—'}</span>
              {editando.deposito_id != null && (
                <>
                  <span className="text-gris-dark mx-1">→</span>
                  <span className="font-bold text-azul-mid">{depositos.find(d => d.id === editando.deposito_id)?.nombre ?? `depósito #${editando.deposito_id}`}</span>
                </>
              )}
              <p className="text-[11px] text-gris-dark mt-1">
                Empresa, punto de carga y depósito no son editables. Si la combinación cambió, eliminá esta tarifa y creá una nueva.
              </p>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="$/ton" type="number" step="0.01" {...formEdit.register('valor_ton')} />
            <Input label="Vigente desde" type="date" {...formEdit.register('vigente_desde')} />
          </div>
          <Input label="Observaciones" placeholder="Notas..." {...formEdit.register('obs')} />

          {posterioresEdit.length > 0 && (
            <div className="bg-amarillo-light border border-[#7A5500]/30 rounded-card p-3 text-xs">
              <div className="font-bold text-[#7A5500] mb-1">
                ⚠ Hay {posterioresEdit.length} tarifa{posterioresEdit.length !== 1 ? 's' : ''} posterior{posterioresEdit.length !== 1 ? 'es' : ''} cargada{posterioresEdit.length !== 1 ? 's' : ''}
              </div>
              <div className="text-gris-dark mb-2">
                {posterioresEdit.map(t => (
                  <div key={t.id} className="font-mono">
                    • desde {fmtDate(t.vigente_desde)}: $ {Number(t.valor_ton).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </div>
                ))}
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={pisarPosteriores}
                  onChange={e => setPisarPosteriores(e.target.checked)}
                  className="accent-azul"
                />
                <span className="text-carbon">
                  Reemplazar las {posterioresEdit.length} posterior{posterioresEdit.length !== 1 ? 'es' : ''}
                </span>
              </label>
            </div>
          )}
        </div>
      </Modal>
    </>
  )
}

// ─── Facturación: saldo corriente por empresa ─────────────────────────────────

function FacturacionSection() {
  const toast = useToast()
  const router = useRouter()
  const { data: empresas     = [] } = useEmpresas()
  const { data: tramos       = [] } = useTramos()
  const { data: todasTarifas = [] } = useTarifasEmpresa()
  const { data: canteras     = [] } = useCanteras()
  const { data: depositos    = [] } = useDepositos()
  const { data: choferes     = [] } = useChoferes()
  const { data: cobros       = [] } = useCobros()
  const { mutate: createCobro, isPending: creando } = useCreateCobro()
  const { mutate: marcarCobrado } = useMarcarCobrado()
  const { mutate: revertirCobrado } = useRevertirCobrado()
  const { mutate: deleteCobro   } = useDeleteCobro()

  const [modalCobro,   setModalCobro]   = useState(false)
  const [empresaCobro, setEmpresaCobro] = useState<EmpresaTransportista | null>(null)
  const [selectedIds,  setSelectedIds]  = useState<Set<number>>(new Set())
  // Cobro recién creado: cuando se setea, el modal pasa a "modo adjuntos"
  // (sigue abierto para que el user pueda subir liquidación + comprobante).
  const [cobroCreado,  setCobroCreado]  = useState<{ id: number; total: number; ton: number } | null>(null)
  // Cobro abierto para revisar/editar adjuntos después de creado.
  const [cobroDetalle, setCobroDetalle] = useState<Cobro | null>(null)
  // Empresa expandida en "Saldo corriente" para ver remitos individuales.
  const [saldoExpandida, setSaldoExpandida] = useState<number | null>(null)
  // Tramo abierto para editar toneladas/remito de descarga (ajuste fino
  // cuando la empresa transportista paga distinto a lo del remito).
  const [editandoTramo, setEditandoTramo] = useState<Tramo | null>(null)
  // Filtros del Historial de cobros. Default 'pendientes' porque son los
  // que requieren acción del usuario.
  const [filtroEstadoCobro, setFiltroEstadoCobro] = useState<'pendientes' | 'cobrados' | 'todos'>('pendientes')
  const [busquedaCobro, setBusquedaCobro] = useState('')
  // Buscador de remitos DENTRO del modal de registrar cobro.
  const [busquedaRemito, setBusquedaRemito] = useState('')
  const [cobroDesde, setCobroDesde] = useState('')
  const [cobroHasta, setCobroHasta] = useState('')
  const form = useForm<any>()
  const formEditTramo = useForm<any>()
  const { mutate: updateTramo, isPending: updatingTramo } = useUpdateTramo()

  function cerrarModalCobro() {
    setModalCobro(false)
    setEmpresaCobro(null)
    setCobroCreado(null)
    setSelectedIds(new Set())
    setBusquedaRemito('')
  }

  function abrirEditarTramo(t: Tramo) {
    formEditTramo.reset({
      toneladas_descarga: t.toneladas_descarga ?? '',
      remito_descarga:    t.remito_descarga ?? '',
    })
    setEditandoTramo(t)
  }

  function handleEditTramo(data: any) {
    if (!editandoTramo) return
    updateTramo({
      id: editandoTramo.id,
      dto: {
        toneladas_descarga: data.toneladas_descarga ? Number(data.toneladas_descarga) : null,
        remito_descarga:    data.remito_descarga ?? '',
      },
    } as any, {
      onSuccess: () => { toast('✓ Toneladas actualizadas', 'ok'); setEditandoTramo(null) },
      onError:   (err: any) => {
        const code = err?.body?.error
        if (code === 'TRAMO_LIQUIDADO')   toast('No se puede editar: tramo liquidado', 'err')
        else if (code === 'TRAMO_COBRADO') toast('No se puede editar: tramo ya cobrado', 'err')
        else toast(err?.message || 'Error al actualizar', 'err')
      },
    })
  }

  // Lugares operativos (no facturables, p.ej. CHIVILCOY): un cargado nunca
  // debería originarse/entregar ahí, pero si quedó alguno viejo lo excluimos
  // del listado de cobro para que no aparezca en $0.
  const canterasOperativas  = new Set(canteras.filter(c => c.operativo).map(c => c.id))
  const depositosOperativos = new Set(depositos.filter(d => d.operativo).map(d => d.id))

  const tramosPendientes = (tramos as Tramo[]).filter(
    t => t.tipo === 'cargado' && t.estado === 'completado' && !t.cobro_id
      && !(t.cantera_id != null && canterasOperativas.has(t.cantera_id))
      && !(t.deposito_id != null && depositosOperativos.has(t.deposito_id))
  )

  function calcDesglose(tramosArr: Tramo[], empresaId: number) {
    return tramosArr.map(t => {
      const ton     = t.toneladas_descarga ?? t.toneladas_carga ?? 0
      const fecha   = t.fecha_descarga ?? t.fecha_carga
      const tarifa  = tarifaParaFecha(todasTarifas as TarifaEmpresaCantera[], empresaId, t.cantera_id, t.deposito_id, fecha)
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
    form.reset({ fecha: toISO(new Date()), obs: '' })
    setBusquedaRemito('')
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
    // Guard anti-subfacturación: un remito sin tarifa para su cantera/fecha
    // entra al cobro en $0 y no se ve. Avisar antes de registrar.
    const sinTarifa = desglose.filter(d => d.tarifa === 0)
    if (sinTarifa.length > 0) {
      const lista = sinTarifa
        .map(d => `· ${d.cantera?.nombre ?? 'punto de carga ?'} — remito ${d.t.remito_descarga ?? d.t.remito_carga ?? `#${d.t.id}`}`)
        .join('\n')
      const ok = confirm(
        `⚠ ${sinTarifa.length} remito(s) no tienen tarifa cargada y se cobrarían en $0:\n${lista}\n\n` +
        `Cargá la tarifa de ese punto de carga (o desmarcá esos remitos) para no subfacturar.\n\n¿Registrar el cobro igual?`,
      )
      if (!ok) return
    }
    const ton_totales = desglose.reduce((s, d) => s + d.ton, 0)
    const total       = desglose.reduce((s, d) => s + d.subtotal, 0)
    // El periodo del cobro es el rango real de fechas de los tramos
    // seleccionados (no la fecha del input, que es solo informativa: la DB
    // no tiene columna 'fecha de cobro'). Fallback a data.fecha si por algun
    // motivo ningun tramo tuviera fecha, para no romper fecha_desde<=fecha_hasta.
    const fechasSel = modalTramos
      .map(t => t.fecha_descarga ?? t.fecha_carga)
      .filter(Boolean) as string[]
    const fecha_desde = fechasSel.length ? fechasSel.reduce((a, b) => (a < b ? a : b)) : data.fecha
    const fecha_hasta = fechasSel.length ? fechasSel.reduce((a, b) => (a > b ? a : b)) : data.fecha
    // La fecha del input no tiene columna propia en `cobros`; la dejamos
    // anotada en obs para no perderla (el periodo viaja en fecha_desde/hasta).
    const obsConFecha = [
      data.fecha ? `Cobrado el ${fmtFecha(data.fecha)}` : '',
      (data.obs ?? '').trim(),
    ].filter(Boolean).join(' · ')
    createCobro({
      empresa_id:        empresaCobro.id,
      fecha_desde,
      fecha_hasta,
      toneladas_totales: ton_totales,
      total,
      obs:               obsConFecha,
      tramo_ids:         modalTramos.map(t => t.id),
    }, {
      onSuccess: (creado) => {
        toast('✓ Cobro registrado — ahora podés adjuntar liquidación y comprobante', 'ok')
        setCobroCreado({ id: creado.id, total, ton: ton_totales })
      },
      onError: () => toast('Error al registrar', 'err'),
    })
  }

  const empresasActivas = (empresas as EmpresaTransportista[]).filter(e => e.estado === 'activa')

  // Datos para el modal
  const modalTodosTramos = empresaCobro
    ? tramosPendientes.filter(t => t.empresa_id === empresaCobro.id)
    : []
  const modalDesglose = empresaCobro ? calcDesglose(modalTodosTramos, empresaCobro.id) : []
  // Filtrado por el buscador del modal (remito, cantera, fecha o #tramo).
  const modalDesgloseFiltrado = (() => {
    const q = busquedaRemito.trim().toLowerCase()
    if (!q) return modalDesglose
    return modalDesglose.filter(d =>
      (d.t.remito_descarga ?? d.t.remito_carga ?? `tramo #${d.t.id}`).toLowerCase().includes(q) ||
      (d.cantera?.nombre ?? '').toLowerCase().includes(q) ||
      (d.fecha ?? '').includes(q) ||
      String(d.t.id).includes(q),
    )
  })()
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
                            const nombre = d.cantera?.nombre ?? `Punto de carga ${d.t.cantera_id ?? '?'}`
                            if (!acc[nombre]) acc[nombre] = { ton: 0, tarifa: d.tarifa, subtotal: 0 }
                            acc[nombre].ton      += d.ton
                            acc[nombre].subtotal += d.subtotal
                            acc[nombre].tarifa    = d.tarifa
                            return acc
                          }, {})
                        ).map(([nombre, v]) => (
                          <div key={nombre} className={v.tarifa > 0 ? 'text-gris-mid' : 'text-rojo font-semibold'}>
                            {v.tarifa > 0
                              ? <>{nombre}: {fmtTon(v.ton)} × ${v.tarifa}/tn = {fmtM(v.subtotal)}</>
                              : <>{nombre}: {fmtTon(v.ton)} · ⚠ Sin tarifa cargada</>}
                          </div>
                        ))}
                        {desglose.some(d => d.tarifa === 0) && (
                          <div className="text-rojo font-semibold mt-1">
                            ⚠ {desglose.filter(d => d.tarifa === 0).length} remito(s) sin tarifa — no suman al total. Cargá la tarifa del punto de carga.
                          </div>
                        )}
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
                  <div className="mt-3 pt-3 border-t border-gris flex flex-wrap gap-2 items-center">
                    <Button variant="primary" size="sm" onClick={() => abrirCobrar(empresa)}>
                      💰 Registrar cobro
                    </Button>
                    <button
                      onClick={() => setSaldoExpandida(saldoExpandida === empresa.id ? null : empresa.id)}
                      className="text-xs text-azul hover:underline"
                    >
                      {saldoExpandida === empresa.id
                        ? '▲ Ocultar remitos'
                        : `▼ Ver remitos (${mis_tramos.length})`}
                    </button>
                  </div>
                )}

                {/* Lista expandida de remitos pendientes con botón de
                    editar toneladas — útil cuando la empresa paga distinto
                    a lo registrado en el remito. Cada fila es clickeable y
                    abre el tab Viajes con un deep-link al tramo en cuestión.
                    El botón ✏️ tiene stopPropagation para no abrir el deep
                    link cuando se edita acá. */}
                {saldoExpandida === empresa.id && !sinMovimientos && (
                  <div className="mt-3 bg-gris/30 rounded-card divide-y divide-gris-mid">
                    {desglose
                      .sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? ''))
                      .map(d => {
                        const chofer = choferes.find(c => c.id === d.t.chofer_id)
                        return (
                          <div
                            key={d.t.id}
                            role="link"
                            tabIndex={0}
                            onClick={() => router.push(`/logistica?tab=viajes&tramo=${d.t.id}`)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                router.push(`/logistica?tab=viajes&tramo=${d.t.id}`)
                              }
                            }}
                            title="Abrir tramo en la pestaña Viajes"
                            className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-xs cursor-pointer hover:bg-azul-light/40 transition-colors"
                          >
                            <div className="flex-1 min-w-0 basis-full sm:basis-auto">
                              <div className="text-gris-dark">
                                {d.fecha ? fmtDate(d.fecha) : '—'} · #{d.t.id}
                                {d.t.remito_descarga && <span className="ml-1 font-mono">· R-{d.t.remito_descarga}</span>}
                                {chofer && <span className="ml-1">· 👷 {chofer.nombre}</span>}
                              </div>
                              <div className="font-semibold text-carbon truncate">
                                {d.cantera?.nombre ?? `Punto de carga ${d.t.cantera_id ?? '?'}`}
                              </div>
                            </div>
                            <div className="text-right shrink-0 font-mono min-w-0">
                              <div>{fmtTon(d.ton)}</div>
                              {d.tarifa > 0
                                ? <div className="text-gris-dark text-[11px]">×${d.tarifa.toLocaleString('es-AR')}</div>
                                : <div className="text-rojo text-[11px] font-semibold">⚠ Sin tarifa</div>}
                            </div>
                            <div className="font-mono font-bold text-verde shrink-0 w-auto sm:w-20 text-right">{d.tarifa > 0 ? fmtM(d.subtotal) : '—'}</div>
                            <button
                              onClick={(e) => { e.stopPropagation(); abrirEditarTramo(d.t) }}
                              title="Editar toneladas / nº remito"
                              className="text-xs px-2 py-1 rounded hover:bg-gris-mid transition-colors shrink-0"
                            >✏️</button>
                          </div>
                        )
                      })}
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

      {/* Historial cobros — vista compacta con filtros */}
      {cobros.length > 0 && (() => {
        const todos = cobros as Cobro[]
        const q = busquedaCobro.trim().toLowerCase()
        const filtrados = todos.filter(c => {
          if (filtroEstadoCobro === 'pendientes' && c.estado !== 'pendiente') return false
          if (filtroEstadoCobro === 'cobrados'   && c.estado !== 'cobrado')   return false
          if (q && !(c.empresas_transportistas?.nombre ?? '').toLowerCase().includes(q)) return false
          if (cobroDesde && c.fecha_desde < cobroDesde) return false
          if (cobroHasta && c.fecha_hasta > cobroHasta) return false
          return true
        })
        // Orden por fecha_desde desc (más reciente primero).
        const ordenados = [...filtrados].sort((a, b) => b.fecha_desde.localeCompare(a.fecha_desde))
        // Resumen sobre los visibles (después de filtros).
        const pendientesVis = ordenados.filter(c => c.estado === 'pendiente')
        const cobradosVis   = ordenados.filter(c => c.estado === 'cobrado')
        const totalAdeudado = pendientesVis.reduce((s, c) => s + c.total, 0)
        const totalCobrado  = cobradosVis.reduce((s, c) => s + c.total, 0)
        const countPendGlob = todos.filter(c => c.estado === 'pendiente').length
        const countCobrGlob = todos.filter(c => c.estado === 'cobrado').length
        const hayFiltrosFecha = !!(cobroDesde || cobroHasta)

        return (
          <div className="bg-white rounded-card shadow-card overflow-hidden">
            {/* Header con filtros */}
            <div className="px-4 py-3 border-b border-gris flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h2 className="text-xs font-bold text-gris-dark uppercase tracking-wider">
                  Historial de cobros
                </h2>
                <div className="text-[11px] text-gris-dark">
                  {ordenados.length} de {todos.length}
                </div>
              </div>

              {/* Chips de estado */}
              <div className="flex gap-1.5 flex-wrap">
                {([
                  { key: 'pendientes' as const, label: `⚠ Pendientes (${countPendGlob})`, color: 'bg-naranja text-white border-naranja', alt: 'border-naranja text-naranja-dark' },
                  { key: 'cobrados'   as const, label: `✓ Cobrados (${countCobrGlob})`,   color: 'bg-verde text-white border-verde',     alt: 'border-verde text-verde' },
                  { key: 'todos'      as const, label: `Todos (${todos.length})`,         color: 'bg-azul text-white border-azul',       alt: 'border-azul text-azul-mid' },
                ]).map(opt => {
                  const active = filtroEstadoCobro === opt.key
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setFiltroEstadoCobro(opt.key)}
                      className={`text-xs font-bold px-3 py-1.5 rounded-full border-[1.5px] transition-colors ${
                        active ? opt.color : `bg-white ${opt.alt} hover:bg-gris/40`
                      }`}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>

              {/* Búsqueda + rango fechas */}
              <div className="flex items-end gap-2 flex-wrap">
                <div className="relative flex-1 min-w-[180px]">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gris-dark text-xs">🔍</span>
                  <input
                    type="text"
                    autoComplete="off"
                    value={busquedaCobro}
                    onChange={e => setBusquedaCobro(e.target.value)}
                    placeholder="Buscar empresa..."
                    className="w-full pl-8 pr-3 py-1.5 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none bg-white focus:border-naranja"
                  />
                  {busquedaCobro && (
                    <button
                      onClick={() => setBusquedaCobro('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gris-dark hover:text-carbon text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gris-dark uppercase tracking-wider mb-0.5">
                    Desde
                  </label>
                  <input
                    type="date"
                    value={cobroDesde}
                    onChange={e => setCobroDesde(e.target.value)}
                    className="border-[1.5px] border-gris-mid rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:border-naranja"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gris-dark uppercase tracking-wider mb-0.5">
                    Hasta
                  </label>
                  <input
                    type="date"
                    value={cobroHasta}
                    onChange={e => setCobroHasta(e.target.value)}
                    className="border-[1.5px] border-gris-mid rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:border-naranja"
                  />
                </div>
                {hayFiltrosFecha && (
                  <button
                    onClick={() => { setCobroDesde(''); setCobroHasta('') }}
                    className="text-[11px] text-gris-dark hover:text-rojo pb-2"
                  >
                    ✕ Limpiar fechas
                  </button>
                )}
              </div>

              {/* Resumen */}
              <div className="flex items-center gap-3 flex-wrap text-[11px] text-gris-dark">
                <span><strong className="text-naranja-dark">{pendientesVis.length}</strong> pendiente{pendientesVis.length !== 1 ? 's' : ''} · <span className="font-mono font-bold text-naranja-dark">{fmtM(totalAdeudado)}</span> adeudado</span>
                <span className="text-gris-mid">·</span>
                <span><strong className="text-verde">{cobradosVis.length}</strong> cobrado{cobradosVis.length !== 1 ? 's' : ''} · <span className="font-mono font-bold text-verde">{fmtM(totalCobrado)}</span></span>
              </div>
            </div>

            {/* Lista compacta */}
            {ordenados.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gris-dark italic">
                Sin cobros para los filtros aplicados.
              </div>
            ) : (
              <div className="divide-y divide-gris">
                {ordenados.map(c => {
                  const cobrado = c.estado === 'cobrado'
                  return (
                    <div
                      key={c.id}
                      onClick={() => setCobroDetalle(c)}
                      className={`px-4 py-2.5 flex items-center gap-3 flex-wrap cursor-pointer hover:bg-gris/40 transition-colors border-l-4 ${cobrado ? 'border-verde' : 'border-naranja'}`}
                    >
                      <span className={`text-sm shrink-0 ${cobrado ? 'text-verde' : 'text-naranja'}`}>
                        {cobrado ? '✓' : '⚠'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm text-azul truncate">
                          {c.empresas_transportistas?.nombre ?? '—'}
                        </div>
                        <div className="text-[11px] text-gris-dark">
                          {fmtFecha(c.fecha_desde)} → {fmtFecha(c.fecha_hasta)} · {fmtTon(c.toneladas_totales)}
                        </div>
                      </div>
                      <div className="font-mono font-bold text-base shrink-0 text-right">
                        <span className={cobrado ? 'text-verde' : 'text-naranja-dark'}>{fmtM(c.total)}</span>
                      </div>
                      {!cobrado && (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={ev => {
                            ev.stopPropagation()
                            marcarCobrado(c.id, {
                              onSuccess: () => toast('✓ Marcado como cobrado', 'ok'),
                              onError:   (err: any) => {
                                if (err?.body?.error === 'FALTA_COMPROBANTE_PAGO') {
                                  toast('Subí el comprobante de pago antes de marcar cobrado', 'err')
                                } else {
                                  toast(err?.message || 'Error al marcar cobrado', 'err')
                                }
                              },
                            })
                          }}
                        >
                          ✓ Cobrar
                        </Button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })()}

      {/* Modal detalle de cobro */}
      <Modal
        open={!!cobroDetalle}
        onClose={() => setCobroDetalle(null)}
        title="💰 DETALLE DE COBRO"
        width="max-w-2xl"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                if (!cobroDetalle) return
                if (!confirm('¿Eliminar cobro? Los remitos asociados volverán a estar pendientes de cobro.')) return
                deleteCobro(cobroDetalle.id, {
                  onSuccess: () => { toast('✓ Cobro eliminado', 'ok'); setCobroDetalle(null) },
                  onError:   () => toast('Error al eliminar', 'err'),
                })
              }}
            >
              🗑 Eliminar
            </Button>
            {cobroDetalle?.estado === 'pendiente' && (
              <Button
                variant="primary"
                onClick={() => {
                  if (!cobroDetalle) return
                  marcarCobrado(cobroDetalle.id, {
                    onSuccess: () => { toast('✓ Marcado como cobrado', 'ok'); setCobroDetalle(null) },
                    onError:   (err: any) => {
                      if (err?.body?.error === 'FALTA_COMPROBANTE_PAGO') {
                        toast('Subí el comprobante de pago antes de marcar cobrado', 'err')
                      } else {
                        toast(err?.message || 'Error al marcar cobrado', 'err')
                      }
                    },
                  })
                }}
              >
                ✓ Marcar cobrado
              </Button>
            )}
            {cobroDetalle?.estado === 'cobrado' && (
              <Button
                variant="ghost"
                onClick={() => {
                  if (!cobroDetalle) return
                  if (!confirm('¿Revertir este cobro a pendiente?')) return
                  revertirCobrado(cobroDetalle.id, {
                    onSuccess: () => { toast('✓ Cobro revertido a pendiente', 'ok'); setCobroDetalle(null) },
                    onError:   (err: any) => toast(err?.message || 'Error al revertir', 'err'),
                  })
                }}
              >
                ↩ Revertir a pendiente
              </Button>
            )}
            <Button variant="secondary" onClick={() => setCobroDetalle(null)}>Cerrar</Button>
          </>
        }
      >
        {cobroDetalle && (() => {
          // Tramos asociados a este cobro (vía tramos.cobro_id).
          const tramosCobro = (tramos as Tramo[]).filter(t => t.cobro_id === cobroDetalle.id)
          // Importe individual por remito = ton × tarifa vigente a la fecha del
          // tramo — el mismo cálculo (calcDesglose) con el que se armó el total
          // del cobro. La suma debería dar cobroDetalle.total; si difiere (tarifa
          // histórica borrada o total ajustado a mano) se avisa al pie.
          const desgloseCobro   = calcDesglose(tramosCobro, cobroDetalle.empresa_id)
          const sumaSubtotales  = desgloseCobro.reduce((s, d) => s + d.subtotal, 0)
          const difiereDelTotal = Math.abs(sumaSubtotales - cobroDetalle.total) > 1
          const subtotalPorTramo = new Map(desgloseCobro.map(d => [d.t.id, d]))
          return (
            <div className="flex flex-col gap-4">
              {/* Resumen */}
              <div className={`rounded-xl px-4 py-3 ${cobroDetalle.estado === 'cobrado' ? 'bg-verde-light border border-verde/30' : 'bg-amarillo-light border border-amarillo/30'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <Badge
                    variant={cobroDetalle.estado === 'cobrado' ? 'activo' : 'pendiente'}
                    label={cobroDetalle.estado === 'cobrado' ? 'Cobrado' : 'Pendiente'}
                  />
                  <span className="font-bold text-azul">{cobroDetalle.empresas_transportistas?.nombre ?? '—'}</span>
                </div>
                <div className="text-xs text-gris-dark">
                  {fmtFecha(cobroDetalle.fecha_desde)} → {fmtFecha(cobroDetalle.fecha_hasta)}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                  <div>
                    <div className="text-[10px] text-gris-dark uppercase tracking-wide font-bold">Toneladas</div>
                    <div className="font-mono">{fmtTon(cobroDetalle.toneladas_totales)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-gris-dark uppercase tracking-wide font-bold">Total</div>
                    <div className="font-mono font-bold text-verde">{fmtM(cobroDetalle.total)}</div>
                  </div>
                </div>
                {cobroDetalle.obs && (
                  <div className="text-[11px] text-gris-dark mt-2 italic">{cobroDetalle.obs}</div>
                )}
              </div>

              {/* Tramos incluidos */}
              <div>
                <h3 className="text-xs font-bold text-gris-dark uppercase tracking-wider mb-2">
                  Remitos incluidos ({tramosCobro.length})
                </h3>
                {tramosCobro.length === 0 ? (
                  <div className="text-xs text-gris-mid italic">No hay tramos asociados.</div>
                ) : (
                  <>
                    <div className="bg-gris/30 rounded-xl divide-y divide-gris-mid max-h-56 overflow-y-auto">
                      {tramosCobro.map(t => {
                        const d = subtotalPorTramo.get(t.id)
                        const ton = d?.ton ?? (t.toneladas_descarga ?? t.toneladas_carga ?? 0)
                        const fecha = t.fecha_descarga ?? t.fecha_carga
                        const cantera = canteras.find(c => c.id === t.cantera_id)
                        const tarifa = d?.tarifa ?? 0
                        const subtotal = d?.subtotal ?? 0
                        return (
                          <div key={t.id} className="px-3 py-2 text-xs flex items-center justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-carbon truncate">
                                {cantera?.nombre ?? '—'} {t.remito_carga ? `· #${t.remito_carga}` : ''}
                              </div>
                              <div className="text-gris-dark text-[11px]">
                                {fecha ? fmtFecha(fecha) : '—'}
                                {' · '}{fmtTon(ton)}
                                {tarifa > 0 && <> {' × '}${tarifa.toLocaleString('es-AR')}/t</>}
                              </div>
                            </div>
                            <div className="font-mono font-bold text-verde shrink-0">
                              {subtotal > 0 ? fmtM(subtotal) : '—'}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    {/* Suma de los importes individuales. Debería igualar el total
                        del cobro; si difiere, avisamos (tarifa histórica borrada
                        o total ajustado a mano al cobrar). */}
                    <div className="flex items-center justify-between gap-2 px-3 py-2 mt-1 text-xs font-bold">
                      <span className="text-gris-dark uppercase tracking-wide">Suma remitos</span>
                      <span className="font-mono text-verde">{fmtM(sumaSubtotales)}</span>
                    </div>
                    {difiereDelTotal && (
                      <div className="text-[11px] text-[#7A5500] bg-amarillo-light border border-amarillo/30 rounded-lg px-3 py-2 mt-1">
                        ⚠ La suma de los remitos ({fmtM(sumaSubtotales)}) no coincide con el total cobrado ({fmtM(cobroDetalle.total)}). Puede deberse a una tarifa modificada después del cobro o a un ajuste manual del total.
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Adjuntos: liquidación líquido producto + comprobante de pago */}
              <div className="border-t border-gris-mid pt-4">
                <CobroAdjuntosSection cobroId={cobroDetalle.id} />
              </div>
            </div>
          )
        })()}
      </Modal>

      {/* Modal cobrar */}
      <Modal
        open={modalCobro}
        onClose={cerrarModalCobro}
        title={cobroCreado ? '💰 ADJUNTAR DOCUMENTOS DEL COBRO' : '💰 REGISTRAR COBRO'}
        width={cobroCreado ? 'max-w-2xl' : 'max-w-lg'}
        footer={
          cobroCreado ? (
            <Button variant="primary" onClick={cerrarModalCobro}>✓ Listo</Button>
          ) : (
            <>
              <Button variant="secondary" onClick={cerrarModalCobro}>Cancelar</Button>
              <Button variant="primary" loading={creando} onClick={form.handleSubmit(handleCobrar)}>
                ✓ Guardar cobro
              </Button>
            </>
          )
        }>
        {/* ── Modo adjuntos: cobro ya creado ── */}
        {cobroCreado && empresaCobro && (
          <div className="flex flex-col gap-4">
            <div className="bg-verde-light border border-verde/30 rounded-xl px-4 py-3">
              <div className="font-bold text-verde">✓ Cobro registrado — {empresaCobro.nombre}</div>
              <div className="text-xs text-verde mt-0.5">
                {fmtTon(cobroCreado.ton)} · <span className="font-mono font-bold">{fmtM(cobroCreado.total)}</span>
              </div>
              <div className="text-[11px] text-gris-dark mt-2">
                Subí ahora la liquidación del líquido producto y el comprobante de cobro. Si no los tenés
                disponibles, podés cerrar y agregarlos después editando el cobro.
              </div>
            </div>
            <CobroAdjuntosSection cobroId={cobroCreado.id} />
          </div>
        )}

        {/* ── Modo registro: cobro nuevo ── */}
        {!cobroCreado && empresaCobro && (
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
                    onClick={() => setSelectedIds(prev => new Set([...prev, ...modalDesgloseFiltrado.map(d => d.t.id)]))}>
                    {busquedaRemito ? 'Todos (filtrados)' : 'Todos'}
                  </button>
                  <button className="text-azul hover:underline"
                    onClick={() => setSelectedIds(prev => {
                      const next = new Set(prev)
                      modalDesgloseFiltrado.forEach(d => next.delete(d.t.id))
                      return next
                    })}>
                    {busquedaRemito ? 'Ninguno (filtrados)' : 'Ninguno'}
                  </button>
                </div>
              </div>
              {/* Buscador de remitos del modal */}
              <Input
                placeholder="🔍 Buscar remito, punto de carga o fecha..."
                value={busquedaRemito}
                onChange={e => setBusquedaRemito(e.target.value)}
                className="mb-2"
              />
              <div className="bg-gris rounded-xl divide-y divide-gris-mid max-h-60 overflow-y-auto">
                {modalDesgloseFiltrado.length === 0 && (
                  <p className="text-center py-4 text-sm text-gris-dark">
                    {busquedaRemito ? `Sin remitos que coincidan con "${busquedaRemito}"` : 'Sin remitos pendientes'}
                  </p>
                )}
                {modalDesgloseFiltrado.map(d => {
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
                          {d.tarifa > 0
                            ? <> · ${d.tarifa}/tn</>
                            : <span className="text-rojo font-semibold"> · ⚠ Sin tarifa</span>}
                        </div>
                      </div>
                      <div className={`text-xs font-mono font-bold shrink-0 ${d.tarifa <= 0 ? 'text-rojo' : checked ? 'text-verde' : 'text-gris-dark line-through'}`}>
                        {d.tarifa > 0 ? fmtM(d.subtotal) : 'Sin tarifa'}
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input label="Fecha de cobro" type="date" required {...form.register('fecha', { required: true })} />
              <Input label="Observaciones" placeholder="Nº factura, referencia..." {...form.register('obs')} />
            </div>
          </div>
        )}
      </Modal>

      {/* Modal editar toneladas/remito de un tramo pendiente. Útil cuando
          la empresa transportista paga distinto de lo registrado en el
          remito de descarga (discrepancia de balanza). */}
      <Modal
        open={!!editandoTramo}
        onClose={() => setEditandoTramo(null)}
        title="✏️ EDITAR REMITO"
        width="max-w-md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditandoTramo(null)}>Cancelar</Button>
            <Button variant="primary" loading={updatingTramo} onClick={formEditTramo.handleSubmit(handleEditTramo)}>
              ✓ Guardar
            </Button>
          </>
        }
      >
        {editandoTramo && (() => {
          const cantera  = canteras.find(c => c.id === editandoTramo.cantera_id)
          const fecha    = editandoTramo.fecha_descarga ?? editandoTramo.fecha_carga
          return (
            <div className="flex flex-col gap-4">
              <div className="bg-gris/30 rounded-card p-3 text-xs">
                <div className="font-bold">Tramo #{editandoTramo.id}</div>
                <div className="text-gris-dark mt-0.5">
                  {fecha ? fmtDate(fecha) : '—'} · {cantera?.nombre ?? '—'}
                </div>
                <div className="text-[11px] text-gris-mid mt-1">
                  Cargado al inicio: {editandoTramo.toneladas_carga ?? '—'} tn
                </div>
              </div>
              <Input
                label="Toneladas de descarga"
                type="number"
                step="0.01"
                placeholder="0.00"
                hint="Lo que la empresa registró/paga, no lo del remito original."
                {...formEditTramo.register('toneladas_descarga')}
              />
              <Input
                label="Nº de remito (opcional)"
                placeholder="R-00456"
                {...formEditTramo.register('remito_descarga')}
              />
              <p className="text-[11px] text-gris-mid italic">
                Solo se puede editar si el tramo no está liquidado ni cobrado.
              </p>
            </div>
          )
        })()}
      </Modal>
    </>
  )
}

// ─── Estado de remitos por empresa y período ──────────────────────────────────

function RemitosSection() {
  const toast = useToast()
  const { data: empresas     = [] } = useEmpresas()
  const { data: tramos       = [] } = useTramos()
  const { data: todasTarifas = [] } = useTarifasEmpresa()
  const { data: canteras     = [] } = useCanteras()
  const { data: depositos    = [] } = useDepositos()
  const { data: choferes     = [] } = useChoferes()
  const { data: camiones     = [] } = useCamiones()
  const { data: cobros       = [] } = useCobros()

  // Lookup de cobro_id → estado para que la división Adeudados/Cobrados
  // contemple el estado real del cobro (no solo la presencia de cobro_id).
  // Un tramo con cobro_id pero estado='pendiente' sigue siendo adeudado.
  const cobroEstadoById = new Map<number, Cobro['estado']>(
    (cobros as Cobro[]).map(c => [c.id, c.estado] as const)
  )
  const cobroIdConfirmado = (cobroId: number | null | undefined): boolean =>
    !!cobroId && cobroEstadoById.get(cobroId) === 'cobrado'

  const [empresaId,  setEmpresaId]  = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [descargandoZip, setDescargandoZip] = useState(false)
  // Paneles colapsables: default ambos cerrados para que la vista entre
  // de una sola pantalla (las listas se hacían muy largas).
  const [adeudadosAbierto, setAdeudadosAbierto] = useState(false)
  const [cobradosAbierto,  setCobradosAbierto]  = useState(false)
  // Modal de armado manual de paquete.
  const [modalArmadoOpen, setModalArmadoOpen] = useState(false)
  const [seleccionados,   setSeleccionados]   = useState<Set<number>>(new Set())
  // Filtro de estado dentro del modal: adeudados (default) / cobrados / ambos.
  const [modalFiltroEstado, setModalFiltroEstado] = useState<'adeudados' | 'cobrados' | 'ambos'>('adeudados')

  function enrichTramo(t: Tramo) {
    const empId   = t.empresa_id ?? 0
    const ton     = t.toneladas_descarga ?? t.toneladas_carga ?? 0
    const fecha   = t.fecha_descarga ?? t.fecha_carga
    const tarifa  = tarifaParaFecha(todasTarifas as TarifaEmpresaCantera[], empId, t.cantera_id, t.deposito_id, fecha ?? null)
    const cantera = canteras.find(c => c.id === t.cantera_id)
    const empresa = (empresas as EmpresaTransportista[]).find(e => e.id === empId)
    const remito  = t.remito_descarga ?? t.remito_carga
    return { t, ton, tarifa, subtotal: ton * tarifa, fecha, cantera, empresa, remito }
  }

  // Excluir lugares operativos (no facturables, p.ej. CHIVILCOY) del listado
  // y la exportación: un cargado nunca debería tocarlos, pero si quedó alguno
  // viejo no debe aparecer en $0 ni colarse en el Excel/ZIP de remitos.
  const canterasOperativas  = new Set(canteras.filter(c => c.operativo).map(c => c.id))
  const depositosOperativos = new Set(depositos.filter(d => d.operativo).map(d => d.id))
  const esLugarOperativo = (t: Tramo) =>
    (t.cantera_id != null && canterasOperativas.has(t.cantera_id)) ||
    (t.deposito_id != null && depositosOperativos.has(t.deposito_id))

  const tramosBase = (tramos as Tramo[]).filter(t =>
    t.tipo === 'cargado' && t.estado === 'completado' && !esLugarOperativo(t) &&
    (!empresaId || t.empresa_id === Number(empresaId)) &&
    (!fechaDesde || (t.fecha_descarga ?? t.fecha_carga ?? '') >= fechaDesde) &&
    (!fechaHasta || (t.fecha_descarga ?? t.fecha_carga ?? '') <= fechaHasta)
  )

  // Para el Excel: solo tramos que ya tienen fecha_descarga y filtrados por ese rango
  function exportarExcel() {
    const filtrados = (tramos as Tramo[])
      .filter(t => t.tipo === 'cargado' && t.estado === 'completado' && t.fecha_descarga && !esLugarOperativo(t))
      .filter(t => !empresaId  || t.empresa_id === Number(empresaId))
      .filter(t => !fechaDesde || (t.fecha_descarga ?? '') >= fechaDesde)
      .filter(t => !fechaHasta || (t.fecha_descarga ?? '') <= fechaHasta)
      .sort((a, b) => (a.fecha_descarga ?? '').localeCompare(b.fecha_descarga ?? ''))

    if (filtrados.length === 0) { toast('Sin remitos que exportar con los filtros actuales', 'warn'); return }

    const rows: (string | number)[][] = [[
      'Fecha descarga', 'Empresa', 'Chofer', 'Patente', 'Punto de carga',
      'Tn carga', 'Tn descarga', 'Remito carga', 'Remito descarga',
      '$/tn', 'Subtotal',
    ]]

    let totalCarga = 0, totalDescarga = 0, totalSubtotal = 0
    for (const t of filtrados) {
      const d       = enrichTramo(t)
      const chofer  = choferes.find(c => c.id === t.chofer_id)
      const camion  = camiones.find(c => c.id === t.camion_id)
      const tonC    = t.toneladas_carga ?? 0
      const tonD    = t.toneladas_descarga ?? 0
      totalCarga    += tonC
      totalDescarga += tonD
      totalSubtotal += d.subtotal
      rows.push([
        fmtFecha(t.fecha_descarga!),
        d.empresa?.nombre ?? '',
        chofer?.nombre ?? '',
        camion?.patente ?? '',
        d.cantera?.nombre ?? '',
        tonC,
        tonD,
        t.remito_carga ?? '',
        t.remito_descarga ?? '',
        d.tarifa,
        d.subtotal,
      ])
    }
    // Fila total
    rows.push(['', '', '', '', 'TOTAL', totalCarga, totalDescarga, '', '', '', totalSubtotal])

    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws['!cols'] = [
      { wch: 13 }, { wch: 22 }, { wch: 22 }, { wch: 12 }, { wch: 18 },
      { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 16 },
      { wch: 10 }, { wch: 14 },
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Remitos')

    const empNombre = empresaId ? ((empresas as EmpresaTransportista[]).find(e => e.id === Number(empresaId))?.nombre ?? 'empresa') : 'todas'
    const rango = [fechaDesde || 'inicio', fechaHasta || 'hoy'].join('_a_')
    XLSX.writeFile(wb, `Remitos_${empNombre.replace(/\s+/g, '_')}_${rango}.xlsx`)
    toast('✓ Excel exportado', 'ok')
  }

  // Un tramo se considera cobrado solo cuando su cobro está en estado='cobrado'.
  // Mientras el cobro siga 'pendiente' (esperando comprobante de pago), el
  // tramo se queda en adeudados.
  const adeudados = tramosBase.filter(t => !cobroIdConfirmado(t.cobro_id)).map(enrichTramo)
  const cobrados  = tramosBase.filter(t =>  cobroIdConfirmado(t.cobro_id)).map(enrichTramo)

  // Genera y descarga el ZIP con los remitos (carga + descarga) de la lista
  // de tramos enriched que se le pase. Los agrupa por empresa transportista
  // en subcarpetas. Es la lógica core reutilizada por el botón "todos los
  // adeudados" y el modal de armado manual.
  async function armarZipDeTramos(
    items: ReturnType<typeof enrichTramo>[],
    nombreArchivo: string,
  ) {
    if (descargandoZip) return
    if (items.length === 0) {
      toast('Seleccioná al menos un remito', 'warn')
      return
    }
    setDescargandoZip(true)
    try {
      const zip = new JSZip()
      let added = 0
      let tramosSinRemito = 0

      for (const d of items) {
        const t = d.t
        const empresaNombre = (d.empresa?.nombre ?? 'Sin empresa').replace(/[\/\\]/g, '-')
        const folder = zip.folder(empresaNombre)!
        const archivos = [
          { url: t.remito_carga_img_url,    label: 'CARGA',    nro: t.remito_carga    ?? `T${t.id}` },
          { url: t.remito_descarga_img_url, label: 'DESCARGA', nro: t.remito_descarga ?? `T${t.id}` },
        ]
        let tuvoAlguno = false
        for (const it of archivos) {
          if (!it.url) continue
          try {
            const resp = await fetch(it.url)
            if (!resp.ok) continue
            const blob = await resp.blob()
            const ext = guessExt(it.url, blob.type)
            const safeNro = String(it.nro).replace(/[\/\\:*?"<>|]/g, '_')
            // Si ya hay un archivo con el mismo nombre (mismo nro repetido en
            // dos tramos), JSZip lo sobrescribe — sufijo con id del tramo.
            const filename = `${safeNro}-${it.label}-T${t.id}.${ext}`
            folder.file(filename, blob)
            added += 1
            tuvoAlguno = true
          } catch (err) {
            console.warn('[remitos-zip] fetch falló', it.url, err)
          }
        }
        if (!tuvoAlguno) tramosSinRemito += 1
      }

      if (added === 0) {
        toast('No se pudo descargar ningún remito (¿fotos no subidas?)', 'err')
        return
      }

      const blob = await zip.generateAsync({ type: 'blob' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url
      a.download = nombreArchivo
      a.click()
      URL.revokeObjectURL(url)

      const msg = tramosSinRemito > 0
        ? `✓ ZIP con ${added} archivo${added !== 1 ? 's' : ''} · ${tramosSinRemito} tramo${tramosSinRemito !== 1 ? 's' : ''} sin remito adjunto`
        : `✓ ZIP con ${added} archivo${added !== 1 ? 's' : ''}`
      toast(msg, 'ok')
    } catch (err) {
      console.error('[remitos-zip]', err)
      toast('Error al generar el ZIP', 'err')
    } finally {
      setDescargandoZip(false)
    }
  }

  // Wrapper "todos los adeudados" — comportamiento histórico del botón existente.
  async function descargarRemitosZip() {
    if (adeudados.length === 0) {
      toast('Sin remitos adeudados con los filtros actuales', 'warn')
      return
    }
    const empNombre = empresaId
      ? ((empresas as EmpresaTransportista[]).find(e => e.id === Number(empresaId))?.nombre ?? 'empresa').replace(/\s+/g, '_')
      : 'todas'
    const rango = [fechaDesde || 'inicio', fechaHasta || 'hoy'].join('_a_')
    await armarZipDeTramos(adeudados, `Remitos_adeudados_${empNombre}_${rango}.zip`)
  }

  // Wrapper "armado manual" — los tramos marcados con checkbox en el modal.
  // Acepta tanto adeudados como cobrados. El nombre del ZIP refleja la mezcla.
  async function descargarSeleccionados() {
    const itemsAdeudados = adeudados.filter(d => seleccionados.has(d.t.id))
    const itemsCobrados  = cobrados.filter(d => seleccionados.has(d.t.id))
    const items = [...itemsAdeudados, ...itemsCobrados]
    if (items.length === 0) return

    const fecha = toISO(new Date())
    let sufijo: string
    if (itemsAdeudados.length > 0 && itemsCobrados.length > 0) sufijo = 'mixto'
    else if (itemsCobrados.length > 0)                          sufijo = 'cobrados'
    else                                                        sufijo = 'adeudados'

    await armarZipDeTramos(items, `Remitos_${sufijo}_${fecha}.zip`)
    setModalArmadoOpen(false)
    setSeleccionados(new Set())
    setModalFiltroEstado('adeudados')
  }

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

  // Renderiza una lista de remitos (adeudados o cobrados).
  // - Con filtro de empresa activo: lista plana ordenada por fecha desc.
  // - Sin filtro: agrupada por empresa (header con nombre · N · subtotal),
  //   empresas alfabéticas, remitos por fecha desc dentro de cada grupo.
  function renderListaRemitos(items: ReturnType<typeof enrichTramo>[], vacioMsg: string) {
    if (items.length === 0) {
      return <p className="text-xs text-gris-dark text-center py-4 italic">{vacioMsg}</p>
    }
    const porFechaDesc = (a: typeof items[0], b: typeof items[0]) =>
      (b.fecha ?? '').localeCompare(a.fecha ?? '')

    // Con filtro de empresa: una sola empresa, no tiene sentido agrupar.
    if (empresaId) {
      return [...items].sort(porFechaDesc).map(d => <FilaRemito key={d.t.id} d={d} />)
    }

    // Sin filtro: agrupar por empresa.
    const grupos = new Map<string, { nombre: string; items: typeof items; subtotal: number }>()
    for (const d of items) {
      const key = String(d.empresa?.id ?? 0)
      const g = grupos.get(key) ?? { nombre: d.empresa?.nombre ?? 'Sin empresa', items: [], subtotal: 0 }
      g.items.push(d)
      g.subtotal += d.subtotal
      grupos.set(key, g)
    }
    const gruposOrden = [...grupos.values()].sort((a, b) => a.nombre.localeCompare(b.nombre))

    return gruposOrden.map(g => (
      <div key={g.nombre}>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-gris-mid/40 border-b border-gris-mid">
          <span className="text-[11px] font-bold text-carbon uppercase tracking-wide truncate">{g.nombre}</span>
          <span className="text-[10px] text-gris-dark">· {g.items.length} remito{g.items.length !== 1 ? 's' : ''}</span>
          <span className="ml-auto font-mono font-bold text-[11px] text-carbon">{fmtM(g.subtotal)}</span>
        </div>
        {[...g.items].sort(porFechaDesc).map(d => <FilaRemito key={d.t.id} d={d} />)}
      </div>
    ))
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
        <button
          onClick={() => { setSeleccionados(new Set()); setModalArmadoOpen(true) }}
          disabled={descargandoZip}
          className="ml-auto self-end inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-azul-light text-azul border border-azul/30 text-xs font-bold hover:bg-azul hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Elegir remitos específicos para armar un paquete ZIP"
        >
          🗂 Armar paquete...
        </button>
        <button
          onClick={descargarRemitosZip}
          disabled={descargandoZip}
          className="self-end inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-naranja-light text-naranja-dark border border-naranja/30 text-xs font-bold hover:bg-naranja hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Bajar los remitos (foto/PDF) de TODOS los viajes adeudados en un ZIP, agrupado por empresa"
        >
          {descargandoZip ? '⏳ Descargando...' : '📦 Todos los adeudados (ZIP)'}
        </button>
        <button
          onClick={exportarExcel}
          className="self-end inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-verde-light text-verde border border-verde/30 text-xs font-bold hover:bg-verde hover:text-white transition-colors"
          title="Exportar remitos al Excel según los filtros aplicados"
        >
          📊 Exportar Excel
        </button>
      </div>

      {/* Paneles colapsables — resumen siempre visible, click para expandir */}
      <div className="flex flex-col gap-3 p-4">
        {/* Adeudados */}
        <div className="rounded-card border-l-[5px] border-naranja overflow-hidden bg-white shadow-sm">
          <button
            type="button"
            onClick={() => setAdeudadosAbierto(v => !v)}
            aria-expanded={adeudadosAbierto}
            aria-controls="panel-adeudados"
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-naranja-light/40 transition-colors"
          >
            <span className={`text-naranja text-sm transition-transform ${adeudadosAbierto ? 'rotate-90' : ''}`}>▸</span>
            <span className="text-xs font-bold text-naranja uppercase tracking-wider">Adeudados</span>
            <span className="text-xs text-gris-dark">· {adeudados.length} tramo{adeudados.length !== 1 ? 's' : ''}</span>
            <span className="ml-auto font-mono font-bold text-naranja">{fmtM(totalAdeudado)}</span>
          </button>
          <div id="panel-adeudados" className={`overflow-hidden transition-all duration-200 ${adeudadosAbierto ? 'max-h-[200vh]' : 'max-h-0'}`}>
            <div className="bg-gris">
              {renderListaRemitos(adeudados, 'Sin remitos adeudados')}
            </div>
          </div>
        </div>

        {/* Cobrados */}
        <div className="rounded-card border-l-[5px] border-verde overflow-hidden bg-white shadow-sm">
          <button
            type="button"
            onClick={() => setCobradosAbierto(v => !v)}
            aria-expanded={cobradosAbierto}
            aria-controls="panel-cobrados"
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-verde-light/40 transition-colors"
          >
            <span className={`text-verde text-sm transition-transform ${cobradosAbierto ? 'rotate-90' : ''}`}>▸</span>
            <span className="text-xs font-bold text-verde uppercase tracking-wider">Cobrados</span>
            <span className="text-xs text-gris-dark">· {cobrados.length} tramo{cobrados.length !== 1 ? 's' : ''}</span>
            <span className="ml-auto font-mono font-bold text-verde">{fmtM(totalCobrado)}</span>
          </button>
          <div id="panel-cobrados" className={`overflow-hidden transition-all duration-200 ${cobradosAbierto ? 'max-h-[200vh]' : 'max-h-0'}`}>
            <div className="bg-gris">
              {renderListaRemitos(cobrados, 'Sin remitos cobrados')}
            </div>
          </div>
        </div>
      </div>

      {/* Modal: armar paquete manual de remitos adeudados */}
      {modalArmadoOpen && (() => {
        // Enriquezco cada item con su estado para mostrar chip en la fila y
        // para que toggleAll opere sobre el subconjunto correcto.
        type ItemModal = ReturnType<typeof enrichTramo> & { estado: 'adeudado' | 'cobrado' }
        const itemsTodos: ItemModal[] = [
          ...adeudados.map(d => ({ ...d, estado: 'adeudado' as const })),
          ...cobrados .map(d => ({ ...d, estado: 'cobrado'  as const })),
        ]
        const itemsAMostrar: ItemModal[] = itemsTodos.filter(d =>
          modalFiltroEstado === 'ambos' ? true : d.estado === (modalFiltroEstado === 'adeudados' ? 'adeudado' : 'cobrado')
        )

        // Agrupar por empresa.
        const grupos = new Map<string, { empresa: string; items: ItemModal[] }>()
        for (const d of itemsAMostrar) {
          const key = String(d.empresa?.id ?? 0)
          if (!grupos.has(key)) grupos.set(key, { empresa: d.empresa?.nombre ?? 'Sin empresa', items: [] })
          grupos.get(key)!.items.push(d)
        }
        const totalVisible = itemsAMostrar.length

        function toggleId(id: number) {
          setSeleccionados(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else              next.add(id)
            return next
          })
        }
        function toggleGrupo(ids: number[], allMarked: boolean) {
          setSeleccionados(prev => {
            const next = new Set(prev)
            if (allMarked) ids.forEach(id => next.delete(id))
            else           ids.forEach(id => next.add(id))
            return next
          })
        }
        // "Marcar todos los visibles" opera sólo sobre la vista actual,
        // así si el user está en filtro "Adeudados" no termina marcando
        // sin querer todos los cobrados.
        function toggleAllVisibles() {
          const idsVisibles = itemsAMostrar.map(d => d.t.id)
          const todosMarcados = idsVisibles.every(id => seleccionados.has(id))
          setSeleccionados(prev => {
            const next = new Set(prev)
            if (todosMarcados) idsVisibles.forEach(id => next.delete(id))
            else               idsVisibles.forEach(id => next.add(id))
            return next
          })
        }
        const idsVisibles = itemsAMostrar.map(d => d.t.id)
        const allVisiblesChecked = totalVisible > 0 && idsVisibles.every(id => seleccionados.has(id))

        function cerrar() {
          setModalArmadoOpen(false)
          setSeleccionados(new Set())
          setModalFiltroEstado('adeudados')
        }

        const tabs = [
          { key: 'adeudados' as const, label: `Adeudados (${adeudados.length})`, activoCls: 'bg-naranja text-white shadow-sm' },
          { key: 'cobrados'  as const, label: `Cobrados (${cobrados.length})`,   activoCls: 'bg-verde text-white shadow-sm'   },
          { key: 'ambos'     as const, label: 'Ambos',                            activoCls: 'bg-azul text-white shadow-sm'    },
        ]

        return (
          <Modal
            open={modalArmadoOpen}
            onClose={cerrar}
            title="🗂 ARMAR PAQUETE DE REMITOS"
            width="max-w-3xl"
            footer={
              <>
                <span className="mr-auto text-sm font-bold text-gris-dark">
                  {seleccionados.size} marcado{seleccionados.size !== 1 ? 's' : ''} en total
                </span>
                <Button variant="secondary" onClick={cerrar}>
                  Cancelar
                </Button>
                <Button
                  variant="primary"
                  loading={descargandoZip}
                  disabled={seleccionados.size === 0}
                  onClick={descargarSeleccionados}
                >
                  📦 Generar ZIP ({seleccionados.size})
                </Button>
              </>
            }
          >
            <div className="flex flex-col gap-3">
              <p className="text-xs text-gris-dark">
                Marcá los remitos que querés incluir. Las selecciones se mantienen al cambiar de filtro,
                así podés mezclar adeudados y cobrados en un mismo paquete.
              </p>

              {/* Filtro por estado */}
              <div className="flex items-center gap-1 bg-gris rounded-lg p-1">
                {tabs.map(t => {
                  const activo = modalFiltroEstado === t.key
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setModalFiltroEstado(t.key)}
                      className={`flex-1 px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${
                        activo ? t.activoCls : 'text-gris-dark hover:bg-white/60'
                      }`}
                    >
                      {t.label}
                    </button>
                  )
                })}
              </div>

              {totalVisible === 0 ? (
                <div className="bg-gris rounded-lg p-6 text-center text-sm text-gris-dark italic">
                  No hay tramos {modalFiltroEstado === 'ambos' ? 'que coincidan' : modalFiltroEstado} con los filtros actuales.
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 pb-2 border-b border-gris">
                    <input
                      type="checkbox"
                      checked={allVisiblesChecked}
                      onChange={toggleAllVisibles}
                      className="w-4 h-4 cursor-pointer accent-naranja"
                    />
                    <span className="text-sm font-bold">
                      {allVisiblesChecked ? 'Desmarcar todos los visibles' : 'Marcar todos los visibles'}
                    </span>
                    <span className="ml-auto text-xs text-gris-dark">{totalVisible} a la vista</span>
                  </div>

                  {Array.from(grupos.values())
                    .sort((a, b) => a.empresa.localeCompare(b.empresa))
                    .map(g => {
                      const idsGrupo = g.items.map(d => d.t.id)
                      const enGrupo  = idsGrupo.filter(id => seleccionados.has(id)).length
                      const allMarked = enGrupo === g.items.length
                      const someMarked = enGrupo > 0 && !allMarked

                      return (
                        <div key={g.empresa} className="bg-white border border-gris rounded-lg overflow-hidden">
                          <div className="flex items-center gap-2 bg-azul-light/30 px-3 py-2 border-b border-gris">
                            <input
                              type="checkbox"
                              checked={allMarked}
                              ref={el => { if (el) el.indeterminate = someMarked }}
                              onChange={() => toggleGrupo(idsGrupo, allMarked)}
                              className="w-4 h-4 cursor-pointer accent-naranja"
                            />
                            <span className="font-bold text-sm text-azul flex-1">{g.empresa}</span>
                            <span className="text-xs text-gris-dark">
                              {enGrupo} / {g.items.length}
                            </span>
                          </div>
                          <div>
                            {g.items.map(d => {
                              const t = d.t
                              const tieneCarga    = !!t.remito_carga_img_url
                              const tieneDescarga = !!t.remito_descarga_img_url
                              const checked = seleccionados.has(t.id)
                              const esAdeudado = d.estado === 'adeudado'
                              return (
                                <label
                                  key={t.id}
                                  className={`flex items-center gap-2 px-3 py-2 text-xs border-b border-gris last:border-0 cursor-pointer hover:bg-gris/30 ${checked ? (esAdeudado ? 'bg-naranja-light/20' : 'bg-verde-light/20') : ''}`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleId(t.id)}
                                    className="w-4 h-4 cursor-pointer accent-naranja"
                                  />
                                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase shrink-0 ${esAdeudado ? 'bg-naranja-light text-naranja-dark' : 'bg-verde-light text-verde'}`}>
                                    {esAdeudado ? '🟠 Adeudado' : '🟢 Cobrado'}
                                  </span>
                                  <span className="font-mono text-gris-dark w-20 shrink-0">
                                    {d.fecha ? fmtFecha(d.fecha) : '—'}
                                  </span>
                                  <span className="flex-1 min-w-0 truncate">
                                    {d.cantera?.nombre ?? '—'}
                                    {t.remito_carga    && <span className="ml-1 font-mono">· #{t.remito_carga}</span>}
                                    {t.remito_descarga && <span className="ml-1 font-mono">/ {t.remito_descarga}</span>}
                                  </span>
                                  <span className="flex items-center gap-1 shrink-0">
                                    <span title="Remito carga"    className={tieneCarga    ? 'text-verde' : 'text-gris-mid'}>{tieneCarga    ? '📷' : '–'}</span>
                                    <span title="Remito descarga" className={tieneDescarga ? 'text-verde' : 'text-gris-mid'}>{tieneDescarga ? '📷' : '–'}</span>
                                  </span>
                                </label>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                </>
              )}
            </div>
          </Modal>
        )
      })()}
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
