'use client'

import { useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import { useImportarRecibidos } from '../hooks/usePagos'
import { fmtFecha, fmtM, fmtMes, hoyAR } from '../utils/pagos.utils'
import { NOMBRE_CBTE_ARCA } from '../utils/desglose'
import {
  detalleErrorPagos, mensajeAvisoRecibida, mensajeErrorFilaRecibida, mensajeErrorPagos, motivoDuplicadaRecibida,
} from '../utils/pagos.errores'
import {
  filaRecibidaParaApi, hashArchivo, parsearRecibidos,
  type ErrorParseoRecibidos, type FilaRecibidaArchivo,
} from '../utils/arcaRecibidos'
import type { PagosImportarRecibidosFila, PagosImportarRecibidosRes } from '@/types/domain.types'

/**
 * Importar desde ARCA «Mis Comprobantes — Recibidos» (20260927c).
 *
 *   1. Elegir uno o varios archivos (se parsean en el navegador:
 *      `arcaRecibidos.ts`). Se recomienda UNO POR MES (~350 filas).
 *   2. Vista previa: POST /facturas/importar-arca con `confirmar:false`, una
 *      llamada por archivo. La base dice por fila si es nueva, duplicada (ya
 *      cargada o repetida) o error, qué proveedores va a crear y qué entra con
 *      el desglose o los tributos a revisar.
 *   3. Importar: la misma llamada con `confirmar:true`. Es todo o nada POR
 *      ARCHIVO; con un error en cualquier archivo no se ofrece.
 *
 * Las facturas entran IMPAGAS y SIN IMPUTAR (sin concepto ni reparto): no se
 * aprueban ni se pagan hasta imputarlas desde la bandeja.
 *
 * «De meses ya pagados» (20260928, `historica`): entran con
 * `pago_a_reconstruir` y no son deuda, ni se aprueban, ni avisan; el pago se
 * reconstruye con los extractos. Arranca tildado cuando TODAS las fechas de
 * los archivos son anteriores al mes actual.
 */

type Filtro = 'todas' | 'nueva' | 'duplicada' | 'error' | 'revisar'

interface Archivo {
  nombre:  string
  hash:    string | null
  formato: 'clasico' | 'por_alicuota'
  filas:   FilaRecibidaArchivo[]
  errores: ErrorParseoRecibidos[]
  previa:  PagosImportarRecibidosRes | null
  /** Resultado de la importación confirmada. */
  hecho:   PagosImportarRecibidosRes | null
  errorServer: string | null
}

const aRevisar = (f: PagosImportarRecibidosFila) => f.estado === 'nueva' && (f.desglose_a_revisar || f.tributos_a_revisar)

export function ModalImportarRecibidos({ onClose, onVerImportadas }: {
  onClose: () => void
  /** Abrir la bandeja con las importadas sin imputar (de una importación o de todas). */
  onVerImportadas: (importacionId: number | null) => void
}) {
  const toast = useToast()
  const { puedeCrear, importarComprobantes, esAdmin } = usePermisos('pagos')
  const puede = !!(esAdmin || (puedeCrear && importarComprobantes))
  const importar = useImportarRecibidos()

  const [archivos, setArchivos] = useState<Archivo[]>([])
  const [actual, setActual] = useState(0)
  const [leyendo, setLeyendo] = useState(false)
  const [trabajando, setTrabajando] = useState<'previa' | 'importar' | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('todas')
  /** null = todavía no lo tocó: vale el default por las fechas. */
  const [historicaElegida, setHistoricaElegida] = useState<boolean | null>(null)

  const sinPermiso = !puedeCrear && !esAdmin ? 'No tenés permiso para cargar facturas'
    : !puede ? 'No tenés permiso para importar comprobantes de ARCA (hace falta «Importar comprobantes de ARCA»)' : null

  async function elegir(lista: FileList | null) {
    if (!lista?.length) return
    setLeyendo(true)
    const nuevos: Archivo[] = []
    for (const f of Array.from(lista)) {
      const buf = await f.arrayBuffer()
      const r = parsearRecibidos(buf, f.name)
      nuevos.push({
        nombre: f.name, hash: await hashArchivo(buf), formato: r.formato, filas: r.filas, errores: r.errores,
        previa: null, hecho: null, errorServer: null,
      })
    }
    setArchivos(nuevos)
    setHistoricaElegida(null)
    setActual(0)
    setFiltro('todas')
    setLeyendo(false)
  }

  function actualizar(i: number, p: Partial<Archivo>) {
    setArchivos(as => as.map((a, j) => (j === i ? { ...a, ...p } : a)))
  }

  async function llamar(a: Archivo, confirmar: boolean) {
    return importar.mutateAsync({
      filas: a.filas.map(filaRecibidaParaApi), archivo: a.nombre.slice(0, 255), hash_sha256: a.hash, confirmar, historica,
    })
  }

  async function vistaPrevia() {
    setTrabajando('previa')
    for (let i = 0; i < archivos.length; i++) {
      const a = archivos[i]!
      if (a.filas.length === 0) continue
      try {
        const r = await llamar(a, false)
        actualizar(i, { previa: r, errorServer: null })
      } catch (e) {
        actualizar(i, { errorServer: mensajeErrorPagos(e) })
      }
    }
    setTrabajando(null)
    setFiltro('todas')
  }

  async function confirmar() {
    setTrabajando('importar')
    let total = 0
    for (let i = 0; i < archivos.length; i++) {
      const a = archivos[i]!
      if (!a.previa || a.hecho || a.previa.nuevas === 0) continue
      try {
        const r = await llamar(a, true)
        actualizar(i, { hecho: r, previa: r, errorServer: null })
        total += r.nuevas
      } catch (e) {
        // Todo o nada: si en el medio apareció un error (otra carga, una carrera), se muestra por fila.
        const detalle = detalleErrorPagos(e)
        const errs = Array.isArray(detalle?.errores) ? detalle.errores as PagosImportarRecibidosFila[] : []
        if (errs.length && a.previa) {
          const porIndice = new Map(errs.map(x => [x.indice, x]))
          actualizar(i, {
            previa: { ...a.previa, errores: errs.length, filas: a.previa.filas.map(f => porIndice.get(f.indice) ?? f) },
            errorServer: mensajeErrorPagos(e),
          })
        } else {
          actualizar(i, { errorServer: mensajeErrorPagos(e) })
        }
        setActual(i)
        setFiltro('error')
        break
      }
    }
    setTrabajando(null)
    if (total > 0) toast(`✓ ${total} comprobante${total === 1 ? '' : 's'} importado${total === 1 ? '' : 's'}: quedan sin imputar`
      + (historica ? ' (de meses ya pagados: no cuentan como deuda)' : ''), 'ok')
  }

  const a = archivos[actual] ?? null
  const previa = a?.previa ?? null
  const conPrevia = archivos.filter(x => x.previa)
  const hayErrores = archivos.some(x => (x.previa?.errores ?? 0) > 0 || !!x.errorServer || x.errores.length > 0)
  const nuevasPendientes = archivos.reduce((s, x) => s + (x.previa && !x.hecho ? x.previa.nuevas : 0), 0)
  const todasHechas = archivos.length > 0 && archivos.every(x => x.hecho || (x.previa && x.previa.nuevas === 0) || x.filas.length === 0)
  const hechos = archivos.filter(x => x.hecho)
  const filasLeidas = archivos.reduce((s, x) => s + x.filas.length, 0)
  // Default del tilde: todo el archivo es de meses anteriores al actual.
  const mesActual = `${hoyAR().slice(0, 7)}-01`
  const todasAnteriores = filasLeidas > 0 && archivos.every(x => x.filas.every(f => f.fecha < mesActual))
  const historica = historicaElegida ?? todasAnteriores

  const bloqueoImportar = sinPermiso
    ?? (conPrevia.length < archivos.filter(x => x.filas.length > 0).length ? 'Primero mirá la vista previa de todos los archivos'
    : hayErrores ? 'Hay filas con error: no se importa nada hasta corregirlas (o sacarlas del archivo)'
    : nuevasPendientes === 0 ? 'No hay comprobantes nuevos para importar' : null)

  const visibles = useMemo(() => (previa?.filas ?? []).filter(f =>
    filtro === 'todas' ? true : filtro === 'revisar' ? aRevisar(f) : f.estado === filtro), [previa, filtro])

  const origDe = (indice: number) => a?.filas[indice - 1]

  return (
    <Modal open onClose={trabajando ? () => {} : onClose} width="max-w-6xl" title="Importar desde ARCA — Mis Comprobantes Recibidos"
      footer={<>
        <Button variant="ghost" size="sm" onClick={onClose} disabled={!!trabajando}>Cerrar</Button>
        {!todasHechas && (conPrevia.length === 0 ? (
          <Button size="sm" onClick={vistaPrevia} loading={trabajando === 'previa'} disabled={filasLeidas === 0 || !!sinPermiso}
            title={sinPermiso ?? (filasLeidas === 0 ? 'Elegí el o los archivos de ARCA' : 'Ver qué se va a importar (no guarda nada)')}>
            Ver vista previa ({filasLeidas})
          </Button>
        ) : (
          <Button size="sm" onClick={confirmar} loading={trabajando === 'importar'} disabled={!!bloqueoImportar}
            title={bloqueoImportar ?? 'Importar los comprobantes nuevos (entran sin imputar)'}>
            Importar {nuevasPendientes} comprobante{nuevasPendientes === 1 ? '' : 's'}
          </Button>
        ))}
      </>}>
      <div className="flex flex-col gap-3 text-sm">
        <Aviso tono="gris">
          En el portal de ARCA: <b>Mis Comprobantes › Recibidos</b>, elegí el período y bajá el archivo (Excel o CSV). Conviene
          <b> uno por mes</b>. Lo que ya está cargado se detecta y no se duplica; los proveedores que no existan se crean por CUIT.
          Todo entra <b>impago y sin imputar</b>: después se le pone concepto y obra desde la bandeja («Sin imputar»).
        </Aviso>
        {sinPermiso && <Aviso tono="naranja">{sinPermiso}.</Aviso>}

        <label className={`border-2 border-dashed rounded-lg p-4 text-center ${sinPermiso || trabajando ? 'border-gris opacity-60 cursor-not-allowed' : 'border-gris-mid hover:border-naranja cursor-pointer'}`}>
          <input type="file" multiple accept=".xlsx,.xls,.csv" className="hidden" disabled={!!sinPermiso || !!trabajando}
            onChange={e => { void elegir(e.target.files); e.target.value = '' }} />
          {leyendo ? 'Leyendo…' : archivos.length
            ? <><b>{archivos.length} archivo{archivos.length === 1 ? '' : 's'}:</b> {archivos.map(x => x.nombre).join(', ')} — <span className="text-azul underline">cambiar</span></>
            : <span className="text-azul font-semibold">Elegir el/los archivos de ARCA (uno por mes)</span>}
        </label>

        {/* Compras de meses ya pagados (20260928): no son deuda. Una vez
            importado algún archivo no se cambia (los demás irían distinto). */}
        {archivos.length > 0 && filasLeidas > 0 && (
          <label className={`flex items-start gap-2 text-xs border rounded p-2 ${historica ? 'bg-gris border-gris-mid' : 'bg-white border-gris-mid'}`}
            title={hechos.length > 0 ? 'Ya se importó algún archivo: se mantiene lo elegido para todos'
              : sinPermiso ?? 'Tildado: entran como pagos a reconstruir (fuera de la deuda, sin aprobación ni avisos). Siguen yendo al Libro IVA y a la contabilidad'}>
            <input type="checkbox" className="mt-0.5" checked={historica}
              disabled={!!sinPermiso || !!trabajando || hechos.length > 0}
              onChange={e => setHistoricaElegida(e.target.checked)} />
            <span>
              <b>Son de meses ya pagados (reconstrucción): no cuentan como deuda.</b>{' '}
              No se aprueban ni aparecen en los avisos; el pago se reconstruye después con los extractos bancarios.
              {' '}Siguen yendo al Libro IVA, a la contabilidad y se imputan igual.
              {todasAnteriores && historicaElegida === null && <span className="text-gris-dark"> (tildado porque todas las fechas son anteriores a este mes)</span>}
            </span>
          </label>
        )}

        {/* Un archivo por pestaña: cada uno se importa por separado (todo o nada por archivo). */}
        {archivos.length > 1 && (
          <div className="flex gap-1 flex-wrap">
            {archivos.map((x, i) => (
              <button key={i} type="button" onClick={() => { setActual(i); setFiltro('todas') }}
                className={`text-xs px-2.5 py-1 rounded border ${i === actual ? 'bg-azul text-white border-azul' : 'bg-white border-gris-mid text-azul'}`}>
                {x.nombre}
                {x.hecho ? ' ✓' : (x.previa?.errores ?? 0) > 0 || x.errorServer ? ' ⚠' : ''}
              </button>
            ))}
          </div>
        )}

        {a && (
          <>
            {a.filas.length > 0 && !previa && (
              <div className="text-xs text-gris-dark">
                {a.filas.length} comprobante{a.filas.length === 1 ? '' : 's'} leído{a.filas.length === 1 ? '' : 's'} ·{' '}
                <span className="font-mono tabular-nums">{fmtM(a.filas.reduce((s, f) => s + f.total, 0))}</span> ·{' '}
                {new Set(a.filas.map(f => f.emisor_doc_nro)).size} emisores · del {fmtFecha(a.filas.map(f => f.fecha).sort()[0])} al{' '}
                {fmtFecha(a.filas.map(f => f.fecha).sort().at(-1))} · formato {a.formato === 'por_alicuota' ? 'con IVA por alícuota' : 'clásico'}
              </div>
            )}
            {a.errores.length > 0 && (
              <Aviso tono="naranja">
                <b>{a.errores.length} fila{a.errores.length === 1 ? '' : 's'} no se pudieron leer: corregí el archivo antes de importar (si faltara uno, el Libro IVA quedaría incompleto):</b>
                <ul className="list-disc ml-4 mt-1">
                  {a.errores.slice(0, 10).map((e, i) => <li key={i}>{e.filaExcel ? `Fila ${e.filaExcel}: ` : ''}{e.motivo}</li>)}
                  {a.errores.length > 10 && <li>… y {a.errores.length - 10} más</li>}
                </ul>
              </Aviso>
            )}

            {a.hecho && (
              <Aviso tono="verde">
                ✓ Importado: {a.hecho.nuevas} comprobante{a.hecho.nuevas === 1 ? '' : 's'}.{' '}
                <button type="button" className="underline font-semibold" onClick={() => onVerImportadas(a.hecho?.importacion_id ?? null)}>
                  Ver las {a.hecho.nuevas} importadas sin imputar
                </button>
              </Aviso>
            )}

            {previa && (
              <>
                <div className="flex gap-2 flex-wrap">
                  <Cifra label="Nuevas" valor={String(previa.nuevas)} tono="verde" />
                  <Cifra label="Duplicadas" valor={String(previa.duplicadas)} sub="no se tocan" />
                  <Cifra label="Con error" valor={String(previa.errores)} tono={previa.errores > 0 ? 'rojo' : 'normal'} />
                  <Cifra label="Desglose a revisar" valor={String(previa.a_revisar_desglose)} tono={previa.a_revisar_desglose > 0 ? 'naranja' : 'normal'} sub="fuera del Libro IVA" />
                  <Cifra label="Tributos a revisar" valor={String(previa.a_revisar_tributos)} tono={previa.a_revisar_tributos > 0 ? 'naranja' : 'normal'} sub="otros tributos sin clasificar" />
                  <Cifra label="Moneda extranjera" valor={String(previa.moneda_extranjera)} />
                  <Cifra label="Proveedores nuevos" valor={String(previa.proveedores_nuevos.length)} />
                </div>

                {previa.por_mes.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="text-xs border-collapse">
                      <thead>
                        <tr>
                          {['Mes', 'Nuevas', 'Total'].map((h, i) => (
                            <th key={h} className={`bg-gris text-gris-dark text-[10px] font-bold px-3 py-1 uppercase ${i ? 'text-right' : 'text-left'}`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previa.por_mes.map(m => (
                          <tr key={m.periodo} className="border-t border-gris">
                            <td className="px-3 py-1 capitalize">{fmtMes(m.periodo)}</td>
                            <td className="px-3 py-1 text-right tabular-nums">{m.nuevas}</td>
                            <td className="px-3 py-1 text-right font-mono tabular-nums">{fmtM(m.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {previa.proveedores_nuevos.length > 0 && (
                  <Aviso tono="amarillo">
                    <b>Se van a dar de alta {previa.proveedores_nuevos.length} proveedor{previa.proveedores_nuevos.length === 1 ? '' : 'es'}</b> (por CUIT, con la
                    razón social del archivo, sin datos de pago; después conviene «Actualizar desde ARCA»):{' '}
                    {previa.proveedores_nuevos.map(p => `${p.razon_social} (${p.cuit})`).join(' · ')}
                  </Aviso>
                )}

                <div className="flex gap-1 flex-wrap">
                  {([['todas', 'Todas', previa.filas.length], ['nueva', 'Nuevas', previa.nuevas], ['duplicada', 'Duplicadas', previa.duplicadas],
                     ['error', 'Errores', previa.errores], ['revisar', 'A revisar', previa.filas.filter(aRevisar).length]] as [Filtro, string, number][]).map(([k, l, n]) => (
                    <button key={k} type="button" onClick={() => setFiltro(k)}
                      className={`text-xs px-2.5 py-1 rounded-full border ${filtro === k ? 'bg-azul text-white border-azul' : 'bg-white border-gris-mid text-azul'}`}>
                      {l} ({n})
                    </button>
                  ))}
                </div>

                <div className="overflow-x-auto border border-gris-mid rounded-lg max-h-[45vh] overflow-y-auto">
                  <table className="w-full border-collapse min-w-[1100px] text-xs">
                    <thead className="sticky top-0">
                      <tr>
                        {['Fila', 'Tipo', 'Número', 'Fecha', 'Emisor', 'Neto', 'IVA', 'Otros trib.', 'Total', 'Resultado', 'Avisos'].map((h, i) => (
                          <th key={h} className={`bg-gris text-gris-dark text-[10px] font-bold px-2 py-1.5 uppercase tracking-wide ${i >= 5 && i <= 8 ? 'text-right' : 'text-left'}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visibles.length === 0 ? (
                        <tr><td colSpan={11} className="px-2 py-4 text-center text-gris-dark italic">No hay filas con este filtro.</td></tr>
                      ) : visibles.map(f => {
                        const o = origDe(f.indice)
                        const cbte = f.cbte_tipo ?? o?.cbte_tipo ?? null
                        return (
                          <tr key={f.indice} className={`border-t border-gris align-top ${
                            f.estado === 'error' ? 'bg-rojo-light/50' : f.estado === 'duplicada' ? 'text-gris-dark' : aRevisar(f) ? 'bg-amarillo-light/40' : ''}`}>
                            <td className="px-2 py-1 whitespace-nowrap text-gris-dark">{o?.filaExcel ?? f.indice}</td>
                            <td className="px-2 py-1 whitespace-nowrap" title={o?.tipoTexto}>
                              {cbte != null ? (NOMBRE_CBTE_ARCA[cbte] ?? `Cód. ${cbte}`) : '—'}
                            </td>
                            <td className="px-2 py-1 font-mono whitespace-nowrap">
                              {f.numero ?? (o ? `${String(o.pto_vta).padStart(5, '0')}-${String(o.numero).padStart(8, '0')}` : '')}
                            </td>
                            <td className="px-2 py-1 whitespace-nowrap">{fmtFecha(f.fecha ?? o?.fecha)}</td>
                            <td className="px-2 py-1">
                              {f.razon_social ?? o?.emisor_razon_social}
                              <span className="block text-[10px] text-gris-dark font-mono">{f.cuit ?? o?.emisor_doc_nro}</span>
                              {f.proveedor_nuevo && <span className="text-[10px] font-bold text-naranja-dark">proveedor nuevo</span>}
                            </td>
                            <td className="px-2 py-1 text-right font-mono tabular-nums whitespace-nowrap">{f.neto == null ? <span className="text-gris-mid">—</span> : fmtM(f.neto)}</td>
                            <td className="px-2 py-1 text-right font-mono tabular-nums whitespace-nowrap">{f.iva == null ? <span className="text-gris-mid">—</span> : fmtM(f.iva)}</td>
                            <td className="px-2 py-1 text-right font-mono tabular-nums whitespace-nowrap">{Number(f.otros_tributos ?? o?.otros_tributos ?? 0) > 0 ? fmtM(f.otros_tributos ?? o?.otros_tributos) : ''}</td>
                            <td className="px-2 py-1 text-right font-mono tabular-nums whitespace-nowrap">
                              {f.clase === 'nota_credito' ? <span className="text-[#5A2D82]">−{fmtM(f.total ?? o?.total)}</span> : fmtM(f.total ?? o?.total)}
                            </td>
                            <td className="px-2 py-1">
                              {f.estado === 'nueva' && <span className="font-bold text-verde">Nueva</span>}
                              {f.estado === 'duplicada' && <span>{motivoDuplicadaRecibida({ ...(f.detalle ?? {}), factura_id_existente: f.factura_id_existente })}</span>}
                              {f.estado === 'error' && <span className="font-bold text-rojo">{mensajeErrorFilaRecibida(f.error, f.detalle)}</span>}
                              {f.estado === 'nueva' && f.desglose_a_revisar && <span className="block text-[10px] font-bold text-[#7A5000]">desglose a revisar</span>}
                              {f.estado === 'nueva' && f.tributos_a_revisar && <span className="block text-[10px] font-bold text-[#7A5000]">otros tributos sin clasificar</span>}
                            </td>
                            <td className="px-2 py-1 text-[11px] text-gris-dark max-w-[260px]">
                              {(f.avisos ?? []).map((av, i) => <div key={i}>{mensajeAvisoRecibida(av)}</div>)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {!a.hecho && (
                  <Button size="sm" variant="ghost" className="self-start" onClick={() => actualizar(actual, { previa: null })} disabled={!!trabajando}>
                    ← Volver a ver el archivo
                  </Button>
                )}
              </>
            )}
            {a.errorServer && <Aviso tono="rojo">{a.errorServer}</Aviso>}
          </>
        )}

        {hechos.length > 1 && (
          <Aviso tono="verde">
            ✓ Se importaron {hechos.reduce((s, x) => s + (x.hecho?.nuevas ?? 0), 0)} comprobantes en {hechos.length} archivos.{' '}
            <button type="button" className="underline font-semibold" onClick={() => onVerImportadas(null)}>Ver todas las sin imputar</button>
          </Aviso>
        )}
      </div>
    </Modal>
  )
}

function Aviso({ tono, children }: { tono: 'rojo' | 'naranja' | 'amarillo' | 'gris' | 'verde'; children: React.ReactNode }) {
  const clases = {
    rojo:     'bg-rojo-light border-rojo/30 text-rojo',
    naranja:  'bg-naranja-light border-naranja/30 text-naranja-dark',
    amarillo: 'bg-amarillo-light border-amarillo/40 text-[#7A5000]',
    gris:     'bg-gris border-gris-mid text-gris-dark',
    verde:    'bg-verde-light border-verde/30 text-verde',
  }[tono]
  return <div className={`border rounded p-2 text-xs ${clases}`}>{children}</div>
}

function Cifra({ label, valor, sub, tono = 'normal' }: {
  label: string; valor: string; sub?: string; tono?: 'normal' | 'rojo' | 'verde' | 'naranja'
}) {
  const color = { normal: 'text-azul', rojo: 'text-rojo', verde: 'text-verde', naranja: 'text-naranja-dark' }[tono]
  return (
    <div className="flex-1 min-w-[110px] px-3 py-2 rounded-card border border-gris-mid bg-white">
      <div className="text-[10px] font-bold text-gris-dark uppercase tracking-wide">{label}</div>
      <div className={`font-mono font-bold text-base tabular-nums ${color}`}>{valor}</div>
      {sub && <div className="text-[10px] text-gris-dark">{sub}</div>}
    </div>
  )
}
