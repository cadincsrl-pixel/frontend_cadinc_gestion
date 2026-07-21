'use client'

import { useState, useMemo, useEffect } from 'react'
import { Modal }    from '@/components/ui/Modal'
import { Button }   from '@/components/ui/Button'
import { Input }    from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { useChoferes } from '../hooks/useLogistica'

// Mismo patrón que ModalSolicitudTurno: este modal NO mueve plata ni toca el
// backend. Solo arma un texto plano (chofer + datos bancarios + monto) que el
// usuario copia/manda para que administración haga las transferencias.

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

// "viernes 30-05-26" — día en español, DD-MM-YY. Date en hora local para que
// "2026-05-30" no se corra de día al interpretarse como medianoche UTC.
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

function fmtMonto(n: number): string {
  return '$' + n.toLocaleString('es-AR', { maximumFractionDigits: 2 })
}

// El value de un <input type="number"> es siempre vacío o un número
// JS-parseable con PUNTO decimal (el browser no emite separador de miles ni
// coma para type=number). Así que parseamos directo — NO hay que tocar el
// punto: borrarlo convertía "1234.56" en 123456 (x100). Negativos/NaN → 0.
function parseMonto(raw: string): number {
  if (!raw) return 0
  const n = Number(raw.trim())
  return Number.isFinite(n) && n >= 0 ? n : 0
}

interface Props {
  open: boolean
  onClose: () => void
}

export function ModalSolicitudTransferencia({ open, onClose }: Props) {
  const toast = useToast()
  const { data: choferes = [] } = useChoferes()

  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set())
  // chofer_id (string) → monto tal cual lo tipeó el usuario.
  const [montos,    setMontos]    = useState<Record<string, string>>({})
  const [fecha,     setFecha]     = useState<string>(todayISO())
  const [busqueda,  setBusqueda]  = useState('')

  // Reset al cerrar para no arrastrar selección/montos de la sesión anterior.
  useEffect(() => {
    if (!open) {
      setSeleccionados(new Set())
      setMontos({})
      setBusqueda('')
      setFecha(todayISO())
    }
  }, [open])

  const choferesActivos = useMemo(
    () => choferes.filter(c => c.estado !== 'inactivo'),
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

  function setMonto(id: string, v: string) {
    setMontos(prev => ({ ...prev, [id]: v }))
  }

  function limpiarSeleccion() {
    setSeleccionados(new Set())
    setMontos({})
  }

  // Seleccionados ordenados alfabético para que el texto sea estable.
  const choferesSel = useMemo(() => {
    return choferesActivos
      .filter(c => seleccionados.has(String(c.id)))
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [choferesActivos, seleccionados])

  const total = useMemo(
    () => choferesSel.reduce((acc, c) => acc + parseMonto(montos[String(c.id)] ?? ''), 0),
    [choferesSel, montos],
  )

  const texto = useMemo(() => {
    if (!choferesSel.length) return ''
    const header = [
      `Solicitud de transferencia — ${fmtFecha(fecha)}`,
    ]
    const bloques = choferesSel.map(c => {
      const monto = parseMonto(montos[String(c.id)] ?? '')
      const lineas = [
        `${c.nombre} — ${fmtMonto(monto)}`,
      ]
      if (c.cuil)  lineas.push(`  CUIL: ${c.cuil}`)
      if (c.alias) lineas.push(`  Alias: ${c.alias}`)
      if (c.cbu)   lineas.push(`  CBU: ${c.cbu}`)
      return lineas.join('\n')
    })
    const cierre = choferesSel.length > 1 ? ['', `TOTAL: ${fmtMonto(total)}`] : []
    return [...header, '', bloques.join('\n\n'), ...cierre].join('\n')
  }, [choferesSel, fecha, montos, total])

  // Advertencias: sin datos bancarios (no se puede transferir) o sin monto.
  const advertencias = useMemo(() => {
    const out: string[] = []
    for (const c of choferesSel) {
      if (!c.alias && !c.cbu) out.push(`${c.nombre}: sin alias ni CBU cargado.`)
      if (parseMonto(montos[String(c.id)] ?? '') <= 0) out.push(`${c.nombre}: monto en cero.`)
    }
    return out
  }, [choferesSel, montos])

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
    a.download = `solicitud-transferencia-${fecha}.txt`
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
      title="🏦 SOLICITUD DE TRANSFERENCIA"
      width="max-w-lg"
      footer={<Button variant="secondary" onClick={onClose}>Cerrar</Button>}
    >
      <div className="flex flex-col gap-3">
        <Input
          label="Fecha"
          type="date"
          value={fecha}
          onChange={e => setFecha(e.target.value)}
        />

        {/* Multi-select de choferes con buscador + monto por chofer. */}
        <div className="flex flex-col gap-2">
          <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">
            Choferes y montos *
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
            {cantSelec > 0 && (
              <button
                type="button"
                onClick={limpiarSeleccion}
                className="text-[11px] font-bold text-gris-dark hover:text-rojo underline-offset-2 hover:underline"
              >
                Limpiar
              </button>
            )}
          </div>
          <div className="bg-gris/40 rounded-lg max-h-64 overflow-y-auto divide-y divide-gris border border-gris-mid">
            {filtrados.length === 0 ? (
              <p className="px-3 py-3 text-xs text-gris-dark text-center italic">
                {busqueda ? `Sin resultados para "${busqueda}"` : 'No hay choferes.'}
              </p>
            ) : (
              filtrados.map(c => {
                const id = String(c.id)
                const checked = seleccionados.has(id)
                const sinBanco = !c.alias && !c.cbu
                return (
                  <div key={id} className="px-3 py-2 hover:bg-white/60 transition-colors">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(id)}
                        className="w-4 h-4 accent-naranja"
                      />
                      <label className="flex-1 min-w-0 cursor-pointer" onClick={() => toggle(id)}>
                        <div className="font-semibold text-sm text-carbon truncate">{c.nombre}</div>
                        <div className="text-[11px] text-gris-dark font-mono truncate">
                          {c.alias || c.cbu || (sinBanco ? '⚠ sin datos bancarios' : '')}
                        </div>
                      </label>
                      {checked && (
                        <div className="w-28 shrink-0">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="Monto"
                            value={montos[id] ?? ''}
                            onChange={e => setMonto(id, e.target.value)}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
          {cantSelec > 0 && (
            <div className="flex justify-between text-[11px] font-bold">
              <span className="text-naranja-dark">{cantSelec} seleccionado{cantSelec !== 1 ? 's' : ''}</span>
              <span className="text-azul">Total: {fmtMonto(total)}</span>
            </div>
          )}
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
