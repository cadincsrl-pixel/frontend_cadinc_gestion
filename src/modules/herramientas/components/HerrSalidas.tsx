'use client'

import { useEffect, useMemo, useState } from 'react'
import { useHerrEntregas, useHerrEntregasStats, useMarcarEntrega } from '../hooks/useHerrEntregas'
import { useObras } from '@/modules/tarja/hooks/useObras'
import { usePermisos } from '@/hooks/usePermisos'
import { useToast } from '@/components/ui/Toast'
import { Pagination } from '@/components/ui/Pagination'
import { Input } from '@/components/ui/Input'
import type { HerrEntrega, HerrEntregaEstado } from '@/types/domain.types'

/**
 * Salidas a obra — la bandeja del pañol.
 *
 * Muestra lo que salió de pedidos y es (o parece) herramienta. Las filas las
 * escribe el trigger sobre `cantidad_enviada`; acá solo se leen y se archivan.
 *
 * FASE 1 NO TOCA EL PADRÓN a propósito. En producción hay 12 textos distintos
 * para la misma amoladora y 35 para "escalera": dar de alta automáticamente
 * dejaría ~159 fichas para ~40 objetos reales. Vincular a un HER-NNN existente
 * o dar de alta es decisión de un humano, y va en fase 2.
 */

const PAGE_SIZE = 25

const ORIGEN_LABEL: Record<HerrEntrega['origen'], { txt: string; cls: string; title: string }> = {
  clase:    { txt: '✓ tildada',  cls: 'bg-verde-light text-verde',        title: 'Se cargó marcada como herramienta en el pedido' },
  catalogo: { txt: '📕 catálogo', cls: 'bg-azul-light text-azul',          title: 'El material del catálogo está marcado como herramienta' },
  patron:   { txt: '🔍 detectada', cls: 'bg-amarillo-light text-[#7A5500]', title: 'La detectó el texto de la descripción, nadie la tildó' },
  manual:   { txt: '✍ a mano',   cls: 'bg-gris text-gris-dark',           title: 'Cargada a mano' },
}

const TABS: { key: HerrEntregaEstado | 'todas'; label: string }[] = [
  { key: 'pendiente',  label: 'Sin revisar' },
  { key: 'confirmada', label: 'Confirmadas' },
  { key: 'revisar',    label: 'A revisar' },
  { key: 'ignorada',   label: 'Archivadas' },
  { key: 'todas',      label: 'Todas' },
]

function fmtFecha(s: string | null | undefined) {
  if (!s) return '—'
  // `fecha` es un DATE puro (YYYY-MM-DD). Construir un Date con eso lo parsea
  // como UTC y en Argentina se corre un día para atrás. Se formatea a mano.
  const [a, m, d] = s.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

export function HerrSalidas() {
  const { puedeEditar } = usePermisos('herramientas')
  const toast = useToast()

  const [tab, setTab]           = useState<HerrEntregaEstado | 'todas'>('pendiente')
  const [obraCod, setObraCod]   = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [page, setPage]         = useState(1)

  // Debounce: `busqueda` es parte de la queryKey, así que sin esto cada tecla
  // disparaba un request y, al no haber cache para esa key nueva, el componente
  // se iba a la rama del spinner y desmontaba la lista en cada letra.
  const [busquedaAplicada, setBusquedaAplicada] = useState('')
  useEffect(() => {
    const t = setTimeout(() => { setBusquedaAplicada(busqueda.trim()); setPage(1) }, 350)
    return () => clearTimeout(t)
  }, [busqueda])

  const filtro = {
    ...(tab !== 'todas' ? { estado: tab } : {}),
    ...(obraCod ? { obra_cod: obraCod } : {}),
    ...(busquedaAplicada ? { q: busquedaAplicada } : {}),
    limit:  PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  }


  const { data, isLoading, isError, error, refetch } = useHerrEntregas(filtro)
  const { data: stats, isError: statsError } = useHerrEntregasStats()
  const { data: obras = [] } = useObras()
  const { mutate: marcar, isPending } = useMarcarEntrega()

  // `?? []` crea un array nuevo en cada render y rompía la memo del selector
  // de obras (se recalculaba siempre).
  const items = useMemo(() => data?.items ?? [], [data])
  const total = data?.total ?? 0

  const obraNom = useMemo(() => {
    const m = new Map<string, string>()
    for (const o of obras) m.set(o.cod, o.nom)
    return m
  }, [obras])

  // Las obras del selector vienen del BACKEND, no del listado: el listado está
  // paginado, así que derivarlas de la página actual dejaba fuera del filtro a
  // toda obra que no cayera en la página que estás mirando.
  const obrasConSalidas = stats?.obras_lista ?? []

  function cambiarTab(k: HerrEntregaEstado | 'todas') { setTab(k); setPage(1) }

  // "Sí, es herramienta y ya la vi." Saca la fila de la bandeja SIN tocar el
  // padrón (eso es fase 2). Sin esto, la única forma de vaciar la bandeja era
  // archivar herramientas reales como "no es herramienta".
  function confirmar(e: HerrEntrega) {
    const eraLaUltima = items.length === 1 && page > 1
    marcar({ id: e.id, estado: 'confirmada' }, {
      onSuccess: () => { if (eraLaUltima) setPage(p => p - 1); toast('Confirmada', 'ok') },
      onError:   (err: unknown) => toast((err as Error).message || 'Error', 'err'),
    })
  }

  function archivar(e: HerrEntrega) {
    // Si era la última fila de la página, hay que retroceder: si no, la request
    // siguiente pide un offset que ya no existe y la lista se ve vacía, como si
    // no quedara nada pendiente. Va acá y no en un efecto (React 19 prohíbe el
    // set-state-in-effect, y acá además se sabe exactamente cuándo pasa).
    const eraLaUltima = items.length === 1 && page > 1
    marcar({ id: e.id, estado: 'ignorada' }, {
      onSuccess: () => { if (eraLaUltima) setPage(p => p - 1); toast('Archivada', 'ok') },
      onError:   (err: unknown) => toast((err as Error).message || 'Error', 'err'),
    })
  }

  function desarchivar(e: HerrEntrega) {
    marcar({ id: e.id, estado: 'pendiente' }, {
      onSuccess: () => toast('Vuelta a la bandeja', 'ok'),
      onError:   (err: unknown) => toast((err as Error).message || 'Error', 'err'),
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Encabezado */}
      <div>
        <h1 className="text-xl font-bold text-carbon">📤 Salidas a obra</h1>
        <p className="text-xs text-gris-dark mt-1 max-w-2xl">
          Herramientas que salieron de un pedido con remito. Se registran solas: no hay que cargar nada.
          Todavía <b>no se dan de alta en el inventario</b> — esto es la referencia de qué se llevó cada obra.
        </p>
      </div>

      {/* Contadores */}
      <div className="flex flex-wrap gap-2">
        <span className="px-3 py-1.5 rounded-lg bg-white shadow-card text-xs">
          <b className="text-carbon">{stats?.pendientes ?? '—'}</b>
          <span className="text-gris-dark ml-1">sin revisar</span>
        </span>
        <span className="px-3 py-1.5 rounded-lg bg-white shadow-card text-xs">
          <b className="text-carbon">{stats?.obras ?? '—'}</b>
          <span className="text-gris-dark ml-1">obras</span>
        </span>
        {(stats?.revisar ?? 0) > 0 && (
          <span className="px-3 py-1.5 rounded-lg bg-amarillo-light text-[#7A5500] text-xs font-bold">
            {stats?.revisar} a revisar
          </span>
        )}
        {/* Si esto aparece, el trigger se tragó un error y hay herramientas que
            salieron sin quedar registradas. Nunca debería verse. */}
        {statsError && (
          <span className="px-3 py-1.5 rounded-lg bg-amarillo-light text-[#7A5500] text-xs font-bold"
                title="No se pudieron leer los contadores; la alarma de faltantes no es confiable ahora mismo">
            ⚠ contadores no disponibles
          </span>
        )}
        {(stats?.faltantes ?? 0) > 0 && (
          <span
            className="px-3 py-1.5 rounded-lg bg-rojo text-white text-xs font-bold"
            title="Salieron herramientas que no quedaron registradas acá. Es un bug: avisá."
          >
            ⚠ {stats?.faltantes} sin registrar
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1.5">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => cambiarTab(t.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              tab === t.key ? 'bg-carbon text-white' : 'bg-gris text-gris-dark hover:bg-gris-mid'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex-1 min-w-0">
          <Input
            placeholder="Buscar por descripción…"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
          />
        </div>
        <select
          value={obraCod}
          onChange={e => { setObraCod(e.target.value); setPage(1) }}
          className="px-3 py-2 text-sm border-[1.5px] border-gris-mid rounded-lg outline-none focus:border-naranja bg-white sm:w-64"
        >
          <option value="">Todas las obras</option>
          {obrasConSalidas.map(o => {
            // El conteo tiene que hablar del tab que se está mirando: mostrar el
            // total mientras la lista filtra por 'pendiente' daba un número de
            // otro universo que el de la lista.
            const n = tab === 'pendiente' ? o.n_pendientes : o.n
            return <option key={o.cod} value={o.cod}>{(obraNom.get(o.cod) ?? o.cod)} ({n})</option>
          })}
        </select>
      </div>

      {/* Listado */}
      {isError ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center">
          <div className="text-sm font-bold text-rojo">No se pudo cargar la bandeja</div>
          <div className="text-xs text-gris-dark mt-1">{(error as Error)?.message ?? 'Error desconocido'}</div>
          <button onClick={() => void refetch()} className="mt-3 text-xs font-bold px-3 py-1.5 rounded bg-gris text-gris-dark hover:bg-azul-light hover:text-azul min-h-[36px]">
            Reintentar
          </button>
        </div>
      ) : isLoading ? (
        <div className="bg-white rounded-card shadow-card p-8 flex items-center justify-center gap-3 text-gris-dark">
          <span className="w-5 h-5 border-2 border-naranja border-t-transparent rounded-full animate-spin" />
          Cargando…
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-gris-dark text-sm italic">
          {tab === 'pendiente'
            ? 'Nada sin revisar. Cuando salga una herramienta en un remito, aparece sola acá.'
            : 'Sin resultados.'}
        </div>
      ) : (
        <div className="bg-white rounded-card shadow-card overflow-hidden divide-y divide-gris">
          {items.map(e => (
            <div key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3">
              <div className="flex-1 min-w-[12rem]">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-carbon">{e.descripcion}</span>
                  {e.cantidad > 1 && (
                    <span className="text-[11px] font-mono font-bold text-azul">
                      ×{e.cantidad}
                    </span>
                  )}
                  {e.sentido === 'devolucion' && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-verde-light text-verde">
                      ↩ vuelve al pañol
                    </span>
                  )}
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${ORIGEN_LABEL[e.origen].cls}`}
                    title={ORIGEN_LABEL[e.origen].title}
                  >
                    {ORIGEN_LABEL[e.origen].txt}
                  </span>
                </div>
                <div className="text-[11px] text-gris-dark mt-0.5 flex items-center gap-1.5 flex-wrap">
                  <span className="font-bold text-carbon">
                    {e.obra_cod ? (obraNom.get(e.obra_cod) ?? e.obra_cod) : 'sin obra'}
                  </span>
                  <span>·</span>
                  <span className="font-mono">{fmtFecha(e.fecha)}</span>
                  {e.remito_numero && (
                    <>
                      <span>·</span>
                      <span className="font-mono text-naranja font-bold">{e.remito_numero}</span>
                    </>
                  )}
                  {e.solicitud_id && (
                    <>
                      <span>·</span>
                      <span className="font-mono">pedido #{e.solicitud_id}</span>
                    </>
                  )}
                  {e.nota && <span className="italic">· {e.nota}</span>}
                </div>
              </div>

              <div className="shrink-0">
                {e.estado === 'ignorada' ? (
                  <button
                    disabled={!puedeEditar || isPending}
                    onClick={() => desarchivar(e)}
                    className="text-xs font-bold px-3 py-1.5 rounded bg-gris text-gris-dark hover:bg-azul-light hover:text-azul transition-colors min-h-[36px] disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    ↩ Desarchivar
                  </button>
                ) : e.estado === 'anulada' ? (
                  <span className="text-[11px] text-gris-dark italic">envío deshecho</span>
                ) : e.estado === 'confirmada' ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-verde">✓ confirmada</span>
                    <button
                      disabled={!puedeEditar || isPending}
                      onClick={() => desarchivar(e)}
                      title="Volverla a la bandeja"
                      className="text-xs font-bold px-3 py-1.5 rounded text-gris-dark hover:text-azul hover:bg-azul-light transition-colors min-h-[36px] disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      ↩
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-1.5">
                    <button
                      disabled={!puedeEditar || isPending}
                      onClick={() => confirmar(e)}
                      title="Sí, es herramienta del pañol y ya la vi"
                      className="text-xs font-bold px-3 py-1.5 rounded bg-verde-light text-verde hover:opacity-80 transition-colors min-h-[36px] disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      ✓ Ya está
                    </button>
                    <button
                      disabled={!puedeEditar || isPending}
                      onClick={() => archivar(e)}
                      title="Sacarla de la bandeja: esto no es una herramienta del pañol"
                      className="text-xs font-bold px-3 py-1.5 rounded bg-gris text-gris-dark hover:bg-rojo-light hover:text-rojo transition-colors min-h-[36px] disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      No es
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />
    </div>
  )
}
