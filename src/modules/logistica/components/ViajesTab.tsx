'use client'

import { useState } from 'react'
import {
  useTramos, useChoferes, useCamiones, useCanteras, useDepositos, useRutas, useEmpresas,
  useCreateTramo, useUpdateTramo, useDeleteTramo, useRegistrarDescargaTramo,
} from '../hooks/useLogistica'
import { Modal }    from '@/components/ui/Modal'
import { Button }   from '@/components/ui/Button'
import { Select }   from '@/components/ui/Select'
import { Combobox } from '@/components/ui/Combobox'
import { Input }    from '@/components/ui/Input'
import { Badge }    from '@/components/ui/Badge'
import { useToast } from '@/components/ui/Toast'
import { useForm }  from 'react-hook-form'
import type { Tramo } from '@/types/domain.types'

export function ViajesTab() {
  const toast = useToast()
  const { data: tramos    = [] } = useTramos()
  const { data: choferes  = [] } = useChoferes()
  const { data: camiones  = [] } = useCamiones()
  const { data: canteras  = [] } = useCanteras()
  const { data: depositos = [] } = useDepositos()
  const { data: rutas     = [] } = useRutas()
  const { data: empresas  = [] } = useEmpresas()

  const { mutate: createTramo,  isPending: creating    } = useCreateTramo()
  const { mutate: updateTramo,  isPending: updating    } = useUpdateTramo()
  const { mutate: deleteTramo  } = useDeleteTramo()
  const { mutate: regDescarga,  isPending: descargando } = useRegistrarDescargaTramo()

  const [modalNuevo,    setModalNuevo]    = useState(false)
  const [editando,      setEditando]      = useState<Tramo | null>(null)
  const [descargaTramo, setDescargaTramo] = useState<Tramo | null>(null)
  const [filtChofer,    setFiltChofer]    = useState('')
  const [filtTipo,      setFiltTipo]      = useState('')
  const [filtEstado,    setFiltEstado]    = useState('')

  const formNuevo    = useForm<any>({ defaultValues: { tipo: 'cargado', fecha_carga: hoy(), fecha_vacio: hoy() } })
  const formEdit     = useForm<any>()
  const formDescarga = useForm<any>({ defaultValues: { fecha_descarga: hoy() } })

  const tipoNuevo = formNuevo.watch('tipo')

  const filtered = tramos.filter((t: Tramo) => {
    if (filtChofer && String(t.chofer_id) !== filtChofer) return false
    if (filtTipo   && t.tipo   !== filtTipo)   return false
    if (filtEstado && t.estado !== filtEstado) return false
    return true
  })

  function getKm(tramo: Tramo) {
    if (!tramo.cantera_id || !tramo.deposito_id) return null
    const ruta = rutas.find(r => r.cantera_id === tramo.cantera_id && r.deposito_id === tramo.deposito_id)
    return ruta?.km_ida_vuelta ?? null
  }

  function handleCreate(data: any) {
    const dto: any = {
      chofer_id:   Number(data.chofer_id),
      camion_id:   Number(data.camion_id),
      tipo:        data.tipo,
      empresa_id:  data.empresa_id ? Number(data.empresa_id) : null,
      cantera_id:  data.cantera_id  ? Number(data.cantera_id)  : null,
      deposito_id: data.deposito_id ? Number(data.deposito_id) : null,
      obs:         data.obs ?? '',
    }
    if (data.tipo === 'cargado') {
      dto.fecha_carga     = data.fecha_carga
      dto.toneladas_carga = data.toneladas_carga ? Number(data.toneladas_carga) : undefined
      dto.remito_carga    = data.remito_carga ?? ''
    } else {
      dto.fecha_vacio = data.fecha_vacio
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

  function handleRegistrarDescarga(data: any) {
    if (!descargaTramo) return
    regDescarga(
      {
        id: descargaTramo.id,
        dto: {
          fecha_descarga:     data.fecha_descarga,
          toneladas_descarga: data.toneladas_descarga ? Number(data.toneladas_descarga) : undefined,
          remito_descarga:    data.remito_descarga ?? '',
        },
      },
      {
        onSuccess: () => { toast('✓ Descarga registrada — tramo completado', 'ok'); setDescargaTramo(null); formDescarga.reset({ fecha_descarga: hoy() }) },
        onError:   () => toast('Error al registrar descarga', 'err'),
      }
    )
  }

  function openEdit(tramo: Tramo) {
    formEdit.reset({
      chofer_id:         String(tramo.chofer_id),
      camion_id:         String(tramo.camion_id),
      tipo:              tramo.tipo,
      empresa_id:        tramo.empresa_id  ? String(tramo.empresa_id)  : '',
      cantera_id:        tramo.cantera_id  ? String(tramo.cantera_id)  : '',
      deposito_id:       tramo.deposito_id ? String(tramo.deposito_id) : '',
      fecha_carga:       tramo.fecha_carga    ?? '',
      toneladas_carga:   tramo.toneladas_carga ?? '',
      remito_carga:      tramo.remito_carga    ?? '',
      fecha_descarga:    tramo.fecha_descarga     ?? '',
      toneladas_descarga: tramo.toneladas_descarga ?? '',
      remito_descarga:   tramo.remito_descarga    ?? '',
      fecha_vacio:       tramo.fecha_vacio ?? '',
      obs:               tramo.obs ?? '',
    })
    setEditando(tramo)
  }

  function handleEdit(data: any) {
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
          fecha_carga:        data.fecha_carga     || undefined,
          toneladas_carga:    data.toneladas_carga    ? Number(data.toneladas_carga)    : undefined,
          remito_carga:       data.remito_carga       ?? '',
          fecha_descarga:     data.fecha_descarga     || undefined,
          toneladas_descarga: data.toneladas_descarga ? Number(data.toneladas_descarga) : undefined,
          remito_descarga:    data.remito_descarga     ?? '',
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
          {filtered.map(tramo => {
            const chofer   = choferes.find(c => c.id === tramo.chofer_id)
            const camion   = camiones.find(c => c.id === tramo.camion_id)
            const cantera  = tramo.cantera_id  ? canteras.find(c => c.id === tramo.cantera_id)   : null
            const deposito = tramo.deposito_id ? depositos.find(d => d.id === tramo.deposito_id) : null
            const empresa  = tramo.empresa_id  ? (empresas as any[]).find(e => e.id === tramo.empresa_id) : null
            const km = getKm(tramo)
            const esCargado = tramo.tipo === 'cargado'

            return (
              <div
                key={tramo.id}
                className={`bg-white rounded-card shadow-card p-4 border-l-4 ${
                  tramo.estado === 'completado' ? 'border-verde' :
                  esCargado ? 'border-naranja' : 'border-azul-mid'
                }`}
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
                  <div className="flex gap-1">
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
                    />
                    <InfoBlock
                      titulo="Descarga"
                      icono="🏭"
                      fecha={tramo.fecha_descarga}
                      toneladas={tramo.toneladas_descarga}
                      remito={tramo.remito_descarga}
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
                {esCargado && tramo.estado === 'en_curso' && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => { formDescarga.reset({ fecha_descarga: hoy() }); setDescargaTramo(tramo) }}
                  >
                    🏭 Registrar descarga
                  </Button>
                )}
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
          <Combobox
            label="Camión"
            placeholder="Buscar camión..."
            options={camiones.filter((c: any) => c.estado === 'activo').map((c: any) => ({ value: String(c.id), label: c.patente, sub: c.modelo ?? undefined }))}
            value={String(formNuevo.watch('camion_id') ?? '')}
            onChange={(v: string) => formNuevo.setValue('camion_id', v)}
          />

          {tipoNuevo === 'cargado' && (
            <Combobox
              label="Empresa transportista"
              placeholder="¿Para quién es este viaje?"
              options={[
                { value: '', label: 'Sin empresa' },
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
              </div>
              <div className="bg-gris rounded-xl p-3 flex flex-col gap-3">
                <div className="text-xs font-bold text-gris-dark uppercase tracking-wider">🏭 Descarga</div>
                <div className="grid grid-cols-3 gap-3">
                  <Input label="Fecha" type="date" {...formEdit.register('fecha_descarga')} />
                  <Input label="Toneladas" type="number" step="0.01" {...formEdit.register('toneladas_descarga')} />
                  <Input label="Nº Remito" {...formEdit.register('remito_descarga')} />
                </div>
              </div>
            </>
          ) : (
            <Input label="Fecha viaje vacío" type="date" {...formEdit.register('fecha_vacio')} />
          )}

          <Input label="Observaciones" placeholder="Opcional" {...formEdit.register('obs')} />
        </div>
      </Modal>
    </>
  )
}

function InfoBlock({ titulo, icono, fecha, toneladas, remito, vacio }: {
  titulo: string; icono: string; fecha?: string | null; toneladas?: number | null; remito?: string | null; vacio?: boolean
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
        </div>
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
