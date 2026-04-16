'use client'

import { useState, useRef } from 'react'
import { useForm } from 'react-hook-form'
import {
  useMovimientos, useConceptos, useCentrosCosto,
  useCreateMovimiento, useUpdateMovimiento, useDeleteMovimiento,
  type Movimiento, type CreateMovimientoDto,
} from '../hooks/useCaja'
import { useObras } from '@/modules/tarja/hooks/useObras'
import { Modal }    from '@/components/ui/Modal'
import { Button }   from '@/components/ui/Button'
import { Combobox } from '@/components/ui/Combobox'
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
  const { data: obras       = [] }            = useObras()

  const createMov  = useCreateMovimiento()
  const updateMov  = useUpdateMovimiento()
  const deleteMov  = useDeleteMovimiento()

  const [modalOpen,   setModalOpen]   = useState(false)
  const [editItem,    setEditItem]    = useState<Movimiento | null>(null)
  const [tipo,        setTipo]        = useState<'ingreso' | 'egreso'>('ingreso')
  const [search,      setSearch]      = useState('')
  const [filterCC,    setFilterCC]    = useState('')
  const [page,        setPage]        = useState(1)
  const [savedCount,  setSavedCount]  = useState(0)
  // Campos controlados del modal (Combobox no usa register)
  const [fCC,        setFCC]        = useState('')
  const [fProveedor, setFProveedor] = useState('')
  const [fConcepto,  setFConcepto]  = useState('')
  const montoRef = useRef<HTMLInputElement>(null)

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
    setSavedCount(0)
    setFCC(''); setFProveedor(''); setFConcepto('')
    form.reset({ fecha: new Date().toISOString().split('T')[0] })
    setModalOpen(true)
  }

  function resetForNext() {
    setFCC(''); setFProveedor(''); setFConcepto('')
    form.reset({ fecha: form.getValues('fecha') })
    setTimeout(() => montoRef.current?.focus(), 50)
  }

  function openEdit(m: Movimiento) {
    setEditItem(m)
    setTipo(m.tipo)
    setFCC(m.centro_costo ?? '')
    setFProveedor(m.proveedor ?? '')
    setFConcepto(m.concepto)
    form.reset({
      fecha:   m.fecha,
      detalle: m.detalle ?? '',
      monto:   m.monto,
    })
    setModalOpen(true)
  }

  async function handleSubmit(data: any, keepOpen = false) {
    const dto: CreateMovimientoDto = {
      fecha:        data.fecha,
      centro_costo: fCC       || undefined,
      proveedor:    fProveedor || undefined,
      concepto:     fConcepto,
      detalle:      data.detalle || undefined,
      tipo,
      monto:        Number(data.monto),
    }
    try {
      if (editItem) {
        await updateMov.mutateAsync({ id: editItem.id, dto })
        toast('✓ Actualizado', 'ok')
        setModalOpen(false)
      } else {
        await createMov.mutateAsync(dto)
        setSavedCount(c => c + 1)
        if (keepOpen) {
          resetForNext()
        } else {
          setModalOpen(false)
        }
      }
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

  const centrosActivos = centros.filter(c => c.activo)
  const obrasActivas   = obras.filter((o: any) => !o.archivada)

  const ccOpciones = [
    ...centrosActivos.map(c => ({ value: c.nombre, label: c.nombre, sub: 'Centro de costo' })),
    ...obrasActivas.map((o: any) => ({
      value: o.nom,
      label: o.nom,
      sub:   `Obra ${o.cod}`,
    })),
  ]

  const proveedoresUnicos = Array.from(
    new Set(movimientos.map(m => m.proveedor).filter(Boolean) as string[])
  ).map(p => ({ value: p, label: p }))

  const conceptosFiltrados = conceptos
    .filter(c => c.activo)
    .filter(c => c.tipo === 'ambos' || c.tipo === tipo)
    .map(c => ({ value: c.nombre, label: c.nombre }))

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
        <div className="w-52">
          <Combobox
            placeholder="Centro de costo..."
            options={ccOpciones}
            value={filterCC}
            onChange={v => { setFilterCC(v); setPage(1) }}
          />
        </div>

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
        width="max-w-3xl"
        footer={
          editItem ? (
            <>
              <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
              <Button variant="primary" loading={loading} onClick={form.handleSubmit(d => handleSubmit(d, false))}>✓ Guardar</Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setModalOpen(false)}>
                {savedCount > 0 ? `Cerrar (${savedCount} guardados)` : 'Cancelar'}
              </Button>
              <Button variant="secondary" loading={loading} onClick={form.handleSubmit(d => handleSubmit(d, true))}>
                ✓ Guardar y agregar otro
              </Button>
              <Button variant="primary" loading={loading} onClick={form.handleSubmit(d => handleSubmit(d, false))}>
                ✓ Guardar y cerrar
              </Button>
            </>
          )
        }
      >
        <div className="flex flex-col gap-3">

          {savedCount > 0 && (
            <div className="bg-verde/10 text-verde text-xs font-bold px-3 py-2 rounded-lg">
              ✓ {savedCount} movimiento{savedCount > 1 ? 's' : ''} guardado{savedCount > 1 ? 's' : ''}
            </div>
          )}

          {/* Fila 1: tipo + fecha + CC + proveedor */}
          <div className="flex flex-wrap gap-2 items-end">
            {/* Tipo toggle compacto */}
            <div className="flex rounded-lg overflow-hidden border border-gris flex-shrink-0">
              <button type="button" onClick={() => setTipo('ingreso')}
                className={`px-3 py-2 text-xs font-bold transition-colors ${tipo === 'ingreso' ? 'bg-verde text-white' : 'bg-white text-gris-dark hover:bg-gris'}`}>
                ▲ ING
              </button>
              <button type="button" onClick={() => setTipo('egreso')}
                className={`px-3 py-2 text-xs font-bold transition-colors ${tipo === 'egreso' ? 'bg-rojo text-white' : 'bg-white text-gris-dark hover:bg-gris'}`}>
                ▼ EGR
              </button>
            </div>

            {/* Fecha */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">Fecha</label>
              <input type="date" {...form.register('fecha', { required: true })}
                className="border border-gris rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-azul" />
            </div>

            {/* Centro de costo */}
            <Combobox
              label="Centro de costo"
              placeholder="Sin centro..."
              options={ccOpciones}
              value={fCC}
              onChange={setFCC}
              className="w-52"
            />

            {/* Proveedor */}
            <Combobox
              label="Proveedor"
              placeholder="Escribí o buscá..."
              options={proveedoresUnicos}
              value={fProveedor}
              onChange={setFProveedor}
              className="flex-1 min-w-[120px]"
            />
          </div>

          {/* Fila 2: concepto + detalle + monto */}
          <div className="flex flex-wrap gap-2 items-end">
            {/* Concepto */}
            <Combobox
              label="Concepto"
              placeholder="Seleccioná o escribí..."
              options={conceptosFiltrados}
              value={fConcepto}
              onChange={setFConcepto}
              className="flex-1 min-w-[140px]"
            />

            {/* Detalle */}
            <div className="flex flex-col gap-1 flex-1 min-w-[140px]">
              <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">Detalle</label>
              <input type="text" placeholder="Opcional" {...form.register('detalle')}
                className="border border-gris rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-azul" />
            </div>

            {/* Monto */}
            <div className="flex flex-col gap-1 w-32">
              <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">Monto $</label>
              <input
                type="number" step="0.01" placeholder="0.00"
                {...form.register('monto', { required: true })}
                ref={(el) => { form.register('monto').ref(el); (montoRef as any).current = el }}
                className="border border-gris rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-azul font-mono"
              />
            </div>
          </div>

        </div>
      </Modal>
    </div>
  )
}
