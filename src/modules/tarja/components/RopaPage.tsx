'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRopaCategorias, useRopaEntregas, useCreateRopaEntrega, useDeleteRopaEntrega, useCreateRopaCategoria, useDeleteRopaCategoria } from '../hooks/useRopa'
import { usePersonal } from '../hooks/usePersonal'
import { toISO, getViernes } from '@/lib/utils/dates'
import { apiGet } from '@/lib/api/client'
import { Button }     from '@/components/ui/Button'
import { Modal }      from '@/components/ui/Modal'
import { Input }      from '@/components/ui/Input'
import { Combobox }   from '@/components/ui/Combobox'
import { Pagination } from '@/components/ui/Pagination'
import { useToast }   from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import type { Hora, Personal, RopaEntrega } from '@/types/domain.types'

const MESES_VENCIMIENTO = 6

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

// ── Modal nueva entrega ──────────────────────────────────────────────────────
interface ModalEntregaProps {
  open:        boolean
  legInicial:  string
  onClose:     () => void
}

function ModalEntrega({ open, legInicial, onClose }: ModalEntregaProps) {
  const toast = useToast()
  const { data: categorias = [] } = useRopaCategorias()
  const { data: personal   = [] } = usePersonal()
  const { mutate: create, isPending } = useCreateRopaEntrega()

  const [leg,      setLeg]      = useState(legInicial)
  const [catIds,   setCatIds]   = useState<number[]>([])
  const [fecha,    setFecha]    = useState(hoy)
  const [obs,      setObs]      = useState('')
  const [saving,   setSaving]   = useState(false)

  const opPersonal = useMemo(() =>
    personal.map((p: Personal) => ({ value: p.leg, label: p.nom, sub: `Leg. ${p.leg}` })),
    [personal]
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

        {/* Multi-select elementos */}
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
  const { mutate: eliminar }                       = useDeleteRopaCategoria()

  const [nombre, setNombre] = useState('')
  const [icono,  setIcono]  = useState('')

  function handleCreate() {
    if (!nombre.trim()) { toast('Ingresá un nombre', 'err'); return }
    crear(
      { nombre: nombre.trim(), icono: icono.trim() || undefined },
      {
        onSuccess: () => { toast('✓ Categoría creada', 'ok'); setNombre(''); setIcono('') },
        onError:   () => toast('Error al crear', 'err'),
      }
    )
  }

  function handleDelete(id: number, nombre: string) {
    if (!confirm(`¿Eliminar la categoría "${nombre}"?`)) return
    eliminar(id, {
      onSuccess: () => toast('✓ Eliminada', 'ok'),
      onError:   () => toast('Error al eliminar', 'err'),
    })
  }

  return (
    <Modal open={open} onClose={onClose} title="⚙️ CATEGORÍAS DE ROPA" width="max-w-sm"
      footer={<Button variant="secondary" onClick={onClose}>Cerrar</Button>}
    >
      <div className="flex flex-col gap-4">
        {/* Lista */}
        <div className="flex flex-col gap-1">
          {categorias.map(c => (
            <div key={c.id} className="flex items-center justify-between px-3 py-2 bg-gris rounded-lg">
              <span className="text-sm font-semibold text-carbon">{c.icono} {c.nombre}</span>
              <button onClick={() => handleDelete(c.id, c.nombre)} className="text-gris-mid hover:text-rojo text-xs transition-colors">🗑</button>
            </div>
          ))}
        </div>
        {/* Nueva */}
        <div className="border-t border-gris-mid pt-3 flex flex-col gap-2">
          <div className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">Nueva categoría</div>
          <div className="flex gap-2">
            <Input placeholder="Emoji (ej: 🧤)" value={icono} onChange={e => setIcono(e.target.value)} className="w-20 flex-shrink-0" />
            <Input placeholder="Nombre (ej: Guantes)" value={nombre} onChange={e => setNombre(e.target.value)} className="flex-1" />
          </div>
          <Button variant="primary" size="sm" loading={creando} onClick={handleCreate}>＋ Agregar</Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Modal historial de entregas de un trabajador ─────────────────────────────
interface ModalHistorialProps {
  open:      boolean
  onClose:   () => void
  leg:       string
  nombre:    string
  entregas:  RopaEntrega[]
  catMap:    Map<number, { nombre: string; icono: string | null }>
  puedeElim: boolean
  onDelete:  (id: number) => void
}

function ModalHistorial({ open, onClose, leg, nombre, entregas, catMap, puedeElim, onDelete }: ModalHistorialProps) {
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
                {movsOrdenados.map((e, idx) => (
                  <div key={e.id} className={`flex items-center justify-between px-3 py-2 rounded-lg ${idx === 0 ? 'bg-azul-light' : 'bg-gris'}`}>
                    <div>
                      <div className="text-sm font-semibold text-carbon">{fmtFecha(e.fecha_entrega)}</div>
                      {e.obs && <div className="text-[11px] text-gris-dark italic">{e.obs}</div>}
                      {idx === 0 && <span className="text-[10px] font-bold text-azul uppercase tracking-wide">Última entrega</span>}
                    </div>
                    {puedeElim && (
                      <button onClick={() => onDelete(e.id)} className="text-gris-mid hover:text-rojo text-xs transition-colors">🗑</button>
                    )}
                  </div>
                ))}
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
  const { data: entregas   = [] } = useRopaEntregas()
  const { data: personal   = [] } = usePersonal()
  const { mutate: deleteEntrega } = useDeleteRopaEntrega()

  const { data: todasHoras = [] } = useQuery({
    queryKey: ['horas', 'all'],
    queryFn: () => apiGet<Hora[]>('/api/horas/all'),
  })

  const [modalEntrega,    setModalEntrega]    = useState<string | null>(null) // leg
  const [modalHistorial,  setModalHistorial]  = useState<string | null>(null) // leg
  const [modalCats,       setModalCats]       = useState(false)
  const [soloVencidos,    setSoloVencidos]    = useState(false)
  const [busqueda,        setBusqueda]        = useState('')
  const [page,            setPage]            = useState(1)
  const PAGE_SIZE = 10

  // Trabajadores activos: tuvieron horas en las últimas 3 semanas o tienen activo_override=true
  const semCorte3 = semKey(3)
  const semCorte2 = semKey(2)

  const legsActivos = useMemo(() => {
    const legs3sem = new Set(
      todasHoras
        .filter(h => toISO(getViernes(new Date(h.fecha + 'T12:00:00'))) >= semCorte3)
        .map(h => h.leg)
    )
    return new Set(
      personal
        .filter((p: Personal) =>
          p.activo_override === true ||
          (p.activo_override !== false && legs3sem.has(p.leg))
        )
        .map((p: Personal) => p.leg)
    )
  }, [todasHoras, personal, semCorte3])

  // Solo activos según horas últimas 2 semanas (para mostrar en ropa)
  const legsActivos2sem = useMemo(() => {
    const legs = new Set(
      todasHoras
        .filter(h => toISO(getViernes(new Date(h.fecha + 'T12:00:00'))) >= semCorte2)
        .map(h => h.leg)
    )
    // Incluir también los con override=true
    personal.forEach((p: Personal) => { if (p.activo_override === true) legs.add(p.leg) })
    return legs
  }, [todasHoras, personal, semCorte2])

  const catMap = useMemo(() => {
    const m = new Map<number, { nombre: string; icono: string | null }>()
    categorias.forEach(c => m.set(c.id, { nombre: c.nombre, icono: c.icono }))
    return m
  }, [categorias])

  const nombreMap = useMemo(() => {
    const m = new Map<string, string>()
    personal.forEach((p: Personal) => m.set(p.leg, p.nom))
    return m
  }, [personal])

  // Índice: última entrega por (leg, categoria_id)
  const ultimaEntrega = useMemo(() => {
    const m = new Map<string, RopaEntrega>()
    // entregas ya vienen ordenadas desc por fecha_entrega
    ;[...entregas].reverse().forEach(e => {
      m.set(`${e.leg}|${e.categoria_id}`, e)
    })
    return m
  }, [entregas])

  // Armar lista de trabajadores activos con su estado de ropa
  const trabajadores = useMemo(() => {
    const lista = personal
      .filter((p: Personal) => legsActivos2sem.has(p.leg))
      .filter((p: Personal) =>
        !busqueda ||
        p.nom.toLowerCase().includes(busqueda.toLowerCase()) ||
        p.leg.includes(busqueda)
      )
      .map((p: Personal) => {
        const items = categorias.map(cat => {
          const ult = ultimaEntrega.get(`${p.leg}|${cat.id}`)
          const meses = ult ? diffMeses(ult.fecha_entrega) : null
          const vencido = meses === null || meses >= MESES_VENCIMIENTO
          return { cat, ult, meses, vencido }
        })
        const tieneAlgunVencido = items.some(i => i.vencido)
        return { p, items, tieneAlgunVencido }
      })

    if (soloVencidos) return lista.filter(t => t.tieneAlgunVencido)
    // Vencidos primero
    return lista.sort((a, b) => Number(b.tieneAlgunVencido) - Number(a.tieneAlgunVencido))
  }, [personal, legsActivos2sem, categorias, ultimaEntrega, busqueda, soloVencidos])

  // Reset page when filters change
  const trabajadoresPag = useMemo(() => {
    setPage(1)
    return trabajadores
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda, soloVencidos])

  const pagina = trabajadores.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const vencidosCount = trabajadores.filter(t => t.tieneAlgunVencido).length

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
            {trabajadores.length} trabajadores activos
            {vencidosCount > 0 && (
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
          placeholder="Buscar trabajador..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="flex-1 min-w-[180px] px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none focus:border-naranja bg-white"
        />
        <button
          onClick={() => setSoloVencidos(p => !p)}
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

      {/* Cards por trabajador */}
      {trabajadores.length === 0 ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-gris-dark text-sm">
          {busqueda ? 'No se encontraron trabajadores.' : 'No hay trabajadores activos con registros.'}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {pagina.map(({ p, items, tieneAlgunVencido }) => (
            <div
              key={p.leg}
              className={`bg-white rounded-card shadow-card border-l-4 ${tieneAlgunVencido ? 'border-rojo' : 'border-verde'}`}
            >
              <div className="p-4">
                {/* Cabecera trabajador */}
                <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-azul">{p.nom}</span>
                    <span className="text-[10px] font-mono bg-gris px-1.5 py-0.5 rounded text-gris-dark">Leg. {p.leg}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${tieneAlgunVencido ? 'bg-rojo-light text-rojo' : 'bg-verde-light text-verde'}`}>
                      {tieneAlgunVencido ? '🔴 Vencido' : '🟢 Al día'}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setModalHistorial(p.leg)}
                      className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-azul-light text-azul hover:bg-azul hover:text-white transition-colors"
                    >
                      📋 Historial
                    </button>
                    {puedeCrear && (
                      <button
                        onClick={() => setModalEntrega(p.leg)}
                        className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-naranja-light text-naranja-dark hover:bg-naranja hover:text-white transition-colors"
                      >
                        ＋ Entrega
                      </button>
                    )}
                  </div>
                </div>

                {/* Items de ropa */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {items.map(({ cat, ult, meses, vencido }) => (
                    <div
                      key={cat.id}
                      className={`
                        flex items-center gap-2 px-3 py-2 rounded-lg border
                        ${vencido
                          ? ult ? 'bg-rojo-light border-rojo/30' : 'bg-gris border-gris-mid'
                          : 'bg-verde-light border-verde/30'
                        }
                      `}
                    >
                      <span className="text-base flex-shrink-0">{cat.icono ?? '📦'}</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-carbon truncate">{cat.nombre}</div>
                        {ult ? (
                          <>
                            <div className="text-[11px] text-gris-dark">{fmtFecha(ult.fecha_entrega)}</div>
                            <div className={`text-[10px] font-bold ${vencido ? 'text-rojo' : 'text-verde'}`}>
                              {vencido ? `⚠ ${meses}m — vencido` : `✓ ${meses}m`}
                            </div>
                          </>
                        ) : (
                          <div className="text-[11px] text-gris-mid italic">Sin entregas</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {trabajadores.length > PAGE_SIZE && (
        <Pagination
          page={page}
          total={trabajadores.length}
          pageSize={PAGE_SIZE}
          onChange={p => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
        />
      )}

      {/* Modales */}
      {modalEntrega !== null && (
        <ModalEntrega
          open
          legInicial={modalEntrega}
          onClose={() => setModalEntrega(null)}
        />
      )}
      {modalHistorial !== null && (
        <ModalHistorial
          open
          onClose={() => setModalHistorial(null)}
          leg={modalHistorial}
          nombre={nombreMap.get(modalHistorial) ?? modalHistorial}
          entregas={entregas.filter(e => e.leg === modalHistorial)}
          catMap={catMap}
          puedeElim={!!puedeEliminar}
          onDelete={handleDeleteEntrega}
        />
      )}
      {modalCats && <ModalCategorias open onClose={() => setModalCats(false)} />}
    </div>
  )
}
