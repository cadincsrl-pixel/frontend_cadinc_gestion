'use client'

import { useMemo, useState } from 'react'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useClientes, useCuentaCorriente } from '../hooks/useAlquiler'

// Plata: '$' + miles es-AR, sin decimales (mismo formato que el resto del
// módulo — ver ObraMaquinasSection/FacturacionTab).
function fmtPesos(n: number): string {
  return '$' + n.toLocaleString('es-AR', { maximumFractionDigits: 0 })
}

export function CuentaCorrienteTab() {
  const { data: clientes = [], isLoading: loadingClientes } = useClientes()

  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [clienteId, setClienteId] = useState<number | null>(null)

  const filtro = useMemo(() => {
    const f: { desde?: string; hasta?: string; cliente_id?: number } = {}
    if (desde) f.desde = desde
    if (hasta) f.hasta = hasta
    if (clienteId != null) f.cliente_id = clienteId
    return f
  }, [desde, hasta, clienteId])

  const { data: filas = [], isLoading, isError } = useCuentaCorriente(filtro)

  const opcionesCliente = useMemo(
    () => [
      { value: '', label: 'Todos los clientes' },
      ...clientes.map(c => ({ value: String(c.id), label: c.nombre })),
    ],
    [clientes],
  )

  const totalGeneral = useMemo(
    () => filas.reduce((acc, c) => acc + c.devengado, 0),
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

      {/* Aclaración: esto es devengado, no saldo. */}
      <div className="bg-azul-light/40 border-l-[4px] border-azul rounded-card px-4 py-3 text-sm text-azul">
        <span className="font-bold">Devengado por horas trabajadas.</span>{' '}
        <span className="text-gris-dark">
          (Los cobros y el saldo vienen en la próxima etapa.)
        </span>
      </div>

      {/* Estados */}
      {isLoading ? (
        <SpinnerCard texto="Calculando devengado por cliente..." />
      ) : isError ? (
        <ErrorCard />
      ) : filas.length === 0 ? (
        <EmptyCard texto="No hay devengado para los filtros seleccionados." />
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {filas.map(c => (
              <ClienteCard key={c.cliente_id ?? 'sin-cliente'} cliente={c} />
            ))}
          </div>

          {/* Total general */}
          <div className="bg-azul text-white rounded-card shadow-card px-4 py-3 flex items-center justify-between">
            <span className="text-sm font-bold uppercase tracking-wide">
              Total devengado ({filas.length} {filas.length === 1 ? 'cliente' : 'clientes'})
            </span>
            <span className="font-display text-2xl tracking-wider whitespace-nowrap">
              {fmtPesos(totalGeneral)}
            </span>
          </div>
        </>
      )}
    </div>
  )
}

// ── Card de un cliente con desglose por obra expandible ──
function ClienteCard({
  cliente,
}: {
  cliente: {
    cliente_id:     number | null
    cliente_nombre: string
    devengado:      number
    obras: Array<{ obra_id: number; obra_nombre: string; devengado: number }>
  }
}) {
  const [abierto, setAbierto] = useState(false)
  const tieneObras = cliente.obras.length > 0

  return (
    <div className="bg-white rounded-card shadow-card overflow-hidden">
      <button
        type="button"
        onClick={() => tieneObras && setAbierto(o => !o)}
        disabled={!tieneObras}
        className={`w-full p-3 sm:p-4 flex items-center justify-between gap-3 text-left ${
          tieneObras ? 'hover:bg-gris/50 transition-colors cursor-pointer' : 'cursor-default'
        }`}
      >
        <div className="min-w-0 flex items-center gap-2">
          {tieneObras && (
            <span className="text-gris-dark shrink-0 text-sm select-none">
              {abierto ? '▾' : '▸'}
            </span>
          )}
          <div className="min-w-0">
            <div className="font-bold text-base text-carbon truncate">
              🧑‍💼 {cliente.cliente_nombre}
            </div>
            <div className="text-xs text-gris-dark">
              {cliente.obras.length} {cliente.obras.length === 1 ? 'obra' : 'obras'}
            </div>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] font-bold text-gris-dark uppercase tracking-wider">Devengado</div>
          <div className="font-display text-2xl tracking-wider text-azul whitespace-nowrap">
            {fmtPesos(cliente.devengado)}
          </div>
        </div>
      </button>

      {/* Desglose por obra */}
      {abierto && tieneObras && (
        <div className="border-t border-gris divide-y divide-gris bg-gris/30">
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
      )}
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
