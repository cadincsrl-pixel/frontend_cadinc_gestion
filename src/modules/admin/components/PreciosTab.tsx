'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePerfilesMap } from '@/lib/hooks/usePerfilesMap'
import { usePreciosMovimientos, type MovimientoPrecio } from '../hooks/usePreciosMovimientos'

/**
 * Movimientos de precios — la pantalla de control del dueño.
 *
 * Pedido del user (10/09): "yo como jefe de Nicolás quiero saber todo lo que
 * hace porque soy desconfiado". Junta los dos lugares donde se toca plata:
 * el precio que se le cobra al cliente en una obra, y el precio de referencia
 * del catálogo, que vale para todas.
 *
 * Es solo lectura y solo admin (la ruta del backend ya lo exige).
 */

const POR_PAGINA = 200

function fmtM(n: number | null | undefined) {
  if (n == null) return '—'
  return '$ ' + Number(n).toLocaleString('es-AR', { maximumFractionDigits: 2 })
}

function fmtFH(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

const selectCls = 'px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none bg-white font-semibold focus:border-naranja'
const btnPagina = 'px-2.5 py-1 rounded-md border-[1.5px] border-gris-mid text-xs font-bold text-carbon hover:bg-gris disabled:opacity-40 disabled:cursor-not-allowed'

/** Cuánto se movió el precio, y para qué lado. */
function Salto({ m }: { m: MovimientoPrecio }) {
  const antes = m.precio_anterior
  const ahora = m.precio_nuevo
  if (antes == null) {
    return <span className="text-[10px] font-bold text-azul bg-azul-light px-1.5 py-0.5 rounded">primer precio</span>
  }
  if (!(Number(antes) > 0)) {
    return <span className="text-[10px] font-bold text-verde bg-verde-light px-1.5 py-0.5 rounded">se tasó</span>
  }
  const dif = ((Number(ahora) - Number(antes)) / Number(antes)) * 100
  if (Math.abs(dif) <= 0.5) return <span className="text-[10px] text-gris-mid">igual</span>
  // Un salto grande es lo que el dueño quiere ver primero.
  const fuerte = Math.abs(dif) > 40
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${fuerte ? 'bg-rojo-light text-rojo' : 'text-gris-dark'}`}>
      {dif > 0 ? '+' : '−'}{Math.abs(dif).toFixed(0)} %
    </span>
  )
}

export function PreciosTab() {
  const perfiles = usePerfilesMap()
  const [filtroUser, setFiltroUser]   = useState('')
  const [filtroTipo, setFiltroTipo]   = useState('')
  const [filtroDesde, setFiltroDesde] = useState('')
  const [filtroHasta, setFiltroHasta] = useState('')
  const [busqueda, setBusqueda]       = useState('')
  const [busquedaDebounced, setBusquedaDebounced] = useState('')
  const [pagina, setPagina] = useState(0)

  useEffect(() => {
    const t = setTimeout(() => setBusquedaDebounced(busqueda.trim()), 400)
    return () => clearTimeout(t)
  }, [busqueda])

  const filtros = {
    user_id: filtroUser || undefined,
    tipo:    filtroTipo || undefined,
    q:       busquedaDebounced || undefined,
    desde:   filtroDesde ? `${filtroDesde}T00:00:00-03:00` : undefined,
    hasta:   filtroHasta ? `${filtroHasta}T23:59:59-03:00` : undefined,
  }
  // Cambiar un filtro vuelve a la primera página. Se ajusta DURANTE el render
  // (no en un efecto): el lint del React Compiler no admite setState en efectos.
  const clave = JSON.stringify(filtros)
  const [ultimaClave, setUltimaClave] = useState(clave)
  if (clave !== ultimaClave) {
    setUltimaClave(clave)
    setPagina(0)
  }

  const { data, isLoading, isFetching } = usePreciosMovimientos({ ...filtros, limit: POR_PAGINA, offset: pagina * POR_PAGINA })
  const items = useMemo(() => data?.items ?? [], [data])
  const total = data?.total ?? 0

  // Resumen de lo que se está mirando: cuántos subieron y cuántos bajaron.
  const resumen = useMemo(() => {
    let suben = 0, bajan = 0, tasados = 0
    for (const m of items) {
      const antes = Number(m.precio_anterior ?? 0)
      const ahora = Number(m.precio_nuevo ?? 0)
      if (m.precio_anterior == null || antes === 0) { tasados++; continue }
      if (ahora > antes) suben++
      else if (ahora < antes) bajan++
    }
    return { suben, bajan, tasados }
  }, [items])

  const usuarios = useMemo(
    () => [...perfiles.entries()].map(([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [perfiles],
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white rounded-card shadow-card p-4">
        <p className="text-sm text-gris-dark">
          Todo cambio de precio, de los dos lugares donde se toca plata: el precio que se le <b>cobra al cliente</b> en
          una obra, y el <b>precio de referencia del catálogo</b>, que vale para todas las obras.
        </p>

        <div className="flex flex-wrap gap-2 mt-3">
          <select className={selectCls} value={filtroUser} onChange={e => setFiltroUser(e.target.value)}>
            <option value="">Todos los usuarios</option>
            {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
          <select className={selectCls} value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
            <option value="">Renglones y catálogo</option>
            <option value="renglon">Solo lo que se le cobra al cliente</option>
            <option value="catalogo">Solo el catálogo</option>
          </select>
          <input type="date" className={selectCls} value={filtroDesde} onChange={e => setFiltroDesde(e.target.value)} title="Desde" />
          <input type="date" className={selectCls} value={filtroHasta} onChange={e => setFiltroHasta(e.target.value)} title="Hasta" />
          <input
            type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar material, obra…"
            className="flex-1 min-w-[180px] px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none focus:border-naranja bg-white"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-gris-dark">
          <span className="font-bold">
            {total.toLocaleString('es-AR')} movimiento{total !== 1 ? 's' : ''}
            {isFetching && <span className="text-gris-mid font-normal"> · actualizando…</span>}
          </span>
          {items.length > 0 && (
            <>
              <span>↑ {resumen.suben} subieron</span>
              <span>↓ {resumen.bajan} bajaron</span>
              <span>{resumen.tasados} sin precio antes</span>
            </>
          )}
        </div>
      </div>

      <div className="bg-white rounded-card shadow-card overflow-hidden">
        {isLoading ? (
          <div className="px-4 py-10 text-center text-sm text-gris-dark">Cargando…</div>
        ) : items.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-gris-dark italic">
            No hay movimientos de precio con estos filtros.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[860px]">
              <thead>
                <tr>
                  {['Fecha', 'Quién', 'Qué', 'Obra', 'Antes', 'Después', ''].map((h, i) => (
                    <th key={h + i} className={`px-3 py-2 text-[10px] font-bold text-gris-dark uppercase tracking-wider whitespace-nowrap bg-gris ${i >= 4 ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((m, i) => (
                  <tr key={`${m.tipo}-${m.item_id}-${m.fecha}-${i}`} className="border-t border-gris">
                    <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{fmtFH(m.fecha)}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">
                      {m.user_id ? (perfiles.get(m.user_id) ?? '—') : <span className="text-gris-mid italic">sin usuario</span>}
                    </td>
                    <td className="px-3 py-2">
                      <div className="text-sm">{m.descripcion ?? m.ficha ?? '—'}</div>
                      {m.tipo === 'catalogo'
                        ? <span className="text-[9px] font-bold text-azul bg-azul-light px-1.5 py-0.5 rounded">CATÁLOGO{m.fuente ? ` · ${m.fuente}` : ''}</span>
                        : m.ficha && m.ficha !== m.descripcion && <div className="text-[10px] text-gris-dark">ficha: {m.ficha}</div>}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {m.obra_cod
                        ? <><span className="font-bold">{m.obra_nom}</span> <span className="font-mono text-gris-dark">{m.obra_cod}</span></>
                        : <span className="text-gris-mid">todas</span>}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-gris-dark whitespace-nowrap">{fmtM(m.precio_anterior)}</td>
                    <td className="px-3 py-2 text-right font-mono text-sm font-bold whitespace-nowrap">{fmtM(m.precio_nuevo)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap"><Salto m={m} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {total > POR_PAGINA && (
          <div className="flex items-center justify-between gap-2 px-4 py-2 border-t border-gris text-xs text-gris-dark">
            <span>
              {(pagina * POR_PAGINA + 1).toLocaleString('es-AR')}–{Math.min((pagina + 1) * POR_PAGINA, total).toLocaleString('es-AR')} de {total.toLocaleString('es-AR')}
            </span>
            <div className="flex gap-1.5">
              <button className={btnPagina} disabled={pagina === 0} onClick={() => setPagina(p => Math.max(0, p - 1))}>← Anterior</button>
              <button className={btnPagina} disabled={(pagina + 1) * POR_PAGINA >= total} onClick={() => setPagina(p => p + 1)}>Siguiente →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
