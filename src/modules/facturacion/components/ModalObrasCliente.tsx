'use client'

import { useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { normalizeText } from '@/lib/utils/text'
import { useObrasFacturacion } from '../hooks/useFacturacion'
import { useAsignarObrasCliente } from '../hooks/useClientesFacturacion'
import { mensajeErrorFacturacion } from '../utils/facturacion.errores'
import type { VentasCliente } from '@/types/domain.types'
import { Aviso } from './FichaFactura'

/**
 * Qué obras se le facturan a este cliente (`obras.cliente_id`). Solo sirve
 * para PRECARGAR el cliente al elegir la obra en una factura: la factura
 * guarda su propia foto del receptor.
 *
 * Una obra tiene un solo cliente: tildar una que hoy es de otro la mueve
 * (se avisa en la fila). Cada obra es su propio centro de costo y el cliente
 * solo las agrupa (23/09): ya no hay atajo por `obras.cc` (así había quedado
 * CC PODA en la Iglesia). Las internas y el depósito no se listan: no se le
 * facturan a nadie y el backend las rechaza (OBRA_INTERNA / OBRA_DEPOSITO).
 */

interface Props {
  cliente: VentasCliente
  onClose: () => void
}

export function ModalObrasCliente({ cliente, onClose }: Props) {
  const toast = useToast()
  const obras = useObrasFacturacion()
  const asignar = useAsignarObrasCliente()

  const [sel, setSel] = useState<Set<string>>(() => new Set(cliente.obras.map(o => o.cod)))
  const [q, setQ] = useState('')
  const [error, setError] = useState<string | null>(null)

  const lista = useMemo(() => {
    const vivas = obras.data ?? []
    const n = normalizeText(q)
    return vivas
      .filter(o => !n || normalizeText(`${o.nom} ${o.cod}`).includes(n))
      .sort((a, b) => Number(sel.has(b.cod)) - Number(sel.has(a.cod)) || a.nom.localeCompare(b.nom))
  }, [obras.data, q, sel])

  // Las asignadas que no vienen en /obras (archivadas, o marcadas internas
  // después) se muestran aparte para poder destildarlas: si quedan tildadas
  // se guardan igual, y una interna haría rebotar el guardado.
  const ocultas = useMemo(() => {
    if (!obras.data) return []
    const vivas = new Set(obras.data.map(o => o.cod))
    return cliente.obras.filter(o => !vivas.has(o.cod))
  }, [obras.data, cliente.obras])

  function toggle(cod: string) {
    setSel(s => {
      const n = new Set(s)
      if (n.has(cod)) n.delete(cod); else n.add(cod)
      return n
    })
  }

  const deOtros = (obras.data ?? []).filter(o => sel.has(o.cod) && o.cliente_id && o.cliente_id !== cliente.id)

  async function guardar() {
    setError(null)
    try {
      await asignar.mutateAsync({ id: cliente.id, obra_cods: [...sel] })
      toast('✓ Obras actualizadas', 'ok')
      onClose()
    } catch (e) {
      setError(mensajeErrorFacturacion(e))
    }
  }

  return (
    <Modal
      open
      onClose={asignar.isPending ? () => {} : onClose}
      width="max-w-2xl"
      title={`Obras de ${cliente.razon_social}`}
      footer={
        <div className="flex gap-2 justify-end items-center">
          <span className="text-xs text-gris-dark mr-auto">{sel.size} obra{sel.size === 1 ? '' : 's'} tildada{sel.size === 1 ? '' : 's'}</span>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={asignar.isPending}>Cancelar</Button>
          <Button size="sm" loading={asignar.isPending} onClick={guardar}>Guardar</Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar obra por nombre o código…"
          className="w-full px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm bg-white outline-none focus:border-naranja" />

        {deOtros.length > 0 && (
          <Aviso tono="naranja">
            {deOtros.length} de las tildadas hoy son de otro cliente: al guardar pasan a {cliente.razon_social}.
          </Aviso>
        )}

        {obras.isLoading ? (
          <div className="p-6 text-center text-gris-dark text-xs">Cargando obras…</div>
        ) : obras.error ? (
          <Aviso tono="rojo">{mensajeErrorFacturacion(obras.error)}</Aviso>
        ) : lista.length === 0 ? (
          <div className="p-6 text-center text-gris-dark text-xs italic">No hay obras con esa búsqueda.</div>
        ) : (
          <ul className="max-h-[50vh] overflow-y-auto divide-y divide-gris border border-gris rounded-lg">
            {lista.map(o => {
              const otro = o.cliente_id && o.cliente_id !== cliente.id ? o.cliente_nom ?? `#${o.cliente_id}` : null
              return (
                <li key={o.cod}>
                  <label className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gris/40">
                    <input type="checkbox" className="accent-naranja w-4 h-4" checked={sel.has(o.cod)} onChange={() => toggle(o.cod)} />
                    <span className="flex-1 min-w-0">
                      <span className="font-mono text-[11px] text-gris-dark">{o.cod}</span>{' '}
                      <span className="font-semibold">{o.nom}</span>
                      {otro && <span className="block text-[11px] text-naranja-dark">hoy se le factura a {otro}</span>}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        )}
        {ocultas.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">
              Asignadas que no se listan (archivadas, internas o depósito)
            </span>
            <ul className="divide-y divide-gris border border-gris rounded-lg">
              {ocultas.map(o => (
                <li key={o.cod}>
                  <label className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gris/40">
                    <input type="checkbox" className="accent-naranja w-4 h-4" checked={sel.has(o.cod)} onChange={() => toggle(o.cod)} />
                    <span className="font-mono text-[11px] text-gris-dark">{o.cod}</span>
                    <span className="font-semibold">{o.nom}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}
        {error && <Aviso tono="rojo">{error}</Aviso>}
      </div>
    </Modal>
  )
}
