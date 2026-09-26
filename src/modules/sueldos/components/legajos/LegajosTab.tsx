'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { Input } from '@/components/ui/Input'
import { usePermisos } from '@/hooks/usePermisos'
import type { LegajosFiltro } from '@/types/sueldos.types'
import { useConvenios, useLegajos } from '../../hooks/useSueldos'
import { FALTANTE_LABEL, fmtCuil, fmtFecha } from '../../utils/sueldos.utils'
import { mensajeErrorSueldos } from '../../utils/sueldos.errores'
import { Cargando, Cifra, ErrorCarga, Tarjeta, Td, Th, Vacio } from '../Comun'
import { ModalLegajo } from './ModalLegajo'
import { ModalAltaLegajo } from './ModalAltaLegajo'

/**
 * Lista de legajos con su estado (completo / incompleto y qué le falta).
 * Click en una fila abre la ficha. `?legajo=ID` en la URL abre la ficha
 * directo (lo usa el editor de recibos para «Completar la ficha»).
 */
export function LegajosTab() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { puedeCrear, verPii } = usePermisos('sueldos')
  const { data: convenios = [] } = useConvenios()

  const [filtro, setFiltro] = useState<LegajosFiltro>({ activo: 'true', incompleto: '' })
  const [texto, setTexto] = useState('')
  const [q, setQ] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setQ(texto), 300)
    return () => clearTimeout(t)
  }, [texto])

  const legajos = useLegajos({ ...filtro, q })
  const lista = useMemo(() => legajos.data ?? [], [legajos.data])
  const incompletos = lista.filter(l => l.incompleto).length

  const idUrl = Number(searchParams.get('legajo')) || null
  const [abierto, setAbierto] = useState<number | null>(null)
  const [editarAlAbrir, setEditarAlAbrir] = useState(false)
  const [alta, setAlta] = useState(false)
  const fichaId = abierto ?? idUrl

  function cerrarFicha() {
    setAbierto(null)
    setEditarAlAbrir(false)
    if (idUrl) router.replace('/sueldos?tab=legajos')
  }

  return (
    <>
      <Tarjeta className="p-3 sm:p-4 flex flex-col gap-3">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <Select label="Convenio" value={filtro.convenio_id ?? ''}
            onChange={e => setFiltro(f => ({ ...f, convenio_id: e.target.value ? Number(e.target.value) : null }))}
            placeholder="Todos"
            options={convenios.map(c => ({ value: c.id, label: c.nombre }))} />
          <Select label="Estado" value={filtro.activo ?? 'true'}
            onChange={e => setFiltro(f => ({ ...f, activo: e.target.value as LegajosFiltro['activo'] }))}
            options={[{ value: 'true', label: 'Activos' }, { value: 'false', label: 'Dados de baja' }, { value: 'todos', label: 'Todos' }]} />
          <Select label="Ficha" value={filtro.incompleto ?? ''}
            onChange={e => setFiltro(f => ({ ...f, incompleto: e.target.value as LegajosFiltro['incompleto'] }))}
            options={[{ value: '', label: 'Completas e incompletas' }, { value: 'true', label: 'Solo incompletas' }, { value: 'false', label: 'Solo completas' }]} />
          <div className="col-span-2 md:col-span-1">
            <Input label="Buscar" placeholder="Nombre o legajo" value={texto} onChange={e => setTexto(e.target.value)} />
          </div>
          <div className="col-span-2 md:col-span-1 flex md:justify-end">
            <Button className="w-full md:w-auto" disabled={!puedeCrear}
              title={puedeCrear ? 'Dar de alta un legajo desde Personal, un chofer o a mano' : 'Hace falta el permiso «Crear» en Sueldos'}
              onClick={() => setAlta(true)}>
              + Nuevo legajo
            </Button>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Cifra label="Legajos" valor={String(lista.length)} />
          <Cifra label="Fichas incompletas" valor={String(incompletos)} tono={incompletos ? 'naranja' : 'verde'}
            sub={incompletos ? 'Completalas antes de liquidar' : 'Todo completo'} />
        </div>
        {!verPii && (
          <p className="text-[11px] text-gris-dark">CUIL y CBU se ven enmascarados: hace falta el permiso «Ver datos personales».</p>
        )}
      </Tarjeta>

      {legajos.isLoading ? <Cargando />
        : legajos.isError ? <ErrorCarga mensaje={mensajeErrorSueldos(legajos.error)} onReintentar={() => legajos.refetch()} />
        : lista.length === 0 ? <Vacio>No hay legajos con esos filtros.</Vacio>
        : (
          <Tarjeta className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <Th>Empleado</Th>
                  <Th>Convenio / categoría</Th>
                  <Th className="hidden md:table-cell">CUIL</Th>
                  <Th className="hidden md:table-cell">Ingreso</Th>
                  <Th>Ficha</Th>
                </tr>
              </thead>
              <tbody>
                {lista.map(l => (
                  <tr key={l.id} onClick={() => setAbierto(l.id)}
                    className={`cursor-pointer hover:bg-naranja-light/40 ${l.activo ? '' : 'opacity-60'}`}>
                    <Td>
                      <div className="font-semibold text-azul">{l.nombre_mostrar}</div>
                      <div className="text-[11px] text-gris-dark">
                        {l.leg ? `Leg. ${l.leg}` : l.chofer_id ? `Chofer #${l.chofer_id}` : 'Sin vínculo'}
                        {!l.activo && ' · dado de baja'}
                        {l.fecha_egreso && ` · egreso ${fmtFecha(l.fecha_egreso)}`}
                      </div>
                    </Td>
                    <Td>
                      <div>{l.convenio_nombre}</div>
                      <div className="text-[11px] text-gris-dark">{l.categoria_nombre ?? '— sin categoría —'}{l.zona && l.zona !== 'A' ? ` · zona ${l.zona}` : ''}</div>
                    </Td>
                    <Td className="hidden md:table-cell font-mono text-xs">{fmtCuil(l.cuil) || <span className="text-gris-dark">—</span>}</Td>
                    <Td className="hidden md:table-cell">{fmtFecha(l.fecha_ingreso) || <span className="text-gris-dark">—</span>}</Td>
                    <Td>
                      {l.incompleto ? (
                        <div className="flex flex-wrap gap-1">
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase bg-naranja-light text-naranja-dark">Incompleta</span>
                          {l.faltantes.map(f => (
                            <span key={f} className="text-[10px] px-1.5 py-0.5 rounded bg-gris text-gris-dark">falta {FALTANTE_LABEL[f] ?? f}</span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase bg-verde-light text-verde">Completa</span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Tarjeta>
        )}

      {fichaId && <ModalLegajo id={fichaId} editarAlAbrir={editarAlAbrir} onClose={cerrarFicha} />}
      {alta && (
        <ModalAltaLegajo
          onClose={() => setAlta(false)}
          onCreado={id => { setAlta(false); setEditarAlAbrir(true); setAbierto(id) }}
        />
      )}
    </>
  )
}
