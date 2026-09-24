'use client'

import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import { useImputarFactura } from '../hooks/usePagos'
import { useConceptosPagos } from '../hooks/useConceptosPagos'
import { comprobanteTxt, fmtFecha, fmtM } from '../utils/pagos.utils'
import { codigoErrorPagos, mensajeErrorPagos } from '../utils/pagos.errores'
import type { PagosFactura } from '@/types/domain.types'
import { FILA_REPARTO_VACIA, RepartoPorObra, nReparto, repartoCuadra } from './RepartoPorObra'

/**
 * Imputar una factura importada de ARCA (20260927b): elegir el concepto y
 * repartirla por obra. Hasta entonces no se aprueba ni se paga
 * (`FACTURA_SIN_IMPUTAR`). Lo que se reparte es `total − percepciones`, igual
 * que al cargar a mano; por eso si los «otros tributos» de ARCA siguen sin
 * clasificar no se deja imputar (`TRIBUTOS_A_REVISAR`): las percepciones
 * podrían estar mal y el reparto saldría mal.
 */

const filaSchema = z.object({ obra_cod: z.string(), monto: z.string(), obs: z.string() })

function schemaPara(imputable: number) {
  return z.object({
    concepto_id: z.string().min(1, 'Elegí el concepto de la compra'),
    descripcion: z.string().max(300, 'Hasta 300 caracteres').refine(v => v.trim() === '' || v.trim().length >= 3, 'Al menos 3 caracteres'),
    reparto:     z.array(filaSchema).min(1),
  }).superRefine((d, ctx) => {
    if (d.reparto.some(f => !f.obra_cod)) ctx.addIssue({ code: 'custom', path: ['reparto'], message: 'Elegí la obra en cada fila' })
    else if (!repartoCuadra(d.reparto, imputable)) ctx.addIssue({ code: 'custom', path: ['reparto'], message: `El reparto tiene que sumar ${fmtM(imputable)}` })
  })
}
type FormData = z.infer<ReturnType<typeof schemaPara>>

export function ModalImputarFactura({ factura, onClose }: { factura: PagosFactura; onClose: () => void }) {
  const toast = useToast()
  const { puedeEditar } = usePermisos('pagos')
  const conceptos = useConceptosPagos()
  const imputar = useImputarFactura()
  const [errorServer, setErrorServer] = useState<string | null>(null)
  const imputable = Number(factura.imputable)
  const trabada = factura.tributos_a_revisar

  const { control, register, handleSubmit, setError, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schemaPara(imputable)),
    defaultValues: {
      concepto_id: factura.concepto_id ? String(factura.concepto_id) : '',
      descripcion: factura.descripcion ?? '',
      reparto:     [{ ...FILA_REPARTO_VACIA }],
    },
  })
  const reparto = useWatch({ control, name: 'reparto' })

  const bloqueo = !puedeEditar ? 'No tenés permiso para editar facturas'
    : trabada ? 'Primero clasificá los otros tributos (con «Completar desglose», desde la ficha)'
    : !repartoCuadra(reparto, imputable) ? 'El reparto por obra tiene que cuadrar'
    : null

  async function guardar(d: FormData) {
    setErrorServer(null)
    const desc = d.descripcion.trim()
    try {
      await imputar.mutateAsync({
        id: factura.id,
        concepto_id: Number(d.concepto_id),
        imputaciones: d.reparto.map(f => ({ obra_cod: f.obra_cod, monto: nReparto(f.monto), ...(f.obs ? { obs: f.obs } : {}) })),
        ...(desc && desc !== (factura.descripcion ?? '').trim() ? { descripcion: desc } : {}),
      })
      toast('✓ Factura imputada: ya se puede aprobar', 'ok')
      onClose()
    } catch (e) {
      const cod = codigoErrorPagos(e)
      const msg = mensajeErrorPagos(e)
      if (cod === 'CONCEPTO_REQUERIDO' || cod === 'CONCEPTO_INVALIDO') setError('concepto_id', { message: msg })
      else if (cod === 'DESCRIPCION_REQUERIDA') setError('descripcion', { message: msg })
      setErrorServer(msg)
    }
  }

  const activos = (conceptos.data ?? []).filter(c => c.activo)

  return (
    <Modal open onClose={imputar.isPending ? () => {} : onClose} width="max-w-2xl"
      title={`Imputar · ${comprobanteTxt(factura.tipo_comprobante, factura.numero, factura.clase)} · ${factura.proveedor_nom}`}
      footer={<>
        <Button variant="ghost" size="sm" onClick={onClose} disabled={imputar.isPending}>Cancelar</Button>
        <Button size="sm" onClick={handleSubmit(guardar)} loading={imputar.isPending} disabled={!!bloqueo}
          title={bloqueo ?? 'Guardar el concepto y el reparto: después se aprueba como cualquier otra'}>
          Imputar
        </Button>
      </>}>
      <form className="flex flex-col gap-3 text-sm" onSubmit={e => e.preventDefault()}>
        <div className="text-xs text-gris-dark">
          Emitida el {fmtFecha(factura.fecha)} · total <b className="font-mono tabular-nums">{fmtM(factura.total)}</b>
          {Number(factura.percepciones ?? 0) > 0 && <> · percepciones {fmtM(factura.percepciones)} (no se reparten)</>}
        </div>

        {trabada && (
          <div className="border rounded p-2 text-xs bg-naranja-light border-naranja/30 text-naranja-dark">
            ARCA informa «otros tributos» sin decir cuáles. Primero clasificalos con <b>Completar desglose</b> (desde la ficha):
            si alguno es una percepción, no se reparte a las obras.
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-semibold text-gris-dark mb-1">Concepto</label>
            <select {...register('concepto_id')} disabled={conceptos.isLoading || trabada}
              className="w-full px-2.5 py-2 border-[1.5px] border-gris-mid rounded text-sm bg-white outline-none focus:border-naranja disabled:bg-gris">
              <option value="">{conceptos.isLoading ? 'Cargando…' : conceptos.isError ? 'No se pudo traer la lista' : 'Elegí el concepto…'}</option>
              {activos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            {errors.concepto_id && <div className="text-xs text-rojo mt-0.5">{errors.concepto_id.message}</div>}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gris-dark mb-1">Descripción <span className="font-normal">· qué se compró</span></label>
            <input {...register('descripcion')} maxLength={300} disabled={trabada}
              className="w-full px-2.5 py-2 border-[1.5px] border-gris-mid rounded text-sm bg-white outline-none focus:border-naranja disabled:bg-gris" />
            {errors.descripcion && <div className="text-xs text-rojo mt-0.5">{errors.descripcion.message}</div>}
          </div>
        </div>

        <Controller control={control} name="reparto" render={({ field }) => (
          <RepartoPorObra filas={field.value} onChange={f => field.onChange(f)} imputable={imputable} disabled={trabada}
            detalleImputable={Number(factura.percepciones ?? 0) > 0 && <span className="text-gris-dark"> (total − percepciones)</span>} />
        )} />
        {errors.reparto && <div className="text-xs text-rojo -mt-1">{errors.reparto.message ?? errors.reparto.root?.message}</div>}

        {errorServer && <div className="border rounded p-2 text-xs bg-rojo-light border-rojo/30 text-rojo">{errorServer}</div>}
      </form>
    </Modal>
  )
}
