'use client'

/**
 * Aumento masivo de sueldos de oficina.
 *
 * Todos los meses los sueldos se actualizan por un %: puede ser el mismo
 * para todos (input global) o distinto por persona (editable por fila).
 * Dejar una fila vacía la excluye del aumento. El backend crea una versión
 * nueva de sueldo por persona sobre la vigente ANTERIOR al `desde` elegido
 * (re-aplicar con el mismo desde corrige, no compone % sobre %).
 */

import { useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { useAplicarAumento, sueldoVigente, mensajeErrorOficina } from '../hooks/useOficina'
import type { OficinaPersona } from '@/types/domain.types'

function fmtPesos(n: number): string {
  return '$' + Math.round(n).toLocaleString('es-AR')
}

function primerDiaMesActual(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

const pctValido = (v: string) => {
  const n = Number(v)
  return Number.isFinite(n) && n > -100 && n <= 1000
}

interface Props {
  open:     boolean
  onClose:  () => void
  personas: OficinaPersona[]
}

// Wrapper de remount: el contenido se monta solo con el modal abierto, así
// el estado (desde / % globales / % por fila) nace fresco en cada apertura
// sin necesitar un effect de reset.
export function OficinaAumentoModal({ open, onClose, personas }: Props) {
  if (!open) return null
  return <AumentoInner onClose={onClose} personas={personas} />
}

function AumentoInner({ onClose, personas }: Omit<Props, 'open'>) {
  const toast = useToast()
  const { mutate: aplicar, isPending } = useAplicarAumento()

  // Solo personas activas con un sueldo vigente sobre el cual aumentar.
  const filasBase = useMemo(
    () => personas
      .filter(p => p.activo)
      .map(p => ({ persona: p, vigente: sueldoVigente(p.sueldos) }))
      .filter((f): f is { persona: OficinaPersona; vigente: NonNullable<ReturnType<typeof sueldoVigente>> } =>
        f.vigente !== null && f.vigente.costo_mensual > 0),
    [personas],
  )

  const [desde, setDesde] = useState(primerDiaMesActual)
  const [global, setGlobal] = useState('')
  // % por persona como string del <input type="number">; '' = excluida.
  const [pcts, setPcts] = useState<Record<number, string>>({})

  function aplicarGlobal() {
    if (!pctValido(global)) {
      toast('Ingresá un % válido para aplicar a todos', 'err')
      return
    }
    setPcts(Object.fromEntries(filasBase.map(f => [f.persona.id, global])))
  }

  const items = filasBase
    .filter(f => (pcts[f.persona.id] ?? '') !== '')
    .map(f => ({
      persona_id: f.persona.id,
      porcentaje: Math.round(Number(pcts[f.persona.id]) * 100) / 100,
    }))
  const invalidas = filasBase.filter(f => {
    const v = pcts[f.persona.id] ?? ''
    return v !== '' && !pctValido(v)
  })

  function onSubmit() {
    if (invalidas.length > 0) {
      toast('Hay porcentajes inválidos (deben ser > -100 y ≤ 1000)', 'err')
      return
    }
    if (items.length === 0) {
      toast('Cargá el % de al menos una persona (o usá "Aplicar a todos")', 'err')
      return
    }
    if (!desde) {
      toast('Elegí desde cuándo rige el aumento', 'err')
      return
    }
    aplicar(
      { desde, items },
      {
        onSuccess: (res) => {
          toast(`✓ Aumento aplicado a ${res.items.length} persona${res.items.length !== 1 ? 's' : ''}`, 'ok')
          onClose()
        },
        onError: (err) => toast(mensajeErrorOficina(err, 'Error al aplicar el aumento'), 'err'),
      },
    )
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="📈 AUMENTO DE SUELDOS"
      width="max-w-2xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={isPending} onClick={onSubmit}>
            ✓ Aplicar aumento{items.length > 0 ? ` (${items.length})` : ''}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="bg-azul-light rounded-xl px-4 py-3 text-xs text-azul-mid">
          Genera una <b>versión nueva</b> de sueldo por persona — los meses
          anteriores conservan sus valores. Dejá el % vacío para excluir a
          alguien; si te equivocás, re-aplicá con el mismo &quot;desde&quot; y
          se corrige (no se acumula).
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Rige desde"
            type="date"
            value={desde}
            onChange={e => setDesde(e.target.value)}
          />
          <div>
            <label className="block text-[11px] font-bold text-gris-dark uppercase tracking-wider mb-1">
              % para todos
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                step="0.1"
                placeholder="ej: 4.5"
                value={global}
                onChange={e => setGlobal(e.target.value)}
                className="flex-1 min-w-0 border-[1.5px] border-gris-mid rounded-lg px-3 py-2 text-sm outline-none focus:border-naranja"
              />
              <Button size="sm" variant="secondary" onClick={aplicarGlobal}>
                Aplicar a todos
              </Button>
            </div>
          </div>
        </div>

        {filasBase.length === 0 ? (
          <p className="text-sm text-gris-dark text-center py-4">
            No hay personas activas con sueldo vigente para aumentar.
          </p>
        ) : (
          <div className="bg-gris rounded-xl divide-y divide-gris-mid max-h-72 overflow-y-auto">
            {filasBase.map(f => {
              const v = pcts[f.persona.id] ?? ''
              const esInvalida = v !== '' && !pctValido(v)
              const nuevo = v !== '' && pctValido(v)
                ? f.vigente.costo_mensual * (1 + Number(v) / 100)
                : null
              return (
                <div key={f.persona.id} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-carbon truncate">{f.persona.nombre}</div>
                    <div className="font-mono text-[11px] text-gris-dark">
                      {fmtPesos(f.vigente.costo_mensual)}/mes
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <input
                      type="number"
                      step="0.1"
                      placeholder="—"
                      value={v}
                      onChange={e => setPcts(prev => ({ ...prev, [f.persona.id]: e.target.value }))}
                      className={`w-20 border-[1.5px] rounded-lg px-2 py-1.5 text-sm text-right font-mono outline-none focus:border-naranja ${
                        esInvalida ? 'border-rojo bg-rojo-light/40' : 'border-gris-mid'
                      }`}
                    />
                    <span className="text-xs text-gris-dark">%</span>
                  </div>
                  <div className="w-28 text-right font-mono text-sm font-bold shrink-0">
                    {nuevo != null
                      ? <span className="text-verde">{fmtPesos(nuevo)}</span>
                      : <span className="text-gris-mid">—</span>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Modal>
  )
}
