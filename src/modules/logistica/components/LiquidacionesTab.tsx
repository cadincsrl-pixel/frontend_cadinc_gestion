'use client'

import { useState, useEffect } from 'react'
import {
  useLiquidaciones, useAdelantos, useChoferes, useCamiones, useTramos, useRutas, useCanteras, useDepositos,
  useCreateLiquidacion, useUpdateLiquidacion, useCerrarLiquidacion, useReabrirLiquidacion, useDeleteLiquidacion,
  useAnularLiquidacion,
  useCreateAdelanto, useUpdateAdelanto, useDeleteAdelanto, useSetTarifasChofer,
  useEstadias, useCreateEstadia, useDeleteEstadia,
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
import { generarReciboAdelanto } from '@/lib/utils/recibo-adelanto-pdf'
import { LiquidacionAdjuntosSection } from './LiquidacionAdjuntosSection'
import { ModalSolicitudTransferencia } from './ModalSolicitudTransferencia'
import { apiGet } from '@/lib/api/client'
import { usePermisos } from '@/hooks/usePermisos'
import type { ChoferConHist } from '@/lib/utils/tarifas-chofer'
import { abrirAdjuntoFirmado } from '@/lib/utils/abrir-adjunto'
import type { Chofer, Tramo, Adelanto, AdelantoFormaPago, Estadia, Ruta, RelevoPendiente, RelevoLiquidado, CerrarLiquidacionResp } from '@/types/domain.types'
import { exportLiquidacionExcel } from '@/lib/utils/liquidacion-export'
import { toISO } from '@/lib/utils/dates'
import {
  diasEntreFechas, fechaTramo, tramoEnRango, kmTramo,
  fechaRelevo, kmRelevo, relevoEnRango, rangoConRelevos, diasConRelevos,
  calcularTotalesLiquidacion,
} from '../utils/liquidacion-math'

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

// Los helpers de fechas/km/relevos y la fórmula del neto viven en
// ../utils/liquidacion-math (módulo puro, testeado en
// src/__tests__/liquidacion-math.test.ts).

// Aviso previo al cierre cuando el neto da NEGATIVO: al cerrar, el backend
// crea un adelanto automático por ese importe (deuda del chofer) para que la
// próxima liquidación lo descuente. Devuelve false si el usuario cancela.
// El neto que se pasa acá tiene que ser EXACTAMENTE el que se va a persistir.
function confirmarNetoNegativo(neto: number): boolean {
  if (neto >= 0) return true
  const deuda = fmtM(Math.abs(neto))
  return window.confirm(
    `⚠ El total neto da NEGATIVO: ${fmtM(neto)}\n\n` +
    `El chofer recibió ${deuda} más de lo que generó en este período.\n\n` +
    `Si cerrás la liquidación, el sistema va a crear automáticamente un ADELANTO ` +
    `de ${deuda} con la fecha de hoy, y se lo va a descontar solo en la próxima ` +
    `liquidación del chofer.\n\n` +
    `¿Cerrar igual?`,
  )
}

// Toast de cierre: menciona el adelanto automático si el backend lo creó.
function mensajeCierre(resp: CerrarLiquidacionResp | undefined | null): string {
  const ad = resp?.adelanto_saldo
  if (!ad) return '✓ Liquidación cerrada'
  return `✓ Liquidación cerrada · adelanto de ${fmtM(Number(ad.monto))} creado para la próxima`
}

// Mensaje de error de cerrar/reabrir/eliminar/borrar adelanto. Los casos 409
// nuevos giran alrededor del adelanto automático que deja un cierre en negativo.
// El backend manda { error: <código>, detail: <id de la liquidación involucrada> }.
function msgErrorLiq(err: unknown, fallback: string): string {
  const e = err as { body?: { error?: string; detail?: unknown }; message?: string } | null | undefined
  const code = e?.body?.error ?? e?.message
  const otra = e?.body?.detail ?? '—'
  switch (code) {
    // La deuda que dejó esta liquidación ya se descontó en otra liquidación
    // CERRADA: hay que deshacer esa primero (aparece en el Historial).
    case 'SALDO_NEGATIVO_YA_LIQUIDADO':
      return `No se puede: la deuda que dejó esta liquidación ya se descontó en la liquidación N° ${otra}. `
        + `Buscá la N° ${otra} en el Historial, reabrila, y recién ahí volvé a intentar.`
    // Mismo caso, pero la que consumió la deuda quedó en BORRADOR: no se puede
    // reabrir (ya está abierta) ni aparece en el Historial. Se elimina desde
    // la card del chofer en "Saldo corriente por chofer".
    case 'SALDO_NEGATIVO_EN_BORRADOR':
      return `No se puede: la deuda que dejó esta liquidación ya la tomó un borrador (liquidación N° ${otra}) del mismo chofer. `
        + `Ese borrador no está en el Historial: eliminalo desde la tarjeta del chofer en "Saldo corriente por chofer" y volvé a intentar.`
    // Cerrar un borrador sin nada adentro dejaba una cáscara 'cerrada' con los
    // subtotales intactos que los reportes contaban como plata real (pasó el
    // 2026-07-26 con las liq 23 y 25: $10.538.550 de mano de obra fantasma).
    case 'LIQUIDACION_VACIA':
      return 'Esta liquidación no tiene ningún viaje, adelanto, gasto ni estadía adentro, así que no se puede cerrar. '
        + 'Si querés descartarla, eliminá el borrador con el 🗑.'
    // ── Anulación (migración 20260729e) ──
    // Tiene contenido: anularla dejaría esos viajes/adelantos/gastos marcados
    // como liquidados contra una liquidación nula, fuera del saldo del chofer y
    // fuera de cualquier reliquidación. El camino correcto es reabrir.
    case 'LIQUIDACION_CON_CONTENIDO':
      return 'Esta liquidación tiene viajes, adelantos o gastos adentro, así que no se anula: '
        + 'reabrila (eso los libera) y después eliminá el borrador.'
    case 'LIQUIDACION_CON_SALDO_ARRASTRADO':
      return 'Esta liquidación dejó una deuda arrastrada al próximo período. Reabrila primero '
        + '— la reapertura borra ese adelanto — y recién ahí anulala.'
    case 'LIQUIDACION_NO_CERRADA':
      return 'Sólo se anula una liquidación cerrada. Si es un borrador, eliminalo con el 🗑.'
    case 'MOTIVO_REQUERIDO':
      return 'Hace falta el motivo de la anulación.'
    // Intento de borrar a mano el adelanto automático de un cierre en negativo.
    case 'ADELANTO_DE_SALDO':
      return `Este adelanto no se borra a mano: es la deuda que dejó la liquidación N° ${otra} al cerrar en negativo. `
        + `Para anularla, reabrí la liquidación N° ${otra} — el adelanto se borra solo.`
  }
  return e?.message || fallback
}

// Datos del form del modal de detalle (useForm<any> heredado; al menos acá
// tipamos lo que realmente se lee).
interface DetalleFormData {
  basico_dia?:  string | number
  fecha_desde?: string
  fecha_hasta?: string
  obs?:         string
}

export function LiquidacionesTab() {
  const toast = useToast()
  const { data: liquidaciones = [] } = useLiquidaciones()
  const { data: adelantos     = [] } = useAdelantos()
  const { data: estadias      = [] } = useEstadias()
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
  const { mutate: anularLiqMut, isPending: anulando } = useAnularLiquidacion()
  // Anular saca una liquidación de circulación: va con permiso de eliminación,
  // no de actualización.
  const { puedeEliminar } = usePermisos('logistica')
  const { mutate: createAdel,  isPending: creatingAdel } = useCreateAdelanto()
  const { mutate: updateAdel,  isPending: updatingAdel } = useUpdateAdelanto()
  const { mutate: deleteAdel  } = useDeleteAdelanto()
  const { mutate: createEst,   isPending: creatingEst  } = useCreateEstadia()
  const { mutate: deleteEst   } = useDeleteEstadia()
  const { mutate: setTarifasChofer, isPending: savingTarifas } = useSetTarifasChofer()

  const [modalLiq,    setModalLiq]    = useState(false)
  const [choferLiq,   setChoferLiq]   = useState<Chofer | null>(null)
  const [selAdelant,  setSelAdelant]  = useState<number[]>([])
  const [selTramos,   setSelTramos]   = useState<number[]>([])
  const [selRelevos,  setSelRelevos]  = useState<number[]>([])
  const [selGastos,   setSelGastos]   = useState<number[]>([])
  const [selEstadias, setSelEstadias] = useState<number[]>([])
  const [modalAdel,   setModalAdel]   = useState(false)
  const [modalEst,    setModalEst]    = useState(false)
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
  // Anulación de una liquidación cerrada que quedó vacía (cáscara).
  const [anularLiq, setAnularLiq]       = useState<any | null>(null)
  const [anularMotivo, setAnularMotivo] = useState('')
  const [confirmDelNumero, setConfirmDelNumero] = useState('')
  const [confirmDelMotivo, setConfirmDelMotivo] = useState('')

  // Filtros + agrupación de la sección "Adelantos pendientes".
  const [filtChoferAdel,  setFiltChoferAdel]  = useState<string>('')          // '' = todos
  const [filtEstadoAdel,  setFiltEstadoAdel]  = useState<'pendientes' | 'liquidados' | 'todos'>('pendientes')
  const [filtDesdeAdel,   setFiltDesdeAdel]   = useState<string>('')
  const [filtHastaAdel,   setFiltHastaAdel]   = useState<string>('')
  const [filtSearchAdel,  setFiltSearchAdel]  = useState<string>('')
  const [expandedChoferes, setExpandedChoferes] = useState<Set<number>>(new Set())

  // Mismos filtros + agrupación para "Estadías": antes era una lista plana con
  // las pendientes y las ya liquidadas mezcladas, imposible de leer al crecer.
  const [filtChoferEst,  setFiltChoferEst]  = useState<string>('')
  const [filtEstadoEst,  setFiltEstadoEst]  = useState<'pendientes' | 'liquidadas' | 'todas'>('pendientes')
  const [filtDesdeEst,   setFiltDesdeEst]   = useState<string>('')
  const [filtHastaEst,   setFiltHastaEst]   = useState<string>('')
  const [filtSearchEst,  setFiltSearchEst]  = useState<string>('')
  const [expandedChoferesEst, setExpandedChoferesEst] = useState<Set<number>>(new Set())
  // Historial de liquidaciones cerradas: colapsado por default para no ocupar
  // tanto espacio (puede crecer mucho con el tiempo).
  const [historialAbierto, setHistorialAbierto] = useState(false)
  // Comprobante (foto/PDF) para el adelanto que se está creando/editando.
  const [archivoAdel, setArchivoAdel] = useState<File | null>(null)
  const [archivoEditAdel, setArchivoEditAdel] = useState<File | null>(null)
  const [removerCompEdit, setRemoverCompEdit] = useState(false)
  const [subiendoComp, setSubiendoComp] = useState(false)

  const formAdel    = useForm<any>()
  const formEst     = useForm<any>()
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
  // o refetch por cambio de fecha) Y al reabrir el modal. Si el user destildó
  // alguno manualmente, este efecto lo vuelve a tildar — trade-off a favor del
  // flujo típico "todos los reintegros van en esta liquidación".
  // `modalLiq` en las deps es clave: al reabrir el modal del MISMO chofer,
  // abrirLiquidar vacía selGastos pero ni el chofer ni la lista cambian, así
  // que sin esto quedaban todos destildados y el neto perdía los reintegros
  // (caso Zelarayán 2026-07-26: faltaban $100.990 en el preview).
  const reintegroIdsKey = gastosReintegro.map(g => g.id).join(',')
  useEffect(() => {
    if (choferLiq && modalLiq) setSelGastos(gastosReintegro.map(g => g.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reintegroIdsKey, choferLiq?.id, modalLiq])

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

  // ¿El km de este tramo sale de una ruta que sugirió Google y nadie verificó?
  // Se paga igual — el aviso es para que se sepa antes de cerrar, no para frenar.
  function rutaSinVerificar(t: Tramo): boolean {
    if (!t.cantera_id || !t.deposito_id) return false
    const r = (rutas as Ruta[]).find(x => x.cantera_id === t.cantera_id && x.deposito_id === t.deposito_id)
    return r?.verificada === false
  }
  const adelantosPendientes = (adelantos as Adelanto[]).filter(a => !a.liquidacion_id)
  // Estadías (días de espera para cargar/descargar, pagados por día): mismo
  // ciclo que los adelantos — pendientes hasta que una liquidación las incluye.
  const estadiasPendientes  = (estadias as Estadia[]).filter(e => !e.liquidacion_id)
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
    const mis_estadias    = estadiasPendientes.filter(e => e.chofer_id === chofer.id)
    const sinBasico     = !chofer.basico_dia
    // Básico: días del rango completo (tramos propios + relevos), restando los
    // días cubiertos sólo por relevos y sumando Σ jornales del relevo (cada
    // chofer cobra su jornal, sin duplicar el día). Ver diasConRelevos.
    // OJO: la base debe salir del MISMO rango que usa calcularPreview
    // (rangoConRelevos); usar el span de tramos propios acá daba 1 día menos
    // cuando el relevo caía fuera de ese span (caso Zelarayán 2026-07-26).
    const { desde: rDesde, hasta: rHasta } = rangoConRelevos(mis_tramos, mis_relevos)
    const baseDias      = diasEntreFechas(rDesde, rHasta)
    const ownDates      = new Set(mis_tramos.map(fechaTramo).filter(Boolean) as string[])
    const dias          = diasConRelevos(baseDias, rDesde, rHasta, ownDates, mis_relevos)
    const subtotal_bas  = dias * (chofer.basico_dia ?? 0)
    // Km: tramos propios (km de ruta completa) + patas de relevo (km de la fila).
    const km_cargados = mis_tramos.filter(t => t.tipo === 'cargado').reduce((s, t) => s + kmTramo(t, rutas as Ruta[]), 0)
      + mis_relevos.filter(r => r.tramo!.tipo === 'cargado').reduce((s, r) => s + kmRelevo(r), 0)
    const km_vacios = mis_tramos.filter(t => t.tipo === 'vacio').reduce((s, t) => s + kmTramo(t, rutas as Ruta[]), 0)
      + mis_relevos.filter(r => r.tramo!.tipo === 'vacio').reduce((s, r) => s + kmRelevo(r), 0)
    const descuentos    = mis_adelantos.reduce((s, a) => s + a.monto, 0)
    const reintegros    = mis_reintegros.reduce((s, g) => s + Number(g.monto), 0)
    const total_estadias = mis_estadias.reduce((s, e) => s + Number(e.total), 0)
    // Fórmula canónica compartida con calcularPreview (y testeada).
    const tot = calcularTotalesLiquidacion({
      dias, basico_dia: chofer.basico_dia ?? 0,
      km_cargados, precio_km_cargado: chofer.precio_km_cargado ?? 0,
      km_vacios,   precio_km_vacio:   chofer.precio_km_vacio ?? 0,
      descuentos, reintegros, total_estadias,
    })
    const km_totales          = tot.km_totales
    const subtotal_km_cargado = tot.subtotal_km_cargado
    const subtotal_km_vacio   = tot.subtotal_km_vacio
    const subtotal_km         = tot.subtotal_km
    const subtotal            = subtotal_bas + subtotal_km
    const saldo               = tot.neto
    return {
      mis_tramos, mis_relevos, mis_adelantos, mis_reintegros, mis_estadias, dias, sinBasico, subtotal_bas,
      km_cargados, km_vacios, km_totales,
      subtotal_km_cargado, subtotal_km_vacio, subtotal_km,
      subtotal, descuentos, reintegros, total_estadias, saldo,
    }
  }

  function abrirLiquidar(chofer: Chofer) {
    setChoferLiq(chofer)
    const mis_tramos  = tramosPendientes.filter(t => t.chofer_id === chofer.id)
    const mis_relevos = relevos.filter(r => r.chofer_id === chofer.id && r.tramo)
    setSelTramos(mis_tramos.map(t => t.id))
    setSelRelevos(mis_relevos.map(r => r.id))
    setSelAdelant(adelantosPendientes.filter(a => a.chofer_id === chofer.id).map(a => a.id))
    setSelEstadias(estadiasPendientes.filter(e => e.chofer_id === chofer.id).map(e => e.id))
    setSelGastos([]) // se llena cuando el hook devuelve reintegros (useEffect abajo)
    const { desde, hasta } = rangoConRelevos(mis_tramos, mis_relevos)
    formLiq.reset({
      basico_dia:        chofer.basico_dia ?? 0,
      precio_km_cargado: chofer.precio_km_cargado ?? 0,
      precio_km_vacio:   chofer.precio_km_vacio ?? 0,
      desde,
      hasta,
      // Vigencia por defecto: hoy. Un aumento se aplica de acá en adelante; si
      // hay que retrotraerlo, se cambia a mano y el sistema respeta la fecha.
      tarifas_desde:     toISO(new Date()),
      obs:               '',
    })
    setModalLiq(true)
  }

  function calcularPreview() {
    const empty = {
      dias: 0, basico_dia: 0, subtotal_bas: 0,
      km_cargados: 0, km_vacios: 0, km_totales: 0,
      subtotal_km_cargado: 0, subtotal_km_vacio: 0, subtotal_km: 0,
      descuentos: 0, reintegros: 0, total_estadias: 0,
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
    const descuentos       = adelantosPendientes.filter(a => selAdelant.includes(a.id)).reduce((s, a) => s + a.monto, 0)
    const reintegros       = gastosReintegro.filter(g => selGastos.includes(g.id)).reduce((s, g) => s + Number(g.monto), 0)
    const total_estadias   = estadiasPendientes.filter(e => selEstadias.includes(e.id)).reduce((s, e) => s + Number(e.total), 0)
    // Fórmula canónica compartida con resumenChofer (y testeada).
    const tot = calcularTotalesLiquidacion({
      dias, basico_dia,
      km_cargados, precio_km_cargado: precioKmCargado,
      km_vacios,   precio_km_vacio:   precioKmVacio,
      descuentos, reintegros, total_estadias,
    })
    return {
      dias, basico_dia, subtotal_bas,
      km_cargados, km_vacios, km_totales: tot.km_totales,
      subtotal_km_cargado: tot.subtotal_km_cargado,
      subtotal_km_vacio:   tot.subtotal_km_vacio,
      subtotal_km:         tot.subtotal_km,
      descuentos, reintegros, total_estadias,
      precio_km_cargado: precioKmCargado,
      precio_km_vacio:   precioKmVacio,
      precio_km: tot.precio_km,
      neto: tot.neto,
    }
  }

  // Guarda una VERSIÓN de las tarifas vigente desde una fecha, no un pisado.
  // Antes era un UPDATE in-place sobre la ficha del chofer, y el "parcial" de
  // Gastos > Reportes valúa el trabajo sin liquidar con la tarifa actual: un
  // aumento re-valuaba retroactivamente todo lo pendiente. Mismo bug que tarja
  // el 2026-06-26.
  function handleGuardarTarifas(data: any) {
    if (!choferLiq) return
    const desde = String(data.tarifas_desde || '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(desde)) {
      toast('Poné desde qué fecha rigen estas tarifas', 'err'); return
    }
    setTarifasChofer({
      id: choferLiq.id,
      dto: {
        desde,
        basico_dia:        parseFloat(data.basico_dia)        || 0,
        precio_km_cargado: parseFloat(data.precio_km_cargado) || 0,
        precio_km_vacio:   parseFloat(data.precio_km_vacio)   || 0,
      },
    }, {
      onSuccess: () => {
        toast(`✓ Tarifas vigentes desde ${fmtFecha(desde)}`, 'ok')
        setModalLiq(false); setChoferLiq(null)
      },
      onError: () => toast('Error al guardar', 'err'),
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
      total_estadias:      preview.total_estadias,
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
      estadias: estadiasPendientes
        .filter(e => e.chofer_id === choferLiq.id && selEstadias.includes(e.id))
        .map(e => ({
          fecha_desde: e.fecha_desde,
          fecha_hasta: e.fecha_hasta,
          dias:        e.dias,
          monto_dia:   Number(e.monto_dia),
          total:       Number(e.total),
          obs:         e.obs ?? null,
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

  // Una liquidación anulada no emite comprobante por NINGÚN camino. El chequeo
  // va acá y no en los botones porque hay dos puntos de entrada (el Historial y
  // el modal de detalle), y emitir el comprobante de algo que se sacó de
  // circulación es justo el riesgo que la anulación viene a cerrar: el PDF de
  // la cáscara N° 23 decía "NETO A PAGAR $1.342.280" sin listar un solo viaje.
  function bloqueadoPorAnulada(liq: any): boolean {
    if (liq?.estado !== 'anulada') return false
    toast(
      `La liquidación N° ${liq.id} está anulada${liq.anulacion_motivo ? ` (${liq.anulacion_motivo})` : ''}: no emite comprobante.`,
      'err',
    )
    return true
  }

  // Excel de una liquidación cerrada con detalle de gastos del chofer.
  async function handleDescargarExcelCerrada(liq: any, exportData: any) {
    if (bloqueadoPorAnulada(liq)) return
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
        // Neto = básico + km − adelantos + reintegros + estadías, contando los
        // reintegros UNA sola vez. OJO: exportData.neto (= saldo de resumenChofer)
        // YA incluía reintegros, así que sumar resp.total los duplicaba (el Excel
        // daba más que el PDF parcial). Recomputamos desde los subtotales.
        neto: (exportData.subtotal_bas ?? 0) + (exportData.subtotal_km ?? 0) - (exportData.descuentos ?? 0) + resp.total + (exportData.total_estadias ?? 0),
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
    if (bloqueadoPorAnulada(liq)) return
    const chofer = (choferes as Chofer[]).find(c => c.id === liq.chofer_id)
    if (!chofer) { toast('Chofer no encontrado', 'err'); return }
    const camion = (camiones as any[]).find(c => c.id === chofer.camion_id)
    const liqTramos = (tramos as Tramo[]).filter(t => t.liquidacion_id === liq.id)
    const liqAdel   = (adelantos as Adelanto[]).filter(a => a.liquidacion_id === liq.id)
    const liqEst    = (estadias as Estadia[]).filter(e => e.liquidacion_id === liq.id)
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
      total_estadias:      liq.total_estadias ?? 0,
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
      estadias: liqEst.map(e => ({
        fecha_desde: e.fecha_desde,
        fecha_hasta: e.fecha_hasta,
        dias:        e.dias,
        monto_dia:   Number(e.monto_dia),
        total:       Number(e.total),
        obs:         e.obs ?? null,
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
      descuentos, reintegros, total_estadias, precio_km, neto,
    } = calcularPreview()
    // El neto del preview es el mismo que se persiste como total_neto abajo,
    // así que el importe del aviso coincide con el del adelanto automático.
    if (!confirmarNetoNegativo(neto)) return
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
      total_estadias,
      total_neto:          neto,
      obs:                 data.obs,
      tramo_ids:           selTramos,
      tramo_chofer_ids:    selRelevos,
      adelanto_ids:        selAdelant,
      gasto_ids:           selGastos,
      estadia_ids:         selEstadias,
    } as any, {
      onSuccess: (nueva: any) => {
        cerrarLiq(nueva.id, {
          onSuccess: (cerrada) => {
            toast(mensajeCierre(cerrada), 'ok')
            setModalLiq(false)
            setChoferLiq(null)
            setSelAdelant([])
            setSelTramos([])
            setSelRelevos([])
            setSelGastos([])
            setSelEstadias([])
            // Pasar directo al detalle de la liquidación recién cerrada para
            // poder imprimir el PDF final sin buscarla en el historial.
            const liqFinal = cerrada ?? { ...nueva, estado: 'cerrada' }
            setDetalleLiq(liqFinal)
            formDetalle.reset({
              basico_dia:  liqFinal.basico_dia,
              fecha_desde: liqFinal.fecha_desde,
              fecha_hasta: liqFinal.fecha_hasta,
              obs:         liqFinal.obs ?? '',
            })
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
        else if (code === 'ESTADIA_INVALIDA') toast('Alguna de las estadías no es válida (ya liquidada o no pertenece al chofer)', 'err')
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
        forma_pago:  data.forma_pago === 'transferencia' ? 'transferencia' : 'efectivo',
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

  // Crea una estadía: fechas + $/día tipeado cada vez. Días y total se
  // calculan acá (días corridos desde→hasta inclusive × monto por día).
  function handleCreateEst(data: any) {
    const choferId = Number(data.chofer_id)
    if (!choferId) { toast('Elegí un chofer', 'err'); return }
    if (!data.fecha_desde || !data.fecha_hasta) { toast('Cargá las fechas de la estadía', 'err'); return }
    if (data.fecha_desde > data.fecha_hasta) { toast('La fecha "desde" no puede ser posterior a "hasta"', 'err'); return }
    const montoDia = Number(data.monto_dia)
    if (!Number.isFinite(montoDia) || montoDia <= 0) { toast('Cargá el monto por día', 'err'); return }
    const dias = diasEntreFechas(data.fecha_desde, data.fecha_hasta)
    createEst({
      chofer_id:   choferId,
      fecha_desde: data.fecha_desde,
      fecha_hasta: data.fecha_hasta,
      dias,
      monto_dia:   montoDia,
      total:       dias * montoDia,
      obs:         data.obs || '',
    }, {
      onSuccess: () => {
        toast('✓ Estadía registrada', 'ok')
        setModalEst(false)
        formEst.reset()
      },
      onError: () => toast('Error al registrar la estadía', 'err'),
    })
  }

  async function verComprobanteAdel(id: number) {
    await abrirAdjuntoFirmado(
      () => fetchAdelantoComprobanteUrl(id),
      () => toast('No se pudo abrir el comprobante', 'err'),
    )
  }

  // Genera el recibo PDF de un adelanto para que el chofer lo firme. Se usa
  // desde el modal (con valores del form, antes de guardar) y desde la fila
  // (con el adelanto ya guardado → lleva N° A-{id}).
  function imprimirReciboAdel(a: {
    id?: number; chofer_id: number | null; fecha?: string; monto?: number
    descripcion?: string | null; forma_pago: AdelantoFormaPago
  }) {
    // Los adelantos de saldo (cierre negativo) no se entregan en mano: no hay
    // nada que el chofer pueda firmar. El botón ni se muestra; esto es el cinturón.
    if (a.forma_pago === 'saldo') { toast('Un adelanto por saldo negativo no lleva recibo (no hubo entrega de dinero)', 'err'); return }
    const ch = (choferes as Chofer[]).find(c => c.id === Number(a.chofer_id))
    if (!ch) { toast('Elegí un chofer para el recibo', 'err'); return }
    const monto = Number(a.monto)
    if (!Number.isFinite(monto) || monto <= 0) { toast('Cargá el monto para el recibo', 'err'); return }
    generarReciboAdelanto({
      numero:        a.id ? `A-${a.id}` : null,
      fecha:         a.fecha || toISO(new Date()),
      chofer_nombre: ch.nombre,
      chofer_cuil:   ch.cuil,
      monto,
      descripcion:   a.descripcion ?? null,
      forma_pago:    a.forma_pago,
    })
  }

  const preview = calcularPreview()

  return (
    <>
      <div className="flex gap-2 justify-end flex-wrap">
        <Button variant="secondary" size="sm" onClick={() => setModalTransf(true)}>
          🏦 Solicitud de transferencia
        </Button>
        <Button variant="secondary" size="sm" onClick={() => {
          formAdel.reset({ fecha: toISO(new Date()), forma_pago: 'efectivo', chofer_id: '', monto: '', descripcion: '' })
          setModalAdel(true)
        }}>
          💵 Registrar adelanto
        </Button>
        <Button variant="secondary" size="sm" onClick={() => {
          formEst.reset({ chofer_id: '', fecha_desde: toISO(new Date()), fecha_hasta: toISO(new Date()), monto_dia: '', obs: '' })
          setModalEst(true)
        }}>
          🕐 Registrar estadía
        </Button>
      </div>

      {/* ── Saldo corriente por chofer ── */}
      <div>
        <h2 className="text-xs font-bold text-gris-dark uppercase tracking-wider mb-3">
          Saldo corriente por chofer
        </h2>
        <div className="flex flex-col gap-3">
          {choferesPendientes.map(chofer => {
            const { mis_tramos, mis_relevos, mis_adelantos, mis_reintegros, mis_estadias, dias, sinBasico, subtotal_bas, km_cargados, km_vacios, km_totales, subtotal_km, subtotal, descuentos, reintegros, total_estadias, saldo } = resumenChofer(chofer)
            const sinMovimientos = mis_tramos.length === 0 && mis_relevos.length === 0 && mis_adelantos.length === 0 && mis_reintegros.length === 0 && mis_estadias.length === 0
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
                      <p className="text-xs text-gris-mid mt-1 italic">Sin tramos, adelantos, estadías ni gastos pendientes</p>
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
                            {total_estadias > 0 && ` + ${fmtM(total_estadias)} estadías`}
                          </div>
                        )}
                        {mis_adelantos.length > 0 && sinBasico && (
                          <div>{mis_adelantos.length} adelanto{mis_adelantos.length !== 1 ? 's' : ''} · {fmtM(descuentos)}</div>
                        )}
                        {mis_reintegros.length > 0 && sinBasico && (
                          <div>{mis_reintegros.length} gasto{mis_reintegros.length !== 1 ? 's' : ''} pagado{mis_reintegros.length !== 1 ? 's' : ''} por el chofer · {fmtM(reintegros)}</div>
                        )}
                        {mis_estadias.length > 0 && sinBasico && (
                          <div>🕐 {mis_estadias.length} estadía{mis_estadias.length !== 1 ? 's' : ''} · {fmtM(total_estadias)}</div>
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
                            {total_estadias > 0 ? ` + ${fmtM(total_estadias)}` : ''}
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
                      <Button variant="primary" size="sm" onClick={() => {
                        if (!confirmarNetoNegativo(Number(borrador.total_neto))) return
                        cerrarLiq(borrador.id, {
                          onSuccess: (resp) => toast(mensajeCierre(resp), 'ok'),
                          onError:   (e: unknown) => toast(msgErrorLiq(e, 'Error al cerrar'), 'err'),
                        })
                      }}>
                        💰 Liquidar
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => {
                        if (confirm('¿Eliminar borrador?')) deleteLiq(borrador.id, {
                          onSuccess: () => toast('✓ Eliminado', 'ok'),
                          onError:   (e: unknown) => toast(msgErrorLiq(e, 'Error al eliminar'), 'err'),
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
                        neto: subtotal_bas + subtotal_km - descuentos + reintegros + total_estadias,
                        tramos:       mis_tramos,
                        relevos:      legsDeRelevos(mis_relevos),
                        adelantos:    mis_adelantos,
                        estadias:     mis_estadias,
                        total_estadias,
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
        // Las anuladas siguen en el Historial a propósito: se anulan justamente
        // para que quede rastro (su número ya salió impreso en recibos), así que
        // esconderlas sería tirar la única razón para no borrarlas.
        const cerradas = (liquidaciones as any[]).filter(l => l.estado === 'cerrada' || l.estado === 'anulada')
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
              const anulada = liq.estado === 'anulada'
              // ¿Es una cáscara? Cerrada sin nada adentro. Los gastos se piden
              // por liquidación bajo demanda, así que no entran acá: si hubiera
              // alguno, el backend rechaza la anulación con su mensaje.
              const vacia =
                (tramos    as Tramo[]).every(t => t.liquidacion_id !== liq.id) &&
                (adelantos as Adelanto[]).every(a => a.liquidacion_id !== liq.id) &&
                (estadias  as Estadia[]).every(e => e.liquidacion_id !== liq.id) &&
                legsRelevoLiquidados(liq.id).length === 0
              return (
                <div key={liq.id} className={`bg-white rounded-card shadow-card p-4 border-l-4 ${anulada ? 'border-gris-mid opacity-70' : 'border-verde'}`}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Badge
                          variant={anulada ? 'inactivo' : 'cerrado'}
                          label={anulada ? 'Anulada' : 'Cerrada'}
                        />
                        <span className="font-mono text-[11px] text-gris-dark">N° {liq.id}</span>
                        {!anulada && vacia && (
                          <span
                            title="Cerrada pero sin ningún viaje, adelanto ni estadía adentro. Es una cáscara: los reportes la contaban como plata real."
                            className="text-[10px] font-bold bg-rojo-light text-rojo px-1.5 py-0.5 rounded-full uppercase tracking-wide"
                          >
                            ⚠ vacía
                          </span>
                        )}
                      </div>
                      <div className={`font-bold ${anulada ? 'text-gris-dark line-through' : 'text-azul'}`}>{chofer?.nombre ?? '—'}</div>
                      <div className="text-xs text-gris-dark mt-1">
                        {fmtFecha(liq.fecha_desde)} → {fmtFecha(liq.fecha_hasta)} &nbsp;·&nbsp;
                        {liq.dias_trabajados} días &nbsp;·&nbsp;
                        {fmtM(liq.basico_dia)}/día
                      </div>
                      {anulada && (
                        <div className="text-[11px] text-rojo mt-1.5 max-w-md">
                          Anulada{liq.anulada_en ? ` el ${fmtFecha(String(liq.anulada_en).slice(0, 10))}` : ''}
                          {liq.anulacion_motivo ? `: ${liq.anulacion_motivo}` : ''}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className={`font-mono font-bold text-lg ${anulada ? 'text-gris-mid line-through' : 'text-verde'}`}>{fmtM(liq.total_neto)}</div>
                      <div className="text-xs text-gris-dark">{anulada ? 'No cuenta' : 'Total neto'}</div>
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
                      <Button variant="primary" size="sm" onClick={() => {
                        if (!confirmarNetoNegativo(Number(liq.total_neto))) return
                        cerrarLiq(liq.id, {
                          onSuccess: (resp) => toast(mensajeCierre(resp), 'ok'),
                          onError:   (e: unknown) => toast(msgErrorLiq(e, 'Error al cerrar'), 'err'),
                        })
                      }}>
                        ✓ Cerrar
                      </Button>
                    )}
                    {(() => {
                      const liqTramos  = (tramos   as Tramo[]).filter(t => t.liquidacion_id === liq.id)
                      const liqAdel    = (adelantos as Adelanto[]).filter(a => a.liquidacion_id === liq.id)
                      const liqEst     = (estadias as Estadia[]).filter(e => e.liquidacion_id === liq.id)
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
                        estadias:     liqEst,
                        total_estadias: liq.total_estadias ?? 0,
                        canteras:     canteras as any[],
                        depositos:    depositos as any[],
                        rutas:        rutas as Ruta[],
                        estado:       liq.estado === 'cerrada' ? 'Cerrada' : 'Borrador',
                      }
                      // Una anulada no tiene comprobante: emitir el PDF de algo
                      // que se sacó de circulación es justamente el riesgo que
                      // la anulación viene a cerrar (el PDF de la cáscara N° 23
                      // decía "NETO A PAGAR $1.342.280" sin listar un viaje).
                      if (anulada) return null
                      return (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => handleDescargarExcelCerrada(liq, exportData)}>📊 Excel</Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDescargarPdfCerrada(liq)}>📄 PDF</Button>
                        </>
                      )
                    })()}
                    {!anulada && vacia && puedeEliminar && (
                      <Button variant="secondary" size="sm" onClick={() => {
                        setAnularLiq(liq)
                        setAnularMotivo('')
                      }}>
                        ⃠ Anular
                      </Button>
                    )}
                    {!anulada && (
                      <Button variant="ghost" size="sm" onClick={() => {
                        setConfirmDelLiq(liq)
                        setConfirmDelNumero('')
                        setConfirmDelMotivo('')
                      }}>
                        🗑 Eliminar
                      </Button>
                    )}
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
                              <div className="shrink-0 text-right">
                                <div className="font-mono font-bold text-rojo">{fmtM(a.monto)}</div>
                                {/* Adelanto automático por cierre en negativo: no hubo
                                    entrega de dinero, así que no se muestra forma de pago. */}
                                {a.liquidacion_origen_id ? (
                                  <div
                                    className="text-[10px] font-bold text-naranja-dark"
                                    title={`Generado automáticamente por el saldo negativo de la liquidación N° ${a.liquidacion_origen_id}`}
                                  >
                                    ↩ Saldo liq. N° {a.liquidacion_origen_id}
                                  </div>
                                ) : a.forma_pago === 'saldo' ? (
                                  /* Ajuste sin entrega de dinero cargado a mano (sin
                                     liquidacion_origen_id): sin esto caía en el else y
                                     se mostraba como "Efectivo", que es falso. */
                                  <div className="text-[10px] font-bold text-naranja-dark" title={a.descripcion ?? 'Ajuste sin entrega de dinero'}>
                                    ↩ Ajuste
                                  </div>
                                ) : (
                                  <div className="text-[10px] text-gris-mid">{a.forma_pago === 'transferencia' ? '🏦 Transf.' : '💵 Efectivo'}</div>
                                )}
                              </div>
                              <div className="flex gap-1 shrink-0">
                                {/* Sin recibo para firmar en los adelantos de saldo:
                                    el chofer nunca recibió esa plata en mano. */}
                                {a.forma_pago === 'efectivo' && !a.liquidacion_origen_id && (
                                  <button
                                    onClick={() => imprimirReciboAdel(a)}
                                    title="Imprimir recibo para firmar"
                                    className="text-xs font-bold px-2 py-1 rounded hover:bg-azul-light text-gris-dark hover:text-azul transition-colors"
                                  >🖨</button>
                                )}
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
                                      onClick={() => { setEditandoAdel(a); formEditAdel.reset({ fecha: a.fecha, monto: a.monto, descripcion: a.descripcion ?? '', forma_pago: a.forma_pago ?? 'efectivo' }); setArchivoEditAdel(null); setRemoverCompEdit(false) }}
                                      className="text-xs font-bold px-2 py-1 rounded hover:bg-gris transition-colors"
                                    >✏️</button>
                                    {/* El adelanto de saldo NO se borra a mano: es la deuda que
                                        dejó una liquidación al cerrar en negativo. Se anula
                                        reabriendo esa liquidación (la RPC lo borra sola). */}
                                    {!a.liquidacion_origen_id && (
                                      <button
                                        onClick={() => { if (confirm('¿Eliminar adelanto?')) deleteAdel(a.id, { onSuccess: () => toast('✓ Adelanto eliminado', 'ok'), onError: (err: unknown) => toast(msgErrorLiq(err, 'Error al eliminar'), 'err') }) }}
                                        className="text-xs font-bold px-2 py-1 rounded hover:bg-rojo-light text-gris-dark hover:text-rojo transition-colors"
                                      >✕</button>
                                    )}
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

      {/* ── Estadías: filtros + agrupado por chofer (mismo patrón que Adelantos) ── */}
      {(estadias as Estadia[]).length > 0 && (() => {
        const filtradas = (estadias as Estadia[]).filter(e => {
          if (filtEstadoEst === 'pendientes' && e.liquidacion_id) return false
          if (filtEstadoEst === 'liquidadas' && !e.liquidacion_id) return false
          if (filtChoferEst && e.chofer_id !== Number(filtChoferEst)) return false
          // Una estadía es un rango: se muestra si SOLAPA con el filtro, no si
          // está contenida — si no, una que arranca antes del "desde" se perdería.
          if (filtDesdeEst && e.fecha_hasta < filtDesdeEst) return false
          if (filtHastaEst && e.fecha_desde > filtHastaEst) return false
          if (filtSearchEst && !(e.obs ?? '').toLowerCase().includes(filtSearchEst.toLowerCase())) return false
          return true
        })

        const grupos = new Map<number, Estadia[]>()
        for (const e of filtradas) {
          const arr = grupos.get(e.chofer_id) ?? []
          arr.push(e)
          grupos.set(e.chofer_id, arr)
        }
        const gruposOrdenados = [...grupos.entries()]
          .map(([id, lista]) => ({
            id,
            chofer: (choferes as Chofer[]).find(c => c.id === id),
            lista: lista.sort((x, y) => y.fecha_desde.localeCompare(x.fecha_desde)),
          }))
          .sort((a, b) => (a.chofer?.nombre ?? '').localeCompare(b.chofer?.nombre ?? ''))

        // Con un solo grupo (filtro por chofer puesto) no tiene sentido pedir un click más.
        const autoExpand = gruposOrdenados.length === 1 ? new Set([gruposOrdenados[0]!.id]) : null
        const totalFiltrado = filtradas.reduce((s, e) => s + Number(e.total), 0)
        const diasFiltrados = filtradas.reduce((s, e) => s + Number(e.dias), 0)
        const hayFiltros = !!(filtChoferEst || filtDesdeEst || filtHastaEst || filtSearchEst) || filtEstadoEst !== 'pendientes'

        function toggleChoferEst(id: number) {
          setExpandedChoferesEst(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id); else next.add(id)
            return next
          })
        }

        return (
          <div>
            <div className="flex items-baseline justify-between gap-2 flex-wrap mb-2">
              <h2 className="text-xs font-bold text-gris-dark uppercase tracking-wider">🕐 Estadías</h2>
              {filtradas.length > 0 && (
                <span className="text-xs text-gris-dark">
                  {filtradas.length} estadía{filtradas.length !== 1 ? 's' : ''} · {diasFiltrados} día{diasFiltrados !== 1 ? 's' : ''} ·{' '}
                  <b className="font-mono text-verde">{fmtM(totalFiltrado)}</b>
                </span>
              )}
            </div>

            <div className="bg-white rounded-card shadow-card p-3 mb-3 flex flex-col gap-3">
              <div className="flex flex-wrap gap-1">
                {(['pendientes', 'liquidadas', 'todas'] as const).map(v => (
                  <button
                    key={v}
                    onClick={() => setFiltEstadoEst(v)}
                    className={`text-xs font-bold px-3 py-1.5 rounded transition-colors capitalize ${filtEstadoEst === v ? 'bg-azul text-white' : 'bg-gris text-gris-dark hover:bg-gris-mid'}`}
                  >
                    {v}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2 items-end">
                <Select
                  label="Chofer"
                  value={filtChoferEst}
                  onChange={e => setFiltChoferEst((e.target as HTMLSelectElement).value)}
                  options={[
                    { value: '', label: 'Todos' },
                    ...((choferes as Chofer[]).filter(c => c.estado !== 'inactivo')
                      .map(c => ({ value: String(c.id), label: c.nombre }))),
                  ]}
                />
                <Input label="Desde" type="date" value={filtDesdeEst} onChange={e => setFiltDesdeEst(e.target.value)} />
                <Input label="Hasta" type="date" value={filtHastaEst} onChange={e => setFiltHastaEst(e.target.value)} />
                <Input label="Buscar" placeholder="Observaciones..." value={filtSearchEst} onChange={e => setFiltSearchEst(e.target.value)} />
                {hayFiltros && (
                  <button
                    onClick={() => { setFiltChoferEst(''); setFiltDesdeEst(''); setFiltHastaEst(''); setFiltSearchEst(''); setFiltEstadoEst('pendientes') }}
                    className="text-xs text-azul hover:underline self-end mb-1.5"
                  >
                    Limpiar filtros
                  </button>
                )}
              </div>
            </div>

            {gruposOrdenados.length === 0 ? (
              <div className="bg-white rounded-card shadow-card p-6 text-center text-gris-dark text-sm">
                No hay estadías con esos filtros.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {gruposOrdenados.map(({ id, chofer, lista }) => {
                  const expanded = autoExpand?.has(id) || expandedChoferesEst.has(id)
                  const subtotal = lista.reduce((s, e) => s + Number(e.total), 0)
                  const subDias  = lista.reduce((s, e) => s + Number(e.dias), 0)
                  return (
                    <div key={id} className="bg-white rounded-card shadow-card overflow-hidden">
                      <button
                        onClick={() => toggleChoferEst(id)}
                        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-gris/30 transition-colors text-left"
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-gris-dark text-sm">{expanded ? '▼' : '▶'}</span>
                          <span className="font-bold text-azul">{chofer?.nombre ?? `#${id}`}</span>
                          <span className="text-xs text-gris-dark">
                            {lista.length} estadía{lista.length !== 1 ? 's' : ''} · {subDias} día{subDias !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <span className="font-mono font-bold text-verde">{fmtM(subtotal)}</span>
                      </button>
                      {expanded && (
                        <div className="border-t border-gris divide-y divide-gris">
                          {lista.map(e => (
                            <div key={e.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm hover:bg-gris/20 transition-colors">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs text-gris-dark font-mono">
                                    {fmtFecha(e.fecha_desde)} → {fmtFecha(e.fecha_hasta)}
                                  </span>
                                  {e.liquidacion_id
                                    ? <span className="text-[10px] text-gris-mid">Liquidada en N° {e.liquidacion_id}</span>
                                    : <span className="text-[10px] font-bold uppercase tracking-wide bg-amarillo/20 text-amber-700 px-1.5 py-0.5 rounded">Pendiente</span>}
                                </div>
                                <div className="text-xs text-gris-dark mt-0.5">
                                  {e.dias} día{e.dias !== 1 ? 's' : ''} × {fmtM(Number(e.monto_dia))}
                                  {e.obs && <span className="text-gris-mid"> · {e.obs}</span>}
                                </div>
                              </div>
                              <div className="font-mono font-bold text-verde shrink-0">{fmtM(Number(e.total))}</div>
                              {!e.liquidacion_id && (
                                <button
                                  onClick={() => { if (confirm('¿Eliminar estadía?')) deleteEst(e.id, { onSuccess: () => toast('✓ Estadía eliminada', 'ok'), onError: () => toast('Error al eliminar', 'err') }) }}
                                  className="text-xs font-bold px-2 py-1 rounded hover:bg-rojo-light text-gris-dark hover:text-rojo transition-colors shrink-0"
                                >✕</button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
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

            {/* Vigencia de las tarifas. Sin esto, guardar un aumento pisaba las
                tarifas y re-valuaba retroactivamente todo el trabajo del chofer
                que todavía no estaba liquidado. */}
            <div className="bg-gris/30 rounded-card p-3 flex flex-col gap-2">
              <Input
                label="Estas tarifas rigen desde"
                type="date"
                hint="Al guardar queda una versión con esta fecha. El trabajo anterior sigue valuado con la tarifa que tenía — no se recalcula hacia atrás."
                {...formLiq.register('tarifas_desde')}
              />
              {(() => {
                const hist = [
                  ...((choferLiq as ChoferConHist).choferes_basico_hist ?? []).map(h => ({
                    desde: h.desde, texto: `Básico ${fmtM(h.valor_dia)}/día`,
                  })),
                  ...((choferLiq as ChoferConHist).choferes_km_hist ?? []).map(h => ({
                    desde: h.desde,
                    texto: `${h.tipo === 'cargado' ? '🚛' : '🔲'} ${fmtM(h.valor_km)}/km ${h.tipo}`,
                  })),
                ].sort((a, b) => b.desde.localeCompare(a.desde))
                if (hist.length === 0) return null
                return (
                  <details className="text-[11px]">
                    <summary className="cursor-pointer text-gris-dark font-semibold">
                      Historial de tarifas ({hist.length})
                    </summary>
                    <ul className="mt-1.5 flex flex-col gap-0.5 font-mono">
                      {hist.map((h, i) => (
                        <li key={i} className="text-gris-dark">
                          {fmtFecha(h.desde)} · {h.texto}
                        </li>
                      ))}
                    </ul>
                  </details>
                )
              })()}
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
                          {/* El km sale de una ruta que sugirió Google y nadie revisó:
                              se paga igual, pero conviene saberlo ANTES de cerrar. */}
                          {km > 0 && rutaSinVerificar(t) && (
                            <span className="ml-1 text-[10px] font-bold uppercase tracking-wide bg-[#fff3d6] text-[#8a5a00] px-1.5 py-0.5 rounded" title="El km de esta ruta lo sugirió Google y todavía nadie lo verificó contra el mapa. Se puede liquidar igual; para confirmarlo, andá a Rutas → matriz.">◐ km sin verificar</span>
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
                      <span>
                        {fmtFecha(a.fecha)} · {a.descripcion || 'Adelanto'} · <b>{fmtM(a.monto)}</b>
                        {a.liquidacion_origen_id != null && (
                          <span className="ml-1 text-[10px] font-bold text-naranja-dark">↩ saldo liq. N° {a.liquidacion_origen_id}</span>
                        )}
                      </span>
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

            {/* Estadías (días de espera) — SUMAN al neto */}
            {estadiasPendientes.filter(e => e.chofer_id === choferLiq.id).length > 0 && (
              <div>
                <div className="text-xs font-bold text-gris-dark uppercase tracking-wider mb-2">
                  🕐 Estadías a pagar
                </div>
                <div className="bg-verde-light/40 border border-verde/20 rounded-xl p-3 max-h-32 overflow-y-auto flex flex-col gap-1">
                  {estadiasPendientes.filter(e => e.chofer_id === choferLiq.id).map(e => (
                    <label key={e.id} className="flex items-center gap-2 cursor-pointer text-sm py-1 border-b border-verde/10 last:border-0">
                      <input
                        type="checkbox"
                        checked={selEstadias.includes(e.id)}
                        onChange={ev => setSelEstadias(prev => ev.target.checked ? [...prev, e.id] : prev.filter(x => x !== e.id))}
                        className="accent-verde"
                      />
                      <span className="flex-1 min-w-0 truncate">
                        {fmtFecha(e.fecha_desde)} → {fmtFecha(e.fecha_hasta)} · {e.dias} día{e.dias !== 1 ? 's' : ''} × {fmtM(Number(e.monto_dia))}
                        {e.obs && <span className="text-gris-mid"> · {e.obs}</span>}
                      </span>
                      <b className="font-mono text-verde">{fmtM(Number(e.total))}</b>
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
                {preview.total_estadias > 0 && (
                  <>
                    <span className="text-gris-dark">🕐 Estadías:</span>
                    <span className="font-mono font-bold text-verde">+ {fmtM(preview.total_estadias)}</span>
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
        const liqEst     = (estadias as Estadia[]).filter(e => e.liquidacion_id === detalleLiq.id)
        const relevoLegs = legsRelevoLiquidados(detalleLiq.id)
        const esBorrador = detalleLiq.estado === 'borrador'

        // Cálculos derivados para mostrar el desglose completo (con patas de relevo).
        const km_cargados = liqTramos.filter(t => t.tipo === 'cargado').reduce((s, t) => s + kmTramo(t, rutas as Ruta[]), 0) + kmLegs(relevoLegs, 'cargado')
        const km_vacios   = liqTramos.filter(t => t.tipo === 'vacio').reduce((s, t) => s + kmTramo(t, rutas as Ruta[]), 0) + kmLegs(relevoLegs, 'vacio')
        const km_totales  = km_cargados + km_vacios
        const sub_km_cargado = detalleLiq.subtotal_km_cargado ?? (km_cargados * (chofer?.precio_km_cargado ?? 0))
        const sub_km_vacio   = detalleLiq.subtotal_km_vacio   ?? (km_vacios   * (chofer?.precio_km_vacio   ?? 0))

        // Totales del borrador con la fórmula canónica (calcularTotalesLiquidacion).
        // Antes acá se recalculaba total_neto como (días × básico) − adelantos,
        // perdiendo km, reintegros y estadías: cualquier borrador editado desde
        // este modal quedaba con el neto corrompido.
        function totalesDetalle(data: DetalleFormData) {
          const basicoDia = Number(data.basico_dia) || 0
          const dias      = detalleLiq.dias_trabajados
          // Fallbacks a los totales persistidos: liqAdel/liqEst salen de queries
          // globales y detalleGastos se carga on-demand — si todavía no llegaron
          // (o el fetch falló), es preferible conservar lo guardado a poner 0.
          const descuentos = liqAdel.length > 0
            ? liqAdel.reduce((s: number, a: Adelanto) => s + Number(a.monto), 0)
            : Number(detalleLiq.total_adelantos ?? 0)
          const total_estadias = liqEst.length > 0
            ? liqEst.reduce((s: number, e: Estadia) => s + Number(e.total), 0)
            : Number(detalleLiq.total_estadias ?? 0)
          const reintegros = detalleGastos.length > 0
            ? detalleGastos.reduce((s: number, g: { monto: number | string }) => s + Number(g.monto), 0)
            : Number(detalleLiq.total_reintegros ?? 0)
          // Precios efectivos = los que dan los subtotales de km que muestra el
          // modal (persistidos si existen; si no, el $/km actual del chofer).
          // Así el neto guardado cuadra con el desglose que ve el usuario aunque
          // la tarifa del chofer haya cambiado después de crear el borrador.
          const precioKmCargadoEf = km_cargados > 0 ? sub_km_cargado / km_cargados : (chofer?.precio_km_cargado ?? 0)
          const precioKmVacioEf   = km_vacios   > 0 ? sub_km_vacio   / km_vacios   : (chofer?.precio_km_vacio   ?? 0)
          const tot = calcularTotalesLiquidacion({
            dias, basico_dia: basicoDia,
            km_cargados, precio_km_cargado: precioKmCargadoEf,
            km_vacios,   precio_km_vacio:   precioKmVacioEf,
            descuentos, reintegros, total_estadias,
          })
          return { basicoDia, descuentos, tot }
        }

        function guardarLiqDto(data: DetalleFormData, onSuccess: () => void) {
          const { basicoDia, descuentos, tot } = totalesDetalle(data)
          updateLiq({
            id: detalleLiq.id,
            dto: {
              basico_dia:      basicoDia,
              fecha_desde:     data.fecha_desde,
              fecha_hasta:     data.fecha_hasta,
              subtotal_basico: tot.subtotal_bas,
              total_adelantos: descuentos,
              total_neto:      tot.neto,
              obs:             data.obs,
            },
            // UpdateLiquidacionSchema del backend sólo acepta fecha_desde,
            // fecha_hasta, basico_dia, dias_trabajados, subtotal_basico,
            // total_adelantos, total_neto y obs: los subtotales de km, los
            // reintegros y las estadías entran en el neto pero no se pueden
            // re-persistir desde acá (no cambian al editar básico/fechas).
          }, { onSuccess, onError: () => toast('Error al actualizar', 'err') })
        }

        function handleGuardar(data: DetalleFormData) {
          guardarLiqDto(data, () => { toast('✓ Liquidación actualizada', 'ok'); setDetalleLiq(null) })
        }

        const handleLiquidarDetalle = formDetalle.handleSubmit((data: DetalleFormData) => {
          // Mismo neto que se va a guardar (y que va a generar el adelanto).
          if (!confirmarNetoNegativo(totalesDetalle(data).tot.neto)) return
          guardarLiqDto(data, () => cerrarLiq(detalleLiq.id, {
            onSuccess: (resp) => { toast(mensajeCierre(resp), 'ok'); setDetalleLiq(null) },
            onError:   (e: unknown) => toast(msgErrorLiq(e, 'Error al cerrar'), 'err'),
          }))
        })

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
                      onError:   (err: unknown) => toast(msgErrorLiq(err, 'Error al reabrir'), 'err'),
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
                        estadias:     liqEst,
                        total_estadias: detalleLiq.total_estadias ?? 0,
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
                        <span className="text-gris-dark">
                          {fmtFecha(a.fecha)} · {a.descripcion || 'Adelanto'}
                          {a.liquidacion_origen_id != null && (
                            <span className="ml-1 text-[10px] font-bold text-naranja-dark">↩ saldo liq. N° {a.liquidacion_origen_id}</span>
                          )}
                        </span>
                        <span className="font-mono font-semibold text-rojo shrink-0">− {fmtM(a.monto)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Estadías pagadas en esta liquidación */}
              {liqEst.length > 0 && (
                <div>
                  <div className="text-xs font-bold text-gris-dark uppercase tracking-wider mb-2">
                    🕐 Estadías pagadas ({liqEst.length})
                  </div>
                  <div className="bg-gris rounded-xl divide-y divide-gris-mid max-h-32 overflow-y-auto">
                    {liqEst.map((e: Estadia) => (
                      <div key={e.id} className="flex justify-between text-xs px-3 py-2">
                        <span className="text-gris-dark">
                          {fmtFecha(e.fecha_desde)} → {fmtFecha(e.fecha_hasta)} · {e.dias} día{e.dias !== 1 ? 's' : ''} × {fmtM(Number(e.monto_dia))}
                          {e.obs && ` · ${e.obs}`}
                        </span>
                        <span className="font-mono font-semibold text-verde shrink-0">+ {fmtM(Number(e.total))}</span>
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
                <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 text-xs sm:text-sm">
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
                  {(detalleLiq.total_estadias ?? 0) > 0 && (
                    <>
                      <span className="text-gris-dark">+ Estadías:</span>
                      <span className="font-mono font-bold text-right text-verde">+ {fmtM(detalleLiq.total_estadias)}</span>
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
                // Un adelanto de saldo (cierre negativo) sólo admite editar
                // descripción y comprobante: fecha/monto son la deuda misma y
                // forma_pago='saldo' se degradaría a "efectivo" (sería mentira).
                // El backend igual los ignora; acá ni los mandamos.
                const esSaldoAdel = editandoAdel.liquidacion_origen_id != null
                updateAdel({
                  id: editandoAdel.id,
                  dto: {
                    ...(esSaldoAdel ? {} : {
                      fecha: data.fecha,
                      monto: Number(data.monto),
                      forma_pago: data.forma_pago === 'transferencia' ? 'transferencia' as const : 'efectivo' as const,
                    }),
                    descripcion: data.descripcion,
                    ...comprobantePatch,
                  },
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
                    else toast(msgErrorLiq(err, 'Error al actualizar'), 'err')
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
          {/* Adelanto nacido de un cierre en negativo: fecha y monto son la deuda
              misma, no se editan (el único camino para cambiarla es reabrir la
              liquidación de origen). Sí se puede editar descripción/comprobante. */}
          {editandoAdel?.liquidacion_origen_id != null && (
            <div className="bg-naranja-light/40 border border-naranja/20 rounded-xl px-3 py-2 text-xs text-naranja-dark leading-relaxed">
              ↩ <b>Saldo de la liquidación N° {editandoAdel.liquidacion_origen_id}</b> — este adelanto lo creó el
              sistema porque esa liquidación cerró en negativo. No hubo entrega de dinero, así que no lleva forma de
              pago ni recibo, y <b>la fecha y el monto no se pueden cambiar</b>: tienen que coincidir con la deuda.
              Lo único editable es la descripción.
              <div className="mt-1">
                ¿El monto está mal o querés anular la deuda? Reabrí la liquidación N° {editandoAdel.liquidacion_origen_id} —
                al reabrirla este adelanto se borra solo.
              </div>
            </div>
          )}

          <Input
            label="Fecha"
            type="date"
            disabled={editandoAdel?.liquidacion_origen_id != null}
            {...formEditAdel.register('fecha')}
          />
          <Input
            label="Monto ($)"
            type="number"
            step="100"
            disabled={editandoAdel?.liquidacion_origen_id != null}
            {...formEditAdel.register('monto')}
          />
          <Input label="Descripción" placeholder="Ej: Adelanto semana del 10/3" {...formEditAdel.register('descripcion')} />

          {/* Forma de pago — no aplica a los adelantos generados por un cierre
              en negativo: ahí nunca hubo entrega de dinero al chofer. */}
          {editandoAdel != null && editandoAdel.liquidacion_origen_id == null && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-gris-dark uppercase tracking-wider">Forma de pago</label>
              <div className="grid grid-cols-2 gap-2">
                {(['efectivo', 'transferencia'] as const).map(fp => {
                  const activo = (formEditAdel.watch('forma_pago') ?? 'efectivo') === fp
                  return (
                    <button
                      key={fp}
                      type="button"
                      onClick={() => formEditAdel.setValue('forma_pago', fp)}
                      className={`px-3 py-2 rounded-lg text-sm font-bold border-[1.5px] transition-colors ${activo ? 'border-azul bg-azul-light text-azul' : 'border-gris-mid bg-white text-gris-dark hover:border-azul'}`}
                    >
                      {fp === 'efectivo' ? '💵 Efectivo' : '🏦 Transferencia'}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {editandoAdel && !editandoAdel.liquidacion_origen_id && (formEditAdel.watch('forma_pago') ?? 'efectivo') === 'efectivo' && (
            <button
              type="button"
              onClick={() => imprimirReciboAdel({
                id:          editandoAdel.id,
                chofer_id:   editandoAdel.chofer_id,
                fecha:       formEditAdel.watch('fecha'),
                monto:       Number(formEditAdel.watch('monto')),
                descripcion: formEditAdel.watch('descripcion'),
                forma_pago:  'efectivo',
              })}
              className="text-sm font-bold text-azul hover:underline text-left"
            >
              🖨 Imprimir recibo para firmar
            </button>
          )}

          {/* Un adelanto de saldo no admite comprobante: no hubo entrega de
              dinero que respaldar, y además reabrir la liquidación de origen lo
              borra por SQL desde la RPC, sin pasar por el backend que limpia el
              bucket — el archivo quedaría huérfano para siempre. */}
          {editandoAdel?.liquidacion_origen_id == null && (
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
          )}
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

          {/* Forma de pago: efectivo (con recibo para firmar) o transferencia. */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-gris-dark uppercase tracking-wider">Forma de pago</label>
            <div className="grid grid-cols-2 gap-2">
              {(['efectivo', 'transferencia'] as const).map(fp => {
                const activo = (formAdel.watch('forma_pago') ?? 'efectivo') === fp
                return (
                  <button
                    key={fp}
                    type="button"
                    onClick={() => formAdel.setValue('forma_pago', fp)}
                    className={`px-3 py-2 rounded-lg text-sm font-bold border-[1.5px] transition-colors ${activo ? 'border-azul bg-azul-light text-azul' : 'border-gris-mid bg-white text-gris-dark hover:border-azul'}`}
                  >
                    {fp === 'efectivo' ? '💵 Efectivo' : '🏦 Transferencia'}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Recibo para firmar: solo tiene sentido en efectivo. */}
          {(formAdel.watch('forma_pago') ?? 'efectivo') === 'efectivo' && (
            <div className="flex flex-col gap-1 bg-azul-light/40 rounded-lg p-3">
              <button
                type="button"
                onClick={() => imprimirReciboAdel({
                  chofer_id:   formAdel.watch('chofer_id'),
                  fecha:       formAdel.watch('fecha'),
                  monto:       Number(formAdel.watch('monto')),
                  descripcion: formAdel.watch('descripcion'),
                  forma_pago:  'efectivo',
                })}
                className="text-sm font-bold text-azul hover:underline text-left"
              >
                🖨 Imprimir recibo para firmar
              </button>
              <p className="text-[11px] text-gris-mid italic">El chofer firma el recibo impreso; después escaneá y subilo abajo como comprobante.</p>
            </div>
          )}

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
        const liqEstCount    = (estadias as Estadia[]).filter(e => e.liquidacion_id === confirmDelLiq.id).length
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
                        onError: (err: unknown) => toast(msgErrorLiq(err, 'Error al eliminar'), 'err'),
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
                  {liqEstCount > 0 && (
                    <li>Las <b>{liqEstCount} estadía{liqEstCount !== 1 ? 's' : ''}</b> quedarán pendientes de pagar.</li>
                  )}
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

      {/* ── Modal registrar estadía ── */}
      <Modal
        open={modalEst}
        onClose={() => setModalEst(false)}
        title="🕐 REGISTRAR ESTADÍA"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalEst(false)}>Cancelar</Button>
            <Button variant="primary" loading={creatingEst} onClick={formEst.handleSubmit(handleCreateEst)}>
              ✓ Guardar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Combobox
            label="Chofer"
            placeholder="Buscar chofer..."
            options={(choferes as Chofer[]).filter(c => c.estado !== 'inactivo').map(c => ({ value: String(c.id), label: c.nombre }))}
            value={String(formEst.watch('chofer_id') ?? '')}
            onChange={(v: string) => formEst.setValue('chofer_id', v)}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Desde" type="date" {...formEst.register('fecha_desde')} />
            <Input label="Hasta" type="date" {...formEst.register('fecha_hasta')} />
          </div>
          <Input label="Monto por día ($)" type="number" step="1000" placeholder="0" {...formEst.register('monto_dia')} />
          <Input label="Observación" placeholder="Ej: espera para descargar en TPR" {...formEst.register('obs')} />

          {/* Preview del total: días corridos (desde→hasta inclusive) × $/día */}
          {(() => {
            const desde = formEst.watch('fecha_desde')
            const hasta = formEst.watch('fecha_hasta')
            const montoDia = Number(formEst.watch('monto_dia'))
            if (!desde || !hasta) return null
            if (desde > hasta) {
              return <p className="text-xs text-rojo">⚠ La fecha "desde" es posterior a "hasta".</p>
            }
            const dias = diasEntreFechas(desde, hasta)
            return (
              <div className="bg-verde-light/60 rounded-xl px-4 py-3 text-sm flex items-center justify-between gap-3">
                <span className="text-gris-dark">
                  {dias} día{dias !== 1 ? 's' : ''}{montoDia > 0 && <> × {fmtM(montoDia)}</>}
                </span>
                {montoDia > 0 && (
                  <span className="font-mono font-bold text-verde text-lg">{fmtM(dias * montoDia)}</span>
                )}
              </div>
            )
          })()}
          <p className="text-[11px] text-gris-mid italic">
            La estadía queda pendiente y se suma al liquidar el período del chofer.
          </p>
        </div>
      </Modal>

      <ModalSolicitudTransferencia open={modalTransf} onClose={() => setModalTransf(false)} />

      {/* Anular una liquidación cerrada que quedó vacía. Va al FINAL del JSX a
          propósito: Modal no usa portal y todos comparten z-50, así que el
          último en el DOM es el que queda arriba. */}
      <Modal
        open={!!anularLiq}
        onClose={() => setAnularLiq(null)}
        width="max-w-lg"
        title="⃠ ANULAR LIQUIDACIÓN"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAnularLiq(null)}>Cancelar</Button>
            <Button
              variant="primary"
              loading={anulando}
              disabled={anularMotivo.trim().length < 5}
              onClick={() => {
                if (!anularLiq) return
                anularLiqMut({ id: anularLiq.id, motivo: anularMotivo.trim() }, {
                  onSuccess: () => {
                    toast(`✓ Liquidación N° ${anularLiq.id} anulada`, 'ok')
                    setAnularLiq(null)
                  },
                  onError: (e: unknown) => toast(msgErrorLiq(e, 'Error al anular'), 'err'),
                })
              }}
            >
              ⃠ Anular
            </Button>
          </>
        }
      >
        {anularLiq && (
          <div className="flex flex-col gap-4 text-sm">
            <div className="bg-gris/40 rounded-card p-3">
              <div className="font-bold text-carbon">
                Liquidación N° {anularLiq.id} ·{' '}
                {(choferes as Chofer[]).find(c => c.id === anularLiq.chofer_id)?.nombre ?? '—'}
              </div>
              <div className="text-xs text-gris-dark mt-1">
                {fmtFecha(anularLiq.fecha_desde)} → {fmtFecha(anularLiq.fecha_hasta)} ·{' '}
                neto {fmtM(anularLiq.total_neto)}
              </div>
            </div>

            <p>
              Esta liquidación está cerrada pero <b>no tiene ningún viaje, adelanto ni estadía
              adentro</b>. Los reportes la cuentan como plata real: es lo que infló la mano de obra
              de julio en $10.538.550.
            </p>
            <p className="text-gris-dark">
              Anularla la saca de todos los cálculos y le quita el PDF, pero <b>no la borra</b>: su
              número ya salió impreso en recibos, así que queda en el Historial marcada como anulada
              con tu nombre, la fecha y el motivo.
            </p>

            <Input
              label="Motivo"
              placeholder="Ej: duplicada de la N° 24, quedó vacía al reliquidar"
              hint="Mínimo 5 caracteres. Es lo que va a leer quien pregunte por esta liquidación dentro de un año."
              value={anularMotivo}
              onChange={e => setAnularMotivo(e.target.value)}
            />
          </div>
        )}
      </Modal>
    </>
  )
}
