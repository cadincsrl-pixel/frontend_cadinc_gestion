'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import type { CtbAmortizarRes, CtbAmortizarTramo } from '@/types/contabilidad.types'
import { useAmortizar, useConfigCtb, useEjercicios } from '../hooks/useContabilidad'
import { finMesAnterior, fmtFecha, fmtM, hoyAR, mesDe } from '../utils/contabilidad.utils'
import { mensajeErrorCtb } from '../utils/contabilidad.errores'
import { Aviso, Campo, Th, inputCls } from './Comun'

/**
 * Generar las amortizaciones hasta una fecha (tanda 5, 20260928q). Mensual:
 * recorre los meses desde «Automáticos desde» hasta el de la fecha y genera
 * (o regenera) un asiento por mes. Anual: la fecha tiene que ser el cierre de
 * un ejercicio. Cada tramo calcula «teórico − registrado», así que se puede
 * correr las veces que haga falta (un mes sin cambios no se toca). Los meses
 * cerrados solo informan.
 */

const ACCION: Record<CtbAmortizarTramo['accion'], { label: string; clase: string }> = {
  creado:          { label: 'Creado',          clase: 'bg-verde-light text-verde' },
  regenerado:      { label: 'Regenerado',      clase: 'bg-azul-light text-azul' },
  sin_cambios:     { label: 'Sin cambios',     clase: 'bg-gris text-gris-dark' },
  periodo_cerrado: { label: 'Mes cerrado',     clase: 'bg-gris text-gris-dark' },
  desactualizado:  { label: 'Desactualizado',  clase: 'bg-amarillo-light text-[#7A5000]' },
  sin_bienes:      { label: 'Nada que amortizar', clase: 'bg-gris text-gris-dark' },
}

export function ModalAmortizar({ onClose, onVerAsiento }: { onClose: () => void; onVerAsiento: (id: number) => void }) {
  const toast = useToast()
  const { puedeEditar, bienesUso } = usePermisos('contabilidad')
  const config = useConfigCtb()
  const ejercicios = useEjercicios()
  const amortizar = useAmortizar()
  const frecuencia = config.data?.bu_frecuencia ?? 'mensual'
  const hoy = hoyAR()
  const [hasta, setHasta] = useState(() => finMesAnterior(hoy))
  const [res, setRes] = useState<CtbAmortizarRes | null>(null)
  const [errorServer, setErrorServer] = useState<string | null>(null)

  const cierres = (ejercicios.data ?? []).map(e => e.hasta).sort()
  const bloqueo = !bienesUso ? 'No tenés permiso (hace falta «Bienes de uso»)'
    : !puedeEditar ? 'No tenés permiso de Editar en Contabilidad (amortizar lo pide)'
    : !hasta ? 'Elegí hasta qué fecha'
    : hasta > mesDe(hoy).hasta ? 'No se puede amortizar un mes que todavía no empezó'
    : frecuencia === 'anual' && !cierres.includes(hasta) ? 'Con frecuencia anual, elegí el cierre de un ejercicio'
    : null

  async function correr() {
    setErrorServer(null)
    try {
      const r = await amortizar.mutateAsync(hasta)
      setRes(r)
      const nuevos = r.tramos.filter(t => t.accion === 'creado' || t.accion === 'regenerado').length
      toast(nuevos > 0 ? `✓ Amortizaciones generadas: ${nuevos} asiento${nuevos === 1 ? '' : 's'} por ${fmtM(r.total)}` : 'Las amortizaciones ya estaban al día', nuevos > 0 ? 'ok' : 'warn')
    } catch (e) {
      setErrorServer(mensajeErrorCtb(e))
    }
  }

  return (
    <Modal open onClose={amortizar.isPending ? () => {} : onClose} width="max-w-3xl" title="Generar amortizaciones"
      footer={<>
        <Button variant="ghost" size="sm" onClick={onClose} disabled={amortizar.isPending}>Cerrar</Button>
        <Button size="sm" loading={amortizar.isPending} disabled={!!bloqueo} onClick={() => void correr()}
          title={bloqueo ?? 'Generar o regenerar los asientos de amortización hasta esa fecha'}>
          {res ? 'Volver a correr' : 'Amortizar'}
        </Button>
      </>}>
      <div className="flex flex-col gap-3 text-sm">
        <Aviso tono="gris">
          Frecuencia: <b>{frecuencia === 'anual' ? 'por ejercicio' : 'por mes'}</b> (se cambia en Mapeos › Configuración).
          {frecuencia === 'mensual'
            ? ' Genera un asiento por mes, desde el primero sin amortizar hasta el de la fecha elegida.'
            : ' Genera un asiento por el ejercicio que cierra en la fecha elegida.'}
          {' '}Cada vez calcula lo que corresponde menos lo ya registrado: se puede correr de nuevo sin duplicar.
        </Aviso>
        <div className="flex gap-2 items-end flex-wrap">
          <Campo label="Amortizar hasta">
            {frecuencia === 'anual' ? (
              <select value={cierres.includes(hasta) ? hasta : ''} onChange={e => setHasta(e.target.value)} className={inputCls}>
                <option value="">Elegí el cierre</option>
                {cierres.map(c => <option key={c} value={c}>{fmtFecha(c)}</option>)}
              </select>
            ) : (
              <input type="date" value={hasta} max={mesDe(hoy).hasta} onChange={e => setHasta(e.target.value)} className={inputCls} />
            )}
          </Campo>
          {frecuencia === 'mensual' && <span className="text-[11px] text-gris-dark pb-2">Conviene el último día del mes (el asiento va con esa fecha).</span>}
        </div>

        {res && (
          <div className="flex flex-col gap-1">
            <div className="text-xs">Total generado: <b className="font-mono tabular-nums">{fmtM(res.total)}</b></div>
            {res.tramos.length === 0 ? <span className="text-xs text-gris-dark italic">No había períodos para amortizar.</span> : (
              <div className="overflow-x-auto border border-gris-mid rounded-lg max-h-[45vh] overflow-y-auto">
                <table className="w-full border-collapse min-w-[560px] text-xs">
                  <thead className="sticky top-0">
                    <tr><Th>Período</Th><Th>Resultado</Th><Th derecha>Bienes</Th><Th derecha>Importe</Th><Th>Asiento</Th></tr>
                  </thead>
                  <tbody>
                    {res.tramos.map(t => {
                      const a = ACCION[t.accion] ?? { label: t.accion, clase: 'bg-gris text-gris-dark' }
                      return (
                        <tr key={`${t.desde}-${t.hasta}`} className="border-t border-gris">
                          <td className="px-3 py-1 whitespace-nowrap">{fmtFecha(t.desde)} – {fmtFecha(t.hasta)}</td>
                          <td className="px-3 py-1">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${a.clase}`}>{a.label}</span>
                            {t.accion === 'desactualizado' && <span className="block text-[10px] text-gris-dark">El mes está cerrado: la diferencia se toma en el próximo mes abierto.</span>}
                          </td>
                          <td className="px-3 py-1 text-right tabular-nums">{t.bienes}</td>
                          <td className="px-3 py-1 text-right font-mono tabular-nums">{fmtM(t.total)}</td>
                          <td className="px-3 py-1">
                            {t.asiento_id
                              ? <button type="button" className="text-azul underline" onClick={() => onVerAsiento(t.asiento_id!)}>Ver asiento</button>
                              : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        {errorServer && <Aviso tono="rojo">{errorServer}</Aviso>}
      </div>
    </Modal>
  )
}
