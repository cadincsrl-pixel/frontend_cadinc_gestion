'use client'

import { useMemo, useState } from 'react'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { usePermisos } from '@/hooks/usePermisos'
import {
  useObrasAlquiler,
  useRemitos,
  useDeleteRemito,
  type RemitosFiltro,
} from '../hooks/useAlquiler'
import { fmtHoras } from '../utils/horas'
import type { RemitoAlquiler } from '../types'
import { RemitoAlquilerModal } from './RemitoAlquilerModal'

// dd/mm/yyyy desde 'YYYY-MM-DD' por split (NO new Date: corrimiento TZ).
function fmtFecha(s: string | null | undefined): string {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  if (!y || !m || !d) return '—'
  return `${d}/${m}/${y}`
}

export function RemitosTab() {
  const { puedeEliminar } = usePermisos('alquiler')

  const { data: obras = [], isLoading: loadingObras } = useObrasAlquiler()

  const [obraId, setObraId] = useState<number | null>(null)
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')

  // Remito abierto en el modal (reimprimir / reenviar).
  const [remitoModal, setRemitoModal] = useState<RemitoAlquiler | null>(null)

  const filtro: RemitosFiltro = useMemo(() => {
    const f: RemitosFiltro = {}
    if (obraId != null) f.obra_id = obraId
    if (desde) f.desde = desde
    if (hasta) f.hasta = hasta
    return f
  }, [obraId, desde, hasta])

  const { data: remitos = [], isLoading, isError } = useRemitos(filtro)

  const { mutate: deleteRemito, isPending: borrando } = useDeleteRemito()

  const opcionesObra = useMemo(
    () => [
      { value: '', label: 'Todas las obras' },
      ...obras.map(o => ({
        value: String(o.id),
        label: o.estado === 'cerrada' ? `${o.nombre} (cerrada)` : o.nombre,
      })),
    ],
    [obras],
  )

  function handleAnular(remito: RemitoAlquiler) {
    if (!window.confirm(`¿Anular el remito ${remito.numero}? Esta acción no se puede deshacer.`)) return
    deleteRemito(remito.id)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Filtros */}
      <div className="bg-white rounded-card shadow-card p-3 sm:p-4 flex flex-col sm:flex-row sm:items-end gap-3">
        <div className="flex-1 min-w-0">
          <Select
            label="Obra"
            options={opcionesObra}
            value={obraId != null ? String(obraId) : ''}
            onChange={e => setObraId(e.target.value ? Number(e.target.value) : null)}
            disabled={loadingObras}
          />
        </div>
        <div className="w-full sm:w-44">
          <Input label="Desde" type="date" value={desde} onChange={e => setDesde(e.target.value)} />
        </div>
        <div className="w-full sm:w-44">
          <Input label="Hasta" type="date" value={hasta} onChange={e => setHasta(e.target.value)} />
        </div>
      </div>

      {/* Estados */}
      {isLoading ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-gris-dark text-sm">
          <span className="inline-flex items-center gap-2">
            <span className="w-4 h-4 border-2 border-naranja border-t-transparent rounded-full animate-spin" />
            Cargando remitos...
          </span>
        </div>
      ) : isError ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-rojo text-sm italic">
          No se pudieron cargar los remitos. Reintentá en unos segundos.
        </div>
      ) : remitos.length === 0 ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-gris-dark text-sm italic">
          No hay remitos para los filtros seleccionados. Emití uno desde el tab Partes.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {remitos.map(r => (
            <div
              key={r.id}
              role="button"
              tabIndex={0}
              onClick={() => setRemitoModal(r)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setRemitoModal(r)
                }
              }}
              className="bg-white rounded-card shadow-card p-3 sm:p-4 flex items-center gap-3 cursor-pointer hover:shadow-card-lg transition-shadow"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-display text-lg tracking-wider text-naranja">{r.numero}</span>
                  <span className="text-xs text-gris-dark">· {fmtFecha(r.fecha_trabajo)}</span>
                </div>
                <div className="text-sm font-bold text-carbon truncate">
                  {r.obra_nombre ?? '—'}
                </div>
                <div className="text-xs text-gris-dark truncate">
                  🚜 {r.maquina_nombre ?? '—'} · {fmtHoras(r.horas)} hs
                </div>
                <div className="text-[10px] text-gris-mid mt-0.5">
                  Emitido {fmtFecha(r.fecha_emision)}
                </div>
              </div>

              {puedeEliminar && (
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation()
                    handleAnular(r)
                  }}
                  disabled={borrando}
                  className="shrink-0 text-gris-mid hover:text-rojo transition-colors w-9 h-9 flex items-center justify-center rounded-lg hover:bg-rojo-light disabled:opacity-50 disabled:cursor-not-allowed"
                  title={`Anular remito ${r.numero}`}
                  aria-label={`Anular remito ${r.numero}`}
                >
                  🗑
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <RemitoAlquilerModal
        open={remitoModal != null}
        onClose={() => setRemitoModal(null)}
        remito={remitoModal}
      />
    </div>
  )
}
