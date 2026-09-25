'use client'

import { useEffect, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTabsPermitidos } from '@/hooks/useTabsPermitidos'
import { TABS_POR_MODULO } from '@/lib/config/modulo-tabs'
import { useArcaAmbiente } from '../hooks/useFacturacion'
import { BannerHomologacion } from './EstadoArca'
import { FacturasTab } from './FacturasTab'
import { ClientesTab } from './ClientesTab'
import { ImpuestosTab } from './impuestos/ImpuestosTab'
import { CobranzasTab } from './cobranzas/CobranzasTab'
import { DeudoresTab } from './cobranzas/DeudoresTab'
import { SaldosInicialesTab } from './cobranzas/SaldosInicialesTab'
import { ConfiguracionTab } from './configuracion/ConfiguracionTab'

const TABS = [
  { key: 'facturas',  icon: '🧮', label: 'Facturas',  sub: 'Facturas y notas de crédito A y B contra ARCA' },
  { key: 'clientes',  icon: '🏢', label: 'Clientes',  sub: 'Padrón propio: CUIT, condición IVA y obras que se le facturan' },
  { key: 'impuestos', icon: '🏛', label: 'Impuestos', sub: 'Posición de IVA del mes y Libro IVA Digital de ventas y de compras para ARCA' },
  { key: 'cobranzas', icon: '💰', label: 'Cobranzas', sub: 'Recibos (RC): medios, retenciones y aplicación a facturas; compensación de notas de crédito' },
  { key: 'deudores',  icon: '📒', label: 'Deudores',  sub: 'Qué debe cada cliente, desde cuándo, y su estado de cuenta' },
  { key: 'saldos_iniciales', icon: '📂', label: 'Saldos iniciales', sub: 'Facturas emitidas en Finnegans o en ARCA antes del sistema que siguen abiertas' },
  { key: 'configuracion', icon: '⚙️', label: 'Configuración', sub: 'Productos, puntos de venta, montos de ARCA, retenciones y valores por defecto de la factura' },
]

export function FacturacionPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const permitidos = useTabsPermitidos('facturacion')

  const allowedTabs = useMemo(() => {
    const declarados = new Set((TABS_POR_MODULO.facturacion ?? []).map(t => t.key))
    // Puente hasta la migración 20260924x: quien tenga la vieja `finnegans` ve Impuestos.
    return [...new Set(permitidos.map(t => (t === 'finnegans' ? 'impuestos' : t)))].filter(t => declarados.has(t))
  }, [permitidos])

  // `finnegans` era la tab del libro de ventas hasta el 24/09: los links viejos caen en Impuestos.
  const tabPedida = searchParams.get('tab') ?? 'facturas'
  const tab = tabPedida === 'finnegans' ? 'impuestos' : tabPedida
  const info = TABS.find(t => t.key === tab) ?? TABS[0]!
  const permitido = allowedTabs.length === 0 || allowedTabs.includes(tab)

  useEffect(() => {
    if (allowedTabs.length > 0 && !allowedTabs.includes(tab)) {
      router.replace(`/facturacion?tab=${allowedTabs[0]}`)
    }
  }, [allowedTabs, tab, router])

  // El cartel sale de /arca/ambiente, que no consulta a ARCA y responde al
  // instante. Antes salía de /arca/estado (segundos) y al aparecer tarde corría
  // la página: el primer clic en «Nueva factura» caía en el vacío (2026-09-23).
  const arca = useArcaAmbiente()

  if (!permitido) return null

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4">
      {arca.data?.ambiente === 'homo' && <BannerHomologacion />}

      <div className="bg-white rounded-card shadow-card p-3 sm:p-4 border-l-[5px] border-naranja">
        <h1 className="font-display text-2xl sm:text-[2rem] tracking-wider text-azul leading-none">
          {info.icon} {info.label.toUpperCase()}
        </h1>
        <p className="text-sm text-gris-dark mt-1">{info.sub}</p>
      </div>

      <div className="flex flex-col gap-4">
        {tab === 'facturas'  && <FacturasTab />}
        {tab === 'clientes'  && <ClientesTab />}
        {tab === 'impuestos' && <ImpuestosTab />}
        {tab === 'cobranzas' && <CobranzasTab />}
        {tab === 'deudores'  && <DeudoresTab />}
        {tab === 'saldos_iniciales' && <SaldosInicialesTab />}
        {tab === 'configuracion' && <ConfiguracionTab />}
      </div>
    </div>
  )
}
