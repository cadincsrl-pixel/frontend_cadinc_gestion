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
import { useHerrConfig, useRegistrarMovimientoLote } from '../hooks/useHerramientas'
import type { Herramienta, Obra, Profile } from '@/types/domain.types'

// Matriz de transiciones permitidas — espejo de HerrMovimientos.tsx.
const TRANSICIONES: Record<string, string[]> = {
  disponible:  ['asignacion', 'reparacion', 'baja'],
  uso:         ['traslado', 'devolucion', 'reparacion', 'baja'],
  reparacion:  ['retorno_rep', 'baja'],
}

// Qué campos muestra cada tipo de movimiento.
const MOV_CAMPOS: Record<string, { destino: boolean }> = {
  asignacion:  { destino: true  },
  traslado:    { destino: true  },
  devolucion:  { destino: true  },
  reparacion:  { destino: false },
  retorno_rep: { destino: true  },
  baja:        { destino: false },
}

interface Props {
  herramientas: Herramienta[]
  onClose:      () => void
  onSuccess:    () => void
}

export function MoverLoteModal({ herramientas, onClose, onSuccess }: Props) {
  const toast = useToast()
  const { data: config }   = useHerrConfig()
  const { data: obras = [] } = useObras()
  const { data: personal = [] } = usePersonal()
  const { data: usuarios = [] } = useQuery({
    queryKey: ['usuarios-activos'],
    queryFn:  () => apiGet<Profile[]>('/api/usuarios'),
    staleTime: 5 * 60_000,
  })
  const { mutate: registrar, isPending } = useRegistrarMovimientoLote()

  // Tipos comunes: intersección de las transiciones permitidas para cada estado.
  const tiposComunes = useMemo(() => {
    if (herramientas.length === 0) return []
    const estados = new Set(herramientas.map(h => h.estado_key))
    let result: string[] | null = null
    for (const e of estados) {
      const permitidos = TRANSICIONES[e] ?? []
      result = result === null ? [...permitidos] : result.filter(t => permitidos.includes(t))
    }
    return result ?? []
  }, [herramientas])

  // Algunas pueden estar en `baja` (no se mueven). Si todas están en baja, bloqueamos.
  const todasBaja = herramientas.every(h => h.estado_key === 'baja')

  const [tipoMov, setTipoMov] = useState<string>(tiposComunes[0] ?? '')
  const [obraDestino, setObraDestino] = useState('')
  const [responsableSel, setResponsableSel] = useState('')
  const [obs, setObs] = useState('')
  const [fechaManual, setFechaManual] = useState('')

  // Si el tipo es devolución, el destino es siempre la obra depósito.
  const depo = obras.find((o: Obra) => o.es_deposito)
  const destinoForzadoDepo = tipoMov === 'devolucion'
  const campos = MOV_CAMPOS[tipoMov] ?? { destino: false }

  // Obra de origen — la primera si todas comparten, sino "Múltiples".
  const obrasOrigen = useMemo(() => Array.from(new Set(herramientas.map(h => h.obra_cod).filter(Boolean))) as string[], [herramientas])
  const origenLabel = obrasOrigen.length === 0
    ? '—'
    : obrasOrigen.length === 1
      ? `${obras.find(o => o.cod === obrasOrigen[0])?.nom ?? obrasOrigen[0]} (${obrasOrigen[0]})`
      : `Múltiples obras (${obrasOrigen.length})`

  function handleConfirmar() {
    if (todasBaja) {
      toast('Las herramientas dadas de baja no se pueden mover', 'err')
      return
    }
    if (!tipoMov) {
      toast('Elegí el tipo de movimiento', 'err')
      return
    }
    const destinoFinal = destinoForzadoDepo ? (depo?.cod ?? '') : obraDestino
    if (campos.destino && !destinoFinal) {
      toast('Elegí la obra destino', 'err')
      return
    }

    // Warning si alguna ya está en la obra destino.
    if (destinoFinal && campos.destino) {
      const yaEnDestino = herramientas.filter(h => h.obra_cod === destinoFinal)
      if (yaEnDestino.length > 0) {
        const msg = `Estas herramientas ya están en la obra destino:\n${yaEnDestino.map(h => `· ${h.codigo} ${h.nom}`).join('\n')}\n\n¿Continuar igual?`
        if (!window.confirm(msg)) return
      }
    }

    // Decodificar responsable (mutuamente excluyente).
    let responsable_leg: string | null = null
    let responsable_user_id: string | null = null
    if      (responsableSel.startsWith('leg:'))  responsable_leg     = responsableSel.slice(4)
    else if (responsableSel.startsWith('user:')) responsable_user_id = responsableSel.slice(5)

    registrar(
      {
        herramienta_ids:     herramientas.map(h => h.id),
        tipo_key:            tipoMov,
        obra_destino_cod:    campos.destino ? destinoFinal : null,
        responsable_leg,
        responsable_user_id,
        obs:                 obs || undefined,
        fecha:               fechaManual ? new Date(fechaManual).toISOString() : undefined,
      },
      {
        onSuccess: (data) => {
          toast(`✓ ${data.count} movimiento${data.count !== 1 ? 's' : ''} registrado${data.count !== 1 ? 's' : ''}`, 'ok')
          onSuccess()
        },
        onError: (e: any) => {
          const msg = typeof e?.message === 'string' ? e.message : 'Error al registrar movimientos'
          if (msg.includes('TIPO_INCOMPATIBLE')) {
            toast('Una o más herramientas no admiten ese tipo de movimiento (cambió el estado mientras tanto)', 'err')
          } else {
            toast(msg, 'err')
          }
        },
      },
    )
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`📦 MOVER ${herramientas.length} HERRAMIENTA${herramientas.length !== 1 ? 'S' : ''}`}
      width="max-w-2xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button
            variant="primary"
            loading={isPending}
            disabled={todasBaja || tiposComunes.length === 0 || !tipoMov}
            onClick={handleConfirmar}
          >
            ✓ Confirmar movimiento
          </Button>
        </>
      }
    >
      {todasBaja ? (
        <div className="bg-rojo-light border border-rojo/30 rounded-lg p-4 text-sm text-rojo">
          ⚠ Las herramientas seleccionadas están dadas de baja. No se pueden mover.
        </div>
      ) : tiposComunes.length === 0 ? (
        <div className="bg-rojo-light border border-rojo/30 rounded-lg p-4 text-sm text-rojo">
          ⚠ Las herramientas tienen estados incompatibles entre sí — no hay un tipo de movimiento aplicable a todas.
          <div className="mt-2 text-xs">
            Estados presentes: {[...new Set(herramientas.map(h => h.estado?.nom ?? h.estado_key))].join(', ')}.
            <br/>Filtrá por estado en el listado antes de seleccionar.
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Resumen */}
          <div className="bg-gris rounded-lg p-3">
            <div className="text-[11px] font-bold text-gris-dark uppercase tracking-wider mb-2">Seleccionadas</div>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
              {herramientas.map(h => (
                <span key={h.id} className="text-xs font-mono bg-white border border-gris-mid px-2 py-0.5 rounded">
                  {h.codigo}
                </span>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-gris-dark">
              <span className="font-bold uppercase tracking-wide">Origen:</span>
              <span>{origenLabel}</span>
            </div>
          </div>

          {/* Tipo de movimiento */}
          <div>
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
              value={tipoMov}
              onChange={(v) => { setTipoMov(v); setObraDestino('') }}
            />
          </div>

          {/* Obra destino */}
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
                  sub: o.cod,
                }))}
                value={obraDestino}
                onChange={setObraDestino}
              />
            )
          )}

          {/* Responsable */}
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

          {/* Observaciones + fecha */}
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
    </Modal>
  )
}
