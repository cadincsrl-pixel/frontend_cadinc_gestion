'use client'

import { useState, useMemo, useEffect } from 'react'
import { Modal }    from '@/components/ui/Modal'
import { Button }   from '@/components/ui/Button'
import { Input }    from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { useChoferes, useCamiones, useBateas } from '../hooks/useLogistica'
import { EMPRESA } from '@/lib/config/empresa'

// El solicitante es la empresa operadora (CADINC por default). Este componente
// solo genera el texto que se reenvía por WhatsApp/email/etc.
const CADINC = {
  nombre: EMPRESA.nombre,
  cuit:   EMPRESA.cuit,
}

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

// Formato pedido por las cementeras/proveedores: "miércoles 27-05-26"
// (día de la semana en español, DD-MM-YY con guiones, año a 2 dígitos).
// Construyo la Date en hora local (no UTC) para evitar que "2026-05-27"
// se interprete como midnight UTC y cambie de día en zonas al oeste.
function fmtFecha(iso: string): string {
  if (!iso) return ''
  const [yStr, mStr, dStr] = iso.split('-')
  const y = Number(yStr), m = Number(mStr), d = Number(dStr)
  if (!y || !m || !d) return ''
  const dow = DIAS_SEMANA[new Date(y, m - 1, d).getDay()]
  const dd = String(d).padStart(2, '0')
  const mm = String(m).padStart(2, '0')
  const yy = String(y).slice(-2)
  return `${dow} ${dd}-${mm}-${yy}`
}

function todayISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

interface Props {
  open: boolean
  onClose: () => void
}

export function ModalSolicitudTurno({ open, onClose }: Props) {
  const toast = useToast()
  const { data: choferes = [] } = useChoferes()
  const { data: camiones = [] } = useCamiones()
  const { data: bateas   = [] } = useBateas()

  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set())
  const [fecha,         setFecha]         = useState<string>(todayISO())
  const [busqueda,      setBusqueda]      = useState('')

  // Reset al cerrar/abrir para no arrastrar selección de la sesión anterior.
  useEffect(() => {
    if (!open) {
      setSeleccionados(new Set())
      setBusqueda('')
      setFecha(todayISO())
    }
  }, [open])

  const choferesActivos = useMemo(
    () => choferes.filter(c => c.estado === 'activo'),
    [choferes],
  )

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return choferesActivos
    return choferesActivos.filter(c =>
      c.nombre.toLowerCase().includes(q) ||
      (c.cuil ?? '').toLowerCase().includes(q),
    )
  }, [choferesActivos, busqueda])

  function toggle(id: string) {
    setSeleccionados(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function seleccionarTodosFiltrados() {
    setSeleccionados(prev => {
      const next = new Set(prev)
      filtrados.forEach(c => next.add(String(c.id)))
      return next
    })
  }

  function limpiarSeleccion() {
    setSeleccionados(new Set())
  }

  // Datos de los choferes seleccionados, ordenados como aparecen en la lista
  // (alfabético por nombre) para que el texto generado sea estable.
  const choferesSel = useMemo(() => {
    return choferesActivos
      .filter(c => seleccionados.has(String(c.id)))
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [choferesActivos, seleccionados])

  function camionDe(choferId: number | null) {
    if (!choferId) return null
    const ch = choferes.find(c => c.id === choferId)
    if (!ch?.camion_id) return null
    return camiones.find(c => c.id === ch.camion_id) ?? null
  }
  function bateaDe(choferId: number | null) {
    if (!choferId) return null
    const ch = choferes.find(c => c.id === choferId)
    if (!ch?.batea_id) return null
    return bateas.find(b => b.id === ch.batea_id) ?? null
  }

  const texto = useMemo(() => {
    if (!choferesSel.length || !fecha) return ''
    const header = [
      `Solicitud de turno — ${fmtFecha(fecha)}`,
      ``,
      `Solicitante: ${CADINC.nombre}`,
      `CUIT: ${CADINC.cuit}`,
    ]
    const bloques = choferesSel.map(ch => {
      const camion = camionDe(ch.id)
      const batea  = bateaDe(ch.id)
      return [
        `Chofer: ${ch.nombre}${ch.cuil ? ` / CUIL ${ch.cuil}` : ''}`,
        `Camión: ${camion?.patente ?? '—'}`,
        `Batea: ${batea?.patente ?? '—'}`,
      ].join('\n')
    })
    return [...header, '', bloques.join('\n\n')].join('\n')
  }, [choferesSel, fecha, choferes, camiones, bateas])

  // Detectar datos faltantes para mostrar advertencias por chofer
  // (CUIL ausente, camión o batea no preasignados).
  const advertencias = useMemo(() => {
    const out: string[] = []
    for (const ch of choferesSel) {
      if (!ch.cuil)          out.push(`${ch.nombre}: sin CUIL cargado.`)
      if (!camionDe(ch.id))  out.push(`${ch.nombre}: sin camión preasignado.`)
      if (!bateaDe(ch.id))   out.push(`${ch.nombre}: sin batea preasignada.`)
    }
    return out
  }, [choferesSel, choferes, camiones, bateas])

  async function handleCopiar() {
    if (!texto) return
    try {
      await navigator.clipboard.writeText(texto)
      toast('✓ Copiado al portapapeles', 'ok')
    } catch {
      toast('No se pudo copiar — seleccioná el texto manualmente', 'err')
    }
  }

  function handleWhatsApp() {
    if (!texto) return
    const url = `https://wa.me/?text=${encodeURIComponent(texto)}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  function handleDescargar() {
    if (!texto) return
    const blob = new Blob([texto], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `solicitud-turno-${fecha}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const cantSelec = seleccionados.size

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="📋 SOLICITUD DE TURNO"
      width="max-w-lg"
      footer={<Button variant="secondary" onClick={onClose}>Cerrar</Button>}
    >
      <div className="flex flex-col gap-3">
        <Input
          label="Fecha del turno *"
          type="date"
          value={fecha}
          onChange={e => setFecha(e.target.value)}
        />

        {/* Multi-select de choferes con buscador + acciones rápidas. */}
        <div className="flex flex-col gap-2">
          <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">
            Choferes * (uno o más)
          </label>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Wrapper: el className del Input cae en el <input> interno (que
                ya es w-full) — flex-1/min-w deben ir en un contenedor. */}
            <div className="flex-1 min-w-[160px]">
              <Input
                placeholder="🔍 Buscar por nombre o CUIL..."
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
              />
            </div>
            <span className="text-[11px] text-gris-dark font-bold">
              {busqueda
                ? `${filtrados.length} de ${choferesActivos.length}`
                : `${choferesActivos.length} activos`}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap text-[11px]">
            <button
              type="button"
              onClick={seleccionarTodosFiltrados}
              disabled={filtrados.length === 0}
              className="font-bold text-azul hover:text-naranja disabled:text-gris-mid disabled:cursor-not-allowed underline-offset-2 hover:underline"
            >
              Seleccionar {busqueda ? 'filtrados' : 'todos'}
            </button>
            <span className="text-gris-mid">·</span>
            <button
              type="button"
              onClick={limpiarSeleccion}
              disabled={cantSelec === 0}
              className="font-bold text-gris-dark hover:text-rojo disabled:text-gris-mid disabled:cursor-not-allowed underline-offset-2 hover:underline"
            >
              Limpiar
            </button>
            {cantSelec > 0 && (
              <span className="ml-auto text-naranja-dark font-bold">
                {cantSelec} seleccionado{cantSelec !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="bg-gris/40 rounded-lg max-h-56 overflow-y-auto divide-y divide-gris border border-gris-mid">
            {filtrados.length === 0 ? (
              <p className="px-3 py-3 text-xs text-gris-dark text-center italic">
                {busqueda ? `Sin resultados para "${busqueda}"` : 'No hay choferes activos.'}
              </p>
            ) : (
              filtrados.map(c => {
                const id = String(c.id)
                const checked = seleccionados.has(id)
                return (
                  <label
                    key={id}
                    className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-white/60 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(id)}
                      className="w-4 h-4 accent-naranja"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-carbon truncate">{c.nombre}</div>
                      <div className="text-[11px] text-gris-dark font-mono">
                        {c.cuil ?? 'sin CUIL'}
                      </div>
                    </div>
                  </label>
                )
              })
            )}
          </div>
        </div>

        {/* Vista previa del texto generado. */}
        <div className="flex flex-col gap-2">
          <div className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">
            Vista previa
          </div>
          {texto ? (
            <pre className="bg-gris/40 border border-gris-mid rounded-lg p-3 text-xs font-mono text-carbon whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">
              {texto}
            </pre>
          ) : (
            <div className="bg-gris/40 border border-gris-mid rounded-lg p-3 text-xs text-gris-dark italic text-center">
              Seleccioná al menos un chofer para ver la vista previa.
            </div>
          )}
          {advertencias.map((a, i) => (
            <div
              key={i}
              className="text-[11px] text-naranja-dark bg-naranja-light/50 border-l-[3px] border-naranja px-2 py-1.5 rounded"
            >
              ⚠ {a}
            </div>
          ))}
        </div>

        {/* Botones de export. */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <Button variant="primary" size="sm" onClick={handleCopiar} disabled={!texto}>
            📋 Copiar
          </Button>
          <Button variant="secondary" size="sm" onClick={handleWhatsApp} disabled={!texto}>
            📱 WhatsApp
          </Button>
          <Button variant="secondary" size="sm" onClick={handleDescargar} disabled={!texto}>
            ⬇ .txt
          </Button>
        </div>
      </div>
    </Modal>
  )
}
