'use client'

import { useMemo, useState } from 'react'
import { Combobox } from '@/components/ui/Combobox'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import { useObras } from '@/modules/tarja/hooks/useObras'
import { useCuentaCliente, useGuardarPreciosMCC, type CuentaClienteRow } from '../hooks/useCuentaCliente'
import { exportarCuentaCliente } from '../utils/cuentaClienteExport'
import { EMPRESA } from '@/lib/config/empresa'
import type { Obra } from '@/types/domain.types'

type FiltroPagador = 'todos' | 'cadinc' | 'cliente'

const fmt$ = (n: number) => `$ ${Math.round(n).toLocaleString('es-AR')}`
const fmtF = (s: string | null | undefined) => {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

export function CuentaClienteTab() {
  const toast = useToast()
  const { data: obras = [] } = useObras('certificaciones')
  const [obraSel, setObraSel] = useState<string>('')
  const [pagadorSel, setPagadorSel] = useState<FiltroPagador>('todos')
  const [exporting, setExporting] = useState(false)
  const { resolverItems } = usePermisos('certificaciones')
  const { mutate: guardarPrecios, isPending: guardandoPrecios } = useGuardarPreciosMCC()
  const [modalPrecios, setModalPrecios] = useState(false)
  const [precios, setPrecios] = useState<Record<number, string>>({})

  // Si el user no eligió obra, llama al endpoint sin obra_cod → backend
  // devuelve todas las obras permitidas (o 400 si es scope global).
  const { data: rows = [], isLoading, error } = useCuentaCliente(obraSel || undefined)

  const obrasActivas = (obras as Obra[]).filter(o => !o.archivada)
  const obraOptions = [
    { value: '', label: '— Todas mis obras —' },
    ...obrasActivas.map(o => ({ value: o.cod, label: `${o.cod} — ${o.nom}` })),
  ]
  const obrasMap = useMemo(() => new Map((obras as Obra[]).map(o => [o.cod, o])), [obras])

  // Filtrado por pagador (client-side).
  const filtered = useMemo(() => {
    if (pagadorSel === 'todos') return rows
    return rows.filter(r => r.pagado_por === pagadorSel)
  }, [rows, pagadorSel])

  // Export Excel: respeta el filtro de pagador activo. Si exportás "Pagó
  // directo", el XLSX solo trae esas filas. Si exportás "Todos", trae todo.
  // El user es responsable de elegir qué bucket quiere mandar al cliente.
  async function handleExport() {
    if (filtered.length === 0) { toast('Nada para exportar con esta selección', 'err'); return }
    setExporting(true)
    try {
      await exportarCuentaCliente({
        rows: filtered,
        obrasMap,
        obraFiltro: obraSel,
        pagadorFiltro: pagadorSel,
      })
      toast('📊 Excel exportado', 'ok')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'error desconocido'
      toast(`Error al exportar: ${msg}`, 'err')
    } finally {
      setExporting(false)
    }
  }

  // ── Carga masiva de precios (modal) ──────────────────────────────
  // Precio unitario efectivo tipeado para una fila (vacío → 0; inválido → 0).
  function precioVal(r: CuentaClienteRow): number {
    const raw = precios[r.item_id] ?? ''
    const v = raw === '' ? 0 : Number(raw)
    return Number.isFinite(v) && v >= 0 ? v : 0
  }

  function abrirModalPrecios() {
    const init: Record<number, string> = {}
    // Pre-cargo con el precio actual; los que están en 0 quedan vacíos para
    // tipear cómodo. Solo los materiales de la obra elegida (rows).
    for (const r of rows) init[r.item_id] = Number(r.precio_unit) > 0 ? String(r.precio_unit) : ''
    setPrecios(init)
    setModalPrecios(true)
  }

  function guardarPreciosModal() {
    const cambios = rows
      .filter(r => precioVal(r) !== Number(r.precio_unit))
      .map(r => ({ itemId: r.item_id, precio_unit: precioVal(r) }))
    if (cambios.length === 0) { toast('No cambiaste ningún precio', 'err'); return }
    // Guardita: bajar a $0 un material que tenía precio le saca plata facturable.
    const aCero = rows.filter(r => Number(r.precio_unit) > 0 && precioVal(r) === 0).length
    if (aCero > 0 && !confirm(`Vas a dejar en $0 ${aCero} material(es) que tenían precio cargado.\n¿Continuar?`)) return
    guardarPrecios(cambios, {
      onSuccess: ({ total, fallidos }) => {
        if (fallidos > 0) {
          // No cerramos: el refetch ya repintó los que sí pasaron y el user
          // conserva lo tipeado para reintentar solo los que fallaron.
          toast(`Guardados ${total - fallidos}/${total} — ${fallidos} fallaron`, 'err')
          return
        }
        toast(`✓ ${total} precio${total !== 1 ? 's' : ''} guardado${total !== 1 ? 's' : ''}`, 'ok')
        setModalPrecios(false)
      },
      onError: () => toast('Error al guardar precios', 'err'),
    })
  }

  // KPIs calculados desde la lista sin filtrar (los chips muestran totales
  // por categoría independientes del filtro activo, para que el user vea
  // cuánta plata representa cada bucket).
  const kpis = useMemo(() => {
    let debeCadinc = 0
    let pagoCliente = 0
    for (const r of rows) {
      const total = Number(r.precio_total ?? 0)
      if (r.pagado_por === 'cliente') pagoCliente += total
      else                            debeCadinc  += total
    }
    return { debeCadinc, pagoCliente, total: debeCadinc + pagoCliente }
  }, [rows])

  // Derivados del modal de precios (baratos; `rows` es chico).
  const cambiosCount   = rows.filter(r => precioVal(r) !== Number(r.precio_unit)).length
  const totalModal     = rows.reduce((s, r) => s + Number(r.cantidad) * precioVal(r), 0)
  const sinPrecioCount = rows.filter(r => Number(r.precio_unit) === 0).length
  const obraNombre     = obrasMap.get(obraSel)?.nom ?? obraSel

  return (
    <div className="flex flex-col gap-4">

      {/* Header: filtro obra + segmented pagador + export */}
      <div className="flex items-center gap-3 flex-wrap justify-between">
        <div className="flex items-center gap-3 flex-wrap flex-1 min-w-0">
          <div className="min-w-[260px] max-w-sm">
            <Combobox
              placeholder="— Todas mis obras —"
              options={obraOptions}
              value={obraSel}
              onChange={setObraSel}
            />
          </div>
          <div className="flex gap-1 bg-gris rounded-xl p-1">
            {([
              ['todos',   'Todos',           rows.length],
              ['cadinc',  'Debe el cliente', rows.filter(r => r.pagado_por !== 'cliente').length],
              ['cliente', 'Pagó directo',    rows.filter(r => r.pagado_por === 'cliente').length],
            ] as const).map(([val, label, count]) => {
              const active = pagadorSel === val
              return (
                <button
                  key={val}
                  type="button"
                  onClick={() => setPagadorSel(val)}
                  className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-2 ${
                    active ? 'bg-azul text-white shadow-sm' : 'text-gris-dark hover:text-carbon hover:bg-white'
                  }`}
                >
                  {label}
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center ${
                    active ? 'bg-white/20' : 'bg-white border border-gris-mid text-carbon'
                  }`}>{count}</span>
                </button>
              )
            })}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="primary" size="sm"
            onClick={abrirModalPrecios}
            disabled={!resolverItems || !obraSel || rows.length === 0}
            title={
              !resolverItems ? 'No tenés permiso para cargar precios'
              : !obraSel      ? 'Elegí una obra para cargar precios'
              : undefined
            }
          >
            💲 Cargar precios
          </Button>
          <Button variant="secondary" size="sm" onClick={handleExport} loading={exporting} disabled={filtered.length === 0}>
            📊 Exportar Excel
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Kpi
          label="Debe el cliente"
          sub={`${EMPRESA.nombre} adelantó — pendiente de cobrar`}
          value={fmt$(kpis.debeCadinc)}
          accent="azul"
        />
        <Kpi
          label="Pagó directo el cliente"
          sub="Sin deuda — solo rendición"
          value={fmt$(kpis.pagoCliente)}
          accent="verde"
        />
        <Kpi
          label="Total materiales"
          sub={`${rows.length} ${rows.length !== 1 ? 'ítems' : 'ítem'}`}
          value={fmt$(kpis.total)}
          accent="naranja"
        />
      </div>

      {/* Tabla */}
      {isLoading ? (
        <div className="bg-white rounded-card shadow-card p-8 flex items-center justify-center gap-3 text-gris-dark">
          <span className="w-5 h-5 border-2 border-naranja border-t-transparent rounded-full animate-spin" />
          Cargando…
        </div>
      ) : error ? (
        <div className="bg-rojo-light border border-rojo/30 rounded-card p-4 text-sm text-rojo">
          {error instanceof Error ? error.message : 'Error al cargar'}
        </div>
      ) : (
        <div className="bg-white rounded-card shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gris">
                <tr>
                  <th className="text-left px-3 py-2 text-[11px] font-bold text-gris-dark uppercase tracking-wider">Fecha</th>
                  <th className="text-left px-3 py-2 text-[11px] font-bold text-gris-dark uppercase tracking-wider">Obra</th>
                  <th className="text-left px-3 py-2 text-[11px] font-bold text-gris-dark uppercase tracking-wider">Descripción</th>
                  <th className="text-right px-3 py-2 text-[11px] font-bold text-gris-dark uppercase tracking-wider">Cant.</th>
                  <th className="text-left px-3 py-2 text-[11px] font-bold text-gris-dark uppercase tracking-wider">Proveedor</th>
                  <th className="text-center px-3 py-2 text-[11px] font-bold text-gris-dark uppercase tracking-wider">Origen</th>
                  <th className="text-center px-3 py-2 text-[11px] font-bold text-gris-dark uppercase tracking-wider">Pagador</th>
                  <th className="text-right px-3 py-2 text-[11px] font-bold text-gris-dark uppercase tracking-wider">P. unit.</th>
                  <th className="text-right px-3 py-2 text-[11px] font-bold text-gris-dark uppercase tracking-wider">Total</th>
                  <th className="text-center px-3 py-2 text-[11px] font-bold text-gris-dark uppercase tracking-wider">Factura</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={10} className="text-center py-8 text-gris-dark text-sm italic">
                    {pagadorSel === 'todos'
                      ? 'No hay materiales a cuenta del cliente en esta selección.'
                      : `Sin ítems con pagador "${pagadorSel === 'cadinc' ? EMPRESA.nombre : 'Cliente'}".`}
                  </td></tr>
                ) : filtered.map(r => <Row key={r.id} r={r} obrasMap={obrasMap} />)}
              </tbody>
              {filtered.length > 0 && (
                <tfoot className="bg-gris/50">
                  <tr>
                    <td colSpan={8} className="px-3 py-2 text-right text-xs font-bold text-gris-dark uppercase tracking-wider">Total seleccionado</td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-sm text-azul">
                      {fmt$(filtered.reduce((s, r) => s + Number(r.precio_total ?? 0), 0))}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* Modal: carga masiva de precios de la obra seleccionada. Reusa el
          PATCH del ítem, que recalcula la fila de MCC (total = cant × precio). */}
      <Modal
        open={modalPrecios}
        onClose={() => setModalPrecios(false)}
        title={`💲 Cargar precios — ${obraNombre}`}
        width="max-w-3xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalPrecios(false)}>Cancelar</Button>
            <Button variant="primary" loading={guardandoPrecios} disabled={cambiosCount === 0} onClick={guardarPreciosModal}>
              ✓ Guardar precios ({cambiosCount})
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="text-xs text-gris-dark">
            {rows.length} material{rows.length !== 1 ? 'es' : ''} ·{' '}
            <span className="font-bold text-naranja-dark">{sinPrecioCount} sin precio</span>. Cargá el precio unitario; el total se calcula solo y es lo que se factura al cliente.
          </div>
          <div className="border border-gris rounded-lg overflow-hidden">
            <div className="max-h-[55vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gris sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 text-[11px] font-bold text-gris-dark uppercase tracking-wider">Material</th>
                    <th className="text-right px-3 py-2 text-[11px] font-bold text-gris-dark uppercase tracking-wider">Cant.</th>
                    <th className="text-right px-3 py-2 text-[11px] font-bold text-gris-dark uppercase tracking-wider">Precio unit.</th>
                    <th className="text-right px-3 py-2 text-[11px] font-bold text-gris-dark uppercase tracking-wider">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    const val = precioVal(r)
                    const total = Number(r.cantidad) * val
                    const sinPrecio = Number(r.precio_unit) === 0
                    return (
                      <tr key={r.id} className={`border-t border-gris ${sinPrecio ? 'bg-naranja-light/20' : ''}`}>
                        <td className="px-3 py-2">{r.descripcion}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs whitespace-nowrap">
                          {Number(r.cantidad).toLocaleString('es-AR')} <span className="text-gris-dark">{r.unidad}</span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number" min="0" step="1" inputMode="decimal"
                            value={precios[r.item_id] ?? ''}
                            onChange={e => setPrecios(p => ({ ...p, [r.item_id]: e.target.value }))}
                            placeholder="0"
                            className="w-28 px-2 py-1 border-[1.5px] border-gris-mid rounded-lg text-right font-mono text-sm outline-none focus:border-naranja"
                          />
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-sm font-bold">{total > 0 ? fmt$(total) : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot className="bg-gris/50 sticky bottom-0">
                  <tr>
                    <td colSpan={3} className="px-3 py-2 text-right text-xs font-bold text-gris-dark uppercase tracking-wider">Total obra</td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-sm text-azul">{fmt$(totalModal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ── Internals ─────────────────────────────────────────────────────

function Row({ r, obrasMap }: { r: CuentaClienteRow; obrasMap: Map<string, Obra> }) {
  const obra = obrasMap.get(r.obra_cod)
  const esCliente = r.pagado_por === 'cliente'
  return (
    <tr className="border-t border-gris">
      <td className="px-3 py-2 font-mono text-xs">{fmtF(r.fecha_resolucion)}</td>
      <td className="px-3 py-2">
        <div className="text-sm font-bold">{obra?.nom ?? r.obra_cod}</div>
        <div className="text-[10px] text-gris-dark font-mono">{r.obra_cod}</div>
      </td>
      <td className="px-3 py-2 text-sm">{r.descripcion}</td>
      <td className="px-3 py-2 text-right font-mono text-xs">
        {Number(r.cantidad).toLocaleString('es-AR')} <span className="text-gris-dark">{r.unidad}</span>
      </td>
      <td className="px-3 py-2 text-sm">{r.proveedores?.nombre ?? '—'}</td>
      <td className="px-3 py-2 text-center">
        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
          r.origen === 'proveedor' ? 'bg-azul-light text-azul' : 'bg-naranja-light text-naranja'
        }`}>
          {r.origen === 'proveedor' ? 'Proveedor' : 'Depósito'}
        </span>
      </td>
      <td className="px-3 py-2 text-center">
        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
          esCliente ? 'bg-verde-light text-verde' : 'bg-azul-light text-azul'
        }`}>
          {esCliente ? '💵 Cliente' : EMPRESA.nombre}
        </span>
      </td>
      <td className="px-3 py-2 text-right font-mono text-xs">{fmt$(Number(r.precio_unit ?? 0))}</td>
      <td className="px-3 py-2 text-right font-mono text-sm font-bold">{fmt$(Number(r.precio_total ?? 0))}</td>
      <td className="px-3 py-2 text-center">
        {r.facturas_compra?.adjunto_url ? (
          <a href={r.facturas_compra.adjunto_url} target="_blank" rel="noopener" className="text-azul hover:underline text-xs font-bold">
            📎 {r.facturas_compra.numero || 'Ver'}
          </a>
        ) : (
          <span className="text-gris-mid text-xs">—</span>
        )}
      </td>
    </tr>
  )
}

function Kpi({ label, sub, value, accent }: {
  label: string
  sub?:  string
  value: string
  accent?: 'azul' | 'naranja' | 'verde'
}) {
  const accentCls = accent === 'azul'    ? 'border-azul-light text-azul-mid'
                  : accent === 'naranja' ? 'border-naranja-light text-naranja-dark'
                  : accent === 'verde'   ? 'border-verde-light text-verde'
                  : 'border-gris-mid text-carbon'
  return (
    <div className={`bg-white rounded-card shadow-card p-3 border-l-[4px] ${accentCls}`}>
      <div className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">{label}</div>
      <div className="font-mono font-bold text-xl mt-1">{value}</div>
      {sub && <div className="text-[10px] text-gris-dark mt-0.5">{sub}</div>}
    </div>
  )
}
