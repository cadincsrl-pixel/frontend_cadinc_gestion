'use client'

import { useItemEventos } from '../hooks/useSolicitudes'
import { usePerfilesMap } from '@/lib/hooks/usePerfilesMap'
import { Modal } from '@/components/ui/Modal'
import type { SolicitudCompraItem } from '@/types/domain.types'

function fmtFecha(s: string) {
  const d = new Date(s)
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

// accion -> etiqueta + icono + color del dot. `accion` es texto libre en DB;
// lo desconocido cae al fallback (no rompe).
const ACCION_CFG: Record<string, { label: string; icono: string; dot: string }> = {
  creado:          { label: 'Solicitado',             icono: '📋', dot: 'bg-amarillo-light text-[#7A5500]' },
  comprado:        { label: 'Comprado',               icono: '🛒', dot: 'bg-azul-light text-azul'          },
  en_proveedor:    { label: 'Compra en proveedor',    icono: '🏭', dot: 'bg-azul-light text-azul-mid'      },
  despachado:      { label: 'Despachado de depósito', icono: '📦', dot: 'bg-naranja-light text-naranja-dark' },
  retirado:        { label: 'Retirado del proveedor', icono: '🚚', dot: 'bg-verde-light text-verde'        },
  retiro_parcial:  { label: 'Retiro parcial',         icono: '🚚', dot: 'bg-naranja-light text-naranja-dark' },
  enviado:         { label: 'Enviado a obra',         icono: '📤', dot: 'bg-verde-light text-verde'        },
  rechazado:       { label: 'Rechazado',              icono: '✕',  dot: 'bg-rojo-light text-rojo'          },
  revertido:       { label: 'Revertido',              icono: '↩',  dot: 'bg-amarillo-light text-[#7A5500]' },
  envio_revertido: { label: 'Envío deshecho',         icono: '↩',  dot: 'bg-gris text-gris-dark'           },
}
const ACCION_FALLBACK = { label: '', icono: '•', dot: 'bg-gris text-gris-dark' }

// Etiquetas legibles de estado (sincronizadas con ITEM_ESTADO_CFG de SolicitudesTab).
const ESTADO_LABEL: Record<string, string> = {
  pendiente:    'Pendiente',
  comprado:     'Comprado',
  de_deposito:  'De depósito',
  en_proveedor: 'En proveedor',
  retirado:     'Retirado',
  enviado:      'Enviado',
  rechazado:    'Rechazado',
}
const estadoLabel = (e: string | null) => (e ? (ESTADO_LABEL[e] ?? e) : null)

function fmtNum(n: number | null | undefined) {
  if (n == null) return null
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(n)
}

export function ItemHistorialModal({
  item,
  onClose,
}: {
  item: SolicitudCompraItem | null
  onClose: () => void
}) {
  const perfiles = usePerfilesMap()
  // Solo fetch cuando el modal está abierto (item != null).
  const { data: eventos = [], isLoading, isError } = useItemEventos(item?.id, !!item)

  return (
    <Modal
      open={!!item}
      onClose={onClose}
      title="🕑 HISTORIAL DEL ÍTEM"
      width="max-w-xl"
    >
      {item && (
        <div className="flex flex-col gap-4">
          {/* Cabecera del ítem */}
          <div className="bg-gris/40 rounded-lg p-3">
            <div className="text-sm font-bold text-carbon">{item.descripcion}</div>
            <div className="text-xs text-gris-dark mt-0.5">
              {fmtNum(item.cantidad)} {item.unidad}
            </div>
          </div>

          {isLoading && (
            <div className="flex items-center justify-center gap-3 text-gris-dark py-8">
              <span className="w-5 h-5 border-2 border-naranja border-t-transparent rounded-full animate-spin" />
              Cargando historial...
            </div>
          )}

          {isError && (
            <div className="text-center text-rojo text-sm py-6">
              No se pudo cargar el historial.
            </div>
          )}

          {!isLoading && !isError && eventos.length === 0 && (
            <div className="text-center text-gris-dark text-sm py-8">
              <div className="text-3xl mb-2">📋</div>
              <p>Sin eventos registrados todavía.</p>
              <p className="text-xs mt-1">Los movimientos viejos pueden no tener historial.</p>
            </div>
          )}

          {/* Timeline: cronológico (más viejo arriba, más reciente abajo = actual) */}
          {!isLoading && !isError && eventos.length > 0 && (
            <div className="relative">
              <div className="absolute left-4 top-4 bottom-4 w-0.5 bg-gris-mid" />
              <div className="flex flex-col gap-0">
                {eventos.map((e, idx) => {
                  const cfg      = ACCION_CFG[e.accion] ?? { ...ACCION_FALLBACK, label: e.accion }
                  const esActual = idx === eventos.length - 1
                  const quien    = e.user_id ? (perfiles.get(e.user_id) ?? 'Usuario') : 'Sistema'
                  const estAnt   = estadoLabel(e.estado_anterior)
                  const estNue   = estadoLabel(e.estado_nuevo)
                  const precio   = e.meta && typeof e.meta.precio_unit === 'number' ? e.meta.precio_unit : null

                  return (
                    <div key={e.id} className="flex items-start gap-4 pb-6 last:pb-0 relative">
                      {/* Dot */}
                      <div className={`
                        w-8 h-8 rounded-full flex items-center justify-center
                        font-bold text-sm flex-shrink-0 z-10 border-2 border-white
                        ${cfg.dot}
                        ${esActual ? 'ring-2 ring-naranja ring-offset-1' : ''}
                      `}>
                        {cfg.icono}
                      </div>

                      {/* Card */}
                      <div className={`flex-1 bg-gris rounded-xl p-3 ${esActual ? 'border border-naranja/30' : ''}`}>
                        <div className="flex items-start justify-between flex-wrap gap-2">
                          <div className="min-w-0">
                            <div className="font-bold text-sm text-carbon">
                              {cfg.label}
                              {esActual && (
                                <span className="ml-2 text-[10px] font-bold bg-naranja text-white px-1.5 py-0.5 rounded-full">
                                  Actual
                                </span>
                              )}
                            </div>

                            {/* Transición de estado */}
                            {estNue && (
                              <div className="flex items-center gap-1 mt-1 text-xs text-gris-dark">
                                {estAnt && (
                                  <>
                                    <span className="font-mono">{estAnt}</span>
                                    <span className="text-naranja">→</span>
                                  </>
                                )}
                                <span className="font-mono font-bold text-carbon">{estNue}</span>
                              </div>
                            )}

                            {/* Detalle: cantidad / precio / comentario */}
                            <div className="mt-1 text-xs text-gris-dark space-y-0.5">
                              {e.cantidad != null && <div>Cantidad: <strong>{fmtNum(e.cantidad)}</strong></div>}
                              {precio != null && <div>Precio unit.: <strong>{fmtNum(precio)}</strong></div>}
                              {e.comentario && <div className="italic">&ldquo;{e.comentario}&rdquo;</div>}
                            </div>

                            <div className="text-[11px] text-gris-dark mt-1">por {quien}</div>
                          </div>

                          <div className="text-[10px] font-mono text-gris-dark text-right flex-shrink-0">
                            {fmtFecha(e.created_at)}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
