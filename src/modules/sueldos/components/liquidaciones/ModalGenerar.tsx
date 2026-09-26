'use client'

import { useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import type { LiquidacionDetalle, ResultadoGenerar } from '@/types/sueldos.types'
import { useGenerarRecibos, useLegajos } from '../../hooks/useSueldos'
import { AVISO_CORTO, fmtM } from '../../utils/sueldos.utils'
import { mensajeCodigo, mensajeErrorSueldos } from '../../utils/sueldos.errores'
import { Aviso, Cargando, Check } from '../Comun'

const MOTIVO_OMITIDO: Record<string, string> = {
  YA_TIENE_RECIBO: 'ya tenía recibo (no se tocó)',
  OTRO_CONVENIO: 'es de otro convenio',
  SIN_HORAS_EN_TARJA: 'no tiene horas en la tarja de este período (si corresponde, agregalo con «Agregar empleado»)',
}

/**
 * «Generar recibos»: crea los recibos en borrador. En quincena, mensual y SAC
 * se puede generar para todos los legajos activos del convenio; en
 * vacaciones, final y ajuste hay que elegir a quiénes (el backend lo exige).
 */
export function ModalGenerar({ liquidacion: l, onClose }: { liquidacion: LiquidacionDetalle; onClose: () => void }) {
  const generar = useGenerarRecibos()
  const obligaElegir = l.tipo === 'vacaciones' || l.tipo === 'final' || l.tipo === 'ajuste'
  const [todos, setTodos] = useState(!obligaElegir)
  const [elegidos, setElegidos] = useState<Set<number>>(new Set())
  const [busca, setBusca] = useState('')
  const [reemplazar, setReemplazar] = useState(false)
  const [prestamos, setPrestamos] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [resultado, setResultado] = useState<ResultadoGenerar | null>(null)

  const legajos = useLegajos({ convenio_id: l.convenio_id, activo: 'true' }, !todos)
  const conRecibo = useMemo(() => new Set(l.recibos.map(r => r.legajo_id)), [l.recibos])
  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return (legajos.data ?? []).filter(x => !t || x.nombre_mostrar.toLowerCase().includes(t) || (x.leg ?? '').includes(t))
  }, [legajos.data, busca])

  function alternar(id: number) {
    setElegidos(s => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  async function enviar() {
    setError(null)
    if (!todos && elegidos.size === 0) { setError('Elegí al menos un empleado.'); return }
    try {
      const res = await generar.mutateAsync({
        id: l.id,
        ...(todos ? {} : { legajo_ids: [...elegidos] }),
        reemplazar,
        incluir_prestamos: prestamos,
      })
      setResultado(res)
    } catch (e) {
      setError(mensajeErrorSueldos(e))
    }
  }

  if (resultado) {
    return (
      <Modal open onClose={onClose} title="Recibos generados" width="max-w-xl"
        footer={<Button size="sm" onClick={onClose}>Listo</Button>}>
        <div className="flex flex-col gap-3 text-sm">
          <Aviso tono="verde">Se generaron {resultado.creados.length} recibo(s) en borrador. Revisalos uno por uno antes de cerrar.</Aviso>
          {resultado.creados.length > 0 && (
            <div className="max-h-56 overflow-y-auto border border-gris-mid rounded-lg divide-y divide-gris">
              {resultado.creados.map(c => (
                <div key={c.legajo_id} className="px-3 py-1.5">
                  <div className="flex justify-between gap-2"><span>{c.nombre}</span><span className={`font-mono ${c.neto < 0 ? 'text-rojo' : ''}`}>{fmtM(c.neto)}</span></div>
                  {c.avisos.length > 0 && <div className="text-[11px] text-[#7A5000]">⚠ {c.avisos.map(a => AVISO_CORTO[a] ?? a).join(' · ')}</div>}
                </div>
              ))}
            </div>
          )}
          {resultado.omitidos.length > 0 && (
            <Aviso tono="gris">
              Omitidos: {resultado.omitidos.map(o => `${o.nombre} (${MOTIVO_OMITIDO[o.motivo] ?? o.motivo})`).join(', ')}.
            </Aviso>
          )}
          {resultado.errores.length > 0 && (
            <Aviso tono="rojo">
              <div className="font-bold mb-1">No se pudieron generar {resultado.errores.length}:</div>
              {resultado.errores.map(e => (
                <div key={e.legajo_id}>• {e.nombre}: {mensajeCodigo(e.error, e.detail)}</div>
              ))}
            </Aviso>
          )}
        </div>
      </Modal>
    )
  }

  return (
    <Modal open onClose={generar.isPending ? () => {} : onClose} title={`Generar recibos · ${l.codigo}`} width="max-w-xl"
      footer={<>
        <Button variant="ghost" size="sm" onClick={onClose} disabled={generar.isPending}>Cancelar</Button>
        <Button size="sm" loading={generar.isPending} onClick={enviar}>Generar</Button>
      </>}>
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-xs text-gris-dark">
          {l.tipo === 'quincena' && 'Toma como sugerencia las horas cargadas en la tarja de la quincena (se pueden cambiar después en cada recibo).'}
          {l.tipo === 'mensual' && 'Toma los días del mes dentro del ingreso y egreso de cada uno.'}
          {l.tipo === 'sac' && 'Sugiere el SAC con la mejor remuneración del semestre (de recibos cerrados). Si no hay historial, queda para cargar a mano.'}
          {l.tipo === 'vacaciones' && 'Sugiere los días por antigüedad × valor día de cada empleado elegido.'}
          {l.tipo === 'final' && 'Sugiere SAC proporcional y vacaciones no gozadas. El legajo necesita la fecha de egreso cargada.'}
          {l.tipo === 'ajuste' && 'Crea los recibos vacíos para cargar a mano lo que corresponda.'}
        </p>

        {!obligaElegir && (
          <div className="flex flex-col gap-1">
            <Check checked={todos} onChange={setTodos} label="Todos los legajos activos del convenio" />
          </div>
        )}
        {!todos && (
          <>
            <Input placeholder="Buscar empleado" value={busca} onChange={e => setBusca(e.target.value)} />
            {legajos.isLoading ? <Cargando /> : (
              <div className="max-h-60 overflow-y-auto border border-gris-mid rounded-lg divide-y divide-gris">
                {lista.length === 0 && <div className="p-3 text-gris-dark italic">No hay legajos activos en este convenio.</div>}
                {lista.map(x => (
                  <label key={x.id} className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-naranja-light/40">
                    <input type="checkbox" className="accent-naranja" checked={elegidos.has(x.id)} onChange={() => alternar(x.id)} />
                    <span className="flex-1">{x.nombre_mostrar}{x.leg ? <span className="text-[11px] text-gris-dark"> · Leg. {x.leg}</span> : null}</span>
                    {conRecibo.has(x.id) && <span className="text-[10px] text-gris-dark">ya tiene recibo</span>}
                    {x.incompleto && <span className="text-[10px] text-naranja-dark font-bold">incompleta</span>}
                  </label>
                ))}
              </div>
            )}
            <div className="text-[11px] text-gris-dark">{elegidos.size} elegido(s)</div>
          </>
        )}

        <Check checked={prestamos} onChange={setPrestamos} label="Sugerir el saldo de préstamos (Tarja › Préstamos) como descuento" />
        <Check checked={reemplazar} onChange={setReemplazar} label="Recalcular también los que ya tienen recibo" />
        {reemplazar && <Aviso tono="naranja">Los recibos que ya existen se vuelven a armar con las sugerencias: se pierde lo que se haya cargado a mano en ellos.</Aviso>}
        {error && <Aviso tono="rojo">{error}</Aviso>}
      </div>
    </Modal>
  )
}
