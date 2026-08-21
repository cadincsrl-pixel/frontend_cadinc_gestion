'use client'

import { useState, useMemo } from 'react'
import { usePrestamosLigero, usePrestamosForLegs, useCreatePrestamo, useDeletePrestamo } from '../hooks/usePrestamos'
import { usePersonal } from '../hooks/usePersonal'
import { toISO, getViernes, getSemLabel } from '@/lib/utils/dates'
import { Combobox }   from '@/components/ui/Combobox'
import { Button }     from '@/components/ui/Button'
import { Modal }      from '@/components/ui/Modal'
import { Input }      from '@/components/ui/Input'
import { InputMonto } from '@/components/ui/InputMonto'
import { Pagination } from '@/components/ui/Pagination'
import { useToast }   from '@/components/ui/Toast'
import { usePermisos }    from '@/hooks/usePermisos'
import { usePerfilesMap } from '@/lib/hooks/usePerfilesMap'
import type { Personal, Prestamo } from '@/types/domain.types'

const DEFAULT_PAGE_SIZE = 12

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
        <InputMonto
          label="Monto ($)"
          placeholder="0"
          value={monto}
          onChange={setMonto}
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
  /** Total dado de baja como incobrable (histórico del operario). */
  incobrable: number
  puedeCrear: boolean
  perfiles:   Map<string, string>
  onNuevo:    (tipo: 'otorgado' | 'descontado', leg: string) => void
  onIncobrable: (leg: string, saldo: number) => void
  onDelete:   (id: number) => void
}

function CardOperario({ leg, nombre, movs, saldo, incobrable, puedeCrear, perfiles, onNuevo, onIncobrable, onDelete }: CardOperarioProps) {
  const [expandido, setExpandido] = useState(false)

  const movsOrdenados = [...movs].sort((a, b) => a.created_at.localeCompare(b.created_at))

  const saldado = saldo <= 0
  // Saldado a fuerza de incobrable ≠ saldado de verdad: se muestra distinto.
  const porIncobrable = saldado && incobrable > 0

  let acum = 0
  const detalle = movsOrdenados.map(m => {
    acum = m.tipo === 'otorgado' ? acum + m.monto : acum - m.monto
    return { ...m, acumulado: acum }
  })

  return (
    <div className={`bg-white rounded-card shadow-card border-l-4 ${porIncobrable ? 'border-gris-mid' : saldado ? 'border-verde' : 'border-naranja'}`}>
      <div className="flex items-center justify-between gap-3 p-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-sm text-azul">{nombre}</span>
            <span className="text-[10px] text-gris-dark font-mono bg-gris px-1.5 py-0.5 rounded">
              Leg. {leg}
            </span>
          </div>
          <div className={`font-mono font-bold text-lg mt-0.5 ${porIncobrable ? 'text-gris-dark' : saldado ? 'text-verde' : 'text-naranja-dark'}`}>
            {porIncobrable ? `✕ Incobrable (${fmtM(incobrable)})` : saldado ? '✓ Saldado' : `Debe ${fmtM(saldo)}`}
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
              {saldo > 0 && (
                <button
                  onClick={() => onIncobrable(leg, saldo)}
                  title="Dar de baja la deuda sin registrarla como recupero (ej: renuncia)"
                  className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-gris text-gris-dark hover:bg-carbon hover:text-white transition-colors"
                >
                  ✕ Incobrable
                </button>
              )}
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

      {expandido && (
        <div className="border-t border-gris-mid mx-4 mb-4">
          <div className="flex flex-col gap-0 mt-3">
            {detalle.map((m, idx) => {
              const esOtorgado   = m.tipo === 'otorgado'
              const esIncobrable = m.tipo === 'incobrable'
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
                      ${esOtorgado ? 'bg-naranja text-white' : esIncobrable ? 'bg-carbon text-white' : 'bg-rojo-light text-rojo'}
                    `}>
                      {esOtorgado ? '💵' : esIncobrable ? '✕' : '↩'}
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
                      <div className={`font-mono font-bold text-sm ${esOtorgado ? 'text-naranja-dark' : esIncobrable ? 'text-gris-dark line-through' : 'text-rojo'}`}>
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

          <div className={`
            mt-3 rounded-lg px-3 py-2 flex items-center justify-between
            ${porIncobrable ? 'bg-gris' : saldado ? 'bg-verde-light' : 'bg-naranja-light'}
          `}>
            <span className={`text-xs font-bold uppercase tracking-wide ${porIncobrable ? 'text-gris-dark' : saldado ? 'text-verde' : 'text-naranja-dark'}`}>
              Saldo total
            </span>
            <span className={`font-mono font-bold text-base ${porIncobrable ? 'text-gris-dark' : saldado ? 'text-verde' : 'text-naranja-dark'}`}>
              {porIncobrable ? `✕ Incobrable (${fmtM(incobrable)})` : saldado ? '✓ Saldado' : fmtM(saldo)}
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

  // Datos ligeros (leg + tipo + monto) para calcular saldos de todos los operarios
  const { data: ligero = [], isLoading: loadingLigero } = usePrestamosLigero()
  const { data: personal = [] } = usePersonal()
  const { mutate: remove }      = useDeletePrestamo()
  const { mutate: create }      = useCreatePrestamo()
  const perfiles = usePerfilesMap()

  const [modalConfig, setModalConfig] = useState<{ tipo: 'otorgado' | 'descontado'; leg: string } | null>(null)
  const [filtLeg,     setFiltLeg]     = useState('')
  const [page,        setPage]        = useState(1)
  const [pageSize,    setPageSize]    = useState(DEFAULT_PAGE_SIZE)

  const opcionesPersonal = useMemo(() =>
    personal.map((p: Personal) => ({ value: p.leg, label: p.nom, sub: `Leg. ${p.leg}` })),
    [personal]
  )

  const nombreMap = useMemo(() => {
    const m = new Map<string, string>()
    personal.forEach((p: Personal) => m.set(p.leg, p.nom))
    return m
  }, [personal])

  // Agrupar saldos por operario usando datos ligeros. El incobrable salda
  // (resta) pero se acumula aparte: es pérdida, no recupero.
  const operariosSaldos = useMemo(() => {
    const map = new Map<string, { otorgado: number; descontado: number; incobrable: number }>()
    ligero.forEach(r => {
      if (!map.has(r.leg)) map.set(r.leg, { otorgado: 0, descontado: 0, incobrable: 0 })
      const entry = map.get(r.leg)!
      if (r.tipo === 'otorgado')        entry.otorgado   += r.monto
      else if (r.tipo === 'incobrable') entry.incobrable += r.monto
      else                              entry.descontado += r.monto
    })
    return [...map.entries()]
      .map(([leg, { otorgado, descontado, incobrable }]) => ({ leg, saldo: otorgado - descontado - incobrable, incobrable }))
      .sort((a, b) => b.saldo - a.saldo)
  }, [ligero])

  const filtrados = useMemo(() =>
    filtLeg ? operariosSaldos.filter(o => o.leg === filtLeg) : operariosSaldos,
    [operariosSaldos, filtLeg]
  )

  const totalDeuda = operariosSaldos.filter(o => o.saldo > 0).reduce((s, o) => s + o.saldo, 0)
  const conDeuda   = operariosSaldos.filter(o => o.saldo > 0).length
  const totalIncobrables = operariosSaldos.reduce((s, o) => s + o.incobrable, 0)

  // Operarios de la página actual
  const pageItems = useMemo(() => {
    const from = (page - 1) * pageSize
    return filtrados.slice(from, from + pageSize)
  }, [filtrados, page, pageSize])

  const pageLegs = useMemo(() => pageItems.map(o => o.leg), [pageItems])

  // Cargar movimientos completos solo para los operarios de esta página
  const { data: movsPagina = [], isFetching: loadingMovs } = usePrestamosForLegs(pageLegs)

  // Mapear movimientos por leg para las cards
  const movsMap = useMemo(() => {
    const m = new Map<string, Prestamo[]>()
    movsPagina.forEach(p => {
      if (!m.has(p.leg)) m.set(p.leg, [])
      m.get(p.leg)!.push(p)
    })
    return m
  }, [movsPagina])

  function handlePageSizeChange(size: number) {
    setPageSize(size)
    setPage(1)
  }

  // Da de baja el saldo completo de un operario como incobrable (renuncia u
  // otra causa). Un solo movimiento por el saldo restante, semana actual.
  function handleIncobrable(leg: string, saldo: number) {
    const nombre = nombreMap.get(leg) ?? leg
    if (!confirm(`¿Dar por INCOBRABLE la deuda de ${nombre} (${fmtM(saldo)})?\n\nEl saldo queda en $0 y el monto se registra como pérdida (no como plata recuperada). Se puede deshacer eliminando el movimiento.`)) return
    create(
      { leg, sem_key: semKeyHoy(), tipo: 'incobrable', monto: saldo, concepto: 'Dado por incobrable' },
      {
        onSuccess: () => toast('✕ Deuda dada por incobrable', 'ok'),
        onError:   (e) => toast(e.message ?? 'Error al registrar', 'err'),
      }
    )
  }

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
            {totalIncobrables > 0 && (
              <span className="text-gris-dark"> · perdido por incobrables: <b className="text-rojo">{fmtM(totalIncobrables)}</b></span>
            )}
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
        onChange={v => { setFiltLeg(v); setPage(1) }}
      />

      {/* Lista por operario */}
      {loadingLigero ? (
        <div className="text-center py-10 text-gris-dark text-sm">Cargando…</div>
      ) : filtrados.length === 0 ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-gris-dark text-sm">
          No hay préstamos registrados.
        </div>
      ) : (
        <>
          <div className={`flex flex-col gap-3 transition-opacity ${loadingMovs ? 'opacity-60' : ''}`}>
            {pageItems.map(({ leg, saldo, incobrable }) => (
              <CardOperario
                key={leg}
                leg={leg}
                nombre={nombreMap.get(leg) ?? leg}
                movs={movsMap.get(leg) ?? []}
                saldo={saldo}
                incobrable={incobrable}
                puedeCrear={!!puedeCrear}
                perfiles={perfiles}
                onNuevo={(tipo, l) => setModalConfig({ tipo, leg: l })}
                onIncobrable={handleIncobrable}
                onDelete={handleDelete}
              />
            ))}
          </div>

          <Pagination
            page={page}
            total={filtrados.length}
            pageSize={pageSize}
            onChange={p => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
            onPageSizeChange={handlePageSizeChange}
          />
        </>
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
