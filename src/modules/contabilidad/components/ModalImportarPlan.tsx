'use client'

import { useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import type { CtbImportarFila, CtbImportarPlanRes } from '@/types/contabilidad.types'
import { useImportarPlan, type CeldaPlan } from '../hooks/useContabilidad'
import { leerArchivoPlan } from '../utils/planImport'
import { auxiliarLabel, rubroLabel } from '../utils/contabilidad.utils'
import { leerCuerpoError, mensajeErrorCtb, mensajeErrorFilaPlan } from '../utils/contabilidad.errores'
import { Aviso, Cifra } from './Comun'

/**
 * Importar el plan de cuentas desde un Excel o CSV.
 *
 *   1. Elegir el archivo (se lee en el navegador: `planImport.ts`).
 *   2. Vista previa: POST /cuentas/importar con confirmar:false. La base dice
 *      por fila si es nueva, ya existe (se saltea, no es error) o tiene error,
 *      y qué rubro, imputable y auxiliar le va a poner.
 *   3. Confirmar: la misma llamada con confirmar:true. Es TODO O NADA.
 *
 * Columnas: codigo; nombre; rubro; imputable; auxiliar (solo código y nombre
 * son obligatorias: el rubro se hereda y el imputable se deduce).
 */

type Filtro = 'todas' | 'nueva' | 'duplicada' | 'error'

export function ModalImportarPlan({ onClose }: { onClose: () => void }) {
  const toast = useToast()
  const { puedeCrear, editarPlan } = usePermisos('contabilidad')
  const importar = useImportarPlan()
  const permitido = puedeCrear && editarPlan

  const [archivo, setArchivo] = useState<string | null>(null)
  const [filas, setFilas] = useState<Record<string, CeldaPlan>[]>([])
  const [errorLectura, setErrorLectura] = useState<string | null>(null)
  const [leyendo, setLeyendo] = useState(false)
  const [previa, setPrevia] = useState<CtbImportarPlanRes | null>(null)
  const [errorServer, setErrorServer] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('todas')

  async function elegir(lista: FileList | null) {
    const f = lista?.[0]
    if (!f) return
    setLeyendo(true); setPrevia(null); setErrorServer(null); setErrorLectura(null)
    try {
      const r = await leerArchivoPlan(f)
      setArchivo(f.name)
      setFilas(r.filas)
      setErrorLectura(r.error)
    } catch {
      setFilas([])
      setErrorLectura('No se pudo leer el archivo. ¿Es un Excel o un CSV?')
    } finally {
      setLeyendo(false)
    }
  }

  async function vistaPrevia() {
    setErrorServer(null)
    try {
      const r = await importar.mutateAsync({ filas, confirmar: false })
      setPrevia(r)
      setFiltro(r.errores > 0 ? 'error' : 'todas')
    } catch (e) {
      setErrorServer(mensajeErrorCtb(e))
    }
  }

  async function confirmar() {
    setErrorServer(null)
    try {
      const r = await importar.mutateAsync({ filas, confirmar: true })
      toast(`✓ ${r.nuevas} cuenta${r.nuevas === 1 ? '' : 's'} importada${r.nuevas === 1 ? '' : 's'}`, 'ok')
      onClose()
    } catch (e) {
      const { error, detail } = leerCuerpoError(e)
      if (error === 'IMPORTACION_CON_ERRORES' && previa && detail && typeof detail === 'object') {
        const errs = (detail as { errores?: CtbImportarFila[] }).errores ?? []
        const porIndice = new Map(errs.map(x => [x.indice, x]))
        setPrevia({ ...previa, errores: errs.length, filas: previa.filas.map(f => porIndice.get(f.indice) ?? f) })
        setFiltro('error')
      }
      setErrorServer(mensajeErrorCtb(e))
    }
  }

  const visibles = useMemo(
    () => (previa?.filas ?? []).filter(f => filtro === 'todas' || f.estado === filtro),
    [previa, filtro],
  )

  const bloqueo = !permitido ? 'No tenés permiso para editar el plan de cuentas'
    : !previa ? 'Primero mirá la vista previa'
    : previa.errores > 0 ? 'Hay filas con error: no se importa nada hasta corregirlas'
    : previa.nuevas === 0 ? 'No hay cuentas nuevas' : null

  return (
    <Modal open onClose={importar.isPending ? () => {} : onClose} width="max-w-6xl" title="Importar plan de cuentas"
      footer={<>
        <Button variant="ghost" size="sm" onClick={onClose} disabled={importar.isPending}>Cerrar</Button>
        {!previa ? (
          <Button size="sm" onClick={vistaPrevia} loading={importar.isPending} disabled={filas.length === 0 || !permitido}
            title={!permitido ? 'No tenés permiso para editar el plan de cuentas' : filas.length === 0 ? 'Elegí el archivo' : 'Ver qué se va a importar (no guarda nada)'}>
            Ver vista previa ({filas.length})
          </Button>
        ) : (
          <Button size="sm" onClick={confirmar} loading={importar.isPending} disabled={!!bloqueo} title={bloqueo ?? 'Importar las cuentas nuevas'}>
            Importar {previa.nuevas} cuenta{previa.nuevas === 1 ? '' : 's'}
          </Button>
        )}
      </>}>
      <div className="flex flex-col gap-3 text-sm">
        <Aviso tono="gris">
          Excel o CSV (separado por <b>;</b>, <b>,</b> o tabulación) con las columnas <b>codigo</b>, <b>nombre</b> y, si querés,{' '}
          <b>rubro</b> (activo, pasivo, pn, ingreso, egreso), <b>imputable</b> (S/N) y <b>auxiliar</b> (none, cliente, proveedor,
          tesoreria). Las líneas que empiezan con # se ignoran. Las cuentas que ya existen se saltean: importar dos veces no duplica.
        </Aviso>

        <label className={`border-2 border-dashed rounded-lg p-4 text-center ${permitido ? 'border-gris-mid hover:border-naranja cursor-pointer' : 'border-gris opacity-60 cursor-not-allowed'}`}>
          <input type="file" accept=".xlsx,.xls,.csv,.txt" className="hidden" disabled={!permitido}
            onChange={e => { void elegir(e.target.files); e.target.value = '' }} />
          {leyendo ? 'Leyendo…' : archivo
            ? <><b>{archivo}</b> · {filas.length} fila{filas.length === 1 ? '' : 's'} — <span className="text-azul underline">cambiar</span></>
            : <span className="text-azul font-semibold">Elegir el Excel o CSV del plan</span>}
        </label>

        {errorLectura && <Aviso tono="naranja">{errorLectura}</Aviso>}

        {previa && (
          <>
            <div className="flex gap-2 flex-wrap">
              <Cifra label="Nuevas" valor={String(previa.nuevas)} tono="verde" />
              <Cifra label="Ya existen" valor={String(previa.duplicadas)} sub="se saltean" />
              <Cifra label="Con error" valor={String(previa.errores)} tono={previa.errores > 0 ? 'rojo' : 'normal'} />
            </div>
            <div className="flex gap-1 flex-wrap">
              {([['todas', 'Todas', previa.filas.length], ['nueva', 'Nuevas', previa.nuevas],
                 ['duplicada', 'Ya existen', previa.duplicadas], ['error', 'Errores', previa.errores]] as [Filtro, string, number][]).map(([k, l, n]) => (
                <button key={k} type="button" onClick={() => setFiltro(k)}
                  className={`text-xs px-2.5 py-1 rounded-full border ${filtro === k ? 'bg-azul text-white border-azul' : 'bg-white border-gris-mid text-azul'}`}>
                  {l} ({n})
                </button>
              ))}
            </div>
            <div className="overflow-x-auto border border-gris-mid rounded-lg max-h-[45vh] overflow-y-auto">
              <table className="w-full border-collapse min-w-[900px] text-xs">
                <thead className="sticky top-0">
                  <tr>
                    {['Fila', 'Código', 'Nombre', 'Rubro', 'Imputable', 'Auxiliar', 'Madre', 'Resultado'].map(h => (
                      <th key={h} className="bg-gris text-gris-dark text-[10px] font-bold px-2 py-1.5 uppercase tracking-wide text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibles.map(f => (
                    <tr key={f.indice} className={`border-t border-gris ${f.estado === 'error' ? 'bg-rojo-light/50' : f.estado === 'duplicada' ? 'text-gris-dark' : ''}`}>
                      <td className="px-2 py-1 text-gris-dark tabular-nums">{f.indice}</td>
                      <td className="px-2 py-1 font-mono whitespace-nowrap" style={{ paddingLeft: `${8 + Math.max(0, (f.nivel ?? 1) - 1) * 10}px` }}>{f.codigo ?? ''}</td>
                      <td className={`px-2 py-1 ${f.imputable === false ? 'font-bold' : ''}`}>{f.nombre ?? ''}</td>
                      <td className="px-2 py-1">{f.rubro ? rubroLabel(f.rubro) : ''}</td>
                      <td className="px-2 py-1">{f.imputable === null ? '' : f.imputable ? 'Sí' : 'No (título)'}</td>
                      <td className="px-2 py-1">{f.auxiliar && f.auxiliar !== 'none' ? auxiliarLabel(f.auxiliar) : ''}</td>
                      <td className="px-2 py-1 font-mono">{f.padre_codigo ?? ''}</td>
                      <td className="px-2 py-1">
                        {f.estado === 'nueva' && <span className="font-bold text-verde">Nueva</span>}
                        {f.estado === 'duplicada' && <span>{mensajeErrorFilaPlan('DUPLICADA', f.detalle)}</span>}
                        {f.estado === 'error' && <span className="font-bold text-rojo">{mensajeErrorFilaPlan(f.error, f.detalle)}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button size="sm" variant="ghost" className="self-start" onClick={() => setPrevia(null)} disabled={importar.isPending}>
              ← Volver a elegir el archivo
            </Button>
          </>
        )}
        {errorServer && <Aviso tono="rojo">{errorServer}</Aviso>}
      </div>
    </Modal>
  )
}
