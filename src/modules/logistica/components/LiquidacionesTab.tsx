'use client'

import { useState, useEffect } from 'react'
import {
  useLiquidaciones, useAdelantos, useChoferes, useCamiones, useTramos, useRutas, useCanteras, useDepositos,
  useCreateLiquidacion, useUpdateLiquidacion, useCerrarLiquidacion, useReabrirLiquidacion, useDeleteLiquidacion,
  useCreateAdelanto, useUpdateAdelanto, useDeleteAdelanto, useUpdateChofer,
  useGastosReintegrosPendientes, useReintegrosPendientesTodos,
  uploadComprobanteAdelanto, fetchAdelantoComprobanteUrl,
} from '../hooks/useLogistica'
import { useRelevosPendientesTodos, useRelevosLiquidados } from '../hooks/useTramoRelevo'
import { Modal }    from '@/components/ui/Modal'
import { Button }   from '@/components/ui/Button'
import { Input }    from '@/components/ui/Input'
import { Combobox } from '@/components/ui/Combobox'
import { Select }   from '@/components/ui/Select'
import { Badge }    from '@/components/ui/Badge'
import { useToast } from '@/components/ui/Toast'
import { useForm }  from 'react-hook-form'
import { generarPdfLiquidacion, type PdfLiquidacionArgs } from '@/lib/utils/liquidacion-pdf'
import { LiquidacionAdjuntosSection } from './LiquidacionAdjuntosSection'
import { ModalSolicitudTransferencia } from './ModalSolicitudTransferencia'
import { apiGet } from '@/lib/api/client'
import { abrirAdjuntoFirmado } from '@/lib/utils/abrir-adjunto'
import type { Chofer, Tramo, Adelanto, Ruta, RelevoPendiente, RelevoLiquidado } from '@/types/domain.types'
import { exportLiquidacionExcel } from '@/lib/utils/liquidacion-export'
import { toISO } from '@/lib/utils/dates'

function fmtM(n: number) {
  return '$' + n.toLocaleString('es-AR', { maximumFractionDigits: 0 })
}

function fmtN(n: number) {
  return n.toLocaleString('es-AR', { maximumFractionDigits: 0 })
}
function fmtFecha(s: string) {
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

/** Fechas únicas de tramos completados */
function diasUnicos(tramos: Tramo[]): number {
  const inicios = tramos.map(t => t.fecha_carga ?? t.fecha_vacio ?? '').filter(Boolean)
  const fines   = tramos.map(t => t.fecha_descarga ?? t.fecha_carga ?? t.fecha_vacio ?? '').filter(Boolean)
  if (!inicios.length) return 0
  const desde = inicios.reduce((a, b) => a < b ? a : b)
  const hasta = fines.length ? fines.reduce((a, b) => a > b ? a : b) : desde
  return Math.round((new Date(hasta).getTime() - new Date(desde).getTime()) / 86_400_000) + 1
}

/** Días calendario entre dos fechas (inclusive) */
function diasEntreFechas(desde: string, hasta: string): number {
  if (!desde || !hasta) return 0
  return Math.round((new Date(hasta).getTime() - new Date(desde).getTime()) / 86_400_000) + 1
}

/** Km de un tramo según la tabla de rutas (lookup direccional cantera→depósito) */
// Devuelve la fecha "representativa" de un tramo según su tipo:
// cargado → fecha_carga, vacio → fecha_vacio. Para filtros de rango.
function fechaTramo(t: Tramo): string | null {
  return (t.tipo === 'vacio' ? t.fecha_vacio : t.fecha_carga) ?? null
}

function tramoEnRango(t: Tramo, desde?: string, hasta?: string): boolean {
  const f = fechaTramo(t)
  if (!f) return false
  if (desde && f < desde) return false
  if (hasta && f > hasta) return false
  return true
}

// Lookup DIRECCIONAL cantera→depósito. cantera_id y deposito_id salen de
// tablas DISTINTAS (canteras/depositos) con ids solapados, así que el match
// invertido (cantera↔depósito) podía devolver la ruta de OTRO par por
// colisión de ids (ej. tramo DELTA ARENAS→MASUR agarraba YESO→BASE NEXA).
// Cada tramo apunta a su ruta del sentido real — igual que ViajesTab.
function kmTramo(t: Tramo, rutas: Ruta[]): number {
  if (!t.cantera_id || !t.deposito_id) return 0
  const ruta = rutas.find(r =>
    r.cantera_id === t.cantera_id && r.deposito_id === t.deposito_id
  )
  return ruta?.km_ida_vuelta ?? 0
}

// ── Helpers de relevos (Fase 2) ──
// Fecha representativa del tramo embebido en una fila de relevo (igual criterio
// que fechaTramo: cargado→fecha_carga, vacio→fecha_vacio).
function fechaRelevo(r: RelevoPendiente): string | null {
  if (!r.tramo) return null
  return (r.tramo.tipo === 'vacio' ? r.tramo.fecha_vacio : r.tramo.fecha_carga) ?? null
}

// Km de la PATA del relevo (lo que manejó ese chofer), según el tipo del tramo.
function kmRelevo(r: RelevoPendiente): number {
  if (!r.tramo) return 0
  return r.tramo.tipo === 'vacio' ? Number(r.km_vacio) : Number(r.km_cargado)
}

function relevoEnRango(r: RelevoPendiente, desde?: string, hasta?: string): boolean {
  const f = fechaRelevo(r)
  if (!f) return false
  if (desde && f < desde) return false
  if (hasta && f > hasta) return false
  return true
}

// Rango de fechas combinando tramos propios + tramos de relevo (para encuadrar
// el período por default al abrir el modal cuando el chofer solo tiene relevos).
function rangoConRelevos(tramos: Tramo[], relevos: RelevoPendiente[]): { desde: string; hasta: string } {
  const fechas: string[] = []
  for (const t of tramos) {
    const f = t.fecha_carga ?? t.fecha_vacio
    const g = t.fecha_descarga ?? t.fecha_carga ?? t.fecha_vacio
    if (f) fechas.push(f)
    if (g) fechas.push(g)
  }
  for (const r of relevos) {
    const f = fechaRelevo(r)
    if (f) fechas.push(f)
  }
  if (!fechas.length) return { desde: '', hasta: '' }
  return { desde: fechas.reduce((a, b) => a < b ? a : b), hasta: fechas.reduce((a, b) => a > b ? a : b) }
}

// Reparto del básico con relevos: parte de `baseDias` (días del rango), resta
// los días cubiertos EXCLUSIVAMENTE por relevos (no los que ya tienen tramo
// propio) y suma Σ jornales del relevo. Así cada chofer cobra su jornal del
// relevo sin duplicar el día. Devuelve los días efectivos (>= 0).
function diasConRelevos(baseDias: number, desde: string, hasta: string, ownDates: Set<string>, relevos: RelevoPendiente[]): number {
  const restar = new Set<string>()
  let jornales = 0
  for (const r of relevos) {
    jornales += Number(r.jornales ?? 0)
    const f = fechaRelevo(r)
    if (f && baseDias > 0 && (!desde || f >= desde) && (!hasta || f <= hasta) && !ownDates.has(f)) {
      restar.add(f)
    }
  }
  return Math.max(0, baseDias - restar.size + jornales)
}

export function LiquidacionesTab() {
  const toast = useToast()
  const { data: liquidaciones = [] } = useLiquidaciones()
  const { data: adelantos     = [] } = useAdelantos()
  const { data: choferes      = [] } = useChoferes()
  const { data: camiones      = [] } = useCamiones()
  const { data: tramos        = [] } = useTramos()
  const { data: rutas         = [] } = useRutas()
  const { data: canteras      = [] } = useCanteras()
  const { data: depositos     = [] } = useDepositos()
  // Filas de relevo pendientes de liquidar (todas) — Fase 2. Cada fila es la
  // pata de un chofer en un tramo compartido; se liquida con su propio chofer.
  const { data: relevosTodos  = [] } = useRelevosPendientesTodos()
  // Patas de relevo YA liquidadas — para mostrarlas en el detalle/PDF/Excel de
  // liquidaciones cerradas (el tramo vinculado se busca en `tramos`).
  const { data: relevosLiq    = [] } = useRelevosLiquidados()

  const { mutate: createLiq,   isPending: creating     } = useCreateLiquidacion()
  const { mutate: updateLiq,   isPending: updating     } = useUpdateLiquidacion()
  const { mutate: cerrarLiq   } = useCerrarLiquidacion()
  const { mutate: reabrirLiq  } = useReabrirLiquidacion()

  const { mutate: deleteLiq   } = useDeleteLiquidacion()
  const { mutate: createAdel,  isPending: creatingAdel } = useCreateAdelanto()
  const { mutate: updateAdel,  isPending: updatingAdel } = useUpdateAdelanto()
  const { mutate: deleteAdel  } = useDeleteAdelanto()
  const { mutate: updateChofer, isPending: savingTarifas } = useUpdateChofer()

  const [modalLiq,    setModalLiq]    = useState(false)
  const [choferLiq,   setChoferLiq]   = useState<Chofer | null>(null)
  const [selAdelant,  setSelAdelant]  = useState<number[]>([])
  const [selTramos,   setSelTramos]   = useState<number[]>([])
  const [selRelevos,  setSelRelevos]  = useState<number[]>([])
  const [selGastos,   setSelGastos]   = useState<number[]>([])
  const [modalAdel,   setModalAdel]   = useState(false)
  const [modalTransf, setModalTransf] = useState(false)
  const [editandoAdel, setEditandoAdel] = useState<Adelanto | null>(null)
  const [detalleLiq,  setDetalleLiq]  = useState<any | null>(null)
  // Gastos asociados a la liquidación abierta en el modal de detalle.
  // Se cargan on-demand al abrir el modal — no se traen siempre porque
  // serían muchos requests innecesarios.
  const [detalleGastos, setDetalleGastos] = useState<any[]>([])
  const [loadingDetalleGastos, setLoadingDetalleGastos] = useState(false)
  // Modal de confirmación para eliminar liquidaciones cerradas — pide
  // tipear el N° y un motivo (>=10 chars) para evitar eliminaciones
  // accidentales y dejar trazabilidad en audit_log.
  const [confirmDelLiq, setConfirmDelLiq] = useState<any | null>(null)
  const [confirmDelNumero, setConfirmDelNumero] = useState('')
  const [confirmDelMotivo, setConfirmDelMotivo] = useState('')

  // Filtros + agrupación de la sección "Adelantos pendientes".
  const [filtChoferAdel,  setFiltChoferAdel]  = useState<string>('')          // '' = todos
  const [filtEstadoAdel,  setFiltEstadoAdel]  = useState<'pendientes' | 'liquidados' | 'todos'>('pendientes')
  const [filtDesdeAdel,   setFiltDesdeAdel]   = useState<string>('')
  const [filtHastaAdel,   setFiltHastaAdel]   = useState<string>('')
  const [filtSearchAdel,  setFiltSearchAdel]  = useState<string>('')
  const [expandedChoferes, setExpandedChoferes] = useState<Set<number>>(new Set())
  // Historial de liquidaciones cerradas: colapsado por default para no ocupar
  // tanto espacio (puede crecer mucho con el tiempo).
  const [historialAbierto, setHistorialAbierto] = useState(false)
  // Comprobante (foto/PDF) para el adelanto que se está creando/editando.
  const [archivoAdel, setArchivoAdel] = useState<File | null>(null)
  const [archivoEditAdel, setArchivoEditAdel] = useState<File | null>(null)
  const [removerCompEdit, setRemoverCompEdit] = useState(false)
  const [subiendoComp, setSubiendoComp] = useState(false)

  const formAdel    = useForm<any>()
  const formEditAdel = useForm<any>()
  const formLiq     = useForm<any>()
  const formDetalle = useForm<any>()

  // Reactive watch para que el preview se actualice al cambiar fechas/tarifas
  const watchDesde       = formLiq.watch('desde')
  const watchHasta       = formLiq.watch('hasta')
  const watchBasico      = formLiq.watch('basico_dia')
  const watchKmCargado   = formLiq.watch('precio_km_cargado')
  const watchKmVacio     = formLiq.watch('precio_km_vacio')

  // Reintegros pendientes del chofer activo (Fase 3). Se consulta al backend
  // cuando se abre el modal de liquidar; el usuario elige cuáles incluir.
  const { data: reintegrosResp } = useGastosReintegrosPendientes(
    choferLiq?.id ?? null,
    watchHasta || undefined,
  )
  const gastosReintegro = reintegrosResp?.items ?? []

  // Pre-tildar todos los reintegros cuando el listado cambia (chofer nuevo
  // o refetch por cambio de fecha). Si el user destildó alguno manualmente,
  // este efecto lo vuelve a tildar — trade-off a favor del flujo típico
  // "todos los reintegros van en esta liquidación".
  const reintegroIdsKey = gastosReintegro.map(g => g.id).join(',')
  useEffect(() => {
    if (choferLiq) setSelGastos(gastosReintegro.map(g => g.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reintegroIdsKey, choferLiq?.id])

  // Al cambiar el rango Desde/Hasta, la selección de tramos = TODOS los
  // pendientes del chofer que caen dentro del rango.
  //
  // Antes esto sólo filtraba (`prev.filter`), nunca re-agregaba. Problema:
  // al editar la fecha "hasta" (ej. 06/02 → 05/31) se pasa por estados
  // intermedios (ej. hasta=05/02, que queda < desde=05/04 → rango invertido →
  // todo "fuera de rango"). Eso vaciaba la selección y, como nunca re-agregaba,
  // al terminar de tipear la fecha correcta los tramos quedaban VISIBLES pero
  // DESTILDADOS. Re-seleccionando los que están en rango, manda la fecha final.
  // (Trade-off: si destildás un tramo a mano y después cambiás el período, se
  // vuelve a tildar; el flujo típico es elegir período → ajustar selección.)
  useEffect(() => {
    if (!choferLiq) return
    const visiblesIds = tramosPendientes
      .filter(t => t.chofer_id === choferLiq.id)
      .filter(t => tramoEnRango(t, watchDesde, watchHasta))
      .map(t => t.id)
    setSelTramos(visiblesIds)
    const relevoIds = relevos
      .filter(r => r.chofer_id === choferLiq.id && relevoEnRango(r, watchDesde, watchHasta))
      .map(r => r.id)
    setSelRelevos(relevoIds)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchDesde, watchHasta, choferLiq?.id])

  // Tramos que tienen relevo cargado: se liquidan por pata vía tramo_choferes
  // (cada chofer cobra lo suyo), no como tramo entero del titular.
  const relevos = relevosTodos as RelevoPendiente[]
  const relevosLiquidados = relevosLiq as RelevoLiquidado[]
  const tramosConRelevoIds = new Set(relevos.map(r => r.tramo_id))

  // ── Patas de relevo normalizadas para el detalle (PDF/Excel/modal) ──
  const canteraNom  = (id: number | null | undefined) => (canteras  as { id: number; nombre: string }[]).find(c => c.id === id)?.nombre ?? null
  const depositoNom = (id: number | null | undefined) => (depositos as { id: number; nombre: string }[]).find(d => d.id === id)?.nombre ?? null
  type LegRow = { fecha: string | null; tipo: 'cargado' | 'vacio'; cantera: string | null; deposito: string | null; km: number }

  // En curso: a partir de filas RelevoPendiente (tramo embebido). km = pata.
  function legsDeRelevos(rs: RelevoPendiente[]): LegRow[] {
    return rs.filter(r => r.tramo).map(r => {
      const t = r.tramo!
      return { fecha: fechaRelevo(r), tipo: t.tipo, cantera: canteraNom(t.cantera_id), deposito: depositoNom(t.deposito_id), km: kmRelevo(r) }
    })
  }
  // Cerrada: patas ya liquidadas de una liquidación (tramo real buscado en `tramos`).
  function legsRelevoLiquidados(liqId: number): LegRow[] {
    return relevosLiquidados.filter(r => r.liquidacion_id === liqId).map(r => {
      const t = (tramos as Tramo[]).find(x => x.id === r.tramo_id)
      const tipo: 'cargado' | 'vacio' = t?.tipo ?? r.tramo?.tipo ?? 'cargado'
      const fecha = t ? ((tipo === 'vacio' ? t.fecha_vacio : t.fecha_carga) ?? null) : null
      const km = tipo === 'vacio' ? Number(r.km_vacio) : Number(r.km_cargado)
      return { fecha, tipo, cantera: t ? canteraNom(t.cantera_id) : null, deposito: t ? depositoNom(t.deposito_id) : null, km }
    })
  }
  // LegRow → fila de PDF (marca esRelevo) · suma de km de patas por tipo.
  const legToPdf = (l: LegRow) => ({ fecha: l.fecha, tipo: l.tipo, cantera: l.cantera, deposito: l.deposito, km: l.km, toneladas: null as number | null, remito: null as string | null, esRelevo: true })
  const kmLegs = (legs: LegRow[], tipo: 'cargado' | 'vacio') => legs.filter(l => l.tipo === tipo).reduce((s, l) => s + l.km, 0)

  // Tramos completados aún no liquidados, EXCLUYENDO los que tienen relevo.
  const tramosPendientes    = (tramos as Tramo[]).filter(t => t.estado === 'completado' && !t.liquidacion_id && !tramosConRelevoIds.has(t.id))
  const adelantosPendientes = (adelantos as Adelanto[]).filter(a => !a.liquidacion_id)
  // Reintegros pendientes (gastos pagados por el chofer, aprobados, sin liquidar)
  // de todos los choferes — para sumarlos al saldo del listado.
  const { data: reintegrosTodos } = useReintegrosPendientesTodos()
  const reintegrosPendientes = reintegrosTodos?.items ?? []

  // Todos los choferes activos o de descanso
  const choferesPendientes = (choferes as Chofer[]).filter(c => c.estado !== 'inactivo')

  function resumenChofer(chofer: Chofer) {
    const mis_tramos      = tramosPendientes.filter(t => t.chofer_id === chofer.id)
    const mis_relevos     = relevos.filter(r => r.chofer_id === chofer.id && r.tramo)
    const mis_adelantos   = adelantosPendientes.filter(a => a.chofer_id === chofer.id)
    const mis_reintegros  = reintegrosPendientes.filter(g => g.chofer_id === chofer.id)
    const sinBasico     = !chofer.basico_dia
    // Básico: días del span de tramos propios, restando los días cubiertos sólo
    // por relevos y sumando Σ jornales del relevo (cada chofer cobra su jornal,
    // sin duplicar el día). Ver diasConRelevos.
    const baseDias      = diasUnicos(mis_tramos)
    const { desde: rDesde, hasta: rHasta } = rangoConRelevos(mis_tramos, mis_relevos)
    const ownDates      = new Set(mis_tramos.map(fechaTramo).filter(Boolean) as string[])
    const dias          = diasConRelevos(baseDias, rDesde, rHasta, ownDates, mis_relevos)
    const subtotal_bas  = dias * (chofer.basico_dia ?? 0)
    // Km: tramos propios (km de ruta completa) + patas de relevo (km de la fila).
    const km_cargados = mis_tramos.filter(t => t.tipo === 'cargado').reduce((s, t) => s + kmTramo(t, rutas as Ruta[]), 0)
      + mis_relevos.filter(r => r.tramo!.tipo === 'cargado').reduce((s, r) => s + kmRelevo(r), 0)
    const km_vacios = mis_tramos.filter(t => t.tipo === 'vacio').reduce((s, t) => s + kmTramo(t, rutas as Ruta[]), 0)
      + mis_relevos.filter(r => r.tramo!.tipo === 'vacio').reduce((s, r) => s + kmRelevo(r), 0)
    const km_totales         = km_cargados + km_vacios
    const subtotal_km_cargado = km_cargados * (chofer.precio_km_cargado ?? 0)
    const subtotal_km_vacio   = km_vacios   * (chofer.precio_km_vacio ?? 0)
    const subtotal_km   = subtotal_km_cargado + subtotal_km_vacio
    const subtotal      = subtotal_bas + subtotal_km
    const descuentos    = mis_adelantos.reduce((s, a) => s + a.monto, 0)
    const reintegros    = mis_reintegros.reduce((s, g) => s + Number(g.monto), 0)
    const saldo         = subtotal - descuentos + reintegros
    return {
      mis_tramos, mis_relevos, mis_adelantos, mis_reintegros, dias, sinBasico, subtotal_bas,
      km_cargados, km_vacios, km_totales,
      subtotal_km_cargado, subtotal_km_vacio, subtotal_km,
      subtotal, descuentos, reintegros, saldo,
    }
  }

  function abrirLiquidar(chofer: Chofer) {
    setChoferLiq(chofer)
    const mis_tramos  = tramosPendientes.filter(t => t.chofer_id === chofer.id)
    const mis_relevos = relevos.filter(r => r.chofer_id === chofer.id && r.tramo)
    setSelTramos(mis_tramos.map(t => t.id))
    setSelRelevos(mis_relevos.map(r => r.id))
    setSelAdelant(adelantosPendientes.filter(a => a.chofer_id === chofer.id).map(a => a.id))
    setSelGastos([]) // se llena cuando el hook devuelve reintegros (useEffect abajo)
    const { desde, hasta } = rangoConRelevos(mis_tramos, mis_relevos)
    formLiq.reset({
      basico_dia:        chofer.basico_dia ?? 0,
      precio_km_cargado: chofer.precio_km_cargado ?? 0,
      precio_km_vacio:   chofer.precio_km_vacio ?? 0,
      desde,
      hasta,
      obs:               '',
    })
    setModalLiq(true)
  }

  function calcularPreview() {
    const empty = {
      dias: 0, basico_dia: 0, subtotal_bas: 0,
      km_cargados: 0, km_vacios: 0, km_totales: 0,
      subtotal_km_cargado: 0, subtotal_km_vacio: 0, subtotal_km: 0,
      descuentos: 0, reintegros: 0,
      precio_km_cargado: 0, precio_km_vacio: 0, precio_km: 0,
      neto: 0,
    }
    if (!choferLiq) return empty
    const basico_dia       = parseFloat(watchBasico)    || 0
    const precioKmCargado  = parseFloat(watchKmCargado) || 0
    const precioKmVacio    = parseFloat(watchKmVacio)   || 0
    const desde            = watchDesde ?? ''
    const hasta            = watchHasta ?? ''
    // Sólo tramos del chofer activo, dentro del rango Desde/Hasta y tildados.
    const tramosSelec      = tramosPendientes.filter(t =>
      selTramos.includes(t.id) && tramoEnRango(t, desde, hasta),
    )
    // Patas de relevo del chofer, tildadas y en rango (Fase 2).
    const relevosSelec     = relevos.filter(r =>
      r.chofer_id === choferLiq.id && selRelevos.includes(r.id) && relevoEnRango(r, desde, hasta),
    )
    // Básico: días del rango menos días cubiertos sólo por relevos, más Σ jornales.
    const baseDias         = diasEntreFechas(desde, hasta)
    const ownDates         = new Set(tramosSelec.map(fechaTramo).filter(Boolean) as string[])
    const dias             = diasConRelevos(baseDias, desde, hasta, ownDates, relevosSelec)
    const subtotal_bas     = dias * basico_dia
    const km_cargados      = tramosSelec.filter(t => t.tipo === 'cargado').reduce((s, t) => s + kmTramo(t, rutas as Ruta[]), 0)
      + relevosSelec.filter(r => r.tramo!.tipo === 'cargado').reduce((s, r) => s + kmRelevo(r), 0)
    const km_vacios        = tramosSelec.filter(t => t.tipo === 'vacio').reduce((s, t) => s + kmTramo(t, rutas as Ruta[]), 0)
      + relevosSelec.filter(r => r.tramo!.tipo === 'vacio').reduce((s, r) => s + kmRelevo(r), 0)
    const km_totales       = km_cargados + km_vacios
    const subtotal_km_cargado = km_cargados * precioKmCargado
    const subtotal_km_vacio   = km_vacios   * precioKmVacio
    const subtotal_km      = subtotal_km_cargado + subtotal_km_vacio
    const descuentos       = adelantosPendientes.filter(a => selAdelant.includes(a.id)).reduce((s, a) => s + a.monto, 0)
    const reintegros       = gastosReintegro.filter(g => selGastos.includes(g.id)).reduce((s, g) => s + Number(g.monto), 0)
    // precio_km "promedio" para back-compat con la columna existente.
    const precio_km        = km_totales > 0 ? subtotal_km / km_totales : precioKmCargado
    return {
      dias, basico_dia, subtotal_bas,
      km_cargados, km_vacios, km_totales,
      subtotal_km_cargado, subtotal_km_vacio, subtotal_km,
      descuentos, reintegros,
      precio_km_cargado: precioKmCargado,
      precio_km_vacio:   precioKmVacio,
      precio_km,
      neto: subtotal_bas + subtotal_km - descuentos + reintegros,
    }
  }

  function handleGuardarTarifas(data: any) {
    if (!choferLiq) return
    updateChofer({
      id: choferLiq.id,
      dto: {
        basico_dia:        parseFloat(data.basico_dia)        || 0,
        precio_km_cargado: parseFloat(data.precio_km_cargado) || 0,
        precio_km_vacio:   parseFloat(data.precio_km_vacio)   || 0,
      },
    }, {
      onSuccess: () => { toast('✓ Tarifas guardadas', 'ok'); setModalLiq(false); setChoferLiq(null) },
      onError:   () => toast('Error al guardar', 'err'),
    })
  }

  function handleDescargarPdfPreview(data: any) {
    if (!choferLiq) return
    const preview = calcularPreview()
    const tramosDelChofer = tramosPendientes
      .filter(t => t.chofer_id === choferLiq.id && selTramos.includes(t.id))
      .filter(t => tramoEnRango(t, data.desde, data.hasta))
    // Patas de relevo del chofer (km ya incluido en preview.km_*; acá solo se listan).
    const relevoLegs = legsDeRelevos(relevos.filter(r =>
      r.chofer_id === choferLiq.id && selRelevos.includes(r.id) && relevoEnRango(r, data.desde, data.hasta),
    ))
    const camion = (camiones as any[]).find(c => c.id === choferLiq.camion_id)
    const args: PdfLiquidacionArgs = {
      chofer_nombre:       choferLiq.nombre,
      chofer_cuil:         choferLiq.cuil ?? null,
      camion_patente:      camion?.patente ?? null,
      fecha_desde:         data.desde,
      fecha_hasta:         data.hasta,
      dias_trabajados:     preview.dias,
      basico_dia:          preview.basico_dia,
      basico_mensual:      0,
      km_cargados:         preview.km_cargados,
      km_vacios:           preview.km_vacios,
      precio_km_cargado:   preview.precio_km_cargado,
      precio_km_vacio:     preview.precio_km_vacio,
      subtotal_basico:     preview.subtotal_bas,
      subtotal_km:         preview.subtotal_km,
      total_adelantos:     preview.descuentos,
      total_reintegros:    preview.reintegros,
      total_neto:          preview.neto,
      tramos: [
        ...tramosDelChofer.map(t => {
          const cantera  = (canteras  as any[]).find(c => c.id === t.cantera_id)
          const deposito = (depositos as any[]).find(d => d.id === t.deposito_id)
          return {
            fecha:      t.fecha_carga ?? t.fecha_vacio ?? null,
            tipo:       (t.tipo === 'vacio' ? 'vacio' : 'cargado') as 'cargado' | 'vacio',
            cantera:    cantera?.nombre ?? null,
            deposito:   deposito?.nombre ?? null,
            km:         kmTramo(t, rutas as Ruta[]),
            toneladas:  t.toneladas_descarga ?? t.toneladas_carga ?? null,
            remito:     t.remito_carga ?? t.remito_descarga ?? null,
          }
        }),
        ...relevoLegs.map(legToPdf),
      ],
      adelantos: adelantosPendientes
        .filter(a => a.chofer_id === choferLiq.id && selAdelant.includes(a.id))
        .map(a => ({
          fecha:       a.fecha,
          descripcion: a.descripcion ?? '',
          monto:       Number(a.monto),
        })),
      gastos: gastosReintegro
        .filter(g => selGastos.includes(g.id))
        .map(g => ({
          fecha:       g.fecha,
          categoria:   g.categoria?.nombre ?? '—',
          proveedor:   g.proveedor ?? null,
          descripcion: g.descripcion ?? null,
          monto:       Number(g.monto),
        })),
      estado:             'borrador',
      numero_liquidacion: null,
      observaciones:      data.obs ?? null,
    }
    try {
      generarPdfLiquidacion(args)
    } catch (e) {
      console.error('[pdf-liquidacion]', e)
      toast('Error al generar PDF', 'err')
    }
  }

  // Carga los gastos del modal de detalle al abrirlo y los limpia al cerrarlo.
  useEffect(() => {
    if (!detalleLiq) {
      setDetalleGastos([])
      return
    }
    let cancelled = false
    setLoadingDetalleGastos(true)
    fetchGastosLiquidacion(detalleLiq.id).then(gastos => {
      if (!cancelled) setDetalleGastos(gastos)
    }).finally(() => {
      if (!cancelled) setLoadingDetalleGastos(false)
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detalleLiq?.id])

  // Trae los gastos asociados a una liquidación cerrada. Hacemos el fetch
  // on-demand (no se cargan siempre con useGastos) tanto para PDF como para
  // Excel.
  async function fetchGastosLiquidacion(liqId: number): Promise<any[]> {
    try {
      const resp = await apiGet<{ items: any[] }>(
        `/api/logistica/gastos?liquidacion_id=${liqId}&limit=500`,
      )
      return resp.items ?? []
    } catch (err) {
      console.warn('[liquidacion] no se pudieron traer los gastos:', err)
      return []
    }
  }

  // Excel de una liquidación cerrada con detalle de gastos del chofer.
  async function handleDescargarExcelCerrada(liq: any, exportData: any) {
    const gastos = await fetchGastosLiquidacion(liq.id)
    exportLiquidacionExcel({
      ...exportData,
      reintegros: liq.total_reintegros ?? 0,
      gastos: gastos.map(g => ({
        fecha:       g.fecha,
        categoria:   g.categoria?.nombre ?? '—',
        proveedor:   g.proveedor ?? null,
        descripcion: g.descripcion ?? null,
        monto:       Number(g.monto),
      })),
    })
  }

  // Excel de una liquidación EN CURSO. Trae los reintegros pendientes del
  // chofer (a la fecha "hasta" del período) y los agrega al Excel para que
  // la sección "GASTOS DEL CHOFER" no quede vacía.
  async function handleDescargarExcelEnCurso(choferId: number, exportData: any) {
    try {
      const q = new URLSearchParams({ chofer_id: String(choferId) })
      if (exportData.hasta) q.set('hasta', exportData.hasta)
      const resp = await apiGet<{ items: any[]; total: number }>(
        `/api/logistica/gastos/reintegros-pendientes?${q.toString()}`,
      )
      exportLiquidacionExcel({
        ...exportData,
        reintegros: resp.total,
        gastos: resp.items.map((g: any) => ({
          fecha:       g.fecha,
          categoria:   g.categoria?.nombre ?? '—',
          proveedor:   g.proveedor ?? null,
          descripcion: g.descripcion ?? null,
          monto:       Number(g.monto),
        })),
        // Neto = básico + km − adelantos + reintegros, contando los reintegros
        // UNA sola vez. OJO: exportData.neto (= saldo de resumenChofer) YA
        // incluía reintegros, así que sumar resp.total los duplicaba (el Excel
        // daba más que el PDF parcial). Recomputamos desde los subtotales.
        neto: (exportData.subtotal_bas ?? 0) + (exportData.subtotal_km ?? 0) - (exportData.descuentos ?? 0) + resp.total,
      })
    } catch (err) {
      console.warn('[liquidacion] no se pudieron traer reintegros pendientes:', err)
      // Caemos al Excel sin gastos para no bloquear al user.
      exportLiquidacionExcel(exportData)
    }
  }

  // PDF de una liquidación ya cerrada/guardada. Trae los gastos asociados
  // on-demand (en lugar de cargarlos siempre con useGastos) y arma el
  // PDF con el mismo generador que usa el "PDF parcial" del modal.
  async function handleDescargarPdfCerrada(liq: any) {
    const chofer = (choferes as Chofer[]).find(c => c.id === liq.chofer_id)
    if (!chofer) { toast('Chofer no encontrado', 'err'); return }
    const camion = (camiones as any[]).find(c => c.id === chofer.camion_id)
    const liqTramos = (tramos as Tramo[]).filter(t => t.liquidacion_id === liq.id)
    const liqAdel   = (adelantos as Adelanto[]).filter(a => a.liquidacion_id === liq.id)
    const gastos    = await fetchGastosLiquidacion(liq.id)
    const relevoLegs = legsRelevoLiquidados(liq.id)

    // km de tramos propios + km de patas de relevo, para que el desglose cuadre
    // con el subtotal_km persistido (que incluye los relevos).
    const km_cargados = liqTramos.filter(t => t.tipo === 'cargado').reduce((s, t) => s + kmTramo(t, rutas as Ruta[]), 0) + kmLegs(relevoLegs, 'cargado')
    const km_vacios   = liqTramos.filter(t => t.tipo === 'vacio').reduce((s, t) => s + kmTramo(t, rutas as Ruta[]), 0) + kmLegs(relevoLegs, 'vacio')

    const args: PdfLiquidacionArgs = {
      chofer_nombre:       chofer.nombre,
      chofer_cuil:         chofer.cuil ?? null,
      camion_patente:      camion?.patente ?? null,
      fecha_desde:         liq.fecha_desde,
      fecha_hasta:         liq.fecha_hasta,
      dias_trabajados:     liq.dias_trabajados,
      basico_dia:          liq.basico_dia,
      basico_mensual:      0,
      km_cargados,
      km_vacios,
      precio_km_cargado:   chofer.precio_km_cargado ?? 0,
      precio_km_vacio:     chofer.precio_km_vacio ?? 0,
      subtotal_basico:     liq.subtotal_basico ?? 0,
      subtotal_km:         liq.subtotal_km ?? 0,
      total_adelantos:     liq.total_adelantos ?? 0,
      total_reintegros:    liq.total_reintegros ?? 0,
      total_neto:          liq.total_neto,
      tramos: [
        ...liqTramos.map(t => {
          const cantera  = (canteras  as any[]).find(c => c.id === t.cantera_id)
          const deposito = (depositos as any[]).find(d => d.id === t.deposito_id)
          return {
            fecha:      t.fecha_carga ?? t.fecha_vacio ?? null,
            tipo:       (t.tipo === 'vacio' ? 'vacio' : 'cargado') as 'cargado' | 'vacio',
            cantera:    cantera?.nombre ?? null,
            deposito:   deposito?.nombre ?? null,
            km:         kmTramo(t, rutas as Ruta[]),
            toneladas:  t.toneladas_descarga ?? t.toneladas_carga ?? null,
            remito:     t.remito_carga ?? t.remito_descarga ?? null,
          }
        }),
        ...relevoLegs.map(legToPdf),
      ],
      adelantos: liqAdel.map(a => ({
        fecha:       a.fecha,
        descripcion: a.descripcion ?? '',
        monto:       Number(a.monto),
      })),
      gastos: gastos.map(g => ({
        fecha:       g.fecha,
        categoria:   g.categoria?.nombre ?? '—',
        proveedor:   g.proveedor ?? null,
        descripcion: g.descripcion ?? null,
        monto:       Number(g.monto),
      })),
      estado:             liq.estado === 'cerrada' ? 'cerrada' : 'borrador',
      numero_liquidacion: liq.id,
      observaciones:      liq.obs ?? null,
    }
    try {
      generarPdfLiquidacion(args)
    } catch (e) {
      console.error('[pdf-liquidacion-cerrada]', e)
      toast('Error al generar PDF', 'err')
    }
  }

  function handleLiquidar(data: any) {
    if (!choferLiq) return
    const {
      dias, basico_dia, subtotal_bas,
      km_totales, subtotal_km, subtotal_km_cargado, subtotal_km_vacio,
      descuentos, reintegros, precio_km, neto,
    } = calcularPreview()
    createLiq({
      chofer_id:           choferLiq.id,
      fecha_desde:         data.desde,
      fecha_hasta:         data.hasta,
      dias_trabajados:     dias,
      basico_dia,
      km_totales,
      precio_km,
      subtotal_basico:     subtotal_bas,
      subtotal_km,
      subtotal_km_cargado,
      subtotal_km_vacio,
      total_adelantos:     descuentos,
      total_reintegros:    reintegros,
      total_neto:          neto,
      obs:                 data.obs,
      tramo_ids:           selTramos,
      tramo_chofer_ids:    selRelevos,
      adelanto_ids:        selAdelant,
      gasto_ids:           selGastos,
    } as any, {
      onSuccess: (nueva: any) => {
        cerrarLiq(nueva.id, {
          onSuccess: () => {
            toast('✓ Liquidación cerrada', 'ok')
            setModalLiq(false)
            setChoferLiq(null)
            setSelAdelant([])
            setSelTramos([])
            setSelRelevos([])
            setSelGastos([])
          },
          onError: (e: any) => toast(`Borrador creado pero no se pudo cerrar: ${e?.message ?? 'error desconocido'}. Cerralo desde la card de saldo.`, 'err'),
        })
      },
      onError: (err: any) => {
        const code = err?.body?.error || err?.code
        if (code === 'TRAMO_INVALIDO')    toast('Alguno de los tramos no es válido (ya liquidado o no pertenece al chofer)', 'err')
        else if (code === 'RELEVO_INVALIDO') toast('Alguna pata de relevo no es válida (ya liquidada o no pertenece al chofer)', 'err')
        else if (code === 'ADELANTO_INVALIDO') toast('Alguno de los adelantos no es válido', 'err')
        else if (code === 'GASTO_INVALIDO') toast('Alguno de los gastos a reintegrar no es válido (cambió de estado)', 'err')
        else toast(err?.message || 'Error al liquidar', 'err')
      },
    })
  }

  async function handleCreateAdel(data: any) {
    try {
      let comprobante_path: string | null = null
      if (archivoAdel) {
        setSubiendoComp(true)
        comprobante_path = await uploadComprobanteAdelanto(archivoAdel)
      }
      createAdel({
        chofer_id:   Number(data.chofer_id),
        fecha:       data.fecha,
        monto:       Number(data.monto),
        descripcion: data.descripcion,
        ...(comprobante_path ? { comprobante_path } : {}),
      }, {
        onSuccess: () => {
          toast('✓ Adelanto registrado', 'ok')
          setModalAdel(false)
          formAdel.reset()
          setArchivoAdel(null)
        },
        onError: (err: any) => {
          const code = err?.body?.error
          if (code === 'COMPROBANTE_DUPLICADO') toast('Ese comprobante ya está cargado en otro adelanto', 'err')
          else toast('Error al registrar', 'err')
        },
      })
    } catch (e: any) {
      toast(e?.message || 'Error al subir el comprobante', 'err')
    } finally {
      setSubiendoComp(false)
    }
  }

  async function verComprobanteAdel(id: number) {
    await abrirAdjuntoFirmado(
      () => fetchAdelantoComprobanteUrl(id),
      () => toast('No se pudo abrir el comprobante', 'err'),
    )
  }

  const preview = calcularPreview()

  return (
    <>
      <div className="flex gap-2 justify-end flex-wrap">
        <Button variant="secondary" size="sm" onClick={() => setModalTransf(true)}>
          🏦 Solicitud de transferencia
        </Button>
        <Button variant="secondary" size="sm" onClick={() => {
          formAdel.setValue('fecha', toISO(new Date()))
          setModalAdel(true)
        }}>
          💵 Registrar adelanto
        </Button>
      </div>

      {/* ── Saldo corriente por chofer ── */}
      <div>
        <h2 className="text-xs font-bold text-gris-dark uppercase tracking-wider mb-3">
          Saldo corriente por chofer
        </h2>
        <div className="flex flex-col gap-3">
          {choferesPendientes.map(chofer => {
            const { mis_tramos, mis_relevos, mis_adelantos, mis_reintegros, dias, sinBasico, subtotal_bas, km_cargados, km_vacios, km_totales, subtotal_km, subtotal, descuentos, reintegros, saldo } = resumenChofer(chofer)
            const sinMovimientos = mis_tramos.length === 0 && mis_relevos.length === 0 && mis_adelantos.length === 0 && mis_reintegros.length === 0
            const borrador = (liquidaciones as any[]).find(l => l.chofer_id === chofer.id && l.estado === 'borrador')

            return (
              <div key={chofer.id} className="bg-white rounded-card shadow-card p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">

                  {/* Nombre + info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-azul">{chofer.nombre}</span>
                      {chofer.estado === 'descanso' && (
                        <span className="text-[10px] font-bold uppercase tracking-wide bg-naranja-light text-naranja-dark px-2 py-0.5 rounded-full">
                          De descanso
                        </span>
                      )}
                    </div>

                    {sinMovimientos ? (
                      <p className="text-xs text-gris-mid mt-1 italic">Sin tramos, adelantos ni gastos pendientes</p>
                    ) : (
                      <div className="text-xs text-gris-dark mt-1 space-y-0.5">
                        {mis_tramos.length > 0 && (
                          <div>
                            {mis_tramos.length} tramo{mis_tramos.length !== 1 ? 's' : ''} ·{' '}
                            <span className="font-semibold text-carbon">{dias} día{dias !== 1 ? 's' : ''}</span>
                            {km_totales > 0 && (
                              <> · <span className="font-semibold text-carbon">{km_totales.toLocaleString('es-AR')} km</span></>
                            )}
                            {(km_cargados > 0 && km_vacios > 0) && (
                              <span className="text-gris-mid"> ({km_cargados.toLocaleString('es-AR')} cargados · {km_vacios.toLocaleString('es-AR')} vacíos)</span>
                            )}
                          </div>
                        )}
                        {mis_relevos.length > 0 && (
                          <div className="text-azul-mid">🔄 {mis_relevos.length} relevo{mis_relevos.length !== 1 ? 's' : ''} · pata compartida con otro chofer</div>
                        )}
                        {mis_tramos.length > 0 && !sinBasico && (
                          <div className="text-gris-mid">
                            {fmtM(subtotal_bas)} básico
                            {subtotal_km > 0 && ` + ${fmtM(subtotal_km)} km`}
                            {descuentos > 0 && ` − ${fmtM(descuentos)} adelantos`}
                            {reintegros > 0 && ` + ${fmtM(reintegros)} gastos`}
                          </div>
                        )}
                        {mis_adelantos.length > 0 && sinBasico && (
                          <div>{mis_adelantos.length} adelanto{mis_adelantos.length !== 1 ? 's' : ''} · {fmtM(descuentos)}</div>
                        )}
                        {mis_reintegros.length > 0 && sinBasico && (
                          <div>{mis_reintegros.length} gasto{mis_reintegros.length !== 1 ? 's' : ''} pagado{mis_reintegros.length !== 1 ? 's' : ''} por el chofer · {fmtM(reintegros)}</div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Saldo */}
                  {!sinMovimientos && (
                    <div className="text-right shrink-0">
                      {sinBasico && mis_tramos.length > 0 ? (
                        <div>
                          <span className="text-xs font-bold bg-amarillo/20 text-amber-700 px-2 py-1 rounded-lg">
                            Básico pendiente — {dias} día{dias !== 1 ? 's' : ''}
                            {km_totales > 0 && ` · ${km_totales.toLocaleString('es-AR')} km`}
                          </span>
                        </div>
                      ) : (
                        <>
                          <div className={`font-mono font-bold text-xl ${saldo >= 0 ? 'text-verde' : 'text-rojo'}`}>
                            {fmtM(saldo)}
                          </div>
                          <div className="text-[11px] text-gris-dark">
                            {fmtM(subtotal)} haberes
                            {descuentos > 0 ? ` − ${fmtM(descuentos)}` : ''}
                            {reintegros > 0 ? ` + ${fmtM(reintegros)}` : ''}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Borrador pendiente */}
                {borrador && (
                  <div className="mt-3 pt-3 border-t border-gris flex items-center justify-between gap-3 flex-wrap">
                    <div className="text-xs text-gris-dark">
                      <span className="font-bold text-amber-700">Borrador</span> ·{' '}
                      {fmtFecha(borrador.fecha_desde)} → {fmtFecha(borrador.fecha_hasta)} ·{' '}
                      <span className="font-bold text-carbon">{fmtM(borrador.total_neto)}</span>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="primary" size="sm" onClick={() => cerrarLiq(borrador.id, {
                        onSuccess: () => toast('✓ Liquidación cerrada', 'ok'),
                        onError:   (e: any) => toast(`Error al cerrar: ${e?.message ?? 'desconocido'}`, 'err'),
                      })}>
                        💰 Liquidar
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => {
                        if (confirm('¿Eliminar borrador?')) deleteLiq(borrador.id, {
                          onSuccess: () => toast('✓ Eliminado', 'ok'),
                          onError:   (e: any) => toast(`Error al eliminar: ${e?.message ?? 'desconocido'}`, 'err'),
                        })
                      }}>
                        🗑
                      </Button>
                    </div>
                  </div>
                )}

                {/* Botones liquidar + exportar */}
                {!sinMovimientos && !borrador && (
                  <div className="mt-3 pt-3 border-t border-gris flex gap-2 flex-wrap">
                    <Button variant="primary" size="sm" onClick={() => abrirLiquidar(chofer)}>
                      💰 Liquidar
                    </Button>
                    {(mis_tramos.length > 0 || mis_relevos.length > 0) && (() => {
                      const { desde, hasta } = rangoConRelevos(mis_tramos, mis_relevos)
                      const precio_km_cargado = chofer.precio_km_cargado ?? 0
                      const precio_km_vacio   = chofer.precio_km_vacio   ?? 0
                      // dias, subtotal_bas, km_cargados/vacios y subtotal_km vienen de
                      // resumenChofer → ya incluyen las patas de relevo (km + jornal).
                      const exportData = {
                        nombreChofer: chofer.nombre,
                        desde, hasta, dias,
                        basico_dia:   chofer.basico_dia ?? 0,
                        subtotal_bas, km_totales, subtotal_km, descuentos,
                        km_cargados, km_vacios,
                        precio_km_cargado, precio_km_vacio,
                        subtotal_km_cargado: km_cargados * precio_km_cargado,
                        subtotal_km_vacio:   km_vacios   * precio_km_vacio,
                        // Reintegros contados UNA vez (fallback; en el camino normal se
                        // recomputa con resp.total del endpoint).
                        neto: subtotal_bas + subtotal_km - descuentos + reintegros,
                        tramos:       mis_tramos,
                        relevos:      legsDeRelevos(mis_relevos),
                        adelantos:    mis_adelantos,
                        canteras:     canteras as any[],
                        depositos:    depositos as any[],
                        rutas:        rutas as Ruta[],
                        estado:       'En curso',
                      }
                      // PDF eliminado de esta vista: el "📄 PDF parcial" del
                      // modal de Liquidar cubre el caso con más detalle (gastos,
                      // filtro por fechas, selección de tramos).
                      return (
                        <Button variant="ghost" size="sm" onClick={() => handleDescargarExcelEnCurso(chofer.id, exportData)}>📊 Excel</Button>
                      )
                    })()}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Historial (colapsable para no ocupar tanto espacio) ── */}
      {(() => {
        const cerradas = (liquidaciones as any[]).filter(l => l.estado === 'cerrada')
        if (cerradas.length === 0) return null
        return (
        <div>
          <button
            type="button"
            onClick={() => setHistorialAbierto(v => !v)}
            className="flex items-center gap-2 text-xs font-bold text-gris-dark uppercase tracking-wider mb-2 hover:text-azul transition-colors"
          >
            <span className="text-[10px] text-gris-mid">{historialAbierto ? '▼' : '▶'}</span>
            Historial de liquidaciones
            <span className="text-gris-mid normal-case font-semibold">({cerradas.length})</span>
          </button>
          {historialAbierto && (
          <div className="flex flex-col gap-3">
            {cerradas.map(liq => {
              const chofer = (choferes as Chofer[]).find(c => c.id === liq.chofer_id)
              return (
                <div key={liq.id} className={`bg-white rounded-card shadow-card p-4 border-l-4 ${liq.estado === 'cerrada' ? 'border-verde' : 'border-amarillo'}`}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={liq.estado === 'cerrada' ? 'cerrado' : 'pendiente'} label={liq.estado === 'cerrada' ? 'Cerrada' : 'Borrador'} />
                      </div>
                      <div className="font-bold text-azul">{chofer?.nombre ?? '—'}</div>
                      <div className="text-xs text-gris-dark mt-1">
                        {fmtFecha(liq.fecha_desde)} → {fmtFecha(liq.fecha_hasta)} &nbsp;·&nbsp;
                        {liq.dias_trabajados} días &nbsp;·&nbsp;
                        {fmtM(liq.basico_dia)}/día
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold text-lg text-verde">{fmtM(liq.total_neto)}</div>
                      <div className="text-xs text-gris-dark">Total neto</div>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <Button variant="secondary" size="sm" onClick={() => {
                      setDetalleLiq(liq)
                      formDetalle.reset({
                        basico_dia:  liq.basico_dia,
                        fecha_desde: liq.fecha_desde,
                        fecha_hasta: liq.fecha_hasta,
                        obs:         liq.obs ?? '',
                      })
                    }}>
                      🔍 Ver detalle
                    </Button>
                    {liq.estado === 'borrador' && (
                      <Button variant="primary" size="sm" onClick={() => cerrarLiq(liq.id, { onSuccess: () => toast('✓ Cerrada', 'ok') })}>
                        ✓ Cerrar
                      </Button>
                    )}
                    {(() => {
                      const liqTramos  = (tramos   as Tramo[]).filter(t => t.liquidacion_id === liq.id)
                      const liqAdel    = (adelantos as Adelanto[]).filter(a => a.liquidacion_id === liq.id)
                      const relevoLegs = legsRelevoLiquidados(liq.id)
                      // Desglose km cargado/vacío + patas de relevo, para cuadrar con
                      // el subtotal_km persistido (que incluye relevos).
                      const km_cargados = liqTramos.filter(t => t.tipo === 'cargado').reduce((s: number, t: Tramo) => s + kmTramo(t, rutas as Ruta[]), 0) + kmLegs(relevoLegs, 'cargado')
                      const km_vacios   = liqTramos.filter(t => t.tipo === 'vacio'  ).reduce((s: number, t: Tramo) => s + kmTramo(t, rutas as Ruta[]), 0) + kmLegs(relevoLegs, 'vacio')
                      const precio_km_cargado = chofer?.precio_km_cargado ?? 0
                      const precio_km_vacio   = chofer?.precio_km_vacio   ?? 0
                      const exportData = {
                        nombreChofer: chofer?.nombre ?? '—',
                        desde:        liq.fecha_desde,
                        hasta:        liq.fecha_hasta,
                        dias:         liq.dias_trabajados,
                        basico_dia:   liq.basico_dia,
                        subtotal_bas: liq.subtotal_basico ?? 0,
                        km_totales:   km_cargados + km_vacios,
                        subtotal_km:  liq.subtotal_km ?? 0,
                        km_cargados, km_vacios,
                        precio_km_cargado, precio_km_vacio,
                        subtotal_km_cargado: km_cargados * precio_km_cargado,
                        subtotal_km_vacio:   km_vacios   * precio_km_vacio,
                        descuentos:   liq.total_adelantos,
                        neto:         liq.total_neto,
                        tramos:       liqTramos,
                        relevos:      relevoLegs,
                        adelantos:    liqAdel,
                        canteras:     canteras as any[],
                        depositos:    depositos as any[],
                        rutas:        rutas as Ruta[],
                        estado:       liq.estado === 'cerrada' ? 'Cerrada' : 'Borrador',
                      }
                      return (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => handleDescargarExcelCerrada(liq, exportData)}>📊 Excel</Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDescargarPdfCerrada(liq)}>📄 PDF</Button>
                        </>
                      )
                    })()}
                    <Button variant="ghost" size="sm" onClick={() => {
                      setConfirmDelLiq(liq)
                      setConfirmDelNumero('')
                      setConfirmDelMotivo('')
                    }}>
                      🗑 Eliminar
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
          )}
        </div>
        )
      })()}

      {/* ── Adelantos: filtros + agrupado por chofer ── */}
      {(adelantos as Adelanto[]).length > 0 && (() => {
        // Aplicar todos los filtros sobre el array crudo
        const filtrados = (adelantos as Adelanto[]).filter(a => {
          // Estado
          if (filtEstadoAdel === 'pendientes' && a.liquidacion_id) return false
          if (filtEstadoAdel === 'liquidados' && !a.liquidacion_id) return false
          // Chofer
          if (filtChoferAdel && a.chofer_id !== Number(filtChoferAdel)) return false
          // Rango fechas
          if (filtDesdeAdel && a.fecha < filtDesdeAdel) return false
          if (filtHastaAdel && a.fecha > filtHastaAdel) return false
          // Texto libre
          if (filtSearchAdel) {
            const q = filtSearchAdel.toLowerCase()
            const desc = (a.descripcion ?? '').toLowerCase()
            if (!desc.includes(q)) return false
          }
          return true
        })

        // Agrupar por chofer_id
        const grupos = new Map<number, Adelanto[]>()
        for (const a of filtrados) {
          const arr = grupos.get(a.chofer_id) ?? []
          arr.push(a)
          grupos.set(a.chofer_id, arr)
        }
        // Ordenar grupos por nombre del chofer
        const gruposOrdenados = [...grupos.entries()]
          .map(([id, lista]) => {
            const chofer = (choferes as Chofer[]).find(c => c.id === id)
            return { id, chofer, lista: lista.sort((x, y) => y.fecha.localeCompare(x.fecha)) }
          })
          .sort((a, b) => (a.chofer?.nombre ?? '').localeCompare(b.chofer?.nombre ?? ''))

        // Si hay un solo grupo (filtro por chofer activo) → arranca expandido
        const autoExpand = gruposOrdenados.length === 1 ? new Set([gruposOrdenados[0]!.id]) : null

        const totalFiltrado = filtrados.reduce((s, a) => s + Number(a.monto), 0)

        function toggleChofer(id: number) {
          setExpandedChoferes(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id); else next.add(id)
            return next
          })
        }

        return (
          <div>
            <h2 className="text-xs font-bold text-gris-dark uppercase tracking-wider mb-2">Adelantos</h2>

            {/* Barra de filtros */}
            <div className="bg-white rounded-card shadow-card p-3 mb-3 flex flex-col gap-3">
              <div className="flex flex-wrap gap-1">
                {(['pendientes', 'liquidados', 'todos'] as const).map(v => (
                  <button
                    key={v}
                    onClick={() => setFiltEstadoAdel(v)}
                    className={`text-xs font-bold px-3 py-1.5 rounded transition-colors capitalize ${filtEstadoAdel === v ? 'bg-azul text-white' : 'bg-gris text-gris-dark hover:bg-gris-mid'}`}
                  >
                    {v}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2 items-end">
                <Select
                  label="Chofer"
                  value={filtChoferAdel}
                  onChange={e => setFiltChoferAdel((e.target as HTMLSelectElement).value)}
                  options={[
                    { value: '', label: 'Todos' },
                    ...((choferes as Chofer[]).filter(c => c.estado !== 'inactivo')
                      .map(c => ({ value: String(c.id), label: c.nombre }))),
                  ]}
                />
                <Input label="Desde" type="date" value={filtDesdeAdel} onChange={e => setFiltDesdeAdel(e.target.value)} />
                <Input label="Hasta" type="date" value={filtHastaAdel} onChange={e => setFiltHastaAdel(e.target.value)} />
                <Input label="Buscar" placeholder="Descripción..." value={filtSearchAdel} onChange={e => setFiltSearchAdel(e.target.value)} />
                {(filtChoferAdel || filtDesdeAdel || filtHastaAdel || filtSearchAdel || filtEstadoAdel !== 'pendientes') && (
                  <button
                    onClick={() => { setFiltChoferAdel(''); setFiltDesdeAdel(''); setFiltHastaAdel(''); setFiltSearchAdel(''); setFiltEstadoAdel('pendientes') }}
                    className="text-xs text-azul hover:underline self-end mb-1.5"
                  >
                    Limpiar filtros
                  </button>
                )}
              </div>
            </div>

            {/* Cards por chofer */}
            {gruposOrdenados.length === 0 ? (
              <div className="bg-white rounded-card shadow-card p-6 text-center text-gris-dark text-sm">
                No hay adelantos con esos filtros.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {gruposOrdenados.map(({ id, chofer, lista }) => {
                  const expanded = autoExpand?.has(id) || expandedChoferes.has(id)
                  const subtotal = lista.reduce((s, a) => s + Number(a.monto), 0)
                  return (
                    <div key={id} className="bg-white rounded-card shadow-card overflow-hidden">
                      <button
                        onClick={() => toggleChofer(id)}
                        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-gris/30 transition-colors text-left"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-gris-dark text-sm">{expanded ? '▼' : '▶'}</span>
                          <span className="font-bold text-azul">{chofer?.nombre ?? `#${id}`}</span>
                          <span className="text-xs text-gris-dark">
                            {lista.length} adelanto{lista.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <span className="font-mono font-bold text-rojo">{fmtM(subtotal)}</span>
                      </button>
                      {expanded && (
                        <div className="border-t border-gris divide-y divide-gris">
                          {lista.map(a => (
                            <div key={a.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm hover:bg-gris/20 transition-colors">
                              <div className="flex-1 min-w-0">
                                <div className="text-xs text-gris-dark font-mono">{fmtFecha(a.fecha)}</div>
                                <div className="text-carbon truncate">{a.descripcion || '—'}</div>
                                {a.liquidacion_id && (
                                  <div className="text-[10px] text-gris-mid">Liquidado en N° {a.liquidacion_id}</div>
                                )}
                              </div>
                              <div className="font-mono font-bold text-rojo shrink-0">{fmtM(a.monto)}</div>
                              <div className="flex gap-1 shrink-0">
                                {a.comprobante_url && (
                                  <button
                                    onClick={() => verComprobanteAdel(a.id)}
                                    title="Ver comprobante"
                                    className="text-xs font-bold px-2 py-1 rounded hover:bg-azul-light text-gris-dark hover:text-azul transition-colors"
                                  >👁</button>
                                )}
                                {!a.liquidacion_id && (
                                  <>
                                    <button
                                      onClick={() => { setEditandoAdel(a); formEditAdel.reset({ fecha: a.fecha, monto: a.monto, descripcion: a.descripcion ?? '' }); setArchivoEditAdel(null); setRemoverCompEdit(false) }}
                                      className="text-xs font-bold px-2 py-1 rounded hover:bg-gris transition-colors"
                                    >✏️</button>
                                    <button
                                      onClick={() => { if (confirm('¿Eliminar adelanto?')) deleteAdel(a.id, { onSuccess: () => toast('✓ Adelanto eliminado', 'ok'), onError: () => toast('Error al eliminar', 'err') }) }}
                                      className="text-xs font-bold px-2 py-1 rounded hover:bg-rojo-light text-gris-dark hover:text-rojo transition-colors"
                                    >✕</button>
                                  </>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Footer con total */}
            {gruposOrdenados.length > 0 && (
              <div className="text-xs text-gris-dark mt-2 text-right">
                Total filtrado: <span className="font-mono font-bold text-rojo">{fmtM(totalFiltrado)}</span> · {filtrados.length} adelanto{filtrados.length !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        )
      })()}

      {/* ── Modal liquidar ── */}
      <Modal open={modalLiq} onClose={() => setModalLiq(false)} title="💰 LIQUIDAR CHOFER" width="max-w-xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalLiq(false)}>Cancelar</Button>
            <Button variant="ghost" onClick={formLiq.handleSubmit(handleDescargarPdfPreview)}>
              📄 PDF parcial
            </Button>
            <Button variant="ghost" loading={savingTarifas} onClick={formLiq.handleSubmit(handleGuardarTarifas)}>
              Guardar
            </Button>
            <Button variant="primary" loading={creating} onClick={formLiq.handleSubmit(handleLiquidar)}>
              💰 Liquidar
            </Button>
          </>
        }
      >
        {choferLiq && (
          <div className="flex flex-col gap-4">
            {/* Info chofer */}
            <div className="bg-azul-light rounded-xl px-4 py-3">
              <div className="font-bold text-azul">{choferLiq.nombre}</div>
              <div className="text-xs text-azul-mid mt-0.5">
                {preview.dias} días trabajados · {tramosPendientes.filter(t => t.chofer_id === choferLiq.id).length} tramos completados
              </div>
            </div>

            <div>
              <Input label="Básico/día ($)" type="number" step="100" {...formLiq.register('basico_dia')} />
              {preview.dias > 0 && preview.basico_dia > 0 && (
                <p className="text-[11px] text-gris-dark mt-1 px-1">
                  × {preview.dias} día{preview.dias !== 1 ? 's' : ''} = {fmtM(preview.subtotal_bas)}
                </p>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input label="🚛 $/km cargado" type="number" step="1" {...formLiq.register('precio_km_cargado')} />
              <Input label="🔲 $/km vacío"   type="number" step="1" {...formLiq.register('precio_km_vacio')} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input label="Período desde" type="date" {...formLiq.register('desde')} />
              <Input label="Período hasta"  type="date" {...formLiq.register('hasta')} />
            </div>

            {/* Tramos del chofer dentro del rango Desde/Hasta */}
            {(() => {
              const tramosDelChofer = tramosPendientes
                .filter(t => t.chofer_id === choferLiq.id)
                .filter(t => tramoEnRango(t, watchDesde, watchHasta))
              const totalDelChofer = tramosPendientes.filter(t => t.chofer_id === choferLiq.id).length
              const ocultosPorRango = totalDelChofer - tramosDelChofer.length
              if (totalDelChofer === 0) return null
              return (
                <div>
                  <div className="text-xs font-bold text-gris-dark uppercase tracking-wider mb-2 flex items-center justify-between">
                    <span>Tramos a liquidar ({tramosDelChofer.length})</span>
                    {ocultosPorRango > 0 && (
                      <span className="text-[10px] font-normal text-gris-mid italic">
                        {ocultosPorRango} fuera del rango
                      </span>
                    )}
                  </div>
                  <div className="bg-gris rounded-xl p-3 max-h-40 overflow-y-auto flex flex-col gap-1">
                    {tramosDelChofer.length === 0 && (
                      <span className="text-xs text-gris-mid italic">
                        Ningún tramo cae en el rango Desde/Hasta. Ajustá las fechas.
                      </span>
                    )}
                    {tramosDelChofer.map(t => {
                    const cantera  = (canteras as any[]).find(c => c.id === t.cantera_id)
                    const deposito = (depositos as any[]).find(d => d.id === t.deposito_id)
                    const fecha    = t.fecha_carga ?? t.fecha_vacio ?? ''
                    const km       = kmTramo(t, rutas as Ruta[])
                    // Origen → destino según tipo: cargado = cantera→depósito; vacío = depósito→cantera.
                    const esVacio  = t.tipo === 'vacio'
                    const origen   = esVacio ? (deposito?.nombre ?? `#${t.deposito_id}`) : (cantera?.nombre ?? `#${t.cantera_id}`)
                    const destino  = esVacio ? (cantera?.nombre ?? null) : (deposito?.nombre ?? null)
                    return (
                      <label key={t.id} className="flex items-center gap-2 cursor-pointer text-sm py-1 border-b border-gris-mid last:border-0">
                        <input
                          type="checkbox"
                          checked={selTramos.includes(t.id)}
                          onChange={e => setSelTramos(prev => e.target.checked ? [...prev, t.id] : prev.filter(x => x !== t.id))}
                          className="accent-azul"
                        />
                        <span className="flex-1 min-w-0">
                          {fecha ? fmtFecha(fecha) : '—'} ·{' '}
                          <b>{origen}</b>
                          {destino && <> → {destino}</>}
                          {km > 0 && <> · {km} km</>}
                          {t.cantera_id && t.deposito_id && km === 0 && (
                            <span className="ml-1 text-[10px] font-bold uppercase tracking-wide bg-amarillo/20 text-amber-700 px-1.5 py-0.5 rounded" title="No hay ruta cargada para este par punto de carga→depósito: el tramo aporta 0 km al liquidar.">⚠ sin ruta</span>
                          )}
                          {t.toneladas_carga && <> · {t.toneladas_carga} t</>}
                        </span>
                      </label>
                    )
                  })}
                  </div>
                </div>
              )
            })()}

            {/* Relevos del chofer (patas de tramos compartidos) — Fase 2 */}
            {(() => {
              const relevosDelChofer = relevos
                .filter(r => r.chofer_id === choferLiq.id && r.tramo)
                .filter(r => relevoEnRango(r, watchDesde, watchHasta))
              if (relevosDelChofer.length === 0) return null
              return (
                <div>
                  <div className="text-xs font-bold text-gris-dark uppercase tracking-wider mb-2">
                    🔄 Relevos a liquidar ({relevosDelChofer.length})
                  </div>
                  <div className="bg-azul-light/40 border border-azul/20 rounded-xl p-3 max-h-40 overflow-y-auto flex flex-col gap-1">
                    {relevosDelChofer.map(r => {
                      const t = r.tramo!
                      const cantera  = (canteras  as any[]).find(c => c.id === t.cantera_id)
                      const deposito = (depositos as any[]).find(d => d.id === t.deposito_id)
                      const fecha = fechaRelevo(r)
                      const km    = kmRelevo(r)
                      const esVacio = t.tipo === 'vacio'
                      const origen  = esVacio ? (deposito?.nombre ?? `#${t.deposito_id}`) : (cantera?.nombre ?? `#${t.cantera_id}`)
                      const destino = esVacio ? (cantera?.nombre ?? null) : (deposito?.nombre ?? null)
                      return (
                        <label key={r.id} className="flex items-center gap-2 cursor-pointer text-sm py-1 border-b border-azul/10 last:border-0">
                          <input
                            type="checkbox"
                            checked={selRelevos.includes(r.id)}
                            onChange={e => setSelRelevos(prev => e.target.checked ? [...prev, r.id] : prev.filter(x => x !== r.id))}
                            className="accent-azul"
                          />
                          <span className="flex-1 min-w-0">
                            {fecha ? fmtFecha(fecha) : '—'} ·{' '}
                            <b>{origen}</b>
                            {destino && <> → {destino}</>}
                            {' '}· <span className="text-azul-mid">pata: {km} km · {Number(r.jornales)} jornal{Number(r.jornales) !== 1 ? 'es' : ''}</span>
                          </span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

            {/* Adelantos */}
            {adelantosPendientes.filter(a => a.chofer_id === choferLiq.id).length > 0 && (
              <div>
                <div className="text-xs font-bold text-gris-dark uppercase tracking-wider mb-2">
                  Adelantos a descontar
                </div>
                <div className="bg-gris rounded-xl p-3 max-h-32 overflow-y-auto flex flex-col gap-1">
                  {adelantosPendientes.filter(a => a.chofer_id === choferLiq.id).map(a => (
                    <label key={a.id} className="flex items-center gap-2 cursor-pointer text-sm py-1 border-b border-gris-mid last:border-0">
                      <input
                        type="checkbox"
                        checked={selAdelant.includes(a.id)}
                        onChange={e => setSelAdelant(prev => e.target.checked ? [...prev, a.id] : prev.filter(x => x !== a.id))}
                        className="accent-azul"
                      />
                      <span>{fmtFecha(a.fecha)} · {a.descripcion || 'Adelanto'} · <b>{fmtM(a.monto)}</b></span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Reintegros (gastos pagados por el chofer) — Fase 3 */}
            {gastosReintegro.length > 0 && (
              <div>
                <div className="text-xs font-bold text-gris-dark uppercase tracking-wider mb-2">
                  🔁 Reintegros pendientes (gastos pagados por el chofer)
                </div>
                <div className="bg-naranja-light/40 border border-naranja/20 rounded-xl p-3 max-h-40 overflow-y-auto flex flex-col gap-1">
                  {gastosReintegro.map(g => (
                    <label key={g.id} className="flex items-center gap-2 cursor-pointer text-sm py-1 border-b border-naranja/10 last:border-0">
                      <input
                        type="checkbox"
                        checked={selGastos.includes(g.id)}
                        onChange={e => setSelGastos(prev => e.target.checked ? [...prev, g.id] : prev.filter(x => x !== g.id))}
                        className="accent-naranja"
                      />
                      <span className="flex-1 min-w-0 truncate">
                        {fmtFecha(g.fecha)} · <b>{g.categoria?.nombre ?? `cat#${g.categoria_id}`}</b>
                        {g.proveedor && <> · {g.proveedor}</>}
                        {g.comprobante_url && <> 📎</>}
                      </span>
                      <b className="font-mono text-naranja-dark">{fmtM(Number(g.monto))}</b>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Resumen */}
            <div className="bg-azul-light rounded-xl p-4">
              <div className="font-display text-lg tracking-wider text-azul mb-3">RESUMEN</div>
              <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 text-xs sm:text-sm">
                <span className="text-gris-dark">Días trabajados:</span>
                <span className="font-mono font-bold">{preview.dias} días</span>
                <span className="text-gris-dark">Básico ({preview.dias} días):</span>
                <span className="font-mono font-bold text-azul-mid">{fmtM(preview.subtotal_bas)}</span>
                {preview.km_cargados > 0 && (
                  <>
                    <span className="text-gris-dark">🚛 Km cargados × {fmtM(preview.precio_km_cargado)}:</span>
                    <span className="font-mono font-bold text-azul-mid">
                      {preview.km_cargados.toLocaleString('es-AR')} km · {fmtM(preview.subtotal_km_cargado)}
                    </span>
                  </>
                )}
                {preview.km_vacios > 0 && (
                  <>
                    <span className="text-gris-dark">🔲 Km vacíos × {fmtM(preview.precio_km_vacio)}:</span>
                    <span className="font-mono font-bold text-azul-mid">
                      {preview.km_vacios.toLocaleString('es-AR')} km · {fmtM(preview.subtotal_km_vacio)}
                    </span>
                  </>
                )}
                {preview.km_totales > 0 && (
                  <>
                    <span className="text-gris-dark border-t border-azul/10 pt-1">Subtotal km:</span>
                    <span className="font-mono font-bold text-azul-mid border-t border-azul/10 pt-1">{fmtM(preview.subtotal_km)}</span>
                  </>
                )}
                {preview.descuentos > 0 && (
                  <>
                    <span className="text-gris-dark">Adelantos:</span>
                    <span className="font-mono font-bold text-rojo">− {fmtM(preview.descuentos)}</span>
                  </>
                )}
                {preview.reintegros > 0 && (
                  <>
                    <span className="text-gris-dark">🔁 Reintegros gastos:</span>
                    <span className="font-mono font-bold text-naranja-dark">+ {fmtM(preview.reintegros)}</span>
                  </>
                )}
                <span className="font-bold text-azul border-t border-azul/20 pt-1.5">TOTAL NETO:</span>
                <span className={`font-mono font-bold text-lg border-t border-azul/20 pt-1.5 ${preview.neto >= 0 ? 'text-verde' : 'text-rojo'}`}>
                  {fmtM(preview.neto)}
                </span>
              </div>
            </div>

            <Input label="Observaciones" placeholder="Notas opcionales..." {...formLiq.register('obs')} />
          </div>
        )}
      </Modal>

      {/* ── Modal detalle / edición ── */}
      {detalleLiq && (() => {
        const chofer     = (choferes as Chofer[]).find(c => c.id === detalleLiq.chofer_id)
        const camion     = chofer ? (camiones as any[]).find(c => c.id === chofer.camion_id) : null
        const liqTramos  = (tramos as Tramo[]).filter(t => t.liquidacion_id === detalleLiq.id)
        const liqAdel    = (adelantos as Adelanto[]).filter(a => a.liquidacion_id === detalleLiq.id)
        const relevoLegs = legsRelevoLiquidados(detalleLiq.id)
        const esBorrador = detalleLiq.estado === 'borrador'

        // Cálculos derivados para mostrar el desglose completo (con patas de relevo).
        const km_cargados = liqTramos.filter(t => t.tipo === 'cargado').reduce((s, t) => s + kmTramo(t, rutas as Ruta[]), 0) + kmLegs(relevoLegs, 'cargado')
        const km_vacios   = liqTramos.filter(t => t.tipo === 'vacio').reduce((s, t) => s + kmTramo(t, rutas as Ruta[]), 0) + kmLegs(relevoLegs, 'vacio')
        const km_totales  = km_cargados + km_vacios
        const sub_km_cargado = detalleLiq.subtotal_km_cargado ?? (km_cargados * (chofer?.precio_km_cargado ?? 0))
        const sub_km_vacio   = detalleLiq.subtotal_km_vacio   ?? (km_vacios   * (chofer?.precio_km_vacio   ?? 0))

        function guardarLiqDto(data: any, onSuccess: () => void) {
          const basicoDia = parseFloat(data.basico_dia) || 0
          const dias      = detalleLiq.dias_trabajados
          const subtotal  = dias * basicoDia
          const desc      = liqAdel.reduce((s: number, a: Adelanto) => s + a.monto, 0)
          updateLiq({
            id: detalleLiq.id,
            dto: {
              basico_dia:      basicoDia,
              fecha_desde:     data.fecha_desde,
              fecha_hasta:     data.fecha_hasta,
              subtotal_basico: subtotal,
              total_neto:      subtotal - desc,
              obs:             data.obs,
            },
          }, { onSuccess, onError: () => toast('Error al actualizar', 'err') })
        }

        function handleGuardar(data: any) {
          guardarLiqDto(data, () => { toast('✓ Liquidación actualizada', 'ok'); setDetalleLiq(null) })
        }

        const handleLiquidarDetalle = formDetalle.handleSubmit((data: any) =>
          guardarLiqDto(data, () => cerrarLiq(detalleLiq.id, {
            onSuccess: () => { toast('✓ Liquidación cerrada', 'ok'); setDetalleLiq(null) },
          }))
        )

        return (
          <Modal
            open={!!detalleLiq}
            onClose={() => setDetalleLiq(null)}
            title={`${esBorrador ? '✏️ EDITAR' : '🔍 DETALLE'} LIQUIDACIÓN N° ${detalleLiq.id}`}
            width="max-w-3xl"
            footer={
              <>
                <Button variant="secondary" onClick={() => setDetalleLiq(null)}>Cerrar</Button>
                {!esBorrador && (
                  <Button variant="ghost" onClick={() => {
                    if (!confirm('¿Reabrir la liquidación? Volverá a estado borrador y los tramos/adelantos quedarán disponibles para editar.')) return
                    reabrirLiq(detalleLiq.id, {
                      onSuccess: () => { toast('✓ Liquidación reabierta', 'ok'); setDetalleLiq(null) },
                      onError:   (err: any) => toast(err?.message || 'Error al reabrir', 'err'),
                    })
                  }}>
                    🔓 Reabrir
                  </Button>
                )}
                {esBorrador && (
                  <Button variant="ghost" loading={updating} onClick={formDetalle.handleSubmit(handleGuardar)}>
                    Guardar
                  </Button>
                )}
                {esBorrador && (
                  <Button variant="primary" loading={updating} onClick={handleLiquidarDetalle}>
                    💰 Liquidar
                  </Button>
                )}
              </>
            }
          >
            <div className="flex flex-col gap-4">
              {/* Header con info principal + accesos rápidos a export */}
              <div className="bg-azul-light rounded-xl px-4 py-3 flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-azul text-base">{chofer?.nombre ?? '—'}</span>
                    <Badge
                      variant={esBorrador ? 'pendiente' : 'cerrado'}
                      label={esBorrador ? 'Borrador' : 'Cerrada'}
                    />
                  </div>
                  {chofer?.cuil && (
                    <div className="text-xs text-azul-mid mt-0.5 font-mono">CUIL {chofer.cuil}</div>
                  )}
                  {camion?.patente && (
                    <div className="text-xs text-azul-mid mt-0.5">🚚 Camión: <span className="font-mono font-bold">{camion.patente}</span></div>
                  )}
                  <div className="text-xs text-azul-mid mt-0.5">
                    📅 {fmtFecha(detalleLiq.fecha_desde)} → {fmtFecha(detalleLiq.fecha_hasta)} · <b>{detalleLiq.dias_trabajados} días</b> · {fmtM(detalleLiq.basico_dia)}/día
                  </div>
                </div>
                {!esBorrador && (
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => {
                      const liqTramosLocal = liqTramos
                      handleDescargarExcelCerrada(detalleLiq, {
                        nombreChofer: chofer?.nombre ?? '—',
                        desde:        detalleLiq.fecha_desde,
                        hasta:        detalleLiq.fecha_hasta,
                        dias:         detalleLiq.dias_trabajados,
                        basico_dia:   detalleLiq.basico_dia,
                        subtotal_bas: detalleLiq.subtotal_basico ?? 0,
                        km_totales:   km_totales,
                        subtotal_km:  detalleLiq.subtotal_km ?? 0,
                        descuentos:   detalleLiq.total_adelantos,
                        neto:         detalleLiq.total_neto,
                        tramos:       liqTramosLocal,
                        relevos:      relevoLegs,
                        adelantos:    liqAdel,
                        canteras:     canteras as any[],
                        depositos:    depositos as any[],
                        rutas:        rutas as Ruta[],
                        estado:       'Cerrada',
                      })
                    }}>📊 Excel</Button>
                    <Button variant="primary" size="sm" onClick={() => handleDescargarPdfCerrada(detalleLiq)}>
                      📄 PDF
                    </Button>
                  </div>
                )}
              </div>

              {/* Si es borrador, fecha y básico son editables */}
              {esBorrador && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Input label="Básico/día ($)" type="number" step="100" {...formDetalle.register('basico_dia')} />
                  <Input label="Período desde" type="date" {...formDetalle.register('fecha_desde')} />
                  <Input label="Período hasta"  type="date" {...formDetalle.register('fecha_hasta')} />
                </div>
              )}

              {/* Tramos con detalle completo (+ patas de relevo) */}
              {(liqTramos.length > 0 || relevoLegs.length > 0) && (
                <div>
                  <div className="text-xs font-bold text-gris-dark uppercase tracking-wider mb-2">
                    Tramos incluidos ({liqTramos.length + relevoLegs.length}) · {fmtN(km_totales)} km totales
                  </div>
                  <div className="bg-gris rounded-xl divide-y divide-gris-mid max-h-56 overflow-y-auto">
                    {liqTramos.map(t => {
                      const cantera  = (canteras  as any[]).find(c => c.id === t.cantera_id)
                      const deposito = (depositos as any[]).find(d => d.id === t.deposito_id)
                      const fecha    = t.fecha_carga ?? t.fecha_vacio ?? null
                      const km       = kmTramo(t, rutas as Ruta[])
                      const ton      = t.toneladas_descarga ?? t.toneladas_carga
                      return (
                        <div key={t.id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${t.tipo === 'cargado' ? 'bg-naranja-light text-naranja-dark' : 'bg-azul-light text-azul-mid'}`}>
                                {t.tipo === 'cargado' ? '🚛 Cargado' : '🔲 Vacío'}
                              </span>
                              <span className="text-gris-dark">{fecha ? fmtFecha(fecha) : '—'}</span>
                            </div>
                            <div className="font-semibold text-carbon mt-0.5">
                              {t.tipo === 'vacio'
                                ? <>{deposito?.nombre ?? '—'} → {cantera?.nombre ?? '—'}</>
                                : <>{cantera?.nombre ?? '—'} → {deposito?.nombre ?? '—'}</>}
                            </div>
                            {(t.remito_carga || t.remito_descarga) && (
                              <div className="text-[11px] text-gris-mid mt-0.5">
                                Remito: {t.remito_carga ?? t.remito_descarga}
                              </div>
                            )}
                          </div>
                          <div className="text-right shrink-0 font-mono">
                            <div>{km > 0 ? `${fmtN(km)} km` : '—'}</div>
                            {ton != null && <div className="text-gris-dark text-[11px]">{ton} tn</div>}
                          </div>
                        </div>
                      )
                    })}
                    {relevoLegs.map((l, i) => (
                      <div key={`rl-${i}`} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide bg-azul-light text-azul-mid">
                              🔄 {l.tipo === 'cargado' ? 'Cargado' : 'Vacío'} · relevo
                            </span>
                            <span className="text-gris-dark">{l.fecha ? fmtFecha(l.fecha) : '—'}</span>
                          </div>
                          <div className="font-semibold text-carbon mt-0.5">
                            {l.tipo === 'vacio'
                              ? <>{l.deposito ?? '—'} → {l.cantera ?? '—'}</>
                              : <>{l.cantera ?? '—'} → {l.deposito ?? '—'}</>}
                          </div>
                        </div>
                        <div className="text-right shrink-0 font-mono">
                          <div>{l.km > 0 ? `${fmtN(l.km)} km` : '—'}</div>
                          <div className="text-gris-dark text-[11px]">pata</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Adelantos */}
              {liqAdel.length > 0 && (
                <div>
                  <div className="text-xs font-bold text-gris-dark uppercase tracking-wider mb-2">
                    Adelantos descontados ({liqAdel.length})
                  </div>
                  <div className="bg-gris rounded-xl divide-y divide-gris-mid max-h-32 overflow-y-auto">
                    {liqAdel.map((a: Adelanto) => (
                      <div key={a.id} className="flex justify-between text-xs px-3 py-2">
                        <span className="text-gris-dark">{fmtFecha(a.fecha)} · {a.descripcion || 'Adelanto'}</span>
                        <span className="font-mono font-semibold text-rojo shrink-0">− {fmtM(a.monto)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Gastos del chofer (reintegros) — fetch on-demand */}
              <div>
                <div className="text-xs font-bold text-gris-dark uppercase tracking-wider mb-2">
                  Gastos del chofer (reintegros)
                  {detalleGastos.length > 0 && ` (${detalleGastos.length})`}
                </div>
                {loadingDetalleGastos ? (
                  <div className="bg-gris rounded-xl p-3 text-xs text-gris-dark">Cargando…</div>
                ) : detalleGastos.length === 0 ? (
                  <div className="bg-gris rounded-xl p-3 text-xs text-gris-mid italic">
                    Sin gastos asociados a esta liquidación.
                  </div>
                ) : (
                  <div className="bg-gris rounded-xl divide-y divide-gris-mid max-h-40 overflow-y-auto">
                    {detalleGastos.map((g: any) => (
                      <div key={g.id} className="flex items-start justify-between gap-3 px-3 py-2 text-xs">
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-carbon truncate">
                            {g.categoria?.nombre ?? '—'}
                            {g.proveedor && <span className="ml-1 text-gris-dark">· {g.proveedor}</span>}
                          </div>
                          <div className="text-[11px] text-gris-dark mt-0.5">
                            {fmtFecha(g.fecha)}
                            {g.descripcion && ` · ${g.descripcion}`}
                          </div>
                        </div>
                        <span className="font-mono font-semibold text-verde shrink-0">+ {fmtM(Number(g.monto))}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Resumen detallado con desglose por tipo de km */}
              <div className="bg-azul-light rounded-xl p-4">
                <div className="grid grid-cols-2 gap-y-1.5 text-sm">
                  <span className="text-gris-dark">Días trabajados ({detalleLiq.dias_trabajados}) × {fmtM(detalleLiq.basico_dia)}:</span>
                  <span className="font-mono font-bold text-right">{fmtM(detalleLiq.subtotal_basico)}</span>

                  {km_cargados > 0 && (
                    <>
                      <span className="text-gris-dark">Km cargados ({fmtN(km_cargados)}) × {fmtM(chofer?.precio_km_cargado ?? 0)}:</span>
                      <span className="font-mono text-right">{fmtM(sub_km_cargado)}</span>
                    </>
                  )}
                  {km_vacios > 0 && (
                    <>
                      <span className="text-gris-dark">Km vacíos ({fmtN(km_vacios)}) × {fmtM(chofer?.precio_km_vacio ?? 0)}:</span>
                      <span className="font-mono text-right">{fmtM(sub_km_vacio)}</span>
                    </>
                  )}

                  {detalleLiq.total_adelantos > 0 && (
                    <>
                      <span className="text-gris-dark">− Adelantos:</span>
                      <span className="font-mono font-bold text-right text-rojo">− {fmtM(detalleLiq.total_adelantos)}</span>
                    </>
                  )}
                  {detalleLiq.total_reintegros > 0 && (
                    <>
                      <span className="text-gris-dark">+ Reintegros (gastos chofer):</span>
                      <span className="font-mono font-bold text-right text-verde">+ {fmtM(detalleLiq.total_reintegros)}</span>
                    </>
                  )}

                  <span className="font-bold text-azul border-t border-azul/20 pt-1.5">TOTAL NETO:</span>
                  <span className="font-mono font-bold text-lg text-verde border-t border-azul/20 pt-1.5 text-right">
                    {fmtM(detalleLiq.total_neto)}
                  </span>
                </div>
              </div>

              {!esBorrador && (
                <LiquidacionAdjuntosSection liqId={detalleLiq.id} />
              )}

              {esBorrador && (
                <Input label="Observaciones" {...formDetalle.register('obs')} />
              )}
              {!esBorrador && detalleLiq.obs && (
                <p className="text-xs text-gris-dark italic">{detalleLiq.obs}</p>
              )}
            </div>
          </Modal>
        )
      })()}

      {/* ── Modal editar adelanto ── */}
      <Modal
        open={!!editandoAdel}
        onClose={() => { setEditandoAdel(null); setArchivoEditAdel(null); setRemoverCompEdit(false) }}
        title="✏️ EDITAR ADELANTO"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setEditandoAdel(null); setArchivoEditAdel(null); setRemoverCompEdit(false) }}>Cancelar</Button>
            <Button variant="primary" loading={updatingAdel || subiendoComp} onClick={formEditAdel.handleSubmit(async (data: any) => {
              if (!editandoAdel) return
              try {
                let comprobantePatch: { comprobante_path: string | null } | {} = {}
                if (archivoEditAdel) {
                  setSubiendoComp(true)
                  const path = await uploadComprobanteAdelanto(archivoEditAdel)
                  comprobantePatch = { comprobante_path: path }
                } else if (removerCompEdit) {
                  comprobantePatch = { comprobante_path: null }
                }
                updateAdel({
                  id: editandoAdel.id,
                  dto: { fecha: data.fecha, monto: Number(data.monto), descripcion: data.descripcion, ...comprobantePatch },
                }, {
                  onSuccess: () => {
                    toast('✓ Adelanto actualizado', 'ok')
                    setEditandoAdel(null)
                    setArchivoEditAdel(null)
                    setRemoverCompEdit(false)
                  },
                  onError: (err: any) => {
                    const code = err?.body?.error
                    if (code === 'COMPROBANTE_DUPLICADO') toast('Ese comprobante ya está cargado en otro adelanto', 'err')
                    else toast('Error al actualizar', 'err')
                  },
                })
              } catch (e: any) {
                toast(e?.message || 'Error al subir el comprobante', 'err')
              } finally {
                setSubiendoComp(false)
              }
            })}>{subiendoComp ? '⬆ Subiendo…' : '✓ Guardar'}</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input label="Fecha" type="date" {...formEditAdel.register('fecha')} />
          <Input label="Monto ($)" type="number" step="100" {...formEditAdel.register('monto')} />
          <Input label="Descripción" placeholder="Ej: Adelanto semana del 10/3" {...formEditAdel.register('descripcion')} />

          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-gris-dark uppercase tracking-wider">Comprobante</label>
            {editandoAdel?.comprobante_url && !removerCompEdit && !archivoEditAdel && (
              <div className="flex items-center gap-2 text-xs text-gris-dark">
                <button type="button" onClick={() => verComprobanteAdel(editandoAdel.id)} className="font-bold text-azul hover:underline">
                  👁 Ver comprobante actual
                </button>
                <button type="button" onClick={() => setRemoverCompEdit(true)} className="text-rojo hover:underline">
                  Quitar
                </button>
              </div>
            )}
            {removerCompEdit && (
              <div className="flex items-center gap-2 text-xs text-rojo">
                <span>⚠ Se eliminará el comprobante al guardar.</span>
                <button type="button" onClick={() => setRemoverCompEdit(false)} className="text-azul hover:underline">Cancelar</button>
              </div>
            )}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={(e) => { setArchivoEditAdel(e.target.files?.[0] ?? null); setRemoverCompEdit(false) }}
              className="text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-azul-light file:text-azul file:font-bold hover:file:bg-azul hover:file:text-white file:cursor-pointer"
            />
            {archivoEditAdel && (
              <div className="flex items-center gap-2 text-xs text-gris-dark mt-1">
                <span>📎 Nuevo: {archivoEditAdel.name}</span>
                <button type="button" onClick={() => setArchivoEditAdel(null)} className="text-rojo hover:underline">Cancelar</button>
              </div>
            )}
            <p className="text-[11px] text-gris-mid italic">Subir uno nuevo lo reemplaza. Máx 10 MB.</p>
          </div>
        </div>
      </Modal>

      {/* ── Modal adelanto ── */}
      <Modal
        open={modalAdel}
        onClose={() => { setModalAdel(false); setArchivoAdel(null) }}
        title="💵 REGISTRAR ADELANTO"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setModalAdel(false); setArchivoAdel(null) }}>Cancelar</Button>
            <Button variant="primary" loading={creatingAdel || subiendoComp} onClick={formAdel.handleSubmit(handleCreateAdel)}>
              {subiendoComp ? '⬆ Subiendo…' : '✓ Guardar'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Combobox
              label="Chofer"
              placeholder="Buscar chofer..."
              options={(choferes as Chofer[]).map(c => ({ value: String(c.id), label: c.nombre }))}
              value={String(formAdel.watch('chofer_id') ?? '')}
              onChange={(v: string) => formAdel.setValue('chofer_id', v)}
            />
            <Input label="Fecha" type="date" {...formAdel.register('fecha')} />
          </div>
          <Input label="Monto ($)" type="number" step="100" placeholder="0" {...formAdel.register('monto')} />
          <Input label="Descripción" placeholder="Ej: Adelanto semana del 10/3" {...formAdel.register('descripcion')} />

          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-gris-dark uppercase tracking-wider">
              Comprobante (opcional)
            </label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={(e) => setArchivoAdel(e.target.files?.[0] ?? null)}
              className="text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-azul-light file:text-azul file:font-bold hover:file:bg-azul hover:file:text-white file:cursor-pointer"
            />
            {archivoAdel && (
              <div className="flex items-center gap-2 text-xs text-gris-dark mt-1">
                <span>📎 {archivoAdel.name} · {(archivoAdel.size / 1024).toFixed(0)} KB</span>
                <button type="button" onClick={() => setArchivoAdel(null)} className="text-rojo hover:underline">Quitar</button>
              </div>
            )}
            <p className="text-[11px] text-gris-mid italic">Foto o PDF del recibo / transferencia. Máx 10 MB.</p>
          </div>
        </div>
      </Modal>

      {/* ── Modal confirmar eliminación de liquidación cerrada ── */}
      {confirmDelLiq && (() => {
        const numeroOk  = confirmDelNumero.trim() === String(confirmDelLiq.id)
        const motivoOk  = confirmDelMotivo.trim().length >= 10
        const puedeOk   = numeroOk && motivoOk
        const liqTramosCount = (tramos as Tramo[]).filter(t => t.liquidacion_id === confirmDelLiq.id).length
        const liqAdelCount   = (adelantos as Adelanto[]).filter(a => a.liquidacion_id === confirmDelLiq.id).length
        return (
          <Modal
            open
            onClose={() => setConfirmDelLiq(null)}
            title="🗑 ELIMINAR LIQUIDACIÓN"
            width="max-w-lg"
            footer={
              <>
                <Button variant="secondary" onClick={() => setConfirmDelLiq(null)}>Cancelar</Button>
                <Button
                  variant="primary"
                  disabled={!puedeOk}
                  onClick={() => {
                    deleteLiq(
                      { id: confirmDelLiq.id, motivo: confirmDelMotivo.trim() },
                      {
                        onSuccess: () => {
                          toast('✓ Liquidación eliminada — tramos liberados', 'ok')
                          setConfirmDelLiq(null)
                          setDetalleLiq(null)
                        },
                        onError: (err: any) => toast(err?.message ?? 'Error al eliminar', 'err'),
                      },
                    )
                  }}
                >
                  🗑 Eliminar definitivamente
                </Button>
              </>
            }
          >
            <div className="flex flex-col gap-4">
              <div className="bg-rojo-light border border-rojo/30 rounded-xl p-3 text-sm text-rojo">
                <div className="font-bold mb-1">⚠ Esta acción no se puede deshacer.</div>
                <div className="text-xs">
                  Al eliminar la liquidación <b>N° {confirmDelLiq.id}</b> ({fmtM(confirmDelLiq.total_neto)}):
                </div>
                <ul className="text-xs mt-2 space-y-0.5 ml-4 list-disc">
                  <li>Los <b>{liqTramosCount} tramo{liqTramosCount !== 1 ? 's' : ''}</b> volverán al saldo corriente.</li>
                  <li>Los <b>{liqAdelCount} adelanto{liqAdelCount !== 1 ? 's' : ''}</b> quedarán pendientes de descontar.</li>
                  <li>Los <b>gastos del chofer</b> volverán a estar disponibles para reintegrar.</li>
                </ul>
              </div>

              <div>
                <label className="text-xs font-bold text-gris-dark uppercase tracking-wider block mb-1">
                  Para confirmar, escribí el número de la liquidación: <b>{confirmDelLiq.id}</b>
                </label>
                <Input
                  type="text"
                  placeholder={String(confirmDelLiq.id)}
                  value={confirmDelNumero}
                  onChange={e => setConfirmDelNumero(e.target.value)}
                  autoFocus
                />
                {confirmDelNumero && !numeroOk && (
                  <div className="text-[11px] text-rojo mt-1">No coincide con el número de la liquidación.</div>
                )}
              </div>

              <div>
                <label className="text-xs font-bold text-gris-dark uppercase tracking-wider block mb-1">
                  Motivo de la eliminación <span className="text-rojo">*</span>
                </label>
                <Input
                  type="text"
                  placeholder="Ej: Liquidé al chofer equivocado, hay que rehacerla"
                  value={confirmDelMotivo}
                  onChange={e => setConfirmDelMotivo(e.target.value)}
                />
                <div className="text-[11px] text-gris-mid mt-1">
                  {confirmDelMotivo.trim().length < 10
                    ? `Faltan ${10 - confirmDelMotivo.trim().length} caracteres (mínimo 10).`
                    : '✓ Suficiente. El motivo queda registrado en auditoría.'}
                </div>
              </div>
            </div>
          </Modal>
        )
      })()}

      <ModalSolicitudTransferencia open={modalTransf} onClose={() => setModalTransf(false)} />
    </>
  )
}
