'use client'

import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import { useSessionStore } from '@/store/session.store'
import {
  useFacturas, useOrden, useRegistrarOrdenesLote, subirComprobantePendiente, borrarComprobantePendiente,
} from '../hooks/usePagos'
import { useProveedorPagos } from '../hooks/useProveedoresPagos'
import { SelectCuentaOrigen, cuentaOrigenId } from './SelectCuentaOrigen'
import { ModalAvisarPago } from './ModalAvisarPago'
import { ModalExcelGalicia } from './ModalExcelGalicia'
import {
  FORMAS_CON_CUENTA_DESTINO, FORMAS_CON_FECHA_COBRO,
  FORMAS_PAGO_OP, comprobanteObligatorio, comprobantePorCheque, fmtM, formaPagoLabel, hoyAR, motivoComprobante,
} from '../utils/pagos.utils'
import { detalleErrorPagos, mensajeAvisoPagos, mensajeErrorPagos } from '../utils/pagos.errores'
import {
  FORMA_POR_DEFECTO, bloqueoPorFirma, chequesParaEnviar, filasIniciales, filasQueSePasan, formaSegunLoPrevisto, lineasDeOrden,
  bloquesDelError, n, problemaCheques, repartirTotalEnFilas, totalDeFilas, type FilaFactura,
} from '../utils/pagoForm'
import { EditorCheques, useEditorCheques } from './pago/EditorCheques'
import { AvisoNcSinAplicar, CampoACuenta, CuentaDestinoProveedor, FilasFacturasPago, cuentaDelPadron } from './pago/FacturasDelPago'
import { Campo, inputCls } from './pago/Campo'
import { ComprobanteQueNoViaja } from './pago/ComprobanteQueNoViaja'
import type {
  CrearOrdenInput, PagosAdjuntoPendiente, PagosFactura, PagosFormaPagoOP, PagosOrden,
} from '@/types/domain.types'

/**
 * «Pagar en lote» (20260929t): facturas aprobadas de VARIOS proveedores, una
 * orden de pago por proveedor, todo o nada (`POST /api/pagos/ordenes/lote` →
 * `pagos_emitir_ordenes_lote`).
 *
 * Arriba lo común (fecha, cuenta de origen, forma por defecto). Abajo un
 * bloque por proveedor con las MISMAS piezas que «Registrar pago»: facturas
 * con monto editable (parcial vale, tope `saldo_pagable`), a cuenta, forma
 * propia, el editor de cheques con la foto leída por IA, la cuenta destino del
 * padrón y el comprobante. Cada bloque valida lo suyo y se puede excluir.
 *
 * La doble firma no cede en el lote: un bloque con facturas que la persona
 * cargó o aprobó (sin ser admin) lo dice y no se puede pagar. El backend lo
 * vuelve a mirar igual.
 *
 * Si el POST rebota, NO se crea ninguna OP; el error viene con el índice del
 * bloque y se pinta ahí. Los archivos ya subidos se conservan para reintentar
 * (el backend del lote no los borra); al cerrar sin pagar se limpian.
 */

export const MAX_ORDENES_LOTE = 30

interface Props {
  facturaIds: number[]
  onClose:    () => void
}

/** Lo que cada bloque le cuenta al modal. */
interface EstadoBloque {
  proveedorId: number
  nombre:      string
  forma:       PagosFormaPagoOP
  total:       number
  /** Por qué no se puede pagar este bloque; null = listo. */
  problema:    string | null
  /** Lo que viaja al backend (sin `fecha`: es la del lote). */
  orden:       Omit<CrearOrdenInput, 'fecha'>
  /** Archivos ya subidos a `ordenes/pendientes/` (comprobante y fotos). */
  subidos:     string[]
  /** Los que viajan en `orden` (las fotos de cheques solo con cheque/e-cheq). */
  viajan:      string[]
  /** Para la planilla del Galicia: las facturas con lo que se les paga. */
  pagadas:     { factura: PagosFactura; monto: number }[]
}

interface Resultado {
  ordenes: PagosOrden[]
  /** Facturas pagadas por transferencia, con el monto de este pago (planilla Galicia). */
  galicia: PagosFactura[]
}

export function ModalPagarLote({ facturaIds, onClose }: Props) {
  const toast = useToast()
  const { verPii, esAdmin } = usePermisos('pagos')
  const userId = useSessionStore(s => s.profile?.id ?? null)
  const registrar = useRegistrarOrdenesLote()

  // Mismo pedido que el modal suelto: las facturas se traen por id.
  const { data: pagina, isLoading } = useFacturas(
    { estados: ['aprobada', 'pagada_parcial'], archivadas: true, clase: 'factura' }, 1, 200, facturaIds.length > 0,
  )
  const grupos = useMemo(() => {
    const elegidas = (pagina?.items ?? []).filter(f => facturaIds.includes(f.id))
    const porProv = new Map<number, PagosFactura[]>()
    for (const f of elegidas) porProv.set(f.proveedor_id, [...(porProv.get(f.proveedor_id) ?? []), f])
    return [...porProv.values()].sort((a, b) => a[0]!.proveedor_nom.localeCompare(b[0]!.proveedor_nom))
  }, [pagina, facturaIds])

  // ── Lo común ──
  const [fecha, setFecha] = useState(hoyAR())
  const [cuentaOrigen, setCuentaOrigen] = useState('')
  const [formaComun, setFormaComun] = useState<PagosFormaPagoOP>(FORMA_POR_DEFECTO)

  // ── Bloques ──
  const [estados, setEstados] = useState<Record<number, EstadoBloque>>({})
  const [excluidos, setExcluidos] = useState<Set<number>>(new Set())
  const [errores, setErrores] = useState<Record<number, string>>({})
  const onEstado = useCallback((e: EstadoBloque) => setEstados(m => ({ ...m, [e.proveedorId]: e })), [])
  const alternarIncluido = useCallback((id: number, incluir: boolean) => setExcluidos(s => {
    const x = new Set(s)
    if (incluir) x.delete(id); else x.add(id)
    return x
  }), [])

  const [resultado, setResultado] = useState<Resultado | null>(null)

  const incluidos = grupos
    .map(g => estados[g[0]!.proveedor_id])
    .filter((e): e is EstadoBloque => !!e && !excluidos.has(e.proveedorId))
  const conProblema = incluidos.filter(e => e.problema)
  const total = incluidos.reduce((s, e) => s + e.total, 0)
  const cargando = grupos.some(g => !estados[g[0]!.proveedor_id])

  const motivo =
    cargando ? 'Cargando…'
    : incluidos.length === 0 ? 'No hay ningún proveedor incluido'
    : incluidos.length > MAX_ORDENES_LOTE ? `Como máximo ${MAX_ORDENES_LOTE} proveedores por lote: excluí algunos`
    : conProblema.length > 0 ? `${conProblema[0]!.nombre}: ${conProblema[0]!.problema}`
    : undefined

  // Lo subido que sigue colgado en el bucket (comprobantes y fotos de cheques).
  const subidos = () => Object.values(estados).flatMap(e => e.subidos)

  /** Cerrar sin pagar: limpiar lo que quedó colgado en el bucket. */
  function cerrar() {
    for (const p of subidos()) borrarComprobantePendiente(p).catch(() => {})
    onClose()
  }

  async function pagar() {
    if (motivo) return
    setErrores({})
    const enviados = incluidos
    try {
      const r = await registrar.mutateAsync({
        fecha,
        cuenta_origen_id: cuentaOrigenId(cuentaOrigen),
        ordenes: enviados.map(e => e.orden),
      })
      // Lo que no viajó (fotos de cheques que quedaron sin usar, bloques
      // excluidos) se borra; lo que viajó ya está en su OP.
      const viajaron = new Set(enviados.flatMap(e => e.viajan))
      for (const p of subidos()) if (!viajaron.has(p)) borrarComprobantePendiente(p).catch(() => {})
      const ordenes = r.ordenes.map(o => o.orden)
      toast(`✓ ${ordenes.length} orden${ordenes.length === 1 ? '' : 'es'} de pago registrada${ordenes.length === 1 ? '' : 's'} por ${fmtM(ordenes.reduce((s, o) => s + Number(o.monto_pagado), 0))}`, 'ok')
      for (const a of r.avisos) {
        const quien = a.indice != null ? enviados[a.indice]?.nombre : undefined
        toast(`${quien ? `${quien}: ` : ''}${mensajeAvisoPagos(a)}`, 'warn')
      }
      setResultado({
        ordenes,
        galicia: enviados
          .filter(e => e.forma === 'transferencia')
          .flatMap(e => e.pagadas.map(p => ({ ...p.factura, saldo: p.monto, saldo_pagable: p.monto }))),
      })
    } catch (e) {
      // Nada se creó. El error dice qué bloque (o bloques): se pinta ahí.
      const msg = mensajeErrorPagos(e)
      const bloques = bloquesDelError(detalleErrorPagos(e))
        .map(i => enviados[i]).filter((b): b is EstadoBloque => !!b)
      if (bloques.length > 0) {
        setErrores(Object.fromEntries(bloques.map(b => [b.proveedorId, msg])))
        toast(`${bloques.map(b => b.nombre).join(' y ')}: ${msg} No se registró ninguna orden.`, 'err')
      } else {
        toast(`${msg} No se registró ninguna orden.`, 'err')
      }
    }
  }

  if (resultado) {
    return <ResultadoLote resultado={resultado} verPii={!!verPii} onClose={onClose} />
  }

  if (isLoading || grupos.length === 0) {
    return <Modal open onClose={onClose} title="Pagar en lote" width="max-w-4xl">
      <div className="p-8 text-center text-sm text-gris-dark">{isLoading ? 'Cargando facturas…' : 'No hay facturas aprobadas con saldo para pagar.'}</div>
    </Modal>
  }

  return (
    <Modal
      open onClose={cerrar} width="max-w-4xl"
      title={`Pagar en lote · ${grupos.length} proveedores`}
      footer={
        <div className="flex gap-2 justify-end items-center flex-wrap">
          <div className="text-xs text-gris-dark mr-auto">
            <b className="text-carbon">{incluidos.length}</b> orden{incluidos.length === 1 ? '' : 'es'} de pago ·{' '}
            <b className="font-mono tabular-nums text-carbon">{fmtM(total)}</b>
            {excluidos.size > 0 && <> · {excluidos.size} excluido{excluidos.size === 1 ? '' : 's'}</>}
            {conProblema.length > 0 && (
              <span className="text-rojo font-semibold"> · {conProblema.length} con problemas</span>
            )}
          </div>
          {conProblema.length > 0 && (
            <Button variant="ghost" size="sm"
              onClick={() => setExcluidos(s => new Set([...s, ...conProblema.map(e => e.proveedorId)]))}
              title="Deja afuera los proveedores que todavía no se pueden pagar, y paga el resto">
              Excluir los {conProblema.length} con problemas
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={cerrar}>Cancelar</Button>
          <Button size="sm" onClick={pagar} loading={registrar.isPending} disabled={!!motivo} title={motivo}>
            💸 Registrar {incluidos.length} {incluidos.length === 1 ? 'orden' : 'órdenes'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        <div className="text-[11px] text-gris-dark bg-gris/40 border border-gris-mid rounded px-2.5 py-1.5">
          Una <b>orden de pago por proveedor</b>, todas juntas: si una no se puede registrar, <b>no se registra
          ninguna</b> y el error aparece en su bloque. Cada bloque puede pagar una parte de sus facturas y tener
          su propia forma de pago; lo que no se quiera pagar ahora, se excluye.
        </div>

        {/* Lo común */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Campo label="Fecha del pago" hint="la misma para todas">
            <input type="date" value={fecha} max={hoyAR()} onChange={e => setFecha(e.target.value)} className={inputCls} />
          </Campo>
          <Campo label="Sale de la cuenta" hint="opcional">
            <SelectCuentaOrigen value={cuentaOrigen} onChange={setCuentaOrigen} forma={formaComun} className={inputCls} />
          </Campo>
          <Campo label="Forma por defecto" hint="la de cada bloque se cambia abajo">
            <select value={formaComun} onChange={e => setFormaComun(e.target.value as PagosFormaPagoOP)} className={inputCls}>
              {FORMAS_PAGO_OP.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </Campo>
        </div>

        {grupos.map(facturas => {
          const id = facturas[0]!.proveedor_id
          return (
            <BloqueProveedor key={id}
              facturas={facturas}
              fecha={fecha}
              formaComun={formaComun}
              verPii={!!verPii}
              bloqueo={bloqueoPorFirma(facturas, userId, !!esAdmin)}
              incluido={!excluidos.has(id)}
              onIncluir={alternarIncluido}
              errorServidor={errores[id] ?? null}
              abiertoInicial={grupos.length <= 3}
              onEstado={onEstado}
            />
          )
        })}
      </div>
    </Modal>
  )
}

// ── Un bloque por proveedor ───────────────────────────────────────────

interface BloqueProps {
  facturas:       PagosFactura[]
  fecha:          string
  formaComun:     PagosFormaPagoOP
  verPii:         boolean
  bloqueo:        string | null
  incluido:       boolean
  onIncluir:      (proveedorId: number, incluir: boolean) => void
  errorServidor:  string | null
  abiertoInicial: boolean
  onEstado:       (e: EstadoBloque) => void
}

const BloqueProveedor = memo(function BloqueProveedor({
  facturas, fecha, formaComun, verPii, bloqueo, incluido, onIncluir, errorServidor, abiertoInicial, onEstado,
}: BloqueProps) {
  const toast = useToast()
  const f0 = facturas[0]!
  const proveedorId = f0.proveedor_id
  const { data: proveedor } = useProveedorPagos(proveedorId)

  const [abierto, setAbierto] = useState(abiertoInicial)
  const [filas, setFilas] = useState<FilaFactura[]>(() => filasIniciales(facturas))
  const [aCuenta, setACuenta] = useState('')
  // La forma propia: la prevista en sus facturas si coinciden; si no, la común.
  const [formaElegida, setFormaElegida] = useState<PagosFormaPagoOP | null>(null)
  const forma = formaElegida ?? formaSegunLoPrevisto(facturas, formaComun)
  const vieneDeLoPrevisto = !formaElegida && forma !== formaComun
  const [referencia, setReferencia] = useState('')
  const [comprobante, setComprobante] = useState<PagosAdjuntoPendiente | null>(null)
  const [subiendo, setSubiendo] = useState(false)

  const totalPlata = totalDeFilas(filas, aCuenta)
  const necesitaCuenta = FORMAS_CON_CUENTA_DESTINO.includes(forma)
  // Mientras el padrón no llegó no se sabe: no se marca como problema.
  const sinDatosPago = necesitaCuenta && !!proveedor && !proveedor.cbu && !proveedor.alias_cbu
  const pideCheques = FORMAS_CON_FECHA_COBRO.includes(forma)

  const ed = useEditorCheques({
    fecha, totalPlata, forma, pideCheques,
    planFactura: facturas.find(f => f.plan_cheques)?.plan_cheques ?? null,
  })
  const cheques = ed.cheques
  // Con cheque/e-cheq el comprobante es el de CADA cheque (20260929w): no hay
  // uno aparte. Uno subido antes de pasar a cheque/e-cheq queda guardado pero
  // NO viaja (mismo criterio que «Registrar pago»).
  const comprobanteAparte = !comprobantePorCheque(forma)
  const pideComprobante = comprobanteObligatorio(forma)
  const comprobanteQueViaja = comprobanteAparte ? comprobante : null

  // Si el backend rebotó este bloque, se muestra abierto para verlo.
  const visible = abierto || !!errorServidor

  const estado = useMemo<EstadoBloque>(() => {
    const sePasan = filasQueSePasan(filas)
    const problema =
      bloqueo ? bloqueo
      : sePasan.length > 0 ? 'Hay montos que superan el saldo de su factura'
      : totalPlata <= 0 ? 'No hay nada para pagar'
      : !proveedor && necesitaCuenta ? 'Cargando los datos de pago…'
      : sinDatosPago ? 'No tiene CBU ni alias: cargalos para transferirle'
      : pideComprobante && !comprobante ? motivoComprobante()
      : pideCheques ? problemaCheques(cheques, totalPlata, fecha, forma)
      : null
    const fotos = cheques.flatMap(c => c.foto ? [c.foto.storage_path] : [])
    const adjuntos = comprobanteQueViaja ? [comprobanteQueViaja] : []
    return {
      proveedorId,
      nombre: f0.proveedor_nom,
      forma,
      total: totalPlata,
      problema,
      orden: {
        proveedor_id: proveedorId,
        forma_pago: forma,
        cheques: pideCheques ? chequesParaEnviar(cheques) : undefined,
        referencia: referencia.trim() || undefined,
        lineas: lineasDeOrden(filas, aCuenta),
        adjuntos,
      },
      subidos: [...(comprobante ? [comprobante.storage_path] : []), ...fotos],
      viajan: [...adjuntos.map(a => a.storage_path), ...(pideCheques ? fotos : [])],
      pagadas: filas.filter(f => n(f.monto) > 0).map(f => ({ factura: f.factura, monto: n(f.monto) })),
    }
  }, [bloqueo, filas, aCuenta, totalPlata, proveedor, necesitaCuenta, sinDatosPago, pideComprobante, comprobante,
      comprobanteQueViaja, pideCheques, cheques, fecha, proveedorId, f0.proveedor_nom, forma, referencia])

  useEffect(() => { onEstado(estado) }, [estado, onEstado])

  async function subir(file: File) {
    setSubiendo(true)
    try {
      const adj = await subirComprobantePendiente(file, 'comprobante_pago')
      if (comprobante) borrarComprobantePendiente(comprobante.storage_path).catch(() => {})
      setComprobante(adj)
    } catch (e) {
      toast(mensajeErrorPagos(e), 'err')
    } finally {
      setSubiendo(false)
    }
  }

  function usarTotalDeLosCheques(totalCheques: number) {
    const r = repartirTotalEnFilas(totalCheques, filas)
    setFilas(r.filas)
    setACuenta(r.aCuenta)
  }

  const cuenta = cuentaDelPadron(proveedor, verPii)
  const listo = !estado.problema
  const borde = !incluido ? 'border-gris-mid opacity-70'
    : errorServidor ? 'border-rojo'
    : listo ? 'border-verde/50' : 'border-amarillo/70'

  return (
    <div className={`border-[1.5px] rounded ${borde}`}>
      {/* Cabecera: siempre visible, con lo que hay que saber sin abrir */}
      <div className="flex items-center gap-2 flex-wrap px-2.5 py-2 bg-gris/30">
        <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none"
          title={incluido ? 'Dejar afuera de este lote' : 'Incluir en este lote'}>
          <input type="checkbox" checked={incluido} aria-label={`Incluir a ${f0.proveedor_nom} en el lote`}
            onChange={e => onIncluir(proveedorId, e.target.checked)} />
        </label>
        <button type="button" onClick={() => setAbierto(a => !a)} className="flex-1 min-w-[220px] text-left">
          <div className="font-semibold text-sm">
            {visible ? '▾' : '▸'} {f0.proveedor_nom}
            <span className="font-normal text-[11px] text-gris-dark">
              {f0.proveedor_cuit ? ` · CUIT ${f0.proveedor_cuit}` : ''}
              {cuenta ? ` · ${cuenta}` : ''}
            </span>
          </div>
          <div className="text-[11px] text-gris-dark">
            {facturas.length} factura{facturas.length === 1 ? '' : 's'} · {formaPagoLabel(forma)}
            {!incluido && <b> · excluido</b>}
          </div>
        </button>
        <div className="text-right">
          <div className="font-mono font-bold tabular-nums">{fmtM(totalPlata)}</div>
          {incluido && (
            <div className={`text-[11px] ${errorServidor ? 'text-rojo font-semibold' : listo ? 'text-verde' : 'text-[#7A5000]'}`}>
              {errorServidor ? '✕ rebotó' : listo ? '✓ listo' : '⚠ falta algo'}
            </div>
          )}
        </div>
      </div>

      {incluido && (errorServidor || estado.problema) && (
        <div className={`px-2.5 py-1.5 text-xs border-t ${errorServidor ? 'bg-rojo-light text-rojo border-rojo/30' : 'bg-amarillo-light text-[#7A5000] border-amarillo/40'}`}>
          {errorServidor ? `✕ ${errorServidor}` : `⚠ ${estado.problema}`}
          {bloqueo && <span className="block text-[11px] mt-0.5">Excluilo para pagar el resto.</span>}
        </div>
      )}

      {visible && (
        <div className="flex flex-col gap-3 p-2.5 border-t border-gris-mid">
          <AvisoNcSinAplicar proveedorId={proveedorId} />

          <FilasFacturasPago filas={filas}
            onMonto={(fid, v) => setFilas(fs => fs.map(x => x.factura.id === fid ? { ...x, monto: v } : x))} />

          <CampoACuenta value={aCuenta} onChange={setACuenta} />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Campo label="Forma" hint={vieneDeLoPrevisto ? 'Lo previsto en la factura' : undefined}>
              <select value={forma} onChange={e => setFormaElegida(e.target.value as PagosFormaPagoOP)} className={inputCls}>
                {FORMAS_PAGO_OP.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
            </Campo>
            <Campo label="Referencia" hint="Nº de operación">
              <input value={referencia} onChange={e => setReferencia(e.target.value)} className={inputCls} />
            </Campo>
          </div>

          {pideCheques && (
            <EditorCheques ed={ed} forma={forma} fecha={fecha} totalPlata={totalPlata}
              cantFacturas={filas.length} onUsarTotalDeLosCheques={usarTotalDeLosCheques} />
          )}

          {necesitaCuenta && (
            <CuentaDestinoProveedor proveedorId={proveedorId} proveedor={proveedor} verPii={verPii} sinDatosPago={sinDatosPago} />
          )}

          {/* Comprobante aparte: sólo sin cheques. Con cheque/e-cheq va el de
              cada cheque, en su fila (20260929w). */}
          {comprobanteAparte ? (
            <div className="flex items-center gap-2 flex-wrap">
              <label className={`text-xs px-3 py-1.5 rounded border cursor-pointer font-semibold
                ${pideComprobante && !comprobante ? 'border-rojo text-rojo bg-rojo-light' : 'border-gris-mid bg-white hover:bg-gris'}`}>
                {subiendo ? 'Subiendo…' : comprobante ? '✓ Comprobante listo' : `📎 Comprobante${pideComprobante ? ' (obligatorio)' : ' (opcional)'}`}
                <input type="file" className="hidden" accept="image/*,application/pdf"
                  onChange={e => { const file = e.target.files?.[0]; if (file) void subir(file); e.target.value = '' }} />
              </label>
              {comprobante && <span className="text-xs text-gris-dark truncate max-w-[240px]">{comprobante.nombre_archivo}</span>}
              {pideComprobante && !comprobante && <span className="text-[11px] text-rojo">{motivoComprobante()}.</span>}
            </div>
          ) : comprobante && (
            <ComprobanteQueNoViaja comprobante={comprobante} onQuitar={() => {
              borrarComprobantePendiente(comprobante.storage_path).catch(() => {})
              setComprobante(null)
            }} />
          )}
        </div>
      )}
    </div>
  )
})

// ── Después de pagar ──────────────────────────────────────────────────

/**
 * Las OP que se crearon, y lo que se hace después: avisarle a cada proveedor
 * (el flujo de siempre, uno por OP, mostrando antes a qué dirección va) y la
 * planilla del Galicia de las que salieron por transferencia.
 */
function ResultadoLote({ resultado, verPii, onClose }: { resultado: Resultado; verPii: boolean; onClose: () => void }) {
  const { ordenes, galicia } = resultado
  const conEmail = ordenes.filter(o => !!o.proveedor_email)
  // Las que ya se abrieron (se haya mandado o no: el modal de aviso lo dice).
  const [vistos, setVistos] = useState<Set<number>>(new Set())
  // La cola de avisos: se abre de a uno el modal de siempre.
  const [cola, setCola] = useState<number[]>([])
  const [galiciaAbierta, setGaliciaAbierta] = useState(false)
  const actual = cola[0] ?? null

  if (actual !== null) {
    return <AvisarOrden ordenId={actual} onClose={() => {
      setVistos(s => new Set(s).add(actual))
      setCola(c => c.slice(1))
    }} />
  }
  if (galiciaAbierta) {
    return <ModalExcelGalicia facturas={galicia} verPii={verPii} onClose={() => setGaliciaAbierta(false)} />
  }

  const pendientes = conEmail.filter(o => !vistos.has(o.id))
  const totalPagado = ordenes.reduce((s, o) => s + Number(o.monto_pagado), 0)

  return (
    <Modal open onClose={onClose} width="max-w-2xl"
      title={`Pago en lote registrado · ${ordenes.length} orden${ordenes.length === 1 ? '' : 'es'}`}
      footer={
        <div className="flex gap-2 justify-end items-center flex-wrap">
          <Button variant="secondary" size="sm" onClick={() => setGaliciaAbierta(true)} disabled={galicia.length === 0}
            title={galicia.length === 0 ? 'Ninguna orden salió por transferencia' : 'La planilla del banco con lo que se transfirió en este lote'}>
            🏦 Planilla Galicia
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setCola(pendientes.map(o => o.id))} disabled={pendientes.length === 0}
            title={conEmail.length === 0 ? 'Ningún proveedor del lote tiene email cargado'
              : pendientes.length === 0 ? 'Ya se abrió el aviso de todos'
              : `Abre el aviso de cada una, de a una: antes de enviar ves a qué dirección va`}>
            ✉ Mandar avisos {pendientes.length > 0 ? `(${pendientes.length})` : ''}
          </Button>
          <Button size="sm" onClick={onClose}>Listo</Button>
        </div>
      }>
      <div className="flex flex-col gap-2 text-sm">
        <div className="border border-gris-mid rounded overflow-hidden">
          {ordenes.map(o => (
            <div key={o.id} className="flex items-center gap-2 flex-wrap px-2.5 py-2 border-b border-gris last:border-0">
              <b className="font-mono">{o.numero_fmt}</b>
              <span className="flex-1 min-w-[160px]">{o.proveedor_nom}</span>
              <span className="text-[11px] text-gris-dark">{formaPagoLabel(o.forma_pago)}</span>
              <span className="font-mono tabular-nums w-32 text-right">{fmtM(o.monto_pagado)}</span>
              <Button variant="ghost" size="sm" onClick={() => setCola([o.id])} disabled={!o.proveedor_email}
                title={o.proveedor_email ? `Avisarle a ${o.proveedor_nom}` : 'El proveedor no tiene email cargado: se avisa después desde la orden, cuando lo tenga'}>
                ✉ Avisar
              </Button>
            </div>
          ))}
        </div>
        <div className="text-xs text-gris-dark text-right">
          Total <b className="font-mono tabular-nums text-carbon">{fmtM(totalPagado)}</b>
        </div>
        {conEmail.length < ordenes.length && (
          <div className="text-[11px] text-gris-dark">
            {ordenes.length - conEmail.length} proveedor{ordenes.length - conEmail.length === 1 ? '' : 'es'} sin email: el aviso se manda después desde la orden de pago.
          </div>
        )}
      </div>
    </Modal>
  )
}

/** El modal de aviso de siempre, con la OP completa. */
function AvisarOrden({ ordenId, onClose }: { ordenId: number; onClose: () => void }) {
  const { data: orden } = useOrden(ordenId)
  if (!orden) {
    return <Modal open onClose={onClose} title="Avisar del pago" width="max-w-md">
      <div className="p-6 text-center text-sm text-gris-dark">Cargando la orden…</div>
    </Modal>
  }
  return <ModalAvisarPago orden={orden} onClose={onClose} />
}
