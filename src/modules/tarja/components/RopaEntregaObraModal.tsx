'use client'

/**
 * Entrega por obra (2026-09-23).
 *
 * La ropa se reparte en la obra, a toda la cuadrilla junta: antes había que
 * abrir el modal trabajador por trabajador. Acá se elige la obra, aparecen los
 * activos que trabajaron ahí en su última semana con horas, con lo que les
 * falta ya tildado (lo que nunca recibieron o está vencido) y el talle de su
 * ficha, y se registra todo en un solo request (todo o nada).
 */
import { useMemo, useState } from 'react'
import { Button }   from '@/components/ui/Button'
import { Modal }    from '@/components/ui/Modal'
import { Input }    from '@/components/ui/Input'
import { Combobox } from '@/components/ui/Combobox'
import { useToast } from '@/components/ui/Toast'
import { toISO } from '@/lib/utils/dates'
import { prendasQueLeFaltan, talleDeFicha } from '@/lib/utils/ropa'
import { useObras } from '../hooks/useObras'
import { useRopaCategorias, useCreateRopaEntregasTanda } from '../hooks/useRopa'
import type { ActividadLeg, Personal, RopaEntrega } from '@/types/domain.types'

/** 2026-03-15 → 15/03/26 */
function fmtCorta(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y!.slice(2)}`
}

/** Por trabajador: categoría → talle. Estar en el mapa = tildada. */
type Seleccion = Record<string, Record<number, string>>

interface Props {
  open:          boolean
  onClose:       () => void
  personal:      Personal[]
  actividad:     ActividadLeg[]
  legsActivos:   ReadonlySet<string>
  ultimaEntrega: (leg: string, catId: number) => string | null | undefined
  onConstancia:  (hojas: { p: Personal; entregas: RopaEntrega[] }[], obra: string) => void
}

export function ModalEntregaObra({ open, onClose, personal, actividad, legsActivos, ultimaEntrega, onConstancia }: Props) {
  const toast = useToast()
  const hoy = toISO(new Date())
  const { data: obras = [] } = useObras('tarja')
  const { data: categorias = [] } = useRopaCategorias()
  const { mutateAsync: crearTanda, isPending } = useCreateRopaEntregasTanda()

  const [obraCod,  setObraCod]  = useState('')
  const [fecha,    setFecha]    = useState(hoy)
  const [obs,      setObs]      = useState('')
  const [imprimir, setImprimir] = useState(true)
  const [sel,      setSel]      = useState<Seleccion>({})

  const personaDe = useMemo(() => new Map(personal.map(p => [p.leg, p])), [personal])

  /** Activos por obra, según las obras de su última semana con horas. */
  const porObra = useMemo(() => {
    const m = new Map<string, Personal[]>()
    for (const a of actividad) {
      const p = personaDe.get(a.leg)
      if (!p || !legsActivos.has(a.leg)) continue
      for (const cod of a.obras_ultima_semana ?? []) {
        if (!m.has(cod)) m.set(cod, [])
        m.get(cod)!.push(p)
      }
    }
    for (const lista of m.values()) lista.sort((a, b) => a.nom.localeCompare(b.nom))
    return m
  }, [actividad, personaDe, legsActivos])

  const opObras = useMemo(() => obras
    .filter(o => porObra.has(o.cod))
    .map(o => ({ value: o.cod, label: o.nom, sub: `${porObra.get(o.cod)!.length} trabajadores` }))
    .sort((a, b) => a.label.localeCompare(b.label)), [obras, porObra])

  const trabajadores = porObra.get(obraCod) ?? []
  const obraNom = obras.find(o => o.cod === obraCod)?.nom ?? obraCod

  /** Al elegir la obra, se tilda lo que le falta a cada uno, con el talle de su ficha. */
  function elegirObra(cod: string) {
    setObraCod(cod)
    const nueva: Seleccion = {}
    for (const p of porObra.get(cod) ?? []) {
      const faltan = prendasQueLeFaltan(p.leg, categorias, ultimaEntrega, hoy)
      nueva[p.leg] = Object.fromEntries(faltan.map(id => [id, talleDeFicha(p, categorias.find(c => c.id === id)?.talle_de)]))
    }
    setSel(nueva)
  }

  function toggle(p: Personal, catId: number) {
    setSel(prev => {
      const suyo = { ...(prev[p.leg] ?? {}) }
      if (catId in suyo) delete suyo[catId]
      else suyo[catId] = talleDeFicha(p, categorias.find(c => c.id === catId)?.talle_de)
      return { ...prev, [p.leg]: suyo }
    })
  }

  function setTalle(leg: string, catId: number, talle: string) {
    setSel(prev => ({ ...prev, [leg]: { ...(prev[leg] ?? {}), [catId]: talle } }))
  }

  /** Toda la columna de una prenda: si falta alguno, la tilda entera; si no, la destilda. */
  function toggleColumna(catId: number) {
    const todos = trabajadores.every(p => catId in (sel[p.leg] ?? {}))
    setSel(prev => {
      const n: Seleccion = { ...prev }
      for (const p of trabajadores) {
        const suyo = { ...(n[p.leg] ?? {}) }
        if (todos) delete suyo[catId]
        else if (!(catId in suyo)) suyo[catId] = talleDeFicha(p, categorias.find(c => c.id === catId)?.talle_de)
        n[p.leg] = suyo
      }
      return n
    })
  }

  const entregas = trabajadores
    .map(p => ({
      leg: p.leg,
      items: Object.entries(sel[p.leg] ?? {}).map(([id, talle]) => ({ categoria_id: Number(id), cantidad: 1, talle })),
    }))
    .filter(e => e.items.length > 0)
  const prendas = entregas.reduce((n, e) => n + e.items.length, 0)

  async function guardar() {
    if (!entregas.length) { toast('No hay nada tildado para entregar', 'err'); return }
    if (fecha > hoy)      { toast('No se puede registrar una entrega con fecha futura', 'err'); return }
    let creadas: RopaEntrega[]
    try {
      creadas = await crearTanda({ fecha_entrega: fecha, obs: obs || null, entregas })
    } catch (e) {
      toast(`No se pudo registrar la entrega: ${e instanceof Error ? e.message : 'error de red'}`, 'err')
      return
    }
    toast(`✓ ${prendas} prenda${prendas > 1 ? 's' : ''} a ${entregas.length} trabajador${entregas.length > 1 ? 'es' : ''}`, 'ok')
    if (imprimir) {
      const hojas = entregas.flatMap(e => {
        const p = personaDe.get(e.leg)
        return p ? [{ p, entregas: creadas.filter(c => c.leg === e.leg) }] : []
      })
      onConstancia(hojas, obraNom)
    }
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="🏗 ENTREGA POR OBRA"
      width="max-w-3xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={isPending} onClick={guardar} disabled={!prendas}>
            ✓ Registrar {prendas > 0 ? `${prendas} prenda${prendas > 1 ? 's' : ''} · ${entregas.length} trab.` : ''}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Combobox
            label="Obra"
            placeholder="Buscar obra..."
            options={opObras}
            value={obraCod}
            onChange={elegirObra}
          />
          <Input
            label="Fecha de entrega"
            type="date"
            value={fecha}
            max={hoy}
            error={fecha > hoy ? 'No se puede registrar una entrega con fecha futura.' : undefined}
            onChange={e => setFecha(e.target.value)}
          />
        </div>

        {!obraCod ? (
          <p className="text-sm text-gris-dark">
            Elegí la obra: aparecen los trabajadores activos que cargaron horas ahí en su última semana,
            con lo que les falta ya tildado.
          </p>
        ) : trabajadores.length === 0 ? (
          <p className="text-sm text-gris-dark">No hay trabajadores activos en esta obra.</p>
        ) : (
          <div className="overflow-x-auto border border-gris-mid rounded-lg">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-gris">
                  <th className="text-left text-[11px] font-bold uppercase tracking-wide text-gris-dark px-3 py-2">Trabajador</th>
                  {categorias.map(c => (
                    <th key={c.id} className="text-center text-[11px] font-bold uppercase tracking-wide text-gris-dark px-2 py-2">
                      <button type="button" onClick={() => toggleColumna(c.id)} className="hover:text-naranja" title="Tildar o destildar a todos">
                        {c.icono ?? '📦'} {c.nombre}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {trabajadores.map(p => (
                  <tr key={p.leg} className="border-t border-gris">
                    <td className="px-3 py-2">
                      <div className="font-semibold text-carbon leading-tight">{p.nom}</div>
                      <div className="text-[11px] text-gris-dark font-mono">Leg. {p.leg}</div>
                    </td>
                    {categorias.map(c => {
                      const tildada = c.id in (sel[p.leg] ?? {})
                      const ult = ultimaEntrega(p.leg, c.id)
                      return (
                        <td key={c.id} className={`px-2 py-2 text-center ${tildada ? 'bg-naranja-light/50' : ''}`}>
                          <div className="flex items-center justify-center gap-1.5">
                            <input
                              type="checkbox"
                              checked={tildada}
                              onChange={() => toggle(p, c.id)}
                              title={ult ? `Última entrega: ${fmtCorta(ult)}` : 'Nunca recibió'}
                            />
                            {tildada && (
                              <input
                                type="text" maxLength={12} placeholder="talle"
                                value={sel[p.leg]?.[c.id] ?? ''}
                                onChange={e => setTalle(p.leg, c.id, e.target.value)}
                                className="w-12 px-1 py-0.5 border border-gris-mid rounded text-xs text-center outline-none focus:border-naranja bg-white"
                              />
                            )}
                          </div>
                          <div className="text-[10px] text-gris-dark mt-0.5">
                            {ult ? fmtCorta(ult) : 'nunca'}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Input label="Observaciones (opcional, para toda la tanda)" placeholder="Marca, modelo, etc." value={obs} onChange={e => setObs(e.target.value)} />
        <label className="flex items-center gap-2 text-sm text-carbon cursor-pointer">
          <input type="checkbox" checked={imprimir} onChange={e => setImprimir(e.target.checked)} />
          Descargar las constancias para firmar (una hoja por trabajador)
        </label>
      </div>
    </Modal>
  )
}
