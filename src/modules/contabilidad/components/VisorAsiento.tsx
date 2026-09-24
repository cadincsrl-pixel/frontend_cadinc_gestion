'use client'

import { useState, type ReactNode } from 'react'
import type { CtbAsiento } from '@/types/contabilidad.types'
import { FichaAsiento } from './FichaAsiento'
import { ModalAsiento } from './ModalAsiento'

/**
 * La ficha y el editor de asientos, para las pantallas que los abren
 * (Asientos, Libro diario, Mayor). Devuelve las funciones para abrirlos y el
 * JSX de los modales, que la pantalla pone al final.
 */
export function useVisorAsiento(): {
  abrir:   (id: number) => void
  nuevo:   () => void
  modales: ReactNode
} {
  const [fichaId, setFichaId] = useState<number | null>(null)
  // undefined = cerrado; null = asiento nuevo.
  const [editando, setEditando] = useState<CtbAsiento | null | undefined>(undefined)

  const modales = (
    <>
      {fichaId !== null && editando === undefined && (
        <FichaAsiento
          key={fichaId}
          id={fichaId}
          onClose={() => setFichaId(null)}
          onEditar={a => setEditando(a)}
          onAbrir={id => setFichaId(id)}
        />
      )}
      {editando !== undefined && (
        <ModalAsiento
          key={editando?.id ?? 'nuevo'}
          asiento={editando}
          onClose={() => setEditando(undefined)}
          onGuardado={a => { setEditando(undefined); setFichaId(a.id) }}
        />
      )}
    </>
  )

  return {
    abrir: id => { setEditando(undefined); setFichaId(id) },
    nuevo: () => { setFichaId(null); setEditando(null) },
    modales,
  }
}
