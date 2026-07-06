'use client'

import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import { toISO } from '@/lib/utils/dates'
import {
  useCanterasAridos, useCreateCanteraArido, useUpdateCanteraArido, useDeleteCanteraArido,
  useUnidades, useCreateUnidad, useUpdateUnidad, useDeleteUnidad,
  useCostosCantera, useCreateCostoCantera, useDeleteCostoCantera,
  useGpsCatalogo, useMateriales,
} from '../hooks/useAridos'
import type { CanteraArido, UnidadFlota } from '../types'

// Canteras (PROVEEDORES de los que se retira material, con su lista de
// precios por viaje) y unidades propias del negocio de áridos —
// independiente de la flota y las canteras de logística.

interface CanteraForm { nombre: string; direccion: string; localidad: string; obs: string }
interface UnidadForm  { nombre: string; patente: string; chofer: string; id_vehiculo_gps: string; obs: string }

const CANTERA_DEFAULTS: CanteraForm = { nombre: '', direccion: '', localidad: '', obs: '' }
const UNIDAD_DEFAULTS: UnidadForm   = { nombre: '', patente: '', chofer: '', id_vehiculo_gps: '', obs: '' }

export function FlotaAridosTab() {
  return (
    <>
      <CanterasSection />
      <UnidadesSection />
    </>
  )
}

// ── Canteras ───────────────────────────────────────────────────────────
function CanterasSection() {
  const toast = useToast()
  const { puedeCrear, puedeEditar, puedeEliminar } = usePermisos('aridos')
  const { data: canteras = [], isLoading } = useCanterasAridos()
  const { mutate: crear, isPending: creando } = useCreateCanteraArido()
  const { mutate: actualizar, isPending: actualizando } = useUpdateCanteraArido()
  const { mutate: borrar } = useDeleteCanteraArido()

  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [preciosDe, setPreciosDe] = useState<CanteraArido | null>(null)
  const { register, handleSubmit, reset, formState: { errors } } = useForm<CanteraForm>({ defaultValues: CANTERA_DEFAULTS })

  function abrirNueva() {
    setEditId(null)
    reset(CANTERA_DEFAULTS)
    setModalOpen(true)
  }

  function abrirEditar(c: CanteraArido) {
    setEditId(c.id)
    reset({ nombre: c.nombre, direccion: c.direccion ?? '', localidad: c.localidad ?? '', obs: c.obs ?? '' })
    setModalOpen(true)
  }

  function onSubmit(data: CanteraForm) {
    const dto = {
      nombre:    data.nombre.trim(),
      direccion: data.direccion.trim() || null,
      localidad: data.localidad.trim() || null,
      obs:       data.obs.trim() || null,
    }
    if (editId == null) {
      crear(dto, {
        onSuccess: () => { toast('✓ Cantera agregada', 'ok'); setModalOpen(false) },
        onError:   (err: unknown) => toast(mensajeError(err, 'Error al crear'), 'err'),
      })
    } else {
      actualizar({ id: editId, dto }, {
        onSuccess: () => { toast('✓ Cantera actualizada', 'ok'); setModalOpen(false) },
        onError:   (err: unknown) => toast(mensajeError(err, 'Error al actualizar'), 'err'),
      })
    }
  }

  function toggleActivo(c: CanteraArido) {
    actualizar({ id: c.id, dto: { activo: !c.activo } }, {
      onSuccess: () => toast(c.activo ? '✓ Cantera desactivada' : '✓ Cantera reactivada', 'ok'),
    })
  }

  function handleEliminar(c: CanteraArido) {
    if (!confirm(`¿Eliminar la cantera "${c.nombre}"? Si tiene movimientos no se va a poder.`)) return
    borrar(c.id, {
      onSuccess: () => toast('✓ Cantera eliminada', 'ok'),
      onError:   (err: unknown) => toast(mensajeError(err, 'No se pudo eliminar'), 'err'),
    })
  }

  return (
    <div className="bg-white rounded-card shadow-card">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gris">
        <div>
          <h2 className="font-bold text-azul text-base">⛰ Canteras (proveedores)</h2>
          <p className="text-xs text-gris-dark mt-0.5">De acá se retira el material — cada una con su lista de precios por viaje. La dirección se geolocaliza sola al guardar.</p>
        </div>
        {puedeCrear && <Button variant="primary" size="sm" onClick={abrirNueva}>＋ Nueva cantera</Button>}
      </div>

      {isLoading ? (
        <p className="text-center py-6 text-sm text-gris-dark">Cargando...</p>
      ) : canteras.length === 0 ? (
        <p className="text-center py-6 text-sm text-gris-dark italic">Sin canteras cargadas. Los costos de compra (tab Materiales) se cargan sobre estas canteras.</p>
      ) : (
        <div className="divide-y divide-gris">
          {canteras.map(c => (
            <div key={c.id} className={`px-5 py-2.5 flex items-center justify-between gap-3 ${!c.activo ? 'opacity-50' : ''}`}>
              <div className="min-w-0">
                <span className="font-bold text-sm text-carbon">{c.nombre}</span>
                <span className="text-xs text-gris-dark ml-2">
                  {[c.direccion, c.localidad].filter(Boolean).join(' · ') || 'Sin dirección'}
                  {c.lat != null && <span className="ml-1 text-verde" title={`Geolocalizada (${c.lat}, ${c.lng})`}>📍</span>}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setPreciosDe(c)}
                  className="text-xs font-bold px-2 py-1 rounded bg-verde-light text-verde hover:opacity-80 transition-opacity"
                  title="Lista de precios de la cantera"
                >
                  💲 Precios
                </button>
                <button
                  onClick={() => toggleActivo(c)}
                  disabled={!puedeEditar}
                  className={`text-xs font-bold px-2 py-0.5 rounded ${c.activo ? 'bg-verde-light text-verde' : 'bg-gris text-gris-dark'} ${puedeEditar ? 'cursor-pointer hover:opacity-80' : 'cursor-not-allowed'}`}
                >
                  {c.activo ? 'ACTIVA' : 'INACTIVA'}
                </button>
                {puedeEditar && <button onClick={() => abrirEditar(c)} className="text-xs px-2 py-1 rounded hover:bg-gris transition-colors">✏️</button>}
                {puedeEliminar && <button onClick={() => handleEliminar(c)} className="text-xs px-2 py-1 rounded hover:bg-rojo-light text-gris-dark hover:text-rojo transition-colors">✕</button>}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editId == null ? '⛰ NUEVA CANTERA' : '⛰ EDITAR CANTERA'}
        width="max-w-lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button variant="primary" loading={creando || actualizando} onClick={handleSubmit(onSubmit)}>
              ✓ {editId == null ? 'Crear' : 'Guardar'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Input label="Nombre" placeholder="Ej: Cantera El Cadillal" error={errors.nombre?.message} {...register('nombre', { required: 'Requerido' })} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Dirección" placeholder="Ruta 9 km 1300" {...register('direccion')} />
            <Input label="Localidad" placeholder="El Cadillal, Tucumán" {...register('localidad')} />
          </div>
          <Input label="Observaciones" placeholder="Contacto, teléfono, notas..." {...register('obs')} />
          <p className="text-[11px] text-gris-dark">Con dirección cargada se geolocaliza automáticamente (📍) para rutas y tiempos.</p>
        </div>
      </Modal>

      <ListaPreciosCanteraModal cantera={preciosDe} onClose={() => setPreciosDe(null)} />
    </div>
  )
}

// ── Lista de precios de la cantera (concepto × zona, por viaje) ───────
function ListaPreciosCanteraModal({ cantera, onClose }: { cantera: CanteraArido | null; onClose: () => void }) {
  const toast = useToast()
  const { puedeCrear, puedeEliminar } = usePermisos('aridos')
  const { data: costos = [] } = useCostosCantera()
  const { data: materiales = [] } = useMateriales()
  const { mutateAsync: crearAsync } = useCreateCostoCantera()
  const { mutate: borrar } = useDeleteCostoCantera()

  // Carga por grilla: la lista de materiales que vendemos, y se tipea el
  // precio solo en los que esta cantera vende. El vínculo material↔precio
  // sale solo (concepto = nombre del material), sin paso de "vincular".
  const [zonaCarga, setZonaCarga] = useState('')
  const [vigenteDesde, setVigenteDesde] = useState(toISO(new Date()))
  const [preciosDraft, setPreciosDraft] = useState<Record<number, string>>({})
  // Servicio / otro concepto sin material (ej: hora de máquina).
  const [svcConcepto, setSvcConcepto] = useState('')
  const [svcPrecio, setSvcPrecio] = useState('')
  const [svcUnidad, setSvcUnidad] = useState<'viaje' | 'hora'>('hora')
  const [guardando, setGuardando] = useState(false)

  const materialesActivos = useMemo(() => materiales.filter(m => m.activo), [materiales])

  const propios = useMemo(
    () => (cantera ? costos.filter(c => c.cantera_id === cantera.id) : []),
    [costos, cantera],
  )

  // Precio vigente de un material en la zona tipeada (referencia en la grilla).
  function precioVigente(materialId: number) {
    return propios
      .filter(c => c.material_id === materialId && (c.zona ?? '') === zonaCarga.trim())
      .sort((a, b) => b.vigente_desde.localeCompare(a.vigente_desde))[0]
  }

  // Zonas existentes de la cantera (para agrupar y sugerir en el alta)
  const zonas = useMemo(() => {
    const set = new Set<string>()
    for (const c of propios) set.add(c.zona ?? '')
    return Array.from(set).sort()
  }, [propios])

  // Por zona → concepto → historial (vigente primero)
  function preciosDeZona(zona: string) {
    const deZona = propios.filter(c => (c.zona ?? '') === zona)
    const conceptos = Array.from(new Set(deZona.map(c => c.concepto ?? ''))).sort()
    return conceptos.map(con => ({
      concepto: con,
      historial: deZona
        .filter(c => (c.concepto ?? '') === con)
        .sort((a, b) => b.vigente_desde.localeCompare(a.vigente_desde)),
    }))
  }

  function fmtDate(s: string) {
    const [y, m, d] = s.split('-')
    return `${d}/${m}/${y}`
  }

  function fmtM(n: number) {
    return '$' + n.toLocaleString('es-AR', { maximumFractionDigits: 0 })
  }

  async function guardarPrecios() {
    if (!cantera) return
    const filas = materialesActivos
      .map(m => ({ m, val: (preciosDraft[m.id] ?? '').trim() }))
      .filter(x => x.val !== '')
    if (filas.some(x => !(Number(x.val) > 0))) { toast('Hay precios inválidos (deben ser mayores a 0)', 'err'); return }
    const conServicio = svcConcepto.trim() !== '' && Number(svcPrecio) > 0
    if (filas.length === 0 && !conServicio) { toast('Cargá al menos un precio', 'err'); return }
    setGuardando(true)
    try {
      for (const { m, val } of filas) {
        await crearAsync({
          cantera_id:    cantera.id,
          concepto:      m.nombre,
          zona:          zonaCarga.trim() || null,
          material_id:   m.id,
          costo:         Number(val),
          unidad:        m.unidad,
          vigente_desde: vigenteDesde,
        })
      }
      if (conServicio) {
        await crearAsync({
          cantera_id:    cantera.id,
          concepto:      svcConcepto.trim(),
          zona:          zonaCarga.trim() || null,
          costo:         Number(svcPrecio),
          unidad:        svcUnidad,
          vigente_desde: vigenteDesde,
        })
      }
      const n = filas.length + (conServicio ? 1 : 0)
      toast(`✓ ${n} precio${n !== 1 ? 's' : ''} guardado${n !== 1 ? 's' : ''}`, 'ok')
      setPreciosDraft({})
      setSvcConcepto('')
      setSvcPrecio('')
    } catch (err: unknown) {
      toast(mensajeError(err, 'Error al guardar'), 'err')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal
      open={!!cantera}
      onClose={onClose}
      title={`💲 LISTA DE PRECIOS — ${cantera?.nombre ?? ''}`}
      width="max-w-3xl"
      footer={<Button variant="secondary" onClick={onClose}>Cerrar</Button>}
    >
      <div className="flex flex-col gap-4">
        {puedeCrear && (
          <div className="bg-gris/30 rounded-card p-3">
            <p className="text-xs font-bold text-gris-dark uppercase mb-2">Cargar precios — tipeá solo en los materiales que esta cantera vende (para actualizar uno, cargalo de nuevo con la fecha desde la que rige)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
              <div>
                <Input label="Zona (opcional)" placeholder="Ej: Capital, Yerba Buena..." list="zonas-cantera" value={zonaCarga} onChange={e => setZonaCarga(e.target.value)} />
                <datalist id="zonas-cantera">
                  {zonas.filter(Boolean).map(z => <option key={z} value={z} />)}
                </datalist>
              </div>
              <Input label="Vigente desde" type="date" value={vigenteDesde} onChange={e => setVigenteDesde(e.target.value)} />
            </div>

            <div className="divide-y divide-gris border border-gris rounded-card overflow-hidden bg-white mb-2">
              {materialesActivos.map(m => {
                const ref = precioVigente(m.id)
                return (
                  <div key={m.id} className="px-3 py-1.5 flex items-center gap-3">
                    <span className="text-sm text-carbon flex-1">
                      {m.nombre}
                      <span className="text-[10px] text-gris-dark ml-1">/{m.unidad === 'm3' ? 'm³' : 'viaje'}</span>
                    </span>
                    {ref && (
                      <span className="text-[11px] text-gris-dark font-mono shrink-0" title={`Vigente desde ${fmtDate(ref.vigente_desde)}`}>
                        hoy {fmtM(Number(ref.costo))}
                      </span>
                    )}
                    <input
                      type="number" step="0.01" placeholder="$"
                      className="w-28 px-2 py-1 border-[1.5px] border-gris-mid rounded-lg text-sm font-mono text-right outline-none focus:border-naranja bg-blanco"
                      value={preciosDraft[m.id] ?? ''}
                      onChange={e => setPreciosDraft(p => ({ ...p, [m.id]: e.target.value }))}
                    />
                  </div>
                )
              })}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
              <div className="col-span-2">
                <Input label="Servicio / otro concepto (opcional)" placeholder="Ej: Hora de máquina" value={svcConcepto} onChange={e => setSvcConcepto(e.target.value)} />
              </div>
              <Input label="Precio ($)" type="number" step="0.01" placeholder="0" value={svcPrecio} onChange={e => setSvcPrecio(e.target.value)} />
              <Select label="Por" options={[
                { value: 'hora', label: 'hora' },
                { value: 'viaje', label: 'viaje' },
              ]} value={svcUnidad} onChange={e => setSvcUnidad(e.target.value as 'viaje' | 'hora')} />
            </div>

            <div className="flex justify-end mt-2">
              <Button variant="primary" size="sm" loading={guardando} onClick={guardarPrecios}>✓ Guardar precios</Button>
            </div>
          </div>
        )}

        {propios.length === 0 ? (
          <p className="text-center text-sm text-gris-dark italic py-4">Sin precios cargados para esta cantera.</p>
        ) : (
          zonas.map(zona => (
            <div key={zona || '(sin zona)'}>
              <p className="text-xs font-bold text-azul uppercase tracking-wide mb-1">
                {zona ? `Zona: ${zona}` : 'Sin zona'}
              </p>
              <div className="divide-y divide-gris border border-gris rounded-card overflow-hidden">
                {preciosDeZona(zona).map(({ concepto, historial }) => {
                  const vigente = historial[0]!
                  return (
                    <div key={concepto} className="px-3 py-1.5 flex items-center justify-between gap-3 bg-white">
                      <span className="text-sm text-carbon">
                        {concepto}
                        {vigente.aridos_materiales?.nombre
                          ? <span className="ml-2 text-[10px] font-semibold text-verde bg-verde/10 px-1.5 py-0.5 rounded" title="Vinculado: autocompleta el costo en la venta">↔ {vigente.aridos_materiales.nombre}</span>
                          : <span className="ml-2 text-[10px] text-gris-mid" title="Sin material vinculado: no autocompleta en la venta">sin vincular</span>}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm text-carbon">{fmtM(Number(vigente.costo))}<span className="font-sans font-normal text-[10px] text-gris-dark">/{vigente.unidad === 'm3' ? 'm³' : vigente.unidad}</span></span>
                        <span className="text-[10px] text-gris-dark">desde {fmtDate(vigente.vigente_desde)}</span>
                        {historial.length > 1 && (
                          <span className="text-[10px] text-gris-mid" title={historial.slice(1).map(h => `${fmtM(Number(h.costo))} desde ${fmtDate(h.vigente_desde)}`).join(' · ')}>
                            +{historial.length - 1} ant.
                          </span>
                        )}
                        {puedeEliminar && (
                          <button
                            onClick={() => { if (confirm(`¿Eliminar "${concepto}" (${fmtM(Number(vigente.costo))})?`)) borrar(vigente.id, { onSuccess: () => toast('✓ Eliminado', 'ok') }) }}
                            className="text-xs text-gris-dark hover:text-rojo"
                          >✕</button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </Modal>
  )
}

// ── Unidades (camión + chofer, con GPS) ───────────────────────────────
function UnidadesSection() {
  const toast = useToast()
  const { puedeCrear, puedeEditar, puedeEliminar } = usePermisos('aridos')
  const { data: unidades = [], isLoading } = useUnidades()
  const { mutate: crear, isPending: creando } = useCreateUnidad()
  const { mutate: actualizar, isPending: actualizando } = useUpdateUnidad()
  const { mutate: borrar } = useDeleteUnidad()

  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<UnidadForm>({ defaultValues: UNIDAD_DEFAULTS })

  // Catálogo de Mobile Quest: vincular por ID (sin margen de error de patente).
  const { data: gpsCatalogo = [], isLoading: loadingGps, isError: errorGps } = useGpsCatalogo(modalOpen)
  const wGps = watch('id_vehiculo_gps')

  // El select es uncontrolled: si el catálogo llega después del reset()
  // (editar unidad), la option todavía no existía y el DOM cae al default.
  // Re-aplicamos el valor cuando el catálogo está disponible.
  useEffect(() => {
    if (gpsCatalogo.length > 0 && wGps) setValue('id_vehiculo_gps', wGps)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gpsCatalogo.length])

  function abrirNueva() {
    setEditId(null)
    reset(UNIDAD_DEFAULTS)
    setModalOpen(true)
  }

  function abrirEditar(u: UnidadFlota) {
    setEditId(u.id)
    reset({ nombre: u.nombre, patente: u.patente, chofer: u.chofer ?? '', id_vehiculo_gps: u.id_vehiculo_gps ?? '', obs: u.obs ?? '' })
    setModalOpen(true)
  }

  // Al elegir el vehículo del catálogo, autocompletar la patente real del GPS.
  function onGpsChange(idVehiculo: string) {
    const v = gpsCatalogo.find(g => g.id_vehiculo === idVehiculo)
    if (v) setValue('patente', v.patente.replace(/\s+/g, '').toUpperCase())
  }

  function onSubmit(data: UnidadForm) {
    const dto = {
      nombre:  data.nombre.trim(),
      patente: data.patente.trim(),
      chofer:  data.chofer.trim() || null,
      id_vehiculo_gps: data.id_vehiculo_gps || null,
      obs:     data.obs.trim() || null,
    }
    if (editId == null) {
      crear(dto, {
        onSuccess: () => { toast('✓ Unidad agregada', 'ok'); setModalOpen(false) },
        onError:   (err: unknown) => toast(mensajeError(err, 'Error al crear'), 'err'),
      })
    } else {
      actualizar({ id: editId, dto }, {
        onSuccess: () => { toast('✓ Unidad actualizada', 'ok'); setModalOpen(false) },
        onError:   (err: unknown) => toast(mensajeError(err, 'Error al actualizar'), 'err'),
      })
    }
  }

  function toggleActivo(u: UnidadFlota) {
    actualizar({ id: u.id, dto: { activo: !u.activo } }, {
      onSuccess: () => toast(u.activo ? '✓ Unidad desactivada' : '✓ Unidad reactivada', 'ok'),
    })
  }

  function handleEliminar(u: UnidadFlota) {
    if (!confirm(`¿Eliminar la unidad "${u.nombre}" (${u.patente})? Si tiene movimientos no se va a poder.`)) return
    borrar(u.id, {
      onSuccess: () => toast('✓ Unidad eliminada', 'ok'),
      onError:   (err: unknown) => toast(mensajeError(err, 'No se pudo eliminar'), 'err'),
    })
  }

  return (
    <div className="bg-white rounded-card shadow-card">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gris">
        <div>
          <h2 className="font-bold text-azul text-base">🚚 Unidades</h2>
          <p className="text-xs text-gris-dark mt-0.5">Camión + chofer del negocio de áridos. El GPS se elige directo del catálogo Mobile Quest (vínculo por ID) al crear o editar la unidad.</p>
        </div>
        {puedeCrear && <Button variant="primary" size="sm" onClick={abrirNueva}>＋ Nueva unidad</Button>}
      </div>

      {isLoading ? (
        <p className="text-center py-6 text-sm text-gris-dark">Cargando...</p>
      ) : unidades.length === 0 ? (
        <p className="text-center py-6 text-sm text-gris-dark italic">Sin unidades cargadas.</p>
      ) : (
        <div className="divide-y divide-gris">
          {unidades.map(u => (
            <div key={u.id} className={`px-5 py-2.5 flex items-center justify-between gap-3 ${!u.activo ? 'opacity-50' : ''}`}>
              <div className="min-w-0">
                <span className="font-bold text-sm text-carbon">{u.nombre}</span>
                <span className="text-xs font-mono text-gris-dark ml-2">{u.patente}</span>
                {u.chofer && <span className="text-xs text-gris-dark ml-2">· {u.chofer}</span>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded ${u.id_vehiculo_gps ? 'bg-verde-light text-verde' : 'bg-gris text-gris-dark'}`}
                  title={u.id_vehiculo_gps
                    ? `GPS vinculado${u.gps_ultima_lectura_en ? ` · última lectura ${new Date(u.gps_ultima_lectura_en).toLocaleString('es-AR')}` : ''}`
                    : 'Todavía sin vincular al GPS — se vincula solo en la primera consulta'}
                >
                  🛰 {u.id_vehiculo_gps ? 'GPS' : 'Sin GPS'}
                </span>
                <button
                  onClick={() => toggleActivo(u)}
                  disabled={!puedeEditar}
                  className={`text-xs font-bold px-2 py-0.5 rounded ${u.activo ? 'bg-verde-light text-verde' : 'bg-gris text-gris-dark'} ${puedeEditar ? 'cursor-pointer hover:opacity-80' : 'cursor-not-allowed'}`}
                >
                  {u.activo ? 'ACTIVA' : 'INACTIVA'}
                </button>
                {puedeEditar && <button onClick={() => abrirEditar(u)} className="text-xs px-2 py-1 rounded hover:bg-gris transition-colors">✏️</button>}
                {puedeEliminar && <button onClick={() => handleEliminar(u)} className="text-xs px-2 py-1 rounded hover:bg-rojo-light text-gris-dark hover:text-rojo transition-colors">✕</button>}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editId == null ? '🚚 NUEVA UNIDAD' : '🚚 EDITAR UNIDAD'}
        width="max-w-lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button variant="primary" loading={creando || actualizando} onClick={handleSubmit(onSubmit)}>
              ✓ {editId == null ? 'Crear' : 'Guardar'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <div>
            <Select
              label="Vehículo GPS (Mobile Quest)"
              options={[
                { value: '', label: loadingGps ? 'Cargando catálogo…' : errorGps ? 'No se pudo cargar el catálogo GPS' : 'Sin GPS / elegir vehículo…' },
                ...gpsCatalogo.map(v => ({ value: v.id_vehiculo, label: `${v.alias ? `${v.alias} — ` : ''}${v.patente} (ID ${v.id_vehiculo})` })),
              ]}
              {...register('id_vehiculo_gps', { onChange: e => onGpsChange(e.target.value) })}
            />
            <p className="text-[11px] text-gris-dark mt-1">
              Elegí el equipo del catálogo del GPS — es el vínculo directo por ID, sin margen de error. Al elegirlo se completa la patente sola.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Nombre" placeholder="Ej: Unidad 1 — Volcador" error={errors.nombre?.message} {...register('nombre', { required: 'Requerido' })} />
            <Input label="Patente" placeholder="AA123BB" error={errors.patente?.message} readOnly={!!wGps} {...register('patente', { required: 'Requerida' })} />
          </div>
          <Input label="Chofer" placeholder="Nombre del chofer habitual" {...register('chofer')} />
          <Input label="Observaciones" placeholder="Notas..." {...register('obs')} />
        </div>
      </Modal>
    </div>
  )
}

function mensajeError(err: unknown, fallback: string): string {
  const m = (err as { message?: string })?.message
  return m || fallback
}
