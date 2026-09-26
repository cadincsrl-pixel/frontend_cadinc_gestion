'use client'

import { useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import type { LiquidacionDetalle } from '@/types/sueldos.types'
import { useLegajos } from '../../hooks/useSueldos'
import { mensajeErrorSueldos } from '../../utils/sueldos.errores'
import { Cargando, ErrorCarga } from '../Comun'

/** Elegir un legajo del convenio que todavía no tiene recibo y abrir el editor. */
export function ModalAgregarEmpleado({ liquidacion: l, onClose, onElegir }: {
  liquidacion: LiquidacionDetalle; onClose: () => void; onElegir: (legajoId: number) => void
}) {
  const [busca, setBusca] = useState('')
  const [incluirBajas, setIncluirBajas] = useState(l.tipo === 'final')
  const q = useLegajos({ convenio_id: l.convenio_id, activo: incluirBajas ? 'todos' : 'true' })
  const conRecibo = useMemo(() => new Set(l.recibos.map(r => r.legajo_id)), [l.recibos])
  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return (q.data ?? [])
      .filter(x => !conRecibo.has(x.id))
      .filter(x => !t || x.nombre_mostrar.toLowerCase().includes(t) || (x.leg ?? '').includes(t))
  }, [q.data, busca, conRecibo])

  return (
    <Modal open onClose={onClose} title="Agregar empleado" width="max-w-lg"
      footer={<Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>}>
      <div className="flex flex-col gap-2 text-sm">
        <Input placeholder="Buscar por nombre o legajo" value={busca} onChange={e => setBusca(e.target.value)} autoFocus />
        <label className="flex items-center gap-2 text-xs text-gris-dark">
          <input type="checkbox" className="accent-naranja" checked={incluirBajas} onChange={e => setIncluirBajas(e.target.checked)} />
          Incluir legajos dados de baja (para liquidaciones finales)
        </label>
        {q.isLoading ? <Cargando />
          : q.isError ? <ErrorCarga mensaje={mensajeErrorSueldos(q.error)} onReintentar={() => q.refetch()} />
          : (
            <div className="max-h-72 overflow-y-auto border border-gris-mid rounded-lg divide-y divide-gris">
              {lista.length === 0 && <div className="p-3 text-gris-dark italic">No hay legajos de {l.convenio.nombre} sin recibo en esta liquidación.</div>}
              {lista.map(x => (
                <button key={x.id} type="button" onClick={() => onElegir(x.id)} className="w-full text-left px-3 py-2 hover:bg-naranja-light/50">
                  <div className="font-semibold">{x.nombre_mostrar}</div>
                  <div className="text-[11px] text-gris-dark">{x.leg ? `Leg. ${x.leg} · ` : ''}{x.categoria_nombre ?? 'sin categoría'}{!x.activo ? ' · dado de baja' : ''}{x.incompleto ? ' · ficha incompleta' : ''}</div>
                </button>
              ))}
            </div>
          )}
      </div>
    </Modal>
  )
}
