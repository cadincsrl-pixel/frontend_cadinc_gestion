'use client'

import { useState, useMemo } from 'react'
import {
  useRopaCategorias,
  useRopaUltimasEntregas,
  useRopaEntregasPorLeg,
  useCreateRopaEntregasLote,
  useDeleteRopaEntrega,
  useCreateRopaCategoria,
  useUpdateRopaCategoria,
  useDeleteRopaCategoria,
} from '../hooks/useRopa'
import { usePersonal } from '../hooks/usePersonal'
import { toISO } from '@/lib/utils/dates'
import { venceEl, entregaVencida } from '@/lib/utils/ropa'
import { esActivo } from '@/lib/utils/personal'
import { useActividadPersonal, legsActivosDe } from '../hooks/useActividadPersonal'
import { Button }     from '@/components/ui/Button'
import { Modal }      from '@/components/ui/Modal'
import { Input }      from '@/components/ui/Input'
import { Combobox }   from '@/components/ui/Combobox'
import { Pagination } from '@/components/ui/Pagination'
import { useToast }   from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import type { Personal, RopaEntrega } from '@/types/domain.types'

const DEFAULT_PAGE_SIZE = 12

// Tooltip de los botones deshabilitados por permiso (undefined = habilitado).
// Se deshabilita, no se oculta: el backend valida igual y ocultar confunde.
function sinPermiso(ok: boolean, accion: string): string | undefined {
  return ok ? undefined : `Sin permiso para ${accion}`
}
const BTN_DISABLED = 'disabled:opacity-40 disabled:cursor-not-allowed'

function hoy() { return toISO(new Date()) }

function fmtFecha(s: string) {
  const [y, m, d] = s.split('-')
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
  return `${d} ${meses[parseInt(m!) - 1]} ${y}`
}

function fmtCorta(s: string) {
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y!.slice(2)}`
}

/**
 * Estado de un trabajador frente a la ropa. "Sin entregas" se separa de
 * "vencidos" a propósito: `entregaVencida(undefined, ...)` da true, así que el
 * viejo filtro "solo vencidos" mezclaba a los 20 que nunca recibieron nada con
 * los que tienen ropa gastada. Son dos problemas distintos y se resuelven
 * distinto.
 */
type EstadoRopa = 'sin-entregas' | 'vencidos' | 'al-dia'

const FILTRO_LABEL: Record<'todos' | EstadoRopa, string> = {
  'todos':        'Todos',
  'vencidos':     'Con algo vencido',
  'al-dia':       'Al día',
  'sin-entregas': 'Sin entregas',
}

/** Talles del legajo, listos para mostrar. Solo los que están cargados. */
function tallesDe(p: Personal): string {
  return [
    p.talle_pantalon && `Pant. ${p.talle_pantalon}`,
    p.talle_botines  && `Bot. ${p.talle_botines}`,
    p.talle_camisa   && `Cam. ${p.talle_camisa}`,
  ].filter(Boolean).join(' · ')
}


// ── Modal nueva entrega ──────────────────────────────────────────────────────
interface ModalEntregaProps {
  open:       boolean
  legInicial: string
  /**
   * Toda la nómina, con los activos primero. Antes eran solo los activos, pero
   * desde que la lista muestra también a los inactivos el botón "＋" de una de
   * esas filas abría el modal con el buscador en blanco: el legajo no estaba
   * entre las opciones. Y sí hay que poder entregarle a alguien que vuelve de
   * licencia antes de que cargue horas.
   */
  personal:   Personal[]
  legsActivos: ReadonlySet<string>
  onClose:    () => void
}

function ModalEntrega({ open, legInicial, personal, legsActivos, onClose }: ModalEntregaProps) {
  const toast = useToast()
  const { data: categorias = [] } = useRopaCategorias()
  const { mutateAsync: crearLote, isPending } = useCreateRopaEntregasLote()

  const [leg,    setLeg]    = useState(legInicial)
  const [catIds, setCatIds] = useState<number[]>([])
  const [fecha,  setFecha]  = useState(hoy)
  const [obs,    setObs]    = useState('')
  const [saving, setSaving] = useState(false)

  const opPersonal = useMemo(() => {
    const orden = [...personal].sort((a, b) => {
      const act = (legsActivos.has(b.leg) ? 1 : 0) - (legsActivos.has(a.leg) ? 1 : 0)
      return act || a.nom.localeCompare(b.nom)
    })
    return orden.map((p: Personal) => ({
      value: p.leg,
      label: p.nom,
      sub: legsActivos.has(p.leg) ? `Leg. ${p.leg}` : `Leg. ${p.leg} · sin horas recientes`,
    }))
  }, [personal, legsActivos])

  function toggleCat(id: number) {
    setCatIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function handleSubmit() {
    if (!leg)           { toast('Seleccioná un trabajador', 'err'); return }
    if (!catIds.length) { toast('Seleccioná al menos un elemento', 'err'); return }
    setSaving(true)
    try {
      // Un solo request: entran todas las prendas o ninguna (antes eran N POST
      // y un reintento duplicaba las que sí habían entrado).
      await crearLote({ leg, categoria_ids: catIds, fecha_entrega: fecha, obs: obs || null })
    } catch (e) {
      setSaving(false)
      toast(`No se pudo registrar la entrega: ${e instanceof Error ? e.message : 'error de red'}`, 'err')
      return
    }
    setSaving(false)
    toast(`✓ ${catIds.length} entrega${catIds.length > 1 ? 's' : ''} registrada${catIds.length > 1 ? 's' : ''}`, 'ok')
    setCatIds([]); setObs('')
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="👕 REGISTRAR ENTREGA"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={isPending || saving} onClick={handleSubmit}>
            ✓ Guardar{catIds.length > 1 ? ` (${catIds.length})` : ''}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Combobox
          label="Trabajador"
          placeholder="Buscar por nombre o legajo..."
          options={opPersonal}
          value={leg}
          onChange={setLeg}
        />

        <div>
          <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider block mb-2">
            Elementos entregados
          </label>
          <div className="flex flex-wrap gap-2">
            {categorias.map(c => {
              const sel = catIds.includes(c.id)
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleCat(c.id)}
                  className={`
                    flex items-center gap-1.5 px-3 py-2 rounded-lg border-[1.5px] text-sm font-bold transition-all
                    ${sel
                      ? 'bg-naranja border-naranja text-white'
                      : 'bg-white border-gris-mid text-carbon hover:border-naranja hover:text-naranja'
                    }
                  `}
                >
                  <span>{c.icono ?? '📦'}</span>
                  {c.nombre}
                  {sel && <span className="text-xs">✓</span>}
                </button>
              )
            })}
          </div>
          {catIds.length === 0 && (
            <p className="text-[11px] text-gris-dark mt-1">Tocá los elementos que se entregaron.</p>
          )}
        </div>

        <Input label="Fecha de entrega" type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
        <Input label="Observaciones (opcional)" placeholder="Talle, marca, etc." value={obs} onChange={e => setObs(e.target.value)} />
      </div>
    </Modal>
  )
}

// ── Modal gestionar categorías ───────────────────────────────────────────────
interface ModalCategoriasProps {
  open:    boolean
  onClose: () => void
  // Categorías de ropa: POST → tarja.creacion, PATCH → actualizacion, DELETE → eliminacion.
  puedeCrear:    boolean
  puedeEditar:   boolean
  puedeEliminar: boolean
}

function ModalCategorias({ open, onClose, puedeCrear, puedeEditar, puedeEliminar }: ModalCategoriasProps) {
  const toast = useToast()
  const { data: categorias = [] } = useRopaCategorias()
  const { mutate: crear,    isPending: creando  } = useCreateRopaCategoria()
  const { mutate: actualizar }                     = useUpdateRopaCategoria()
  const { mutate: eliminar }                       = useDeleteRopaCategoria()

  const [nombre,  setNombre]  = useState('')
  const [icono,   setIcono]   = useState('')
  const [meses,   setMeses]   = useState('6')
  const [editandoVenc, setEditandoVenc] = useState<{ id: number; valor: string } | null>(null)

  function handleCreate() {
    if (!nombre.trim()) { toast('Ingresá un nombre', 'err'); return }
    crear(
      { nombre: nombre.trim(), icono: icono.trim() || undefined, meses_vencimiento: Number(meses) || 6 },
      {
        onSuccess: () => { toast('✓ Categoría creada', 'ok'); setNombre(''); setIcono(''); setMeses('6') },
        onError:   () => toast('Error al crear', 'err'),
      }
    )
  }

  function handleSaveVenc(id: number) {
    const v = Number(editandoVenc?.valor)
    if (!v || v < 1) { toast('Ingresá un número válido', 'err'); return }
    actualizar({ id, meses_vencimiento: v }, {
      onSuccess: () => { toast('✓ Vencimiento actualizado', 'ok'); setEditandoVenc(null) },
      onError:   () => toast('Error al actualizar', 'err'),
    })
  }

  function handleDelete(id: number, nombre: string) {
    if (!confirm(`¿Eliminar la categoría "${nombre}"?`)) return
    eliminar(id, {
      onSuccess: () => toast('✓ Eliminada', 'ok'),
      onError:   () => toast('Error al eliminar', 'err'),
    })
  }

  return (
    <Modal open={open} onClose={onClose} title="⚙️ CATEGORÍAS DE ROPA" width="max-w-md"
      footer={<Button variant="secondary" onClick={onClose}>Cerrar</Button>}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          {categorias.map(c => (
            <div key={c.id} className="flex items-center justify-between px-3 py-2 bg-gris rounded-lg gap-2">
              <span className="text-sm font-semibold text-carbon flex-1">{c.icono} {c.nombre}</span>
              {editandoVenc?.id === c.id ? (
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    value={editandoVenc.valor}
                    onChange={e => setEditandoVenc({ id: c.id, valor: e.target.value })}
                    className="w-14 px-1.5 py-0.5 border-[1.5px] border-naranja rounded text-xs font-mono text-center outline-none"
                    autoFocus
                  />
                  <span className="text-[10px] text-gris-dark">meses</span>
                  <button onClick={() => handleSaveVenc(c.id)} className="text-xs font-bold text-verde hover:text-verde px-1">✓</button>
                  <button onClick={() => setEditandoVenc(null)} className="text-xs text-gris-mid hover:text-rojo px-1">✕</button>
                </div>
              ) : (
                <button
                  onClick={() => setEditandoVenc({ id: c.id, valor: String(c.meses_vencimiento ?? 6) })}
                  disabled={!puedeEditar}
                  title={sinPermiso(puedeEditar, 'editar categorías') ?? 'Cambiar meses de vencimiento'}
                  className={`text-[11px] font-bold text-azul-mid bg-azul-light px-2 py-0.5 rounded hover:bg-azul hover:text-white transition-colors ${BTN_DISABLED}`}
                >
                  ⏱ {c.meses_vencimiento ?? 6}m
                </button>
              )}
              <button
                onClick={() => handleDelete(c.id, c.nombre)}
                disabled={!puedeEliminar}
                title={sinPermiso(puedeEliminar, 'eliminar categorías') ?? 'Eliminar categoría'}
                className={`text-gris-mid hover:text-rojo text-xs transition-colors ${BTN_DISABLED}`}
              >
                🗑
              </button>
            </div>
          ))}
        </div>
        <div className="border-t border-gris-mid pt-3 flex flex-col gap-2">
          <div className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">Nueva categoría</div>
          <div className="flex gap-2">
            <Input placeholder="Emoji (ej: 🧤)" value={icono} onChange={e => setIcono(e.target.value)} className="w-20 flex-shrink-0" />
            <Input placeholder="Nombre (ej: Guantes)" value={nombre} onChange={e => setNombre(e.target.value)} className="flex-1" />
          </div>
          <div className="flex items-center gap-2">
            <Input
              label="Vencimiento (meses)"
              type="number"
              placeholder="6"
              value={meses}
              onChange={e => setMeses(e.target.value)}
              className="w-32"
            />
          </div>
          <Button variant="primary" size="sm" loading={creando} onClick={handleCreate} disabled={!puedeCrear} title={sinPermiso(puedeCrear, 'crear categorías')}>＋ Agregar</Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Modal historial (carga sus propias entregas por leg) ─────────────────────
interface ModalHistorialProps {
  open:      boolean
  onClose:   () => void
  leg:       string
  nombre:    string
  catMap:    Map<number, { nombre: string; icono: string | null; meses_vencimiento: number }>
  puedeElim: boolean
  onDelete:  (id: number) => void
}

function ModalHistorial({ open, onClose, leg, nombre, catMap, puedeElim, onDelete }: ModalHistorialProps) {
  const { data: entregas = [] } = useRopaEntregasPorLeg(open ? leg : '')

  const porCategoria = new Map<number, RopaEntrega[]>()
  entregas.forEach(e => {
    if (!porCategoria.has(e.categoria_id)) porCategoria.set(e.categoria_id, [])
    porCategoria.get(e.categoria_id)!.push(e)
  })

  return (
    <Modal open={open} onClose={onClose} title={`📋 HISTORIAL — ${nombre}`} width="max-w-lg"
      footer={<Button variant="secondary" onClick={onClose}>Cerrar</Button>}
    >
      <div className="flex flex-col gap-4">
        {[...porCategoria.entries()].map(([catId, movs]) => {
          const cat = catMap.get(catId)
          const movsOrdenados = [...movs].sort((a, b) => b.fecha_entrega.localeCompare(a.fecha_entrega))
          return (
            <div key={catId}>
              <div className="text-xs font-bold text-gris-dark uppercase tracking-wider mb-2">
                {cat?.icono} {cat?.nombre ?? `Categoría #${catId}`}
              </div>
              <div className="flex flex-col gap-1">
                {movsOrdenados.map((e, idx) => {
                  const vence     = cat ? venceEl(e.fecha_entrega, cat.meses_vencimiento) : null
                  const yaVencida = !!vence && vence <= hoy()
                  return (
                    <div key={e.id} className={`flex items-center justify-between px-3 py-2 rounded-lg ${idx === 0 ? 'bg-azul-light' : 'bg-gris'}`}>
                      <div>
                        <div className="text-sm font-semibold text-carbon">{fmtFecha(e.fecha_entrega)}</div>
                        {e.obs && <div className="text-[11px] text-gris-dark italic">{e.obs}</div>}
                        {idx === 0 && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] font-bold text-azul uppercase tracking-wide">Última entrega</span>
                            {vence && (
                              <span className={`text-[10px] font-bold uppercase tracking-wide ${yaVencida ? 'text-rojo' : 'text-verde'}`}>
                                {yaVencida ? '⚠ venció' : 'vence'} el {fmtFecha(vence)}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => onDelete(e.id)}
                        disabled={!puedeElim}
                        title={sinPermiso(puedeElim, 'eliminar entregas') ?? 'Eliminar entrega'}
                        className={`text-gris-mid hover:text-rojo text-xs transition-colors ${BTN_DISABLED}`}
                      >
                        🗑
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
        {entregas.length === 0 && (
          <p className="text-sm text-gris-dark text-center py-4">Sin entregas registradas.</p>
        )}
      </div>
    </Modal>
  )
}

// ── Página principal ─────────────────────────────────────────────────────────
export function RopaPage() {
  const toast = useToast()
  const { puedeCrear, puedeEditar, puedeEliminar } = usePermisos('tarja')
  const { data: categorias = [] } = useRopaCategorias()
  const { data: personal   = [] } = usePersonal()
  const { mutate: deleteEntrega } = useDeleteRopaEntrega()

  // Actividad por legajo (RPC): antes se bajaba toda la tabla de horas.
  const { data: actividad = [] } = useActividadPersonal()

  const [modalEntrega,   setModalEntrega]   = useState<string | null>(null)
  const [modalHistorial, setModalHistorial] = useState<string | null>(null)
  const [modalCats,      setModalCats]      = useState(false)
  const [filtro,         setFiltro]         = useState<'todos' | EstadoRopa>('todos')
  // Por defecto se ven TODOS, con los activos arriba. El toggle deja la lista
  // corta cuando solo interesa a quién hay que entregarle hoy.
  const [soloActivos,    setSoloActivos]    = useState(false)
  const [busqueda,       setBusqueda]       = useState('')
  const [page,           setPage]           = useState(1)
  const [pageSize,       setPageSize]       = useState(DEFAULT_PAGE_SIZE)

  // Trabajadores activos con el criterio único de lib/utils/personal.ts
  // (override manual, mensualizados siempre, jornalizados con horas en las
  // últimas 3 semanas): la misma gente que el badge "Activo" de Personal.
  // A los inactivos no se les da ropa.
  const legsActivosSet = useMemo(() => {
    const legsConHoras = legsActivosDe(actividad)
    return new Set((personal as Personal[]).filter(p => esActivo(p, legsConHoras)).map(p => p.leg))
  }, [actividad, personal])

  const trabajadoresActivos = useMemo(
    () => (personal as Personal[]).filter(p => legsActivosSet.has(p.leg)),
    [personal, legsActivosSet],
  )

  // La lista muestra a TODOS por defecto, con los activos arriba. Antes se
  // ocultaba al inactivo y con él se iba su historial de ropa: 8 legajos con
  // entregas quedaban invisibles, y no había forma de ver qué se les había
  // dado a los que están de licencia o volvieron después de un tiempo.
  const trabajadoresBusqueda = useMemo(() => {
    const base = soloActivos ? trabajadoresActivos : (personal as Personal[])
    const q = busqueda.trim().toLowerCase()
    return !q ? base : base.filter(p => p.nom.toLowerCase().includes(q) || p.leg.includes(q))
  }, [soloActivos, trabajadoresActivos, personal, busqueda])

  const catMap = useMemo(() => {
    const m = new Map<number, { nombre: string; icono: string | null; meses_vencimiento: number }>()
    categorias.forEach(c => m.set(c.id, { nombre: c.nombre, icono: c.icono, meses_vencimiento: c.meses_vencimiento ?? 6 }))
    return m
  }, [categorias])

  const nombreMap = useMemo(() => {
    const m = new Map<string, string>()
    personal.forEach((p: Personal) => m.set(p.leg, p.nom))
    return m
  }, [personal])

  // Últimas entregas por (leg, categoría) de TODOS los activos en una sola
  // query (RPC agregada). Alimenta los chips, el filtro de vencidos y el orden
  // por vencimiento — por eso no alcanza con cargar solo la página actual.
  // Se piden para TODA la nómina, no solo los activos: la lista ahora muestra
  // también a los inactivos y el orden depende de sus vencimientos.
  const legsTodos = useMemo(() => (personal as Personal[]).map(p => p.leg), [personal])
  const { data: ultimasEntregas = [], isFetching: loadingEntregas } = useRopaUltimasEntregas(legsTodos)

  const ultimaEntrega = useMemo(() => {
    const m = new Map<string, RopaEntrega>()
    ultimasEntregas.forEach(e => m.set(`${e.leg}|${e.categoria_id}`, e))
    return m
  }, [ultimasEntregas])

  /** Estado de un trabajador: sin entregas, con algo vencido, o al día. */
  const estadoDe = useMemo(() => (p: Personal): EstadoRopa => {
    let alguna = false
    let vencida = false
    for (const cat of categorias) {
      const ult = ultimaEntrega.get(`${p.leg}|${cat.id}`)
      if (ult) alguna = true
      if (entregaVencida(ult?.fecha_entrega, cat.meses_vencimiento ?? 6)) vencida = true
    }
    if (!alguna) return 'sin-entregas'
    return vencida ? 'vencidos' : 'al-dia'
  }, [categorias, ultimaEntrega])

  // Lista final a paginar. Orden: ACTIVOS PRIMERO (pedido del user), después
  // por vencimiento más próximo — quien tiene una prenda sin entregar va antes
  // que quien la tiene por vencer — y a igualdad, por nombre.
  const trabajadoresFinal = useMemo(() => {
    const base = filtro === 'todos'
      ? trabajadoresBusqueda
      : trabajadoresBusqueda.filter(p => estadoDe(p) === filtro)

    const claves = new Map<string, [string, string]>()
    for (const p of base) {
      let minReal  = '9999-12-31'
      let faltante = false
      for (const cat of categorias) {
        const ult = ultimaEntrega.get(`${p.leg}|${cat.id}`)
        if (!ult) { faltante = true; continue }
        const v = venceEl(ult.fecha_entrega, cat.meses_vencimiento ?? 6)
        if (v !== null && v < minReal) minReal = v
      }
      claves.set(p.leg, [faltante ? '0000-00-00' : minReal, minReal])
    }
    return [...base].sort((a, b) => {
      const activoA = legsActivosSet.has(a.leg) ? 0 : 1
      const activoB = legsActivosSet.has(b.leg) ? 0 : 1
      if (activoA !== activoB) return activoA - activoB
      const [a1, a2] = claves.get(a.leg)!
      const [b1, b2] = claves.get(b.leg)!
      return a1.localeCompare(b1) || a2.localeCompare(b2) || a.nom.localeCompare(b.nom)
    })
  }, [filtro, trabajadoresBusqueda, categorias, ultimaEntrega, estadoDe, legsActivosSet])

  /** Cuántos hay de cada estado en lo que se está mirando (para los chips del filtro). */
  const conteos = useMemo(() => {
    const c: Record<EstadoRopa, number> = { 'sin-entregas': 0, 'vencidos': 0, 'al-dia': 0 }
    for (const p of trabajadoresBusqueda) c[estadoDe(p)]++
    return c
  }, [trabajadoresBusqueda, estadoDe])


  // Página actual
  const paginaPersonal = useMemo(() => {
    const from = (page - 1) * pageSize
    return trabajadoresFinal.slice(from, from + pageSize)
  }, [trabajadoresFinal, page, pageSize])

  function handlePageSizeChange(size: number) {
    setPageSize(size)
    setPage(1)
  }

  function handleDeleteEntrega(id: number) {
    if (!confirm('¿Eliminar esta entrega?')) return
    deleteEntrega(id, {
      onSuccess: () => toast('✓ Eliminada', 'ok'),
      onError:   () => toast('Error al eliminar', 'err'),
    })
  }

  return (
    <div className="flex flex-col gap-4 max-w-4xl mx-auto px-4 py-6">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl tracking-wider text-azul">ROPA DE TRABAJO</h1>
          <p className="text-sm text-gris-dark mt-0.5">
            <b className="text-carbon">{trabajadoresActivos.length}</b> activos de {personal.length}
            {conteos.vencidos > 0 && (
              <span className="ml-2 text-rojo font-bold">· {conteos.vencidos} con algo vencido</span>
            )}
            {conteos['sin-entregas'] > 0 && (
              <span className="ml-2 text-gris-dark">· {conteos['sin-entregas']} sin entregas</span>
            )}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="secondary" size="sm" onClick={() => setModalCats(true)}>
            ⚙️ Categorías
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setModalEntrega('')}
            disabled={!puedeCrear}
            title={sinPermiso(puedeCrear, 'registrar entregas')}
          >
            👕 Registrar entrega
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-3 flex-wrap items-center">
        <input
          type="text"
          autoComplete="off"
          placeholder="Buscar trabajador..."
          value={busqueda}
          onChange={e => { setBusqueda(e.target.value); setPage(1) }}
          className="flex-1 min-w-[180px] px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none focus:border-naranja bg-white"
        />
        {/* Estado: "sin entregas" ya no se mezcla con "vencido" */}
        <div className="flex gap-1 bg-gris rounded-lg p-1">
          {(['todos', 'vencidos', 'al-dia', 'sin-entregas'] as const).map(f => (
            <button
              key={f}
              type="button"
              onClick={() => { setFiltro(f); setPage(1) }}
              className={`text-xs font-bold px-2.5 py-1.5 rounded-md transition-colors whitespace-nowrap ${
                filtro === f ? 'bg-white shadow-sm text-carbon' : 'text-gris-dark hover:text-carbon'
              }`}
            >
              {FILTRO_LABEL[f]}
              {f !== 'todos' && <span className="ml-1 opacity-60 tabular-nums">{conteos[f]}</span>}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => { setSoloActivos(v => !v); setPage(1) }}
          title="Los inactivos son los que no cargaron horas en las últimas 3 semanas"
          className={`text-xs font-bold px-3 py-2 rounded-lg border-[1.5px] transition-all whitespace-nowrap ${
            soloActivos
              ? 'bg-verde-light border-verde text-verde'
              : 'bg-white border-gris-mid text-gris-dark hover:border-verde hover:text-verde'
          }`}
        >
          {soloActivos ? '✓ Solo activos' : 'Solo activos'}
        </button>
      </div>

      {/* Tabla compacta por trabajador */}
      {trabajadoresFinal.length === 0 ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-gris-dark text-sm">
          {busqueda || filtro !== 'todos' || soloActivos ? 'No se encontraron trabajadores con esos filtros.' : 'No hay trabajadores cargados.'}
        </div>
      ) : (
        <>
          <div className={`bg-white rounded-card shadow-card overflow-x-auto transition-opacity ${loadingEntregas ? 'opacity-60' : ''}`}>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="bg-azul text-white text-xs font-bold px-4 py-3 text-left uppercase tracking-wide">Trabajador</th>
                  <th className="bg-azul text-white text-xs font-bold px-4 py-3 text-left uppercase tracking-wide">Ropa de trabajo</th>
                  <th className="bg-azul text-white text-xs font-bold px-4 py-3 text-right uppercase tracking-wide w-28"></th>
                </tr>
              </thead>
              <tbody>
                {paginaPersonal.map(p => {
                  const items = categorias.map(cat => {
                    const ult     = ultimaEntrega.get(`${p.leg}|${cat.id}`)
                    const vence   = ult ? venceEl(ult.fecha_entrega, cat.meses_vencimiento ?? 6) : null
                    const vencido = entregaVencida(ult?.fecha_entrega, cat.meses_vencimiento ?? 6)
                    // Una entrega con fecha futura nunca vence: la prenda queda
                    // "al día" para siempre y nadie se entera. Suele ser una
                    // fecha mal tipeada.
                    const futura  = !!ult && ult.fecha_entrega > hoy()
                    return { cat, ult, vence, vencido, futura }
                  })
                  const tieneAlgunVencido = items.some(i => i.vencido)
                  const activo = legsActivosSet.has(p.leg)
                  const talles = tallesDe(p)

                  return (
                    <tr key={p.leg} className={`border-b border-gris last:border-0 hover:bg-gris/30 transition-colors border-l-4 ${tieneAlgunVencido ? 'border-l-rojo' : 'border-l-verde'} ${activo ? '' : 'bg-gris/20'}`}>
                      {/* Nombre + talles */}
                      <td className="px-4 py-3 align-middle">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-sm text-carbon leading-tight">{p.nom}</span>
                          {!activo && (
                            <span
                              className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-gris text-gris-dark"
                              title="No cargó horas en las últimas 3 semanas"
                            >
                              sin horas
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-gris-dark font-mono">Leg. {p.leg}</div>
                        {/* El talle es lo que hace falta para entregar; estaba en el
                            legajo y no se veía acá. */}
                        {talles ? (
                          <div className="text-[11px] text-azul font-semibold mt-0.5">{talles}</div>
                        ) : (
                          <div className="text-[11px] text-gris-mid italic mt-0.5">sin talles cargados</div>
                        )}
                      </td>

                      {/* Categorías en línea */}
                      <td className="px-4 py-3 align-middle">
                        <div className="flex flex-wrap gap-1.5">
                          {items.map(({ cat, ult, vence, vencido, futura }) => {
                            return (
                              <span
                                key={cat.id}
                                title={ult
                                  ? `${cat.nombre}: entregado ${fmtFecha(ult.fecha_entrega)} · ${vence ? `${vencido ? 'venció' : 'vence'} ${fmtFecha(vence)}` : 'sin vencimiento'}${futura ? ' — ⚠ la fecha de entrega es futura, revisala' : ''}`
                                  : `${cat.nombre}: sin entregas`}
                                className={`
                                  inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-bold border
                                  ${futura
                                    ? 'bg-amarillo-light border-[#E0A800]/40 text-[#7A5500]'
                                    : vencido
                                      ? ult ? 'bg-rojo-light border-rojo/30 text-rojo' : 'bg-gris border-gris-mid text-gris-dark'
                                      : 'bg-verde-light border-verde/30 text-verde'
                                  }
                                `}
                              >
                                <span>{futura ? '⚠' : (cat.icono ?? '📦')}</span>
                                {ult ? (
                                  <span className="grid grid-cols-[auto_auto] gap-x-1.5 leading-tight text-left items-baseline">
                                    <span className="font-semibold opacity-70 uppercase text-[9px] tracking-wide">Entrega</span>
                                    <span className="whitespace-nowrap">{fmtCorta(ult.fecha_entrega)}</span>
                                    <span className="font-semibold opacity-70 uppercase text-[9px] tracking-wide">{vencido ? 'Venció' : 'Vence'}</span>
                                    <span className="whitespace-nowrap">{vence ? fmtCorta(vence) : 'nunca'}</span>
                                  </span>
                                ) : '—'}
                              </span>
                            )
                          })}
                        </div>
                      </td>

                      {/* Acciones */}
                      <td className="px-4 py-3 align-middle">
                        <div className="flex gap-1.5 justify-end">
                          <button
                            onClick={() => setModalHistorial(p.leg)}
                            className="text-xs font-bold px-2 py-1 rounded-lg bg-azul-light text-azul hover:bg-azul hover:text-white transition-colors"
                            title="Ver historial"
                          >
                            📋
                          </button>
                          <button
                            onClick={() => setModalEntrega(p.leg)}
                            disabled={!puedeCrear}
                            className={`text-xs font-bold px-2 py-1 rounded-lg bg-naranja-light text-naranja-dark hover:bg-naranja hover:text-white transition-colors ${BTN_DISABLED}`}
                            title={sinPermiso(puedeCrear, 'registrar entregas') ?? 'Registrar entrega'}
                          >
                            ＋
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <Pagination
            page={page}
            total={trabajadoresFinal.length}
            pageSize={pageSize}
            onChange={p => { setPage(p); (document.querySelector('main') ?? window).scrollTo({ top: 0, behavior: 'smooth' }) }}
            onPageSizeChange={handlePageSizeChange}
          />
        </>
      )}

      {/* Modales */}
      {modalEntrega !== null && (
        <ModalEntrega
          open
          legInicial={modalEntrega}
          personal={personal as Personal[]}
          legsActivos={legsActivosSet}
          onClose={() => setModalEntrega(null)}
        />
      )}
      {modalHistorial !== null && (
        <ModalHistorial
          open
          onClose={() => setModalHistorial(null)}
          leg={modalHistorial}
          nombre={nombreMap.get(modalHistorial) ?? modalHistorial}
          catMap={catMap}
          puedeElim={!!puedeEliminar}
          onDelete={handleDeleteEntrega}
        />
      )}
      {modalCats && (
        <ModalCategorias
          open
          onClose={() => setModalCats(false)}
          puedeCrear={!!puedeCrear}
          puedeEditar={!!puedeEditar}
          puedeEliminar={!!puedeEliminar}
        />
      )}
    </div>
  )
}
