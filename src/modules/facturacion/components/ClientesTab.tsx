'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import { useActualizarDesdeArca, useBajaClienteVenta, useClientesVenta } from '../hooks/useClientesFacturacion'
import { CONDICIONES_IVA, fmtDoc, fmtFecha, letraDeCliente } from '../utils/facturacion.utils'
import { mensajeErrorFacturacion } from '../utils/facturacion.errores'
import type { VentasCliente } from '@/types/domain.types'
import { ModalCliente } from './ModalCliente'
import { ModalObrasCliente } from './ModalObrasCliente'
import { CuentasFce } from './CuentasFce'

/**
 * El padrón de clientes de Facturación. Propio del módulo: no se sincroniza
 * con Áridos ni con Pagos. Baja lógica (activo = false), nunca borrado: las
 * facturas viejas lo siguen apuntando.
 */
export function ClientesTab() {
  const toast = useToast()
  const { puedeVer, puedeCrear, puedeEditar } = usePermisos('facturacion')
  const [texto, setTexto] = useState('')
  const [q, setQ] = useState('')
  const [inactivos, setInactivos] = useState(false)
  const [editando, setEditando] = useState<{ open: boolean; cliente?: VentasCliente }>({ open: false })
  const [obrasDe, setObrasDe] = useState<VentasCliente | null>(null)

  const lista = useClientesVenta(q, inactivos, puedeVer)
  const baja = useBajaClienteVenta()
  const desdeArca = useActualizarDesdeArca()

  /**
   * Trae domicilio y provincia del padrón de ARCA. Razón social y condición
   * IVA no se tocan si ya están cargadas: si ARCA dice otra cosa, se avisa.
   */
  async function actualizarDesdeArca(c: VentasCliente) {
    try {
      const r = await desdeArca.mutateAsync({ id: c.id })
      const aplicados = r.diferencias.filter(d => d.aplicado).map(d => NOMBRE_CAMPO[d.campo] ?? d.campo)
      const avisos = r.diferencias.filter(d => !d.aplicado).map(d => d.campo === 'condicion_iva_id'
        ? `ARCA sugiere ${CONDICIONES_IVA[Number(d.arca)] ?? d.arca}${r.padron.condicion_iva_dudosa ? ' (dudoso)' : ''}, no se cambió`
        : `razón social en ARCA: «${String(d.arca)}», no se cambió`)
      const base = aplicados.length ? `✓ ${c.razon_social}: se actualizó ${aplicados.join(' y ')}` : `✓ ${c.razon_social}: ya coincidía con ARCA`
      toast(avisos.length ? `${base}. ${avisos.join('; ')}.` : base, 'ok')
    } catch (e) {
      toast(mensajeErrorFacturacion(e), 'err')
    }
  }

  async function cambiarActivo(c: VentasCliente) {
    try {
      await baja.mutateAsync({ id: c.id, activo: !c.activo })
      toast(c.activo ? `${c.razon_social} dado de baja` : `✓ ${c.razon_social} reactivado`, 'ok')
    } catch (e) {
      toast(mensajeErrorFacturacion(e), 'err')
    }
  }

  if (!puedeVer) {
    return <div className="bg-white rounded-card shadow-card p-8 text-center text-sm text-gris-dark">No tenés permiso para ver los clientes.</div>
  }

  const items = lista.data ?? []
  const tipEditar = puedeEditar ? undefined : 'No tenés permiso para editar clientes'

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Button size="sm" onClick={() => setEditando({ open: true })} disabled={!puedeCrear}
          title={puedeCrear ? 'Cargar un cliente nuevo' : 'No tenés permiso para cargar clientes'}>
          + Nuevo cliente
        </Button>
        <div className="flex gap-2 items-center flex-wrap flex-1 justify-end">
          <form className="flex gap-1 min-w-[220px] flex-1 max-w-md" onSubmit={e => { e.preventDefault(); setQ(texto.trim()) }}>
            <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Buscar por razón social o CUIT…"
              className="flex-1 min-w-0 px-2.5 py-1.5 border-[1.5px] border-gris-mid rounded text-xs outline-none bg-white focus:border-naranja" />
            <Button type="submit" variant="secondary" size="sm">Buscar</Button>
            {q && <Button type="button" variant="ghost" size="sm" onClick={() => { setTexto(''); setQ('') }}>✕</Button>}
          </form>
          <label className="flex items-center gap-1.5 text-xs text-gris-dark cursor-pointer select-none">
            <input type="checkbox" className="accent-naranja" checked={inactivos} onChange={e => setInactivos(e.target.checked)} />
            Incluir dados de baja
          </label>
        </div>
      </div>

      {lista.isLoading && !lista.data ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-sm text-gris-dark">Cargando clientes…</div>
      ) : lista.error ? (
        <div className="bg-rojo-light border border-rojo/30 rounded-card p-4 text-sm text-rojo flex items-center justify-between gap-2">
          <span>{mensajeErrorFacturacion(lista.error)}</span>
          <Button size="sm" variant="secondary" onClick={() => lista.refetch()}>Reintentar</Button>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-sm text-gris-dark italic">
          {q ? 'No hay clientes con esa búsqueda.' : 'Todavía no hay clientes. Cargá el primero con «+ Nuevo cliente».'}
        </div>
      ) : (
        <div className="bg-white rounded-card shadow-card overflow-hidden">
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full border-collapse min-w-[860px]">
              <thead>
                <tr>
                  {['Razón social', 'Documento', 'Condición IVA', 'Provincia', 'Obras', ''].map((h, i) => (
                    <th key={h + i} className="bg-gris text-gris-dark text-[10px] font-bold px-3 py-2 uppercase tracking-wide text-left whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map(c => (
                  <tr key={c.id} className={`border-t border-gris ${c.activo ? '' : 'opacity-60'}`}>
                    <td className="px-3 py-2 text-sm">
                      <div className="font-semibold">{c.razon_social}</div>
                      {!c.activo && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gris text-gris-dark font-bold">dado de baja</span>}
                      {(() => {
                        const mails = (c.contactos ?? []).map(k => k.email).filter(Boolean)
                        const txt = mails.length ? mails.join(' · ') : c.email
                        return txt ? <div className="text-[11px] text-gris-dark">{txt}</div> : null
                      })()}
                    </td>
                    <td className="px-3 py-2 text-xs font-mono whitespace-nowrap">{fmtDoc(c.doc_tipo, c.doc_nro)}</td>
                    <td className="px-3 py-2 text-xs">
                      {CONDICIONES_IVA[c.condicion_iva_id] ?? c.condicion_iva_id}
                      {letraDeCliente(c.doc_tipo, c.condicion_iva_id)
                        ? <span className="block text-[10px] text-gris-dark font-bold">Factura {letraDeCliente(c.doc_tipo, c.condicion_iva_id)}</span>
                        : <span className="block text-[10px] text-rojo font-bold" title="RI o monotributo sin CUIT: no admite ni A ni B">sin letra: falta CUIT</span>}
                      {c.fce_obligado === true && <span className="block text-[10px] text-azul font-bold" title="Según ARCA (WSFECRED) recibe Factura de Crédito MiPyME">recibe FCE</span>}
                    </td>
                    <td className="px-3 py-2 text-xs">{c.provincia || '—'}</td>
                    <td className="px-3 py-2 text-xs" title={c.obras.map(o => o.nom).join(', ')}>
                      {c.obras.length === 0 ? <span className="text-gris-mid">—</span>
                        : <span>{c.obras.length} obra{c.obras.length === 1 ? '' : 's'}<span className="block text-[10px] text-gris-dark truncate max-w-[200px]">{c.obras.slice(0, 3).map(o => o.nom).join(', ')}{c.obras.length > 3 ? '…' : ''}</span></span>}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <Acciones c={c} puedeEditar={puedeEditar} tip={tipEditar}
                        onEditar={() => setEditando({ open: true, cliente: c })}
                        onObras={() => setObrasDe(c)}
                        onActivo={() => cambiarActivo(c)}
                        onArca={() => actualizarDesdeArca(c)}
                        cargandoArca={desdeArca.isPending && desdeArca.variables?.id === c.id}
                        cargando={baja.isPending && baja.variables?.id === c.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="md:hidden divide-y divide-gris">
            {items.map(c => (
              <div key={c.id} className={`p-3 ${c.activo ? '' : 'opacity-60'}`}>
                <div className="font-semibold text-sm">{c.razon_social}</div>
                <div className="text-[11px] text-gris-dark font-mono">{fmtDoc(c.doc_tipo, c.doc_nro)}</div>
                <div className="text-[11px] text-gris-dark">{CONDICIONES_IVA[c.condicion_iva_id]} · {c.obras.length} obra{c.obras.length === 1 ? '' : 's'}</div>
                <div className="mt-2">
                  <Acciones c={c} puedeEditar={puedeEditar} tip={tipEditar}
                    onEditar={() => setEditando({ open: true, cliente: c })}
                    onObras={() => setObrasDe(c)}
                    onActivo={() => cambiarActivo(c)}
                    onArca={() => actualizarDesdeArca(c)}
                    cargandoArca={desdeArca.isPending && desdeArca.variables?.id === c.id}
                    cargando={baja.isPending && baja.variables?.id === c.id} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <CuentasFce />

      {editando.open && <ModalCliente cliente={editando.cliente} onClose={() => setEditando({ open: false })} />}
      {obrasDe && <ModalObrasCliente cliente={obrasDe} onClose={() => setObrasDe(null)} />}
    </div>
  )
}

const NOMBRE_CAMPO: Record<string, string> = {
  domicilio: 'el domicilio', provincia: 'la provincia', razon_social: 'la razón social', condicion_iva_id: 'la condición IVA',
}

function Acciones({ c, puedeEditar, tip, onEditar, onObras, onActivo, onArca, cargandoArca, cargando }: {
  c: VentasCliente; puedeEditar: boolean; tip?: string
  onEditar: () => void; onObras: () => void; onActivo: () => void; onArca: () => void
  cargandoArca: boolean; cargando: boolean
}) {
  const conCuit = c.doc_tipo === 80 || c.doc_tipo === 86
  return (
    <div className="flex gap-1 justify-end flex-wrap">
      <Button variant="ghost" size="sm" onClick={onEditar} disabled={!puedeEditar} title={tip ?? 'Editar el cliente'}>✏️ Editar</Button>
      <Button variant="ghost" size="sm" onClick={onArca} disabled={!puedeEditar || !conCuit || !c.activo} loading={cargandoArca}
        title={tip ?? (!conCuit ? 'Solo para clientes con CUIT o CUIL'
          : !c.activo ? 'Reactivalo para actualizarlo'
          : `Actualizar desde ARCA: trae domicilio y provincia del padrón${c.padron_consultado_at ? ` (última vez: ${fmtFecha(c.padron_consultado_at)})` : ''}. Razón social y condición IVA no se tocan.`)}>
        ↻ Actualizar desde ARCA
      </Button>
      <Button variant="ghost" size="sm" onClick={onObras} disabled={!puedeEditar || !c.activo}
        title={tip ?? (!c.activo ? 'Reactivalo para asignarle obras' : 'Qué obras se le facturan (precarga el cliente)')}>🏗 Obras</Button>
      <Button variant="ghost" size="sm" onClick={onActivo} disabled={!puedeEditar} loading={cargando}
        title={tip ?? (c.activo ? 'Dar de baja: no se le puede facturar más (las facturas viejas quedan)' : 'Reactivar')}>
        {c.activo ? 'Dar de baja' : 'Reactivar'}
      </Button>
    </div>
  )
}
