'use client'

import { Fragment, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import type { Categoria, Convenio, EscalaListada } from '@/types/sueldos.types'
import { useBorrarEscala, useCategorias, useConvenios, useEscalas } from '../../hooks/useSueldos'
import { fmtFecha, fmtM } from '../../utils/sueldos.utils'
import { mensajeErrorSueldos } from '../../utils/sueldos.errores'
import { Cargando, Check, ErrorCarga, MarcaAConfirmar, Tarjeta, Td, Th, Vacio } from '../Comun'
import { ModalCategoria, ModalConvenio, ModalEscala, ModalParitaria } from './ModalesConvenio'
import { ConceptosPanel } from './ConceptosPanel'

/**
 * Convenios: elegís uno arriba y abajo ves sus categorías con la escala que
 * rige hoy (por zona), el historial de escalas, «Nueva paritaria» y los
 * conceptos con sus valores. Todo lo marcado «a confirmar» se usa igual en
 * los cálculos, pero se ve con la marca amarilla para revisarlo.
 * Editar pide el flag «Configurar el módulo».
 */
export function ConveniosTab() {
  const { configurar } = usePermisos('sueldos')
  const noConfig = configurar ? null : 'Hace falta el permiso «Configurar el módulo» en Sueldos'
  const convenios = useConvenios()
  const [elegido, setConvId] = useState<number | null>(null)
  const [modalConvenio, setModalConvenio] = useState<Convenio | 'nuevo' | null>(null)

  const lista = useMemo(() => convenios.data ?? [], [convenios.data])
  // Sin elección todavía: el primer convenio activo.
  const convId = elegido ?? lista.find(c => c.activo)?.id ?? lista[0]?.id ?? null
  const conv = lista.find(c => c.id === convId) ?? null

  if (convenios.isLoading) return <Cargando />
  if (convenios.isError) return <ErrorCarga mensaje={mensajeErrorSueldos(convenios.error)} onReintentar={() => convenios.refetch()} />

  return (
    <>
      <Tarjeta className="p-3 flex flex-wrap items-center gap-2">
        {lista.map(c => (
          <button key={c.id} type="button" onClick={() => setConvId(c.id)}
            className={`px-3 py-2 rounded-lg text-sm font-bold border transition-colors ${c.id === convId ? 'bg-azul text-white border-azul' : 'bg-white text-azul border-gris-mid hover:bg-gris'} ${c.activo ? '' : 'opacity-60'}`}>
            {c.nombre}
            <span className="block text-[10px] font-normal opacity-80">{c.cct ? `CCT ${c.cct} · ` : ''}{c.periodicidad}{c.activo ? '' : ' · inactivo'}</span>
          </button>
        ))}
        <div className="flex-1" />
        <Button size="sm" variant="ghost" disabled={!!noConfig} title={noConfig ?? 'Dar de alta otro convenio'} onClick={() => setModalConvenio('nuevo')}>+ Convenio</Button>
      </Tarjeta>

      {!conv ? <Vacio>No hay convenios cargados.</Vacio> : (
        <>
          <Tarjeta className="p-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm">
              <b className="text-azul">{conv.nombre}</b>{conv.cct ? ` · CCT ${conv.cct}` : ''} · liquidación {conv.periodicidad} · básico {conv.unidad_basico === 'hora' ? 'por hora' : 'mensual'}
              {conv.obs && <div className="text-xs text-gris-dark whitespace-pre-wrap">{conv.obs}</div>}
            </div>
            <Button size="sm" variant="secondary" disabled={!!noConfig} title={noConfig ?? 'Editar nombre, CCT, periodicidad o darlo de baja'} onClick={() => setModalConvenio(conv)}>✏ Editar convenio</Button>
          </Tarjeta>
          <CategoriasPanel convenio={conv} noConfig={noConfig} />
          <ConceptosPanel convenio={conv} noConfig={noConfig} />
        </>
      )}

      {modalConvenio && <ModalConvenio convenio={modalConvenio === 'nuevo' ? null : modalConvenio} onClose={() => setModalConvenio(null)} />}
    </>
  )
}

function CategoriasPanel({ convenio, noConfig }: { convenio: Convenio; noConfig: string | null }) {
  const toast = useToast()
  const cats = useCategorias(convenio.id)
  const escalas = useEscalas({ convenio_id: convenio.id })
  const borrar = useBorrarEscala()
  const [abierta, setAbierta] = useState<number | null>(null)
  const [verInactivas, setVerInactivas] = useState(false)
  const [modalCat, setModalCat] = useState<Categoria | 'nueva' | null>(null)
  const [modalEscala, setModalEscala] = useState<{ categoria: Categoria; escala: EscalaListada | null } | null>(null)
  const [paritaria, setParitaria] = useState(false)

  const porCat = useMemo(() => {
    const m = new Map<number, EscalaListada[]>()
    for (const e of escalas.data ?? []) {
      const arr = m.get(e.categoria_id) ?? []
      arr.push(e)
      m.set(e.categoria_id, arr)
    }
    return m
  }, [escalas.data])
  const zonas = useMemo(() => [...new Set((escalas.data ?? []).map(e => e.zona))].sort(), [escalas.data])
  const lista = (cats.data ?? []).filter(c => verInactivas || c.activo)
  const aConfirmar = (escalas.data ?? []).filter(e => e.vigente && e.a_confirmar).length
  const unidadCat = (c: Categoria) => c.unidad_basico ?? convenio.unidad_basico

  async function borrarEscala(e: EscalaListada) {
    if (!window.confirm(`¿Borrar la escala de ${e.categoria.nombre} zona ${e.zona} desde el ${fmtFecha(e.vigente_desde)} (${fmtM(e.valor)})?`)) return
    try {
      await borrar.mutateAsync(e.id)
      toast('✓ Escala borrada', 'ok')
    } catch (err) {
      toast(mensajeErrorSueldos(err), 'err')
    }
  }

  return (
    <Tarjeta className="p-3 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-display text-lg text-azul tracking-wider flex-1">Categorías y escalas</h3>
        {aConfirmar > 0 && <span className="text-xs text-[#7A5000]"><MarcaAConfirmar /> {aConfirmar} escala(s) vigentes a confirmar</span>}
        <Check checked={verInactivas} onChange={setVerInactivas} label="Ver inactivas" />
        <Button size="sm" variant="ghost" disabled={!!noConfig} title={noConfig ?? 'Nueva categoría'} onClick={() => setModalCat('nueva')}>+ Categoría</Button>
        <Button size="sm" disabled={!!noConfig} title={noConfig ?? 'Aumentar todas las escalas un % desde una fecha'} onClick={() => setParitaria(true)}>📈 Nueva paritaria</Button>
      </div>

      {cats.isLoading || escalas.isLoading ? <Cargando />
        : cats.isError ? <ErrorCarga mensaje={mensajeErrorSueldos(cats.error)} onReintentar={() => cats.refetch()} />
        : lista.length === 0 ? <p className="text-sm text-gris-dark italic">El convenio no tiene categorías.</p>
        : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <Th>Categoría</Th>
                  <Th className="hidden sm:table-cell">Unidad</Th>
                  {(zonas.length ? zonas : ['A']).map(z => <Th key={z} derecha>Vigente zona {z}</Th>)}
                  <Th />
                </tr>
              </thead>
              <tbody>
                {lista.map(c => {
                  const hist = porCat.get(c.id) ?? []
                  return (
                    <Fragment key={c.id}>
                      <tr className={`hover:bg-naranja-light/30 cursor-pointer ${c.activo ? '' : 'opacity-60'}`} onClick={() => setAbierta(a => a === c.id ? null : c.id)}>
                        <Td>
                          <div className="font-semibold">{abierta === c.id ? '▾' : '▸'} {c.nombre}</div>
                          <div className="text-[11px] text-gris-dark font-mono">{c.codigo}{c.por_defecto ? ' · inicial' : ''}{c.activo ? '' : ' · inactiva'}</div>
                        </Td>
                        <Td className="hidden sm:table-cell">{unidadCat(c) === 'hora' ? 'por hora' : 'por mes'}</Td>
                        {(zonas.length ? zonas : ['A']).map(z => {
                          const v = hist.find(e => e.zona === z && e.vigente)
                          return (
                            <Td key={z} derecha>
                              {v ? <div className="flex flex-col items-end gap-0.5">
                                <span>{fmtM(v.valor)}</span>
                                <span className="text-[10px] text-gris-dark font-sans">desde {fmtFecha(v.vigente_desde)}</span>
                                {v.a_confirmar && <MarcaAConfirmar />}
                              </div> : <span className="text-rojo text-xs font-sans">sin escala</span>}
                            </Td>
                          )
                        })}
                        <Td className="text-right whitespace-nowrap">
                          <Button size="sm" variant="ghost" disabled={!!noConfig} title={noConfig ?? 'Editar la categoría'}
                            onClick={e => { e.stopPropagation(); setModalCat(c) }}>✏</Button>
                        </Td>
                      </tr>
                      {abierta === c.id && (
                        <tr>
                          <td colSpan={3 + Math.max(zonas.length, 1)} className="bg-blanco px-3 py-2 border-t border-gris">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[11px] font-bold text-gris-dark uppercase">Historial de escalas</span>
                              <Button size="sm" variant="ghost" disabled={!!noConfig} title={noConfig ?? 'Cargar un valor con su fecha de vigencia'}
                                onClick={() => setModalEscala({ categoria: c, escala: null })}>+ Escala</Button>
                            </div>
                            {hist.length === 0 ? <p className="text-xs text-gris-dark italic">Sin escalas cargadas.</p> : (
                              <table className="w-full text-xs">
                                <tbody>
                                  {hist.map(e => (
                                    <tr key={e.id} className="border-t border-gris">
                                      <td className="py-1 pr-2">Zona {e.zona}</td>
                                      <td className="py-1 pr-2">desde {fmtFecha(e.vigente_desde)}{e.vigente && <span className="ml-1 text-verde font-bold">· vigente</span>}</td>
                                      <td className="py-1 pr-2 text-right font-mono tabular-nums">{fmtM(e.valor)}</td>
                                      <td className="py-1 pr-2">{e.a_confirmar && <MarcaAConfirmar />}</td>
                                      <td className="py-1 pr-2 text-gris-dark hidden md:table-cell">{e.fuente}</td>
                                      <td className="py-1 text-right whitespace-nowrap">
                                        <Button size="sm" variant="ghost" disabled={!!noConfig} title={noConfig ?? 'Corregir valor, fuente o marca'} onClick={() => setModalEscala({ categoria: c, escala: e })}>✏</Button>
                                        <Button size="sm" variant="ghost" disabled={!!noConfig} title={noConfig ?? 'Borrar esta escala'} onClick={() => borrarEscala(e)}>🗑</Button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

      {modalCat && <ModalCategoria convenio={convenio} categoria={modalCat === 'nueva' ? null : modalCat} onClose={() => setModalCat(null)} />}
      {modalEscala && <ModalEscala categoria={modalEscala.categoria} escala={modalEscala.escala} onClose={() => setModalEscala(null)} />}
      {paritaria && <ModalParitaria convenio={convenio} zonas={zonas} onClose={() => setParitaria(false)} />}
    </Tarjeta>
  )
}
