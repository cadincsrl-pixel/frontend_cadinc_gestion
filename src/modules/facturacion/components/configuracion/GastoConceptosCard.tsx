'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import type { VentasGastoConcepto, VentasGastoConceptoInput } from '@/types/domain.types'
import { useCrearGastoConcepto, useEditarGastoConcepto, useGastoConceptos } from '../../hooks/useConfigVentas'
import { errorDeCampoFacturacion, mensajeErrorFacturacion } from '../../utils/facturacion.errores'
import { Aviso } from '../FichaFactura'

/**
 * Ventas › Configuración › Gastos descontados (20260930k). Lo que el cliente
 * descuenta al pagar (Recupero Ley 25413, seguro de carga, pago de playa,
 * faltantes…): se elige en el cobro y «Cargar liquidación» lo reconoce por el
 * nombre o por los sinónimos. Cada concepto necesita su cuenta en
 * Contabilidad › Mapeos (Gastos descontados en cobros). No se borran: se dan
 * de baja. Escribir pide el flag `configurar`.
 */
export function GastoConceptosCard() {
  const toast = useToast()
  const { configurar } = usePermisos('facturacion')
  const [inactivos, setInactivos] = useState(false)
  const [editando, setEditando] = useState<{ open: boolean; concepto?: VentasGastoConcepto }>({ open: false })
  const lista = useGastoConceptos(true)
  const editar = useEditarGastoConcepto()
  const tip = configurar ? undefined : 'Necesitás el permiso «Configurar» de Ventas'
  const visibles = lista.conceptos.filter(c => inactivos || c.activo)

  async function cambiarActivo(c: VentasGastoConcepto) {
    try {
      await editar.mutateAsync({ id: c.id, activo: !c.activo })
      toast(c.activo ? `${c.nombre} dado de baja` : `✓ ${c.nombre} reactivado`, 'ok')
    } catch (e) {
      toast(mensajeErrorFacturacion(e), 'err')
    }
  }

  return (
    <div className="bg-white rounded-card shadow-card p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <div className="text-sm font-bold">Gastos descontados en cobros</div>
          <div className="text-[11px] text-gris-dark">
            Lo que el cliente descuenta al pagar (impuesto al cheque, seguro de carga…). Los sinónimos son los textos con que aparece en su liquidación.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-gris-dark cursor-pointer select-none">
            <input type="checkbox" className="accent-naranja" checked={inactivos} onChange={e => setInactivos(e.target.checked)} />
            Dados de baja
          </label>
          <Button size="sm" variant="secondary" disabled={!configurar} title={tip ?? 'Cargar un concepto nuevo'}
            onClick={() => setEditando({ open: true })}>+ Concepto</Button>
        </div>
      </div>

      {lista.isLoading && <div className="py-3 text-sm text-gris-dark">Cargando…</div>}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-gris-dark border-b border-gris">
              <th className="py-1.5 pr-2">Concepto</th>
              <th className="py-1.5 pr-2">Sinónimos</th>
              <th className="py-1.5 pr-2 text-right">Cargados</th>
              <th className="py-1.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gris">
            {visibles.map(c => (
              <tr key={c.id} className={c.activo ? '' : 'opacity-60'}>
                <td className="py-2 pr-2 align-top">
                  <div className="font-semibold">
                    {c.nombre}
                    {!c.activo && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-gris text-gris-dark font-bold">dado de baja</span>}
                    {!c.mapeado && (
                      <Link href="/contabilidad?tab=mapeos&clave=cobros.gasto"
                        title="Sin cuenta contable: los cobros con este gasto quedan pendientes de contabilizar. Mapealo en Contabilidad › Mapeos (Gastos descontados en cobros)."
                        className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-naranja-light text-naranja-dark font-bold hover:underline">
                        sin mapeo contable
                      </Link>
                    )}
                  </div>
                </td>
                <td className="py-2 pr-2 align-top text-xs text-gris-dark">{c.alias.length ? c.alias.join(' · ') : '—'}</td>
                <td className="py-2 pr-2 align-top text-right font-mono">{c.gastos}</td>
                <td className="py-2 align-top">
                  <div className="flex gap-1 justify-end flex-wrap">
                    <Button variant="ghost" size="sm" disabled={!configurar} title={tip ?? 'Editar'}
                      onClick={() => setEditando({ open: true, concepto: c })}>✏️ Editar</Button>
                    <Button variant="ghost" size="sm" disabled={!configurar}
                      title={tip ?? (c.activo ? 'Dar de baja: no se ofrece más en cobros nuevos' : 'Reactivar')}
                      loading={editar.isPending && editar.variables?.id === c.id && editar.variables?.activo !== undefined}
                      onClick={() => cambiarActivo(c)}>
                      {c.activo ? 'Dar de baja' : 'Reactivar'}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {!lista.isLoading && visibles.length === 0 && (
              <tr><td colSpan={4} className="py-3 text-sm text-gris-dark italic">No hay conceptos.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {lista.error && <Aviso tono="rojo">{mensajeErrorFacturacion(lista.error)}</Aviso>}
      {editando.open && <ModalGastoConcepto concepto={editando.concepto} onClose={() => setEditando({ open: false })} />}
    </div>
  )
}

const schema = z.object({
  nombre: z.string().refine(v => v.trim().length >= 2 && v.trim().length <= 80, 'Entre 2 y 80 caracteres'),
  alias:  z.string().refine(v => sinonimos(v).every(a => a.length >= 3 && a.length <= 60), 'Cada sinónimo, de 3 a 60 caracteres')
    .refine(v => sinonimos(v).length <= 30, 'Hasta 30 sinónimos'),
  orden:  z.string().refine(v => v === '' || /^\d{1,4}$/.test(v), 'Número de 0 a 9999'),
})
type FormData = z.infer<typeof schema>

/** «seguro de carga, pago seguro de carga» → ['seguro de carga', 'pago seguro de carga']. */
export function sinonimos(txt: string): string[] {
  return [...new Set(txt.split(/[,;\n]/).map(s => s.trim().replace(/\s+/g, ' ')).filter(Boolean))]
}

/**
 * Alta / edición de un concepto. Con `inicial`, el alta arranca con ese nombre
 * y sinónimo (lo usa «Cargar liquidación» para crear el concepto de un
 * renglón que no reconoció); `onGuardado` recibe el concepto guardado.
 */
export function ModalGastoConcepto({ concepto, inicial, onClose, onGuardado }: {
  concepto?: VentasGastoConcepto
  inicial?: { nombre: string; alias: string }
  onClose: () => void
  onGuardado?: (c: VentasGastoConcepto) => void
}) {
  const toast = useToast()
  const crear = useCrearGastoConcepto()
  const editar = useEditarGastoConcepto()
  const [errorServer, setErrorServer] = useState<string | null>(null)
  const { register, handleSubmit, setError, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      nombre: concepto?.nombre ?? inicial?.nombre ?? '',
      alias:  concepto ? concepto.alias.join(', ') : (inicial?.alias ?? ''),
      orden:  concepto ? String(concepto.orden) : '',
    },
  })
  const guardando = crear.isPending || editar.isPending

  async function guardar(d: FormData) {
    setErrorServer(null)
    const body: VentasGastoConceptoInput = {
      nombre: d.nombre.trim().replace(/\s+/g, ' '),
      alias:  sinonimos(d.alias),
      ...(d.orden !== '' ? { orden: Number(d.orden) } : {}),
    }
    try {
      const r = concepto ? await editar.mutateAsync({ id: concepto.id, ...body }) : await crear.mutateAsync(body)
      toast(concepto ? '✓ Concepto actualizado' : '✓ Concepto cargado', 'ok')
      onGuardado?.(r)
      onClose()
    } catch (e) {
      const ce = errorDeCampoFacturacion(e)
      if (ce && ['nombre', 'alias', 'orden'].includes(ce.campo)) {
        setError(ce.campo as keyof FormData, { message: ce.mensaje })
        return
      }
      setErrorServer(mensajeErrorFacturacion(e))
    }
  }

  return (
    <Modal open onClose={guardando ? () => {} : onClose} width="max-w-lg"
      title={concepto ? `Editar ${concepto.nombre}` : 'Nuevo concepto de gasto descontado'}
      footer={
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={guardando}>Cancelar</Button>
          <Button size="sm" loading={guardando} onClick={handleSubmit(guardar)}>{concepto ? 'Guardar' : 'Cargar concepto'}</Button>
        </div>
      }>
      <form className="flex flex-col gap-3" onSubmit={e => e.preventDefault()}>
        <Input label="Nombre" {...register('nombre')} error={errors.nombre?.message} placeholder="Seguro de carga" autoFocus
          hint="Así sale en el cobro, en el recibo y en Contabilidad › Mapeos." />
        <Input label="Sinónimos (opcional)" {...register('alias')} error={errors.alias?.message} placeholder="pago seguro de carga, seguro de carga"
          hint="Separados por coma: los textos con que aparece en la liquidación del cliente. Palabras enteras; mayúsculas y acentos no importan." />
        <Input label="Orden (opcional)" {...register('orden')} error={errors.orden?.message} inputMode="numeric"
          hint="Más chico = más arriba en la lista del cobro." />
        {!concepto && (
          <Aviso tono="gris">
            Un concepto nuevo necesita su cuenta en Contabilidad › Mapeos (Gastos descontados en cobros): hasta entonces sus cobros quedan pendientes de contabilizar.
          </Aviso>
        )}
        {errorServer && <Aviso tono="rojo">{errorServer}</Aviso>}
      </form>
    </Modal>
  )
}
