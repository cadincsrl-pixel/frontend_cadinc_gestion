'use client'

import { useEffect, useState } from 'react'
import {
  useAjustesPendientes,
  useAprobarAjuste,
  useRechazarAjuste,
  fetchComprobanteUrl,
} from '../hooks/useStock'
import { useToast } from '@/components/ui/Toast'
import { Modal }    from '@/components/ui/Modal'
import { Button }   from '@/components/ui/Button'
import { usePermisos } from '@/hooks/usePermisos'

const SUB_MOTIVO_LABELS: Record<string, string> = {
  faltante_fisico:    'Faltante físico',
  dano_rotura:        'Daño / rotura',
  error_carga:        'Error de carga',
  merma_normal:       'Merma normal',
  ingreso_sin_compra: 'Ingreso sin compra',
  otro:               'Otro',
}

const SUB_MOTIVO_COLORS: Record<string, string> = {
  faltante_fisico:    'bg-rojo-light text-rojo',
  dano_rotura:        'bg-naranja-light text-naranja-dark',
  error_carga:        'bg-azul-light text-azul',
  merma_normal:       'bg-gris text-gris-dark',
  ingreso_sin_compra: 'bg-verde-light text-verde',
  otro:               'bg-gris text-gris-dark',
}

function fmtFechaHora(iso: string) {
  const d = new Date(iso)
  return `${d.toLocaleDateString('es-AR')} ${d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`
}

interface AjusteRow {
  id:           number
  material_id:  number
  cantidad:     number
  sub_motivo:   string | null
  obs:          string | null
  created_at:   string
  created_by:   string | null
  comprobante_storage_path: string | null
  stock_materiales?: { id: number; nombre: string; unidad: string; stock_actual: number } | null
  declarante?:       { id: string; nombre: string }                                       | null
}

export function AjustesPendientesSection() {
  const { aprobarAjustesStock, esAdmin } = usePermisos('certificaciones')
  const habilitado = esAdmin || aprobarAjustesStock
  const { data: ajustes = [], isLoading } = useAjustesPendientes(habilitado)
  const { mutate: aprobar,  isPending: aprobando  } = useAprobarAjuste()
  const { mutate: rechazar, isPending: rechazando } = useRechazarAjuste()
  const toast = useToast()
  const [verComprob, setVerComprob] = useState<AjusteRow | null>(null)
  const [comprobUrl, setComprobUrl] = useState<string | null>(null)
  const [rechazoOpen, setRechazoOpen] = useState<AjusteRow | null>(null)
  const [motivoRechazo, setMotivoRechazo] = useState('')

  useEffect(() => {
    let cancelled = false
    async function cargar() {
      if (!verComprob?.comprobante_storage_path) { setComprobUrl(null); return }
      try {
        const url = await fetchComprobanteUrl(verComprob.comprobante_storage_path)
        if (!cancelled) setComprobUrl(url)
      } catch {
        if (!cancelled) setComprobUrl(null)
      }
    }
    cargar()
    return () => { cancelled = true }
  }, [verComprob])

  if (!habilitado) return null
  if (isLoading) return null
  if (ajustes.length === 0) return null

  function handleAprobar(id: number) {
    aprobar(id, {
      onSuccess: () => toast('✓ Ajuste aprobado, stock actualizado', 'ok'),
      onError:   (e: any) => toast(e?.message ?? 'Error al aprobar', 'err'),
    })
  }

  function handleRechazar() {
    if (!rechazoOpen) return
    if (motivoRechazo.trim().length < 3) {
      toast('El motivo del rechazo es obligatorio', 'err'); return
    }
    rechazar({ movId: rechazoOpen.id, motivo: motivoRechazo.trim() }, {
      onSuccess: () => {
        toast('Ajuste rechazado', 'ok')
        setRechazoOpen(null)
        setMotivoRechazo('')
      },
      onError: (e: any) => toast(e?.message ?? 'Error al rechazar', 'err'),
    })
  }

  return (
    <>
      <div className="bg-white rounded-card shadow-card overflow-hidden border-l-[5px] border-amarillo">
        <div className="px-4 py-3 bg-amarillo-light/60 border-b border-amarillo/30">
          <h2 className="font-bold text-[#7A5500] text-base">
            🔔 Ajustes pendientes de aprobación
          </h2>
          <p className="text-[11px] text-[#7A5500]/80 mt-0.5">
            {ajustes.length} ajuste{ajustes.length !== 1 ? 's' : ''} esperando revisión. El stock no se modifica hasta que apruebes.
          </p>
        </div>
        <div className="p-3 flex flex-col gap-2">
          {(ajustes as AjusteRow[]).map(a => {
            const delta = Number(a.cantidad)
            const negativo = delta < 0
            const stockActual = a.stock_materiales?.stock_actual ?? 0
            const stockResultante = stockActual + delta
            return (
              <div key={a.id} className="bg-white border-l-4 border-naranja rounded-lg shadow-sm p-3 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm text-carbon">{a.stock_materiales?.nombre ?? '—'}</div>
                    <div className="text-[11px] text-gris-dark mt-0.5">
                      Stock actual: <span className="font-mono">{stockActual} {a.stock_materiales?.unidad ?? ''}</span>
                      {' '}→{' '}
                      <span className={`font-mono font-bold ${stockResultante < 0 ? 'text-rojo' : ''}`}>{stockResultante}</span>
                    </div>
                  </div>
                  <span className={`font-mono font-bold text-xl ${negativo ? 'text-rojo' : 'text-verde'}`}>
                    {negativo ? '' : '+'}{delta} {a.stock_materiales?.unidad ?? ''}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {a.sub_motivo && (
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${SUB_MOTIVO_COLORS[a.sub_motivo] ?? 'bg-gris text-gris-dark'}`}>
                      {SUB_MOTIVO_LABELS[a.sub_motivo] ?? a.sub_motivo}
                    </span>
                  )}
                  <span className="text-gris-dark">
                    👤 {a.declarante?.nombre ?? '—'}
                  </span>
                  <span className="text-gris-dark">
                    🕒 {fmtFechaHora(a.created_at)}
                  </span>
                </div>
                {a.obs && (
                  <div className="bg-gris/50 rounded p-2 text-xs text-carbon">
                    <span className="font-bold uppercase text-[10px] text-gris-dark mr-1">Obs:</span>
                    {a.obs}
                  </div>
                )}
                <div className="flex flex-wrap gap-2 pt-2 border-t border-gris">
                  {a.comprobante_storage_path && (
                    <button
                      onClick={() => setVerComprob(a)}
                      className="text-[11px] font-bold px-3 py-1.5 rounded bg-azul-light text-azul hover:opacity-80"
                    >
                      📷 Ver comprobante
                    </button>
                  )}
                  <Button
                    size="sm"
                    variant="primary"
                    loading={aprobando}
                    onClick={() => handleAprobar(a.id)}
                  >
                    ✓ Aprobar
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    loading={rechazando}
                    onClick={() => setRechazoOpen(a)}
                  >
                    ✕ Rechazar
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Modal ver comprobante */}
      {verComprob && (
        <Modal
          open
          onClose={() => setVerComprob(null)}
          title={`📷 Comprobante de ${verComprob.stock_materiales?.nombre ?? 'ajuste'}`}
          width="max-w-2xl"
          footer={<Button variant="secondary" onClick={() => setVerComprob(null)}>Cerrar</Button>}
        >
          {!comprobUrl ? (
            <div className="text-sm text-gris-dark italic text-center py-8">Cargando...</div>
          ) : verComprob.comprobante_storage_path?.endsWith('.pdf') ? (
            <a href={comprobUrl} target="_blank" rel="noreferrer" className="block text-center py-6">
              <Button variant="primary">📄 Abrir PDF en nueva pestaña</Button>
            </a>
          ) : (
            <img src={comprobUrl} alt="Comprobante" className="max-h-[70vh] w-full object-contain bg-gris rounded" />
          )}
        </Modal>
      )}

      {/* Modal rechazar */}
      {rechazoOpen && (
        <Modal
          open
          onClose={() => { setRechazoOpen(null); setMotivoRechazo('') }}
          title="✕ Rechazar ajuste"
          footer={
            <>
              <Button variant="secondary" onClick={() => { setRechazoOpen(null); setMotivoRechazo('') }}>
                Cancelar
              </Button>
              <Button variant="danger" loading={rechazando} onClick={handleRechazar}>
                Confirmar rechazo
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-3">
            <p className="text-sm text-carbon">
              Estás por rechazar el ajuste de <strong>{rechazoOpen.stock_materiales?.nombre}</strong>
              {' '}declarado por <strong>{rechazoOpen.declarante?.nombre ?? '—'}</strong>.
              El stock no se modifica; el declarante puede ver el motivo del rechazo.
            </p>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">Motivo del rechazo *</label>
              <textarea
                rows={3}
                value={motivoRechazo}
                onChange={e => setMotivoRechazo(e.target.value)}
                placeholder="Explicá por qué no aprobás este ajuste. El declarante lo va a ver."
                className="px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none focus:border-naranja transition-colors resize-none"
              />
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
