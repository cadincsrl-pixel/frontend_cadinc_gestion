'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Pagination } from '@/components/ui/Pagination'
import { usePermisos } from '@/hooks/usePermisos'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import type { CtbAsientoEstado, CtbAsientoTipo } from '@/types/contabilidad.types'
import { useAsientos, type AsientosFiltro } from '../hooks/useContabilidad'
import { TIPOS_ASIENTO, fmtFecha, fmtM, mesActual, numeroAsiento, tipoAsientoLabel } from '../utils/contabilidad.utils'
import { mensajeErrorCtb } from '../utils/contabilidad.errores'
import { Campo, Cargando, ErrorCarga, EstadoAsiento, RangoFechas, Tarjeta, Th, Vacio, inputCls } from './Comun'
import { SelectorCuenta } from './SelectorCuenta'
import { useVisorAsiento } from './VisorAsiento'

const PAGE_SIZE = 50

const ESTADOS: { key: 'todos' | CtbAsientoEstado; label: string }[] = [
  { key: 'todos',      label: 'Todos' },
  { key: 'borrador',   label: 'Borradores' },
  { key: 'confirmado', label: 'Confirmados' },
  { key: 'anulado',    label: 'Anulados' },
]

const esEstado = (v: string | null): v is 'todos' | CtbAsientoEstado => !!v && ESTADOS.some(e => e.key === v)

/**
 * Los asientos: filtros (rango, estado, tipo, texto, cuenta) y la tabla
 * paginada en el server. Cada fila abre la ficha. Acepta `?estado=&desde=&hasta=`
 * en la URL (el link «N borradores» de Períodos).
 */
export function AsientosTab() {
  const sp = useSearchParams()
  const { puedeCrear, asientosManuales } = usePermisos('contabilidad')
  const visor = useVisorAsiento()

  const mes = mesActual()
  const [rango, setRango] = useState({ desde: sp.get('desde') ?? mes.desde, hasta: sp.get('hasta') ?? mes.hasta })
  const [estado, setEstado] = useState<'todos' | CtbAsientoEstado>(esEstado(sp.get('estado')) ? sp.get('estado') as 'todos' | CtbAsientoEstado : 'todos')
  const [tipo, setTipo] = useState<CtbAsientoTipo | ''>('')
  const [texto, setTexto] = useState('')
  const [cuentaId, setCuentaId] = useState('')
  const [page, setPage] = useState(1)
  const q = useDebouncedValue(texto, 350)

  const filtro: AsientosFiltro = {
    desde: rango.desde || undefined, hasta: rango.hasta || undefined, estado, tipo, q,
    cuenta_id: cuentaId ? Number(cuentaId) : null,
  }
  const { data, isLoading, isError, error, refetch, isFetching } = useAsientos(filtro, page, PAGE_SIZE)

  const cambiar = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1) }

  const bloqueoNuevo = !asientosManuales ? 'No tenés permiso para cargar asientos (hace falta «Cargar asientos manuales»)'
    : !puedeCrear ? 'No tenés permiso de Crear en Contabilidad' : null

  const items = data?.items ?? []

  return (
    <div className="flex flex-col gap-3">
      <Tarjeta className="p-3 flex flex-col gap-2">
        <div className="grid grid-cols-2 md:grid-cols-[150px_150px_150px_150px_1fr] gap-2 items-end">
          <RangoFechas desde={rango.desde} hasta={rango.hasta} onChange={cambiar(setRango)} />
          <Campo label="Estado">
            <select value={estado} onChange={e => cambiar(setEstado)(e.target.value as 'todos' | CtbAsientoEstado)} className={inputCls}>
              {ESTADOS.map(e => <option key={e.key} value={e.key}>{e.label}</option>)}
            </select>
          </Campo>
          <Campo label="Tipo">
            <select value={tipo} onChange={e => cambiar(setTipo)(e.target.value as CtbAsientoTipo | '')} className={inputCls}>
              <option value="">Todos</option>
              {TIPOS_ASIENTO.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </Campo>
          <Campo label="Buscar" hint="glosa o número" className="col-span-2 md:col-span-1">
            <input value={texto} onChange={e => { setTexto(e.target.value); setPage(1) }} placeholder="Ej.: aporte, 125" className={inputCls} />
          </Campo>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 items-end">
          <SelectorCuenta modo="todas" label="Que mueva la cuenta (incluye subcuentas)" value={cuentaId}
            onChange={id => { setCuentaId(id); setPage(1) }} placeholder="Todas las cuentas" />
          <Button onClick={visor.nuevo} disabled={!!bloqueoNuevo} title={bloqueoNuevo ?? 'Cargar un asiento manual'}>
            + Nuevo asiento
          </Button>
        </div>
      </Tarjeta>

      {isLoading ? <Cargando /> : isError ? (
        <ErrorCarga mensaje={mensajeErrorCtb(error)} onReintentar={() => void refetch()} />
      ) : items.length === 0 ? (
        <Vacio>No hay asientos con estos filtros.</Vacio>
      ) : (
        <Tarjeta className={`overflow-hidden ${isFetching ? 'opacity-70' : ''}`}>
          {/* Tabla en pantallas medianas para arriba */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th>Fecha</Th><Th>N°</Th><Th>Tipo</Th><Th>Glosa</Th><Th derecha>Total</Th><Th>Estado</Th><Th derecha>Líneas</Th><Th>Cargó</Th>
                </tr>
              </thead>
              <tbody>
                {items.map(a => (
                  <tr key={a.id} onClick={() => visor.abrir(a.id)}
                    className={`border-t border-gris hover:bg-azul-light/30 cursor-pointer ${a.estado === 'anulado' ? 'opacity-60' : ''}`}>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">{fmtFecha(a.fecha)}</td>
                    <td className="px-3 py-2 text-xs font-mono whitespace-nowrap">
                      {numeroAsiento(a.numero)}
                      {a.periodo_estado === 'cerrado' && <span className="ml-1" title="Período cerrado">🔒</span>}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {tipoAsientoLabel(a.tipo)}
                      {a.revierte_id && <span className="block text-[10px] text-gris-dark">contraasiento</span>}
                      {a.revertido_por_id && <span className="block text-[10px] text-gris-dark">revertido</span>}
                    </td>
                    <td className="px-3 py-2 text-sm max-w-[420px] truncate" title={a.glosa}>{a.glosa}</td>
                    <td className="px-3 py-2 text-xs text-right font-mono tabular-nums font-bold whitespace-nowrap">{fmtM(a.total)}</td>
                    <td className="px-3 py-2"><EstadoAsiento estado={a.estado} /></td>
                    <td className="px-3 py-2 text-xs text-right tabular-nums">{a.cant_lineas}</td>
                    <td className="px-3 py-2 text-xs text-gris-dark whitespace-nowrap">{a.created_by_nombre ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Tarjetas en celular */}
          <div className="md:hidden divide-y divide-gris">
            {items.map(a => (
              <button key={a.id} type="button" onClick={() => visor.abrir(a.id)}
                className={`w-full text-left p-3 ${a.estado === 'anulado' ? 'opacity-60' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[11px] text-gris-dark">
                      {fmtFecha(a.fecha)} · {numeroAsiento(a.numero)} · {tipoAsientoLabel(a.tipo)}
                    </div>
                    <div className="text-sm truncate">{a.glosa}</div>
                  </div>
                  <div className="text-right flex flex-col items-end gap-1">
                    <span className="font-mono font-bold tabular-nums text-sm">{fmtM(a.total)}</span>
                    <EstadoAsiento estado={a.estado} />
                  </div>
                </div>
              </button>
            ))}
          </div>
        </Tarjeta>
      )}

      {(data?.total ?? 0) > PAGE_SIZE && (
        <Pagination page={page} total={data?.total ?? 0} pageSize={PAGE_SIZE} onChange={setPage} />
      )}

      {visor.modales}
    </div>
  )
}
