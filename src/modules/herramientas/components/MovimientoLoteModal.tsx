'use client'

import { useMemo, useState } from 'react'
import { Modal }    from '@/components/ui/Modal'
import { Button }   from '@/components/ui/Button'
import { Combobox } from '@/components/ui/Combobox'
import { useToast } from '@/components/ui/Toast'
import { useObras } from '@/modules/tarja/hooks/useObras'
import { usePersonal } from '@/modules/tarja/hooks/usePersonal'
import { apiGet } from '@/lib/api/client'
import { useQuery } from '@tanstack/react-query'
import {
  useHerramientas,
  useHerrConfig,
  useRegistrarMovimientoLote,
} from '../hooks/useHerramientas'
import type { Obra, Profile } from '@/types/domain.types'

// Espejo de las matrices que usa HerrMovimientos para movimientos de a uno.
const TRANSICIONES: Record<string, string[]> = {
  disponible:  ['asignacion', 'reparacion', 'baja'],
  uso:         ['traslado', 'devolucion', 'reparacion', 'baja'],
  reparacion:  ['retorno_rep', 'baja'],
}

const MOV_CAMPOS: Record<string, { destino: boolean }> = {
  asignacion:  { destino: true  },
  traslado:    { destino: true  },
  devolucion:  { destino: true  },
  reparacion:  { destino: false },
  retorno_rep: { destino: true  },
  baja:        { destino: false },
}

const ESTADO_COLORS: Record<string, string> = {
  disponible: 'bg-verde-light text-verde',
  uso:        'bg-naranja-light text-naranja-dark',
  reparacion: 'bg-rojo-light text-rojo',
  baja:       'bg-gris text-gris-dark',
}

interface Props {
  onClose:   () => void
  onSuccess: () => void
}

export function MovimientoLoteModal({ onClose, onSuccess }: Props) {
  const toast = useToast()
  const { data: herramientas = [] } = useHerramientas()
  const { data: config }            = useHerrConfig()
  const { data: obras = [] }        = useObras()
  const { data: personal = [] }     = usePersonal()
  const { data: usuarios = [] } = useQuery({
    queryKey: ['usuarios-activos'],
    queryFn:  () => apiGet<Profile[]>('/api/usuarios'),
    staleTime: 5 * 60_000,
  })
  const { mutate: registrar, isPending } = useRegistrarMovimientoLote()

  // Filtros del listado
  const [busqueda,    setBusqueda]    = useState('')
  const [filtroObra,  setFiltroObra]  = useState('')
  const [filtroEstado,setFiltroEstado]= useState('')
  const [filtroTipo,  setFiltroTipo]  = useState('')

  // Selección
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  // Form de movimiento
  const [tipoMov,        setTipoMov]        = useState('')
  const [obraDestino,    setObraDestino]    = useState('')
  const [responsableSel, setResponsableSel] = useState('')
  const [obs,            setObs]            = useState('')
  const [fechaManual,    setFechaManual]    = useState('')

  // Herramientas filtradas para mostrar en el selector.
  const filtradas = useMemo(() => {
    return herramientas.filter(h => {
      // No mostramos bajas en el lote — no se pueden mover.
      if (h.estado_key === 'baja') return false
      const q = busqueda.toLowerCase()
      const matchQ = !q ||
        h.codigo.toLowerCase().includes(q) ||
        h.nom.toLowerCase().includes(q)    ||
        (h.marca ?? '').toLowerCase().includes(q) ||
        (h.serie ?? '').toLowerCase().includes(q) ||
        (h.obra?.nom ?? '').toLowerCase().includes(q)
      const matchObra   = !filtroObra   || h.obra_cod === filtroObra
      const matchEstado = !filtroEstado || h.estado_key === filtroEstado
      const matchTipo   = !filtroTipo   || String(h.tipo_id) === filtroTipo
      return matchQ && matchObra && matchEstado && matchTipo
    })
  }, [herramientas, busqueda, filtroObra, filtroEstado, filtroTipo])

  // Herramientas seleccionadas resueltas a objeto completo.
  const seleccionadas = useMemo(
    () => herramientas.filter(h => selectedIds.has(h.id)),
    [herramientas, selectedIds],
  )

  // Tipos de movimiento que aplican a TODAS las seleccionadas — intersección
  // de las transiciones permitidas por cada estado presente.
  const tiposComunes = useMemo(() => {
    if (seleccionadas.length === 0) return []
    const estados = new Set(seleccionadas.map(h => h.estado_key))
    let result: string[] | null = null
    for (const e of estados) {
      const permitidos = TRANSICIONES[e] ?? []
      result = result === null ? [...permitidos] : result.filter(t => permitidos.includes(t))
    }
    return result ?? []
  }, [seleccionadas])

  // Derived state: si el tipoMov elegido ya no aplica a la selección actual,
  // lo ignoramos en el render (sin tocar el state). Si más tarde la selección
  // vuelve a permitirlo, "se recupera" automáticamente.
  const tipoEfectivo = tipoMov && tiposComunes.includes(tipoMov) ? tipoMov : ''

  // Destino auto-forzado al depósito cuando es devolución.
  const depo = obras.find((o: Obra) => o.es_deposito)
  const destinoForzadoDepo = tipoEfectivo === 'devolucion'
  const campos = MOV_CAMPOS[tipoEfectivo] ?? { destino: false }

  // Origen — resumen humano para mostrar.
  const obrasOrigen = useMemo(
    () => Array.from(new Set(seleccionadas.map(h => h.obra_cod).filter(Boolean))) as string[],
    [seleccionadas],
  )
  const origenLabel = obrasOrigen.length === 0
    ? '—'
    : obrasOrigen.length === 1
      ? `${obras.find(o => o.cod === obrasOrigen[0])?.nom ?? obrasOrigen[0]} (${obrasOrigen[0]})`
      : `Múltiples obras (${obrasOrigen.length})`

  function toggle(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else              next.add(id)
      return next
    })
  }

  function toggleVisible() {
    const visibleIds = filtradas.map(h => h.id)
    const allMarked = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id))
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (allMarked) visibleIds.forEach(id => next.delete(id))
      else            visibleIds.forEach(id => next.add(id))
      return next
    })
  }

  function handleConfirmar() {
    if (seleccionadas.length === 0) {
      toast('Seleccioná al menos una herramienta', 'err')
      return
    }
    if (!tipoEfectivo) {
      toast('Elegí el tipo de movimiento', 'err')
      return
    }
    const destinoFinal = destinoForzadoDepo ? (depo?.cod ?? '') : obraDestino
    if (campos.destino && !destinoFinal) {
      toast('Elegí la obra destino', 'err')
      return
    }

    if (destinoFinal && campos.destino) {
      const yaEnDestino = seleccionadas.filter(h => h.obra_cod === destinoFinal)
      if (yaEnDestino.length > 0) {
        const msg = `Estas herramientas ya están en la obra destino:\n${yaEnDestino.map(h => `· ${h.codigo} ${h.nom}`).join('\n')}\n\n¿Continuar igual?`
        if (!window.confirm(msg)) return
      }
    }

    let responsable_leg:     string | null = null
    let responsable_user_id: string | null = null
    if      (responsableSel.startsWith('leg:'))  responsable_leg     = responsableSel.slice(4)
    else if (responsableSel.startsWith('user:')) responsable_user_id = responsableSel.slice(5)

    registrar(
      {
        herramienta_ids:  seleccionadas.map(h => h.id),
        tipo_key:         tipoEfectivo,
        obra_destino_cod: campos.destino ? destinoFinal : null,
        responsable_leg,
        responsable_user_id,
        obs:              obs || undefined,
        fecha:            fechaManual ? new Date(fechaManual).toISOString() : undefined,
      },
      {
        onSuccess: (data) => {
          toast(`✓ ${data.count} movimiento${data.count !== 1 ? 's' : ''} registrado${data.count !== 1 ? 's' : ''}`, 'ok')
          onSuccess()
        },
        onError: (e) => {
          const msg = e instanceof Error ? e.message : 'Error al registrar movimientos'
          if (msg.includes('TIPO_INCOMPATIBLE')) {
            toast('Una o más herramientas no admiten ese tipo de movimiento (cambió el estado mientras tanto)', 'err')
          } else {
            toast(msg, 'err')
          }
        },
      },
    )
  }

  const todasVisiblesMarcadas = filtradas.length > 0 && filtradas.every(h => selectedIds.has(h.id))
  const algunasVisiblesMarcadas = filtradas.some(h => selectedIds.has(h.id)) && !todasVisiblesMarcadas

  return (
    <Modal
      open
      onClose={onClose}
      title="📦 MOVIMIENTO MÚLTIPLE"
      width="max-w-4xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button
            variant="primary"
            loading={isPending}
            disabled={seleccionadas.length === 0 || !tipoEfectivo || tiposComunes.length === 0}
            onClick={handleConfirmar}
          >
            ✓ Confirmar {seleccionadas.length > 0 ? `(${seleccionadas.length})` : ''}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">

        {/* Filtros */}
        <div className="bg-gris/50 rounded-lg p-3 flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gris-dark text-sm pointer-events-none">🔍</span>
            <input
              type="text"
              placeholder="Buscar por código, nombre, marca, serie u obra..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none focus:border-naranja transition-colors bg-white"
            />
          </div>
          <select
            value={filtroObra}
            onChange={e => setFiltroObra(e.target.value)}
            className="px-3 py-1.5 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none focus:border-naranja bg-white"
          >
            <option value="">Todas las obras</option>
            {obras.map(o => (
              <option key={o.cod} value={o.cod}>
                {o.es_deposito ? '📦' : '📍'} {o.nom}
              </option>
            ))}
          </select>
          <select
            value={filtroEstado}
            onChange={e => setFiltroEstado(e.target.value)}
            className="px-3 py-1.5 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none focus:border-naranja bg-white"
          >
            <option value="">Todos los estados</option>
            {(config?.estados ?? []).filter(e => e.key !== 'baja').map(e => (
              <option key={e.key} value={e.key}>{e.icono} {e.nom}</option>
            ))}
          </select>
          <select
            value={filtroTipo}
            onChange={e => setFiltroTipo(e.target.value)}
            className="px-3 py-1.5 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none focus:border-naranja bg-white"
          >
            <option value="">Todos los tipos</option>
            {(config?.tipos ?? []).map(t => (
              <option key={t.id} value={String(t.id)}>{t.icono} {t.nom}</option>
            ))}
          </select>
          {(busqueda || filtroObra || filtroEstado || filtroTipo) && (
            <button
              onClick={() => { setBusqueda(''); setFiltroObra(''); setFiltroEstado(''); setFiltroTipo('') }}
              className="text-xs font-bold text-gris-dark hover:text-carbon px-2 py-1 rounded hover:bg-white transition-colors"
            >
              ✕ Limpiar
            </button>
          )}
        </div>

        {/* Lista de herramientas con checkboxes */}
        <div className="border border-gris-mid rounded-lg overflow-hidden">
          <div className="bg-azul text-white px-3 py-2 flex items-center gap-3 text-xs font-bold uppercase tracking-wide">
            <input
              type="checkbox"
              aria-label="Seleccionar todas las visibles"
              checked={todasVisiblesMarcadas}
              ref={el => { if (el) el.indeterminate = algunasVisiblesMarcadas }}
              onChange={toggleVisible}
              className="w-4 h-4 cursor-pointer accent-naranja"
            />
            <span className="flex-1">
              Herramientas — {filtradas.length} visible{filtradas.length !== 1 ? 's' : ''}
              {selectedIds.size > 0 && ` · ${selectedIds.size} seleccionada${selectedIds.size !== 1 ? 's' : ''}`}
            </span>
          </div>
          <div className="max-h-72 overflow-y-auto bg-white">
            {filtradas.length === 0 ? (
              <div className="text-center py-6 text-gris-dark text-sm italic">
                No hay herramientas que coincidan con los filtros
              </div>
            ) : (
              filtradas.map(h => {
                const marcada = selectedIds.has(h.id)
                return (
                  <label
                    key={h.id}
                    className={`flex items-start gap-3 px-3 py-2 border-b border-gris last:border-0 cursor-pointer hover:bg-gris/40 transition-colors ${marcada ? 'bg-naranja-light/30' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={marcada}
                      onChange={() => toggle(h.id)}
                      className="w-4 h-4 mt-1 cursor-pointer accent-naranja shrink-0"
                    />
                    <div className="flex-1 min-w-0 flex flex-col gap-1 md:flex-row md:items-center md:gap-3">
                      {/* Info principal */}
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-xs bg-gris px-2 py-0.5 rounded text-gris-dark font-bold shrink-0">
                          {h.codigo}
                        </span>
                        <span className="font-bold text-sm text-carbon truncate">
                          {h.nom}
                        </span>
                      </div>
                      {/* Chips */}
                      <div className="flex items-center gap-2 flex-wrap md:ml-auto md:shrink-0">
                        {(h.marca || h.modelo) && (
                          <span className="text-[11px] text-gris-dark truncate max-w-[140px]">
                            {[h.marca, h.modelo].filter(Boolean).join(' · ')}
                          </span>
                        )}
                        {h.obra && (
                          <span className={`text-[10px] px-2 py-0.5 rounded font-bold shrink-0 ${h.obra.es_deposito ? 'bg-gris text-gris-dark' : 'bg-naranja-light text-naranja-dark'}`}>
                            {h.obra.es_deposito ? '📦' : '📍'} {h.obra.nom}
                          </span>
                        )}
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded shrink-0 ${ESTADO_COLORS[h.estado_key] ?? 'bg-gris text-gris-dark'}`}>
                          {h.estado?.icono} {h.estado?.nom ?? h.estado_key}
                        </span>
                      </div>
                    </div>
                  </label>
                )
              })
            )}
          </div>
        </div>

        {/* Form de movimiento — solo si hay selección */}
        {seleccionadas.length === 0 ? (
          <div className="bg-azul-light/40 border border-azul/20 rounded-lg p-3 text-sm text-azul">
            Tildá las herramientas que querés mover y después elegí el destino.
          </div>
        ) : tiposComunes.length === 0 ? (
          <div className="bg-rojo-light border border-rojo/30 rounded-lg p-3 text-sm text-rojo">
            ⚠ Las herramientas tienen estados incompatibles entre sí — no hay un tipo de movimiento aplicable a todas.
            <div className="mt-2 text-xs">
              Estados presentes: {[...new Set(seleccionadas.map(h => h.estado?.nom ?? h.estado_key))].join(', ')}.
              <br/>Usá el filtro de estado para acotar la selección.
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 border-t border-gris pt-4">
            <div className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">
              Destino del movimiento
            </div>

            <div className="bg-gris/50 rounded-lg p-2 text-xs text-gris-dark flex items-center gap-2">
              <span className="font-bold uppercase tracking-wide">Origen:</span>
              <span>{origenLabel}</span>
            </div>

            {/* Aviso cuando la mezcla de estados restringe los tipos disponibles */}
            {(() => {
              const estadosPresentes = Array.from(new Set(seleccionadas.map(h => h.estado?.nom ?? h.estado_key)))
              if (estadosPresentes.length <= 1) return null
              return (
                <div className="bg-azul-light/40 border border-azul/20 rounded-lg px-3 py-2 text-xs text-azul">
                  Los tipos disponibles están acotados a los compatibles con los {estadosPresentes.length} estados de la selección ({estadosPresentes.join(', ')}).
                </div>
              )
            })()}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Combobox
                label="Tipo de movimiento *"
                placeholder="Elegí el tipo..."
                options={tiposComunes.map(t => {
                  const info = config?.movTipos.find(mt => mt.key === t)
                  return {
                    value: t,
                    label: `${info?.icono ?? '→'} ${info?.nom ?? t}`,
                    sub:   info?.descripcion ?? '',
                  }
                })}
                value={tipoEfectivo}
                onChange={(v) => { setTipoMov(v); setObraDestino('') }}
              />

              {campos.destino && (
                destinoForzadoDepo ? (
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">Obra destino *</label>
                    <div className="px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm bg-gris text-carbon font-semibold">
                      {depo ? `📦 ${depo.nom} (${depo.cod})` : '⚠ No hay obra marcada como depósito'}
                    </div>
                  </div>
                ) : (
                  <Combobox
                    label="Obra destino *"
                    placeholder="Buscar obra..."
                    options={obras.map((o: Obra) => ({
                      value: o.cod,
                      label: `${o.es_deposito ? '📦' : '📍'} ${o.nom}`,
                      sub:   o.cod,
                    }))}
                    value={obraDestino}
                    onChange={setObraDestino}
                  />
                )
              )}
            </div>

            <Combobox
              label="Responsable"
              placeholder="Buscar operario o usuario..."
              options={[
                ...personal.map(p => ({
                  value: `leg:${p.leg}`,
                  label: p.nom,
                  sub:   `Leg. ${p.leg} · Operario`,
                })),
                ...usuarios
                  .filter(u => u.activo !== false)
                  .map(u => ({
                    value: `user:${u.id}`,
                    label: u.nombre,
                    sub:   `Usuario · ${u.rol_base ?? u.rol}`,
                  })),
              ]}
              value={responsableSel}
              onChange={setResponsableSel}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">Observaciones</label>
                <input
                  type="text"
                  value={obs}
                  onChange={e => setObs(e.target.value)}
                  placeholder="Opcional — aplica a todos los movimientos"
                  className="px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none focus:border-naranja transition-colors"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">Fecha (opcional)</label>
                <input
                  type="datetime-local"
                  value={fechaManual}
                  onChange={e => setFechaManual(e.target.value)}
                  className="px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none focus:border-naranja transition-colors"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
