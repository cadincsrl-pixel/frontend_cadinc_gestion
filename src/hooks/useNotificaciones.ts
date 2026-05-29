'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api/client'
import { usePersonal } from '@/modules/tarja/hooks/usePersonal'
import { useSessionStore } from '@/store/session.store'
import { usePermisos } from '@/hooks/usePermisos'
import type { Personal, SolicitudCompra } from '@/types/domain.types'

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

// Documento de chofer (DNI, licencia, libreta sanitaria, etc.) con vence_el cargado.
export interface DocChoferVencimientoItem {
  doc_id:          number
  chofer_id:       number
  chofer_nombre:   string
  tipo:            string
  vence_el:        string
  diasParaVencer:  number
}

// Service de camión próximo o vencido (lo devuelve directo el backend desde
// la vista v_camion_service_estado, ya filtrado por estado IN ('proximo','vencido')).
export interface ServiceCamionItem {
  camion_id:          number
  patente:            string
  km_actuales:        number
  km_proximo_service: number
  km_restantes:       number   // negativo si vencido
  estado:             'proximo' | 'vencido'
}

// Solicitud de compra con ítems pendientes de comprar (para el encargado de
// compras/depósito). Aparece en la campana y dispara el aviso de "nuevo pedido".
export interface SolicitudPorComprarItem {
  id:          number
  obra_cod:    string
  fecha:       string
  nPendientes: number
}

// Gasto de logística pendiente de aprobación.
export interface GastoPendienteItem {
  id:              number
  fecha:           string
  monto:           number
  descripcion:     string | null
  proveedor:       string | null
  categoria_nombre: string | null
  chofer_nombre:   string | null
  patente:         string | null
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
  // Documentos de choferes ya vencidos.
  papelesChoferVencidos:  DocChoferVencimientoItem[]
  // Documentos de choferes por vencer en los próximos 30 días.
  papelesChoferPorVencer: DocChoferVencimientoItem[]
  // Services de camiones ya vencidos (km_actuales >= km_proximo_service).
  serviciosVencidos:      ServiceCamionItem[]
  // Services de camiones próximos (≤ umbral configurado en la vista SQL).
  serviciosProximos:      ServiceCamionItem[]
  // Gastos de logística esperando aprobación (cualquier antigüedad).
  gastosPendientes:    GastoPendienteItem[]
  // Solicitudes de compra con ítems por comprar (para compras/depósito).
  solicitudesPorComprar: SolicitudPorComprarItem[]
  // total de notificaciones "urgentes" (badge rojo).
  totalUrgente:        number
}

// Días hacia adelante que se muestran en "próximos cumpleaños".
const VENTANA_DIAS_CUMPLE = 7
// Días hacia adelante para "papeles por vencer".
const VENTANA_DIAS_PAPELES = 30

// Etiquetas humanas para los tipos de documento (matchea VehiculoDocumentosSection
// + ChoferDocumentosSection).
const DOC_TIPO_LABEL: Record<string, string> = {
  // Vehículo
  titulo:             'Título',
  tarjeta_verde:      'Tarjeta verde',
  rto:                'RTO',
  poliza_seguro:      'Póliza de seguro',
  // Chofer
  dni:                'DNI',
  licencia_conducir:  'Licencia',
  licencia:           'Licencia',
  libreta_sanitaria:  'Libreta sanitaria',
  cnrt:               'CNRT',
  aptitud_psico:      'Aptitud psicofísica',
  aptitud_psicofisica:'Aptitud psicofísica',
  art:                'ART',
  mopp:               'MOPP',
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

interface DocChoferVencimientoRow {
  doc_id: number
  chofer_id: number
  chofer_nombre: string
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
  // Gating por módulo: evita 403s silenciosos cada vez que se monta la
  // campana para users que no tienen acceso al módulo correspondiente.
  const hasModulo = useSessionStore(s => s.hasModulo)
  const tieneTarja     = hasModulo('tarja')
  const tieneLogistica = hasModulo('logistica')
  // Solicitudes "por comprar": solo para quien resuelve ítems (compras/depósito).
  const tieneCertificaciones = hasModulo('certificaciones')
  const { resolverItems } = usePermisos('certificaciones')

  const { data: personal = [] } = usePersonal()
  const { data: docsVenc = [] } = useQuery({
    queryKey: ['logistica', 'notificaciones', 'documentos'],
    queryFn:  () => apiGet<DocVencimientoRow[]>('/api/logistica/notificaciones/documentos'),
    enabled:  tieneLogistica,
    retry: false,
    staleTime: 5 * 60 * 1000,
  })
  const { data: docsChofer = [] } = useQuery({
    queryKey: ['logistica', 'notificaciones', 'documentos-choferes'],
    queryFn:  () => apiGet<DocChoferVencimientoRow[]>('/api/logistica/notificaciones/documentos-choferes'),
    enabled:  tieneLogistica,
    retry: false,
    staleTime: 5 * 60 * 1000,
  })
  const { data: servicesNotif = [] } = useQuery({
    queryKey: ['logistica', 'notificaciones', 'camion-services'],
    queryFn:  () => apiGet<ServiceCamionItem[]>('/api/logistica/notificaciones/camion-services'),
    enabled:  tieneLogistica,
    retry: false,
    staleTime: 5 * 60 * 1000,
  })
  const { data: gastosPend } = useQuery({
    queryKey: ['logistica', 'notificaciones', 'gastos-pendientes'],
    queryFn:  () => apiGet<{
      items: Array<{
        id: number; fecha: string; monto: number; descripcion: string | null;
        proveedor: string | null; categoria?: { nombre: string } | null;
        chofer?: { nombre: string } | null; camion?: { patente: string } | null;
      }>
      total: number
    }>('/api/logistica/gastos?estado=pendiente&limit=50'),
    enabled:  tieneLogistica,
    retry: false,
    staleTime: 60 * 1000,
  })
  // Solicitudes de compra (comparte caché con el tab de certificaciones).
  // refetchInterval: poll para que el aviso de "nuevo pedido" llegue solo,
  // mientras el encargado tiene la app abierta.
  const { data: solicitudes = [] } = useQuery({
    queryKey: ['solicitudes', 'all'],
    queryFn:  () => apiGet<SolicitudCompra[]>('/api/solicitudes'),
    enabled:  tieneCertificaciones && resolverItems,
    retry: false,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  })

  return useMemo(() => {
    const hoyDate = new Date()
    hoyDate.setHours(0, 0, 0, 0)

    // ── Cumpleaños — solo si tiene módulo tarja ──
    const hoy: CumpleanieroItem[] = []
    const proximos: CumpleanieroItem[] = []

    for (const p of (tieneTarja ? (personal as Personal[]) : [])) {
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

    // Helper para clasificar un doc en vencido / por-vencer / fuera-de-ventana.
    function clasificar(venceISO: string): { dias: number; bucket: 'vencido' | 'porVencer' | null } {
      const [vy, vm, vd] = venceISO.split('-').map(Number)
      if (!vy || !vm || !vd) return { dias: 0, bucket: null }
      const fechaVenc = new Date(vy, vm - 1, vd)
      fechaVenc.setHours(0, 0, 0, 0)
      const dias = Math.round(
        (fechaVenc.getTime() - hoyDate.getTime()) / (1000 * 60 * 60 * 24),
      )
      if (dias < 0) return { dias, bucket: 'vencido' }
      if (dias <= VENTANA_DIAS_PAPELES) return { dias, bucket: 'porVencer' }
      return { dias, bucket: null }
    }

    // ── Vencimientos de documentos de vehículos ────────────────
    const papelesVencidos:  DocVencimientoItem[] = []
    const papelesPorVencer: DocVencimientoItem[] = []
    for (const row of docsVenc as DocVencimientoRow[]) {
      if (!row.vence_el) continue
      const { dias, bucket } = clasificar(row.vence_el)
      if (!bucket) continue
      const item: DocVencimientoItem = { ...row, diasParaVencer: dias }
      if (bucket === 'vencido') papelesVencidos.push(item)
      else papelesPorVencer.push(item)
    }
    papelesVencidos.sort((a, b) => b.diasParaVencer - a.diasParaVencer)
    papelesPorVencer.sort((a, b) => a.diasParaVencer - b.diasParaVencer)

    // ── Vencimientos de documentos de choferes ─────────────────
    const papelesChoferVencidos:  DocChoferVencimientoItem[] = []
    const papelesChoferPorVencer: DocChoferVencimientoItem[] = []
    for (const row of docsChofer as DocChoferVencimientoRow[]) {
      if (!row.vence_el) continue
      const { dias, bucket } = clasificar(row.vence_el)
      if (!bucket) continue
      const item: DocChoferVencimientoItem = { ...row, diasParaVencer: dias }
      if (bucket === 'vencido') papelesChoferVencidos.push(item)
      else papelesChoferPorVencer.push(item)
    }
    papelesChoferVencidos.sort((a, b) => b.diasParaVencer - a.diasParaVencer)
    papelesChoferPorVencer.sort((a, b) => a.diasParaVencer - b.diasParaVencer)

    // ── Services de camiones ──────────────────────────────────
    // El backend ya filtra por estado IN ('proximo','vencido') y ordena
    // por km_restantes asc; acá solo separamos en dos buckets.
    const serviciosVencidos: ServiceCamionItem[] = []
    const serviciosProximos: ServiceCamionItem[] = []
    for (const row of servicesNotif as ServiceCamionItem[]) {
      if (row.estado === 'vencido') serviciosVencidos.push(row)
      else if (row.estado === 'proximo') serviciosProximos.push(row)
    }

    // ── Gastos pendientes de aprobación ──────────────────────────
    const gastosPendientes: GastoPendienteItem[] = (gastosPend?.items ?? []).map(g => ({
      id:               g.id,
      fecha:            g.fecha,
      monto:            Number(g.monto),
      descripcion:      g.descripcion,
      proveedor:        g.proveedor,
      categoria_nombre: g.categoria?.nombre ?? null,
      chofer_nombre:    g.chofer?.nombre ?? null,
      patente:          g.camion?.patente ?? null,
    }))

    // ── Solicitudes con ítems por comprar (progreso 'pendiente') ──
    const solicitudesPorComprar: SolicitudPorComprarItem[] = (solicitudes as SolicitudCompra[])
      .filter(s => s.progreso === 'pendiente')
      .map(s => ({
        id:          s.id,
        obra_cod:    s.obra_cod,
        fecha:       s.fecha,
        nPendientes: (s.items ?? []).filter(i => i.estado === 'pendiente').length,
      }))
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id)

    return {
      hoy,
      proximos,
      papelesVencidos,
      papelesPorVencer,
      papelesChoferVencidos,
      papelesChoferPorVencer,
      serviciosVencidos,
      serviciosProximos,
      gastosPendientes,
      solicitudesPorComprar,
      totalUrgente:
        hoy.length +
        papelesVencidos.length +
        papelesChoferVencidos.length +
        serviciosVencidos.length +
        gastosPendientes.length +
        solicitudesPorComprar.length,
    }
  }, [personal, docsVenc, docsChofer, servicesNotif, gastosPend, solicitudes, tieneTarja])
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
