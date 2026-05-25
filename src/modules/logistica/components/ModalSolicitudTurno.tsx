'use client'

import { useState, useMemo } from 'react'
import { Modal }    from '@/components/ui/Modal'
import { Button }   from '@/components/ui/Button'
import { Combobox } from '@/components/ui/Combobox'
import { Input }    from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { useChoferes, useCamiones, useBateas } from '../hooks/useLogistica'

// Datos fijos del solicitante. CADINC SRL es siempre quien pide el cupo
// a la cementera/proveedor; este componente solo genera el texto que se
// reenvía por WhatsApp/email/etc.
const CADINC = {
  nombre: 'CADINC SRL',
  cuit:   '33-71719194-9',
}

function fmtFecha(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
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

  const [choferSel, setChoferSel] = useState<string>('')
  const [fecha,     setFecha]     = useState<string>(todayISO())

  const choferData = choferes.find(c => String(c.id) === choferSel) ?? null
  const camion = choferData?.camion_id ? camiones.find(c => c.id === choferData.camion_id) ?? null : null
  const batea  = choferData?.batea_id  ? bateas.find(b => b.id === choferData.batea_id) ?? null   : null

  const texto = useMemo(() => {
    if (!choferData || !fecha) return ''
    return [
      `Solicitud de turno — ${fmtFecha(fecha)}`,
      ``,
      `Solicitante: ${CADINC.nombre}`,
      `CUIT: ${CADINC.cuit}`,
      `Chofer: ${choferData.nombre}${choferData.cuil ? ` / CUIL ${choferData.cuil}` : ''}`,
      `Camión: ${camion?.patente ?? '—'}`,
      `Batea: ${batea?.patente ?? '—'}`,
    ].join('\n')
  }, [choferData, fecha, camion, batea])

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

  const choferOptions = choferes
    .filter(c => c.estado === 'activo')
    .map(c => ({
      value: String(c.id),
      label: c.nombre,
      sub:   c.cuil ?? 'sin CUIL',
    }))

  const advertencias: string[] = []
  if (choferData && !choferData.cuil) advertencias.push('Este chofer no tiene CUIL cargado.')
  if (choferData && !camion)          advertencias.push('Este chofer no tiene camión preasignado.')
  if (choferData && !batea)           advertencias.push('Este chofer no tiene batea preasignada.')

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="📋 SOLICITUD DE TURNO"
      width="max-w-lg"
      footer={<Button variant="secondary" onClick={onClose}>Cerrar</Button>}
    >
      <div className="flex flex-col gap-3">
        <Combobox
          label="Chofer *"
          placeholder="Buscar chofer..."
          options={choferOptions}
          value={choferSel}
          onChange={setChoferSel}
        />
        <Input
          label="Fecha del turno *"
          type="date"
          value={fecha}
          onChange={e => setFecha(e.target.value)}
        />

        {/* Vista previa del texto generado. Es lo que se va a copiar/enviar. */}
        <div className="flex flex-col gap-2">
          <div className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">
            Vista previa
          </div>
          {texto ? (
            <pre className="bg-gris/40 border border-gris-mid rounded-lg p-3 text-xs font-mono text-carbon whitespace-pre-wrap leading-relaxed">
              {texto}
            </pre>
          ) : (
            <div className="bg-gris/40 border border-gris-mid rounded-lg p-3 text-xs text-gris-dark italic text-center">
              Seleccioná un chofer para ver la vista previa.
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

        {/* Botones de export: copiar / WhatsApp / .txt */}
        <div className="grid grid-cols-3 gap-2">
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
