'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import type { ConceptoListado, Convenio, TipoConcepto } from '@/types/sueldos.types'
import { useConceptos } from '../../hooks/useSueldos'
import { BASE_LABEL, CONDICION_LABEL, TIPO_CONCEPTO_LABEL, UNIDAD_LABEL, fmtCant, fmtM } from '../../utils/sueldos.utils'
import { mensajeErrorSueldos } from '../../utils/sueldos.errores'
import { Cargando, Check, ErrorCarga, MarcaAConfirmar, Tarjeta, Td, Th } from '../Comun'
import { ModalConcepto } from './ModalConcepto'

const ORDEN_TIPO: TipoConcepto[] = ['remunerativo', 'no_remunerativo', 'descuento', 'contribucion']

export function valorTexto(c: ConceptoListado): string {
  const v = c.valor_vigente
  if (!v) return ''
  const partes: string[] = []
  if (v.porcentaje != null) partes.push(`${fmtCant(v.porcentaje)} %`)
  if (v.monto != null) partes.push(`${fmtM(v.monto)}${c.unidad && c.unidad !== '$' && c.unidad !== '%' ? ` por ${UNIDAD_LABEL[c.unidad]}` : ''}`)
  return partes.join(' + ')
}

function comoSeCalcula(c: ConceptoListado): string {
  switch (c.calculo) {
    case 'manual':            return 'se carga a mano'
    case 'cantidad_x_escala': return 'cantidad × escala'
    case 'porcentaje':        return `% sobre ${c.base ? BASE_LABEL[c.base].toLowerCase() : '—'}${c.unidad === 'anios' ? ' × años' : ''}`
    case 'monto_fijo':        return 'monto fijo'
    case 'por_unidad':        return `monto por ${c.unidad ? UNIDAD_LABEL[c.unidad] : 'unidad'}`
  }
}

/**
 * Conceptos del convenio (propios + comunes a todos). Cada fila dice cómo se
 * calcula y el valor que rige hoy; los que no tienen valor vigente NO se
 * aplican (en rojo) y los «a confirmar» llevan la marca. Click → ficha del
 * concepto con su historial de valores.
 */
export function ConceptosPanel({ convenio, noConfig }: { convenio: Convenio; noConfig: string | null }) {
  const [inactivos, setInactivos] = useState(false)
  const [soloAConfirmar, setSoloAConfirmar] = useState(false)
  const [modal, setModal] = useState<ConceptoListado | 'nuevo' | null>(null)
  const q = useConceptos({ convenio_id: convenio.id, incluir_inactivos: inactivos })

  const lista = useMemo(() => (q.data ?? []).filter(c => !soloAConfirmar || c.valor_vigente?.a_confirmar), [q.data, soloAConfirmar])
  const aConfirmar = (q.data ?? []).filter(c => c.activo && c.valor_vigente?.a_confirmar).length
  const sinValor = (q.data ?? []).filter(c => c.activo && c.automatico && c.calculo !== 'manual' && c.calculo !== 'cantidad_x_escala' && !c.valor_vigente).length

  return (
    <Tarjeta className="p-3 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-display text-lg text-azul tracking-wider flex-1">Conceptos</h3>
        {aConfirmar > 0 && <span className="text-xs text-[#7A5000]"><MarcaAConfirmar /> {aConfirmar}</span>}
        {sinValor > 0 && <span className="text-xs text-rojo font-bold">{sinValor} automático(s) sin valor</span>}
        <Check checked={soloAConfirmar} onChange={setSoloAConfirmar} label="Solo a confirmar" />
        <Check checked={inactivos} onChange={setInactivos} label="Ver inactivos" />
        <Button size="sm" variant="ghost" disabled={!!noConfig} title={noConfig ?? 'Nuevo concepto'} onClick={() => setModal('nuevo')}>+ Concepto</Button>
      </div>

      {q.isLoading ? <Cargando />
        : q.isError ? <ErrorCarga mensaje={mensajeErrorSueldos(q.error)} onReintentar={() => q.refetch()} />
        : lista.length === 0 ? <p className="text-sm text-gris-dark italic">No hay conceptos con ese filtro.</p>
        : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <Th>Concepto</Th>
                  <Th className="hidden md:table-cell">Cómo se calcula</Th>
                  <Th className="hidden lg:table-cell">Cuándo</Th>
                  <Th className="hidden sm:table-cell">ARCA</Th>
                  <Th derecha>Valor hoy</Th>
                </tr>
              </thead>
              {ORDEN_TIPO.map(tipo => {
                const filas = lista.filter(c => c.tipo === tipo)
                if (filas.length === 0) return null
                return (
                  <tbody key={tipo}>
                    <tr><td colSpan={5} className="bg-azul-light/60 text-azul text-[10px] font-bold uppercase tracking-wide px-3 py-1">{TIPO_CONCEPTO_LABEL[tipo]}</td></tr>
                    {filas.map(c => {
                      const sinValorVig = !c.valor_vigente && c.calculo !== 'manual' && c.calculo !== 'cantidad_x_escala'
                      return (
                        <tr key={c.id} onClick={() => setModal(c)}
                          className={`cursor-pointer hover:bg-naranja-light/30 ${c.activo && !c.pisado_por ? '' : 'opacity-50'}`}>
                          <Td>
                            <div className="font-semibold">{c.nombre}</div>
                            <div className="text-[11px] text-gris-dark font-mono">
                              {c.codigo}{c.convenio_id === null ? ' · común' : ''}{c.automatico ? ' · automático' : ''}{c.en_recibo ? '' : ' · no se imprime'}
                              {c.pisado_por ? ' · reemplazado por uno propio' : ''}{c.activo ? '' : ' · inactivo'}
                            </div>
                          </Td>
                          <Td className="hidden md:table-cell text-xs">{comoSeCalcula(c)}</Td>
                          <Td className="hidden lg:table-cell text-xs">{CONDICION_LABEL[c.condicion]}</Td>
                          <Td className="hidden sm:table-cell font-mono text-xs">{c.codigo_arca ?? <span className="text-naranja-dark font-sans">falta</span>}</Td>
                          <Td derecha>
                            <div className="flex flex-col items-end gap-0.5">
                              {c.valor_vigente ? <span>{valorTexto(c)}</span>
                                : sinValorVig ? <span className="text-rojo text-xs font-sans font-bold">sin valor: no se aplica</span>
                                : <span className="text-gris-dark text-xs font-sans">—</span>}
                              {c.parametro_clave && <span className="text-[10px] text-gris-dark font-sans">de Parámetros · {c.parametro_clave}</span>}
                              {c.valor_vigente?.a_confirmar && <MarcaAConfirmar />}
                            </div>
                          </Td>
                        </tr>
                      )
                    })}
                  </tbody>
                )
              })}
            </table>
          </div>
        )}

      {modal && <ModalConcepto convenio={convenio} concepto={modal === 'nuevo' ? null : modal} noConfig={noConfig} onClose={() => setModal(null)} />}
    </Tarjeta>
  )
}
