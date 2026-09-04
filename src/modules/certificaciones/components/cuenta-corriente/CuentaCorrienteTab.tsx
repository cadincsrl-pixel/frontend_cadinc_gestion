'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Pagination } from '@/components/ui/Pagination'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import { useObras } from '@/modules/tarja/hooks/useObras'
import { useProveedores } from '../../hooks/useProveedores'
import { usePendientesDePrecio, useCobrosCliente } from '../../hooks/useCuentaCliente'
import { useCuentaRenglones, useCuentaResumen, fetchCuentaRenglonesTodos, type CuentaFiltro } from '../../hooks/useCuentaCorriente'
import { exportarCuentaCorriente } from '../../utils/cuentaCorrienteExport'
import { descargarCuentaClienteObraPdf } from '../../utils/cuentaClientePdf'
import type { CuentaEstado, CuentaGrupo, Obra } from '@/types/domain.types'
import { FiltrosCuenta } from './FiltrosCuenta'
import { ResumenTabla } from './ResumenTabla'
import { RenglonesTabla } from './RenglonesTabla'
import { PagosCliente } from './PagosCliente'
import { ModalCargarPrecios } from './ModalCargarPrecios'
import { ESTADOS, ESTADO_META, fmtM, fmtFecha, recortar, totalizar, filasPorGrupo } from './cuentaCorriente.utils'

/**
 * Cuenta corriente de obras (20260904ap). Una sola vista para lo que se le
 * cobra al cliente y lo que gastó CADINC:
 *
 *  - un conjunto de renglones filtrado en el server (obra, estado, tipo, sin
 *    precio, proveedor, origen, período, búsqueda);
 *  - tres presentaciones del mismo conjunto: KPIs por estado, una tabla por
 *    obra / mes / proveedor, y la lista paginada;
 *  - la obra es un filtro más; elegirla habilita lo que es por obra: pagos del
 *    cliente, cargar precios, PDF.
 *
 * Las dos pestañas viejas (Cuenta del cliente, Gastos de CADINC) son dos
 * combinaciones de los chips de estado.
 */

const PAGE_SIZE = 50

export function CuentaCorrienteTab() {
  const toast = useToast()
  const { resolverItems, puedeCrear, puedeEditar, puedeEliminar } = usePermisos('certificaciones')
  const { data: obrasData = [] } = useObras('certificaciones')
  const obras = obrasData as Obra[]
  const { data: proveedoresData = [] } = useProveedores()
  const { data: pendientes = [] } = usePendientesDePrecio()

  const [filtro, setFiltro] = useState<CuentaFiltro>({})
  const [grupo, setGrupo]   = useState<CuentaGrupo>('obra')
  const [page, setPage]     = useState(1)
  const [modalPrecios, setModalPrecios] = useState(false)
  const [exportando, setExportando]     = useState(false)

  function patch(p: Partial<CuentaFiltro>) {
    setFiltro(f => ({ ...f, ...p }))
    setPage(1)
  }

  const obraSel  = filtro.obra_cod
  const obrasMap = useMemo(() => new Map(obras.map(o => [o.cod, o])), [obras])
  const obra     = obraSel ? obrasMap.get(obraSel) : undefined
  const obraNom  = obraSel ? (obra?.nom ?? obraSel) : ''
  const proveedores = useMemo(
    () => [...proveedoresData].map(p => ({ id: p.id, nombre: p.nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [proveedoresData],
  )

  const { data: resumen, isLoading: cargandoResumen, error: errorResumen } = useCuentaResumen(filtro, grupo)
  const { data: pagina, isLoading: cargandoLista, isFetching } = useCuentaRenglones(filtro, page, PAGE_SIZE)
  const { data: cobrosObra = [] } = useCobrosCliente(obraSel, !!obraSel)

  // El resumen baja sin recortar por estado ni tipo; acá se recorta para los
  // KPIs y la tabla, y se cuenta "cruzado" para los chips.
  const grupos = useMemo(() => resumen?.grupos ?? [], [resumen])
  const gruposFiltrados = useMemo(() => recortar(grupos, filtro.estados, filtro.tipo), [grupos, filtro.estados, filtro.tipo])
  const tot = useMemo(() => totalizar(gruposFiltrados), [gruposFiltrados])
  const conteoEstado = useMemo(() => {
    const t = totalizar(recortar(grupos, undefined, filtro.tipo))
    return Object.fromEntries(ESTADOS.map(e => [e.key, t.porEstado[e.key].renglones])) as Record<CuentaEstado, number>
  }, [grupos, filtro.tipo])
  const conteoTipo = useMemo(() => {
    const t = totalizar(recortar(grupos, filtro.estados))
    return { material: t.porTipo.material.renglones, epp: t.porTipo.epp.renglones }
  }, [grupos, filtro.estados])
  const conteoTodos = conteoEstado.a_cobrar + conteoEstado.cobrado + conteoEstado.pago_directo + conteoEstado.gasto_cadinc
  const filas = useMemo(() => filasPorGrupo(gruposFiltrados, resumen?.pagos ?? [], grupo), [gruposFiltrados, resumen, grupo])

  const items = pagina?.items ?? []
  const total = pagina?.total ?? 0
  const mostrarResumen = !obraSel || grupo !== 'obra'
  const pendientesTotal = pendientes.reduce((s, p) => s + p.sin_precio, 0)

  const hayOtrosFiltros = !!(filtro.q || filtro.estados?.length || filtro.tipo || filtro.sin_precio || filtro.proveedor_id || filtro.origen || filtro.desde || filtro.hasta)

  function filtroTxt(): string {
    const partes: string[] = []
    if (filtro.estados?.length) partes.push(filtro.estados.map(e => ESTADO_META[e].label).join(' + '))
    if (filtro.tipo) partes.push(filtro.tipo === 'epp' ? 'solo EPP' : 'solo material')
    if (filtro.sin_precio) partes.push('sin precio')
    if (filtro.proveedor_id) partes.push(`proveedor ${proveedores.find(p => p.id === filtro.proveedor_id)?.nombre ?? filtro.proveedor_id}`)
    if (filtro.origen) partes.push(filtro.origen === 'deposito' ? 'del depósito' : 'comprado a proveedor')
    if (filtro.desde || filtro.hasta) partes.push(`${filtro.desde ? 'desde ' + fmtFecha(filtro.desde) : ''} ${filtro.hasta ? 'hasta ' + fmtFecha(filtro.hasta) : ''}`.trim())
    if (filtro.q) partes.push(`"${filtro.q}"`)
    return partes.length ? partes.join(' · ') : 'todos los renglones'
  }

  async function exportar() {
    if (total === 0) { toast('Nada para exportar con estos filtros', 'err'); return }
    setExportando(true)
    try {
      const rows = await fetchCuentaRenglonesTodos(filtro)
      await exportarCuentaCorriente({
        rows, pagos: resumen?.pagos ?? [], obraSel, obraNom,
        filtroTxt: filtroTxt(), cuentaCompleta: !!obraSel && !hayOtrosFiltros,
      })
      toast('📊 Excel exportado', 'ok')
    } catch (e) {
      toast(`Error al exportar: ${e instanceof Error ? e.message : 'error desconocido'}`, 'err')
    } finally {
      setExportando(false)
    }
  }

  // El PDF va siempre sobre la cuenta COMPLETA de la obra y solo con lo que es
  // deuda del cliente (a cobrar + cobrado): nunca sale un gasto de CADINC ni
  // un "pagó directo" en un papel para el cliente, sea cual sea el filtro.
  async function pdf(modo: 'deuda' | 'historico') {
    if (!obraSel) return
    try {
      const rows = await fetchCuentaRenglonesTodos({ obra_cod: obraSel, estados: ['a_cobrar', 'cobrado'] })
      descargarCuentaClienteObraPdf({ obraCod: obraSel, obraNombre: obraNom, rows, cobros: cobrosObra, modo })
    } catch (e) {
      console.error('[cuenta-corriente-pdf]', e)
      toast('Error al generar PDF', 'err')
    }
  }

  const llaveEnMano = obra?.materiales_a_cargo_de === 'cadinc'

  return (
    <div className="flex flex-col gap-4">

      {/* Pendientes de tasar: atajo a obra + sin precio */}
      {pendientesTotal > 0 && (
        <div className="bg-naranja-light border border-naranja/40 rounded-card p-3 flex items-start gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <div className="text-sm font-bold text-naranja-dark">⚠ {pendientesTotal} renglón{pendientesTotal !== 1 ? 'es' : ''} sin precio</div>
            <div className="text-[11px] text-gris-dark">En {pendientes.length} obra{pendientes.length !== 1 ? 's' : ''}. Suman $0 hasta que se tasen.</div>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {pendientes.slice(0, 6).map(p => (
              <button key={p.obra_cod} type="button"
                onClick={() => patch({ obra_cod: p.obra_cod, sin_precio: true, estados: undefined, tipo: undefined })}
                className="text-[11px] font-bold px-2 py-1 rounded-lg bg-white border border-naranja/40 text-naranja-dark hover:bg-naranja-light/60 transition-colors">
                {obrasMap.get(p.obra_cod)?.nom ?? p.obra_cod} <span className="font-mono">({p.sin_precio})</span>
              </button>
            ))}
            {pendientes.length > 6 && <span className="text-[11px] text-gris-dark self-center">+{pendientes.length - 6} más</span>}
          </div>
        </div>
      )}

      <FiltrosCuenta
        filtro={filtro} patch={patch} grupo={grupo} onGrupo={setGrupo}
        obras={obras} proveedores={proveedores}
        conteoEstado={conteoEstado} conteoTipo={conteoTipo} conteoTodos={conteoTodos}
        conteoSinPrecio={filtro.sin_precio ? tot.renglones : tot.sin_precio}
      />

      {errorResumen && (
        <div className="bg-rojo-light border border-rojo/30 rounded-card p-4 text-sm text-rojo">
          {errorResumen instanceof Error ? errorResumen.message : 'Error al cargar la cuenta'}
        </div>
      )}

      {/* KPIs por estado (del conjunto filtrado) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {ESTADOS.map(e => {
          const t = tot.porEstado[e.key]
          const apagado = (filtro.estados?.length ?? 0) > 0 && !filtro.estados!.includes(e.key)
          return (
            <Kpi
              key={e.key}
              label={e.label}
              value={fmtM(t.total)}
              accent={e.kpi}
              apagado={apagado}
              sub={
                e.key === 'gasto_cadinc' && t.total > 0
                  ? `mat. ${fmtM(tot.gastoMaterial)} · EPP ${fmtM(tot.gastoEpp)}`
                  : `${t.renglones} renglón${t.renglones !== 1 ? 'es' : ''}`
              }
              sinPrecio={t.sin_precio}
              hint={e.hint}
            />
          )
        })}
      </div>

      {/* Cabecera de la obra elegida + acciones */}
      {obraSel ? (
        <div className="bg-white rounded-card shadow-card p-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-lg font-bold leading-tight">{obraNom}</span>
              {llaveEnMano
                ? <span className="text-[10px] font-bold bg-azul-light text-azul px-1.5 py-0.5 rounded">LLAVE EN MANO</span>
                : <span className="text-[10px] font-bold bg-gris text-gris-dark px-1.5 py-0.5 rounded">MATERIALES A CARGO DEL CLIENTE</span>}
              {obra?.archivada && <span className="text-[10px] font-bold bg-gris text-gris-dark px-1.5 py-0.5 rounded">ARCHIVADA</span>}
            </div>
            <div className="text-[11px] text-gris-dark font-mono mt-0.5">{obraSel}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary" size="sm" onClick={() => setModalPrecios(true)}
              disabled={!resolverItems}
              title={!resolverItems ? 'No tenés permiso para cargar precios' : 'Cargar o corregir precios de todos los renglones de la obra'}
            >
              💲 Cargar precios
            </Button>
            <Button variant="secondary" size="sm" onClick={exportar} loading={exportando} disabled={total === 0}>📊 Excel</Button>
            {!llaveEnMano && (
              <>
                <Button variant="ghost" size="sm" onClick={() => pdf('deuda')} title="Solo lo que el cliente adeuda, para mandarle">📄 PDF deuda</Button>
                <Button variant="ghost" size="sm" onClick={() => pdf('historico')} title="Deuda, cobrado y pagos, con saldo">📄 Histórico</Button>
              </>
            )}
            <Button variant="ghost" size="sm" onClick={() => patch({ obra_cod: undefined, sin_precio: undefined })} title="Volver a todas las obras">✕ Todas las obras</Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 flex-wrap px-1">
          <p className="text-xs text-gris-dark">
            Precios finales, IVA incluido. Elegí una obra (o hacé click en su fila) para cargar precios, registrar pagos y sacar el PDF para el cliente.
          </p>
          <Button variant="secondary" size="sm" onClick={exportar} loading={exportando} disabled={total === 0}>📊 Exportar Excel</Button>
        </div>
      )}

      {obraSel && (
        <PagosCliente obraCod={obraSel} obraNom={obraNom} puedeCrear={puedeCrear} puedeEditar={puedeEditar} puedeEliminar={puedeEliminar} />
      )}

      {mostrarResumen && (
        cargandoResumen && !resumen
          ? <div className="bg-white rounded-card shadow-card p-8 text-center text-sm text-gris-dark">Cargando resumen…</div>
          : <ResumenTabla filas={filas} grupo={grupo} onElegirObra={cod => patch({ obra_cod: cod })} />
      )}

      {/* Renglones */}
      <div className="bg-white rounded-card shadow-card overflow-hidden">
        <div className="px-4 pt-3 pb-2 flex items-center justify-between gap-2 flex-wrap">
          <h3 className="text-xs font-bold text-gris-dark uppercase tracking-wider">
            Renglones <span className="font-mono normal-case tracking-normal">({total.toLocaleString('es-AR')})</span>
          </h3>
          <div className="flex items-center gap-3 text-[11px] text-gris-dark">
            {isFetching && <span className="w-3.5 h-3.5 border-2 border-naranja border-t-transparent rounded-full animate-spin" />}
            <span>Total filtrado <b className="font-mono text-carbon">{fmtM(tot.total)}</b></span>
          </div>
        </div>
        {cargandoLista && !pagina ? (
          <div className="p-8 flex items-center justify-center gap-3 text-gris-dark text-sm">
            <span className="w-5 h-5 border-2 border-naranja border-t-transparent rounded-full animate-spin" /> Cargando…
          </div>
        ) : (
          <RenglonesTabla
            items={items}
            mostrarObra={!obraSel}
            vacio={filtro.sin_precio && !filtro.q ? '✓ No hay renglones sin precio con estos filtros.' : 'No hay renglones con estos filtros.'}
          />
        )}
        {total > PAGE_SIZE && (
          <div className="p-3 border-t border-gris">
            <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />
          </div>
        )}
      </div>

      {obraSel && (
        <ModalCargarPrecios open={modalPrecios} onClose={() => setModalPrecios(false)} obraCod={obraSel} obraNom={obraNom} />
      )}
    </div>
  )
}

function Kpi({ label, value, sub, sinPrecio, accent, apagado, hint }: {
  label: string; value: string; sub: string; sinPrecio: number
  accent: 'naranja' | 'verde' | 'gris' | 'azul'; apagado: boolean; hint: string
}) {
  const cls = accent === 'azul'    ? 'border-azul-light text-azul-mid'
            : accent === 'naranja' ? 'border-naranja-light text-naranja-dark'
            : accent === 'verde'   ? 'border-verde-light text-verde'
            : 'border-gris-mid text-gris-dark'
  return (
    <div className={`bg-white rounded-card shadow-card p-3 border-l-[4px] ${cls} ${apagado ? 'opacity-40' : ''}`} title={hint}>
      <div className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">{label}</div>
      <div className="font-mono font-bold text-xl mt-1">{value}</div>
      <div className="text-[10px] text-gris-dark mt-0.5 flex items-center gap-1.5 flex-wrap">
        <span>{sub}</span>
        {sinPrecio > 0 && <span className="text-[9px] font-bold bg-naranja-light text-naranja-dark px-1 py-0.5 rounded">{sinPrecio} sin precio</span>}
      </div>
    </div>
  )
}
