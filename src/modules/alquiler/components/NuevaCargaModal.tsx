'use client'

import { useEffect, useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import { toISO } from '@/lib/utils/dates'
import {
  useObrasAlquiler,
  useObraMaquinas,
  usePartes,
  useCreateParte,
  useUpdateParte,
  useEmitirRemito,
} from '../hooks/useAlquiler'
import { calcularHorasParte, fmtHoras } from '../utils/horas'
import type { Parte, RemitoAlquiler } from '../types'

// Carga rápida desde el tab Remitos: obra → máquina → fecha → horarios,
// y al confirmar guarda el parte Y emite el remito en un solo paso.
// Si ya existe un parte para (obra, máquina, fecha) lo precarga y lo
// actualiza en lugar de duplicar — mismo criterio que el tab Partes.

function toHHMM(t: string | null | undefined): string {
  if (!t) return ''
  const [h, m] = t.split(':')
  if (h == null || m == null) return ''
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`
}

function fmtPesos(n: number): string {
  return '$' + n.toLocaleString('es-AR', { maximumFractionDigits: 0 })
}

export function NuevaCargaModal({ open, onClose, onRemito }: {
  open: boolean
  onClose: () => void
  onRemito: (remito: RemitoAlquiler) => void
}) {
  const toast = useToast()
  const { data: obras = [] } = useObrasAlquiler()

  const [obraId, setObraId]       = useState('')
  const [maquinaId, setMaquinaId] = useState('')
  const [fecha, setFecha]         = useState(() => toISO(new Date()))
  const [mEnt, setMEnt] = useState('')
  const [mSal, setMSal] = useState('')
  const [tEnt, setTEnt] = useState('')
  const [tSal, setTSal] = useState('')
  const [detalle, setDetalle] = useState('')

  const { data: maquinas = [], isLoading: loadingMaquinas } = useObraMaquinas(obraId ? Number(obraId) : null)

  // Partes del día para detectar si ya hay uno cargado para la máquina.
  const filtro = useMemo(
    () => (obraId ? { obra_id: Number(obraId), desde: fecha, hasta: fecha } : {}),
    [obraId, fecha],
  )
  const { data: partes = [] } = usePartes(filtro, open && !!obraId)
  const parteExistente: Parte | null = useMemo(
    () => partes.find(p => p.maquina_id === Number(maquinaId)) ?? null,
    [partes, maquinaId],
  )

  const { mutate: create, isPending: creating } = useCreateParte()
  const { mutate: update, isPending: updating } = useUpdateParte()
  const { mutate: emitir, isPending: emitiendo } = useEmitirRemito()

  // Reset al abrir.
  useEffect(() => {
    if (!open) return
    setObraId(''); setMaquinaId(''); setFecha(toISO(new Date()))
    setMEnt(''); setMSal(''); setTEnt(''); setTSal(''); setDetalle('')
  }, [open])

  // Precargar horarios del parte existente (o limpiar si no hay).
  useEffect(() => {
    setMEnt(toHHMM(parteExistente?.manana_entrada))
    setMSal(toHHMM(parteExistente?.manana_salida))
    setTEnt(toHHMM(parteExistente?.tarde_entrada))
    setTSal(toHHMM(parteExistente?.tarde_salida))
    setDetalle(parteExistente?.detalle ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parteExistente?.id, maquinaId])

  const horas = useMemo(
    () => calcularHorasParte({
      manana_entrada: mEnt || null,
      manana_salida:  mSal || null,
      tarde_entrada:  tEnt || null,
      tarde_salida:   tSal || null,
    }),
    [mEnt, mSal, tEnt, tSal],
  )

  const omSel = maquinas.find(om => om.maquina_id === Number(maquinaId)) ?? null
  const guardando = creating || updating || emitiendo

  const opcionesObra = [
    { value: '', label: 'Seleccionar obra…' },
    ...obras.map(o => ({ value: String(o.id), label: o.estado === 'cerrada' ? `${o.nombre} (cerrada)` : o.nombre })),
  ]
  const opcionesMaquina = [
    { value: '', label: loadingMaquinas ? 'Cargando…' : maquinas.length === 0 ? (obraId ? 'La obra no tiene máquinas asignadas' : 'Elegí una obra primero') : 'Seleccionar máquina…' },
    ...maquinas.map(om => ({
      value: String(om.maquina_id),
      label: `${om.maquina.nombre}${om.precio_hora != null ? ` — ${fmtPesos(om.precio_hora)}/h` : ''}`,
    })),
  ]

  function handleGuardarYEmitir() {
    if (!obraId)    { toast('Elegí la obra', 'err'); return }
    if (!maquinaId) { toast('Elegí la máquina', 'err'); return }
    if (horas <= 0) { toast('Cargá los horarios (el total no puede ser 0)', 'err'); return }

    const dto: Partial<Parte> = {
      obra_id:        Number(obraId),
      maquina_id:     Number(maquinaId),
      fecha,
      manana_entrada: mEnt || null,
      manana_salida:  mSal || null,
      tarde_entrada:  tEnt || null,
      tarde_salida:   tSal || null,
      horas,
      detalle:        detalle.trim() || null,
    }

    const emitirYTerminar = (parteId: number) => {
      emitir(parteId, {
        onSuccess: (remito) => {
          toast(`✓ Remito ${remito.numero} emitido`, 'ok')
          onClose()
          onRemito(remito)
        },
        onError: (err: unknown) => toast((err as { message?: string })?.message || 'El parte se guardó pero falló el remito — emitilo desde Partes', 'err'),
      })
    }

    if (parteExistente) {
      update({ id: parteExistente.id, dto }, {
        onSuccess: (p) => emitirYTerminar(p.id),
        onError:   (err: unknown) => toast((err as { message?: string })?.message || 'Error al guardar el parte', 'err'),
      })
    } else {
      create(dto, {
        onSuccess: (p) => emitirYTerminar(p.id),
        onError:   (err: unknown) => toast((err as { message?: string })?.message || 'Error al guardar el parte', 'err'),
      })
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="🧾 NUEVA CARGA — PARTE + REMITO"
      width="max-w-xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={guardando} onClick={handleGuardarYEmitir}>
            ✓ Guardar y emitir remito
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <Select label="Obra" options={opcionesObra} value={obraId}
              onChange={e => { setObraId(e.target.value); setMaquinaId('') }} />
          </div>
          <Input label="Fecha" type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
        </div>

        <Select label="Máquina" options={opcionesMaquina} value={maquinaId}
          onChange={e => setMaquinaId(e.target.value)} disabled={!obraId || maquinas.length === 0} />

        {parteExistente && (
          <div className="bg-amarillo-light border border-[#7A5500]/30 rounded-card px-3 py-2 text-xs text-[#7A5500] font-semibold">
            ⚠ Ya hay un parte cargado para esta máquina este día ({fmtHoras(Number(parteExistente.horas))} hs) — se precargó y al guardar lo vas a <b>actualizar</b>, no duplicar.
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Input label="Mañana entrada" type="time" value={mEnt} onChange={e => setMEnt(e.target.value)} />
          <Input label="Mañana salida"  type="time" value={mSal} onChange={e => setMSal(e.target.value)} />
          <Input label="Tarde entrada"  type="time" value={tEnt} onChange={e => setTEnt(e.target.value)} />
          <Input label="Tarde salida"   type="time" value={tSal} onChange={e => setTSal(e.target.value)} />
        </div>

        <Input label="Detalle de trabajos" placeholder="Qué se hizo con la máquina"
          value={detalle} onChange={e => setDetalle(e.target.value)} />

        {/* Total en vivo */}
        <div className="bg-azul text-white rounded-card px-4 py-3 flex items-center justify-between">
          <span className="text-sm font-bold uppercase tracking-wide">Total</span>
          <span className="font-display text-2xl tracking-wider">
            {fmtHoras(horas)} hs
            {omSel?.precio_hora != null && horas > 0 && (
              <span className="text-sm font-sans font-normal ml-2 opacity-80">· {fmtPesos(horas * omSel.precio_hora)}</span>
            )}
          </span>
        </div>
      </div>
    </Modal>
  )
}
