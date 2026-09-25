'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { descartarAdjuntoCobroPendiente, leerChequesCobro, subirAdjuntoCobro } from '../../hooks/useCobranzas'
import { useClientesVenta } from '../../hooks/useClientesFacturacion'
import { fmtFecha, fmtM } from '../../utils/facturacion.utils'
import { mensajeErrorFacturacion } from '../../utils/facturacion.errores'
import type { VentasCobroAdjuntoInput, VentasCobroDetalle } from '@/types/domain.types'
import { ClienteCombobox } from './Comun'
import { ModalCobro, type PrecargaCobro } from './ModalCobro'

/**
 * «Soltá acá los cheques» de Ventas › Cobranzas (2026-09-25): el espejo del
 * de Compras › Pagos. El dueño suelta las fotos o PDFs de los cheques que le
 * dio un cliente y el cobro se arma solo.
 *
 * 1. Cada archivo se sube a `cobros/pendientes/` y se lee con IA
 *    (`POST /cobros/cheques/leer`); un archivo puede traer varios cheques.
 * 2. El cliente se reconoce por el CUIT o el nombre del librador. Un cheque
 *    endosado de un tercero no se reconoce: se elige en la fila.
 * 3. «Armar cobro» abre «Registrar cobro» de ESE cliente con un medio por
 *    cheque, los archivos como «Comprobante de pago» y la aplicación
 *    repartida en sus comprobantes, el más viejo primero. Nada se registra
 *    hasta confirmar ahí. Con varios clientes, un cobro por cliente.
 *
 * Un cheque que ya está en otro cobro vigente queda afuera.
 */

const MIME_LEIBLES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
const MAX_BYTES = 10 * 1024 * 1024

interface Item {
  key:        number
  archivo:    string
  estado:     'leyendo' | 'listo' | 'error'
  error?:     string
  adj?:       VentasCobroAdjuntoInput
  numero:     string
  banco:      string
  fecha:      string
  importe:    number
  librador:   string
  esEcheq:    boolean
  avisos:     { severidad?: string; mensaje?: string }[]
  clienteId:  number | null
  por:        'cuit' | 'nombre' | null
  /** Ya es un medio de un cobro vigente: no entra. */
  yaCobrado:  boolean
}

let claveItem = 0

export function ModalChequesCobro({ archivos, onClose, onGuardado }: {
  archivos:   File[]
  onClose:    () => void
  onGuardado: (d: VentasCobroDetalle) => void
}) {
  const toast = useToast()
  const [items, setItems] = useState<Item[]>([])
  const [armando, setArmando] = useState<{ clienteId: number; precarga: PrecargaCobro } | null>(null)
  // Archivos que ya son de un cobro registrado: no se descartan ni se vuelven a adjuntar.
  const usados = useRef(new Set<string>())
  const clientes = useClientesVenta('', false)
  const nombreCliente = useMemo(() => new Map((clientes.data ?? []).map(c => [c.id, c.razon_social])), [clientes.data])

  // ── Leer: de a 3 archivos a la vez ──
  const arrancado = useRef(false)
  useEffect(() => {
    if (arrancado.current) return
    arrancado.current = true
    const cola = archivos.map(file => ({ file, key: ++claveItem }))
    setItems(cola.map(({ file, key }) => ({
      key, archivo: file.name, estado: 'leyendo', numero: '', banco: '', fecha: '', importe: 0, librador: '',
      esEcheq: false, avisos: [], clienteId: null, por: null, yaCobrado: false,
    })))
    const trabajar = async () => {
      for (let t = cola.shift(); t; t = cola.shift()) await leerArchivo(t.key, t.file)
    }
    for (let k = 0; k < Math.min(3, cola.length); k++) void trabajar()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- se lee una sola vez, al abrir
  }, [])

  async function leerArchivo(key: number, file: File) {
    const falla = (error: string, adj?: VentasCobroAdjuntoInput) =>
      setItems(its => its.map(i => i.key === key ? { ...i, estado: 'error', error, adj } : i))
    if (file.size > MAX_BYTES) return falla('Supera los 10 MB.')
    if (!MIME_LEIBLES.includes(file.type)) return falla('Solo PDF o foto JPG, PNG o WEBP (una foto HEIC del iPhone, pasala a JPG).')
    let adj: VentasCobroAdjuntoInput
    try {
      adj = await subirAdjuntoCobro(file, 'comprobante_pago')
    } catch (e) {
      return falla(e instanceof Error && !('body' in e) ? e.message : mensajeErrorFacturacion(e))
    }
    try {
      const r = await leerChequesCobro({ storage_path: adj.storage_path, nombre_archivo: file.name, mime: file.type })
      const nuevos: Item[] = r.cheques.map((c, k) => ({
        key: k === 0 ? key : ++claveItem,
        archivo: file.name,
        estado: 'listo',
        adj,
        numero: c.propuesta.numero ?? '',
        banco: c.propuesta.banco ?? '',
        fecha: c.propuesta.fecha_cobro ?? '',
        importe: Number(c.propuesta.importe ?? 0),
        librador: c.propuesta.librador ?? '',
        esEcheq: !!c.propuesta.es_echeq,
        avisos: c.avisos.map(a => ({ severidad: a.severidad, mensaje: a.mensaje })),
        clienteId: c.cliente?.id ?? null,
        por: c.cliente?.por ?? null,
        yaCobrado: c.cobro_existente_id != null,
      }))
      setItems(its => its.flatMap(i => i.key === key ? nuevos : [i]))
    } catch (e) {
      // El archivo quedó subido: se descarta al cerrar.
      falla(mensajeErrorFacturacion(e), adj)
    }
  }

  const leyendo = items.some(i => i.estado === 'leyendo')
  const usables = items.filter(i => i.estado === 'listo' && !i.yaCobrado)

  // ── Por cliente ──
  const grupos = useMemo(() => {
    const m = new Map<number, Item[]>()
    for (const i of usables) if (i.clienteId) m.set(i.clienteId, [...(m.get(i.clienteId) ?? []), i])
    return [...m.entries()].map(([id, its]) => ({
      id, nombre: nombreCliente.get(id) ?? `Cliente #${id}`, items: its, total: its.reduce((s, i) => s + i.importe, 0),
    })).sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [usables, nombreCliente])
  const sinCliente = usables.filter(i => !i.clienteId)

  function setCliente(key: number, v: string) {
    setItems(its => its.map(i => i.key === key ? { ...i, clienteId: v ? Number(v) : null, por: null } : i))
  }

  function quitar(key: number) {
    const it = items.find(i => i.key === key)
    const path = it?.adj?.storage_path
    if (path && !usados.current.has(path) && !items.some(o => o.key !== key && o.adj?.storage_path === path)) {
      void descartarAdjuntoCobroPendiente(path)
    }
    setItems(its => its.filter(i => i.key !== key))
  }

  /** Cerrar: lo subido que no quedó en un cobro se borra. */
  function cerrar() {
    for (const p of new Set(items.flatMap(i => i.adj ? [i.adj.storage_path] : []))) {
      if (!usados.current.has(p)) void descartarAdjuntoCobroPendiente(p)
    }
    onClose()
  }

  function armar(g: (typeof grupos)[number]) {
    const vistos = new Set<string>()
    const adjuntos = g.items.flatMap(i => {
      const p = i.adj?.storage_path
      if (!i.adj || !p || vistos.has(p) || usados.current.has(p)) return []
      vistos.add(p)
      return [i.adj]
    })
    setArmando({
      clienteId: g.id,
      precarga: {
        clienteId: g.id,
        medios: g.items.map(i => ({
          forma: i.esEcheq ? 'echeq' as const : 'cheque' as const,
          importe: i.importe > 0 ? String(i.importe) : '',
          cheque_numero: i.numero, cheque_banco: i.banco, cheque_librador: i.librador, cheque_fecha_cobro: i.fecha,
        })),
        adjuntos,
        obs: g.items.length === 1 ? `Cheque N° ${g.items[0]!.numero}` : `Cheques N° ${g.items.map(i => i.numero).join(', ')}`,
      },
    })
  }

  function guardado(d: VentasCobroDetalle) {
    const g = grupos.find(x => x.id === armando?.clienteId)
    const keys = new Set(g?.items.map(i => i.key) ?? [])
    for (const a of armando?.precarga.adjuntos ?? []) usados.current.add(a.storage_path)
    setArmando(null)
    const quedan = items.filter(i => !keys.has(i.key) && i.estado === 'listo' && !i.yaCobrado)
    setItems(its => its.filter(i => !keys.has(i.key)))
    if (quedan.length === 0) {
      // Lo que queda (errores, ya cobrados) se descarta.
      for (const p of new Set(items.filter(i => !keys.has(i.key)).flatMap(i => i.adj ? [i.adj.storage_path] : []))) {
        if (!usados.current.has(p)) void descartarAdjuntoCobroPendiente(p)
      }
      onGuardado(d)
      return
    }
    toast(`✓ Cobro ${d.cobro?.numero_fmt ?? ''} registrado. Quedan cheques de otro cliente.`, 'ok')
  }

  if (armando) {
    return <ModalCobro precarga={armando.precarga} onClose={() => setArmando(null)} onGuardado={guardado} />
  }

  const totalLeido = usables.reduce((s, i) => s + i.importe, 0)

  return (
    <Modal open onClose={cerrar} width="max-w-5xl"
      title={`Cheques recibidos · ${archivos.length} archivo${archivos.length === 1 ? '' : 's'}`}
      footer={
        <div className="flex gap-2 justify-end items-center flex-wrap w-full">
          <div className="text-xs text-gris-dark mr-auto">
            {usables.length} cheque{usables.length === 1 ? '' : 's'} · <b className="font-mono tabular-nums text-carbon">{fmtM(totalLeido)}</b>
            {leyendo && <span className="text-azul animate-pulse"> · leyendo…</span>}
          </div>
          <Button variant="ghost" size="sm" onClick={cerrar}>Cerrar</Button>
        </div>
      }>
      <div className="flex flex-col gap-3 text-sm">
        <div className="text-[11px] text-gris-dark bg-gris/40 border border-gris-mid rounded px-2.5 py-1.5">
          Revisá <b>de qué cliente es cada cheque</b> (se reconoce por el CUIT o el nombre del librador; un cheque
          endosado de un tercero hay que elegirlo) y tocá «Armar cobro»: se abre «Registrar cobro» con los cheques
          cargados y lo que suman repartido entre sus comprobantes. <b>Nada se registra hasta confirmar ahí.</b>
        </div>

        <div className="border border-gris-mid rounded overflow-x-auto">
          <table className="w-full border-collapse min-w-[860px]">
            <thead>
              <tr>
                {['Archivo', 'Número', 'Banco', 'Se cobra', 'Importe', 'Librador', 'Cliente', ''].map((h, k) => (
                  <th key={k} className={`bg-gris text-gris-dark text-[10px] font-bold px-2 py-1.5 uppercase tracking-wide whitespace-nowrap ${k === 4 ? 'text-right' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan={8} className="px-2 py-4 text-center text-xs text-gris-dark italic">Sin archivos.</td></tr>
              )}
              {items.map(i => (
                <tr key={i.key} className={`border-t border-gris align-top ${i.yaCobrado ? 'opacity-60' : ''}`}>
                  <td className="px-2 py-1.5 text-[11px] max-w-[160px]">
                    <span className="block truncate" title={i.archivo}>📄 {i.archivo}</span>
                    {i.esEcheq && <span className="text-[10px] text-gris-dark">e-cheq</span>}
                  </td>
                  {i.estado === 'leyendo' ? (
                    <td colSpan={6} className="px-2 py-1.5 text-[11px] text-azul animate-pulse">Leyendo…</td>
                  ) : i.estado === 'error' ? (
                    <td colSpan={6} className="px-2 py-1.5 text-[11px] text-rojo">{i.error}</td>
                  ) : (
                    <>
                      <td className="px-2 py-1.5 font-mono text-xs">{i.numero || '—'}</td>
                      <td className="px-2 py-1.5 text-xs max-w-[120px] truncate" title={i.banco}>{i.banco || '—'}</td>
                      <td className="px-2 py-1.5 text-xs whitespace-nowrap">{i.fecha ? fmtFecha(i.fecha) : '—'}</td>
                      <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums">{i.importe > 0 ? fmtM(i.importe) : '—'}</td>
                      <td className="px-2 py-1.5 text-[11px] text-gris-dark max-w-[170px]">
                        {i.librador || '—'}
                        {i.avisos.map((a, k) => (
                          <span key={k} className={`block ${a.severidad === 'error' ? 'text-rojo font-semibold' : a.severidad === 'advertencia' ? 'text-[#7A5000]' : 'text-azul'}`}>
                            {a.severidad === 'info' ? 'ℹ' : '⚠'} {a.mensaje}
                          </span>
                        ))}
                      </td>
                      <td className="px-2 py-1.5 w-[240px]">
                        {i.yaCobrado ? (
                          <span className="text-[11px] text-rojo">Ya está en otro cobro: queda afuera.</span>
                        ) : (
                          <>
                            <ClienteCombobox label="" value={i.clienteId ? String(i.clienteId) : ''} onChange={v => setCliente(i.key, v)} />
                            {i.por && <span className="text-[10px] text-verde">✓ reconocido por {i.por === 'cuit' ? 'CUIT' : 'nombre'}</span>}
                          </>
                        )}
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

        {!leyendo && (grupos.length > 0 || sinCliente.length > 0) && (
          <div className="flex flex-col gap-1.5">
            {grupos.map(g => (
              <div key={g.id} className="border border-verde/40 bg-verde-light/40 rounded px-2.5 py-1.5 text-xs flex flex-wrap gap-x-3 gap-y-1 items-center">
                <b>{g.nombre}</b>
                <span>{g.items.length} cheque{g.items.length === 1 ? '' : 's'} · <b className="font-mono tabular-nums">{fmtM(g.total)}</b></span>
                <Button size="sm" className="ml-auto" onClick={() => armar(g)}>Armar cobro →</Button>
              </div>
            ))}
            {sinCliente.length > 0 && (
              <div className="border border-amarillo/60 bg-amarillo-light rounded px-2.5 py-1.5 text-xs text-[#7A5000]">
                ⚠ {sinCliente.length} cheque{sinCliente.length === 1 ? '' : 's'} sin cliente: elegí de quién es cada uno para armar su cobro.
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
