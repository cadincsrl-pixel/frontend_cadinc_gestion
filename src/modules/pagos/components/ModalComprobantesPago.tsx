'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Combobox } from '@/components/ui/Combobox'
import { useToast } from '@/components/ui/Toast'
import { borrarComprobantePendiente, leerComprobantePago, subirComprobantePendiente, useReconstruirPago } from '../hooks/usePagos'
import { useProveedoresPagos } from '../hooks/useProveedoresPagos'
import { MAX_ADJUNTO_BYTES, fmtFecha, fmtM, hoyAR } from '../utils/pagos.utils'
import { mensajeErrorPagos } from '../utils/pagos.errores'
import { chequeVacio, type ChequeFila } from '../utils/pagoForm'
import { filaDesdeLectura } from './pago/EditorCheques'
import { SelectCuentaOrigen } from './SelectCuentaOrigen'
import { ModalPagarLote, type ChequesDelProveedor } from './ModalPagarLote'
import type { PagosAdjuntoPendiente, PagosComprobanteLectura, PagosReconstruirInput, PagosTipoAdjOrden } from '@/types/domain.types'

/**
 * «Soltá acá los comprobantes de pagos» en Compras › Pagos (2026-09-25).
 * Todo lo que documenta un pago a un proveedor: comprobante de transferencia,
 * de un e-cheq emitido o endosado, foto de un cheque, el recibo del proveedor
 * o su resumen de cuenta.
 *
 * 1. Cada archivo se sube a `ordenes/pendientes/` y se lee con IA
 *    (`POST /pagos/comprobantes/leer`): a qué proveedor, con qué medios, qué
 *    facturas cancela; el backend trae sus facturas y avisa lo ya registrado.
 * 2. Por proveedor, dos caminos:
 *    · «Registrar pago ya hecho» (la conciliación): OP reconstruida para
 *      facturas «de meses ya pagados», con los papeles adjuntos. Sin doble
 *      firma: la plata ya salió. Es lo que se hacía por SQL.
 *    · «Pagar ahora con estos cheques»: abre «Pagar en lote» con los cheques
 *      cargados y sus facturas aprobadas (el circuito de siempre).
 */

const TIPO_DOC: Record<PagosComprobanteLectura['tipo_documento'], string> = {
  transferencia: 'Transferencia', echeq: 'E-cheq', cheque: 'Cheque', recibo: 'Recibo del proveedor', resumen_cuenta: 'Resumen de cuenta', otro: 'Otro',
}
const TIPO_ADJ: Record<PagosComprobanteLectura['tipo_documento'], PagosTipoAdjOrden> = {
  transferencia: 'comprobante_pago', echeq: 'cheque', cheque: 'cheque', recibo: 'recibo_proveedor', resumen_cuenta: 'otro', otro: 'otro',
}

interface Item {
  key:         number
  archivo:     string
  estado:      'leyendo' | 'listo' | 'error'
  error?:      string
  adj?:        PagosAdjuntoPendiente
  doc?:        PagosComprobanteLectura
  /** Elegido a mano: TODO el papel va a este proveedor. null = lo que reconoció la lectura (medio por medio). */
  proveedorId: number | null
}

type Medio = PagosComprobanteLectura['medios'][number]

let claveItem = 0
const r2 = (n: number) => Math.round(n * 100) / 100
const num = (s: string) => { const v = Number(String(s).replace(',', '.')); return Number.isFinite(v) ? v : 0 }

/** Los medios de todos los papeles de un proveedor, sin repetir: un cheque del recibo y su comprobante van una vez. */
function mediosUnicos(docs: PagosComprobanteLectura[]): Medio[] {
  const vistos = new Set<string>()
  const out: Medio[] = []
  // El comprobante del banco manda sobre el recibo (trae más datos): van primero.
  const orden = [...docs].sort((a, b) => Number(a.tipo_documento === 'recibo' || a.tipo_documento === 'resumen_cuenta')
    - Number(b.tipo_documento === 'recibo' || b.tipo_documento === 'resumen_cuenta'))
  const importesBanco = new Set<number>()
  for (const d of orden) {
    if (d.tipo_documento === 'resumen_cuenta') continue
    const esPapelDelProveedor = d.tipo_documento === 'recibo'
    for (const m of d.medios) {
      if (m.avisos.some(a => a.codigo === 'CHEQUE_YA_REGISTRADO')) continue
      // El recibo del proveedor nombra los valores a su manera (el e-cheq 3010 figuró como «cheque 48745242»):
      // si ya vino el comprobante del banco por ese importe, el del recibo no suma otra vez.
      if (esPapelDelProveedor && m.importe != null && importesBanco.has(m.importe)) continue
      if (!esPapelDelProveedor && m.importe != null) importesBanco.add(m.importe)
      const esCheque = m.forma === 'cheque' || m.forma === 'echeq'
      const k = esCheque ? `ch|${(m.numero ?? '').replace(/^0+/, '')}|${m.importe ?? ''}` : `${m.forma}|${m.importe ?? ''}|${m.fecha_cobro ?? d.fecha ?? ''}`
      if (vistos.has(k)) continue
      vistos.add(k)
      out.push({ ...m, fecha_cobro: m.fecha_cobro ?? d.fecha })
    }
  }
  return out
}

function formaDeMedios(medios: Medio[]): PagosReconstruirInput['forma_pago'] {
  const formas = new Set(medios.map(m => m.forma))
  if (formas.size === 1) {
    const f = [...formas][0]!
    return f === 'otro' ? 'otro' : f
  }
  if ([...formas].every(f => f === 'cheque' || f === 'echeq')) return 'echeq'
  return 'otro'
}

export function ModalComprobantesPago({ archivos, onClose }: { archivos: File[]; onClose: () => void }) {
  const toast = useToast()
  const [items, setItems] = useState<Item[]>([])
  const [loteDe, setLoteDe] = useState<{ facturaIds: number[]; desdeCheques: Record<number, ChequesDelProveedor> } | null>(null)
  const [abierto, setAbierto] = useState<number | null>(null)
  const usados = useRef(new Set<string>())

  const proveedores = useProveedoresPagos({}, 1, 300)
  const opciones = useMemo(() => (proveedores.data?.items ?? []).map(p => ({
    value: String(p.id), label: p.razon_social,
    sub: [p.codigo, p.cuit].filter(Boolean).join(' · ') || undefined,
    search: [p.razon_social, p.cuit ?? '', p.codigo ?? ''],
  })), [proveedores.data])
  const nombreProv = useMemo(() => new Map((proveedores.data?.items ?? []).map(p => [p.id, p.razon_social])), [proveedores.data])

  // ── Leer: de a 3 archivos a la vez ──
  const arrancado = useRef(false)
  useEffect(() => {
    if (arrancado.current) return
    arrancado.current = true
    const cola = archivos.map(file => ({ file, key: ++claveItem }))
    setItems(cola.map(({ file, key }) => ({ key, archivo: file.name, estado: 'leyendo', proveedorId: null })))
    const trabajar = async () => { for (let t = cola.shift(); t; t = cola.shift()) await leerArchivo(t.key, t.file) }
    for (let k = 0; k < Math.min(3, cola.length); k++) void trabajar()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- se lee una sola vez, al abrir
  }, [])

  async function leerArchivo(key: number, file: File) {
    const falla = (error: string, adj?: PagosAdjuntoPendiente) => setItems(its => its.map(i => i.key === key ? { ...i, estado: 'error', error, adj } : i))
    if (file.size > MAX_ADJUNTO_BYTES) return falla('Supera los 10 MB.')
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') return falla('No es foto ni PDF.')
    let adj: PagosAdjuntoPendiente
    try { adj = await subirComprobantePendiente(file, 'comprobante_pago') } catch (e) { return falla(mensajeErrorPagos(e)) }
    try {
      const doc = await leerComprobantePago(adj)
      setItems(its => its.map(i => i.key === key
        ? { ...i, estado: 'listo', adj: { ...adj, tipo: TIPO_ADJ[doc.tipo_documento] }, doc, proveedorId: null }
        : i))
    } catch (e) {
      falla(`${mensajeErrorPagos(e)} El archivo se puede adjuntar igual desde la OP.`, adj)
    }
  }

  const leyendo = items.some(i => i.estado === 'leyendo')
  const listos = items.filter((i): i is Item & { doc: PagosComprobanteLectura; adj: PagosAdjuntoPendiente } => i.estado === 'listo' && !!i.doc && !!i.adj)

  // A qué proveedor va cada medio: el elegido a mano para el papel, o el que
  // reconoció la lectura para ese medio (un PDF de endosos puede ir a varios).
  const provDe = (i: Item & { doc: PagosComprobanteLectura }, m?: Medio) => i.proveedorId ?? m?.proveedor_id ?? i.doc.proveedor?.id ?? null
  const [hechos, setHechos] = useState<Set<string>>(new Set())

  const grupos = useMemo(() => {
    // Un papel se parte por proveedor: cada parte es el documento con SÓLO los medios de ese proveedor.
    const m = new Map<number, { item: (typeof listos)[number]; doc: PagosComprobanteLectura }[]>()
    for (const i of listos) {
      const ids = new Set(i.doc.medios.map(x => provDe(i, x)))
      if (i.doc.medios.length === 0) ids.add(provDe(i))
      for (const id of ids) {
        if (id == null || hechos.has(`${i.key}|${id}`)) continue
        const doc = { ...i.doc, medios: i.doc.medios.filter(x => provDe(i, x) === id) }
        m.set(id, [...(m.get(id) ?? []), { item: i, doc }])
      }
    }
    return [...m.entries()].map(([id, partes]) => {
      const its = partes.map(p => ({ ...p.item, doc: p.doc }))
      const docs = partes.map(p => p.doc)
      const facturas = new Map<number, PagosComprobanteLectura['facturas'][number]>()
      for (const p of partes) for (const f of p.item.doc.facturas) {
        if (f.proveedor_id !== id) continue
        const prev = facturas.get(f.id)
        facturas.set(f.id, prev ? { ...prev, nombrada: prev.nombrada || f.nombrada, importe_papel: prev.importe_papel ?? f.importe_papel } : f)
      }
      const medios = mediosUnicos(docs)
      return {
        id, nombre: nombreProv.get(id) ?? its[0]?.doc.proveedor?.razon_social ?? `Proveedor ${id}`, items: its, docs, medios,
        facturas: [...facturas.values()].sort((a, b) => Number(b.nombrada) - Number(a.nombrada) || a.fecha.localeCompare(b.fecha)),
        total: r2(medios.reduce((s, m) => s + (m.importe ?? 0), 0)),
      }
    }).sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [listos, nombreProv, hechos])
  const sinProveedor = listos.filter(i => i.doc.medios.length ? i.doc.medios.some(x => provDe(i, x) == null) : provDe(i) == null)

  function quitar(key: number) {
    const p = items.find(i => i.key === key)?.adj?.storage_path
    if (p && !usados.current.has(p)) borrarComprobantePendiente(p).catch(() => {})
    setItems(its => its.filter(i => i.key !== key))
  }

  function cerrar() {
    for (const i of items) { const p = i.adj?.storage_path; if (p && !usados.current.has(p)) borrarComprobantePendiente(p).catch(() => {}) }
    onClose()
  }

  /** Un proveedor registrado: sus partes quedan hechas; el papel sale de la lista cuando no le queda ninguna. */
  function registrado(provId: number, keys: number[], paths: string[]) {
    for (const p of paths) usados.current.add(p)
    const nuevos = new Set(hechos)
    for (const k of keys) nuevos.add(`${k}|${provId}`)
    setHechos(nuevos)
    setAbierto(null)
    const quedan = items.filter(i => {
      if (i.estado !== 'listo' || !i.doc) return true
      const it = i as Item & { doc: PagosComprobanteLectura }
      const ids = new Set(it.doc.medios.length ? it.doc.medios.map(x => provDe(it, x)) : [provDe(it)])
      return [...ids].some(id => id == null || !nuevos.has(`${i.key}|${id}`))
    })
    setItems(quedan)
    if (!quedan.some(i => i.estado === 'listo')) cerrar()
  }

  function pagarAhora(g: (typeof grupos)[number]) {
    const cheques: ChequeFila[] = g.medios.filter(m => m.forma === 'cheque' || m.forma === 'echeq').map(m => {
      const item = g.items.find(i => i.doc.medios.some(x => x.numero === m.numero && x.importe === m.importe))
      const base = { ...chequeVacio('', ''), es_propio: m.es_propio !== false }
      return {
        ...filaDesdeLectura(base, { propuesta: { ...m, es_echeq: m.forma === 'echeq', es_diferido: null }, avisos: [] }, m.forma === 'echeq' ? 'echeq' : 'cheque'),
        foto: item?.adj ? { ...item.adj, tipo: 'cheque' } : null, fotoUrl: null,
      }
    })
    const aprobadas = g.facturas.filter(f => !f.pago_a_reconstruir && f.saldo > 0.005 && (f.estado === 'aprobada' || f.estado === 'pagada_parcial'))
    for (const i of g.items) usados.current.add(i.adj.storage_path)
    setLoteDe({
      facturaIds: aprobadas.map(f => f.id),
      desdeCheques: { [g.id]: { cheques, forma: g.medios.every(m => m.forma === 'echeq') ? 'echeq' : 'cheque' } },
    })
  }

  if (loteDe) return <ModalPagarLote facturaIds={loteDe.facturaIds} desdeCheques={loteDe.desdeCheques} onClose={onClose} />

  return (
    <Modal open onClose={cerrar} width="max-w-5xl"
      title={`Comprobantes de pagos · ${archivos.length} archivo${archivos.length === 1 ? '' : 's'}`}
      footer={
        <div className="flex gap-2 justify-end items-center w-full">
          <span className="text-xs text-gris-dark mr-auto">{listos.length} leído{listos.length === 1 ? '' : 's'}{leyendo && <span className="text-azul animate-pulse"> · leyendo…</span>}</span>
          <Button variant="ghost" size="sm" onClick={cerrar}>Cerrar</Button>
        </div>
      }>
      <div className="flex flex-col gap-3 text-sm">
        <div className="text-[11px] text-gris-dark bg-gris/40 border border-gris-mid rounded px-2.5 py-1.5">
          Revisá <b>a qué proveedor va cada papel</b>. Si es un pago <b>que ya se hizo</b> (facturas de meses ya pagados), «Registrar pago ya hecho»
          lo carga con los papeles adjuntos. Si vas a <b>pagar ahora</b> con cheques, «Pagar ahora» abre «Pagar en lote». Nada se registra sin confirmar.
        </div>

        {items.map(i => (
          <div key={i.key} className="border border-gris-mid rounded px-3 py-2 flex flex-col gap-1">
            <div className="flex items-start gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <span className="text-xs font-semibold block truncate" title={i.archivo}>📄 {i.archivo}</span>
                {i.estado === 'leyendo' && <span className="text-[11px] text-azul animate-pulse">Leyendo… (puede tardar medio minuto)</span>}
                {i.estado === 'error' && <span className="text-[11px] text-rojo">{i.error}</span>}
                {i.doc && (
                  <span className="text-[11px] text-gris-dark">
                    <b className="text-carbon">{TIPO_DOC[i.doc.tipo_documento]}</b>{i.doc.recibo_numero ? ` N° ${i.doc.recibo_numero}` : ''}
                    {i.doc.fecha && <> · {fmtFecha(i.doc.fecha)}</>}{i.doc.proveedor_nombre && <> · {i.doc.proveedor_nombre}</>}
                  </span>
                )}
              </div>
              {i.doc && (
                <div className="w-[250px]">
                  {(() => {
                    const it = i as Item & { doc: PagosComprobanteLectura }
                    const ids = [...new Set(it.doc.medios.map(x => provDe(it, x)).filter((x): x is number => x != null))]
                    const valor = i.proveedorId ?? (ids.length === 1 ? ids[0] : it.doc.proveedor?.id) ?? null
                    return <>
                      <Combobox options={opciones} value={valor ? String(valor) : ''} placeholder="¿A qué proveedor?"
                        onChange={v => setItems(its => its.map(x => x.key === i.key ? { ...x, proveedorId: v ? Number(v) : null } : x))} />
                      {!i.proveedorId && ids.length > 1 && <span className="text-[10px] text-azul">Va a {ids.length} proveedores (un cheque a cada uno). Elegí uno sólo para mandarlo todo ahí.</span>}
                      {!i.proveedorId && ids.length <= 1 && i.doc.proveedor && <span className="text-[10px] text-verde">✓ reconocido por {i.doc.proveedor.por === 'cuit' ? 'CUIT' : 'nombre'}</span>}
                    </>
                  })()}
                </div>
              )}
              <button type="button" onClick={() => quitar(i.key)} disabled={i.estado === 'leyendo'} className="text-xs text-rojo hover:underline disabled:opacity-40">Quitar</button>
            </div>
            {i.doc && (
              <div className="text-[11px] flex flex-col gap-0.5 pl-4">
                {i.doc.medios.map((m, k) => (
                  <div key={k}>
                    💸 {m.forma}{m.numero ? ` N° ${m.numero}` : ''}{m.banco ? ` · ${m.banco}` : ''}{m.fecha_cobro ? ` · ${fmtFecha(m.fecha_cobro)}` : ''}
                    {m.es_propio === false ? ` · de tercero${m.librador ? ` (${m.librador})` : ''}` : ''}
                    {' · '}<b className="font-mono">{m.importe != null ? fmtM(m.importe) : '—'}</b>
                    {m.avisos.map((a, j) => <span key={j} className={`block pl-4 ${a.severidad === 'error' ? 'text-rojo font-semibold' : 'text-[#7A5000]'}`}>⚠ {a.mensaje}</span>)}
                  </div>
                ))}
                {i.doc.comprobantes.length > 0 && <div>📑 {i.doc.tipo_documento === 'resumen_cuenta' ? 'Figuran' : 'Cancela'}: {i.doc.comprobantes.map(c => `${c.numero_fmt}${c.importe != null ? ` (${fmtM(c.importe)})` : ''}`).join(', ')}</div>}
                {i.doc.avisos.map((a, k) => (
                  <div key={`a${k}`} className={a.severidad === 'error' ? 'text-rojo font-semibold' : a.severidad === 'advertencia' ? 'text-[#7A5000]' : 'text-azul'}>
                    {a.severidad === 'info' ? 'ℹ' : '⚠'} {a.mensaje}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {!leyendo && grupos.map(g => {
          const hayCheques = g.medios.some(m => m.forma === 'cheque' || m.forma === 'echeq')
          const hayAprobadas = g.facturas.some(f => !f.pago_a_reconstruir && f.saldo > 0.005 && (f.estado === 'aprobada' || f.estado === 'pagada_parcial'))
          return (
            <div key={g.id} className="border border-verde/40 bg-verde-light/40 rounded px-3 py-2 flex flex-col gap-2">
              <div className="flex flex-wrap gap-x-3 gap-y-1 items-center text-xs">
                <b>{g.nombre}</b>
                <span>{g.items.length} papel{g.items.length === 1 ? '' : 'es'} · {g.medios.length} medio{g.medios.length === 1 ? '' : 's'} · <b className="font-mono tabular-nums">{fmtM(g.total)}</b></span>
                <div className="ml-auto flex gap-1.5">
                  {hayCheques && (
                    <Button size="sm" variant="secondary" disabled={!hayAprobadas} onClick={() => pagarAhora(g)}
                      title={hayAprobadas ? 'Abre «Pagar en lote» con estos cheques y sus facturas aprobadas' : 'No tiene facturas aprobadas con saldo'}>
                      Pagar ahora con estos cheques
                    </Button>
                  )}
                  <Button size="sm" onClick={() => setAbierto(abierto === g.id ? null : g.id)} disabled={g.medios.length === 0}
                    title={g.medios.length === 0 ? 'No se leyó ningún medio de pago' : 'Registrar un pago que ya se hizo, con estos papeles'}>
                    {abierto === g.id ? 'Cerrar' : 'Registrar pago ya hecho'}
                  </Button>
                </div>
              </div>
              {abierto === g.id && (
                <FormReconstruir grupo={g} usados={usados.current} onListo={(numero) => {
                  toast(`✓ OP-${String(numero ?? '').padStart(4, '0')} registrada como pago reconstruido`, 'ok')
                  registrado(g.id, g.items.map(i => i.key), g.items.map(i => i.adj.storage_path))
                }} />
              )}
            </div>
          )
        })}
        {!leyendo && sinProveedor.length > 0 && (
          <div className="border border-amarillo/60 bg-amarillo-light rounded px-2.5 py-1.5 text-xs text-[#7A5000]">
            ⚠ {sinProveedor.length} papel{sinProveedor.length === 1 ? '' : 'es'} sin proveedor: elegí a cuál va cada uno.
          </div>
        )}
      </div>
    </Modal>
  )
}

/** El formulario de «Registrar pago ya hecho» de un proveedor. */
function FormReconstruir({ grupo, onListo, usados }: {
  usados: ReadonlySet<string>
  grupo: { id: number; items: { doc: PagosComprobanteLectura; adj: PagosAdjuntoPendiente }[]; docs: PagosComprobanteLectura[]; medios: Medio[]; facturas: PagosComprobanteLectura['facturas']; total: number }
  onListo: (numero: number | null) => void
}) {
  const toast = useToast()
  const reconstruir = useReconstruirPago()
  const forma = formaDeMedios(grupo.medios)
  const fechaDoc = grupo.docs.map(d => d.fecha).filter((f): f is string => !!f).sort()[0] ?? hoyAR()
  const [fecha, setFecha] = useState(fechaDoc)
  const [cuenta, setCuenta] = useState(() => {
    const leida = grupo.docs.find(d => d.cuenta_origen_id)?.cuenta_origen_id
    return leida ? String(leida) : ''
  })
  const [referencia, setReferencia] = useState(() => grupo.docs.map(d => {
    const tipo = TIPO_DOC[d.tipo_documento]
    const medios = d.medios.map(m => `${m.forma}${m.numero ? ` ${m.numero}` : ''}`).join(', ')
    return `${tipo}${d.recibo_numero ? ` ${d.recibo_numero}` : ''}${medios ? ` (${medios})` : ''}`
  }).join(' · ').slice(0, 480))
  // Tildadas de entrada: las que nombra el papel y siguen «de meses ya pagados», por lo que dice el papel (o su saldo).
  const [lineas, setLineas] = useState<Record<number, string>>(() => {
    const out: Record<number, string> = {}
    let resto = grupo.total
    for (const f of grupo.facturas) {
      if (!f.nombrada || !f.pago_a_reconstruir || f.saldo <= 0.005 || resto <= 0.005) continue
      const va = r2(Math.min(f.saldo, f.importe_papel ?? f.saldo, resto))
      out[f.id] = String(va)
      resto = r2(resto - va)
    }
    return out
  })
  const total = grupo.total
  const aplicado = r2(Object.values(lineas).reduce((s, v) => s + num(v), 0))
  const aCuenta = r2(total - aplicado)
  const cheques = grupo.medios.filter(m => m.forma === 'cheque' || m.forma === 'echeq')
  const faltaFechaCheque = cheques.some(m => !m.fecha_cobro)
  const motivo =
    Object.keys(lineas).length === 0 ? 'Tildá al menos una factura'
    : aCuenta < -0.005 ? `Lo aplicado supera lo pagado en ${fmtM(-aCuenta)}`
    : total <= 0 ? 'No hay importe leído'
    : (forma === 'cheque' || forma === 'echeq') && faltaFechaCheque ? 'Algún cheque no tiene fecha de cobro'
    : referencia.trim().length < 3 ? 'Poné una referencia'
    : undefined

  async function confirmar() {
    if (motivo) return
    try {
      const r = await reconstruir.mutateAsync({
        proveedor_id: grupo.id, fecha, forma_pago: forma, monto_pagado: total,
        cuenta_origen_id: cuenta ? Number(cuenta) : null, referencia: referencia.trim(),
        obs: 'Pago reconstruido desde «Soltá acá los comprobantes de pagos».',
        ...(forma === 'cheque' || forma === 'echeq' ? {
          cheques: cheques.map(m => ({
            numero: m.numero ?? '', banco: m.banco ?? '', fecha_cobro: m.fecha_cobro ?? fecha, monto: m.importe ?? 0,
            es_propio: m.es_propio !== false,
            librador: m.es_propio === false ? [m.librador, m.librador_cuit ? `CUIT ${m.librador_cuit}` : null].filter(Boolean).join(' · ') : '',
          })),
        } : {}),
        lineas: Object.entries(lineas).filter(([, v]) => num(v) > 0).map(([id, v]) => ({ factura_id: Number(id), monto: r2(num(v)) })),
        a_cuenta: aCuenta > 0.005 ? aCuenta : undefined,
        // Un archivo compartido (PDF de endosos a varios) queda en la primera OP que lo registra.
        adjuntos: [...new Map(grupo.items.map(i => [i.adj.storage_path, i.adj])).values()].filter(a => !usados.has(a.storage_path)),
      })
      if (r.adjuntos_error) toast(`La OP quedó registrada, pero los papeles no se adjuntaron (${r.adjuntos_error}): adjuntalos desde la ficha.`, 'err')
      onListo(r.numero)
    } catch (e) {
      toast(mensajeErrorPagos(e), 'err')
    }
  }

  return (
    <div className="bg-white rounded border border-gris-mid px-3 py-2 flex flex-col gap-2 text-xs">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <label className="flex flex-col gap-0.5">
          <span className="font-bold text-gris-dark">Fecha del pago</span>
          <input type="date" value={fecha} max={hoyAR()} onChange={e => setFecha(e.target.value)} className="border border-gris-mid rounded px-2 py-1" />
        </label>
        <div className="flex flex-col gap-0.5">
          <span className="font-bold text-gris-dark">Salió de</span>
          <SelectCuentaOrigen value={cuenta} onChange={setCuenta} forma={forma === 'otro' ? null : forma} auto={{}} />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="font-bold text-gris-dark">Forma</span>
          <span className="py-1">{forma}{cheques.length ? ` · ${cheques.length} cheque${cheques.length === 1 ? '' : 's'}` : ''} · <b className="font-mono">{fmtM(total)}</b></span>
        </div>
      </div>
      <label className="flex flex-col gap-0.5">
        <span className="font-bold text-gris-dark">Referencia</span>
        <input value={referencia} onChange={e => setReferencia(e.target.value)} maxLength={500} className="border border-gris-mid rounded px-2 py-1" />
      </label>
      <div className="flex flex-col gap-1">
        <span className="font-bold text-gris-dark">Qué facturas paga</span>
        {grupo.facturas.length === 0 && <span className="text-gris-dark italic">El proveedor no tiene facturas con saldo en Compras.</span>}
        {grupo.facturas.map(f => {
          const tildada = f.id in lineas
          const puede = f.pago_a_reconstruir && f.saldo > 0.005
          return (
            <label key={f.id} className={`flex items-center gap-2 ${puede ? '' : 'opacity-60'}`}
              title={puede ? undefined : f.saldo <= 0.005 ? 'Ya está pagada' : 'No es de meses ya pagados: se paga con «Pagar» (doble firma)'}>
              <input type="checkbox" checked={tildada} disabled={!puede}
                onChange={e => setLineas(l => { const n = { ...l }; if (e.target.checked) n[f.id] = String(f.saldo); else delete n[f.id]; return n })} />
              <span className="font-mono">{f.numero ?? `#${f.id}`}</span>
              <span className="text-gris-dark">{fmtFecha(f.fecha)} · saldo {fmtM(f.saldo)}{f.nombrada ? ' · la nombra el papel' : ''}{!f.pago_a_reconstruir && f.saldo > 0.005 ? ' · no es de meses ya pagados' : ''}</span>
              {tildada && (
                <input value={lineas[f.id]} onChange={e => setLineas(l => ({ ...l, [f.id]: e.target.value }))} inputMode="decimal"
                  className="ml-auto w-32 border border-gris-mid rounded px-2 py-0.5 text-right font-mono" />
              )}
            </label>
          )
        })}
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <span>Aplicado <b className="font-mono">{fmtM(aplicado)}</b>{aCuenta > 0.005 && <> · a cuenta <b className="font-mono">{fmtM(aCuenta)}</b></>}</span>
        <Button size="sm" className="ml-auto" loading={reconstruir.isPending} disabled={!!motivo} title={motivo} onClick={confirmar}>
          Registrar pago ya hecho
        </Button>
      </div>
    </div>
  )
}
