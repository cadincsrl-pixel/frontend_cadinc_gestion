'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  useRopaCategorias,
  useRopaUltimasEntregas,
  useRopaEntregasPorLeg,
  useCreateRopaEntrega,
  useDeleteRopaEntrega,
  useCreateRopaCategoria,
  useUpdateRopaCategoria,
  useDeleteRopaCategoria,
} from '../hooks/useRopa'
import { usePersonal } from '../hooks/usePersonal'
import { toISO, getViernes } from '@/lib/utils/dates'
import { apiGet }     from '@/lib/api/client'
import { Button }     from '@/components/ui/Button'
import { Modal }      from '@/components/ui/Modal'
import { Input }      from '@/components/ui/Input'
import { Combobox }   from '@/components/ui/Combobox'
import { Pagination } from '@/components/ui/Pagination'
import { useToast }   from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import type { Hora, Personal, RopaEntrega } from '@/types/domain.types'

const DEFAULT_PAGE_SIZE = 12

function hoy() { return toISO(new Date()) }

function semKey(offsetWeeks: number): string {
  const d = new Date()
  d.setDate(d.getDate() - offsetWeeks * 7)
  return toISO(getViernes(d))
}

function diffMeses(fechaISO: string): number {
  const desde = new Date(fechaISO + 'T12:00:00')
  const ahora = new Date()
  return (ahora.getFullYear() - desde.getFullYear()) * 12 +
    (ahora.getMonth() - desde.getMonth()) +
    (ahora.getDate() < desde.getDate() ? -1 : 0)
}

function fmtFecha(s: string) {
  const [y, m, d] = s.split('-')
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
  return `${d} ${meses[parseInt(m!) - 1]} ${y}`
}

function fmtCorta(s: string) {
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y!.slice(2)}`
}

// Fecha en que vence una entrega: fecha_entrega + meses_vencimiento de la categoría.
function fechaVencimiento(fechaISO: string, meses: number): string {
  const d = new Date(fechaISO + 'T12:00:00')
  d.setMonth(d.getMonth() + meses)
  return toISO(d)
}

function estaVencido(leg: string, catId: number, ultimaMap: Map<string, RopaEntrega>, mesesVencimiento: number): boolean {
  const ult = ultimaMap.get(`${leg}|${catId}`)
  if (!ult) return true
  return diffMeses(ult.fecha_entrega) >= mesesVencimiento
}

// ── Modal nueva entrega ──────────────────────────────────────────────────────
interface ModalEntregaProps {
  open:       boolean
  legInicial: string
  // Solo trabajadores activos: a los inactivos no se les entrega ropa.
  personalActivo: Personal[]
  onClose:    () => void
}

function ModalEntrega({ open, legInicial, personalActivo, onClose }: ModalEntregaProps) {
  const toast = useToast()
  const { data: categorias = [] } = useRopaCategorias()
  const { mutate: create, isPending } = useCreateRopaEntrega()

  const [leg,    setLeg]    = useState(legInicial)
  const [catIds, setCatIds] = useState<number[]>([])
  const [fecha,  setFecha]  = useState(hoy)
  const [obs,    setObs]    = useState('')
  const [saving, setSaving] = useState(false)

  const opPersonal = useMemo(() =>
    personalActivo.map((p: Personal) => ({ value: p.leg, label: p.nom, sub: `Leg. ${p.leg}` })),
    [personalActivo]
  )

  function toggleCat(id: number) {
    setCatIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function handleSubmit() {
    if (!leg)           { toast('Seleccioná un trabajador', 'err'); return }
    if (!catIds.length) { toast('Seleccioná al menos un elemento', 'err'); return }
    setSaving(true)
    let errored = false
    for (const catId of catIds) {
      await new Promise<void>(resolve => {
        create(
          { leg, categoria_id: catId, fecha_entrega: fecha, obs: obs || null },
          { onSuccess: () => resolve(), onError: () => { errored = true; resolve() } }
        )
      })
    }
    setSaving(false)
    if (errored) { toast('Error al guardar algún elemento', 'err'); return }
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
function ModalCategorias({ open, onClose }: { open: boolean; onClose: () => void }) {
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
                  className="text-[11px] font-bold text-azul-mid bg-azul-light px-2 py-0.5 rounded hover:bg-azul hover:text-white transition-colors"
                >
                  ⏱ {c.meses_vencimiento ?? 6}m
                </button>
              )}
              <button onClick={() => handleDelete(c.id, c.nombre)} className="text-gris-mid hover:text-rojo text-xs transition-colors">🗑</button>
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
          <Button variant="primary" size="sm" loading={creando} onClick={handleCreate}>＋ Agregar</Button>
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
                  const vence     = cat ? fechaVencimiento(e.fecha_entrega, cat.meses_vencimiento) : null
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
                      {puedeElim && (
                        <button onClick={() => onDelete(e.id)} className="text-gris-mid hover:text-rojo text-xs transition-colors">🗑</button>
                      )}
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
  const { puedeCrear, puedeEliminar } = usePermisos('tarja')
  const { data: categorias = [] } = useRopaCategorias()
  const { data: personal   = [] } = usePersonal()
  const { mutate: deleteEntrega } = useDeleteRopaEntrega()

  const { data: todasHoras = [] } = useQuery({
    queryKey: ['horas', 'all'],
    queryFn: () => apiGet<Hora[]>('/api/horas/all'),
  })

  const [modalEntrega,   setModalEntrega]   = useState<string | null>(null)
  const [modalHistorial, setModalHistorial] = useState<string | null>(null)
  const [modalCats,      setModalCats]      = useState(false)
  const [soloVencidos,   setSoloVencidos]   = useState(false)
  const [busqueda,       setBusqueda]       = useState('')
  const [page,           setPage]           = useState(1)
  const [pageSize,       setPageSize]       = useState(DEFAULT_PAGE_SIZE)

  // Trabajadores activos: horas en las últimas 3 semanas u override manual.
  // Mismo criterio que el badge "Activo" de PersonalPage (esActivo) para que
  // ambas pantallas muestren la misma gente. A los inactivos no se les da ropa.
  const semCorte3 = semKey(3)
  const trabajadoresActivos = useMemo(() => {
    const legsConHoras = new Set(
      todasHoras
        .filter(h => toISO(getViernes(new Date(h.fecha + 'T12:00:00'))) >= semCorte3)
        .map(h => h.leg)
    )
    return personal.filter((p: Personal) =>
      p.activo_override === true ||
      (p.activo_override !== false && legsConHoras.has(p.leg))
    ) as Personal[]
  }, [todasHoras, personal, semCorte3])

  // Filtrar por búsqueda
  const trabajadoresBusqueda = useMemo(() =>
    !busqueda
      ? trabajadoresActivos
      : trabajadoresActivos.filter(p =>
          p.nom.toLowerCase().includes(busqueda.toLowerCase()) ||
          p.leg.includes(busqueda)
        ),
    [trabajadoresActivos, busqueda]
  )

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
  const legsActivos = useMemo(() => trabajadoresActivos.map(p => p.leg), [trabajadoresActivos])
  const { data: ultimasEntregas = [], isFetching: loadingEntregas } = useRopaUltimasEntregas(legsActivos)

  const ultimaEntrega = useMemo(() => {
    const m = new Map<string, RopaEntrega>()
    ultimasEntregas.forEach(e => m.set(`${e.leg}|${e.categoria_id}`, e))
    return m
  }, [ultimasEntregas])

  // Lista final a paginar: filtro de vencidos (si aplica) + orden por
  // vencimiento más próximo. Quien tiene una categoría sin entrega (o nunca
  // recibió nada) va primero; los empates se resuelven por el vencimiento
  // real más cercano y después por nombre.
  const trabajadoresFinal = useMemo(() => {
    const base = !soloVencidos
      ? trabajadoresBusqueda
      : trabajadoresBusqueda.filter(p =>
          categorias.some(cat => estaVencido(p.leg, cat.id, ultimaEntrega, cat.meses_vencimiento ?? 6))
        )

    const claves = new Map<string, [string, string]>()
    for (const p of base) {
      let minReal  = '9999-12-31'
      let faltante = false
      for (const cat of categorias) {
        const ult = ultimaEntrega.get(`${p.leg}|${cat.id}`)
        if (!ult) { faltante = true; continue }
        const v = fechaVencimiento(ult.fecha_entrega, cat.meses_vencimiento ?? 6)
        if (v < minReal) minReal = v
      }
      claves.set(p.leg, [faltante ? '0000-00-00' : minReal, minReal])
    }
    return [...base].sort((a, b) => {
      const [a1, a2] = claves.get(a.leg)!
      const [b1, b2] = claves.get(b.leg)!
      return a1.localeCompare(b1) || a2.localeCompare(b2) || a.nom.localeCompare(b.nom)
    })
  }, [soloVencidos, trabajadoresBusqueda, categorias, ultimaEntrega])

  // Recuento de vencidos sobre todos los activos (para el badge del header)
  const vencidosCount = soloVencidos ? trabajadoresFinal.length : 0

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
            {trabajadoresActivos.length} trabajadores activos
            {soloVencidos && vencidosCount > 0 && (
              <span className="ml-2 text-rojo font-bold">· {vencidosCount} con vencimientos</span>
            )}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="secondary" size="sm" onClick={() => setModalCats(true)}>
            ⚙️ Categorías
          </Button>
          {puedeCrear && (
            <Button variant="primary" size="sm" onClick={() => setModalEntrega('')}>
              👕 Registrar entrega
            </Button>
          )}
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
        <button
          onClick={() => { setSoloVencidos(p => !p); setPage(1) }}
          className={`
            text-xs font-bold px-3 py-2 rounded-lg border-[1.5px] transition-all
            ${soloVencidos
              ? 'bg-rojo-light border-rojo text-rojo'
              : 'bg-white border-gris-mid text-gris-dark hover:border-rojo hover:text-rojo'
            }
          `}
        >
          🔴 Solo vencidos
        </button>
      </div>

      {/* Tabla compacta por trabajador */}
      {trabajadoresFinal.length === 0 ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-gris-dark text-sm">
          {busqueda || soloVencidos ? 'No se encontraron trabajadores.' : 'No hay trabajadores activos con registros.'}
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
                    const meses   = ult ? diffMeses(ult.fecha_entrega) : null
                    const vencido = meses === null || meses >= (cat.meses_vencimiento ?? 6)
                    return { cat, ult, meses, vencido }
                  })
                  const tieneAlgunVencido = items.some(i => i.vencido)

                  return (
                    <tr key={p.leg} className={`border-b border-gris last:border-0 hover:bg-gris/30 transition-colors border-l-4 ${tieneAlgunVencido ? 'border-l-rojo' : 'border-l-verde'}`}>
                      {/* Nombre */}
                      <td className="px-4 py-3 align-middle">
                        <div className="font-bold text-sm text-carbon leading-tight">{p.nom}</div>
                        <div className="text-[11px] text-gris-dark font-mono">Leg. {p.leg}</div>
                      </td>

                      {/* Categorías en línea */}
                      <td className="px-4 py-3 align-middle">
                        <div className="flex flex-wrap gap-1.5">
                          {items.map(({ cat, ult, meses, vencido }) => {
                            const vence = ult ? fechaVencimiento(ult.fecha_entrega, cat.meses_vencimiento ?? 6) : null
                            return (
                              <span
                                key={cat.id}
                                title={ult
                                  ? `${cat.nombre}: entregado ${fmtFecha(ult.fecha_entrega)} (${meses}m) · ${vencido ? 'venció' : 'vence'} ${fmtFecha(vence!)}`
                                  : `${cat.nombre}: sin entregas`}
                                className={`
                                  inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold border
                                  ${vencido
                                    ? ult ? 'bg-rojo-light border-rojo/30 text-rojo' : 'bg-gris border-gris-mid text-gris-dark'
                                    : 'bg-verde-light border-verde/30 text-verde'
                                  }
                                `}
                              >
                                <span>{cat.icono ?? '📦'}</span>
                                {ult ? (
                                  <>
                                    {fmtCorta(ult.fecha_entrega)}
                                    <span className="font-semibold opacity-75">
                                      · {vencido ? 'venció' : 'vence'} {fmtCorta(vence!)}
                                    </span>
                                  </>
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
                          {puedeCrear && (
                            <button
                              onClick={() => setModalEntrega(p.leg)}
                              className="text-xs font-bold px-2 py-1 rounded-lg bg-naranja-light text-naranja-dark hover:bg-naranja hover:text-white transition-colors"
                              title="Registrar entrega"
                            >
                              ＋
                            </button>
                          )}
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
            onChange={p => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
            onPageSizeChange={handlePageSizeChange}
          />
        </>
      )}

      {/* Modales */}
      {modalEntrega !== null && (
        <ModalEntrega
          open
          legInicial={modalEntrega}
          personalActivo={trabajadoresActivos}
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
      {modalCats && <ModalCategorias open onClose={() => setModalCats(false)} />}
    </div>
  )
}
