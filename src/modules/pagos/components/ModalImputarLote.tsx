'use client'

import { useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Combobox } from '@/components/ui/Combobox'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import { useCatalogoObrasPagos, useImputarLote } from '../hooks/usePagos'
import { useConceptosPagos } from '../hooks/useConceptosPagos'
import { fmtM } from '../utils/pagos.utils'
import { detalleErrorPagos, mensajeErrorPagos } from '../utils/pagos.errores'
import type { PagosFactura } from '@/types/domain.types'

/**
 * «Imputar…» en lote (20260927b): las importadas seleccionadas, con UN
 * concepto y el 100 % a UNA obra. Todo o nada: si una falla no se imputa
 * ninguna y el error dice cuál. Las que tienen «otros tributos» sin
 * clasificar quedan afuera (no se pueden repartir hasta clasificarlos) y se
 * avisa cuántas.
 */

const schema = z.object({
  concepto_id: z.string().min(1, 'Elegí el concepto'),
  obra_cod:    z.string().min(1, 'Elegí la obra'),
})
type FormData = z.infer<typeof schema>

const MAX_LOTE = 200

export function ModalImputarLote({ facturas, onClose, onHecho }: {
  facturas: PagosFactura[]
  onClose:  () => void
  onHecho?: () => void
}) {
  const toast = useToast()
  const { puedeEditar } = usePermisos('pagos')
  const conceptos = useConceptosPagos()
  const obras = useCatalogoObrasPagos()
  const imputar = useImputarLote()
  const [errorServer, setErrorServer] = useState<string | null>(null)

  const aptas = useMemo(() => facturas.filter(f => f.sin_imputar && !f.tributos_a_revisar && f.estado !== 'anulada'), [facturas])
  const trabadas = facturas.filter(f => f.sin_imputar && f.tributos_a_revisar).length
  const yaImputadas = facturas.filter(f => !f.sin_imputar).length
  const totalImputable = aptas.reduce((s, f) => s + Number(f.imputable), 0)
  const proveedores = new Set(aptas.map(f => f.proveedor_id)).size

  const { control, register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { concepto_id: '', obra_cod: '' },
  })

  // Las archivadas también: siguen siendo centro de costo (20261001s).
  const obrasOpts = useMemo(() => (obras.data ?? []).map(o => ({
    value: o.cod, label: o.nom, sub: o.cod + (o.archivada ? ' · archivada' : ''),
    group: o.archivada ? 'Archivadas' : o.es_interna || o.es_deposito ? 'Estructura CADINC' : 'Obras',
    search: [o.nom, o.cod, o.cc ?? ''],
  })), [obras.data])

  const bloqueo = !puedeEditar ? 'No tenés permiso para editar facturas'
    : aptas.length === 0 ? 'De lo seleccionado no hay importadas sin imputar que se puedan repartir'
    : aptas.length > MAX_LOTE ? `Son ${aptas.length}: el máximo es ${MAX_LOTE} por vez`
    : null

  async function guardar(d: FormData) {
    setErrorServer(null)
    try {
      const r = await imputar.mutateAsync({ ids: aptas.map(f => f.id), concepto_id: Number(d.concepto_id), obra_cod: d.obra_cod })
      toast(`✓ ${r.imputadas} factura${r.imputadas === 1 ? '' : 's'} imputada${r.imputadas === 1 ? '' : 's'}`, 'ok')
      onHecho?.()
      onClose()
    } catch (e) {
      // Todo o nada: el detail trae cuál falló.
      const idFallo = Number(detalleErrorPagos(e)?.factura_id)
      const cual = Number.isInteger(idFallo) ? aptas.find(f => f.id === idFallo) : undefined
      setErrorServer(`${mensajeErrorPagos(e)}${cual ? ` (factura de ${cual.proveedor_nom}, ${cual.numero ?? 's/n'})` : ''} No se imputó ninguna.`)
    }
  }

  return (
    <Modal open onClose={imputar.isPending ? () => {} : onClose} width="max-w-lg" title="Imputar en lote"
      footer={<>
        <Button variant="ghost" size="sm" onClick={onClose} disabled={imputar.isPending}>Cancelar</Button>
        <Button size="sm" onClick={handleSubmit(guardar)} loading={imputar.isPending} disabled={!!bloqueo}
          title={bloqueo ?? `Imputar ${aptas.length} al 100 % a la obra elegida`}>
          Imputar {aptas.length}
        </Button>
      </>}>
      <form className="flex flex-col gap-3 text-sm" onSubmit={e => e.preventDefault()}>
        <div className="grid grid-cols-3 gap-2">
          <Dato label="Facturas" valor={String(aptas.length)} />
          <Dato label="Proveedores" valor={String(proveedores)} />
          <Dato label="A repartir" valor={fmtM(totalImputable)} />
        </div>
        {(trabadas > 0 || yaImputadas > 0) && (
          <div className="border rounded p-2 text-xs bg-amarillo-light border-amarillo/40 text-[#7A5000]">
            Quedan afuera{' '}
            {[trabadas > 0 && `${trabadas} con otros tributos sin clasificar (se imputan una por una después de clasificarlos)`,
              yaImputadas > 0 && `${yaImputadas} que ya estaban imputadas`].filter(Boolean).join(' y ')}.
          </div>
        )}
        <p className="text-xs text-gris-dark">
          Cada factura va <b>entera</b> (total menos percepciones) a la obra elegida, con el mismo concepto. Si alguna tiene que
          repartirse entre varias obras, imputala sola desde su ficha.
        </p>
        <div>
          <label className="block text-xs font-semibold text-gris-dark mb-1">Concepto</label>
          <select {...register('concepto_id')} disabled={conceptos.isLoading}
            className="w-full px-2.5 py-2 border-[1.5px] border-gris-mid rounded text-sm bg-white outline-none focus:border-naranja">
            <option value="">{conceptos.isLoading ? 'Cargando…' : conceptos.isError ? 'No se pudo traer la lista' : 'Elegí el concepto…'}</option>
            {(conceptos.data ?? []).filter(c => c.activo).map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          {errors.concepto_id && <div className="text-xs text-rojo mt-0.5">{errors.concepto_id.message}</div>}
        </div>
        <Controller control={control} name="obra_cod" render={({ field }) => (
          <div>
            <Combobox label="Obra (100 %)" placeholder={obras.isLoading ? 'Cargando obras…' : 'Elegí la obra…'}
              options={obrasOpts} value={field.value} onChange={field.onChange} />
            {errors.obra_cod && <div className="text-xs text-rojo mt-0.5">{errors.obra_cod.message}</div>}
          </div>
        )} />
        {errorServer && <div className="border rounded p-2 text-xs bg-rojo-light border-rojo/30 text-rojo">{errorServer}</div>}
      </form>
    </Modal>
  )
}

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="px-2 py-1.5 rounded border border-gris-mid">
      <div className="text-[10px] font-bold text-gris-dark uppercase">{label}</div>
      <div className="font-mono font-bold tabular-nums">{valor}</div>
    </div>
  )
}
