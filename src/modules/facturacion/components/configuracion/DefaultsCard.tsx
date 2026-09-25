'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import type { VentasConfigValores } from '@/types/config.types'
import { useConfigVentasValores, useGuardarConfigVentas } from '../../hooks/useConfigVentas'
import { PROVINCIAS, validarDefaultsFactura, type CamposDefaultsFactura as Campos } from '../../utils/facturacion.utils'
import { mensajeErrorFacturacion } from '../../utils/facturacion.errores'
import { Aviso } from '../FichaFactura'

const unaLinea = (x: string) => x.replace(/\s+/g, ' ').trim()


/**
 * Ventas › Configuración › Valores por defecto de la factura (20260929j):
 * condición de pago, provincia de origen y destino, unidad del renglón y la
 * leyenda roja de la FCE MiPyME. Solo afectan lo que se carga de acá en
 * adelante (y el PDF de las FCE, que imprime la leyenda vigente). Escribir
 * pide el flag `configurar`.
 */
export function DefaultsCard() {
  const toast = useToast()
  const { configurar } = usePermisos('facturacion')
  const cfg = useConfigVentasValores()
  const guardar = useGuardarConfigVentas()
  const v = cfg.valores
  const tip = configurar ? undefined : 'Necesitás el permiso «Configurar» de Ventas'
  const bloqueado = !configurar || cfg.respaldo || cfg.isLoading

  const desdeServidor = (): Campos => ({
    condicion_pago_default: v.condicion_pago_default,
    provincia_default: v.provincia_default,
    unidad_default: v.unidad_default,
    leyenda_fce: v.leyenda_fce ?? '',
  })
  const [f, setF] = useState<Campos>(desdeServidor)
  const [tocado, setTocado] = useState(false)
  // Cuando llega (o cambia) lo del servidor y nadie está editando, se muestra eso.
  useEffect(() => {
    if (!tocado) setF(desdeServidor())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.condicion_pago_default, v.provincia_default, v.unidad_default, v.leyenda_fce])

  const errores = validarDefaultsFactura(f)
  const hayError = Object.keys(errores).length > 0
  const cambios: Partial<Omit<VentasConfigValores, 'leyenda_fce_default'>> = {}
  if (unaLinea(f.condicion_pago_default) !== v.condicion_pago_default) cambios.condicion_pago_default = unaLinea(f.condicion_pago_default)
  if (f.provincia_default !== v.provincia_default) cambios.provincia_default = f.provincia_default
  if (unaLinea(f.unidad_default) !== v.unidad_default) cambios.unidad_default = unaLinea(f.unidad_default)
  const ley = unaLinea(f.leyenda_fce) || null
  if (ley !== (v.leyenda_fce ?? null)) cambios.leyenda_fce = ley
  const hayCambios = Object.keys(cambios).length > 0

  const set = <K extends keyof Campos>(k: K, val: Campos[K]) => { setTocado(true); setF(x => ({ ...x, [k]: val })) }

  async function onGuardar() {
    if (hayError || !hayCambios) return
    try {
      await guardar.mutateAsync(cambios)
      setTocado(false)
      toast('✓ Valores por defecto guardados', 'ok')
    } catch (e) {
      toast(mensajeErrorFacturacion(e), 'err')
    }
  }

  async function restaurarLeyenda() {
    try {
      await guardar.mutateAsync({ leyenda_fce: null })
      setTocado(false)
      setF(x => ({ ...x, leyenda_fce: '' }))
      toast('✓ Vuelve a imprimirse la leyenda de ARCA', 'ok')
    } catch (e) {
      toast(mensajeErrorFacturacion(e), 'err')
    }
  }

  const leyendaPropia = v.leyenda_fce != null
  const largoLeyenda = unaLinea(f.leyenda_fce).length

  return (
    <div className="bg-white rounded-card shadow-card p-3 flex flex-col gap-3">
      <div>
        <div className="text-sm font-bold">Valores por defecto de la factura</div>
        <div className="text-[11px] text-gris-dark">
          Con lo que arranca una factura nueva. Cambiarlos no toca las facturas ya cargadas.
        </div>
      </div>

      {cfg.respaldo && (
        <Aviso tono="naranja">
          El servidor todavía no tiene estos valores: se usan los de siempre y no se pueden editar.
        </Aviso>
      )}

      <div className="grid gap-3 sm:grid-cols-3" title={tip}>
        <Input label="Condición de pago" value={f.condicion_pago_default} maxLength={100} disabled={bloqueado}
          error={errores.condicion_pago_default}
          onChange={e => set('condicion_pago_default', e.target.value)} />
        <Select label="Provincia (origen y destino)" value={f.provincia_default} disabled={bloqueado}
          error={errores.provincia_default}
          options={PROVINCIAS.map(p => ({ value: p, label: p }))}
          onChange={e => set('provincia_default', e.target.value)} />
        <Input label="Unidad del renglón" value={f.unidad_default} maxLength={50} disabled={bloqueado}
          error={errores.unidad_default}
          onChange={e => set('unidad_default', e.target.value)} />
      </div>

      <div className="flex flex-col gap-1" title={tip}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <label htmlFor="leyenda-fce" className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">
            Leyenda de la FCE MiPyME
            <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded font-bold ${leyendaPropia ? 'bg-naranja-light text-naranja-dark' : 'bg-gris text-gris-dark'}`}>
              {leyendaPropia ? 'propia' : 'la de ARCA'}
            </span>
          </label>
          <Button size="sm" variant="ghost" disabled={bloqueado || !leyendaPropia || guardar.isPending}
            title={tip ?? (leyendaPropia ? 'Volver a imprimir la leyenda del modelo de ARCA' : 'Ya se imprime la de ARCA')}
            onClick={() => void restaurarLeyenda()}>
            ↺ Restaurar la de ARCA
          </Button>
        </div>
        <textarea id="leyenda-fce" rows={4} maxLength={1200} disabled={bloqueado}
          value={f.leyenda_fce} placeholder={v.leyenda_fce_default}
          onChange={e => set('leyenda_fce', e.target.value)}
          className="w-full px-2 py-1.5 border-[1.5px] border-gris-mid rounded text-xs bg-white outline-none focus:border-naranja disabled:bg-gris" />
        <div className="flex justify-between gap-2 text-[11px]">
          <span className={errores.leyenda_fce ? 'text-rojo' : 'text-gris-dark'}>
            {errores.leyenda_fce ?? 'Vacía = la de ARCA (se ve de fondo). Se imprime en rojo al pie de cada FCE.'}
          </span>
          <span className="text-gris-dark font-mono">{largoLeyenda}/1000</span>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        {tocado && hayCambios && (
          <Button size="sm" variant="secondary" disabled={guardar.isPending}
            onClick={() => { setTocado(false); setF(desdeServidor()) }}>Descartar</Button>
        )}
        <Button size="sm" disabled={bloqueado || !hayCambios || hayError || guardar.isPending}
          title={tip ?? (hayError ? 'Corregí lo marcado' : !hayCambios ? 'No hay cambios' : 'Guardar los valores por defecto')}
          onClick={() => void onGuardar()}>
          {guardar.isPending ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>
    </div>
  )
}
