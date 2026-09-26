'use client'

import { useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { toISO } from '@/lib/utils/dates'
import { useRegistrarRetorno } from '../hooks/useHerrEntregas'
import type { HerrEntrega, HerrCierre } from '@/types/domain.types'

/** Qué pasó (20261005d). Fuera de «volvió», la nota es el motivo y es obligatoria. */
export const CIERRES: { value: HerrCierre; label: string; corto: string }[] = [
  { value: 'volvio',       label: '↩ Volvió al pañol',           corto: 'volvió' },
  { value: 'perdida',      label: '❓ Se perdió',                 corto: 'perdida' },
  { value: 'rota',         label: '💥 Se rompió (no vuelve)',     corto: 'rota' },
  { value: 'baja_en_obra', label: '🏗 Baja en obra (queda allá)', corto: 'baja en obra' },
]

/**
 * "Volvió al pañol": registra una devolución por cada salida elegida. Por
 * defecto vuelve todo lo que sigue en obra de cada salida; la cantidad se
 * puede bajar para un retorno parcial (nunca más de lo que está en obra).
 */

interface Props {
  open:     boolean
  onClose:  () => void
  salidas:  HerrEntrega[]
  obraNom:  (cod: string | null) => string
  onListo?: () => void
}

function fmtFecha(s: string | null | undefined) {
  if (!s) return '—'
  const [a, m, d] = s.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

export function HerrRetornoModal({ open, onClose, salidas, obraNom, onListo }: Props) {
  const toast = useToast()
  const { mutate: registrar, isPending } = useRegistrarRetorno()
  const [fecha, setFecha] = useState(toISO(new Date()))
  const [nota, setNota]   = useState('')
  // Lo perdido o roto se cerraba marcándolo «No es herramienta» (falso) o por
  // SQL: ahora es un cierre más, con motivo.
  const [cierre, setCierre] = useState<HerrCierre>('volvio')
  const noVuelve = cierre !== 'volvio'
  // Cantidad tipeada por salida; sin override = todo lo que está en obra.
  const [cant, setCant]   = useState<Record<number, string>>({})

  // Solo confirmadas: la base rechaza devolver una salida sin revisar.
  const vivas = useMemo(() => salidas.filter(s => s.sentido === 'salida' && s.estado === 'confirmada' && Number(s.en_obra) > 0), [salidas])

  /**
   * Cuánto vuelve de esta salida. Devuelve NaN cuando la cantidad quedó SIN
   * DECIDIR, que no es lo mismo que "vuelve todo".
   *
   * La distinción entre `undefined` (nunca se tocó el campo) y `''` (se vació a
   * mano) no es teórica: el input nace con el máximo, así que para cargar un
   * retorno parcial hay que pasar sí o sí por el campo vacío. Tratar ese estado
   * como "vuelve todo" registraba la devolución COMPLETA mientras la celda se
   * veía en blanco — y registrar un retorno no se puede deshacer desde la app.
   */
  function cantidadDe(s: HerrEntrega): number {
    const raw = cant[s.id]
    if (raw === undefined) return Number(s.en_obra)
    if (raw.trim() === '') return NaN
    const v = Number(raw.replace(',', '.'))
    return Number.isFinite(v) ? v : NaN
  }
  /** 'unid' no se parte por la mitad; 'm' sí (hay salidas legítimas en metros). */
  const fraccionable = (s: HerrEntrega) => (s.unidad ?? 'unid') !== 'unid'
  function malaCantidad(s: HerrEntrega): boolean {
    const v = cantidadDe(s)
    if (!Number.isFinite(v)) return true
    if (v <= 0 || v > Number(s.en_obra)) return true
    return !fraccionable(s) && !Number.isInteger(v)
  }
  const invalidas = vivas.filter(malaCantidad)
  // Unidades, no renglones: el toast de éxito cuenta salidas y eso escondía el
  // desvío. Que el total esté a la vista ANTES de confirmar es la red que faltaba.
  const totalUnidades = vivas.reduce((n, s) => n + (malaCantidad(s) ? 0 : cantidadDe(s)), 0)

  function cerrar() { setCant({}); setNota(''); setCierre('volvio'); setFecha(toISO(new Date())); onClose() }

  function guardar() {
    if (!fecha) { toast('Elegí la fecha del retorno', 'err'); return }
    if (vivas.length === 0) { toast('Ninguna de las elegidas sigue en obra', 'err'); return }
    if (noVuelve && !nota.trim()) { toast('Escribí el motivo: qué pasó con la herramienta', 'err'); return }
    if (invalidas.length > 0) {
      const vacias = invalidas.filter(s => (cant[s.id] ?? '').trim() === '' && cant[s.id] !== undefined).length
      toast(vacias > 0
        ? `Completá cuánto vuelve en ${vacias} fila${vacias !== 1 ? 's' : ''}: dejarlo vacío no significa "vuelve todo"`
        : 'Hay cantidades inválidas: revisá que no superen lo que está en obra y que sean enteras', 'err')
      return
    }
    registrar({
      items: vivas.map(s => ({ salida_id: s.id, ...(cantidadDe(s) !== Number(s.en_obra) ? { cantidad: cantidadDe(s) } : {}) })),
      fecha, nota: nota.trim() || null, cierre,
    }, {
      onSuccess: (r) => {
        const n = r.devoluciones.length
        toast(noVuelve
          ? `✓ ${n} salida${n !== 1 ? 's' : ''} cerrada${n !== 1 ? 's' : ''} como ${CIERRES.find(c => c.value === cierre)?.corto}`
          : `✓ ${n} retorno${n !== 1 ? 's' : ''} registrado${n !== 1 ? 's' : ''}`, 'ok')
        cerrar(); onListo?.()
      },
      onError: (err: unknown) => {
        const code = (err as { body?: { error?: string } })?.body?.error
        toast(code === 'CANTIDAD_INVALIDA' ? 'Alguna cantidad supera lo que está en obra. Recargá y probá de nuevo.'
            : code === 'SALIDA_NO_DEVOLVIBLE' ? 'Alguna salida no está confirmada (o fue archivada o anulada): confirmala primero en Salidas a obra.'
            : code === 'MOTIVO_REQUERIDO' ? 'Escribí el motivo: qué pasó con la herramienta.'
            : (err as Error).message || 'No se pudo registrar el retorno', 'err')
      },
    })
  }

  return (
    <Modal open={open} onClose={cerrar} title={noVuelve ? '✕ CERRAR SIN RETORNO' : '↩ RETORNO AL PAÑOL'} width="max-w-2xl"
      footer={
        <>
          <Button variant="secondary" onClick={cerrar}>Cancelar</Button>
          <Button variant="primary" loading={isPending} disabled={vivas.length === 0 || invalidas.length > 0} onClick={guardar}>
            {noVuelve ? `✓ Cerrar como ${CIERRES.find(c => c.value === cierre)?.corto} (${vivas.length})` : `✓ Registrar retorno (${vivas.length})`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Qué pasó con la herramienta">
          {CIERRES.map(c => (
            <button key={c.value} type="button" role="radio" aria-checked={cierre === c.value} onClick={() => setCierre(c.value)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold border-[1.5px] transition-colors ${cierre === c.value
                ? (c.value === 'volvio' ? 'bg-verde-light text-verde border-verde' : 'bg-rojo-light text-rojo border-rojo')
                : 'bg-white text-gris-dark border-gris-mid hover:border-gris-dark'}`}>
              {c.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-gris-dark">
          {noVuelve
            ? 'Sale de «en obra» sin volver al pañol. Queda registrado con el motivo; si se carga mal, se anula desde Salidas a obra.'
            : 'Se registra una devolución por cada salida. Por defecto vuelve todo lo que sigue en obra; bajá la cantidad si volvió una parte.'}
        </p>
        {vivas.length > 0 && (
          <div className={`text-xs rounded px-2 py-1.5 ${invalidas.length > 0 ? 'bg-rojo-light text-rojo' : 'bg-verde-light text-verde'}`}>
            {invalidas.length > 0
              ? <>Hay <b>{invalidas.length}</b> fila{invalidas.length !== 1 ? 's' : ''} sin una cantidad válida.</>
              : <>{noVuelve ? 'Se cierran' : 'Vuelven'} <b className="font-mono">{totalUnidades}</b> unidad{totalUnidades !== 1 ? 'es' : ''} de <b>{vivas.length}</b> salida{vivas.length !== 1 ? 's' : ''}.</>}
          </div>
        )}
        {salidas.length > vivas.length && (
          <div className="text-[11px] text-naranja-dark bg-naranja-light rounded px-2 py-1">
            {salidas.length - vivas.length} de las elegidas no se pueden devolver (sin confirmar, ya devueltas, archivadas o devoluciones) y se saltean.
          </div>
        )}
        <div className="border border-gris rounded-lg overflow-hidden max-h-[45vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gris sticky top-0">
              <tr>
                <th className="text-left px-3 py-2 text-[11px] font-bold text-gris-dark uppercase tracking-wider">Herramienta</th>
                <th className="text-left px-3 py-2 text-[11px] font-bold text-gris-dark uppercase tracking-wider">Obra · salida</th>
                <th className="text-right px-3 py-2 text-[11px] font-bold text-gris-dark uppercase tracking-wider">En obra</th>
                <th className="text-right px-3 py-2 text-[11px] font-bold text-gris-dark uppercase tracking-wider">{noVuelve ? 'Cierra' : 'Vuelve'}</th>
              </tr>
            </thead>
            <tbody>
              {vivas.map(s => {
                const mal = malaCantidad(s)
                return (
                  <tr key={s.id} className="border-t border-gris">
                    <td className="px-3 py-2">{s.descripcion}</td>
                    <td className="px-3 py-2 text-xs text-gris-dark">{obraNom(s.obra_cod)} · {fmtFecha(s.fecha)}{s.remito_numero ? ` · ${s.remito_numero}` : ''}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{Number(s.en_obra)}</td>
                    <td className="px-3 py-2 text-right">
                      {Number(s.en_obra) > 1 ? (
                        <input
                          type="number" min={fraccionable(s) ? 0 : 1} max={Number(s.en_obra)} step={fraccionable(s) ? 'any' : 1}
                          value={cant[s.id] ?? String(Number(s.en_obra))}
                          onChange={e => setCant(p => ({ ...p, [s.id]: e.target.value }))}
                          className={`w-20 text-right font-mono text-sm px-2 py-1 border-[1.5px] rounded-lg outline-none ${mal ? 'border-rojo' : 'border-gris-mid focus:border-naranja'}`}
                        />
                      ) : <span className="font-mono text-xs">1</span>}
                    </td>
                  </tr>
                )
              })}
              {vivas.length === 0 && (
                <tr><td colSpan={4} className="px-3 py-6 text-center text-xs text-gris-dark italic">Nada para devolver.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label={noVuelve ? 'Fecha' : 'Fecha del retorno'} type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
          <Input label={noVuelve ? 'Motivo (obligatorio)' : 'Nota (opcional)'}
            placeholder={noVuelve ? 'Qué pasó: dónde se perdió, cómo se rompió, a quién quedó' : 'Quién la trajo, estado, etc.'}
            value={nota} onChange={e => setNota(e.target.value)} />
        </div>
      </div>
    </Modal>
  )
}
