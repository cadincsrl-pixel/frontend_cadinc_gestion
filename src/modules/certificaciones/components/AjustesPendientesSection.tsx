'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  useAjustesPendientes,
  useAprobarAjuste,
  useRechazarAjuste,
  useAprobarAjustesLote,
  useRechazarAjustesLote,
  fetchComprobanteUrl,
} from '../hooks/useStock'
import { useToast } from '@/components/ui/Toast'
import { Modal }    from '@/components/ui/Modal'
import { Button }   from '@/components/ui/Button'
import { usePermisos } from '@/hooks/usePermisos'
import { usePerfilesMap } from '@/lib/hooks/usePerfilesMap'

const SUB_MOTIVO_LABELS: Record<string, string> = {
  faltante_fisico:    'Faltante físico',
  dano_rotura:        'Daño / rotura',
  error_carga:        'Error de carga',
  merma_normal:       'Merma normal',
  ingreso_sin_compra: 'Ingreso sin compra',
  otro:               'Otro',
}

const SUB_MOTIVO_CORTO: Record<string, string> = {
  faltante_fisico:    'Falta',
  dano_rotura:        'Rotura',
  error_carga:        'Carga',
  merma_normal:       'Merma',
  ingreso_sin_compra: 'Sin compra',
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
}

export function AjustesPendientesSection() {
  const { aprobarAjustesStock, esAdmin } = usePermisos('certificaciones')
  // El backend ya no embebe el declarante: `created_by` apunta a auth.users,
  // no a profiles, y ese embed rompía la query entera (ver el service).
  const perfiles = usePerfilesMap()
  const quienDeclaro = (a: AjusteRow) => (a.created_by && perfiles.get(a.created_by)) || 'alguien del equipo'
  const habilitado = esAdmin || aprobarAjustesStock
  const { data: ajustes = [], isLoading } = useAjustesPendientes(habilitado)
  const { mutate: aprobar,  isPending: aprobando  } = useAprobarAjuste()
  const { mutate: rechazar, isPending: rechazando } = useRechazarAjuste()
  const { mutateAsync: aprobarLote }  = useAprobarAjustesLote()
  const { mutateAsync: rechazarLote } = useRechazarAjustesLote()
  const toast = useToast()

  const [verComprob, setVerComprob]     = useState<AjusteRow | null>(null)
  const [comprobUrl, setComprobUrl]     = useState<string | null>(null)
  const [rechazoOpen, setRechazoOpen]   = useState<AjusteRow | null>(null)
  const [motivoRechazo, setMotivoRechazo] = useState('')
  const [abierta, setAbierta]           = useState<Set<number>>(new Set())
  const [sel, setSel]                   = useState<Set<number>>(new Set())
  const [buscar, setBuscar]             = useState('')
  const [lote, setLote]                 = useState<{ hechos: number; total: number } | null>(null)
  const [rechazoLoteOpen, setRechazoLoteOpen] = useState(false)
  const [motivoLote, setMotivoLote]     = useState('')

  const filas = ajustes as AjusteRow[]

  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase()
    if (!q) return filas
    return filas.filter(a =>
      (a.stock_materiales?.nombre ?? '').toLowerCase().includes(q) ||
      (a.obs ?? '').toLowerCase().includes(q))
  }, [filas, buscar])

  // Una fila que deja de estar pendiente (aprobada, rechazada, filtrada) no
  // puede quedar seleccionada: si no, "Aprobar 12" mandaría ids que ya no están.
  useEffect(() => {
    const vivos = new Set(visibles.map(a => a.id))
    setSel(prev => {
      const next = new Set([...prev].filter(id => vivos.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [visibles])

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
  if (filas.length === 0) return null

  const todasSel = visibles.length > 0 && visibles.every(a => sel.has(a.id))
  const enCurso  = lote !== null

  function toggleSel(id: number) {
    setSel(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleTodas() {
    setSel(todasSel ? new Set() : new Set(visibles.map(a => a.id)))
  }

  function toggleAbierta(id: number) {
    setAbierta(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function avisarResultado(res: { ok: number[]; fallaron: { id: number; error: string }[] }, verbo: string) {
    if (res.fallaron.length === 0) {
      toast(`✓ ${res.ok.length} ajuste${res.ok.length !== 1 ? 's' : ''} ${verbo}`, 'ok')
    } else {
      toast(`${res.ok.length} ${verbo}, ${res.fallaron.length} con error: ${res.fallaron[0]!.error}`, 'err')
    }
  }

  async function correrAprobarLote() {
    const ids = visibles.filter(a => sel.has(a.id)).map(a => a.id)
    if (ids.length === 0) return
    setLote({ hechos: 0, total: ids.length })
    try {
      const res = await aprobarLote({ ids, onProgreso: h => setLote({ hechos: h, total: ids.length }) })
      avisarResultado(res, 'aprobados')
      setSel(new Set(res.fallaron.map(f => f.id)))
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error al aprobar', 'err')
    } finally {
      setLote(null)
    }
  }

  async function correrRechazarLote() {
    const ids = visibles.filter(a => sel.has(a.id)).map(a => a.id)
    if (ids.length === 0) return
    if (motivoLote.trim().length < 3) { toast('El motivo del rechazo es obligatorio', 'err'); return }
    setRechazoLoteOpen(false)
    setLote({ hechos: 0, total: ids.length })
    try {
      const res = await rechazarLote({
        ids, motivo: motivoLote.trim(),
        onProgreso: h => setLote({ hechos: h, total: ids.length }),
      })
      avisarResultado(res, 'rechazados')
      setSel(new Set(res.fallaron.map(f => f.id)))
      setMotivoLote('')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error al rechazar', 'err')
    } finally {
      setLote(null)
    }
  }

  function handleAprobar(id: number) {
    aprobar(id, {
      onSuccess: () => toast('✓ Ajuste aprobado, stock actualizado', 'ok'),
      onError:   e => toast(e instanceof Error ? e.message : 'Error al aprobar', 'err'),
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
      onError: e => toast(e instanceof Error ? e.message : 'Error al rechazar', 'err'),
    })
  }

  return (
    <>
      <div className="bg-white rounded-card shadow-card overflow-hidden border-l-[5px] border-amarillo">
        <div className="px-4 py-3 bg-amarillo-light/60 border-b border-amarillo/30 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h2 className="font-bold text-[#7A5500] text-base">🔔 Ajustes pendientes</h2>
          <span className="text-[11px] text-[#7A5500]/80">
            {filas.length} esperando revisión. El stock no se modifica hasta que apruebes.
          </span>
          {filas.length > 8 && (
            <input
              type="search"
              value={buscar}
              onChange={e => setBuscar(e.target.value)}
              placeholder="Filtrar por material…"
              className="ml-auto px-2.5 py-1 border border-amarillo/50 rounded text-xs bg-white outline-none focus:border-naranja w-full sm:w-52"
            />
          )}
        </div>

        {/* Barra de selección */}
        <div className="px-3 py-2 border-b border-gris flex flex-wrap items-center gap-2 bg-gris/30 sticky top-0 z-10">
          <label className="flex items-center gap-2 text-xs font-bold text-gris-dark cursor-pointer select-none">
            <input
              type="checkbox"
              checked={todasSel}
              onChange={toggleTodas}
              disabled={enCurso}
              className="w-4 h-4 accent-naranja cursor-pointer"
            />
            {todasSel ? 'Ninguno' : 'Todos'}
          </label>
          <span className="text-xs text-gris-dark font-mono">
            {sel.size} de {visibles.length}
            {buscar && ` (${filas.length} en total)`}
          </span>
          <div className="ml-auto flex items-center gap-2">
            {enCurso ? (
              <span className="text-xs font-bold text-azul font-mono">
                Procesando {lote.hechos}/{lote.total}…
              </span>
            ) : (
              <>
                <Button size="sm" variant="danger" disabled={sel.size === 0}
                        onClick={() => setRechazoLoteOpen(true)}>
                  ✕ Rechazar {sel.size > 0 ? sel.size : ''}
                </Button>
                <Button size="sm" variant="primary" disabled={sel.size === 0}
                        onClick={correrAprobarLote}>
                  ✓ Aprobar {sel.size > 0 ? sel.size : ''}
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="divide-y divide-gris">
          {visibles.map(a => {
            const delta = Number(a.cantidad)
            const negativo = delta < 0
            const unidad = a.stock_materiales?.unidad ?? ''
            const stockActual = a.stock_materiales?.stock_actual ?? 0
            const stockResultante = stockActual + delta
            const abierto = abierta.has(a.id)
            const elegido = sel.has(a.id)
            return (
              <div key={a.id} className={elegido ? 'bg-azul-light/30' : undefined}>
                {/* Fila compacta: una línea */}
                <div className="flex items-center gap-2 px-3 py-1.5">
                  <input
                    type="checkbox"
                    checked={elegido}
                    onChange={() => toggleSel(a.id)}
                    disabled={enCurso}
                    aria-label={`Seleccionar ${a.stock_materiales?.nombre ?? 'ajuste'}`}
                    className="w-4 h-4 accent-naranja cursor-pointer shrink-0"
                  />
                  <button
                    type="button"
                    onClick={() => toggleAbierta(a.id)}
                    className="flex-1 min-w-0 flex items-center gap-2 text-left"
                    aria-expanded={abierto}
                  >
                    <span className="text-gris-dark text-[10px] shrink-0 w-2">{abierto ? '▾' : '▸'}</span>
                    <span className="text-sm text-carbon truncate">{a.stock_materiales?.nombre ?? '—'}</span>
                    {a.sub_motivo && (
                      <span className={`hidden sm:inline text-[9px] font-bold px-1.5 py-0.5 rounded uppercase shrink-0 ${SUB_MOTIVO_COLORS[a.sub_motivo] ?? 'bg-gris text-gris-dark'}`}>
                        {SUB_MOTIVO_CORTO[a.sub_motivo] ?? a.sub_motivo}
                      </span>
                    )}
                    {a.comprobante_storage_path && <span className="text-[11px] shrink-0" title="Tiene comprobante">📷</span>}
                  </button>
                  <span className="text-[11px] text-gris-dark font-mono tabular-nums shrink-0 hidden sm:inline">
                    {stockActual} → <span className={stockResultante < 0 ? 'text-rojo font-bold' : 'font-bold'}>{stockResultante}</span>
                  </span>
                  <span className={`font-mono font-bold text-sm tabular-nums shrink-0 w-20 text-right ${negativo ? 'text-rojo' : 'text-verde'}`}>
                    {negativo ? '' : '+'}{delta}
                  </span>
                </div>

                {/* Detalle */}
                {abierto && (
                  <div className="px-3 pb-3 pl-9 flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gris-dark">
                      <span className="sm:hidden font-mono">
                        Stock {stockActual} {unidad} → <span className={stockResultante < 0 ? 'text-rojo font-bold' : 'font-bold'}>{stockResultante}</span>
                      </span>
                      {a.sub_motivo && (
                        <span className="sm:hidden font-bold">
                          {SUB_MOTIVO_LABELS[a.sub_motivo] ?? a.sub_motivo}
                        </span>
                      )}
                      <span>👤 {quienDeclaro(a)}</span>
                      <span>🕒 {fmtFechaHora(a.created_at)}</span>
                    </div>
                    {a.obs && (
                      <div className="bg-gris/50 rounded p-2 text-xs text-carbon">{a.obs}</div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {a.comprobante_storage_path && (
                        <button
                          onClick={() => setVerComprob(a)}
                          className="text-[11px] font-bold px-3 py-1.5 rounded bg-azul-light text-azul hover:opacity-80"
                        >
                          📷 Ver comprobante
                        </button>
                      )}
                      <Button size="sm" variant="primary" loading={aprobando} disabled={enCurso}
                              onClick={() => handleAprobar(a.id)}>
                        ✓ Aprobar
                      </Button>
                      <Button size="sm" variant="danger" loading={rechazando} disabled={enCurso}
                              onClick={() => setRechazoOpen(a)}>
                        ✕ Rechazar
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          {visibles.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-gris-dark italic">
              Ningún ajuste pendiente coincide con “{buscar}”.
            </div>
          )}
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

      {/* Modal rechazar uno */}
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
              {' '}declarado por <strong>{quienDeclaro(rechazoOpen)}</strong>.
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

      {/* Modal rechazar varios */}
      {rechazoLoteOpen && (
        <Modal
          open
          onClose={() => { setRechazoLoteOpen(false); setMotivoLote('') }}
          title={`✕ Rechazar ${sel.size} ajuste${sel.size !== 1 ? 's' : ''}`}
          footer={
            <>
              <Button variant="secondary" onClick={() => { setRechazoLoteOpen(false); setMotivoLote('') }}>
                Cancelar
              </Button>
              <Button variant="danger" onClick={correrRechazarLote}>
                Confirmar rechazo
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-3">
            <p className="text-sm text-carbon">
              El mismo motivo se va a guardar en los <strong>{sel.size}</strong> ajustes seleccionados.
              El stock no se modifica y cada declarante ve el motivo.
            </p>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">Motivo del rechazo *</label>
              <textarea
                rows={3}
                value={motivoLote}
                onChange={e => setMotivoLote(e.target.value)}
                placeholder="Explicá por qué no aprobás estos ajustes. Los declarantes lo van a ver."
                className="px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none focus:border-naranja transition-colors resize-none"
              />
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
