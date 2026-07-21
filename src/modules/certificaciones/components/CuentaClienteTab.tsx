'use client'

import { useMemo, useState } from 'react'
import { Combobox } from '@/components/ui/Combobox'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import { toISO } from '@/lib/utils/dates'
import { useObras } from '@/modules/tarja/hooks/useObras'
import {
  useCuentaCliente, useGuardarPreciosMCC, usePendientesDePrecio,
  useCobrosCliente, useCrearCobroCliente, useEditarCobroCliente, useEliminarCobroCliente,
  uploadComprobanteCobro, fetchCobroComprobanteUrl,
  type CuentaClienteRow,
} from '../hooks/useCuentaCliente'
import { exportarCuentaCliente } from '../utils/cuentaClienteExport'
import { descargarCuentaClienteObraPdf } from '../utils/cuentaClientePdf'
import { abrirAdjuntoFirmado } from '@/lib/utils/abrir-adjunto'
import { EMPRESA } from '@/lib/config/empresa'
import type { Obra, CuentaClienteCobro, MedioCobro } from '@/types/domain.types'

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
  const [soloSinPrecio, setSoloSinPrecio] = useState(false)
  const [exporting, setExporting] = useState(false)
  // Pendientes de tasar (materiales sin precio) en todas las obras del usuario.
  const { data: pendientes = [] } = usePendientesDePrecio()
  const { resolverItems, puedeCrear, puedeEditar, puedeEliminar } = usePermisos('certificaciones')
  const { mutate: guardarPrecios, isPending: guardandoPrecios } = useGuardarPreciosMCC()
  const [modalPrecios, setModalPrecios] = useState(false)
  const [precios, setPrecios] = useState<Record<number, string>>({})
  // Cobros (pagos del cliente) de la obra elegida.
  const { data: cobros = [] } = useCobrosCliente(obraSel || undefined)
  const { mutate: crearCobro,   isPending: creandoCobro }  = useCrearCobroCliente()
  const { mutate: editarCobro,  isPending: editandoCobroPend } = useEditarCobroCliente()
  const { mutate: eliminarCobro } = useEliminarCobroCliente()
  const [modalCobro, setModalCobro] = useState(false)
  const [editandoCobro, setEditandoCobro] = useState<CuentaClienteCobro | null>(null)
  const [cobroForm, setCobroForm] = useState<{ fecha: string; monto: string; medio: MedioCobro; obs: string }>(
    { fecha: toISO(new Date()), monto: '', medio: 'efectivo', obs: '' },
  )
  // Imputación: items del MCC que este pago cubre (patrón alquiler/áridos).
  const [selItems, setSelItems] = useState<Set<number>>(new Set())
  const [archivoCobro, setArchivoCobro] = useState<File | null>(null)
  const [subiendoComp, setSubiendoComp] = useState(false)

  // Si el user no eligió obra, llama al endpoint sin obra_cod → backend
  // devuelve todas las obras permitidas (o 400 si es scope global).
  const { data: rows = [], isLoading, error } = useCuentaCliente(obraSel || undefined)

  const obrasActivas = (obras as Obra[]).filter(o => !o.archivada)
  const obraOptions = [
    { value: '', label: '— Todas mis obras —' },
    ...obrasActivas.map(o => ({ value: o.cod, label: `${o.cod} — ${o.nom}` })),
  ]
  const obrasMap = useMemo(() => new Map((obras as Obra[]).map(o => [o.cod, o])), [obras])

  // Filtrado client-side: por pagador y/o "solo sin precio" (a tasar).
  const filtered = useMemo(() => {
    let r = rows
    if (pagadorSel !== 'todos') r = r.filter(x => x.pagado_por === pagadorSel)
    if (soloSinPrecio)          r = r.filter(x => Number(x.precio_unit) === 0)
    return r
  }, [rows, pagadorSel, soloSinPrecio])

  const pendientesTotal = pendientes.reduce((s, p) => s + p.sin_precio, 0)

  // Export Excel: respeta el filtro de pagador activo. Si exportás "Pagó
  // directo", el XLSX solo trae esas filas. Si exportás "Todos", trae todo.
  // El user es responsable de elegir qué bucket quiere mandar al cliente.
  async function handleExport() {
    if (filtered.length === 0) { toast('Nada para exportar con esta selección', 'err'); return }
    setExporting(true)
    try {
      await exportarCuentaCliente({
        rows: filtered,
        rowsResumen: rows,
        obrasMap,
        obraFiltro: obraSel,
        pagadorFiltro: pagadorSel,
        cobros,
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

  // Items con precio editable: los ya cobrados quedan afuera (el monto está
  // congelado en el pago; el backend igual los rechaza con ITEM_COBRADO).
  const rowsEditables = useMemo(() => rows.filter(r => r.cobro_id == null), [rows])

  function abrirModalPrecios() {
    const init: Record<number, string> = {}
    // Pre-cargo con el precio actual; los que están en 0 quedan vacíos para
    // tipear cómodo. Solo los materiales de la obra elegida (sin los cobrados).
    for (const r of rowsEditables) init[r.item_id] = Number(r.precio_unit) > 0 ? String(r.precio_unit) : ''
    setPrecios(init)
    setModalPrecios(true)
  }

  function guardarPreciosModal() {
    const cambios = rowsEditables
      .filter(r => precioVal(r) !== Number(r.precio_unit))
      .map(r => ({ itemId: r.item_id, precio_unit: precioVal(r) }))
    if (cambios.length === 0) { toast('No cambiaste ningún precio', 'err'); return }
    // Guardita: bajar a $0 un material que tenía precio le saca plata facturable.
    const aCero = rowsEditables.filter(r => Number(r.precio_unit) > 0 && precioVal(r) === 0).length
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

  // ── Cobros (pagos del cliente) ───────────────────────────────────
  // Items imputables a un pago: adeudados (sin cobro), deuda real (no
  // rendición), tasados, y con el item de la solicitud en estado FINAL —
  // mismo whitelist que valida la RPC (un 'en_proveedor' con retiros
  // pendientes puede crecer su total; un 'pendiente' está a mitad de revert).
  const ESTADOS_IMPUTABLES = ['comprado', 'de_deposito', 'retirado', 'enviado']
  const imputables = useMemo(() =>
    rows.filter(r =>
      r.cobro_id == null &&
      r.pagado_por !== 'cliente' &&
      Number(r.precio_unit) > 0 &&
      ESTADOS_IMPUTABLES.includes(r.item?.estado ?? ''),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    ), [rows])

  function abrirNuevoCobro() {
    setEditandoCobro(null)
    setCobroForm({ fecha: toISO(new Date()), monto: '', medio: 'efectivo', obs: '' })
    setSelItems(new Set())
    setArchivoCobro(null)
    setModalCobro(true)
  }

  function abrirEditarCobro(c: CuentaClienteCobro) {
    setEditandoCobro(c)
    setCobroForm({ fecha: c.fecha, monto: String(c.monto), medio: c.medio, obs: c.obs ?? '' })
    setSelItems(new Set())
    setArchivoCobro(null)
    setModalCobro(true)
  }

  // Tildar/destildar un item autocompleta el monto con la suma de lo tildado
  // (editable después, como en alquiler). Destildar todo lo deja como estaba.
  function toggleItem(id: number) {
    setSelItems(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      const suma = imputables.filter(r => next.has(r.id)).reduce((s, r) => s + Number(r.precio_total ?? 0), 0)
      if (suma > 0) setCobroForm(f => ({ ...f, monto: String(Math.round(suma * 100) / 100) }))
      return next
    })
  }

  async function guardarCobro() {
    const monto = Number(cobroForm.monto)
    if (!cobroForm.fecha) { toast('Elegí la fecha del pago', 'err'); return }
    if (!Number.isFinite(monto) || monto <= 0) { toast('El monto debe ser mayor a 0', 'err'); return }
    const cbs = {
      onSuccess: () => { toast('✓ Pago guardado', 'ok'); setModalCobro(false) },
      onError:   (err: any) => {
        const code = err?.body?.error
        if (code === 'MONTO_INSUFICIENTE')        toast('El monto no cubre los items tildados. Subí el monto o destildá items.', 'err')
        else if (code === 'ITEM_INVALIDO')        toast('Algún item ya no es imputable (lo pagó otro cobro o cambió). Recargá la página.', 'err')
        else if (code === 'COMPROBANTE_DUPLICADO') toast('Ese comprobante ya está cargado en otro pago', 'err')
        else toast('Error al guardar el pago', 'err')
      },
    }
    if (editandoCobro) {
      editarCobro({ id: editandoCobro.id, fecha: cobroForm.fecha, monto, medio: cobroForm.medio, obs: cobroForm.obs || null }, {
        ...cbs,
        onError: (err: any) => {
          if (err?.body?.error === 'MONTO_MENOR_IMPUTADO') {
            toast('El monto no puede ser menor a lo imputado a items. Eliminá el pago y registralo de nuevo si hace falta.', 'err')
          } else cbs.onError(err)
        },
      })
      return
    }
    try {
      let comprobante_path: string | null = null
      if (archivoCobro) {
        setSubiendoComp(true)
        comprobante_path = await uploadComprobanteCobro(archivoCobro)
      }
      crearCobro({
        obra_cod: obraSel, fecha: cobroForm.fecha, monto, medio: cobroForm.medio,
        obs: cobroForm.obs || null,
        item_ids: [...selItems],
        ...(comprobante_path ? { comprobante_path } : {}),
      }, cbs)
    } catch (e: any) {
      toast(e?.message || 'Error al subir el comprobante', 'err')
    } finally {
      setSubiendoComp(false)
    }
  }

  function eliminarCobroHandler(c: CuentaClienteCobro) {
    const nItems = rows.filter(r => r.cobro_id === c.id).length
    const extra = nItems > 0 ? ` Los ${nItems} item${nItems !== 1 ? 's' : ''} imputados vuelven a adeudados.` : ''
    if (!confirm(`¿Eliminar el pago de ${fmt$(Number(c.monto))} del ${fmtF(c.fecha)}?${extra}`)) return
    eliminarCobro(c.id, {
      onSuccess: () => toast('✓ Pago eliminado', 'ok'),
      onError:   () => toast('Error al eliminar', 'err'),
    })
  }

  async function verComprobanteCobro(id: number) {
    await abrirAdjuntoFirmado(
      () => fetchCobroComprobanteUrl(id),
      () => toast('No se pudo abrir el comprobante', 'err'),
    )
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
  const cambiosCount   = rowsEditables.filter(r => precioVal(r) !== Number(r.precio_unit)).length
  const totalModal     = rowsEditables.reduce((s, r) => s + Number(r.cantidad) * precioVal(r), 0)
  const sinPrecioCount = rows.filter(r => Number(r.precio_unit) === 0).length
  const obraNombre     = obrasMap.get(obraSel)?.nom ?? obraSel

  // Saldo: adeudado (lo que CADINC adelantó) − Σ pagos. Con obra elegida son
  // los de esa obra; sin obra, los cobros vienen scopeados a todas las obras
  // del user (mismo criterio que el MCC), así el saldo agregado también cierra.
  const pagadoCliente = cobros.reduce((s, c) => s + Number(c.monto ?? 0), 0)
  const saldoCliente  = kpis.debeCadinc - pagadoCliente
  const guardandoCobro = creandoCobro || editandoCobroPend || subiendoComp

  // PDF deuda / histórico de la obra elegida (patrón áridos/alquiler).
  function handlePdf(modo: 'deuda' | 'historico') {
    if (!obraSel) return
    try {
      descargarCuentaClienteObraPdf({
        obraCod: obraSel,
        obraNombre: obrasMap.get(obraSel)?.nom ?? obraSel,
        rows, cobros, modo,
      })
    } catch (e) {
      console.error('[cuenta-cliente-pdf]', e)
      toast('Error al generar PDF', 'err')
    }
  }

  return (
    <div className="flex flex-col gap-4">

      {/* Pendientes de tasar (global) — nudge para los que ponen precios.
          Click en una obra la selecciona y activa el filtro "sin precio". */}
      {pendientesTotal > 0 && (
        <div className="bg-naranja-light border border-naranja/40 rounded-card p-3 flex items-start gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <div className="text-sm font-bold text-naranja-dark">
              ⚠ {pendientesTotal} material{pendientesTotal !== 1 ? 'es' : ''} sin precio
            </div>
            <div className="text-[11px] text-gris-dark">
              En {pendientes.length} obra{pendientes.length !== 1 ? 's' : ''} — falta tasar para poder facturar al cliente.
            </div>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {pendientes.slice(0, 6).map(p => (
              <button
                key={p.obra_cod}
                onClick={() => { setObraSel(p.obra_cod); setSoloSinPrecio(true); setModalCobro(false); setModalPrecios(false) }}
                className="text-[11px] font-bold px-2 py-1 rounded-lg bg-white border border-naranja/40 text-naranja-dark hover:bg-naranja-light/60 transition-colors"
              >
                {obrasMap.get(p.obra_cod)?.nom ?? p.obra_cod} <span className="font-mono">({p.sin_precio})</span>
              </button>
            ))}
            {pendientes.length > 6 && (
              <span className="text-[11px] text-gris-dark self-center">+{pendientes.length - 6} más</span>
            )}
          </div>
        </div>
      )}

      {/* Header: filtro obra + segmented pagador + export */}
      <div className="flex items-center gap-3 flex-wrap justify-between">
        <div className="flex items-center gap-3 flex-wrap flex-1 min-w-0">
          <div className="min-w-[260px] max-w-sm">
            <Combobox
              placeholder="— Todas mis obras —"
              options={obraOptions}
              value={obraSel}
              onChange={(v) => { setObraSel(v); setModalCobro(false); setModalPrecios(false) }}
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
          <button
            type="button"
            onClick={() => setSoloSinPrecio(v => !v)}
            title="Mostrar solo materiales sin precio (a tasar)"
            className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${
              soloSinPrecio ? 'bg-naranja text-white shadow-sm' : 'bg-gris text-gris-dark hover:text-carbon hover:bg-white'
            }`}
          >
            ⚠ Sin precio
          </button>
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
          {obraSel && (
            <>
              <Button variant="ghost" size="sm" onClick={() => handlePdf('deuda')} disabled={rows.length === 0} title="Solo lo adeudado — para mandar al cliente">
                📄 PDF deuda
              </Button>
              <Button variant="ghost" size="sm" onClick={() => handlePdf('historico')} disabled={rows.length === 0} title="Todo el histórico con pagos y saldo">
                📄 Histórico
              </Button>
            </>
          )}
        </div>
      </div>

      {/* KPIs — con obra elegida muestro el saldo (adeudado − pagado); sin
          obra, los totales agregados de siempre (no hay cobros por-obra acá). */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {obraSel ? (
          <>
            <Kpi
              label="Adeudado"
              sub={sinPrecioCount > 0
                ? `⚠ ${sinPrecioCount} ítem${sinPrecioCount !== 1 ? 's' : ''} sin precio (falta tasar)`
                : `${EMPRESA.nombre} adelantó en materiales`}
              value={fmt$(kpis.debeCadinc)}
              accent="azul"
            />
            <Kpi
              label="Pagado"
              sub={`${cobros.length} pago${cobros.length !== 1 ? 's' : ''} del cliente`}
              value={fmt$(pagadoCliente)}
              accent="verde"
            />
            <Kpi
              label="Saldo"
              sub={sinPrecioCount > 0
                ? `⚠ Provisorio — faltan ${sinPrecioCount} sin precio`
                : saldoCliente > 0 ? 'Pendiente de cobro' : saldoCliente < 0 ? 'A favor del cliente' : 'Saldado'}
              value={fmt$(saldoCliente)}
              accent="naranja"
            />
          </>
        ) : (
          <>
            <Kpi
              label="Adeudado"
              sub={`${EMPRESA.nombre} adelantó en todas tus obras`}
              value={fmt$(kpis.debeCadinc)}
              accent="azul"
            />
            <Kpi
              label="Pagado"
              sub={`${cobros.length} pago${cobros.length !== 1 ? 's' : ''} del cliente en total`}
              value={fmt$(pagadoCliente)}
              accent="verde"
            />
            <Kpi
              label="Saldo"
              sub={saldoCliente > 0 ? 'Pendiente de cobro (todas las obras)' : saldoCliente < 0 ? 'A favor del cliente' : 'Saldado'}
              value={fmt$(saldoCliente)}
              accent="naranja"
            />
          </>
        )}
      </div>

      {/* Pagos del cliente (solo con obra elegida) */}
      {obraSel && (
        <div className="bg-white rounded-card shadow-card p-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h3 className="text-xs font-bold text-gris-dark uppercase tracking-wider">Pagos del cliente</h3>
            {puedeCrear && (
              <Button variant="primary" size="sm" onClick={abrirNuevoCobro}>💲 Registrar pago</Button>
            )}
          </div>
          {cobros.length === 0 ? (
            <p className="text-xs text-gris-mid italic">Sin pagos registrados para esta obra.</p>
          ) : (
            <div className="divide-y divide-gris">
              {cobros.map(c => {
                const nItems = rows.filter(r => r.cobro_id === c.id).length
                return (
                <div key={c.id} className="flex items-center gap-3 py-2 text-sm">
                  <span className="font-mono text-xs text-gris-dark w-[72px] shrink-0">{fmtF(c.fecha)}</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-azul-light text-azul capitalize shrink-0">{c.medio}</span>
                  {nItems > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-verde-light text-verde shrink-0" title="Items del listado que este pago cubre">
                      {nItems} item{nItems !== 1 ? 's' : ''}
                    </span>
                  )}
                  {nItems === 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gris text-gris-dark shrink-0" title="Pago sin items imputados">
                      a cuenta
                    </span>
                  )}
                  <span className="flex-1 text-gris-dark truncate min-w-0">{c.obs}</span>
                  {c.comprobante_url && (
                    <button onClick={() => verComprobanteCobro(c.id)} title="Ver comprobante"
                      className="text-xs px-2 py-1 rounded hover:bg-azul-light text-gris-dark hover:text-azul transition-colors shrink-0">📎</button>
                  )}
                  <span className="font-mono font-bold text-verde shrink-0">{fmt$(Number(c.monto))}</span>
                  {puedeEditar && (
                    <button onClick={() => abrirEditarCobro(c)} title="Editar pago"
                      className="text-xs px-2 py-1 rounded hover:bg-gris transition-colors text-gris-dark shrink-0">✏️</button>
                  )}
                  {puedeEliminar && (
                    <button onClick={() => eliminarCobroHandler(c)} title="Eliminar pago"
                      className="text-xs px-2 py-1 rounded hover:bg-rojo-light text-gris-dark hover:text-rojo transition-colors shrink-0">✕</button>
                  )}
                </div>
                )
              })}
            </div>
          )}
        </div>
      )}

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
                  <th className="text-center px-3 py-2 text-[11px] font-bold text-gris-dark uppercase tracking-wider">Pago</th>
                  <th className="text-center px-3 py-2 text-[11px] font-bold text-gris-dark uppercase tracking-wider">Factura</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={11} className="text-center py-8 text-gris-dark text-sm italic">
                    {soloSinPrecio
                      ? '✓ No hay materiales sin precio en esta selección — todo tasado.'
                      : pagadorSel === 'todos'
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
                    <td colSpan={2} />
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
            {rowsEditables.length} material{rowsEditables.length !== 1 ? 'es' : ''} ·{' '}
            <span className="font-bold text-naranja-dark">{sinPrecioCount} sin precio</span>. Cargá el precio unitario; el total se calcula solo y es lo que se factura al cliente.
            {rows.length > rowsEditables.length && ' Los items ya cobrados no se pueden retasar.'}
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
                  {rowsEditables.map(r => {
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

      {/* Modal: registrar / editar pago del cliente */}
      <Modal
        open={modalCobro}
        onClose={() => setModalCobro(false)}
        title={editandoCobro ? '✏️ EDITAR PAGO' : '💲 REGISTRAR PAGO DEL CLIENTE'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalCobro(false)}>Cancelar</Button>
            <Button variant="primary" loading={guardandoCobro} onClick={guardarCobro}>✓ Guardar</Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="text-xs text-gris-dark">Obra: <span className="font-bold text-carbon">{obraNombre}</span></div>

          {/* Imputación: qué items del listado paga (solo al crear). Tildar
              autocompleta el monto con la suma; sin tildar = pago a cuenta. */}
          {!editandoCobro && imputables.length > 0 && (
            <div>
              <div className="text-xs font-bold text-gris-dark uppercase tracking-wider mb-1.5 flex items-center justify-between">
                <span>¿Qué materiales paga? <span className="normal-case font-normal text-gris-mid">(opcional — sin tildar queda a cuenta)</span></span>
                <button
                  type="button"
                  onClick={() => {
                    const todos = selItems.size === imputables.length
                    const next = todos ? new Set<number>() : new Set(imputables.map(r => r.id))
                    setSelItems(next)
                    const suma = imputables.filter(r => next.has(r.id)).reduce((s, r) => s + Number(r.precio_total ?? 0), 0)
                    if (suma > 0) setCobroForm(f => ({ ...f, monto: String(Math.round(suma * 100) / 100) }))
                  }}
                  className="text-[11px] text-azul hover:underline font-bold"
                >
                  {selItems.size === imputables.length ? 'Destildar todos' : `Tildar todos (${imputables.length})`}
                </button>
              </div>
              <div className="bg-gris rounded-xl p-2 max-h-48 overflow-y-auto flex flex-col gap-0.5">
                {imputables.map(r => (
                  <label key={r.id} className="flex items-center gap-2 cursor-pointer text-sm py-1 px-1 border-b border-gris-mid last:border-0">
                    <input
                      type="checkbox"
                      checked={selItems.has(r.id)}
                      onChange={() => toggleItem(r.id)}
                      className="accent-verde shrink-0"
                    />
                    <span className="flex-1 min-w-0 truncate">
                      <span className="font-mono text-[11px] text-gris-dark">{fmtF(r.fecha_resolucion)}</span> · {r.descripcion}
                    </span>
                    <b className="font-mono text-xs shrink-0">{fmt$(Number(r.precio_total ?? 0))}</b>
                  </label>
                ))}
              </div>
              {selItems.size > 0 && (
                <div className="text-[11px] text-gris-dark mt-1 text-right">
                  {selItems.size} item{selItems.size !== 1 ? 's' : ''} · suma {fmt$(imputables.filter(r => selItems.has(r.id)).reduce((s, r) => s + Number(r.precio_total ?? 0), 0))}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Fecha" type="date" value={cobroForm.fecha}
              onChange={e => setCobroForm(f => ({ ...f, fecha: e.target.value }))}
            />
            <Input
              label="Monto ($)" type="number" min="0" step="1" placeholder="0" value={cobroForm.monto}
              onChange={e => setCobroForm(f => ({ ...f, monto: e.target.value }))}
            />
          </div>
          <Select
            label="Medio de pago" value={cobroForm.medio}
            onChange={e => setCobroForm(f => ({ ...f, medio: e.target.value as MedioCobro }))}
            options={[
              { value: 'efectivo', label: 'Efectivo' },
              { value: 'transferencia', label: 'Transferencia' },
              { value: 'cheque', label: 'Cheque' },
              { value: 'otro', label: 'Otro' },
            ]}
          />
          <Input
            label="Nota (opcional)" placeholder="Referencia, nro de operación..." value={cobroForm.obs}
            onChange={e => setCobroForm(f => ({ ...f, obs: e.target.value }))}
          />

          {/* Comprobante (solo al crear; foto o PDF, bucket privado) */}
          {!editandoCobro && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-gris-dark uppercase tracking-wider">Comprobante (opcional)</label>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={e => setArchivoCobro(e.target.files?.[0] ?? null)}
                className="text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-azul-light file:text-azul file:font-bold hover:file:bg-azul hover:file:text-white file:cursor-pointer"
              />
              {archivoCobro && (
                <div className="flex items-center gap-2 text-xs text-gris-dark mt-1">
                  <span>📎 {archivoCobro.name} · {(archivoCobro.size / 1024).toFixed(0)} KB</span>
                  <button type="button" onClick={() => setArchivoCobro(null)} className="text-rojo hover:underline">Quitar</button>
                </div>
              )}
              <p className="text-[11px] text-gris-mid italic">Foto o PDF de la transferencia / recibo. Máx 10 MB.</p>
            </div>
          )}
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
        {esCliente ? (
          <span className="text-gris-mid text-xs">—</span>
        ) : r.cobro_id != null ? (
          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-verde-light text-verde" title={`Cubierto por el pago N° ${r.cobro_id}`}>
            ✓ Pagado
          </span>
        ) : (
          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-amarillo/20 text-amber-700">
            Adeudado
          </span>
        )}
      </td>
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
