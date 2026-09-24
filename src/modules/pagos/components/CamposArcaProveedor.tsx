'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { usePermisos } from '@/hooks/usePermisos'
import { CONDICIONES_IVA, PROVINCIAS, cuitValido } from '@/lib/utils/arca'
import { useConsultarPadronPagos } from '../hooks/useProveedoresPagos'
import { mensajeErrorPagos } from '../utils/pagos.errores'
import { actividadPrincipalDe, condicionIvaTxt, tipoPersonaTxt } from '../utils/pagos.utils'
import type { PagosPadronResultado } from '@/types/domain.types'

/**
 * Domicilio, provincia y condición frente al IVA del proveedor, con «Buscar en
 * ARCA» (20260925o). Mismo patrón que el alta de clientes de Ventas: el padrón
 * (GET /proveedores/padron/:cuit) NO guarda nada, precarga los campos, y cada
 * uno dice «de ARCA» mientras conserve el valor que vino. La condición es una
 * deducción del backend: si es dudosa, se avisa.
 *
 * Nada es obligatorio: hay proveedores sin CUIT o del exterior.
 */

export interface DatosArcaForm {
  domicilio:        string
  provincia:        string
  /** '' = sin especificar. */
  condicion_iva_id: string
}

export const datosArcaVacios: DatosArcaForm = { domicilio: '', provincia: '', condicion_iva_id: '' }

export function datosArcaDesde(p: { domicilio?: string | null; provincia?: string | null; condicion_iva_id?: number | null } | null | undefined): DatosArcaForm {
  return {
    domicilio:        p?.domicilio ?? '',
    provincia:        p?.provincia ?? '',
    condicion_iva_id: p?.condicion_iva_id != null ? String(p.condicion_iva_id) : '',
  }
}

/** Lo que viaja en el alta / edición. Vacío = null. */
export function datosArcaParaGuardar(d: DatosArcaForm) {
  return {
    domicilio:        d.domicilio.trim() || null,
    provincia:        d.provincia.trim() || null,
    condicion_iva_id: d.condicion_iva_id ? Number(d.condicion_iva_id) : null,
  }
}

interface Props {
  cuit:          string
  razonSocial:   string
  /** Precarga la razón social que trae ARCA (el alta sí; la edición no la pisa si ya hay una). */
  onRazonSocial: (v: string) => void
  value:         DatosArcaForm
  onChange:      (v: DatosArcaForm) => void
  inputCls:      string
}

export function CamposArcaProveedor({ cuit, razonSocial, onRazonSocial, value, onChange, inputCls }: Props) {
  const { puedeCrear } = usePermisos('pagos')
  const consultar = useConsultarPadronPagos()
  const [padron, setPadron] = useState<PagosPadronResultado | null>(null)
  const [error, setError] = useState<string | null>(null)

  const cuitLimpio = cuit.replace(/\D/g, '')
  const cuitOk = cuitLimpio.length === 11 && cuitValido(cuitLimpio)

  const deArca = {
    razon_social:     !!padron && !!padron.precarga.razon_social && razonSocial.trim() === padron.precarga.razon_social,
    domicilio:        !!padron && !!padron.precarga.domicilio && value.domicilio === padron.precarga.domicilio,
    provincia:        !!padron && !!padron.precarga.provincia && value.provincia === padron.precarga.provincia,
    condicion_iva_id: !!padron && value.condicion_iva_id === String(padron.precarga.condicion_iva_id),
  }

  async function buscar() {
    setError(null)
    try {
      const r = await consultar.mutateAsync(cuitLimpio)
      setPadron(r)
      if (r.precarga.razon_social) onRazonSocial(r.precarga.razon_social)
      onChange({
        domicilio:        r.precarga.domicilio || value.domicilio,
        provincia:        r.precarga.provincia || value.provincia,
        condicion_iva_id: r.precarga.condicion_iva_id ? String(r.precarga.condicion_iva_id) : value.condicion_iva_id,
      })
    } catch (e) {
      setPadron(null)
      setError(mensajeErrorPagos(e))
    }
  }

  const provincias = [
    ...(value.provincia && !PROVINCIAS.includes(value.provincia) ? [value.provincia] : []),
    ...PROVINCIAS,
  ]
  const actividad = padron ? actividadPrincipalDe(padron.padron) : null
  const tipo = padron ? tipoPersonaTxt(padron.padron.tipo_persona) : null
  const dudosa = !!padron?.padron.condicion_iva_dudosa

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Button type="button" variant="secondary" size="sm" onClick={buscar} loading={consultar.isPending}
          disabled={!puedeCrear || !cuitOk}
          title={!puedeCrear ? 'No tenés permiso para cargar proveedores'
            : !cuitOk ? 'Cargá un CUIT válido de 11 dígitos'
            : 'Trae razón social, domicilio, provincia y condición IVA del padrón de ARCA'}>
          Buscar en ARCA
        </Button>
        {deArca.razon_social && <span className="text-[11px] text-gris-dark">Razón social · de ARCA</span>}
      </div>

      {error && <div className="rounded border border-rojo/40 bg-rojo-light p-2 text-xs text-rojo">{error}</div>}
      {padron && (
        <div className={`rounded border p-2 text-xs ${dudosa ? 'border-amarillo/50 bg-amarillo-light text-[#7A5000]' : 'border-gris-mid bg-gris/40 text-gris-dark'}`}>
          <b>Datos de ARCA</b>
          {tipo && <> ({tipo.toLowerCase()}{padron.padron.estado_clave && padron.padron.estado_clave !== 'ACTIVO' ? `, clave ${padron.padron.estado_clave}` : ''})</>}:
          {' '}se precargaron los campos marcados «de ARCA»; podés corregirlos.
          {' '}Condición IVA sugerida: <b>{condicionIvaTxt(padron.padron.condicion_iva_id)}</b>
          {padron.padron.condicion_iva_motivo && <> — {padron.padron.condicion_iva_motivo}</>}.
          {dudosa && <> <b>Revisala antes de guardar.</b></>}
          {!padron.precarga.domicilio && <> ARCA no trajo domicilio fiscal.</>}
          {actividad && <span className="block mt-1">Actividad principal: {actividad}</span>}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-gris-dark mb-1">
            Domicilio{deArca.domicilio ? <span className="font-normal"> · de ARCA</span> : <span className="font-normal"> · Opcional</span>}
          </label>
          <input value={value.domicilio} onChange={e => onChange({ ...value, domicilio: e.target.value })}
            placeholder="Calle, número, localidad" className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gris-dark mb-1">
            Provincia{deArca.provincia && <span className="font-normal"> · de ARCA</span>}
          </label>
          <select value={value.provincia} onChange={e => onChange({ ...value, provincia: e.target.value })} className={inputCls}>
            <option value="">—</option>
            {provincias.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs font-semibold text-gris-dark mb-1">
          Condición frente al IVA{deArca.condicion_iva_id && <span className="font-normal"> · sugerida por ARCA</span>}
        </label>
        <select value={value.condicion_iva_id} onChange={e => onChange({ ...value, condicion_iva_id: e.target.value })} className={inputCls}>
          <option value="">Sin especificar</option>
          {Object.entries(CONDICIONES_IVA).map(([id, txt]) => <option key={id} value={id}>{txt}</option>)}
        </select>
        <div className="text-[11px] text-gris-dark mt-0.5">
          Sirve para avisar si la letra de una factura no le corresponde (un monotributista factura C).
        </div>
      </div>
    </div>
  )
}
