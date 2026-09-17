'use client'

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

/**
 * Cuando alguien resuelve un pedido, las pantallas ya abiertas se enteran.
 *
 * El caso: Nicolás compra un renglón y pasa a enviado; la pantalla de Alina,
 * abierta desde hace media hora, sigue mostrando el estado viejo. React Query
 * invalida al que hizo la acción (`invalidarTodoLoQueTocaUnItem`), pero eso no
 * sale de esa pestaña.
 *
 * CÓMO. El backend, al terminar cualquier request mutativo de
 * `/api/solicitudes` o `/api/remitos-envio`, manda un aviso por un canal de
 * Supabase (`realtimeMiddleware`, repo cadincsrl). Acá se escucha ese aviso y
 * se invalidan las mismas claves que invalidaría una mutación propia. El
 * navegador vuelve a pedir los datos POR LA API, con su token y su alcance por
 * obra: el aviso no trae datos, solo dice que hubo actividad.
 *
 * POR QUÉ NO SE POLLEA. Ya se probó y ya rompió: pollear `/api/solicitudes`
 * (~400 KB) cada 60 s agotó los 5 GB de bandwidth del plan Hobby de Render en
 * agosto de 2026 (ver `useNotificaciones.ts`). El aviso son bytes y va por
 * Supabase, así que el tráfico pesado pasa a ser proporcional a los cambios
 * reales y no al reloj.
 *
 * POR QUÉ NO ES `postgres_changes`. Desde `20260914d` el rol `authenticated`
 * no tiene SELECT sobre `solicitud_compra` ni sus renglones, y Realtime aplica
 * los permisos del que escucha: el navegador se suscribiría y no recibiría
 * nada. De ahí el broadcast.
 *
 * DOS DETALLES QUE HACEN LA DIFERENCIA:
 *
 *  · `invalidateQueries` marca las queries como viejas, pero React Query solo
 *    vuelve a pedir las que están MONTADAS. O sea que una pestaña en otro tab
 *    del navegador no descarga nada hasta que la mires. Eso es deliberado y es
 *    la mitad del ahorro.
 *  · El rebote de 400 ms junta la ráfaga. El backend ya limita a un aviso por
 *    segundo, pero si se abren dos ventanas del mismo navegador o llegan dos
 *    avisos pegados, no queremos dos refrescos de 400 KB.
 */

const CLAVES_A_INVALIDAR = [
  ['solicitudes'],
  ['remitos-envio'],
  ['stock', 'materiales'],
  ['stock', 'movimientos'],
  ['cuenta-corriente'],
  ['cuenta-cliente-pendientes'],
  ['herr-entregas'],
] as const

const TOPICO = 'cadinc-solicitudes'
const MS_REBOTE = 400

export function useInvalidacionEnVivo(activo = true) {
  const qc = useQueryClient()

  useEffect(() => {
    if (!activo) return

    const supabase = createClient()
    let rebote: ReturnType<typeof setTimeout> | null = null

    const canal = supabase
      .channel(TOPICO)
      .on('broadcast', { event: 'cambio' }, () => {
        if (rebote) clearTimeout(rebote)
        rebote = setTimeout(() => {
          for (const queryKey of CLAVES_A_INVALIDAR) {
            qc.invalidateQueries({ queryKey: [...queryKey] })
          }
        }, MS_REBOTE)
      })
      .subscribe()

    return () => {
      if (rebote) clearTimeout(rebote)
      supabase.removeChannel(canal)
    }
  }, [activo, qc])
}
