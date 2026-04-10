'use client'

import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import * as XLSX from 'xlsx'
import { apiGet } from '@/lib/api/client'
import { usePersonal } from '@/modules/tarja/hooks/usePersonal'
import { useCategorias } from '@/modules/tarja/hooks/useCategorias'
import { toISO, getViernes } from '@/lib/utils/dates'
import type { Hora } from '@/types/domain.types'
import { useContratistas, useCreateContratista, useUpdateContratista, useDeleteContratista } from '@/modules/tarja/hooks/useContratistas'
import { TarjaTopbarActions } from '@/modules/tarja/components/TarjaTopbarActions'
import { Pagination } from '@/components/ui/Pagination'
import { ModalNuevoTrabajador }    from './ModalNuevoTrabajador'
import { ModalEditarTrabajador }   from './ModalEditarTrabajador'
import { ModalDetalleTrabajador }  from './ModalDetalleTrabajador'
import { ModalImportarPersonal }   from './ModalImportarPersonal'
import { Button } from '@/components/ui/Button'
import { Modal }  from '@/components/ui/Modal'
import { Input }  from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { AuditInfo } from '@/components/ui/AuditInfo'
import { useToast } from '@/components/ui/Toast'
import { useForm } from 'react-hook-form'
import { usePermisos } from '@/hooks/usePermisos'
import type { Personal, Contratista } from '@/types/domain.types'

type Tab = 'personal' | 'contratistas'

const ESP_OPTIONS = [
  { value: 'Electricista',  label: 'Electricista'      },
  { value: 'Sanitarista',   label: 'Sanitarista'       },
  { value: 'Durlero',       label: 'Durlero / Durlock' },
  { value: 'Pintor',        label: 'Pintor'            },
  { value: 'Plomero',       label: 'Plomero'           },
  { value: 'Herrero',       label: 'Herrero'           },
  { value: 'Carpintero',    label: 'Carpintero'        },
  { value: 'Otro',          label: 'Otro'              },
]

export function PersonalPage() {
  const toast = useToast()
  const { puedeCrear, puedeEditar, puedeEliminar } = usePermisos('personal')
  const [tab, setTab] = useState<Tab>('personal')

  // ── Horas para calcular activos ──
  const { data: todasHoras = [] } = useQuery({
    queryKey: ['horas', 'all'],
    queryFn: () => apiGet<Hora[]>('/api/horas/all'),
  })

  const semCorte3 = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() - 3 * 7)
    return toISO(getViernes(d))
  }, [])

  const legsActivos3sem = useMemo(() => new Set(
    todasHoras
      .filter(h => toISO(getViernes(new Date(h.fecha + 'T12:00:00'))) >= semCorte3)
      .map(h => h.leg)
  ), [todasHoras, semCorte3])

  function esActivo(p: (typeof personal)[0]): boolean {
    if (p.activo_override === true)  return true
    if (p.activo_override === false) return false
    return legsActivos3sem.has(p.leg)
  }

  // ── Personal ──
  const { data: personal    = [], isLoading: loadingPersonal } = usePersonal()
  const { data: categorias  = [] } = useCategorias()
  const [modalNuevo,    setModalNuevo]    = useState(false)
  const [modalImportar, setModalImportar] = useState(false)
  const [editando,      setEditando]      = useState<Personal | null>(null)
  const [detalle,       setDetalle]       = useState<Personal | null>(null)
  const [busqueda,      setBusqueda]      = useState('')
  const [pageP,         setPageP]         = useState(1)
  const [pageSizeP,     setPageSizeP]     = useState(12)

  // ── Contratistas ──
  const { data: contratistas = [], isLoading: loadingContrat } = useContratistas()
  const { mutate: createContrat, isPending: creando   } = useCreateContratista()
  const { mutate: updateContrat, isPending: actualizando } = useUpdateContratista()
  const { mutate: deleteContrat } = useDeleteContratista()
  const [modalNuevoC,  setModalNuevoC]  = useState(false)
  const [editandoC,    setEditandoC]    = useState<Contratista | null>(null)
  const [busquedaC,    setBusquedaC]    = useState('')
  const formNuevoC = useForm<any>()
  const formEditC  = useForm<any>()

  // Filtros
  const filtrados = personal.filter(p =>
    p.nom.toLowerCase().includes(busqueda.toLowerCase()) ||
    p.leg.includes(busqueda) ||
    (p.dni ?? '').includes(busqueda)
  )
  useEffect(() => { setPageP(1) }, [busqueda])
  const filtradosPag = filtrados.slice((pageP - 1) * pageSizeP, pageP * pageSizeP)

  const filtradosC = contratistas.filter(c =>
    c.nom.toLowerCase().includes(busquedaC.toLowerCase()) ||
    (c.especialidad ?? '').toLowerCase().includes(busquedaC.toLowerCase())
  )

  function handleCreateContrat(data: any) {
    createContrat(data, {
      onSuccess: () => {
        toast('✓ Contratista creado', 'ok')
        setModalNuevoC(false)
        formNuevoC.reset()
      },
      onError: () => toast('Error al crear', 'err'),
    })
  }

  function handleUpdateContrat(data: any) {
    if (!editandoC) return
    updateContrat(
      { id: editandoC.id, dto: data },
      {
        onSuccess: () => {
          toast('✓ Contratista actualizado', 'ok')
          setEditandoC(null)
        },
        onError: () => toast('Error al actualizar', 'err'),
      }
    )
  }

  function handleDeleteContrat(c: Contratista) {
    if (!confirm(`¿Eliminar a ${c.nom}?`)) return
    deleteContrat(c.id, {
      onSuccess: () => toast('✓ Contratista eliminado', 'ok'),
      onError:   () => toast('Error al eliminar', 'err'),
    })
  }

  function openEditContrat(c: Contratista) {
    formEditC.reset({
      nom:          c.nom,
      especialidad: c.especialidad ?? '',
      tel:          c.tel          ?? '',
      obs:          c.obs          ?? '',
    })
    setEditandoC(c)
  }

  const ContratistaForm = ({ form }: { form: any }) => (
    <div className="flex flex-col gap-4">
      <Input
        label="Nombre / Razón social"
        placeholder="Juan Pérez / Electricidad del Norte SRL"
        {...form.register('nom')}
      />
      <Select
        label="Especialidad"
        options={ESP_OPTIONS}
        {...form.register('especialidad')}
      />
      <Input
        label="Teléfono"
        placeholder="351-XXX-XXXX"
        {...form.register('tel')}
      />
      <Input
        label="Observaciones"
        placeholder="Notas adicionales"
        {...form.register('obs')}
      />
    </div>
  )

  function exportarExcel() {
    const rows = personal.map(p => {
      const cat    = categorias.find(c => c.id === p.cat_id)
      const activo = esActivo(p)
      return {
        'Legajo':          p.leg,
        'Apellido y Nombre': p.nom,
        'Estado':          activo ? 'Activo' : 'Inactivo',
        'DNI':             p.dni ?? '',
        'Categoría':       cat?.nom ?? '',
        'Valor hora ($)':  cat?.vh ?? '',
        'Teléfono':        p.tel ?? '',
        'Dirección':       p.dir ?? '',
        'Pantalón':        p.talle_pantalon ?? '',
        'Botines':         p.talle_botines  ?? '',
        'Camisa':          p.talle_camisa   ?? '',
        'Observaciones':   p.obs ?? '',
      }
    })

    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [
      { wch: 8 }, { wch: 28 }, { wch: 10 }, { wch: 14 }, { wch: 22 }, { wch: 14 },
      { wch: 16 }, { wch: 28 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 30 },
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Personal')
    XLSX.writeFile(wb, `Personal_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4">
      <TarjaTopbarActions />

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-[2rem] tracking-wider text-azul">
            GESTIÓN DE PERSONAL
          </h1>
          <p className="text-sm text-gris-dark mt-0.5">
            {personal.length} trabajadores · {contratistas.length} contratistas
          </p>
        </div>
        {tab === 'personal' && (
          <div className="flex gap-2 flex-wrap">
            <Button variant="secondary" size="sm" onClick={exportarExcel}>
              📥 Exportar Excel
            </Button>
            {puedeCrear && (
              <Button variant="secondary" size="sm" onClick={() => setModalImportar(true)}>
                📤 Importar Excel
              </Button>
            )}
            {puedeCrear && (
              <Button variant="primary" size="sm" onClick={() => setModalNuevo(true)}>
                ＋ Nuevo trabajador
              </Button>
            )}
          </div>
        )}
        {tab === 'contratistas' && puedeCrear && (
          <Button variant="primary" size="sm" onClick={() => setModalNuevoC(true)}>
            ＋ Nuevo contratista
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white rounded-card shadow-card p-1.5 w-fit">
        <button
          onClick={() => setTab('personal')}
          className={`
            flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition-all
            ${tab === 'personal'
              ? 'bg-azul text-white shadow-sm'
              : 'text-gris-dark hover:bg-gris hover:text-carbon'
            }
          `}
        >
          👷 Personal ({personal.length})
        </button>
        <button
          onClick={() => setTab('contratistas')}
          className={`
            flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition-all
            ${tab === 'contratistas'
              ? 'bg-azul text-white shadow-sm'
              : 'text-gris-dark hover:bg-gris hover:text-carbon'
            }
          `}
        >
          🔧 Contratistas ({contratistas.length})
        </button>
      </div>

      {/* ── TAB PERSONAL ── */}
      {tab === 'personal' && (
        <>
          <input
            type="text"
            placeholder="Buscar por nombre, legajo o DNI..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="w-full max-w-sm px-3 py-2 border-[1.5px] border-gris-mid rounded-lg font-sans text-sm outline-none transition-colors focus:border-naranja bg-white"
          />

          <div className="bg-white rounded-card shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    {['Leg.', 'Apellido y Nombre', 'DNI', 'Categoría', 'Teléfono', 'Dirección', ''].map(h => (
                      <th
                        key={h}
                        className={`
                          bg-azul text-white text-xs font-bold px-4 py-3 text-left uppercase tracking-wide
                          ${h === 'DNI' || h === 'Teléfono' ? 'hidden md:table-cell' : ''}
                          ${h === 'Dirección' ? 'hidden lg:table-cell' : ''}
                        `}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loadingPersonal ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8">
                        <span className="inline-flex items-center gap-2 text-gris-dark text-sm">
                          <span className="w-4 h-4 border-2 border-naranja border-t-transparent rounded-full animate-spin" />
                          Cargando...
                        </span>
                      </td>
                    </tr>
                  ) : filtrados.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-gris-dark text-sm">
                        {busqueda ? 'No se encontraron resultados' : 'No hay trabajadores registrados'}
                      </td>
                    </tr>
                  ) : (
                    filtradosPag.map(p => {
                      const cat    = categorias.find(c => c.id === p.cat_id)
                      const activo = esActivo(p)
                      return (
                        <tr
                          key={p.leg}
                          className="border-b border-gris last:border-0 hover:bg-gris/40 transition-colors cursor-pointer"
                          onClick={() => setDetalle(p)}
                        >
                          <td className="font-mono text-xs text-gris-dark px-4 py-3 font-bold">
                            {p.leg}
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-bold text-sm text-carbon">{p.nom}</div>
                            <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded-full mt-0.5 ${activo ? 'bg-verde-light text-verde' : 'bg-gris text-gris-dark'}`}>
                              {activo ? '● Activo' : '○ Inactivo'}
                            </span>
                          </td>
                          <td className="font-mono text-xs text-gris-dark px-4 py-3 hidden md:table-cell">
                            {p.dni || '—'}
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-block px-2 py-0.5 rounded bg-naranja-light text-naranja-dark text-xs font-bold">
                              {cat?.nom ?? '—'}
                            </span>
                          </td>
                          <td className="text-sm text-gris-dark px-4 py-3 hidden md:table-cell">
                            {p.tel || '—'}
                          </td>
                          <td className="text-sm text-gris-dark px-4 py-3 hidden lg:table-cell">
                            {p.dir || '—'}
                          </td>
                          <td
                            className="px-4 py-3 text-center"
                            onClick={e => e.stopPropagation()}
                          >
                            {puedeEditar && (
                              <button
                                onClick={() => setEditando(p)}
                                className="text-xs font-bold px-2 py-1 rounded hover:bg-gris transition-colors"
                              >
                                ✏️
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <Pagination
            page={pageP}
            total={filtrados.length}
            pageSize={pageSizeP}
            onChange={setPageP}
            onPageSizeChange={size => { setPageSizeP(size); setPageP(1) }}
          />
        </>
      )}

      {/* ── TAB CONTRATISTAS ── */}
      {tab === 'contratistas' && (
        <>
          <input
            type="text"
            placeholder="Buscar por nombre o especialidad..."
            value={busquedaC}
            onChange={e => setBusquedaC(e.target.value)}
            className="w-full max-w-sm px-3 py-2 border-[1.5px] border-gris-mid rounded-lg font-sans text-sm outline-none transition-colors focus:border-naranja bg-white"
          />

          <div className="bg-white rounded-card shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    {['Nombre / Razón social', 'Especialidad', 'Teléfono', 'Observaciones', ''].map(h => (
                      <th
                        key={h}
                        className={`
                          bg-azul text-white text-xs font-bold px-4 py-3 text-left uppercase tracking-wide
                          ${h === 'Teléfono' ? 'hidden md:table-cell' : ''}
                          ${h === 'Observaciones' ? 'hidden lg:table-cell' : ''}
                        `}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loadingContrat ? (
                    <tr>
                      <td colSpan={5} className="text-center py-8">
                        <span className="inline-flex items-center gap-2 text-gris-dark text-sm">
                          <span className="w-4 h-4 border-2 border-naranja border-t-transparent rounded-full animate-spin" />
                          Cargando...
                        </span>
                      </td>
                    </tr>
                  ) : filtradosC.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-8 text-gris-dark text-sm">
                        {busquedaC ? 'No se encontraron resultados' : 'No hay contratistas registrados'}
                      </td>
                    </tr>
                  ) : (
                    filtradosC.map(c => (
                      <tr
                        key={c.id}
                        className="border-b border-gris last:border-0 hover:bg-gris/40 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-[#EEE8FF] flex items-center justify-center text-[#5A2D82] font-bold text-sm flex-shrink-0">
                              {c.nom.charAt(0).toUpperCase()}
                            </div>
                            <span className="font-bold text-sm text-carbon">{c.nom}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {c.especialidad ? (
                            <span className="inline-block px-2 py-0.5 rounded bg-[#EEE8FF] text-[#5A2D82] text-xs font-bold">
                              {c.especialidad}
                            </span>
                          ) : (
                            <span className="text-gris-mid text-xs">—</span>
                          )}
                        </td>
                        <td className="text-sm text-gris-dark px-4 py-3 hidden md:table-cell">
                          {c.tel || '—'}
                        </td>
                        <td className="text-sm text-gris-dark px-4 py-3 hidden lg:table-cell max-w-[200px] truncate">
                          {c.obs || '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1 justify-end">
                            {puedeEditar && (
                              <button
                                onClick={() => openEditContrat(c)}
                                className="text-xs font-bold px-2 py-1 rounded hover:bg-gris transition-colors"
                              >
                                ✏️
                              </button>
                            )}
                            {puedeEliminar && (
                              <button
                                onClick={() => handleDeleteContrat(c)}
                                className="text-xs font-bold px-2 py-1 rounded hover:bg-rojo-light text-gris-dark hover:text-rojo transition-colors"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── Modales Personal ── */}
      <ModalNuevoTrabajador
        open={modalNuevo}
        onClose={() => setModalNuevo(false)}
      />
      <ModalImportarPersonal
        open={modalImportar}
        onClose={() => setModalImportar(false)}
        personal={personal}
        categorias={categorias}
      />
      <ModalEditarTrabajador
        open={!!editando}
        onClose={() => setEditando(null)}
        trabajador={editando}
      />
      <ModalDetalleTrabajador
        open={!!detalle}
        onClose={() => setDetalle(null)}
        trabajador={detalle}
        onEditar={t => { setDetalle(null); setEditando(t) }}
      />

      {/* ── Modales Contratistas ── */}
      <Modal
        open={modalNuevoC}
        onClose={() => setModalNuevoC(false)}
        title="🔧 NUEVO CONTRATISTA"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalNuevoC(false)}>Cancelar</Button>
            <Button variant="primary" loading={creando} onClick={formNuevoC.handleSubmit(handleCreateContrat)}>
              ✓ Guardar
            </Button>
          </>
        }
      >
        <ContratistaForm form={formNuevoC} />
      </Modal>

      <Modal
        open={!!editandoC}
        onClose={() => setEditandoC(null)}
        title="✏️ EDITAR CONTRATISTA"
        footer={
          <>
            <Button
              variant="danger"
              onClick={() => editandoC && handleDeleteContrat(editandoC)}
              className="mr-auto"
            >
              🗑 Eliminar
            </Button>
            <Button variant="secondary" onClick={() => setEditandoC(null)}>Cancelar</Button>
            <Button variant="primary" loading={actualizando} onClick={formEditC.handleSubmit(handleUpdateContrat)}>
              ✓ Guardar
            </Button>
          </>
        }
      >
        <ContratistaForm form={formEditC} />
        <AuditInfo
          createdBy={editandoC?.created_by}
          updatedBy={editandoC?.updated_by}
          createdAt={editandoC?.created_at}
          updatedAt={editandoC?.updated_at}
        />
      </Modal>

    </div>
  )
}