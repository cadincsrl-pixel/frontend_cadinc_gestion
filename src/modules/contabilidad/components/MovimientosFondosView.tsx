'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Combobox, type ComboboxOption } from '@/components/ui/Combobox'
import { Pagination } from '@/components/ui/Pagination'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import type { TesMovimiento, TesMovTipo } from '@/types/contabilidad.types'
import {
  fetchMovimientosCompletos, useConceptosFondos, useMovimientosFondos, useObrasCtb, useTesoreria, type MovimientosFiltro,
} from '../hooks/useContabilidad'
import { fmtFecha, fmtM, mesActual } from '../utils/contabilidad.utils'
import { mensajeErrorCtb } from '../utils/contabilidad.errores'
import { TES_MOV_TIPOS, cuentasMovimiento, fmtMoneda, numeroMovimiento, tipoMovimiento } from '../utils/fondos'
import { exportarMovimientos } from '../utils/exportarFondos'
import { Campo, Cargando, Cifra, ErrorCarga, RangoFechas, Tarjeta, Th, Vacio, inputCls } from './Comun'
import { ModalMovimientoFondos } from './ModalMovimientoFondos'
import { useVisorAsiento } from './VisorAsiento'

const PAGE_SIZE = 50

/**
 * Los movimientos de fondos sin factura, con filtros, totales del server (en
 * pesos, solo vigentes) y el Excel de lo filtrado. Cada fila dice si ya tiene
 * asiento: se genera con «Contabilizar» (Automáticos, circuito Fondos).
 */
export function MovimientosFondosView({ movIdUrl, onCerrarMovUrl }: {
  /** `?mov=<id>`: abre ese movimiento al entrar. */
  movIdUrl:       number | null
  onCerrarMovUrl: () => void
}) {
  const toast = useToast()
  const { puedeCrear, movimientosFondos } = usePermisos('contabilidad')
  const visor = useVisorAsiento()
  const mes = useMemo(() => mesActual(), [])
  const [filtro, setFiltro] = useState<MovimientosFiltro>({ desde: mes.desde, hasta: mes.hasta, estado: 'vigente' })
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  // undefined = cerrado; null = nuevo; número = ese movimiento.
  const [abierto, setAbierto] = useState<number | null | undefined>(undefined)
  const [exportando, setExportando] = useState(false)

  const filtroEf = useMemo(() => ({ ...filtro, q }), [filtro, q])
  const lista = useMovimientosFondos(filtroEf, page, PAGE_SIZE)
  const tesorerias = useTesoreria(true)
  const conceptos = useConceptosFondos(true)
  const obras = useObrasCtb()

  const patch = (p: Partial<MovimientosFiltro>) => { setFiltro(f => ({ ...f, ...p })); setPage(1) }

  const bloqueoNuevo = !movimientosFondos ? 'No tenés permiso (hace falta «Movimientos de fondos»)'
    : !puedeCrear ? 'No tenés permiso de Crear en Contabilidad' : null

  const opcionesObra = useMemo<ComboboxOption[]>(() => [
    { value: '', label: 'Todas las obras' },
    ...(obras.data ?? []).map(o => ({ value: o.cod, label: `${o.cod} — ${o.nom}`, sub: o.archivada ? 'archivada' : undefined, search: [o.cod, o.nom] })),
  ], [obras.data])

  async function exportar() {
    setExportando(true)
    try {
      const items = await fetchMovimientosCompletos(filtroEf)
      if (items.length === 0) { toast('No hay movimientos con estos filtros', 'warn'); return }
      exportarMovimientos({ items, desde: filtro.desde ?? '', hasta: filtro.hasta ?? '' })
    } catch (e) {
      toast(mensajeErrorCtb(e), 'err')
    } finally {
      setExportando(false)
    }
  }

  const tot = lista.data?.totales
  const items = lista.data?.items ?? []
  const total = lista.data?.total ?? 0
  const hayFiltros = !!(filtro.tipo || filtro.tesoreria_id || filtro.concepto_id || filtro.obra_cod || q.trim() || filtro.estado !== 'vigente')
  const idModal = abierto !== undefined ? abierto : movIdUrl ?? undefined

  function cerrarModal() {
    setAbierto(undefined)
    if (movIdUrl) onCerrarMovUrl()
  }

  return (
    <div className="flex flex-col gap-3">
      <Tarjeta className="p-3 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-[150px_150px_140px_1fr_1fr] gap-2 items-end">
        <RangoFechas desde={filtro.desde ?? ''} hasta={filtro.hasta ?? ''} onChange={r => patch({ desde: r.desde || undefined, hasta: r.hasta || undefined })} />
        <Campo label="Tipo">
          <select value={filtro.tipo ?? ''} onChange={e => patch({ tipo: e.target.value as TesMovTipo | '' })} className={inputCls}>
            <option value="">Todos</option>
            {TES_MOV_TIPOS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </Campo>
        <Campo label="Cuenta">
          <select value={filtro.tesoreria_id ?? ''} onChange={e => patch({ tesoreria_id: Number(e.target.value) || null })} className={inputCls}
            disabled={tesorerias.isLoading}>
            <option value="">Todas</option>
            {(tesorerias.data ?? []).map(t => (
              <option key={t.id} value={t.id}>{t.nombre}{t.moneda === 'USD' ? ' (USD)' : ''}{t.activo ? '' : ' · baja'}</option>
            ))}
          </select>
        </Campo>
        <Campo label="Concepto">
          <select value={filtro.concepto_id ?? ''} onChange={e => patch({ concepto_id: Number(e.target.value) || null })} className={inputCls}
            disabled={conceptos.isLoading}>
            <option value="">Todos</option>
            {(conceptos.data ?? []).map(c => <option key={c.id} value={c.id}>{c.nombre}{c.activo ? '' : ' · baja'}</option>)}
          </select>
        </Campo>
        <Campo label="Obra" className="md:col-span-2 lg:col-span-1">
          <Combobox options={opcionesObra} value={filtro.obra_cod ?? ''} onChange={v => patch({ obra_cod: v || null })}
            placeholder={obras.isLoading ? 'Cargando obras…' : 'Todas las obras'} />
        </Campo>
        <Campo label="Estado">
          <select value={filtro.estado ?? 'vigente'} onChange={e => patch({ estado: e.target.value as MovimientosFiltro['estado'] })} className={inputCls}>
            <option value="vigente">Vigentes</option>
            <option value="anulado">Anulados</option>
            <option value="todos">Todos</option>
          </select>
        </Campo>
        <Campo label="Buscar" className="col-span-2 lg:col-span-2">
          <input value={q} onChange={e => { setQ(e.target.value); setPage(1) }} placeholder="Referencia, n° de VEP, observación…" className={inputCls} />
        </Campo>
        <div className="col-span-2 lg:col-span-2 flex gap-2 justify-end flex-wrap">
          <Button variant="ghost" size="sm" disabled={!hayFiltros}
            onClick={() => { setFiltro({ desde: filtro.desde, hasta: filtro.hasta, estado: 'vigente' }); setQ(''); setPage(1) }}>
            ✕ Limpiar
          </Button>
          <Button variant="secondary" size="sm" onClick={() => void exportar()} loading={exportando} disabled={total === 0 || exportando}
            title={total === 0 ? 'No hay movimientos para exportar' : 'Bajar lo filtrado en Excel'}>
            📥 Excel
          </Button>
          <Button size="sm" onClick={() => setAbierto(null)} disabled={!!bloqueoNuevo} title={bloqueoNuevo ?? 'Cargar un ingreso, egreso o transferencia'}>
            + Nuevo movimiento
          </Button>
        </div>
      </Tarjeta>

      {tot && (
        <div className="flex gap-2 flex-wrap">
          <Cifra label="Ingresos" valor={fmtM(tot.ingresos)} tono="verde" />
          <Cifra label="Egresos" valor={fmtM(tot.egresos)} tono="rojo" />
          <Cifra label="Neto" valor={fmtM(tot.ingresos - tot.egresos)} tono={tot.ingresos - tot.egresos >= 0 ? 'normal' : 'rojo'} sub="ingresos − egresos" />
          <Cifra label="Transferencias" valor={fmtM(tot.transferencias)} sub="entre cuentas propias" />
        </div>
      )}

      {lista.isLoading ? <Cargando />
        : lista.isError ? <ErrorCarga mensaje={mensajeErrorCtb(lista.error)} onReintentar={() => void lista.refetch()} />
        : items.length === 0 ? (
          <Vacio>{hayFiltros ? 'No hay movimientos con estos filtros.' : 'No hay movimientos de fondos en el rango. Cargá el primero con «+ Nuevo movimiento».'}</Vacio>
        ) : (
          <Tarjeta className={`overflow-hidden ${lista.isFetching ? 'opacity-70' : ''}`}>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full border-collapse min-w-[1000px]">
                <thead>
                  <tr>
                    <Th>N°</Th><Th>Fecha</Th><Th>Tipo</Th><Th>Cuenta</Th><Th>Concepto</Th><Th>Obra</Th><Th>Referencia</Th>
                    <Th derecha>Importe</Th><Th>Asiento</Th><Th />
                  </tr>
                </thead>
                <tbody>
                  {items.map(m => (
                    <tr key={m.id} className={`border-t border-gris cursor-pointer hover:bg-blanco ${m.estado === 'anulado' ? 'opacity-60' : ''}`}
                      onClick={() => setAbierto(m.id)}>
                      <td className="px-3 py-2 text-xs font-mono whitespace-nowrap">{numeroMovimiento(m.numero)}</td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap">{fmtFecha(m.fecha)}</td>
                      <td className="px-3 py-2"><ChipTipo m={m} /></td>
                      <td className="px-3 py-2 text-sm max-w-[220px] truncate" title={cuentasMovimiento(m)}>{cuentasMovimiento(m)}</td>
                      <td className="px-3 py-2 text-sm max-w-[220px] truncate" title={m.concepto_nombre ?? undefined}>{m.concepto_nombre ?? <span className="text-gris-dark">—</span>}</td>
                      <td className="px-3 py-2 text-xs text-gris-dark" title={m.obra_nom ?? undefined}>{m.obra_cod ?? '—'}</td>
                      <td className="px-3 py-2 text-xs max-w-[160px] truncate" title={m.referencia}>{m.referencia || '—'}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap"><Importe m={m} /></td>
                      <td className="px-3 py-2" onClick={e => e.stopPropagation()}><ChipAsiento m={m} onAbrir={visor.abrir} /></td>
                      <td className="px-3 py-2 text-xs text-gris-dark whitespace-nowrap">
                        {m.cant_adjuntos > 0 && <span title={`${m.cant_adjuntos} adjunto${m.cant_adjuntos === 1 ? '' : 's'}`}>📎{m.cant_adjuntos}</span>}
                        {m.origen === 'conciliacion' && <span className="ml-1" title="Viene de la conciliación bancaria">🔗</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="md:hidden divide-y divide-gris">
              {items.map(m => (
                <button key={m.id} type="button" onClick={() => setAbierto(m.id)}
                  className={`w-full text-left p-3 flex flex-col gap-1 ${m.estado === 'anulado' ? 'opacity-60' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[11px] text-gris-dark">{numeroMovimiento(m.numero)} · {fmtFecha(m.fecha)}</div>
                      <div className="text-sm truncate">{m.concepto_nombre ?? cuentasMovimiento(m)}</div>
                      <div className="text-xs text-gris-dark truncate">{cuentasMovimiento(m)}{m.referencia ? ` · ${m.referencia}` : ''}</div>
                    </div>
                    <div className="text-right flex flex-col items-end gap-1">
                      <Importe m={m} />
                      <ChipTipo m={m} />
                    </div>
                  </div>
                  <div className="text-[11px] text-gris-dark">
                    {m.asiento_id ? `Asiento ${m.asiento_numero ? `N° ${m.asiento_numero}` : 's/n'}` : 'Sin asiento'}
                    {m.cant_adjuntos > 0 ? ` · 📎${m.cant_adjuntos}` : ''}
                  </div>
                </button>
              ))}
            </div>
          </Tarjeta>
        )}

      {total > PAGE_SIZE && <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />}

      {idModal !== undefined && (
        <ModalMovimientoFondos key={idModal ?? 'nuevo'} id={idModal} onClose={cerrarModal}
          onCreado={id => setAbierto(id)}
          onVerAsiento={id => { cerrarModal(); visor.abrir(id) }} />
      )}
      {visor.modales}
    </div>
  )
}

function ChipTipo({ m }: { m: Pick<TesMovimiento, 'tipo' | 'estado'> }) {
  const t = tipoMovimiento(m.tipo)
  return (
    <span className="inline-flex gap-1 items-center">
      <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase whitespace-nowrap ${t.clase}`}>{t.icono} {t.label}</span>
      {m.estado === 'anulado' && <span className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase bg-gris text-gris-dark">Anulado</span>}
    </span>
  )
}

function Importe({ m }: { m: TesMovimiento }) {
  const signo = m.tipo === 'egreso' ? '−' : m.tipo === 'ingreso' ? '+' : ''
  const color = m.tipo === 'egreso' ? 'text-rojo' : m.tipo === 'ingreso' ? 'text-verde' : 'text-azul'
  return (
    <span className="flex flex-col items-end">
      <span className={`font-mono text-sm tabular-nums font-bold ${m.estado === 'anulado' ? 'line-through text-gris-dark' : color}`}>
        {signo}{fmtMoneda(m.importe, m.tesoreria_moneda)}
      </span>
      {(m.tesoreria_moneda === 'USD' || (m.destino_moneda && m.destino_moneda !== m.tesoreria_moneda)) && (
        <span className="text-[10px] text-gris-dark font-mono tabular-nums">= {fmtM(m.importe_ars)}</span>
      )}
    </span>
  )
}

function ChipAsiento({ m, onAbrir }: { m: TesMovimiento; onAbrir: (id: number) => void }) {
  if (m.estado === 'anulado' && !m.asiento_id) return <span className="text-[11px] text-gris-dark">—</span>
  if (!m.asiento_id) {
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase bg-naranja-light text-naranja-dark whitespace-nowrap"
        title="Se genera al contabilizar (Automáticos › circuito Fondos). Si queda pendiente, al concepto le falta la cuenta en Mapeos.">
        Sin asiento
      </span>
    )
  }
  return (
    <button type="button" onClick={() => onAbrir(m.asiento_id!)}
      className="text-[11px] px-1.5 py-0.5 rounded bg-verde-light text-verde font-bold whitespace-nowrap hover:underline"
      title="Abrir el asiento">
      Asiento {m.asiento_numero ? `N° ${m.asiento_numero}` : 's/n'}
    </button>
  )
}
