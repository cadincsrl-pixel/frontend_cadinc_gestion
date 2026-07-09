'use client'

import { useState, useMemo, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  useTramos, useChoferes, useCamiones, useCanteras, useDepositos, useRutas, useEmpresas,
  useTarifasEmpresa, useCreateRuta,
  useCreateTramo, useUpdateTramo, useDeleteTramo, useRegistrarDescargaTramo, useRevertirDescargaTramo, useMoverTramo,
} from '../hooks/useLogistica'
import { Modal }    from '@/components/ui/Modal'
import { Button }   from '@/components/ui/Button'
import { Select }   from '@/components/ui/Select'
import { Combobox } from '@/components/ui/Combobox'
import { Input }    from '@/components/ui/Input'
import { Badge }    from '@/components/ui/Badge'
import { useToast } from '@/components/ui/Toast'
import { useForm }  from 'react-hook-form'
import { usePermisos } from '@/hooks/usePermisos'
import { uploadRemitoImg } from '@/lib/utils/upload'
import { toISO } from '@/lib/utils/dates'
import { useTramosEnRuta } from '../hooks/useEnRuta'
import { useTramoRelevo } from '../hooks/useTramoRelevo'
import { RelevoSection } from './RelevoSection'
import { ModalSolicitudTurno } from './ModalSolicitudTurno'
import type { Tramo, TramoTipo, Cantera, Deposito, Ruta } from '@/types/domain.types'

// Shape de los forms de este tab. Todos los campos en string porque los
// inputs/selects del proyecto devuelven strings; los parseos a number/null
// se hacen en handleCreate/handleEdit/handleRegistrarDescarga antes de
// llamar al API.
type TramoFormValues = {
  tipo?: TramoTipo
  chofer_id?: string
  camion_id?: string
  empresa_id?: string
  cantera_id?: string
  deposito_id?: string
  fecha_carga?: string
  toneladas_carga?: string
  remito_carga?: string
  remito_carga_img_url?: string
  fecha_descarga?: string
  toneladas_descarga?: string
  remito_descarga?: string
  remito_descarga_img_url?: string
  fecha_vacio?: string
  // Solo se usa cuando tipo='vacio' en el modal manual. Default false → el
  // tramo se crea `en_curso` (asumimos que se carga mientras está pasando).
  // Si el user lo carga retrospectivamente, lo tilda y va `completado`.
  vacio_completado?: boolean
  obs?: string
}

export function ViajesTab() {
  const toast = useToast()
  // Permisos: deshabilitar (no ocultar — CLAUDE.md §6) los botones según
  // capacidad. El backend valida igual; esto evita clicks que rebotan 403.
  const { puedeCrear, puedeEditar, puedeEliminar } = usePermisos('logistica')
  const { data: tramos    = [] } = useTramos()
  const { data: choferes  = [] } = useChoferes()
  const { data: camiones  = [] } = useCamiones()
  const { data: canteras  = [] } = useCanteras()
  const { data: depositos = [] } = useDepositos()
  const { data: rutas     = [] } = useRutas()
  const { data: empresas  = [] } = useEmpresas()
  // Asociaciones para filtrar dropdowns en el modal de tramo:
  // - empresa→canteras viene de `tarifas_empresa_cantera` (si una empresa tiene
  //   tarifa cargada con una cantera, esa empresa carga ahí).
  // - cantera→depósitos viene de `rutas` (si hay ruta entre ellos, son válidos).
  // Fallback: si no hay registros para el ítem elegido, mostramos todo.
  const { data: tarifasEmp = [] } = useTarifasEmpresa()
  const canterasPorEmpresa = useMemo(() => {
    const m = new Map<number, Set<number>>()
    for (const t of tarifasEmp as Array<{ empresa_id: number; cantera_id: number }>) {
      if (!m.has(t.empresa_id)) m.set(t.empresa_id, new Set())
      m.get(t.empresa_id)!.add(t.cantera_id)
    }
    return m
  }, [tarifasEmp])
  const depositosPorCantera = useMemo(() => {
    const m = new Map<number, Set<number>>()
    for (const r of rutas as Array<{ cantera_id: number; deposito_id: number }>) {
      if (!m.has(r.cantera_id)) m.set(r.cantera_id, new Set())
      m.get(r.cantera_id)!.add(r.deposito_id)
    }
    return m
  }, [rutas])
  const canterasPorDeposito = useMemo(() => {
    const m = new Map<number, Set<number>>()
    for (const r of rutas as Array<{ cantera_id: number; deposito_id: number }>) {
      if (!m.has(r.deposito_id)) m.set(r.deposito_id, new Set())
      m.get(r.deposito_id)!.add(r.cantera_id)
    }
    return m
  }, [rutas])

  // Para preselección automática del depósito en el modal Nuevo Tramo: para
  // cada cantera, qué depósito acumuló más DESCARGAS históricas (= tramos
  // cargado con fecha_descarga registrada). Solo cuenta tramos completados
  // para evitar sesgar con tramos creados-y-descartados.
  const depositoMasFrecuentePorCantera = useMemo(() => {
    const conteo = new Map<number, Map<number, number>>() // cantera → (depo → count)
    for (const t of tramos) {
      if (t.tipo !== 'cargado') continue
      if (!t.fecha_descarga) continue
      if (t.cantera_id == null || t.deposito_id == null) continue
      if (!conteo.has(t.cantera_id)) conteo.set(t.cantera_id, new Map())
      const m = conteo.get(t.cantera_id)!
      m.set(t.deposito_id, (m.get(t.deposito_id) ?? 0) + 1)
    }
    const winner = new Map<number, number>() // cantera → depósito top
    for (const [canteraId, deposCount] of conteo) {
      let best: { dep: number; n: number } | null = null
      for (const [dep, n] of deposCount) {
        if (!best || n > best.n) best = { dep, n }
      }
      if (best) winner.set(canteraId, best.dep)
    }
    return winner
  }, [tramos])

  // Devuelve options de canteras filtradas por empresa.
  // - Sin empresa seleccionada → mostrar todas.
  // - Con empresa pero sin tarifas cargadas → lista vacía (el user ve que
  //   falta cargar la tarifa, en vez de aparecerle todas como si fuera ok).
  // - `selectedId` se preserva siempre aunque no esté asociado, para no
  //   perder la selección actual al editar tramos viejos.
  function canteraOptions(empresaIdRaw: string | undefined, selectedIdRaw: string | undefined) {
    const empresaId = empresaIdRaw ? Number(empresaIdRaw) : null
    const selectedId = selectedIdRaw ? Number(selectedIdRaw) : null
    const allowed: Set<number> | null = empresaId != null
      ? (canterasPorEmpresa.get(empresaId) ?? new Set<number>())
      : null
    return (canteras as any[])
      // canteraOptions solo se usa para tramos CARGADO → excluir lugares
      // operativos (no facturables, p.ej. CHIVILCOY); preservamos el
      // seleccionado para no romper la edición de tramos viejos.
      .filter((c: any) => (allowed === null || allowed.has(c.id) || c.id === selectedId) && (!c.operativo || c.id === selectedId))
      .map((c: any) => ({ value: String(c.id), label: c.nombre, sub: c.localidad ?? undefined }))
  }
  // Mostramos TODOS los depósitos (antes filtrábamos a los que ya tenían ruta,
  // lo que bloqueaba pares nuevos). Si hay cantera elegida, los agrupamos por
  // "con km" vs "sin km todavía"; el km faltante se carga inline bajo el grid
  // (RutaFaltanteInline), sin tener que ir a Lugares.
  function depositoOptions(canteraIdRaw: string | undefined, selectedIdRaw?: string | undefined) {
    const canteraId = canteraIdRaw ? Number(canteraIdRaw) : null
    const selectedId = selectedIdRaw ? Number(selectedIdRaw) : null
    const conRuta = canteraId != null ? depositosPorCantera.get(canteraId) : null
    // depositoOptions solo se usa para tramos CARGADO → excluir lugares
    // operativos (no facturables); preservamos el seleccionado para edición.
    return (depositos as Deposito[])
      .filter(d => !d.operativo || d.id === selectedId)
      // Una vez elegido el punto de carga, mostramos SOLO los depósitos que
      // tienen km (ruta) cargado desde ese punto de carga. Antes de elegirlo
      // (conRuta == null) no podemos filtrar, así que se ven todos. El
      // seleccionado se preserva siempre (edición).
      .filter(d => conRuta == null || conRuta.has(d.id) || d.id === selectedId)
      .map(d => ({
        value: String(d.id),
        label: d.nombre,
        sub:   d.localidad ?? undefined,
      }))
  }
  // Destino de un tramo VACÍO (reposicionamiento). A diferencia del cargado,
  // un vacío puede ir a CUALQUIER punto — incluidos lugares operativos sin
  // ruta previa (ej. Chivilcoy → Yerba Buena). Por eso NO filtramos por ruta:
  // mostramos todas las canteras y ponemos primero las que ya tienen km desde
  // el origen (sugerencia). Si falta el km, RutaFaltanteInline lo deja cargar
  // (se necesita al liquidar). Antes esto filtraba duro por ruta y dejaba el
  // dropdown vacío para pares nuevos → no se podía crear el tramo.
  function canteraOptionsPorDeposito(depositoIdRaw: string | undefined, selectedIdRaw: string | undefined) {
    const depositoId = depositoIdRaw ? Number(depositoIdRaw) : null
    const selectedId = selectedIdRaw ? Number(selectedIdRaw) : null
    const conRuta = depositoId != null ? (canterasPorDeposito.get(depositoId) ?? new Set<number>()) : null
    return (canteras as any[])
      .map((c: any) => ({
        value: String(c.id),
        label: c.nombre,
        sub:   c.localidad ?? undefined,
        _prio: (conRuta?.has(c.id) || c.id === selectedId) ? 0 : 1,
      }))
      .sort((a, b) => a._prio - b._prio)
      .map(({ _prio, ...o }) => o)
  }
  // Distancia + ETA al destino para tramos cargados en curso (Google Maps).
  // El hook devuelve [] si el endpoint falla — no rompe el render.
  const { data: enRuta    = [] } = useTramosEnRuta()
  const enRutaPorTramo = useMemo(() => {
    const m = new Map<number, { distancia_m: number | null; duracion_s: number | null; duracion_traffic_s: number | null }>()
    for (const r of enRuta) m.set(r.tramo_id, {
      distancia_m: r.distancia_m,
      duracion_s: r.duracion_s,
      duracion_traffic_s: r.duracion_traffic_s,
    })
    return m
  }, [enRuta])

  const { mutate: createTramo,  mutateAsync: createTramoAsync, isPending: creating } = useCreateTramo()
  const { mutate: updateTramo,  isPending: updating    } = useUpdateTramo()
  const { mutate: deleteTramo  } = useDeleteTramo()
  const { mutate: regDescarga,  isPending: descargando } = useRegistrarDescargaTramo()
  const { mutate: revDescarga,  isPending: revirtiendo } = useRevertirDescargaTramo()
  const { mutate: moverTramo   } = useMoverTramo()
  const createRuta = useCreateRuta()

  const [modalNuevo,      setModalNuevo]      = useState(false)
  const [modalSolicitud,  setModalSolicitud]  = useState(false)
  const [editando,      setEditando]      = useState<Tramo | null>(null)
  const [descargaTramo, setDescargaTramo] = useState<Tramo | null>(null)
  const [revertirTramo, setRevertirTramo] = useState<Tramo | null>(null)
  // Modal post-descarga: pregunta a qué cantera vuelve para crear el
  // tramo `vacio` siguiente. Guardamos el tramo recién descargado para
  // saber chofer/camión/depósito de origen del vacío.
  const [proximaCarga,  setProximaCarga]  = useState<Tramo | null>(null)
  const [canteraVuelta, setCanteraVuelta] = useState<string>('')
  // Override manual del chofer de la vuelta vacía. Por default el vacío lo
  // maneja quien quedó con el camión en destino (ver `choferVueltaSugerido`);
  // null = usar la sugerencia. Se resetea al abrir/cerrar el modal.
  const [choferVueltaOverride, setChoferVueltaOverride] = useState<string | null>(null)
  const [filtChofer,    setFiltChofer]    = useState('')
  const [filtTipo,      setFiltTipo]      = useState('cargado')
  const [filtEstado,    setFiltEstado]    = useState('en_curso')
  const [filtDesde,     setFiltDesde]     = useState('')
  const [filtHasta,     setFiltHasta]     = useState('')

  const formNuevo    = useForm<TramoFormValues>({ defaultValues: { tipo: 'cargado', fecha_carga: hoy(), fecha_vacio: hoy(), remito_carga_img_url: '', remito_descarga_img_url: '' } })
  const formEdit     = useForm<TramoFormValues>()
  const formDescarga = useForm<TramoFormValues>({ defaultValues: { fecha_descarga: hoy(), remito_descarga_img_url: '' } })
  const [uploading, setUploading] = useState<string | null>(null)

  // Deep link: si vino ?tramo=ID en la URL (por ejemplo desde Facturación
  // clickeando un remito), abrimos el modal de edición de ese tramo en
  // cuanto se carga el listado. Después limpiamos el query param para no
  // re-abrir si el user navega adentro de la pestaña.
  const searchParams = useSearchParams()
  const router = useRouter()
  useEffect(() => {
    const tramoIdRaw = searchParams.get('tramo')
    if (!tramoIdRaw) return
    const tramoId = Number(tramoIdRaw)
    if (!Number.isFinite(tramoId)) return
    const t = (tramos as Tramo[]).find(t => t.id === tramoId)
    if (!t) return
    openEdit(t)
    // Quitamos solo el query param 'tramo', preservando 'tab=viajes' u otros.
    const sp = new URLSearchParams(searchParams.toString())
    sp.delete('tramo')
    router.replace(`/logistica?${sp.toString()}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tramos])

  async function handleUpload(form: { setValue: (k: any, v: any) => void }, field: string, file: File | undefined) {
    if (!file) return
    setUploading(field)
    try {
      // uploadRemitoImg valida mime (imagen/PDF) y tamaño (≤8 MB) y tira
      // UploadValidationError con mensaje legible. El bucket también
      // restringe server-side como defensa en profundidad.
      const url = await uploadRemitoImg(file)
      form.setValue(field, url)
      toast('✓ Remito subido', 'ok')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error al subir', 'err')
    } finally {
      setUploading(null)
    }
  }

  const tipoNuevo = formNuevo.watch('tipo')

  // Fecha representativa del tramo para el filtro de rango
  function fechaRef(t: Tramo): string | null {
    return t.tipo === 'cargado'
      ? (t.fecha_carga ?? t.fecha_descarga ?? null)
      : (t.fecha_vacio ?? null)
  }

  // ── Detección de tramos consecutivos del mismo tipo ──────────────
  // Ciclo normal: vacío → cargado → vacío → cargado. Si el último tramo
  // del chofer o del camión tiene el mismo tipo que el nuevo, es probable
  // que sea una duplicación.
  function getUltimoTramoDe(filtro: (t: Tramo) => boolean): Tramo | null {
    const list = tramos
      .filter(filtro)
      .sort((a, b) => {
        const fa = fechaRef(a) ?? ''
        const fb = fechaRef(b) ?? ''
        if (fa !== fb) return fb.localeCompare(fa)  // más reciente primero
        const oa = a.orden_dia ?? a.id
        const ob = b.orden_dia ?? b.id
        return ob - oa
      })
    return list[0] ?? null
  }

  /**
   * Detecta repetición de tipo vs último tramo del chofer/camión.
   * Devuelve null si no hay repetición, o `{ label, ultimo }` con detalle
   * para el warning.
   */
  function detectarRepeticion(
    nuevoTipo: 'cargado' | 'vacio',
    choferId: number | null,
    camionId: number | null,
  ): { fuente: 'chofer' | 'camion' | 'ambos'; ultimoChofer: Tramo | null; ultimoCamion: Tramo | null } | null {
    const ultimoChofer = choferId ? getUltimoTramoDe(t => t.chofer_id === choferId) : null
    const ultimoCamion = camionId ? getUltimoTramoDe(t => t.camion_id === camionId) : null
    const choferRepite = ultimoChofer?.tipo === nuevoTipo
    const camionRepite = ultimoCamion?.tipo === nuevoTipo
    if (!choferRepite && !camionRepite) return null
    const fuente: 'chofer' | 'camion' | 'ambos' =
      choferRepite && camionRepite ? 'ambos' : choferRepite ? 'chofer' : 'camion'
    return { fuente, ultimoChofer: choferRepite ? ultimoChofer : null, ultimoCamion: camionRepite ? ultimoCamion : null }
  }

  // Set de tramo IDs "sospechosos": tienen un tramo previo del mismo CHOFER con
  // el mismo tipo (capa 3: marca visual en la lista).
  //
  // OJO: NO se chequea por camión. Un camión cambia de chofer (lo dejan en un
  // lado y lo agarra otro), así que el "repetido por camión" daba falsos
  // positivos — el primer tramo del nuevo chofer matcheaba el último del chofer
  // anterior en ese camión (caso real: Mario sube a un camión que otro dejó en
  // Chivilcoy). La alternancia cargado/vacío es por chofer, no por camión.
  const tramosRepetidos = useMemo(() => {
    const sorted = [...tramos].sort((a, b) => {
      const fa = fechaRef(a) ?? ''
      const fb = fechaRef(b) ?? ''
      if (fa !== fb) return fa.localeCompare(fb)  // más antiguo primero
      const oa = a.orden_dia ?? a.id
      const ob = b.orden_dia ?? b.id
      return oa - ob
    })
    const lastByChofer = new Map<number, Tramo>()
    const repetidos = new Set<number>()
    for (const t of sorted) {
      const prevChofer = lastByChofer.get(t.chofer_id)
      if (prevChofer && prevChofer.tipo === t.tipo) {
        repetidos.add(t.id)
      }
      lastByChofer.set(t.chofer_id, t)
    }
    return repetidos
  }, [tramos])

  const filtered = tramos.filter((t: Tramo) => {
    if (filtChofer && String(t.chofer_id) !== filtChofer) return false
    if (filtTipo   && t.tipo   !== filtTipo)   return false
    if (filtEstado && t.estado !== filtEstado) return false
    if (filtDesde || filtHasta) {
      const f = fechaRef(t)
      if (!f) return false
      if (filtDesde && f < filtDesde) return false
      if (filtHasta && f > filtHasta) return false
    }
    return true
  })

  function getKm(tramo: Tramo) {
    if (!tramo.cantera_id || !tramo.deposito_id) return null
    const ruta = rutas.find(r => r.cantera_id === tramo.cantera_id && r.deposito_id === tramo.deposito_id)
    return ruta?.km_ida_vuelta ?? null
  }

  // Autocompletado del punto donde quedó parado el chofer/camión.
  //
  // Reglas:
  // 1) Solo pre-cargamos UN campo: el "punto donde quedó parado" en el
  //    último tramo. Antes pre-cargábamos cantera Y depósito del último,
  //    lo que sugería REPETIR un viaje ya completado y arrastraba datos
  //    incorrectos al modal (caso reportado: chofer con último cargado
  //    completado, al abrir Nuevo Tramo aparecía la ruta vieja antes de
  //    elegir empresa).
  // 2) Solo pre-cargamos cuando hay CAMBIO de tipo (chofer cambia de
  //    cargado a vacío o viceversa). Si el nuevo es del mismo tipo que el
  //    último, no pre-cargamos — el user va a elegir todo manual.
  //      - Último cargado → chofer en depósito → si nuevo=vacío, pre-cargar deposito_id.
  //      - Último vacío   → chofer en cantera  → si nuevo=cargado, pre-cargar cantera_id.
  // 3) Prioridad CHOFER sobre CAMIÓN, con el mismo criterio en ambos.
  // 4) Nunca pisamos lo que el user ya seleccionó manualmente.
  const watchModalAbierto = modalNuevo
  const watchTipoNuevo    = formNuevo.watch('tipo')
  const watchCamionNuevo  = formNuevo.watch('camion_id')
  const watchChoferNuevo  = formNuevo.watch('chofer_id')
  useEffect(() => {
    if (!watchModalAbierto) return

    const setOrigenSiVacio = (campo: 'cantera_id' | 'deposito_id', valor: number | null | undefined) => {
      if (valor == null) return
      if (!formNuevo.getValues(campo)) formNuevo.setValue(campo, String(valor))
    }

    const aplicarSugerencia = (ultimo: Tramo | null, nuevoTipo: string | undefined) => {
      if (!ultimo) return
      if (ultimo.tipo === 'cargado' && nuevoTipo === 'vacio') {
        setOrigenSiVacio('deposito_id', ultimo.deposito_id)
      } else if (ultimo.tipo === 'vacio' && nuevoTipo === 'cargado') {
        setOrigenSiVacio('cantera_id', ultimo.cantera_id)
      }
    }

    if (watchChoferNuevo) {
      const choferId = Number(watchChoferNuevo)
      aplicarSugerencia(getUltimoTramoDe(t => t.chofer_id === choferId), watchTipoNuevo)
      return
    }

    if (watchCamionNuevo) {
      const camionId = Number(watchCamionNuevo)
      aplicarSugerencia(getUltimoTramoDe(t => t.camion_id === camionId), watchTipoNuevo)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchModalAbierto, watchChoferNuevo, watchCamionNuevo, watchTipoNuevo])

  async function handleCreate(data: TramoFormValues) {
    const choferId = data.chofer_id ? Number(data.chofer_id) : null
    const camionId = data.camion_id ? Number(data.camion_id) : null
    const nuevoTipo = data.tipo as 'cargado' | 'vacio'
    const newCanteraId = data.cantera_id  ? Number(data.cantera_id)  : null
    const newDepositoId = data.deposito_id ? Number(data.deposito_id) : null
    const empresaIdNum = data.empresa_id ? Number(data.empresa_id) : null

    // Empresa transportista obligatoria en cargado (necesaria para facturar).
    if (nuevoTipo === 'cargado' && !empresaIdNum) {
      toast('Tenés que elegir la empresa transportista para un tramo cargado', 'err')
      return
    }

    // ── Auto-vacío entre cargados ─────────────────────────────────
    // Si el nuevo es CARGADO y el último tramo del chofer/camión también
    // fue CARGADO (con destino conocido), entre ambos hubo un viaje vacío
    // implícito (depósito anterior → cantera nueva). Lo detectamos y
    // ofrecemos crearlo automáticamente.
    let vacioAuto: { cantera_id: number; deposito_id: number; km_ida_vuelta: number | null } | null = null
    if (nuevoTipo === 'cargado' && newCanteraId != null) {
      const ultimo =
        (choferId ? getUltimoTramoDe(t => t.chofer_id === choferId) : null) ??
        (camionId ? getUltimoTramoDe(t => t.camion_id === camionId) : null)

      // "No hay desplazamiento" solo aplica si el último depósito y la
      // cantera nueva son el MISMO lugar físico (mismo nombre normalizado).
      // No se puede comparar deposito_id con cantera_id directamente: son
      // PKs de tablas distintas y pueden coincidir numéricamente sin ser
      // el mismo lugar (ej: cantera id=1 "Cristamine" vs depósito id=1
      // "Manzano").
      const norm = (s?: string | null) => (s ?? '').trim().toUpperCase()
      const depPrevNom = ultimo?.deposito_id != null
        ? norm(depositos.find(d => d.id === ultimo.deposito_id)?.nombre)
        : ''
      const canteraNuevaNom = norm(canteras.find(c => c.id === newCanteraId)?.nombre)
      const mismoLugar = depPrevNom !== '' && depPrevNom === canteraNuevaNom

      if (ultimo
        && ultimo.tipo === 'cargado'
        && ultimo.deposito_id != null
        && !mismoLugar
      ) {
        const ruta = rutas.find(r =>
          r.cantera_id === newCanteraId && r.deposito_id === ultimo.deposito_id
        )
        const cantNom = canteras.find(c => c.id === newCanteraId)?.nombre ?? `#${newCanteraId}`
        const depNom = depositos.find(d => d.id === ultimo.deposito_id)?.nombre ?? `#${ultimo.deposito_id}`

        if (ruta) {
          const msg =
            `Detecté un tramo vacío implícito entre el último cargado y este:\n\n` +
            `  ${depNom} → ${cantNom}\n` +
            `  ${ruta.km_ida_vuelta ?? '—'} km (un sentido)\n\n` +
            `¿Crear el tramo vacío + el cargado juntos?`
          if (confirm(msg)) {
            vacioAuto = {
              cantera_id: newCanteraId,
              deposito_id: ultimo.deposito_id,
              km_ida_vuelta: ruta.km_ida_vuelta ?? null,
            }
          }
          // Si dijo no, dejamos pasar al flujo normal y el warning de
          // "consecutivo mismo tipo" abajo cubre como fallback.
        } else {
          // Sin ruta para el vacío implícito. Antes bloqueábamos y mandábamos a
          // Lugares; ahora ofrecemos cargar el km al toque y seguir (Fase 2).
          const kmRaw = prompt(
            `Falta el km de la ruta del vacío implícito:\n\n` +
            `  ${depNom} → ${cantNom}\n\n` +
            `Ingresá los km (un sentido) para cargar la ruta y crear el vacío + el cargado.\n` +
            `(Cancelá para crear sólo el cargado, sin el vacío.)`
          )
          const km = kmRaw != null ? Number(kmRaw.replace(/[^\d.]/g, '')) : NaN
          if (Number.isFinite(km) && km > 0) {
            try {
              await createRuta.mutateAsync({
                cantera_id: newCanteraId, deposito_id: ultimo.deposito_id, km_ida_vuelta: km, obs: '',
              })
              vacioAuto = { cantera_id: newCanteraId, deposito_id: ultimo.deposito_id, km_ida_vuelta: km }
            } catch {
              toast('No se pudo guardar la ruta; se crea sólo el cargado', 'err')
            }
          } else if (kmRaw != null) {
            toast('Km inválido; se crea sólo el cargado', 'err')
          }
          // Si canceló (kmRaw == null) o falló: seguimos sin vacioAuto.
        }
      }
    }

    // ── Warning fallback: consecutivo mismo tipo ──
    // Si no auto-creamos vacío (caso raro: último vacío repetido, o el user
    // declinó la auto-creación), avisamos.
    if (!vacioAuto) {
      const rep = detectarRepeticion(nuevoTipo, choferId, camionId)
      if (rep) {
        const chofNom = rep.ultimoChofer ? choferes.find(c => c.id === rep.ultimoChofer!.chofer_id)?.nombre : null
        const camPat  = rep.ultimoCamion ? camiones.find(c => c.id === rep.ultimoCamion!.camion_id)?.patente : null
        const partes: string[] = []
        if (rep.ultimoChofer) partes.push(`el chofer ${chofNom ?? `#${rep.ultimoChofer.chofer_id}`} (último: ${rep.ultimoChofer.tipo.toUpperCase()} el ${fechaRef(rep.ultimoChofer) ?? '?'})`)
        if (rep.ultimoCamion) partes.push(`el camión ${camPat ?? `#${rep.ultimoCamion.camion_id}`} (último: ${rep.ultimoCamion.tipo.toUpperCase()} el ${fechaRef(rep.ultimoCamion) ?? '?'})`)
        const msg =
          `⚠ Estás por crear un tramo ${nuevoTipo.toUpperCase()}, pero ` +
          partes.join(' y ') +
          ' ya tenía ese mismo tipo. ' +
          'El ciclo normal es vacío → cargado → vacío. ' +
          '\n\n¿Crear igual?'
        if (!confirm(msg)) return
      }
    }

    const dto: any = {
      chofer_id:   choferId,
      camion_id:   camionId,
      tipo:        data.tipo,
      empresa_id:  data.empresa_id ? Number(data.empresa_id) : null,
      cantera_id:  newCanteraId,
      deposito_id: newDepositoId,
      obs:         data.obs ?? '',
    }
    if (data.tipo === 'cargado') {
      dto.fecha_carga          = data.fecha_carga
      dto.toneladas_carga      = data.toneladas_carga ? Number(data.toneladas_carga) : undefined
      dto.remito_carga         = data.remito_carga ?? ''
      dto.remito_carga_img_url = data.remito_carga_img_url || null
    } else {
      dto.fecha_vacio = data.fecha_vacio
      // Override del default del backend (vacio→completado). El caso común es
      // "lo cargo mientras está pasando" → en_curso. Solo si el user tilda
      // "ya completado" dejamos que aplique el default.
      if (!data.vacio_completado) {
        dto.estado = 'en_curso'
      }
    }

    // Si hay vacío auto, encadenamos. Sino, flujo normal.
    if (vacioAuto) {
      const dtoVacio: any = {
        chofer_id:   choferId,
        camion_id:   camionId,
        tipo:        'vacio',
        empresa_id:  null,
        cantera_id:  vacioAuto.cantera_id,
        deposito_id: vacioAuto.deposito_id,
        fecha_vacio: data.fecha_carga,
        obs:         'Auto-generado entre cargados',
      }
      try {
        await createTramoAsync(dtoVacio)
        await createTramoAsync(dto)
        toast('✓ Tramo vacío + cargado registrados', 'ok')
        setModalNuevo(false)
        formNuevo.reset({ tipo: 'cargado', fecha_carga: hoy(), fecha_vacio: hoy() })
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Error al registrar tramos', 'err')
      }
      return
    }

    createTramo(dto, {
      onSuccess: () => {
        toast('✓ Tramo registrado', 'ok')
        setModalNuevo(false)
        formNuevo.reset({ tipo: 'cargado', fecha_carga: hoy(), fecha_vacio: hoy() })
      },
      onError: () => toast('Error al registrar tramo', 'err'),
    })
  }

  // Revierte un tramo `vacio completado` a `en_curso`. Útil cuando el user
  // creó el tramo después de la descarga pero el camión todavía no llegó a
  // la próxima cantera de carga, así aparece en el seguimiento GPS.
  function handleMarcarEnCurso(tramo: Tramo) {
    if (!confirm(`¿Marcar el tramo #${tramo.id} como "en curso"? Indica que el camión todavía no llegó al destino.`)) return
    updateTramo(
      { id: tramo.id, dto: { estado: 'en_curso' } },
      {
        onSuccess: () => toast('✓ Tramo en curso', 'ok'),
        onError:   () => toast('Error al actualizar', 'err'),
      },
    )
  }

  // Finaliza un vacío `en_curso` (lo pasa a `completado`) sin esperar a que el
  // camión vuelva a cargar. Caso típico: el chofer se va de descanso / lo
  // reemplazan y su tramo vacío debe entrar YA a su liquidación (la liquidación
  // sólo levanta tramos `completado`).
  function handleFinalizarVacio(tramo: Tramo) {
    if (!confirm(`¿Finalizar el tramo vacío #${tramo.id}? Pasa a "completado" y queda disponible para liquidar al chofer.`)) return
    updateTramo(
      { id: tramo.id, dto: { estado: 'completado' } },
      {
        onSuccess: () => toast('✓ Tramo finalizado — disponible para liquidar', 'ok'),
        onError:   () => toast('Error al finalizar el tramo', 'err'),
      },
    )
  }

  function handleRegistrarDescarga(data: TramoFormValues) {
    if (!descargaTramo) return
    if (!confirmarSiRemitoNoCoincide(descargaTramo.remito_carga, data.remito_descarga)) return
    const tramoOriginal = descargaTramo
    regDescarga(
      {
        id: descargaTramo.id,
        dto: {
          fecha_descarga:          data.fecha_descarga ?? hoy(),
          toneladas_descarga:      data.toneladas_descarga ? Number(data.toneladas_descarga) : undefined,
          remito_descarga:         data.remito_descarga ?? '',
          remito_descarga_img_url: data.remito_descarga_img_url || null,
        },
      },
      {
        onSuccess: () => {
          toast('✓ Descarga registrada — tramo completado', 'ok')
          setDescargaTramo(null)
          formDescarga.reset({ fecha_descarga: hoy(), remito_descarga_img_url: '' })
          // Después de cerrar el modal de descarga, abrimos el modal "¿A
          // dónde vuelve?" sugiriendo la cantera más frecuente del camión
          // en el mes en curso.
          const sug = canteraSugeridaPara(tramoOriginal.camion_id)
          setCanteraVuelta(sug != null ? String(sug) : '')
          setChoferVueltaOverride(null)
          setProximaCarga(tramoOriginal)
        },
        onError:   () => toast('Error al registrar descarga', 'err'),
      }
    )
  }

  // Devuelve el cantera_id más frecuente del camión en el mes en curso
  // sobre tramos cargados. Null si no hay data suficiente.
  function canteraSugeridaPara(camionId: number): number | null {
    const inicioMes = (() => {
      const d = new Date()
      return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
    })()
    const counts = new Map<number, number>()
    for (const t of (tramos as Tramo[])) {
      if (t.camion_id !== camionId) continue
      if (t.tipo !== 'cargado')     continue
      if (!t.fecha_carga || t.fecha_carga < inicioMes) continue
      if (t.cantera_id == null)     continue
      counts.set(t.cantera_id, (counts.get(t.cantera_id) ?? 0) + 1)
    }
    let best: { id: number; count: number } | null = null
    for (const [id, count] of counts) {
      if (!best || count > best.count) best = { id, count }
    }
    return best?.id ?? null
  }

  // Relevo del tramo que se acaba de descargar (si lo hubo). Sirve para que
  // la vuelta vacía la maneje por default quien quedó con el camión.
  const { data: relevoProxima = [] } = useTramoRelevo(proximaCarga?.id ?? null)

  // Chofer sugerido para el vacío de vuelta: si el cargado tuvo relevo, el
  // chofer de mayor `orden` (el relevista que hizo la descarga y quedó con el
  // camión en destino); si no, el titular del cargado.
  const choferVueltaSugerido = useMemo<number | null>(() => {
    if (!proximaCarga) return null
    if (relevoProxima.length > 0) {
      const ultimo = [...relevoProxima].sort((a, b) => b.orden - a.orden)[0]
      return ultimo?.chofer_id ?? proximaCarga.chofer_id
    }
    return proximaCarga.chofer_id
  }, [proximaCarga, relevoProxima])

  // Valor efectivo del chofer de la vuelta: override manual si lo hubo, si no
  // la sugerencia relevo-aware.
  const choferVueltaId = choferVueltaOverride != null && choferVueltaOverride !== ''
    ? Number(choferVueltaOverride)
    : choferVueltaSugerido
  const vueltaPorRelevo = relevoProxima.length > 0 && choferVueltaOverride == null

  async function handleCrearVacioVuelta() {
    if (!proximaCarga) return
    const canteraIdNum = canteraVuelta ? Number(canteraVuelta) : null
    if (!canteraIdNum) { toast('Elegí un punto de carga', 'err'); return }
    if (proximaCarga.deposito_id == null) {
      toast('El tramo no tiene depósito asignado', 'err')
      return
    }
    try {
      await createTramoAsync({
        chofer_id:   choferVueltaId ?? proximaCarga.chofer_id,
        camion_id:   proximaCarga.camion_id,
        tipo:        'vacio',
        empresa_id:  null,
        cantera_id:  canteraIdNum,
        deposito_id: proximaCarga.deposito_id,
        fecha_vacio: hoy(),
        // Forzar en_curso para que aparezca en /maps/en-ruta con
        // seguimiento GPS hasta llegar a la próxima cantera.
        estado:      'en_curso',
        obs:         'Tramo vacío auto-generado al registrar descarga',
      } as any)
      toast('✓ Tramo vacío creado · seguimiento activo', 'ok')
      setProximaCarga(null)
      setCanteraVuelta('')
      setChoferVueltaOverride(null)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error al crear el vacío', 'err')
    }
  }

  function handleRevertirDescarga() {
    if (!revertirTramo) return
    revDescarga(revertirTramo.id, {
      onSuccess: () => { toast('✓ Descarga revertida — tramo en curso', 'ok'); setRevertirTramo(null) },
      onError:   (err: any) => {
        // Log completo para que en DevTools se pueda diagnosticar el error real
        // (status, body, etc.) en lugar de depender solo del toast.
        console.error('[revertir-descarga] error:', err, { status: err?.status, body: err?.body })

        const code = err?.body?.error || err?.code
        if (code === 'TRAMO_LIQUIDADO')    toast('No se puede revertir: el tramo está liquidado', 'err')
        else if (code === 'TRAMO_COBRADO') toast('No se puede revertir: el tramo está cobrado', 'err')
        else if (code === 'TRAMO_SIN_DESCARGA') toast('El tramo no tiene descarga registrada', 'err')
        else if (code === 'TRAMO_NO_EXISTE')    toast('Tramo no encontrado', 'err')
        // Fallback: mostrar el mensaje real del backend/cliente. apiPost lanza
        // HttpError con message amigable (ej: "Sesión expirada...") o el body.error
        // del backend. Si no hay mensaje, caemos a un texto genérico.
        else toast(err?.message || 'Error al revertir la descarga', 'err')
        setRevertirTramo(null)
      },
    })
  }

  function openEdit(tramo: Tramo) {
    formEdit.reset({
      chofer_id:         String(tramo.chofer_id),
      camion_id:         String(tramo.camion_id),
      tipo:              tramo.tipo,
      empresa_id:        tramo.empresa_id  ? String(tramo.empresa_id)  : '',
      cantera_id:        tramo.cantera_id  ? String(tramo.cantera_id)  : '',
      deposito_id:       tramo.deposito_id ? String(tramo.deposito_id) : '',
      fecha_carga:             tramo.fecha_carga    ?? '',
      toneladas_carga:         tramo.toneladas_carga != null ? String(tramo.toneladas_carga) : '',
      remito_carga:            tramo.remito_carga    ?? '',
      remito_carga_img_url:    tramo.remito_carga_img_url ?? '',
      fecha_descarga:          tramo.fecha_descarga     ?? '',
      toneladas_descarga:      tramo.toneladas_descarga != null ? String(tramo.toneladas_descarga) : '',
      remito_descarga:         tramo.remito_descarga    ?? '',
      remito_descarga_img_url: tramo.remito_descarga_img_url ?? '',
      fecha_vacio:       tramo.fecha_vacio ?? '',
      obs:               tramo.obs ?? '',
    })
    setEditando(tramo)
  }

  // Compara nº de remito carga vs descarga (trim + uppercase). Si difieren
  // y ambos están cargados, muestra confirm. Devuelve true si se puede
  // proceder, false si el usuario canceló.
  function confirmarSiRemitoNoCoincide(remitoCarga?: string | null, remitoDescarga?: string | null): boolean {
    const a = (remitoCarga ?? '').trim()
    const b = (remitoDescarga ?? '').trim()
    if (!a || !b) return true
    if (a.toUpperCase() === b.toUpperCase()) return true
    return confirm(
      `⚠ ATENCIÓN — los nº de remito no coinciden:\n\n` +
      `  Carga:    ${a}\n` +
      `  Descarga: ${b}\n\n` +
      `Esto suele indicar que estás cargando la descarga al chofer / tramo equivocado.\n\n` +
      `¿Querés guardar igual?`,
    )
  }

  function handleEdit(data: TramoFormValues) {
    if (!editando) return
    if (!confirmarSiRemitoNoCoincide(data.remito_carga, data.remito_descarga)) return
    // Un cargado se considera completado cuando tiene la descarga registrada
    // (fecha de descarga). Editar y completar la descarga acá debe cerrarlo,
    // igual que el botón "registrar descarga" (antes quedaba en `en_curso`).
    // Para vacíos no tocamos el estado.
    const tieneDescarga = !!data.fecha_descarga?.trim()
    const estadoEdit = editando.tipo === 'cargado'
      ? (tieneDescarga ? 'completado' as const : 'en_curso' as const)
      : undefined
    updateTramo(
      {
        id: editando.id,
        dto: {
          chofer_id:          Number(data.chofer_id),
          camion_id:          Number(data.camion_id),
          estado:             estadoEdit,
          empresa_id:         data.empresa_id  ? Number(data.empresa_id)  : null,
          cantera_id:         data.cantera_id  ? Number(data.cantera_id)  : null,
          deposito_id:        data.deposito_id ? Number(data.deposito_id) : null,
          fecha_carga:             data.fecha_carga     || undefined,
          toneladas_carga:         data.toneladas_carga    ? Number(data.toneladas_carga)    : undefined,
          remito_carga:            data.remito_carga       ?? '',
          remito_carga_img_url:    data.remito_carga_img_url || null,
          fecha_descarga:          data.fecha_descarga     || undefined,
          toneladas_descarga:      data.toneladas_descarga ? Number(data.toneladas_descarga) : undefined,
          remito_descarga:         data.remito_descarga     ?? '',
          remito_descarga_img_url: data.remito_descarga_img_url || null,
          fecha_vacio:        data.fecha_vacio         || undefined,
          obs:                data.obs ?? '',
        },
      },
      {
        onSuccess: () => { toast('✓ Tramo actualizado', 'ok'); setEditando(null) },
        onError:   () => toast('Error al actualizar', 'err'),
      }
    )
  }

  function handleDelete(tramo: Tramo) {
    if (!confirm(`¿Eliminar tramo #${tramo.id}?`)) return
    deleteTramo(tramo.id, {
      onSuccess: () => toast('✓ Tramo eliminado', 'ok'),
      onError:   () => toast('Error al eliminar', 'err'),
    })
  }

  return (
    <>
      {/* Filtros */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:flex-wrap">
        <Select
          options={[{ value: '', label: 'Todos los choferes' }, ...choferes.map(c => ({ value: c.id, label: c.nombre }))]}
          value={filtChofer}
          onChange={e => setFiltChofer(e.target.value)}
          className="w-full sm:w-48"
        />
        <Select
          options={[
            { value: '', label: 'Cargado y vacío' },
            { value: 'cargado', label: '🚛 Cargado' },
            { value: 'vacio',   label: '🔲 Vacío'   },
          ]}
          value={filtTipo}
          onChange={e => setFiltTipo(e.target.value)}
          className="w-full sm:w-40"
        />
        <Select
          options={[
            { value: '', label: 'Todos los estados' },
            { value: 'en_curso',   label: '⏳ En curso'   },
            { value: 'completado', label: '✓ Completado' },
          ]}
          value={filtEstado}
          onChange={e => setFiltEstado(e.target.value)}
          className="w-full sm:w-40"
        />
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-end">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">Desde</label>
            <input
              type="date"
              value={filtDesde}
              max={filtHasta || undefined}
              onChange={e => setFiltDesde(e.target.value)}
              className="w-full px-2 py-1.5 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none bg-white focus:border-naranja"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">Hasta</label>
            <input
              type="date"
              value={filtHasta}
              min={filtDesde || undefined}
              onChange={e => setFiltHasta(e.target.value)}
              className="w-full px-2 py-1.5 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none bg-white focus:border-naranja"
            />
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap sm:ml-auto">
          {(filtDesde || filtHasta) && (
            <button
              type="button"
              onClick={() => { setFiltDesde(''); setFiltHasta('') }}
              className="text-xs font-bold text-gris-dark hover:text-rojo px-2 py-1 rounded hover:bg-gris transition-colors"
              title="Limpiar rango de fechas"
            >
              ✕ Fechas
            </button>
          )}
          <Button variant="secondary" size="sm" disabled={!puedeCrear} onClick={() => setModalSolicitud(true)}>
            📋 Solicitud de turno
          </Button>
          <Button variant="primary" size="sm" disabled={!puedeCrear} onClick={() => setModalNuevo(true)}>
            ＋ Nuevo tramo
          </Button>
        </div>
      </div>

      <ModalSolicitudTurno
        open={modalSolicitud}
        onClose={() => setModalSolicitud(false)}
      />

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-gris-dark text-sm">
          No hay tramos registrados.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((tramo, idx) => {
            const prev = filtered[idx - 1]
            const next = filtered[idx + 1]
            const canMoveUp   = !!prev && fechaRef(prev) === fechaRef(tramo)
            const canMoveDown = !!next && fechaRef(next) === fechaRef(tramo)
            const chofer   = choferes.find(c => c.id === tramo.chofer_id)
            const camion   = camiones.find(c => c.id === tramo.camion_id)
            const cantera  = tramo.cantera_id  ? canteras.find(c => c.id === tramo.cantera_id)   : null
            const deposito = tramo.deposito_id ? depositos.find(d => d.id === tramo.deposito_id) : null
            const empresa  = tramo.empresa_id  ? (empresas as any[]).find(e => e.id === tramo.empresa_id) : null
            const km = getKm(tramo)
            const esCargado = tramo.tipo === 'cargado'

            const esRepetido = tramosRepetidos.has(tramo.id)

            // Discrepancia entre nº de remito de carga y descarga: solo
            // aplica a tramos cargados con AMBOS números cargados.
            const remCarga = (tramo.remito_carga ?? '').trim()
            const remDescarga = (tramo.remito_descarga ?? '').trim()
            const remitosDispares = esCargado && remCarga && remDescarga
              && remCarga.toUpperCase() !== remDescarga.toUpperCase()
            return (
              <div
                key={tramo.id}
                className={`rounded-card shadow-card p-4 border-l-4 ${
                  remitosDispares ? 'bg-rojo-light/40' :
                  esRepetido ? 'bg-[#FEEADB]' : 'bg-white'
                } ${
                  remitosDispares ? 'border-rojo' :
                  tramo.estado === 'completado' ? 'border-verde' :
                  esCargado ? 'border-naranja' : 'border-azul-mid'
                }`}
                title={
                  remitosDispares ? `⚠ Nº de remito no coincide: carga "${remCarga}" vs descarga "${remDescarga}"` :
                  esRepetido ? 'Este tramo repite el tipo del tramo anterior del mismo chofer — revisar' : undefined
                }
              >
                {/* Cabecera */}
                <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Badge
                        variant={tramo.estado === 'completado' ? 'cerrado' : 'pendiente'}
                        label={tramo.estado === 'completado' ? '✓ Completado' : '⏳ En curso'}
                      />
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${esCargado ? 'bg-naranja-light text-naranja-dark' : 'bg-azul-light text-azul-mid'}`}>
                        {esCargado ? '🚛 Cargado' : '🔲 Vacío'}
                      </span>
                      {/* Estado de facturación — solo empresas con modalidad
                          'facturacion' (una factura por viaje). Se excluyen
                          lugares operativos (no facturables), igual que en el
                          tab Facturación. */}
                      {esCargado && empresa?.modalidad_cobro === 'facturacion' && (
                        tramo.cobro_id ? (
                          <span className="text-[10px] font-bold bg-verde text-white px-2 py-0.5 rounded-full uppercase tracking-wide">
                            🧾 Facturado
                          </span>
                        ) : (tramo.estado === 'completado' && !cantera?.operativo && !deposito?.operativo) ? (
                          <span className="text-[10px] font-bold bg-naranja text-white px-2 py-0.5 rounded-full uppercase tracking-wide">
                            ⚠ Sin facturar
                          </span>
                        ) : null
                      )}
                      {esRepetido && (
                        <span className="text-[10px] font-bold bg-[#8B3510] text-white px-2 py-0.5 rounded-full uppercase tracking-wide">
                          ⚠ Repetido
                        </span>
                      )}
                      {remitosDispares && (
                        <span className="text-[10px] font-bold bg-rojo text-white px-2 py-0.5 rounded-full uppercase tracking-wide">
                          ⚠ Remitos no coinciden
                        </span>
                      )}
                      <span className="font-mono text-xs text-gris-dark">#{tramo.id}</span>
                    </div>
                    <div className="font-bold text-azul">
                      {chofer?.nombre ?? '—'} &nbsp;·&nbsp; {camion?.patente ?? '—'}
                    </div>
                    {empresa && (
                      <div className="text-xs font-semibold text-naranja-dark mt-0.5">🏢 {empresa.nombre}</div>
                    )}
                    {cantera && deposito && (
                      <div className="text-xs text-gris-dark mt-0.5">
                        {esCargado
                          ? `⛏ ${cantera.nombre} → 🏭 ${deposito.nombre}`
                          : `🏭 ${deposito.nombre} → ⛏ ${cantera.nombre}`
                        }
                        {km && <span className="ml-2 font-mono">({Math.round(km).toLocaleString('es-AR')} km)</span>}
                      </div>
                    )}
                    {/* Distancia restante GPS→destino. Aplica tanto a
                        tramos cargados (yendo a depósito) como vacíos
                        (volviendo a cantera). */}
                    {tramo.estado === 'en_curso' && (() => {
                      const er = enRutaPorTramo.get(tramo.id)
                      if (!er) return null
                      if (er.distancia_m == null) return null
                      const km = Math.round(er.distancia_m / 1000)
                      const segs = er.duracion_traffic_s ?? er.duracion_s
                      const eta = segs == null ? '' :
                        segs < 3600 ? ` · ~${Math.round(segs / 60)} min` :
                        ` · ~${Math.floor(segs / 3600)}h ${Math.round((segs % 3600) / 60)}min`
                      return (
                        <div className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold bg-azul-light text-azul-mid px-2 py-0.5 rounded-full">
                          🛰 Faltan {km.toLocaleString('es-AR')} km{eta}
                        </div>
                      )
                    })()}
                  </div>
                  <div className="flex gap-1 items-center">
                    {(canMoveUp || canMoveDown) && (
                      <div className="flex flex-col">
                        <button
                          onClick={() => moverTramo({ id: tramo.id, dir: 'up' })}
                          disabled={!canMoveUp || !puedeEditar}
                          title="Subir dentro del día"
                          aria-label="Subir"
                          className="text-xs leading-none px-2 py-1.5 min-h-[36px] min-w-[36px] rounded hover:bg-gris text-gris-dark disabled:opacity-30 disabled:cursor-not-allowed"
                        >▲</button>
                        <button
                          onClick={() => moverTramo({ id: tramo.id, dir: 'down' })}
                          disabled={!canMoveDown || !puedeEditar}
                          title="Bajar dentro del día"
                          aria-label="Bajar"
                          className="text-xs leading-none px-2 py-1.5 min-h-[36px] min-w-[36px] rounded hover:bg-gris text-gris-dark disabled:opacity-30 disabled:cursor-not-allowed"
                        >▼</button>
                      </div>
                    )}
                    <button disabled={!puedeEditar} onClick={() => openEdit(tramo)} className="text-xs px-2 py-1.5 min-h-[36px] min-w-[36px] rounded hover:bg-gris transition-colors disabled:opacity-40 disabled:cursor-not-allowed">✏️</button>
                    <button disabled={!puedeEliminar} onClick={() => handleDelete(tramo)} className="text-xs px-2 py-1.5 min-h-[36px] min-w-[36px] rounded hover:bg-rojo-light text-gris-mid hover:text-rojo transition-colors disabled:opacity-40 disabled:cursor-not-allowed">✕</button>
                  </div>
                </div>

                {/* Datos cargado */}
                {esCargado && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
                    <InfoBlock
                      titulo="Carga"
                      icono="⛏"
                      fecha={tramo.fecha_carga}
                      toneladas={tramo.toneladas_carga}
                      remito={tramo.remito_carga}
                      imgUrl={tramo.remito_carga_img_url}
                    />
                    <InfoBlock
                      titulo="Descarga"
                      icono="🏭"
                      fecha={tramo.fecha_descarga}
                      toneladas={tramo.toneladas_descarga}
                      remito={tramo.remito_descarga}
                      imgUrl={tramo.remito_descarga_img_url}
                      vacio={!tramo.fecha_descarga}
                    />
                  </div>
                )}

                {/* Datos vacío */}
                {!esCargado && tramo.fecha_vacio && (
                  <div className="text-sm text-carbon mb-3">
                    📅 {fmtFecha(tramo.fecha_vacio)}
                  </div>
                )}

                {tramo.obs && (
                  <div className="text-xs text-gris-dark mb-3">📝 {tramo.obs}</div>
                )}

                {/* Acciones */}
                <div className="flex gap-2">
                  {esCargado && tramo.estado === 'en_curso' && (
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={!puedeEditar}
                      onClick={() => {
                        // Precarga toneladas con las de la carga (típicamente
                        // coinciden); el user puede editarlas si difieren.
                        formDescarga.reset({
                          fecha_descarga: hoy(),
                          toneladas_descarga: tramo.toneladas_carga != null ? String(tramo.toneladas_carga) : '',
                        })
                        setDescargaTramo(tramo)
                      }}
                    >
                      🏭 Registrar descarga
                    </Button>
                  )}
                  {/* Revertir descarga: visible solo si el tramo tiene descarga
                      registrada y NO está liquidado ni cobrado (el backend también
                      lo bloquea, pero ocultarlo evita la frustración del click). */}
                  {esCargado && tramo.fecha_descarga && !tramo.liquidacion_id && !tramo.cobro_id && (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={!puedeEditar}
                      onClick={() => setRevertirTramo(tramo)}
                    >
                      ↩ Revertir descarga
                    </Button>
                  )}
                  {/* Marcar vacío como en_curso: cuando se creó el tramo después
                      de la descarga pero el camión todavía no llegó a destino. */}
                  {!esCargado && tramo.estado === 'completado' && !tramo.liquidacion_id && !tramo.cobro_id && (
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={updating}
                      onClick={() => handleMarcarEnCurso(tramo)}
                    >
                      ⏳ Marcar en curso
                    </Button>
                  )}
                  {/* Finalizar vacío en_curso: cierra el tramo a mano (sin esperar
                      a que el camión vuelva a cargar) para que entre a la
                      liquidación del chofer. Caso: chofer se va de descanso / lo
                      reemplazan. */}
                  {!esCargado && tramo.estado === 'en_curso' && !tramo.liquidacion_id && !tramo.cobro_id && (
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={!puedeEditar}
                      loading={updating}
                      onClick={() => handleFinalizarVacio(tramo)}
                    >
                      ✓ Finalizar tramo
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal nuevo tramo */}
      <Modal
        open={modalNuevo}
        onClose={() => setModalNuevo(false)}
        title="🚛 NUEVO TRAMO"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalNuevo(false)}>Cancelar</Button>
            <Button variant="primary" loading={creating} onClick={formNuevo.handleSubmit(handleCreate)}>✓ Registrar</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Select
            label="Tipo de tramo"
            options={[
              { value: 'cargado', label: '🚛 Cargado (punto de carga → depósito)' },
              { value: 'vacio',   label: '🔲 Vacío (regreso sin carga)'    },
            ]}
            {...formNuevo.register('tipo')}
          />

          <div>
            <Combobox
              label="Chofer"
              placeholder="Buscar chofer..."
              options={choferes.filter((c: any) => c.estado === 'activo').map((c: any) => ({ value: String(c.id), label: c.nombre }))}
              value={String(formNuevo.watch('chofer_id') ?? '')}
              onChange={(v: string) => {
                formNuevo.setValue('chofer_id', v)
                const chofer = choferes.find((c: any) => c.id === Number(v))
                if (chofer?.camion_id) formNuevo.setValue('camion_id', String(chofer.camion_id))
              }}
            />
            {(() => {
              const cid = formNuevo.watch('chofer_id')
              if (!cid) return null
              const ultimo = getUltimoTramoDe(t => t.chofer_id === Number(cid))
              if (!ultimo) return <div className="text-[11px] text-gris-dark italic mt-1">Sin tramos previos de este chofer.</div>
              const f = fechaRef(ultimo)
              const repite = ultimo.tipo === tipoNuevo
              return (
                <div className={`text-[11px] mt-1 ${repite ? 'text-[#8B3510] font-bold' : 'text-gris-dark'}`}>
                  {repite ? '⚠ ' : ''}Último tramo del chofer: <b>{ultimo.tipo.toUpperCase()}</b>{f ? ` el ${f}` : ''}
                </div>
              )
            })()}
          </div>
          <div>
            <Combobox
              label="Camión"
              placeholder="Buscar camión..."
              options={camiones.filter((c: any) => c.estado === 'activo').map((c: any) => ({ value: String(c.id), label: c.patente, sub: c.modelo ?? undefined }))}
              value={String(formNuevo.watch('camion_id') ?? '')}
              onChange={(v: string) => formNuevo.setValue('camion_id', v)}
            />
            {(() => {
              const cid = formNuevo.watch('camion_id')
              if (!cid) return null
              const ultimo = getUltimoTramoDe(t => t.camion_id === Number(cid))
              if (!ultimo) return <div className="text-[11px] text-gris-dark italic mt-1">Sin tramos previos de este camión.</div>
              const f = fechaRef(ultimo)
              const repite = ultimo.tipo === tipoNuevo
              return (
                <div className={`text-[11px] mt-1 ${repite ? 'text-[#8B3510] font-bold' : 'text-gris-dark'}`}>
                  {repite ? '⚠ ' : ''}Último tramo del camión: <b>{ultimo.tipo.toUpperCase()}</b>{f ? ` el ${f}` : ''}
                </div>
              )
            })()}
          </div>

          {tipoNuevo === 'cargado' && (
            <Combobox
              label="Empresa transportista *"
              placeholder="¿Para quién es este viaje?"
              options={[
                ...(empresas as any[]).filter((e: any) => e.estado === 'activa').map((e: any) => ({ value: String(e.id), label: e.nombre })),
              ]}
              value={String(formNuevo.watch('empresa_id') ?? '')}
              onChange={(v: string) => formNuevo.setValue('empresa_id', v)}
            />
          )}

          {tipoNuevo === 'cargado' ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Combobox
                  label="Punto de carga (origen)"
                  placeholder="Buscar punto de carga..."
                  options={canteraOptions(formNuevo.watch('empresa_id'), formNuevo.watch('cantera_id'))}
                  value={String(formNuevo.watch('cantera_id') ?? '')}
                  onChange={(v: string) => {
                    formNuevo.setValue('cantera_id', v)
                    // Auto-preseleccionar depósito con el más frecuente para
                    // esta cantera, pero solo si el actual está vacío o ya no
                    // es válido para la nueva cantera (no pisamos elección
                    // manual si sigue siendo válida).
                    const newCanteraId = v ? Number(v) : null
                    if (!newCanteraId) return
                    const currentDep = formNuevo.getValues('deposito_id')
                    const currentDepNum = currentDep ? Number(currentDep) : null
                    const validos = depositosPorCantera.get(newCanteraId)
                    if (!currentDepNum || !validos?.has(currentDepNum)) {
                      const sug = depositoMasFrecuentePorCantera.get(newCanteraId)
                      if (sug) formNuevo.setValue('deposito_id', String(sug))
                    }
                  }}
                />
                <Combobox
                  label="Depósito (destino)"
                  placeholder="Buscar depósito..."
                  options={depositoOptions(formNuevo.watch('cantera_id'), formNuevo.watch('deposito_id'))}
                  value={String(formNuevo.watch('deposito_id') ?? '')}
                  onChange={(v: string) => formNuevo.setValue('deposito_id', v)}
                />
              </div>
              <RutaFaltanteInline
                canteraId={formNuevo.watch('cantera_id')}
                depositoId={formNuevo.watch('deposito_id')}
                canteras={canteras as Cantera[]}
                depositos={depositos as Deposito[]}
                rutas={rutas as Ruta[]}
                createRuta={createRuta}
              />
              <div className="bg-gris rounded-xl p-3 flex flex-col gap-3">
                <div className="text-xs font-bold text-gris-dark uppercase tracking-wider">⛏ Carga en punto de carga</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Input label="Fecha carga" type="date" {...formNuevo.register('fecha_carga')} />
                  <Input label="Toneladas" type="number" step="0.01" min="0" placeholder="0.00" {...formNuevo.register('toneladas_carga')} />
                  <Input label="Nº Remito" placeholder="R-00456" {...formNuevo.register('remito_carga')} />
                </div>
                <RemitoImgField
                  label="Remito de carga (imagen o PDF)"
                  url={formNuevo.watch('remito_carga_img_url') ?? ''}
                  uploading={uploading === 'remito_carga_img_url'}
                  onPick={f => handleUpload(formNuevo, 'remito_carga_img_url', f)}
                  onClear={() => formNuevo.setValue('remito_carga_img_url', '')}
                />
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Combobox
                  label="Origen"
                  placeholder="Desde dónde sale..."
                  options={(depositos as any[]).map((d: any) => ({ value: String(d.id), label: d.nombre, sub: d.localidad ?? undefined }))}
                  value={String(formNuevo.watch('deposito_id') ?? '')}
                  onChange={(v: string) => formNuevo.setValue('deposito_id', v)}
                />
                <Combobox
                  label="Destino"
                  placeholder="A dónde va..."
                  options={canteraOptionsPorDeposito(formNuevo.watch('deposito_id'), formNuevo.watch('cantera_id'))}
                  value={String(formNuevo.watch('cantera_id') ?? '')}
                  onChange={(v: string) => formNuevo.setValue('cantera_id', v)}
                />
              </div>
              <RutaFaltanteInline
                canteraId={formNuevo.watch('cantera_id')}
                depositoId={formNuevo.watch('deposito_id')}
                canteras={canteras as Cantera[]}
                depositos={depositos as Deposito[]}
                rutas={rutas as Ruta[]}
                createRuta={createRuta}
              />
              <Input label="Fecha" type="date" {...formNuevo.register('fecha_vacio')} />
              <label className="flex items-start gap-2 text-sm bg-gris/40 border border-gris-mid rounded-lg p-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="accent-naranja mt-0.5"
                  {...formNuevo.register('vacio_completado')}
                />
                <span className="flex-1">
                  <span className="font-bold text-carbon">El camión ya llegó al destino</span>
                  <span className="block text-[11px] text-gris-dark mt-0.5">
                    Si lo tildás, el tramo queda <b>completado</b>. Si no, queda
                    <b> en curso</b> con seguimiento GPS activo hasta el destino.
                  </span>
                </span>
              </label>
            </>
          )}

          <Input label="Observaciones" placeholder="Opcional" {...formNuevo.register('obs')} />
        </div>
      </Modal>

      {/* Modal registrar descarga */}
      <Modal
        open={!!descargaTramo}
        onClose={() => setDescargaTramo(null)}
        title="🏭 REGISTRAR DESCARGA"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDescargaTramo(null)}>Cancelar</Button>
            <Button variant="primary" loading={descargando} onClick={formDescarga.handleSubmit(handleRegistrarDescarga)}>✓ Completar tramo</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input label="Fecha descarga" type="date" {...formDescarga.register('fecha_descarga')} />
            <Input label="Toneladas" type="number" step="0.01" min="0" placeholder="0.00" {...formDescarga.register('toneladas_descarga')} />
            <Input label="Nº Remito" placeholder="R-00456" {...formDescarga.register('remito_descarga')} />
          </div>
          <RemitoImgField
            label="Remito de descarga (imagen o PDF)"
            url={formDescarga.watch('remito_descarga_img_url') ?? ''}
            uploading={uploading === 'remito_descarga_img_url'}
            onPick={f => handleUpload(formDescarga, 'remito_descarga_img_url', f)}
            onClear={() => formDescarga.setValue('remito_descarga_img_url', '')}
          />
        </div>
      </Modal>

      {/* Modal post-descarga: ¿a dónde vuelve a cargar? Si elige una
          cantera se crea automáticamente el tramo `vacio` para hacer
          seguimiento GPS hasta el próximo origen. */}
      <Modal
        open={!!proximaCarga}
        onClose={() => { setProximaCarga(null); setCanteraVuelta(''); setChoferVueltaOverride(null) }}
        title="🚚 ¿A DÓNDE VUELVE A CARGAR?"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setProximaCarga(null); setCanteraVuelta(''); setChoferVueltaOverride(null) }}>
              Después
            </Button>
            <Button variant="primary" loading={creating} onClick={handleCrearVacioVuelta}>
              ✓ Crear tramo vacío
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="bg-azul-light/40 rounded-card p-3 text-xs text-azul-mid">
            Si lo cargás ahora, el camión queda con un <b>tramo vacío en curso</b>
            {' '}y vas a ver la distancia/ETA al destino en el tab <b>🛰 En ruta</b>.
            Si no sabés todavía, podés saltearlo y crearlo después.
          </div>
          {(() => {
            const cam = proximaCarga ? camiones.find(c => c.id === proximaCarga.camion_id) : null
            const dep = proximaCarga ? depositos.find(d => d.id === proximaCarga.deposito_id) : null
            return (
              <div className="text-xs text-gris-dark">
                <span className="font-bold">{cam?.patente ?? '—'}</span> sale desde{' '}
                <span className="font-bold">{dep?.nombre ?? '—'}</span> hacia →
              </div>
            )
          })()}
          <div>
            <Combobox
              label="Chofer de la vuelta"
              placeholder="Elegí chofer"
              value={choferVueltaId != null ? String(choferVueltaId) : ''}
              onChange={(v: string) => setChoferVueltaOverride(v)}
              options={choferes.map(c => ({ value: String(c.id), label: c.nombre }))}
            />
            {vueltaPorRelevo && (
              <p className="text-[11px] text-verde-dark mt-1">
                ↩ Asignado automáticamente al relevista que quedó con el camión en destino. Cambialo si volvió otro.
              </p>
            )}
          </div>
          <Combobox
            label="Próximo punto de carga"
            placeholder="Elegí punto de carga"
            value={canteraVuelta}
            onChange={(v: string) => setCanteraVuelta(v)}
            options={(canteras as any[]).map(c => ({ value: String(c.id), label: c.nombre }))}
          />
          <p className="text-[11px] text-gris-mid">
            Sugerencia automática: el punto de carga donde más cargó este camión en el mes en curso. Editá si vuelve a otro lugar.
          </p>
        </div>
      </Modal>

      {/* Modal editar tramo */}
      <Modal
        open={!!editando}
        onClose={() => setEditando(null)}
        title="✏️ EDITAR TRAMO"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditando(null)}>Cancelar</Button>
            <Button variant="primary" loading={updating} onClick={formEdit.handleSubmit(handleEdit)}>✓ Guardar</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Combobox
              label="Chofer"
              placeholder="Buscar chofer..."
              options={choferes.map((c: any) => ({ value: String(c.id), label: c.nombre }))}
              value={String(formEdit.watch('chofer_id') ?? '')}
              onChange={(v: string) => formEdit.setValue('chofer_id', v)}
            />
            <Combobox
              label="Camión"
              placeholder="Buscar camión..."
              options={camiones.map((c: any) => ({ value: String(c.id), label: c.patente }))}
              value={String(formEdit.watch('camion_id') ?? '')}
              onChange={(v: string) => formEdit.setValue('camion_id', v)}
            />
          </div>
          {editando?.tipo === 'cargado' && (
            <Combobox
              label="Empresa transportista"
              placeholder="¿Para quién es este viaje?"
              options={[
                { value: '', label: 'Sin empresa' },
                ...(empresas as any[]).map((e: any) => ({ value: String(e.id), label: e.nombre })),
              ]}
              value={String(formEdit.watch('empresa_id') ?? '')}
              onChange={(v: string) => formEdit.setValue('empresa_id', v)}
            />
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Combobox
              label={editando?.tipo === 'cargado' ? 'Punto de carga (origen)' : 'Destino'}
              placeholder={editando?.tipo === 'cargado' ? 'Buscar punto de carga...' : 'A dónde va...'}
              options={
                editando?.tipo === 'cargado'
                  ? canteraOptions(formEdit.watch('empresa_id'), formEdit.watch('cantera_id'))
                  : canteraOptionsPorDeposito(formEdit.watch('deposito_id'), formEdit.watch('cantera_id'))
              }
              value={String(formEdit.watch('cantera_id') ?? '')}
              onChange={(v: string) => formEdit.setValue('cantera_id', v)}
            />
            <Combobox
              label={editando?.tipo === 'cargado' ? 'Depósito (destino)' : 'Origen'}
              placeholder={editando?.tipo === 'cargado' ? 'Buscar depósito...' : 'Desde dónde sale...'}
              options={
                editando?.tipo === 'cargado'
                  ? depositoOptions(formEdit.watch('cantera_id'), formEdit.watch('deposito_id'))
                  : (depositos as any[]).map((d: any) => ({ value: String(d.id), label: d.nombre, sub: d.localidad ?? undefined }))
              }
              value={String(formEdit.watch('deposito_id') ?? '')}
              onChange={(v: string) => formEdit.setValue('deposito_id', v)}
            />
          </div>
          <RutaFaltanteInline
            canteraId={formEdit.watch('cantera_id')}
            depositoId={formEdit.watch('deposito_id')}
            canteras={canteras as Cantera[]}
            depositos={depositos as Deposito[]}
            rutas={rutas as Ruta[]}
            createRuta={createRuta}
          />

          {editando?.tipo === 'cargado' ? (
            <>
              <div className="bg-gris rounded-xl p-3 flex flex-col gap-3">
                <div className="text-xs font-bold text-gris-dark uppercase tracking-wider">⛏ Carga</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Input label="Fecha" type="date" {...formEdit.register('fecha_carga')} />
                  <Input label="Toneladas" type="number" step="0.01" min="0" {...formEdit.register('toneladas_carga')} />
                  <Input label="Nº Remito" {...formEdit.register('remito_carga')} />
                </div>
                <RemitoImgField
                  label="Remito de carga (imagen o PDF)"
                  url={formEdit.watch('remito_carga_img_url') ?? ''}
                  uploading={uploading === 'edit_remito_carga_img_url'}
                  onPick={f => handleUpload(formEdit, 'remito_carga_img_url', f)}
                  onClear={() => formEdit.setValue('remito_carga_img_url', '')}
                />
              </div>
              <div className="bg-gris rounded-xl p-3 flex flex-col gap-3">
                <div className="text-xs font-bold text-gris-dark uppercase tracking-wider">🏭 Descarga</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Input label="Fecha" type="date" {...formEdit.register('fecha_descarga')} />
                  <Input label="Toneladas" type="number" step="0.01" min="0" {...formEdit.register('toneladas_descarga')} />
                  <Input label="Nº Remito" {...formEdit.register('remito_descarga')} />
                </div>
                <RemitoImgField
                  label="Remito de descarga (imagen o PDF)"
                  url={formEdit.watch('remito_descarga_img_url') ?? ''}
                  uploading={uploading === 'edit_remito_descarga_img_url'}
                  onPick={f => handleUpload(formEdit, 'remito_descarga_img_url', f)}
                  onClear={() => formEdit.setValue('remito_descarga_img_url', '')}
                />
              </div>
            </>
          ) : (
            <Input label="Fecha viaje vacío" type="date" {...formEdit.register('fecha_vacio')} />
          )}

          <Input label="Observaciones" placeholder="Opcional" {...formEdit.register('obs')} />

          {editando && <RelevoSection tramo={editando} />}
        </div>
      </Modal>

      {/* Modal de confirmación: revertir descarga */}
      <Modal
        open={!!revertirTramo}
        onClose={() => setRevertirTramo(null)}
        title="↩ REVERTIR DESCARGA"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRevertirTramo(null)}>Cancelar</Button>
            <Button variant="primary" loading={revirtiendo} onClick={handleRevertirDescarga}>
              ↩ Revertir
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 text-sm">
          <p>
            ¿Revertir la descarga del tramo <b>#{revertirTramo?.id}</b>?
          </p>
          <p className="text-gris-dark">
            Se perderán: fecha, toneladas, nº de remito e imagen (si hubiera).
            El tramo volverá a estado <b>en curso</b>.
          </p>
          <p className="text-rojo text-xs">
            Esta acción no se puede deshacer.
          </p>
        </div>
      </Modal>
    </>
  )
}

function InfoBlock({ titulo, icono, fecha, toneladas, remito, imgUrl, vacio }: {
  titulo: string; icono: string; fecha?: string | null; toneladas?: number | null; remito?: string | null; imgUrl?: string | null; vacio?: boolean
}) {
  return (
    <div className={`rounded-xl p-3 ${vacio ? 'bg-gris/50 border border-dashed border-gris-mid' : 'bg-gris'}`}>
      <div className="text-xs font-bold text-gris-dark uppercase tracking-wider mb-2">{icono} {titulo}</div>
      {vacio ? (
        <span className="text-xs text-gris-mid italic">Pendiente de registrar</span>
      ) : (
        <div className="flex flex-col gap-0.5 text-sm">
          {fecha     && <span>📅 {fmtFecha(fecha)}</span>}
          {toneladas != null && <span>⚖️ {toneladas} tn</span>}
          {remito    && <span>📄 {remito}</span>}
          {imgUrl    && (
            <a href={imgUrl} target="_blank" rel="noreferrer" className="text-xs text-azul hover:underline inline-flex items-center gap-1 mt-1">
              🖼 Ver remito
            </a>
          )}
        </div>
      )}
    </div>
  )
}

// Carga inline del km de la ruta cantera↔depósito desde el form del tramo.
// Si el par ya tiene km, lo confirma; si falta, deja cargarlo en el momento
// (Fase 2) sin ir a Logística > Lugares > Rutas. El km del tramo sale de acá.
function RutaFaltanteInline({ canteraId, depositoId, canteras, depositos, rutas, createRuta }: {
  canteraId:  string | undefined
  depositoId: string | undefined
  canteras:   Cantera[]
  depositos:  Deposito[]
  rutas:      Ruta[]
  createRuta: ReturnType<typeof useCreateRuta>
}) {
  const toast = useToast()
  const [km, setKm] = useState('')
  const cId = canteraId  ? Number(canteraId)  : null
  const dId = depositoId ? Number(depositoId) : null
  if (!cId || !dId) return null

  const ruta = rutas.find(r => r.cantera_id === cId && r.deposito_id === dId)
  const cantNom = canteras.find(c => c.id === cId)?.nombre ?? `#${cId}`
  const depNom  = depositos.find(d => d.id === dId)?.nombre ?? `#${dId}`

  if (ruta) {
    return (
      <div className="text-[11px] text-verde font-bold -mt-2">
        ✓ {cantNom} → {depNom}: {Math.round(ruta.km_ida_vuelta).toLocaleString('es-AR')} km (un sentido)
      </div>
    )
  }

  async function guardar() {
    const n = Number(km)
    if (!Number.isFinite(n) || n <= 0) { toast('Ingresá un km mayor a 0', 'err'); return }
    try {
      await createRuta.mutateAsync({ cantera_id: cId!, deposito_id: dId!, km_ida_vuelta: n, obs: '' })
      toast('✓ Ruta agregada', 'ok')
      setKm('')
    } catch {
      toast('No se pudo guardar la ruta', 'err')
    }
  }

  return (
    <div className="bg-rojo-light/50 rounded-lg px-3 py-2.5 -mt-2">
      <p className="text-[11px] font-bold text-rojo-dark mb-1.5">
        ⚠ No hay km para {cantNom} → {depNom}. Cargalo acá — lo usa el tramo para la distancia.
      </p>
      <div className="flex items-end gap-2">
        <Input
          label="Km (un sentido)"
          type="text"
          inputMode="numeric"
          placeholder="Ej: 1220"
          value={km}
          onChange={e => setKm(e.target.value.replace(/[^\d]/g, ''))}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); guardar() } }}
          className="text-sm"
        />
        <Button type="button" variant="primary" size="sm" loading={createRuta.isPending} onClick={guardar}>
          Guardar
        </Button>
      </div>
    </div>
  )
}

// Input de archivo para el remito (sube a Supabase Storage y guarda la URL en el form)
function RemitoImgField({ label, url, uploading, onPick, onClear }: {
  label: string; url: string; uploading: boolean; onPick: (file: File) => void; onClear: () => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">{label}</label>
      {url ? (
        <div className="flex items-center gap-2 bg-white border-[1.5px] border-verde/40 rounded-lg px-2 py-1.5">
          <a href={url} target="_blank" rel="noreferrer" className="text-xs text-azul hover:underline flex-1 truncate">
            🖼 Ver remito subido
          </a>
          <button type="button" onClick={onClear} className="text-xs text-gris-dark hover:text-rojo px-1" title="Quitar">✕</button>
        </div>
      ) : (
        <input
          type="file"
          accept="image/*,application/pdf,.pdf"
          disabled={uploading}
          onChange={e => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = '' }}
          className="text-xs text-gris-dark file:mr-2 file:px-2 file:py-1 file:rounded file:border-0 file:bg-azul file:text-white file:font-bold file:text-xs hover:file:bg-azul/90 disabled:opacity-50"
        />
      )}
    </div>
  )
}

function fmtFecha(s: string) {
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

function hoy() {
  return toISO(new Date())
}
