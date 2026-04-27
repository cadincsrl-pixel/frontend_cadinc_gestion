'use client'

import { useState, useMemo } from 'react'
import {
  useTramos, useChoferes, useCamiones, useCanteras, useDepositos, useRutas, useEmpresas,
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
import { uploadRemitoImg } from '@/lib/utils/upload'
import type { Tramo, TramoTipo } from '@/types/domain.types'

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
  obs?: string
}

export function ViajesTab() {
  const toast = useToast()
  const { data: tramos    = [] } = useTramos()
  const { data: choferes  = [] } = useChoferes()
  const { data: camiones  = [] } = useCamiones()
  const { data: canteras  = [] } = useCanteras()
  const { data: depositos = [] } = useDepositos()
  const { data: rutas     = [] } = useRutas()
  const { data: empresas  = [] } = useEmpresas()

  const { mutate: createTramo,  mutateAsync: createTramoAsync, isPending: creating } = useCreateTramo()
  const { mutate: updateTramo,  isPending: updating    } = useUpdateTramo()
  const { mutate: deleteTramo  } = useDeleteTramo()
  const { mutate: regDescarga,  isPending: descargando } = useRegistrarDescargaTramo()
  const { mutate: revDescarga,  isPending: revirtiendo } = useRevertirDescargaTramo()
  const { mutate: moverTramo   } = useMoverTramo()

  const [modalNuevo,    setModalNuevo]    = useState(false)
  const [editando,      setEditando]      = useState<Tramo | null>(null)
  const [descargaTramo, setDescargaTramo] = useState<Tramo | null>(null)
  const [revertirTramo, setRevertirTramo] = useState<Tramo | null>(null)
  const [filtChofer,    setFiltChofer]    = useState('')
  const [filtTipo,      setFiltTipo]      = useState('')
  const [filtEstado,    setFiltEstado]    = useState('')
  const [filtDesde,     setFiltDesde]     = useState('')
  const [filtHasta,     setFiltHasta]     = useState('')

  const formNuevo    = useForm<TramoFormValues>({ defaultValues: { tipo: 'cargado', fecha_carga: hoy(), fecha_vacio: hoy(), remito_carga_img_url: '', remito_descarga_img_url: '' } })
  const formEdit     = useForm<TramoFormValues>()
  const formDescarga = useForm<TramoFormValues>({ defaultValues: { fecha_descarga: hoy(), remito_descarga_img_url: '' } })
  const [uploading, setUploading] = useState<string | null>(null)

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

  // Set de tramo IDs "sospechosos": tienen un tramo previo del mismo chofer o
  // camión con el mismo tipo (capa 3: marca visual en la lista).
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
    const lastByCamion = new Map<number, Tramo>()
    const repetidos = new Set<number>()
    for (const t of sorted) {
      const prevChofer = lastByChofer.get(t.chofer_id)
      const prevCamion = lastByCamion.get(t.camion_id)
      if ((prevChofer && prevChofer.tipo === t.tipo) || (prevCamion && prevCamion.tipo === t.tipo)) {
        repetidos.add(t.id)
      }
      lastByChofer.set(t.chofer_id, t)
      lastByCamion.set(t.camion_id, t)
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

      if (ultimo
        && ultimo.tipo === 'cargado'
        && ultimo.deposito_id != null
        && ultimo.deposito_id !== newCanteraId   // si son iguales, no hay desplazamiento
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
            `  ${ruta.km_ida_vuelta ?? '—'} km ida-vuelta\n\n` +
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
          // Sin ruta → bloqueamos el cargado para forzar consistencia.
          alert(
            `No se puede crear el tramo cargado: detecté que falta el vacío implícito\n` +
            `${depNom} → ${cantNom}, pero no hay ruta cargada entre esos puntos.\n\n` +
            `Cargá la ruta en Logística > Rutas o creá el tramo vacío a mano antes.`
          )
          return
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

  function handleRegistrarDescarga(data: TramoFormValues) {
    if (!descargaTramo) return
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
        onSuccess: () => { toast('✓ Descarga registrada — tramo completado', 'ok'); setDescargaTramo(null); formDescarga.reset({ fecha_descarga: hoy(), remito_descarga_img_url: '' }) },
        onError:   () => toast('Error al registrar descarga', 'err'),
      }
    )
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

  function handleEdit(data: TramoFormValues) {
    if (!editando) return
    updateTramo(
      {
        id: editando.id,
        dto: {
          chofer_id:          Number(data.chofer_id),
          camion_id:          Number(data.camion_id),
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
      <div className="flex items-center gap-2 flex-wrap">
        <Select
          options={[{ value: '', label: 'Todos los choferes' }, ...choferes.map(c => ({ value: c.id, label: c.nombre }))]}
          value={filtChofer}
          onChange={e => setFiltChofer(e.target.value)}
          className="w-48"
        />
        <Select
          options={[
            { value: '', label: 'Cargado y vacío' },
            { value: 'cargado', label: '🚛 Cargado' },
            { value: 'vacio',   label: '🔲 Vacío'   },
          ]}
          value={filtTipo}
          onChange={e => setFiltTipo(e.target.value)}
          className="w-40"
        />
        <Select
          options={[
            { value: '', label: 'Todos los estados' },
            { value: 'en_curso',   label: '⏳ En curso'   },
            { value: 'completado', label: '✓ Completado' },
          ]}
          value={filtEstado}
          onChange={e => setFiltEstado(e.target.value)}
          className="w-40"
        />
        <div className="flex items-center gap-1">
          <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">Desde</label>
          <input
            type="date"
            value={filtDesde}
            max={filtHasta || undefined}
            onChange={e => setFiltDesde(e.target.value)}
            className="px-2 py-1.5 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none bg-white focus:border-naranja"
          />
        </div>
        <div className="flex items-center gap-1">
          <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">Hasta</label>
          <input
            type="date"
            value={filtHasta}
            min={filtDesde || undefined}
            onChange={e => setFiltHasta(e.target.value)}
            className="px-2 py-1.5 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none bg-white focus:border-naranja"
          />
        </div>
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
        <Button variant="primary" size="sm" className="ml-auto" onClick={() => setModalNuevo(true)}>
          ＋ Nuevo tramo
        </Button>
      </div>

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

            return (
              <div
                key={tramo.id}
                className={`rounded-card shadow-card p-4 border-l-4 ${
                  esRepetido ? 'bg-[#FEEADB]' : 'bg-white'
                } ${
                  tramo.estado === 'completado' ? 'border-verde' :
                  esCargado ? 'border-naranja' : 'border-azul-mid'
                }`}
                title={esRepetido ? 'Este tramo repite el tipo del tramo anterior del mismo chofer o camión — revisar' : undefined}
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
                      {esRepetido && (
                        <span className="text-[10px] font-bold bg-[#8B3510] text-white px-2 py-0.5 rounded-full uppercase tracking-wide">
                          ⚠ Repetido
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
                        {km && <span className="ml-2 font-mono">({km.toLocaleString('es-AR')} km)</span>}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 items-center">
                    {(canMoveUp || canMoveDown) && (
                      <div className="flex flex-col">
                        <button
                          onClick={() => moverTramo({ id: tramo.id, dir: 'up' })}
                          disabled={!canMoveUp}
                          title="Subir dentro del día"
                          aria-label="Subir"
                          className="text-[10px] leading-none px-1.5 py-0.5 rounded hover:bg-gris text-gris-dark disabled:opacity-30 disabled:cursor-not-allowed"
                        >▲</button>
                        <button
                          onClick={() => moverTramo({ id: tramo.id, dir: 'down' })}
                          disabled={!canMoveDown}
                          title="Bajar dentro del día"
                          aria-label="Bajar"
                          className="text-[10px] leading-none px-1.5 py-0.5 rounded hover:bg-gris text-gris-dark disabled:opacity-30 disabled:cursor-not-allowed"
                        >▼</button>
                      </div>
                    )}
                    <button onClick={() => openEdit(tramo)} className="text-xs px-2 py-1 rounded hover:bg-gris transition-colors">✏️</button>
                    <button onClick={() => handleDelete(tramo)} className="text-xs p-1 rounded hover:bg-rojo-light text-gris-mid hover:text-rojo transition-colors">✕</button>
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
                      onClick={() => { formDescarga.reset({ fecha_descarga: hoy() }); setDescargaTramo(tramo) }}
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
                      onClick={() => setRevertirTramo(tramo)}
                    >
                      ↩ Revertir descarga
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
              { value: 'cargado', label: '🚛 Cargado (cantera → depósito)' },
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
              <div className="grid grid-cols-2 gap-3">
                <Combobox
                  label="Cantera (origen)"
                  placeholder="Buscar cantera..."
                  options={canteras.map((c: any) => ({ value: String(c.id), label: c.nombre, sub: c.localidad ?? undefined }))}
                  value={String(formNuevo.watch('cantera_id') ?? '')}
                  onChange={(v: string) => formNuevo.setValue('cantera_id', v)}
                />
                <Combobox
                  label="Depósito (destino)"
                  placeholder="Buscar depósito..."
                  options={depositos.map((d: any) => ({ value: String(d.id), label: d.nombre, sub: d.localidad ?? undefined }))}
                  value={String(formNuevo.watch('deposito_id') ?? '')}
                  onChange={(v: string) => formNuevo.setValue('deposito_id', v)}
                />
              </div>
              <div className="bg-gris rounded-xl p-3 flex flex-col gap-3">
                <div className="text-xs font-bold text-gris-dark uppercase tracking-wider">⛏ Carga en cantera</div>
                <div className="grid grid-cols-3 gap-3">
                  <Input label="Fecha carga" type="date" {...formNuevo.register('fecha_carga')} />
                  <Input label="Toneladas" type="number" step="0.01" placeholder="0.00" {...formNuevo.register('toneladas_carga')} />
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
              <div className="grid grid-cols-2 gap-3">
                <Combobox
                  label="Depósito (origen)"
                  placeholder="Desde dónde sale..."
                  options={depositos.map((d: any) => ({ value: String(d.id), label: d.nombre, sub: d.localidad ?? undefined }))}
                  value={String(formNuevo.watch('deposito_id') ?? '')}
                  onChange={(v: string) => formNuevo.setValue('deposito_id', v)}
                />
                <Combobox
                  label="Cantera (destino)"
                  placeholder="A dónde va..."
                  options={canteras.map((c: any) => ({ value: String(c.id), label: c.nombre, sub: c.localidad ?? undefined }))}
                  value={String(formNuevo.watch('cantera_id') ?? '')}
                  onChange={(v: string) => formNuevo.setValue('cantera_id', v)}
                />
              </div>
              <Input label="Fecha" type="date" {...formNuevo.register('fecha_vacio')} />
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
          <div className="grid grid-cols-3 gap-3">
            <Input label="Fecha descarga" type="date" {...formDescarga.register('fecha_descarga')} />
            <Input label="Toneladas" type="number" step="0.01" placeholder="0.00" {...formDescarga.register('toneladas_descarga')} />
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
          <div className="grid grid-cols-2 gap-3">
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
          <div className="grid grid-cols-2 gap-3">
            <Combobox
              label={editando?.tipo === 'cargado' ? 'Cantera (origen)' : 'Cantera (destino)'}
              placeholder="Buscar cantera..."
              options={canteras.map((c: any) => ({ value: String(c.id), label: c.nombre }))}
              value={String(formEdit.watch('cantera_id') ?? '')}
              onChange={(v: string) => formEdit.setValue('cantera_id', v)}
            />
            <Combobox
              label={editando?.tipo === 'cargado' ? 'Depósito (destino)' : 'Depósito (origen)'}
              placeholder="Buscar depósito..."
              options={depositos.map((d: any) => ({ value: String(d.id), label: d.nombre }))}
              value={String(formEdit.watch('deposito_id') ?? '')}
              onChange={(v: string) => formEdit.setValue('deposito_id', v)}
            />
          </div>

          {editando?.tipo === 'cargado' ? (
            <>
              <div className="bg-gris rounded-xl p-3 flex flex-col gap-3">
                <div className="text-xs font-bold text-gris-dark uppercase tracking-wider">⛏ Carga</div>
                <div className="grid grid-cols-3 gap-3">
                  <Input label="Fecha" type="date" {...formEdit.register('fecha_carga')} />
                  <Input label="Toneladas" type="number" step="0.01" {...formEdit.register('toneladas_carga')} />
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
                <div className="grid grid-cols-3 gap-3">
                  <Input label="Fecha" type="date" {...formEdit.register('fecha_descarga')} />
                  <Input label="Toneladas" type="number" step="0.01" {...formEdit.register('toneladas_descarga')} />
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
  return new Date().toISOString().slice(0, 10)
}
