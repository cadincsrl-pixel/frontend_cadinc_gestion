'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { useCrearProveedorPagos } from '../hooks/useProveedoresPagos'
import { mensajeAvisoPagos, mensajeErrorPagos, codigoErrorPagos } from '../utils/pagos.errores'

/**
 * Alta de proveedor sin salir de donde estabas.
 *
 * Es el padrón PROPIO del módulo (`pagos_proveedores`), no el de Compras: son
 * dos a propósito, y el de acá guarda lo que hace falta para pagarle (CUIT,
 * alias, CBU y el plazo que sugiere el vencimiento).
 *
 * El CUIT y el CBU son opcionales al alta —si no los tenés a mano, cargás la
 * factura igual y los completás después— pero si los ponés, el backend valida
 * los dígitos verificadores y rechaza duplicados diciendo de quién son.
 */

interface Props {
  onClose:  () => void
  onCreado: (id: number) => void
  /** Lo leído de la factura (20260924u): el alta arranca precargada. */
  inicial?: { razon_social?: string | null; cuit?: string | null }
}

export function AltaRapidaProveedor({ onClose, onCreado, inicial }: Props) {
  const toast = useToast()
  const crear = useCrearProveedorPagos()

  const [razonSocial, setRazonSocial] = useState(inicial?.razon_social ?? '')
  const [cuit, setCuit] = useState(inicial?.cuit ?? '')
  const [alias, setAlias] = useState('')
  const [cbu, setCbu] = useState('')
  const [banco, setBanco] = useState('')
  const [plazo, setPlazo] = useState('30')
  const [errorCampo, setErrorCampo] = useState<{ campo: string; msg: string } | null>(null)

  const listo = razonSocial.trim().length >= 3

  async function guardar() {
    setErrorCampo(null)
    try {
      const r = await crear.mutateAsync({
        razon_social: razonSocial.trim(),
        cuit:      cuit.trim() || null,
        alias_cbu: alias.trim() || null,
        cbu:       cbu.trim() || null,
        banco:     banco.trim() || undefined,
        plazo_pago_dias: Number(plazo) || 30,
      })
      toast(`✓ ${r.proveedor.razon_social} agregado al padrón`, 'ok')
      for (const a of r.avisos) toast(mensajeAvisoPagos(a), 'warn')
      onCreado(r.proveedor.id)
    } catch (e) {
      const code = codigoErrorPagos(e)
      const msg = mensajeErrorPagos(e)
      // Señalar el input exacto en vez de un toast genérico.
      if (code === 'CUIT_INVALIDO') setErrorCampo({ campo: 'cuit', msg })
      else if (code === 'CBU_INVALIDO') setErrorCampo({ campo: 'cbu', msg })
      else if (code === 'ALIAS_INVALIDO') setErrorCampo({ campo: 'alias', msg })
      else if (code === 'PROVEEDOR_DUPLICADO') setErrorCampo({ campo: 'cuit', msg })
      else toast(msg, 'err')
    }
  }

  return (
    <Modal
      open onClose={onClose} width="max-w-lg" title="Nuevo proveedor"
      footer={
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={guardar} loading={crear.isPending} disabled={!listo}
            title={!listo ? 'Escribí la razón social' : undefined}>
            Agregar al padrón
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        <div className="text-xs text-gris-dark">
          Este padrón es del módulo Pagos y no se cruza con el de Compras.
        </div>

        <Campo label="Razón social" error={errorCampo?.campo === 'razon_social' ? errorCampo.msg : undefined}>
          <input autoFocus value={razonSocial} onChange={e => setRazonSocial(e.target.value)}
            placeholder="Ej.: HIERRONORT S.A." className={inputCls} />
        </Campo>

        <div className="grid grid-cols-2 gap-2">
          <Campo label="CUIT" hint="Opcional" error={errorCampo?.campo === 'cuit' ? errorCampo.msg : undefined}>
            <input value={cuit} onChange={e => setCuit(e.target.value)} placeholder="30-57742861-8" className={inputCls} />
          </Campo>
          <Campo label="Plazo de pago" hint="Días, sugiere el vencimiento">
            <input inputMode="numeric" value={plazo} onChange={e => setPlazo(e.target.value)} className={inputCls} />
          </Campo>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Campo label="Alias" hint="Opcional" error={errorCampo?.campo === 'alias' ? errorCampo.msg : undefined}>
            <input value={alias} onChange={e => setAlias(e.target.value)} placeholder="hierro.norte.sa" className={inputCls} />
          </Campo>
          <Campo label="CBU" hint="22 dígitos" error={errorCampo?.campo === 'cbu' ? errorCampo.msg : undefined}>
            <input inputMode="numeric" value={cbu} onChange={e => setCbu(e.target.value)} className={`${inputCls} font-mono`} />
          </Campo>
        </div>

        <Campo label="Banco" hint="Opcional">
          <input value={banco} onChange={e => setBanco(e.target.value)} className={inputCls} />
        </Campo>

        <div className="text-[11px] text-gris-dark">
          El CBU y el alias son opcionales: sólo hacen falta para transferirle. Si le pagás con cheque o en cuenta corriente, alcanza con el CUIT.
        </div>
      </div>
    </Modal>
  )
}

const inputCls = 'w-full px-2.5 py-2 border-[1.5px] border-gris-mid rounded text-sm bg-white outline-none focus:border-naranja'

function Campo({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gris-dark mb-1">
        {label}{hint && <span className="font-normal"> · {hint}</span>}
      </label>
      {children}
      {error && <div className="text-[11px] text-rojo mt-0.5">{error}</div>}
    </div>
  )
}
