'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import { toISO } from '@/lib/utils/dates'
import {
  useObrasAlquiler,
  useObraMaquinas,
  usePartes,
  useCreateParte,
  useUpdateParte,
} from '../hooks/useAlquiler'
import { calcularHorasParte, fmtHoras } from '../utils/horas'
import { MAQUINA_TIPO_LABEL, type ObraMaquina, type Parte } from '../types'

// Normaliza HH:MM:SS → HH:MM para los inputs type="time".
function toHHMM(t: string | null | undefined): string {
  if (!t) return ''
  const [h, m] = t.split(':')
  if (h == null || m == null) return ''
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`
}

export function PartesTab() {
  const toast = useToast()
  const { puedeCrear, puedeEditar } = usePermisos('alquiler')
  const puedeCargar = puedeCrear || puedeEditar

  const { data: obras = [], isLoading: loadingObras } = useObrasAlquiler()

  const [obraId, setObraId] = useState<number | null>(null)
  const [fecha, setFecha] = useState<string>(() => toISO(new Date()))

  // Default a la primera obra activa cuando cargan las obras. Se keya por
  // cantidad de obras (primitivo) y solo dispara mientras no haya selección.
  const primeraObraId = obras.length > 0
    ? (obras.find(o => o.estado === 'activa') ?? obras[0]!).id
    : null
  useEffect(() => {
    if (obraId == null && primeraObraId != null) {
      setObraId(primeraObraId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primeraObraId])

  const { data: maquinas = [], isLoading: loadingMaquinas } = useObraMaquinas(obraId)
  const filtroPartes = useMemo(
    () => (obraId != null ? { obra_id: obraId, desde: fecha, hasta: fecha } : {}),
    [obraId, fecha],
  )
  const { data: partes = [], isLoading: loadingPartes } = usePartes(filtroPartes, obraId != null)

  // Map maquina_id → parte existente para (obra, fecha).
  const partePorMaquina = useMemo(() => {
    const m = new Map<number, Parte>()
    for (const p of partes) m.set(p.maquina_id, p)
    return m
  }, [partes])

  const opcionesObra = useMemo(
    () => obras.map(o => ({ value: String(o.id), label: o.estado === 'cerrada' ? `${o.nombre} (cerrada)` : o.nombre })),
    [obras],
  )

  const obraSel = obras.find(o => o.id === obraId) ?? null
  const cargando = loadingMaquinas || loadingPartes

  return (
    <div className="flex flex-col gap-4">
      {/* Selector de obra + día */}
      <div className="bg-white rounded-card shadow-card p-3 sm:p-4 flex flex-col sm:flex-row sm:items-end gap-3">
        <div className="flex-1 min-w-0">
          <Select
            label="Obra"
            options={opcionesObra}
            placeholder={loadingObras ? 'Cargando...' : 'Elegí una obra'}
            value={obraId != null ? String(obraId) : ''}
            onChange={e => setObraId(e.target.value ? Number(e.target.value) : null)}
            disabled={loadingObras || obras.length === 0}
          />
        </div>
        <div className="w-full sm:w-48">
          <Input label="Día" type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
        </div>
      </div>

      {/* Estados */}
      {obras.length === 0 && !loadingObras ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-gris-dark text-sm italic">
          No hay obras de alquiler. Creá una en el tab Obras.
        </div>
      ) : obraId == null ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-gris-dark text-sm italic">
          Elegí una obra para cargar el parte del día.
        </div>
      ) : cargando ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-gris-dark text-sm">
          <span className="inline-flex items-center gap-2">
            <span className="w-4 h-4 border-2 border-naranja border-t-transparent rounded-full animate-spin" />
            Cargando máquinas y partes...
          </span>
        </div>
      ) : maquinas.length === 0 ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-gris-dark text-sm italic">
          La obra «{obraSel?.nombre}» no tiene máquinas asignadas. Asignalas desde el tab Obras.
        </div>
      ) : (
        <PartesDelDia
          key={`${obraId}-${fecha}`}
          obraId={obraId}
          fecha={fecha}
          maquinas={maquinas}
          partePorMaquina={partePorMaquina}
          puedeCargar={puedeCargar}
          onToast={toast}
        />
      )}
    </div>
  )
}

// ─────────────── Bloque de partes del día (todas las máquinas) ───────────────
function PartesDelDia({
  obraId,
  fecha,
  maquinas,
  partePorMaquina,
  puedeCargar,
  onToast,
}: {
  obraId: number
  fecha: string
  maquinas: ObraMaquina[]
  partePorMaquina: Map<number, Parte>
  puedeCargar: boolean
  onToast: (msg: string, type?: 'ok' | 'err' | 'warn') => void
}) {
  // Total del día (suma en vivo de los totales por máquina).
  const [totales, setTotales] = useState<Record<number, number>>({})
  const totalDia = useMemo(() => {
    const t = Object.values(totales).reduce((acc, n) => acc + n, 0)
    return Math.round(t * 100) / 100
  }, [totales])

  function reportarTotal(maquinaId: number, horas: number) {
    setTotales(prev => (prev[maquinaId] === horas ? prev : { ...prev, [maquinaId]: horas }))
  }

  return (
    <div className="flex flex-col gap-3">
      {maquinas.map(om => (
        <MaquinaParteBlock
          key={om.id}
          obraId={obraId}
          fecha={fecha}
          obraMaquina={om}
          parteExistente={partePorMaquina.get(om.maquina_id) ?? null}
          puedeCargar={puedeCargar}
          onToast={onToast}
          onTotal={reportarTotal}
        />
      ))}

      {/* Total del día */}
      <div className="bg-azul text-white rounded-card shadow-card px-4 py-3 flex items-center justify-between">
        <span className="text-sm font-bold uppercase tracking-wide">Total del día</span>
        <span className="font-display text-2xl tracking-wider">{fmtHoras(totalDia)} hs</span>
      </div>
    </div>
  )
}

// ─────────────── Bloque de una máquina ───────────────
function MaquinaParteBlock({
  obraId,
  fecha,
  obraMaquina,
  parteExistente,
  puedeCargar,
  onToast,
  onTotal,
}: {
  obraId: number
  fecha: string
  obraMaquina: ObraMaquina
  parteExistente: Parte | null
  puedeCargar: boolean
  onToast: (msg: string, type?: 'ok' | 'err' | 'warn') => void
  onTotal: (maquinaId: number, horas: number) => void
}) {
  const { mutate: create, isPending: creating } = useCreateParte()
  const { mutate: update, isPending: updating } = useUpdateParte()

  // Estado local de los 4 horarios + detalle (precargado del parte existente).
  const [mEnt, setMEnt] = useState('')
  const [mSal, setMSal] = useState('')
  const [tEnt, setTEnt] = useState('')
  const [tSal, setTSal] = useState('')
  const [detalle, setDetalle] = useState('')

  // Precargar cuando aparece/cambia el parte existente. Se keya por id del
  // parte (primitivo) para evitar cascadas; el bloque ya remonta al cambiar
  // de obra/fecha (key del padre).
  useEffect(() => {
    setMEnt(toHHMM(parteExistente?.manana_entrada))
    setMSal(toHHMM(parteExistente?.manana_salida))
    setTEnt(toHHMM(parteExistente?.tarde_entrada))
    setTSal(toHHMM(parteExistente?.tarde_salida))
    setDetalle(parteExistente?.detalle ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parteExistente?.id])

  const horas = useMemo(
    () => calcularHorasParte({
      manana_entrada: mEnt || null,
      manana_salida:  mSal || null,
      tarde_entrada:  tEnt || null,
      tarde_salida:   tSal || null,
    }),
    [mEnt, mSal, tEnt, tSal],
  )

  // Reportar el total al contenedor (para el total del día).
  useEffect(() => { onTotal(obraMaquina.maquina_id, horas) }, [horas, obraMaquina.maquina_id, onTotal])

  const guardando = creating || updating
  const maquina = obraMaquina.maquina

  function handleGuardar() {
    const dto: Partial<Parte> = {
      obra_id:        obraId,
      maquina_id:     maquina.id,
      fecha,
      manana_entrada: mEnt || null,
      manana_salida:  mSal || null,
      tarde_entrada:  tEnt || null,
      tarde_salida:   tSal || null,
      horas,
      detalle:        detalle.trim() || null,
    }
    if (parteExistente) {
      update({ id: parteExistente.id, dto }, {
        onSuccess: () => onToast(`✓ Parte de ${maquina.nombre} actualizado`, 'ok'),
        onError: (err: unknown) => onToast((err as { message?: string })?.message || 'Error al guardar', 'err'),
      })
    } else {
      create(dto, {
        onSuccess: () => onToast(`✓ Parte de ${maquina.nombre} guardado`, 'ok'),
        onError: (err: unknown) => onToast((err as { message?: string })?.message || 'Error al guardar', 'err'),
      })
    }
  }

  return (
    <div className="bg-white rounded-card shadow-card p-3 sm:p-4 flex flex-col gap-3">
      {/* Cabecera de la máquina */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <div className="font-bold text-sm text-carbon truncate">
            🚜 {maquina.nombre}
            {parteExistente && (
              <span className="ml-2 text-[10px] font-bold text-verde bg-verde-light px-1.5 py-0.5 rounded uppercase tracking-wide">
                Cargado
              </span>
            )}
          </div>
          <div className="text-xs text-gris-dark">
            {MAQUINA_TIPO_LABEL[maquina.tipo]}
            {maquina.identificacion && <span className="font-mono"> · {maquina.identificacion}</span>}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-bold text-gris-dark uppercase tracking-wider">Total</div>
          <div className="font-display text-xl tracking-wider text-azul">{fmtHoras(horas)} hs</div>
        </div>
      </div>

      {/* Horarios */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Input label="Mañana entrada" type="time" value={mEnt} onChange={e => setMEnt(e.target.value)} disabled={!puedeCargar} />
        <Input label="Mañana salida"  type="time" value={mSal} onChange={e => setMSal(e.target.value)} disabled={!puedeCargar} />
        <Input label="Tarde entrada"  type="time" value={tEnt} onChange={e => setTEnt(e.target.value)} disabled={!puedeCargar} />
        <Input label="Tarde salida"   type="time" value={tSal} onChange={e => setTSal(e.target.value)} disabled={!puedeCargar} />
      </div>

      {/* Detalle + guardar */}
      <div className="flex flex-col sm:flex-row sm:items-end gap-2">
        <div className="flex-1">
          <Input
            label="Detalle de trabajos"
            placeholder="Qué se hizo con la máquina"
            value={detalle}
            onChange={e => setDetalle(e.target.value)}
            disabled={!puedeCargar}
          />
        </div>
        <Button
          variant="primary"
          size="md"
          loading={guardando}
          disabled={!puedeCargar}
          onClick={handleGuardar}
        >
          ✓ {parteExistente ? 'Actualizar' : 'Guardar'}
        </Button>
      </div>
    </div>
  )
}
