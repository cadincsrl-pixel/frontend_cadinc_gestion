'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import type { CtbImportarBienesFila, CtbImportarBienesRes } from '@/types/contabilidad.types'
import { useImportarBienes } from '../hooks/useContabilidad'
import { ETIQUETA_COLUMNA, leerArchivoBienes, type ResultadoBienes } from '../utils/bienesImport'
import { fmtFecha, fmtM } from '../utils/contabilidad.utils'
import { leerCuerpoError, mensajeErrorCtb, mensajeFilaBien } from '../utils/contabilidad.errores'
import { Aviso, Cifra } from './Comun'

/**
 * Importar el inventario de bienes de uso desde el Excel del contador.
 *
 *   1. Elegir el archivo: se lee en el navegador (`bienesImport.ts`), que
 *      reconoce los encabezados por alias, lee fechas, importes y vida útil y
 *      saltea títulos y subtotales. Acá se ve qué columnas se reconocieron.
 *   2. Vista previa: POST /bienes/importar con confirmar:false. La base
 *      resuelve cada fila (cuenta de origen, la .03, el gasto del mapeo) y
 *      marca errores y avisos (duplicados, neto que no cierra).
 *   3. Importar: la misma llamada con confirmar:true. TODO O NADA.
 *
 * Importar el inventario ANTES de cargar la apertura (R7): el cuadro de
 * amortizaciones compara el inventario con el mayor.
 */

type Filtro = 'todas' | 'ok' | 'aviso' | 'error'

export function ModalImportarBienes({ onClose }: { onClose: () => void }) {
  const toast = useToast()
  const { puedeCrear, bienesUso } = usePermisos('contabilidad')
  const importar = useImportarBienes()
  const permitido = puedeCrear && bienesUso
  const motivoNo = !bienesUso ? 'No tenés permiso (hace falta «Bienes de uso»)' : 'No tenés permiso de Crear en Contabilidad'

  const [archivo, setArchivo] = useState<string | null>(null)
  const [lectura, setLectura] = useState<ResultadoBienes | null>(null)
  const [leyendo, setLeyendo] = useState(false)
  const [previa, setPrevia] = useState<CtbImportarBienesRes | null>(null)
  const [errorServer, setErrorServer] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('todas')

  const filas = useMemo(() => (lectura?.filas ?? []).map(f => f.datos), [lectura])

  async function elegir(lista: FileList | null) {
    const f = lista?.[0]
    if (!f) return
    setLeyendo(true); setPrevia(null); setErrorServer(null)
    try {
      setLectura(await leerArchivoBienes(f))
      setArchivo(f.name)
    } catch {
      setLectura({ filas: [], columnas: [], faltantes: [], ignoradas: 0, error: 'No se pudo leer el archivo. ¿Es un Excel o un CSV?' })
      setArchivo(f.name)
    } finally {
      setLeyendo(false)
    }
  }

  async function vistaPrevia() {
    setErrorServer(null)
    try {
      const r = await importar.mutateAsync({ filas, confirmar: false })
      setPrevia(r)
      setFiltro(r.resumen.con_error > 0 ? 'error' : 'todas')
    } catch (e) {
      setErrorServer(mensajeErrorCtb(e))
    }
  }

  async function confirmar() {
    setErrorServer(null)
    try {
      const r = await importar.mutateAsync({ filas, confirmar: true })
      toast(`✓ ${r.resumen.ok + r.resumen.con_aviso} bien${r.resumen.ok + r.resumen.con_aviso === 1 ? '' : 'es'} importado${r.resumen.ok + r.resumen.con_aviso === 1 ? '' : 's'}`, 'ok')
      onClose()
    } catch (e) {
      const { error, detail } = leerCuerpoError(e)
      if (error === 'IMPORTACION_CON_ERRORES' && detail && typeof detail === 'object') {
        const d = detail as { filas?: CtbImportarBienesFila[]; errores?: CtbImportarBienesFila[] }
        const errs = d.filas ?? d.errores ?? []
        if (previa && errs.length > 0) {
          const porIndice = new Map(errs.map(x => [x.indice, x]))
          const nuevas = previa.filas.map(f => porIndice.get(f.indice) ?? f)
          setPrevia({ ...previa, filas: nuevas, resumen: { ...previa.resumen, con_error: nuevas.filter(f => f.estado === 'error').length } })
          setFiltro('error')
        }
      }
      setErrorServer(mensajeErrorCtb(e))
    }
  }

  const visibles = useMemo(() => (previa?.filas ?? []).filter(f => filtro === 'todas' || f.estado === filtro), [previa, filtro])
  const aImportar = previa ? previa.resumen.ok + previa.resumen.con_aviso : 0
  const bloqueo = !permitido ? motivoNo
    : !previa ? 'Primero mirá la vista previa'
    : previa.resumen.con_error > 0 ? 'Hay filas con error: no se importa nada hasta corregirlas'
    : aImportar === 0 ? 'No hay bienes para importar' : null
  const bloqueoPrevia = !permitido ? motivoNo
    : filas.length === 0 ? 'Elegí el archivo'
    : (lectura?.faltantes.length ?? 0) > 0 ? 'Faltan columnas obligatorias (ver arriba)' : null

  return (
    <Modal open onClose={importar.isPending ? () => {} : onClose} width="max-w-6xl" title="Importar inventario de bienes de uso"
      footer={<>
        <Button variant="ghost" size="sm" onClick={onClose} disabled={importar.isPending}>Cerrar</Button>
        {!previa ? (
          <Button size="sm" onClick={() => void vistaPrevia()} loading={importar.isPending} disabled={!!bloqueoPrevia}
            title={bloqueoPrevia ?? 'Ver qué se va a importar (no guarda nada)'}>
            Ver vista previa ({filas.length})
          </Button>
        ) : (
          <Button size="sm" onClick={() => void confirmar()} loading={importar.isPending} disabled={!!bloqueo} title={bloqueo ?? 'Importar los bienes'}>
            Importar {aImportar} bien{aImportar === 1 ? '' : 'es'}
          </Button>
        )}
      </>}>
      <div className="flex flex-col gap-3 text-sm">
        <Aviso tono="gris">
          Excel o CSV con una fila por bien. Obligatorias: <b>descripción</b>, <b>cuenta</b> (código con puntos, los 7 dígitos de Finnegans
          o el nombre del rubro, como «Rodados»), <b>fecha de alta</b> y <b>valor de origen</b>. Opcionales: vida útil (años, meses o tasa %),
          valor residual, amortización acumulada al corte, cuenta de amortización acumulada (si no, la «.03» del rubro), cuenta de gasto
          (si no, la del <Link href="/contabilidad?tab=mapeos&clave=bienes.gasto" className="underline">mapeo</Link>), patente o n° de serie, obra y observaciones.
          Los títulos y subtotales («TOTAL RODADOS») se ignoran. Es todo o nada.
        </Aviso>

        <label className={`border-2 border-dashed rounded-lg p-4 text-center ${permitido ? 'border-gris-mid hover:border-naranja cursor-pointer' : 'border-gris opacity-60 cursor-not-allowed'}`}
          title={permitido ? undefined : motivoNo}>
          <input type="file" accept=".xlsx,.xls,.csv,.txt" className="hidden" disabled={!permitido}
            onChange={e => { void elegir(e.target.files); e.target.value = '' }} />
          {leyendo ? 'Leyendo…' : archivo
            ? <><b>{archivo}</b> · {filas.length} bien{filas.length === 1 ? '' : 'es'} — <span className="text-azul underline">cambiar</span></>
            : <span className="text-azul font-semibold">Elegir el Excel o CSV del inventario</span>}
        </label>

        {lectura?.error && <Aviso tono="naranja">{lectura.error}</Aviso>}

        {lectura && !lectura.error && !previa && (
          <div className="flex flex-col gap-2">
            {lectura.faltantes.length > 0 && (
              <Aviso tono="rojo">
                No se encontraron las columnas obligatorias: <b>{lectura.faltantes.map(c => ETIQUETA_COLUMNA[c]).join(', ')}</b>. Revisá los encabezados.
              </Aviso>
            )}
            <div className="text-xs text-gris-dark">
              {filas.length} bien{filas.length === 1 ? '' : 'es'} leído{filas.length === 1 ? '' : 's'}
              {lectura.ignoradas > 0 && <> · {lectura.ignoradas} fila{lectura.ignoradas === 1 ? '' : 's'} ignorada{lectura.ignoradas === 1 ? '' : 's'} (vacías, títulos o subtotales)</>}
            </div>
            <div className="flex flex-wrap gap-1">
              {lectura.columnas.filter(c => c.encabezado).map((c, i) => (
                <span key={i} className={`text-[11px] px-2 py-0.5 rounded-full border ${c.columna ? 'border-verde/40 bg-verde-light text-verde' : 'border-gris-mid bg-gris text-gris-dark line-through'}`}
                  title={c.columna ? `Se lee como «${ETIQUETA_COLUMNA[c.columna]}»${c.unidad === 'meses' ? ' (en meses)' : c.unidad === 'tasa' ? ' (tasa %)' : ''}` : 'No se reconoce: se ignora'}>
                  {c.encabezado}{c.columna ? ` → ${ETIQUETA_COLUMNA[c.columna]}` : ''}
                </span>
              ))}
            </div>
            {lectura.filas.some(f => f.problemas.length > 0) && (
              <Aviso tono="amarillo">
                <b>Datos que no se pudieron leer</b> (la vista previa los va a marcar):
                <ul className="list-disc ml-4 mt-1">
                  {lectura.filas.filter(f => f.problemas.length > 0).slice(0, 8).map(f => (
                    <li key={f.filaArchivo}>Fila {f.filaArchivo}: {f.problemas.join(' · ')}</li>
                  ))}
                </ul>
              </Aviso>
            )}
          </div>
        )}

        {previa && (
          <>
            <div className="flex gap-2 flex-wrap">
              <Cifra label="Bienes" valor={String(previa.resumen.total)} />
              <Cifra label="Sin observaciones" valor={String(previa.resumen.ok)} tono="verde" />
              <Cifra label="Con aviso" valor={String(previa.resumen.con_aviso)} tono={previa.resumen.con_aviso > 0 ? 'naranja' : 'normal'} sub="se importan igual" />
              <Cifra label="Con error" valor={String(previa.resumen.con_error)} tono={previa.resumen.con_error > 0 ? 'rojo' : 'normal'} />
              <Cifra label="Valor de origen" valor={fmtM(previa.resumen.valor_origen)} />
              <Cifra label="Acumulada inicial" valor={fmtM(previa.resumen.amort_acum_inicial)} />
            </div>
            <div className="flex gap-1 flex-wrap">
              {([['todas', 'Todas', previa.filas.length], ['ok', 'OK', previa.resumen.ok],
                 ['aviso', 'Con aviso', previa.resumen.con_aviso], ['error', 'Errores', previa.resumen.con_error]] as [Filtro, string, number][]).map(([k, l, c]) => (
                <button key={k} type="button" onClick={() => setFiltro(k)}
                  className={`text-xs px-2.5 py-1 rounded-full border ${filtro === k ? 'bg-azul text-white border-azul' : 'bg-white border-gris-mid text-azul'}`}>
                  {l} ({c})
                </button>
              ))}
            </div>
            <div className="overflow-x-auto border border-gris-mid rounded-lg max-h-[45vh] overflow-y-auto">
              <table className="w-full border-collapse min-w-[1000px] text-xs">
                <thead className="sticky top-0">
                  <tr>
                    {['Fila', 'Descripción', 'Cuenta', 'Amort. acum.', 'Gasto', 'Alta', 'Valor de origen', 'Vida útil', 'Acum. inicial', 'Resultado'].map((h, i) => (
                      <th key={h} className={`bg-gris text-gris-dark text-[10px] font-bold px-2 py-1.5 uppercase tracking-wide ${i === 6 || i === 8 ? 'text-right' : 'text-left'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibles.map(f => {
                    const r = f.resuelto
                    return (
                      <tr key={f.indice} className={`border-t border-gris align-top ${f.estado === 'error' ? 'bg-rojo-light/50' : f.estado === 'aviso' ? 'bg-amarillo-light/40' : ''}`}>
                        <td className="px-2 py-1 text-gris-dark tabular-nums" title="Fila del Excel">{lectura?.filas[f.indice - 1]?.filaArchivo ?? f.indice}</td>
                        <td className="px-2 py-1">{r.descripcion ?? ''}{r.identificador ? <span className="text-gris-dark"> · {r.identificador}</span> : null}</td>
                        <td className="px-2 py-1 font-mono">{r.cuenta_origen_codigo ?? ''}</td>
                        <td className="px-2 py-1 font-mono">{r.cuenta_amort_codigo ?? ''}</td>
                        <td className="px-2 py-1 font-mono">{r.cuenta_gasto_codigo ?? ''}</td>
                        <td className="px-2 py-1 whitespace-nowrap">{r.fecha_alta ? fmtFecha(r.fecha_alta) : ''}</td>
                        <td className="px-2 py-1 text-right font-mono tabular-nums">{r.valor_origen != null ? fmtM(r.valor_origen) : ''}</td>
                        <td className="px-2 py-1 tabular-nums">{r.vida_util_anios != null ? `${Number(r.vida_util_anios).toLocaleString('es-AR')} años` : r.descripcion ? 'no se amortiza' : ''}</td>
                        <td className="px-2 py-1 text-right font-mono tabular-nums">{r.amort_acum_inicial ? fmtM(r.amort_acum_inicial) : ''}</td>
                        <td className="px-2 py-1">
                          {f.estado === 'ok' && <span className="font-bold text-verde">OK</span>}
                          {f.errores.map((e, i) => <div key={`e${i}`} className="font-bold text-rojo">{mensajeFilaBien(e.codigo, e.campo)}</div>)}
                          {f.avisos.map((a, i) => <div key={`a${i}`} className="text-naranja-dark">{mensajeFilaBien(a.codigo, undefined, a.detalle)}</div>)}
                        </td>
                      </tr>
                    )
                  })}
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
