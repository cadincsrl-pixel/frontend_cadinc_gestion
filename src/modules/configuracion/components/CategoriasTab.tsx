'use client'

import { useState } from 'react'
import { useCategorias, useCreateCategoria, useUpdateCategoria, useDeleteCategoria } from '@/modules/tarja/hooks/useCategorias'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import type { Categoria } from '@/types/domain.types'

const schema = z.object({
  nom: z.string().min(1, 'El nombre es requerido'),
  vh: z.coerce.number().min(0, 'El valor hora no puede ser negativo'),
})

type FormData = z.infer<typeof schema>

export function CategoriasTab() {
  const toast = useToast()
  const { data: categorias = [], isLoading } = useCategorias()
  const { mutate: create, isPending: creating } = useCreateCategoria()
  const { mutate: update, isPending: updating } = useUpdateCategoria()
  const { mutate: remove } = useDeleteCategoria()

  const [modalNuevo, setModalNuevo] = useState(false)
  const [editando, setEditando] = useState<Categoria | null>(null)

  const formNuevo = useForm<FormData>({ resolver: zodResolver(schema) as any })
  const formEdit = useForm<FormData>({ resolver: zodResolver(schema) as any })

  function handleCreate(data: FormData) {
    create(data, {
      onSuccess: () => {
        toast('✓ Categoría creada', 'ok')
        setModalNuevo(false)
        formNuevo.reset()
      },
      onError: () => toast('Error al crear', 'err'),
    })
  }

  function handleUpdate(data: FormData) {
    if (!editando) return
    update(
      { id: editando.id, dto: data },
      {
        onSuccess: () => {
          toast('✓ Categoría actualizada', 'ok')
          setEditando(null)
        },
        onError: () => toast('Error al actualizar', 'err'),
      }
    )
  }

  function handleDelete(cat: Categoria) {
    if (!confirm(`¿Eliminar la categoría "${cat.nom}"? Esta acción no se puede deshacer.`)) return
    remove(cat.id, {
      onSuccess: () => toast('✓ Categoría eliminada', 'ok'),
      onError: () => toast('No se puede eliminar — hay trabajadores con esta categoría', 'err'),
    })
  }

  function openEdit(cat: Categoria) {
    formEdit.reset({ nom: cat.nom, vh: cat.vh })
    setEditando(cat)
  }

  const CatForm = ({ form, errors }: { form: any; errors: any }) => (
    <div className="flex flex-col gap-4">
      <Input
        label="Nombre de la categoría"
        placeholder="Ej: Oficial Albañil"
        error={errors.nom?.message}
        {...form.register('nom')}
      />
      <Input
        label="Valor hora global ($)"
        type="number"
        placeholder="0"
        step="50"
        hint="Este es el precio base. Cada obra puede personalizarlo."
        error={errors.vh?.message}
        {...form.register('vh')}
      />
    </div>
  )

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-bold text-azul text-base">
            Categorías de personal ({categorias.length})
          </h2>
          <p className="text-xs text-gris-dark mt-0.5">
            Define los roles y tarifas globales. Cada obra puede personalizar sus propias tarifas.
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setModalNuevo(true)}>
          ＋ Nueva categoría
        </Button>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-card shadow-card overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="bg-azul text-white text-xs font-bold px-4 py-3 text-left uppercase tracking-wide">
                Categoría
              </th>
              <th className="bg-azul text-white text-xs font-bold px-4 py-3 text-right uppercase tracking-wide">
                Valor hora global
              </th>
              <th className="bg-azul text-white text-xs font-bold px-4 py-3 text-right uppercase tracking-wide">
                Personal asignado
              </th>
              <th className="bg-azul text-white text-xs font-bold px-4 py-3 w-20" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={4} className="text-center py-8">
                  <span className="inline-flex items-center gap-2 text-gris-dark text-sm">
                    <span className="w-4 h-4 border-2 border-naranja border-t-transparent rounded-full animate-spin" />
                    Cargando...
                  </span>
                </td>
              </tr>
            ) : categorias.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center py-8 text-gris-dark text-sm">
                  No hay categorías configuradas.
                </td>
              </tr>
            ) : (
              categorias.map(cat => (
                <tr
                  key={cat.id}
                  className="border-b border-gris last:border-0 hover:bg-gris/40 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-naranja-light flex items-center justify-center text-naranja-dark font-bold text-sm flex-shrink-0">
                        {cat.nom.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-bold text-sm text-carbon">{cat.nom}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-mono font-bold text-verde text-sm">
                      ${cat.vh.toLocaleString('es-AR')}/h
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-mono text-xs text-gris-dark">
                      —
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 justify-end">
                      <button
                        onClick={() => openEdit(cat)}
                        className="text-xs font-bold px-2 py-1 rounded hover:bg-gris transition-colors"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleDelete(cat)}
                        className="text-xs font-bold px-2 py-1 rounded hover:bg-rojo-light text-gris-dark hover:text-rojo transition-colors"
                      >
                        ✕
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal nuevo */}
      <Modal
        open={modalNuevo}
        onClose={() => setModalNuevo(false)}
        title="💼 NUEVA CATEGORÍA"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalNuevo(false)}>Cancelar</Button>
            <Button variant="primary" loading={creating} onClick={formNuevo.handleSubmit(handleCreate)}>
              ✓ Guardar
            </Button>
          </>
        }
      >
        <CatForm form={formNuevo} errors={formNuevo.formState.errors} />
      </Modal>

      {/* Modal editar */}
      <Modal
        open={!!editando}
        onClose={() => setEditando(null)}
        title="✏️ EDITAR CATEGORÍA"
        footer={
          <>
            <Button
              variant="danger"
              onClick={() => editando && handleDelete(editando)}
              className="mr-auto"
            >
              🗑 Eliminar
            </Button>
            <Button variant="secondary" onClick={() => setEditando(null)}>Cancelar</Button>
            <Button variant="primary" loading={updating} onClick={formEdit.handleSubmit(handleUpdate)}>
              ✓ Guardar
            </Button>
          </>
        }
      >
        <CatForm form={formEdit} errors={formEdit.formState.errors} />
      </Modal>
    </>
  )
}