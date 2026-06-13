'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTabsPermitidos } from '@/hooks/useTabsPermitidos'
import { ClientesAridosTab } from './ClientesAridosTab'
import { MaterialesTab } from './MaterialesTab'
import { StockTab } from './StockTab'
import { VentasTab } from './VentasTab'
import { AcopiosTab } from './AcopiosTab'
import { CuentaCorrienteTab } from './CuentaCorrienteTab'
import { FlotaAridosTab } from './FlotaAridosTab'

const TABS = [
  { key: 'ventas',     icon: '🛒', label: 'Ventas',     sub: 'Ventas por m³ y retiros de escombro' },
  { key: 'cuenta-corriente', icon: '💰', label: 'Cuenta corriente', sub: 'Vendido, cobrado y saldo por cliente' },
  { key: 'acopios',    icon: '⛏',  label: 'Acopios',    sub: 'Entradas de cantera al depósito y ajustes de inventario' },
  { key: 'stock',      icon: '📦', label: 'Stock',      sub: 'Disponible por material en el depósito propio' },
  { key: 'clientes',   icon: '🧑‍💼', label: 'Clientes',   sub: 'Fichas de clientes y precios preestablecidos' },
  { key: 'materiales', icon: '🪨', label: 'Materiales', sub: 'Catálogo, costos de cantera y municipios' },
  { key: 'flota',      icon: '🚚', label: 'Canteras y unidades', sub: 'Canteras propias y camiones con GPS del negocio de áridos' },
]

export function AridosPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const allowedTabs = useTabsPermitidos('aridos')
  const tab = searchParams.get('tab') ?? 'ventas'
  const info = TABS.find(t => t.key === tab) ?? TABS[0]!

  useEffect(() => {
    if (allowedTabs.length > 0 && !allowedTabs.includes(tab)) {
      router.replace(`/aridos?tab=${allowedTabs[0]}`)
    }
  }, [allowedTabs, tab, router])

  if (allowedTabs.length > 0 && !allowedTabs.includes(tab)) {
    return null
  }

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4">
      {/* Header */}
      <div className="bg-white rounded-card shadow-card p-3 sm:p-4 border-l-[5px] border-naranja">
        <h1 className="font-display text-2xl sm:text-[2rem] tracking-wider text-azul leading-none">
          {info.icon} {info.label.toUpperCase()}
        </h1>
        <p className="text-sm text-gris-dark mt-1">{info.sub}</p>
      </div>

      {/* Contenido */}
      <div className="flex flex-col gap-4">
        {tab === 'ventas'     && <VentasTab />}
        {tab === 'acopios'    && <AcopiosTab />}
        {tab === 'stock'      && <StockTab />}
        {tab === 'clientes'   && <ClientesAridosTab />}
        {tab === 'materiales' && <MaterialesTab />}
        {tab === 'flota'      && <FlotaAridosTab />}
        {tab === 'cuenta-corriente' && <CuentaCorrienteTab />}
      </div>
    </div>
  )
}
