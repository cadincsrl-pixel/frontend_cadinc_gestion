'use client'

import { useMemo, useState } from 'react'
import {
  useCanteras, useDepositos, useRutas,
} from '../hooks/useLogistica'
import { apiPost, apiPatch, apiDelete } from '@/lib/api/client'
import { useQueryClient } from '@tanstack/react-query'
import { LOG_KEYS } from '../hooks/useLogistica'
import { Modal }  from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import { useForm } from 'react-hook-form'
import { intInputProps } from '@/lib/utils/inputs'
import { useGeocode } from '../hooks/useEnRuta'
import { Combobox } from '@/components/ui/Combobox'
import type { Cantera, Deposito, Ruta } from '@/types/domain.types'

export function LugaresTab() {
  const toast = useToast()
  const qc = useQueryClient()
  const { data: canteras  = [] } = useCanteras()
  const { data: depositos = [] } = useDepositos()
  const { data: rutas     = [] } = useRutas()

  const [modalCantera,  setModalCantera]  = useState(false)
  const [modalDeposito, setModalDeposito] = useState(false)
  const [modalRuta,     setModalRuta]     = useState(false)
  const [editCantera,   setEditCantera]   = useState<Cantera | null>(null)
  const [editDeposito,  setEditDeposito]  = useState<Deposito | null>(null)
  const [editRuta,      setEditRuta]      = useState<{ id: number; cantera: string; deposito: string } | null>(null)
  const [loading, setLoading] = useState(false)

  // Selector doble + matriz de cobertura de rutas (reemplaza la lista plana).
  const [selCant,  setSelCant]  = useState('')  // cantera_id (string) elegida en el selector
  const [selDep,   setSelDep]   = useState('')  // deposito_id (string) elegido en el selector
  const [kmInline, setKmInline] = useState('')  // km tipeado para carga inline desde el selector
  const [soloFaltantes, setSoloFaltantes] = useState(false)  // resaltar faltantes en la matriz

  // Lookup O(1) del par (cantera_id, deposito_id) → ruta. Lo usan el selector
  // doble y cada celda de la matriz. Las 56 combinaciones (7×8) son pocas.
  const rutaPorPar = useMemo(() => {
    const m = new Map<string, Ruta>()
    for (const r of rutas as Ruta[]) m.set(`${r.cantera_id}-${r.deposito_id}`, r)
    return m
  }, [rutas])

  const rutaSel: Ruta | null = selCant && selDep
    ? rutaPorPar.get(`${selCant}-${selDep}`) ?? null
    : null

  const faltantes = canteras.length * depositos.length - rutas.length

  const formCantera    = useForm<any>()
  const formDeposito   = useForm<any>()
  const formRuta       = useForm<any>()
  const formEditCant   = useForm<any>()
  const formEditDep    = useForm<any>()
  const formEditRuta   = useForm<any>()

  async function handleCreateCantera(data: any) {
    setLoading(true)
    try {
      await apiPost('/api/logistica/lugares/canteras', data)
      qc.invalidateQueries({ queryKey: LOG_KEYS.canteras })
      toast('✓ Cantera agregada', 'ok')
      setModalCantera(false)
      formCantera.reset()
    } catch { toast('Error al agregar', 'err') }
    setLoading(false)
  }

  async function handleUpdateCantera(data: any) {
    if (!editCantera) return
    setLoading(true)
    try {
      await apiPatch(`/api/logistica/lugares/canteras/${editCantera.id}`, data)
      qc.invalidateQueries({ queryKey: LOG_KEYS.canteras })
      toast('✓ Cantera actualizada', 'ok')
      setEditCantera(null)
    } catch { toast('Error al actualizar', 'err') }
    setLoading(false)
  }

  async function handleCreateDeposito(data: any) {
    setLoading(true)
    try {
      await apiPost('/api/logistica/lugares/depositos', data)
      qc.invalidateQueries({ queryKey: LOG_KEYS.depositos })
      toast('✓ Depósito agregado', 'ok')
      setModalDeposito(false)
      formDeposito.reset()
    } catch { toast('Error al agregar', 'err') }
    setLoading(false)
  }

  async function handleUpdateDeposito(data: any) {
    if (!editDeposito) return
    setLoading(true)
    try {
      await apiPatch(`/api/logistica/lugares/depositos/${editDeposito.id}`, data)
      qc.invalidateQueries({ queryKey: LOG_KEYS.depositos })
      toast('✓ Depósito actualizado', 'ok')
      setEditDeposito(null)
    } catch { toast('Error al actualizar', 'err') }
    setLoading(false)
  }

  async function handleCreateRuta(data: any) {
    setLoading(true)
    try {
      await apiPost('/api/logistica/lugares/rutas', {
        cantera_id:    Number(data.cantera_id),
        deposito_id:   Number(data.deposito_id),
        km_ida_vuelta: Number(data.km_ida_vuelta),
        obs: data.obs,
      })
      qc.invalidateQueries({ queryKey: LOG_KEYS.rutas })
      toast('✓ Ruta agregada', 'ok')
      setModalRuta(false)
      formRuta.reset()
    } catch (err: any) {
      // El par (cantera, depósito) tiene UNIQUE en DB. El backend reenvía el
      // mensaje crudo de Postgres (no el code 23505), así que detectamos por
      // texto. Mensaje claro en vez del genérico "Error al agregar".
      const detalle = `${err?.message ?? ''} ${(err?.body as any)?.error ?? ''}`.toLowerCase()
      const esDuplicado = detalle.includes('duplicate key') || detalle.includes('unique constraint')
      toast(esDuplicado ? 'Ya existe una ruta para ese par cantera/depósito' : 'Error al agregar', 'err')
    }
    setLoading(false)
  }

  // Carga inline de una ruta desde el selector doble (par ya elegido arriba).
  async function guardarRutaInline(canteraId: number, depositoId: number, kmRaw: string) {
    const km = Number(kmRaw)
    if (!Number.isFinite(km) || km <= 0) { toast('Ingresá un valor de km mayor a 0', 'err'); return }
    setLoading(true)
    try {
      await apiPost('/api/logistica/lugares/rutas', {
        cantera_id: canteraId, deposito_id: depositoId, km_ida_vuelta: km, obs: '',
      })
      qc.invalidateQueries({ queryKey: LOG_KEYS.rutas })
      toast('✓ Ruta agregada', 'ok')
      setKmInline('')
    } catch (err) {
      const e = err as { message?: string; body?: { error?: string } }
      const detalle = `${e?.message ?? ''} ${e?.body?.error ?? ''}`.toLowerCase()
      const esDuplicado = detalle.includes('duplicate key') || detalle.includes('unique constraint')
      toast(esDuplicado ? 'Ya existe una ruta para ese par cantera/depósito' : 'Error al agregar', 'err')
    }
    setLoading(false)
  }

  // Abre el modal "Nueva ruta" con el par precargado (desde una celda vacía de
  // la matriz). El usuario sólo completa el km.
  function openNuevaRutaPar(canteraId: number, depositoId: number) {
    formRuta.reset({ cantera_id: canteraId, deposito_id: depositoId, km_ida_vuelta: '', obs: '' })
    setModalRuta(true)
  }

  async function handleDeleteRuta(id: number) {
    if (!confirm('¿Eliminar esta ruta?')) return
    try {
      await apiDelete(`/api/logistica/lugares/rutas/${id}`)
      qc.invalidateQueries({ queryKey: LOG_KEYS.rutas })
      toast('✓ Ruta eliminada', 'ok')
    } catch { toast('Error al eliminar', 'err') }
  }

  async function handleUpdateRuta(data: any) {
    if (!editRuta) return
    const km = Number(data.km_ida_vuelta)
    if (!Number.isFinite(km) || km <= 0) {
      toast('Ingresá un valor de km mayor a 0', 'err')
      return
    }
    setLoading(true)
    try {
      await apiPatch(`/api/logistica/lugares/rutas/${editRuta.id}`, {
        km_ida_vuelta: Number(data.km_ida_vuelta),
        obs: data.obs ?? '',
      })
      qc.invalidateQueries({ queryKey: LOG_KEYS.rutas })
      toast('✓ Ruta actualizada', 'ok')
      setEditRuta(null)
    } catch { toast('Error al actualizar', 'err') }
    setLoading(false)
  }

  function openEditRuta(r: any) {
    formEditRuta.reset({
      km_ida_vuelta: r.km_ida_vuelta ?? '',
      obs:           r.obs ?? '',
    })
    setEditRuta({
      id:       r.id,
      cantera:  r.canteras?.nombre ?? `Cantera #${r.cantera_id}`,
      deposito: r.depositos?.nombre ?? `Depósito #${r.deposito_id}`,
    })
  }

  function openEditCantera(c: Cantera) {
    formEditCant.reset({ nombre: c.nombre, localidad: c.localidad ?? '', maps_url: c.maps_url ?? '', obs: c.obs ?? '', lat: c.lat ?? null, lng: c.lng ?? null, operativo: c.operativo ?? false })
    setEditCantera(c)
  }

  function openEditDeposito(d: Deposito) {
    formEditDep.reset({ nombre: d.nombre, localidad: d.localidad ?? '', maps_url: d.maps_url ?? '', obs: d.obs ?? '' , lat: d.lat ?? null, lng: d.lng ?? null, operativo: d.operativo ?? false })
    setEditDeposito(d)
  }

  return (
    <div className="flex flex-col gap-6">

      {/* Canteras */}
      <Section title="⛏ Canteras" onAdd={() => setModalCantera(true)} addLabel="＋ Cantera">
        <SimpleList
          items={canteras as Cantera[]}
          emptyMsg="No hay canteras registradas."
          renderItem={c => (
            <div key={c.id} className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-gris last:border-0">
              <div className="flex items-center gap-2 flex-wrap min-w-0 flex-1">
                <span className="font-bold text-sm text-carbon">{c.nombre}</span>
                {c.operativo && <span className="text-[10px] font-bold uppercase tracking-wide text-naranja-dark bg-naranja-light border border-naranja/30 rounded px-1.5 py-0.5" title="Lugar operativo (mantenimiento/relevos). No facturable: no puede ser origen de un tramo cargado.">⚙ Operativo</span>}
                {c.localidad && <span className="text-xs text-gris-dark">({c.localidad})</span>}
                {c.maps_url && (
                  <a href={c.maps_url} target="_blank" rel="noopener noreferrer"
                    className="text-xs font-bold text-azul hover:text-naranja transition-colors flex items-center gap-0.5"
                    title="Ver en Google Maps"
                  >
                    📍 Maps
                  </a>
                )}
              </div>
              <button onClick={() => openEditCantera(c)} className="text-xs px-2 py-1 rounded hover:bg-gris transition-colors text-gris-dark shrink-0">✏️</button>
            </div>
          )}
        />
      </Section>

      {/* Depósitos */}
      <Section title="🏭 Depósitos" onAdd={() => setModalDeposito(true)} addLabel="＋ Depósito">
        <SimpleList
          items={depositos as Deposito[]}
          emptyMsg="No hay depósitos registrados."
          renderItem={d => (
            <div key={d.id} className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-gris last:border-0">
              <div className="flex items-center gap-2 flex-wrap min-w-0 flex-1">
                <span className="font-bold text-sm text-carbon">{d.nombre}</span>
                {d.operativo && <span className="text-[10px] font-bold uppercase tracking-wide text-naranja-dark bg-naranja-light border border-naranja/30 rounded px-1.5 py-0.5" title="Lugar operativo (mantenimiento/relevos). No facturable: no puede ser destino de un tramo cargado.">⚙ Operativo</span>}
                {d.localidad && <span className="text-xs text-gris-dark">({d.localidad})</span>}
                {d.maps_url && (
                  <a href={d.maps_url} target="_blank" rel="noopener noreferrer"
                    className="text-xs font-bold text-azul hover:text-naranja transition-colors flex items-center gap-0.5"
                    title="Ver en Google Maps"
                  >
                    📍 Maps
                  </a>
                )}
              </div>
              <button onClick={() => openEditDeposito(d)} className="text-xs px-2 py-1 rounded hover:bg-gris transition-colors text-gris-dark shrink-0">✏️</button>
            </div>
          )}
        />
      </Section>

      {/* Rutas — selector doble (cantera→depósito→km) + matriz de cobertura.
          Reemplaza la lista plana: el km no se carga a mano en el tramo, sale
          de acá, así que ver/llenar la matriz destraba la carga de tramos. */}
      <div>
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <h3 className="font-display text-lg tracking-wider text-azul">🗺️ Rutas</h3>
          <div className="flex items-center gap-3">
            {faltantes > 0 && (
              <label className="flex items-center gap-1.5 text-xs font-bold text-gris-dark cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={soloFaltantes}
                  onChange={e => setSoloFaltantes(e.target.checked)}
                  className="accent-rojo"
                />
                Resaltar faltantes
              </label>
            )}
            <Button variant="secondary" size="sm" onClick={() => { formRuta.reset(); setModalRuta(true) }}>＋ Ruta</Button>
          </div>
        </div>

        {/* Selector doble. Va fuera de un card con overflow-hidden para que el
            dropdown del Combobox no se recorte. */}
        <div className="bg-white rounded-card shadow-card p-4 mb-3">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-3 items-end">
            <Combobox
              label="Cantera (origen)"
              placeholder="Buscar cantera…"
              value={selCant}
              onChange={v => { setSelCant(v); setKmInline('') }}
              options={(canteras as Cantera[]).map(c => ({
                value: String(c.id), label: c.nombre, sub: c.localidad ?? undefined,
              }))}
            />
            <span className="hidden sm:flex items-center justify-center pb-2.5 text-gris-dark text-lg">→</span>
            <Combobox
              label="Depósito (destino)"
              placeholder="Buscar depósito…"
              value={selDep}
              onChange={v => { setSelDep(v); setKmInline('') }}
              options={(depositos as Deposito[]).map(d => ({
                value: String(d.id), label: d.nombre, sub: d.localidad ?? undefined,
              }))}
            />
          </div>

          {selCant && selDep && (
            <div className="mt-3">
              {rutaSel ? (
                <div className="flex items-center justify-between gap-3 bg-verde-light/40 rounded-card px-4 py-3">
                  <div className="text-sm min-w-0">
                    <span className="text-gris-dark">Distancia (un sentido): </span>
                    <span className="font-mono font-bold text-verde text-lg">
                      {Math.round(rutaSel.km_ida_vuelta).toLocaleString('es-AR')} km
                    </span>
                    {rutaSel.obs && <p className="text-[11px] text-gris-dark mt-0.5 truncate">{rutaSel.obs}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => openEditRuta(rutaSel)} title="Editar km / observaciones"
                      className="text-gris-dark hover:text-azul transition-colors text-sm px-2 py-1">✏️</button>
                    <button onClick={() => handleDeleteRuta(rutaSel.id)} title="Eliminar ruta"
                      className="text-gris-mid hover:text-rojo transition-colors text-sm px-2 py-1">✕</button>
                  </div>
                </div>
              ) : (
                <div className="bg-rojo-light/50 rounded-card px-4 py-3">
                  <p className="text-sm font-bold text-rojo-dark mb-2">⚠ Falta cargar esta ruta — agregá el km</p>
                  <div className="flex items-end gap-2 flex-wrap">
                    <div className="flex-1 min-w-[140px]">
                      <Input
                        label="Km (un sentido)"
                        type="text"
                        inputMode="numeric"
                        placeholder="Ej: 1220"
                        value={kmInline}
                        onChange={e => setKmInline(e.target.value.replace(/[^\d]/g, ''))}
                        onKeyDown={e => { if (e.key === 'Enter') guardarRutaInline(Number(selCant), Number(selDep), kmInline) }}
                      />
                    </div>
                    <Button variant="primary" loading={loading}
                      onClick={() => guardarRutaInline(Number(selCant), Number(selDep), kmInline)}>
                      ✓ Guardar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Matriz de cobertura: filas = canteras, columnas = depósitos. */}
        <div className="bg-white rounded-card shadow-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gris bg-gris/30 text-sm">
            <span className="font-bold text-verde">{rutas.length}</span>
            <span className="text-gris-dark"> de </span>
            <span className="font-bold">{canteras.length * depositos.length}</span>
            <span className="text-gris-dark"> combinaciones con km</span>
            {faltantes > 0 && <span className="ml-2 text-rojo font-bold">· faltan {faltantes}</span>}
            <span className="block text-[11px] text-gris-dark mt-0.5">
              Tocá una celda con km para editar, o una vacía (＋) para cargarla.
            </span>
          </div>
          {canteras.length > 0 && depositos.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-white px-3 py-2 text-left text-[10px] font-bold text-gris-dark uppercase tracking-wider border-b border-r border-gris">
                      Cantera ╲ Depósito
                    </th>
                    {(depositos as Deposito[]).map(d => (
                      <th key={d.id} title={d.nombre}
                        className="px-2 py-2 text-center text-[10px] font-bold text-gris-dark border-b border-gris min-w-[60px] max-w-[88px]">
                        <span className="block truncate">{d.nombre}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(canteras as Cantera[]).map(c => (
                    <tr key={c.id}>
                      <th title={c.nombre}
                        className="sticky left-0 z-10 bg-white px-3 py-2 text-left font-bold text-carbon text-xs border-b border-r border-gris whitespace-nowrap">
                        {c.nombre}
                      </th>
                      {(depositos as Deposito[]).map(d => {
                        const r = rutaPorPar.get(`${c.id}-${d.id}`)
                        const isSel = String(c.id) === selCant && String(d.id) === selDep
                        return (
                          <td key={d.id} className="border-b border-gris p-0">
                            {r ? (
                              <button
                                onClick={() => openEditRuta(r)}
                                title={`${c.nombre} → ${d.nombre} · ${Math.round(r.km_ida_vuelta).toLocaleString('es-AR')} km · editar`}
                                className={`w-full px-2 py-2.5 text-center font-mono text-xs font-bold transition-colors
                                  ${soloFaltantes ? 'text-gris-mid hover:bg-gris/40' : 'text-verde hover:bg-verde-light/50'}
                                  ${isSel ? 'ring-2 ring-azul ring-inset bg-azul-light/30' : ''}`}
                              >
                                {Math.round(r.km_ida_vuelta).toLocaleString('es-AR')}
                              </button>
                            ) : (
                              <button
                                onClick={() => openNuevaRutaPar(c.id, d.id)}
                                title={`${c.nombre} → ${d.nombre} · falta — tocá para cargar el km`}
                                className={`w-full px-2 py-2.5 text-center text-sm transition-colors
                                  ${soloFaltantes
                                    ? 'bg-rojo-light/60 text-rojo-dark font-bold hover:bg-rojo-light'
                                    : 'text-gris-mid hover:bg-rojo-light/40 hover:text-rojo'}
                                  ${isSel ? 'ring-2 ring-azul ring-inset' : ''}`}
                              >
                                ＋
                              </button>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-center py-6 text-gris-dark text-sm">
              Cargá al menos una cantera y un depósito para ver la matriz.
            </p>
          )}
        </div>
      </div>

      {/* Modal nueva cantera */}
      <Modal open={modalCantera} onClose={() => setModalCantera(false)} title="⛏ NUEVA CANTERA"
        footer={<><Button variant="secondary" onClick={() => setModalCantera(false)}>Cancelar</Button><Button variant="primary" loading={loading} onClick={formCantera.handleSubmit(handleCreateCantera)}>✓ Guardar</Button></>}
      >
        <div className="flex flex-col gap-4">
          <Input label="Nombre" placeholder="Cantera del Norte" {...formCantera.register('nombre')} />
          <Input label="Localidad" placeholder="Opcional" {...formCantera.register('localidad')} />
          <MapsUrlInput register={formCantera.register} watch={formCantera.watch} setValue={formCantera.setValue} />
          <Input label="Observaciones" placeholder="Opcional" {...formCantera.register('obs')} />
          <label className="flex items-start gap-2 text-sm bg-naranja-light/40 border border-naranja/30 rounded-lg p-3 cursor-pointer">
            <input type="checkbox" className="accent-naranja mt-0.5" {...formCantera.register('operativo')} />
            <span className="flex-1">
              <span className="font-bold text-carbon">Lugar operativo (no facturable)</span>
              <span className="block text-[11px] text-gris-dark">Mantenimiento, relevos/intercambios o parking. No se ofrece como origen al crear tramos cargados ni se factura.</span>
            </span>
          </label>
        </div>
      </Modal>

      {/* Modal editar cantera */}
      <Modal open={!!editCantera} onClose={() => setEditCantera(null)} title="✏️ EDITAR CANTERA"
        footer={<><Button variant="secondary" onClick={() => setEditCantera(null)}>Cancelar</Button><Button variant="primary" loading={loading} onClick={formEditCant.handleSubmit(handleUpdateCantera)}>✓ Guardar</Button></>}
      >
        <div className="flex flex-col gap-4">
          <Input label="Nombre" {...formEditCant.register('nombre')} />
          <Input label="Localidad" {...formEditCant.register('localidad')} />
          <MapsUrlInput register={formEditCant.register} watch={formEditCant.watch} setValue={formEditCant.setValue} />
          <Input label="Observaciones" {...formEditCant.register('obs')} />
          <label className="flex items-start gap-2 text-sm bg-naranja-light/40 border border-naranja/30 rounded-lg p-3 cursor-pointer">
            <input type="checkbox" className="accent-naranja mt-0.5" {...formEditCant.register('operativo')} />
            <span className="flex-1">
              <span className="font-bold text-carbon">Lugar operativo (no facturable)</span>
              <span className="block text-[11px] text-gris-dark">Mantenimiento, relevos/intercambios o parking. No se ofrece como origen al crear tramos cargados ni se factura.</span>
            </span>
          </label>
        </div>
      </Modal>

      {/* Modal nuevo depósito */}
      <Modal open={modalDeposito} onClose={() => setModalDeposito(false)} title="🏭 NUEVO DEPÓSITO"
        footer={<><Button variant="secondary" onClick={() => setModalDeposito(false)}>Cancelar</Button><Button variant="primary" loading={loading} onClick={formDeposito.handleSubmit(handleCreateDeposito)}>✓ Guardar</Button></>}
      >
        <div className="flex flex-col gap-4">
          <Input label="Nombre" placeholder="Depósito Central" {...formDeposito.register('nombre')} />
          <Input label="Localidad" placeholder="Opcional" {...formDeposito.register('localidad')} />
          <MapsUrlInput register={formDeposito.register} watch={formDeposito.watch} setValue={formDeposito.setValue} />
          <Input label="Observaciones" placeholder="Opcional" {...formDeposito.register('obs')} />
          <label className="flex items-start gap-2 text-sm bg-naranja-light/40 border border-naranja/30 rounded-lg p-3 cursor-pointer">
            <input type="checkbox" className="accent-naranja mt-0.5" {...formDeposito.register('operativo')} />
            <span className="flex-1">
              <span className="font-bold text-carbon">Lugar operativo (no facturable)</span>
              <span className="block text-[11px] text-gris-dark">Mantenimiento, relevos/intercambios o parking. No se ofrece como destino al crear tramos cargados ni se factura.</span>
            </span>
          </label>
        </div>
      </Modal>

      {/* Modal editar depósito */}
      <Modal open={!!editDeposito} onClose={() => setEditDeposito(null)} title="✏️ EDITAR DEPÓSITO"
        footer={<><Button variant="secondary" onClick={() => setEditDeposito(null)}>Cancelar</Button><Button variant="primary" loading={loading} onClick={formEditDep.handleSubmit(handleUpdateDeposito)}>✓ Guardar</Button></>}
      >
        <div className="flex flex-col gap-4">
          <Input label="Nombre" {...formEditDep.register('nombre')} />
          <Input label="Localidad" {...formEditDep.register('localidad')} />
          <MapsUrlInput register={formEditDep.register} watch={formEditDep.watch} setValue={formEditDep.setValue} />
          <Input label="Observaciones" {...formEditDep.register('obs')} />
          <label className="flex items-start gap-2 text-sm bg-naranja-light/40 border border-naranja/30 rounded-lg p-3 cursor-pointer">
            <input type="checkbox" className="accent-naranja mt-0.5" {...formEditDep.register('operativo')} />
            <span className="flex-1">
              <span className="font-bold text-carbon">Lugar operativo (no facturable)</span>
              <span className="block text-[11px] text-gris-dark">Mantenimiento, relevos/intercambios o parking. No se ofrece como destino al crear tramos cargados ni se factura.</span>
            </span>
          </label>
        </div>
      </Modal>

      {/* Modal ruta */}
      <Modal open={modalRuta} onClose={() => setModalRuta(false)} title="🗺️ NUEVA RUTA"
        footer={<><Button variant="secondary" onClick={() => setModalRuta(false)}>Cancelar</Button><Button variant="primary" loading={loading} onClick={formRuta.handleSubmit(handleCreateRuta)}>✓ Guardar</Button></>}
      >
        <div className="flex flex-col gap-4">
          <Select
            label="Cantera (origen)"
            placeholder="Elegí"
            options={(canteras as Cantera[]).map(c => ({ value: c.id, label: c.nombre }))}
            {...formRuta.register('cantera_id')}
          />
          <Select
            label="Depósito (destino)"
            placeholder="Elegí"
            options={(depositos as Deposito[]).map(d => ({ value: d.id, label: d.nombre }))}
            {...formRuta.register('deposito_id')}
          />
          <Input
            label="Km del trayecto (un sentido)"
            {...intInputProps}
            placeholder="Ej: 1220"
            hint="Distancia de la ruta en Google Maps en UN solo sentido (no sumes ida + vuelta). Cargado y vacío se cuentan por separado."
            {...formRuta.register('km_ida_vuelta')}
          />
          <Input label="Observaciones" placeholder="Opcional" {...formRuta.register('obs')} />
        </div>
      </Modal>

      {/* Modal editar ruta — sólo km e observaciones; el par cantera/depósito
          es la identidad y no se cambia. */}
      <Modal
        open={!!editRuta}
        onClose={() => setEditRuta(null)}
        title="✏️ EDITAR RUTA"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditRuta(null)}>Cancelar</Button>
            <Button variant="primary" loading={loading} onClick={formEditRuta.handleSubmit(handleUpdateRuta)}>✓ Guardar</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {editRuta && (
            <div className="bg-gris/30 rounded-card p-3 text-sm">
              <span className="font-bold">{editRuta.cantera}</span>
              <span className="text-gris-dark mx-2">→</span>
              <span className="font-bold">{editRuta.deposito}</span>
              <p className="text-[11px] text-gris-dark mt-1">
                Para cambiar el origen o destino, eliminá esta ruta y creá una nueva.
              </p>
            </div>
          )}
          <Input
            label="Km del trayecto (un sentido)"
            {...intInputProps}
            placeholder="Ej: 1220"
            hint="Distancia de la ruta en Google Maps en UN solo sentido (no sumes ida + vuelta). Cargado y vacío se cuentan por separado."
            {...formEditRuta.register('km_ida_vuelta')}
          />
          <Input label="Observaciones" placeholder="Opcional" {...formEditRuta.register('obs')} />
        </div>
      </Modal>
    </div>
  )
}

function MapsUrlInput({ register, watch, setValue }: { register: any; watch: any; setValue?: any }) {
  const url = watch('maps_url') ?? ''
  const lat = watch('lat')
  const lng = watch('lng')
  const nombre    = watch('nombre') ?? ''
  const localidad = watch('localidad') ?? ''
  const { mutate: geocodeMutate, isPending: geocoding } = useGeocode()
  const toast = useToast()

  function handleBuscar() {
    if (!setValue) return
    const direccion = [nombre, localidad].filter(Boolean).join(', ').trim()
    if (!direccion) { toast('Cargá al menos el nombre o la localidad', 'err'); return }
    geocodeMutate(direccion, {
      onSuccess: (r) => {
        setValue('lat', r.lat, { shouldDirty: true })
        setValue('lng', r.lng, { shouldDirty: true })
        toast(`✓ Coordenadas: ${r.formatted_address}`, 'ok')
      },
      onError: (err: any) => {
        const msg = err?.body?.error === 'GOOGLE_API_KEY_MISSING'
          ? 'Falta configurar GOOGLE_MAPS_API_KEY en el backend'
          : 'No se encontró la dirección. Cargá lat/lng manualmente.'
        toast(msg, 'err')
      },
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-0 basis-full sm:basis-0">
            <Input label="Link Google Maps" placeholder="https://maps.google.com/..." {...register('maps_url')} />
          </div>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="mb-0.5 inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-azul-light text-azul text-xs font-bold hover:bg-azul hover:text-white transition-colors"
            >
              📍 Abrir
            </a>
          )}
        </div>
        <p className="text-xs text-gris-dark mt-1">
          En Google Maps: botón Compartir → Copiar link
        </p>
      </div>

      {/* Coordenadas (necesarias para calcular distancia GPS→destino) */}
      <div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-0 basis-full sm:basis-0 grid grid-cols-2 gap-2">
            <Input
              label="Latitud"
              type="number"
              step="0.0000001"
              placeholder="-34.6037"
              {...register('lat', { valueAsNumber: true })}
            />
            <Input
              label="Longitud"
              type="number"
              step="0.0000001"
              placeholder="-58.3816"
              {...register('lng', { valueAsNumber: true })}
            />
          </div>
          {setValue && (
            <button
              type="button"
              onClick={handleBuscar}
              disabled={geocoding}
              className="mb-0.5 inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-verde-light text-verde text-xs font-bold hover:bg-verde hover:text-white transition-colors disabled:opacity-50"
            >
              {geocoding ? '⏳' : '🔍'} Buscar
            </button>
          )}
          {/* Verificar visualmente las coords en Google Maps. Útil cuando
              Geocoding devolvió un punto que no es exactamente el real
              (ej. el centro de la localidad en lugar de la planta). */}
          {lat != null && lng != null && lat !== '' && lng !== '' && (
            <a
              href={`https://www.google.com/maps?q=${lat},${lng}&z=18`}
              target="_blank"
              rel="noopener noreferrer"
              title="Abrir las coordenadas exactas en Google Maps para verificarlas"
              className="mb-0.5 inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-azul-light text-azul text-xs font-bold hover:bg-azul hover:text-white transition-colors"
            >
              📍 Verificar
            </a>
          )}
        </div>
        <p className="text-xs text-gris-dark mt-1">
          {(lat != null && lng != null && lat !== '' && lng !== '')
            ? '✓ Coordenadas cargadas. Verificá en Maps que el punto sea el correcto. Si no, ajustá lat/lng a mano (copialas del lugar exacto en Maps).'
            : 'Click en "Buscar" para autocompletar desde el nombre + localidad, o pegalas manualmente'}
        </p>
      </div>
    </div>
  )
}

function Section({ title, onAdd, addLabel, children }: {
  title: string; onAdd: () => void; addLabel: string; children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-display text-lg tracking-wider text-azul">{title}</h3>
        <Button variant="secondary" size="sm" onClick={onAdd}>{addLabel}</Button>
      </div>
      <div className="bg-white rounded-card shadow-card overflow-hidden">{children}</div>
    </div>
  )
}

function SimpleList<T>({ items, emptyMsg, renderItem }: {
  items: T[]; emptyMsg: string; renderItem: (item: T) => React.ReactNode
}) {
  if (!items.length) {
    return <p className="text-center py-6 text-gris-dark text-sm">{emptyMsg}</p>
  }
  return <div>{items.map(renderItem)}</div>
}