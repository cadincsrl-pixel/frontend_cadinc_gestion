'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api/client'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import type { HerrTipo, HerrMovTipo, HerrConfig, HerrMarca, HerrModelo } from '@/types/domain.types'
import {
  useHerrMarcas,
  useCreateMarca,
  useUpdateMarca,
  useDeleteMarca,
  useCreateModelo,
  useUpdateModelo,
  useDeleteModelo,
} from '../hooks/useHerramientas'

type ParamTab = 'tipos' | 'movimientos' | 'marcas'

export function HerrParametros() {
  const [tab, setTab] = useState<ParamTab>('tipos')

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4">
      <div>
        <h1 className="font-display text-[2rem] tracking-wider text-azul">PARÁMETROS</h1>
        <p className="text-sm text-gris-dark mt-0.5">
          Tipos de herramienta, tipos de movimiento y catálogo de marcas/modelos
        </p>
      </div>

      <div className="flex gap-1 bg-white rounded-card shadow-card p-1.5 w-fit flex-wrap">
        {[
          { id: 'tipos', icon: '🔧', label: 'Tipos de herramienta' },
          { id: 'movimientos', icon: '↔', label: 'Tipos de movimiento' },
          { id: 'marcas', icon: '🏷️', label: 'Marcas y modelos' },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as ParamTab)}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition-all
              ${tab === t.id
                ? 'bg-azul text-white shadow-sm'
                : 'text-gris-dark hover:bg-gris hover:text-carbon'
              }
            `}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === 'tipos' && <TiposTab />}
      {tab === 'movimientos' && <MovTiposTab />}
      {tab === 'marcas' && <MarcasTab />}
    </div>
  )
}

// ── Tipos de herramienta ──
function TiposTab() {
  const toast = useToast()

  const { data: tipos = [], isLoading, refetch } = useQuery({
    queryKey: ['herr-tipos'],
    queryFn: async (): Promise<HerrTipo[]> => {
      const r = await apiGet<{ tipos: HerrTipo[]; estados: any[]; movTipos: any[] }>('/api/herramientas/config')
      if (!r || !r.tipos) return []
      return r.tipos
    },
    staleTime: 0,
  })

  const [modalNuevo, setModalNuevo] = useState(false)
  const [editando, setEditando] = useState<HerrTipo | null>(null)
  const [nom, setNom] = useState('')
  const [icono, setIcono] = useState('')

  const { mutate: create, isPending: creating } = useMutation({
    mutationFn: (dto: any) => apiPost('/api/herramientas/config/tipos', dto),
    onSuccess: () => {
      refetch()
      toast('✓ Tipo creado', 'ok')
      setModalNuevo(false)
      setNom(''); setIcono('')
    },
    onError: () => toast('Error al crear', 'err'),
  })

  const { mutate: update, isPending: updating } = useMutation({
    mutationFn: ({ id, dto }: any) => apiPatch(`/api/herramientas/config/tipos/${id}`, dto),
    onSuccess: () => {
      refetch()
      toast('✓ Tipo actualizado', 'ok')
      setEditando(null)
    },
    onError: () => toast('Error al actualizar', 'err'),
  })

  const { mutate: remove } = useMutation({
    mutationFn: (id: number) => apiDelete(`/api/herramientas/config/tipos/${id}`),
    onSuccess: () => { refetch(); toast('✓ Tipo eliminado', 'ok') },
    onError: () => toast('No se puede eliminar — hay herramientas con este tipo', 'err'),
  })

  function openEdit(t: HerrTipo) {
    setNom(t.nom); setIcono(t.icono ?? '')
    setEditando(t)
  }

  return (
    <>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-bold text-azul text-base">
            Tipos de herramienta ({tipos.length})
          </h2>
          <p className="text-xs text-gris-dark mt-0.5">Clasificación de herramientas por tipo.</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => { setNom(''); setIcono(''); setModalNuevo(true) }}>
          ＋ Nuevo tipo
        </Button>
      </div>

      <div className="bg-white rounded-card shadow-card overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {['Icono', 'Nombre', 'Orden', 'Estado', 'Acciones'].map((h, i) => (
                <th key={i} className="bg-azul text-white text-xs font-bold px-4 py-3 text-left uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="text-center py-8">
                  <span className="inline-flex items-center gap-2 text-gris-dark text-sm">
                    <span className="w-4 h-4 border-2 border-naranja border-t-transparent rounded-full animate-spin" />
                    Cargando...
                  </span>
                </td>
              </tr>
            ) : tipos.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-8 text-gris-dark text-sm">
                  No hay tipos configurados
                </td>
              </tr>
            ) : tipos.map(t => (
              <tr key={t.id} className="border-b border-gris last:border-0 hover:bg-gris/40 transition-colors">
                <td className="px-4 py-3 text-2xl">{t.icono ?? '—'}</td>
                <td className="px-4 py-3 font-bold text-sm text-carbon">{t.nom}</td>
                <td className="px-4 py-3 font-mono text-xs text-gris-dark">{t.orden}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${t.activo ? 'bg-verde-light text-verde' : 'bg-gris text-gris-dark'}`}>
                    {t.activo ? '✓ Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1 justify-end">
                    <button
                      onClick={() => openEdit(t)}
                      className="text-xs px-2 py-1 rounded hover:bg-gris transition-colors"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => confirm(`¿Eliminar "${t.nom}"?`) && remove(t.id)}
                      className="text-xs px-2 py-1 rounded hover:bg-rojo-light hover:text-rojo transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={modalNuevo || !!editando}
        onClose={() => { setModalNuevo(false); setEditando(null) }}
        title={editando ? '✏️ EDITAR TIPO' : '🔧 NUEVO TIPO'}
        footer={
          <>
            <Button variant="secondary" onClick={() => { setModalNuevo(false); setEditando(null) }}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              loading={creating || updating}
              onClick={() => {
                if (!nom.trim()) return
                if (editando) update({ id: editando.id, dto: { nom, icono } })
                else create({ nom, icono })
              }}
            >
              ✓ Guardar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">
              Nombre *
            </label>
            <input
              type="text"
              value={nom}
              onChange={e => setNom(e.target.value)}
              placeholder="Ej: Eléctrica"
              className="px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none focus:border-naranja transition-colors"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">
              Ícono (emoji)
            </label>
            <input
              type="text"
              value={icono}
              onChange={e => setIcono(e.target.value)}
              placeholder="⚡"
              className="px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none focus:border-naranja transition-colors w-24"
            />
          </div>
        </div>
      </Modal>
    </>
  )
}

// ── Tipos de movimiento ──
function MovTiposTab() {
  const toast = useToast()

  const { data: movTipos = [], isLoading, refetch } = useQuery({
    queryKey: ['herr-mov-tipos'],
    queryFn: async (): Promise<HerrMovTipo[]> => {
      const r = await apiGet<{ tipos: any[]; estados: any[]; movTipos: HerrMovTipo[] }>('/api/herramientas/config')
      if (!r || !r.movTipos) return []
      return r.movTipos
    },
    staleTime: 0,
  })

  const [editando, setEditando] = useState<HerrMovTipo | null>(null)
  const [nom, setNom] = useState('')
  const [icono, setIcono] = useState('')
  const [desc, setDesc] = useState('')

  const { mutate: update, isPending: updating } = useMutation({
    mutationFn: ({ key, dto }: any) => apiPatch(`/api/herramientas/config/mov-tipos/${key}`, dto),
    onSuccess: () => {
      refetch()
      toast('✓ Tipo actualizado', 'ok')
      setEditando(null)
    },
    onError: () => toast('Error al actualizar', 'err'),
  })

  function openEdit(t: HerrMovTipo) {
    setNom(t.nom); setIcono(t.icono ?? ''); setDesc(t.descripcion ?? '')
    setEditando(t)
  }

  const COLOR_BADGE: Record<string, string> = {
    verde: 'bg-verde-light text-verde',
    naranja: 'bg-naranja-light text-naranja-dark',
    rojo: 'bg-rojo-light text-rojo',
    azul: 'bg-azul-light text-azul-mid',
    gris: 'bg-gris text-gris-dark',
  }

  return (
    <>
      <div>
        <h2 className="font-bold text-azul text-base">
          Tipos de movimiento ({movTipos.length})
        </h2>
        <p className="text-xs text-gris-dark mt-0.5">
          Los tipos de movimiento controlan cómo cambia el estado de una herramienta. Solo se pueden editar, no eliminar.
        </p>
      </div>

      <div className="bg-white rounded-card shadow-card overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {['Icono', 'Nombre', 'Descripción', 'Color', 'Acciones'].map((h, i) => (
                <th key={i} className="bg-azul text-white text-xs font-bold px-4 py-3 text-left uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="text-center py-8">
                  <span className="inline-flex items-center gap-2 text-gris-dark text-sm">
                    <span className="w-4 h-4 border-2 border-naranja border-t-transparent rounded-full animate-spin" />
                    Cargando...
                  </span>
                </td>
              </tr>
            ) : movTipos.map(t => (
              <tr key={t.key} className="border-b border-gris last:border-0 hover:bg-gris/40 transition-colors">
                <td className="px-4 py-3">
                  <span className={`text-xs font-bold px-2 py-1 rounded ${COLOR_BADGE[t.color] ?? 'bg-gris text-gris-dark'}`}>
                    {t.icono} {t.nom}
                  </span>
                </td>
                <td className="px-4 py-3 font-bold text-sm text-carbon">{t.nom}</td>
                <td className="px-4 py-3 text-xs text-gris-dark">{t.descripcion ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className="font-mono text-xs text-gris-dark">{t.color}</span>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => openEdit(t)}
                    className="text-xs px-2 py-1 rounded hover:bg-gris transition-colors"
                  >
                    ✏️
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={!!editando}
        onClose={() => setEditando(null)}
        title="✏️ EDITAR TIPO DE MOVIMIENTO"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditando(null)}>Cancelar</Button>
            <Button
              variant="primary"
              loading={updating}
              onClick={() => {
                if (!editando) return
                update({ key: editando.key, dto: { nom, icono, descripcion: desc } })
              }}
            >
              ✓ Guardar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="bg-gris rounded-xl px-3 py-2 text-xs text-gris-dark">
            <span className="font-bold">Key:</span> <span className="font-mono">{editando?.key}</span>
            {' · '}
            <span className="font-bold">Color:</span> <span className="font-mono">{editando?.color}</span>
            {' (estos campos no se pueden cambiar)'}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">Nombre</label>
            <input
              type="text"
              value={nom}
              onChange={e => setNom(e.target.value)}
              className="px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none focus:border-naranja transition-colors"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">Ícono (emoji)</label>
            <input
              type="text"
              value={icono}
              onChange={e => setIcono(e.target.value)}
              className="px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none focus:border-naranja transition-colors w-24"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">Descripción</label>
            <textarea
              rows={2}
              value={desc}
              onChange={e => setDesc(e.target.value)}
              className="px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none focus:border-naranja transition-colors resize-none"
            />
          </div>
        </div>
      </Modal>
    </>
  )
}

// ── Marcas y modelos ──
function MarcasTab() {
  const toast = useToast()
  const { data: marcas = [], isLoading } = useHerrMarcas()
  const { mutate: createMarca, isPending: creatingMarca } = useCreateMarca()
  const { mutate: updateMarca, isPending: updatingMarca } = useUpdateMarca()
  const { mutate: deleteMarca } = useDeleteMarca()
  const { mutate: createModelo, isPending: creatingModelo } = useCreateModelo()
  const { mutate: updateModelo, isPending: updatingModelo } = useUpdateModelo()
  const { mutate: deleteModelo } = useDeleteModelo()

  const [expanded,  setExpanded]  = useState<Set<number>>(new Set())
  const [marcaForm, setMarcaForm] = useState<{ open: boolean; editando: HerrMarca | null; nom: string }>({
    open: false, editando: null, nom: '',
  })
  const [modeloForm, setModeloForm] = useState<{ open: boolean; marcaId: number | null; editando: HerrModelo | null; nom: string }>({
    open: false, marcaId: null, editando: null, nom: '',
  })

  function toggleExpand(id: number) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else              next.add(id)
      return next
    })
  }

  function openNewMarca()              { setMarcaForm({ open: true, editando: null, nom: '' }) }
  function openEditMarca(m: HerrMarca) { setMarcaForm({ open: true, editando: m, nom: m.nom }) }
  function closeMarcaForm()            { setMarcaForm({ open: false, editando: null, nom: '' }) }

  function submitMarca() {
    if (!marcaForm.nom.trim()) return
    const dto = { nom: marcaForm.nom.trim() }
    if (marcaForm.editando) {
      updateMarca({ id: marcaForm.editando.id, dto }, {
        onSuccess: () => { toast('✓ Marca actualizada', 'ok'); closeMarcaForm() },
        onError:   (e: any) => toast(e.message ?? 'Error al actualizar', 'err'),
      })
    } else {
      createMarca(dto, {
        onSuccess: () => { toast('✓ Marca creada', 'ok'); closeMarcaForm() },
        onError:   (e: any) => toast(e.message ?? 'Error al crear', 'err'),
      })
    }
  }

  function openNewModelo(marcaId: number)                 { setModeloForm({ open: true, marcaId, editando: null, nom: '' }) }
  function openEditModelo(marcaId: number, m: HerrModelo) { setModeloForm({ open: true, marcaId, editando: m, nom: m.nom }) }
  function closeModeloForm()                              { setModeloForm({ open: false, marcaId: null, editando: null, nom: '' }) }

  function submitModelo() {
    if (!modeloForm.nom.trim() || !modeloForm.marcaId) return
    if (modeloForm.editando) {
      updateModelo({ id: modeloForm.editando.id, dto: { nom: modeloForm.nom.trim() } }, {
        onSuccess: () => { toast('✓ Modelo actualizado', 'ok'); closeModeloForm() },
        onError:   (e: any) => toast(e.message ?? 'Error al actualizar', 'err'),
      })
    } else {
      createModelo({ marcaId: modeloForm.marcaId, nom: modeloForm.nom.trim() }, {
        onSuccess: () => { toast('✓ Modelo creado', 'ok'); closeModeloForm() },
        onError:   (e: any) => toast(e.message ?? 'Error al crear', 'err'),
      })
    }
  }

  function handleDeleteMarca(m: HerrMarca) {
    const modelosActivos = m.modelos.filter(x => x.activo).length
    const msg = modelosActivos > 0
      ? `¿Desactivar "${m.nom}"?\n\nTiene ${modelosActivos} modelo${modelosActivos !== 1 ? 's' : ''} activo${modelosActivos !== 1 ? 's' : ''}. Las herramientas existentes que la usen conservan el snapshot del nombre.`
      : `¿Desactivar "${m.nom}"?\n\nLas herramientas existentes que la usen conservan el snapshot del nombre.`
    if (!window.confirm(msg)) return
    deleteMarca(m.id, {
      onSuccess: () => toast('✓ Marca desactivada', 'ok'),
      onError:   (e: any) => toast(e.message ?? 'Error al desactivar', 'err'),
    })
  }

  function handleDeleteModelo(m: HerrModelo) {
    if (!window.confirm(`¿Desactivar el modelo "${m.nom}"?\n\nLas herramientas existentes lo conservan como snapshot.`)) return
    deleteModelo(m.id, {
      onSuccess: () => toast('✓ Modelo desactivado', 'ok'),
      onError:   (e: any) => toast(e.message ?? 'Error al desactivar', 'err'),
    })
  }

  return (
    <>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-bold text-azul text-base">
            Marcas y modelos ({marcas.length})
          </h2>
          <p className="text-xs text-gris-dark mt-0.5">
            Catálogo usado en alta y edición de herramientas. El soft-delete preserva el snapshot del nombre en las herramientas existentes.
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={openNewMarca}>
          ＋ Nueva marca
        </Button>
      </div>

      <div className="bg-white rounded-card shadow-card overflow-hidden">
        {isLoading ? (
          <div className="text-center py-8">
            <span className="inline-flex items-center gap-2 text-gris-dark text-sm">
              <span className="w-4 h-4 border-2 border-naranja border-t-transparent rounded-full animate-spin" />
              Cargando...
            </span>
          </div>
        ) : marcas.length === 0 ? (
          <div className="text-center py-8 text-gris-dark text-sm">
            No hay marcas configuradas. Creá la primera con &ldquo;＋ Nueva marca&rdquo;.
          </div>
        ) : (
          <div className="divide-y divide-gris">
            {marcas.map(m => {
              const isOpen = expanded.has(m.id)
              const modelosActivos = m.modelos.filter(x => x.activo).length
              return (
                <div key={m.id} className={m.activo ? '' : 'opacity-60'}>
                  {/* Fila marca */}
                  <div className="flex items-center gap-2 px-4 py-3 hover:bg-gris/40 transition-colors">
                    <button
                      onClick={() => toggleExpand(m.id)}
                      className="text-gris-dark hover:text-carbon shrink-0 w-5 text-center"
                      title={isOpen ? 'Contraer' : 'Expandir'}
                    >
                      <span className={`inline-block transition-transform ${isOpen ? 'rotate-90' : ''}`}>▸</span>
                    </button>
                    <span className="font-bold text-sm text-carbon flex-1 min-w-0 truncate">{m.nom}</span>
                    <span className="text-xs text-gris-dark whitespace-nowrap">
                      {modelosActivos} modelo{modelosActivos !== 1 ? 's' : ''}
                    </span>
                    {!m.activo && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-gris text-gris-dark">
                        Inactiva
                      </span>
                    )}
                    <button
                      onClick={() => openEditMarca(m)}
                      title="Editar marca"
                      className="text-xs px-2 py-1 rounded hover:bg-gris transition-colors"
                    >
                      ✏️
                    </button>
                    {m.activo && (
                      <button
                        onClick={() => handleDeleteMarca(m)}
                        title="Desactivar marca"
                        className="text-xs px-2 py-1 rounded hover:bg-rojo-light hover:text-rojo transition-colors"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* Modelos */}
                  {isOpen && (
                    <div className="bg-gris/30 px-4 py-2 flex flex-col gap-1">
                      {m.modelos.length === 0 ? (
                        <p className="text-xs text-gris-dark italic py-2 pl-7">
                          Sin modelos cargados.
                        </p>
                      ) : (
                        m.modelos.map(mod => (
                          <div
                            key={mod.id}
                            className={`flex items-center gap-2 pl-7 pr-2 py-1.5 rounded hover:bg-white transition-colors ${mod.activo ? '' : 'opacity-60'}`}
                          >
                            <span className="text-gris-mid text-xs">·</span>
                            <span className="text-sm text-carbon flex-1 min-w-0 truncate">{mod.nom}</span>
                            {!mod.activo && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-gris text-gris-dark">
                                Inactivo
                              </span>
                            )}
                            <button
                              onClick={() => openEditModelo(m.id, mod)}
                              title="Editar modelo"
                              className="text-xs px-2 py-1 rounded hover:bg-gris transition-colors"
                            >
                              ✏️
                            </button>
                            {mod.activo && (
                              <button
                                onClick={() => handleDeleteModelo(mod)}
                                title="Desactivar modelo"
                                className="text-xs px-2 py-1 rounded hover:bg-rojo-light hover:text-rojo transition-colors"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        ))
                      )}
                      {m.activo && (
                        <div className="pl-7 pr-2 pt-1">
                          <button
                            onClick={() => openNewModelo(m.id)}
                            className="text-xs text-azul hover:text-naranja font-bold transition-colors"
                          >
                            ＋ Nuevo modelo
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal Marca */}
      <Modal
        open={marcaForm.open}
        onClose={closeMarcaForm}
        title={marcaForm.editando ? '✏️ EDITAR MARCA' : '🏷️ NUEVA MARCA'}
        footer={
          <>
            <Button variant="secondary" onClick={closeMarcaForm}>Cancelar</Button>
            <Button
              variant="primary"
              loading={creatingMarca || updatingMarca}
              onClick={submitMarca}
            >
              ✓ Guardar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">Nombre *</label>
          <input
            type="text"
            autoFocus
            value={marcaForm.nom}
            onChange={e => setMarcaForm(f => ({ ...f, nom: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter') submitMarca() }}
            placeholder="Ej: Bosch"
            className="px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none focus:border-naranja transition-colors"
          />
        </div>
      </Modal>

      {/* Modal Modelo */}
      <Modal
        open={modeloForm.open}
        onClose={closeModeloForm}
        title={modeloForm.editando ? '✏️ EDITAR MODELO' : '🔧 NUEVO MODELO'}
        footer={
          <>
            <Button variant="secondary" onClick={closeModeloForm}>Cancelar</Button>
            <Button
              variant="primary"
              loading={creatingModelo || updatingModelo}
              onClick={submitModelo}
            >
              ✓ Guardar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">Nombre *</label>
          <input
            type="text"
            autoFocus
            value={modeloForm.nom}
            onChange={e => setModeloForm(f => ({ ...f, nom: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter') submitModelo() }}
            placeholder="Ej: GBH 2-26"
            className="px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none focus:border-naranja transition-colors"
          />
        </div>
      </Modal>
    </>
  )
}