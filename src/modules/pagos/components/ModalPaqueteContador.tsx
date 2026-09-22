'use client'

/**
 * El modal que arma el paquete para el contador (2026-09-21).
 *
 * Pedido del dueño: «que sea sobre lo pagado, que se abra un modal de filtro
 * donde se seleccione fecha etc.».
 *
 * Tiene filtro PROPIO y no hereda el de la pantalla a propósito. Son dos usos
 * distintos: la bandeja se filtra para trabajar (lo de hoy, lo de este
 * proveedor), y el paquete se arma por PERÍODO CERRADO para mandarlo. Heredar
 * el filtro de la pantalla es la forma más fácil de mandarle al contador medio
 * mes sin darse cuenta.
 *
 * Arranca en el mes pasado, que es el caso real: el contador pide lo del mes
 * que cerró, no lo del que va por la mitad.
 */

import { useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { fetchPaqueteContador, type PagosOrdenesFiltro } from '../hooks/usePagos'
import { useProveedoresPagos } from '../hooks/useProveedoresPagos'
import { armarPaqueteContador } from '../utils/pagosPaquete'
import { FORMAS_PAGO_OP, fmtFecha, formaPagoLabel, hoyAR } from '../utils/pagos.utils'
import { mensajeErrorPagos } from '../utils/pagos.errores'
import type { PagosFormaPagoOPGuardada } from '@/types/domain.types'

interface Props { onClose: () => void }

const inputCls = 'w-full px-2.5 py-2 border-[1.5px] border-gris-mid rounded text-sm bg-blanco outline-none focus:border-naranja'
const lblCls   = 'block text-[11px] font-bold text-gris-dark uppercase tracking-wider mb-1'

/** Primer y último día de un mes, corridos `atras` meses desde hoy. */
function mes(atras: number): { desde: string; hasta: string; label: string } {
  const hoy = new Date(hoyAR() + 'T12:00:00')
  const ini = new Date(hoy.getFullYear(), hoy.getMonth() - atras, 1)
  const fin = new Date(hoy.getFullYear(), hoy.getMonth() - atras + 1, 0)
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return {
    desde: iso(ini), hasta: iso(fin),
    label: ini.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }),
  }
}

export function ModalPaqueteContador({ onClose }: Props) {
  const toast = useToast()
  const proveedores = useProveedoresPagos({}, 1, 300)

  const mesPasado = useMemo(() => mes(1), [])
  const [desde, setDesde] = useState(mesPasado.desde)
  const [hasta, setHasta] = useState(mesPasado.hasta)
  const [proveedorId, setProveedorId] = useState<number | ''>('')
  const [forma, setForma] = useState<PagosFormaPagoOPGuardada | ''>('')
  const [incluirAnuladas, setIncluirAnuladas] = useState(false)

  const [avance, setAvance] = useState<{ hechos: number; total: number } | null>(null)
  const [preview, setPreview] = useState<{ ordenes: number; archivos: number } | null>(null)
  const [mirando, setMirando] = useState(false)

  const rangoMal = !desde || !hasta || desde > hasta
  const trabajando = avance !== null || mirando

  const filtro = (): PagosOrdenesFiltro => ({
    desde, hasta,
    proveedor_id: proveedorId === '' ? undefined : proveedorId,
    forma_pago: forma === '' ? undefined : (forma as PagosOrdenesFiltro['forma_pago']),
    // Sin tilde solo las emitidas: una OP anulada no es plata que salió, y
    // mandársela al contador sin aclararlo es pedirle que cargue algo que no
    // pasó. Con tilde van y quedan marcadas ANULADA en el CONTENIDO.txt.
    estado: incluirAnuladas ? undefined : 'emitida',
  })

  function atajo(atras: number) {
    const m = mes(atras)
    setDesde(m.desde)
    setHasta(m.hasta)
    setPreview(null)
  }

  /** Cuánto es, antes de bajar nada. Evita el ZIP vacío y el de 400 archivos sin aviso. */
  async function verCuanto() {
    setMirando(true)
    try {
      const m = await fetchPaqueteContador(filtro())
      setPreview({
        ordenes: m.ordenes.length,
        archivos: m.ordenes.reduce((s, o) => s + o.archivos.length + o.facturas.reduce((t, f) => t + f.archivos.length, 0), 0),
      })
    } catch (e) {
      toast(mensajeErrorPagos(e), 'err')
    } finally {
      setMirando(false)
    }
  }

  async function bajar() {
    setAvance({ hechos: 0, total: 0 })
    try {
      const manifiesto = await fetchPaqueteContador(filtro())
      if (manifiesto.ordenes.length === 0) {
        toast('No hay pagos en ese período con esos filtros', 'err')
        return
      }
      const cuantos = manifiesto.ordenes.reduce(
        (s, o) => s + o.archivos.length + o.facturas.reduce((t, f) => t + f.archivos.length, 0), 0)
      if (cuantos === 0) {
        toast('Hay pagos en ese período, pero ninguno tiene archivos adjuntos', 'err')
        return
      }
      setAvance({ hechos: 0, total: cuantos })
      const r = await armarPaqueteContador(manifiesto, descripcion(), (hechos, total) => setAvance({ hechos, total }))
      const avisos = [
        r.sinComprobante > 0 ? `${r.sinComprobante} pago(s) sin comprobante` : '',
        r.facturasSinPapel > 0 ? `${r.facturasSinPapel} factura(s) sin archivo` : '',
        r.fallados > 0 ? `${r.fallados} no se pudieron bajar` : '',
      ].filter(Boolean)
      toast(
        `✓ ${r.ordenes} pago(s) · ${r.archivos} archivo(s)${avisos.length ? ' · ' + avisos.join(' · ') : ''}`,
        avisos.length > 0 ? 'err' : 'ok',
      )
      if (avisos.length === 0) onClose()
    } catch (e) {
      toast(mensajeErrorPagos(e), 'err')
    } finally {
      setAvance(null)
    }
  }

  /** Lo que se imprime adentro del CONTENIDO.txt. */
  function descripcion(): string {
    const p = [`pagos del ${fmtFecha(desde)} al ${fmtFecha(hasta)}`]
    if (proveedorId !== '') {
      p.push(proveedores.data?.items.find(x => x.id === proveedorId)?.razon_social ?? `proveedor #${proveedorId}`)
    }
    if (forma !== '') p.push(`pagados con ${formaPagoLabel(forma)}`)
    p.push(incluirAnuladas ? 'incluye órdenes anuladas' : 'solo órdenes emitidas')
    return p.join(' · ')
  }

  return (
    <Modal open onClose={trabajando ? () => undefined : onClose} title="Paquete para el contador" width="max-w-2xl">
      <div className="flex flex-col gap-4">
        <p className="text-xs text-gris-dark">
          Un ZIP con <b>los comprobantes de pago y las facturas que cubrieron</b>, una carpeta por
          orden de pago. Va sobre lo <b>pagado</b> en el período: una factura de agosto pagada en
          septiembre entra en septiembre, que es lo que el contador concilia contra el banco.
        </p>

        <div>
          <label className={lblCls}>Período de pago</label>
          <div className="flex gap-2 flex-wrap mb-2">
            {[1, 2, 0].map(k => {
              const m = mes(k)
              const activo = desde === m.desde && hasta === m.hasta
              return (
                <button key={k} type="button" onClick={() => atajo(k)} disabled={trabajando}
                  className={`text-xs px-2.5 py-1 rounded border font-semibold capitalize ${
                    activo ? 'bg-naranja text-white border-naranja' : 'bg-white border-gris-mid hover:bg-gris'}`}>
                  {k === 0 ? `${m.label} (en curso)` : m.label}
                </button>
              )
            })}
          </div>
          <div className="flex gap-2 flex-wrap">
            <div className="flex-1 min-w-[140px]">
              <label className="block text-[10px] text-gris-dark mb-0.5">Desde</label>
              <input type="date" value={desde} disabled={trabajando}
                onChange={e => { setDesde(e.target.value); setPreview(null) }} className={inputCls} />
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="block text-[10px] text-gris-dark mb-0.5">Hasta</label>
              <input type="date" value={hasta} disabled={trabajando}
                onChange={e => { setHasta(e.target.value); setPreview(null) }} className={inputCls} />
            </div>
          </div>
          {rangoMal && <span className="text-xs text-rojo font-semibold">El «desde» tiene que ser anterior al «hasta».</span>}
        </div>

        <div className="flex gap-2 flex-wrap">
          <div className="flex-1 min-w-[180px]">
            <label className={lblCls}>Proveedor · opcional</label>
            <select value={proveedorId} disabled={trabajando} className={inputCls}
              onChange={e => { setProveedorId(e.target.value === '' ? '' : Number(e.target.value)); setPreview(null) }}>
              <option value="">Todos</option>
              {(proveedores.data?.items ?? []).map(p => (
                <option key={p.id} value={p.id}>{p.razon_social}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[150px]">
            <label className={lblCls}>Forma de pago · opcional</label>
            <select value={forma} disabled={trabajando} className={inputCls}
              onChange={e => { setForma(e.target.value as PagosFormaPagoOPGuardada | ''); setPreview(null) }}>
              <option value="">Todas</option>
              {FORMAS_PAGO_OP.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </div>
        </div>

        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input type="checkbox" checked={incluirAnuladas} disabled={trabajando}
            onChange={e => { setIncluirAnuladas(e.target.checked); setPreview(null) }} />
          <span>
            Incluir órdenes anuladas
            <span className="text-gris-dark"> — una OP anulada no es plata que salió; si van, quedan marcadas en el índice.</span>
          </span>
        </label>

        {preview && (
          <div className="text-xs bg-gris/40 border border-gris-mid rounded px-3 py-2">
            {preview.ordenes === 0
              ? 'No hay pagos en ese período con esos filtros.'
              : <>Son <b>{preview.ordenes}</b> orden(es) de pago y <b>{preview.archivos}</b> archivo(s).
                  {preview.archivos === 0 && ' Ninguna tiene adjuntos: el ZIP saldría vacío.'}</>}
          </div>
        )}

        {avance !== null && avance.total > 0 && (
          <div>
            <div className="text-xs text-gris-dark mb-1 tabular-nums">
              Bajando {avance.hechos} de {avance.total} archivo(s)…
            </div>
            <div className="h-1.5 bg-gris rounded overflow-hidden">
              <div className="h-full bg-naranja transition-all"
                style={{ width: `${Math.round((avance.hechos / avance.total) * 100)}%` }} />
            </div>
          </div>
        )}

        <div className="flex gap-2 justify-end flex-wrap border-t border-gris pt-3">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={trabajando}>Cancelar</Button>
          <Button variant="secondary" size="sm" onClick={verCuanto} loading={mirando} disabled={rangoMal || avance !== null}>
            Ver cuánto es
          </Button>
          <Button variant="primary" size="sm" onClick={bajar} loading={avance !== null} disabled={rangoMal || mirando}>
            🗂 Bajar ZIP
          </Button>
        </div>
      </div>
    </Modal>
  )
}
