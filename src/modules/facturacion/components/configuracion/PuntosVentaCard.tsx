'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import type { PuntoVentaVenta, PuntoVentaVentaInput } from '@/types/config.types'
import {
  useCrearPuntoVenta, useEditarPuntoVenta, useProductosVenta, usePuntosVenta, useVerificarPuntoVenta,
} from '../../hooks/useConfigVentas'
import { useArcaAmbiente } from '../../hooks/useFacturacion'
import { etiquetaProducto } from '../../utils/facturacion.utils'
import {
  codigoErrorFacturacion, errorDeCampoFacturacion, mensajeCodigoFacturacion, mensajeErrorFacturacion,
} from '../../utils/facturacion.errores'
import { Aviso } from '../FichaFactura'
import { VencimientoCertificado } from '../EstadoArca'

const pv5 = (n: number) => String(n).padStart(5, '0')
const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })

/** Lo que dijo ARCA la última vez que se preguntó. */
function EstadoArcaPv({ p }: { p: PuntoVentaVenta }) {
  if (!p.verificado_arca_at) {
    return <span className="text-[11px] px-1.5 py-0.5 rounded bg-gris text-gris-dark font-bold" title="Nunca se pudo confirmar con ARCA (en homologación es lo normal)">sin verificar</span>
  }
  const mal = p.arca_bloqueado ? 'bloqueado en ARCA' : p.arca_fch_baja ? `baja en ARCA (${fecha(p.arca_fch_baja)})` : null
  if (mal) return <span className="text-[11px] px-1.5 py-0.5 rounded bg-rojo-light text-rojo font-bold">{mal}</span>
  return (
    <span className="text-[11px] px-1.5 py-0.5 rounded bg-verde-light text-verde font-bold"
      title={`${p.arca_emision_tipo ?? ''} · verificado el ${fecha(p.verificado_arca_at)}`}>
      ✓ ARCA {fecha(p.verificado_arca_at)}
    </span>
  )
}

/**
 * Ventas › Configuración › Puntos de venta (20260929d). Con qué PV se emite
 * en el ambiente del servidor y cuál es el por defecto. Al cargar uno se le
 * pregunta a ARCA; si ARCA no contesta (homologación), se puede guardar igual.
 * No se borran: se dan de baja. Escribir pide el flag `configurar`.
 */
export function PuntosVentaCard() {
  const toast = useToast()
  const { configurar } = usePermisos('facturacion')
  const [inactivos, setInactivos] = useState(false)
  const [editando, setEditando] = useState<{ open: boolean; pv?: PuntoVentaVenta }>({ open: false })
  const lista = usePuntosVenta()
  const amb = useArcaAmbiente()
  const productos = useProductosVenta(true)
  const editar = useEditarPuntoVenta()
  const verificar = useVerificarPuntoVenta()
  const tip = configurar ? undefined : 'Necesitás el permiso «Configurar» de Ventas'
  const bloqueado = !configurar || lista.respaldo

  const visibles = lista.puntos.filter(p => inactivos || p.activo)
  const nombreProducto = (id: number) => {
    const p = productos.productos.find(x => x.id === id)
    return p ? etiquetaProducto(p.nombre) : `#${id}`
  }

  async function cambiar(p: PuntoVentaVenta, cambio: PuntoVentaVentaInput, ok: string) {
    try {
      await editar.mutateAsync({ id: p.id, ...cambio })
      toast(ok, 'ok')
    } catch (e) {
      toast(mensajeErrorFacturacion(e), 'err')
    }
  }

  async function verificarPv(p: PuntoVentaVenta) {
    try {
      const r = await verificar.mutateAsync(p.id)
      const v = r.verificacion
      if (v.estado === 'ok') toast(`✓ ARCA confirma el punto de venta ${pv5(p.numero)}`, 'ok')
      else if (v.estado === 'rechazado') toast(mensajeCodigoFacturacion(v.codigo, { disponibles: v.disponibles }), 'err')
      else toast(`No se pudo confirmar con ARCA: ${v.motivo}`, 'err')
    } catch (e) {
      toast(mensajeErrorFacturacion(e), 'err')
    }
  }

  return (
    <div className="bg-white rounded-card shadow-card p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <div className="text-sm font-bold">Puntos de venta</div>
          <div className="text-[11px] text-gris-dark">
            Con cuáles se puede emitir{amb.data?.ambiente ? ` en ${amb.data.ambiente === 'prod' ? 'producción' : 'homologación'}` : ''}.
            Si hay más de uno activo, la factura deja elegir; si no, usa el por defecto.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-gris-dark cursor-pointer select-none">
            <input type="checkbox" className="accent-naranja" checked={inactivos} onChange={e => setInactivos(e.target.checked)} />
            Dados de baja
          </label>
          <Button size="sm" variant="secondary" disabled={bloqueado} title={tip ?? 'Cargar un punto de venta'}
            onClick={() => setEditando({ open: true })}>+ Punto de venta</Button>
        </div>
      </div>

      {amb.data?.certificado && (
        <div><VencimientoCertificado estado={amb.data} /></div>
      )}
      {lista.respaldo && (
        <Aviso tono="naranja">
          El servidor todavía no tiene puntos de venta editables: se emite con el
          {amb.data ? ` ${pv5(amb.data.pto_vta)}` : ''} de su configuración.
        </Aviso>
      )}
      {lista.isLoading && <div className="py-3 text-sm text-gris-dark">Cargando…</div>}

      {!lista.respaldo && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-gris-dark border-b border-gris">
                <th className="py-1.5 pr-2">Punto de venta</th>
                <th className="py-1.5 pr-2">ARCA</th>
                <th className="py-1.5 pr-2">Lo sugieren</th>
                <th className="py-1.5 pr-2 text-right">Facturas</th>
                <th className="py-1.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gris">
              {visibles.map(p => (
                <tr key={p.id} className={p.activo ? '' : 'opacity-60'}>
                  <td className="py-2 pr-2 align-top">
                    <div className="font-semibold">
                      <span className="font-mono">{pv5(p.numero)}</span>
                      {p.nombre && <span className="ml-2">{p.nombre}</span>}
                      {p.por_defecto && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-naranja-light text-naranja-dark font-bold">por defecto</span>}
                      {!p.activo && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-gris text-gris-dark font-bold">dado de baja</span>}
                    </div>
                  </td>
                  <td className="py-2 pr-2 align-top whitespace-nowrap"><EstadoArcaPv p={p} /></td>
                  <td className="py-2 pr-2 align-top text-xs">
                    {p.producto_ids.length ? p.producto_ids.map(nombreProducto).join(' · ') : '—'}
                  </td>
                  <td className="py-2 pr-2 align-top text-right font-mono">{p.facturas}</td>
                  <td className="py-2 align-top">
                    <div className="flex gap-1 justify-end flex-wrap">
                      <Button variant="ghost" size="sm" disabled={bloqueado} title={tip ?? 'Editar nombre y productos'}
                        onClick={() => setEditando({ open: true, pv: p })}>✏️ Editar</Button>
                      <Button variant="ghost" size="sm" disabled={bloqueado} title={tip ?? 'Volver a preguntarle a ARCA'}
                        loading={verificar.isPending && verificar.variables === p.id}
                        onClick={() => verificarPv(p)}>Verificar</Button>
                      {!p.por_defecto && (
                        <Button variant="ghost" size="sm" disabled={bloqueado || !p.activo}
                          title={tip ?? (p.activo ? 'Usarlo cuando la factura no elige otro' : 'Reactivalo primero')}
                          onClick={() => cambiar(p, { por_defecto: true }, `✓ ${pv5(p.numero)} es el por defecto`)}>
                          Por defecto
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" disabled={bloqueado || p.por_defecto}
                        title={tip ?? (p.por_defecto
                          ? 'Es el por defecto: marcá otro antes de darlo de baja'
                          : p.activo ? 'Dar de baja: no se ofrece más en facturas nuevas' : 'Reactivar')}
                        onClick={() => cambiar(p, { activo: !p.activo },
                          p.activo ? `${pv5(p.numero)} dado de baja` : `✓ ${pv5(p.numero)} reactivado`)}>
                        {p.activo ? 'Dar de baja' : 'Reactivar'}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {!lista.isLoading && visibles.length === 0 && (
                <tr><td colSpan={5} className="py-3 text-sm text-gris-dark italic">
                  No hay puntos de venta cargados: se emite con el{amb.data ? ` ${pv5(amb.data.pto_vta)}` : ''} de la configuración del servidor.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {lista.error && <Aviso tono="rojo">{mensajeErrorFacturacion(lista.error)}</Aviso>}
      {editando.open && <ModalPuntoVenta pv={editando.pv} onClose={() => setEditando({ open: false })} />}
    </div>
  )
}

const schema = z.object({
  numero:       z.string().refine(v => /^\d{1,5}$/.test(v) && Number(v) >= 1 && Number(v) <= 99998, 'Número de 1 a 99998'),
  nombre:       z.string().max(60, 'Hasta 60 caracteres'),
  por_defecto:  z.boolean(),
  producto_ids: z.array(z.string()),
})
type FormData = z.infer<typeof schema>

function ModalPuntoVenta({ pv, onClose }: { pv?: PuntoVentaVenta; onClose: () => void }) {
  const toast = useToast()
  const crear = useCrearPuntoVenta()
  const editar = useEditarPuntoVenta()
  const productos = useProductosVenta(false)
  const [errorServer, setErrorServer] = useState<string | null>(null)
  /** ARCA no pudo confirmarlo: se ofrece guardar igual. */
  const [sinVerificar, setSinVerificar] = useState<string | null>(null)
  const { register, handleSubmit, setError, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      numero:       pv ? String(pv.numero) : '',
      nombre:       pv?.nombre ?? '',
      por_defecto:  pv?.por_defecto ?? false,
      producto_ids: (pv?.producto_ids ?? []).map(String),
    },
  })
  const guardando = crear.isPending || editar.isPending

  async function guardar(d: FormData, forzar = false) {
    setErrorServer(null)
    const base = {
      nombre:       d.nombre.trim().replace(/\s+/g, ' '),
      producto_ids: d.producto_ids.map(Number),
      ...(d.por_defecto && !pv?.por_defecto ? { por_defecto: true } : {}),
    }
    try {
      if (pv) await editar.mutateAsync({ id: pv.id, ...base })
      else await crear.mutateAsync({ ...base, numero: Number(d.numero), ...(forzar ? { forzar: true } : {}) })
      toast(pv ? '✓ Punto de venta actualizado' : '✓ Punto de venta cargado', 'ok')
      onClose()
    } catch (e) {
      if (!pv && codigoErrorFacturacion(e) === 'PV_NO_VERIFICADO') {
        setSinVerificar(mensajeErrorFacturacion(e))
        return
      }
      const ce = errorDeCampoFacturacion(e)
      if (ce && (ce.campo === 'numero' || ce.campo === 'nombre')) {
        setError(ce.campo, { message: ce.mensaje })
        return
      }
      setErrorServer(mensajeErrorFacturacion(e))
    }
  }

  return (
    <Modal open onClose={guardando ? () => {} : onClose} width="max-w-lg"
      title={pv ? `Editar punto de venta ${pv5(pv.numero)}` : 'Nuevo punto de venta'}
      footer={
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={guardando}>Cancelar</Button>
          {sinVerificar
            ? <Button size="sm" loading={guardando} onClick={handleSubmit(d => guardar(d, true))}>Guardar igual</Button>
            : <Button size="sm" loading={guardando} onClick={handleSubmit(d => guardar(d))}>{pv ? 'Guardar' : 'Verificar y cargar'}</Button>}
        </div>
      }>
      <form className="flex flex-col gap-3" onSubmit={e => e.preventDefault()}>
        <Input label="Número" {...register('numero', { onChange: () => setSinVerificar(null) })} error={errors.numero?.message}
          inputMode="numeric" disabled={!!pv} autoFocus={!pv}
          hint={pv ? 'El número no se cambia: si es otro, cargá uno nuevo.' : 'El que diste de alta en ARCA como «Factura electrónica - webservice».'} />
        <Input label="Nombre (opcional)" {...register('nombre')} error={errors.nombre?.message} placeholder="Logística"
          hint="Para reconocerlo en la lista." />
        {!pv?.por_defecto && (
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input type="checkbox" className="accent-naranja" {...register('por_defecto')} />
            Por defecto (el que usa la factura si no se elige otro)
          </label>
        )}
        {productos.productos.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">Lo sugieren estos productos</span>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {productos.productos.map(p => (
                <label key={p.id} className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
                  <input type="checkbox" className="accent-naranja" value={String(p.id)} {...register('producto_ids')} />
                  {etiquetaProducto(p.nombre)}
                </label>
              ))}
            </div>
            <span className="text-[11px] text-gris-dark">Al elegir uno de estos productos en la factura, se propone este punto de venta.</span>
          </div>
        )}
        {sinVerificar && (
          <Aviso tono="naranja">
            {sinVerificar} Si estás seguro de que el punto de venta existe en ARCA como webservice, podés guardarlo igual:
            si no existe, ARCA va a rechazar las facturas que se emitan con él.
          </Aviso>
        )}
        {errorServer && <Aviso tono="rojo">{errorServer}</Aviso>}
      </form>
    </Modal>
  )
}
