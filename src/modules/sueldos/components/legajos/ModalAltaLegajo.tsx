'use client'

import { useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import type { LegajoCreate } from '@/types/sueldos.types'
import { useCandidatos, useConvenios, useCrearLegajo } from '../../hooks/useSueldos'
import { mensajeErrorSueldos } from '../../utils/sueldos.errores'
import { Aviso, Cargando, Check, ErrorCarga } from '../Comun'

type Origen = 'personal' | 'chofer' | 'libre'

/**
 * Alta de un legajo. Lo normal es partir de una persona de Personal (obreros
 * y administrativos) o de un chofer de Logística: la ficha toma el nombre de
 * ahí y queda vinculada. «Sin vínculo» es para alguien que no está en
 * ninguno de los dos padrones. El convenio se sugiere solo; la categoría es
 * la inicial del convenio y el resto se completa después en la ficha.
 */
export function ModalAltaLegajo({ onClose, onCreado }: { onClose: () => void; onCreado: (id: number) => void }) {
  const toast = useToast()
  const { data: convenios = [] } = useConvenios()
  const candidatos = useCandidatos()
  const crear = useCrearLegajo()

  const [origen, setOrigen] = useState<Origen>('personal')
  const [busca, setBusca] = useState('')
  const [todos, setTodos] = useState(false)
  const [elegido, setElegido] = useState<string>('')   // leg o chofer_id
  const [nombre, setNombre] = useState('')
  const [convenioId, setConvenioId] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  const activos = convenios.filter(c => c.activo)
  const convenioPorCodigo = (cod: string) => activos.find(c => c.codigo === cod)?.id

  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const personal = useMemo(() => {
    const lista = candidatos.data?.personal ?? []
    const t = norm(busca.trim())
    return lista
      .filter(p => todos || p.condicion === 'blanco')
      .filter(p => !t || norm(p.nombre).includes(t) || p.leg.includes(t))
      .slice(0, 80)
  }, [candidatos.data, busca, todos])
  const choferes = useMemo(() => {
    const lista = candidatos.data?.choferes ?? []
    const t = norm(busca.trim())
    return lista
      .filter(c => todos || c.es_propio !== false)
      .filter(c => !t || norm(c.nombre).includes(t))
      .slice(0, 80)
  }, [candidatos.data, busca, todos])

  function elegir(valor: string, convenioSugerido: string) {
    setElegido(valor)
    const id = convenioPorCodigo(convenioSugerido)
    if (id) setConvenioId(String(id))
  }

  function cambiarOrigen(o: Origen) {
    setOrigen(o)
    setElegido('')
    setError(null)
  }

  async function enviar() {
    setError(null)
    if (!convenioId) { setError('Elegí el convenio.'); return }
    const body: LegajoCreate = { convenio_id: Number(convenioId) }
    if (origen === 'personal') {
      if (!elegido) { setError('Elegí una persona de la lista.'); return }
      body.leg = elegido
    } else if (origen === 'chofer') {
      if (!elegido) { setError('Elegí un chofer de la lista.'); return }
      body.chofer_id = Number(elegido)
    } else {
      if (nombre.trim().length < 3) { setError('Escribí el nombre completo (al menos 3 letras).'); return }
      body.nombre = nombre.trim()
    }
    try {
      const l = await crear.mutateAsync(body)
      toast(`✓ Legajo de ${l.nombre_mostrar} creado`, 'ok')
      onCreado(l.id)
    } catch (e) {
      setError(mensajeErrorSueldos(e))
    }
  }

  const tabCls = (activo: boolean) => `flex-1 px-3 py-2 text-xs font-bold rounded-lg border transition-colors ${activo ? 'bg-azul text-white border-azul' : 'bg-white text-azul border-gris-mid hover:bg-gris'}`

  return (
    <Modal open onClose={crear.isPending ? () => {} : onClose} title="Nuevo legajo" width="max-w-xl"
      footer={<>
        <Button variant="ghost" size="sm" onClick={onClose} disabled={crear.isPending}>Cancelar</Button>
        <Button size="sm" loading={crear.isPending} onClick={enviar}>Crear legajo</Button>
      </>}>
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          <button type="button" className={tabCls(origen === 'personal')} onClick={() => cambiarOrigen('personal')}>👷 Desde Personal</button>
          <button type="button" className={tabCls(origen === 'chofer')} onClick={() => cambiarOrigen('chofer')}>🚛 Desde un chofer</button>
          <button type="button" className={tabCls(origen === 'libre')} onClick={() => cambiarOrigen('libre')}>✍ Sin vínculo</button>
        </div>

        {origen !== 'libre' && (
          candidatos.isLoading ? <Cargando texto="Buscando personas y choferes sin legajo…" />
          : candidatos.isError ? <ErrorCarga mensaje={mensajeErrorSueldos(candidatos.error)} onReintentar={() => candidatos.refetch()} />
          : (
            <>
              <Input placeholder={origen === 'personal' ? 'Buscar por nombre o legajo' : 'Buscar chofer'} value={busca} onChange={e => setBusca(e.target.value)} />
              <Check checked={todos} onChange={setTodos}
                label={origen === 'personal' ? 'Mostrar también a los que no están en blanco' : 'Mostrar también choferes que no son propios'} />
              <div className="border border-gris-mid rounded-lg max-h-64 overflow-y-auto divide-y divide-gris">
                {origen === 'personal' && personal.length === 0 && <div className="p-3 text-sm text-gris-dark italic">No hay personas sin legajo con ese criterio.</div>}
                {origen === 'chofer' && choferes.length === 0 && <div className="p-3 text-sm text-gris-dark italic">No hay choferes sin legajo con ese criterio.</div>}
                {origen === 'personal' && personal.map(p => (
                  <button key={p.leg} type="button" onClick={() => elegir(p.leg, p.convenio_sugerido)}
                    className={`w-full text-left px-3 py-2 text-sm ${elegido === p.leg ? 'bg-azul-light text-azul font-bold' : 'hover:bg-naranja-light/50'}`}>
                    <div>{p.nombre}</div>
                    <div className="text-[11px] text-gris-dark">
                      Leg. {p.leg} · {p.condicion ?? 'sin condición'} · {p.modalidad === 'mes' ? 'mensual' : 'por hora'} · sugerido {p.convenio_sugerido.toUpperCase()}
                    </div>
                  </button>
                ))}
                {origen === 'chofer' && choferes.map(c => (
                  <button key={c.chofer_id} type="button" onClick={() => elegir(String(c.chofer_id), c.convenio_sugerido)}
                    className={`w-full text-left px-3 py-2 text-sm ${elegido === String(c.chofer_id) ? 'bg-azul-light text-azul font-bold' : 'hover:bg-naranja-light/50'}`}>
                    <div>{c.nombre}</div>
                    <div className="text-[11px] text-gris-dark">
                      {c.es_propio ? 'Propio' : 'No propio'} · {c.estado ?? '—'}{c.cuil ? ` · CUIL ${c.cuil}` : ''}
                    </div>
                  </button>
                ))}
              </div>
            </>
          )
        )}

        {origen === 'libre' && (
          <>
            <Aviso tono="gris">Solo para alguien que no está en Personal ni en Choferes. Si está en alguno de los dos, conviene vincularlo: el nombre y los datos quedan en un solo lugar.</Aviso>
            <Input label="Apellido y nombre" value={nombre} onChange={e => setNombre(e.target.value)} />
          </>
        )}

        <Select label="Convenio" value={convenioId} onChange={e => setConvenioId(e.target.value)} placeholder="Elegí"
          options={activos.map(c => ({ value: c.id, label: `${c.nombre}${c.cct ? ` (CCT ${c.cct})` : ''}` }))} />
        <p className="text-[11px] text-gris-dark">La categoría arranca en la inicial del convenio. CUIL, ingreso, obra social y CBU se completan en la ficha, que se abre al crear.</p>

        {error && <Aviso tono="rojo">{error}</Aviso>}
      </div>
    </Modal>
  )
}
