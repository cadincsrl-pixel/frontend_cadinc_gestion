'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Pagination } from '@/components/ui/Pagination'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import { useTabsPermitidos } from '@/hooks/useTabsPermitidos'
import {
  FACTURACION_KEYS, fetchFacturaVenta, useDeshacerRegistroVenta, useFacturasVenta, useRegistrarFinnegansVenta,
} from '../hooks/useFacturacion'
import {
  cortoTipo, fmtDoc, fmtFecha, fmtFechaHora, fmtM, muestraDescripcion, numeroParaCopiar, numeroTxt, obraDeFactura,
} from '../utils/facturacion.utils'
import { mensajeErrorFacturacion } from '../utils/facturacion.errores'
import type { VentasFactura } from '@/types/domain.types'
import { LibroIvaVentas } from './LibroIvaVentas'

/**
 * La bandeja de Finnegans: autorizadas que alguien tiene que cargar A MANO en
 * Finnegans (que se va a abandonar más adelante). Cada campo tiene su botón de
 * copiar, en el orden en que se tipean allá, y «Registrar» con el número de
 * Finnegans para que no se pase ninguna (mismo patrón que la OP de Pagos,
 * 20260923c).
 *
 * Los importes se copian como los tipea Finnegans: sin separador de miles y
 * con coma decimal ("4703,70"). El CUIT, solo dígitos.
 *
 * Tercera vista, «Libro IVA ventas»: los archivos del Libro IVA Digital (RG
 * 4597) del mes, para el contador (misma tab: es su trabajo).
 */

const PAGE_SIZE = 50

export function FinnegansTab() {
  const { puedeVer, registrarFinnegans } = usePermisos('facturacion')
  const tabs = useTabsPermitidos('facturacion')
  const puedeRegistrar = registrarFinnegans && (tabs.length === 0 || tabs.includes('finnegans'))
  const [vista, setVista] = useState<'pendiente' | 'registrada' | 'libro'>('pendiente')
  const [page, setPage] = useState(1)
  const [registrando, setRegistrando] = useState<VentasFactura | null>(null)

  const bandeja = vista === 'libro' ? 'pendiente' : vista
  const lista = useFacturasVenta({ finnegans: bandeja }, page, PAGE_SIZE, puedeVer && vista !== 'libro')
  const items = lista.data?.rows ?? []
  const total = lista.data?.total ?? 0

  if (!puedeVer) {
    return <div className="bg-white rounded-card shadow-card p-8 text-center text-sm text-gris-dark">No tenés permiso para ver esta bandeja.</div>
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 flex-wrap">
        {(['pendiente', 'registrada', 'libro'] as const).map(v => (
          <button key={v} type="button" onClick={() => { setVista(v); setPage(1) }}
            className={`text-xs px-3 py-1.5 rounded border font-semibold transition ${vista === v
              ? 'border-naranja bg-naranja-light text-naranja-dark' : 'border-gris-mid bg-white text-gris-dark hover:bg-gris/40'}`}>
            {v === 'pendiente' ? 'Pendientes de cargar' : v === 'registrada' ? 'Registradas' : 'Libro IVA ventas'}
          </button>
        ))}
        {!puedeRegistrar && vista !== 'libro' && (
          <span className="text-[11px] text-gris-dark">Para registrar hace falta el permiso «Registrar facturas en Finnegans».</span>
        )}
      </div>

      {vista === 'libro' ? (
        <LibroIvaVentas />
      ) : lista.isLoading && !lista.data ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-sm text-gris-dark">Cargando…</div>
      ) : lista.error ? (
        <div className="bg-rojo-light border border-rojo/30 rounded-card p-4 text-sm text-rojo flex items-center justify-between gap-2">
          <span>{mensajeErrorFacturacion(lista.error)}</span>
          <Button size="sm" variant="secondary" onClick={() => lista.refetch()}>Reintentar</Button>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-sm text-gris-dark italic">
          {vista === 'pendiente' ? '✓ No hay nada pendiente de cargar en Finnegans.' : 'Todavía no se registró ninguna.'}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map(f => (
            <FilaFinnegans key={f.id} f={f} vista={bandeja} puedeRegistrar={puedeRegistrar} onRegistrar={() => setRegistrando(f)} />
          ))}
          {total > PAGE_SIZE && <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />}
          <p className="text-[11px] text-gris-dark px-1">{total} comprobante{total === 1 ? '' : 's'}</p>
        </div>
      )}

      {registrando && <ModalRegistrar f={registrando} onClose={() => setRegistrando(null)} />}
    </div>
  )
}

function FilaFinnegans({ f, vista, puedeRegistrar, onRegistrar }: {
  f: VentasFactura; vista: 'pendiente' | 'registrada'; puedeRegistrar: boolean; onRegistrar: () => void
}) {
  const toast = useToast()
  const qc = useQueryClient()
  const deshacer = useDeshacerRegistroVenta()

  // La lista trae las descripciones (backend fase 5). Si viniera sin ellas
  // (backend viejo), se baja la ficha al copiar (queda cacheada).
  const descs = f.descripciones
  async function descripcion(): Promise<string> {
    if (descs && descs.length) return descs.join('\n')
    const fj = await qc.fetchQuery({
      queryKey: FACTURACION_KEYS.factura(f.id),
      queryFn: () => fetchFacturaVenta(f.id),
      staleTime: 60_000,
    })
    return fj.renglones.map(r => r.descripcion).join('\n')
  }

  const signo = f.es_nc ? '-' : ''
  return (
    <div className="bg-white rounded-card shadow-card p-3 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <div className="font-mono font-bold text-sm">{numeroTxt(f)}</div>
          <div className="text-sm font-semibold">{f.rec_razon_social}</div>
          {f.es_homologacion && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amarillo-light text-[#7A5000] font-bold">homologación</span>}
        </div>
        <div className="flex items-center gap-2">
          {vista === 'pendiente' ? (
            <Button size="sm" onClick={onRegistrar} disabled={!puedeRegistrar}
              title={puedeRegistrar ? 'Cargar el número con el que quedó en Finnegans' : 'Hace falta el permiso «Registrar facturas en Finnegans»'}>
              Registrar
            </Button>
          ) : (
            <>
              <span className="text-xs text-verde font-bold"
                title={f.registrada_por_nombre ? `Registró ${f.registrada_por_nombre}, ${fmtFechaHora(f.registrada_at)}` : undefined}>
                ✓ Finnegans <span className="font-mono">{f.numero_finnegans}</span>
              </span>
              <Button size="sm" variant="ghost" loading={deshacer.isPending} disabled={!puedeRegistrar}
                title={puedeRegistrar ? 'Deshacer el registro (vuelve a pendientes)' : 'Hace falta el permiso «Registrar facturas en Finnegans»'}
                onClick={async () => {
                  try { await deshacer.mutateAsync(f.id); toast('Registro deshecho: vuelve a pendientes', 'ok') }
                  catch (e) { toast(mensajeErrorFacturacion(e), 'err') }
                }}>
                Deshacer
              </Button>
            </>
          )}
        </div>
      </div>
      <div className="flex gap-1.5 flex-wrap">
        <Copiar label="Fecha" valor={fmtFecha(f.fecha_cbte)} />
        <Copiar label="Número" valor={f.numero_fmt ?? ''} />
        <Copiar label="Cliente" valor={f.rec_razon_social} />
        <Copiar label="Letra" valor={f.letra} />
        {f.es_fce && <Copiar label="Tipo" valor={f.cod_cbte} muestra={`${f.cod_cbte} · ${cortoTipo(f.cbte_tipo)}`} titulo={f.tipo_nombre} />}
        <Copiar label={f.rec_doc_tipo === 80 || f.rec_doc_tipo === 86 ? 'CUIT' : 'Documento'}
          valor={f.rec_doc_tipo === 99 ? '0' : f.rec_doc_nro} muestra={fmtDoc(f.rec_doc_tipo, f.rec_doc_nro)} />
        <Copiar label="Producto" valor={f.producto} />
        <Copiar label="Obra" valor={obraDeFactura(f) ?? ''}
          titulo="En Finnegans el centro de costo lo elige el contador a su criterio: esto es la obra (código y nombre)" />
        <Copiar label="Descripción" valor={descs && descs.length ? descs.join('\n') : descripcion}
          muestra={descs ? muestraDescripcion(descs, 32) : '(se baja al copiar)'} titulo={descs?.join('\n')} />
        <Copiar label="Neto" valor={signo + numeroParaCopiar(f.imp_neto)} muestra={fmtM(f.imp_neto)} />
        <Copiar label="IVA" valor={signo + numeroParaCopiar(f.imp_iva)} muestra={fmtM(f.imp_iva)} />
        <Copiar label="Total" valor={signo + numeroParaCopiar(f.imp_total)} muestra={fmtM(f.imp_total)} />
        <Copiar label="CAE" valor={f.cae ?? ''} />
        {f.cbte_tipo === 201 && f.fch_vto_pago && <Copiar label="Vto. pago" valor={fmtFecha(f.fch_vto_pago)} />}
        {f.cbte_tipo === 201 && f.fce_cbu && <Copiar label="CBU" valor={f.fce_cbu} titulo={[f.fce_banco, f.fce_alias].filter(Boolean).join(' · ')} />}
        {f.cbte_tipo === 201 && f.fce_referencia && <Copiar label="Ref. comercial" valor={f.fce_referencia} />}
      </div>
      <div className="text-[11px] text-gris-dark">
        {f.tipo_nombre} · {f.provincia_origen} → {f.provincia_destino} · {f.condicion_pago}
        {f.es_nc && f.asociada_numero_fmt && <> · corrige {cortoTipo(f.asociada_cbte_tipo)} {f.asociada_numero_fmt}</>}
      </div>
    </div>
  )
}

/**
 * Un botón por campo. Con `valor` como función async (la descripción) se usa
 * `ClipboardItem` con una promesa: Safari solo deja escribir el portapapeles
 * dentro del gesto del usuario, y un `await` antes de `writeText` lo rompe.
 */
function Copiar({ label, valor, muestra, titulo }: {
  label: string; valor: string | (() => Promise<string>); muestra?: string; titulo?: string
}) {
  const toast = useToast()
  const [ok, setOk] = useState(false)
  const vacio = typeof valor === 'string' && valor === ''

  async function copiar() {
    try {
      if (typeof valor === 'string') {
        await navigator.clipboard.writeText(valor)
      } else if (typeof ClipboardItem !== 'undefined' && navigator.clipboard.write) {
        const blob = valor().then(t => new Blob([t], { type: 'text/plain' }))
        await navigator.clipboard.write([new ClipboardItem({ 'text/plain': blob })])
      } else {
        await navigator.clipboard.writeText(await valor())
      }
      setOk(true)
      setTimeout(() => setOk(false), 1200)
    } catch {
      toast(`No se pudo copiar ${label.toLowerCase()}`, 'err')
    }
  }

  const texto = muestra ?? (typeof valor === 'string' ? valor : '')
  return (
    <button type="button" onClick={copiar} disabled={vacio}
      title={vacio ? `${label}: vacío` : titulo ? `Copiar ${label.toLowerCase()}:\n${titulo}` : `Copiar ${label.toLowerCase()}`}
      className={`text-left px-2 py-1 rounded border text-[11px] transition max-w-[260px] min-h-[36px]
        ${ok ? 'border-verde bg-verde-light' : 'border-gris-mid bg-white hover:bg-azul-light/40'} disabled:opacity-40`}>
      <span className="block text-[9px] font-bold uppercase tracking-wide text-gris-dark">{ok ? '✓ copiado' : `⧉ ${label}`}</span>
      <span className="block font-mono truncate">{texto || '—'}</span>
    </button>
  )
}

function ModalRegistrar({ f, onClose }: { f: VentasFactura; onClose: () => void }) {
  const toast = useToast()
  const registrar = useRegistrarFinnegansVenta()
  const [numero, setNumero] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function guardar() {
    const n = numero.trim()
    if (!n) { setError('Poné el número del comprobante en Finnegans.'); return }
    setError(null)
    try {
      await registrar.mutateAsync({ id: f.id, numero_finnegans: n })
      toast(`✓ ${numeroTxt(f)} registrada en Finnegans (N° ${n})`, 'ok')
      onClose()
    } catch (e) { setError(mensajeErrorFacturacion(e)) }
  }

  return (
    <Modal open onClose={onClose} width="max-w-md" title={`Registrar ${numeroTxt(f)} en Finnegans`}
      footer={
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={guardar} loading={registrar.isPending} disabled={!numero.trim()}>Registrar</Button>
        </div>
      }>
      <div className="flex flex-col gap-3 text-sm">
        <div className="bg-gris rounded p-2 text-xs">
          <b>{f.rec_razon_social}</b> · {fmtFecha(f.fecha_cbte)} · <b className="font-mono">{fmtM(f.imp_total)}</b>
          <div className="text-gris-dark mt-0.5">CAE {f.cae}</div>
        </div>
        <div>
          <label className="block text-[11px] font-bold text-gris-dark uppercase tracking-wider mb-1">Número en Finnegans</label>
          <input value={numero} autoFocus onChange={e => { setNumero(e.target.value); setError(null) }}
            onKeyDown={e => { if (e.key === 'Enter') void guardar() }}
            placeholder="Ej.: 00003-00000012" maxLength={40}
            className={`w-full px-3 py-2 border-[1.5px] rounded-lg font-mono text-sm outline-none focus:border-naranja ${error ? 'border-rojo' : 'border-gris-mid'}`} />
          {error && <div className="text-[11px] text-rojo mt-1">{error}</div>}
        </div>
      </div>
    </Modal>
  )
}
