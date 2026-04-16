'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import {
  useMovimientos, useConceptos, useCentrosCosto,
  useCreateMovimiento, useUpdateMovimiento, useDeleteMovimiento,
  type Movimiento, type CreateMovimientoDto,
} from '../hooks/useCaja'
import { Modal }  from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'

const PAGE_SIZE = 20

function fmtFecha(iso: string) {
  return iso.split('-').reverse().join('/')
}

function fmtMonto(n: number) {
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2 })
}

export function MovimientosTab() {
  const toast = useToast()
  const { data: movimientos = [], isLoading } = useMovimientos()
  const { data: conceptos   = [] }            = useConceptos()
  const { data: centros     = [] }            = useCentrosCosto()

  const createMov  = useCreateMovimiento()
  const updateMov  = useUpdateMovimiento()
  const deleteMov  = useDeleteMovimiento()

  const [modalOpen,  setModalOpen]  = useState(false)
  const [editItem,   setEditItem]   = useState<Movimiento | null>(null)
  const [tipo,       setTipo]       = useState<'ingreso' | 'egreso'>('ingreso')
  const [search,     setSearch]     = useState('')
  const [filterCC,   setFilterCC]   = useState('')
  const [page,       setPage]       = useState(1)

  const form = useForm<any>()

  // Saldo actual = último movimiento en orden ASC
  const ordenAsc = [...movimientos].sort((a, b) => {
    if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha)
    return a.id - b.id
  })
  const saldoActual = ordenAsc.length > 0 ? (ordenAsc[ordenAsc.length - 1]!.saldo_acum ?? 0) : 0

  // Filtros + orden DESC para mostrar
  const filtered = [...movimientos]
    .sort((a, b) => {
      if (a.fecha !== b.fecha) return b.fecha.localeCompare(a.fecha)
      return b.id - a.id
    })
    .filter(m => {
      if (filterCC && m.centro_costo !== filterCC) return false
      if (search) {
        const q = search.toLowerCase()
        return (
          m.concepto.toLowerCase().includes(q) ||
          (m.proveedor ?? '').toLowerCase().includes(q) ||
          (m.detalle ?? '').toLowerCase().includes(q)
        )
      }
      return true
    })

  const paginated = filtered.slice(0, page * PAGE_SIZE)
  const hasMore   = filtered.length > paginated.length

  function openCreate() {
    setEditItem(null)
    setTipo('ingreso')
    form.reset({ fecha: new Date().toISOString().split('T')[0] })
    setModalOpen(true)
  }

  function openEdit(m: Movimiento) {
    setEditItem(m)
    setTipo(m.tipo)
    form.reset({
      fecha:        m.fecha,
      centro_costo: m.centro_costo ?? '',
      proveedor:    m.proveedor ?? '',
      concepto:     m.concepto,
      detalle:      m.detalle ?? '',
      monto:        m.monto,
    })
    setModalOpen(true)
  }

  async function handleSubmit(data: any) {
    const dto: CreateMovimientoDto = {
      fecha:        data.fecha,
      centro_costo: data.centro_costo || undefined,
      proveedor:    data.proveedor || undefined,
      concepto:     data.concepto,
      detalle:      data.detalle || undefined,
      tipo,
      monto:        Number(data.monto),
    }
    try {
      if (editItem) {
        await updateMov.mutateAsync({ id: editItem.id, dto })
        toast('✓ Movimiento actualizado', 'ok')
      } else {
        await createMov.mutateAsync(dto)
        toast('✓ Movimiento registrado', 'ok')
      }
      setModalOpen(false)
    } catch {
      toast('Error al guardar', 'err')
    }
  }

  async function handleDelete(m: Movimiento) {
    if (!confirm(`¿Eliminar movimiento "${m.concepto}"?`)) return
    try {
      await deleteMov.mutateAsync(m.id)
      toast('✓ Eliminado', 'ok')
    } catch {
      toast('Error al eliminar', 'err')
    }
  }

  const loading = createMov.isPending || updateMov.isPending

  const ccOptions = [
    { value: '', label: 'Todos los centros' },
    ...centros.filter(c => c.activo).map(c => ({ value: c.nombre, label: c.nombre })),
  ]

  const conceptosFiltrados = conceptos
    .filter(c => c.activo)
    .filter(c => c.tipo === 'ambos' || c.tipo === tipo)

  return (
    <div className="flex flex-col gap-4">

      {/* Barra superior */}
      <div className="bg-white rounded-card shadow-card p-4 flex flex-wrap items-center gap-3">
        {/* Saldo chip */}
        <div className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold text-sm ${saldoActual >= 0 ? 'bg-verde/10 text-verde' : 'bg-rojo/10 text-rojo'}`}>
          <span>💵</span>
          <span>Saldo actual: $ {fmtMonto(saldoActual)}</span>
        </div>

        <div className="flex-1" />

        {/* Filtros */}
        <input
          type="text"
          placeholder="Buscar..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          className="border border-gris rounded-lg px-3 py-1.5 text-sm w-40 focus:outline-none focus:border-azul"
        />
        <select
          value={filterCC}
          onChange={e => { setFilterCC(e.target.value); setPage(1) }}
          className="border border-gris rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-azul"
        >
          {ccOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <Button variant="primary" size="sm" onClick={openCreate}>＋ Movimiento</Button>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-card shadow-card overflow-hidden">
        {isLoading ? (
          <p className="text-center py-10 text-gris-dark text-sm">Cargando...</p>
        ) : filtered.length === 0 ? (
          <p className="text-center py-10 text-gris-dark text-sm">No hay movimientos.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gris bg-gris/50">
                    <th className="text-left px-4 py-2.5 text-xs font-bold text-gris-dark uppercase tracking-wider">Fecha</th>
                    <th className="text-left px-4 py-2.5 text-xs font-bold text-gris-dark uppercase tracking-wider">Concepto</th>
                    <th className="text-left px-4 py-2.5 text-xs font-bold text-gris-dark uppercase tracking-wider hidden md:table-cell">CC / Proveedor</th>
                    <th className="text-right px-4 py-2.5 text-xs font-bold text-gris-dark uppercase tracking-wider">Ingreso</th>
                    <th className="text-right px-4 py-2.5 text-xs font-bold text-gris-dark uppercase tracking-wider">Egreso</th>
                    <th className="text-right px-4 py-2.5 text-xs font-bold text-gris-dark uppercase tracking-wider hidden md:table-cell">Saldo</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(m => (
                    <tr key={m.id} className={`border-b border-gris last:border-0 hover:bg-gris/30 transition-colors ${m.es_ajuste ? 'bg-amarillo/5' : ''}`}>
                      <td className="px-4 py-3 text-gris-dark font-mono text-xs whitespace-nowrap">{fmtFecha(m.fecha)}</td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-carbon">{m.concepto}</div>
                        {m.detalle && <div className="text-xs text-gris-dark">{m.detalle}</div>}
                        {m.es_ajuste && <span className="text-[10px] font-bold text-amarillo bg-amarillo/10 px-1.5 py-0.5 rounded">AJUSTE</span>}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        {m.centro_costo && <div className="text-xs font-semibold text-azul">{m.centro_costo}</div>}
                        {m.proveedor    && <div className="text-xs text-gris-dark">{m.proveedor}</div>}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-verde">
                        {m.tipo === 'ingreso' ? `$ ${fmtMonto(m.monto)}` : ''}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-rojo">
                        {m.tipo === 'egreso' ? `$ ${fmtMonto(m.monto)}` : ''}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-gris-dark hidden md:table-cell">
                        {m.saldo_acum != null ? `$ ${fmtMonto(m.saldo_acum)}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEdit(m)} className="text-xs px-2 py-1 rounded hover:bg-gris text-gris-dark transition-colors">✏️</button>
                          <button onClick={() => handleDelete(m)} className="text-xs px-2 py-1 rounded hover:bg-rojo/10 text-gris-dark hover:text-rojo transition-colors">✕</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {hasMore && (
              <div className="p-4 text-center">
                <Button variant="secondary" size="sm" onClick={() => setPage(p => p + 1)}>
                  Ver más ({filtered.length - paginated.length} restantes)
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editItem ? '✏️ EDITAR MOVIMIENTO' : '＋ NUEVO MOVIMIENTO'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button variant="primary" loading={loading} onClick={form.handleSubmit(handleSubmit)}>✓ Guardar</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {/* Tipo toggle */}
          <div className="flex rounded-xl overflow-hidden border border-gris">
            <button
              type="button"
              onClick={() => setTipo('ingreso')}
              className={`flex-1 py-2.5 text-sm font-bold transition-colors ${tipo === 'ingreso' ? 'bg-verde text-white' : 'bg-white text-gris-dark hover:bg-gris'}`}
            >
              ▲ INGRESO
            </button>
            <button
              type="button"
              onClick={() => setTipo('egreso')}
              className={`flex-1 py-2.5 text-sm font-bold transition-colors ${tipo === 'egreso' ? 'bg-rojo text-white' : 'bg-white text-gris-dark hover:bg-gris'}`}
            >
              ▼ EGRESO
            </button>
          </div>

          <Input label="Fecha" type="date" {...form.register('fecha', { required: true })} />

          {conceptosFiltrados.length > 0 ? (
            <Select
              label="Concepto"
              placeholder="Seleccioná..."
              options={conceptosFiltrados.map(c => ({ value: c.nombre, label: c.nombre }))}
              {...form.register('concepto', { required: true })}
            />
          ) : (
            <Input label="Concepto" placeholder="Ej: Combustible" {...form.register('concepto', { required: true })} />
          )}

          <Input label="Monto ($)" type="number" step="0.01" placeholder="0.00" {...form.register('monto', { required: true })} />

          {centros.filter(c => c.activo).length > 0 && (
            <Select
              label="Centro de costo"
              placeholder="Opcional"
              options={[{ value: '', label: '— Sin centro de costo —' }, ...centros.filter(c => c.activo).map(c => ({ value: c.nombre, label: c.nombre }))]}
              {...form.register('centro_costo')}
            />
          )}

          <Input label="Proveedor" placeholder="Opcional" {...form.register('proveedor')} />
          <Input label="Detalle / Observaciones" placeholder="Opcional" {...form.register('detalle')} />
        </div>
      </Modal>
    </div>
  )
}
