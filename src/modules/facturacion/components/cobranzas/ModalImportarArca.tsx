'use client'

import { useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import { useImportarExternos } from '../../hooks/useCobranzas'
import { fmtCuit, fmtFecha, fmtM } from '../../utils/facturacion.utils'
import { filaParaApi, parsearComprobantesArca, type ErrorParseoArca, type FilaArca } from '../../utils/arcaImport'
import { leerCuerpoError, mensajeErrorFacturacion, mensajeErrorFilaImport, motivoDuplicada } from '../../utils/facturacion.errores'
import type { VentasImportarFilaRes, VentasImportarRes } from '@/types/domain.types'
import { Aviso } from '../FichaFactura'
import { Cifra } from './Comun'

/**
 * Importar desde ARCA «Mis Comprobantes — Emitidos».
 *
 *   1. Elegir uno o varios Excel (se parsean en el navegador: `arcaImport.ts`).
 *   2. Vista previa: POST /externos/importar con confirmar:false. La base
 *      dice por fila si es nueva, duplicada (ya estaba, la emitió el sistema o
 *      está repetida) o error, qué clientes va a crear y qué saldo le pone
 *      (cruce con los cobros de Logística; el resto queda «a revisar»).
 *   3. Confirmar: la misma llamada con confirmar:true. Es todo o nada: con una
 *      fila con error no escribe nada.
 */

type Filtro = 'todas' | 'nueva' | 'duplicada' | 'error' | 'revisar'

export function ModalImportarArca({ onClose }: { onClose: () => void }) {
  const toast = useToast()
  const { puedeCrear } = usePermisos('facturacion')
  const importar = useImportarExternos()

  const [archivos, setArchivos] = useState<string[]>([])
  const [filas, setFilas] = useState<FilaArca[]>([])
  const [erroresParseo, setErroresParseo] = useState<ErrorParseoArca[]>([])
  const [leyendo, setLeyendo] = useState(false)
  const [previa, setPrevia] = useState<VentasImportarRes | null>(null)
  const [errorServer, setErrorServer] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('todas')

  async function elegir(lista: FileList | null) {
    if (!lista?.length) return
    setLeyendo(true); setPrevia(null); setErrorServer(null)
    const todas: FilaArca[] = []
    const errs: ErrorParseoArca[] = []
    for (const f of Array.from(lista)) {
      const r = parsearComprobantesArca(await f.arrayBuffer(), f.name)
      todas.push(...r.filas)
      errs.push(...r.errores)
    }
    setArchivos(Array.from(lista).map(f => f.name))
    setFilas(todas)
    setErroresParseo(errs)
    setLeyendo(false)
  }

  async function vistaPrevia() {
    setErrorServer(null)
    try {
      const r = await importar.mutateAsync({ filas: filas.map(filaParaApi), confirmar: false, origen: 'portal' })
      setPrevia(r)
      setFiltro(r.errores > 0 ? 'error' : 'todas')
    } catch (e) {
      setErrorServer(mensajeErrorFacturacion(e))
    }
  }

  async function confirmar() {
    setErrorServer(null)
    try {
      const r = await importar.mutateAsync({ filas: filas.map(filaParaApi), confirmar: true, origen: 'portal' })
      toast(`✓ ${r.nuevas} comprobante${r.nuevas === 1 ? '' : 's'} importado${r.nuevas === 1 ? '' : 's'}${r.clientes_nuevos.length ? ` · ${r.clientes_nuevos.length} cliente(s) nuevo(s)` : ''}`, 'ok')
      onClose()
    } catch (e) {
      // Todo o nada: si en el medio apareció un error, se muestra por fila.
      const { error, detail } = leerCuerpoError(e)
      if (error === 'IMPORTACION_CON_ERRORES' && previa && detail && typeof detail === 'object') {
        const errs = (detail as { errores?: VentasImportarFilaRes[] }).errores ?? []
        const porIndice = new Map(errs.map(x => [x.indice, x]))
        setPrevia({ ...previa, errores: errs.length, filas: previa.filas.map(f => porIndice.get(f.indice) ?? f) })
        setFiltro('error')
      }
      setErrorServer(mensajeErrorFacturacion(e))
    }
  }

  const visibles = useMemo(() => (previa?.filas ?? []).filter(f =>
    filtro === 'todas' ? true : filtro === 'revisar' ? f.saldo_a_revisar === true : f.estado === filtro), [previa, filtro])

  const totalImporte = filas.reduce((s, f) => s + f.total, 0)
  const bloqueo = !puedeCrear ? 'No tenés permiso para cargar saldos iniciales'
    : !previa ? 'Primero mirá la vista previa'
    : previa.errores > 0 ? 'Hay filas con error: no se importa nada hasta corregirlas'
    : previa.nuevas === 0 ? 'No hay comprobantes nuevos' : null

  return (
    <Modal open onClose={importar.isPending ? () => {} : onClose} width="max-w-6xl" title="Importar desde ARCA — Mis Comprobantes Emitidos"
      footer={<>
        <Button variant="ghost" size="sm" onClick={onClose} disabled={importar.isPending}>Cerrar</Button>
        {!previa ? (
          <Button size="sm" onClick={vistaPrevia} loading={importar.isPending} disabled={filas.length === 0 || !puedeCrear}
            title={!puedeCrear ? 'No tenés permiso' : filas.length === 0 ? 'Elegí el o los Excel' : 'Ver qué se va a importar (no guarda nada)'}>
            Ver vista previa ({filas.length})
          </Button>
        ) : (
          <Button size="sm" onClick={confirmar} loading={importar.isPending} disabled={!!bloqueo} title={bloqueo ?? 'Importar las nuevas'}>
            Confirmar importación ({previa.nuevas})
          </Button>
        )}
      </>}>
      <div className="flex flex-col gap-3 text-sm">
        <Aviso tono="gris">
          En el portal de ARCA: <b>Mis Comprobantes › Emitidos</b>, elegí el período y bajá el Excel. Podés subir varios a la vez.
          Lo que ya está cargado o lo emitió el sistema se detecta y no se duplica. Como el Excel <b>no trae cobranzas</b>, el
          saldo de cada factura queda igual al total y «a revisar», salvo las de transporte que ya figuran cobradas en Logística.
        </Aviso>

        <label className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer ${puedeCrear ? 'border-gris-mid hover:border-naranja' : 'border-gris opacity-60 cursor-not-allowed'}`}>
          <input type="file" multiple accept=".xlsx,.xls,.csv" className="hidden" disabled={!puedeCrear}
            onChange={e => { void elegir(e.target.files); e.target.value = '' }} />
          {leyendo ? 'Leyendo…' : archivos.length
            ? <><b>{archivos.length} archivo{archivos.length === 1 ? '' : 's'}:</b> {archivos.join(', ')} — <span className="text-azul underline">cambiar</span></>
            : <span className="text-azul font-semibold">Elegir el/los Excel de ARCA</span>}
        </label>

        {filas.length > 0 && !previa && (
          <div className="text-xs text-gris-dark">
            {filas.length} comprobante{filas.length === 1 ? '' : 's'} leído{filas.length === 1 ? '' : 's'} · {fmtM(totalImporte)} ·{' '}
            {new Set(filas.map(f => f.rec_doc_nro)).size} compradores · del {fmtFecha(filas.map(f => f.fecha).sort()[0])} al {fmtFecha(filas.map(f => f.fecha).sort().at(-1))}
          </div>
        )}
        {erroresParseo.length > 0 && (
          <Aviso tono="naranja">
            <b>{erroresParseo.length} fila{erroresParseo.length === 1 ? '' : 's'} no se pudo leer y NO se van a importar:</b>
            <ul className="list-disc ml-4 mt-1">
              {erroresParseo.slice(0, 10).map((e, i) => <li key={i}>{e.archivo}{e.filaExcel ? `, fila ${e.filaExcel}` : ''}: {e.motivo}</li>)}
              {erroresParseo.length > 10 && <li>… y {erroresParseo.length - 10} más</li>}
            </ul>
          </Aviso>
        )}

        {previa && (
          <>
            <div className="flex gap-2 flex-wrap">
              <Cifra label="Nuevas" valor={String(previa.nuevas)} tono="verde" />
              <Cifra label="Duplicadas" valor={String(previa.duplicadas)} sub="no se tocan" />
              <Cifra label="Con error" valor={String(previa.errores)} tono={previa.errores > 0 ? 'rojo' : 'normal'} />
              <Cifra label="A revisar" valor={String(previa.a_revisar)} tono={previa.a_revisar > 0 ? 'naranja' : 'normal'} sub="saldo supuesto = total" />
              <Cifra label="Clientes nuevos" valor={String(previa.clientes_nuevos.length)} />
            </div>
            {previa.clientes_nuevos.length > 0 && (
              <Aviso tono="amarillo">
                <b>Se van a dar de alta estos clientes</b> (por CUIT, con la razón social del Excel):{' '}
                {previa.clientes_nuevos.map(c => `${c.razon_social} (${fmtCuit(c.doc_nro)})${c.revisar_condicion_iva ? ' — revisar condición IVA' : ''}`).join(' · ')}
              </Aviso>
            )}
            <div className="flex gap-1 flex-wrap">
              {([['todas', 'Todas', previa.filas.length], ['nueva', 'Nuevas', previa.nuevas], ['duplicada', 'Duplicadas', previa.duplicadas],
                 ['error', 'Errores', previa.errores], ['revisar', 'A revisar', previa.a_revisar]] as [Filtro, string, number][]).map(([k, l, n]) => (
                <button key={k} type="button" onClick={() => setFiltro(k)}
                  className={`text-xs px-2.5 py-1 rounded-full border ${filtro === k ? 'bg-azul text-white border-azul' : 'bg-white border-gris-mid text-azul'}`}>
                  {l} ({n})
                </button>
              ))}
            </div>
            <div className="overflow-x-auto border border-gris-mid rounded-lg max-h-[45vh] overflow-y-auto">
              <table className="w-full border-collapse min-w-[980px] text-xs">
                <thead className="sticky top-0">
                  <tr>
                    {['Archivo / fila', 'Tipo', 'Número', 'Fecha', 'Comprador', 'Total', 'Saldo inicial', 'Vence', 'Resultado'].map((h, i) => (
                      <th key={h} className={`bg-gris text-gris-dark text-[10px] font-bold px-2 py-1.5 uppercase tracking-wide ${i === 5 || i === 6 ? 'text-right' : 'text-left'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibles.map(f => {
                    const orig = filas[f.indice - 1]
                    return (
                      <tr key={f.indice} className={`border-t border-gris ${f.estado === 'error' ? 'bg-rojo-light/50' : f.estado === 'duplicada' ? 'text-gris-dark' : ''}`}>
                        <td className="px-2 py-1 whitespace-nowrap text-gris-dark">{orig ? `${orig.archivo.replace(/\.xlsx?$/i, '').slice(-14)} · ${orig.filaExcel}` : f.indice}</td>
                        <td className="px-2 py-1 whitespace-nowrap" title={orig?.tipoTexto}>{orig?.tipoTexto.replace(/^\d+\s*-\s*/, '') ?? f.cbte_tipo}</td>
                        <td className="px-2 py-1 font-mono whitespace-nowrap">{String(f.pto_vta ?? orig?.pto_vta ?? '').padStart(5, '0')}-{String(f.numero ?? orig?.numero ?? '').padStart(8, '0')}</td>
                        <td className="px-2 py-1 whitespace-nowrap">{fmtFecha(f.fecha ?? orig?.fecha)}</td>
                        <td className="px-2 py-1">
                          {f.rec_razon_social ?? orig?.rec_razon_social}
                          {f.cliente_nuevo && <span className="ml-1 text-[10px] font-bold text-naranja-dark">nuevo</span>}
                        </td>
                        <td className="px-2 py-1 text-right font-mono tabular-nums whitespace-nowrap">{fmtM(f.total ?? orig?.total)}</td>
                        <td className="px-2 py-1 text-right font-mono tabular-nums whitespace-nowrap">{f.saldo_inicial == null ? '' : fmtM(f.saldo_inicial)}</td>
                        <td className="px-2 py-1 whitespace-nowrap">{fmtFecha(f.vence_el)}</td>
                        <td className="px-2 py-1">
                          {f.estado === 'nueva' && <span className="font-bold text-verde">Nueva</span>}
                          {f.estado === 'duplicada' && <span>{motivoDuplicada(f.detalle)}</span>}
                          {f.estado === 'error' && <span className="font-bold text-rojo">{mensajeErrorFilaImport(f.error, f.detalle)}</span>}
                          {f.estado === 'nueva' && f.saldo_a_revisar && <span className="ml-1 text-[10px] font-bold text-[#7A5000] bg-amarillo-light px-1 rounded">a revisar</span>}
                          {f.estado === 'nueva' && f.saldo_motivo && <div className="text-[10px] text-gris-dark">{f.saldo_motivo}</div>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <Button size="sm" variant="ghost" className="self-start" onClick={() => setPrevia(null)} disabled={importar.isPending}>
              ← Volver a elegir archivos
            </Button>
          </>
        )}
        {errorServer && <Aviso tono="rojo">{errorServer}</Aviso>}
      </div>
    </Modal>
  )
}
