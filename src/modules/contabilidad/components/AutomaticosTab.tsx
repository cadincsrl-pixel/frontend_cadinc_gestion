'use client'

import { useMemo, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Pagination } from '@/components/ui/Pagination'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import type { CtbCircuito, CtbFuente, CtbPendienteEstado } from '@/types/contabilidad.types'
import { useConfigCtb, useContabilizar, useMapeos, usePendientes, type PendientesFiltro } from '../hooks/useContabilidad'
import {
  CIRCUITOS_CTB, ESTADOS_PENDIENTE, MEMORIA_CIRCUITOS, estadoPendiente, fmtFecha, fmtM, fuenteLabel, fuentesDeCircuitos,
  hoyAR, leerCircuitosGuardados, nombrarCircuitos,
} from '../utils/contabilidad.utils'
import { mensajeErrorCtb, mensajeMotivo } from '../utils/contabilidad.errores'
import { Aviso, Campo, Cargando, Cifra, ErrorCarga, Tarjeta, Th, Vacio, inputCls } from './Comun'
import { ModalPropuesta } from './ModalPropuesta'
import { useVisorAsiento } from './VisorAsiento'

const PAGE_SIZE = 50

/** A dónde lleva «Ir al origen». Los externos no tienen ficha por id: se llega a la pantalla. */
function urlOrigen(tabla: CtbFuente, id: number): string {
  switch (tabla) {
    case 'pagos_facturas':               return `/pagos?tab=facturas&ficha=${id}`
    case 'pagos_ordenes':                return `/pagos?tab=pagos&ficha=${id}`
    case 'ventas_facturas':              return `/facturacion?tab=facturas&ficha=${id}`
    case 'ventas_cobros':                return `/facturacion?tab=cobranzas&ficha=${id}`
    case 'ventas_comprobantes_externos': return '/facturacion?tab=saldos_iniciales'
    case 'tesoreria_movimientos':        return `/contabilidad?tab=tesoreria&mov=${id}`
  }
}

// ── Memoria de los circuitos tildados (localStorage) ──
function suscribirCircuitos(cb: () => void): () => void {
  window.addEventListener('storage', cb)
  return () => window.removeEventListener('storage', cb)
}

function leerRawCircuitos(): string | null {
  try { return window.localStorage.getItem(MEMORIA_CIRCUITOS) } catch { return null }
}

function guardarCircuitos(c: CtbCircuito[]): void {
  try {
    window.localStorage.setItem(MEMORIA_CIRCUITOS, JSON.stringify(c))
  } catch {
    // Navegador privado o storage bloqueado: no se recuerda.
  }
}

/**
 * El motor de asientos automáticos (fase 3): qué comprobantes de Ventas,
 * Compras y movimientos de fondos no están contabilizados (o quedaron desactualizados), POR QUÉ, y el
 * botón para contabilizar hasta una fecha.
 *
 * Nunca inventa una cuenta: si falta un mapeo, el origen queda «pendiente»
 * con su motivo y el botón «Mapear» lleva a la pantalla de mapeos con esa
 * clave. Un cambio de mapeo en un período cerrado NO genera contraasientos
 * solo: hay que pedirlo con el tilde (y con permiso de cerrar períodos).
 */
export function AutomaticosTab() {
  const toast = useToast()
  const router = useRouter()
  const { puedeEditar, contabilizar: puedeContabilizar, cerrarPeriodos, esAdmin } = usePermisos('contabilidad')
  const visor = useVisorAsiento()
  const config = useConfigCtb()
  const mapeos = useMapeos()

  const [filtro, setFiltro] = useState<PendientesFiltro>({})
  const [page, setPage] = useState(1)
  const [propuesta, setPropuesta] = useState<{ tabla: CtbFuente; id: number } | null>(null)
  const [hasta, setHasta] = useState(hoyAR())
  const [revertir, setRevertir] = useState(false)
  // Circuitos tildados, como en Bejerman. Se recuerdan en localStorage
  // (comodidad de quien mira). useSyncExternalStore: en el server y en la
  // hidratación da los cuatro; después, lo guardado.
  const circuitosRaw = useSyncExternalStore(suscribirCircuitos, leerRawCircuitos, () => null)
  const guardados = useMemo(() => leerCircuitosGuardados(circuitosRaw), [circuitosRaw])
  // Lo que se tildó en esta visita manda (también si el storage está bloqueado
  // o si se destildaron todos: guardado, eso vuelve a los cuatro).
  const [elegidos, setElegidos] = useState<CtbCircuito[] | null>(null)
  const circuitos = elegidos ?? guardados
  function alternarCircuito(c: CtbCircuito) {
    const nuevo = circuitos.includes(c) ? circuitos.filter(x => x !== c) : [...circuitos, c]
    setElegidos(nuevo)
    guardarCircuitos(nuevo)
    setPage(1)
  }
  const fuentes = fuentesDeCircuitos(circuitos)
  const sinCircuitos = circuitos.length === 0

  const q = usePendientes({ ...filtro, fuentes }, page, PAGE_SIZE, !sinCircuitos)
  const conta = useContabilizar()

  const patch = (p: Partial<PendientesFiltro>) => { setFiltro(f => ({ ...f, ...p })); setPage(1) }
  const etiquetaClave = (c: string) => mapeos.data?.claves.find(k => k.clave === c)?.etiqueta

  const bloqueoConta = !(puedeContabilizar || esAdmin) ? 'No tenés permiso (hace falta «Contabilizar automáticos»)'
    : !puedeEditar ? 'No tenés permiso de Editar en Contabilidad'
    : sinCircuitos ? 'Elegí al menos un circuito'
    : !hasta ? 'Elegí hasta qué fecha'
    : hasta > hoyAR() ? 'La fecha no puede ser futura' : null
  const bloqueoRevertir = !(cerrarPeriodos || esAdmin) ? 'Hace falta además «Cerrar y reabrir períodos»' : null

  async function correr() {
    try {
      const r = await conta.mutateAsync({
        hasta, revertir_cerrados: revertir && !bloqueoRevertir, ...(fuentes ? { fuentes } : {}),
      })
      const partes = [
        r.creados && `${r.creados} creados`, r.regenerados && `${r.regenerados} regenerados`,
        r.anulados && `${r.anulados} anulados`, r.revertidos && `${r.revertidos} revertidos`,
      ].filter(Boolean).join(' · ')
      toast(`✓ Contabilizado${fuentes ? ` ${nombrarCircuitos(circuitos)}` : ''} hasta el ${fmtFecha(hasta)}${partes ? `: ${partes}` : ': nada nuevo'}`, r.errores > 0 ? 'warn' : 'ok')
    } catch (e) {
      toast(mensajeErrorCtb(e), 'err')
    }
  }

  const res = q.data?.resumen
  const items = q.data?.items ?? []
  const total = q.data?.total ?? 0
  const prog = conta.progreso

  return (
    <div className="flex flex-col gap-3">
      {/* Circuitos */}
      <Tarjeta className="p-3 flex flex-col gap-1.5">
        <div className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">Circuitos</div>
        <div className="flex flex-wrap gap-x-5 gap-y-1.5">
          {CIRCUITOS_CTB.map(c => {
            const tildado = circuitos.includes(c.key)
            const n = tildado && res ? c.fuentes.reduce((acc, f) => acc + (res.por_fuente[f] ?? 0), 0) : null
            return (
              <label key={c.key} className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
                <input type="checkbox" className="accent-naranja" checked={tildado} onChange={() => alternarCircuito(c.key)} />
                {c.label} <span className="text-xs text-gris-dark tabular-nums">({n ?? '—'})</span>
              </label>
            )
          })}
        </div>
        <p className="text-[11px] text-gris-dark">
          Filtran lo que se ve abajo y lo que corre «Contabilizar». Cerrar un período mira todos los circuitos, no solo los tildados.
          {' '}Fondos son los movimientos sin factura de Tesorería (comisiones, impuesto al cheque, VEP, transferencias): cada concepto necesita su cuenta en Mapeos.
        </p>
      </Tarjeta>

      {/* Contabilizar */}
      <Tarjeta className="p-3 flex flex-col gap-2">
        <div className="flex flex-wrap gap-2 items-end">
          <Campo label="Contabilizar hasta">
            <input type="date" value={hasta} max={hoyAR()} onChange={e => setHasta(e.target.value)} className={inputCls} />
          </Campo>
          <label className={`flex items-center gap-1.5 text-xs select-none pb-2 ${bloqueoRevertir ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
            title={bloqueoRevertir ?? 'Si un asiento de un mes cerrado quedó desactualizado, se anula con un contraasiento en el primer mes abierto y se genera uno nuevo'}>
            <input type="checkbox" className="accent-naranja" checked={revertir && !bloqueoRevertir} disabled={!!bloqueoRevertir}
              onChange={e => setRevertir(e.target.checked)} />
            Corregir también en períodos cerrados (genera contraasientos)
          </label>
          <Button onClick={correr} loading={conta.isPending} disabled={!!bloqueoConta || conta.isPending}
            title={bloqueoConta ?? `Generar o regenerar los asientos de ${fuentes ? nombrarCircuitos(circuitos) : 'todos los circuitos'} hasta esa fecha`} className="ml-auto">
            ⚙️ Contabilizar
          </Button>
        </div>
        <p className="text-[11px] text-gris-dark">
          Desde el {config.data ? fmtFecha(config.data.automaticos_desde) : '01/07/2026'}. Un comprobante sin cuenta mapeada queda
          pendiente con su motivo: nunca se inventa una cuenta. Se puede correr las veces que haga falta.
        </p>
        {prog && (
          <div className="text-xs flex flex-wrap gap-x-3 gap-y-1 items-center">
            {conta.isPending && <span className="text-gris-dark">Procesando… (tanda {prog.vueltas + 1})</span>}
            <span>Procesados <b className="tabular-nums">{prog.acumulado.procesados}</b></span>
            <span className="text-verde">Creados <b className="tabular-nums">{prog.acumulado.creados}</b></span>
            <span>Regenerados <b className="tabular-nums">{prog.acumulado.regenerados}</b></span>
            <span>Anulados <b className="tabular-nums">{prog.acumulado.anulados}</b></span>
            <span>Revertidos <b className="tabular-nums">{prog.acumulado.revertidos}</b></span>
            <span className="text-gris-dark">Sin cambios <b className="tabular-nums">{prog.acumulado.sin_cambios}</b></span>
            <span className="text-naranja-dark">Pendientes <b className="tabular-nums">{prog.acumulado.pendientes}</b></span>
            <span className="text-[#7A5000]">Desactualizados <b className="tabular-nums">{prog.acumulado.desactualizados}</b></span>
            {prog.acumulado.errores > 0 && <span className="text-rojo">Errores <b className="tabular-nums">{prog.acumulado.errores}</b></span>}
            {!conta.isPending && <button type="button" className="text-azul underline" onClick={conta.limpiar}>ocultar</button>}
          </div>
        )}
        {prog && prog.acumulado.detalle_errores.length > 0 && (
          <Aviso tono="rojo">
            <b>No se pudieron procesar:</b>
            <ul className="list-disc ml-4 mt-1">
              {prog.acumulado.detalle_errores.slice(0, 10).map((e, i) => (
                <li key={i}>{fuenteLabel(e.origen_tabla)} #{e.origen_id}: {e.mensaje || e.codigo}</li>
              ))}
            </ul>
          </Aviso>
        )}
      </Tarjeta>

      {/* Resumen por estado y fuente */}
      {res && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2 flex-wrap">
            {ESTADOS_PENDIENTE.map(e => (
              <button key={e.key} type="button" title={e.hint}
                onClick={() => patch({ estado: filtro.estado === e.key ? '' : e.key })}
                className={`flex-1 min-w-[130px] text-left rounded-card ${filtro.estado === e.key ? 'ring-2 ring-naranja' : ''}`}>
                <Cifra label={e.label} valor={String(res.por_estado[e.key] ?? 0)}
                  tono={e.key === 'a_revertir' && (res.por_estado[e.key] ?? 0) > 0 ? 'rojo' : e.key === 'pendiente' && (res.por_estado[e.key] ?? 0) > 0 ? 'naranja' : 'normal'} />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Por qué no se contabiliza */}
      {res && res.por_motivo.length > 0 && (
        <Tarjeta className="overflow-hidden">
          <div className="px-3 py-2 text-[11px] font-bold text-gris-dark uppercase tracking-wide border-b border-gris">Por qué no se contabiliza</div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[560px]">
              <thead><tr><Th>Motivo</Th><Th derecha>Comprobantes</Th><Th /></tr></thead>
              <tbody>
                {res.por_motivo.map((m, i) => {
                  const activo = filtro.motivo === m.codigo
                  return (
                    <tr key={`${m.codigo}-${m.clave}-${m.subclave}-${i}`} className={`border-t border-gris ${activo ? 'bg-naranja-light/40' : ''}`}>
                      <td className="px-3 py-1.5 text-sm">{mensajeMotivo({ codigo: m.codigo, detalle: { clave: m.clave, subclave: m.subclave } }, etiquetaClave)}</td>
                      <td className="px-3 py-1.5 text-xs text-right tabular-nums">{m.cantidad}</td>
                      <td className="px-3 py-1.5 text-right whitespace-nowrap">
                        <Button size="sm" variant="ghost" onClick={() => patch({ motivo: activo ? undefined : m.codigo })}>
                          {activo ? 'Quitar filtro' : 'Ver'}
                        </Button>
                        {m.codigo === 'SIN_MAPEO' && m.clave && (
                          <Button size="sm" variant="secondary"
                            onClick={() => router.push(`/contabilidad?tab=mapeos&clave=${encodeURIComponent(m.clave!)}`)}
                            title="Ir a elegir la cuenta para esto">
                            Mapear
                          </Button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Tarjeta>
      )}

      {/* Filtros */}
      <Tarjeta className="p-3 grid grid-cols-2 md:grid-cols-[150px_150px_1fr_auto] gap-2 items-end">
        <Campo label="Desde">
          <input type="date" value={filtro.desde ?? ''} onChange={e => patch({ desde: e.target.value || undefined })} className={inputCls} />
        </Campo>
        <Campo label="Hasta">
          <input type="date" value={filtro.hasta ?? ''} min={filtro.desde || undefined} onChange={e => patch({ hasta: e.target.value || undefined })} className={inputCls} />
        </Campo>
        <Campo label="Estado">
          <select value={filtro.estado ?? ''} onChange={e => patch({ estado: e.target.value as CtbPendienteEstado | '' })} className={inputCls}>
            <option value="">Todos</option>
            {ESTADOS_PENDIENTE.map(e => <option key={e.key} value={e.key}>{e.label}</option>)}
          </select>
        </Campo>
        <Button variant="ghost" size="sm" onClick={() => { setFiltro({}); setPage(1) }}
          disabled={!filtro.desde && !filtro.hasta && !filtro.estado && !filtro.motivo}>
          ✕ Limpiar
        </Button>
        {filtro.motivo && (
          <div className="col-span-full text-xs text-gris-dark">
            Filtrando por motivo: <b>{mensajeMotivo({ codigo: filtro.motivo, detalle: null }, etiquetaClave)}</b>{' '}
            <button type="button" className="text-azul underline" onClick={() => patch({ motivo: undefined })}>quitar</button>
          </div>
        )}
      </Tarjeta>

      {/* Lista */}
      {sinCircuitos ? <Vacio>Tildá al menos un circuito para ver qué falta contabilizar.</Vacio>
        : q.isLoading ? <Cargando texto="Calculando qué falta contabilizar…" />
        : q.isError ? <ErrorCarga mensaje={mensajeErrorCtb(q.error)} onReintentar={() => void q.refetch()} />
        : items.length === 0 ? (
          <Vacio>{Object.values(filtro).some(Boolean) ? 'No hay comprobantes con estos filtros.' : 'Todo al día: no hay comprobantes sin contabilizar ni desactualizados.'}</Vacio>
        ) : (
          <Tarjeta className={`overflow-hidden ${q.isFetching ? 'opacity-70' : ''}`}>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full border-collapse min-w-[980px]">
                <thead>
                  <tr><Th>Fecha</Th><Th>Fuente</Th><Th>Descripción</Th><Th derecha>Importe</Th><Th>Estado</Th><Th>Motivo</Th><Th /></tr>
                </thead>
                <tbody>
                  {items.map(it => {
                    const est = estadoPendiente(it.estado)
                    return (
                      <tr key={`${it.origen_tabla}-${it.origen_id}`} className="border-t border-gris align-top">
                        <td className="px-3 py-2 text-xs whitespace-nowrap">{fmtFecha(it.fecha)}</td>
                        <td className="px-3 py-2 text-xs whitespace-nowrap">{fuenteLabel(it.origen_tabla)}</td>
                        <td className="px-3 py-2 text-sm max-w-[340px] truncate" title={it.descripcion}>{it.descripcion}</td>
                        <td className="px-3 py-2 text-xs text-right font-mono tabular-nums whitespace-nowrap">{fmtM(it.importe)}</td>
                        <td className="px-3 py-2">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase whitespace-nowrap ${est.clase}`} title={est.hint}>{est.label}</span>
                          {it.asiento_periodo_estado === 'cerrado' && <span className="ml-1 text-[10px]" title="El asiento actual está en un período cerrado">🔒</span>}
                        </td>
                        <td className="px-3 py-2 text-xs text-gris-dark max-w-[300px]">
                          {it.motivos.map((m, i) => <div key={i}>{mensajeMotivo(m, etiquetaClave)}</div>)}
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          <Acciones tabla={it.origen_tabla} id={it.origen_id} asientoId={it.asiento_id}
                            onPropuesta={() => setPropuesta({ tabla: it.origen_tabla, id: it.origen_id })}
                            onAsiento={visor.abrir} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="md:hidden divide-y divide-gris">
              {items.map(it => {
                const est = estadoPendiente(it.estado)
                return (
                  <div key={`${it.origen_tabla}-${it.origen_id}`} className="p-3 flex flex-col gap-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[11px] text-gris-dark">{fmtFecha(it.fecha)} · {fuenteLabel(it.origen_tabla)}</div>
                        <div className="text-sm truncate">{it.descripcion}</div>
                      </div>
                      <div className="text-right flex flex-col items-end gap-1">
                        <span className="font-mono font-bold tabular-nums text-sm">{fmtM(it.importe)}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${est.clase}`}>{est.label}</span>
                      </div>
                    </div>
                    {it.motivos.map((m, i) => <div key={i} className="text-xs text-gris-dark">{mensajeMotivo(m, etiquetaClave)}</div>)}
                    <div className="flex gap-1 flex-wrap">
                      <Acciones tabla={it.origen_tabla} id={it.origen_id} asientoId={it.asiento_id}
                        onPropuesta={() => setPropuesta({ tabla: it.origen_tabla, id: it.origen_id })}
                        onAsiento={visor.abrir} />
                    </div>
                  </div>
                )
              })}
            </div>
          </Tarjeta>
        )}

      {total > PAGE_SIZE && <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />}

      {propuesta && (
        <ModalPropuesta tabla={propuesta.tabla} id={propuesta.id} onClose={() => setPropuesta(null)}
          onVerAsiento={id => { setPropuesta(null); visor.abrir(id) }} />
      )}
      {visor.modales}
    </div>
  )
}

function Acciones({ tabla, id, asientoId, onPropuesta, onAsiento }: {
  tabla: CtbFuente; id: number; asientoId: number | null
  onPropuesta: () => void; onAsiento: (id: number) => void
}) {
  return (
    <>
      <Button size="sm" variant="ghost" onClick={onPropuesta} title="El asiento que se generaría, contra el actual">Propuesta</Button>
      <Link href={urlOrigen(tabla, id)} className="text-xs px-2 py-1 rounded text-azul hover:bg-azul-light font-semibold"
        title={tabla === 'ventas_comprobantes_externos' ? 'Lleva a Saldos iniciales (buscalo por número)' : 'Abrir el comprobante de origen'}>
        Ir al origen
      </Link>
      <Button size="sm" variant="ghost" disabled={!asientoId} onClick={() => asientoId && onAsiento(asientoId)}
        title={asientoId ? 'Abrir el asiento actual' : 'Todavía no tiene asiento'}>
        Ver asiento
      </Button>
    </>
  )
}
