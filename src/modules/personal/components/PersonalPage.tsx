'use client'

import { useState } from 'react'
import { usePersonal } from '@/modules/tarja/hooks/usePersonal'
import { useCategorias } from '@/modules/tarja/hooks/useCategorias'
import { ModalNuevoTrabajador } from './ModalNuevoTrabajador'
import { ModalEditarTrabajador } from './ModalEditarTrabajador'
import { ModalDetalleTrabajador } from './ModalDetalleTrabajador'
import { Button } from '@/components/ui/Button'
import type { Personal } from '@/types/domain.types'

export function PersonalPage() {
  const { data: personal = [], isLoading } = usePersonal()
  const { data: categorias = [] } = useCategorias()
  const [modalNuevo, setModalNuevo] = useState(false)
  const [editando, setEditando] = useState<Personal | null>(null)
  const [detalle, setDetalle] = useState<Personal | null>(null)
  const [busqueda, setBusqueda] = useState('')

  const filtrados = personal.filter(p =>
    p.nom.toLowerCase().includes(busqueda.toLowerCase()) ||
    p.leg.includes(busqueda) ||
    (p.dni ?? '').includes(busqueda)
  )

  if (isLoading) {
    return (
      <div className="p-8 flex items-center gap-3 text-gris-dark">
        <span className="w-5 h-5 border-2 border-naranja border-t-transparent rounded-full animate-spin" />
        Cargando personal...
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-[2rem] tracking-wider text-azul">
            GESTIÓN DE PERSONAL
          </h1>
          <p className="text-sm text-gris-dark mt-0.5">
            {personal.length} trabajadores registrados
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setModalNuevo(true)}>
          ＋ Nuevo trabajador
        </Button>
      </div>

      {/* Búsqueda */}
      <div>
        <input
          type="text"
          placeholder="Buscar por nombre, legajo o DNI..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="w-full max-w-sm px-3 py-2 border-[1.5px] border-gris-mid rounded-lg font-sans text-sm outline-none transition-colors focus:border-naranja bg-white"
        />
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-card shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="bg-azul text-white text-xs font-bold px-4 py-3 text-left uppercase tracking-wide">
                  Leg.
                </th>
                <th className="bg-azul text-white text-xs font-bold px-4 py-3 text-left uppercase tracking-wide">
                  Apellido y Nombre
                </th>
                <th className="bg-azul text-white text-xs font-bold px-4 py-3 text-left uppercase tracking-wide hidden md:table-cell">
                  DNI
                </th>
                <th className="bg-azul text-white text-xs font-bold px-4 py-3 text-left uppercase tracking-wide">
                  Categoría
                </th>
                <th className="bg-azul text-white text-xs font-bold px-4 py-3 text-left uppercase tracking-wide hidden lg:table-cell">
                  Teléfono
                </th>
                <th className="bg-azul text-white text-xs font-bold px-4 py-3 text-left uppercase tracking-wide hidden lg:table-cell">
                  Dirección
                </th>
                <th className="bg-azul text-white text-xs font-bold px-4 py-3 uppercase tracking-wide w-20" />
              </tr>
            </thead>
            <tbody>
              {filtrados.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-gris-dark text-sm">
                    {busqueda ? 'No se encontraron resultados' : 'No hay trabajadores registrados'}
                  </td>
                </tr>
              ) : (
                filtrados.map(p => {
                  const cat = categorias.find(c => c.id === p.cat_id)
                  return (
                    <tr
                      key={p.leg}
                      className="border-b border-gris last:border-0 hover:bg-gris/40 transition-colors cursor-pointer"
                      onClick={() => setDetalle(p)}
                    >
                      <td className="font-mono text-xs text-gris-dark px-4 py-3 font-bold">
                        {p.leg}
                      </td>
                      <td className="font-bold text-sm px-4 py-3 text-carbon">
                        {p.nom}
                      </td>
                      <td className="font-mono text-xs text-gris-dark px-4 py-3 hidden md:table-cell">
                        {p.dni || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-block px-2 py-0.5 rounded bg-naranja-light text-naranja-dark text-xs font-bold">
                          {cat?.nom ?? '—'}
                        </span>
                      </td>
                      <td className="text-sm text-gris-dark px-4 py-3 hidden lg:table-cell">
                        {p.tel || '—'}
                      </td>
                      <td className="text-sm text-gris-dark px-4 py-3 hidden lg:table-cell">
                        {p.dir || '—'}
                      </td>
                      <td
                        className="px-4 py-3 text-center"
                        onClick={e => e.stopPropagation()}
                      >
                        <button
                          onClick={() => setEditando(p)}
                          className="text-gris-dark hover:text-azul transition-colors text-sm font-bold px-2 py-1 rounded hover:bg-gris"
                        >
                          ✏️
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ModalNuevoTrabajador
        open={modalNuevo}
        onClose={() => setModalNuevo(false)}
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
        onEditar={(t) => {
          setDetalle(null)
          setEditando(t)
        }}
      />

    </div>
  )
}