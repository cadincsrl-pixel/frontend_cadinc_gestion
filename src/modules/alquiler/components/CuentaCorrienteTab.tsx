'use client'

import { useMemo, useState, type MouseEvent } from 'react'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import {
  useClientes,
  useCuentaCorriente,
  useCobros,
  useDeleteCobro,
  useRemitosCliente,
} from '../hooks/useAlquiler'
import { apiGet } from '@/lib/api/client'
import { MEDIO_COBRO_LABEL, type Cobro, type CuentaCorrienteCliente, type RemitoCliente } from '../types'
import { RegistrarCobroModal } from './RegistrarCobroModal'
import { descargarCuentaClientePdf } from '../utils/cuenta-pdf'

// Plata: '$' + miles es-AR, sin decimales (mismo formato que el resto del
// módulo — ver ObraMaquinasSection/FacturacionTab).
function fmtPesos(n: number): string {
  return '$' + n.toLocaleString('es-AR', { maximumFractionDigits: 0 })
}

// dd/mm/yyyy por split de string (NO new Date(iso) — evita corrimiento de TZ).
function fmtFecha(iso: string): string {
  return iso.split('-').reverse().join('/')
}

// Solo las fechas del filtro se propagan a la lista de cobros del acordeón,
// para que devengado/cobros/saldo y el detalle hablen del mismo período.
interface FiltroFechas {
  desde?: string
  hasta?: string
}

export function CuentaCorrienteTab() {
  const { data: clientes = [], isLoading: loadingClientes } = useClientes()
  const permisos = usePermisos('alquiler')

  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [clienteId, setClienteId] = useState<number | null>(null)

  // Cliente sobre el que se está registrando un cobro (modal). null = cerrado.
  const [cobroPara, setCobroPara] = useState<{ id: number; nombre: string } | null>(null)

  const filtro = useMemo(() => {
    const f: { desde?: string; hasta?: string; cliente_id?: number } = {}
    if (desde) f.desde = desde
    if (hasta) f.hasta = hasta
    if (clienteId != null) f.cliente_id = clienteId
    return f
  }, [desde, hasta, clienteId])

  const filtroFechas = useMemo<FiltroFechas>(() => {
    const f: FiltroFechas = {}
    if (desde) f.desde = desde
    if (hasta) f.hasta = hasta
    return f
  }, [desde, hasta])

  const { data: filas = [], isLoading, isError } = useCuentaCorriente(filtro)

  const opcionesCliente = useMemo(
    () => [
      { value: '', label: 'Todos los clientes' },
      ...clientes.map(c => ({ value: String(c.id), label: c.nombre })),
    ],
    [clientes],
  )

  const totales = useMemo(
    () =>
      filas.reduce(
        (acc, c) => ({
          devengado: acc.devengado + c.devengado,
          cobros:    acc.cobros + c.cobros,
          saldo:     acc.saldo + c.saldo,
        }),
        { devengado: 0, cobros: 0, saldo: 0 },
      ),
    [filas],
  )

  return (
    <div className="flex flex-col gap-4">
      {/* Filtros */}
      <div className="bg-white rounded-card shadow-card p-3 sm:p-4 flex flex-col sm:flex-row sm:items-end gap-3">
        <div className="flex-1 min-w-0">
          <Select
            label="Cliente"
            options={opcionesCliente}
            value={clienteId != null ? String(clienteId) : ''}
            onChange={e => setClienteId(e.target.value ? Number(e.target.value) : null)}
            disabled={loadingClientes}
          />
        </div>
        <div className="w-full sm:w-44">
          <Input label="Desde" type="date" value={desde} onChange={e => setDesde(e.target.value)} />
        </div>
        <div className="w-full sm:w-44">
          <Input label="Hasta" type="date" value={hasta} onChange={e => setHasta(e.target.value)} />
        </div>
      </div>

      {/* Aclaración: el saldo es devengado − cobros del período filtrado. */}
      <div className="bg-azul-light/40 border-l-[4px] border-azul rounded-card px-4 py-3 text-sm text-azul">
        <span className="font-bold">Saldo = devengado − cobros.</span>{' '}
        <span className="text-gris-dark">
          Con filtro de fechas, ambos se acotan al período. Sin filtro, es el saldo total acumulado.
        </span>
      </div>

      {/* Estados */}
      {isLoading ? (
        <SpinnerCard texto="Calculando saldos por cliente..." />
      ) : isError ? (
        <ErrorCard />
      ) : filas.length === 0 ? (
        <EmptyCard texto="No hay movimientos para los filtros seleccionados." />
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {filas.map(c => (
              <ClienteCard
                key={c.cliente_id ?? 'sin-cliente'}
                cliente={c}
                filtroFechas={filtroFechas}
                puedeCrear={permisos.puedeCrear && permisos.gestionarCobros}
                puedeEliminar={permisos.puedeEliminar && permisos.gestionarCobros}
                onRegistrarCobro={() =>
                  c.cliente_id != null &&
                  setCobroPara({ id: c.cliente_id, nombre: c.cliente_nombre })
                }
              />
            ))}
          </div>

          {/* Total general */}
          <div className="bg-azul text-white rounded-card shadow-card px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <span className="text-sm font-bold uppercase tracking-wide">
              Total ({filas.length} {filas.length === 1 ? 'cliente' : 'clientes'})
            </span>
            <div className="flex items-center gap-5 sm:gap-7 flex-wrap">
              <TotalNum label="Devengado" valor={totales.devengado} />
              <TotalNum label="Cobros" valor={totales.cobros} />
              <div className="text-right">
                <div className="text-[10px] font-bold text-white/70 uppercase tracking-wider">Saldo</div>
                <div className="font-display text-2xl tracking-wider whitespace-nowrap">
                  {fmtPesos(totales.saldo)}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Modal de registro de cobro (preset al cliente clickeado) */}
      {cobroPara && (
        <RegistrarCobroModal
          open
          onClose={() => setCobroPara(null)}
          clienteId={cobroPara.id}
          clienteNombre={cobroPara.nombre}
        />
      )}
    </div>
  )
}

function TotalNum({ label, valor }: { label: string; valor: number }) {
  return (
    <div className="text-right">
      <div className="text-[10px] font-bold text-white/70 uppercase tracking-wider">{label}</div>
      <div className="font-display text-lg tracking-wider whitespace-nowrap text-white/90">
        {fmtPesos(valor)}
      </div>
    </div>
  )
}

// ── Estilo y label del saldo según signo ──
// >0 = el cliente DEBE (naranja), <0 = a favor del cliente (verde), 0 = al día.
function saldoUI(saldo: number): { color: string; label: string } {
  if (saldo > 0) return { color: 'text-naranja', label: 'Debe' }
  if (saldo < 0) return { color: 'text-verde', label: 'A favor' }
  return { color: 'text-gris-dark', label: 'Al día' }
}

// ── Card de un cliente: devengado / cobros / saldo + acordeón ──
function ClienteCard({
  cliente,
  filtroFechas,
  puedeCrear,
  puedeEliminar,
  onRegistrarCobro,
}: {
  cliente:          CuentaCorrienteCliente
  filtroFechas:     FiltroFechas
  puedeCrear:       boolean
  puedeEliminar:    boolean
  onRegistrarCobro: () => void
}) {
  const toast = useToast()
  const [abierto, setAbierto] = useState(false)
  const [descargando, setDescargando] = useState<'deuda' | 'historico' | null>(null)
  const esSinCliente = cliente.cliente_id == null
  const { color: saldoColor, label: saldoLabel } = saldoUI(cliente.saldo)

  // PDF de detalle: estado COMPLETO de la cuenta (sin filtro de fechas),
  // para que resumen, remitos y cobros del documento cierren entre sí.
  // 'deuda' = solo remitos adeudados (para mandarle al cliente);
  // 'historico' = todos los remitos + cobros.
  async function handlePdf(e: MouseEvent, modo: 'deuda' | 'historico') {
    e.stopPropagation()
    if (cliente.cliente_id == null || descargando) return
    setDescargando(modo)
    try {
      const [cuentas, remitos, cobros] = await Promise.all([
        apiGet<CuentaCorrienteCliente[]>(`/api/alquiler/cuenta-corriente?cliente_id=${cliente.cliente_id}`),
        apiGet<RemitoCliente[]>(`/api/alquiler/cuenta-corriente/${cliente.cliente_id}/remitos`),
        apiGet<Cobro[]>(`/api/alquiler/cobros?cliente_id=${cliente.cliente_id}`),
      ])
      const cuentaCompleta = cuentas.find(c => c.cliente_id === cliente.cliente_id) ?? cliente
      descargarCuentaClientePdf(cuentaCompleta, remitos, cobros, modo)
    } catch {
      toast('No se pudo generar el PDF', 'err')
    } finally {
      setDescargando(null)
    }
  }

  return (
    <div className="bg-white rounded-card shadow-card overflow-hidden">
      {/* Cabecera: expandible (siempre, para mostrar obras y/o cobros).
          Es un div clickeable (no <button>) porque adentro vive el botón
          de PDF — un button anidado sería HTML inválido. */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setAbierto(o => !o)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAbierto(o => !o) } }}
        className="w-full p-3 sm:p-4 flex items-center justify-between gap-3 text-left hover:bg-gris/50 transition-colors cursor-pointer"
      >
        <div className="min-w-0 flex items-center gap-2">
          <span className="text-gris-dark shrink-0 text-sm select-none">
            {abierto ? '▾' : '▸'}
          </span>
          <div className="min-w-0">
            <div className="font-bold text-base text-carbon truncate">
              {esSinCliente ? '❔' : '🧑‍💼'} {cliente.cliente_nombre}
            </div>
            <div className="text-xs text-gris-dark">
              {cliente.obras.length} {cliente.obras.length === 1 ? 'obra' : 'obras'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4 sm:gap-6 shrink-0">
          <div className="text-right hidden sm:block">
            <div className="text-[10px] font-bold text-gris-dark uppercase tracking-wider">Devengado</div>
            <div className="font-semibold text-sm text-azul whitespace-nowrap">
              {fmtPesos(cliente.devengado)}
            </div>
          </div>
          <div className="text-right hidden sm:block">
            <div className="text-[10px] font-bold text-gris-dark uppercase tracking-wider">Cobros</div>
            <div className="font-semibold text-sm text-verde whitespace-nowrap">
              {fmtPesos(cliente.cobros)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-bold text-gris-dark uppercase tracking-wider">
              Saldo · {saldoLabel}
            </div>
            <div className={`font-display text-2xl tracking-wider whitespace-nowrap ${saldoColor}`}>
              {fmtPesos(cliente.saldo)}
            </div>
          </div>
          {!esSinCliente && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={e => handlePdf(e, 'deuda')}
                disabled={!!descargando}
                title="PDF con SOLO los remitos adeudados — para mandarle al cliente"
                className="text-sm font-bold px-2.5 py-1.5 rounded-lg border border-gris-mid hover:bg-azul-light hover:border-azul transition-colors disabled:opacity-50"
              >
                {descargando === 'deuda' ? '…' : '📄 Deuda'}
              </button>
              <button
                type="button"
                onClick={e => handlePdf(e, 'historico')}
                disabled={!!descargando}
                title="PDF histórico completo: todos los remitos y cobros"
                className="text-sm font-bold px-2.5 py-1.5 rounded-lg border border-gris-mid hover:bg-azul-light hover:border-azul transition-colors disabled:opacity-50"
              >
                {descargando === 'historico' ? '…' : '📄 Histórico'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Acordeón: desglose de obras + acción de cobro + lista de cobros */}
      {abierto && (
        <div className="border-t border-gris bg-gris/30">
          {/* Devengado por obra */}
          {cliente.obras.length > 0 ? (
            <div className="divide-y divide-gris">
              {cliente.obras.map(o => (
                <div
                  key={o.obra_id}
                  className="px-4 py-2.5 sm:pl-10 flex items-center justify-between gap-3"
                >
                  <span className="min-w-0 truncate text-sm text-carbon">🏗 {o.obra_nombre}</span>
                  <span className="shrink-0 font-semibold text-sm text-azul whitespace-nowrap">
                    {fmtPesos(o.devengado)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-4 py-2.5 sm:pl-10 text-sm text-gris-dark italic">
              Sin obras con devengado en el período.
            </div>
          )}

          {/* Desglose de remitos del cliente: pendientes vs cobrados. */}
          {!esSinCliente && (
            <RemitosClienteSection clienteId={cliente.cliente_id!} enabled={abierto} filtroFechas={filtroFechas} />
          )}

          {/* Cobros del cliente. "Sin cliente" no es una ficha → sin cobros. */}
          {!esSinCliente && (
            <div className="border-t border-gris">
              <div className="px-4 py-2.5 sm:px-6 flex items-center justify-between gap-3">
                <span className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">
                  💵 Cobros
                </span>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!puedeCrear}
                  onClick={onRegistrarCobro}
                >
                  ＋ Registrar cobro
                </Button>
              </div>
              <CobrosLista
                clienteId={cliente.cliente_id!}
                filtroFechas={filtroFechas}
                puedeEliminar={puedeEliminar}
                enabled={abierto}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Remitos del cliente: pendientes arriba (destacados), cobrados después ──
// Lazy: solo carga cuando el acordeón está abierto.
function RemitosClienteSection({ clienteId, enabled, filtroFechas }: { clienteId: number; enabled: boolean; filtroFechas: FiltroFechas }) {
  const { data: remitosAll = [], isLoading } = useRemitosCliente(clienteId, enabled)
  // Acotar al período del filtro (por fecha_trabajo) para que el desglose
  // cierre con el devengado/cobros del header y la lista de cobros, que sí
  // respetan el rango. Sin filtro, son todos.
  const remitos = remitosAll.filter(r =>
    (!filtroFechas.desde || r.fecha_trabajo >= filtroFechas.desde) &&
    (!filtroFechas.hasta || r.fecha_trabajo <= filtroFechas.hasta)
  )
  const pendientes = remitos.filter(r => r.cobro_id == null)
  const cobrados   = remitos.filter(r => r.cobro_id != null)
  const totalPendiente = pendientes.reduce((s, r) => s + Number(r.importe ?? 0), 0)

  if (isLoading) {
    return (
      <div className="border-t border-gris px-4 sm:px-6 py-3 text-xs text-gris-dark italic">
        Cargando remitos…
      </div>
    )
  }
  if (remitos.length === 0) return null

  const Fila = ({ r }: { r: RemitoCliente }) => (
    <div className="px-4 sm:px-6 py-2 flex items-center justify-between gap-3">
      <div className="min-w-0 flex items-center gap-2 flex-wrap text-xs">
        <span className="font-mono font-bold text-naranja">{r.numero}</span>
        <span className="font-mono text-gris-dark">{fmtFecha(r.fecha_trabajo)}</span>
        <span className="text-carbon truncate">
          {r.maquina_nombre ?? '—'} · {Number(r.horas).toLocaleString('es-AR')} hs
        </span>
        {r.obra_nombre && <span className="text-gris-dark truncate">· {r.obra_nombre}</span>}
      </div>
      <div className="shrink-0 flex items-center gap-2">
        <span className="font-mono font-semibold text-sm text-carbon whitespace-nowrap">
          {r.importe != null ? fmtPesos(Number(r.importe)) : '—'}
        </span>
        {r.cobro_id != null ? (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-verde/10 text-verde whitespace-nowrap">✓ COBRADO</span>
        ) : (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-naranja-light text-naranja-dark whitespace-nowrap">ADEUDADO</span>
        )}
      </div>
    </div>
  )

  return (
    <div className="border-t border-gris">
      <div className="px-4 py-2.5 sm:px-6 flex items-center justify-between gap-3">
        <span className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">
          🧾 Remitos {pendientes.length > 0 && (
            <span className="text-naranja-dark normal-case tracking-normal">
              — {pendientes.length} pendiente{pendientes.length !== 1 ? 's' : ''} por {fmtPesos(totalPendiente)}
            </span>
          )}
        </span>
      </div>
      <div className="divide-y divide-gris">
        {pendientes.map(r => <Fila key={r.id} r={r} />)}
        {cobrados.map(r => <Fila key={r.id} r={r} />)}
      </div>
    </div>
  )
}

// ── Lista de cobros de un cliente (lazy: solo cuando el acordeón está abierto) ──
function CobrosLista({
  clienteId,
  filtroFechas,
  puedeEliminar,
  enabled,
}: {
  clienteId:     number
  filtroFechas:  FiltroFechas
  puedeEliminar: boolean
  enabled:       boolean
}) {
  const toast = useToast()
  const { data: cobros = [], isLoading, isError } = useCobros(
    { cliente_id: clienteId, ...filtroFechas },
    enabled,
  )
  const { mutate: remove, isPending: removing } = useDeleteCobro()

  function handleEliminar(c: Cobro) {
    if (!confirm(`¿Eliminar el cobro de ${fmtPesos(c.monto)} del ${fmtFecha(c.fecha)}?`)) return
    remove(c.id, {
      onSuccess: () => toast('✓ Cobro eliminado', 'ok'),
      onError: (err: unknown) =>
        toast((err as { message?: string })?.message || 'No se pudo eliminar el cobro', 'err'),
    })
  }

  if (isLoading) {
    return (
      <div className="px-4 sm:px-6 py-3 text-xs text-gris-dark italic">Cargando cobros…</div>
    )
  }
  if (isError) {
    return (
      <div className="px-4 sm:px-6 py-3 text-xs text-rojo italic">No se pudieron cargar los cobros.</div>
    )
  }
  if (cobros.length === 0) {
    return (
      <div className="px-4 sm:px-6 pb-3 text-xs text-gris-dark italic">
        Todavía no hay cobros registrados.
      </div>
    )
  }

  return (
    <div className="divide-y divide-gris">
      {cobros.map(c => (
        <div
          key={c.id}
          className="px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3"
        >
          <div className="min-w-0 flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs text-gris-dark">{fmtFecha(c.fecha)}</span>
            <span className="font-semibold text-sm text-verde whitespace-nowrap">{fmtPesos(c.monto)}</span>
            <span className="text-xs text-gris-dark">· {MEDIO_COBRO_LABEL[c.medio]}</span>
            {c.obs && <span className="text-xs text-gris-dark truncate">· {c.obs}</span>}
          </div>
          <Button
            variant="ghost"
            size="sm"
            disabled={!puedeEliminar || removing}
            onClick={() => handleEliminar(c)}
            aria-label="Eliminar cobro"
          >
            🗑
          </Button>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────── Estados compartidos ───────────────────────────
function SpinnerCard({ texto }: { texto: string }) {
  return (
    <div className="bg-white rounded-card shadow-card p-8 text-center text-gris-dark text-sm">
      <span className="inline-flex items-center gap-2">
        <span className="w-4 h-4 border-2 border-naranja border-t-transparent rounded-full animate-spin" />
        {texto}
      </span>
    </div>
  )
}

function ErrorCard() {
  return (
    <div className="bg-white rounded-card shadow-card p-8 text-center text-rojo text-sm italic">
      No se pudo cargar la cuenta corriente. Reintentá en unos segundos.
    </div>
  )
}

function EmptyCard({ texto }: { texto: string }) {
  return (
    <div className="bg-white rounded-card shadow-card p-8 text-center text-gris-dark text-sm italic">
      {texto}
    </div>
  )
}
