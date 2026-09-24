'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api/client'
import { usePersonal } from '@/modules/tarja/hooks/usePersonal'
import { GASTOS_NOTIF_KEY } from '@/modules/logistica/hooks/useLogistica'
import { useSessionStore } from '@/store/session.store'
import { usePermisos } from '@/hooks/usePermisos'
import { usePendientesDePrecio } from '@/modules/certificaciones/hooks/useCuentaCliente'
import { PAGOS_KEYS } from '@/modules/pagos/hooks/usePagos'
import { useAmbienteCobranzas, useDeudores } from '@/modules/facturacion/hooks/useCobranzas'
import { conVencido } from '@/modules/facturacion/utils/cobranzas.utils'
import { useTabsPermitidos } from '@/hooks/useTabsPermitidos'
import type { PagosFacturasPage, Personal } from '@/types/domain.types'

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
/** Entidades con papeles que vencen. Espejo de `v_vehiculo_documentos_vencimientos`. */
export type EntidadConPapeles = 'camion' | 'batea' | 'flota' | 'maquina' | 'unidad'

export interface DocVencimientoItem {
  doc_id:           number
  entidad:          EntidadConPapeles
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
  // Nombre de la obra resuelto vía /api/obras. Null si la obra no está en el
  // scope del user o todavía no cargó la lista — la UI cae a obra_cod.
  obra_nom:    string | null
  fecha:       string
  nPendientes: number
}

// Máquina de alquiler con seguro vencido o por vencer. El backend ya devuelve
// las filas scopeadas y ordenadas por seguro_vence asc.
export interface SeguroMaquinaItem {
  maquina_id:     number
  nombre:         string
  identificacion: string | null
  seguro_vence:   string  // ISO yyyy-mm-dd
  // Días de vencimiento: <0 = ya venció hace tanto, 0 = vence hoy, >0 = vence en N días.
  diasParaVencer: number
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

// Renglones de la cuenta corriente sin precio, agrupados por obra (fase 3 de
// precios, 2026-09-09). Solo para quien tiene el permiso de cargar precios:
// es su lista de trabajo, no un aviso para todos.
export interface SinPrecioItem {
  obra_cod:       string
  obra_nom:       string
  sin_precio:     number
  // De esos, cuántos entraron como "esperando precio del proveedor".
  esperando:      number
  obra_archivada: boolean
}

/**
 * Una factura del módulo Pagos que pide atención. Las cuatro secciones usan
 * la misma forma: lo que cambia es POR QUÉ aparece.
 */
export interface FacturaPagosItem {
  id:            number
  proveedor_nom: string
  comprobante:   string
  total:         number
  saldo:         number
  vence_el:      string | null
  /** > 0 vencida, < 0 por vencer, null sin vencimiento. */
  dias_vencida:  number | null
}

/**
 * Un cliente de Ventas con facturas vencidas sin cobrar. Sale de
 * GET /api/facturacion/deudores (la MISMA query que la tab Deudores) filtrada
 * con `conVencido`, que es también el filtro del deep-link
 * `/facturacion?tab=deudores&aviso=vencidas`.
 */
export interface VentaVencidaItem {
  cliente_id:      number
  razon_social:    string
  vencido:         number
  /** Parte del saldo que viene de saldos iniciales sin confirmar. */
  saldo_a_revisar: number
  d90_mas:         number
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
  // Seguros de máquinas (alquiler) ya vencidos.
  segurosVencidos:     SeguroMaquinaItem[]
  // Seguros de máquinas por vencer en los próximos 30 días.
  segurosPorVencer:    SeguroMaquinaItem[]
  // Solicitudes de compra con ítems por comprar (para compras/depósito).
  solicitudesPorComprar: SolicitudPorComprarItem[]
  // Renglones sin precio en la cuenta corriente, por obra (para quien carga precios).
  sinPrecio:           SinPrecioItem[]
  // ── Módulo Pagos ──
  // Facturas esperando aprobación (solo para quien puede aprobar).
  facturasParaAprobar: FacturaPagosItem[]
  // Facturas ya vencidas que todavía deben plata.
  facturasVencidas:    FacturaPagosItem[]
  // Cargadas «ya pagadas» que ningún aprobador selló.
  facturasSinRevisar:  FacturaPagosItem[]
  // Rechazadas: compras las tiene que corregir.
  facturasObservadas:  FacturaPagosItem[]
  // ── Ventas ──
  // Clientes con facturas vencidas sin cobrar (mayor vencido primero).
  ventasVencidas:      VentaVencidaItem[]
  // La lista de obras ya cargó: recién ahí el aviso puede mostrar el nombre.
  pedidosNombresListos: boolean
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
  // Las cinco entidades con papeles vencibles. El backend ya filtra las filas
  // por los módulos que la persona puede leer.
  entidad: EntidadConPapeles
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

// Shape crudo de GET /api/solicitudes/pendientes (endpoint liviano dedicado
// a la campana: solo solicitudes aprobadas con ítems por comprar).
interface SolicitudPendienteRow {
  id:           number
  obra_cod:     string
  obra_nom:     string | null
  fecha:        string
  n_pendientes: number
}

// Shape crudo del endpoint de notificaciones de seguros de alquiler.
interface SeguroMaquinaRow {
  id:             number
  nombre:         string
  identificacion: string | null
  seguro:         string | null
  seguro_vence:   string
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
  const tieneAlquiler  = hasModulo('alquiler')
  const tieneFlota     = hasModulo('flota')
  const tieneAridos    = hasModulo('aridos')
  // Solicitudes "por comprar": solo para quien resuelve ítems (compras/depósito).
  const tieneCertificaciones = hasModulo('certificaciones')
  const { resolverItems, cargarPrecios } = usePermisos('certificaciones')
  const tienePagos = hasModulo('pagos')
  const { aprobarFacturas, registrarPagos, puedeCrear: cargaFacturas, esAdmin } = usePermisos('pagos')
  // Ventas: solo quien ve la tab Deudores (misma guardia que el endpoint).
  const tieneVentas = hasModulo('facturacion')
  const tabsVentas = useTabsPermitidos('facturacion')
  const verDeudores = tieneVentas && tabsVentas.includes('deudores')
  const ambienteVentas = useAmbienteCobranzas()

  const { data: personal = [] } = usePersonal()
  const { data: docsVenc = [] } = useQuery({
    queryKey: ['logistica', 'notificaciones', 'documentos'],
    queryFn:  () => apiGet<DocVencimientoRow[]>('/api/logistica/notificaciones/documentos'),
    // Ya no es solo de logística: la misma llamada trae los vencimientos de
    // flota, alquiler y áridos, filtrados por el backend. Gatearla con
    // `tieneLogistica` dejaba sin campana a quien tiene esos módulos y no
    // logística.
    enabled:  tieneLogistica || tieneFlota || tieneAlquiler || tieneAridos,
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
  const { data: segurosNotif = [] } = useQuery({
    queryKey: ['alquiler', 'notificaciones', 'seguros'],
    queryFn:  () => apiGet<SeguroMaquinaRow[]>('/api/alquiler/notificaciones/seguros'),
    enabled:  tieneAlquiler,
    retry: false,
    staleTime: 5 * 60 * 1000,
  })
  const { data: gastosPend } = useQuery({
    // La clave vive en useLogistica: las mutaciones de gastos la invalidan
    // para que aprobar refresque este aviso sin recargar la página.
    queryKey: GASTOS_NOTIF_KEY,
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
  // Solicitudes con ítems por comprar — endpoint liviano dedicado (un par de
  // KB por respuesta). Antes se polleaba la lista completa de /api/solicitudes
  // (~400 KB con items+proveedores) cada 60s, lo que agotó los 5 GB de
  // bandwidth del plan Hobby de Render (agosto 2026). El refetchInterval de
  // 5 min mantiene el aviso de "nuevo pedido" mientras la app está abierta;
  // las mutations del módulo invalidan el prefijo ['solicitudes'], así que
  // crear/resolver pedidos actualiza la campana al instante igual.
  const pendientesQuery = useQuery({
    queryKey: ['solicitudes', 'pendientes-notif'],
    queryFn:  () => apiGet<SolicitudPendienteRow[]>('/api/solicitudes/pendientes'),
    enabled:  tieneCertificaciones && resolverItems,
    retry: false,
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  })
  const pendientes = pendientesQuery.data ?? []
  // Sin precio por obra: mismo endpoint liviano que usa la cuenta corriente
  // (una fila por obra); las mutaciones del módulo invalidan
  // ['cuenta-cliente-pendientes'], así que cargar un precio lo refresca.
  const { data: pendPrecio = [] } = usePendientesDePrecio(tieneCertificaciones && cargarPrecios)
  // ── Módulo Pagos ──
  // Cuatro avisos, cada uno con su clave para que `invalidarPagos` los
  // refresque (el prefijo del módulo NO alcanza: es el bug de la campana de
  // gastos del 2026-09-07). Se piden con `limit=5`: lo que importa es el
  // `total` que devuelve la página y las primeras filas para el popover, no
  // bajar la bandeja entera cada vez que alguien abre la campana.
  const qPagos = (clave: readonly unknown[], qs: string, activo: boolean) => ({
    queryKey: clave,
    queryFn:  () => apiGet<PagosFacturasPage>(`/api/pagos/facturas?${qs}&limit=5&offset=0`),
    enabled:  activo,
    retry: false,
    staleTime: 60 * 1000,
  })
  // Aprobar es de quien tiene el flag; el admin pasa igual.
  const puedeAprobarFacturas = tienePagos && !!(aprobarFacturas || esAdmin)
  // «Sin revisar» le sirve al mismo que aprueba: es su cola de control.
  const { data: paraAprobar } = useQuery(
    qPagos(PAGOS_KEYS.notifAprobar, 'estado=pendiente&paga_cliente=0&orden=vencimiento', puedeAprobarFacturas))
  const { data: sinRevisar } = useQuery(
    qPagos(PAGOS_KEYS.notifSinRevisar, 'sin_revisar=1', puedeAprobarFacturas))
  // Lo vencido le importa a quien paga y a quien carga.
  const { data: vencidas } = useQuery(
    qPagos(PAGOS_KEYS.notifVenc, 'vencimiento=vencidas&paga_cliente=0&orden=vencimiento',
      tienePagos && !!(registrarPagos || cargaFacturas || esAdmin)))
  // Lo observado vuelve a compras: lo ve quien carga.
  const { data: observadas } = useQuery(
    qPagos(PAGOS_KEYS.notifObs, 'estado=observada', tienePagos && !!(cargaFacturas || esAdmin)))

  // ── Ventas ──
  // Misma clave que la tab Deudores a la fecha de hoy: la dedupe React Query
  // y cualquier cobro la invalida (todo cuelga de ['facturacion', …]).
  const { data: deudoresVentas } = useDeudores('', ambienteVentas, verDeudores)

  // El nombre de la obra viene embebido desde el backend: alcanza con que la
  // query haya cargado para que el warmup del aviso pueda activarse.
  const pedidosNombresListos = pendientesQuery.isSuccess

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

    // ── Seguros de máquinas (alquiler) ─────────────────────────
    const segurosVencidos:  SeguroMaquinaItem[] = []
    const segurosPorVencer: SeguroMaquinaItem[] = []
    for (const row of segurosNotif as SeguroMaquinaRow[]) {
      if (!row.seguro_vence) continue
      const { dias, bucket } = clasificar(row.seguro_vence)
      if (!bucket) continue
      const item: SeguroMaquinaItem = {
        maquina_id:     row.id,
        nombre:         row.nombre,
        identificacion: row.identificacion,
        seguro_vence:   row.seguro_vence,
        diasParaVencer: dias,
      }
      if (bucket === 'vencido') segurosVencidos.push(item)
      else segurosPorVencer.push(item)
    }
    // Mismo criterio que los papeles de vehículos: vencidos por más vencido
    // primero (más negativo), por-vencer por más próximo primero.
    segurosVencidos.sort((a, b) => a.diasParaVencer - b.diasParaVencer)
    segurosPorVencer.sort((a, b) => a.diasParaVencer - b.diasParaVencer)

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

    // ── Solicitudes con ítems por comprar ──
    // El backend ya filtra (aprobadas con ≥1 ítem pendiente, scope por obras
    // del user) y ordena por fecha desc, id desc: acá solo se renombra.
    const solicitudesPorComprar: SolicitudPorComprarItem[] = pendientes.map(s => ({
      id:          s.id,
      obra_cod:    s.obra_cod,
      obra_nom:    s.obra_nom,
      fecha:       s.fecha,
      nPendientes: s.n_pendientes,
    }))

    // ── Sin precio en la cuenta corriente ──
    // Las archivadas no se avisan: no son trabajo vivo (la pestaña las muestra
    // con el filtro de archivadas).
    const sinPrecio: SinPrecioItem[] = pendPrecio
      .filter(p => !p.obra_archivada)
      .map(p => ({ obra_cod: p.obra_cod, obra_nom: p.obra_nom ?? p.obra_cod, sin_precio: p.sin_precio, esperando: p.esperando ?? 0, obra_archivada: p.obra_archivada }))

    // Las cuatro secciones de Pagos comparten el mapeo: el backend ya filtró y
    // ordenó, acá solo se recorta a lo que el popover muestra.
    const aItemPagos = (p?: PagosFacturasPage): FacturaPagosItem[] =>
      (p?.items ?? []).map(f => ({
        id: f.id,
        proveedor_nom: f.proveedor_nom,
        comprobante: `${f.tipo_comprobante} ${f.numero?.trim() || 's/n'}`,
        total: Number(f.total),
        saldo: Number(f.saldo),
        vence_el: f.vence_el,
        dias_vencida: f.dias_vencida,
      }))

    const ventasVencidas: VentaVencidaItem[] = (deudoresVentas ?? [])
      .filter(conVencido)
      .map(d => ({
        cliente_id: d.cliente_id, razon_social: d.cliente_razon_social, vencido: Number(d.vencido),
        saldo_a_revisar: Number(d.saldo_a_revisar), d90_mas: Number(d.d90_mas),
      }))
      .sort((a, b) => b.vencido - a.vencido)

    const facturasParaAprobar = aItemPagos(paraAprobar)
    const facturasVencidas    = aItemPagos(vencidas)
    const facturasSinRevisar  = aItemPagos(sinRevisar)
    const facturasObservadas  = aItemPagos(observadas)

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
      segurosVencidos,
      segurosPorVencer,
      solicitudesPorComprar,
      sinPrecio,
      facturasParaAprobar,
      facturasVencidas,
      facturasSinRevisar,
      facturasObservadas,
      ventasVencidas,
      pedidosNombresListos,
      // El badge rojo cuenta lo que FRENA algo o ya se pasó de fecha. Las
      // facturas vencidas y las que esperan aprobación entran (sin aprobar no
      // se puede pagar); «sin revisar» y «observadas» no: son control y
      // corrección, no urgencias. Se usa el TOTAL del server, no las 5 filas
      // que se bajaron para el popover.
      totalUrgente:
        hoy.length +
        papelesVencidos.length +
        papelesChoferVencidos.length +
        serviciosVencidos.length +
        gastosPendientes.length +
        segurosVencidos.length +
        solicitudesPorComprar.length +
        (vencidas?.total ?? 0) +
        (paraAprobar?.total ?? 0) +
        ventasVencidas.length,
    }
  }, [personal, docsVenc, docsChofer, servicesNotif, gastosPend, segurosNotif, pendientes, pendPrecio, tieneTarja, pedidosNombresListos, paraAprobar, vencidas, sinRevisar, observadas, deudoresVentas])
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
