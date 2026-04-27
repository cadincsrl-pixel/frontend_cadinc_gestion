'use client'

import { useState, useMemo } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { useChoferes, useCamiones, useBateas } from '../hooks/useLogistica'
import {
  exportarPaqueteOnboarding,
  descargarBlob,
  DEFAULT_CHOFER_TIPOS,
  DEFAULT_VEHICULO_TIPOS,
} from '@/lib/utils/export-onboarding'
import type { ChoferDocTipo, VehiculoDocTipo } from '@/types/domain.types'

interface Props {
  open: boolean
  onClose: () => void
}

const TIPOS_CHOFER: { key: ChoferDocTipo; label: string }[] = [
  { key: 'dni',                 label: 'DNI'                 },
  { key: 'licencia_conducir',   label: 'Licencia'            },
  { key: 'lnh',                 label: 'LNH'                 },
  { key: 'cnrt',                label: 'CNRT'                },
  { key: 'aptitud_psicofisica', label: 'Aptitud psicofísica' },
  { key: 'art',                 label: 'ART'                 },
  { key: 'mopp',                label: 'MOPP'                },
  { key: 'alta_temprana',       label: 'Alta temprana'       },
  { key: 'cuil_afip',           label: 'CUIL/AFIP'           },
  { key: 'cbu_bancario',        label: 'CBU'                 },
  { key: 'telegrama',           label: 'Telegrama'           },
  { key: 'otro',                label: 'Otro'                },
]

const TIPOS_VEHICULO: { key: VehiculoDocTipo; label: string }[] = [
  { key: 'titulo',         label: 'Título'         },
  { key: 'tarjeta_verde',  label: 'Tarjeta verde'  },
  { key: 'rto',            label: 'RTO'            },
  { key: 'poliza_seguro',  label: 'Póliza seguro'  },
]

export function ModalExportOnboarding({ open, onClose }: Props) {
  const toast = useToast()
  const { data: choferes = [] } = useChoferes()
  const { data: camiones = [] } = useCamiones()
  const { data: bateas   = [] } = useBateas()

  const choferesActivos = useMemo(() => choferes.filter(c => c.estado === 'activo'), [choferes])
  const camionesActivos = useMemo(() => camiones.filter(c => c.estado === 'activo'), [camiones])
  const bateasActivas   = useMemo(() => bateas.filter(b => b.estado === 'activo'),   [bateas])

  // Selección — todo activo seleccionado por default; tipos solo esenciales.
  const [selChoferes, setSelChoferes] = useState<Set<number>>(new Set())
  const [selCamiones, setSelCamiones] = useState<Set<number>>(new Set())
  const [selBateas,   setSelBateas]   = useState<Set<number>>(new Set())
  const [selTiposChofer, setSelTiposChofer] = useState<Set<ChoferDocTipo>>(
    new Set(DEFAULT_CHOFER_TIPOS),
  )
  const [selTiposVehiculo, setSelTiposVehiculo] = useState<Set<VehiculoDocTipo>>(
    new Set(DEFAULT_VEHICULO_TIPOS),
  )

  const [empresa,        setEmpresa]        = useState('')
  const [incluirResumen, setIncluirResumen] = useState(true)

  const [exportando, setExportando] = useState(false)
  const [progreso,   setProgreso]   = useState<{ hechos: number; total: number; etapa: string } | null>(null)

  // Inicializar selección al abrir: todo seleccionado.
  function inicializarSeleccion() {
    setSelChoferes(new Set(choferesActivos.map(c => c.id)))
    setSelCamiones(new Set(camionesActivos.map(c => c.id)))
    setSelBateas(new Set(bateasActivas.map(b => b.id)))
    setSelTiposChofer(new Set(DEFAULT_CHOFER_TIPOS))
    setSelTiposVehiculo(new Set(DEFAULT_VEHICULO_TIPOS))
    setEmpresa('')
    setIncluirResumen(true)
    setProgreso(null)
  }

  function toggleSet<T>(set: Set<T>, item: T): Set<T> {
    const next = new Set(set)
    if (next.has(item)) next.delete(item)
    else next.add(item)
    return next
  }

  async function handleExportar() {
    if (selChoferes.size === 0 && selCamiones.size === 0 && selBateas.size === 0) {
      toast('Seleccioná al menos un chofer, camión o batea', 'err')
      return
    }
    if (selTiposChofer.size === 0 && selTiposVehiculo.size === 0) {
      toast('Seleccioná al menos un tipo de documento', 'err')
      return
    }

    setExportando(true)
    setProgreso({ hechos: 0, total: 0, etapa: 'Iniciando…' })
    try {
      const result = await exportarPaqueteOnboarding({
        choferes:       choferesActivos.filter(c => selChoferes.has(c.id)),
        camiones:       camionesActivos.filter(c => selCamiones.has(c.id)),
        bateas:         bateasActivas.filter(b => selBateas.has(b.id)),
        tiposChofer:    [...selTiposChofer],
        tiposVehiculo:  [...selTiposVehiculo],
        empresa,
        incluirResumen,
        onProgress:     (info) => setProgreso(info),
      })
      descargarBlob(result.blob, result.filename)
      if (result.errores.length > 0) {
        toast(`✓ ZIP descargado, pero ${result.errores.length} archivo(s) fallaron — revisá errores.txt`, 'warn')
      } else {
        toast('✓ ZIP descargado', 'ok')
      }
      onClose()
    } catch (e) {
      toast(`Error al generar el ZIP: ${(e as Error).message}`, 'err')
    } finally {
      setExportando(false)
      setProgreso(null)
    }
  }

  // Inicializar la selección la primera vez que se abre.
  if (open && selChoferes.size === 0 && selCamiones.size === 0 && selBateas.size === 0
    && choferesActivos.length + camionesActivos.length + bateasActivas.length > 0) {
    inicializarSeleccion()
  }

  return (
    <Modal
      open={open}
      onClose={exportando ? () => {} : onClose}
      title="📦 EXPORTAR PAQUETE ONBOARDING"
      width="max-w-3xl"
      footer={
        exportando ? (
          <div className="flex-1 text-xs text-gris-dark italic">Descargando… no cierres esta ventana.</div>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>Cancelar</Button>
            <Button variant="primary" onClick={handleExportar}>📦 Generar ZIP</Button>
          </>
        )
      }
    >
      {exportando && progreso ? (
        // Progreso
        <div className="flex flex-col gap-3 py-6">
          <div className="text-sm font-bold text-azul">Generando paquete…</div>
          <div className="text-xs text-gris-dark italic">{progreso.etapa}</div>
          {progreso.total > 0 && (
            <>
              <div className="w-full h-2 bg-gris rounded-full overflow-hidden">
                <div
                  className="h-full bg-azul transition-all"
                  style={{ width: `${Math.min(100, Math.round((progreso.hechos / progreso.total) * 100))}%` }}
                />
              </div>
              <div className="text-xs text-gris-dark text-right">
                {progreso.hechos} de {progreso.total} archivos
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <Input
            label="Empresa destinataria (opcional, va en el nombre del ZIP)"
            placeholder="Transportista del Sur SRL"
            value={empresa}
            onChange={e => setEmpresa(e.target.value)}
          />

          {/* Choferes */}
          <Seccion
            titulo="👷 Choferes"
            count={selChoferes.size}
            total={choferesActivos.length}
            onTodos={() => setSelChoferes(new Set(choferesActivos.map(c => c.id)))}
            onNinguno={() => setSelChoferes(new Set())}
          >
            <div className="bg-gris rounded-xl p-3 max-h-44 overflow-y-auto flex flex-col gap-0.5">
              {choferesActivos.length === 0 && (
                <div className="text-xs text-gris-dark italic text-center py-2">No hay choferes activos.</div>
              )}
              {choferesActivos.map(c => (
                <label key={c.id} className="flex items-center gap-2 cursor-pointer py-1 border-b border-gris-mid/30 last:border-0">
                  <input
                    type="checkbox"
                    checked={selChoferes.has(c.id)}
                    onChange={() => setSelChoferes(s => toggleSet(s, c.id))}
                    className="accent-azul w-4 h-4"
                  />
                  <span className="font-semibold text-sm text-carbon">{c.nombre}</span>
                  {c.cuil && <span className="font-mono text-[10px] text-gris-dark">CUIL {c.cuil}</span>}
                </label>
              ))}
            </div>
          </Seccion>

          {/* Camiones + Bateas */}
          <Seccion
            titulo="🚚🛻 Camiones y bateas"
            count={selCamiones.size + selBateas.size}
            total={camionesActivos.length + bateasActivas.length}
            onTodos={() => {
              setSelCamiones(new Set(camionesActivos.map(c => c.id)))
              setSelBateas(new Set(bateasActivas.map(b => b.id)))
            }}
            onNinguno={() => { setSelCamiones(new Set()); setSelBateas(new Set()) }}
          >
            <div className="bg-gris rounded-xl p-3 max-h-44 overflow-y-auto flex flex-col gap-0.5">
              {camionesActivos.length + bateasActivas.length === 0 && (
                <div className="text-xs text-gris-dark italic text-center py-2">No hay camiones ni bateas activos.</div>
              )}
              {camionesActivos.map(c => (
                <label key={`cam-${c.id}`} className="flex items-center gap-2 cursor-pointer py-1 border-b border-gris-mid/30 last:border-0">
                  <input
                    type="checkbox"
                    checked={selCamiones.has(c.id)}
                    onChange={() => setSelCamiones(s => toggleSet(s, c.id))}
                    className="accent-azul w-4 h-4"
                  />
                  <span className="text-[10px] font-bold bg-azul-light text-azul-mid px-1.5 py-0.5 rounded">🚚</span>
                  <span className="font-mono font-bold text-sm text-carbon">{c.patente}</span>
                  {c.modelo && <span className="text-xs text-gris-dark truncate">{c.modelo}</span>}
                </label>
              ))}
              {bateasActivas.map(b => (
                <label key={`bat-${b.id}`} className="flex items-center gap-2 cursor-pointer py-1 border-b border-gris-mid/30 last:border-0">
                  <input
                    type="checkbox"
                    checked={selBateas.has(b.id)}
                    onChange={() => setSelBateas(s => toggleSet(s, b.id))}
                    className="accent-azul w-4 h-4"
                  />
                  <span className="text-[10px] font-bold bg-naranja-light text-naranja-dark px-1.5 py-0.5 rounded">🛻</span>
                  <span className="font-mono font-bold text-sm text-carbon">{b.patente}</span>
                  {b.tipo && <span className="text-xs text-gris-dark capitalize">{b.tipo}</span>}
                </label>
              ))}
            </div>
          </Seccion>

          {/* Tipos de doc */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Seccion
              titulo="Documentos del chofer"
              count={selTiposChofer.size}
              total={TIPOS_CHOFER.length}
              onTodos={() => setSelTiposChofer(new Set(TIPOS_CHOFER.map(t => t.key)))}
              onNinguno={() => setSelTiposChofer(new Set())}
            >
              <div className="bg-gris rounded-xl p-3 flex flex-col gap-0.5 max-h-44 overflow-y-auto">
                {TIPOS_CHOFER.map(t => (
                  <label key={t.key} className="flex items-center gap-2 cursor-pointer py-0.5">
                    <input
                      type="checkbox"
                      checked={selTiposChofer.has(t.key)}
                      onChange={() => setSelTiposChofer(s => toggleSet(s, t.key))}
                      className="accent-azul w-4 h-4"
                    />
                    <span className="text-sm">{t.label}</span>
                  </label>
                ))}
              </div>
            </Seccion>

            <Seccion
              titulo="Documentos del vehículo"
              count={selTiposVehiculo.size}
              total={TIPOS_VEHICULO.length}
              onTodos={() => setSelTiposVehiculo(new Set(TIPOS_VEHICULO.map(t => t.key)))}
              onNinguno={() => setSelTiposVehiculo(new Set())}
            >
              <div className="bg-gris rounded-xl p-3 flex flex-col gap-0.5">
                {TIPOS_VEHICULO.map(t => (
                  <label key={t.key} className="flex items-center gap-2 cursor-pointer py-0.5">
                    <input
                      type="checkbox"
                      checked={selTiposVehiculo.has(t.key)}
                      onChange={() => setSelTiposVehiculo(s => toggleSet(s, t.key))}
                      className="accent-azul w-4 h-4"
                    />
                    <span className="text-sm">{t.label}</span>
                  </label>
                ))}
              </div>
            </Seccion>
          </div>

          {/* Resumen Excel */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={incluirResumen}
              onChange={e => setIncluirResumen(e.target.checked)}
              className="accent-azul w-4 h-4"
            />
            <span className="text-sm font-semibold text-carbon">
              📊 Incluir resumen Excel (3 hojas: choferes, camiones, bateas)
            </span>
          </label>
        </div>
      )}
    </Modal>
  )
}

function Seccion({
  titulo, count, total, onTodos, onNinguno, children,
}: {
  titulo: string
  count: number
  total: number
  onTodos:   () => void
  onNinguno: () => void
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-bold text-gris-dark uppercase tracking-wider">
          {titulo} ({count}/{total})
        </div>
        <div className="flex gap-1">
          <button onClick={onTodos}   className="text-xs font-bold text-azul hover:text-naranja transition-colors px-2 py-1 rounded hover:bg-gris">Todos</button>
          <button onClick={onNinguno} className="text-xs font-bold text-gris-dark hover:text-carbon transition-colors px-2 py-1 rounded hover:bg-gris">Ninguno</button>
        </div>
      </div>
      {children}
    </div>
  )
}
