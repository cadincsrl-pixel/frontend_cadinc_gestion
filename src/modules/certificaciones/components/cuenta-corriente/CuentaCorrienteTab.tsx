'use client'

import { useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Pagination } from '@/components/ui/Pagination'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import { useObrasTodas } from '@/modules/tarja/hooks/useObras'
import { useProveedores } from '../../hooks/useProveedores'
import { usePendientesDePrecio } from '../../hooks/useCuentaCliente'
import { useCuentaRenglones, useCuentaResumen, fetchCuentaRenglonesTodos, type CuentaFiltro } from '../../hooks/useCuentaCorriente'
import { exportarCuentaCorriente } from '../../utils/cuentaCorrienteExport'
import type { CuentaEstado, CuentaGrupo } from '@/types/domain.types'
import { FiltrosCuenta } from './FiltrosCuenta'
import { ResumenTabla } from './ResumenTabla'
import { RenglonesTabla } from './RenglonesTabla'
import { PagosCliente } from './PagosCliente'
import { CertificadosSection } from './CertificadosSection'
import { AdministracionSection, MarcarAdministracion } from './AdministracionSection'
import { ModalExportar } from './ModalExportar'
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
  const { resolverItems, cargarPrecios, esAdmin, puedeCrear, puedeEditar, puedeEliminar, verCostos } = usePermisos('certificaciones')
  // Las patas de jornales y contratistas del panel de costos salen de
  // endpoints de TARJA (horas, tarifas, certificaciones — todos con guardia
  // tarja.lectura). Un usuario de certificaciones sin tarja recibiría 403s
  // silenciosos y vería "Mano de obra $0" como si fuera dato real, así que
  // sin lectura de tarja el panel directamente no se muestra.
  const { puedeVer: veTarja } = usePermisos('tarja')
  // ACTIVAS + ARCHIVADAS. Con `useObras()` (solo activas) el checkbox "incluir
  // obras archivadas" no hacía nada: el filtro del selector nunca veía una
  // archivada, así que no se la podía elegir. Y si igual se llegaba a una
  // (por "ver todas", que el backend sí resuelve bien), la pantalla no la
  // encontraba en el mapa y se rompían tres cosas: el nombre caía al código
  // crudo, el cartel ARCHIVADA no aparecía, y `llaveEnMano` daba false porque
  // `materiales_a_cargo_de` era undefined — o sea que una obra llave en mano
  // archivada dejaba de comportarse como tal.
  const { obras } = useObrasTodas('certificaciones')
  const { data: proveedoresData = [] } = useProveedores()
  const { data: pendientes = [] } = usePendientesDePrecio()

  const [filtro, setFiltro] = useState<CuentaFiltro>({})
  const [grupo, setGrupo]   = useState<CuentaGrupo>('obra')
  const [page, setPage]     = useState(1)
  // Deep-link desde la campana (fase 3 de precios):
  // /certificaciones?tab=cuenta-corriente&obra=CC-016&sin_precio=1 abre la
  // obra ya filtrada en sus renglones sin precio. Se aplica cada vez que
  // cambia el link (el tab puede estar montado cuando llega otro), con el
  // patrón de "estado derivado durante el render", no en un efecto.
  const searchParams = useSearchParams()
  const obraQ = searchParams.get('obra')
  const linkActual = obraQ ? `${obraQ}|${searchParams.get('sin_precio') === '1' ? 'sp' : ''}` : null
  const [ultimoLink, setUltimoLink] = useState<string | null>(null)
  if (linkActual && linkActual !== ultimoLink) {
    setUltimoLink(linkActual)
    const soloSinPrecio = linkActual.endsWith('|sp')
    setFiltro(f => ({ ...f, obra_cod: obraQ!, ...(soloSinPrecio ? { sin_precio: true, estados: undefined, tipo: undefined } : {}) }))
    setPage(1)
  }
  const [modalPrecios, setModalPrecios] = useState(false)
  const [exportando, setExportando]     = useState(false)
  // Sin obra elegida no se carga nada: los totales de todas las obras juntas
  // son información sensible, así que verlos es una decisión explícita.
  const [verTodas, setVerTodas] = useState(false)
  const [modalExportar, setModalExportar] = useState(false)
  // Señal para el modal de registrar pago, que vive adentro de PagosCliente:
  // cada incremento lo abre. Así el botón queda en la cabecera de la obra sin
  // mover el modal (usa los imputables y el estado del bloque).
  const [registrarSignal, setRegistrarSignal] = useState(0)

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

  const hayDatos = !!obraSel || verTodas
  const { data: resumen, isLoading: cargandoResumen, error: errorResumen } = useCuentaResumen(filtro, grupo, hayDatos)
  const { data: pagina, isLoading: cargandoLista, isFetching } = useCuentaRenglones(filtro, page, PAGE_SIZE, hayDatos)

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
  // La alerta obedece al MISMO checkbox que el listado ("incluir obras
  // archivadas"). Antes sumaba todo junto y prometía un número que el listado
  // por defecto no mostraba: 606 renglones, de los cuales 148 están en obras
  // cerradas. Ahora, con el checkbox apagado, la alerta dice 458 y el listado
  // muestra esos mismos 458.
  const pendVisibles = filtro.archivadas ? pendientes : pendientes.filter(p => !p.obra_archivada)
  const pendientesTotal = pendVisibles.reduce((s, p) => s + p.sin_precio, 0)

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

  const llaveEnMano = obra?.materiales_a_cargo_de === 'cadinc'

  return (
    <div className="flex flex-col gap-4">

      {/* Pendientes de tasar: atajo a obra + sin precio */}
      {pendientesTotal > 0 && (
        <div className="bg-naranja-light border border-naranja/40 rounded-card p-3 flex items-start gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <div className="text-sm font-bold text-naranja-dark">⚠ {pendientesTotal} {pendientesTotal === 1 ? 'renglón' : 'renglones'} sin precio</div>
            <div className="text-[11px] text-gris-dark">
              En {pendVisibles.length} obra{pendVisibles.length !== 1 ? 's' : ''}. Suman $0 hasta que se tasen.
              {filtro.archivadas && ' Incluye obras archivadas.'}
            </div>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {pendVisibles.slice(0, 6).map(p => (
              <button key={p.obra_cod} type="button"
                onClick={() => patch({ obra_cod: p.obra_cod, sin_precio: true, estados: undefined, tipo: undefined })}
                className={`text-[11px] font-bold px-2 py-1 rounded-lg border transition-colors ${
                  p.obra_archivada
                    ? 'bg-gris border-gris-mid text-gris-dark hover:bg-white'
                    : 'bg-white border-naranja/40 text-naranja-dark hover:bg-naranja-light/60'}`}>
                {obrasMap.get(p.obra_cod)?.nom ?? p.obra_cod} <span className="font-mono">({p.sin_precio})</span>
                {p.obra_archivada && <span className="ml-1 font-normal">· archivada</span>}
              </button>
            ))}
            {pendVisibles.length > 6 && <span className="text-[11px] text-gris-dark self-center">+{pendVisibles.length - 6} más</span>}
          </div>
        </div>
      )}

      <FiltrosCuenta
        filtro={filtro} patch={patch} grupo={grupo} onGrupo={setGrupo}
        obras={obras} proveedores={proveedores}
        conteoEstado={conteoEstado} conteoTipo={conteoTipo} conteoTodos={conteoTodos}
        conteoSinPrecio={filtro.sin_precio ? tot.renglones : tot.sin_precio}
        compacto={!hayDatos}
      />

      {!hayDatos && (
        <div className="bg-white rounded-card shadow-card p-8 flex flex-col items-center gap-3 text-center">
          <div className="text-sm text-gris-dark max-w-md">
            Elegí una obra para ver su cuenta: qué se le cobra al cliente, qué pagó y qué es gasto de CADINC.
            {filtro.q && <> Para buscar <b>&quot;{filtro.q}&quot;</b> en todas las obras, mostralas.</>}
          </div>
          <Button variant="secondary" size="sm" onClick={() => setVerTodas(true)}>Ver todas las obras</Button>
        </div>
      )}

      {errorResumen && (
        <div className="bg-rojo-light border border-rojo/30 rounded-card p-4 text-sm text-rojo">
          {errorResumen instanceof Error ? errorResumen.message : 'Error al cargar la cuenta'}
        </div>
      )}

      {/* Cabecera de la obra elegida + acciones */}
      {!hayDatos ? null : obraSel ? (
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
              disabled={!resolverItems || !(cargarPrecios || esAdmin)}
              title={!(cargarPrecios || esAdmin) ? 'Los precios de la cuenta los carga el dueño (flag cargar_precios)' : !resolverItems ? 'No tenés permiso para cargar precios' : 'Cargar o corregir precios de todos los renglones de la obra'}
            >
              💲 Cargar precios
            </Button>
            <Button variant="primary" size="sm" onClick={() => setRegistrarSignal(n => n + 1)}
              disabled={!puedeCrear}
              title={puedeCrear ? 'Registrar un pago del cliente' : 'Sin permiso para registrar pagos'}>
              💲 Registrar pago
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setModalExportar(true)}
              title="PDF para el cliente o Excel para trabajar, todo en un lugar">
              ⬇ Exportar
            </Button>
            <Button variant="ghost" size="sm" onClick={() => patch({ obra_cod: undefined, sin_precio: undefined })} title="Cerrar esta obra">✕ Cerrar obra</Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 flex-wrap px-1">
          <p className="text-xs text-gris-dark">
            Todas las obras. Precios finales, IVA incluido. Hacé click en una obra para cargar precios, registrar pagos y sacar el PDF para el cliente.
          </p>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={exportar} loading={exportando} disabled={total === 0}>📊 Exportar Excel</Button>
            <Button variant="ghost" size="sm" onClick={() => setVerTodas(false)} title="Volver a la pantalla vacía">✕ Ocultar</Button>
          </div>
        </div>
      )}

      {/* El modal de exportar se arma solo: busca renglones, pagos y (si la
          obra es por administración) las tres patas. Elegís formato y tildás
          secciones — patrón de los exports de tarja. */}
      {obra && (
        <ModalExportar open={modalExportar} onClose={() => setModalExportar(false)} obra={obra} />
      )}

      {/* Obra por administración: costo + % por pata, con su PDF y su Excel.
          Solo si la obra está marcada — para el resto no cambia nada. */}
      {obra?.por_administracion && <AdministracionSection obra={obra} />}
      {/* Llave en mano: la MISMA sección en modo costos — cuánto va gastando
          CADINC en jornales, contratistas y materiales, con el % opcional
          (cargas sociales) arriba del costo. Gateado por ver_costos: es
          información de plata propia. */}
      {obra && !obra.por_administracion && llaveEnMano && verCostos && veTarja && (
        <AdministracionSection obra={obra} modo="costos" />
      )}
      {obra && !obra.por_administracion && !llaveEnMano && (
        <div className="flex justify-end -mt-2"><MarcarAdministracion obra={obra} /></div>
      )}

      {obraSel && (
        <>
          {obra && <CertificadosSection obra={obra} puedeEmitir={!!(cargarPrecios || esAdmin)} esAdmin={!!esAdmin} />}
          <PagosCliente obraCod={obraSel} obraNom={obraNom} puedeEditar={puedeEditar} puedeEliminar={puedeEliminar} porAdministracion={!!obra?.por_administracion} registrarSignal={registrarSignal} />
        </>
      )}

      {hayDatos && mostrarResumen && (
        cargandoResumen && !resumen
          ? <div className="bg-white rounded-card shadow-card p-8 text-center text-sm text-gris-dark">Cargando resumen…</div>
          : <ResumenTabla filas={filas} grupo={grupo} onElegirObra={cod => patch({ obra_cod: cod })} />
      )}

      {/* Renglones */}
      {hayDatos && <div className="bg-white rounded-card shadow-card overflow-hidden">
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
      </div>}

      {obraSel && (
        <ModalCargarPrecios open={modalPrecios} onClose={() => setModalPrecios(false)} obraCod={obraSel} obraNom={obraNom} />
      )}
    </div>
  )
}
