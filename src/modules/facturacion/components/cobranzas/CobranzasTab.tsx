'use client'

import { useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Pagination } from '@/components/ui/Pagination'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import { fetchCobro, useAmbienteCobranzas, useAnularCobro, useCobros, type CobrosFiltro } from '../../hooks/useCobranzas'
import { fmtCuit, fmtFecha, fmtM } from '../../utils/facturacion.utils'
import { FORMA_LABEL, cortoRetencion } from '../../utils/cobranzas.utils'
import { useRetencionCortos } from '../../hooks/useConfigVentas'
import { mensajeErrorFacturacion } from '../../utils/facturacion.errores'
import { descargarReciboPdf } from '../../utils/reciboPdf'
import type { VentasCobro } from '@/types/domain.types'
import { ClienteCombobox, ErrorCarga, ModalMotivo, Vacio } from './Comun'
import { FichaCobro } from './FichaCobro'
import { ModalCobro } from './ModalCobro'
import { ModalCompensacion } from './ModalCompensacion'

const PAGE_SIZE = 50

/**
 * Cobranzas (modelo Bejerman): la lista de recibos RC con Visualizar / PDF /
 * Anular, «Nuevo cobro» y «Compensación de comprobantes».
 */
export function CobranzasTab() {
  const toast = useToast()
  const { puedeVer, registrarCobros, anularCobros } = usePermisos('facturacion')
  const cortos = useRetencionCortos()
  const ambiente = useAmbienteCobranzas()

  const [filtro, setFiltro] = useState<CobrosFiltro>({})
  const [page, setPage] = useState(1)
  const [nuevo, setNuevo] = useState(false)
  const [compensar, setCompensar] = useState(false)
  // `&ficha=<id>` (Contabilidad › Automáticos › «Ir al origen») abre ese cobro.
  const sp = useSearchParams()
  const [fichaId, setFichaId] = useState<number | null>(() => {
    const n = Number(sp.get('ficha'))
    return Number.isInteger(n) && n > 0 ? n : null
  })
  const [anulando, setAnulando] = useState<VentasCobro | null>(null)
  const [pdfId, setPdfId] = useState<number | null>(null)
  const anular = useAnularCobro()

  const lista = useCobros({ ...filtro, ambiente }, page, PAGE_SIZE, puedeVer)
  const filas = useMemo(() => lista.data?.rows ?? [], [lista.data])
  const total = lista.data?.total ?? 0

  function patch(p: Partial<CobrosFiltro>) {
    setFiltro(f => ({ ...f, ...p }))
    setPage(1)
  }

  async function pdf(id: number) {
    setPdfId(id)
    try { await descargarReciboPdf(await fetchCobro(id), cortos) }
    catch (e) { toast(mensajeErrorFacturacion(e), 'err') }
    finally { setPdfId(null) }
  }

  if (!puedeVer) return <Vacio>No tenés permiso para ver las cobranzas.</Vacio>

  const sumaPagina = filas.filter(c => c.estado === 'vigente').reduce((s, c) => s + Number(c.total), 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 flex-wrap items-center">
        <Button size="sm" onClick={() => setNuevo(true)} disabled={!registrarCobros}
          title={registrarCobros ? 'Registrar un cobro: medios, retenciones y aplicación a facturas' : 'Hace falta el permiso «Registrar cobros»'}>
          + Nuevo cobro
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setCompensar(true)} disabled={!registrarCobros}
          title={registrarCobros ? 'Aplicar una NC libre o un cobro a cuenta contra facturas del cliente' : 'Hace falta el permiso «Registrar cobros»'}>
          Compensación de comprobantes
        </Button>
        {ambiente === 'homo' && <span className="text-[11px] font-bold text-[#7A5000] bg-amarillo-light px-2 py-1 rounded">Homologación: cobros de prueba</span>}
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-card shadow-card p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="lg:col-span-2">
          <ClienteCombobox value={filtro.cliente_id ? String(filtro.cliente_id) : ''} todos="Todos los clientes" incluirInactivos
            onChange={v => patch({ cliente_id: v ? Number(v) : undefined })} />
        </div>
        <Input label="Desde" type="date" value={filtro.desde ?? ''} onChange={e => patch({ desde: e.target.value || undefined })} />
        <Input label="Hasta" type="date" value={filtro.hasta ?? ''} onChange={e => patch({ hasta: e.target.value || undefined })} />
        <Select label="Estado" value={filtro.estado ?? ''} onChange={e => patch({ estado: (e.target.value || undefined) as CobrosFiltro['estado'] })}
          options={[{ value: '', label: 'Todos' }, { value: 'vigente', label: 'Vigentes' }, { value: 'anulado', label: 'Anulados' }]} />
        <div className="sm:col-span-2 lg:col-span-4">
          <Input placeholder="Buscar: número de recibo, cliente, cheque, certificado…" value={filtro.q ?? ''}
            onChange={e => patch({ q: e.target.value })} />
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={!!filtro.con_a_cuenta} onChange={e => patch({ con_a_cuenta: e.target.checked || undefined })} />
          Con saldo a cuenta
        </label>
      </div>

      {lista.isLoading && !lista.data ? (
        <Vacio>Cargando cobranzas…</Vacio>
      ) : lista.error ? (
        <ErrorCarga mensaje={mensajeErrorFacturacion(lista.error)} onReintentar={() => lista.refetch()} />
      ) : filas.length === 0 ? (
        <Vacio>{Object.values(filtro).some(Boolean) ? 'No hay cobros con estos filtros.' : 'Todavía no hay cobros registrados.'}</Vacio>
      ) : (
        <div className="bg-white rounded-card shadow-card overflow-hidden">
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full border-collapse min-w-[1000px]">
              <thead>
                <tr>
                  {['Tipo', 'Número', 'Cliente', 'Razón social', 'Fecha', 'Medios', 'Total', 'Aplicado', 'A cuenta', 'Estado', ''].map((h, i) => (
                    <th key={i} className={`bg-gris text-gris-dark text-[10px] font-bold px-3 py-2 uppercase tracking-wide whitespace-nowrap ${i >= 6 && i <= 8 ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filas.map(c => {
                  const anulado = c.estado === 'anulado'
                  return (
                    <tr key={c.id} className={`border-t border-gris hover:bg-azul-light/30 ${anulado ? 'opacity-60' : ''}`}>
                      <td className="px-3 py-2 text-xs font-bold cursor-pointer" onClick={() => setFichaId(c.id)}>RC</td>
                      <td className="px-3 py-2 font-mono text-sm font-semibold whitespace-nowrap cursor-pointer" onClick={() => setFichaId(c.id)}>
                        {c.numero_fmt.replace(/^RC\s*/, '')}
                      </td>
                      <td className="px-3 py-2 text-xs font-mono whitespace-nowrap cursor-pointer" onClick={() => setFichaId(c.id)}>{fmtCuit(c.cliente_doc_nro)}</td>
                      <td className="px-3 py-2 text-sm font-semibold cursor-pointer" onClick={() => setFichaId(c.id)}>{c.cliente_razon_social}</td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap cursor-pointer" onClick={() => setFichaId(c.id)}>{fmtFecha(c.fecha)}</td>
                      <td className="px-3 py-2 text-xs cursor-pointer" onClick={() => setFichaId(c.id)}>
                        {(c.medios_formas ?? []).map(f => FORMA_LABEL[f] ?? f).join(', ') || '—'}
                        {(c.retenciones_resumen ?? []).length > 0 && (
                          <div className="text-[11px] text-gris-dark">
                            Ret.: {c.retenciones_resumen.map(r => `${cortoRetencion(r.tipo, cortos)} ${fmtM(r.importe)}`).join(' · ')}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-sm tabular-nums font-bold whitespace-nowrap">{fmtM(c.total)}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs tabular-nums whitespace-nowrap">{fmtM(c.aplicado)}</td>
                      <td className={`px-3 py-2 text-right font-mono text-xs tabular-nums whitespace-nowrap ${Number(c.a_cuenta) > 0 && !anulado ? 'text-naranja-dark font-bold' : ''}`}>{fmtM(c.a_cuenta)}</td>
                      <td className="px-3 py-2"><EstadoRc c={c} /></td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <Acciones c={c} onVer={() => setFichaId(c.id)} onPdf={() => pdf(c.id)} onAnular={() => setAnulando(c)}
                          generando={pdfId === c.id} anularCobros={anularCobros} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="md:hidden divide-y divide-gris">
            {filas.map(c => (
              <div key={c.id} className={`p-3 ${c.estado === 'anulado' ? 'opacity-60' : ''}`}>
                <div className="cursor-pointer" onClick={() => setFichaId(c.id)}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-mono text-sm font-semibold">{c.numero_fmt}</div>
                      <div className="font-semibold text-sm truncate">{c.cliente_razon_social}</div>
                    </div>
                    <EstadoRc c={c} />
                  </div>
                  <div className="flex items-baseline justify-between gap-2 mt-1">
                    <span className="text-[11px] text-gris-dark">{fmtFecha(c.fecha)} · aplicado {fmtM(c.aplicado)}{Number(c.a_cuenta) > 0 ? ` · a cuenta ${fmtM(c.a_cuenta)}` : ''}</span>
                    <span className="font-mono text-sm font-bold tabular-nums">{fmtM(c.total)}</span>
                  </div>
                </div>
                <div className="mt-2">
                  <Acciones c={c} onVer={() => setFichaId(c.id)} onPdf={() => pdf(c.id)} onAnular={() => setAnulando(c)}
                    generando={pdfId === c.id} anularCobros={anularCobros} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {total > PAGE_SIZE && <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />}
      {filas.length > 0 && (
        <p className="text-[11px] text-gris-dark px-1">
          {total.toLocaleString('es-AR')} recibo{total === 1 ? '' : 's'} · vigentes de esta página: {fmtM(sumaPagina)} (medios + retenciones)
        </p>
      )}

      {nuevo && <ModalCobro onClose={() => setNuevo(false)} onGuardado={d => { setNuevo(false); setFichaId(d.cobro.id) }} />}
      {compensar && <ModalCompensacion clienteId={filtro.cliente_id} onClose={() => setCompensar(false)} />}
      {fichaId !== null && <FichaCobro id={fichaId} onClose={() => setFichaId(null)} />}
      {anulando && (
        <ModalMotivo
          titulo={`Anular ${anulando.numero_fmt}`}
          texto={<>Se anulan el recibo de <b>{anulando.cliente_razon_social}</b> por {fmtM(anulando.total)} y sus imputaciones: las facturas vuelven a deber {fmtM(anulando.aplicado)}.</>}
          cargando={anular.isPending}
          onClose={() => setAnulando(null)}
          onConfirmar={async motivo => {
            try {
              await anular.mutateAsync({ id: anulando.id, motivo })
              toast(`✓ ${anulando.numero_fmt} anulado`, 'ok')
              setAnulando(null)
            } catch (e) { toast(mensajeErrorFacturacion(e), 'err') }
          }}
        />
      )}
    </div>
  )
}

function EstadoRc({ c }: { c: VentasCobro }) {
  return c.estado === 'anulado'
    ? <span className="inline-block text-[11px] font-bold px-2 py-0.5 rounded bg-gris text-gris-dark line-through" title={c.anulado_motivo ?? undefined}>Anulado</span>
    : <span className="inline-block text-[11px] font-bold px-2 py-0.5 rounded bg-verde-light text-verde">Vigente</span>
}

function Acciones({ c, onVer, onPdf, onAnular, generando, anularCobros }: {
  c: VentasCobro; onVer: () => void; onPdf: () => void; onAnular: () => void; generando: boolean; anularCobros: boolean
}) {
  return (
    <div className="flex gap-1 justify-end items-center">
      <button type="button" onClick={onVer} className="text-xs px-2 py-1 rounded text-azul hover:bg-azul-light font-semibold">Ver</button>
      <button type="button" onClick={onPdf} disabled={generando} className="text-xs px-2 py-1 rounded text-azul hover:bg-azul-light font-semibold disabled:opacity-50">
        {generando ? '…' : 'PDF'}
      </button>
      {c.estado === 'vigente' && (
        <button type="button" onClick={onAnular} disabled={!anularCobros}
          className="text-xs px-2 py-1 rounded text-rojo hover:bg-rojo-light font-semibold disabled:text-gris-mid disabled:hover:bg-transparent disabled:cursor-not-allowed"
          title={anularCobros ? 'Anular el recibo' : 'Hace falta el permiso «Anular cobros»'}>
          Anular
        </button>
      )}
    </div>
  )
}
