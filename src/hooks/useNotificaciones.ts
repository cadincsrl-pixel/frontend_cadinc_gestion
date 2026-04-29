'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api/client'
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

// Documento de vehículo (camion/batea) con vence_el cargado.
export interface DocVencimientoItem {
  doc_id:           number
  entidad:          'camion' | 'batea'
  entidad_id:       number
  entidad_patente:  string
  tipo:             string
  vence_el:         string  // ISO yyyy-mm-dd
  // Días de vencimiento: <0 = ya venció hace tanto, 0 = vence hoy, >0 = vence en N días.
  diasParaVencer:   number
}

interface NotificacionesResult {
  // Cumpleañeros del día (count → badge rojo).
  hoy:                 CumpleanieroItem[]
  // Cumpleañeros que vienen en los próximos 7 días (excluye hoy).
  proximos:            CumpleanieroItem[]
  // Documentos de vehículos ya vencidos (vence_el < hoy).
  papelesVencidos:     DocVencimientoItem[]
  // Documentos por vencer en los próximos 30 días (incluye hoy).
  papelesPorVencer:    DocVencimientoItem[]
  // total de notificaciones "urgentes" (badge rojo): cumpleaños HOY + vencidos.
  totalUrgente:        number
}

// Días hacia adelante que se muestran en "próximos cumpleaños".
const VENTANA_DIAS_CUMPLE = 7
// Días hacia adelante para "papeles por vencer".
const VENTANA_DIAS_PAPELES = 30

// Etiquetas humanas para los tipos de documento (matchea VehiculoDocumentosSection).
const DOC_TIPO_LABEL: Record<string, string> = {
  titulo:         'Título',
  tarjeta_verde:  'Tarjeta verde',
  rto:            'RTO',
  poliza_seguro:  'Póliza de seguro',
}
export function fmtDocTipo(tipo: string): string {
  return DOC_TIPO_LABEL[tipo] ?? tipo
}

interface DocVencimientoRow {
  doc_id: number
  entidad: 'camion' | 'batea'
  entidad_id: number
  entidad_patente: string
  tipo: string
  vence_el: string
}

/**
 * Calcula on-the-fly notificaciones a partir de:
 *  - cumpleaños del personal (próximos 7 días).
 *  - vencimientos de documentos de vehículos (vencidos + próximos 30 días).
 *
 * No persiste nada: aparecen y desaparecen solos al cambiar la fecha o
 * actualizarse los datos. El badge rojo cuenta SOLO lo "urgente"
 * (cumpleaños HOY + papeles ya vencidos).
 */
export function useNotificaciones(): NotificacionesResult {
  const { data: personal = [] } = usePersonal()
  const { data: docsVenc = [] } = useQuery({
    queryKey: ['logistica', 'notificaciones', 'documentos'],
    queryFn:  () => apiGet<DocVencimientoRow[]>('/api/logistica/notificaciones/documentos'),
    // Permitir que falle silenciosamente si el user no tiene permiso de
    // logística; useQuery devuelve [] como fallback con la config de abajo.
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 min — los vencimientos no cambian seguido.
  })

  return useMemo(() => {
    const hoyDate = new Date()
    hoyDate.setHours(0, 0, 0, 0)

    // ── Cumpleaños ──────────────────────────────────────────────
    const hoy: CumpleanieroItem[] = []
    const proximos: CumpleanieroItem[] = []

    for (const p of personal as Personal[]) {
      if (!p.fecha_nacimiento) continue
      const [y, m, d] = p.fecha_nacimiento.split('-').map(Number)
      if (!m || !d) continue

      const cumpleEsteAnio = new Date(hoyDate.getFullYear(), m - 1, d)
      cumpleEsteAnio.setHours(0, 0, 0, 0)

      let fechaTarget = cumpleEsteAnio
      if (cumpleEsteAnio.getTime() < hoyDate.getTime()) {
        fechaTarget = new Date(hoyDate.getFullYear() + 1, m - 1, d)
      }
      const diasFaltan = Math.round(
        (fechaTarget.getTime() - hoyDate.getTime()) / (1000 * 60 * 60 * 24),
      )

      let edad: number | null = null
      if (y && y >= 1900 && y <= hoyDate.getFullYear()) {
        edad = fechaTarget.getFullYear() - y
      }

      const item: CumpleanieroItem = { trabajador: p, fechaEsteAnio: fechaTarget, diasFaltan, edad }
      if (diasFaltan === 0) hoy.push(item)
      else if (diasFaltan > 0 && diasFaltan <= VENTANA_DIAS_CUMPLE) proximos.push(item)
    }
    hoy.sort((a, b) => a.trabajador.nom.localeCompare(b.trabajador.nom))
    proximos.sort((a, b) => a.diasFaltan - b.diasFaltan || a.trabajador.nom.localeCompare(b.trabajador.nom))

    // ── Vencimientos de documentos ──────────────────────────────
    const papelesVencidos:  DocVencimientoItem[] = []
    const papelesPorVencer: DocVencimientoItem[] = []

    for (const row of docsVenc as DocVencimientoRow[]) {
      if (!row.vence_el) continue
      const [vy, vm, vd] = row.vence_el.split('-').map(Number)
      if (!vy || !vm || !vd) continue
      const fechaVenc = new Date(vy, vm - 1, vd)
      fechaVenc.setHours(0, 0, 0, 0)
      const dias = Math.round(
        (fechaVenc.getTime() - hoyDate.getTime()) / (1000 * 60 * 60 * 24),
      )

      const item: DocVencimientoItem = { ...row, diasParaVencer: dias }
      if (dias < 0) papelesVencidos.push(item)
      else if (dias <= VENTANA_DIAS_PAPELES) papelesPorVencer.push(item)
    }
    // Vencidos ordenados por más recientemente vencido primero (menos negativo arriba).
    papelesVencidos.sort((a, b) => b.diasParaVencer - a.diasParaVencer)
    // Por vencer ordenados ASC (lo más urgente arriba).
    papelesPorVencer.sort((a, b) => a.diasParaVencer - b.diasParaVencer)

    return {
      hoy,
      proximos,
      papelesVencidos,
      papelesPorVencer,
      totalUrgente: hoy.length + papelesVencidos.length,
    }
  }, [personal, docsVenc])
}

// Helper para mostrar "hoy", "mañana", "en 3 días" en la lista de próximos.
export function fmtDiasFaltan(dias: number): string {
  if (dias === 0) return 'hoy'
  if (dias === 1) return 'mañana'
  return `en ${dias} días`
}

// Helper para vencimientos pasados/futuros: "vencido hace 3 días" / "vence en 5 días" / "vence hoy".
export function fmtDiasVencimiento(dias: number): string {
  if (dias === 0) return 'vence hoy'
  if (dias === 1) return 'vence mañana'
  if (dias < 0)   return `vencido hace ${Math.abs(dias)} día${dias === -1 ? '' : 's'}`
  return `vence en ${dias} días`
}
