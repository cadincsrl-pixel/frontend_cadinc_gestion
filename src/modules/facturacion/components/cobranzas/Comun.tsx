'use client'

// Piezas chicas que comparten las pantallas de Cobranzas, Deudores y Saldos
// iniciales: selector de cliente, sección colapsable estilo Bejerman, badge de
// estado de cobro, pedido de motivo y la grilla de aplicación de comprobantes.

import { useMemo, useState, type ReactNode } from 'react'
import { Combobox } from '@/components/ui/Combobox'
import { InputMonto } from '@/components/ui/InputMonto'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useClientesVenta } from '../../hooks/useClientesFacturacion'
import { fmtCuit, fmtFecha, fmtM } from '../../utils/facturacion.utils'
import { ESTADO_COBRO_META, aCent } from '../../utils/cobranzas.utils'
import type { VentasCliente, VentasSaldo } from '@/types/domain.types'

// ── Cliente ───────────────────────────────────────────────────────────

/** Combobox de clientes de Ventas: busca por código (#id), razón social o CUIT. */
export function ClienteCombobox({ value, onChange, label = 'Cliente', disabled, incluirInactivos = false, todos, error }: {
  value:     string
  onChange:  (id: string, cliente: VentasCliente | undefined) => void
  label?:    string
  disabled?: boolean
  incluirInactivos?: boolean
  /** Si se pasa, agrega la opción "todos" con ese texto (filtros). */
  todos?:    string
  error?:    string
}) {
  const clientes = useClientesVenta('', incluirInactivos)
  const lista = useMemo(() => clientes.data ?? [], [clientes.data])
  const opciones = useMemo(() => [
    ...(todos ? [{ value: '', label: todos }] : []),
    ...lista.map(c => ({
      value:  String(c.id),
      label:  c.razon_social,
      sub:    `#${c.id} · ${c.doc_tipo === 99 ? 'sin identificar' : fmtCuit(c.doc_nro)}${c.activo ? '' : ' · de baja'}`,
      search: [c.doc_nro, String(c.id), `#${c.id}`],
    })),
  ], [lista, todos])
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <Combobox
        label={label}
        placeholder={clientes.isLoading ? 'Cargando clientes…' : 'Código, razón social o CUIT'}
        options={opciones}
        value={value}
        onChange={v => onChange(v, lista.find(c => String(c.id) === v))}
        disabled={disabled}
      />
      {error && <span className="text-xs text-rojo font-semibold">{error}</span>}
    </div>
  )
}

// ── Sección colapsable (Medios / Retenciones / Aplicación) ────────────

export function Seccion({ titulo, resumen, abierta, onToggle, children, acciones }: {
  titulo:    string
  resumen?:  ReactNode
  abierta:   boolean
  onToggle:  () => void
  children:  ReactNode
  acciones?: ReactNode
}) {
  return (
    <div className="border border-gris-mid rounded-lg">
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-gris/60 rounded-t-lg">
        <button type="button" onClick={onToggle} className="flex items-center gap-2 text-left min-w-0 flex-1" aria-expanded={abierta}>
          <span className="text-gris-dark text-xs w-3">{abierta ? '▾' : '▸'}</span>
          <span className="text-[11px] font-bold text-azul uppercase tracking-wider">{titulo}</span>
          {resumen && <span className="text-xs text-gris-dark truncate">{resumen}</span>}
        </button>
        {abierta && acciones}
      </div>
      {abierta && <div className="p-3 flex flex-col gap-3">{children}</div>}
    </div>
  )
}

// ── Estado de cobro ───────────────────────────────────────────────────

export function EstadoCobroBadge({ estado, revisar }: { estado: string | null | undefined; revisar?: boolean }) {
  if (!estado) return null
  const meta = ESTADO_COBRO_META[estado as keyof typeof ESTADO_COBRO_META]
  return (
    <span className="inline-flex gap-1 flex-wrap">
      <span className={`inline-block whitespace-nowrap text-[11px] font-bold px-2 py-0.5 rounded ${meta?.badge ?? 'bg-gris text-gris-dark'}`} title={meta?.hint}>
        {meta?.label ?? estado}
      </span>
      {revisar && (
        <span className="inline-block whitespace-nowrap text-[10px] font-bold px-1.5 py-0.5 rounded bg-amarillo-light text-[#7A5000]"
              title="Saldo supuesto (el Excel de ARCA no trae cobranzas): confirmalo en Saldos iniciales">a revisar</span>
      )}
    </span>
  )
}

// ── Motivo (anular) ───────────────────────────────────────────────────

export function ModalMotivo({ titulo, texto, obligatorio = true, confirmar = 'Anular', cargando, onConfirmar, onClose }: {
  titulo:      string
  texto:       ReactNode
  obligatorio?: boolean
  confirmar?:  string
  cargando?:   boolean
  onConfirmar: (motivo: string) => void
  onClose:     () => void
}) {
  const [motivo, setMotivo] = useState('')
  const falta = obligatorio && motivo.trim().length < 3
  return (
    <Modal open onClose={cargando ? () => {} : onClose} title={titulo} width="max-w-md"
      footer={<>
        <Button variant="ghost" size="sm" onClick={onClose} disabled={cargando}>Cancelar</Button>
        <Button variant="danger" size="sm" loading={cargando} disabled={falta} onClick={() => onConfirmar(motivo.trim())}
          title={falta ? 'Escribí el motivo' : undefined}>{confirmar}</Button>
      </>}>
      <div className="flex flex-col gap-2 text-sm">
        <div className="text-gris-dark">{texto}</div>
        <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={3} autoFocus
          placeholder={obligatorio ? 'Motivo (obligatorio)' : 'Motivo (opcional)'}
          className="w-full px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm bg-white outline-none focus:border-naranja" />
      </div>
    </Modal>
  )
}

// ── Grilla de aplicación de comprobantes ──────────────────────────────

export type FilaPendiente = VentasSaldo & { clave: string }

/**
 * La grilla de «Aplicación de comprobantes» (Bejerman): Emisión, Tipo, Letra, P.Venta, Número, Saldo y Aplicado editable. La validación la
 * hace el padre (`validarAplicacion`) y llega en `errores`.
 */
export function GrillaAplicacion({ filas, aplicado, errores, onCambiar, disabled, vacio }: {
  filas:     FilaPendiente[]
  aplicado:  Record<string, string>
  errores:   Record<string, string>
  onCambiar: (clave: string, raw: string) => void
  disabled?: boolean
  vacio?:    ReactNode
}) {
  if (filas.length === 0) {
    return <div className="text-sm text-gris-dark italic p-3 text-center">{vacio ?? 'El cliente no tiene comprobantes con saldo.'}</div>
  }
  const completar = (f: FilaPendiente) => onCambiar(f.clave, aCent(aplicado[f.clave]) > 0 ? '' : String(f.saldo))
  return (
    <>
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full border-collapse min-w-[760px] text-sm">
          <thead>
            <tr>
              {['Emisión', 'Tipo', 'Letra', 'P. Venta', 'Número', 'Saldo', 'Aplicado'].map((h, i) => (
                <th key={h} className={`bg-gris text-gris-dark text-[10px] font-bold px-2 py-1.5 uppercase tracking-wide whitespace-nowrap ${i >= 5 ? 'text-right' : 'text-left'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map(f => {
              const err = errores[f.clave]
              return (
                <tr key={f.clave} className={`border-t border-gris ${aCent(aplicado[f.clave]) > 0 ? 'bg-verde-light/40' : ''}`}>
                  <td className="px-2 py-1 whitespace-nowrap">{fmtFecha(f.fecha)}</td>
                  <td className="px-2 py-1 whitespace-nowrap">
                    {f.tipo_abrev}
                    {f.origen === 'externo' && <span className="ml-1 text-[10px] text-gris-dark" title="Saldo inicial (emitida fuera del sistema)">ext.</span>}
                    {f.saldo_a_revisar && <span className="ml-1 text-[10px] font-bold text-[#7A5000]" title="Saldo supuesto: confirmalo en Saldos iniciales">a revisar</span>}
                  </td>
                  <td className="px-2 py-1">{f.letra ?? ''}</td>
                  <td className="px-2 py-1 font-mono">{String(f.pto_vta).padStart(5, '0')}</td>
                  <td className="px-2 py-1 font-mono">{String(f.numero).padStart(8, '0')}</td>
                  <td className="px-2 py-1 text-right font-mono tabular-nums whitespace-nowrap">
                    <button type="button" className="hover:underline disabled:no-underline" disabled={disabled}
                      onClick={() => completar(f)} title="Aplicar el saldo entero (o limpiar)">{fmtM(f.saldo)}</button>
                  </td>
                  <td className="px-2 py-1 w-[150px]">
                    <InputMonto value={aplicado[f.clave] ?? ''} onChange={raw => onCambiar(f.clave, raw)}
                      disabled={disabled} error={err} placeholder="0,00" className="text-right py-1" />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="md:hidden divide-y divide-gris">
        {filas.map(f => (
          <div key={f.clave} className="py-2 flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <div className="font-mono text-xs font-semibold">{f.comprobante}</div>
              <div className="text-[11px] text-gris-dark">
                {fmtFecha(f.fecha)} ·{' '}
                <button type="button" className="underline" disabled={disabled} onClick={() => completar(f)}>saldo {fmtM(f.saldo)}</button>
              </div>
            </div>
            <div className="w-[130px]">
              <InputMonto value={aplicado[f.clave] ?? ''} onChange={raw => onCambiar(f.clave, raw)}
                disabled={disabled} error={errores[f.clave]} placeholder="0,00" className="text-right py-1" />
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

/** Los tres totales de abajo de la grilla: Total / Aplicado / A cuenta. */
export function TotalesAplicacion({ totalLabel, totalCent, aplicadoCent, restoLabel = 'A cuenta', superaTotal }: {
  totalLabel:   string
  totalCent:    number
  aplicadoCent: number
  restoLabel?:  string
  superaTotal:  boolean
}) {
  const resto = totalCent - aplicadoCent
  return (
    <div className="grid grid-cols-3 gap-2">
      <Cifra label={totalLabel} valor={fmtM(totalCent / 100)} />
      <Cifra label="Aplicado" valor={fmtM(aplicadoCent / 100)} tono={superaTotal ? 'rojo' : 'normal'} />
      <Cifra label={restoLabel} valor={fmtM(resto / 100)} tono={resto < 0 ? 'rojo' : resto > 0 ? 'naranja' : 'normal'} />
    </div>
  )
}

export function Cifra({ label, valor, sub, tono = 'normal' }: {
  label: string; valor: string; sub?: string; tono?: 'normal' | 'rojo' | 'verde' | 'naranja'
}) {
  const color = { normal: 'text-azul', rojo: 'text-rojo', verde: 'text-verde', naranja: 'text-naranja-dark' }[tono]
  return (
    <div className="flex-1 min-w-[120px] px-3 py-2 rounded-card border border-gris-mid bg-white">
      <div className="text-[10px] font-bold text-gris-dark uppercase tracking-wide">{label}</div>
      <div className={`font-mono font-bold text-base sm:text-lg tabular-nums ${color}`}>{valor}</div>
      {sub && <div className="text-[10px] text-gris-dark">{sub}</div>}
    </div>
  )
}

export function Vacio({ children }: { children: ReactNode }) {
  return <div className="bg-white rounded-card shadow-card p-8 text-center text-sm text-gris-dark italic">{children}</div>
}

export function ErrorCarga({ mensaje, onReintentar }: { mensaje: string; onReintentar: () => void }) {
  return (
    <div className="bg-rojo-light border border-rojo/30 rounded-card p-4 text-sm text-rojo flex items-center justify-between gap-2">
      <span>{mensaje}</span>
      <Button size="sm" variant="secondary" onClick={onReintentar}>Reintentar</Button>
    </div>
  )
}
