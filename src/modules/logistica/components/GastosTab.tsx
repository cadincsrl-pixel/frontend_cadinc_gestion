'use client'

import { useState, useMemo, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import {
  useGastos, useGastosCategorias, useCreateGasto, useUpdateGasto, useDeleteGasto,
  useAprobarGasto, useRechazarGasto, useMarcarGastoPagado,
  useGastoComprobanteUrl, uploadComprobanteGasto,
  useChoferes, useCamiones,
  type Gasto, type GastosFilters,
} from '../hooks/useLogistica'
import { GastosReportes } from './GastosReportes'
import { GastosConsumo }  from './GastosConsumo'
import { Modal }    from '@/components/ui/Modal'
import { Button }   from '@/components/ui/Button'
import { Select }   from '@/components/ui/Select'
import { Combobox } from '@/components/ui/Combobox'
import { Input }    from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import { useSessionStore } from '@/store/session.store'
import { ModalImportarGastos } from './ModalImportarGastos'

const hoy = () => new Date().toISOString().slice(0, 10)
const fmt$ = (n: number | string) => `$ ${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtFecha = (s: string | null) => s ? new Date(s + 'T00:00').toLocaleDateString('es-AR') : '—'

// Pill de color inline — no usa Badge porque sus variants están restringidos.
const ESTADO_PILL_CLS: Record<Gasto['estado'], string> = {
  pendiente:  'bg-amber-100   text-amber-800   border-amber-200',
  aprobado:   'bg-emerald-100 text-emerald-800 border-emerald-200',
  rechazado:  'bg-rose-100    text-rose-800    border-rose-200',
  pagado:     'bg-sky-100     text-sky-800     border-sky-200',
}
function Pill({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${className}`}>
      {children}
    </span>
  )
}

const METODO_EMOJI: Record<Gasto['metodo_pago'], string> = {
  efectivo:       '💵',
  transferencia:  '🏦',
  tarjeta:        '💳',
  cheque:         '🧾',
  cta_cte:        '📋',
  otro:           '⋯',
}

export function GastosTab() {
  const toast = useToast()
  const { puedeCrear, puedeEditar, puedeEliminar } = usePermisos('logistica')
  const userId  = useSessionStore(s => s.profile?.id)
  const esAdmin = useSessionStore(s => s.profile?.rol === 'admin')

  // ── Filtros ─────────────────────────────────────────────────
  const [filters, setFilters] = useState<GastosFilters>({ limit: 100, offset: 0 })
  function setFilter<K extends keyof GastosFilters>(k: K, v: GastosFilters[K]) {
    setFilters(f => ({ ...f, [k]: v, offset: 0 }))
  }

  // ── Data ────────────────────────────────────────────────────
  const { data: gastosResp, isLoading } = useGastos(filters)
  const { data: categorias = [] }       = useGastosCategorias()
  const { data: choferes = [] }         = useChoferes()
  const { data: camiones = [] }         = useCamiones()

  const gastos = gastosResp?.items ?? []
  const totalFiltrado    = useMemo(() => gastos.reduce((s, g) => s + Number(g.monto), 0), [gastos])
  const totalReintegrosP = useMemo(() =>
    gastos.filter(g => g.pagado_por === 'chofer' && !g.liquidacion_id && g.estado === 'aprobado')
          .reduce((s, g) => s + Number(g.monto), 0),
  [gastos])

  // ── Mutaciones ──────────────────────────────────────────────
  const { mutate: createGasto, isPending: creating } = useCreateGasto()
  const { mutate: updateGasto, isPending: updating } = useUpdateGasto()
  const { mutate: deleteGasto }                      = useDeleteGasto()
  const { mutate: aprobarGasto, isPending: aprobando } = useAprobarGasto()
  const { mutate: rechazarGasto }                    = useRechazarGasto()
  const { mutate: marcarPagado, isPending: marcandoPagado } = useMarcarGastoPagado()

  // ── Modales + navegación interna ────────────────────────────
  const [view, setView] = useState<'lista' | 'consumo' | 'reportes'>('lista')
  const [modalCreate, setModalCreate] = useState(false)
  const [modalImport, setModalImport] = useState(false)
  const [editando,    setEditando]    = useState<Gasto | null>(null)
  const [verDetalle,  setVerDetalle]  = useState<Gasto | null>(null)

  // El toggle de reportes solo se expone a usuarios con actualizacion —
  // agregaciones de costos son información gerencial, no operativa.
  const puedeVerReportes = puedeEditar

  // ── Forms ───────────────────────────────────────────────────
  type GastoForm = {
    categoria_id: string
    fecha: string
    monto: string
    camion_id: string
    chofer_id: string
    proveedor: string
    metodo_pago: Gasto['metodo_pago']
    pagado_por: Gasto['pagado_por']
    comprobante_nro: string
    descripcion: string
    obs: string
    // Sub-objeto de combustible, siempre presente con defaults; los
    // campos se ignoran si la categoría no es combustible.
    carga_combustible: {
      litros: string
      odometro_km: string
      tipo_combustible: 'gasoil' | 'nafta' | 'nafta_super' | 'adblue'
      tanque_lleno: boolean
      obs: string
    }
  }
  const DEFAULT_CARGA: GastoForm['carga_combustible'] = {
    litros: '', odometro_km: '', tipo_combustible: 'gasoil',
    tanque_lleno: true, obs: '',
  }
  const formNuevo = useForm<GastoForm>({
    defaultValues: {
      categoria_id: '', fecha: hoy(), monto: '', camion_id: '', chofer_id: '',
      proveedor: '', metodo_pago: 'efectivo', pagado_por: 'empresa',
      comprobante_nro: '', descripcion: '', obs: '',
      carga_combustible: DEFAULT_CARGA,
    },
  })
  const formEdit = useForm<GastoForm>({ defaultValues: formNuevo.getValues() })

  // Upload pendiente (path en bucket, asignable a comprobante_path del POST).
  const [uploadPath, setUploadPath]       = useState<string | null>(null)
  const [uploadFile, setUploadFile]       = useState<File | null>(null)
  const [uploading, setUploading]         = useState(false)

  async function handlePickFile(f: File) {
    setUploading(true)
    try {
      const { path } = await uploadComprobanteGasto(f)
      setUploadPath(path)
      setUploadFile(f)
      toast('✓ Comprobante subido', 'ok')
    } catch (err: any) {
      toast(err?.message || 'Error al subir comprobante', 'err')
    } finally {
      setUploading(false)
    }
  }
  function resetUpload() { setUploadPath(null); setUploadFile(null) }

  async function handleCreate(data: GastoForm) {
    const cat = categorias.find(c => c.id === Number(data.categoria_id))
    const esCombustibleFila = (cat as any)?.codigo === 'combustible'
    const carga_combustible = esCombustibleFila ? {
      litros:           Number(data.carga_combustible.litros),
      odometro_km:      data.carga_combustible.odometro_km ? Number(data.carga_combustible.odometro_km) : null,
      tipo_combustible: data.carga_combustible.tipo_combustible,
      tanque_lleno:     data.carga_combustible.tanque_lleno,
      obs:              data.carga_combustible.obs || '',
    } : undefined

    createGasto({
      categoria_id: Number(data.categoria_id),
      fecha:        data.fecha,
      monto:        Number(data.monto),
      camion_id:    data.camion_id ? Number(data.camion_id) : null,
      chofer_id:    data.chofer_id ? Number(data.chofer_id) : null,
      proveedor:    data.proveedor || null,
      metodo_pago:  data.metodo_pago,
      pagado_por:   data.pagado_por,
      comprobante_nro: data.comprobante_nro,
      descripcion:  data.descripcion,
      obs:          data.obs,
      comprobante_path: uploadPath,
      carga_combustible,
    } as any, {
      onSuccess: (created: any) => {
        toast(esAdmin ? '✓ Gasto registrado y aprobado' : '✓ Gasto registrado (pendiente de aprobación)', 'ok')
        // Warnings no-bloqueantes (odómetro sospechoso, etc.)
        if (Array.isArray(created?.warnings) && created.warnings.length > 0) {
          for (const w of created.warnings) {
            if (w.code === 'ODOMETRO_RETROCEDE')          toast('⚠ Odómetro menor al último registrado — revisá el valor', 'err')
            else if (w.code === 'ODOMETRO_ESTANCADO')     toast('⚠ Odómetro igual al último — revisá el valor', 'err')
            else if (w.code === 'ODOMETRO_VS_TRAMOS_DISCREPANCIA') toast('⚠ El km del odómetro difiere de los tramos registrados', 'err')
          }
        }
        setModalCreate(false)
        formNuevo.reset({
          ...formNuevo.getValues(),
          categoria_id: '', monto: '', descripcion: '', obs: '', comprobante_nro: '',
          carga_combustible: DEFAULT_CARGA,
        })
        resetUpload()
      },
      onError: (err: any) => {
        const code = err?.body?.error || err?.code
        if (code === 'COMPROBANTE_DUPLICADO') {
          toast(`Este comprobante ya fue cargado en el gasto #${err?.body?.detail?.gasto_id_existente}`, 'err')
        } else if (code === 'CARGA_REQUERIDA') {
          toast('Los gastos de combustible requieren litros', 'err')
        } else if (code === 'CARGA_NO_PERMITIDA') {
          toast('Solo los gastos de categoría combustible admiten datos de carga', 'err')
        } else if (code === 'LITROS_EXCEDE_TANQUE') {
          const d = err?.body?.detail
          toast(`Litros (${d?.litros}) superan la capacidad del tanque (${d?.capacidad_tanque}L)`, 'err')
        } else {
          toast(err?.message || 'Error al registrar gasto', 'err')
        }
      },
    })
  }

  function openEdit(g: Gasto) {
    formEdit.reset({
      categoria_id: String(g.categoria_id),
      fecha:        g.fecha,
      monto:        String(g.monto),
      camion_id:    g.camion_id ? String(g.camion_id) : '',
      chofer_id:    g.chofer_id ? String(g.chofer_id) : '',
      proveedor:    g.proveedor ?? '',
      metodo_pago:  g.metodo_pago,
      pagado_por:   g.pagado_por,
      comprobante_nro: g.comprobante_nro,
      descripcion:  g.descripcion,
      obs:          g.obs,
      carga_combustible: g.carga_combustible ? {
        litros:           String(g.carga_combustible.litros),
        odometro_km:      g.carga_combustible.odometro_km != null ? String(g.carga_combustible.odometro_km) : '',
        tipo_combustible: g.carga_combustible.tipo_combustible,
        tanque_lleno:     g.carga_combustible.tanque_lleno,
        obs:              g.carga_combustible.obs ?? '',
      } : DEFAULT_CARGA,
    })
    setUploadPath(g.comprobante_url) // mantener el existente si no se reemplaza
    setUploadFile(null)
    setEditando(g)
    setVerDetalle(null)
  }

  function handleEdit(data: GastoForm) {
    if (!editando) return
    updateGasto({
      id: editando.id,
      dto: {
        categoria_id: Number(data.categoria_id),
        fecha:        data.fecha,
        monto:        Number(data.monto),
        camion_id:    data.camion_id ? Number(data.camion_id) : null,
        chofer_id:    data.chofer_id ? Number(data.chofer_id) : null,
        proveedor:    data.proveedor || null,
        metodo_pago:  data.metodo_pago,
        pagado_por:   data.pagado_por,
        comprobante_nro: data.comprobante_nro,
        descripcion:  data.descripcion,
        obs:          data.obs,
        // Si subió uno nuevo, usa ese path. Si quedó igual, mandar undefined.
        comprobante_path: uploadFile ? uploadPath : undefined,
      } as any,
    }, {
      onSuccess: () => { toast('✓ Gasto actualizado', 'ok'); setEditando(null); resetUpload() },
      onError:   (err: any) => {
        const code = err?.body?.error || err?.code
        if (code === 'GASTO_NO_EDITABLE') toast('Gasto aprobado: no se pueden editar campos financieros', 'err')
        else if (code === 'GASTO_EN_LIQUIDACION') toast('Gasto en liquidación: no editable', 'err')
        else if (code === 'COMPROBANTE_DUPLICADO') toast('Este comprobante ya está cargado en otro gasto', 'err')
        else toast(err?.message || 'Error al actualizar', 'err')
      },
    })
  }

  function handleDelete(g: Gasto) {
    if (!confirm(`¿Eliminar el gasto #${g.id} de ${fmt$(g.monto)}? Se archiva (soft delete).`)) return
    deleteGasto(g.id, {
      onSuccess: () => { toast('✓ Gasto eliminado', 'ok'); setVerDetalle(null) },
      onError:   (err: any) => {
        if (err?.body?.error === 'GASTO_EN_LIQUIDACION') toast('Gasto en liquidación: no se puede eliminar', 'err')
        else toast(err?.message || 'Error al eliminar', 'err')
      },
    })
  }

  function handleAprobar(g: Gasto) {
    aprobarGasto(g.id, {
      onSuccess: () => { toast('✓ Gasto aprobado', 'ok'); setVerDetalle(null) },
      onError:   (err: any) => {
        if (err?.body?.error === 'NO_PUEDE_AUTO_APROBAR') {
          toast('No podés aprobar un gasto que vos mismo creaste. Debe hacerlo otro usuario.', 'err')
        } else {
          toast(err?.message || 'Error al aprobar', 'err')
        }
      },
    })
  }

  function handleRechazar(g: Gasto) {
    const motivo = prompt('Motivo del rechazo (mínimo 3 caracteres):')?.trim()
    if (!motivo || motivo.length < 3) return
    rechazarGasto({ id: g.id, motivo_rechazo: motivo }, {
      onSuccess: () => { toast('✓ Gasto rechazado', 'ok'); setVerDetalle(null) },
      onError:   (err: any) => toast(err?.message || 'Error al rechazar', 'err'),
    })
  }

  function handleMarcarPagado(g: Gasto) {
    if (!confirm(`¿Marcar como pagado el gasto #${g.id} de ${fmt$(g.monto)}?`)) return
    marcarPagado(g.id, {
      onSuccess: () => { toast('✓ Gasto marcado como pagado', 'ok'); setVerDetalle(null) },
      onError:   (err: any) => {
        const code = err?.body?.error || err?.code
        if (code === 'SOLO_EMPRESA_SE_PAGA')   toast('Los gastos pagados por el chofer se reintegran al cerrar liquidación', 'err')
        else if (code === 'NO_PUEDE_PAGAR_PROPIO') toast('No podés marcar pagado un gasto que vos creaste', 'err')
        else if (code === 'GASTO_NO_APROBADO') toast('El gasto debe estar aprobado antes de marcarlo pagado', 'err')
        else toast(err?.message || 'Error al marcar pagado', 'err')
      },
    })
  }

  return (
    <div className="flex flex-col gap-4">

      {/* Sub-navegación: Lista | Consumo | Reportes */}
      {puedeVerReportes && (
        <div className="bg-white rounded-card shadow-card p-1 inline-flex self-start gap-0.5">
          <button
            onClick={() => setView('lista')}
            className={`px-4 py-1.5 text-sm font-semibold rounded-md transition ${view === 'lista' ? 'bg-azul text-white shadow' : 'text-gris-dark hover:bg-gris-light'}`}
          >
            📋 Lista
          </button>
          <button
            onClick={() => setView('consumo')}
            className={`px-4 py-1.5 text-sm font-semibold rounded-md transition ${view === 'consumo' ? 'bg-azul text-white shadow' : 'text-gris-dark hover:bg-gris-light'}`}
          >
            ⛽ Consumo
          </button>
          <button
            onClick={() => setView('reportes')}
            className={`px-4 py-1.5 text-sm font-semibold rounded-md transition ${view === 'reportes' ? 'bg-azul text-white shadow' : 'text-gris-dark hover:bg-gris-light'}`}
          >
            📊 Reportes
          </button>
        </div>
      )}

      {view === 'consumo'  && puedeVerReportes && <GastosConsumo />}
      {view === 'reportes' && puedeVerReportes && <GastosReportes />}

      {view === 'lista' && <>

      {/* Toolbar filtros */}
      <div className="bg-white rounded-card shadow-card p-3 flex flex-wrap items-end gap-2">
        <Select
          label="Categoría"
          value={filters.categoria_id ? String(filters.categoria_id) : ''}
          onChange={e => setFilter('categoria_id', e.target.value ? Number(e.target.value) : undefined)}
          options={[{ value: '', label: 'Todas' }, ...categorias.map(c => ({ value: String(c.id), label: c.nombre }))]}
        />
        <Select
          label="Chofer"
          value={filters.chofer_id ? String(filters.chofer_id) : ''}
          onChange={e => setFilter('chofer_id', e.target.value ? Number(e.target.value) : undefined)}
          options={[{ value: '', label: 'Todos' }, ...choferes.map(c => ({ value: String(c.id), label: c.nombre }))]}
        />
        <Select
          label="Camión"
          value={filters.camion_id ? String(filters.camion_id) : ''}
          onChange={e => setFilter('camion_id', e.target.value ? Number(e.target.value) : undefined)}
          options={[{ value: '', label: 'Todos' }, ...camiones.map(c => ({ value: String(c.id), label: c.patente }))]}
        />
        <Select
          label="Estado"
          value={filters.estado ?? ''}
          onChange={e => setFilter('estado', (e.target.value || undefined) as any)}
          options={[
            { value: '',          label: 'Todos' },
            { value: 'pendiente', label: 'Pendiente' },
            { value: 'aprobado',  label: 'Aprobado' },
            { value: 'rechazado', label: 'Rechazado' },
            { value: 'pagado',    label: 'Pagado' },
          ]}
        />
        <Input label="Desde" type="date" value={filters.desde ?? ''} onChange={e => setFilter('desde', e.target.value || undefined)} />
        <Input label="Hasta" type="date" value={filters.hasta ?? ''} onChange={e => setFilter('hasta', e.target.value || undefined)} />
        <Input label="Buscar" placeholder="Descripción, proveedor..." value={filters.q ?? ''} onChange={e => setFilter('q', e.target.value || undefined)} />
        <div className="ml-auto flex gap-2">
          {puedeCrear && (
            <>
              <Button variant="secondary" onClick={() => setModalImport(true)}>📥 Importar Excel</Button>
              <Button variant="primary" onClick={() => { formNuevo.reset({ ...formNuevo.getValues(), fecha: hoy(), categoria_id: '', monto: '' }); resetUpload(); setModalCreate(true) }}>
                + Registrar gasto
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Totales */}
      <div className="bg-white rounded-card shadow-card p-3 flex flex-wrap gap-4 items-center text-sm">
        <span className="text-gris-dark">Mostrando <b>{gastos.length}</b> de <b>{gastosResp?.total ?? 0}</b></span>
        <span>Total filtrado: <b className="font-mono">{fmt$(totalFiltrado)}</b></span>
        {totalReintegrosP > 0 && (
          <span className="text-naranja-dark">🔁 Reintegros pendientes: <b className="font-mono">{fmt$(totalReintegrosP)}</b></span>
        )}
      </div>

      {/* Listado */}
      <div className="bg-white rounded-card shadow-card overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-center text-gris-dark">Cargando…</div>
        ) : gastos.length === 0 ? (
          <div className="p-6 text-center text-gris-dark">No hay gastos que coincidan con el filtro.</div>
        ) : (
          <div className="divide-y divide-gris">
            {gastos.map(g => (
              <button
                key={g.id}
                onClick={() => setVerDetalle(g)}
                className="w-full text-left p-3 hover:bg-gris-light transition flex items-center gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{g.categoria?.nombre ?? `Categoría ${g.categoria_id}`}</span>
                    <span className="text-xs text-gris-dark">{METODO_EMOJI[g.metodo_pago]}</span>
                    {g.comprobante_url && <span title="Tiene comprobante">📎</span>}
                    <Pill className={ESTADO_PILL_CLS[g.estado]}>{g.estado}</Pill>
                    {g.pagado_por === 'chofer' && !g.liquidacion_id && g.estado === 'aprobado' && (
                      <Pill className="bg-amber-100 text-amber-800 border-amber-200">🔁 reintegro</Pill>
                    )}
                    {g.liquidacion_id && <Pill className="bg-sky-100 text-sky-800 border-sky-200">liquidado</Pill>}
                    {g.carga_combustible && (
                      <Pill className="bg-orange-100 text-orange-800 border-orange-200">
                        ⛽ {Number(g.carga_combustible.litros).toFixed(1)}L
                        {!g.carga_combustible.tanque_lleno && '*'}
                      </Pill>
                    )}
                  </div>
                  <div className="text-xs text-gris-dark truncate">
                    {fmtFecha(g.fecha)} · {g.proveedor || 'sin proveedor'}
                    {g.descripcion && ` · ${g.descripcion}`}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono font-bold">{fmt$(g.monto)}</div>
                  <div className="text-xs text-gris-dark">
                    {g.camion_id && camiones.find(c => c.id === g.camion_id)?.patente}
                    {g.camion_id && g.chofer_id && ' · '}
                    {g.chofer_id && choferes.find(c => c.id === g.chofer_id)?.nombre}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
        {gastosResp?.hasMore && (
          <div className="p-3 text-center">
            <Button variant="secondary" size="sm" onClick={() => setFilters(f => ({ ...f, offset: (f.offset ?? 0) + (f.limit ?? 100) }))}>
              Cargar más
            </Button>
          </div>
        )}
      </div>

      </>}

      {/* Modal crear */}
      <Modal
        open={modalCreate}
        onClose={() => { setModalCreate(false); resetUpload() }}
        title="💸 REGISTRAR GASTO"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setModalCreate(false); resetUpload() }}>Cancelar</Button>
            <Button variant="primary" loading={creating || uploading} onClick={formNuevo.handleSubmit(handleCreate)}>✓ Guardar</Button>
          </>
        }
      >
        <GastoFormFields
          form={formNuevo}
          categorias={categorias}
          choferes={choferes}
          camiones={camiones}
          uploadFile={uploadFile}
          uploadPath={uploadPath}
          uploading={uploading}
          onPickFile={handlePickFile}
          onClearFile={resetUpload}
        />
      </Modal>

      {/* Modal editar */}
      <Modal
        open={!!editando}
        onClose={() => { setEditando(null); resetUpload() }}
        title={`✏ EDITAR GASTO #${editando?.id}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => { setEditando(null); resetUpload() }}>Cancelar</Button>
            <Button variant="primary" loading={updating || uploading} onClick={formEdit.handleSubmit(handleEdit)}>✓ Actualizar</Button>
          </>
        }
      >
        <GastoFormFields
          form={formEdit}
          categorias={categorias}
          choferes={choferes}
          camiones={camiones}
          uploadFile={uploadFile}
          uploadPath={uploadPath}
          uploading={uploading}
          onPickFile={handlePickFile}
          onClearFile={resetUpload}
        />
      </Modal>

      {/* Modal import Excel */}
      <ModalImportarGastos
        open={modalImport}
        onClose={() => setModalImport(false)}
        categorias={categorias}
        choferes={choferes}
        camiones={camiones}
      />

      {/* Modal detalle */}
      <Modal
        open={!!verDetalle}
        onClose={() => setVerDetalle(null)}
        title={verDetalle ? `${verDetalle.categoria?.nombre ?? 'Gasto'} #${verDetalle.id}` : ''}
      >
        {verDetalle && (
          <DetalleGasto
            gasto={verDetalle}
            canEdit={puedeEditar}
            canDelete={puedeEliminar}
            canApprove={verDetalle.estado === 'pendiente' && verDetalle.created_by !== userId}
            canMarkPaid={
              verDetalle.estado === 'aprobado'
              && verDetalle.pagado_por === 'empresa'
              && verDetalle.created_by !== userId
            }
            aprobando={aprobando}
            marcandoPagado={marcandoPagado}
            onEdit={() => openEdit(verDetalle)}
            onDelete={() => handleDelete(verDetalle)}
            onAprobar={() => handleAprobar(verDetalle)}
            onRechazar={() => handleRechazar(verDetalle)}
            onMarcarPagado={() => handleMarcarPagado(verDetalle)}
          />
        )}
      </Modal>

    </div>
  )
}

// ── Subcomponentes ──────────────────────────────────────────────

function GastoFormFields({
  form, categorias, choferes, camiones, uploadFile, uploadPath, uploading, onPickFile, onClearFile,
}: {
  form: any
  categorias: { id: number; codigo?: string; nombre: string; aplica_a: string }[]
  choferes:   { id: number; nombre: string; camion_id?: number | null }[]
  camiones:   { id: number; patente: string }[]
  uploadFile: File | null
  uploadPath: string | null
  uploading:  boolean
  onPickFile: (f: File) => void
  onClearFile: () => void
}) {
  // Autocarga del camión al elegir chofer: si el chofer tiene un camión
  // precargado en su ficha (choferes.camion_id), lo seteamos. El usuario
  // puede sobrescribirlo cambiando el select manualmente.
  const choferIdWatched = form.watch('chofer_id')
  useEffect(() => {
    if (!choferIdWatched) return
    const chofer = choferes.find(c => c.id === Number(choferIdWatched))
    if (chofer?.camion_id) {
      form.setValue('camion_id', String(chofer.camion_id))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choferIdWatched, choferes])

  // Detectar si la categoría seleccionada es combustible. Se compara por
  // código (estable) y no por nombre (volátil). Afecta qué campos extra
  // se muestran y cómo se arma el payload al submit.
  const categoriaIdWatched = form.watch('categoria_id')
  const categoriaSel   = categorias.find(c => c.id === Number(categoriaIdWatched))
  const esCombustible  = categoriaSel?.codigo === 'combustible'

  // Al salir de combustible, resetear campos del sub-objeto para no
  // enviar metadata fantasma al backend (que la rechazaría con 400).
  useEffect(() => {
    if (!esCombustible) {
      form.setValue('carga_combustible.litros', '')
      form.setValue('carga_combustible.odometro_km', '')
      form.setValue('carga_combustible.tipo_combustible', 'gasoil')
      form.setValue('carga_combustible.tanque_lleno', true)
      form.setValue('carga_combustible.obs', '')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esCombustible])

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <Select label="Categoría" {...form.register('categoria_id', { required: true })}
          options={[{ value: '', label: '— Elegí —' }, ...categorias.map(c => ({ value: String(c.id), label: c.nombre }))]} />
        <Input label="Fecha" type="date" {...form.register('fecha', { required: true })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Monto" type="number" step="0.01" placeholder="0.00" {...form.register('monto', { required: true })} />
        <Select label="Pagó" {...form.register('pagado_por')}
          options={[{ value: 'empresa', label: '🏢 Empresa' }, { value: 'chofer', label: '🧑 Chofer' }]} />
      </div>
      <Select label="Método de pago" {...form.register('metodo_pago')}
        options={[
          { value: 'efectivo',      label: '💵 Efectivo' },
          { value: 'transferencia', label: '🏦 Transferencia' },
          { value: 'tarjeta',       label: '💳 Tarjeta' },
          { value: 'cheque',        label: '🧾 Cheque' },
          { value: 'cta_cte',       label: '📋 Cta. cte.' },
          { value: 'otro',          label: '⋯ Otro' },
        ]} />
      <div className="grid grid-cols-2 gap-3">
        <Select label="Camión" {...form.register('camion_id')}
          options={[{ value: '', label: '— Sin camión —' }, ...camiones.map(c => ({ value: String(c.id), label: c.patente }))]} />
        <Select label="Chofer" {...form.register('chofer_id')}
          options={[{ value: '', label: '— Sin chofer —' }, ...choferes.map(c => ({ value: String(c.id), label: c.nombre }))]} />
      </div>
      <Input label="Proveedor" placeholder="YPF, Gomería La esquina..." {...form.register('proveedor')} />
      <Input label="Nº de comprobante" placeholder="000123-04" {...form.register('comprobante_nro')} />
      <Input label="Descripción" placeholder="Carga 150L ruta provincial 6" {...form.register('descripcion')} />

      {/* Upload comprobante */}
      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">Comprobante (imagen o PDF)</label>
        {uploadPath ? (
          <div className="flex items-center gap-2 bg-white border-[1.5px] border-verde/40 rounded-lg px-2 py-1.5">
            <span className="text-xs text-azul flex-1 truncate">📎 {uploadFile?.name ?? 'Comprobante existente'}</span>
            <button type="button" onClick={onClearFile} className="text-xs text-gris-dark hover:text-rojo px-1" title="Quitar">✕</button>
          </div>
        ) : (
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            capture="environment"
            disabled={uploading}
            onChange={e => { const f = e.target.files?.[0]; if (f) onPickFile(f); e.target.value = '' }}
            className="text-xs text-gris-dark file:mr-2 file:px-2 file:py-1 file:rounded file:border-0 file:bg-azul file:text-white file:font-bold file:text-xs hover:file:bg-azul/90 disabled:opacity-50"
          />
        )}
      </div>

      {/* Carga de combustible — solo si categoría = combustible */}
      {esCombustible && (
        <div className="rounded-xl border border-orange-200 bg-orange-50/40 p-3 flex flex-col gap-3">
          <div className="text-[11px] font-bold text-orange-800 uppercase tracking-wider">⛽ Carga de combustible</div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Litros" type="number" step="0.001" placeholder="150.500" inputMode="decimal"
              {...form.register('carga_combustible.litros', { required: esCombustible })} />
            <Input label="Odómetro km (opcional)" type="number" step="1" placeholder="452300" inputMode="numeric"
              {...form.register('carga_combustible.odometro_km')} />
          </div>
          <div className="grid grid-cols-2 gap-3 items-end">
            <Select label="Tipo" {...form.register('carga_combustible.tipo_combustible')}
              options={[
                { value: 'gasoil',      label: 'Gasoil' },
                { value: 'nafta',       label: 'Nafta' },
                { value: 'nafta_super', label: 'Nafta Super' },
                { value: 'adblue',      label: 'AdBlue' },
              ]} />
            <label className="flex items-center gap-2 text-sm cursor-pointer min-h-[44px]">
              <input
                type="checkbox"
                {...form.register('carga_combustible.tanque_lleno')}
                className="accent-orange-500 w-4 h-4"
              />
              <span>Llené el tanque</span>
            </label>
          </div>
          <p className="text-[11px] text-gris-dark">
            Dejá el odómetro vacío si no lo anotaste. Destildá "Llené el tanque" si cargaste solo parcial.
          </p>
        </div>
      )}

      <Input label="Observaciones" placeholder="Opcional" {...form.register('obs')} />
    </div>
  )
}

function DetalleGasto({ gasto, canEdit, canDelete, canApprove, canMarkPaid, aprobando, marcandoPagado, onEdit, onDelete, onAprobar, onRechazar, onMarcarPagado }: {
  gasto: Gasto
  canEdit: boolean; canDelete: boolean; canApprove: boolean; canMarkPaid: boolean
  aprobando: boolean; marcandoPagado: boolean
  onEdit: () => void; onDelete: () => void
  onAprobar: () => void; onRechazar: () => void; onMarcarPagado: () => void
}) {
  const { data: urlResp } = useGastoComprobanteUrl(gasto.comprobante_url ? gasto.id : null)
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex flex-wrap gap-2 items-center">
        <Pill className={ESTADO_PILL_CLS[gasto.estado]}>{gasto.estado}</Pill>
        {gasto.pagado_por === 'chofer' && !gasto.liquidacion_id && gasto.estado === 'aprobado' && (
          <Pill className="bg-amber-100 text-amber-800 border-amber-200">🔁 reintegro pendiente</Pill>
        )}
        {gasto.liquidacion_id && <Pill className="bg-sky-100 text-sky-800 border-sky-200">liquidado</Pill>}
      </div>

      <div className="font-mono text-2xl font-bold">{fmt$(gasto.monto)}</div>
      <div className="text-gris-dark">{fmtFecha(gasto.fecha)} · {gasto.proveedor || 'sin proveedor'}</div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
        <dt className="text-gris-dark">Método:</dt>  <dd>{METODO_EMOJI[gasto.metodo_pago]} {gasto.metodo_pago}</dd>
        <dt className="text-gris-dark">Pagó:</dt>    <dd>{gasto.pagado_por === 'empresa' ? '🏢 Empresa' : '🧑 Chofer'}</dd>
        <dt className="text-gris-dark">Nº remito:</dt><dd>{gasto.comprobante_nro || '—'}</dd>
        <dt className="text-gris-dark">Descripción:</dt><dd>{gasto.descripcion || '—'}</dd>
        <dt className="text-gris-dark">Observaciones:</dt><dd>{gasto.obs || '—'}</dd>
        {gasto.motivo_rechazo && (<><dt className="text-rojo font-semibold">Motivo rechazo:</dt><dd className="text-rojo">{gasto.motivo_rechazo}</dd></>)}
      </dl>

      {urlResp?.signedUrl && (
        <a href={urlResp.signedUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-azul hover:underline text-xs">
          📎 Ver comprobante
        </a>
      )}

      <div className="flex flex-wrap gap-2 pt-2 border-t border-gris">
        {canApprove && (
          <>
            <Button variant="primary" size="sm" loading={aprobando} onClick={onAprobar}>✓ Aprobar</Button>
            <Button variant="secondary" size="sm" onClick={onRechazar}>✕ Rechazar</Button>
          </>
        )}
        {canMarkPaid && (
          <Button variant="primary" size="sm" loading={marcandoPagado} onClick={onMarcarPagado}>💰 Marcar pagado</Button>
        )}
        {canEdit && !gasto.liquidacion_id && (
          <Button variant="secondary" size="sm" onClick={onEdit}>✏ Editar</Button>
        )}
        {canDelete && !gasto.liquidacion_id && (
          <Button variant="secondary" size="sm" onClick={onDelete}>🗑 Eliminar</Button>
        )}
      </div>
    </div>
  )
}
