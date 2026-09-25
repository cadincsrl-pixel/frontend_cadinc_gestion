'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import type { ProductoVenta, ProductoVentaInput } from '@/types/config.types'
import { useCrearProductoVenta, useEditarProductoVenta, useProductosVenta } from '../../hooks/useConfigVentas'
import { CONCEPTO_ARCA_LABEL, etiquetaProducto } from '../../utils/facturacion.utils'
import { errorDeCampoFacturacion, mensajeErrorFacturacion } from '../../utils/facturacion.errores'
import { Aviso } from '../FichaFactura'

/**
 * Ventas › Configuración › Productos (20260929b). Cada producto define el
 * concepto ARCA de la factura, si pide obra y si pide el período facturado.
 * No se borran: se dan de baja (las facturas conservan el nombre como foto).
 * Escribir pide el flag `configurar`; sin él los botones quedan deshabilitados.
 */
export function ProductosCard() {
  const toast = useToast()
  const { configurar } = usePermisos('facturacion')
  const [inactivos, setInactivos] = useState(false)
  const [editando, setEditando] = useState<{ open: boolean; producto?: ProductoVenta }>({ open: false })
  const lista = useProductosVenta(true)
  const editar = useEditarProductoVenta()
  const tip = configurar ? undefined : 'Necesitás el permiso «Configurar» de Ventas'
  const bloqueado = !configurar || lista.respaldo

  const visibles = lista.productos.filter(p => inactivos || p.activo)
  const activos = lista.productos.filter(p => p.activo).length

  async function cambiarActivo(p: ProductoVenta) {
    try {
      await editar.mutateAsync({ id: p.id, activo: !p.activo })
      toast(p.activo ? `${etiquetaProducto(p.nombre)} dado de baja` : `✓ ${etiquetaProducto(p.nombre)} reactivado`, 'ok')
    } catch (e) {
      toast(mensajeErrorFacturacion(e), 'err')
    }
  }

  return (
    <div className="bg-white rounded-card shadow-card p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <div className="text-sm font-bold">Productos</div>
          <div className="text-[11px] text-gris-dark">
            Lo que se elige al cargar una factura. Define el concepto de ARCA y si pide obra o período facturado.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-gris-dark cursor-pointer select-none">
            <input type="checkbox" className="accent-naranja" checked={inactivos} onChange={e => setInactivos(e.target.checked)} />
            Dados de baja
          </label>
          <Button size="sm" variant="secondary" disabled={bloqueado} title={tip ?? 'Cargar un producto nuevo'}
            onClick={() => setEditando({ open: true })}>+ Producto</Button>
        </div>
      </div>

      {lista.respaldo && (
        <Aviso tono="naranja">
          El servidor todavía no tiene el catálogo de productos: se muestran los de siempre y no se pueden editar.
        </Aviso>
      )}
      {lista.isLoading && <div className="py-3 text-sm text-gris-dark">Cargando…</div>}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-gris-dark border-b border-gris">
              <th className="py-1.5 pr-2">Producto</th>
              <th className="py-1.5 pr-2">Concepto ARCA</th>
              <th className="py-1.5 pr-2">Pide</th>
              <th className="py-1.5 pr-2 text-right">Facturas</th>
              <th className="py-1.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gris">
            {visibles.map(p => (
              <tr key={p.id} className={p.activo ? '' : 'opacity-60'}>
                <td className="py-2 pr-2 align-top">
                  <div className="font-semibold">
                    {etiquetaProducto(p.nombre)}
                    {!p.activo && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-gris text-gris-dark font-bold">dado de baja</span>}
                    {!p.mapeado && !lista.respaldo && (
                      <Link href="/contabilidad?tab=mapeos"
                        title="Sin cuenta de ingreso: sus facturas quedan pendientes de contabilizar. Mapealo en Contabilidad › Mapeos."
                        className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-naranja-light text-naranja-dark font-bold hover:underline">
                        sin mapeo contable
                      </Link>
                    )}
                  </div>
                  {p.descripcion && <div className="text-[11px] text-gris-dark">{p.descripcion}</div>}
                </td>
                <td className="py-2 pr-2 align-top whitespace-nowrap">{p.concepto_arca} · {CONCEPTO_ARCA_LABEL[p.concepto_arca]}</td>
                <td className="py-2 pr-2 align-top text-xs">
                  {[p.pide_obra ? 'obra' : null, p.pide_periodo ? 'período' : null].filter(Boolean).join(' · ') || '—'}
                </td>
                <td className="py-2 pr-2 align-top text-right font-mono">{lista.respaldo ? '—' : p.facturas}</td>
                <td className="py-2 align-top">
                  <div className="flex gap-1 justify-end flex-wrap">
                    <Button variant="ghost" size="sm" disabled={bloqueado} title={tip ?? 'Editar'}
                      onClick={() => setEditando({ open: true, producto: p })}>✏️ Editar</Button>
                    <Button variant="ghost" size="sm"
                      disabled={bloqueado || (p.activo && activos <= 1)}
                      title={tip ?? (p.activo && activos <= 1
                        ? 'Es el único activo: sin ninguno no se puede facturar'
                        : p.activo ? 'Dar de baja: no se ofrece más en facturas nuevas' : 'Reactivar')}
                      loading={editar.isPending && editar.variables?.id === p.id && editar.variables?.activo !== undefined}
                      onClick={() => cambiarActivo(p)}>
                      {p.activo ? 'Dar de baja' : 'Reactivar'}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {!lista.isLoading && visibles.length === 0 && (
              <tr><td colSpan={5} className="py-3 text-sm text-gris-dark italic">No hay productos.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {lista.error && !lista.respaldo && <Aviso tono="rojo">{mensajeErrorFacturacion(lista.error)}</Aviso>}
      {editando.open && <ModalProducto producto={editando.producto} onClose={() => setEditando({ open: false })} />}
    </div>
  )
}

const schema = z.object({
  nombre:        z.string().refine(v => v.trim().length >= 2 && v.trim().length <= 100, 'Entre 2 y 100 caracteres'),
  descripcion:   z.string().max(500, 'Hasta 500 caracteres'),
  concepto_arca: z.enum(['1', '2', '3']),
  pide_obra:     z.boolean(),
  pide_periodo:  z.boolean(),
  orden:         z.string().refine(v => v === '' || (/^\d{1,4}$/.test(v)), 'Número de 0 a 9999'),
}).superRefine((d, ctx) => {
  if (d.concepto_arca === '1' && d.pide_periodo) {
    ctx.addIssue({ code: 'custom', path: ['pide_periodo'], message: 'Con concepto 1 (productos) no hay período facturado' })
  }
})
type FormData = z.infer<typeof schema>
const CAMPOS: Array<keyof FormData> = ['nombre', 'descripcion', 'concepto_arca', 'pide_obra', 'pide_periodo', 'orden']

function ModalProducto({ producto, onClose }: { producto?: ProductoVenta; onClose: () => void }) {
  const toast = useToast()
  const crear = useCrearProductoVenta()
  const editar = useEditarProductoVenta()
  const [errorServer, setErrorServer] = useState<string | null>(null)
  const { register, handleSubmit, setError, setValue, control, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      nombre:        producto?.nombre ?? '',
      descripcion:   producto?.descripcion ?? '',
      concepto_arca: String(producto?.concepto_arca ?? 2) as FormData['concepto_arca'],
      pide_obra:     producto?.pide_obra ?? false,
      pide_periodo:  producto?.pide_periodo ?? false,
      orden:         producto ? String(producto.orden) : '',
    },
  })
  const concepto = useWatch({ control, name: 'concepto_arca' })
  const guardando = crear.isPending || editar.isPending

  async function guardar(d: FormData) {
    setErrorServer(null)
    const body: ProductoVentaInput = {
      nombre:        d.nombre.trim().replace(/\s+/g, ' '),
      descripcion:   d.descripcion.trim(),
      concepto_arca: Number(d.concepto_arca) as 1 | 2 | 3,
      pide_obra:     d.pide_obra,
      pide_periodo:  d.concepto_arca === '1' ? false : d.pide_periodo,
      ...(d.orden !== '' ? { orden: Number(d.orden) } : {}),
    }
    try {
      if (producto) await editar.mutateAsync({ id: producto.id, ...body })
      else await crear.mutateAsync(body)
      toast(producto ? '✓ Producto actualizado' : '✓ Producto cargado', 'ok')
      onClose()
    } catch (e) {
      const ce = errorDeCampoFacturacion(e)
      if (ce && (CAMPOS as string[]).includes(ce.campo)) {
        setError(ce.campo as keyof FormData, { message: ce.mensaje })
        return
      }
      setErrorServer(mensajeErrorFacturacion(e))
    }
  }

  return (
    <Modal open onClose={guardando ? () => {} : onClose} width="max-w-lg"
      title={producto ? `Editar ${etiquetaProducto(producto.nombre)}` : 'Nuevo producto de venta'}
      footer={
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={guardando}>Cancelar</Button>
          <Button size="sm" loading={guardando} onClick={handleSubmit(guardar)}>{producto ? 'Guardar' : 'Cargar producto'}</Button>
        </div>
      }>
      <form className="flex flex-col gap-3" onSubmit={e => e.preventDefault()}>
        <Input label="Nombre" {...register('nombre')} error={errors.nombre?.message} placeholder="ALQUILER DE EQUIPOS" autoFocus
          hint="Así sale en la factura y en los filtros." />
        <Input label="Descripción (opcional)" {...register('descripcion')} error={errors.descripcion?.message}
          hint="La ayuda que ve quien carga la factura." />
        <Select label="Concepto de ARCA" {...register('concepto_arca', {
          onChange: e => { if (e.target.value === '1') setValue('pide_periodo', false) },
        })}
          options={([1, 2, 3] as const).map(c => ({ value: String(c), label: `${c} · ${CONCEPTO_ARCA_LABEL[c]}` }))}
          error={errors.concepto_arca?.message} />
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input type="checkbox" className="accent-naranja" {...register('pide_obra')} />
          Pide obra (la obra es el centro de costo)
        </label>
        <label className={`flex items-center gap-2 text-sm select-none ${concepto === '1' ? 'opacity-50' : 'cursor-pointer'}`}
          title={concepto === '1' ? 'Con concepto 1 (productos) ARCA no lleva período' : undefined}>
          <input type="checkbox" className="accent-naranja" disabled={concepto === '1'} {...register('pide_periodo')} />
          Pide el período facturado (desde / hasta)
        </label>
        {errors.pide_periodo && <span className="text-xs text-rojo font-semibold">{errors.pide_periodo.message}</span>}
        <Input label="Orden (opcional)" {...register('orden')} error={errors.orden?.message} inputMode="numeric"
          hint="Más chico = más arriba en la lista." />
        {producto && producto.facturas > 0 && (
          <Aviso tono="gris">
            Renombrarlo o cambiarle el concepto vale para las facturas nuevas: las {producto.facturas} que ya lo usan conservan lo que tenían.
          </Aviso>
        )}
        {!producto && (
          <Aviso tono="gris">
            Un producto nuevo necesita su cuenta de ingreso en Contabilidad › Mapeos: hasta entonces sus facturas quedan pendientes de contabilizar.
          </Aviso>
        )}
        {errorServer && <Aviso tono="rojo">{errorServer}</Aviso>}
      </form>
    </Modal>
  )
}
