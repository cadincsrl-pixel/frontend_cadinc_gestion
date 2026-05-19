'use client'

import { useState, useMemo } from 'react'
import {
  useHerramientas, useHerrConfig, useHerrMarcas,
  useCreateHerramienta, useUpdateHerramienta, useDeleteHerramienta,
  useCreateMarca, useCreateModelo,
} from '../hooks/useHerramientas'
import { Combobox } from '@/components/ui/Combobox'
import { Modal }    from '@/components/ui/Modal'
import { Button }   from '@/components/ui/Button'
import { Input }    from '@/components/ui/Input'
import { Select }   from '@/components/ui/Select'
import { AuditInfo } from '@/components/ui/AuditInfo'
import { useToast } from '@/components/ui/Toast'
import { useForm }  from 'react-hook-form'
import { usePermisos } from '@/hooks/usePermisos'
import { HerramientaFotosSection } from './HerramientaFotosSection'
import { HerramientaFotosCola } from './HerramientaFotosCola'
import { HerramientasAlertasSection } from './HerramientasAlertasSection'
import { useUploadHerramientaFoto } from '../hooks/useHerramientaFotos'
import { useObras } from '@/modules/tarja/hooks/useObras'
import type { Herramienta } from '@/types/domain.types'

interface HerrFormData {
  codigo:        string
  nom:           string
  tipo_id:       string
  marca_id:      string // value del combobox ('' = sin marca, 'new:Nombre' = crear nueva)
  modelo_id:     string // value del combobox ('' = sin modelo, 'new:Nombre' = crear nuevo)
  serie:         string
  fecha_ingreso: string
  obs:           string
}

function MarcaCombobox({ form }: { form: ReturnType<typeof useForm<HerrFormData>> }) {
  const { data: marcas = [] } = useHerrMarcas()
  const { mutateAsync: createMarcaAsync } = useCreateMarca()
  const toast = useToast()
  const value = form.watch('marca_id')

  async function handleNueva() {
    const nom = window.prompt('Nombre de la marca nueva:')
    if (!nom || !nom.trim()) return
    try {
      const m = await createMarcaAsync({ nom: nom.trim() }) as { id: number; nom: string }
      form.setValue('marca_id',  String(m.id))
      form.setValue('modelo_id', '') // reset al cambiar marca
      toast(`✓ Marca "${m.nom}" creada`, 'ok')
    } catch (e: any) {
      toast(e?.message ?? 'Error al crear marca', 'err')
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">Marca</label>
        <button type="button" onClick={handleNueva} className="text-[10px] font-bold text-naranja hover:text-naranja-dark">
          ＋ Nueva
        </button>
      </div>
      <Combobox
        placeholder="Buscar marca..."
        options={[
          { value: '', label: '— Sin marca —' },
          ...marcas.filter(m => m.activo).map(m => ({ value: String(m.id), label: m.nom })),
        ]}
        value={value}
        onChange={(v) => {
          form.setValue('marca_id', v)
          form.setValue('modelo_id', '') // reset modelo al cambiar marca
        }}
      />
    </div>
  )
}

function ModeloCombobox({ form }: { form: ReturnType<typeof useForm<HerrFormData>> }) {
  const { data: marcas = [] } = useHerrMarcas()
  const { mutateAsync: createModeloAsync } = useCreateModelo()
  const toast = useToast()
  const marcaId = form.watch('marca_id')
  const value   = form.watch('modelo_id')

  const marcaSel = marcaId ? marcas.find(m => String(m.id) === marcaId) : null
  const disabled = !marcaSel

  async function handleNuevo() {
    if (!marcaSel) {
      toast('Elegí una marca primero', 'err')
      return
    }
    const nom = window.prompt(`Modelo nuevo para ${marcaSel.nom}:`)
    if (!nom || !nom.trim()) return
    try {
      const m = await createModeloAsync({ marcaId: marcaSel.id, nom: nom.trim() }) as { id: number; nom: string }
      form.setValue('modelo_id', String(m.id))
      toast(`✓ Modelo "${m.nom}" creado`, 'ok')
    } catch (e: any) {
      toast(e?.message ?? 'Error al crear modelo', 'err')
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">Modelo</label>
        {!disabled && (
          <button type="button" onClick={handleNuevo} className="text-[10px] font-bold text-naranja hover:text-naranja-dark">
            ＋ Nuevo
          </button>
        )}
      </div>
      <Combobox
        placeholder={disabled ? 'Elegí una marca primero' : 'Buscar modelo...'}
        options={[
          { value: '', label: '— Sin modelo —' },
          ...(marcaSel?.modelos ?? [])
            .filter(mo => mo.activo)
            .map(mo => ({ value: String(mo.id), label: mo.nom })),
        ]}
        value={value}
        onChange={(v) => form.setValue('modelo_id', v)}
        disabled={disabled}
      />
    </div>
  )
}

const ESTADO_COLORS: Record<string, string> = {
  disponible: 'bg-verde-light text-verde',
  uso:        'bg-naranja-light text-naranja-dark',
  reparacion: 'bg-rojo-light text-rojo',
  baja:       'bg-gris text-gris-dark',
}

function fmtFecha(s: string | null) {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

export function HerrInventario() {
  const toast = useToast()
  const { puedeCrear, puedeEditar, puedeEliminar } = usePermisos('herramientas')
  const { data: herramientas = [], isLoading } = useHerramientas()
  const { data: config }                        = useHerrConfig()
  const { data: obras = [] }                    = useObras()
  const { mutate: create,  isPending: creating  } = useCreateHerramienta()
  const { mutate: update,  isPending: updating  } = useUpdateHerramienta()
  const { mutate: remove                        } = useDeleteHerramienta()
  const { mutateAsync: uploadFotoAsync          } = useUploadHerramientaFoto()

  const [modalNuevo,  setModalNuevo]  = useState(false)
  const [editando,    setEditando]    = useState<Herramienta | null>(null)
  const [detalle,     setDetalle]     = useState<Herramienta | null>(null)
  const [fotosCola,   setFotosCola]   = useState<File[]>([])
  const [subiendoFotos, setSubiendoFotos] = useState(false)
  const [busqueda,    setBusqueda]    = useState('')
  const [filtroTipo,  setFiltroTipo]  = useState('')
  const [filtroEstado,setFiltroEstado]= useState('')
  // '' = todas, '__deposito__' = sin obra asignada (depósito), o un cod de obra.
  const [filtroObra,  setFiltroObra]  = useState('')

  const formNuevo = useForm<HerrFormData>()
  const formEdit  = useForm<HerrFormData>()

  const filtradas = useMemo(() => {
    return herramientas.filter(h => {
      const q = busqueda.toLowerCase()
      const matchQ = !q ||
        h.codigo.toLowerCase().includes(q) ||
        h.nom.toLowerCase().includes(q)    ||
        (h.marca ?? '').toLowerCase().includes(q) ||
        (h.serie ?? '').toLowerCase().includes(q) ||
        (h.obra?.nom ?? '').toLowerCase().includes(q) ||
        (h.obra?.cod ?? '').toLowerCase().includes(q)
      const matchTipo   = !filtroTipo   || String(h.tipo_id) === filtroTipo
      const matchEstado = !filtroEstado || h.estado_key === filtroEstado
      const matchObra   = !filtroObra
        || (filtroObra === '__deposito__' ? !h.obra_cod : h.obra_cod === filtroObra)
      return matchQ && matchTipo && matchEstado && matchObra
    })
  }, [herramientas, busqueda, filtroTipo, filtroEstado, filtroObra])

  function payloadFromForm(data: HerrFormData) {
    return {
      codigo:        data.codigo,
      nom:           data.nom,
      tipo_id:       data.tipo_id  ? Number(data.tipo_id)  : null,
      marca_id:      data.marca_id ? Number(data.marca_id) : null,
      modelo_id:     data.modelo_id ? Number(data.modelo_id) : null,
      serie:         data.serie,
      fecha_ingreso: data.fecha_ingreso,
      obs:           data.obs,
    }
  }

  function handleCreate(data: HerrFormData) {
    create(
      payloadFromForm(data),
      {
        onSuccess: async (creada) => {
          const creadaH = creada as Herramienta
          // Subir las fotos en cola (si hay). Si falla alguna, seguimos con
          // el resto para no perder lo que sí funcionó.
          if (fotosCola.length > 0) {
            setSubiendoFotos(true)
            let exitos  = 0
            let fallidos = 0
            for (const [idx, file] of fotosCola.entries()) {
              try {
                await uploadFotoAsync({
                  herramientaId: creadaH.id,
                  file,
                  orden: idx * 10,
                })
                exitos++
              } catch (err: any) {
                fallidos++
                const msg = err?.message ?? 'Error al subir foto'
                toast(msg.includes('FOTO_DUPLICADA') ? `${file.name}: ya estaba cargada` : `${file.name}: ${msg}`, 'err')
              }
            }
            setSubiendoFotos(false)
            if (exitos > 0) toast(`✓ Herramienta creada · ${exitos} foto${exitos === 1 ? '' : 's'} subida${exitos === 1 ? '' : 's'}`, 'ok')
            else if (fallidos === fotosCola.length) toast('✓ Herramienta creada (las fotos fallaron — reintentá desde Editar)', 'ok')
          } else {
            toast('✓ Herramienta creada', 'ok')
          }
          setModalNuevo(false)
          formNuevo.reset()
          setFotosCola([])
        },
        onError: (e: any) => toast(e.message ?? 'Error al crear', 'err'),
      }
    )
  }

  function handleUpdate(data: HerrFormData) {
    if (!editando) return
    update(
      {
        id:  editando.id,
        dto: payloadFromForm(data),
      },
      {
        onSuccess: () => {
          toast('✓ Herramienta actualizada', 'ok')
          setEditando(null)
        },
        onError: () => toast('Error al actualizar', 'err'),
      }
    )
  }

  function handleDelete(h: Herramienta) {
    if (h.estado_key === 'uso') {
      toast(`"${h.nom}" está actualmente en uso. Retirala de la obra antes de darla de baja.`, 'err')
      return
    }
    if (!confirm(`¿Dar de baja "${h.nom}"? No se podrá revertir.`)) return
    remove(h.id, {
      onSuccess: () => toast('✓ Herramienta dada de baja', 'ok'),
      onError:   () => toast('Error al dar de baja', 'err'),
    })
  }

  function openEdit(h: Herramienta) {
    formEdit.reset({
      codigo:        h.codigo,
      nom:           h.nom,
      tipo_id:       String(h.tipo_id ?? ''),
      marca_id:      h.marca_id  ? String(h.marca_id)  : '',
      modelo_id:     h.modelo_id ? String(h.modelo_id) : '',
      serie:         h.serie   ?? '',
      fecha_ingreso: h.fecha_ingreso ?? '',
      obs:           h.obs     ?? '',
    })
    setEditando(h)
  }

  const tipoOptions = (config?.tipos ?? []).map(t => ({ value: String(t.id), label: `${t.icono ?? ''} ${t.nom}` }))

  function nextCodigo() {
    const nums = herramientas
      .map(h => h.codigo.match(/^HER-(\d+)$/))
      .filter(Boolean)
      .map(m => parseInt(m![1]))
    const max = nums.length ? Math.max(...nums) : 0
    return `HER-${String(max + 1).padStart(3, '0')}`
  }

  const HerrForm = ({ form, errors, codigoReadOnly }: { form: ReturnType<typeof useForm<HerrFormData>>; errors: ReturnType<typeof useForm<HerrFormData>>['formState']['errors']; codigoReadOnly?: boolean }) => (
    // autoComplete="off" en cada input para que Chrome no sugiera valores
    // aprendidos en otros forms (p.ej. nombres de personal en el campo
    // "Nombre", que comparte el name `nom` con personal.nom).
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input
          label="Código *"
          placeholder="HER-001"
          autoComplete="off"
          error={errors.codigo?.message}
          readOnly={codigoReadOnly}
          className={codigoReadOnly ? 'bg-gris cursor-not-allowed' : ''}
          {...form.register('codigo', { required: 'Requerido' })}
        />
        <Input
          label="Nombre *"
          placeholder="Taladro percutor"
          autoComplete="off"
          error={errors.nom?.message}
          {...form.register('nom', { required: 'Requerido' })}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Select
          label="Tipo"
          options={[{ value: '', label: '— Sin tipo —' }, ...tipoOptions]}
          {...form.register('tipo_id')}
        />
        <MarcaCombobox form={form} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <ModeloCombobox form={form} />
        <Input
          label="N° de serie"
          placeholder="Opcional"
          autoComplete="off"
          {...form.register('serie')}
        />
      </div>
      <Input
        label="Fecha de ingreso"
        type="date"
        autoComplete="off"
        {...form.register('fecha_ingreso')}
      />
      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">
          Observaciones
        </label>
        <textarea
          rows={3}
          placeholder="Estado inicial, notas, etc."
          autoComplete="off"
          className="px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none focus:border-naranja transition-colors resize-none"
          {...form.register('obs')}
        />
      </div>
    </div>
  )

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-[2rem] tracking-wider text-azul">INVENTARIO</h1>
          <p className="text-sm text-gris-dark mt-0.5">
            {herramientas.length} herramienta{herramientas.length !== 1 ? 's' : ''} registrada{herramientas.length !== 1 ? 's' : ''}
          </p>
        </div>
        {puedeCrear && (
          <Button variant="primary" size="sm" onClick={() => { formNuevo.setValue('codigo', nextCodigo()); setModalNuevo(true) }}>
            ＋ Nueva herramienta
          </Button>
        )}
      </div>

      {/* Alertas — solo se renderiza si hay items que llamen atención */}
      <HerramientasAlertasSection onSelectHerramienta={setDetalle} />

      {/* Filtros */}
      <div className="bg-white rounded-card shadow-card p-3 flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gris-dark text-sm pointer-events-none">🔍</span>
          <input
            type="text"
            placeholder="Buscar por código, nombre, marca, serie u obra..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none focus:border-naranja transition-colors"
          />
        </div>
        <select
          value={filtroTipo}
          onChange={e => setFiltroTipo(e.target.value)}
          className="px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none focus:border-naranja transition-colors bg-white"
        >
          <option value="">Todos los tipos</option>
          {(config?.tipos ?? []).map(t => (
            <option key={t.id} value={String(t.id)}>{t.icono} {t.nom}</option>
          ))}
        </select>
        <select
          value={filtroEstado}
          onChange={e => setFiltroEstado(e.target.value)}
          className="px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none focus:border-naranja transition-colors bg-white"
        >
          <option value="">Todos los estados</option>
          {(config?.estados ?? []).map(e => (
            <option key={e.key} value={e.key}>{e.icono} {e.nom}</option>
          ))}
        </select>
        <select
          value={filtroObra}
          onChange={e => setFiltroObra(e.target.value)}
          className="px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none focus:border-naranja transition-colors bg-white"
        >
          <option value="">Todas las obras</option>
          <option value="__deposito__">📦 Depósito (sin obra)</option>
          {obras.map(o => (
            <option key={o.cod} value={o.cod}>📍 {o.nom}</option>
          ))}
        </select>
        {(busqueda || filtroTipo || filtroEstado || filtroObra) && (
          <button
            onClick={() => { setBusqueda(''); setFiltroTipo(''); setFiltroEstado(''); setFiltroObra('') }}
            className="text-xs font-bold text-gris-dark hover:text-carbon px-2 py-1 rounded hover:bg-gris transition-colors"
          >
            ✕ Limpiar
          </button>
        )}
      </div>

      {/* Tabla — desktop/tablet */}
      <div className="hidden md:block bg-white rounded-card shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {['Código', 'Herramienta', 'Tipo', 'Marca / Modelo', 'Obra actual', 'Estado', 'Responsable', ''].map(h => (
                  <th key={h} className="bg-azul text-white text-xs font-bold px-4 py-3 text-left uppercase tracking-wide whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="text-center py-10">
                    <span className="inline-flex items-center gap-2 text-gris-dark text-sm">
                      <span className="w-4 h-4 border-2 border-naranja border-t-transparent rounded-full animate-spin" />
                      Cargando...
                    </span>
                  </td>
                </tr>
              ) : filtradas.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-gris-dark text-sm">
                    {busqueda || filtroTipo || filtroEstado
                      ? 'No se encontraron resultados para los filtros aplicados'
                      : 'No hay herramientas registradas. Agregá la primera.'
                    }
                  </td>
                </tr>
              ) : (
                filtradas.map(h => (
                  <tr
                    key={h.id}
                    className="border-b border-gris last:border-0 hover:bg-gris/40 transition-colors cursor-pointer"
                    onClick={() => setDetalle(h)}
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs bg-gris px-2 py-0.5 rounded text-gris-dark font-bold">
                        {h.codigo}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-bold text-sm text-carbon">{h.nom}</td>
                    <td className="px-4 py-3">
                      {h.tipo ? (
                        <span className="text-xs font-bold bg-azul-light text-azul-mid px-2 py-0.5 rounded">
                          {h.tipo.icono} {h.tipo.nom}
                        </span>
                      ) : (
                        <span className="text-gris-mid text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gris-dark">
                      {[h.marca, h.modelo].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td className="px-4 py-3">
                      {h.obra ? (
                        <span className="text-xs bg-naranja-light text-naranja-dark px-2 py-0.5 rounded font-bold">
                          {h.obra.nom}
                        </span>
                      ) : (
                        <span className="text-xs text-gris-dark">Depósito</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${ESTADO_COLORS[h.estado_key] ?? 'bg-gris text-gris-dark'}`}>
                        {h.estado?.icono} {h.estado?.nom ?? h.estado_key}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gris-dark">
                      {h.responsable || '—'}
                    </td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex gap-1 justify-end">
                        {puedeEditar && (
                          <button
                            onClick={() => openEdit(h)}
                            className="text-xs font-bold px-2 py-1 rounded hover:bg-gris transition-colors"
                          >
                            ✏️
                          </button>
                        )}
                        {puedeEliminar && (
                          <button
                            onClick={() => handleDelete(h)}
                            className="text-xs font-bold px-2 py-1 rounded hover:bg-rojo-light text-gris-dark hover:text-rojo transition-colors"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cards — mobile */}
      <div className="md:hidden flex flex-col gap-2">
        {isLoading ? (
          <div className="bg-white rounded-card shadow-card p-6 text-center text-gris-dark text-sm">
            Cargando...
          </div>
        ) : filtradas.length === 0 ? (
          <div className="bg-white rounded-card shadow-card p-6 text-center text-gris-dark text-sm italic">
            {busqueda || filtroTipo || filtroEstado
              ? 'No se encontraron resultados para los filtros aplicados.'
              : 'No hay herramientas registradas. Agregá la primera.'}
          </div>
        ) : filtradas.map(h => (
          <button
            key={h.id}
            onClick={() => setDetalle(h)}
            className="bg-white rounded-card shadow-card p-3 text-left active:bg-gris/40 transition-colors w-full"
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-mono text-[11px] bg-gris px-2 py-0.5 rounded text-gris-dark font-bold">
                    {h.codigo}
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${ESTADO_COLORS[h.estado_key] ?? 'bg-gris text-gris-dark'}`}>
                    {h.estado?.icono} {h.estado?.nom ?? h.estado_key}
                  </span>
                </div>
                <div className="font-bold text-sm text-carbon truncate">{h.nom}</div>
                {(h.marca || h.modelo) && (
                  <div className="text-xs text-gris-dark mt-0.5">
                    {[h.marca, h.modelo].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {h.tipo && (
                <span className="text-[10px] font-bold bg-azul-light text-azul-mid px-2 py-0.5 rounded">
                  {h.tipo.icono} {h.tipo.nom}
                </span>
              )}
              {h.obra ? (
                <span className="text-[10px] bg-naranja-light text-naranja-dark px-2 py-0.5 rounded font-bold">
                  📍 {h.obra.nom}
                </span>
              ) : (
                <span className="text-[10px] text-gris-dark">📦 Depósito</span>
              )}
              {h.responsable && (
                <span className="text-[10px] text-gris-dark">👤 {h.responsable}</span>
              )}
            </div>
            {(puedeEditar || puedeEliminar) && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="flex gap-1 justify-end mt-2 pt-2 border-t border-gris"
              >
                {puedeEditar && (
                  <button
                    onClick={() => openEdit(h)}
                    className="text-xs font-bold px-2 py-1 rounded hover:bg-gris transition-colors"
                  >
                    ✏️ Editar
                  </button>
                )}
                {puedeEliminar && (
                  <button
                    onClick={() => handleDelete(h)}
                    className="text-xs font-bold px-2 py-1 rounded hover:bg-rojo-light text-gris-dark hover:text-rojo transition-colors"
                  >
                    ✕ Eliminar
                  </button>
                )}
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Modal nuevo */}
      <Modal
        open={modalNuevo}
        onClose={() => { setModalNuevo(false); formNuevo.reset(); setFotosCola([]) }}
        title="🔧 NUEVA HERRAMIENTA"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setModalNuevo(false); formNuevo.reset(); setFotosCola([]) }}>Cancelar</Button>
            <Button
              variant="primary"
              loading={creating || subiendoFotos}
              onClick={formNuevo.handleSubmit(handleCreate)}
            >
              ✓ Guardar{fotosCola.length > 0 ? ` y subir ${fotosCola.length} foto${fotosCola.length === 1 ? '' : 's'}` : ''}
            </Button>
          </>
        }
      >
        <HerrForm form={formNuevo} errors={formNuevo.formState.errors} codigoReadOnly />

        {/* Cola de fotos: se suben con el id resultante apenas se crea la herramienta. */}
        <div className="border-t border-gris-mid pt-4 mt-4">
          <HerramientaFotosCola files={fotosCola} onChange={setFotosCola} />
        </div>
      </Modal>

      {/* Modal editar */}
      <Modal
        open={!!editando}
        onClose={() => setEditando(null)}
        title="✏️ EDITAR HERRAMIENTA"
        footer={
          <>
            <Button variant="danger" onClick={() => editando && handleDelete(editando)} className="mr-auto">
              🗑 Dar de baja
            </Button>
            <Button variant="secondary" onClick={() => setEditando(null)}>Cancelar</Button>
            <Button variant="primary" loading={updating} onClick={formEdit.handleSubmit(handleUpdate)}>
              ✓ Guardar
            </Button>
          </>
        }
      >
        <HerrForm form={formEdit} errors={formEdit.formState.errors} />

        {/* Galería de fotos: visible solo en edición porque requiere id
            de herramienta existente (FK en herramienta_fotos). */}
        {editando && (
          <div className="border-t border-gris-mid pt-4 mt-1">
            <HerramientaFotosSection herramientaId={editando.id} />
          </div>
        )}

        <AuditInfo
          createdBy={editando?.created_by}
          updatedBy={editando?.updated_by}
          createdAt={editando?.created_at}
          updatedAt={editando?.updated_at}
        />
      </Modal>

      {/* Modal detalle */}
      {detalle && (
        <Modal
          open={!!detalle}
          onClose={() => setDetalle(null)}
          title={`🔧 ${detalle.codigo} — ${detalle.nom}`}
          footer={
            <>
              <Button variant="secondary" onClick={() => setDetalle(null)}>Cerrar</Button>
              <Button variant="primary" onClick={() => { setDetalle(null); openEdit(detalle) }}>
                ✏️ Editar
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <InfoField label="Código"       value={detalle.codigo} />
              <InfoField label="Tipo"         value={detalle.tipo ? `${detalle.tipo.icono ?? ''} ${detalle.tipo.nom}` : '—'} />
              <InfoField label="Marca"        value={detalle.marca} />
              <InfoField label="Modelo"       value={detalle.modelo} />
              <InfoField label="N° de serie"  value={detalle.serie} />
              <InfoField label="Fecha ingreso" value={fmtFecha(detalle.fecha_ingreso)} />
              <InfoField label="Estado"       value={`${detalle.estado?.icono ?? ''} ${detalle.estado?.nom ?? detalle.estado_key}`} />
              <InfoField label="Ubicación"    value={detalle.obra ? `${detalle.obra.cod} — ${detalle.obra.nom}` : 'Depósito'} />
              <InfoField label="Responsable"  value={detalle.responsable} />
            </div>
            {detalle.obs && (
              <div className="bg-gris rounded-xl p-3">
                <div className="text-[10px] font-bold text-gris-dark uppercase tracking-wider mb-1">Observaciones</div>
                <p className="text-sm text-carbon">{detalle.obs}</p>
              </div>
            )}

            {/* Galería de fotos read-only (sin botón subir/borrar — eso
                se hace desde Editar). */}
            <HerramientaFotosSection herramientaId={detalle.id} readOnly />

            <AuditInfo
              createdBy={detalle.created_by}
              updatedBy={detalle.updated_by}
              createdAt={detalle.created_at}
              updatedAt={detalle.updated_at}
            />
          </div>
        </Modal>
      )}

    </div>
  )
}

function InfoField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-bold text-gris-dark uppercase tracking-wider">{label}</span>
      <span className="text-sm font-semibold text-carbon">
        {value || <span className="text-gris-mid font-normal">—</span>}
      </span>
    </div>
  )
}