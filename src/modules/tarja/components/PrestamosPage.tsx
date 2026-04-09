'use client'

import { useState, useMemo } from 'react'
import { usePrestamos, useCreatePrestamo, useDeletePrestamo } from '../hooks/usePrestamos'
import { usePersonal } from '../hooks/usePersonal'
import { toISO, getViernes, getSemLabel } from '@/lib/utils/dates'
import { Combobox } from '@/components/ui/Combobox'
import { Button }   from '@/components/ui/Button'
import { Modal }    from '@/components/ui/Modal'
import { Input }    from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import { usePerfilesMap } from '@/lib/hooks/usePerfilesMap'
import type { Personal } from '@/types/domain.types'

function fmtM(n: number) {
  return '$' + Math.round(n).toLocaleString('es-AR')
}

function fmtFecha(s: string) {
  const [y, m, d] = s.split('-')
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
  return `${d} ${meses[parseInt(m!) - 1]} ${y}`
}

function semKeyHoy(): string {
  return toISO(getViernes(new Date()))
}

// Genera lista de semanas: las últimas 52
function semanas(): { value: string; label: string }[] {
  const result = []
  const hoy = new Date()
  const vie = getViernes(hoy)
  for (let i = 0; i < 52; i++) {
    const d = new Date(vie)
    d.setDate(d.getDate() - i * 7)
    result.push({ value: toISO(d), label: getSemLabel(d) })
  }
  return result
}

interface ModalFormProps {
  open:    boolean
  tipo:    'otorgado' | 'descontado'
  onClose: () => void
}

function ModalForm({ open, tipo, onClose }: ModalFormProps) {
  const toast = useToast()
  const { data: personal = [] } = usePersonal()
  const { mutate: create, isPending } = useCreatePrestamo()

  const [leg,      setLeg]      = useState('')
  const [semKey,   setSemKey]   = useState(semKeyHoy)
  const [monto,    setMonto]    = useState('')
  const [concepto, setConcepto] = useState('')

  const opcionesPersonal = useMemo(() =>
    personal
      .map((p: Personal) => ({ value: p.leg, label: p.nom, sub: `Leg. ${p.leg}` })),
    [personal]
  )

  const opcionesSem = semanas()

  function handleSubmit() {
    if (!leg)   { toast('Seleccioná un albañil', 'err'); return }
    if (!monto || isNaN(Number(monto)) || Number(monto) <= 0) {
      toast('Ingresá un monto válido', 'err'); return
    }
    create(
      { leg, sem_key: semKey, tipo, monto: Number(monto), concepto: concepto || null },
      {
        onSuccess: () => {
          toast(tipo === 'otorgado' ? '✓ Préstamo registrado' : '✓ Descuento registrado', 'ok')
          setLeg(''); setMonto(''); setConcepto('')
          onClose()
        },
        onError: (e) => toast(e.message ?? 'Error al guardar', 'err'),
      }
    )
  }

  const titulo = tipo === 'otorgado' ? '💵 OTORGAR PRÉSTAMO' : '↩ REGISTRAR DESCUENTO'

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={titulo}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button
            variant="primary"
            loading={isPending}
            onClick={handleSubmit}
          >
            ✓ Guardar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Combobox
          label="Albañil"
          placeholder="Buscar por nombre o legajo..."
          options={opcionesPersonal}
          value={leg}
          onChange={setLeg}
        />
        <div>
          <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider block mb-1">
            Semana
          </label>
          <select
            value={semKey}
            onChange={e => setSemKey(e.target.value)}
            className="w-full px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none focus:border-naranja bg-white text-carbon"
          >
            {opcionesSem.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
        <Input
          label="Monto ($)"
          type="number"
          placeholder="0"
          value={monto}
          onChange={e => setMonto(e.target.value)}
        />
        <Input
          label="Concepto (opcional)"
          placeholder={tipo === 'otorgado' ? 'Ej: adelanto de quincena' : 'Ej: cuota préstamo anterior'}
          value={concepto}
          onChange={e => setConcepto(e.target.value)}
        />
      </div>
    </Modal>
  )
}

export function PrestamosPage() {
  const toast = useToast()
  const { puedeCrear } = usePermisos('tarja')
  const { data: prestamos = [], isLoading } = usePrestamos()
  const { data: personal  = [] }            = usePersonal()
  const { mutate: remove }                  = useDeletePrestamo()
  const perfiles = usePerfilesMap()

  const [modalTipo, setModalTipo] = useState<'otorgado' | 'descontado' | null>(null)
  const [filtLeg,   setFiltLeg]   = useState('')

  const opcionesPersonal = useMemo(() =>
    personal
      .map((p: Personal) => ({ value: p.leg, label: p.nom, sub: `Leg. ${p.leg}` })),
    [personal]
  )

  const nombreMap = useMemo(() => {
    const m = new Map<string, string>()
    personal.forEach((p: Personal) => m.set(p.leg, p.nom))
    return m
  }, [personal])

  const filtrados = useMemo(() =>
    filtLeg ? prestamos.filter(p => p.leg === filtLeg) : prestamos,
    [prestamos, filtLeg]
  )

  const totalOtorgado   = filtrados.filter(p => p.tipo === 'otorgado').reduce((s, p) => s + p.monto, 0)
  const totalDescontado = filtrados.filter(p => p.tipo === 'descontado').reduce((s, p) => s + p.monto, 0)

  function handleDelete(id: number) {
    if (!confirm('¿Eliminar este registro?')) return
    remove(id, {
      onSuccess: () => toast('✓ Eliminado', 'ok'),
      onError:   () => toast('Error al eliminar', 'err'),
    })
  }

  return (
    <div className="flex flex-col gap-4 max-w-3xl mx-auto px-4 py-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl tracking-wider text-azul">PRÉSTAMOS</h1>
          <p className="text-sm text-gris-dark mt-0.5">Préstamos y descuentos a albañiles</p>
        </div>
        {puedeCrear && (
          <div className="flex gap-2">
            <Button variant="primary"   size="sm" onClick={() => setModalTipo('otorgado')}>
              💵 Otorgar préstamo
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setModalTipo('descontado')}>
              ↩ Registrar descuento
            </Button>
          </div>
        )}
      </div>

      {/* Filtro + resumen */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <Combobox
            placeholder="Filtrar por albañil..."
            options={opcionesPersonal}
            value={filtLeg}
            onChange={setFiltLeg}
          />
        </div>
        <div className="flex gap-2 items-center flex-shrink-0">
          <div className="bg-naranja-light text-naranja-dark text-xs font-bold px-3 py-2 rounded-lg">
            💵 Otorgado: {fmtM(totalOtorgado)}
          </div>
          <div className="bg-rojo-light text-rojo text-xs font-bold px-3 py-2 rounded-lg">
            ↩ Descontado: {fmtM(totalDescontado)}
          </div>
        </div>
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="text-center py-10 text-gris-dark text-sm">Cargando…</div>
      ) : filtrados.length === 0 ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-gris-dark text-sm">
          No hay préstamos registrados.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtrados.map(p => {
            const esOtorgado = p.tipo === 'otorgado'
            return (
              <div
                key={p.id}
                className={`
                  bg-white rounded-card shadow-card p-4
                  border-l-4
                  ${esOtorgado ? 'border-naranja' : 'border-rojo'}
                `}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`
                        text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide
                        ${esOtorgado ? 'bg-naranja text-white' : 'bg-rojo-light text-rojo'}
                      `}>
                        {esOtorgado ? '💵 Préstamo' : '↩ Descuento'}
                      </span>
                      <span className="font-mono font-bold text-base text-carbon">
                        {fmtM(p.monto)}
                      </span>
                    </div>
                    <div className="font-bold text-sm text-azul">
                      {nombreMap.get(p.leg) ?? p.leg}
                      <span className="font-normal text-gris-dark ml-1 text-xs">Leg. {p.leg}</span>
                    </div>
                    <div className="text-xs text-gris-dark mt-0.5">
                      📅 Semana: {getSemLabel(new Date(p.sem_key + 'T12:00:00'))}
                    </div>
                    {p.concepto && (
                      <div className="text-xs text-carbon mt-0.5 italic">"{p.concepto}"</div>
                    )}
                    {p.created_by && (
                      <div className="text-[10px] text-gris-dark mt-1">
                        ✦ Registrado por <span className="font-bold text-azul">{perfiles.get(p.created_by) ?? '…'}</span>
                        {' · '}{fmtFecha(p.created_at.slice(0, 10))}
                      </div>
                    )}
                  </div>
                  {puedeCrear && (
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="text-gris-mid hover:text-rojo transition-colors text-sm flex-shrink-0"
                      title="Eliminar"
                    >
                      🗑
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modales */}
      {modalTipo && (
        <ModalForm
          open
          tipo={modalTipo}
          onClose={() => setModalTipo(null)}
        />
      )}
    </div>
  )
}
