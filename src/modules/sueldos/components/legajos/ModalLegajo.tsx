'use client'

import { useState, type ReactNode } from 'react'
import { useForm, useWatch, Controller, type FieldPath } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Combobox } from '@/components/ui/Combobox'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import { useObras } from '@/modules/tarja/hooks/useObras'
import type { LegajoFicha, LegajoUpdate } from '@/types/sueldos.types'
import { useActualizarLegajo, useCategorias, useConvenios, useLegajo, useSacLegajo, useVacacionesLegajo } from '../../hooks/useSueldos'
import {
  ESTADO_CIVIL_LABEL, ESTADOS_CIVILES, FALTANTE_LABEL, MODALIDADES, TIPO_LIQ_LABEL, cbuValido, cuilValido, esEnmascarado,
  fmtCuil, fmtFecha, fmtM, fmtMes, hoyAR,
} from '../../utils/sueldos.utils'
import { errorDeCampoSueldos, mensajeErrorSueldos } from '../../utils/sueldos.errores'
import { Aviso, Campo, Cargando, Check, ErrorCarga, EstadoRec, ListaAvisos, inputCls } from '../Comun'

/**
 * Ficha laboral de un legajo. Arranca en modo DETALLE (solo lectura) y el
 * botón «Editar» habilita el formulario, para no tocar nada sin querer.
 * CUIL y CBU: sin «Ver datos personales» llegan enmascarados, se muestran
 * deshabilitados y NO se mandan (el backend rechaza con SIN_PERMISO_PII).
 */
export function ModalLegajo({ id, editarAlAbrir, onClose }: { id: number; editarAlAbrir?: boolean; onClose: () => void }) {
  const { puedeEditar } = usePermisos('sueldos')
  const ficha = useLegajo(id)
  const [editando, setEditando] = useState(!!editarAlAbrir && puedeEditar)

  const l = ficha.data
  const titulo = l ? `${l.nombre_mostrar}${l.leg ? ` · Leg. ${l.leg}` : ''}` : 'Legajo'

  if (editando && l) {
    return <FormLegajo legajo={l} onCancel={() => setEditando(false)} onGuardado={() => setEditando(false)} onClose={onClose} />
  }

  return (
    <Modal open onClose={onClose} title={titulo} width="max-w-3xl"
      footer={<>
        <Button variant="ghost" size="sm" onClick={onClose}>Cerrar</Button>
        <Button size="sm" disabled={!l || !puedeEditar} onClick={() => setEditando(true)}
          title={puedeEditar ? 'Editar la ficha' : 'Hace falta el permiso «Editar» en Sueldos'}>
          ✏ Editar
        </Button>
      </>}>
      {ficha.isLoading ? <Cargando />
        : ficha.isError || !l ? <ErrorCarga mensaje={mensajeErrorSueldos(ficha.error)} onReintentar={() => ficha.refetch()} />
        : <DetalleLegajo l={l} />}
    </Modal>
  )
}

function Par({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] font-bold text-gris-dark uppercase tracking-wide">{label}</span>
      <span className="text-sm text-carbon break-words">{children || <span className="text-gris-dark">—</span>}</span>
    </div>
  )
}

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-xs font-bold text-azul uppercase tracking-wider border-b border-gris pb-1">{titulo}</h4>
      {children}
    </div>
  )
}

function DetalleLegajo({ l }: { l: LegajoFicha }) {
  const [verSac, setVerSac] = useState(false)
  const [verVac, setVerVac] = useState(false)
  const sac = useSacLegajo(l.id, {}, verSac)
  const vac = useVacacionesLegajo(l.id, {}, verVac)
  const modalidad = MODALIDADES.find(m => m.value === l.modalidad_contratacion)?.label ?? l.modalidad_contratacion

  return (
    <div className="flex flex-col gap-4">
      {l.incompleto && (
        <Aviso tono="naranja">
          Ficha incompleta: falta {l.faltantes.map(f => FALTANTE_LABEL[f] ?? f).join(', ')}. Se puede liquidar igual, pero el recibo, el banco y el LSD necesitan esos datos.
        </Aviso>
      )}
      {!l.activo && <Aviso tono="gris">Legajo dado de baja: no entra al generar recibos.</Aviso>}

      <Seccion titulo="Empleado">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Par label="Nombre">{l.nombre_mostrar}</Par>
          <Par label="CUIL"><span className="font-mono">{fmtCuil(l.cuil)}</span></Par>
          <Par label="DNI">{l.dni}</Par>
          <Par label="Estado civil">{ESTADO_CIVIL_LABEL[l.estado_civil] ?? l.estado_civil}</Par>
          <Par label="Cónyuge a cargo">{l.conyuge_a_cargo ? 'Sí' : 'No'}</Par>
          <Par label="Hijos a cargo">{String(l.hijos_a_cargo ?? 0)}</Par>
        </div>
      </Seccion>

      <Seccion titulo="Relación laboral">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Par label="Convenio">{l.convenio_nombre}</Par>
          <Par label="Categoría">{l.categoria_nombre}</Par>
          <Par label="Zona">{l.zona}</Par>
          <Par label="Jornada">{l.jornada === 'parcial' ? 'Parcial' : 'Completa'}</Par>
          <Par label="Ingreso">{fmtFecha(l.fecha_ingreso)}</Par>
          <Par label="Egreso">{fmtFecha(l.fecha_egreso)}</Par>
          <Par label="Modalidad">{modalidad}</Par>
          <Par label="Obra habitual">{l.obra_cod_habitual}</Par>
          {l.convenio_codigo === 'uecara' && <Par label="Título">{l.titulo_nivel ? `Nivel ${l.titulo_nivel}` : 'Sin título'}</Par>}
          {l.convenio_codigo === 'uocra' && <Par label="Libreta IERIC">{l.ieric_numero}</Par>}
          {l.convenio_codigo === 'uocra' && <Par label="Cuenta fondo de cese">{l.fondo_cese_cuenta}</Par>}
          {l.carnet_profesional && <Par label="Carnet profesional">{l.carnet_profesional}</Par>}
          <Par label="RIFL">{l.rifl ? 'Sí' : 'No'}</Par>
        </div>
      </Seccion>

      <Seccion titulo="Obra social, sindicato y pago">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Par label="Obra social">{l.obra_social}{l.obra_social_codigo ? ` (${l.obra_social_codigo})` : ''}</Par>
          <Par label="Afiliado al sindicato">{l.afiliado_sindicato ? 'Sí' : 'No'}</Par>
          <Par label="Banco">{l.banco}</Par>
          <Par label="CBU"><span className="font-mono">{l.cbu}</span></Par>
        </div>
      </Seccion>

      <Seccion titulo="Vínculos">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div className="border border-gris-mid rounded-lg p-2">
            <div className="text-[10px] font-bold text-gris-dark uppercase">Personal (Tarja)</div>
            {l.personal
              ? <div>Leg. {l.personal.leg} · {l.personal.nom}<div className="text-[11px] text-gris-dark">{l.personal.condicion ?? 'sin condición'} · {l.personal.modalidad === 'mes' ? 'mensual' : 'por hora'}{l.personal.fecha_nacimiento ? ` · nac. ${fmtFecha(l.personal.fecha_nacimiento)}` : ''}</div></div>
              : <div className="text-gris-dark">Sin vínculo</div>}
          </div>
          <div className="border border-gris-mid rounded-lg p-2">
            <div className="text-[10px] font-bold text-gris-dark uppercase">Chofer (Logística)</div>
            {l.chofer
              ? <div>{l.chofer.nombre}<div className="text-[11px] text-gris-dark">{l.chofer.es_propio ? 'Propio' : 'No propio'} · {l.chofer.estado ?? '—'}{l.chofer.licencia ? ` · licencia ${l.chofer.licencia}` : ''}</div></div>
              : <div className="text-gris-dark">Sin vínculo</div>}
          </div>
        </div>
        {l.obs && <p className="text-xs text-gris-dark whitespace-pre-wrap">{l.obs}</p>}
      </Seccion>

      <Seccion titulo="Aguinaldo y vacaciones (sugerencias)">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => setVerSac(true)} loading={verSac && sac.isFetching}>SAC del semestre</Button>
          <Button size="sm" variant="secondary" onClick={() => setVerVac(true)} loading={verVac && vac.isFetching}>Vacaciones del año</Button>
        </div>
        {verSac && sac.isError && <Aviso tono="rojo">{mensajeErrorSueldos(sac.error)}</Aviso>}
        {verSac && sac.data && (
          <div className="border border-gris-mid rounded-lg p-2 text-sm flex flex-col gap-1">
            <div><b>SAC {sac.data.semestre}º semestre {sac.data.anio}:</b> {fmtM(sac.data.importe)}{sac.data.proporcional ? ` (proporcional: ${sac.data.dias_computados} de ${sac.data.dias_semestre} días)` : ''}</div>
            <div className="text-xs text-gris-dark">Mejor remuneración: {fmtM(sac.data.mejor_remuneracion)}{sac.data.mejor_periodo ? ` (${fmtMes(sac.data.mejor_periodo)})` : ''}</div>
            <ListaAvisos avisos={sac.data.avisos} />
          </div>
        )}
        {verVac && vac.isError && <Aviso tono="rojo">{mensajeErrorSueldos(vac.error)}</Aviso>}
        {verVac && vac.data && (
          <div className="border border-gris-mid rounded-lg p-2 text-sm flex flex-col gap-1">
            <div><b>Vacaciones {vac.data.anio}:</b> {vac.data.dias} días × {fmtM(vac.data.valor_dia)} = {fmtM(vac.data.importe)}</div>
            <div className="text-xs text-gris-dark">
              Antigüedad {vac.data.antiguedad_anios} años · {vac.data.criterio === 'escala' ? 'escala 14/21/28/35' : '1 día cada 20 trabajados'} · valor día {vac.data.base_valor === 'jornal' ? 'jornal (horas del día × valor hora)' : 'remuneración / 25'}
            </div>
            <ListaAvisos avisos={vac.data.avisos} />
          </div>
        )}
        <p className="text-[11px] text-gris-dark">Se cobran creando una liquidación de tipo SAC o Vacaciones en Liquidaciones.</p>
      </Seccion>

      <Seccion titulo="Últimos recibos">
        {l.recibos.length === 0 ? <p className="text-sm text-gris-dark italic">Todavía no tiene recibos.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {l.recibos.map(r => (
                  <tr key={r.id} className="border-t border-gris">
                    <td className="py-1.5 pr-2">
                      <a className="text-azul font-semibold hover:underline" href={`/sueldos?tab=liquidaciones&liq=${r.liquidacion_id}`}>
                        {r.liquidacion?.codigo ?? `#${r.liquidacion_id}`}
                      </a>
                      <span className="text-[11px] text-gris-dark"> · {r.liquidacion ? `${TIPO_LIQ_LABEL[r.liquidacion.tipo]}${r.liquidacion.quincena ? ` ${r.liquidacion.quincena}ª` : ''} ${fmtMes(r.liquidacion.periodo)}` : ''}</span>
                    </td>
                    <td className="py-1.5 pr-2"><EstadoRec estado={r.estado} /></td>
                    <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">{fmtM(r.neto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Seccion>
    </div>
  )
}

// ── Formulario ───────────────────────────────────────────────────────

const FECHA = /^(\d{4}-\d{2}-\d{2})?$/

const schema = z.object({
  nombre:                 z.string().trim().max(120, 'Hasta 120 caracteres'),
  convenio_id:            z.string().min(1, 'Elegí el convenio'),
  categoria_id:           z.string(),
  zona:                   z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,5}$/, 'Letras o números, hasta 5'),
  fecha_ingreso:          z.string().regex(FECHA, 'Fecha inválida'),
  fecha_egreso:           z.string().regex(FECHA, 'Fecha inválida'),
  modalidad_contratacion: z.string().regex(/^[a-z_]{3,40}$/, 'Modalidad inválida'),
  jornada:                z.enum(['completa', 'parcial']),
  cuil:                   z.string().trim(),
  cbu:                    z.string().trim(),
  banco:                  z.string().trim().max(80, 'Hasta 80 caracteres'),
  obra_social:            z.string().trim().max(120, 'Hasta 120 caracteres'),
  obra_social_codigo:     z.string().trim().max(20, 'Hasta 20 caracteres'),
  afiliado_sindicato:     z.boolean(),
  estado_civil:           z.string(),
  conyuge_a_cargo:        z.boolean(),
  hijos_a_cargo:          z.string().regex(/^\d{1,2}$/, 'Número de 0 a 30').refine(v => Number(v) <= 30, 'De 0 a 30'),
  ieric_numero:           z.string().trim().max(40, 'Hasta 40 caracteres'),
  fondo_cese_cuenta:      z.string().trim().max(40, 'Hasta 40 caracteres'),
  titulo_nivel:           z.enum(['', 'A', 'B', 'C']),
  carnet_profesional:     z.string().trim().max(60, 'Hasta 60 caracteres'),
  rifl:                   z.boolean(),
  obra_cod_habitual:      z.string(),
  activo:                 z.boolean(),
  obs:                    z.string().max(1000, 'Hasta 1000 caracteres'),
}).superRefine((d, ctx) => {
  if (d.cuil && !esEnmascarado(d.cuil) && !cuilValido(d.cuil)) ctx.addIssue({ code: 'custom', path: ['cuil'], message: 'CUIL inválido (11 dígitos con verificador)' })
  if (d.cbu && !esEnmascarado(d.cbu) && !cbuValido(d.cbu)) ctx.addIssue({ code: 'custom', path: ['cbu'], message: 'CBU inválido (22 dígitos con verificadores)' })
  if (d.fecha_ingreso && d.fecha_egreso && d.fecha_egreso < d.fecha_ingreso) ctx.addIssue({ code: 'custom', path: ['fecha_egreso'], message: 'No puede ser anterior al ingreso' })
})
type FormData = z.infer<typeof schema>

const CAMPOS = new Set<string>(Object.keys(schema.shape))

function defaults(l: LegajoFicha): FormData {
  return {
    nombre: l.nombre ?? '',
    convenio_id: String(l.convenio_id),
    categoria_id: l.categoria_id ? String(l.categoria_id) : '',
    zona: l.zona || 'A',
    fecha_ingreso: l.fecha_ingreso ?? '',
    fecha_egreso: l.fecha_egreso ?? '',
    modalidad_contratacion: l.modalidad_contratacion || 'tiempo_indeterminado',
    jornada: l.jornada ?? 'completa',
    cuil: l.cuil ?? '',
    cbu: l.cbu ?? '',
    banco: l.banco ?? '',
    obra_social: l.obra_social ?? '',
    obra_social_codigo: l.obra_social_codigo ?? '',
    afiliado_sindicato: !!l.afiliado_sindicato,
    estado_civil: l.estado_civil ?? '',
    conyuge_a_cargo: !!l.conyuge_a_cargo,
    hijos_a_cargo: String(l.hijos_a_cargo ?? 0),
    ieric_numero: l.ieric_numero ?? '',
    fondo_cese_cuenta: l.fondo_cese_cuenta ?? '',
    titulo_nivel: l.titulo_nivel ?? '',
    carnet_profesional: l.carnet_profesional ?? '',
    rifl: !!l.rifl,
    obra_cod_habitual: l.obra_cod_habitual ?? '',
    activo: !!l.activo,
    obs: l.obs ?? '',
  }
}

function FormLegajo({ legajo, onCancel, onGuardado, onClose }: {
  legajo: LegajoFicha; onCancel: () => void; onGuardado: () => void; onClose: () => void
}) {
  const toast = useToast()
  const { verPii } = usePermisos('sueldos')
  const guardar = useActualizarLegajo()
  const { data: convenios = [] } = useConvenios()
  const { data: obras = [] } = useObras()
  const [errorServer, setErrorServer] = useState<string | null>(null)

  const { register, control, handleSubmit, setError, setValue, formState: { errors, dirtyFields } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: defaults(legajo),
  })
  const convenioId = useWatch({ control, name: 'convenio_id' })
  // Todas las categorías: al cambiar de convenio hace falta la inicial del nuevo.
  const { data: categorias = [] } = useCategorias()
  const convenio = convenios.find(c => String(c.id) === convenioId)
  const cats = categorias.filter(c => String(c.convenio_id) === convenioId && (c.activo || String(c.id) === String(legajo.categoria_id ?? '')))
  const vinculado = !!legajo.leg || !!legajo.chofer_id

  function cambiarConvenio(v: string) {
    setValue('convenio_id', v, { shouldDirty: true })
    // La categoría es del convenio: se pasa a la inicial del nuevo (el backend no acepta una de otro convenio).
    const conv = Number(v)
    const def = categorias.find(c => c.convenio_id === conv && c.por_defecto)
    setValue('categoria_id', def ? String(def.id) : '', { shouldDirty: true })
  }

  async function enviar(d: FormData) {
    setErrorServer(null)
    const sucio = (k: keyof FormData) => !!(dirtyFields as Partial<Record<keyof FormData, boolean>>)[k]
    const body: LegajoUpdate = {}
    if (sucio('nombre') && !vinculado) body.nombre = d.nombre.trim()
    if (sucio('convenio_id')) body.convenio_id = Number(d.convenio_id)
    if (sucio('categoria_id') || sucio('convenio_id')) body.categoria_id = d.categoria_id ? Number(d.categoria_id) : null
    if (sucio('zona')) body.zona = d.zona
    if (sucio('fecha_ingreso')) body.fecha_ingreso = d.fecha_ingreso || null
    if (sucio('fecha_egreso')) body.fecha_egreso = d.fecha_egreso || null
    if (sucio('modalidad_contratacion')) body.modalidad_contratacion = d.modalidad_contratacion
    if (sucio('jornada')) body.jornada = d.jornada
    if (verPii && sucio('cuil') && !esEnmascarado(d.cuil)) body.cuil = d.cuil ? d.cuil.replace(/\D/g, '') : null
    if (verPii && sucio('cbu') && !esEnmascarado(d.cbu)) body.cbu = d.cbu ? d.cbu.replace(/\D/g, '') : null
    if (sucio('banco')) body.banco = d.banco
    if (sucio('obra_social')) body.obra_social = d.obra_social
    if (sucio('obra_social_codigo')) body.obra_social_codigo = d.obra_social_codigo
    if (sucio('afiliado_sindicato')) body.afiliado_sindicato = d.afiliado_sindicato
    if (sucio('estado_civil')) body.estado_civil = d.estado_civil
    if (sucio('conyuge_a_cargo')) body.conyuge_a_cargo = d.conyuge_a_cargo
    if (sucio('hijos_a_cargo')) body.hijos_a_cargo = Number(d.hijos_a_cargo)
    if (sucio('ieric_numero')) body.ieric_numero = d.ieric_numero
    if (sucio('fondo_cese_cuenta')) body.fondo_cese_cuenta = d.fondo_cese_cuenta
    if (sucio('titulo_nivel')) body.titulo_nivel = d.titulo_nivel || null
    if (sucio('carnet_profesional')) body.carnet_profesional = d.carnet_profesional
    if (sucio('rifl')) body.rifl = d.rifl
    if (sucio('obra_cod_habitual')) body.obra_cod_habitual = d.obra_cod_habitual || null
    if (sucio('activo')) body.activo = d.activo
    if (sucio('obs')) body.obs = d.obs

    if (Object.keys(body).length === 0) { onGuardado(); return }
    try {
      await guardar.mutateAsync({ id: legajo.id, ...body })
      toast('✓ Ficha guardada', 'ok')
      onGuardado()
    } catch (e) {
      const ce = errorDeCampoSueldos(e)
      if (ce && CAMPOS.has(ce.campo)) setError(ce.campo as FieldPath<FormData>, { message: ce.mensaje })
      setErrorServer(mensajeErrorSueldos(e))
    }
  }

  const piiHint = verPii ? undefined : 'necesita «Ver datos personales»'

  return (
    <Modal open onClose={guardar.isPending ? () => {} : onClose} width="max-w-3xl"
      title={`Editar · ${legajo.nombre_mostrar}`}
      footer={<>
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={guardar.isPending}>Cancelar</Button>
        <Button size="sm" loading={guardar.isPending} onClick={handleSubmit(enviar)}>Guardar ficha</Button>
      </>}>
      <form className="flex flex-col gap-4" onSubmit={e => { e.preventDefault(); void handleSubmit(enviar)() }}>
        <Seccion titulo="Empleado">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Campo label="Nombre" hint={vinculado ? 'sale de Personal / Choferes' : undefined} error={errors.nombre?.message} className="md:col-span-2">
              <input className={inputCls} {...register('nombre')} disabled={vinculado} placeholder={legajo.nombre_mostrar} />
            </Campo>
            <Campo label="CUIL" hint={piiHint} error={errors.cuil?.message}>
              <input className={`${inputCls} font-mono`} {...register('cuil')} disabled={!verPii} placeholder="20-12345678-6" inputMode="numeric"
                title={verPii ? undefined : 'Para ver o cambiar el CUIL hace falta el permiso «Ver datos personales»'} />
            </Campo>
            <Campo label="Estado civil">
              <select className={inputCls} {...register('estado_civil')}>
                {ESTADOS_CIVILES.map(e => <option key={e} value={e}>{ESTADO_CIVIL_LABEL[e]}</option>)}
              </select>
            </Campo>
            <Campo label="Hijos a cargo" error={errors.hijos_a_cargo?.message}>
              <input className={inputCls} type="number" min={0} max={30} {...register('hijos_a_cargo')} />
            </Campo>
            <div className="flex items-end pb-2">
              <Controller control={control} name="conyuge_a_cargo" render={({ field }) => (
                <Check label="Cónyuge a cargo" checked={field.value} onChange={field.onChange} />
              )} />
            </div>
          </div>
        </Seccion>

        <Seccion titulo="Relación laboral">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Campo label="Convenio" error={errors.convenio_id?.message}>
              <select className={inputCls} value={convenioId} onChange={e => cambiarConvenio(e.target.value)}>
                {convenios.filter(c => c.activo || String(c.id) === convenioId).map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </Campo>
            <Campo label="Categoría" error={errors.categoria_id?.message}>
              <select className={inputCls} {...register('categoria_id')}>
                <option value="">— sin categoría —</option>
                {cats.map(c => <option key={c.id} value={c.id}>{c.nombre}{c.por_defecto ? ' (inicial)' : ''}</option>)}
              </select>
            </Campo>
            <Campo label="Zona" error={errors.zona?.message}>
              <input className={inputCls} {...register('zona')} maxLength={5} />
            </Campo>
            <Campo label="Fecha de ingreso" error={errors.fecha_ingreso?.message}>
              <input className={inputCls} type="date" max={hoyAR()} {...register('fecha_ingreso')} />
            </Campo>
            <Campo label="Fecha de egreso" hint="solo si se fue" error={errors.fecha_egreso?.message}>
              <input className={inputCls} type="date" {...register('fecha_egreso')} />
            </Campo>
            <Campo label="Jornada">
              <select className={inputCls} {...register('jornada')}>
                <option value="completa">Completa</option>
                <option value="parcial">Parcial</option>
              </select>
            </Campo>
            <Campo label="Modalidad de contratación" error={errors.modalidad_contratacion?.message}>
              <select className={inputCls} {...register('modalidad_contratacion')}>
                {MODALIDADES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                {!MODALIDADES.some(m => m.value === legajo.modalidad_contratacion) && (
                  <option value={legajo.modalidad_contratacion}>{legajo.modalidad_contratacion}</option>
                )}
              </select>
            </Campo>
            <Campo label="Obra habitual" hint="para el asiento" className="md:col-span-2">
              <Controller control={control} name="obra_cod_habitual" render={({ field }) => (
                <Combobox value={field.value} onChange={field.onChange} placeholder="Sin obra habitual"
                  options={[{ value: '', label: '— Sin obra habitual —' }, ...obras.map(o => ({ value: o.cod, label: `${o.cod} · ${o.nom}` }))]} />
              )} />
            </Campo>
            {convenio?.codigo === 'uecara' && (
              <Campo label="Título (UECARA)">
                <select className={inputCls} {...register('titulo_nivel')}>
                  <option value="">Sin título</option>
                  <option value="A">Nivel A</option>
                  <option value="B">Nivel B</option>
                  <option value="C">Nivel C</option>
                </select>
              </Campo>
            )}
            {convenio?.codigo === 'uocra' && (
              <>
                <Campo label="Libreta IERIC" error={errors.ieric_numero?.message}>
                  <input className={inputCls} {...register('ieric_numero')} />
                </Campo>
                <Campo label="Cuenta fondo de cese" error={errors.fondo_cese_cuenta?.message}>
                  <input className={inputCls} {...register('fondo_cese_cuenta')} />
                </Campo>
              </>
            )}
            <Campo label="Carnet profesional" hint="choferes" error={errors.carnet_profesional?.message}>
              <input className={inputCls} {...register('carnet_profesional')} />
            </Campo>
            <div className="flex items-end pb-2">
              <Controller control={control} name="rifl" render={({ field }) => (
                <Check label="RIFL (régimen de incentivo)" checked={field.value} onChange={field.onChange}
                  title="Régimen de Incentivo a la Formalización Laboral: contribuciones reducidas" />
              )} />
            </div>
          </div>
        </Seccion>

        <Seccion titulo="Obra social, sindicato y pago">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Campo label="Obra social" error={errors.obra_social?.message} className="md:col-span-2">
              <input className={inputCls} {...register('obra_social')} placeholder="p. ej. OSPECON" />
            </Campo>
            <Campo label="Código RNOS" error={errors.obra_social_codigo?.message}>
              <input className={inputCls} {...register('obra_social_codigo')} placeholder="6 dígitos" />
            </Campo>
            <div className="flex items-end pb-2">
              <Controller control={control} name="afiliado_sindicato" render={({ field }) => (
                <Check label="Afiliado al sindicato" checked={field.value} onChange={field.onChange}
                  title="Afiliado: cuota sindical. No afiliado: aporte solidario (según el convenio)" />
              )} />
            </div>
            <Campo label="Banco" error={errors.banco?.message}>
              <input className={inputCls} {...register('banco')} />
            </Campo>
            <Campo label="CBU" hint={piiHint} error={errors.cbu?.message}>
              <input className={`${inputCls} font-mono`} {...register('cbu')} disabled={!verPii} inputMode="numeric" placeholder="22 dígitos"
                title={verPii ? undefined : 'Para ver o cambiar el CBU hace falta el permiso «Ver datos personales»'} />
            </Campo>
          </div>
        </Seccion>

        <Seccion titulo="Estado">
          <div className="flex flex-col gap-2">
            <Controller control={control} name="activo" render={({ field }) => (
              <Check label="Legajo activo (entra al generar recibos)" checked={field.value} onChange={field.onChange} />
            )} />
            <Campo label="Observaciones" error={errors.obs?.message}>
              <textarea className={inputCls} rows={2} {...register('obs')} />
            </Campo>
          </div>
        </Seccion>

        {errorServer && <Aviso tono="rojo">{errorServer}</Aviso>}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  )
}
