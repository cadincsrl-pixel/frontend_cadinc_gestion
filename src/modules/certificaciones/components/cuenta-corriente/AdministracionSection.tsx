'use client'

// La cuenta por administración de una obra: costo + % por pata.
//
// Aparece en Cuenta corriente cuando la obra elegida está marcada
// `por_administracion`. Junta las tres patas que el sistema YA carga —
// operarios (horas de tarja, fórmula canónica §5.11), contratistas
// (certificaciones semanales) y materiales (la cuenta corriente) — les aplica
// el % vigente de cada fecha, y muestra el total facturable, los cobros y el
// saldo. Nadie carga nada nuevo para esta pantalla: solo los porcentajes.
//
// El % se aplica POR SEMANA (operarios y contratistas) o POR FECHA de cada
// renglón (materiales), con la versión vigente en ese momento. Así un cambio
// de porcentaje a mitad de obra vale desde su viernes y no re-factura lo
// anterior — misma regla que las tarifas.
//
// En PANTALLA se ve costo, % y facturable. En el PDF que se lleva el cliente
// van SOLO los montos finales, con el % adentro (decisión del user 08/09).

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useGuardarAdminTarifa, useImputarPagado } from '../../hooks/useAdministracion'
import { useAdministracionCuenta } from './useAdministracionCuenta'
import { getSemLabel, getViernes, toISO } from '@/lib/utils/dates'
import { fmtM, fmtMes } from './cuentaCorriente.utils'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import type { Obra } from '@/types/domain.types'

export function AdministracionSection({ obra }: { obra: Obra }) {
  const { puedeAdministrarObras, esAdmin } = usePermisos('tarja')
  const puedeConfigurar = puedeAdministrarObras || esAdmin
  const [modalPct, setModalPct] = useState(false)
  // Los totales siempre a la vista; el detalle plegado. Una obra con meses de
  // historia mete decenas de semanas de jornales y sin esto la página no
  // termina más.
  const [verJornales, setVerJornales] = useState(false)
  const [verMateriales, setVerMateriales] = useState(false)
  const [modalImputar, setModalImputar] = useState(false)

  // Los datos y el cálculo viven en el hook, compartidos con el modal de
  // exportar: mismas queries, mismo número.
  const { semanas, meses, tot, tarifasAdmin, vigente, sinPrecio, cargando: cargandoPct } = useAdministracionCuenta(obra)
  const obraCod = obra.cod

  const th = (extra = '') => `px-3 py-2 text-[11px] font-bold text-gris-dark uppercase tracking-wider ${extra}`
  const td = (extra = '') => `px-3 py-2 font-mono tabular-nums ${extra}`

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden border-l-4 border-naranja">
      <div className="px-4 py-3 border-b border-gris-mid flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[220px]">
          <h3 className="font-display text-lg text-azul">🧮 POR ADMINISTRACIÓN</h3>
          <p className="text-[11px] text-gris-dark">
            Costo + % pactado por pata. {vigente
              ? `Vigente: operarios ${Number(vigente.pct_operarios)}% · contratistas ${Number(vigente.pct_contratistas)}% · materiales ${Number(vigente.pct_materiales)}%`
              : 'Sin porcentajes cargados todavía.'}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setModalPct(true)} disabled={!puedeConfigurar}
          title={puedeConfigurar ? 'Nueva versión de porcentajes, desde un viernes' : 'Sin permiso para administrar obras'}>
          % Cambiar
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setModalImputar(true)}
          disabled={!vigente || tot.cobrado <= 0}
          title={tot.cobrado <= 0 ? 'La obra no tiene pagos registrados' : 'Congelar lo que los pagos ya cubren, primero lo viejo'}>
          🔒 Imputar lo pagado
        </Button>
      </div>

      {!vigente && !cargandoPct ? (
        <div className="px-4 py-6 text-sm text-gris-dark">
          La obra está marcada por administración pero no tiene porcentajes.
          {puedeConfigurar ? ' Cargalos con "% Cambiar" y la cuenta se arma sola con lo que ya está en el sistema.' : ''}
        </div>
      ) : (
        <>
          {/* Totales */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2 p-3">
            <Kpi label="Mano de obra" valor={tot.mo} />
            <Kpi label="Contratistas" valor={tot.cont} />
            <Kpi label="Materiales"   valor={tot.mat} />
            <Kpi label="Total"        valor={tot.total} fuerte />
            <Kpi label="Cobrado"      valor={tot.cobrado} verde />
            <Kpi label="Saldo"        valor={tot.saldo} rojo={tot.saldo > 0} fuerte />
          </div>

          {sinPrecio > 0 && (
            <div className="mx-3 mb-2 bg-amarillo-light border border-amarillo rounded-lg px-3 py-1.5 text-xs text-[#7A5500]">
              ⚠ {sinPrecio} {sinPrecio === 1 ? 'material sin precio' : 'materiales sin precio'}: el total real es más alto.
            </div>
          )}

          {/* Jornales y contratistas, semana a semana — plegado por defecto */}
          <Pliegue
            abierto={verJornales}
            onToggle={() => setVerJornales(v => !v)}
            titulo={`Jornales y contratistas, semana a semana (${semanas.length})`}
            resumen={`${fmtM(tot.mo + tot.cont)} facturable`}
          />
          {verJornales && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="bg-gris">
                  <th className={th('text-left')}>Semana</th>
                  <th className={th('text-right')}>Mano de obra</th>
                  <th className={th('text-right')}>%</th>
                  <th className={th('text-right')}>Facturable</th>
                  <th className={th('text-right')}>Contratistas</th>
                  <th className={th('text-right')}>%</th>
                  <th className={th('text-right')}>Facturable</th>
                </tr>
              </thead>
              <tbody>
                {semanas.map(s => (
                  <tr key={s.semKey} className="border-t border-gris hover:bg-gris/40">
                    <td className="px-3 py-2 font-semibold text-azul whitespace-nowrap">{getSemLabel(new Date(s.semKey + 'T12:00:00'))}</td>
                    <td className={td('text-right')}>{s.moCosto ? fmtM(s.moCosto) : '—'}</td>
                    <td className={td('text-right text-gris-dark text-xs')}>{s.moCosto ? `${s.moPct}%` : ''}</td>
                    <td className={td('text-right font-bold')}>{s.moCosto || s.moCobrada ? <>{fmtM(s.moFacturable)}{s.moCobrada && <span title="Semana cubierta por un pago: monto congelado"> 🔒</span>}</> : '—'}</td>
                    <td className={td('text-right')}>{s.contCosto ? fmtM(s.contCosto) : '—'}</td>
                    <td className={td('text-right text-gris-dark text-xs')}>{s.contCosto ? `${s.contPct}%` : ''}</td>
                    <td className={td('text-right font-bold')}>{s.contCosto || s.contCobrada ? <>{fmtM(s.contFacturable)}{s.contCobrada && <span title="Semana cubierta por un pago: monto congelado"> 🔒</span>}</> : '—'}</td>
                  </tr>
                ))}
                {semanas.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-5 text-center text-sm text-gris-dark italic">Sin horas ni certificaciones todavía.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          )}

          {/* Materiales por mes — plegado por defecto */}
          {meses.length > 0 && (
            <>
            <Pliegue
              abierto={verMateriales}
              onToggle={() => setVerMateriales(v => !v)}
              titulo={`Materiales, mes a mes (${meses.length})`}
              resumen={`${fmtM(tot.mat)} facturable`}
            />
            {verMateriales && (
            <div className="border-t border-gris-mid">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[420px]">
                  <tbody>
                    {meses.map(m => {
                      const pct = m.costo ? Math.round((m.facturable / m.costo - 1) * 1000) / 10 : 0
                      return (
                        <tr key={m.mes} className="border-t border-gris hover:bg-gris/40">
                          <td className="px-3 py-1.5 font-semibold text-azul">{fmtMes(m.mes)}</td>
                          <td className={td('text-right')}>{fmtM(m.costo)}</td>
                          <td className={td('text-right text-gris-dark text-xs')}>{pct}%</td>
                          <td className={td('text-right font-bold')}>{fmtM(m.facturable)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            )}
            </>
          )}
        </>
      )}

      {modalPct && (
        <ModalPorcentajes obraCod={obraCod} vigente={vigente} historial={tarifasAdmin} onClose={() => setModalPct(false)} />
      )}
      {modalImputar && (
        <ModalImputar obraCod={obraCod} onClose={() => setModalImputar(false)} />
      )}
    </div>
  )
}

/**
 * Cabecera de un bloque plegable: siempre visible, con el número clave a la
 * derecha para que plegar no esconda información — solo esconde el detalle.
 */
function Pliegue({ abierto, onToggle, titulo, resumen }: {
  abierto: boolean; onToggle: () => void; titulo: string; resumen: string
}) {
  return (
    <button onClick={onToggle}
      className="w-full flex items-center justify-between gap-2 px-4 py-2.5 border-t border-gris-mid bg-gris/40 hover:bg-gris/70 transition-colors text-left">
      <span className="text-[12px] font-bold text-azul">
        <span className="inline-block w-4 text-gris-dark">{abierto ? '▾' : '▸'}</span>
        {titulo}
      </span>
      <span className="font-mono tabular-nums text-xs font-bold text-carbon whitespace-nowrap">{resumen}</span>
    </button>
  )
}

function Kpi({ label, valor, fuerte, verde, rojo }: {
  label: string; valor: number; fuerte?: boolean; verde?: boolean; rojo?: boolean
}) {
  return (
    <div className="bg-gris/60 rounded-lg px-2.5 py-1.5">
      <div className="text-[10px] font-bold text-gris-dark uppercase tracking-wider">{label}</div>
      <div className={`font-mono tabular-nums ${fuerte ? 'font-bold text-base' : 'text-sm'} ${verde ? 'text-verde' : rojo ? 'text-rojo' : 'text-carbon'}`}>
        {fmtM(valor)}
      </div>
    </div>
  )
}

/**
 * La puerta de entrada para una obra que TODAVÍA no está por administración:
 * un botón chico que abre el mismo modal de porcentajes. Guardar la primera
 * versión prende el flag en la obra (lo hace el backend) y la sección aparece.
 */
export function MarcarAdministracion({ obra }: { obra: Obra }) {
  const { puedeAdministrarObras, esAdmin } = usePermisos('tarja')
  const [abierto, setAbierto] = useState(false)
  if (!puedeAdministrarObras && !esAdmin) return null
  return (
    <>
      <button onClick={() => setAbierto(true)}
        className="text-[11px] font-bold px-2 py-1 rounded bg-gris text-gris-dark hover:bg-naranja-light hover:text-naranja-dark transition-colors"
        title="Marcar la obra por administración: se factura costo + % por pata (operarios, contratistas, materiales)">
        🧮 Por administración
      </button>
      {abierto && (
        <ModalPorcentajes obraCod={obra.cod} vigente={null} historial={[]} onClose={() => setAbierto(false)} />
      )}
    </>
  )
}

// ── Imputar lo pagado ─────────────────────────────────────────────────

function ModalImputar({ obraCod, onClose }: { obraCod: string; onClose: () => void }) {
  const toast = useToast()
  const imputar = useImputarPagado()

  function correr() {
    imputar.mutate(obraCod, {
      onSuccess: (r) => {
        const partes: string[] = []
        if (r.congelado.operarios.n)    partes.push(`${r.congelado.operarios.n} semana${r.congelado.operarios.n !== 1 ? 's' : ''} de jornales (${fmtM(r.congelado.operarios.monto)})`)
        if (r.congelado.contratistas.n) partes.push(`${r.congelado.contratistas.n} de contratistas (${fmtM(r.congelado.contratistas.monto)})`)
        if (r.congelado.materiales.n)   partes.push(`${r.congelado.materiales.n} material${r.congelado.materiales.n !== 1 ? 'es' : ''} (${fmtM(r.congelado.materiales.monto)})`)
        toast(partes.length
          ? `🔒 Congelado: ${partes.join(' · ')}${r.sin_cubrir.n ? ` — quedan ${r.sin_cubrir.n} sin cubrir` : ''}`
          : 'No había nada nuevo para congelar: lo pagado ya estaba imputado.', 'ok')
        onClose()
      },
      onError: (e) => toast(e instanceof Error ? e.message : 'No se pudo imputar', 'err'),
    })
  }

  return (
    <Modal open onClose={onClose} title="🔒 IMPUTAR LO PAGADO"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" onClick={correr} loading={imputar.isPending}>🔒 Imputar</Button>
      </>}>
      <div className="space-y-2 text-sm">
        <p>
          Reparte los pagos del cliente sobre lo facturable, <b>primero lo más viejo</b>,
          y congela lo que queda cubierto:
        </p>
        <ul className="list-disc pl-5 space-y-1 text-[13px]">
          <li>Los <b>materiales</b> cubiertos pasan a &ldquo;Cobrado&rdquo;: el precio queda clavado y no se puede editar más.</li>
          <li>Las <b>semanas de jornales y contratistas</b> cubiertas guardan su monto de hoy (🔒): un cambio retroactivo de tarifas ya no las mueve.</li>
        </ul>
        <p className="text-[12px] text-gris-dark">
          La semana en curso y los materiales sin precio quedan afuera. Si más adelante se
          elimina un pago, lo que ese pago cubría se descongela solo. Se puede correr las
          veces que haga falta: lo ya congelado no se toca.
        </p>
      </div>
    </Modal>
  )
}

// ── Porcentajes: nueva versión desde un viernes ───────────────────────

interface FormPct { desde: string; pct_operarios: number; pct_contratistas: number; pct_materiales: number }

function ModalPorcentajes({ obraCod, vigente, historial, onClose }: {
  obraCod: string
  vigente: { pct_operarios: number; pct_contratistas: number; pct_materiales: number } | null
  historial: { desde: string; pct_operarios: number; pct_contratistas: number; pct_materiales: number }[]
  onClose: () => void
}) {
  const toast = useToast()
  const guardar = useGuardarAdminTarifa()
  const form = useForm<FormPct>({
    defaultValues: {
      desde: toISO(getViernes(new Date())),
      pct_operarios:    Number(vigente?.pct_operarios ?? 0),
      pct_contratistas: Number(vigente?.pct_contratistas ?? 0),
      pct_materiales:   Number(vigente?.pct_materiales ?? 0),
    },
  })

  function onSubmit(data: FormPct) {
    const desdeViernes = toISO(getViernes(new Date(data.desde + 'T12:00:00')))
    guardar.mutate({
      obraCod,
      desde: desdeViernes,
      pct_operarios:    Number(data.pct_operarios),
      pct_contratistas: Number(data.pct_contratistas),
      pct_materiales:   Number(data.pct_materiales),
    }, {
      onSuccess: () => { toast('Porcentajes guardados', 'ok'); onClose() },
      onError:   (e) => toast(e instanceof Error ? e.message : 'No se pudo guardar', 'err'),
    })
  }

  return (
    <Modal open onClose={onClose} title="% POR ADMINISTRACIÓN"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" onClick={form.handleSubmit(onSubmit)} loading={guardar.isPending}>Guardar</Button>
      </>}>
      <div className="space-y-3">
        <p className="text-xs text-gris-dark">
          Vale desde el viernes elegido en adelante. Lo anterior no se toca: cada semana
          se factura con el % que estaba vigente cuando pasó.
        </p>
        <Input label="Desde (se ajusta al viernes de esa semana)" type="date" {...form.register('desde', { required: true })} />
        <div className="grid grid-cols-3 gap-2">
          <Input label="% Operarios"    type="number" step="0.5" min="0" {...form.register('pct_operarios',    { valueAsNumber: true })} />
          <Input label="% Contratistas" type="number" step="0.5" min="0" {...form.register('pct_contratistas', { valueAsNumber: true })} />
          <Input label="% Materiales"   type="number" step="0.5" min="0" {...form.register('pct_materiales',   { valueAsNumber: true })} />
        </div>
        {historial.length > 0 && (
          <div className="text-[11px] text-gris-dark">
            <div className="font-bold uppercase tracking-wider mb-1">Historial</div>
            {historial.map(h => (
              <div key={h.desde} className="font-mono">
                desde {h.desde.split('-').reverse().join('/')} → {Number(h.pct_operarios)}% / {Number(h.pct_contratistas)}% / {Number(h.pct_materiales)}%
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
