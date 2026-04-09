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
import type { Personal, Prestamo } from '@/types/domain.types'

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

function semanas(): { value: string; label: string }[] {
  const result = []
  const vie = getViernes(new Date())
  for (let i = 0; i < 52; i++) {
    const d = new Date(vie)
    d.setDate(d.getDate() - i * 7)
    result.push({ value: toISO(d), label: getSemLabel(d) })
  }
  return result
}

// ── Modal crear préstamo / descuento ────────────────────────────────────────
interface ModalFormProps {
  open:     boolean
  tipo:     'otorgado' | 'descontado'
  legInicial?: string
  onClose:  () => void
}

function ModalForm({ open, tipo, legInicial = '', onClose }: ModalFormProps) {
  const toast = useToast()
  const { data: personal = [] } = usePersonal()
  const { mutate: create, isPending } = useCreatePrestamo()

  const [leg,      setLeg]      = useState(legInicial)
  const [semKey,   setSemKey]   = useState(semKeyHoy)
  const [monto,    setMonto]    = useState('')
  const [concepto, setConcepto] = useState('')

  const opcionesPersonal = useMemo(() =>
    personal.map((p: Personal) => ({ value: p.leg, label: p.nom, sub: `Leg. ${p.leg}` })),
    [personal]
  )

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
          setLeg(legInicial); setMonto(''); setConcepto('')
          onClose()
        },
        onError: (e) => toast(e.message ?? 'Error al guardar', 'err'),
      }
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={tipo === 'otorgado' ? '💵 OTORGAR PRÉSTAMO' : '↩ REGISTRAR DESCUENTO'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={isPending} onClick={handleSubmit}>✓ Guardar</Button>
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
            {semanas().map(s => (
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

// ── Card por operario ────────────────────────────────────────────────────────
interface CardOperarioProps {
  leg:        string
  nombre:     string
  movs:       Prestamo[]
  saldo:      number
  puedeCrear: boolean
  perfiles:   Map<string, string>
  onNuevo:    (tipo: 'otorgado' | 'descontado', leg: string) => void
  onDelete:   (id: number) => void
}

function CardOperario({ leg, nombre, movs, saldo, puedeCrear, perfiles, onNuevo, onDelete }: CardOperarioProps) {
  const [expandido, setExpandido] = useState(false)

  // Movimientos ordenados cronológicamente
  const movsOrdenados = [...movs].sort((a, b) => a.created_at.localeCompare(b.created_at))

  const saldado = saldo <= 0

  // Construir detalle con saldo acumulado en cada paso
  let acum = 0
  const detalle = movsOrdenados.map(m => {
    acum = m.tipo === 'otorgado' ? acum + m.monto : acum - m.monto
    return { ...m, acumulado: acum }
  })

  return (
    <div className={`bg-white rounded-card shadow-card border-l-4 ${saldado ? 'border-verde' : 'border-naranja'}`}>
      {/* Cabecera */}
      <div className="flex items-center justify-between gap-3 p-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-sm text-azul">{nombre}</span>
            <span className="text-[10px] text-gris-dark font-mono bg-gris px-1.5 py-0.5 rounded">
              Leg. {leg}
            </span>
          </div>
          <div className={`font-mono font-bold text-lg mt-0.5 ${saldado ? 'text-verde' : 'text-naranja-dark'}`}>
            {saldado ? '✓ Saldado' : `Debe ${fmtM(saldo)}`}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {puedeCrear && (
            <>
              <button
                onClick={() => onNuevo('otorgado', leg)}
                className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-naranja-light text-naranja-dark hover:bg-naranja hover:text-white transition-colors"
              >
                💵 Prestar
              </button>
              <button
                onClick={() => onNuevo('descontado', leg)}
                className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-gris text-gris-dark hover:bg-rojo-light hover:text-rojo transition-colors"
              >
                ↩ Descontar
              </button>
            </>
          )}
          <button
            onClick={() => setExpandido(p => !p)}
            className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-azul-light text-azul hover:bg-azul hover:text-white transition-colors"
          >
            {expandido ? '▴ Ocultar' : '▾ Detalle'}
          </button>
        </div>
      </div>

      {/* Detalle expandible */}
      {expandido && (
        <div className="border-t border-gris-mid mx-4 mb-4">
          <div className="flex flex-col gap-0 mt-3">
            {detalle.map((m, idx) => {
              const esOtorgado = m.tipo === 'otorgado'
              return (
                <div
                  key={m.id}
                  className={`
                    flex items-center justify-between gap-2 py-2 text-sm
                    ${idx < detalle.length - 1 ? 'border-b border-gris' : ''}
                  `}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className={`
                      text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0
                      ${esOtorgado ? 'bg-naranja text-white' : 'bg-rojo-light text-rojo'}
                    `}>
                      {esOtorgado ? '💵' : '↩'}
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs text-gris-dark">
                        {fmtFecha(m.sem_key)} · {getSemLabel(new Date(m.sem_key + 'T12:00:00'))}
                      </div>
                      {m.concepto && (
                        <div className="text-[11px] text-carbon italic truncate">"{m.concepto}"</div>
                      )}
                      {m.created_by && (
                        <div className="text-[10px] text-gris-mid">
                          {perfiles.get(m.created_by) ?? '…'}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-right">
                      <div className={`font-mono font-bold text-sm ${esOtorgado ? 'text-naranja-dark' : 'text-rojo'}`}>
                        {esOtorgado ? '+' : '−'}{fmtM(m.monto)}
                      </div>
                      <div className={`font-mono text-[11px] ${m.acumulado > 0 ? 'text-gris-dark' : 'text-verde'}`}>
                        saldo: {m.acumulado > 0 ? fmtM(m.acumulado) : '✓ $0'}
                      </div>
                    </div>
                    {puedeCrear && (
                      <button
                        onClick={() => onDelete(m.id)}
                        className="text-gris-mid hover:text-rojo transition-colors text-xs"
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

          {/* Resumen al pie */}
          <div className={`
            mt-3 rounded-lg px-3 py-2 flex items-center justify-between
            ${saldado ? 'bg-verde-light' : 'bg-naranja-light'}
          `}>
            <span className={`text-xs font-bold uppercase tracking-wide ${saldado ? 'text-verde' : 'text-naranja-dark'}`}>
              Saldo total
            </span>
            <span className={`font-mono font-bold text-base ${saldado ? 'text-verde' : 'text-naranja-dark'}`}>
              {saldado ? '✓ Saldado' : fmtM(saldo)}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Página principal ─────────────────────────────────────────────────────────
export function PrestamosPage() {
  const toast = useToast()
  const { puedeCrear } = usePermisos('tarja')
  const { data: prestamos = [], isLoading } = usePrestamos()
  const { data: personal  = [] }            = usePersonal()
  const { mutate: remove }                  = useDeletePrestamo()
  const perfiles = usePerfilesMap()

  const [modalConfig, setModalConfig] = useState<{ tipo: 'otorgado' | 'descontado'; leg: string } | null>(null)
  const [filtLeg, setFiltLeg] = useState('')

  const opcionesPersonal = useMemo(() =>
    personal.map((p: Personal) => ({ value: p.leg, label: p.nom, sub: `Leg. ${p.leg}` })),
    [personal]
  )

  const nombreMap = useMemo(() => {
    const m = new Map<string, string>()
    personal.forEach((p: Personal) => m.set(p.leg, p.nom))
    return m
  }, [personal])

  // Agrupar por operario, ordenar por saldo desc (más deuda primero), saldados al final
  const operarios = useMemo(() => {
    const map = new Map<string, Prestamo[]>()
    prestamos.forEach(p => {
      if (!map.has(p.leg)) map.set(p.leg, [])
      map.get(p.leg)!.push(p)
    })
    return [...map.entries()]
      .map(([leg, movs]) => {
        const saldo = movs.reduce((s, m) => m.tipo === 'otorgado' ? s + m.monto : s - m.monto, 0)
        return { leg, movs, saldo }
      })
      .sort((a, b) => b.saldo - a.saldo) // más deuda primero; saldados al final
  }, [prestamos])

  const filtrados = useMemo(() =>
    filtLeg ? operarios.filter(o => o.leg === filtLeg) : operarios,
    [operarios, filtLeg]
  )

  const totalDeuda = operarios.filter(o => o.saldo > 0).reduce((s, o) => s + o.saldo, 0)
  const conDeuda   = operarios.filter(o => o.saldo > 0).length

  function handleDelete(id: number) {
    if (!confirm('¿Eliminar este movimiento?')) return
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
          <p className="text-sm text-gris-dark mt-0.5">
            {conDeuda > 0
              ? `${conDeuda} operario${conDeuda !== 1 ? 's' : ''} con deuda · Total: ${fmtM(totalDeuda)}`
              : 'Sin deudas pendientes'}
          </p>
        </div>
        {puedeCrear && (
          <div className="flex gap-2">
            <Button variant="primary"   size="sm" onClick={() => setModalConfig({ tipo: 'otorgado',   leg: '' })}>
              💵 Otorgar préstamo
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setModalConfig({ tipo: 'descontado', leg: '' })}>
              ↩ Registrar descuento
            </Button>
          </div>
        )}
      </div>

      {/* Filtro */}
      <Combobox
        placeholder="Filtrar por albañil..."
        options={opcionesPersonal}
        value={filtLeg}
        onChange={setFiltLeg}
      />

      {/* Lista por operario */}
      {isLoading ? (
        <div className="text-center py-10 text-gris-dark text-sm">Cargando…</div>
      ) : filtrados.length === 0 ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-gris-dark text-sm">
          No hay préstamos registrados.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtrados.map(({ leg, movs, saldo }) => (
            <CardOperario
              key={leg}
              leg={leg}
              nombre={nombreMap.get(leg) ?? leg}
              movs={movs}
              saldo={saldo}
              puedeCrear={!!puedeCrear}
              perfiles={perfiles}
              onNuevo={(tipo, l) => setModalConfig({ tipo, leg: l })}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      {modalConfig && (
        <ModalForm
          open
          tipo={modalConfig.tipo}
          legInicial={modalConfig.leg}
          onClose={() => setModalConfig(null)}
        />
      )}
    </div>
  )
}
