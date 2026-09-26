'use client'

import { useEffect, useMemo, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { Combobox } from '@/components/ui/Combobox'
import { InputMonto, aRaw } from '@/components/ui/InputMonto'
import { useCatalogoObrasPagos } from '../hooks/usePagos'
import { fmtM } from '../utils/pagos.utils'

/**
 * El reparto de una factura por obra (centro de costo). Sale de
 * `ModalCargarFactura` (20260927) para usarlo también al IMPUTAR una factura
 * importada de ARCA.
 *
 * Cuadra EXACTO contra lo imputable (`total − percepciones`): el backend
 * valida al centavo, así que «Repartir en partes iguales» y «Ajustar la
 * última fila» dejan que la ÚLTIMA fila absorba el redondeo. Si no, un
 * 33,33 % × 3 rebota el POST y la persona no entiende por qué.
 */

export interface FilaReparto {
  obra_cod: string
  /** Texto libre mientras se tipea; se parsea al guardar. */
  monto: string
  obs: string
}

export const FILA_REPARTO_VACIA: FilaReparto = { obra_cod: '', monto: '', obs: '' }

/**
 * Lo tipeado → número. Usa el MISMO parser que `InputMonto`, así el punto del
 * teclado numérico y la coma dan lo mismo en todo el sistema.
 */
export const nReparto = (s: string) => {
  const v = Number(aRaw(String(s), 2))
  return Number.isFinite(v) ? v : 0
}
const r2 = (v: number) => Math.round(v * 100) / 100

export function sumaReparto(filas: FilaReparto[]): number {
  return r2(filas.reduce((s, f) => s + nReparto(f.monto), 0))
}

/** El reparto cuadra: todas con obra, suma exacta y algo para repartir. */
export function repartoCuadra(filas: FilaReparto[], imputable: number): boolean {
  return filas.every(f => f.obra_cod) && Math.abs(r2(imputable - sumaReparto(filas))) < 0.005 && imputable > 0
}

/** Repartir lo imputable en partes iguales; la última fila se queda con el resto. */
export function repartirParejo(filas: FilaReparto[], imputable: number): FilaReparto[] | null {
  const conObra = filas.filter(f => f.obra_cod)
  if (conObra.length === 0 || imputable <= 0) return null
  const parte = Math.floor((imputable / conObra.length) * 100) / 100
  return conObra.map((f, i) => ({
    ...f,
    monto: String(i === conObra.length - 1 ? r2(imputable - parte * (conObra.length - 1)) : parte),
  }))
}

/** Lo que falta va a la última fila con obra: evita el rebote por centavos. */
export function ajustarUltima(filas: FilaReparto[], imputable: number): FilaReparto[] | null {
  const idx = [...filas].reverse().findIndex(f => f.obra_cod)
  if (idx === -1) return null
  const real = filas.length - 1 - idx
  const dif = r2(imputable - sumaReparto(filas))
  return filas.map((f, i) => i === real ? { ...f, monto: String(r2(nReparto(f.monto) + dif)) } : f)
}

export function RepartoPorObra({ filas, onChange, imputable, detalleImputable, extraAcciones, titulo, disabled }: {
  filas:     FilaReparto[]
  /** `manual` = lo tocó la persona (el autocompletado de una sola obra no cuenta). */
  onChange:  (filas: FilaReparto[], manual: boolean) => void
  imputable: number
  /** Lo que va al lado de «A repartir» (p. ej. «total − percepciones»). */
  detalleImputable?: ReactNode
  /** Botones extra en la barra de acciones (p. ej. «Repartir como las facturas» de la NC). */
  extraAcciones?:    ReactNode
  titulo?:   string
  disabled?: boolean
}) {
  const obras = useCatalogoObrasPagos()

  // El catálogo trae TODAS las obras, también las archivadas: una obra
  // archivada sigue siendo centro de costo para la contabilidad y se le puede
  // imputar (20261001s). Van en su propio grupo, al final, para no mezclarse
  // con las activas.
  const obrasOpts = useMemo(
    () => (obras.data ?? []).map(o => ({
      value: o.cod,
      label: o.nom,
      sub:   o.cod + (o.archivada ? ' · archivada' : ''),
      group: o.archivada ? 'Archivadas' : o.es_interna || o.es_deposito ? 'Estructura CADINC' : 'Obras',
      search: [o.nom, o.cod, o.cc ?? ''],
    })),
    [obras.data],
  )

  // Con UNA sola obra el reparto es todo el importe: no tiene sentido hacerlo
  // tipear, y tipearlo a mano es justo donde se pierden los centavos (caso del
  // 2026-09-21). Se completa solo al elegir la obra, y sólo si está vacío.
  useEffect(() => {
    if (filas.length !== 1 || imputable <= 0) return
    const f = filas[0]!
    if (!f.obra_cod || f.monto.trim()) return
    onChange([{ ...f, monto: String(imputable) }], false)
  }, [filas, imputable, onChange])

  const dif = r2(imputable - sumaReparto(filas))
  const ok = repartoCuadra(filas, imputable)
  const cambiar = (nuevas: FilaReparto[] | null) => { if (nuevas) onChange(nuevas, true) }

  return (
    <div className="border-t border-gris pt-3">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
        <div className="text-[11px] font-bold text-gris-dark uppercase tracking-wide">{titulo ?? 'Centro de costo — a qué obra se imputa'}</div>
        <div className="text-xs">
          A repartir: <b className="font-mono tabular-nums">{fmtM(imputable)}</b>
          {detalleImputable}
        </div>
      </div>

      {obras.isError && <div className="text-[11px] text-rojo mb-1">No se pudo traer la lista de obras.</div>}

      {filas.map((f, i) => (
        <div key={i} className="flex gap-2 items-end mb-1.5">
          <div className="flex-1 min-w-0">
            <Combobox placeholder={obras.isLoading ? 'Cargando obras…' : 'Elegí la obra…'} options={obrasOpts} value={f.obra_cod}
              disabled={disabled}
              onChange={v => cambiar(filas.map((x, j) => j === i ? { ...x, obra_cod: v } : x))} />
          </div>
          {/* El ancho va en un wrapper y no en el input: `inputCls` trae
              `w-full`, que le gana a cualquier `w-28` del atributo, y dejaba
              al buscador de obra en CERO px de ancho (2026-09-21). */}
          <div className="w-28 shrink-0">
            <InputMonto value={f.monto} placeholder="Monto" disabled={disabled}
              onChange={v => cambiar(filas.map((x, j) => j === i ? { ...x, monto: v } : x))}
              className="font-mono text-right py-2 rounded" />
          </div>
          {filas.length > 1 && (
            <button type="button" className="text-rojo hover:bg-rojo-light px-2 py-1.5 rounded text-xs disabled:opacity-50"
              disabled={disabled} aria-label="Quitar la fila"
              onClick={() => cambiar(filas.filter((_, j) => j !== i))}>✕</button>
          )}
        </div>
      ))}

      <div className="flex gap-2 items-center flex-wrap mt-1">
        <Button variant="ghost" size="sm" disabled={disabled} onClick={() => cambiar([...filas, { ...FILA_REPARTO_VACIA }])}>+ Otra obra</Button>
        {extraAcciones}
        {filas.filter(f => f.obra_cod).length > 1 && (
          <Button variant="ghost" size="sm" disabled={disabled} onClick={() => cambiar(repartirParejo(filas, imputable))}>Repartir en partes iguales</Button>
        )}
        {Math.abs(dif) >= 0.005 && imputable > 0 && (
          <>
            <span className="text-xs text-rojo">
              {dif > 0 ? `Faltan ${fmtM(dif)}` : `Sobran ${fmtM(-dif)}`}
            </span>
            <Button variant="secondary" size="sm" disabled={disabled} onClick={() => cambiar(ajustarUltima(filas, imputable))}>Ajustar la última fila</Button>
          </>
        )}
        {ok && <span className="text-xs text-verde">✓ El reparto cuadra</span>}
      </div>
    </div>
  )
}
