'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useMateriales, useCreateMaterial, useUpdateMaterial, useDeleteMaterial } from '../hooks/useCertificaciones'
import { useObras } from '@/modules/tarja/hooks/useObras'
import { Modal }    from '@/components/ui/Modal'
import { Button }   from '@/components/ui/Button'
import { Input }    from '@/components/ui/Input'
import { Select }   from '@/components/ui/Select'
import { Combobox } from '@/components/ui/Combobox'
import { useToast } from '@/components/ui/Toast'
import type { CertMaterial, Obra } from '@/types/domain.types'

const UNIDADES = [
  { value: 'unid', label: 'Unidad' },
  { value: 'kg',   label: 'kg' },
  { value: 'tn',   label: 'Tonelada' },
  { value: 'lt',   label: 'Litro' },
  { value: 'm',    label: 'Metro' },
  { value: 'm2',   label: 'm²' },
  { value: 'm3',   label: 'm³' },
  { value: 'gl',   label: 'Global' },
]

function fmtM(n: number) { return '$' + n.toLocaleString('es-AR', { maximumFractionDigits: 0 }) }
function fmtF(s: string) { const [y,m,d] = s.split('-'); return `${d}/${m}/${y}` }

export function MaterialesTab() {
  const toast = useToast()
  const { data: obras = [] }     = useObras()
  const [obraFiltro, setObraFiltro] = useState('')
  const { data: materiales = [] } = useMateriales(obraFiltro || undefined)
  const { mutate: create, isPending: creating } = useCreateMaterial()
  const { mutate: update, isPending: updating } = useUpdateMaterial()
  const { mutate: remove } = useDeleteMaterial()

  const [modalNuevo, setModalNuevo] = useState(false)
  const [editando,   setEditando]   = useState<CertMaterial | null>(null)
  const formNuevo = useForm<any>({ defaultValues: { unidad: 'unid', cantidad: 1, precio_unit: 0 } })
  const formEdit  = useForm<any>()

  const obrasActivas = (obras as Obra[]).filter(o => !o.archivada)
  const obraOptions  = obrasActivas.map(o => ({ value: o.cod, label: `${o.cod} — ${o.nom}`, sub: o.resp ?? undefined }))

  function handleCreate(data: any) {
    if (!data.obra_cod) { toast('Seleccioná una obra', 'err'); return }
    create({
      obra_cod:    data.obra_cod,
      fecha:       data.fecha,
      descripcion: data.descripcion,
      proveedor:   data.proveedor || '',
      cantidad:    Number(data.cantidad),
      unidad:      data.unidad,
      precio_unit: Number(data.precio_unit),
      obs:         data.obs || '',
    }, {
      onSuccess: () => { toast('✓ Material cargado', 'ok'); setModalNuevo(false); formNuevo.reset({ unidad: 'unid', cantidad: 1, precio_unit: 0 }) },
      onError:   () => toast('Error al cargar', 'err'),
    })
  }

  function handleUpdate(data: any) {
    if (!editando) return
    update({ id: editando.id, dto: {
      fecha:       data.fecha,
      descripcion: data.descripcion,
      proveedor:   data.proveedor || '',
      cantidad:    Number(data.cantidad),
      unidad:      data.unidad,
      precio_unit: Number(data.precio_unit),
      obs:         data.obs || '',
    }}, {
      onSuccess: () => { toast('✓ Actualizado', 'ok'); setEditando(null) },
      onError:   () => toast('Error al actualizar', 'err'),
    })
  }

  function openEdit(m: CertMaterial) {
    formEdit.reset({
      fecha: m.fecha, descripcion: m.descripcion, proveedor: m.proveedor ?? '',
      cantidad: m.cantidad, unidad: m.unidad, precio_unit: m.precio_unit, obs: m.obs ?? '',
    })
    setEditando(m)
  }

  const totalGeneral = (materiales as CertMaterial[]).reduce((s, m) => s + m.total, 0)

  const MaterialForm = ({ form, showObra }: { form: any; showObra?: boolean }) => (
    <div className="flex flex-col gap-3">
      {showObra && (
        <Combobox
          label="Obra"
          placeholder="Buscar obra..."
          options={obrasActivas.map(o => ({ value: o.cod, label: `${o.cod} — ${o.nom}`, sub: o.resp ?? undefined }))}
          value={form.watch('obra_cod') ?? ''}
          onChange={(v: string) => form.setValue('obra_cod', v)}
        />
      )}
      <div className="grid grid-cols-2 gap-3">
        <Input label="Fecha" type="date" {...form.register('fecha')} />
        <Input label="Proveedor" placeholder="Nombre proveedor" {...form.register('proveedor')} />
      </div>
      <Input label="Descripción del material" placeholder="Ej: Cemento portland, Arena gruesa..." {...form.register('descripcion')} />
      <div className="grid grid-cols-3 gap-3">
        <Input label="Cantidad" type="number" step="0.001" {...form.register('cantidad')} />
        <Select label="Unidad" options={UNIDADES} {...form.register('unidad')} />
        <Input label="Precio unitario ($)" type="number" step="1" {...form.register('precio_unit')} />
      </div>
      <Input label="Observaciones" placeholder="Notas opcionales..." {...form.register('obs')} />
    </div>
  )

  return (
    <>
      <div className="flex items-center gap-3 flex-wrap justify-between">
        <div className="flex-1 min-w-[220px] max-w-xs">
          <Combobox
            placeholder="Buscar obra..."
            options={obraOptions}
            value={obraFiltro}
            onChange={setObraFiltro}
          />
        </div>
        <Button variant="primary" size="sm" onClick={() => {
          formNuevo.setValue('fecha', new Date().toISOString().slice(0, 10))
          setModalNuevo(true)
        }}>
          ＋ Cargar material
        </Button>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-card shadow-card overflow-x-auto">
        <table className="w-full border-collapse min-w-[700px]">
          <thead>
            <tr>
              {['Obra', 'Fecha', 'Descripción', 'Proveedor', 'Cant.', 'Precio unit.', 'Total', ''].map(h => (
                <th key={h} className="bg-azul text-white text-xs font-bold px-4 py-3 text-left uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(materiales as CertMaterial[]).length === 0 ? (
              <tr><td colSpan={8} className="text-center py-8 text-gris-dark text-sm italic">Sin materiales registrados.</td></tr>
            ) : (materiales as CertMaterial[]).map(m => (
              <tr key={m.id} className="border-b border-gris last:border-0 hover:bg-gris/40 transition-colors">
                <td className="px-4 py-3 font-mono text-xs font-bold text-azul">{m.obra_cod}</td>
                <td className="px-4 py-3 text-sm text-gris-dark font-mono">{fmtF(m.fecha)}</td>
                <td className="px-4 py-3 text-sm text-carbon font-medium">{m.descripcion}</td>
                <td className="px-4 py-3 text-sm text-gris-dark">{m.proveedor || '—'}</td>
                <td className="px-4 py-3 text-sm font-mono text-right">{m.cantidad} {m.unidad}</td>
                <td className="px-4 py-3 text-sm font-mono text-right">{fmtM(m.precio_unit)}</td>
                <td className="px-4 py-3 font-mono font-bold text-right text-carbon">{fmtM(m.total)}</td>
                <td className="px-4 py-3 flex gap-1 justify-end">
                  <button onClick={() => openEdit(m)} className="text-xs px-2 py-1 rounded hover:bg-gris transition-colors">✏️</button>
                  <button onClick={() => { if (confirm('¿Eliminar material?')) remove(m.id, { onSuccess: () => toast('✓ Eliminado', 'ok'), onError: () => toast('Error', 'err') }) }} className="text-xs px-2 py-1 rounded hover:bg-rojo-light text-gris-dark hover:text-rojo transition-colors">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
          {(materiales as CertMaterial[]).length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={6} className="px-4 py-3 text-xs font-bold text-right text-gris-dark uppercase tracking-wide">Total general</td>
                <td className="px-4 py-3 font-mono font-bold text-lg text-naranja">{fmtM(totalGeneral)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <Modal open={modalNuevo} onClose={() => setModalNuevo(false)} title="📦 CARGAR MATERIAL"
        footer={<><Button variant="secondary" onClick={() => setModalNuevo(false)}>Cancelar</Button><Button variant="primary" loading={creating} onClick={formNuevo.handleSubmit(handleCreate)}>✓ Guardar</Button></>}
      >
        <MaterialForm form={formNuevo} showObra />
      </Modal>

      <Modal open={!!editando} onClose={() => setEditando(null)} title="✏️ EDITAR MATERIAL"
        footer={<><Button variant="secondary" onClick={() => setEditando(null)}>Cancelar</Button><Button variant="primary" loading={updating} onClick={formEdit.handleSubmit(handleUpdate)}>✓ Guardar</Button></>}
      >
        <MaterialForm form={formEdit} />
      </Modal>
    </>
  )
}
