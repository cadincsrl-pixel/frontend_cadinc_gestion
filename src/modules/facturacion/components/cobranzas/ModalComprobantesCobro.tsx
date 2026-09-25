'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { descartarAdjuntoCobroPendiente, leerComprobanteCobro, subirAdjuntoCobro } from '../../hooks/useCobranzas'
import { useClientesVenta } from '../../hooks/useClientesFacturacion'
import { fmtFecha, fmtM } from '../../utils/facturacion.utils'
import { mensajeErrorFacturacion } from '../../utils/facturacion.errores'
import type { VentasCobroAdjuntoInput, VentasCobroDetalle, VentasComprobanteCobroLectura } from '@/types/domain.types'
import { ClienteCombobox } from './Comun'
import { ModalCobro, type AplicarPrecarga, type MedioPrecarga, type PrecargaCobro, type RetencionPrecarga } from './ModalCobro'

/**
 * «Soltá acá los comprobantes del cobro» en Ventas › Cobranzas (2026-09-25).
 * Todo lo que manda un cliente cuando paga: foto de un cheque, comprobante
 * de un e-cheq, de una transferencia o un depósito, o su orden de pago.
 *
 * 1. Cada archivo se sube a `cobros/pendientes/` y se lee con IA
 *    (`POST /cobros/comprobantes/leer`): qué es, quién paga, los medios, las
 *    retenciones y las facturas que dice pagar.
 * 2. El cliente se reconoce por el CUIT o el nombre del pagador; se puede
 *    cambiar por archivo.
 * 3. «Armar cobro» junta TODOS los papeles del cliente en un solo «Registrar
 *    cobro»: los medios (un cheque que aparece en la orden de pago y en su
 *    foto va una sola vez), las retenciones, la aplicación a las facturas que
 *    nombra la orden de pago (o a las más viejas) y los archivos. Nada se
 *    registra hasta confirmar ahí. Un cheque que ya está en otro cobro queda
 *    afuera.
 */

const MIME_LEIBLES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
const MAX_BYTES = 10 * 1024 * 1024

const TIPO_DOC: Record<VentasComprobanteCobroLectura['tipo_documento'], string> = {
  cheque: 'Cheque', echeq: 'E-cheq', transferencia: 'Transferencia', deposito: 'Depósito', orden_pago: 'Orden de pago', otro: 'Otro',
}
const FORMA: Record<string, string> = { cheque: 'cheque', echeq: 'e-cheq', transferencia: 'transferencia', efectivo: 'efectivo' }
const RET: Record<string, string> = { iibb: 'IIBB', ganancias: 'Ganancias', suss: 'SUSS', iva: 'IVA', tem: 'TEM', otra: 'Otra' }

interface Item {
  key:       number
  archivo:   string
  estado:    'leyendo' | 'listo' | 'error'
  error?:    string
  adj?:      VentasCobroAdjuntoInput
  doc?:      VentasComprobanteCobroLectura
  clienteId: number | null
  por:       'cuit' | 'nombre' | null
}

let claveItem = 0

const r2 = (n: number) => Math.round(n * 100) / 100

/** Lo que suma un papel: medios que entran + retenciones. */
function totalDoc(d: VentasComprobanteCobroLectura): number {
  return r2(d.medios.filter(m => m.cobro_existente_id == null).reduce((s, m) => s + (m.importe ?? 0), 0)
    + d.retenciones.reduce((s, r) => s + r.importe, 0))
}

/**
 * Junta los papeles de un cliente en la precarga de UN cobro. Un cheque que
 * aparece en dos papeles (la orden de pago y su foto) va una vez: mismo
 * número e importe. Una transferencia, mismo importe y fecha. Pura.
 */
export function precargaDeDocumentos(clienteId: number, items: { doc: VentasComprobanteCobroLectura; adj: VentasCobroAdjuntoInput }[]): PrecargaCobro {
  const medios: MedioPrecarga[] = []
  const vistos = new Set<string>()
  const retenciones: RetencionPrecarga[] = []
  const vistasRet = new Set<string>()
  const aplicar = new Map<string, AplicarPrecarga>()
  // La orden de pago manda sobre lo demás: se recorre primero.
  const orden = [...items].sort((a, b) => Number(b.doc.tipo_documento === 'orden_pago') - Number(a.doc.tipo_documento === 'orden_pago'))
  for (const { doc } of orden) {
    for (const m of doc.medios) {
      if (m.cobro_existente_id != null) continue
      const esCheque = m.forma === 'cheque' || m.forma === 'echeq'
      const clave = esCheque
        ? `ch|${(m.numero ?? '').replace(/^0+/, '')}|${m.importe ?? ''}`
        : `${m.forma}|${m.importe ?? ''}|${m.fecha_cobro ?? doc.fecha ?? ''}`
      if (vistos.has(clave)) continue
      vistos.add(clave)
      const importe = m.importe != null ? String(m.importe) : ''
      if (esCheque) {
        medios.push({
          forma: m.forma as 'cheque' | 'echeq', importe,
          cheque_numero: m.numero ?? '', cheque_banco: m.banco ?? '', cheque_fecha_cobro: m.fecha_cobro ?? '',
          cheque_librador: m.librador ?? doc.pagador_nombre ?? '',
        })
      } else if (m.forma === 'transferencia') {
        medios.push({
          forma: 'transferencia', importe, cuenta_bancaria_id: m.cuenta_bancaria_id ? String(m.cuenta_bancaria_id) : '',
          obs: [m.numero ? `Op. ${m.numero}` : null, m.banco ? `desde ${m.banco}` : null].filter(Boolean).join(' · '),
        })
      } else {
        medios.push({ forma: 'efectivo', importe })
      }
    }
    for (const r of doc.retenciones) {
      const clave = `${r.tipo}|${r.importe}|${r.certificado_numero ?? ''}`
      if (vistasRet.has(clave)) continue
      vistasRet.add(clave)
      retenciones.push({
        tipo: r.tipo, importe: String(r.importe), jurisdiccion: r.jurisdiccion ?? '', jurisdiccion_id: null,
        certificado_numero: r.certificado_numero ?? '', fecha: r.fecha ?? doc.fecha ?? '',
      })
    }
    for (const c of doc.comprobantes) {
      const k = `${c.pto_vta}-${c.numero}`
      if (!aplicar.has(k)) aplicar.set(k, { pto_vta: c.pto_vta, numero: c.numero, importe: c.importe })
    }
  }
  const fechas = items.map(i => i.doc.fecha).filter((f): f is string => !!f).sort()
  const fechaOp = items.find(i => i.doc.tipo_documento === 'orden_pago')?.doc.fecha
  const tipos = [...new Set(items.map(i => TIPO_DOC[i.doc.tipo_documento].toLowerCase()))]
  return {
    clienteId,
    fecha: fechaOp ?? fechas.at(-1) ?? null,
    medios,
    retenciones,
    aplicar: aplicar.size ? [...aplicar.values()] : undefined,
    adjuntos: items.map(i => ({ ...i.adj, tipo: i.doc.tipo_documento === 'orden_pago' ? 'orden_pago' : 'comprobante_pago' })),
    obs: `Armado desde ${items.length === 1 ? 'un comprobante' : `${items.length} comprobantes`} (${tipos.join(', ')}).`,
  }
}

export function ModalComprobantesCobro({ archivos, onClose, onGuardado }: {
  archivos:   File[]
  onClose:    () => void
  onGuardado: (d: VentasCobroDetalle) => void
}) {
  const toast = useToast()
  const [items, setItems] = useState<Item[]>([])
  const [armando, setArmando] = useState<{ clienteId: number; keys: number[]; precarga: PrecargaCobro } | null>(null)
  // Archivos que ya son de un cobro registrado: no se descartan.
  const usados = useRef(new Set<string>())
  const clientes = useClientesVenta('', false)
  const nombreCliente = useMemo(() => new Map((clientes.data ?? []).map(c => [c.id, c.razon_social])), [clientes.data])

  // ── Leer: de a 3 archivos a la vez ──
  const arrancado = useRef(false)
  useEffect(() => {
    if (arrancado.current) return
    arrancado.current = true
    const cola = archivos.map(file => ({ file, key: ++claveItem }))
    setItems(cola.map(({ file, key }) => ({ key, archivo: file.name, estado: 'leyendo', clienteId: null, por: null })))
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
      const doc = await leerComprobanteCobro({ storage_path: adj.storage_path, nombre_archivo: file.name, mime: file.type })
      setItems(its => its.map(i => i.key === key
        ? { ...i, estado: 'listo', adj, doc, clienteId: doc.cliente?.id ?? null, por: doc.cliente?.por ?? null }
        : i))
    } catch (e) {
      // El archivo quedó subido: se descarta al cerrar.
      falla(mensajeErrorFacturacion(e), adj)
    }
  }

  const leyendo = items.some(i => i.estado === 'leyendo')
  const listos = items.filter((i): i is Item & { doc: VentasComprobanteCobroLectura; adj: VentasCobroAdjuntoInput } =>
    i.estado === 'listo' && !!i.doc && !!i.adj)

  // ── Por cliente ──
  const grupos = useMemo(() => {
    const m = new Map<number, typeof listos>()
    for (const i of listos) if (i.clienteId) m.set(i.clienteId, [...(m.get(i.clienteId) ?? []), i])
    return [...m.entries()].map(([id, its]) => ({
      id, nombre: nombreCliente.get(id) ?? `Cliente #${id}`, items: its,
      precarga: precargaDeDocumentos(id, its.map(i => ({ doc: i.doc, adj: i.adj }))),
    })).sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [listos, nombreCliente])
  const sinCliente = listos.filter(i => !i.clienteId)

  function setCliente(key: number, v: string) {
    setItems(its => its.map(i => i.key === key ? { ...i, clienteId: v ? Number(v) : null, por: null } : i))
  }

  function quitar(key: number) {
    const path = items.find(i => i.key === key)?.adj?.storage_path
    if (path && !usados.current.has(path)) void descartarAdjuntoCobroPendiente(path)
    setItems(its => its.filter(i => i.key !== key))
  }

  /** Cerrar: lo subido que no quedó en un cobro se borra. */
  function cerrar() {
    for (const i of items) {
      const p = i.adj?.storage_path
      if (p && !usados.current.has(p)) void descartarAdjuntoCobroPendiente(p)
    }
    onClose()
  }

  function guardado(d: VentasCobroDetalle) {
    const keys = new Set(armando?.keys ?? [])
    for (const a of armando?.precarga.adjuntos ?? []) usados.current.add(a.storage_path)
    setArmando(null)
    const quedan = items.filter(i => !keys.has(i.key))
    setItems(quedan)
    if (!quedan.some(i => i.estado === 'listo')) {
      for (const i of quedan) {
        const p = i.adj?.storage_path
        if (p && !usados.current.has(p)) void descartarAdjuntoCobroPendiente(p)
      }
      onGuardado(d)
      return
    }
    toast(`✓ Cobro ${d.cobro?.numero_fmt ?? ''} registrado. Quedan comprobantes de otro cliente.`, 'ok')
  }

  if (armando) {
    return <ModalCobro precarga={armando.precarga} onClose={() => setArmando(null)} onGuardado={guardado} />
  }

  return (
    <Modal open onClose={cerrar} width="max-w-5xl"
      title={`Comprobantes del cobro · ${archivos.length} archivo${archivos.length === 1 ? '' : 's'}`}
      footer={
        <div className="flex gap-2 justify-end items-center flex-wrap w-full">
          <div className="text-xs text-gris-dark mr-auto">
            {listos.length} leído{listos.length === 1 ? '' : 's'}
            {leyendo && <span className="text-azul animate-pulse"> · leyendo…</span>}
          </div>
          <Button variant="ghost" size="sm" onClick={cerrar}>Cerrar</Button>
        </div>
      }>
      <div className="flex flex-col gap-3 text-sm">
        <div className="text-[11px] text-gris-dark bg-gris/40 border border-gris-mid rounded px-2.5 py-1.5">
          Revisá <b>de qué cliente es cada papel</b> (se reconoce por el CUIT o el nombre de quien paga) y tocá
          «Armar cobro»: se abre «Registrar cobro» con los medios, las retenciones y la aplicación a las facturas que
          nombra la orden de pago (o a las más viejas). <b>Nada se registra hasta confirmar ahí.</b>
        </div>

        <div className="flex flex-col gap-2">
          {items.map(i => (
            <div key={i.key} className="border border-gris-mid rounded px-3 py-2 flex flex-col gap-1.5">
              <div className="flex items-start gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-semibold block truncate" title={i.archivo}>📄 {i.archivo}</span>
                  {i.estado === 'leyendo' && <span className="text-[11px] text-azul animate-pulse">Leyendo… (puede tardar medio minuto)</span>}
                  {i.estado === 'error' && <span className="text-[11px] text-rojo">{i.error}</span>}
                  {i.doc && (
                    <span className="text-[11px] text-gris-dark">
                      <b className="text-carbon">{TIPO_DOC[i.doc.tipo_documento]}</b>
                      {i.doc.fecha && <> · {fmtFecha(i.doc.fecha)}</>}
                      {i.doc.pagador_nombre && <> · paga {i.doc.pagador_nombre}</>}
                      {' · '}<b className="font-mono tabular-nums text-carbon">{fmtM(totalDoc(i.doc))}</b>
                    </span>
                  )}
                </div>
                {i.doc && (
                  <div className="w-[260px]">
                    <ClienteCombobox label="" value={i.clienteId ? String(i.clienteId) : ''} onChange={v => setCliente(i.key, v)} />
                    {i.por && <span className="text-[10px] text-verde">✓ reconocido por {i.por === 'cuit' ? 'CUIT' : 'nombre'}</span>}
                  </div>
                )}
                <button type="button" onClick={() => quitar(i.key)} disabled={i.estado === 'leyendo'}
                  className="text-xs text-rojo hover:underline disabled:opacity-40">Quitar</button>
              </div>
              {i.doc && (
                <div className="text-[11px] flex flex-col gap-0.5 pl-4">
                  {i.doc.medios.map((m, k) => (
                    <div key={`m${k}`} className={m.cobro_existente_id != null ? 'opacity-60 line-through' : ''}>
                      💵 {FORMA[m.forma] ?? m.forma}{m.numero ? ` N° ${m.numero}` : ''}{m.banco ? ` · ${m.banco}` : ''}
                      {m.fecha_cobro ? ` · ${fmtFecha(m.fecha_cobro)}` : ''}
                      {m.librador ? ` · librador ${m.librador}` : ''}
                      {m.forma === 'transferencia' && (m.cuenta_bancaria_id ? ' · a la cuenta de CADINC reconocida' : '')}
                      {' · '}<b className="font-mono">{m.importe != null ? fmtM(m.importe) : '—'}</b>
                      {m.avisos.map((a, j) => (
                        <span key={j} className={`block pl-4 ${a.severidad === 'error' ? 'text-rojo font-semibold' : a.severidad === 'advertencia' ? 'text-[#7A5000]' : 'text-azul'}`}>
                          {a.severidad === 'info' ? 'ℹ' : '⚠'} {a.mensaje}
                        </span>
                      ))}
                    </div>
                  ))}
                  {i.doc.retenciones.map((r, k) => (
                    <div key={`r${k}`}>
                      🧾 Retención {RET[r.tipo] ?? r.tipo}{r.jurisdiccion ? ` ${r.jurisdiccion}` : ''}{r.certificado_numero ? ` · cert. ${r.certificado_numero}` : ''}
                      {' · '}<b className="font-mono">{fmtM(r.importe)}</b>
                    </div>
                  ))}
                  {i.doc.comprobantes.length > 0 && (
                    <div>
                      📑 Paga: {i.doc.comprobantes.map(c =>
                        `${c.tipo ?? 'FC'} ${String(c.pto_vta).padStart(5, '0')}-${String(c.numero).padStart(8, '0')}${c.importe != null ? ` (${fmtM(c.importe)})` : ''}`).join(', ')}
                    </div>
                  )}
                  {i.doc.avisos.map((a, k) => (
                    <div key={`a${k}`} className={a.severidad === 'advertencia' ? 'text-[#7A5000]' : 'text-azul'}>
                      {a.severidad === 'info' ? 'ℹ' : '⚠'} {a.mensaje}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {!leyendo && (grupos.length > 0 || sinCliente.length > 0) && (
          <div className="flex flex-col gap-1.5">
            {grupos.map(g => {
              // De la precarga, no de los papeles: un cheque en la orden de pago y en su foto cuenta una vez.
              const total = g.precarga.medios.reduce((s, m) => s + (Number(m.importe) || 0), 0)
                + (g.precarga.retenciones ?? []).reduce((s, r) => s + (Number(r.importe) || 0), 0)
              return (
                <div key={g.id} className="border border-verde/40 bg-verde-light/40 rounded px-2.5 py-1.5 text-xs flex flex-wrap gap-x-3 gap-y-1 items-center">
                  <b>{g.nombre}</b>
                  <span>
                    {g.items.length} papel{g.items.length === 1 ? '' : 'es'} · {g.precarga.medios.length} medio{g.precarga.medios.length === 1 ? '' : 's'}
                    {g.precarga.retenciones?.length ? ` · ${g.precarga.retenciones.length} retención${g.precarga.retenciones.length === 1 ? '' : 'es'}` : ''}
                    {' · '}<b className="font-mono tabular-nums">{fmtM(total)}</b>
                  </span>
                  <Button size="sm" className="ml-auto"
                    onClick={() => setArmando({ clienteId: g.id, keys: g.items.map(i => i.key), precarga: g.precarga })}>
                    Armar cobro →
                  </Button>
                </div>
              )
            })}
            {sinCliente.length > 0 && (
              <div className="border border-amarillo/60 bg-amarillo-light rounded px-2.5 py-1.5 text-xs text-[#7A5000]">
                ⚠ {sinCliente.length} papel{sinCliente.length === 1 ? '' : 'es'} sin cliente: elegí de quién es cada uno para armar su cobro.
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
