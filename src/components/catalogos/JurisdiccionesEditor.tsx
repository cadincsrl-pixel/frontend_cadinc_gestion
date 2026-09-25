'use client'

import { useState, type ReactNode } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import {
  useCrearJurisdiccion, useEditarJurisdiccion, useJurisdicciones, useJurisdiccionesSinNormalizar,
} from '@/hooks/useJurisdicciones'
import {
  TIPO_JURISDICCION_LABEL, campoErrorJurisdiccion, mensajeErrorJurisdiccion, parsearAlias,
} from '@/lib/utils/jurisdicciones'
import type { Jurisdiccion, JurisdiccionInput, JurisdiccionSinNormalizar, TipoJurisdiccion } from '@/types/config.types'

function Nota({ tono, children }: { tono: 'rojo' | 'naranja' | 'gris'; children: ReactNode }) {
  const clases = {
    rojo:    'bg-rojo-light border-rojo/30 text-rojo',
    naranja: 'bg-naranja-light border-naranja/30 text-naranja-dark',
    gris:    'bg-gris border-gris-mid text-gris-dark',
  }[tono]
  return <div className={`border rounded p-2 text-xs ${clases}`}>{children}</div>
}

const TABLA_LABEL: Record<JurisdiccionSinNormalizar['tabla'], string> = {
  pagos_factura_tributos:   'tributos de compras',
  ventas_cobro_retenciones: 'retenciones de cobros',
}

/**
 * Jurisdicciones (20260929f): el catálogo que comparten Compras (tributos de
 * la factura) y Ventas (retenciones). Se usa en Compras › Configuración y en
 * Ventas › Configuración. Editar pide el flag `configurar` en cualquiera de
 * los dos módulos; sin él los botones quedan deshabilitados con el motivo.
 * No se borran: se dan de baja. Los alias son las otras formas en que viene
 * escrita («capital federal», «smt»): con ellos la lectura IA y los textos
 * viejos se resuelven solos.
 */
export function JurisdiccionesEditor() {
  const toast = useToast()
  const pagos = usePermisos('pagos')
  const ventas = usePermisos('facturacion')
  const puede = pagos.configurar || ventas.configurar
  const [inactivas, setInactivas] = useState(false)
  const [editando, setEditando] = useState<{ open: boolean; j?: Jurisdiccion; aliasNuevo?: string }>({ open: false })
  const [asignando, setAsignando] = useState<JurisdiccionSinNormalizar | null>(null)
  const lista = useJurisdicciones(true)
  const sueltos = useJurisdiccionesSinNormalizar(!lista.respaldo)
  const editar = useEditarJurisdiccion()
  const tip = puede ? undefined : 'Necesitás el permiso «Configurar» de Compras o de Ventas'
  const bloqueado = !puede || lista.respaldo

  const visibles = lista.jurisdicciones.filter(j => inactivas || j.activo)

  async function cambiarActivo(j: Jurisdiccion) {
    try {
      await editar.mutateAsync({ id: j.id, activo: !j.activo })
      toast(j.activo ? `${j.nombre} dada de baja` : `✓ ${j.nombre} reactivada`, 'ok')
    } catch (e) {
      toast(mensajeErrorJurisdiccion(e), 'err')
    }
  }

  return (
    <div className="bg-white rounded-card shadow-card p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <div className="text-sm font-bold">Jurisdicciones</div>
          <div className="text-[11px] text-gris-dark">
            Provincias y municipios de las percepciones de compras y de las retenciones de cobros. Compartido por Compras y Ventas.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-gris-dark cursor-pointer select-none">
            <input type="checkbox" className="accent-naranja" checked={inactivas} onChange={e => setInactivas(e.target.checked)} />
            Dadas de baja
          </label>
          <Button size="sm" variant="secondary" disabled={bloqueado} title={tip ?? 'Cargar una jurisdicción (por ejemplo, un municipio)'}
            onClick={() => setEditando({ open: true })}>+ Jurisdicción</Button>
        </div>
      </div>

      {lista.respaldo && (
        <Nota tono="naranja">El servidor todavía no tiene el catálogo de jurisdicciones: se siguen cargando como texto.</Nota>
      )}
      {lista.isLoading && <div className="py-3 text-sm text-gris-dark">Cargando…</div>}

      {sueltos.textos.length > 0 && (
        <Nota tono="naranja">
          <div className="font-bold mb-1">A normalizar</div>
          <div className="mb-1">Textos cargados que no coinciden con ninguna jurisdicción. Asignalos a una (se guarda como alias) y se resuelven solos.</div>
          <ul className="flex flex-col gap-1">
            {sueltos.textos.map(t => (
              <li key={`${t.tabla}|${t.texto}`} className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold">«{t.texto}»</span>
                <span>· {t.filas} en {TABLA_LABEL[t.tabla]}</span>
                <Button variant="ghost" size="sm" disabled={bloqueado} title={tip ?? 'Elegir a qué jurisdicción corresponde'}
                  onClick={() => setAsignando(t)}>Asignar…</Button>
              </li>
            ))}
          </ul>
        </Nota>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-gris-dark border-b border-gris">
              <th className="py-1.5 pr-2">Jurisdicción</th>
              <th className="py-1.5 pr-2">Tipo</th>
              <th className="py-1.5 pr-2" title="Código de jurisdicción del Convenio Multilateral (SIFERE)">COMARB</th>
              <th className="py-1.5 pr-2" title="Código de provincia de ARCA">ARCA</th>
              <th className="py-1.5 pr-2 text-right" title="Tributos de compras y retenciones de cobros que la usan">Usos</th>
              <th className="py-1.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gris">
            {visibles.map(j => (
              <tr key={j.id} className={j.activo ? '' : 'opacity-60'}>
                <td className="py-2 pr-2 align-top">
                  <div className="font-semibold">
                    {j.nombre}
                    {!j.activo && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-gris text-gris-dark font-bold">dada de baja</span>}
                  </div>
                  {j.alias.length > 0 && <div className="text-[11px] text-gris-dark">También: {j.alias.join(', ')}</div>}
                </td>
                <td className="py-2 pr-2 align-top text-xs whitespace-nowrap">
                  {TIPO_JURISDICCION_LABEL[j.tipo]}{j.provincia_nombre ? ` · ${j.provincia_nombre}` : ''}
                </td>
                <td className="py-2 pr-2 align-top font-mono text-xs">{j.codigo_comarb ?? '—'}</td>
                <td className="py-2 pr-2 align-top font-mono text-xs">{j.codigo_arca ?? '—'}</td>
                <td className="py-2 pr-2 align-top text-right font-mono text-xs"
                  title={`${j.usos.tributos} tributo(s) de compras · ${j.usos.retenciones} retención(es)`}>
                  {j.usos.tributos + j.usos.retenciones}
                </td>
                <td className="py-2 align-top">
                  <div className="flex gap-1 justify-end flex-wrap">
                    <Button variant="ghost" size="sm" disabled={bloqueado} title={tip ?? 'Editar'}
                      onClick={() => setEditando({ open: true, j })}>✏️ Editar</Button>
                    <Button variant="ghost" size="sm" disabled={bloqueado}
                      title={tip ?? (j.activo ? 'Dar de baja: no se ofrece más al cargar' : 'Reactivar')}
                      loading={editar.isPending && editar.variables?.id === j.id && editar.variables?.activo !== undefined}
                      onClick={() => cambiarActivo(j)}>
                      {j.activo ? 'Dar de baja' : 'Reactivar'}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {!lista.isLoading && !lista.respaldo && visibles.length === 0 && (
              <tr><td colSpan={6} className="py-3 text-sm text-gris-dark italic">No hay jurisdicciones.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {lista.error && !lista.respaldo && <Nota tono="rojo">{mensajeErrorJurisdiccion(lista.error)}</Nota>}
      {editando.open && (
        <ModalJurisdiccion j={editando.j} aliasNuevo={editando.aliasNuevo} provincias={lista.jurisdicciones}
          onClose={() => setEditando({ open: false })} />
      )}
      {asignando && (
        <ModalAsignar texto={asignando} jurisdicciones={lista.jurisdicciones}
          onNueva={() => { setEditando({ open: true, aliasNuevo: asignando.texto }); setAsignando(null) }}
          onClose={() => setAsignando(null)} />
      )}
    </div>
  )
}

// ── Asignar un texto suelto a una jurisdicción (se suma como alias) ────────────

function ModalAsignar({ texto, jurisdicciones, onNueva, onClose }: {
  texto: JurisdiccionSinNormalizar
  jurisdicciones: Jurisdiccion[]
  onNueva: () => void
  onClose: () => void
}) {
  const toast = useToast()
  const editar = useEditarJurisdiccion()
  const [id, setId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const activas = jurisdicciones.filter(j => j.activo)

  async function asignar() {
    const j = activas.find(x => String(x.id) === id)
    if (!j) { setError('Elegí una jurisdicción'); return }
    setError(null)
    try {
      await editar.mutateAsync({ id: j.id, alias: [...j.alias, texto.texto] })
      toast(`✓ «${texto.texto}» ahora es ${j.nombre}`, 'ok')
      onClose()
    } catch (e) {
      setError(mensajeErrorJurisdiccion(e))
    }
  }

  return (
    <Modal open onClose={editar.isPending ? () => {} : onClose} width="max-w-md" title={`¿A qué jurisdicción corresponde «${texto.texto}»?`}
      footer={
        <div className="flex gap-2 justify-between">
          <Button variant="ghost" size="sm" onClick={onNueva} disabled={editar.isPending}>No está: cargar una nueva</Button>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={editar.isPending}>Cancelar</Button>
            <Button size="sm" loading={editar.isPending} onClick={asignar}>Asignar</Button>
          </div>
        </div>
      }>
      <div className="flex flex-col gap-3">
        <Select label="Jurisdicción" value={id} onChange={e => setId(e.target.value)} placeholder="Elegí…"
          options={activas.map(j => ({ value: String(j.id), label: j.provincia_nombre ? `${j.nombre} (${j.provincia_nombre})` : j.nombre }))} />
        <Nota tono="gris">El texto se guarda como alias: los {texto.filas} renglón(es) que lo tienen quedan asignados, y la próxima vez se reconoce solo.</Nota>
        {error && <Nota tono="rojo">{error}</Nota>}
      </div>
    </Modal>
  )
}

// ── Alta / edición ─────────────────────────────────────────────────────────

const TIPOS: TipoJurisdiccion[] = ['provincial', 'municipal', 'nacional']

const schema = z.object({
  nombre:        z.string().refine(v => v.trim().length >= 2 && v.trim().length <= 80, 'Entre 2 y 80 caracteres'),
  tipo:          z.enum(['nacional', 'provincial', 'municipal']),
  provincia_id:  z.string(),
  codigo_comarb: z.string().refine(v => v.trim() === '' || /^\d{3}$/.test(v.trim()), 'Tres dígitos (901 a 924)'),
  codigo_arca:   z.string().refine(v => v.trim() === '' || /^\d{1,2}$/.test(v.trim()), 'Número de 0 a 99'),
  alias:         z.string().max(600, 'Demasiado largo'),
}).superRefine((d, ctx) => {
  if (d.tipo === 'municipal' && !d.provincia_id) {
    ctx.addIssue({ code: 'custom', path: ['provincia_id'], message: 'Elegí la provincia del municipio' })
  }
  if (parsearAlias(d.alias).some(a => a.length > 60)) {
    ctx.addIssue({ code: 'custom', path: ['alias'], message: 'Cada alias, hasta 60 caracteres' })
  }
})
type FormData = z.infer<typeof schema>
const CAMPOS: Array<keyof FormData> = ['nombre', 'tipo', 'provincia_id', 'codigo_comarb', 'codigo_arca', 'alias']

function ModalJurisdiccion({ j, aliasNuevo, provincias, onClose }: {
  j?: Jurisdiccion
  aliasNuevo?: string
  provincias: Jurisdiccion[]
  onClose: () => void
}) {
  const toast = useToast()
  const crear = useCrearJurisdiccion()
  const editar = useEditarJurisdiccion()
  const [errorServer, setErrorServer] = useState<string | null>(null)
  const { register, handleSubmit, setError, control, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      nombre:        j?.nombre ?? '',
      tipo:          j?.tipo ?? (aliasNuevo ? 'municipal' : 'provincial'),
      provincia_id:  j?.provincia_id ? String(j.provincia_id) : '',
      codigo_comarb: j?.codigo_comarb ?? '',
      codigo_arca:   j?.codigo_arca != null ? String(j.codigo_arca) : '',
      alias:         [...(j?.alias ?? []), ...(aliasNuevo ? [aliasNuevo] : [])].join(', '),
    },
  })
  const tipo = useWatch({ control, name: 'tipo' })
  const guardando = crear.isPending || editar.isPending
  const opcionesProvincia = provincias
    .filter(p => p.tipo === 'provincial' && (p.activo || String(p.id) === String(j?.provincia_id ?? '')))
    .map(p => ({ value: String(p.id), label: p.nombre }))

  async function guardar(d: FormData) {
    setErrorServer(null)
    const body: JurisdiccionInput = {
      nombre:        d.nombre.trim().replace(/\s+/g, ' '),
      tipo:          d.tipo,
      provincia_id:  d.tipo === 'municipal' ? Number(d.provincia_id) : null,
      codigo_comarb: d.tipo === 'provincial' ? d.codigo_comarb.trim() || null : null,
      codigo_arca:   d.tipo === 'provincial' && d.codigo_arca.trim() !== '' ? Number(d.codigo_arca) : null,
      alias:         parsearAlias(d.alias),
    }
    try {
      if (j) await editar.mutateAsync({ id: j.id, ...body })
      else await crear.mutateAsync(body)
      toast(j ? '✓ Jurisdicción actualizada' : '✓ Jurisdicción cargada', 'ok')
      onClose()
    } catch (e) {
      const campo = campoErrorJurisdiccion(e)
      if (campo && (CAMPOS as string[]).includes(campo)) {
        setError(campo as keyof FormData, { message: mensajeErrorJurisdiccion(e) })
        return
      }
      setErrorServer(mensajeErrorJurisdiccion(e))
    }
  }

  return (
    <Modal open onClose={guardando ? () => {} : onClose} width="max-w-lg"
      title={j ? `Editar ${j.nombre}` : 'Nueva jurisdicción'}
      footer={
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={guardando}>Cancelar</Button>
          <Button size="sm" loading={guardando} onClick={handleSubmit(guardar)}>{j ? 'Guardar' : 'Cargar jurisdicción'}</Button>
        </div>
      }>
      <form className="flex flex-col gap-3" onSubmit={e => e.preventDefault()}>
        <Input label="Nombre" {...register('nombre')} error={errors.nombre?.message} placeholder="Yerba Buena" autoFocus />
        <Select label="Tipo" {...register('tipo')} error={errors.tipo?.message}
          options={TIPOS.map(t => ({ value: t, label: TIPO_JURISDICCION_LABEL[t] }))} />
        {tipo === 'municipal' && (
          <Select label="Provincia" {...register('provincia_id')} error={errors.provincia_id?.message} placeholder="Elegí…"
            options={opcionesProvincia} />
        )}
        {tipo === 'provincial' && (
          <div className="grid grid-cols-2 gap-2">
            <Input label="Código COMARB" {...register('codigo_comarb')} error={errors.codigo_comarb?.message} inputMode="numeric"
              placeholder="924" hint="Jurisdicción del Convenio Multilateral (SIFERE)." />
            <Input label="Código de ARCA" {...register('codigo_arca')} error={errors.codigo_arca?.message} inputMode="numeric"
              placeholder="14" hint="Tabla de provincias de ARCA." />
          </div>
        )}
        <Input label="Alias (opcional)" {...register('alias')} error={errors.alias?.message} placeholder="smt, san miguel"
          hint="Otras formas en que aparece escrita, separadas por coma. Sirven para reconocerla en las facturas leídas y en textos viejos." />
        {j && j.usos.tributos + j.usos.retenciones > 0 && (
          <Nota tono="gris">
            La usan {j.usos.tributos} tributo(s) de compras y {j.usos.retenciones} retención(es). Renombrarla no cambia el nombre que quedó guardado en esos renglones.
          </Nota>
        )}
        {errorServer && <Nota tono="rojo">{errorServer}</Nota>}
      </form>
    </Modal>
  )
}
