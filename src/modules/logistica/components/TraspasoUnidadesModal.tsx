'use client'

// Traspaso de camión/batea entre choferes en un solo paso. Reemplaza el
// circuito viejo de "editar chofer destino, asignarle las unidades y confirmar
// el desplazamiento" cuando lo que se quiere es mover el equipo completo.
// Con "intercambio", los dos choferes se cruzan las unidades (swap).

import { useState } from 'react'
import { Modal }  from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import { useTraspasoChofer } from '../hooks/useLogistica'
import type { Chofer, Camion, Batea } from '@/types/domain.types'

interface Props {
  open: boolean
  onClose: () => void
  choferes: Chofer[]
  camiones: Camion[]
  bateas:   Batea[]
}

export function TraspasoUnidadesModal({ open, onClose, choferes, camiones, bateas }: Props) {
  const toast = useToast()
  const { mutate: traspasar, isPending } = useTraspasoChofer()

  const [origenId,    setOrigenId]    = useState('')
  const [destinoId,   setDestinoId]   = useState('')
  const [incCamion,   setIncCamion]   = useState(true)
  const [incBatea,    setIncBatea]    = useState(true)
  const [intercambio, setIntercambio] = useState(false)

  const origen  = choferes.find(c => c.id === Number(origenId))  ?? null
  const destino = choferes.find(c => c.id === Number(destinoId)) ?? null

  const patCamion = (id: number | null | undefined) => camiones.find(c => c.id === id)?.patente ?? '?'
  const patBatea  = (id: number | null | undefined) => bateas.find(b => b.id === id)?.patente ?? '?'

  // Solo cuentan los tipos tildados que el origen efectivamente tiene.
  const pasaCamion = incCamion && origen?.camion_id != null
  const pasaBatea  = incBatea  && origen?.batea_id  != null

  // El destino tiene unidades del tipo que se traspasa → hay que decidir si
  // quedan sin asignar o vuelven al origen (intercambio).
  const destinoTieneAlgo =
    (pasaCamion && destino?.camion_id != null) ||
    (pasaBatea  && destino?.batea_id  != null)

  function resetear() {
    setOrigenId('')
    setDestinoId('')
    setIncCamion(true)
    setIncBatea(true)
    setIntercambio(false)
  }

  function cerrar() {
    resetear()
    onClose()
  }

  function elegirOrigen(id: string) {
    setOrigenId(id)
    if (id === destinoId) setDestinoId('')
    const ch = choferes.find(c => c.id === Number(id))
    setIncCamion(ch?.camion_id != null)
    setIncBatea(ch?.batea_id != null)
    setIntercambio(false)
  }

  function confirmar() {
    if (!origen || !destino) return
    traspasar(
      {
        origen_id:   origen.id,
        destino_id:  destino.id,
        camion:      pasaCamion,
        batea:       pasaBatea,
        intercambio: intercambio && destinoTieneAlgo,
      },
      {
        onSuccess: () => {
          toast('✓ Traspaso realizado', 'ok')
          cerrar()
        },
        onError: (e: any) => toast(e?.message || 'Error al traspasar', 'err'),
      }
    )
  }

  // Origen: solo choferes que tengan algo para entregar.
  const origenOptions = choferes
    .filter(c => c.camion_id != null || c.batea_id != null)
    .map(c => ({
      value: c.id,
      label: `${c.nombre} — ${[
        c.camion_id != null ? `🚚 ${patCamion(c.camion_id)}` : null,
        c.batea_id  != null ? `🛻 ${patBatea(c.batea_id)}`   : null,
      ].filter(Boolean).join(' · ')}`,
    }))

  const destinoOptions = choferes
    .filter(c => c.id !== Number(origenId))
    .map(c => ({
      value: c.id,
      label: `${c.nombre}${[
        c.camion_id != null ? ` 🚚 ${patCamion(c.camion_id)}` : '',
        c.batea_id  != null ? ` 🛻 ${patBatea(c.batea_id)}`   : '',
      ].join('')}${c.estado !== 'activo' ? ` (${c.estado})` : ''}`,
    }))

  // Preview del resultado: una línea por unidad que cambia de manos.
  const movimientos: Array<{ texto: string; warning?: boolean }> = []
  if (origen && destino) {
    if (pasaCamion) {
      movimientos.push({ texto: `🚚 ${patCamion(origen.camion_id)}: ${origen.nombre} → ${destino.nombre}` })
      if (destino.camion_id != null) {
        movimientos.push(intercambio
          ? { texto: `🚚 ${patCamion(destino.camion_id)}: ${destino.nombre} → ${origen.nombre}` }
          : { texto: `🚚 ${patCamion(destino.camion_id)} (de ${destino.nombre}) queda sin asignar`, warning: true })
      }
    }
    if (pasaBatea) {
      movimientos.push({ texto: `🛻 ${patBatea(origen.batea_id)}: ${origen.nombre} → ${destino.nombre}` })
      if (destino.batea_id != null) {
        movimientos.push(intercambio
          ? { texto: `🛻 ${patBatea(destino.batea_id)}: ${destino.nombre} → ${origen.nombre}` }
          : { texto: `🛻 ${patBatea(destino.batea_id)} (de ${destino.nombre}) queda sin asignar`, warning: true })
      }
    }
  }

  const puedeConfirmar = !!origen && !!destino && (pasaCamion || pasaBatea)

  return (
    <Modal
      open={open}
      onClose={cerrar}
      title="⇄ TRASPASO DE UNIDADES"
      footer={
        <>
          <Button variant="secondary" onClick={cerrar}>Cancelar</Button>
          <Button variant="primary" loading={isPending} disabled={!puedeConfirmar} onClick={confirmar}>
            ✓ Confirmar traspaso
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Select
          label="Chofer que entrega"
          placeholder="Elegir chofer"
          options={origenOptions}
          value={origenId}
          onChange={e => elegirOrigen(e.target.value)}
        />

        {origen && (
          <div className="flex flex-wrap gap-4 px-1">
            {origen.camion_id != null && (
              <label className="flex items-center gap-2 text-sm text-carbon cursor-pointer">
                <input type="checkbox" checked={incCamion} onChange={e => setIncCamion(e.target.checked)} className="accent-naranja w-4 h-4" />
                Camión <span className="font-mono text-xs font-bold bg-azul-light text-azul-mid px-2 py-0.5 rounded">{patCamion(origen.camion_id)}</span>
              </label>
            )}
            {origen.batea_id != null && (
              <label className="flex items-center gap-2 text-sm text-carbon cursor-pointer">
                <input type="checkbox" checked={incBatea} onChange={e => setIncBatea(e.target.checked)} className="accent-naranja w-4 h-4" />
                Batea <span className="font-mono text-xs font-bold bg-naranja-light text-naranja-dark px-2 py-0.5 rounded">{patBatea(origen.batea_id)}</span>
              </label>
            )}
          </div>
        )}

        <Select
          label="Chofer que recibe"
          placeholder="Elegir chofer"
          options={destinoOptions}
          value={destinoId}
          onChange={e => setDestinoId(e.target.value)}
          disabled={!origen}
        />

        {destinoTieneAlgo && (
          <label className="flex items-start gap-2 text-sm text-carbon cursor-pointer bg-gris/40 border border-gris-mid rounded-lg p-3">
            <input type="checkbox" checked={intercambio} onChange={e => setIntercambio(e.target.checked)} className="accent-naranja w-4 h-4 mt-0.5" />
            <span>
              <b>Intercambio</b> — {destino?.nombre} le pasa sus unidades actuales a {origen?.nombre} (se cruzan los equipos).
            </span>
          </label>
        )}

        {movimientos.length > 0 && (
          <div className="bg-azul-light/40 border border-azul-light rounded-lg p-3 flex flex-col gap-1.5">
            <div className="text-[10px] font-bold text-gris-dark uppercase tracking-wider">Resultado</div>
            {movimientos.map((m, i) => (
              <div key={i} className={`text-sm ${m.warning ? 'text-naranja-dark font-semibold' : 'text-carbon'}`}>
                {m.warning ? '⚠ ' : ''}{m.texto}
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
