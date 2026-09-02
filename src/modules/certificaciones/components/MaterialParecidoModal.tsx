'use client'

import { useMemo } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { normalizeText } from '@/lib/utils/text'
import type { StockMaterial, StockRubro } from '@/types/domain.types'
import type { MaterialConflicto, MaterialCandidato } from '../hooks/useStock'
import { AliasChips } from './AliasChips'
import { UNIDADES } from '../constants'

// ── Modal "¿No será este?" ────────────────────────────────────────────────
//
// Se abre con el 409 del candado anti-duplicados. Sin esto el usuario queda
// sin salida: no puede crear el material y tampoco se le ofrece el que ya
// está. Tres salidas:
//   1. Agregar su término como SINÓNIMO del existente (la más valiosa: es
//      como el catálogo se mantiene vivo, por eso va en primario).
//   2. Usar el material existente (lo deja filtrado en la lista).
//   3. Crearlo igual con `forzar: true` — solo para MATERIAL_PARECIDO; con
//      MATERIAL_DUPLICADO el nombre ya está tomado y no hay reintento.

export interface MaterialParecidoModalProps {
  conflicto:         MaterialConflicto & { nombreIntentado: string }
  materiales:        StockMaterial[]
  rubros:            StockRubro[]
  /** Hay un POST/PATCH en vuelo: no dejar disparar otro. */
  ocupado:           boolean
  puedeForzar:       boolean
  onClose:           () => void
  onUsarExistente:   (m: StockMaterial) => void
  onAgregarSinonimo: (c: MaterialCandidato) => void
  onForzar:          () => void
}

export function MaterialParecidoModal({
  conflicto, materiales, rubros, ocupado, puedeForzar,
  onClose, onUsarExistente, onAgregarSinonimo, onForzar,
}: MaterialParecidoModalProps) {
  const { code, candidatos, nombreIntentado } = conflicto
  const esDuplicado = code === 'MATERIAL_DUPLICADO'
  const termino = normalizeText(nombreIntentado)

  const matById = useMemo(() => new Map(materiales.map(m => [m.id, m])), [materiales])
  const rubroById = useMemo(() => new Map(rubros.map(r => [r.id, r])), [rubros])

  return (
    <Modal
      open
      onClose={onClose}
      width="max-w-lg"
      title={esDuplicado ? '⛔ ESE NOMBRE YA EXISTE' : '🔎 ¿NO SERÁ ESTE?'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Volver al formulario</Button>
          {puedeForzar && (
            <Button variant="ghost" disabled={ocupado} onClick={onForzar} className="text-gris-dark">
              Es otro material, crealo igual
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className={`rounded-xl px-3 py-2.5 text-sm ${esDuplicado ? 'bg-rojo-light text-rojo' : 'bg-amarillo-light text-[#7A5500]'}`}>
          {esDuplicado ? (
            <>Ya hay un material activo llamado <strong>&ldquo;{nombreIntentado}&rdquo;</strong>. Usá ese o cambiale el nombre al nuevo.</>
          ) : (
            <>Escribiste <strong>&ldquo;{nombreIntentado}&rdquo;</strong> y el catálogo ya tiene {candidatos.length === 1 ? 'uno parecido' : `${candidatos.length} parecidos`}. Fijate si es alguno de estos antes de sumar una fila más.</>
          )}
        </div>

        {candidatos.length === 0 ? (
          <p className="text-sm text-gris-dark italic">{conflicto.mensaje}</p>
        ) : candidatos.map(c => {
          const existente    = matById.get(c.id)
          const rubro        = existente ? rubroById.get(existente.rubro_id) : undefined
          const unidad       = c.unidad ?? existente?.unidad ?? ''
          const unidadLabel  = UNIDADES.find(u => u.value === unidad)?.label ?? unidad
          const yaEsSinonimo = c.por_alias || (existente?.alias ?? []).includes(termino)
          const mismoNombre  = normalizeText(c.nombre) === termino

          return (
            <div key={c.id} className="border-[1.5px] border-gris-mid rounded-xl p-3 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-bold text-sm text-carbon">{c.nombre}</div>
                  <div className="text-[11px] text-gris-dark mt-0.5">
                    {rubro ? `${rubro.icono ?? ''} ${rubro.nombre}` : 'Rubro —'}
                    {unidadLabel && <> · {unidadLabel}</>}
                    {existente && <> · stock <span className="font-mono font-bold">{existente.stock_actual}</span></>}
                  </div>
                  {existente && <AliasChips alias={existente.alias} />}
                </div>
                <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${c.por_alias ? 'bg-verde-light text-verde' : 'bg-gris text-gris-dark'}`}>
                  {c.por_alias ? 'YA LO PIDEN ASÍ' : `${Math.round(c.sim * 100)}% parecido`}
                </span>
              </div>

              {/* Salida 1 — sinónimo (destacada) */}
              {yaEsSinonimo ? (
                <div className="text-[11px] font-bold text-verde bg-verde-light px-2 py-1.5 rounded">
                  ✓ Ya tiene &ldquo;{termino}&rdquo; como sinónimo: buscándolo así, lo encontrás.
                </div>
              ) : mismoNombre ? (
                <div className="text-[11px] text-gris-dark px-2 py-1.5">
                  Es exactamente el mismo nombre, no hace falta sinónimo.
                </div>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  className="w-full min-h-[38px]"
                  disabled={ocupado || !existente}
                  onClick={() => onAgregarSinonimo(c)}
                >
                  ➕ Guardar &ldquo;{termino}&rdquo; como sinónimo de este
                </Button>
              )}

              {/* Salida 2 — usar el existente */}
              <Button
                variant="secondary"
                size="sm"
                className="w-full min-h-[38px]"
                disabled={!existente}
                onClick={() => { if (existente) onUsarExistente(existente) }}
              >
                Usar este material
              </Button>

              {!existente && (
                <p className="text-[10px] text-gris-dark">
                  No está en la lista cargada — recargá la página para operar sobre este material.
                </p>
              )}
            </div>
          )
        })}
      </div>
    </Modal>
  )
}
