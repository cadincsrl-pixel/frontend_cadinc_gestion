'use client'

import { useEffect, useState } from 'react'
import { Modal }    from '@/components/ui/Modal'
import { Button }   from '@/components/ui/Button'
import { Combobox } from '@/components/ui/Combobox'
import { Input }    from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { useChoferes } from '../hooks/useLogistica'
import {
  useTramoRelevo, useTramoRelevoSugerencia,
  useCrearRelevo, useUpdateRelevo, useDeleteRelevo,
} from '../hooks/useTramoRelevo'
import type { Chofer, Tramo, TramoChofer } from '@/types/domain.types'

interface Props {
  tramo: Tramo
}

function fmtKm(n: number) {
  return n.toLocaleString('es-AR', { maximumFractionDigits: 1 })
}

// Sección que va dentro del modal de edición del tramo. Si el tramo no
// tiene relevo, muestra un botón para registrarlo. Si lo tiene, muestra
// el detalle de los 2 choferes con km/jornales editables.
export function RelevoSection({ tramo }: Props) {
  const toast = useToast()
  const tramoId = tramo.id
  const isCargado = tramo.tipo === 'cargado'

  const { data: relevo = [], isLoading } = useTramoRelevo(tramoId)
  const { data: choferes = [] } = useChoferes()
  const { mutate: deleteRelevo, isPending: deleting } = useDeleteRelevo()
  const { mutate: updateRelevo, isPending: saving } = useUpdateRelevo()

  const [crearOpen, setCrearOpen] = useState(false)

  const tieneRelevo = relevo.length === 2
  const r1 = relevo.find(r => r.orden === 1)
  const r2 = relevo.find(r => r.orden === 2)
  const choferesById = new Map((choferes as Chofer[]).map(c => [c.id, c]))

  // Inputs locales para edición inline (km y jornales por chofer).
  const [km1, setKm1] = useState('')
  const [km2, setKm2] = useState('')
  const [j1,  setJ1 ] = useState('')
  const [j2,  setJ2 ] = useState('')

  useEffect(() => {
    if (r1 && r2) {
      setKm1(String(isCargado ? r1.km_cargado : r1.km_vacio))
      setKm2(String(isCargado ? r2.km_cargado : r2.km_vacio))
      setJ1(String(r1.jornales))
      setJ2(String(r2.jornales))
    }
  }, [r1, r2, isCargado])

  function handleGuardar() {
    updateRelevo(
      {
        tramoId,
        km_chofer_1: km1 === '' ? undefined : Number(km1),
        km_chofer_2: km2 === '' ? undefined : Number(km2),
        jornales_chofer_1: j1 === '' ? undefined : Number(j1),
        jornales_chofer_2: j2 === '' ? undefined : Number(j2),
      },
      {
        onSuccess: () => toast('✓ Relevo actualizado', 'ok'),
        onError:   (e: any) => toast(e?.message || 'Error al actualizar', 'err'),
      },
    )
  }

  function handleEliminar() {
    if (!confirm('¿Eliminar el relevo? El tramo va a quedar con un solo chofer.')) return
    deleteRelevo(tramoId, {
      onSuccess: () => toast('✓ Relevo eliminado', 'ok'),
      onError:   (e: any) => toast(e?.message || 'Error al eliminar', 'err'),
    })
  }

  return (
    <div className="bg-azul-light rounded-xl p-3 flex flex-col gap-3 border border-azul/20">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-bold text-azul uppercase tracking-wider">
          🔄 Relevo de chofer
        </div>
        {!tieneRelevo ? (
          <Button variant="primary" size="sm" onClick={() => setCrearOpen(true)}>
            + Registrar relevo
          </Button>
        ) : (
          <Button variant="ghost" size="sm" loading={deleting} onClick={handleEliminar}>
            🗑 Quitar relevo
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="text-xs text-gris-dark italic">Cargando…</div>
      ) : !tieneRelevo ? (
        <p className="text-[12px] text-gris-dark">
          Este tramo tiene un solo chofer. Si fue relevado en Chivilcoy,
          registrá el relevo para que la liquidación reparta km/jornales entre ambos.
        </p>
      ) : (
        <>
          <p className="text-[11px] text-azul-mid">
            Lugar de relevo: <b>{r1?.lugar_relevo ?? 'Chivilcoy'}</b>
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { row: r1, km: km1, setKm: setKm1, j: j1, setJ: setJ1, label: 'Chofer 1 (origen → relevo)' },
              { row: r2, km: km2, setKm: setKm2, j: j2, setJ: setJ2, label: 'Chofer 2 (relevo → destino)' },
            ].map((it, idx) => {
              const chofer = it.row ? choferesById.get(it.row.chofer_id) : null
              return (
                <div key={idx} className="bg-white rounded-lg p-2.5 border border-azul/10 flex flex-col gap-1.5">
                  <div className="text-[10px] font-bold text-azul-mid uppercase tracking-wider">{it.label}</div>
                  <div className="font-bold text-sm text-azul">{chofer?.nombre ?? '—'}</div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      label="Km"
                      type="number" step="0.1" min="0"
                      value={it.km}
                      onChange={e => it.setKm(e.target.value)}
                    />
                    <Input
                      label="Jornales"
                      type="number" step="0.5" min="0"
                      value={it.j}
                      onChange={e => it.setJ(e.target.value)}
                    />
                  </div>
                </div>
              )
            })}
          </div>
          <div className="flex justify-end">
            <Button variant="primary" size="sm" loading={saving} onClick={handleGuardar}>
              ✓ Guardar cambios del relevo
            </Button>
          </div>
        </>
      )}

      <ModalCrearRelevo
        tramo={tramo}
        open={crearOpen}
        onClose={() => setCrearOpen(false)}
      />
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────

function ModalCrearRelevo({ tramo, open, onClose }: { tramo: Tramo; open: boolean; onClose: () => void }) {
  const toast = useToast()
  const tramoId = tramo.id
  const isCargado = tramo.tipo === 'cargado'
  const { data: choferes = [] } = useChoferes()
  // Solo cuando el modal está abierto pedimos sugerencia.
  const { data: sug, isLoading: loadingSug, error: sugError } = useTramoRelevoSugerencia(tramoId, open)
  const { mutate: crear, isPending } = useCrearRelevo()

  const [choferRelevo, setChoferRelevo] = useState('')
  const [km1, setKm1] = useState('')
  const [km2, setKm2] = useState('')

  useEffect(() => {
    if (open) {
      setChoferRelevo('')
      setKm1('')
      setKm2('')
    }
  }, [open])

  // Pre-cargo km automáticamente si la sugerencia los trae y el user
  // no tocó los campos todavía.
  useEffect(() => {
    if (open && sug?.encontrado) {
      setKm1(prev => prev === '' ? String(sug.km1 ?? '') : prev)
      setKm2(prev => prev === '' ? String(sug.km2 ?? '') : prev)
    }
  }, [open, sug])

  const choferTramoId = tramo.chofer_id
  const choferOrigen  = (choferes as Chofer[]).find(c => c.id === choferTramoId)
  const opcionesRelevo = (choferes as Chofer[])
    .filter(c => c.estado === 'activo' && c.id !== choferTramoId)
    .map(c => ({ value: String(c.id), label: c.nombre }))

  function handleCrear() {
    if (!choferRelevo) { toast('Elegí el chofer relevista', 'err'); return }
    if (!km1 || !km2)  { toast('Cargá km de ambos choferes', 'err'); return }
    crear(
      {
        tramoId,
        chofer_relevo_id: Number(choferRelevo),
        km_chofer_1: Number(km1),
        km_chofer_2: Number(km2),
      },
      {
        onSuccess: () => { toast('✓ Relevo registrado', 'ok'); onClose() },
        onError:   (e: any) => toast(e?.message || 'Error al registrar', 'err'),
      },
    )
  }

  const sugerenciaInfo = (() => {
    if (loadingSug) return { tono: 'info', msg: 'Calculando km...' }
    if (sugError)   return { tono: 'err',  msg: 'No se pudo calcular la sugerencia.' }
    if (!sug)       return null
    if (sug.encontrado) {
      return {
        tono: 'ok',
        msg: `Sugerencia automática usando rutas existentes: chofer 1 ${fmtKm(sug.km1!)} km, chofer 2 ${fmtKm(sug.km2!)} km. Editables.`,
      }
    }
    if (sug.motivo === 'CHIVILCOY_NO_CARGADO') {
      return { tono: 'warn', msg: 'Chivilcoy no está cargado en Lugares. Cargalo (cantera o depósito) para que el sistema sugiera km automáticamente.' }
    }
    if (sug.motivo === 'CHIVILCOY_SIN_RUTA_RELEVANTE') {
      return { tono: 'warn', msg: 'Falta cargar la ruta entre Chivilcoy y la cantera/depósito de este tramo. Cargá los km manualmente o agregá la ruta en Lugares.' }
    }
    if (sug.motivo === 'RUTA_PRINCIPAL_SIN_KM') {
      return { tono: 'warn', msg: 'La ruta principal no tiene km cargados. Cargá los km manualmente.' }
    }
    return { tono: 'warn', msg: 'No hay datos suficientes para sugerir km. Cargalos manualmente.' }
  })()

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="🔄 REGISTRAR RELEVO"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={isPending} onClick={handleCrear}>✓ Registrar</Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="text-xs text-gris-dark">
          Tramo <b>#{tramoId}</b> · {isCargado ? '🚛 Cargado' : '🔲 Vacío'}<br/>
          Chofer original: <b>{choferOrigen?.nombre ?? '—'}</b>
        </div>

        {sugerenciaInfo && (
          <div
            className={`text-[11px] rounded-lg px-2.5 py-1.5 border ${
              sugerenciaInfo.tono === 'ok'   ? 'bg-verde-light text-verde border-verde/30' :
              sugerenciaInfo.tono === 'warn' ? 'bg-amarillo-light text-[#7A5500] border-amarillo/40' :
              sugerenciaInfo.tono === 'err'  ? 'bg-rojo-light text-rojo border-rojo/30' :
                                               'bg-gris/40 text-gris-dark border-gris-mid'
            }`}
          >
            {sugerenciaInfo.msg}
          </div>
        )}

        <Combobox
          label="Chofer relevista (toma el camión en Chivilcoy)"
          placeholder="Buscar chofer..."
          options={opcionesRelevo}
          value={choferRelevo}
          onChange={setChoferRelevo}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Km chofer 1 (origen → Chivilcoy)"
            type="number" step="0.1" min="0"
            value={km1}
            onChange={e => setKm1(e.target.value)}
          />
          <Input
            label="Km chofer 2 (Chivilcoy → destino)"
            type="number" step="0.1" min="0"
            value={km2}
            onChange={e => setKm2(e.target.value)}
          />
        </div>

        <p className="text-[11px] text-gris-dark italic">
          Cada chofer cobrará el día como jornal completo. Podés editar los jornales después si hace falta.
        </p>
      </div>
    </Modal>
  )
}
