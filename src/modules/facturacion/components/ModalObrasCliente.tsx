'use client'

import { useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { normalizeText } from '@/lib/utils/text'
import { useCentrosCosto, useObrasFacturacion } from '../hooks/useFacturacion'
import { useAsignarObrasCliente, useClientesVenta } from '../hooks/useClientesFacturacion'
import { mensajeErrorFacturacion } from '../utils/facturacion.errores'
import type { VentasCliente } from '@/types/domain.types'
import { Aviso } from './FichaFactura'

/**
 * Qué obras se le facturan a este cliente (`obras.cliente_id`). Solo sirve
 * para PRECARGAR el cliente al elegir la obra en una factura: la factura
 * guarda su propia foto del receptor.
 *
 * Una obra tiene un solo cliente: tildar una que hoy es de otro la mueve
 * (se avisa en la fila). Atajo «todas las del centro de costo X», porque los
 * clientes grandes (IGLESIAS, BRADEL) se agrupan justamente por eso.
 */

interface Props {
  cliente: VentasCliente
  onClose: () => void
}

export function ModalObrasCliente({ cliente, onClose }: Props) {
  const toast = useToast()
  const obras = useObrasFacturacion()
  const centros = useCentrosCosto()
  const clientes = useClientesVenta('', true)
  const asignar = useAsignarObrasCliente()

  const [sel, setSel] = useState<Set<string>>(() => new Set(cliente.obras.map(o => o.cod)))
  const [q, setQ] = useState('')
  const [cc, setCc] = useState('')
  const [error, setError] = useState<string | null>(null)

  const nombreCliente = useMemo(() => {
    const m = new Map<number, string>()
    for (const c of clientes.data ?? []) m.set(c.id, c.razon_social)
    return m
  }, [clientes.data])

  // Las obras asignadas que ya no vienen en /obras (archivadas) igual cuentan:
  // no se tocan si no se destildan.
  const lista = useMemo(() => {
    const vivas = obras.data ?? []
    const n = normalizeText(q)
    return vivas
      .filter(o => !n || normalizeText(`${o.nom} ${o.cod} ${o.cc ?? ''}`).includes(n))
      .sort((a, b) => Number(sel.has(b.cod)) - Number(sel.has(a.cod)) || a.nom.localeCompare(b.nom))
  }, [obras.data, q, sel])

  function toggle(cod: string) {
    setSel(s => {
      const n = new Set(s)
      if (n.has(cod)) n.delete(cod); else n.add(cod)
      return n
    })
  }

  function tildarCentro() {
    if (!cc) return
    const cods = (obras.data ?? []).filter(o => o.cc?.trim() === cc).map(o => o.cod)
    setSel(s => new Set([...s, ...cods]))
    toast(`Tildadas ${cods.length} obra${cods.length === 1 ? '' : 's'} de ${cc}`, 'ok')
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
        <div className="flex gap-2 flex-wrap items-end">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-[11px] font-bold text-gris-dark uppercase tracking-wider mb-1">Atajo: todas las del centro de costo</label>
            <select value={cc} onChange={e => setCc(e.target.value)}
              className="w-full px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm bg-white outline-none focus:border-naranja">
              <option value="">— Elegí —</option>
              {(centros.data ?? []).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <Button variant="secondary" size="sm" onClick={tildarCentro} disabled={!cc}>Tildar todas</Button>
        </div>

        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar obra por nombre, código o centro de costo…"
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
              const otro = o.cliente_id && o.cliente_id !== cliente.id ? nombreCliente.get(o.cliente_id) ?? `#${o.cliente_id}` : null
              return (
                <li key={o.cod}>
                  <label className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gris/40">
                    <input type="checkbox" className="accent-naranja w-4 h-4" checked={sel.has(o.cod)} onChange={() => toggle(o.cod)} />
                    <span className="flex-1 min-w-0">
                      <span className="font-semibold">{o.nom}</span>
                      <span className="text-[11px] text-gris-dark"> · {o.cod}{o.cc ? ` · CC ${o.cc.trim()}` : ''}</span>
                      {otro && <span className="block text-[11px] text-naranja-dark">hoy se le factura a {otro}</span>}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        )}
        {error && <Aviso tono="rojo">{error}</Aviso>}
      </div>
    </Modal>
  )
}
