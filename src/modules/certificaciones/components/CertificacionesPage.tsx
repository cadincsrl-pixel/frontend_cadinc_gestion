'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTabsPermitidos } from '@/hooks/useTabsPermitidos'
import { SolicitudesTab }     from './SolicitudesTab'
import { StockTab }           from './StockTab'
import { MaterialesTab }      from './MaterialesTab'
import { StockProveedorTab }  from './StockProveedorTab'

const TABS = [
  { key: 'solicitudes',      icon: '🛒', label: 'Solicitudes',         sub: 'Pedidos de compra y envío de materiales' },
  { key: 'stock',            icon: '🏗️', label: 'Stock',                sub: 'Stock en depósito por rubro' },
  { key: 'stock-proveedor',  icon: '🏭', label: 'Stock en proveedores', sub: 'Materiales comprados que aún quedan en el galpón del proveedor' },
  { key: 'materiales',       icon: '📦', label: 'Materiales',           sub: 'Materiales a cuenta del cliente' },
]

export function CertificacionesPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const allowedTabs = useTabsPermitidos('certificaciones')
  const tab = searchParams.get('tab') ?? 'solicitudes'
  const info = TABS.find(t => t.key === tab) ?? TABS[0]!

  // Si el tab del query param no está permitido, redirigir al primer tab
  // permitido. El sidebar oculta los items prohibidos pero un user podría
  // tipear `?tab=stock` directo.
  useEffect(() => {
    if (allowedTabs.length > 0 && !allowedTabs.includes(tab)) {
      const fallback = allowedTabs[0]
      router.replace(`/certificaciones?tab=${fallback}`)
    }
  }, [allowedTabs, tab, router])

  if (allowedTabs.length > 0 && !allowedTabs.includes(tab)) {
    return null
  }

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4">

      {/* Header */}
      <div className="bg-white rounded-card shadow-card p-4 border-l-[5px] border-naranja">
        <h1 className="font-display text-[2rem] tracking-wider text-azul leading-none">
          {info.icon} {info.label.toUpperCase()}
        </h1>
        <p className="text-sm text-gris-dark mt-1">{info.sub}</p>
      </div>

      {/* Contenido */}
      <div className="flex flex-col gap-4">
        {tab === 'solicitudes'     && <SolicitudesTab />}
        {tab === 'stock'           && <StockTab />}
        {tab === 'stock-proveedor' && <StockProveedorTab />}
        {tab === 'materiales'      && <MaterialesTab />}
      </div>
    </div>
  )
}
