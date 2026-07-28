'use client'

import { useMemo, useState } from 'react'
import {
  useCanteras, useDepositos, useRutas, useCompletarMatriz,
  useLugaresOperativos, useCrearLugarOperativo, useActualizarLugarOperativo, useEliminarLugarOperativo,
} from '../hooks/useLogistica'
import type { CompletarMatrizResp } from '../hooks/useLogistica'
import { apiPost, apiPatch, apiDelete } from '@/lib/api/client'
import { apiErrorCode, apiErrorDetail } from '@/lib/api/errors'
import { useQueryClient } from '@tanstack/react-query'
import { LOG_KEYS } from '../hooks/useLogistica'
import { Modal }  from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { useForm } from 'react-hook-form'
import { intInputProps } from '@/lib/utils/inputs'
import { useGeocode, useResolverMapsUrl, useSugerirKm } from '../hooks/useEnRuta'
import { Combobox } from '@/components/ui/Combobox'
import { matchesSearch } from '@/lib/utils/text'
import type { Cantera, Deposito, Ruta, LugarOperativo } from '@/types/domain.types'

// Sin API key el backend responde 503: en local pasa siempre, así que conviene
// que se entienda en vez de mostrar "Error".
function msgCompletar(err: unknown): string {
  const code = apiErrorCode(err)
  if (code === 'GOOGLE_API_KEY_MISSING') {
    return 'Google Maps no está configurado en este entorno (la clave vive solo en el servidor de producción).'
  }
  return 'No se pudo consultar Google. Probá de nuevo en un rato.'
}

export function LugaresTab() {
  const toast = useToast()
  const qc = useQueryClient()
  const { data: canteras  = [] } = useCanteras()
  const { data: depositos = [] } = useDepositos()
  const { data: rutas     = [] } = useRutas()
  const { data: lugaresOp = [] } = useLugaresOperativos()
  const { mutate: crearLugarOp,      isPending: creandoLugarOp }  = useCrearLugarOperativo()
  const { mutate: actualizarLugarOp, isPending: editandoLugarOp } = useActualizarLugarOperativo()
  const { mutate: eliminarLugarOp } = useEliminarLugarOperativo()

  const [modalCantera,  setModalCantera]  = useState(false)
  const [modalDeposito, setModalDeposito] = useState(false)
  const [modalRuta,     setModalRuta]     = useState(false)
  const [modalLugarOp,  setModalLugarOp]  = useState(false)
  const [editCantera,   setEditCantera]   = useState<Cantera | null>(null)
  const [editDeposito,  setEditDeposito]  = useState<Deposito | null>(null)
  const [editRuta,      setEditRuta]      = useState<{ id: number; cantera: string; deposito: string; cantera_id: number; deposito_id: number } | null>(null)
  const [editLugarOp,   setEditLugarOp]   = useState<LugarOperativo | null>(null)
  const [loading, setLoading] = useState(false)

  // Renombre frenado por el backend (409 LUGAR_CON_HISTORIAL): el lugar ya
  // tiene viajes y renombrarlo reetiqueta el historial. `reintentar` reenvía el
  // mismo patch con confirmar_renombre: true — así el aviso sirve igual para
  // canteras, depósitos y lugares operativos, que guardan por vías distintas.
  const [confirmRenombre, setConfirmRenombre] = useState<{
    tipo:         TipoLugar
    viajes:       number | null   // null = el backend no mandó la cuenta
    nombreActual: string
    nombreNuevo:  string
    reintentar:   () => void
  } | null>(null)

  // Lee la cuenta de viajes del detail del 409. Tolerante de nombre porque el
  // shape cruza repos; si no vino, el aviso se muestra sin número.
  function viajesDelDetalle(err: unknown): number | null {
    const d = apiErrorDetail(err)
    const n = Number(d.viajes ?? d.tramos ?? d.cantidad)
    return Number.isFinite(n) && n > 0 ? n : null
  }

  // Canteras/depósitos que son parte de un lugar operativo → se gestionan en su
  // propia sección, no en las listas de canteras/depósitos.
  const pairedCanteraIds  = useMemo(() => new Set((lugaresOp as LugarOperativo[]).map(l => l.cantera_id)), [lugaresOp])
  const pairedDepositoIds = useMemo(() => new Set((lugaresOp as LugarOperativo[]).map(l => l.deposito_id)), [lugaresOp])

  // Buscadores de las listas de puntos de carga y depósitos (por nombre/localidad).
  const [buscarListaCant, setBuscarListaCant] = useState('')
  const [buscarListaDep,  setBuscarListaDep]  = useState('')
  const canterasLista = useMemo(
    () => (canteras as Cantera[]).filter(c =>
      !pairedCanteraIds.has(c.id) && matchesSearch(`${c.nombre} ${c.localidad ?? ''}`, buscarListaCant)),
    [canteras, pairedCanteraIds, buscarListaCant],
  )
  const depositosLista = useMemo(
    () => (depositos as Deposito[]).filter(d =>
      !pairedDepositoIds.has(d.id) && matchesSearch(`${d.nombre} ${d.localidad ?? ''}`, buscarListaDep)),
    [depositos, pairedDepositoIds, buscarListaDep],
  )

  // Selector doble + matriz de cobertura de rutas (reemplaza la lista plana).
  const [selCant,  setSelCant]  = useState('')  // cantera_id (string) elegida en el selector
  const [selDep,   setSelDep]   = useState('')  // deposito_id (string) elegido en el selector
  const [kmInline, setKmInline] = useState('')  // km tipeado para carga inline desde el selector
  const [soloFaltantes, setSoloFaltantes] = useState(false)  // resaltar faltantes en la matriz
  const [buscarCant, setBuscarCant] = useState('')  // filtro de filas (puntos de carga) en la matriz
  const [buscarDep,  setBuscarDep]  = useState('')  // filtro de columnas (depósitos) en la matriz
  const [soloSinVerificar, setSoloSinVerificar] = useState(false)  // resaltar las sugeridas por Google
  // Preview de "completar faltantes": cuántas se van a calcular, antes de gastar.
  const [previewMatriz, setPreviewMatriz] = useState<CompletarMatrizResp | null>(null)
  const completando = useCompletarMatriz()

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
  const sinVerificarCount = (rutas as Ruta[]).filter(r => r.verificada === false).length
  const verificadasCount  = rutas.length - sinVerificarCount

  // Matriz filtrable: las filas (puntos de carga) y columnas (depósitos) se
  // recortan por nombre/localidad según los buscadores. No tocan los datos,
  // solo lo que se ve en la grilla.
  const canterasMatriz = useMemo(
    () => (canteras as Cantera[]).filter(c => matchesSearch(`${c.nombre} ${c.localidad ?? ''}`, buscarCant)),
    [canteras, buscarCant],
  )
  const depositosMatriz = useMemo(
    () => (depositos as Deposito[]).filter(d => matchesSearch(`${d.nombre} ${d.localidad ?? ''}`, buscarDep)),
    [depositos, buscarDep],
  )

  const formCantera    = useForm<any>()
  const formDeposito   = useForm<any>()
  const formRuta       = useForm<any>()
  const formEditCant   = useForm<any>()
  const formEditDep    = useForm<any>()
  const formEditRuta   = useForm<any>()
  const formLugarOp    = useForm<{ nombre: string; localidad: string; maps_url: string; lat: number | null; lng: number | null; obs: string }>()

  // ── Lugares operativos ──
  function openNewLugarOp() {
    formLugarOp.reset({ nombre: '', localidad: '', maps_url: '', lat: null, lng: null, obs: '' })
    setEditLugarOp(null)
    setModalLugarOp(true)
  }
  function openEditLugarOp(l: LugarOperativo) {
    formLugarOp.reset({
      nombre: l.nombre, localidad: l.localidad ?? '', maps_url: l.maps_url ?? '',
      lat: l.lat ?? null, lng: l.lng ?? null, obs: l.obs ?? '',
    })
    setEditLugarOp(l)
    setModalLugarOp(true)
  }
  // Guardar un lugar operativo renombra de una su punto de carga Y su depósito,
  // así que también reetiqueta el historial → pasa por el mismo aviso que
  // canteras/depósitos. `confirmar` reenvía el patch con confirmar_renombre.
  function handleSaveLugarOp(
    data: { nombre: string; localidad: string; maps_url: string; lat: number | null; lng: number | null; obs: string },
    confirmar = false,
  ) {
    const nombre = (data.nombre ?? '').trim()
    if (!nombre) { toast('Poné un nombre', 'err'); return }
    const payload = {
      nombre,
      localidad: data.localidad || '',
      maps_url:  data.maps_url || '',
      // valueAsNumber deja NaN cuando el input está vacío → null.
      lat: Number.isFinite(data.lat as number) ? (data.lat as number) : null,
      lng: Number.isFinite(data.lng as number) ? (data.lng as number) : null,
      obs: data.obs || null,
    }
    const editando = editLugarOp
    const cbs = {
      onSuccess: () => {
        toast(editando ? '✓ Lugar actualizado' : '✓ Lugar operativo creado', 'ok')
        setModalLugarOp(false)
        setConfirmRenombre(null)
      },
      onError: (err: unknown) => {
        if (editando && apiErrorCode(err) === 'LUGAR_CON_HISTORIAL') {
          setConfirmRenombre({
            tipo:         'operativo',
            viajes:       viajesDelDetalle(err),
            nombreActual: editando.nombre,
            nombreNuevo:  nombre,
            reintentar:   () => handleSaveLugarOp(data, true),
          })
        } else {
          toast('Error al guardar', 'err')
        }
      },
    }
    if (editando) actualizarLugarOp({ id: editando.id, ...payload, ...(confirmar ? { confirmar_renombre: true } : {}) }, cbs)
    else          crearLugarOp(payload, cbs)
  }
  function handleDeleteLugarOp(l: LugarOperativo) {
    if (!confirm(`¿Eliminar el lugar operativo "${l.nombre}"? Se borran su punto de carga y su depósito (solo si no tienen tramos asociados).`)) return
    eliminarLugarOp(l.id, {
      onSuccess: () => toast('✓ Lugar eliminado', 'ok'),
      onError:   (e: any) => {
        const code = e?.body?.error || e?.code
        toast(code === 'EN_USO' ? 'No se puede eliminar: hay tramos que usan este lugar' : (e?.message || 'Error al eliminar'), 'err')
      },
    })
  }

  async function handleCreateCantera(data: any) {
    setLoading(true)
    try {
      await apiPost('/api/logistica/lugares/canteras', data)
      qc.invalidateQueries({ queryKey: LOG_KEYS.canteras })
      toast('✓ Punto de carga agregado', 'ok')
      setModalCantera(false)
      formCantera.reset()
    } catch { toast('Error al agregar', 'err') }
    setLoading(false)
  }

  // Guarda un punto de carga o depósito. `confirmar` reenvía el mismo patch con
  // confirmar_renombre: true, después de que el usuario aceptó el aviso de que
  // el renombre reetiqueta los viajes ya cargados.
  async function guardarLugar(
    tipo: 'cantera' | 'deposito',
    id: number,
    data: Record<string, unknown>,
    nombreActual: string,
    confirmar = false,
  ) {
    const esCantera = tipo === 'cantera'
    setLoading(true)
    try {
      await apiPatch(
        `/api/logistica/lugares/${esCantera ? 'canteras' : 'depositos'}/${id}`,
        confirmar ? { ...data, confirmar_renombre: true } : data,
      )
      qc.invalidateQueries({ queryKey: esCantera ? LOG_KEYS.canteras : LOG_KEYS.depositos })
      // El nombre del lugar se muestra en cada tramo → refrescamos la lista.
      qc.invalidateQueries({ queryKey: LOG_KEYS.tramos })
      toast(esCantera ? '✓ Punto de carga actualizado' : '✓ Depósito actualizado', 'ok')
      if (esCantera) setEditCantera(null); else setEditDeposito(null)
      setConfirmRenombre(null)
    } catch (err) {
      if (apiErrorCode(err) === 'LUGAR_CON_HISTORIAL') {
        // Del backend sólo necesitamos la cuenta de viajes; los dos nombres ya
        // los tenemos acá.
        setConfirmRenombre({
          tipo,
          viajes:       viajesDelDetalle(err),
          nombreActual,
          nombreNuevo:  String(data.nombre ?? '').trim(),
          reintentar:   () => guardarLugar(tipo, id, data, nombreActual, true),
        })
      } else {
        toast('Error al actualizar', 'err')
      }
    }
    setLoading(false)
  }

  function handleUpdateCantera(data: Record<string, unknown>) {
    if (!editCantera) return
    guardarLugar('cantera', editCantera.id, data, editCantera.nombre)
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

  function handleUpdateDeposito(data: Record<string, unknown>) {
    if (!editDeposito) return
    guardarLugar('deposito', editDeposito.id, data, editDeposito.nombre)
  }

  async function handleCreateRuta(data: any) {
    const canteraId  = Number(data.cantera_id)
    const depositoId = Number(data.deposito_id)
    if (!canteraId || !depositoId) { toast('Elegí punto de carga y depósito', 'err'); return }
    setLoading(true)
    try {
      await apiPost('/api/logistica/lugares/rutas', {
        cantera_id:    canteraId,
        deposito_id:   depositoId,
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
      toast(esDuplicado ? 'Ya existe una ruta para ese par punto de carga/depósito' : 'Error al agregar', 'err')
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
      toast(esDuplicado ? 'Ya existe una ruta para ese par punto de carga/depósito' : 'Error al agregar', 'err')
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
      id:          r.id,
      cantera:     r.canteras?.nombre ?? `Punto de carga #${r.cantera_id}`,
      deposito:    r.depositos?.nombre ?? `Depósito #${r.deposito_id}`,
      cantera_id:  r.cantera_id,
      deposito_id: r.deposito_id,
    })
  }

  // Link a las direcciones de Google Maps entre un punto de carga y un
  // depósito (por id). Requiere que ambos tengan lat/lng cargadas.
  function rutaMapsUrl(canteraId?: number | string, depositoId?: number | string): string | null {
    const c = (canteras as Cantera[]).find(x => x.id === Number(canteraId))
    const d = (depositos as Deposito[]).find(x => x.id === Number(depositoId))
    if (c?.lat == null || c?.lng == null || d?.lat == null || d?.lng == null) return null
    return `https://www.google.com/maps/dir/${c.lat},${c.lng}/${d.lat},${d.lng}/`
  }

  // Pide a Google el km por carretera del par y lo aplica como sugerencia
  // editable en el input correspondiente. El user lo controla con el link
  // "Ver ruta en Google Maps" antes de guardar.
  const { mutate: sugerirKmMutate, isPending: sugiriendo } = useSugerirKm()
  function pedirSugerencia(canteraId: number, depositoId: number, aplicar: (km: number) => void) {
    if (!canteraId || !depositoId) { toast('Elegí punto de carga y depósito', 'err'); return }
    sugerirKmMutate({ cantera_id: canteraId, deposito_id: depositoId }, {
      onSuccess: (r) => {
        aplicar(r.km)
        const h = Math.floor(r.duracion_s / 3600)
        const m = Math.round((r.duracion_s % 3600) / 60)
        toast(`✨ Google sugiere ${r.km.toLocaleString('es-AR')} km (~${h}h ${m}m). Verificalo con el link antes de guardar.`, 'ok')
      },
      onError: (err: any) => {
        const code = err?.body?.error
        if (code === 'SIN_COORDENADAS') {
          const lugares = (err?.body?.detail?.lugares ?? []).join(', ')
          toast(`Falta cargar coordenadas de: ${lugares || 'algún lugar'} (botón 🔍 Buscar al editarlo)`, 'err')
        } else if (code === 'GOOGLE_API_KEY_MISSING') {
          toast('Falta configurar GOOGLE_MAPS_API_KEY en el backend', 'err')
        } else {
          toast('No pude calcular la distancia', 'err')
        }
      },
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
      <Section title="⛏ Puntos de carga" onAdd={() => setModalCantera(true)} addLabel="＋ Punto de carga">
        <div className="px-4 py-2 border-b border-gris bg-gris/30">
          <Input
            placeholder="🔍 Buscar punto de carga…"
            value={buscarListaCant}
            onChange={e => setBuscarListaCant(e.target.value)}
          />
        </div>
        <SimpleList
          items={canterasLista}
          emptyMsg={buscarListaCant ? 'Sin resultados para la búsqueda.' : 'No hay puntos de carga registrados.'}
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
        <div className="px-4 py-2 border-b border-gris bg-gris/30">
          <Input
            placeholder="🔍 Buscar depósito…"
            value={buscarListaDep}
            onChange={e => setBuscarListaDep(e.target.value)}
          />
        </div>
        <SimpleList
          items={depositosLista}
          emptyMsg={buscarListaDep ? 'Sin resultados para la búsqueda.' : 'No hay depósitos registrados.'}
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

      {/* Lugares operativos — punto físico (mantenimiento/relevos/estacionamiento)
          que se gestiona como un concepto y por detrás es el par cantera+depósito
          (ambos operativo). No facturable: no puede ser origen/destino de cargados,
          sí de vacíos. */}
      <Section title="🅿️ Lugares operativos" onAdd={openNewLugarOp} addLabel="＋ Lugar operativo">
        <div className="px-4 py-2 text-[11px] text-gris-dark border-b border-gris bg-naranja-light/30">
          Puntos físicos no facturables (mantenimiento, relevos, estacionamiento). Se usan en tramos vacíos; nunca como origen/destino de un cargado.
        </div>
        <SimpleList
          items={lugaresOp as LugarOperativo[]}
          emptyMsg="No hay lugares operativos."
          renderItem={l => (
            <div key={l.id} className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-gris last:border-0">
              <div className="flex items-center gap-2 flex-wrap min-w-0 flex-1">
                <span className="font-bold text-sm text-carbon">{l.nombre}</span>
                <span className="text-[10px] font-bold uppercase tracking-wide text-naranja-dark bg-naranja-light border border-naranja/30 rounded px-1.5 py-0.5">⚙ Operativo</span>
                {l.localidad && <span className="text-xs text-gris-dark">({l.localidad})</span>}
                {l.maps_url && (
                  <a href={l.maps_url} target="_blank" rel="noopener noreferrer"
                    className="text-xs font-bold text-azul hover:text-naranja transition-colors flex items-center gap-0.5"
                    title="Ver en Google Maps">📍 Maps</a>
                )}
                {l.obs && <span className="text-xs text-gris-dark truncate">{l.obs}</span>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => openEditLugarOp(l)} title="Editar" className="text-xs px-2 py-1 rounded hover:bg-gris transition-colors text-gris-dark">✏️</button>
                <button onClick={() => handleDeleteLugarOp(l)} title="Eliminar" className="text-xs px-2 py-1 rounded hover:bg-rojo-light text-gris-dark hover:text-rojo transition-colors">✕</button>
              </div>
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
              label="Punto de carga (origen)"
              placeholder="Buscar punto de carga…"
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
                  <div className="text-sm min-w-0 flex flex-col gap-1.5">
                    <div>
                      <span className="text-gris-dark">Distancia (un sentido): </span>
                      <span className="font-mono font-bold text-verde text-lg">
                        {Math.round(rutaSel.km_ida_vuelta).toLocaleString('es-AR')} km
                      </span>
                      {rutaSel.obs && <p className="text-[11px] text-gris-dark mt-0.5 truncate">{rutaSel.obs}</p>}
                    </div>
                    <RutaMapsLink url={rutaMapsUrl(selCant, selDep)} />
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
                  <div className="mb-2 flex items-center gap-2 flex-wrap">
                    <SugerirKmBtn loading={sugiriendo} onClick={() =>
                      pedirSugerencia(Number(selCant), Number(selDep), km => setKmInline(String(km)))} />
                    <RutaMapsLink url={rutaMapsUrl(selCant, selDep)} />
                  </div>
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
            <span className="font-bold text-verde">✓ {verificadasCount}</span>
            <span className="text-gris-dark"> verificadas</span>
            {sinVerificarCount > 0 && (
              <span className="ml-2 font-bold text-[#8a5a00]">◐ {sinVerificarCount} sin verificar</span>
            )}
            {faltantes > 0 && <span className="ml-2 text-rojo font-bold">＋ {faltantes} sin cargar</span>}
            <span className="text-gris-dark"> · de {canteras.length * depositos.length} combinaciones</span>
            <span className="block text-[11px] text-gris-dark mt-0.5">
              Tocá una celda con km para editar, o una vacía (＋) para cargarla.
              {sinVerificarCount > 0 && ' Las ◐ ámbar las sugirió Google: revisalas contra el mapa y confirmalas.'}
            </span>

            <div className="flex flex-wrap items-center gap-2 mt-2">
              {/* Sin gate de permisos acá: el resto del tab tampoco lo tiene y
                  el backend exige logistica.actualizacion para este endpoint. */}
              {faltantes > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  loading={completando.isPending && !previewMatriz}
                  onClick={() => completando.mutate(true, {
                    onSuccess: (r) => setPreviewMatriz(r),
                    onError:   (e) => toast(msgCompletar(e), 'err'),
                  })}
                >
                  ✨ Completar faltantes con Google
                </Button>
              )}
              {sinVerificarCount > 0 && (
                <button
                  type="button"
                  onClick={() => setSoloSinVerificar(v => !v)}
                  className={`text-xs font-bold px-3 py-1.5 rounded-full border-[1.5px] transition-colors ${
                    soloSinVerificar
                      ? 'bg-[#fff3d6] border-[#c98a00] text-[#8a5a00]'
                      : 'bg-white border-gris-mid text-gris-dark hover:border-[#c98a00] hover:text-[#8a5a00]'
                  }`}
                >
                  ◐ Solo sin verificar
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
              <Input
                placeholder="🔍 Filtrar puntos de carga (filas)…"
                value={buscarCant}
                onChange={e => setBuscarCant(e.target.value)}
              />
              <Input
                placeholder="🔍 Filtrar depósitos (columnas)…"
                value={buscarDep}
                onChange={e => setBuscarDep(e.target.value)}
              />
            </div>
          </div>
          {canteras.length === 0 || depositos.length === 0 ? (
            <p className="text-center py-6 text-gris-dark text-sm">
              Cargá al menos un punto de carga y un depósito para ver la matriz.
            </p>
          ) : canterasMatriz.length === 0 || depositosMatriz.length === 0 ? (
            <p className="text-center py-6 text-gris-dark text-sm">
              Sin resultados para el filtro.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-white px-3 py-2 text-left text-[10px] font-bold text-gris-dark uppercase tracking-wider border-b border-r border-gris">
                      Punto de carga ╲ Depósito
                    </th>
                    {depositosMatriz.map(d => (
                      <th key={d.id} title={d.nombre}
                        className="px-2 py-2 text-center text-[10px] font-bold text-gris-dark border-b border-gris min-w-[60px] max-w-[88px]">
                        <span className="block truncate">{d.nombre}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {canterasMatriz.map(c => (
                    <tr key={c.id}>
                      <th title={c.nombre}
                        className="sticky left-0 z-10 bg-white px-3 py-2 text-left font-bold text-carbon text-xs border-b border-r border-gris max-w-[140px]">
                        <span className="block truncate">{c.nombre}</span>
                      </th>
                      {depositosMatriz.map(d => {
                        const r = rutaPorPar.get(`${c.id}-${d.id}`)
                        const isSel = String(c.id) === selCant && String(d.id) === selDep
                        return (
                          <td key={d.id} className="border-b border-gris p-0">
                            {r ? (
                              // Tres estados, distinguibles sin depender del color:
                              // ✓ verificada (verde) · ◐ sugerida por Google, sin
                              // revisar (ámbar, con borde) · ＋ sin cargar (abajo).
                              <button
                                onClick={() => openEditRuta(r)}
                                title={r.verificada
                                  ? `${c.nombre} → ${d.nombre} · ${Math.round(r.km_ida_vuelta).toLocaleString('es-AR')} km · verificado · editar`
                                  : `${c.nombre} → ${d.nombre} · ${Math.round(r.km_ida_vuelta).toLocaleString('es-AR')} km SUGERIDO POR GOOGLE, sin verificar · tocá para revisarlo contra el mapa`}
                                className={`w-full px-2 py-2.5 text-center font-mono text-xs font-bold transition-colors
                                  ${!r.verificada
                                    ? 'bg-[#fff3d6] text-[#8a5a00] border-l-[3px] border-[#c98a00] hover:bg-[#ffe9b8]'
                                    : soloFaltantes || soloSinVerificar
                                      ? 'text-gris-mid hover:bg-gris/40'
                                      : 'text-verde hover:bg-verde-light/50'}
                                  ${isSel ? 'ring-2 ring-azul ring-inset bg-azul-light/30' : ''}`}
                              >
                                {!r.verificada && <span className="mr-0.5">◐</span>}
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
          )}
        </div>
      </div>

      {/* Modal nueva cantera */}
      <Modal open={modalCantera} onClose={() => setModalCantera(false)} title="⛏ NUEVO PUNTO DE CARGA"
        footer={<><Button variant="secondary" onClick={() => setModalCantera(false)}>Cancelar</Button><Button variant="primary" loading={loading} onClick={formCantera.handleSubmit(handleCreateCantera)}>✓ Guardar</Button></>}
      >
        <div className="flex flex-col gap-4">
          <Input label="Nombre" placeholder="Punto de carga del Norte" {...formCantera.register('nombre')} />
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
      <Modal open={!!editCantera} onClose={() => setEditCantera(null)} title="✏️ EDITAR PUNTO DE CARGA"
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

      {/* Modal nuevo/editar lugar operativo */}
      <Modal open={modalLugarOp} onClose={() => setModalLugarOp(false)}
        title={editLugarOp ? '✏️ EDITAR LUGAR OPERATIVO' : '🅿️ NUEVO LUGAR OPERATIVO'}
        footer={<><Button variant="secondary" onClick={() => setModalLugarOp(false)}>Cancelar</Button><Button variant="primary" loading={creandoLugarOp || editandoLugarOp} onClick={formLugarOp.handleSubmit(d => handleSaveLugarOp(d))}>✓ Guardar</Button></>}
      >
        <div className="flex flex-col gap-4">
          <div className="bg-naranja-light/40 border border-naranja/30 rounded-lg p-3 text-[11px] text-gris-dark">
            Punto físico no facturable (mantenimiento, relevos, estacionamiento). Al guardar se crea —y se mantiene— como un <b>punto de carga</b> y un <b>depósito</b> con este nombre, marcados como operativos. Lo usás en tramos vacíos; nunca aparece como origen/destino de un cargado.
          </div>
          <Input label="Nombre" placeholder="Estacionamiento San Luis" {...formLugarOp.register('nombre')} />
          <Input label="Localidad" placeholder="Opcional" {...formLugarOp.register('localidad')} />
          <MapsUrlInput register={formLugarOp.register} watch={formLugarOp.watch} setValue={formLugarOp.setValue} />
          <Input label="Observaciones" placeholder="Opcional" {...formLugarOp.register('obs')} />
        </div>
      </Modal>

      {/* Modal ruta */}
      <Modal open={modalRuta} onClose={() => setModalRuta(false)} title="🗺️ NUEVA RUTA"
        footer={<><Button variant="secondary" onClick={() => setModalRuta(false)}>Cancelar</Button><Button variant="primary" loading={loading} onClick={formRuta.handleSubmit(handleCreateRuta)}>✓ Guardar</Button></>}
      >
        <div className="flex flex-col gap-4">
          {/* Combobox no funciona con register (es controlado) → watch/setValue.
              openNuevaRutaPar precarga ids numéricos, por eso el String(). */}
          <Combobox
            label="Punto de carga (origen)"
            placeholder="Buscar punto de carga…"
            value={String(formRuta.watch('cantera_id') ?? '')}
            onChange={v => formRuta.setValue('cantera_id', v)}
            options={(canteras as Cantera[]).map(c => ({
              value: String(c.id), label: c.nombre, sub: c.localidad ?? undefined,
            }))}
          />
          <Combobox
            label="Depósito (destino)"
            placeholder="Buscar depósito…"
            value={String(formRuta.watch('deposito_id') ?? '')}
            onChange={v => formRuta.setValue('deposito_id', v)}
            options={(depositos as Deposito[]).map(d => ({
              value: String(d.id), label: d.nombre, sub: d.localidad ?? undefined,
            }))}
          />
          {formRuta.watch('cantera_id') && formRuta.watch('deposito_id') && (
            <div className="flex items-center gap-2 flex-wrap">
              <SugerirKmBtn loading={sugiriendo} onClick={() =>
                pedirSugerencia(
                  Number(formRuta.watch('cantera_id')), Number(formRuta.watch('deposito_id')),
                  km => formRuta.setValue('km_ida_vuelta', String(km)),
                )} />
              <RutaMapsLink url={rutaMapsUrl(formRuta.watch('cantera_id'), formRuta.watch('deposito_id'))} />
            </div>
          )}
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
            <div className="bg-gris/30 rounded-card p-3 text-sm flex flex-col gap-2">
              <div>
                <span className="font-bold">{editRuta.cantera}</span>
                <span className="text-gris-dark mx-2">→</span>
                <span className="font-bold">{editRuta.deposito}</span>
                <p className="text-[11px] text-gris-dark mt-1">
                  Para cambiar el origen o destino, eliminá esta ruta y creá una nueva.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <SugerirKmBtn loading={sugiriendo} onClick={() =>
                  pedirSugerencia(editRuta.cantera_id, editRuta.deposito_id,
                    km => formEditRuta.setValue('km_ida_vuelta', String(km)))} />
                <RutaMapsLink url={rutaMapsUrl(editRuta.cantera_id, editRuta.deposito_id)} />
              </div>
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

      {/* Aviso de renombre con historial (409 LUGAR_CON_HISTORIAL). Va ÚLTIMO
          entre los modales a propósito: Modal no usa portal y todos comparten
          z-50, así que entre dos abiertos gana el que está más abajo en el DOM.
          El modal de edición sigue abierto cuando salta el aviso (sólo se
          cierra en onSuccess) — arriba en el JSX, este aviso quedaba tapado
          justo para los lugares operativos, que es el único camino para
          renombrar Chivilcoy y Yerba Buena. */}
      <ConfirmRenombreLugar
        info={confirmRenombre}
        loading={confirmRenombre?.tipo === 'operativo' ? editandoLugarOp : loading}
        onCancel={() => setConfirmRenombre(null)}
        onConfirmar={() => confirmRenombre?.reintentar()}
      />

      {/* Completar la matriz con Google: se muestra QUÉ se va a hacer antes de
          gastar la cuota, y se insiste en que el km queda sin verificar porque
          es el que se le paga al chofer. */}
      {previewMatriz && (
        <Modal
          open
          onClose={() => setPreviewMatriz(null)}
          width="max-w-lg"
          title="✨ COMPLETAR LA MATRIZ CON GOOGLE"
          footer={
            <>
              <Button variant="secondary" onClick={() => setPreviewMatriz(null)}>Cancelar</Button>
              <Button
                variant="primary"
                loading={completando.isPending}
                disabled={previewMatriz.a_calcular === 0}
                onClick={() => completando.mutate(false, {
                  onSuccess: (r) => {
                    setPreviewMatriz(null)
                    const problemas = r.fallidas.length
                    toast(
                      problemas === 0
                        ? `✓ ${r.creadas} ruta${r.creadas !== 1 ? 's' : ''} cargada${r.creadas !== 1 ? 's' : ''} sin verificar — revisalas en la matriz`
                        : `⚠ ${r.creadas} cargada${r.creadas !== 1 ? 's' : ''} · ${problemas} sin poder calcular (${r.fallidas.slice(0, 2).map(f => f.par).join(', ')}${problemas > 2 ? '…' : ''})`,
                      problemas === 0 ? 'ok' : 'warn',
                    )
                  },
                  onError: (e) => toast(msgCompletar(e), 'err'),
                })}
              >
                Calcular {previewMatriz.a_calcular} ruta{previewMatriz.a_calcular !== 1 ? 's' : ''}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-3 text-sm">
            {previewMatriz.a_calcular === 0 ? (
              <p className="text-carbon">No queda ningún par sin km. La matriz está completa.</p>
            ) : (
              <>
                <p className="text-carbon">
                  Se va a consultar a Google la distancia de{' '}
                  <b>{previewMatriz.a_calcular} combinacion{previewMatriz.a_calcular !== 1 ? 'es' : ''}</b> que
                  todavía no tienen km. Las que ya están cargadas <b>no se tocan</b>.
                </p>
                <div className="bg-[#fff3d6] border border-[#c98a00]/40 rounded-card p-3">
                  <p className="font-bold text-[#8a5a00]">◐ Van a quedar SIN VERIFICAR</p>
                  <p className="text-[#8a5a00] mt-1">
                    Ese kilometraje es el que se le paga al chofer, así que hasta que lo revises contra
                    el mapa la celda queda en ámbar y el modal de liquidar te avisa. Cuando lo confirmás,
                    pasa a verde.
                  </p>
                </div>
              </>
            )}
            {previewMatriz.sin_coordenadas.length > 0 && (
              <div className="text-xs text-gris-dark">
                <b>{previewMatriz.sin_coordenadas.length} combinación{previewMatriz.sin_coordenadas.length !== 1 ? 'es' : ''}</b>{' '}
                se saltea{previewMatriz.sin_coordenadas.length !== 1 ? 'n' : ''} porque falta la ubicación de
                algún lugar: {previewMatriz.sin_coordenadas.slice(0, 3).join(' · ')}
                {previewMatriz.sin_coordenadas.length > 3 && ` y ${previewMatriz.sin_coordenadas.length - 3} más`}.
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}

// Los tres caminos de renombre que la UI ofrece. `operativo` renombra de una el
// punto de carga Y el depósito del par, y es el ÚNICO camino para los lugares
// operativos: sus fichas sueltas están ocultas de las listas de arriba.
type TipoLugar = 'cantera' | 'deposito' | 'operativo'

const RENOMBRE_COPY: Record<TipoLugar, { titulo: string; botonCrear: string }> = {
  cantera:   { titulo: '⚠ ESTE PUNTO DE CARGA YA TIENE VIAJES',   botonCrear: '＋ Punto de carga' },
  deposito:  { titulo: '⚠ ESTE DEPÓSITO YA TIENE VIAJES',         botonCrear: '＋ Depósito' },
  operativo: { titulo: '⚠ ESTE LUGAR OPERATIVO YA TIENE VIAJES',  botonCrear: '＋ Lugar operativo' },
}

// Confirmación de renombre de un lugar que ya tiene viajes.
// Va como Modal y no como confirm() a propósito: el camino peligroso queda en un
// botón rojo aparte y no se dispara apretando Enter, que es justo cómo se pisó
// una cantera con 10 viajes el 27/07.
function ConfirmRenombreLugar({ info, loading, onCancel, onConfirmar }: {
  info: { tipo: TipoLugar; viajes: number | null; nombreActual: string; nombreNuevo: string } | null
  loading: boolean
  onCancel: () => void
  onConfirmar: () => void
}) {
  if (!info) return null
  const { titulo, botonCrear } = RENOMBRE_COPY[info.tipo]
  const n = info.viajes
  const cuantos = n != null ? `${n.toLocaleString('es-AR')} viaje${n === 1 ? '' : 's'}` : 'viajes'
  const frase = n != null
    ? `Hay ${cuantos} registrado${n === 1 ? '' : 's'} con “${info.nombreActual}”.`
    : `Hay viajes registrados con “${info.nombreActual}”.`

  // El backend arma los relevos de chofer buscando Chivilcoy POR NOMBRE
  // (relevo.service.ts → findChivilcoy). Si el nombre nuevo no lo contiene,
  // deja de encontrarlo. Sólo avisamos en ese caso puntual.
  const rompeRelevos = /chivilcoy/i.test(info.nombreActual) && !/chivilcoy/i.test(info.nombreNuevo)

  return (
    <Modal
      open
      onClose={onCancel}
      width="max-w-lg"
      title={titulo}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>Cancelar</Button>
          <Button variant="danger" loading={loading} onClick={onConfirmar}>
            Es el mismo lugar — renombrar igual
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        <div className="bg-rojo-light border border-rojo/30 rounded-card p-3">
          <p className="font-bold text-rojo">{frase}</p>
          <p className="text-carbon mt-1">
            Si le cambiás el nombre a <b>“{info.nombreNuevo}”</b>, esos viajes van a pasar a decir
            “{info.nombreNuevo}” — también los que ya se facturaron o se liquidaron al chofer.
            El nombre viejo no queda guardado en ningún lado.
          </p>
        </div>

        {info.tipo === 'operativo' && (
          <div className="bg-naranja-light border border-naranja/30 rounded-card p-3">
            <p className="font-bold text-naranja-dark">Un lugar operativo son dos fichas, y se renombran las dos.</p>
            <p className="text-carbon mt-1">
              Por detrás, “{info.nombreActual}” es un <b>punto de carga</b> y un <b>depósito</b> con el
              mismo nombre. Al guardar se les cambia el nombre a los dos de una — por eso el conteo de
              arriba junta los viajes que salen de ahí y los que llegan ahí.
            </p>
          </div>
        )}

        {rompeRelevos && (
          <div className="bg-amarillo-light border border-amarillo/40 rounded-card p-3">
            <p className="font-bold text-[#7A5500]">Este lugar es el que usa el sistema para los relevos.</p>
            <p className="text-carbon mt-1">
              Los relevos de chofer se arman buscando el lugar por el nombre “Chivilcoy”. Si el nombre
              nuevo no lo dice, los relevos van a dejar de calcularse solos. Avisá a sistemas antes de guardar.
            </p>
          </div>
        )}

        <div className="bg-verde-light border border-verde/30 rounded-card p-3">
          <p className="font-bold text-verde">Si “{info.nombreNuevo}” es OTRO lugar, no lo renombres.</p>
          <p className="text-carbon mt-1">
            Cancelá y creá uno nuevo con el botón <b>{botonCrear}</b>. Así los viajes viejos siguen
            apuntando al lugar del que salieron de verdad.
          </p>
        </div>
        <p className="text-xs text-gris-dark">
          Renombrá sólo si es el mismo lugar de siempre y le cambiaron el nombre, o estaba mal escrito.
        </p>
      </div>
    </Modal>
  )
}

function MapsUrlInput({ register, watch, setValue }: { register: any; watch: any; setValue?: any }) {
  const url = watch('maps_url') ?? ''
  const lat = watch('lat')
  const lng = watch('lng')
  const nombre    = watch('nombre') ?? ''
  const localidad = watch('localidad') ?? ''
  const { mutate: geocodeMutate,  isPending: geocoding }   = useGeocode()
  const { mutate: resolverMutate, isPending: resolviendo } = useResolverMapsUrl()
  const toast = useToast()

  // Geocoding por nombre+localidad. Es el fallback: suele caer en el centro
  // del pueblo, no en la planta (caso MARCAMPO: ~19 km de error).
  function buscarPorDireccion() {
    const direccion = [nombre, localidad].filter(Boolean).join(', ').trim()
    if (!direccion) { toast('Cargá el link de Maps, o al menos el nombre o la localidad', 'err'); return }
    geocodeMutate(direccion, {
      onSuccess: (r) => {
        setValue('lat', r.lat, { shouldDirty: true })
        setValue('lng', r.lng, { shouldDirty: true })
        toast(`✓ Coordenadas (por nombre): ${r.formatted_address}. Verificá el punto en Maps.`, 'ok')
      },
      onError: (err: any) => {
        const msg = err?.body?.error === 'GOOGLE_API_KEY_MISSING'
          ? 'Falta configurar GOOGLE_MAPS_API_KEY en el backend'
          : 'No se encontró la dirección. Cargá lat/lng manualmente.'
        toast(msg, 'err')
      },
    })
  }

  // Buscar: si hay link de Maps usa el PIN de ese link (punto exacto que
  // cargó el usuario); si no hay link, geocodifica por nombre+localidad.
  function handleBuscar() {
    if (!setValue) return
    const link = (url ?? '').trim()
    if (!link) { buscarPorDireccion(); return }
    resolverMutate(link, {
      onSuccess: (r) => {
        setValue('lat', r.lat, { shouldDirty: true })
        setValue('lng', r.lng, { shouldDirty: true })
        toast(r.fuente === 'pin'
          ? '✓ Coordenadas tomadas del pin del link de Maps'
          : '✓ Coordenadas aproximadas (centro del mapa del link). Verificá el punto.', 'ok')
      },
      // Si el link no se pudo resolver (inválido, sin coords), caemos al
      // geocoding por nombre avisando por qué.
      onError: (err: any) => {
        const code = err?.body?.error
        toast(code === 'MAPS_URL_INVALIDA'
          ? 'El link no parece de Google Maps — busco por nombre…'
          : 'No pude sacar coordenadas del link — busco por nombre…', 'warn')
        buscarPorDireccion()
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
              disabled={geocoding || resolviendo}
              className="mb-0.5 inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-verde-light text-verde text-xs font-bold hover:bg-verde hover:text-white transition-colors disabled:opacity-50"
            >
              {(geocoding || resolviendo) ? '⏳' : '🔍'} Buscar
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
            : 'Click en "Buscar": usa el pin del link de Maps (exacto); sin link, busca por nombre + localidad (aproximado)'}
        </p>
      </div>
    </div>
  )
}

// Link al trayecto en Google Maps (o ayuda si falta alguna coordenada).
function RutaMapsLink({ url }: { url: string | null }) {
  if (!url) {
    return (
      <p className="text-[11px] text-gris-dark">
        🗺 Para ver la ruta en Maps, cargale coordenadas a ambos lugares (botón 🔍 Buscar al editar cada uno).
      </p>
    )
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title="Abrir el trayecto entre los dos puntos en Google Maps"
      className="inline-flex items-center gap-1 self-start px-3 py-2 rounded-lg bg-azul-light text-azul text-xs font-bold hover:bg-azul hover:text-white transition-colors"
    >
      🗺 Ver ruta en Google Maps
    </a>
  )
}

// Botón "Sugerir km": trae la distancia por carretera calculada por Google
// y la aplica como sugerencia editable.
function SugerirKmBtn({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      title="Traer el km por carretera calculado por Google (sugerencia editable — verificala con el link)"
      className="inline-flex items-center gap-1 self-start px-3 py-2 rounded-lg bg-verde-light text-verde text-xs font-bold hover:bg-verde hover:text-white transition-colors disabled:opacity-50"
    >
      {loading ? '⏳' : '✨'} Sugerir km
    </button>
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