'use client'

import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import { matchesSearch } from '@/lib/utils/text'
import type { CtbCuenta } from '@/types/contabilidad.types'
import { useAltaCuenta, useBajaCuenta, useBorrarCuenta, useCuentas } from '../hooks/useContabilidad'
import { auxiliarLabel, rubroLabel } from '../utils/contabilidad.utils'
import { mensajeErrorCtb } from '../utils/contabilidad.errores'
import { Aviso, Campo, Cargando, ErrorCarga, Tarjeta, Th, Vacio, inputCls } from './Comun'
import { ModalCuenta } from './ModalCuenta'
import { ModalImportarPlan } from './ModalImportarPlan'
import { TesoreriaPanel } from './TesoreriaPanel'

/**
 * Plan de cuentas: el árbol (sangría por nivel, los títulos en negrita), con
 * búsqueda por código o nombre y las acciones del ABM. Abajo, las cuentas de
 * tesorería. Todo lo que escribe pide el flag «Editar plan de cuentas».
 */
export function PlanTab() {
  const toast = useToast()
  const { puedeCrear, puedeEditar, puedeEliminar, editarPlan } = usePermisos('contabilidad')
  const [inactivas, setInactivas] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const { data, isLoading, isError, error, refetch } = useCuentas({ incluirInactivas: inactivas })
  const cuentas = useMemo(() => data ?? [], [data])

  const [modal, setModal] = useState<{ cuenta: CtbCuenta | null; codigoInicial?: string } | null>(null)
  const [importando, setImportando] = useState(false)
  const [dandoBaja, setDandoBaja] = useState<CtbCuenta | null>(null)
  const [borrando, setBorrando] = useState<CtbCuenta | null>(null)
  const alta = useAltaCuenta()
  const borrar = useBorrarCuenta()

  const sinFlag = 'No tenés permiso (hace falta «Editar plan de cuentas»)'
  const bloqueoCrear = !editarPlan ? sinFlag : !puedeCrear ? 'No tenés permiso de Crear en Contabilidad' : null
  const bloqueoEditar = !editarPlan ? sinFlag : !puedeEditar ? 'No tenés permiso de Editar en Contabilidad' : null
  const bloqueoEliminar = !editarPlan ? sinFlag : !puedeEliminar ? 'No tenés permiso de Eliminar en Contabilidad' : null

  const visibles = useMemo(
    () => busqueda.trim() ? cuentas.filter(c => matchesSearch(`${c.codigo} ${c.nombre}`, busqueda)) : cuentas,
    [cuentas, busqueda],
  )

  async function reactivar(c: CtbCuenta) {
    try {
      await alta.mutateAsync(c.id)
      toast(`✓ ${c.codigo} reactivada`, 'ok')
    } catch (e) {
      toast(mensajeErrorCtb(e), 'err')
    }
  }

  async function hacerBorrado() {
    if (!borrando) return
    try {
      await borrar.mutateAsync(borrando.id)
      toast(`✓ Cuenta ${borrando.codigo} borrada`, 'ok')
      setBorrando(null)
    } catch (e) {
      toast(mensajeErrorCtb(e), 'err')
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Tarjeta className="p-3 flex flex-col md:flex-row gap-2 md:items-end">
        <Campo label="Buscar" hint="código o nombre" className="flex-1">
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Ej.: 1.1.01 o galicia" className={inputCls} />
        </Campo>
        <label className="flex items-center gap-1.5 text-sm cursor-pointer select-none md:pb-2">
          <input type="checkbox" className="accent-naranja" checked={inactivas} onChange={e => setInactivas(e.target.checked)} />
          Mostrar dadas de baja
        </label>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setImportando(true)} disabled={!!bloqueoCrear} title={bloqueoCrear ?? 'Importar desde Excel o CSV (con vista previa)'}>
            Importar
          </Button>
          <Button onClick={() => setModal({ cuenta: null })} disabled={!!bloqueoCrear} title={bloqueoCrear ?? 'Agregar una cuenta'}>
            + Nueva cuenta
          </Button>
        </div>
      </Tarjeta>

      {isLoading ? <Cargando />
        : isError ? <ErrorCarga mensaje={mensajeErrorCtb(error)} onReintentar={() => void refetch()} />
        : cuentas.length === 0 ? (
          <Vacio>
            El plan de cuentas está vacío. Importalo desde un Excel o CSV (hay una propuesta provisoria en
            {' '}<span className="font-mono not-italic">supabase/seeds/cont_plan_provisorio_2026.csv</span>) o cargá las cuentas a mano.
          </Vacio>
        )
        : visibles.length === 0 ? <Vacio>Ninguna cuenta coincide con «{busqueda}».</Vacio>
        : (
          <Tarjeta className="overflow-hidden">
            <div className="px-3 py-2 border-b border-gris text-xs text-gris-dark">
              {cuentas.length} cuentas · {cuentas.filter(c => c.imputable).length} imputables
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse min-w-[860px]">
                <thead>
                  <tr><Th>Cuenta</Th><Th>Rubro</Th><Th>Tipo</Th><Th>Auxiliar</Th><Th /></tr>
                </thead>
                <tbody>
                  {visibles.map(c => {
                    const bloqueoBorrar = bloqueoEliminar
                      ?? (c.tiene_movimientos ? 'Tiene movimientos: no se borra, se da de baja'
                        : c.cant_hijas > 0 ? 'Tiene subcuentas: borralas primero'
                        : (c.tesoreria_ids?.length ?? 0) > 0 ? 'Está vinculada a una cuenta de tesorería' : null)
                    const bloqueoSub = bloqueoCrear ?? (c.imputable ? 'Es imputable: no puede tener subcuentas' : !c.activo ? 'Está dada de baja' : null)
                    return (
                      <tr key={c.id} className={`border-t border-gris ${c.activo ? '' : 'opacity-60'}`}>
                        <td className="px-3 py-1.5 text-sm" style={{ paddingLeft: `${12 + (c.nivel - 1) * 18}px` }}>
                          <span className={`font-mono ${c.imputable ? '' : 'font-bold'}`}>{c.codigo}</span>{' '}
                          <span className={c.imputable ? '' : 'font-bold text-azul'}>{c.nombre}</span>
                          {!c.activo && <span className="ml-1 text-[10px] px-1 rounded bg-gris text-gris-dark font-bold uppercase" title={c.baja_motivo ?? undefined}>baja</span>}
                          {c.tiene_movimientos && <span className="ml-1 text-[10px] text-gris-dark" title="Tiene movimientos">●</span>}
                        </td>
                        <td className="px-3 py-1.5 text-xs">{rubroLabel(c.rubro)}</td>
                        <td className="px-3 py-1.5 text-xs">{c.imputable ? 'Imputable' : 'Título'}</td>
                        <td className="px-3 py-1.5 text-xs">{c.auxiliar !== 'none' ? auxiliarLabel(c.auxiliar) : ''}</td>
                        <td className="px-3 py-1.5 text-right whitespace-nowrap">
                          <BotonFila label="+ Sub" bloqueo={bloqueoSub} titulo="Agregar una subcuenta"
                            onClick={() => setModal({ cuenta: null, codigoInicial: `${c.codigo}.` })} />
                          <BotonFila label="Editar" bloqueo={bloqueoEditar} titulo="Editar la cuenta" onClick={() => setModal({ cuenta: c })} />
                          {c.activo
                            ? <BotonFila label="Baja" bloqueo={bloqueoEditar ?? (c.cant_hijas > 0 && cuentas.some(h => h.padre_id === c.id && h.activo) ? 'Tiene subcuentas activas: dalas de baja primero' : null)}
                                titulo="Dar de baja (deja de ofrecerse en los asientos)" onClick={() => setDandoBaja(c)} />
                            : <BotonFila label="Alta" bloqueo={bloqueoEditar} titulo="Reactivar" onClick={() => void reactivar(c)} />}
                          <BotonFila label="Borrar" peligro bloqueo={bloqueoBorrar} titulo="Borrar la cuenta" onClick={() => setBorrando(c)} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Tarjeta>
        )}

      <TesoreriaPanel />

      {modal && (
        <ModalCuenta key={modal.cuenta?.id ?? `nueva-${modal.codigoInicial ?? ''}`} cuenta={modal.cuenta} codigoInicial={modal.codigoInicial}
          cuentas={cuentas} onClose={() => setModal(null)} />
      )}
      {importando && <ModalImportarPlan onClose={() => setImportando(false)} />}
      {dandoBaja && <ModalBajaCuenta cuenta={dandoBaja} onClose={() => setDandoBaja(null)} />}
      {borrando && (
        <Modal open onClose={borrar.isPending ? () => {} : () => setBorrando(null)} title={`Borrar ${borrando.codigo}`} width="max-w-md"
          footer={<>
            <Button variant="ghost" size="sm" onClick={() => setBorrando(null)} disabled={borrar.isPending}>Cancelar</Button>
            <Button variant="danger" size="sm" loading={borrar.isPending} onClick={hacerBorrado}>Borrar</Button>
          </>}>
          <p className="text-sm">Se borra la cuenta <b className="font-mono">{borrando.codigo}</b> {borrando.nombre}. No tiene movimientos ni subcuentas, así que no queda nada colgado.</p>
        </Modal>
      )}
    </div>
  )
}

function BotonFila({ label, bloqueo, titulo, onClick, peligro }: {
  label: string; bloqueo: string | null; titulo: string; onClick: () => void; peligro?: boolean
}) {
  return (
    <button type="button" disabled={!!bloqueo} title={bloqueo ?? titulo} onClick={onClick}
      className={`text-xs px-2 py-1 rounded font-semibold disabled:opacity-40 disabled:cursor-not-allowed ${peligro ? 'text-rojo hover:bg-rojo-light' : 'text-azul hover:bg-azul-light'}`}>
      {label}
    </button>
  )
}

const bajaSchema = z.object({
  motivo: z.string().refine(v => v.trim().length >= 3, 'Escribí el motivo (al menos 3 caracteres)').refine(v => v.length <= 500, 'Hasta 500 caracteres'),
})
type BajaForm = z.infer<typeof bajaSchema>

function ModalBajaCuenta({ cuenta, onClose }: { cuenta: CtbCuenta; onClose: () => void }) {
  const toast = useToast()
  const baja = useBajaCuenta()
  const [errorServer, setErrorServer] = useState<string | null>(null)
  const { register, handleSubmit, formState: { errors } } = useForm<BajaForm>({
    resolver: zodResolver(bajaSchema), defaultValues: { motivo: '' },
  })

  async function enviar(d: BajaForm) {
    setErrorServer(null)
    try {
      await baja.mutateAsync({ id: cuenta.id, motivo: d.motivo.trim() })
      toast(`✓ ${cuenta.codigo} dada de baja`, 'ok')
      onClose()
    } catch (e) {
      setErrorServer(mensajeErrorCtb(e))
    }
  }

  return (
    <Modal open onClose={baja.isPending ? () => {} : onClose} title={`Dar de baja ${cuenta.codigo}`} width="max-w-md"
      footer={<>
        <Button variant="ghost" size="sm" onClick={onClose} disabled={baja.isPending}>Cancelar</Button>
        <Button variant="danger" size="sm" loading={baja.isPending} onClick={handleSubmit(enviar)}>Dar de baja</Button>
      </>}>
      <div className="flex flex-col gap-3 text-sm">
        <p>{cuenta.nombre}: deja de ofrecerse para cargar asientos. Sus movimientos y saldos siguen en los reportes.</p>
        <Campo label="Motivo" error={errors.motivo?.message}>
          <input {...register('motivo')} autoFocus maxLength={500} className={inputCls} />
        </Campo>
        {errorServer && <Aviso tono="rojo">{errorServer}</Aviso>}
      </div>
    </Modal>
  )
}
