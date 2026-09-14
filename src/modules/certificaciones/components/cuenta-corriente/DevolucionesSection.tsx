'use client'

import { useMemo, useState } from 'react'
import { useDevolucionesObra, type DevolucionObra, type EfectoDevolucion } from '../../hooks/useCuentaCliente'
import { fmtM, fmtFecha } from './cuentaCorriente.utils'

/**
 * Devoluciones al depósito de la obra (20260914ai): la respuesta a "¿me
 * devolvieron algo de esta obra?".
 *
 * Hace falta porque la cuenta corriente no lo dice sola. Devolver un renglón
 * que NO estaba cobrado lo descuenta de la cuenta, y si vuelve todo la fila
 * desaparece: no queda ninguna marca. La nota de crédito (renglón ya cobrado)
 * sí se ve en Pagos, pero es la excepción. Acá están TODAS, con la fecha, qué
 * volvió, qué le hizo a la plata, el motivo y quién lo registró.
 *
 * Solo lectura: devolver se hace desde el renglón del pedido, que es donde se
 * sabe cuánto salió. Esta sección mira para atrás.
 */

const EFECTO: Record<EfectoDevolucion, { label: string; hint: string; cls: string }> = {
  descontado:   { label: 'Descontado de la cuenta',  hint: 'El renglón no estaba cobrado: lo devuelto se bajó de lo que se le cobra al cliente. Si volvió todo, el renglón ya no aparece en la cuenta.', cls: 'bg-gris text-gris-dark' },
  nota_credito: { label: 'Nota de crédito',          hint: 'El renglón ya estaba cobrado o certificado: la cuenta no se toca y el crédito baja el saldo por separado (se ve en Pagos del cliente).', cls: 'bg-verde-light text-verde' },
  cancelado:    { label: 'Cancelado antes de salir', hint: 'Volvió todo y nunca salió por remito: el renglón quedó rechazado en el pedido, conservando la cantidad.', cls: 'bg-rojo-light text-rojo' },
}

const fmtCant = (n: number) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(n)

/** "10 de 12 bolsas" si fue parcial; "12 bolsas" si volvió todo. */
function cantidadTxt(d: DevolucionObra): string {
  const antes = d.cantidad_antes != null ? Number(d.cantidad_antes) : null
  const parcial = antes != null && antes > Number(d.cantidad)
  return parcial ? `${fmtCant(Number(d.cantidad))} de ${fmtCant(antes)} ${d.unidad}` : `${fmtCant(Number(d.cantidad))} ${d.unidad}`
}

export function DevolucionesSection({ obraCod }: { obraCod: string }) {
  const { data: devoluciones = [], isLoading, isError } = useDevolucionesObra(obraCod)
  // Abierta por defecto: la sección existe para que se vea la lista. Se puede
  // plegar en una obra con muchas.
  const [ver, setVer] = useState(true)

  const tot = useMemo(() => {
    let descontado = 0, notas = 0
    for (const d of devoluciones) {
      const m = Number(d.monto ?? 0)
      if (d.efecto === 'nota_credito') { if (!d.nota_anulada) notas += m }
      else descontado += m
    }
    return { descontado, notas }
  }, [devoluciones])

  const n = devoluciones.length
  const resumen = n === 0 ? null : [
    `${n} ${n === 1 ? 'devolución' : 'devoluciones'}`,
    tot.descontado > 0 ? `${fmtM(tot.descontado)} descontados de la cuenta` : null,
    tot.notas > 0 ? `${fmtM(tot.notas)} en notas de crédito` : null,
  ].filter(Boolean).join(' · ')

  return (
    <section className="bg-white rounded-card shadow-card p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-xs font-bold text-gris-dark uppercase tracking-wider">Devoluciones al depósito</h3>
          <p className="text-[11px] text-gris-dark">
            {isLoading ? 'Cargando…'
              : isError ? 'No se pudieron cargar las devoluciones.'
              : n === 0 ? 'Sin devoluciones registradas para esta obra.'
              : resumen}
          </p>
        </div>
        {n > 0 && (
          <button onClick={() => setVer(v => !v)}
            className="text-[11px] font-bold px-2 py-1 rounded bg-gris text-gris-dark hover:bg-gris-mid transition-colors shrink-0">
            {ver ? '▾ Ocultar' : `▸ Ver ${n}`}
          </button>
        )}
      </div>

      {n > 0 && ver && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-gris-dark text-left">
                <th className="py-1 pr-2">Fecha</th>
                <th className="py-1 pr-2">Material</th>
                <th className="py-1 pr-2 text-right">Volvió</th>
                <th className="py-1 pr-2">Efecto</th>
                <th className="py-1 pr-2 text-right">Monto</th>
                <th className="py-1 pr-2">Motivo</th>
                <th className="py-1">Quién</th>
              </tr>
            </thead>
            <tbody>
              {devoluciones.map(d => {
                const ef = EFECTO[d.efecto] ?? EFECTO.descontado
                return (
                  <tr key={d.id} className="border-t border-gris align-top">
                    <td className="py-1.5 pr-2 font-mono whitespace-nowrap">{fmtFecha(d.fecha)}</td>
                    <td className="py-1.5 pr-2 min-w-[160px]">
                      <div className="font-bold text-carbon">{d.descripcion}</div>
                      {d.solicitud_id != null && <div className="text-[10px] text-gris-dark">pedido #{d.solicitud_id}</div>}
                    </td>
                    <td className="py-1.5 pr-2 text-right font-mono whitespace-nowrap">{cantidadTxt(d)}</td>
                    <td className="py-1.5 pr-2">
                      <span className={'inline-block px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ' + ef.cls} title={ef.hint}>{ef.label}</span>
                      {d.efecto === 'nota_credito' && d.nota_anulada && (
                        <span className="ml-1 text-[10px] text-rojo font-bold" title="La nota de crédito fue anulada: no baja el saldo">anulada</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-2 text-right font-mono whitespace-nowrap">
                      {d.monto != null && Number(d.monto) > 0
                        ? <span className={d.efecto === 'nota_credito' && d.nota_anulada ? 'line-through text-gris-dark' : ''}>−{fmtM(Number(d.monto))}</span>
                        : <span className="text-gris-dark" title="El renglón no tenía precio cuando se devolvió">sin precio</span>}
                    </td>
                    <td className="py-1.5 pr-2 italic text-gris-dark max-w-[260px]">{d.motivo ?? '—'}</td>
                    <td className="py-1.5 text-gris-dark whitespace-nowrap">{d.usuario ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
