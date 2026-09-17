'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Pagination } from '@/components/ui/Pagination'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import { useObrasTodas } from '@/modules/tarja/hooks/useObras'
import { useProveedores } from '../../hooks/useProveedores'
import { usePendientesDePrecio, useMarcarConsumible } from '../../hooks/useCuentaCliente'
import { useCuentaRenglones, useCuentaResumen, fetchCuentaRenglonesTodos, type CuentaFiltro } from '../../hooks/useCuentaCorriente'
import { exportarCuentaCorriente } from '../../utils/cuentaCorrienteExport'
import type { CuentaEstado, CuentaGrupo, CuentaRenglon } from '@/types/domain.types'
import { FiltrosCuenta } from './FiltrosCuenta'
import { ResumenTabla } from './ResumenTabla'
import { RenglonesTabla, bloqueoConsumible } from './RenglonesTabla'
import { PagosCliente } from './PagosCliente'
import { PreciosPropuestos } from './PreciosPropuestos'
import { CertificadosSection } from './CertificadosSection'
import { DevolucionesSection } from './DevolucionesSection'
import { AdministracionSection, MarcarAdministracion } from './AdministracionSection'
import { ModalExportar } from './ModalExportar'
import { ModalCargarPrecios } from './ModalCargarPrecios'
import { ESTADOS, ESTADO_META, fmtM, fmtFecha, recortar, totalizar, filasPorGrupo } from './cuentaCorriente.utils'

/** Que el resumen de todas las obras no haya que volver a pedirlo cada vez. */
const MEMORIA_VER_TODAS = 'cadinc.cuenta-corriente.ver-todas'

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

/** Los códigos que devuelve la RPC, en castellano. */
function mensajeConsumible(code?: string): string {
  if (!code) return 'No se pudo guardar'
  if (code.includes('OBRA_POR_ADMINISTRACION')) return 'En las obras por administración se factura todo con %, no hay consumibles propios.'
  if (code.includes('OBRA_LLAVE_EN_MANO'))      return 'En las obras llave en mano ya es todo gasto de CADINC.'
  if (code.includes('MCC_COBRADO'))             return 'Uno de los renglones ya está cobrado. Soltalo del pago primero. No se marcó ninguno.'
  if (code.includes('MCC_CERTIFICADO'))         return 'Uno de los renglones ya entró en un certificado. No se marcó ninguno.'
  if (code.includes('ITEM_PAGO_DIRECTO'))       return 'Uno lo pagó el cliente directo al proveedor. No se marcó ninguno.'
  if (code.includes('ITEM_ES_EPP'))             return 'El EPP ya es gasto propio por su clase. No se marcó ninguno.'
  if (code.includes('SIN_PERMISO_CARGAR_PRECIOS')) return 'Te falta el permiso de cargar precios.'
  return code
}

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
  // son información sensible, así que verlos es una decisión EXPLÍCITA. Eso no
  // cambia — lo que cambia (17/09) es que la decisión no haya que tomarla de
  // nuevo cada vez que se abre la pantalla:
  //
  //  · `?todas=1` en el link la abre directo, así el resumen se puede marcar
  //    como favorito;
  //  · y si ya la abriste una vez, se recuerda en este navegador.
  //
  // El motivo del cambio: el user preguntó DOS VECES dónde se veía el resumen
  // de todas las obras, teniéndolo a un click. El cartel de la pantalla vacía
  // decía "Elegí una obra" y el botón del resumen quedaba abajo, gris y chico:
  // la pantalla te mandaba a hacer otra cosa y el resumen parecía no existir.
  // La memoria es per-navegador a propósito (`localStorage`): es una comodidad
  // de quien mira, no un permiso — el backend sigue decidiendo qué ve cada uno.
  const [verTodas, setVerTodas] = useState(searchParams.get('todas') === '1')
  useEffect(() => {
    if (verTodas) return
    try {
      if (localStorage.getItem(MEMORIA_VER_TODAS) === '1') setVerTodas(true)
    } catch {
      // Navegador privado o storage bloqueado: se abre vacía, como antes.
    }
  }, [verTodas])
  function elegirVerTodas(valor: boolean) {
    setVerTodas(valor)
    try {
      if (valor) localStorage.setItem(MEMORIA_VER_TODAS, '1')
      else localStorage.removeItem(MEMORIA_VER_TODAS)
    } catch {
      // Sin storage funciona igual, solo no se recuerda.
    }
  }
  const [modalExportar, setModalExportar] = useState(false)
  // Señal para el modal de registrar pago, que vive adentro de PagosCliente:
  // cada incremento lo abre. Así el botón queda en la cabecera de la obra sin
  // mover el modal (usa los imputables y el estado del bloque).
  const [registrarSignal, setRegistrarSignal] = useState(0)

  // ── Consumibles propios (20260914aa) ─────────────────────────────────────
  // Marcar renglones que pone CADINC para ejecutar y no se le cobran al
  // cliente. Sólo en obras de PRESUPUESTO CERRADO: en las de administración se
  // factura todo con %, y en las llave en mano ya es todo gasto propio. La base
  // rechaza las dos, esto sólo evita mostrar un botón que va a fallar.
  const [modoConsumible, setModoConsumible]   = useState(false)
  // Se guarda la FILA entera y no sólo el id. El listado pagina de a 50 en el
  // server: con un Set de ids, la barra contaba lo tildado en todas las páginas
  // pero el total y el POST salían de `items`, que es sólo la página visible.
  // O sea que decía "15 renglones" y mandaba 5, y los otros 10 se borraban al
  // guardar sin haber viajado nunca — se los seguía facturando al cliente.
  // Hay 7 obras de presupuesto cerrado con más de 50 renglones, así que no era
  // un borde.
  const [marcados, setMarcados]               = useState<Map<number, CuentaRenglon>>(new Map())
  const [motivoConsumible, setMotivoConsumible] = useState('')
  const { mutate: marcarConsumible, isPending: marcando } = useMarcarConsumible()

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
    return { material: t.porTipo.material.renglones, epp: t.porTipo.epp.renglones, consumible: t.porTipo.consumible.renglones }
  }, [grupos, filtro.estados])
  // Cuanto hay en cada estado, EN PLATA. Se calcula sin recortar por estado a
  // proposito: si un chip esta activo, `tot` ya viene filtrado y el desglose
  // mostraria ceros en las otras tres columnas.
  const desglose = useMemo(() => {
    const t = totalizar(recortar(grupos, undefined, filtro.tipo))
    return Object.fromEntries(ESTADOS.map(e => [e.key, t.porEstado[e.key].total])) as Record<CuentaEstado, number>
  }, [grupos, filtro.tipo])
  const conteoTodos = conteoEstado.a_cobrar + conteoEstado.cobrado + conteoEstado.pago_directo + conteoEstado.gasto_cadinc
  const filas = useMemo(() => filasPorGrupo(gruposFiltrados, resumen?.pagos ?? [], grupo), [gruposFiltrados, resumen, grupo])

  const items = useMemo(() => pagina?.items ?? [], [pagina])
  const total = pagina?.total ?? 0

  // El botón aparece sólo donde la marca tiene sentido y sólo para quien puede
  // mover la cuenta del cliente: el mismo flag que emitir certificado.
  const puedeMarcarConsumible = !!obra && !obra.por_administracion
    && obra.materiales_a_cargo_de !== 'cadinc' && (cargarPrecios || esAdmin)
  const seleccionados = useMemo(() => [...marcados.values()], [marcados])
  const plataMarcada  = useMemo(() => seleccionados.reduce((s, r) => s + Number(r.precio_total ?? 0), 0), [seleccionados])
  // Una tanda va toda para el mismo lado. Si lo tildado ya está marcado, el
  // botón desmarca; si no, marca. Mezclar los dos sentidos en un solo click es
  // la forma más fácil de mover plata sin querer.
  const hayDesmarcables = seleccionados.length > 0 && seleccionados.every(r => r.consumible_propio)

  // La confirmación va en un Modal y no en un confirm() del navegador: el
  // confirm no deja ver CUÁLES son los renglones, que es lo que evita marcar de
  // más, y además bloquea cualquier automatización del navegador.
  const [confirmando, setConfirmando] = useState<boolean | null>(null)

  function confirmarConsumible(marcar: boolean) {
    if (!obraSel || seleccionados.length === 0) return
    marcarConsumible(
      { obra_cod: obraSel, item_ids: seleccionados.map(r => r.item_id), marcar, motivo: motivoConsumible || undefined },
      {
        onSuccess: (r) => {
          toast(`✓ ${r.marcados} renglón(es) · ${fmtM(Number(r.plata))} ${marcar ? 'salieron de' : 'volvieron a'} la deuda`, 'ok')
          setMarcados(new Map()); setMotivoConsumible(''); setConfirmando(null)
        },
        onError: (e: Error) => { toast(mensajeConsumible(e.message), 'err'); setConfirmando(null) },
      },
    )
  }
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

      {/* Precios que cargó quien compró, esperando el OK. Va arriba de los
          filtros: es una bandeja de trabajo, no depende de la obra elegida.
          Solo para quien puede aprobar — al resto el endpoint le da 403. */}
      {(cargarPrecios || esAdmin) && <PreciosPropuestos />}

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
            <b className="text-gris-darkest">¿Cuánto debe cada obra?</b> El resumen las muestra todas
            juntas, ordenadas por deuda. Desde ahí hacés click en una para cargar precios,
            registrar pagos y sacar el PDF del cliente.
            {filtro.q && <> Para buscar <b>&quot;{filtro.q}&quot;</b> en todas las obras, mostralas.</>}
          </div>
          <Button size="sm" onClick={() => elegirVerTodas(true)}>Ver el resumen de todas las obras</Button>
          <div className="text-xs text-gris-dark">
            O elegí una obra puntual en el filtro de arriba.
          </div>
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
            <Button variant="ghost" size="sm" onClick={() => elegirVerTodas(false)} title="Volver a la pantalla vacía">✕ Ocultar</Button>
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
      {/* Todo lo que NO es por administración: la MISMA sección en modo costos —
          cuánto va gastando CADINC en jornales, contratistas y materiales, con
          el % opcional (cargas sociales) arriba del costo. Gateado por
          ver_costos: es información de plata propia.

          Hasta el 14/09 esto se mostraba SOLO en las llave en mano. Pero el
          dueño lo quiere también en las de presupuesto cerrado, que son las más
          numerosas (26 obras): ahí la mano de obra se cobra por fuera de la
          plataforma, así que esta sección es el único lugar del sistema donde
          se ve cuánto costó la obra. La diferencia entre los dos casos está en
          el subtítulo de la sección, no acá: en llave en mano todo el material
          es gasto propio, en presupuesto cerrado una parte se le recupera al
          cliente y la sección lo aclara. */}
      {obra && !obra.por_administracion && verCostos && veTarja && (
        <AdministracionSection obra={obra} modo="costos" />
      )}
      {obra && !obra.por_administracion && !llaveEnMano && (
        <div className="flex justify-end -mt-2"><MarcarAdministracion obra={obra} /></div>
      )}

      {/* Desglose en plata de la obra elegida.
          La tabla de resumen tiene estas mismas cuatro columnas, pero se
          esconde justamente cuando hay UNA obra elegida y el agrupador es
          "obra" (mostrarResumen), que es el caso normal. Resultado: para saber
          cuanto era gasto propio y cuanto a cobrar habia que tocar un chip,
          leer "Total filtrado", tocar otro y volver a leer. Ahora esta a la
          vista, y cada numero filtra la lista al tocarlo. */}
      {obraSel && hayDatos && !cargandoResumen && (
        <div className="bg-white rounded-card shadow-card p-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {ESTADOS.map(e => {
            const activo = filtro.estados?.length === 1 && filtro.estados[0] === e.key
            return (
              <button
                key={e.key}
                onClick={() => patch({ estados: activo ? undefined : [e.key] })}
                title={`${e.hint}. Tocá para ver solo estos renglones.`}
                className={`text-left rounded-lg px-3 py-2 border transition ${
                  activo ? 'border-azul bg-azul-light/40' : 'border-gris hover:border-gris-mid'}`}
              >
                <div className="text-[10px] font-bold uppercase tracking-wider text-gris-dark">{e.label}</div>
                <div className="font-mono text-base font-bold">{fmtM(desglose[e.key] ?? 0)}</div>
                <div className="text-[10px] text-gris-dark">
                  {conteoEstado[e.key]} renglón{conteoEstado[e.key] === 1 ? '' : 'es'}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {obraSel && (
        <>
          {obra && <CertificadosSection obra={obra} puedeEmitir={!!(cargarPrecios || esAdmin)} esAdmin={!!esAdmin} />}
          <PagosCliente obraCod={obraSel} obraNom={obraNom} puedeEditar={puedeEditar} puedeEliminar={puedeEliminar} porAdministracion={!!obra?.por_administracion} registrarSignal={registrarSignal} />
          {/* Todo lo que volvió al depósito desde esta obra (20260914ai). Va
              después de Pagos porque es donde se busca cuando un renglón "no
              está": una devolución sin nota de crédito no deja marca en la
              cuenta, y sin esto no había forma de verificarla desde acá. */}
          <DevolucionesSection obraCod={obraSel} />
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
            {puedeMarcarConsumible && (
              <Button variant={modoConsumible ? 'secondary' : 'ghost'} size="sm"
                onClick={() => { setModoConsumible(v => !v); setMarcados(new Map()); setMotivoConsumible('') }}
                title="Marcar los materiales que pone CADINC para ejecutar y no se le cobran al cliente">
                {modoConsumible ? '✕ Salir' : '🧰 Consumibles propios'}
              </Button>
            )}
          </div>
        </div>

        {/* Barra de la tanda. Muestra la PLATA y no sólo la cantidad: un monto
            raro se ve, "12 renglones" no. */}
        {modoConsumible && (
          <div className="px-4 py-3 bg-azul-light/60 border-y border-azul/20 flex flex-wrap items-center gap-3">
            <div className="text-xs">
              <b className="font-mono">{seleccionados.length}</b> renglón{seleccionados.length === 1 ? '' : 'es'} ·{' '}
              <b className="font-mono">{fmtM(plataMarcada)}</b>{' '}
              {hayDesmarcables ? 'vuelven a la deuda del cliente' : 'salen de la deuda del cliente'}
            </div>
            <input
              className="flex-1 min-w-[180px] max-w-xs px-2 py-1 text-xs border border-gris-mid rounded"
              placeholder="Motivo (ej: discos de corte)" maxLength={120}
              value={motivoConsumible} onChange={e => setMotivoConsumible(e.target.value)}
              disabled={hayDesmarcables}
            />
            <Button size="sm" disabled={seleccionados.length === 0 || marcando}
              onClick={() => setConfirmando(!hayDesmarcables)}>
              {hayDesmarcables ? 'Devolver a la cuenta' : 'Marcar como propios'}
            </Button>
          </div>
        )}
        {cargandoLista && !pagina ? (
          <div className="p-8 flex items-center justify-center gap-3 text-gris-dark text-sm">
            <span className="w-5 h-5 border-2 border-naranja border-t-transparent rounded-full animate-spin" /> Cargando…
          </div>
        ) : (
          <RenglonesTabla
            items={items}
            mostrarObra={!obraSel}
            vacio={filtro.sin_precio && !filtro.q ? '✓ No hay renglones sin precio con estos filtros.' : 'No hay renglones con estos filtros.'}
            seleccion={modoConsumible ? {
              marcados,
              alternar: (r: CuentaRenglon) => setMarcados(m => {
                const n = new Map(m)
                if (n.has(r.item_id)) n.delete(r.item_id); else n.set(r.item_id, r)
                return n
              }),
              bloqueado: bloqueoConsumible,
            } : undefined}
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

        {/* Confirmación de la tanda. Muestra la PLATA arriba y la LISTA abajo:
            un monto raro se ve, y la lista es lo que evita marcar de más. */}
        <Modal open={confirmando !== null} onClose={() => setConfirmando(null)}
          title={confirmando ? 'Marcar como consumibles propios' : 'Devolver a la cuenta del cliente'}>
          <div className="space-y-3">
            <div className={`rounded-lg p-3 ${confirmando ? 'bg-azul-light/60' : 'bg-amarillo-light/60'}`}>
              <div className="font-mono text-xl font-bold">{fmtM(plataMarcada)}</div>
              <div className="text-xs text-gris-dark">
                {seleccionados.length} renglón{seleccionados.length === 1 ? '' : 'es'}{' '}
                {confirmando ? 'salen de la deuda del cliente y pasan a gasto de CADINC' : 'vuelven a la deuda del cliente'}
              </div>
            </div>
            {confirmando && motivoConsumible && (
              <div className="text-xs text-gris-dark">Motivo: <b>{motivoConsumible}</b></div>
            )}
            <div className="max-h-56 overflow-y-auto border border-gris rounded-lg divide-y divide-gris">
              {seleccionados.map(r => (
                <div key={r.item_id} className="px-3 py-1.5 flex items-center justify-between gap-2 text-xs">
                  <span className="truncate">{r.descripcion}</span>
                  <span className="font-mono shrink-0">{fmtM(Number(r.precio_total ?? 0))}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmando(null)} disabled={marcando}>Cancelar</Button>
              <Button onClick={() => confirmarConsumible(confirmando!)} disabled={marcando}>
                {marcando ? 'Guardando…' : 'Confirmar'}
              </Button>
            </div>
          </div>
        </Modal>
    </div>
  )
}
