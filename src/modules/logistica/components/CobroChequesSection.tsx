'use client'

import { useState } from 'react'
import { InputMonto } from '@/components/ui/InputMonto'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import { useCargarChequesAMano, useChequesDelCobro } from '../hooks/useCobroAdjuntos'
import type { ChequeAManoInput, ChequeRecibido } from '@/types/domain.types'

/**
 * Los cheques con que pagó la empresa en este cobro: la parte del cobro que
 * alimenta la cartera de cheques recibidos (20260930f/h/j).
 *
 * Entran solos cuando se adjunta la liquidación o el comprobante (se leen con
 * IA en segundo plano). Si no hay IA, si la lectura falla o si son cheques
 * físicos (Global), se cargan a mano acá. Las dos puertas terminan en la
 * misma RPC: un cheque (número + importe) nunca entra dos veces. Mientras un
 * adjunto se está leyendo, la carga a mano espera, para no pisarse.
 */

const ESTADO_LABEL: Record<ChequeRecibido['estado'], { txt: string; cls: string }> = {
  en_cartera: { txt: 'En cartera', cls: 'bg-azul-light text-azul' },
  endosado:   { txt: 'Endosado',   cls: 'bg-verde-light text-verde' },
  depositado: { txt: 'Depositado', cls: 'bg-gris text-gris-dark' },
  rechazado:  { txt: 'Rechazado',  cls: 'bg-rojo-light text-rojo' },
  recuperado: { txt: 'Recuperado', cls: 'bg-gris text-gris-dark' },
}

const fmtM = (v: number) => v.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 })
const fmtF = (iso: string | null) => iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—'

interface Fila { numero: string; banco: string; fecha_cobro: string; importe: string; librador: string; es_echeq: boolean }
const filaVacia = (banco = ''): Fila => ({ numero: '', banco, fecha_cobro: '', importe: '', librador: '', es_echeq: false })

const inputCls = 'w-full px-2 py-1.5 border border-gris-mid rounded text-xs bg-white outline-none focus:border-naranja'

export function CobroChequesSection({ cobroId, leyendo }: { cobroId: number; leyendo: boolean }) {
  const toast = useToast()
  const { puedeCrear } = usePermisos('logistica')
  const { data: cheques = [], isLoading } = useChequesDelCobro(cobroId, leyendo)
  const cargar = useCargarChequesAMano()
  const [filas, setFilas] = useState<Fila[] | null>(null)

  const total = cheques.reduce((s, c) => s + Number(c.importe), 0)
  const motivoNoCargar = !puedeCrear ? 'Sin permiso para cargar'
    : leyendo ? 'Se están leyendo los cheques de un adjunto: esperá a que termine para no cargarlos dos veces'
    : undefined

  function setFila(i: number, cambio: Partial<Fila>) {
    setFilas(fs => (fs ?? []).map((f, j) => j === i ? { ...f, ...cambio } : f))
  }

  async function guardar() {
    const validas = (filas ?? []).filter(f => f.numero.trim() && Number(f.importe) > 0)
    if (validas.length === 0) { toast('Cargá al menos un cheque con número e importe', 'err'); return }
    const lista: ChequeAManoInput[] = validas.map(f => ({
      numero: f.numero.trim(), banco: f.banco.trim() || null, fecha_cobro: f.fecha_cobro || null,
      importe: Number(f.importe), librador: f.librador.trim() || null, es_echeq: f.es_echeq,
    }))
    try {
      const r = await cargar.mutateAsync({ cobroId, cheques: lista })
      const partes = [
        r.nuevos ? `${r.nuevos} a la cartera` : null,
        r.ya_estaban ? `${r.ya_estaban} ya estaba${r.ya_estaban === 1 ? '' : 'n'} (${(r.ya_estaban_numeros ?? []).join(', ')})` : null,
        r.endosados ? `${r.endosados} ya endosado${r.endosados === 1 ? '' : 's'}` : null,
      ].filter(Boolean)
      toast(`✓ ${partes.join(' · ')}`, r.nuevos ? 'ok' : 'warn')
      setFilas(null)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast(msg.includes('LECTURA_EN_CURSO') ? 'Se están leyendo los cheques de un adjunto: esperá a que termine.' : 'No se pudieron cargar los cheques', 'err')
    }
  }

  return (
    <div className="border border-gris-mid rounded-lg p-3 flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="text-sm font-bold text-azul uppercase tracking-wider">🏦 Cheques recibidos</h3>
        <span className="text-xs text-gris-dark">
          {cheques.length > 0 ? <>{cheques.length} · <b className="font-mono tabular-nums">{fmtM(total)}</b></> : 'ninguno todavía'}
        </span>
        {leyendo && <span className="text-[11px] font-semibold text-azul animate-pulse">⏳ leyendo un adjunto…</span>}
        {filas === null && (
          <button type="button" onClick={() => setFilas([filaVacia()])} disabled={!!motivoNoCargar} title={motivoNoCargar}
            className="ml-auto text-[11px] font-bold px-2.5 py-1 rounded bg-azul text-white hover:bg-azul-mid disabled:opacity-50 disabled:cursor-not-allowed">
            ＋ Cargar a mano
          </button>
        )}
      </div>
      <p className="text-[11px] text-gris-dark">
        Entran solos al adjuntar la liquidación o el comprobante. A mano: si la lectura falló o son cheques físicos.
        Van a la cartera; al endosarlos en un pago, el librador y el banco salen de acá.
      </p>

      {isLoading ? (
        <div className="text-xs text-gris-dark italic">Cargando…</div>
      ) : cheques.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[560px] text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-gris-dark">
                <th className="text-left px-2 py-1">Número</th><th className="text-left px-2 py-1">Banco</th>
                <th className="text-left px-2 py-1">Librador</th><th className="text-left px-2 py-1">Se cobra</th>
                <th className="text-right px-2 py-1">Importe</th><th className="text-left px-2 py-1">Estado</th>
              </tr>
            </thead>
            <tbody>
              {cheques.map(c => (
                <tr key={c.id} className="border-t border-gris" title={c.obs ?? undefined}>
                  <td className="px-2 py-1 font-mono">{c.numero}</td>
                  <td className="px-2 py-1">{c.banco ?? '—'}</td>
                  <td className="px-2 py-1 truncate max-w-[180px]">{c.librador ?? '—'}</td>
                  <td className="px-2 py-1 whitespace-nowrap">{fmtF(c.fecha_cobro)}</td>
                  <td className="px-2 py-1 text-right font-mono tabular-nums">{fmtM(Number(c.importe))}</td>
                  <td className="px-2 py-1">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${ESTADO_LABEL[c.estado].cls}`}>{ESTADO_LABEL[c.estado].txt}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filas !== null && (
        <div className="border-t border-gris-mid pt-2 flex flex-col gap-2">
          {filas.map((f, i) => (
            <div key={i} className="grid grid-cols-2 sm:grid-cols-6 gap-1.5 items-end">
              <label className="text-[10px] text-gris-dark">Número
                <input value={f.numero} onChange={e => setFila(i, { numero: e.target.value })} className={`${inputCls} font-mono`} placeholder="14575840" />
              </label>
              <label className="text-[10px] text-gris-dark">Banco
                <input value={f.banco} onChange={e => setFila(i, { banco: e.target.value })} className={inputCls} placeholder="ICBC" />
              </label>
              <label className="text-[10px] text-gris-dark">Se cobra el
                <input type="date" value={f.fecha_cobro} onChange={e => setFila(i, { fecha_cobro: e.target.value })} className={inputCls} />
              </label>
              <label className="text-[10px] text-gris-dark">Importe
                <InputMonto value={f.importe} onChange={v => setFila(i, { importe: v })} className="text-right font-mono tabular-nums py-1.5 text-xs" />
              </label>
              <label className="text-[10px] text-gris-dark sm:col-span-2">Librador <span className="italic">(vacío = la empresa del cobro)</span>
                <div className="flex gap-1.5 items-center">
                  <input value={f.librador} onChange={e => setFila(i, { librador: e.target.value })} className={inputCls} />
                  <label className="flex items-center gap-1 text-[10px] whitespace-nowrap cursor-pointer">
                    <input type="checkbox" checked={f.es_echeq} onChange={e => setFila(i, { es_echeq: e.target.checked })} /> e-cheq
                  </label>
                  {filas.length > 1 && (
                    <button type="button" onClick={() => setFilas(fs => (fs ?? []).filter((_, j) => j !== i))}
                      className="text-rojo text-xs px-1" title="Quitar fila">✕</button>
                  )}
                </div>
              </label>
            </div>
          ))}
          <div className="flex gap-2 items-center flex-wrap">
            {/* El siguiente arranca con el mismo banco: suelen venir de la misma chequera. */}
            <button type="button" onClick={() => setFilas(fs => [...(fs ?? []), filaVacia(fs?.[fs.length - 1]?.banco ?? '')])}
              className="text-[11px] font-semibold text-azul hover:underline">＋ Otro cheque</button>
            <span className="ml-auto" />
            <button type="button" onClick={() => setFilas(null)} className="text-[11px] px-2.5 py-1 rounded hover:bg-gris">Cancelar</button>
            <button type="button" onClick={guardar} disabled={cargar.isPending || !!motivoNoCargar} title={motivoNoCargar}
              className="text-[11px] font-bold px-2.5 py-1 rounded bg-naranja text-white hover:bg-naranja-dark disabled:opacity-50">
              {cargar.isPending ? 'Guardando…' : 'Guardar en la cartera'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
