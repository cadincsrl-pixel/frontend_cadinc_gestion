'use client'

import { useMemo } from 'react'
import { usePersonal } from '@/modules/tarja/hooks/usePersonal'
import type { Personal } from '@/types/domain.types'

// Cumpleañero precalculado, listo para renderizar.
export interface CumpleanieroItem {
  trabajador:    Personal
  // Fecha del cumpleaños este año (Date local).
  fechaEsteAnio: Date
  // Días que faltan: 0 = hoy, 1 = mañana, ...
  diasFaltan:    number
  // Edad que cumple (o cumplió) este año, si la fecha de nacimiento incluye año.
  edad:          number | null
}

interface NotificacionesResult {
  // Cumpleañeros del día (count → badge rojo).
  hoy:       CumpleanieroItem[]
  // Cumpleañeros que vienen en los próximos 7 días (excluye hoy).
  proximos:  CumpleanieroItem[]
  // total de notificaciones "urgentes" (lo que dispara el badge rojo).
  totalUrgente: number
}

// Días hacia adelante que se muestran en "próximos cumpleaños".
const VENTANA_DIAS = 7

/**
 * Calcula on-the-fly los cumpleaños de hoy y de los próximos 7 días a
 * partir de `personal[]`. No persiste nada: los items aparecen y
 * desaparecen solos cuando cambia la fecha. Cumpleaños sin año cargado
 * (ej. fecha_nacimiento='1900-01-01' o similar) igual aparecen — no se
 * muestra la edad si no se puede calcular.
 */
export function useNotificaciones(): NotificacionesResult {
  const { data: personal = [] } = usePersonal()

  return useMemo(() => {
    const hoyDate = new Date()
    hoyDate.setHours(0, 0, 0, 0)

    const hoy: CumpleanieroItem[] = []
    const proximos: CumpleanieroItem[] = []

    for (const p of personal as Personal[]) {
      if (!p.fecha_nacimiento) continue

      const [y, m, d] = p.fecha_nacimiento.split('-').map(Number)
      if (!m || !d) continue

      // Cumpleaños proyectado al año actual.
      const cumpleEsteAnio = new Date(hoyDate.getFullYear(), m - 1, d)
      cumpleEsteAnio.setHours(0, 0, 0, 0)

      // Si ya pasó este año, considerar el del año que viene (para que
      // el cálculo "diasFaltan" siga creciendo a partir del 1/1, no
      // se vuelva negativo).
      let fechaTarget = cumpleEsteAnio
      if (cumpleEsteAnio.getTime() < hoyDate.getTime()) {
        fechaTarget = new Date(hoyDate.getFullYear() + 1, m - 1, d)
      }
      const diasFaltan = Math.round(
        (fechaTarget.getTime() - hoyDate.getTime()) / (1000 * 60 * 60 * 24),
      )

      // Edad que cumple en `fechaTarget` (solo si tenemos año real).
      let edad: number | null = null
      if (y && y >= 1900 && y <= hoyDate.getFullYear()) {
        edad = fechaTarget.getFullYear() - y
      }

      const item: CumpleanieroItem = {
        trabajador: p,
        fechaEsteAnio: fechaTarget,
        diasFaltan,
        edad,
      }

      if (diasFaltan === 0) hoy.push(item)
      else if (diasFaltan > 0 && diasFaltan <= VENTANA_DIAS) proximos.push(item)
    }

    // Ordenar por días faltan ASC y por nombre.
    hoy.sort((a, b) => a.trabajador.nom.localeCompare(b.trabajador.nom))
    proximos.sort((a, b) => a.diasFaltan - b.diasFaltan || a.trabajador.nom.localeCompare(b.trabajador.nom))

    return {
      hoy,
      proximos,
      totalUrgente: hoy.length,
    }
  }, [personal])
}

// Helper para mostrar "hoy", "mañana", "en 3 días" en la lista de próximos.
export function fmtDiasFaltan(dias: number): string {
  if (dias === 0) return 'hoy'
  if (dias === 1) return 'mañana'
  return `en ${dias} días`
}
