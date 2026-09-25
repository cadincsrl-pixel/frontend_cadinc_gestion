'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Combobox } from '@/components/ui/Combobox'
import { useFacturas, subirComprobantePendiente, borrarComprobantePendiente, leerCheque } from '../hooks/usePagos'
import { useProveedoresPagos } from '../hooks/useProveedoresPagos'
import { MAX_ADJUNTO_BYTES, fmtFecha, fmtM, topePagable } from '../utils/pagos.utils'
import { mensajeErrorPagos } from '../utils/pagos.errores'
import { chequeVacio, n, type ChequeFila } from '../utils/pagoForm'
import { filaDesdeLectura } from './pago/EditorCheques'
import { ModalPagarLote, MAX_ORDENES_LOTE, type ChequesDelProveedor } from './ModalPagarLote'
import type { PagosFactura } from '@/types/domain.types'

/**
 * «Soltá los cheques» de Compras › Pagos (2026-09-25). El dueño endosa o
 * emite varios cheques y quería soltarlos todos juntos, sin abrir factura por
 * factura: «es uno por cheque a veces y son muchos cheques».
 *
 * 1. Cada archivo se sube como comprobante pendiente y se lee con IA; un
 *    archivo puede traer varios cheques (el PDF del Galicia con la emisión y
 *    los endosos) y cada uno es una fila.
 * 2. El backend dice a quién se entrega cada cheque (el beneficiario o el
 *    endosatario) y lo busca en el padrón por CUIT o nombre. Acá se revisa y
 *    se corrige.
 * 3. «Armar el pago» abre «Pagar en lote» con un bloque por proveedor: sus
 *    cheques cargados y lo que suman repartido entre sus facturas aprobadas
 *    (la que vence primero, primero; lo que sobra, a cuenta). Nada se
 *    registra hasta confirmar ahí.
 *
 * Un proveedor sin facturas aprobadas con saldo no puede entrar al lote: se
 * avisa y sus cheques quedan afuera.
 */

interface Item {
  /** Clave estable de la fila en esta pantalla. */
  key:         number
  archivo:     string
  estado:      'leyendo' | 'listo' | 'error'
  error?:      string
  fila:        ChequeFila
  esEcheq:     boolean
  entregadoA:  string | null
  proveedorId: number | null
  /** Cómo se reconoció el proveedor; null = lo eligió la persona o no se sabe. */
  por:         'cuit' | 'nombre' | null
}

let claveItem = 0

export function ModalChequesSueltos({ archivos, onClose }: { archivos: File[]; onClose: () => void }) {
  const [items, setItems] = useState<Item[]>([])
  const [armado, setArmado] = useState<{ facturaIds: number[]; desdeCheques: Record<number, ChequesDelProveedor> } | null>(null)
  const urls = useRef(new Set<string>())

  const proveedores = useProveedoresPagos({}, 1, 300)
  const opciones = useMemo(() => (proveedores.data?.items ?? []).map(p => ({
    value: String(p.id), label: p.razon_social,
    sub: [p.codigo, p.cuit].filter(Boolean).join(' · ') || undefined,
    search: [p.razon_social, p.cuit ?? '', p.codigo ?? ''],
  })), [proveedores.data])
  const nombreProv = useMemo(() => new Map((proveedores.data?.items ?? []).map(p => [p.id, p.razon_social])), [proveedores.data])

  // Las mismas facturas que ofrece «Pagar en lote».
  const { data: pagina } = useFacturas({ estados: ['aprobada', 'pagada_parcial'], archivadas: true, clase: 'factura' }, 1, 200)
  const pagables = useMemo(() => {
    const m = new Map<number, PagosFactura[]>()
    for (const f of pagina?.items ?? []) {
      if (topePagable(f) <= 0.005) continue
      m.set(f.proveedor_id, [...(m.get(f.proveedor_id) ?? []), f])
    }
    return m
  }, [pagina])

  // ── Leer: de a 3 archivos a la vez ──
  const arrancado = useRef(false)
  useEffect(() => {
    if (arrancado.current) return
    arrancado.current = true
    const cola = archivos.map(file => ({ file, key: ++claveItem }))
    setItems(cola.map(({ file, key }) => ({
      key, archivo: file.name, estado: 'leyendo', fila: chequeVacio('', ''), esEcheq: false,
      entregadoA: null, proveedorId: null, por: null,
    })))
    const trabajar = async () => {
      for (let t = cola.shift(); t; t = cola.shift()) await leerArchivo(t.key, t.file)
    }
    const trabajadores = Math.min(3, cola.length)
    for (let k = 0; k < trabajadores; k++) void trabajar()
    const u = urls.current
    return () => { for (const x of u) URL.revokeObjectURL(x) }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- se lee una sola vez, al abrir
  }, [])

  async function leerArchivo(key: number, file: File) {
    const falla = (error: string, fila?: Partial<ChequeFila>) =>
      setItems(its => its.map(i => i.key === key ? { ...i, estado: 'error', error, fila: { ...i.fila, ...fila } } : i))
    if (file.size > MAX_ADJUNTO_BYTES) return falla('Supera los 10 MB.')
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') return falla('No es foto ni PDF.')
    const url = file.type.startsWith('image/') ? URL.createObjectURL(file) : null
    if (url) urls.current.add(url)
    let adj
    try {
      adj = await subirComprobantePendiente(file, 'cheque')
    } catch (e) {
      return falla(mensajeErrorPagos(e))
    }
    try {
      const r = await leerCheque(adj)
      const foto = r.storage_path ? { ...adj, storage_path: r.storage_path } : adj
      const lecturas = r.cheques?.length ? r.cheques : [{ propuesta: r.propuesta, avisos: r.avisos, proveedor: null }]
      const nuevos: Item[] = lecturas.map((l, k) => {
        const forma = l.propuesta.es_echeq ? 'echeq' : 'cheque'
        const base = { ...chequeVacio('', ''), es_propio: l.propuesta.es_propio !== false }
        return {
          key: k === 0 ? key : ++claveItem,
          archivo: file.name,
          estado: 'listo',
          fila: { ...filaDesdeLectura(base, l, forma), foto, fotoUrl: url },
          esEcheq: !!l.propuesta.es_echeq,
          entregadoA: l.propuesta.entregado_a ?? null,
          proveedorId: l.proveedor?.id ?? null,
          por: l.proveedor?.por ?? null,
        }
      })
      setItems(its => its.flatMap(i => i.key === key ? nuevos : [i]))
    } catch (e) {
      // La foto quedó subida: se puede asignar igual y tipear los datos en el lote.
      falla(`${mensajeErrorPagos(e)} El archivo queda como comprobante: los datos se cargan a mano.`, { foto: adj, fotoUrl: url })
    }
  }

  const leyendo = items.some(i => i.estado === 'leyendo')
  const usables = items.filter(i => i.estado !== 'leyendo' && i.fila.foto)

  // ── Por proveedor ──
  const grupos = useMemo(() => {
    const m = new Map<number, Item[]>()
    for (const i of usables) if (i.proveedorId) m.set(i.proveedorId, [...(m.get(i.proveedorId) ?? []), i])
    return [...m.entries()].map(([id, its]) => {
      const total = its.reduce((s, i) => s + n(i.fila.monto), 0)
      const facturas = pagables.get(id) ?? []
      const saldo = facturas.reduce((s, f) => s + topePagable(f), 0)
      return { id, nombre: nombreProv.get(id) ?? `Proveedor ${id}`, items: its, total, facturas, saldo }
    }).sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [usables, pagables, nombreProv])
  const sinProveedor = usables.filter(i => !i.proveedorId)
  const armables = grupos.filter(g => g.facturas.length > 0)

  const motivo =
    leyendo ? 'Esperá a que terminen de leerse'
    : armables.length === 0 ? (grupos.length === 0 ? 'Ningún cheque tiene proveedor: elegilo en cada fila' : 'Ningún proveedor tiene facturas aprobadas para pagar')
    : armables.length > MAX_ORDENES_LOTE ? `Como máximo ${MAX_ORDENES_LOTE} proveedores por lote`
    : undefined

  function setProveedor(key: number, v: string) {
    setItems(its => its.map(i => i.key === key ? { ...i, proveedorId: v ? Number(v) : null, por: null } : i))
  }

  function quitar(key: number) {
    const it = items.find(i => i.key === key)
    const path = it?.fila.foto?.storage_path
    if (path && !items.some(o => o.key !== key && o.fila.foto?.storage_path === path)) borrarComprobantePendiente(path).catch(() => {})
    setItems(its => its.filter(i => i.key !== key))
  }

  /** Cerrar sin armar: lo subido se borra. */
  function cerrar() {
    for (const p of new Set(items.flatMap(i => i.fila.foto ? [i.fila.foto.storage_path] : []))) borrarComprobantePendiente(p).catch(() => {})
    onClose()
  }

  function armar() {
    if (motivo) return
    const desdeCheques: Record<number, ChequesDelProveedor> = {}
    for (const g of armables) {
      desdeCheques[g.id] = {
        cheques: g.items.map(i => i.fila),
        forma: g.items.every(i => i.esEcheq) ? 'echeq' : 'cheque',
      }
    }
    // Lo que no viaja al lote (sin proveedor o sin facturas) se borra, salvo
    // que el mismo archivo lo use un cheque que sí viaja.
    const viajan = new Set(armables.flatMap(g => g.items.flatMap(i => i.fila.foto ? [i.fila.foto.storage_path] : [])))
    for (const i of items) {
      const p = i.fila.foto?.storage_path
      if (p && !viajan.has(p)) { borrarComprobantePendiente(p).catch(() => {}); viajan.add(p) }
    }
    setArmado({ facturaIds: armables.flatMap(g => g.facturas.map(f => f.id)), desdeCheques })
  }

  if (armado) {
    return <ModalPagarLote facturaIds={armado.facturaIds} desdeCheques={armado.desdeCheques} onClose={onClose} />
  }

  const totalLeido = usables.reduce((s, i) => s + n(i.fila.monto), 0)

  return (
    <Modal open onClose={cerrar} width="max-w-5xl"
      title={`Cheques para pagar · ${archivos.length} archivo${archivos.length === 1 ? '' : 's'}`}
      footer={
        <div className="flex gap-2 justify-end items-center flex-wrap">
          <div className="text-xs text-gris-dark mr-auto">
            {usables.length} cheque{usables.length === 1 ? '' : 's'} · <b className="font-mono tabular-nums text-carbon">{fmtM(totalLeido)}</b>
            {leyendo && <span className="text-azul animate-pulse"> · leyendo…</span>}
          </div>
          <Button variant="ghost" size="sm" onClick={cerrar}>Cancelar</Button>
          <Button size="sm" onClick={armar} disabled={!!motivo} title={motivo}>
            Armar el pago{armables.length > 0 ? ` (${armables.length} proveedor${armables.length === 1 ? '' : 'es'})` : ''} →
          </Button>
        </div>
      }>
      <div className="flex flex-col gap-3 text-sm">
        <div className="text-[11px] text-gris-dark bg-gris/40 border border-gris-mid rounded px-2.5 py-1.5">
          Revisá a <b>qué proveedor va cada cheque</b> (se reconoce por el «a la orden de» o el endosatario) y
          tocá «Armar el pago»: se abre «Pagar en lote» con los cheques cargados y lo que suman repartido entre las
          facturas aprobadas de cada uno. <b>Nada se registra hasta confirmar ahí.</b>
        </div>

        {/* Los cheques */}
        <div className="border border-gris-mid rounded overflow-x-auto">
          <table className="w-full border-collapse min-w-[820px]">
            <thead>
              <tr>
                {['Archivo', 'Número', 'Se cobra', 'Importe', 'Se entrega a', 'Proveedor', ''].map((h, k) => (
                  <th key={k} className={`bg-gris text-gris-dark text-[10px] font-bold px-2 py-1.5 uppercase tracking-wide whitespace-nowrap ${k === 3 ? 'text-right' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map(i => (
                <tr key={i.key} className="border-t border-gris align-top">
                  <td className="px-2 py-1.5 text-[11px] max-w-[170px]">
                    <span className="block truncate" title={i.archivo}>{i.fila.fotoUrl ? '🖼' : '📄'} {i.archivo}</span>
                    {i.esEcheq && <span className="text-[10px] text-gris-dark">e-cheq</span>}
                    {!i.fila.es_propio && <span className="text-[10px] text-gris-dark"> · de tercero</span>}
                  </td>
                  {i.estado === 'leyendo' ? (
                    <td colSpan={5} className="px-2 py-1.5 text-[11px] text-azul animate-pulse">Leyendo…</td>
                  ) : (
                    <>
                      <td className="px-2 py-1.5 font-mono text-xs">{i.fila.numero || '—'}</td>
                      <td className="px-2 py-1.5 text-xs whitespace-nowrap">{i.fila.fecha_cobro ? fmtFecha(i.fila.fecha_cobro) : '—'}</td>
                      <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums">{n(i.fila.monto) > 0 ? fmtM(n(i.fila.monto)) : '—'}</td>
                      <td className="px-2 py-1.5 text-[11px] text-gris-dark max-w-[160px]">
                        {i.entregadoA ?? '—'}
                        {i.error && <span className="block text-rojo">{i.error}</span>}
                        {i.fila.avisosFoto.filter(a => /ya figura entregado/i.test(a)).map((a, k) => (
                          <span key={k} className="block text-rojo font-semibold">⚠ {a}</span>
                        ))}
                      </td>
                      <td className="px-2 py-1.5 w-[230px]">
                        <Combobox options={opciones} value={i.proveedorId ? String(i.proveedorId) : ''}
                          onChange={v => setProveedor(i.key, v)} placeholder="¿A quién va?" />
                        {i.por && <span className="text-[10px] text-verde">✓ reconocido por {i.por === 'cuit' ? 'CUIT' : 'nombre'}</span>}
                      </td>
                    </>
                  )}
                  <td className="px-2 py-1.5">
                    <button type="button" onClick={() => quitar(i.key)} disabled={i.estado === 'leyendo'}
                      className="text-xs text-rojo hover:underline disabled:opacity-40">Quitar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Qué va a armar */}
        {(grupos.length > 0 || sinProveedor.length > 0) && !leyendo && (
          <div className="flex flex-col gap-1.5">
            {grupos.map(g => (
              <div key={g.id} className={`border rounded px-2.5 py-1.5 text-xs flex flex-wrap gap-x-3 gap-y-0.5 items-center
                ${g.facturas.length > 0 ? 'border-verde/40 bg-verde-light/40' : 'border-amarillo/60 bg-amarillo-light'}`}>
                <b>{g.nombre}</b>
                <span>{g.items.length} cheque{g.items.length === 1 ? '' : 's'} · <b className="font-mono tabular-nums">{fmtM(g.total)}</b></span>
                {g.facturas.length > 0 ? (
                  <span className="text-gris-dark">
                    {g.facturas.length} factura{g.facturas.length === 1 ? '' : 's'} aprobada{g.facturas.length === 1 ? '' : 's'} por {fmtM(g.saldo)}
                    {g.total > g.saldo + 0.005 && <> · sobran <b>{fmtM(g.total - g.saldo)}</b>, van a cuenta</>}
                    {g.total < g.saldo - 0.005 && <> · quedan <b>{fmtM(g.saldo - g.total)}</b> por pagar</>}
                  </span>
                ) : (
                  <span className="text-[#7A5000]">⚠ No tiene facturas aprobadas con saldo: sus cheques no entran al lote. Aprobá o cargá la factura y volvé a soltarlos.</span>
                )}
              </div>
            ))}
            {sinProveedor.length > 0 && (
              <div className="border border-amarillo/60 bg-amarillo-light rounded px-2.5 py-1.5 text-xs text-[#7A5000]">
                ⚠ {sinProveedor.length} cheque{sinProveedor.length === 1 ? '' : 's'} sin proveedor: elegí a quién va cada uno, o quedan afuera.
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
